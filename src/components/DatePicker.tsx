'use client'

import { useState, useRef, useEffect } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

export interface DatePickerProps {
  label:           string
  value:           string
  onChange:        (v: string) => void
  accent?:         boolean
  availableDates?: string[]
  confirmMode?:    boolean
  onConfirm?:      (v: string) => void
  confirmLabel?:   string
}

export interface FormDatePickerProps {
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  style?:       React.CSSProperties
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const DAY_LABELS   = ['일', '월', '화', '수', '목', '금', '토']
const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

function toYMD(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function buildGrid(year: number, month: number): (number | null)[] {
  const startDow    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

// ─── DatePicker ────────────────────────────────────────────────────────────────

export default function DatePicker({ label, value, onChange, accent = false, availableDates, confirmMode = false, onConfirm, confirmLabel = '불러오기' }: DatePickerProps) {
  const [todayStr,     setTodayStr]     = useState('')
  const [open,         setOpen]         = useState(false)
  const [pendingDate,  setPendingDate]  = useState<string | null>(null)
  const [viewYear,  setViewYear]  = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())

  useEffect(() => {
    setTodayStr(new Date().toISOString().slice(0, 10))
  }, [])
  const [pos,       setPos]       = useState({ top: 0, left: 0 })

  const btnRef = useRef<HTMLButtonElement>(null)
  const calRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00')
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (!btnRef.current?.contains(t) && !calRef.current?.contains(t)) setOpen(false)
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

  useEffect(() => { if (!open) setPendingDate(null) }, [open])

  function openCalendar() {
    if (!btnRef.current) return
    const CAL_W = 264
    const CAL_H = 316
    const r     = btnRef.current.getBoundingClientRect()
    const left  = Math.max(8, Math.min(r.left, window.innerWidth - CAL_W - 8))
    const top   = r.bottom + CAL_H + 10 > window.innerHeight ? r.top - CAL_H - 6 : r.bottom + 6
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
  function selectDay(day: number) {
    const dateStr = toYMD(viewYear, viewMonth, day)
    if (availableDates && availableDates.length > 0 && !availableDates.includes(dateStr)) return
    if (confirmMode) {
      setPendingDate(dateStr)
    } else {
      onChange(dateStr)
      setOpen(false)
    }
  }

  const isDisabled = (dateStr: string) =>
    !!availableDates && availableDates.length > 0 && !availableDates.includes(dateStr)

  const grid    = buildGrid(viewYear, viewMonth)
  const display = value ? value.slice(2).replace(/-/g, '.') : '——.——.——'

  return (
    <>
      {/* ── Trigger chip ── */}
      <button
        ref={btnRef}
        onClick={openCalendar}
        className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150 whitespace-nowrap"
        style={{
          background: open
            ? 'var(--accent-badge-bg)'
            : accent
              ? 'var(--accent-badge-bg)'
              : 'var(--color-bg-tertiary)',
          border: open
            ? '1px solid var(--color-accent-primary)'
            : accent
              ? '1px solid var(--accent-badge-border)'
              : '1px solid var(--color-border-default)',
          boxShadow: open ? '0 0 0 2px var(--color-accent-glow)' : 'none',
        }}
      >
        <span
          className="text-[9px] font-bold uppercase tracking-wider shrink-0"
          style={{ color: open || accent ? 'var(--color-accent-primary)' : 'var(--color-text-muted)' }}
        >
          {label}
        </span>
        <span style={{ width: 1, height: 12, background: 'var(--color-border-default)', display: 'inline-block' }} />
        <span
          className="text-[11px] font-mono font-medium"
          style={{ color: open || accent ? 'var(--color-accent-primary)' : 'var(--color-text-primary)' }}
        >
          {display}
        </span>
        <CalendarDays
          size={10}
          className="shrink-0"
          style={{ color: open || accent ? 'var(--color-accent-primary)' : 'var(--color-text-muted)' }}
        />
      </button>

      {/* ── Calendar popup ── */}
      {open && (
        <div
          ref={calRef}
          className="rounded-2xl animate-fade-in overflow-hidden"
          style={{
            position:  'fixed',
            top:       pos.top,
            left:      pos.left,
            width:     264,
            zIndex:    9999,
            background: 'var(--popup-bg)',
            border:     '1px solid var(--popup-border)',
            boxShadow:  'var(--shadow-elevated)',
          }}
        >
          {/* Top accent line */}
          <div className="h-0.5 w-full" style={{ background: 'var(--popup-top-accent)' }} />

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={prevMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-muted transition-all duration-150"
              style={{ ':hover': { background: 'var(--overlay-hover)' } } as React.CSSProperties}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {viewYear}년&nbsp;{MONTH_LABELS[viewMonth]}
            </span>
            <button
              onClick={nextMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-muted transition-all duration-150"
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Divider */}
          <div className="mx-4 h-px" style={{ background: 'var(--divider-color)' }} />

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 px-3 pt-3 pb-1">
            {DAY_LABELS.map((d, i) => (
              <div
                key={d}
                className="text-center text-[10px] font-bold py-1"
                style={{
                  color: i === 0
                    ? 'var(--color-negative)'
                    : i === 6
                      ? 'var(--color-info)'
                      : 'var(--color-text-muted)',
                  opacity: 0.75,
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5 px-3 pb-3">
            {grid.map((day, i) => {
              if (!day) return <div key={i} className="w-8 h-8" />

              const dateStr    = toYMD(viewYear, viewMonth, day)
              const isSelected = dateStr === value
              const isPending  = confirmMode && pendingDate === dateStr
              const isToday    = dateStr === todayStr
              const disabled   = isDisabled(dateStr)
              const col        = i % 7
              const isHighlit  = confirmMode ? isPending : isSelected

              return (
                <button
                  key={i}
                  onClick={() => selectDay(day)}
                  disabled={disabled}
                  className="w-8 h-8 mx-auto rounded-lg text-xs font-medium flex items-center justify-center transition-all duration-100"
                  style={
                    disabled
                      ? { opacity: 0.2, cursor: 'not-allowed', pointerEvents: 'none', color: 'var(--color-text-muted)' }
                      : isHighlit
                        ? { background: 'var(--gradient-cta)', boxShadow: 'var(--accent-btn-glow)', color: '#0A0A0A', fontWeight: 700 }
                        : isToday
                          ? { background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)', color: 'var(--color-accent-primary)' }
                          : { color: col === 0 ? 'var(--color-negative)' : col === 6 ? 'var(--color-info)' : 'var(--color-text-secondary)' }
                  }
                  onMouseEnter={e => {
                    if (!isHighlit && !disabled) e.currentTarget.style.background = 'var(--overlay-hover)'
                  }}
                  onMouseLeave={e => {
                    if (!isHighlit && !disabled) e.currentTarget.style.background = isToday ? 'var(--accent-badge-bg)' : 'transparent'
                  }}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{
              borderTop:  '1px solid var(--divider-color)',
              background: 'var(--popup-footer-bg)',
            }}
          >
            <button
              onClick={() => {
                if (isDisabled(todayStr)) return
                if (confirmMode) { setPendingDate(todayStr) }
                else { onChange(todayStr); setOpen(false) }
              }}
              className="text-[11px] font-semibold transition-colors duration-150"
              style={{
                color: isDisabled(todayStr) ? 'var(--color-text-muted)' : 'var(--color-accent-primary)',
                opacity: isDisabled(todayStr) ? 0.4 : 1,
                cursor: isDisabled(todayStr) ? 'not-allowed' : 'pointer',
              }}
            >
              오늘
            </button>
            <span className="text-[10px] text-brand-dimmed font-mono">
              {confirmMode ? (pendingDate || value || '날짜 미선택') : (value || '날짜 미선택')}
            </span>
            {confirmMode ? (
              <button
                onClick={() => {
                  if (pendingDate && onConfirm) { onConfirm(pendingDate); setOpen(false) }
                }}
                disabled={!pendingDate}
                className="text-[11px] font-semibold transition-colors duration-150"
                style={{
                  padding:      '4px 10px',
                  background:   pendingDate ? 'var(--color-accent-primary, #00E5A0)' : 'var(--color-bg-tertiary)',
                  color:        pendingDate ? '#000' : 'var(--color-text-muted)',
                  border:       'none',
                  borderRadius: 5,
                  cursor:       pendingDate ? 'pointer' : 'not-allowed',
                  opacity:      pendingDate ? 1 : 0.5,
                }}
              >
                {confirmLabel}
              </button>
            ) : (
              <button
                onClick={() => setOpen(false)}
                className="text-[11px] text-brand-dimmed hover:text-brand-muted transition-colors duration-150"
              >
                닫기
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ─── FormDatePicker ────────────────────────────────────────────────────────────
// 인풋 박스 스타일 트리거 + 기존 달력 팝업

export function FormDatePicker({ value, onChange, placeholder = '날짜 선택', style }: FormDatePickerProps) {
  const [todayStr,  setTodayStr]  = useState('')
  const [open,      setOpen]      = useState(false)
  const [viewYear,  setViewYear]  = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())
  const [pos,       setPos]       = useState({ top: 0, left: 0 })

  const btnRef = useRef<HTMLButtonElement>(null)
  const calRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setTodayStr(new Date().toISOString().slice(0, 10)) }, [])

  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00')
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (!btnRef.current?.contains(t) && !calRef.current?.contains(t)) setOpen(false)
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
    const CAL_W = 264
    const CAL_H = 316
    const r     = btnRef.current.getBoundingClientRect()
    const left  = Math.max(8, Math.min(r.left, window.innerWidth - CAL_W - 8))
    const top   = r.bottom + CAL_H + 10 > window.innerHeight ? r.top - CAL_H - 6 : r.bottom + 6
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
  function selectDay(day: number) { onChange(toYMD(viewYear, viewMonth, day)); setOpen(false) }

  const grid    = buildGrid(viewYear, viewMonth)
  const display = value
    ? `${value.slice(0, 4)}년 ${Number(value.slice(5, 7))}월 ${Number(value.slice(8, 10))}일`
    : ''

  return (
    <>
      {/* ── 인풋 박스 스타일 트리거 ── */}
      <button
        ref={btnRef}
        type="button"
        onClick={openCalendar}
        className="w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 text-left flex items-center justify-between transition-all duration-200 focus:outline-none"
        style={{
          color:      value ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          border:     open
            ? '1px solid var(--color-accent-primary)'
            : '1px solid var(--color-border-default)',
          boxShadow:  open ? '0 0 0 3px var(--color-accent-dim)' : 'none',
          caretColor: 'var(--color-accent-primary)',
          ...style,
        }}
      >
        <span>{display || placeholder}</span>
        <CalendarDays
          size={14}
          style={{ color: open ? 'var(--color-accent-primary)' : 'var(--color-text-muted)', flexShrink: 0 }}
        />
      </button>

      {/* ── 달력 팝업 (기존과 동일) ── */}
      {open && (
        <div
          ref={calRef}
          className="rounded-2xl animate-fade-in overflow-hidden"
          style={{
            position:   'fixed',
            top:        pos.top,
            left:       pos.left,
            width:      264,
            zIndex:     9999,
            background: 'var(--popup-bg)',
            border:     '1px solid var(--popup-border)',
            boxShadow:  'var(--shadow-elevated)',
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
              {viewYear}년&nbsp;{MONTH_LABELS[viewMonth]}
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
            {DAY_LABELS.map((d, i) => (
              <div key={d} className="text-center text-[10px] font-bold py-1"
                style={{
                  color: i === 0 ? 'var(--color-negative)' : i === 6 ? 'var(--color-info)' : 'var(--color-text-muted)',
                  opacity: 0.75,
                }}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5 px-3 pb-3">
            {grid.map((day, i) => {
              if (!day) return <div key={i} className="w-8 h-8" />
              const dateStr    = toYMD(viewYear, viewMonth, day)
              const isSelected = dateStr === value
              const isToday    = dateStr === todayStr
              const col        = i % 7
              return (
                <button key={i} onClick={() => selectDay(day)}
                  className="w-8 h-8 mx-auto rounded-lg text-xs font-medium flex items-center justify-center transition-all duration-100"
                  style={
                    isSelected
                      ? { background: 'var(--gradient-cta)', boxShadow: 'var(--accent-btn-glow)', color: '#0A0A0A', fontWeight: 700 }
                      : isToday
                        ? { background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)', color: 'var(--color-accent-primary)' }
                        : { color: col === 0 ? 'var(--color-negative)' : col === 6 ? 'var(--color-info)' : 'var(--color-text-secondary)' }
                  }
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--overlay-hover)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isToday ? 'var(--accent-badge-bg)' : 'transparent' }}
                >
                  {day}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ borderTop: '1px solid var(--divider-color)', background: 'var(--popup-footer-bg)' }}>
            <button onClick={() => { onChange(todayStr); setOpen(false) }}
              className="text-[11px] font-semibold text-accent-primary hover:text-accent-secondary transition-colors">
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
