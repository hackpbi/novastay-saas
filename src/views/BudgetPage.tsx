'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Save, Download, Upload, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2, FileSpreadsheet, Calendar } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import MarketTable, { MarketTableColumn } from '@/components/tables/MarketTable'

// ── Types ─────────────────────────────────────────────────────────────────────

type TabType = 'monthly' | 'daily'

type MonthVal        = { rn: number; rev: number }
type BudgetMonthData = Record<string, Record<number, MonthVal>>
type BudgetDailyEdits= Record<string, Record<string, MonthVal>>   // date → seg → {rn,rev}

type BudgetMonthlyRow = {
  segmentation:   string
  sorting1:       string | null
  sorting2:       string | null
  sorting3:       string | null
  month_num:      number
  budget_nights:  number
  budget_revenue: number
}

type BudgetDailyRow = {
  business_date:  string
  segmentation:   string
  sorting1:       string | null
  sorting2:       string | null
  sorting3:       string | null
  budget_nights:  number
  budget_revenue: number
  act_nights:     number
  act_revenue:    number
  otb_nights:     number
  otb_revenue:    number
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (!n) return ''
  return n.toLocaleString('ko-KR')
}

function parseNumber(s: string): number {
  return Number(s.replace(/,/g, '')) || 0
}

function getDaysInMonth(year: number, month: number) {
  return Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => {
    const date = new Date(year, month - 1, i + 1)
    return {
      date:      date.toISOString().split('T')[0],
      dayOfWeek: ['일', '월', '화', '수', '목', '금', '토'][date.getDay()],
    }
  })
}

const DAY_COLOR: Record<string, string> = { 토: '#4A9EFF', 일: '#FC8181' }


// ── Input Cell ────────────────────────────────────────────────────────────────

function InputCell({
  value, onChange, onBlur, unit = 1, selectOnFocus = false, decimals = 0, rawEdit = false,
}: {
  value:          number
  onChange:       (v: number) => void
  onBlur:         () => void
  unit?:          number
  selectOnFocus?: boolean
  decimals?:      number
  rawEdit?:       boolean
}) {
  const fmtDisplay = (v: number) => {
    if (!v) return '-'
    if (unit > 1) return decimals > 0 ? (v / unit).toFixed(decimals) : Math.round(v / unit).toLocaleString('ko-KR')
    return formatNumber(v)
  }
  const fmtEdit = (v: number) => {
    if (!v) return ''
    if (rawEdit) return formatNumber(v)
    if (unit > 1) return decimals > 0 ? (v / unit).toFixed(decimals) : String(Math.round(v / unit))
    return String(v)
  }

  const [local,   setLocal]   = useState(fmtDisplay(value))
  const [editing, setEditing] = useState(false)

  useEffect(() => { if (!editing) setLocal(fmtDisplay(value)) }, [value, unit, editing])

  return (
    <input
      type="text"
      value={local}
      onChange={e => {
        setLocal(e.target.value)
        const parsed = parseNumber(e.target.value)
        onChange(rawEdit ? parsed : parsed * unit)
      }}
      onFocus={e => {
        setEditing(true)
        setLocal(fmtEdit(value))
        if (selectOnFocus) setTimeout(() => e.target.select(), 0)
      }}
      onBlur={() => { setEditing(false); setLocal(fmtDisplay(value)); onBlur() }}
      className="w-full text-right text-xs rounded focus:outline-none focus:ring-1"
      style={{
        background:  'transparent',
        border:      '1px solid transparent',
        color:       'inherit',
        padding:     '0',
        '--tw-ring-color': 'var(--color-border-default)',
      } as React.CSSProperties}
    />
  )
}


// ── OTB Date Picker ───────────────────────────────────────────────────────────

const DAY_LABELS_OTB   = ['일', '월', '화', '수', '목', '금', '토']
const MONTH_LABELS_OTB = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

