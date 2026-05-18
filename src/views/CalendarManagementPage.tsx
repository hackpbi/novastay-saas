'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Lock, CalendarDays, List, Search,
  Pencil, Upload, Download, Loader2, X, Save,
  ChevronLeft, ChevronRight, FileSpreadsheet,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'

// ── Types ─────────────────────────────────────────────────────────────────────

type CalendarRow = {
  date:         string
  year:         number | null
  day:          string | null
  rev_dow:      string | null
  yoy_match:    string | null
  event:        string | null
  similar_year: number | null
  is_holiday:   boolean | null
  created_at:   string | null
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)}
      className="relative rounded-full cursor-pointer shrink-0"
      style={{ width: 40, height: 20, background: value ? 'var(--color-accent-primary)' : 'var(--color-border-default)', transition: 'background 0.2s' }}>
      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
        style={{ transform: value ? 'translateX(22px)' : 'translateX(2px)' }} />
    </div>
  )
}

type ViewMode = 'list' | 'calendar'

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS_HEADER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const YEARS  = Array.from({ length: 11 }, (_, i) => 2020 + i)
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

// ── Theme-adaptive color helpers ──────────────────────────────────────────────

// 공휴일/주말 모두 --color-negative(빨간색) 계열로 통일
const holidayBadge = (isDark: boolean) => isDark
  ? { background: 'rgba(255,77,77,0.10)', color: 'var(--color-negative)', border: '1px solid rgba(255,77,77,0.22)' }
  : { background: 'rgba(214,56,56,0.10)', color: 'var(--color-negative)', border: '1px solid rgba(214,56,56,0.22)' }

const holidayRowBg = (isDark: boolean) =>
  isDark ? 'rgba(255,77,77,0.05)' : 'rgba(214,56,56,0.05)'

const WEEKEND_COLOR = 'var(--color-negative)'

// ── Style helpers ─────────────────────────────────────────────────────────────

// 가이드: input background → --color-bg-elevated (#FFFFFF 라이트 / #1E1E1E 다크)
const inputCls   = 'w-full rounded-md text-sm px-3.5 py-2.5 focus:outline-none transition-all'
const inputStyle = {
  color:      'var(--color-text-primary)',
  background: 'var(--color-bg-elevated)',
  border:     '1px solid var(--color-border-default)',
}

