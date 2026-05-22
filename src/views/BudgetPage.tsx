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


type MonthVal        = { rn: number; rev: number }
type BudgetMonthData = Record<string, Record<number, MonthVal>>


// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (!n) return ''
  return n.toLocaleString('ko-KR')
}

function parseNumber(s: string): number {
  return Number(s.replace(/,/g, '')) || 0
}


// ── Input Cell ────────────────────────────────────────────────────────────────

function InputCell({
  value, onChange, onBlur, unit = 1, selectOnFocus = false, decimals = 0, rawEdit = false,
  cellId, onArrowKey,
}: {
  value:          number
  onChange:       (v: number) => void
  onBlur:         () => void
  unit?:          number
  selectOnFocus?: boolean
  decimals?:      number
  rawEdit?:       boolean
  cellId?:        string
  onArrowKey?:    (e: React.KeyboardEvent<HTMLInputElement>) => void
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
      data-cell={cellId}
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
      onKeyDown={e => {
        if (onArrowKey && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
          e.preventDefault()
          onArrowKey(e)
        }
      }}
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

// 메인 테이블 방향키 네비게이션 (cellId: "main|{seg}|{m}|{col}")
function navigateMainCell(seg: string, m: number, col: number, key: string) {
  const MONTH_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  const mIdx = MONTH_ORDER.indexOf(m)

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    let nm = m, nc = col
    if (key === 'ArrowLeft') {
      nc--
      if (nc < 0) { nc = 2; if (mIdx > 0) nm = MONTH_ORDER[mIdx - 1]; else return }
    } else {
      nc++
      if (nc > 2) { nc = 0; if (mIdx < MONTH_ORDER.length - 1) nm = MONTH_ORDER[mIdx + 1]; else return }
    }
    const next = document.querySelector<HTMLInputElement>(`[data-cell="main|${seg}|${nm}|${nc}"]`)
    if (next) { next.focus(); setTimeout(() => next.select(), 0) }
  }

  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const all = Array.from(document.querySelectorAll<HTMLInputElement>('[data-cell^="main|"]'))
    const sameMCol = all.filter(el => el.dataset.cell?.endsWith(`|${m}|${col}`))
    sameMCol.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    const current = document.querySelector<HTMLInputElement>(`[data-cell="main|${seg}|${m}|${col}"]`)
    if (!current) return
    const idx = sameMCol.indexOf(current)
    const next = sameMCol[key === 'ArrowUp' ? idx - 1 : idx + 1]
    if (next) { next.focus(); setTimeout(() => next.select(), 0) }
  }
}

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

  // 월별 전체 합계 — 다른 세그먼트는 allBudgetData, 현재 seg는 항상 draft 사용
  const monthTotals = MONTHS.map(m => {
    const othersRn  = Object.entries(allBudgetData).reduce((s, [sk, mMap]) =>
      s + (sk === seg ? 0 : (mMap[m]?.rn  ?? 0)), 0)
    const othersRev = Object.entries(allBudgetData).reduce((s, [sk, mMap]) =>
      s + (sk === seg ? 0 : (mMap[m]?.rev ?? 0)), 0)
    const rn  = othersRn  + (draft[m]?.rn  ?? 0)
    const rev = othersRev + (draft[m]?.rev ?? 0)
    return { rn, rev, adr: rn > 0 ? Math.round(rev / rn) : 0 }
  })

  const grandRn  = monthTotals.reduce((s, t) => s + t.rn,  0)
  const grandRev = monthTotals.reduce((s, t) => s + t.rev, 0)
  const grandAdr = grandRn  > 0 ? Math.round(grandRev / grandRn) : 0

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

  function navigateCell(e: React.KeyboardEvent<HTMLInputElement>, m: number, col: number) {
    let nm = m, nc = col
    if (e.key === 'ArrowUp')    nm = Math.max(1,  m - 1)
    if (e.key === 'ArrowDown')  nm = Math.min(12, m + 1)
    if (e.key === 'ArrowLeft')  { nc = col - 1; if (nc < 0) { nc = 2; nm = Math.max(1,  m - 1) } }
    if (e.key === 'ArrowRight') { nc = col + 1; if (nc > 2) { nc = 0; nm = Math.min(12, m + 1) } }
    const next = document.querySelector<HTMLInputElement>(`[data-cell="modal-${nm}-${nc}"]`)
    if (next) { next.focus(); setTimeout(() => next.select(), 0) }
  }
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
                  <th key={h} className="px-3 py-1.5 text-center text-[11px] font-medium text-brand-muted whitespace-nowrap"
                    style={{ ...(i === 0 ? BL : BLS), minWidth: 75 }}>{h}</th>
                ))}
                {(['R/N','ADR','REV'] as const).map((h, i) => (
                  <th key={h} className="px-3 py-1.5 text-center text-[11px] font-medium text-brand-muted whitespace-nowrap"
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
                    <td className="px-3 py-1.5 text-xs font-medium text-center" style={{ color: 'var(--color-text-primary)' }}>{m}월</td>
                    <td className="px-3 py-1.5 text-xs text-right" style={{ ...BL, color: '#4A9EFF' }}>{occ}</td>
                    <td className="px-3 py-1.5 text-xs text-right" style={{ ...BLS, color: '#4A9EFF' }}>{gt.rn ? gt.rn.toLocaleString('ko-KR') : '-'}</td>
                    <td className="px-3 py-1.5 text-xs text-right" style={{ ...BLS, color: '#4A9EFF' }}>{gt.adr > 0 ? Math.round(gt.adr / 1000).toLocaleString('ko-KR') : '-'}</td>
                    <td className="px-3 py-1.5 text-xs text-right" style={{ ...BLS, color: '#4A9EFF' }}>{gt.rev > 0 ? (gt.rev / 1_000_000).toFixed(1) : '-'}</td>
                    {/* 세그먼트 R/N */}
                    <td className="px-2 py-1" style={BL}>
                      <div className="flex items-center justify-end gap-1">
                        <InputCell value={dRn} onChange={v => handleChange(m, 'rn', v)} onBlur={() => {}} selectOnFocus
                          cellId={`modal-${m}-0`} onArrowKey={e => navigateCell(e, m, 0)} />
                        {pct(dRn, gt.rn) && <span className="text-[10px] text-brand-muted shrink-0">{pct(dRn, gt.rn)}</span>}
                      </div>
                    </td>
                    {/* 세그먼트 ADR */}
                    <td className="px-2 py-1" style={BLS}>
                      <InputCell value={dAdr} onChange={v => handleChange(m, 'adr', v)} onBlur={() => {}} unit={1000} rawEdit selectOnFocus
                        cellId={`modal-${m}-1`} onArrowKey={e => navigateCell(e, m, 1)} />
                    </td>
                    {/* 세그먼트 REV */}
                    <td className="px-2 py-1" style={BLS}>
                      <div className="flex items-center justify-end gap-1">
                        <InputCell value={dRev} onChange={v => handleChange(m, 'rev', v)} onBlur={() => {}} unit={1_000_000} decimals={1} rawEdit selectOnFocus
                          cellId={`modal-${m}-2`} onArrowKey={e => navigateCell(e, m, 2)} />
                        {pct(dRev, gt.rev) && <span className="text-[10px] text-brand-muted shrink-0">{pct(dRev, gt.rev)}</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--color-bg-tertiary)' }}>
              <tr style={{ borderTop: '2px solid var(--color-border-default)' }}>
                <td className="px-3 py-2 text-xs font-semibold text-center" style={{ color: 'var(--color-accent-primary)' }}>합계</td>
                <td className="px-3 py-2 text-xs text-right font-semibold" style={{ ...BL, color: '#4A9EFF' }}>
                  {roomCount > 0 ? (grandRn / (roomCount * 365) * 100).toFixed(1) + '%' : '-'}
                </td>
                <td className="px-3 py-2 text-xs text-right font-semibold" style={{ ...BLS, color: '#4A9EFF' }}>{grandRn ? grandRn.toLocaleString('ko-KR') : '-'}</td>
                <td className="px-3 py-2 text-xs text-right font-semibold" style={{ ...BLS, color: '#4A9EFF' }}>{grandAdr > 0 ? Math.round(grandAdr / 1000).toLocaleString('ko-KR') : '-'}</td>
                <td className="px-3 py-2 text-xs text-right font-semibold" style={{ ...BLS, color: '#4A9EFF' }}>{grandRev > 0 ? (grandRev / 1_000_000).toFixed(1) : '-'}</td>
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
  const [budgetData,      setBudgetData]      = useState<BudgetMonthData>({})
  const [saving,          setSaving]          = useState(false)
  const [saveError,       setSaveError]       = useState<string | null>(null)
  const [uploadConfirm,   setUploadConfirm]   = useState(false)
  const [deleteConfirm,   setDeleteConfirm]   = useState(false)
  const [saveModalOpen,   setSaveModalOpen]   = useState(false)
  const [saveTarget,      setSaveTarget]      = useState<'mtd' | 'daily' | 'both'>('mtd')
  const [saveConfirmed,   setSaveConfirmed]   = useState(false)
  const [loadModalOpen,   setLoadModalOpen]   = useState(false)
  const [loadSource,      setLoadSource]      = useState<'mtd' | 'daily'>('mtd')
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadSource,    setUploadSource]    = useState<'mtd' | 'daily'>('mtd')
  const [selectedFile,    setSelectedFile]    = useState<File | null>(null)
  const [loadDate,        setLoadDate]        = useState('')
  const [loadConfirmed,   setLoadConfirmed]   = useState(false)
  const [availableDates,  setAvailableDates]  = useState<string[]>([])
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

  useEffect(() => {
    if (!loadModalOpen || !hotelId) return

    const fetchDates = async () => {
      try {
        let query
        if (loadSource === 'mtd') {
          query = (supabase as any)
            .from('a04_budget_mtd')
            .select('update_date')
            .eq('hotel_id', hotelId)
            .eq('year', selectedYear)
        } else {
          query = (supabase as any)
            .from('a03_budget')
            .select('update_date')
            .eq('hotel_id', hotelId)
            .gte('business_date', `${selectedYear}-01-01`)
            .lte('business_date', `${selectedYear}-12-31`)
        }

        const { data, error } = await query
        if (error) throw error

        const uniqueDates = Array.from(new Set(
          (data ?? []).map((r: any) => r.update_date as string)
        )).sort().reverse() as string[]

        setAvailableDates(uniqueDates)

        if (uniqueDates.length > 0 && !uniqueDates.includes(loadDate)) {
          setLoadDate(uniqueDates[0])
        }
      } catch (err: any) {
        console.error('update_date 조회 오류:', err.message)
        setAvailableDates([])
      }
    }

    fetchDates()
  }, [loadModalOpen, loadSource, hotelId, selectedYear])

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i)


  const [roomCount, setRoomCount] = useState<number>(0)
  const monthlyLoading: boolean = false


  // ── 4. 월별 저장 — DB 저장 비활성화 (저장 버튼 클릭 시에만 저장됨) ──────────
  const saveBudgetMonthly = useCallback(async (_segmentation: string, _month: number) => {
    // budgetData state는 handleBudgetChange에서 이미 반영됨
  }, [])


  // ── 6. 전체 저장 (upsert_budget_mtd) ────────────────────────────────────────
  const saveAll = async () => {
    if (!hotelId || !profile?.id) return
    setSaving(true)
    setSaveError(null)
    try {
      const rows: any[] = []
      Object.entries(budgetData).forEach(([seg, months]) => {
        Object.entries(months).forEach(([mStr, val]) => {
          rows.push({
            year:  selectedYear,
            month: Number(mStr),
            seg:   seg,
            rn:    val.rn,
            rev:   val.rev,
          })
        })
      })

      if (rows.length > 0) {
        const { error } = await (supabase as any)
          .rpc('upsert_budget_mtd', {
            p_hotel_id:    hotelId,
            p_profile_id:  profile.id,
            p_update_date: otbDate || new Date().toISOString().split('T')[0],
            p_rows:        rows,
            p_confirmed:   false,
          })
        if (error) throw error
        queryClient.invalidateQueries({ queryKey: ['budget_mtd', hotelId, selectedYear] })
      }
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── 저장 모달 실행 ─────────────────────────────────────────────────────────────
  const handleSaveSubmit = async () => {
    if (!hotelId || !profile?.id) return
    setSaving(true)
    setSaveError(null)

    const updateDate = otbDate || new Date().toISOString().split('T')[0]
    let mtdMsg   = ''
    let dailyMsg = ''

    try {
      if (saveTarget === 'mtd' || saveTarget === 'both') {
        const mtdRows: any[] = []
        Object.entries(budgetData).forEach(([seg, months]) => {
          Object.entries(months).forEach(([mStr, val]) => {
            if (val.rn > 0 || val.rev > 0) {
              mtdRows.push({ year: selectedYear, month: Number(mStr), seg, rn: val.rn, rev: val.rev })
            }
          })
        })
        if (mtdRows.length > 0) {
          const { data, error } = await (supabase as any)
            .rpc('upsert_budget_mtd', {
              p_hotel_id:    hotelId,
              p_profile_id:  profile.id,
              p_update_date: updateDate,
              p_rows:        mtdRows,
              p_confirmed:   saveConfirmed,
            })
          if (error) throw error
          mtdMsg = `MTD: ${data?.rows_affected ?? 0}행`
          queryClient.invalidateQueries({ queryKey: ['budget_mtd', hotelId, selectedYear] })
        }
      }

      if (saveTarget === 'daily' || saveTarget === 'both') {
        const monthlyBudget: any[] = []
        Object.entries(budgetData).forEach(([seg, months]) => {
          Object.entries(months).forEach(([mStr, val]) => {
            if (val.rn > 0 || val.rev > 0) {
              monthlyBudget.push({ seg, month: Number(mStr), rn: val.rn, rev: val.rev })
            }
          })
        })
        if (monthlyBudget.length > 0) {
          const { data, error } = await (supabase as any)
            .rpc('distribute_budget', {
              p_hotel_id:       hotelId,
              p_year:           selectedYear,
              p_profile_id:     profile.id,
              p_update_date:    updateDate,
              p_monthly_budget: monthlyBudget,
              p_confirmed:      saveConfirmed,
            })
          if (error) throw error
          dailyMsg = `DAILY: ${data?.rows_inserted ?? 0}행`
          queryClient.invalidateQueries({ queryKey: ['budget_daily', hotelId, selectedYear] })
        }
      }

      const msgParts = [mtdMsg, dailyMsg].filter(Boolean)
      alert(`저장 완료\n${msgParts.join('\n')}`)
      setSaveModalOpen(false)
    } catch (err: any) {
      setSaveError(err.message)
      alert('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── 불러오기 실행 ──────────────────────────────────────────────────────────────
  const handleLoadSubmit = async () => {
    if (!hotelId || !loadDate) {
      alert('Budget Date를 선택해주세요.')
      return
    }

    try {
      const newBudgetData: BudgetMonthData = {}

      if (loadSource === 'mtd') {
        const { data, error } = await (supabase as any)
          .from('a04_budget_mtd')
          .select('year, month, segmentation, budget_nights, budget_revenue')
          .eq('hotel_id',    hotelId)
          .eq('year',        selectedYear)
          .eq('update_date', loadDate)
          .eq('confirmed',   loadConfirmed)

        if (error) throw error

        if (!data || data.length === 0) {
          alert(`선택한 조건의 ${loadConfirmed ? '확정' : '미확정'} MTD 데이터가 없습니다.`)
          return
        }

        ;(data ?? []).forEach((r: any) => {
          if (!newBudgetData[r.segmentation]) newBudgetData[r.segmentation] = {}
          newBudgetData[r.segmentation][r.month] = {
            rn:  r.budget_nights  ?? 0,
            rev: r.budget_revenue ?? 0,
          }
        })
      } else {
        const { data, error } = await (supabase as any)
          .from('a03_budget')
          .select('business_date, segmentation, budget_nights, budget_revenue')
          .eq('hotel_id',    hotelId)
          .eq('update_date', loadDate)
          .eq('confirmed',   loadConfirmed)
          .gte('business_date', `${selectedYear}-01-01`)
          .lte('business_date', `${selectedYear}-12-31`)

        if (error) throw error

        if (!data || data.length === 0) {
          alert(`선택한 조건의 ${loadConfirmed ? '확정' : '미확정'} DAILY 데이터가 없습니다.`)
          return
        }

        ;(data ?? []).forEach((r: any) => {
          const month = new Date(r.business_date).getMonth() + 1
          const seg   = r.segmentation
          if (!newBudgetData[seg]) newBudgetData[seg] = {}
          if (!newBudgetData[seg][month]) newBudgetData[seg][month] = { rn: 0, rev: 0 }
          newBudgetData[seg][month].rn  += r.budget_nights  ?? 0
          newBudgetData[seg][month].rev += r.budget_revenue ?? 0
        })
      }

      setBudgetData(newBudgetData)
      setLoadModalOpen(false)

      const segCount    = Object.keys(newBudgetData).length
      const recordCount = Object.values(newBudgetData).reduce((s, m) => s + Object.keys(m).length, 0)
      alert(`불러오기 완료\n세그먼트: ${segCount}개 / 월별 레코드: ${recordCount}건`)
    } catch (err: any) {
      console.error('불러오기 오류:', err.message)
      alert('불러오기 실패: ' + err.message)
    }
  }

  // ── 불러오기 다운로드 (표에 반영 안 함) ────────────────────────────────────────
  const handleLoadDownload = async () => {
    if (!hotelId || !loadDate) {
      alert('Budget Date를 선택해주세요.')
      return
    }
    try {
      const wb = XLSX.utils.book_new()

      if (loadSource === 'mtd') {
        const { data, error } = await (supabase as any)
          .from('a04_budget_mtd')
          .select('year, month, segmentation, budget_nights, budget_revenue')
          .eq('hotel_id',    hotelId)
          .eq('year',        selectedYear)
          .eq('update_date', loadDate)
          .eq('confirmed',   loadConfirmed)
          .order('month')
          .order('segmentation')

        if (error) throw error
        if (!data || data.length === 0) {
          alert(`선택한 조건의 ${loadConfirmed ? '확정' : '미확정'} MTD 데이터가 없습니다.`)
          return
        }

        const wsData = [
          ['year', 'month', 'segmentation', 'R/N', 'ADR(천)', 'REV(백만)'],
          ...(data as any[]).map((r: any) => {
            const rn  = r.budget_nights  ?? 0
            const rev = r.budget_revenue ?? 0
            const adr = rn > 0 ? Math.round(rev / rn) : 0
            return [r.year, r.month, r.segmentation, rn, adr, +(rev / 1_000_000).toFixed(1)]
          }),
        ]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        XLSX.utils.book_append_sheet(wb, ws, 'MTD')
        XLSX.writeFile(wb, `Budget_MTD_${selectedYear}_${loadDate}.xlsx`)

      } else {
        const { data: calData } = await (supabase as any)
          .from('c06_calendar')
          .select('business_date, rev_dow, event, is_holiday')
          .eq('hotel_id', hotelId)
          .gte('business_date', `${selectedYear}-01-01`)
          .lte('business_date', `${selectedYear}-12-31`)

        const calMap: Record<string, any> = {}
        ;(calData ?? []).forEach((c: any) => { calMap[c.business_date] = c })

        const { data, error } = await (supabase as any)
          .from('a03_budget')
          .select('business_date, segmentation, budget_nights, budget_revenue')
          .eq('hotel_id',    hotelId)
          .eq('update_date', loadDate)
          .eq('confirmed',   loadConfirmed)
          .gte('business_date', `${selectedYear}-01-01`)
          .lte('business_date', `${selectedYear}-12-31`)
          .order('business_date')
          .order('segmentation')

        if (error) throw error
        if (!data || data.length === 0) {
          alert(`선택한 조건의 ${loadConfirmed ? '확정' : '미확정'} DAILY 데이터가 없습니다.`)
          return
        }

        const dowLabels = ['일', '월', '화', '수', '목', '금', '토']
        const wsData = [
          ['business_date', 'day', 'rev_dow', 'event', 'is_holiday', 'segmentation', 'R/N', 'ADR(천)', 'REV(백만)'],
          ...(data as any[]).map((r: any) => {
            const cal = calMap[r.business_date] ?? {}
            const d   = new Date(r.business_date)
            const rn  = r.budget_nights  ?? 0
            const rev = r.budget_revenue ?? 0
            const adr = rn > 0 ? Math.round(rev / rn) : 0
            return [
              r.business_date,
              dowLabels[d.getDay()],
              cal.rev_dow    ?? '',
              cal.event      ?? '',
              cal.is_holiday ? 'Y' : '',
              r.segmentation,
              rn,
              adr,
              +(rev / 1_000_000).toFixed(1),
            ]
          }),
        ]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        XLSX.utils.book_append_sheet(wb, ws, 'Daily')
        XLSX.writeFile(wb, `Budget_Daily_${selectedYear}_${loadDate}.xlsx`)
      }
    } catch (err: any) {
      alert('다운로드 실패: ' + err.message)
    }
  }

  // ── 7. 모달 적용 — state 반영만 (DB 저장은 저장 버튼으로) ───────────────────
  const applyModalEdit = useCallback((seg: string, draft: Record<number, MonthVal>) => {
    setBudgetData(prev => ({ ...prev, [seg]: draft }))
    setModalSeg(null)
  }, [])

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

  // ── 일별 엑셀 다운로드 (단일 시트 raw data) ──────────────────────────────────
  const handleDownloadDaily = async () => {
    if (!hotelId) return

    const { data: budgetRows, error: bErr } = await (supabase as any)
      .from('a03_budget')
      .select('business_date, segmentation, budget_nights, budget_revenue')
      .eq('hotel_id', hotelId)
      .gte('business_date', `${selectedYear}-01-01`)
      .lte('business_date', `${selectedYear}-12-31`)
      .order('business_date')
      .order('segmentation')

    if (bErr) { alert('데이터 조회 실패: ' + bErr.message); return }

    if (!budgetRows || budgetRows.length === 0) {
      alert('다운로드할 데이터가 없습니다.')
      return
    }

    const { data: calRows, error: cErr } = await (supabase as any)
      .from('c06_calendar')
      .select('date, day, rev_dow, event, is_holiday')
      .gte('date', `${selectedYear}-01-01`)
      .lte('date', `${selectedYear}-12-31`)

    if (cErr) { alert('캘린더 조회 실패: ' + cErr.message); return }

    const calMap: Record<string, any> = {}
    ;(calRows ?? []).forEach((r: any) => { calMap[r.date] = r })

    const headers = ['business_date', 'day', 'rev_dow', 'event', 'is_holiday', 'segmentation', 'R/N', 'ADR', 'REV']
    const sheetData: any[][] = [headers]

    ;(budgetRows ?? []).forEach((r: any) => {
      const cal = calMap[r.business_date] ?? {}
      const rn  = r.budget_nights  ?? 0
      const rev = r.budget_revenue ?? 0
      const adr = rn > 0 ? Math.round(rev / rn) : 0
      sheetData.push([
        r.business_date,
        cal.day      ?? '',
        cal.rev_dow  ?? '',
        cal.event    ?? '',
        cal.is_holiday ?? false,
        r.segmentation,
        rn, adr, rev,
      ])
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws['!cols'] = [
      { wch: 12 }, { wch: 6 }, { wch: 8 }, { wch: 14 }, { wch: 10 },
      { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 12 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Budget_Daily')
    XLSX.writeFile(wb, `Budget_일별_${selectedYear}.xlsx`)
  }


  // ── DAILY 빈 양식 다운로드 ─────────────────────────────────────────────────────
  const handleDownloadDailyTemplate = async () => {
    if (!hotelId) return

    const { data: schemaRows } = await (supabase as any)
      .from('c05_market_table_schema')
      .select('level, segmentation')
      .eq('hotel_id', hotelId)
      .eq('is_active', true)

    const allSegs: string[] = []
    ;(schemaRows ?? []).forEach((s: any) => {
      if ((s.level === 'sub' || s.level === 'mid') && Array.isArray(s.segmentation)) {
        s.segmentation.forEach((code: string) => {
          if (!allSegs.includes(code)) allSegs.push(code)
        })
      }
    })
    allSegs.sort()

    if (allSegs.length === 0) {
      alert('세그먼트 정보가 없습니다. 시장 분할 설정을 먼저 해주세요.')
      return
    }

    const { data: calRows, error: cErr } = await (supabase as any)
      .from('c06_calendar')
      .select('date, day, rev_dow, event, is_holiday')
      .gte('date', `${selectedYear}-01-01`)
      .lte('date', `${selectedYear}-12-31`)
      .order('date')

    if (cErr) { alert('캘린더 조회 실패: ' + cErr.message); return }

    if (!calRows || calRows.length === 0) {
      alert(`${selectedYear}년 캘린더 데이터가 없습니다.`)
      return
    }

    const headers = ['business_date', 'day', 'rev_dow', 'event', 'is_holiday', 'segmentation', 'R/N', 'ADR', 'REV']
    const sheetData: any[][] = [headers]

    calRows.forEach((cal: any) => {
      allSegs.forEach(seg => {
        sheetData.push([
          cal.date,
          cal.day        ?? '',
          cal.rev_dow    ?? '',
          cal.event      ?? '',
          cal.is_holiday ?? false,
          seg,
          '', '', '',
        ])
      })
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws['!cols'] = [
      { wch: 12 }, { wch: 6 }, { wch: 8 }, { wch: 14 }, { wch: 10 },
      { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 12 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Budget_Daily_Template')
    XLSX.writeFile(wb, `Budget_DAILY_양식_${selectedYear}.xlsx`)
  }

  // ── Step2. 엑셀 업로드 → upsert_budget_mtd ───────────────────────────────────
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

    // 엑셀 파싱
    const parsed: Record<string, Record<number, MonthVal>> = {}
    for (let i = 2; i < rows.length; i++) {
      const row   = rows[i]
      const label = String(row[0] ?? '').trim()
      if (!label) continue

      const codes   = labelToCodesMap[label] ?? [label]
      const perCode = codes.length

      for (let m = 1; m <= 12; m++) {
        const base     = 2 + (m - 1) * 3
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

    // a04_budget_mtd 저장용 rows 구성
    const mtdRows: any[] = []
    Object.entries(parsed).forEach(([seg, months]) => {
      Object.entries(months).forEach(([mStr, vals]: any) => {
        if (vals.rn > 0 || vals.rev > 0) {
          mtdRows.push({
            year:  selectedYear,
            month: Number(mStr),
            seg,
            rn:    vals.rn,
            rev:   vals.rev,
          })
        }
      })
    })

    if (mtdRows.length === 0) {
      alert('업로드할 데이터가 없습니다.')
      return
    }

    // 화면(budgetData)에 반영
    const newBudgetData: BudgetMonthData = {}
    Object.entries(parsed).forEach(([seg, months]) => {
      newBudgetData[seg] = {}
      Object.entries(months).forEach(([mStr, vals]: any) => {
        newBudgetData[seg][Number(mStr)] = { rn: vals.rn, rev: vals.rev }
      })
    })
    setBudgetData(newBudgetData)


  }

  // ── Step3. 전년 비율 배분 계산 (미사용) ──────────────────────────────────────
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
              cellId={`main|${seg}|${m}|0`}
              onArrowKey={e => navigateMainCell(seg, m, 0, e.key)}
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
              cellId={`main|${seg}|${m}|1`}
              onArrowKey={e => navigateMainCell(seg, m, 1, e.key)}
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
              cellId={`main|${seg}|${m}|2`}
              onArrowKey={e => navigateMainCell(seg, m, 2, e.key)}
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


      {/* ── 데이터 삭제 확인 모달 ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirm(false)} />
          <div className="relative rounded-2xl p-6 w-full max-w-sm space-y-4"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>데이터 삭제</p>
            <p className="text-sm text-brand-muted">
              {selectedYear}년 예산 데이터를 삭제하시겠습니까?<br />
              <span style={{ color: '#FC8181' }}>표의 모든 숫자가 초기화됩니다.</span>
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-2 rounded-lg text-sm hover:opacity-80 transition-all"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                취소
              </button>
              <button
                onClick={() => { setBudgetData({}); setDeleteConfirm(false) }}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px"
                style={{ background: 'rgba(252,129,129,0.15)', color: '#FC8181', border: '1px solid rgba(252,129,129,0.3)' }}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 불러오기 모달 ── */}
      {loadModalOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setLoadModalOpen(false)} />
          <div className="relative rounded-2xl p-6 w-full max-w-md space-y-5"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>데이터 불러오기</p>
              <button onClick={() => setLoadModalOpen(false)}
                className="text-brand-muted hover:opacity-60 transition-opacity text-lg leading-none">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-brand-muted mb-2">데이터 소스</p>
                <div className="flex gap-1 p-1 rounded-xl w-full"
                  style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border-default)' }}>
                  {(['mtd', 'daily'] as const).map(opt => (
                    <button key={opt} onClick={() => setLoadSource(opt)}
                      className="flex-1 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        background: loadSource === opt ? 'var(--gradient-cta)' : 'transparent',
                        color:      loadSource === opt ? '#0A0A0A' : 'var(--color-text-muted)',
                      }}>
                      {opt === 'mtd' ? 'MTD' : 'DAILY'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-brand-muted mb-2">Budget Date</p>
                <select
                  value={loadDate}
                  onChange={e => setLoadDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-sm focus:outline-none"
                  style={{
                    background: 'var(--color-bg-primary)',
                    border:     '1px solid var(--color-border-default)',
                    color:      'var(--color-text-primary)',
                  }}
                >
                  {availableDates.length === 0 && (
                    <option value="">저장된 데이터가 없습니다</option>
                  )}
                  {availableDates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-xs text-brand-muted mb-2">확정 여부</p>
                <div className="flex gap-1 p-1 rounded-xl w-full"
                  style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border-default)' }}>
                  <button onClick={() => setLoadConfirmed(false)}
                    className="flex-1 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: !loadConfirmed ? 'var(--gradient-cta)' : 'transparent',
                      color:      !loadConfirmed ? '#0A0A0A' : 'var(--color-text-muted)',
                    }}>
                    미확정
                  </button>
                  <button onClick={() => setLoadConfirmed(true)}
                    className="flex-1 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: loadConfirmed ? 'var(--gradient-cta)' : 'transparent',
                      color:      loadConfirmed ? '#0A0A0A' : 'var(--color-text-muted)',
                    }}>
                    확정
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setLoadModalOpen(false)}
                className="flex-1 py-2 rounded-lg text-sm hover:opacity-80 transition-all"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                취소
              </button>
              <button
                onClick={handleLoadDownload}
                disabled={!loadDate}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-40"
                style={{ border: '1px solid var(--color-accent-primary)', color: 'var(--color-accent-primary)' }}>
                다운로드
              </button>
              <button
                onClick={handleLoadSubmit}
                disabled={!loadDate}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-40"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
                불러오기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 저장 옵션 모달 ── */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSaveModalOpen(false)} />
          <div className="relative rounded-2xl p-6 w-full max-w-md space-y-5"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>저장 옵션 선택</p>
              <button onClick={() => setSaveModalOpen(false)}
                className="text-brand-muted hover:opacity-60 transition-opacity text-lg leading-none">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-brand-muted mb-2">저장 위치</p>
                <div className="flex gap-1 p-1 rounded-xl w-full"
                  style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border-default)' }}>
                  {(['mtd', 'daily', 'both'] as const).map(opt => (
                    <button key={opt} onClick={() => setSaveTarget(opt)}
                      className="flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        background: saveTarget === opt ? 'var(--gradient-cta)' : 'transparent',
                        color:      saveTarget === opt ? '#0A0A0A' : 'var(--color-text-muted)',
                      }}>
                      {opt === 'mtd'   && 'MTD만'}
                      {opt === 'daily' && 'DAILY만'}
                      {opt === 'both'  && '둘 다'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-brand-muted mb-2">확정 여부</p>
                <div className="flex gap-1 p-1 rounded-xl w-full"
                  style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border-default)' }}>
                  <button onClick={() => setSaveConfirmed(false)}
                    className="flex-1 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: !saveConfirmed ? 'var(--gradient-cta)' : 'transparent',
                      color:      !saveConfirmed ? '#0A0A0A' : 'var(--color-text-muted)',
                    }}>
                    미확정
                  </button>
                  <button onClick={() => setSaveConfirmed(true)}
                    className="flex-1 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: saveConfirmed ? 'var(--gradient-cta)' : 'transparent',
                      color:      saveConfirmed ? '#0A0A0A' : 'var(--color-text-muted)',
                    }}>
                    확정
                  </button>
                </div>
              </div>

              <div className="text-xs text-brand-muted pt-2"
                style={{ borderTop: '1px solid var(--color-border-default)' }}>
                저장 날짜: {otbDate || new Date().toISOString().split('T')[0]}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setSaveModalOpen(false)}
                className="flex-1 py-2 rounded-lg text-sm hover:opacity-80 transition-all"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                취소
              </button>
              <button
                onClick={handleSaveSubmit}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-50"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 엑셀 업로드 안내 모달 ── */}
      {uploadConfirm && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setUploadConfirm(false)} />
          <div className="relative rounded-2xl p-6 w-full max-w-sm space-y-4"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={16} style={{ color: 'var(--color-accent-primary)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>엑셀 업로드</p>
            </div>
            <p className="text-sm text-brand-muted leading-relaxed">
              DB에 저장되지 않고 표에 적용됩니다.<br />
              저장을 원하실 경우 <span className="font-semibold" style={{ color: 'var(--color-accent-primary)' }}>저장</span> 버튼을 클릭하세요.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setUploadConfirm(false)}
                className="flex-1 py-2 rounded-lg text-sm hover:opacity-80 transition-all"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                취소
              </button>
              <button
                onClick={() => { setUploadConfirm(false); fileInputRef.current?.click() }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
                <Upload size={13} />
                파일 선택
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 업로드 모달 ── */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setUploadModalOpen(false); setSelectedFile(null) }} />
          <div className="relative rounded-2xl p-6 w-full max-w-md space-y-5"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>파일 업로드</p>
              <button onClick={() => { setUploadModalOpen(false); setSelectedFile(null) }}
                className="text-brand-muted hover:opacity-60 transition-opacity text-lg leading-none">✕</button>
            </div>

            <div className="space-y-4">
              {/* 데이터 소스 */}
              <div>
                <p className="text-xs text-brand-muted mb-2">데이터 소스</p>
                <div className="flex gap-1 p-1 rounded-xl w-full"
                  style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border-default)' }}>
                  {(['mtd', 'daily'] as const).map(opt => (
                    <button key={opt} onClick={() => setUploadSource(opt)}
                      className="flex-1 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        background: uploadSource === opt ? 'var(--gradient-cta)' : 'transparent',
                        color:      uploadSource === opt ? '#0A0A0A' : 'var(--color-text-muted)',
                      }}>
                      {opt === 'mtd' ? 'MTD' : 'DAILY'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 양식 다운로드 */}
              <div>
                <p className="text-xs text-brand-muted mb-2">처음이라면 양식을 받으세요</p>
                <button
                  onClick={() => uploadSource === 'mtd' ? handleDownloadTemplate() : handleDownloadDailyTemplate()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-80 w-full justify-center"
                  style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                  <Download size={13} />
                  {uploadSource === 'mtd' ? 'MTD' : 'DAILY'} 양식 다운로드
                </button>
              </div>

              {/* 파일 선택 */}
              <div>
                <p className="text-xs text-brand-muted mb-2">파일 선택</p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                  style={{ color: 'var(--color-text-secondary)' }}
                />
                {selectedFile && (
                  <p className="text-xs mt-2" style={{ color: 'var(--color-accent-primary)' }}>
                    ✓ {selectedFile.name}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setUploadModalOpen(false); setSelectedFile(null) }}
                className="flex-1 py-2 rounded-lg text-sm hover:opacity-80 transition-all"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                취소
              </button>
              <button
                onClick={() => {
                  console.log('Upload:', { uploadSource, selectedFile })
                  alert('업로드 로직은 다음 단계에서 구현됩니다.')
                }}
                disabled={!selectedFile}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-50"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
                업로드
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
          <button
            onClick={() => setLoadModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-80"
            style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
          >
            <Download size={13} />
            불러오기
          </button>
          <button
            onClick={() => setUploadModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-80"
            style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
          >
            <Upload size={13} />
            업로드
          </button>
          <button
            onClick={() => setSaveModalOpen(true)}
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
            <button
              onClick={() => setDeleteConfirm(true)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(252,129,129,0.12)', color: '#FC8181', border: 'none', cursor: 'pointer' }}
            >
              삭제
            </button>
        </div>

        <input
          type="file"
          accept=".xlsx,.xls"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleUploadBudget}
        />
      </div>

      <div className="space-y-4">
        <MarketTable
          hotelId={hotelId}
          year={selectedYear}
          month={new Date().getMonth() + 1}
          columns={monthlyColumns}
          data={monthlyTableData}
          loading={monthlyLoading}
          stickyFirstGroup
          opaqueBg
          maxHeight="calc(100vh - 270px)"
        />
      </div>
    </div>
    </>
  )
}