function toOtbYMD(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function OtbDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [open,      setOpen]      = useState(false)
  const [viewYear,  setViewYear]  = useState(() => value ? new Date(value + 'T00:00:00').getFullYear() : new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => value ? new Date(value + 'T00:00:00').getMonth()    : new Date().getMonth())
  const [pos,       setPos]       = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const calRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!btnRef.current?.contains(e.target as Node) && !calRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function openCalendar() {
    if (!btnRef.current) return
    const CAL_W = 264, CAL_H = 316
    const r    = btnRef.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.left, window.innerWidth - CAL_W - 8))
    const top  = r.bottom + CAL_H + 10 > window.innerHeight ? r.top - CAL_H - 6 : r.bottom + 6
    setPos({ top, left })
    if (value) {
      const d = new Date(value + 'T00:00:00')
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
    setOpen(v => !v)
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const startDow    = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <>
      <div className="flex items-center gap-1 mt-0.5">
        <button
          ref={btnRef}
          onClick={openCalendar}
          className="flex items-center gap-1 group"
          style={{ borderBottom: '1px dashed var(--color-text-muted)' }}
        >
          <span className="text-sm text-brand-muted group-hover:opacity-70 transition-opacity">{value}</span>
          <Calendar size={11} className="text-brand-muted group-hover:opacity-70 transition-opacity" />
        </button>
        <span className="text-sm text-brand-muted">기준</span>
      </div>

      {open && (
        <div
          ref={calRef}
          className="rounded-2xl animate-fade-in overflow-hidden"
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: 264, zIndex: 9999,
            background: 'var(--popup-bg)', border: '1px solid var(--popup-border)', boxShadow: 'var(--shadow-elevated)',
          }}
        >
          <div className="h-0.5 w-full" style={{ background: 'var(--popup-top-accent)' }} />

          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={prevMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-muted transition-all"
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {viewYear}년&nbsp;{MONTH_LABELS_OTB[viewMonth]}
            </span>
            <button onClick={nextMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-muted transition-all"
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="mx-4 h-px" style={{ background: 'var(--divider-color)' }} />

          <div className="grid grid-cols-7 px-3 pt-3 pb-1">
            {DAY_LABELS_OTB.map((d, i) => (
              <div key={d} className="text-center text-[10px] font-bold py-1"
                style={{ color: i === 0 ? 'var(--color-negative)' : i === 6 ? 'var(--color-info)' : 'var(--color-text-muted)', opacity: 0.75 }}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5 px-3 pb-3">
            {cells.map((day, i) => {
              if (!day) return <div key={i} className="w-8 h-8" />
              const ds     = toOtbYMD(viewYear, viewMonth, day)
              const isSel  = ds === value
              const isToday = ds === today
              const col    = i % 7
              return (
                <button key={i}
                  onClick={() => { onChange(ds); setOpen(false) }}
                  className="w-8 h-8 mx-auto rounded-lg text-xs font-medium flex items-center justify-center transition-all duration-100"
                  style={
                    isSel
                      ? { background: 'var(--gradient-cta)', boxShadow: 'var(--accent-btn-glow)', color: '#0A0A0A', fontWeight: 700 }
                      : isToday
                        ? { background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)', color: 'var(--color-accent-primary)' }
                        : { color: col === 0 ? 'var(--color-negative)' : col === 6 ? 'var(--color-info)' : 'var(--color-text-secondary)' }
                  }
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--overlay-hover)' }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isToday ? 'var(--accent-badge-bg)' : 'transparent' }}
                >
                  {day}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ borderTop: '1px solid var(--divider-color)', background: 'var(--popup-footer-bg)' }}>
            <button onClick={() => { onChange(today); setOpen(false) }}
              className="text-[11px] font-semibold"
              style={{ color: 'var(--color-accent-primary)' }}>
              오늘
            </button>
            <span className="text-[10px] text-brand-dimmed font-mono">{value || '날짜 미선택'}</span>
            <button onClick={() => setOpen(false)}
              className="text-[11px] text-brand-dimmed hover:text-brand-muted transition-colors">
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  )
}


// ── Modal Edit ────────────────────────────────────────────────────────────────

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

function ModalEdit({
  seg, name, mData, selectedYear, roomCount, allBudgetData, onApply, onClose,
}: {
  seg:            string
  name:           string
  mData:          Record<number, MonthVal>
  selectedYear:   number
  roomCount:      number
  allBudgetData:  BudgetMonthData
  onApply:        (seg: string, draft: Record<number, MonthVal>) => void
  onClose:        () => void
}) {
  const [draft, setDraft] = useState<Record<number, MonthVal>>(() =>
    Object.fromEntries(MONTHS.map(m => [m, { rn: mData[m]?.rn ?? 0, rev: mData[m]?.rev ?? 0 }]))
  )

  // 월별 전체 합계 (draft 반영)
  const monthTotals = MONTHS.map(m => {
    const rn = Object.entries(allBudgetData).reduce((s, [sk, mMap]) =>
      s + ((sk === seg ? draft : mMap)[m]?.rn ?? 0), 0)
    const rev = Object.entries(allBudgetData).reduce((s, [sk, mMap]) =>
      s + ((sk === seg ? draft : mMap)[m]?.rev ?? 0), 0)
    return { rn, rev, adr: rn > 0 ? Math.round(rev / rn) : 0 }
  })

  const grandRn  = monthTotals.reduce((s, t) => s + t.rn,  0)
  const grandRev = monthTotals.reduce((s, t) => s + t.rev, 0)
  const grandAdr = grandRn > 0 ? Math.round(grandRev / grandRn) : 0

  const totalRn  = MONTHS.reduce((s, m) => s + (draft[m]?.rn  ?? 0), 0)
  const totalRev = MONTHS.reduce((s, m) => s + (draft[m]?.rev ?? 0), 0)
  const totalAdr = totalRn > 0 ? Math.round(totalRev / totalRn) : 0

  function handleChange(m: number, field: 'rn' | 'adr' | 'rev', val: number) {
    setDraft(prev => {
      const cur = prev[m] ?? { rn: 0, rev: 0 }
      let newRn = cur.rn, newRev = cur.rev
      if (field === 'rn') {
        const curAdr = cur.rn > 0 ? cur.rev / cur.rn : 0
        newRn  = val
        newRev = Math.round(curAdr * val)
      } else if (field === 'adr') {
        newRev = Math.round(cur.rn * val)
      } else {
        newRev = val
      }
      return { ...prev, [m]: { rn: newRn, rev: newRev } }
    })
  }

  function handleRevert() {
    setDraft(Object.fromEntries(MONTHS.map(m => [m, { rn: mData[m]?.rn ?? 0, rev: mData[m]?.rev ?? 0 }])))
  }

  const pct = (a: number, b: number) => b > 0 && a > 0 ? `${Math.round(a / b * 100)}%` : ''
  const BL  = { borderLeft: '1px solid var(--color-border-default)' } as const
  const BLS = { borderLeft: '1px solid var(--color-border-subtle)' }  as const

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl w-full max-w-3xl overflow-hidden"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <div>
            <p className="text-xs text-brand-muted mb-0.5">Segmentation</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-accent-primary)' }}>{name}</p>
          </div>
          <button onClick={onClose}
            className="text-brand-muted hover:opacity-60 transition-opacity text-lg leading-none">✕</button>
        </div>

        {/* 테이블 */}
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--color-bg-tertiary)', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <th className="px-3 py-2 text-center font-medium text-brand-muted" rowSpan={2} style={{ borderBottom: '1px solid var(--color-border-default)', minWidth: 66 }}>월</th>
                <th colSpan={4} className="px-3 py-1.5 text-center text-xs font-semibold" style={{ ...BL, color: '#4A9EFF' }}>Month Status</th>
                <th colSpan={3} className="px-3 py-1.5 text-center text-xs font-semibold" style={{ ...BL, color: 'var(--color-accent-primary)' }}>{name}</th>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                {(['OCC','R/N','ADR','REV'] as const).map((h, i) => (
                  <th key={h} className="px-3 py-1.5 text-right text-[11px] font-medium text-brand-muted whitespace-nowrap"
                    style={{ ...(i === 0 ? BL : BLS), minWidth: 75 }}>{h}</th>
                ))}
                {(['R/N','ADR','REV'] as const).map((h, i) => (
                  <th key={h} className="px-3 py-1.5 text-right text-[11px] font-medium text-brand-muted whitespace-nowrap"
                    style={i === 0 ? BL : BLS}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((m, idx) => {
                const gt   = monthTotals[idx]
                const dRn  = draft[m]?.rn  ?? 0
                const dRev = draft[m]?.rev ?? 0
                const dAdr = dRn > 0 ? Math.round(dRev / dRn) : 0
                const days  = new Date(selectedYear, m, 0).getDate()
                const avail = roomCount * days
                const occ   = avail > 0 ? (gt.rn / avail * 100).toFixed(1) + '%' : '-'
                return (
                  <tr key={m}
                    style={{ borderBottom: '1px solid var(--color-border-subtle)', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-3 py-1.5 font-medium text-center" style={{ color: 'var(--color-text-primary)' }}>{m}월</td>
                    <td className="px-3 py-1.5 text-right" style={{ ...BL, color: '#4A9EFF' }}>{occ}</td>
                    <td className="px-3 py-1.5 text-right" style={{ ...BLS, color: '#4A9EFF' }}>{gt.rn ? gt.rn.toLocaleString('ko-KR') : '-'}</td>
                    <td className="px-3 py-1.5 text-right" style={{ ...BLS, color: '#4A9EFF' }}>{gt.adr > 0 ? Math.round(gt.adr / 1000).toLocaleString('ko-KR') : '-'}</td>
                    <td className="px-3 py-1.5 text-right" style={{ ...BLS, color: '#4A9EFF' }}>{gt.rev > 0 ? (gt.rev / 1_000_000).toFixed(1) : '-'}</td>
                    {/* 세그먼트 R/N */}
                    <td className="px-2 py-1" style={BL}>
                      <div className="flex items-center justify-end gap-1">
                        <InputCell value={dRn} onChange={v => handleChange(m, 'rn', v)} onBlur={() => {}} selectOnFocus />
                        {pct(dRn, gt.rn) && <span className="text-[10px] text-brand-muted shrink-0">{pct(dRn, gt.rn)}</span>}
                      </div>
                    </td>
                    {/* 세그먼트 ADR */}
                    <td className="px-2 py-1" style={BLS}>
                      <InputCell value={dAdr} onChange={v => handleChange(m, 'adr', v)} onBlur={() => {}} unit={1000} rawEdit selectOnFocus />
                    </td>
                    {/* 세그먼트 REV */}
                    <td className="px-2 py-1" style={BLS}>
                      <div className="flex items-center justify-end gap-1">
                        <InputCell value={dRev} onChange={v => handleChange(m, 'rev', v)} onBlur={() => {}} unit={1_000_000} decimals={1} rawEdit selectOnFocus />
                        {pct(dRev, gt.rev) && <span className="text-[10px] text-brand-muted shrink-0">{pct(dRev, gt.rev)}</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--color-bg-tertiary)' }}>
              <tr style={{ borderTop: '2px solid var(--color-border-default)' }}>
                <td className="px-3 py-2 font-semibold text-center" style={{ color: 'var(--color-accent-primary)' }}>합계</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ ...BL, color: '#4A9EFF' }}>
                  {roomCount > 0 ? (grandRn / (roomCount * 365) * 100).toFixed(1) + '%' : '-'}
                </td>
                <td className="px-3 py-2 text-right font-semibold" style={{ ...BLS, color: '#4A9EFF' }}>{grandRn ? grandRn.toLocaleString('ko-KR') : '-'}</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ ...BLS, color: '#4A9EFF' }}>{grandAdr > 0 ? Math.round(grandAdr / 1000).toLocaleString('ko-KR') : '-'}</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ ...BLS, color: '#4A9EFF' }}>{grandRev > 0 ? (grandRev / 1_000_000).toFixed(1) : '-'}</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ ...BL, color: 'var(--color-accent-primary)' }}>
                  <div className="flex items-center justify-end gap-1">
                    {totalRn ? totalRn.toLocaleString('ko-KR') : '-'}
                    {pct(totalRn, grandRn) && <span className="text-[10px] text-brand-muted font-normal">{pct(totalRn, grandRn)}</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-semibold" style={{ ...BLS, color: 'var(--color-accent-primary)' }}>
                  {totalAdr > 0 ? Math.round(totalAdr / 1000).toLocaleString('ko-KR') : '-'}
                </td>
                <td className="px-3 py-2 text-right font-semibold" style={{ ...BLS, color: 'var(--color-accent-primary)' }}>
                  <div className="flex items-center justify-end gap-1">
                    {totalRev > 0 ? (totalRev / 1_000_000).toFixed(1) : '-'}
                    {pct(totalRev, grandRev) && <span className="text-[10px] text-brand-muted font-normal">{pct(totalRev, grandRev)}</span>}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 푸터 버튼 */}
        <div className="flex items-center justify-end gap-3 px-5 py-3"
          style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <button onClick={handleRevert}
            className="px-4 py-1.5 rounded-lg text-sm hover:opacity-80 transition-all"
            style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
            되돌리기
          </button>
          <button onClick={() => onApply(seg, draft)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
            적용
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Main Component ────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const queryClient      = useQueryClient()
  const { profile }      = useAuth()
  const { currentHotel } = useHotel()
  const { otbDate, setOtbDate } = useDateContext()
  const hotelId          = currentHotel?.id ?? ''

  const [selectedYear,    setSelectedYear]    = useState(new Date().getFullYear())
  const [selectedMonth,   setSelectedMonth]   = useState(new Date().getMonth() + 1)
  const [activeTab,       setActiveTab]       = useState<TabType>('monthly')
  const [budgetDate]                          = useState<string>('')
  const [budgetData,      setBudgetData]      = useState<BudgetMonthData>({})
  const [dailyEdits,      setDailyEdits]      = useState<BudgetDailyEdits>({})
  const [saving,          setSaving]          = useState(false)
  const [importing,       setImporting]       = useState(false)
  const [saveError,       setSaveError]       = useState<string | null>(null)
  const [initConfirm,     setInitConfirm]     = useState(false)
  const [isDistributing,  setIsDistributing]  = useState(false)
  const [isDirectEdit,    setIsDirectEdit]    = useState(true)
  const [modalSeg,        setModalSeg]        = useState<string | null>(null)
  const [segNameMap,      setSegNameMap]      = useState<Record<string, string>>({})

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!hotelId) return
    ;(supabase as any)
      .from('c05_market_table_schema')
      .select('name, segmentation')
      .eq('hotel_id', hotelId)
      .eq('is_active', true)
      .then(({ data }: any) => {
        const map: Record<string, string> = {}
        ;(data ?? []).forEach((s: any) => {
          ;(s.segmentation ?? []).forEach((code: string) => { map[code] = s.name })
        })
        setSegNameMap(map)
      })
  }, [hotelId])

  useEffect(() => {
    if (!hotelId) return
    ;(supabase as any)
      .from('m03_hotel_details')
      .select('room_count')
      .eq('hotel_id', hotelId)
      .single()
      .then(({ data }: any) => {
        if (data?.room_count) setRoomCount(data.room_count)
      })
  }, [hotelId])

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i)


  const [roomCount, setRoomCount] = useState<number>(0)
  const schemaSegs:        string[]          = []
  const budgetMonthlyRows: BudgetMonthlyRow[] = []
  const monthlyLoading:    boolean           = false
  const budgetDailyRows:   BudgetDailyRow[]  = []
  const dailyLoading:      boolean           = false

  // ── 3. 전년 실적 불러오기 ────────────────────────────────────────────────────
  // init_budget_from_actual RPC 내부 중복 upsert 오류 회피:
  // 클라이언트에서 calendar + actual 직접 조회 후 중복 제거 → upsert_budget 호출
  const handleInitFromActual = async () => {
    if (!hotelId || !profile?.id) return
    setImporting(true)
    setSaveError(null)
    try {
      // 1. 해당 연도 calendar에서 yoy_match 날짜 조회 (컬럼명: date)
      const { data: calRows, error: calErr } = await (supabase as any)
        .from('c06_calendar')
        .select('date, yoy_match')
        .gte('date', `${selectedYear}-01-01`)
        .lte('date', `${selectedYear}-12-31`)
      if (calErr) throw calErr

      const validCal: { date: string; yoy_match: string }[] =
        (calRows ?? []).filter((r: any) => r.yoy_match)

      const yoyDates = [...new Set(validCal.map((r: any) => r.yoy_match))]

      // 2. 전년 실적 조회
      const { data: actRows, error: actErr } = await (supabase as any)
        .from('a01_actual_daily')
        .select('business_date, segmentation, nights, room_revenue')
        .eq('hotel_id', hotelId)
        .in('business_date', yoyDates)
      if (actErr) throw actErr

      // 3. yoy_match → actual 매핑
      const actMap: Record<string, Record<string, { rn: number; rev: number }>> = {}
      ;(actRows ?? []).forEach((r: any) => {
        if (!actMap[r.business_date]) actMap[r.business_date] = {}
        actMap[r.business_date][r.segmentation] = {
          rn:  r.nights       ?? 0,
          rev: r.room_revenue ?? 0,
        }
      })

      // 4. 행 생성 — Map으로 중복 제거 (동일 date+seg 는 마지막 값 유지)
      const rowMap = new Map<string, any>()
      validCal.forEach(cal => {
        const yoyData = actMap[cal.yoy_match] ?? {}
        Object.entries(yoyData).forEach(([seg, val]) => {
          const key = `${cal.date}__${seg}`
          rowMap.set(key, {
            business_date:  cal.date,
            segmentation:   seg,
            sorting1:       null,
            sorting2:       null,
            sorting3:       null,
            budget_nights:  val.rn,
            budget_revenue: val.rev,
          })
        })
      })

      const rows = Array.from(rowMap.values())
      if (rows.length === 0) {
        setSaveError('불러올 전년 실적 데이터가 없습니다.')
        return
      }

      // 5. upsert_budget RPC 호출 (청크 500)
      const CHUNK = 500
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await (supabase as any)
          .rpc('upsert_budget', {
            p_hotel_id:    hotelId,
            p_profile_id:  profile.id,
            p_update_date: budgetDate || new Date().toISOString().split('T')[0],
            p_rows:        rows.slice(i, i + CHUNK),
          })
        if (error) throw error
      }

      queryClient.invalidateQueries({ queryKey: ['budget_monthly', hotelId, selectedYear] })
      queryClient.invalidateQueries({ queryKey: ['budget_daily',   hotelId, selectedYear] })
      setSaveError(null)
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setImporting(false)
      setInitConfirm(false)
    }
  }

  // ── 4. 월별 저장 — onBlur (upsert_budget) ─────────────────────────────────────
  const saveBudgetMonthly = useCallback(async (segmentation: string, month: number) => {
    if (!hotelId || !profile?.id) return
    const rn  = budgetData[segmentation]?.[month]?.rn  ?? 0
    const rev = budgetData[segmentation]?.[month]?.rev ?? 0
    const daysInMonth = new Date(selectedYear, month, 0).getDate()
    const dailyRn     = Math.round(rn  / daysInMonth)
    const dailyRev    = Math.round(rev / daysInMonth)

    const rows = Array.from({ length: daysInMonth }, (_, i) => ({
      business_date:  `${selectedYear}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
      segmentation,
      sorting1:       null,
      sorting2:       null,
      sorting3:       null,
      budget_nights:  dailyRn,
      budget_revenue: dailyRev,
    }))

    try {
      const { error } = await (supabase as any)
        .rpc('upsert_budget', {
          p_hotel_id:    hotelId,
          p_profile_id:  profile.id,
          p_update_date: budgetDate || new Date().toISOString().split('T')[0],
          p_rows:        rows,
        })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['budget_monthly', hotelId, selectedYear] })
    } catch (err: any) {
      console.error('월별 저장 오류:', err.message)
    }
  }, [hotelId, profile?.id, budgetData, selectedYear, queryClient, budgetDate])

  // ── 5. 일별 저장 — onBlur (upsert_budget) ─────────────────────────────────────
  const saveBudgetDaily = useCallback(async (businessDate: string, segmentation: string) => {
    if (!hotelId || !profile?.id) return
    const rn  = dailyEdits[businessDate]?.[segmentation]?.rn  ?? 0
    const rev = dailyEdits[businessDate]?.[segmentation]?.rev ?? 0

    try {
      const { error } = await (supabase as any)
        .rpc('upsert_budget', {
          p_hotel_id:    hotelId,
          p_profile_id:  profile.id,
          p_update_date: budgetDate || new Date().toISOString().split('T')[0],
          p_rows: [{
            business_date:  businessDate,
            segmentation,
            sorting1:       null,
            sorting2:       null,
            sorting3:       null,
            budget_nights:  rn,
            budget_revenue: rev,
          }],
        })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['budget_daily', hotelId, selectedYear, selectedMonth, otbDate] })
    } catch (err: any) {
      console.error('일별 저장 오류:', err.message)
    }
  }, [hotelId, profile?.id, dailyEdits, selectedYear, selectedMonth, otbDate, queryClient, budgetDate])

  // ── 6. 전체 저장 (upsert_budget) ──────────────────────────────────────────────
  const saveAll = async () => {
    if (!hotelId || !profile?.id) return
    setSaving(true)
    setSaveError(null)
    try {
      const rows: any[] = []
      Object.entries(budgetData).forEach(([seg, months]) => {
        Object.entries(months).forEach(([mStr, val]) => {
          const month = Number(mStr)
          const days  = new Date(selectedYear, month, 0).getDate()
          Array.from({ length: days }, (_, i) => {
            rows.push({
              business_date:  `${selectedYear}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
              segmentation:   seg,
              sorting1:       null,
              sorting2:       null,
              sorting3:       null,
              budget_nights:  Math.round(val.rn  / days),
              budget_revenue: Math.round(val.rev / days),
            })
          })
        })
      })

      if (rows.length > 0) {
        const { error } = await (supabase as any)
          .rpc('upsert_budget', {
            p_hotel_id:    hotelId,
            p_profile_id:  profile.id,
            p_update_date: budgetDate || new Date().toISOString().split('T')[0],
            p_rows:        rows,
          })
        if (error) throw error
        queryClient.invalidateQueries({ queryKey: ['budget_monthly', hotelId, selectedYear] })
        queryClient.invalidateQueries({ queryKey: ['budget_daily',   hotelId, selectedYear] })
      }
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── 7. 모달 적용 (applyModalEdit) ─────────────────────────────────────────────
  const applyModalEdit = useCallback(async (seg: string, draft: Record<number, MonthVal>) => {
    if (!hotelId || !profile?.id) return
    setBudgetData(prev => ({ ...prev, [seg]: draft }))
    const rows: any[] = []
    MONTHS.forEach(m => {
      const rn   = draft[m]?.rn  ?? 0
      const rev  = draft[m]?.rev ?? 0
      const days = new Date(selectedYear, m, 0).getDate()
      Array.from({ length: days }, (_, i) => {
        rows.push({
          business_date:  `${selectedYear}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
          segmentation:   seg,
          sorting1: null, sorting2: null, sorting3: null,
          budget_nights:  Math.round(rn  / days),
          budget_revenue: Math.round(rev / days),
        })
      })
    })
    try {
      const { error } = await (supabase as any)
        .rpc('upsert_budget', {
          p_hotel_id:    hotelId,
          p_profile_id:  profile.id,
          p_update_date: budgetDate || new Date().toISOString().split('T')[0],
          p_rows:        rows,
        })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['budget_monthly', hotelId, selectedYear] })
    } catch (err: any) {
      setSaveError(err.message)
    }
    setModalSeg(null)
  }, [hotelId, profile?.id, budgetDate, selectedYear, queryClient])

  // ── Step1. 엑셀 양식 다운로드 ────────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    // 스키마 계층 구조 조회
    const { data: schemaRows } = await (supabase as any)
      .from('c05_market_table_schema')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('is_active', true)
      .order('order_index')

    const schemas: any[] = schemaRows ?? []
    const mainSchemas = schemas.filter((s: any) => s.level === 'main').sort((a: any, b: any) => a.order_index - b.order_index)
    const subSchemas  = schemas.filter((s: any) => s.level === 'sub')
    const midSchemas  = schemas.filter((s: any) => s.level === 'mid').sort((a: any, b: any) => a.order_index - b.order_index)

    const groups = mainSchemas.map((main: any) => ({
      parent:   main,
      children: subSchemas.filter((s: any) => s.parent_id === main.id).sort((a: any, b: any) => a.order_index - b.order_index),
    }))

    // 대분류/중분류 order_index 인터리빙 (MarketTable과 동일 순서)
    const items = [
      ...groups.map((g: any) => ({ kind: 'group', data: g, idx: g.parent.order_index })),
      ...midSchemas.map((m: any) => ({ kind: 'mid', data: m, idx: m.order_index })),
    ].sort((a, b) => a.idx - b.idx)

    // 템플릿 행 목록 생성
    const templateRows: { label: string; code: string; isHeader: boolean }[] = []
    items.forEach(item => {
      if (item.kind === 'group') {
        templateRows.push({ label: item.data.parent.name, code: '', isHeader: true })
        item.data.children.forEach((child: any) => {
          templateRows.push({ label: `  ${child.name}`, code: (child.segmentation ?? []).join(', '), isHeader: false })
        })
      } else {
        templateRows.push({ label: item.data.name, code: (item.data.segmentation ?? []).join(', '), isHeader: false })
      }
    })

    const wb = XLSX.utils.book_new()
    const ws: any = {}

    // 헤더 행1: Segmentation | Code | 1월(3칸) ... 12월(3칸) | 합계(3칸)
    ws['A1'] = { v: 'Segmentation' }
    ws['B1'] = { v: 'Code' }
    months.forEach((m, i) => {
      ws[`${XLSX.utils.encode_col(2 + i * 3)}1`] = { v: `${m}월` }
    })
    ws[`${XLSX.utils.encode_col(38)}1`] = { v: '합계' }

    // 헤더 행2: (빈칸) | (빈칸) | R/N | ADR | REV 반복
    months.forEach((_, i) => {
      const base = 2 + i * 3
      ws[`${XLSX.utils.encode_col(base)}2`]     = { v: 'R/N' }
      ws[`${XLSX.utils.encode_col(base + 1)}2`] = { v: 'ADR' }
      ws[`${XLSX.utils.encode_col(base + 2)}2`] = { v: 'REV' }
    })
    ws[`${XLSX.utils.encode_col(38)}2`] = { v: 'R/N' }
    ws[`${XLSX.utils.encode_col(39)}2`] = { v: 'ADR' }
    ws[`${XLSX.utils.encode_col(40)}2`] = { v: 'REV' }

    // 데이터 행 (대분류 헤더 포함)
    templateRows.forEach((row, rowIdx) => {
      ws[`A${rowIdx + 3}`] = { v: row.label }
      if (row.code) ws[`B${rowIdx + 3}`] = { v: row.code }
    })

    // 병합
    ws['!merges'] = [
      ...months.map((_, i) => ({
        s: { r: 0, c: 2 + i * 3 },
        e: { r: 0, c: 4 + i * 3 },
      })),
      { s: { r: 0, c: 38 }, e: { r: 0, c: 40 } },
    ]
    ws['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: templateRows.length + 1, c: 40 },
    })

    XLSX.utils.book_append_sheet(wb, ws, 'Budget')
    XLSX.writeFile(wb, `Budget_양식_${selectedYear}.xlsx`)
  }

  // ── Step2. 엑셀 업로드 파싱 ──────────────────────────────────────────────────
  const handleUploadBudget = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    // 스키마 조회 → 이름 기반 행을 segmentation 코드로 변환
    const { data: schemaRows } = await (supabase as any)
      .from('c05_market_table_schema')
      .select('id, name, level, segmentation')
      .eq('hotel_id', hotelId)
      .eq('is_active', true)

    // label(trimmed) → segmentation codes[] 맵
    const labelToCodesMap: Record<string, string[]> = {}
    ;(schemaRows ?? []).forEach((s: any) => {
      if ((s.level === 'sub' || s.level === 'mid') && s.segmentation?.length > 0) {
        labelToCodesMap[s.name.trim()] = s.segmentation
      }
    })

    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: 0 }) as any[][]

    const parsed: Record<string, Record<number, MonthVal>> = {}
    for (let i = 2; i < rows.length; i++) {
      const row   = rows[i]
      const label = String(row[0] ?? '').trim()
      if (!label) continue

      // 스키마 이름 매칭 → codes 확장 / 미매칭 시 label 자체를 코드로 사용 (구 양식 호환)
      const codes   = labelToCodesMap[label] ?? [label]
      const perCode = codes.length

      for (let m = 1; m <= 12; m++) {
        const base    = 2 + (m - 1) * 3
        const totalRn  = Number(row[base]     ?? 0)
        const totalRev = Number(row[base + 2] ?? 0)
        codes.forEach(code => {
          if (!parsed[code]) parsed[code] = {}
          parsed[code][m] = {
            rn:  Math.round(totalRn  / perCode),
            rev: Math.round(totalRev / perCode),
          }
        })
      }
    }

    setBudgetData(parsed)
  }

  // ── Step3. 전년 비율 배분 계산 ────────────────────────────────────────────────
  const distributeBudget = async (budgetInput: Record<string, Record<number, MonthVal>>) => {
    setIsDistributing(true)
    try {
      // 전년 일별 실적 조회
      const { data: actRows, error: actErr } = await (supabase as any)
        .from('a01_actual_daily')
        .select('business_date, segmentation, nights, room_revenue')
        .eq('hotel_id', hotelId)
        .gte('business_date', `${selectedYear - 1}-01-01`)
        .lte('business_date', `${selectedYear - 1}-12-31`)
      if (actErr) throw actErr

      // 해당 연도 calendar yoy_match 조회 (컬럼명: date)
      const { data: calRows, error: calErr } = await (supabase as any)
        .from('c06_calendar')
        .select('date, yoy_match')
        .gte('date', `${selectedYear}-01-01`)
        .lte('date', `${selectedYear}-12-31`)
      if (calErr) throw calErr

      // 전년 월별 합계
      const actMonthly: Record<string, Record<number, MonthVal>> = {}
      ;(actRows ?? []).forEach((r: any) => {
        const month = new Date(r.business_date).getMonth() + 1
        if (!actMonthly[r.segmentation]) actMonthly[r.segmentation] = {}
        if (!actMonthly[r.segmentation][month]) actMonthly[r.segmentation][month] = { rn: 0, rev: 0 }
        actMonthly[r.segmentation][month].rn  += r.nights       ?? 0
        actMonthly[r.segmentation][month].rev += r.room_revenue ?? 0
      })

      // 전년 일별 맵 (yoy_match 날짜 기준)
      const actDaily: Record<string, Record<string, MonthVal>> = {}
      ;(actRows ?? []).forEach((r: any) => {
        if (!actDaily[r.segmentation]) actDaily[r.segmentation] = {}
        actDaily[r.segmentation][r.business_date] = {
          rn:  r.nights       ?? 0,
          rev: r.room_revenue ?? 0,
        }
      })

      // 일별 배분
      const newWarnings: string[] = []
      const rowMap = new Map<string, { business_date: string; segmentation: string; budget_nights: number; budget_revenue: number; has_warning: boolean }>()

      ;(calRows ?? []).forEach((cal: any) => {
        const date  = cal.date
        const yoy   = cal.yoy_match
        const month = new Date(date).getMonth() + 1

        Object.entries(budgetInput).forEach(([seg, mMap]) => {
          const monthBudget = mMap[month] ?? { rn: 0, rev: 0 }
          if (monthBudget.rn === 0 && monthBudget.rev === 0) return

          const monthActual = actMonthly[seg]?.[month] ?? { rn: 0, rev: 0 }
          const dayActual   = yoy ? (actDaily[seg]?.[yoy] ?? null) : null

          let dailyRn: number
          let dailyRev: number
          let hasWarning = false

          if (!dayActual || monthActual.rn === 0) {
            // 전년 실적 없음 → 균등 배분
            const daysInMonth = new Date(selectedYear, month, 0).getDate()
            dailyRn  = Math.round(monthBudget.rn  / daysInMonth)
            dailyRev = Math.round(monthBudget.rev / daysInMonth)
            hasWarning = true
            const wMsg = `${date} ${seg}: 전년 실적 없음 → 균등 배분`
            if (!newWarnings.includes(wMsg)) newWarnings.push(wMsg)
          } else {
            const rnRatio  = dayActual.rn  / monthActual.rn
            const revRatio = monthActual.rev > 0 ? dayActual.rev / monthActual.rev : rnRatio
            dailyRn  = Math.round(monthBudget.rn  * rnRatio)
            dailyRev = Math.round(monthBudget.rev * revRatio)
          }

          // room_count 초과 방지
          if (roomCount > 0 && dailyRn > roomCount) {
            newWarnings.push(`${date} ${seg}: R/N ${dailyRn}실 → room_count(${roomCount}) 초과로 조정`)
            dailyRn = roomCount
          }

          // 중복 제거
          const key = `${date}__${seg}`
          rowMap.set(key, { business_date: date, segmentation: seg, budget_nights: dailyRn, budget_revenue: dailyRev, has_warning: hasWarning })
        })
      })

    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setIsDistributing(false)
    }
  }


  // ── 로컬 편집 핸들러 ──────────────────────────────────────────────────────────
  const handleBudgetChange = useCallback((seg: string, month: number, field: 'rn' | 'adr' | 'rev', val: number) => {
    setBudgetData(prev => {
      const cur = prev[seg]?.[month] ?? { rn: 0, rev: 0 }
      let newRn = cur.rn, newRev = cur.rev
      if (field === 'rn') {
        const curAdr = cur.rn > 0 ? cur.rev / cur.rn : 0
        newRn  = val
        newRev = Math.round(curAdr * val)
      } else if (field === 'adr') {
        newRev = Math.round(cur.rn * val)
      } else {
        newRev = val
      }
      return { ...prev, [seg]: { ...prev[seg], [month]: { rn: newRn, rev: newRev } } }
    })
  }, [])

  const handleDailyChange = useCallback((date: string, seg: string, field: 'rn' | 'rev', val: number) => {
    setDailyEdits(prev => ({
      ...prev,
      [date]: {
        ...prev[date],
        [seg]: {
          rn:  field === 'rn'  ? val : (prev[date]?.[seg]?.rn  ?? 0),
          rev: field === 'rev' ? val : (prev[date]?.[seg]?.rev ?? 0),
        },
      },
    }))
  }, [])


  // ── 월별 컬럼 정의 ────────────────────────────────────────────────────────────
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  const monthlyColumns = useMemo((): MarketTableColumn[] => [
    { key: 'total_rn',  label: 'R/N',    group: '합계', type: 'number'   as const },
    { key: 'total_adr', label: 'ADR(천)', group: '합계', type: 'adr'      as const },
    { key: 'total_rev', label: 'REV(백만)', group: '합계', type: 'currency' as const },
    ...months.flatMap(m => [
      {
        key:   `m${m}_rn`,
        label: 'R/N',
        group: `${m}월`,
        render: (_: any, row: any) => {
          const seg = row.segmentation as string
          if (!seg) return null
          const rn = budgetData[seg]?.[m]?.rn ?? 0
          if (!isDirectEdit) return (
            <div className="w-full text-right cursor-pointer transition-colors hover:[color:var(--color-accent-primary)]"
              onClick={() => setModalSeg(seg)}>
              {rn ? rn.toLocaleString('ko-KR') : '-'}
            </div>
          )
          return (
            <InputCell
              value={rn}
              onChange={v => handleBudgetChange(seg, m, 'rn', v)}
              onBlur={() => saveBudgetMonthly(seg, m)}
              selectOnFocus={isDirectEdit}
            />
          )
        },
      },
      {
        key:   `m${m}_adr`,
        label: 'ADR(천)',
        group: `${m}월`,
        type:  'adr' as const,
        render: (val: any, row: any) => {
          const seg = row.segmentation as string
          const adr = val as number
          const fmt = adr > 0 ? Math.round(adr / 1000).toLocaleString('ko-KR') : '-'
          if (!seg) return <>{fmt}</>
          if (!isDirectEdit) return (
            <div className="w-full text-right cursor-pointer transition-colors hover:[color:var(--color-accent-primary)]"
              onClick={() => setModalSeg(seg)}>
              {fmt}
            </div>
          )
          if (isDirectEdit) return (
            <InputCell
              value={adr}
              onChange={v => handleBudgetChange(seg, m, 'adr', v)}
              onBlur={() => saveBudgetMonthly(seg, m)}
              unit={1000}
              rawEdit
              selectOnFocus
            />
          )
          return <>{fmt}</>
        },
      },
      {
        key:   `m${m}_rev`,
        label: 'REV(백만)',
        group: `${m}월`,
        type:  'currency' as const,
        render: (_: any, row: any) => {
          const seg = row.segmentation as string
          if (!seg) return null
          const rev = budgetData[seg]?.[m]?.rev ?? 0
          const fmt = rev > 0 ? (rev / 1_000_000).toFixed(1) : '-'
          if (!isDirectEdit) return (
            <div className="w-full text-right cursor-pointer transition-colors hover:[color:var(--color-accent-primary)]"
              onClick={() => setModalSeg(seg)}>
              {fmt}
            </div>
          )
          return (
            <InputCell
              value={rev}
              onChange={v => handleBudgetChange(seg, m, 'rev', v)}
              onBlur={() => saveBudgetMonthly(seg, m)}
              unit={1_000_000}
              decimals={1}
              rawEdit
              selectOnFocus={isDirectEdit}
            />
          )
        },
      },
    ] as MarketTableColumn[]),
  ], [budgetData, handleBudgetChange, saveBudgetMonthly, isDirectEdit])

  // ── 월별 테이블 데이터 ────────────────────────────────────────────────────────
  const monthlyTableData = useMemo((): Record<string, Record<string, any>> => {
    const result: Record<string, Record<string, any>> = {}
    Object.entries(budgetData).forEach(([seg, mMap]) => {
      result[seg] = { __seg: seg }
      months.forEach(m => {
        const rn  = mMap[m]?.rn  ?? 0
        const rev = mMap[m]?.rev ?? 0
        result[seg][`m${m}_rn`]  = rn
        result[seg][`m${m}_rev`] = rev
        result[seg][`m${m}_adr`] = rn > 0 ? Math.round(rev / rn) : 0
      })
      const totalRn  = months.reduce((s, m) => s + (mMap[m]?.rn  ?? 0), 0)
      const totalRev = months.reduce((s, m) => s + (mMap[m]?.rev ?? 0), 0)
      result[seg]['total_rn']  = totalRn
      result[seg]['total_rev'] = totalRev
      result[seg]['total_adr'] = totalRn > 0 ? Math.round(totalRev / totalRn) : 0
    })
    return result
  }, [budgetData])

  // 월별 테이블 표시 순서 — 대분류 헤더 + 소분류 seg 행

  // ── 일별 파생 데이터 ──────────────────────────────────────────────────────────
  const dayList = useMemo(() => getDaysInMonth(selectedYear, selectedMonth), [selectedYear, selectedMonth])

  const allSegs = useMemo(() => {
    const segs = new Set<string>()
    budgetMonthlyRows.forEach(r => segs.add(r.segmentation))
    return Array.from(segs).sort()
  }, [budgetMonthlyRows])

  // business_date+seg → BudgetDailyRow 맵
  const dailyRowMap = useMemo(() => {
    const map: Record<string, Record<string, BudgetDailyRow>> = {}
    budgetDailyRows.forEach(row => {
      if (!map[row.business_date]) map[row.business_date] = {}
      map[row.business_date][row.segmentation] = row
    })
    return map
  }, [budgetDailyRows])


  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── 개별수정 모달 ── */}
      {modalSeg && (
        <ModalEdit
          seg={modalSeg}
          name={segNameMap[modalSeg] ?? modalSeg}
          mData={budgetData[modalSeg] ?? {}}
          selectedYear={selectedYear}
          roomCount={roomCount}
          allBudgetData={budgetData}
          onApply={applyModalEdit}
          onClose={() => setModalSeg(null)}
        />
      )}

      {/* ── 전년 실적 불러오기 확인 모달 — 메인 div 밖에 렌더링 ── */}
      {initConfirm && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setInitConfirm(false)} />
          <div className="relative rounded-2xl p-6 w-full max-w-sm space-y-4"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              전년 실적으로 초기화
            </p>
            <p className="text-sm text-brand-muted">
              {selectedYear}년 예산을 전년 실적으로 초기화할까요?<br />기존 데이터가 덮어씌워집니다.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setInitConfirm(false)}
                className="flex-1 py-2 rounded-lg text-sm hover:opacity-80 transition-all"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                취소
              </button>
              <button onClick={handleInitFromActual} disabled={importing}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-50"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
                {importing ? <Loader2 size={13} className="animate-spin" /> : null}
                확인
              </button>
            </div>
          </div>
        </div>
      )}

    <div className="space-y-5 animate-fade-in">

      {/* ── 에러 배너 ── */}
      {saveError && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl text-sm"
          style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)', color: 'var(--color-text-primary)' }}>
          <span style={{ color: '#FC8181' }}>{saveError}</span>
          <button onClick={() => setSaveError(null)} className="text-brand-muted hover:text-brand-text ml-4 shrink-0">✕</button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {/* 연도 대형 표시 */}
          <div className="flex items-end gap-1">
            <span className="font-bold leading-none" style={{ fontSize: 42, color: 'var(--color-accent-primary)' }}>
              {selectedYear}
            </span>
            <div className="flex items-end gap-0.5 pb-0.5">
              <span className="text-lg font-bold" style={{ color: 'var(--color-accent-primary)' }}>년</span>
              <div className="flex flex-col" style={{ marginBottom: 1 }}>
                <button onClick={() => setSelectedYear(y => y + 1)}
                  className="leading-none hover:opacity-60 transition-opacity"
                  style={{ color: 'var(--color-accent-primary)' }}>
                  <ChevronUp size={13} />
                </button>
                <button onClick={() => setSelectedYear(y => y - 1)}
                  className="leading-none hover:opacity-60 transition-opacity"
                  style={{ color: 'var(--color-accent-primary)' }}>
                  <ChevronDown size={13} />
                </button>
              </div>
            </div>
          </div>
          {/* 타이틀 */}
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Budget</h1>
            <OtbDatePicker value={otbDate} onChange={setOtbDate} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-xl w-fit"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)' }}>
            {(['monthly', 'daily'] as TabType[]).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: activeTab === tab ? 'var(--gradient-cta)' : 'transparent',
                  color:      activeTab === tab ? '#0A0A0A' : 'var(--color-text-muted)',
                }}>
                {tab === 'monthly' ? '월별' : '일별'}
              </button>
            ))}
          </div>
          <button
            onClick={saveAll}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-50"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            저장
          </button>
        </div>
      </div>

      {/* ── 탭 ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeTab === 'monthly' && (
            <button
              onClick={() => setIsDirectEdit(v => !v)}
              className="inline-flex items-center gap-1.5 px-5 py-1.5 rounded-full font-semibold text-xs transition-all"
              style={{
                background: isDirectEdit ? 'var(--color-accent-primary)' : 'rgba(255,255,255,0.06)',
                color:      isDirectEdit ? '#0A0A0A' : 'var(--color-text-muted)',
                minWidth: '80px', justifyContent: 'center', border: 'none', cursor: 'pointer',
              }}
            >
              {isDirectEdit ? '직접수정' : '일괄수정'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setInitConfirm(true)}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
            style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
          >
            {importing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            전년 실적 불러오기
          </button>

          {/* 엑셀 업로드 카드 */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ border: '1px solid var(--color-border-default)', background: 'var(--color-bg-secondary)' }}>
            <FileSpreadsheet size={14} style={{ color: 'var(--color-accent-primary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>파일</span>
            <div className="w-px h-3.5 mx-1" style={{ background: 'var(--color-border-default)' }} />
            <button
              onClick={handleDownloadTemplate}
              className="btn-excel-action flex items-center gap-1 text-sm font-medium"
            >
              <Download size={12} />
              엑셀 다운
            </button>
            <input
              type="file"
              accept=".xlsx,.xls"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleUploadBudget}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isDistributing}
              className="btn-excel-action flex items-center gap-1 text-sm font-medium"
            >
              {isDistributing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              엑셀 업로드
            </button>
          </div>
        </div>
      </div>

      {/* ── 월별 탭 ── */}
      {activeTab === 'monthly' && (
        <div className="space-y-4">
          <MarketTable
            hotelId={hotelId}
            year={selectedYear}
            month={selectedMonth}
            columns={monthlyColumns}
            data={monthlyTableData}
            loading={monthlyLoading}
            stickyFirstGroup
            opaqueBg
            maxHeight="calc(100vh - 270px)"
          />
        </div>
      )}

      {/* ── 일별 탭 ── */}
      {activeTab === 'daily' && (
        <div className="space-y-4">
          {/* 월 선택 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-brand-muted">월 선택</span>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="appearance-none pl-3 pr-7 py-1.5 text-sm rounded-lg focus:outline-none"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-brand-muted" />
            </div>
          </div>

          {/* 일별 테이블 */}
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--color-border-default)' }}>
            <table className="w-full border-collapse" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
                  <th className="px-3 py-2 text-left text-xs font-medium text-brand-muted sticky left-0"
                    style={{ minWidth: 84, background: 'var(--color-bg-tertiary)' }}>날짜</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-brand-muted"
                    style={{ minWidth: 36, borderLeft: '1px solid var(--color-border-subtle)' }}>요일</th>
                  {allSegs.map(seg => (
                    <th key={seg} colSpan={9}
                      className="px-2 py-2 text-center text-xs font-semibold"
                      style={{ borderLeft: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                      {seg}
                    </th>
                  ))}
                </tr>
                <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
                  <th className="sticky left-0" style={{ background: 'var(--color-bg-tertiary)' }} />
                  <th />
                  {allSegs.map(seg => (
                    <React.Fragment key={seg}>
                      {/* Budget */}
                      <th className="px-2 py-1 text-center text-[10px] font-semibold"
                        style={{ borderLeft: '1px solid var(--color-border-default)', color: 'var(--color-accent-primary)', minWidth: 180 }}
                        colSpan={3}>
                        Budget
                      </th>
                      {/* 전년 */}
                      <th className="px-2 py-1 text-center text-[10px] font-semibold"
                        style={{ borderLeft: '1px solid var(--color-border-default)', color: '#4A9EFF', minWidth: 180 }}
                        colSpan={3}>
                        전년 실적
                      </th>
                      {/* OTB */}
                      <th className="px-2 py-1 text-center text-[10px] font-semibold"
                        style={{ borderLeft: '1px solid var(--color-border-default)', color: '#A78BFA', minWidth: 180 }}
                        colSpan={3}>
                        OTB
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
                <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
                  <th className="sticky left-0" style={{ background: 'var(--color-bg-tertiary)' }} />
                  <th />
                  {allSegs.map(seg => (
                    <React.Fragment key={seg}>
                      {['Budget', '전년', 'OTB'].map((group, gi) => (
                        <React.Fragment key={group}>
                          <th className="px-1 py-1 text-right text-[10px] text-brand-muted"
                            style={{ borderLeft: gi === 0 ? '1px solid var(--color-border-default)' : '1px solid var(--color-border-default)', minWidth: 56 }}>R/N</th>
                          <th className="px-1 py-1 text-right text-[10px] text-brand-muted"
                            style={{ borderLeft: '1px solid var(--color-border-subtle)', minWidth: 56 }}>ADR</th>
                          <th className="px-1 py-1 text-right text-[10px] text-brand-muted"
                            style={{ borderLeft: '1px solid var(--color-border-subtle)', minWidth: 68 }}>REV</th>
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailyLoading ? (
                  <tr>
                    <td colSpan={2 + allSegs.length * 9} className="px-4 py-10 text-center text-sm text-brand-muted">
                      <Loader2 size={16} className="animate-spin inline mr-2" />불러오는 중...
                    </td>
                  </tr>
                ) : (
                  dayList.map(({ date, dayOfWeek }, rowIdx) => (
                    <tr key={date}
                      style={{ borderBottom: '1px solid var(--color-border-subtle)', background: rowIdx % 2 === 0 ? 'transparent' : 'var(--color-bg-secondary)' }}>
                      <td className="px-3 py-1.5 text-xs font-medium sticky left-0"
                        style={{ color: DAY_COLOR[dayOfWeek] ?? 'var(--color-text-primary)', background: rowIdx % 2 === 0 ? 'var(--color-bg-primary)' : 'var(--color-bg-secondary)' }}>
                        {date}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-center"
                        style={{ color: DAY_COLOR[dayOfWeek] ?? 'var(--color-text-muted)', borderLeft: '1px solid var(--color-border-subtle)' }}>
                        {dayOfWeek}
                      </td>
                      {allSegs.map(seg => {
                        const dbRow  = dailyRowMap[date]?.[seg]
                        const budRn  = dailyEdits[date]?.[seg]?.rn  ?? dbRow?.budget_nights  ?? 0
                        const budRev = dailyEdits[date]?.[seg]?.rev ?? dbRow?.budget_revenue ?? 0
                        const budAdr = budRn > 0 ? Math.round(budRev / budRn) : 0
                        const actRn  = dbRow?.act_nights   ?? 0
                        const actRev = dbRow?.act_revenue  ?? 0
                        const actAdr = actRn > 0 ? Math.round(actRev / actRn) : 0
                        const otbRn  = dbRow?.otb_nights   ?? 0
                        const otbRev = dbRow?.otb_revenue  ?? 0
                        const otbAdr = otbRn > 0 ? Math.round(otbRev / otbRn) : 0

                        return (
                          <React.Fragment key={seg}>
                            {/* Budget */}
                            <td className="px-1 py-1" style={{ borderLeft: '1px solid var(--color-border-default)' }}>
                              <InputCell value={budRn} onChange={n => handleDailyChange(date, seg, 'rn', n)} onBlur={() => saveBudgetDaily(date, seg)} />
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: 'var(--color-text-muted)', borderLeft: '1px solid var(--color-border-subtle)' }}>
                              {budAdr ? budAdr.toLocaleString('ko-KR') : '-'}
                            </td>
                            <td className="px-1 py-1" style={{ borderLeft: '1px solid var(--color-border-subtle)', color: 'var(--color-accent-primary)' }}>
                              <InputCell value={budRev} onChange={n => handleDailyChange(date, seg, 'rev', n)} onBlur={() => saveBudgetDaily(date, seg)} />
                            </td>
                            {/* 전년 */}
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: '#4A9EFF', borderLeft: '1px solid var(--color-border-default)' }}>
                              {actRn ? actRn.toLocaleString('ko-KR') : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: '#4A9EFF', borderLeft: '1px solid var(--color-border-subtle)' }}>
                              {actAdr ? actAdr.toLocaleString('ko-KR') : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: '#4A9EFF', borderLeft: '1px solid var(--color-border-subtle)' }}>
                              {actRev ? actRev.toLocaleString('ko-KR') : '-'}
                            </td>
                            {/* OTB */}
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: '#A78BFA', borderLeft: '1px solid var(--color-border-default)' }}>
                              {otbRn ? otbRn.toLocaleString('ko-KR') : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: '#A78BFA', borderLeft: '1px solid var(--color-border-subtle)' }}>
                              {otbAdr ? otbAdr.toLocaleString('ko-KR') : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: '#A78BFA', borderLeft: '1px solid var(--color-border-subtle)' }}>
                              {otbRev ? otbRev.toLocaleString('ko-KR') : '-'}
                            </td>
                          </React.Fragment>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