const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.border    = '1px solid var(--color-accent-primary)'
  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
}
const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.border    = '1px solid var(--color-border-default)'
  e.currentTarget.style.boxShadow = 'none'
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({ row, searchParams, onClose }: {
  row:          CalendarRow
  searchParams: { year: number; month: number | null } | null
  onClose:      () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    yoy_match:    row.yoy_match    ?? '',
    event:        (row.event && row.event.toLowerCase() !== 'null') ? row.event : '',
    similar_year: row.similar_year != null ? String(row.similar_year) : '',
    is_holiday:   row.is_holiday   ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const setF = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  // 전년동기 날짜로부터 요일 계산
  const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']
  const yoyDay = form.yoy_match
    ? (() => { const d = new Date(form.yoy_match); return isNaN(d.getTime()) ? null : WEEKDAY_KO[d.getDay()] })()
    : null

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      const payload: Partial<CalendarRow> = {
        date:         row.date,
        yoy_match:    form.yoy_match    || null,
        event:        form.event        || null,
        similar_year: form.similar_year ? Number(form.similar_year) : null,
        is_holiday:   form.is_holiday,
      }
      const { error: e } = await (supabase as any)
        .from('c06_calendar')
        .upsert(payload, { onConflict: 'date' })
      if (e) throw e
      queryClient.invalidateQueries({ queryKey: ['c06_calendar', searchParams] })
      onClose()
    } catch (e: any) {
      setError(e.message ?? '오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-bg-secondary overflow-hidden max-h-[90vh] flex flex-col"
        style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>

        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            캘린더 수정
          </p>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg text-xs text-status-negative"
              style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
              {error}
            </div>
          )}

          {/* 올해날짜 (읽기 전용) */}
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1.5">올해날짜</label>
            <div className="flex items-center gap-2">
              <div className={`${inputCls} flex-1`}
                style={{ ...inputStyle, color: 'var(--color-text-secondary)', cursor: 'default' }}>
                {row.date}
              </div>
              {row.day && (
                <span className="text-xs font-medium px-2.5 py-2 rounded-md shrink-0"
                  style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }}>
                  {row.day}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1.5">전년동기날짜</label>
            <div className="flex items-center gap-2">
              <input type="date" value={form.yoy_match} onChange={e => setF('yoy_match', e.target.value)}
                className={`${inputCls} flex-1`} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              {yoyDay && (
                <span className="text-xs font-medium px-2.5 py-2 rounded-md shrink-0"
                  style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }}>
                  {yoyDay}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1.5">이벤트</label>
            <input value={form.event} onChange={e => setF('event', e.target.value)}
              placeholder="행사명" className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          </div>

          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1.5">비교 연도</label>
            <input type="number" value={form.similar_year} onChange={e => setF('similar_year', e.target.value)}
              placeholder="2023" className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          </div>

          <div className="flex items-center justify-between py-1">
            <label className="text-xs font-medium text-brand-muted">주말, 연휴, 징검다리</label>
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: form.is_holiday ? 'var(--color-negative)' : 'var(--color-text-secondary)' }}>
                {form.is_holiday ? '주연징' : '일반일'}
              </span>
              <Toggle value={form.is_holiday} onChange={v => setForm(prev => ({ ...prev, is_holiday: v }))} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-brand-muted hover:text-brand-text transition-colors"
            style={{ border: '1px solid var(--color-border-default)' }}>취소</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 transition-all"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}저장
          </button>
        </div>
      </div>
    </div>
  )
}

// ── List View ─────────────────────────────────────────────────────────────────

function ListView({ data, searchParams, pendingHoliday, onToggleHoliday }: {
  data:             CalendarRow[]
  searchParams:     { year: number; month: number | null } | null
  pendingHoliday:   Record<string, boolean>
  onToggleHoliday:  (date: string, currentValue: boolean) => void
}) {
  const { theme } = useTheme()
  const isDark    = theme === 'dark'
  const [editRow, setEditRow] = useState<CalendarRow | null>(null)

  return (
    <>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border-default)' }}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
              {['올해날짜', '올해요일', '전년동기_날짜', '전년동기_요일', '이벤트', '비교연도', '주말, 연휴, 징검다리'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-brand-muted whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const isWeekend   = row.day === '금' || row.day === '토'
              // 미저장 변경이 있으면 그 값을, 없으면 DB 값 사용
              const holidayVal  = pendingHoliday[row.date] !== undefined
                ? pendingHoliday[row.date] : row.is_holiday === true
              const isPending   = pendingHoliday[row.date] !== undefined
              const isHoliday   = holidayVal
              const baseBg      = isHoliday ? holidayRowBg(isDark) : i % 2 === 0 ? 'transparent' : 'var(--color-bg-tertiary)'
              const leftBorder  = (isHoliday || isWeekend) ? `2px solid ${WEEKEND_COLOR}` : '2px solid transparent'
              return (
              <tr key={row.date}
                onClick={() => setEditRow(row)}
                className="cursor-pointer transition-colors"
                style={{ background: baseBg, borderLeft: leftBorder, borderBottom: '1px solid var(--color-border-subtle)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = baseBg)}>
                <td className="px-3 py-2 text-xs font-mono whitespace-nowrap"
                  style={{ color: (isWeekend || isHoliday) ? WEEKEND_COLOR : 'var(--color-text-primary)', fontWeight: (isWeekend || isHoliday) ? 600 : undefined }}>
                  {row.date}
                </td>
                <td className="px-3 py-2 text-xs"
                  style={{ color: (isWeekend || isHoliday) ? WEEKEND_COLOR : 'var(--color-text-muted)', fontWeight: (isWeekend || isHoliday) ? 600 : undefined }}>
                  {row.day ?? '-'}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-brand-muted">{row.yoy_match ?? '-'}</td>
                <td className="px-3 py-2 text-xs text-brand-muted">{row.rev_dow ?? '-'}</td>
                <td className="px-3 py-2">
                  {row.event && row.event.toLowerCase() !== 'null' ? (
                    <span className="text-[11px] px-2 py-0.5 rounded whitespace-nowrap"
                      style={{ background: 'var(--accent-badge-bg)', color: 'var(--color-accent-primary)' }}>
                      {row.event}
                    </span>
                  ) : <span className="text-xs text-brand-dimmed">-</span>}
                </td>
                <td className="px-3 py-2 text-xs text-brand-muted">{row.similar_year ?? '-'}</td>
                <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <Toggle
                      value={holidayVal}
                      onChange={() => onToggleHoliday(row.date, holidayVal)}
                    />
                    <span className="text-[11px]" style={{ color: holidayVal ? WEEKEND_COLOR : 'var(--color-text-muted)' }}>
                      {holidayVal ? '주연징' : '일반일'}
                    </span>
                    {/* 미저장 변경 표시 */}
                    {isPending && (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: 'var(--color-accent-primary)' }} />
                    )}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {editRow && (
        <EditModal row={editRow} searchParams={searchParams} onClose={() => setEditRow(null)} />
      )}
    </>
  )
}

// ── Calendar View ─────────────────────────────────────────────────────────────

function CalendarView({ data, year, month, searchParams }: {
  data:         CalendarRow[]
  year:         number
  month:        number
  searchParams: { year: number; month: number | null } | null
}) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [editRow, setEditRow] = useState<CalendarRow | null>(null)
  const dataMap = Object.fromEntries(data.map(r => [r.date, r]))

  // 해당 월의 첫날 요일 (0=Sun→6, 1=Mon→0, ...)
  const firstDay  = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  // Mon=0 기준 offset
  const offset = (firstDay + 6) % 7

  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // 7의 배수로 맞추기
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border-default)' }}>
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7"
          style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
          {DAYS_HEADER.map(day => (
            <div key={day}
              className="py-2.5 text-center text-xs font-semibold"
              style={{ color: day === 'Fri' || day === 'Sat' ? WEEKEND_COLOR : 'var(--color-text-muted)' }}>
              {day}
            </div>
          ))}
        </div>

        {/* 주 행 */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7"
            style={{ borderBottom: wi < weeks.length - 1 ? '1px solid var(--color-border-subtle)' : 'none' }}>
            {week.map((dayNum, di) => {
              if (!dayNum) return (
                <div key={di} className="min-h-[88px] p-1.5"
                  style={{ borderRight: di < 6 ? '1px solid var(--color-border-subtle)' : 'none', background: 'var(--color-bg-tertiary)', opacity: 0.4 }} />
              )
              const dateStr = `${year}-${pad(month)}-${pad(dayNum)}`
              const dayData = dataMap[dateStr]
              // 올해요일 컬럼 기준 금/토, 데이터 없으면 그리드 위치(Fri=4, Sat=5) 폴백
              const isWeekend = dayData ? (dayData.day === '금' || dayData.day === '토') : (di === 4 || di === 5)

              return (
                <div key={di}
                  onClick={() => dayData && setEditRow(dayData)}
                  className="min-h-[88px] p-1.5 transition-colors"
                  style={{
                    borderRight: di < 6 ? '1px solid var(--color-border-subtle)' : 'none',
                    background: dayData?.is_holiday === true ? holidayRowBg(isDark) : 'transparent',
                    cursor: dayData ? 'pointer' : 'default',
                  }}
                  onMouseEnter={e => { if (dayData) e.currentTarget.style.background = 'var(--overlay-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = dayData?.is_holiday === true ? holidayRowBg(isDark) : 'transparent' }}>
                  <div className="text-xs font-medium mb-1"
                    style={{ color: isWeekend ? WEEKEND_COLOR : 'var(--color-text-primary)' }}>
                    {dayNum}
                  </div>
                  {dayData?.is_holiday === true && (
                    <div className="text-[10px] px-1.5 py-0.5 rounded mb-0.5 truncate font-medium"
                      style={holidayBadge(isDark)}>
                      주연징
                    </div>
                  )}
                  {dayData?.event && (
                    <div className="text-[10px] px-1.5 py-0.5 rounded truncate"
                      style={{ background: 'var(--accent-badge-bg)', color: 'var(--color-accent-primary)' }}>
                      {dayData.event}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {editRow && (
        <EditModal row={editRow} searchParams={searchParams} onClose={() => setEditRow(null)} />
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CalendarManagementPage() {
  const router       = useRouter()
  const { profile }  = useAuth()
  const queryClient  = useQueryClient()

  const [view,         setView]         = useState<ViewMode>('list')
  const [searchYear,   setSearchYear]   = useState<number>(new Date().getFullYear())
  const [searchMonth,  setSearchMonth]  = useState<number | null>(null)
  const [searchParams, setSearchParams] = useState<{ year: number; month: number | null } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading,       setUploading]       = useState(false)
  const [uploadMsg,       setUploadMsg]       = useState<string | null>(null)
  const [calMonth,        setCalMonth]        = useState<number>(new Date().getMonth() + 1)
  const [pendingHoliday,  setPendingHoliday]  = useState<Record<string, boolean>>({})
  const [savingPending,   setSavingPending]   = useState(false)

  // ── Query (훅은 항상 최상위에서 — guard 앞에 위치) ────────────────────────────

  const { data = [], isLoading, isFetching } = useQuery<CalendarRow[]>({
    queryKey: ['c06_calendar', searchParams],
    queryFn: async () => {
      if (!searchParams) return []
      let query = (supabase as any)
        .from('c06_calendar')
        .select('*')
        .eq('year', searchParams.year)
        .order('date')
      if (searchParams.month) {
        const start   = `${searchParams.year}-${String(searchParams.month).padStart(2, '0')}-01`
        const lastDay = new Date(searchParams.year, searchParams.month, 0)
        const end     = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
        query = query.gte('date', start).lte('date', end)
      }
      const { data: rows, error } = await query
      if (error) throw error
      return rows as CalendarRow[]
    },
    enabled:   !!searchParams,
    staleTime: 5 * 60 * 1000,
  })

  // ── Access guard (모든 훅 선언 후) ───────────────────────────────────────────

  if (profile?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)' }}>
          <Lock size={24} className="text-brand-muted" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
            접근 권한이 없습니다
          </p>
          <p className="text-xs text-brand-muted">관리자에게 문의하세요</p>
        </div>
      </div>
    )
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleSearch = () => {
    setSearchParams({ year: searchYear, month: searchMonth })
    setPendingHoliday({})
  }

  const handleToggleHoliday = (date: string, currentValue: boolean) => {
    setPendingHoliday(prev => ({ ...prev, [date]: !currentValue }))
  }

  const handleSavePending = async () => {
    const entries = Object.entries(pendingHoliday)
    if (entries.length === 0) return
    setSavingPending(true)
    try {
      for (const [date, value] of entries) {
        await (supabase as any)
          .from('c06_calendar')
          .update({ is_holiday: value })
          .eq('date', date)
      }
      queryClient.invalidateQueries({ queryKey: ['c06_calendar', searchParams] })
      setPendingHoliday({})
    } finally {
      setSavingPending(false)
    }
  }

  const downloadTemplate = () => {
    // is_holiday: Y/N 형식 안내
    const template = [{ date: '', year: '', day: '', rev_dow: '', yoy_match: '', event: '', similar_year: '', is_holiday: 'Y or N' }]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Calendar')
    XLSX.writeFile(wb, 'calendar_template.xlsx')
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadMsg(null)
    try {
      const buf = await file.arrayBuffer()
      // cellDates: true → 날짜 셀을 JS Date 객체로 파싱
      const wb  = XLSX.read(buf, { cellDates: true })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any>(ws, { raw: false })
      if (rows.length === 0) { setUploadMsg('데이터가 없습니다.'); return }

      // 날짜 값 정규화 (JS Date / 시리얼 숫자 / 문자열 모두 처리)
      const toDateStr = (v: any): string | null => {
        if (!v) return null
        if (v instanceof Date) {
          const y = v.getFullYear()
          const m = String(v.getMonth() + 1).padStart(2, '0')
          const d = String(v.getDate()).padStart(2, '0')
          return `${y}-${m}-${d}`
        }
        if (typeof v === 'number') {
          // Excel 시리얼 → 날짜 (XLSX SSF 사용)
          const p = (XLSX as any).SSF.parse_date_code(v)
          return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
        }
        const s = String(v).trim()
        // "2025-01-01" 또는 "2025/01/01" 형식 정규화
        return s.replace(/\//g, '-')
      }

      const payload = rows.map((r: any) => ({
        date:         toDateStr(r.date),
        year:         r.year         ? Number(r.year) : null,
        day:          r.day          ? String(r.day)  : null,
        rev_dow:      r.rev_dow      ? String(r.rev_dow) : null,
        yoy_match:    toDateStr(r.yoy_match),
        event:        (r.event && String(r.event).toLowerCase() !== 'null') ? String(r.event) : null,
        similar_year: r.similar_year ? Number(r.similar_year) : null,
        is_holiday:   (['true','y','o','1'].includes(String(r.is_holiday ?? '').trim().toLowerCase())),
      })).filter((r: any) => r.date)

      const { error } = await (supabase as any)
        .from('c06_calendar')
        .upsert(payload, { onConflict: 'date' })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['c06_calendar', searchParams] })
      setUploadMsg(`${payload.length}개 업로드 완료`)
    } catch (err: any) {
      setUploadMsg(`오류: ${err.message ?? '업로드 실패'}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 캘린더 뷰 월 네비게이션
  const calYear = searchYear

  const goPrev = () => setCalMonth(m => m === 1 ? 12 : m - 1)
  const goNext = () => setCalMonth(m => m === 12 ? 1 : m + 1)

  const calData = searchParams?.month
    ? data
    : data.filter(r => {
        const d = new Date(r.date)
        return d.getFullYear() === calYear && d.getMonth() + 1 === calMonth
      })

  const isWorking = isLoading || isFetching

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.push('/settings')}
          className="mt-1 p-2 rounded-lg text-brand-muted hover:text-brand-text transition-colors"
          style={{ border: '1px solid var(--color-border-default)' }}>
          <ArrowLeft size={15} />
        </button>
        <div className="flex-1">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
                캘린더 관리
              </h1>
              <p className="text-sm text-brand-muted mt-0.5">날짜별 메타데이터를 관리합니다.</p>
            </div>

            {/* 뷰 전환 버튼 */}
            <div className="flex rounded-lg overflow-hidden"
              style={{ border: '1px solid var(--color-border-default)' }}>
              <button onClick={() => setView('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${view === 'list' ? 'font-medium' : 'text-brand-muted hover:text-brand-text'}`}
                style={{ background: view === 'list' ? 'var(--gradient-cta)' : 'transparent', color: view === 'list' ? '#0A0A0A' : undefined }}>
                <List size={13} />목록
              </button>
              <button onClick={() => setView('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${view === 'calendar' ? 'font-medium' : 'text-brand-muted hover:text-brand-text'}`}
                style={{ background: view === 'calendar' ? 'var(--gradient-cta)' : 'transparent', color: view === 'calendar' ? '#0A0A0A' : undefined }}>
                <CalendarDays size={13} />캘린더
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 검색 바 ── */}
      <div className="flex flex-wrap items-center gap-2 p-4 rounded-xl"
        style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
        {/* 연도 */}
        <select
          value={searchYear}
          onChange={e => setSearchYear(Number(e.target.value))}
          className="rounded-lg text-sm px-3 py-2 focus:outline-none transition-all"
          style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
          onFocus={onFocus} onBlur={onBlur}>
          {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
        </select>

        {/* 월 */}
        <select
          value={searchMonth ?? ''}
          onChange={e => setSearchMonth(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg text-sm px-3 py-2 focus:outline-none transition-all"
          style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
          onFocus={onFocus} onBlur={onBlur}>
          <option value="">전체 월</option>
          {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
        </select>

        {/* 검색 버튼 */}
        <button onClick={handleSearch} disabled={isWorking}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:-translate-y-0.5 disabled:opacity-60"
          style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
          {isWorking ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          검색
        </button>

        {/* 저장 버튼 */}
        <button onClick={handleSavePending}
          disabled={Object.keys(pendingHoliday).length === 0 || savingPending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:-translate-y-0.5 disabled:opacity-40"
          style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', background: 'var(--color-bg-elevated)' }}>
          {savingPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          저장{Object.keys(pendingHoliday).length > 0 && ` (${Object.keys(pendingHoliday).length})`}
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          {/* 업로드 메시지 */}
          {uploadMsg && (
            <span className={`text-xs ${uploadMsg.startsWith('오류') ? 'text-status-negative' : 'text-brand-muted'}`}>
              {uploadMsg}
            </span>
          )}

          {/* 양식 다운로드 */}
          <button onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:-translate-y-0.5"
            style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', boxShadow: 'var(--shadow-card)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent-primary)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}>
            <FileSpreadsheet size={15} style={{ color: '#21A366' }} />
            <Download size={13} className="text-brand-muted" />
            양식 다운로드
          </button>

          {/* 엑셀 업로드 */}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={handleUpload} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:-translate-y-0.5 disabled:opacity-60"
            style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', boxShadow: 'var(--shadow-card)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent-primary)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}>
            <FileSpreadsheet size={15} style={{ color: '#21A366' }} />
            {uploading ? <Loader2 size={13} className="animate-spin text-brand-muted" /> : <Upload size={13} className="text-brand-muted" />}
            엑셀 업로드
          </button>
        </div>
      </div>

      {/* ── 빈 상태: 검색 전 ── */}
      {!searchParams && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <CalendarDays size={40} style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm text-brand-muted">연도와 월을 선택하고 검색하세요</p>
        </div>
      )}

      {/* ── 로딩 ── */}
      {searchParams && isWorking && (
        <div className="flex items-center justify-center py-20 gap-2 text-brand-muted">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">불러오는 중...</span>
        </div>
      )}

      {/* ── 검색 결과 없음 ── */}
      {searchParams && !isWorking && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <CalendarDays size={32} style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm text-brand-muted">검색 결과가 없습니다</p>
          <p className="text-xs text-brand-dimmed">엑셀 업로드로 데이터를 추가하세요</p>
        </div>
      )}

      {/* ── 목록 보기 ── */}
      {searchParams && !isWorking && data.length > 0 && view === 'list' && (
        <ListView
          data={data}
          searchParams={searchParams}
          pendingHoliday={pendingHoliday}
          onToggleHoliday={handleToggleHoliday}
        />
      )}

      {/* ── 캘린더 보기 ── */}
      {searchParams && !isWorking && data.length > 0 && view === 'calendar' && (
        <div className="space-y-3">
          {/* 월 네비게이션 (전체 월 조회 시 표시) */}
          {!searchParams.month && (
            <div className="flex items-center gap-3">
              <button onClick={goPrev}
                className="p-1.5 rounded-lg transition-colors"
                style={{ border: '1px solid var(--color-border-default)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <ChevronLeft size={15} className="text-brand-muted" />
              </button>
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)', minWidth: 80, textAlign: 'center' }}>
                {calYear}년 {calMonth}월
              </span>
              <button onClick={goNext}
                className="p-1.5 rounded-lg transition-colors"
                style={{ border: '1px solid var(--color-border-default)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <ChevronRight size={15} className="text-brand-muted" />
              </button>
            </div>
          )}
          <CalendarView
            data={calData}
            year={searchParams.month ? searchParams.year : calYear}
            month={searchParams.month ?? calMonth}
            searchParams={searchParams}
          />
        </div>
      )}
    </div>
  )
}
