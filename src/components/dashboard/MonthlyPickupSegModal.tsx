'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useDateContext } from '@/contexts/DateContext'
import { useHotel } from '@/contexts/HotelContext'
import DatePicker from '@/components/DatePicker'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { usePickupData } from '@/hooks/usePickupData'
import { useAccountPickupData } from '@/hooks/useAccountPickupData'
import {
  buildMonthlyPickupSegTable,
  type MonthlyPickupSegRow,
  type MonthlyPickupCell,
} from '@/utils/monthlyPickupSegTable'

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 6

const thBase: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--color-text-secondary)',
  padding: '6px 10px', background: '#0a0a0a', whiteSpace: 'nowrap',
}
const tdBase: React.CSSProperties = {
  padding: '6px 10px', verticalAlign: 'middle',
}
const BORDER = '0.5px solid rgba(255,255,255,0.06)'
// 월 경계 (각 월 첫 컬럼 좌측) — border-collapse: separate 라 borderLeft가 독립 렌더
const MONTH_SEP: React.CSSProperties = { borderLeft: '1px solid rgba(0,229,160,0.35)' }

// ─── Format helpers (fontColor: 양수 schema 폰트색 / 음수 red / Dash 폰트색) ──────────

function Dash({ fontColor }: { fontColor?: string }) {
  return <span style={{ color: fontColor ?? 'var(--brand-dimmed)' }}>—</span>
}
function FmtPickupNights({ n, fontColor }: { n: number; fontColor?: string }) {
  if (n === 0) return <Dash fontColor={fontColor} />
  const sign  = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toLocaleString('ko-KR')}</span>
}
function FmtPickupAdr({ n, fontColor, unit = '천원' }: { n: number; fontColor?: string; unit?: '천원' | '원' }) {
  if (Math.abs(n) < 500) return <Dash fontColor={fontColor} />
  const sign  = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  const text  = unit === '천원' ? Math.round(n / 1000).toLocaleString() : Math.round(n).toLocaleString()
  return <span style={{ color }}>{sign}{text}</span>
}
function FmtPickupRevenue({ n, fontColor, unit = '백만원' }: { n: number; fontColor?: string; unit?: '원' | '천원' | '백만원' }) {
  if (Math.abs(n) < 50_000) return <Dash fontColor={fontColor} />
  const sign  = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  const text  = unit === '백만원' ? (n / 1_000_000).toFixed(1)
              : unit === '천원'   ? Math.round(n / 1000).toLocaleString()
              : Math.round(n).toLocaleString()
  return <span style={{ color }}>{sign}{text}</span>
}
function FmtOcc({ n }: { n: number }) {
  if (Math.abs(n) < 0.1) return <Dash />
  const sign  = n > 0 ? '+' : ''
  const color = n > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toFixed(1)}%</span>
}
function FmtRevpar({ n }: { n: number }) {
  if (Math.abs(n) < 500) return <Dash />
  const k     = Math.round(n / 1000)
  const sign  = k > 0 ? '+' : ''
  const color = k > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ cols }: { cols: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded" style={{ height: 30, background: 'var(--color-bg-tertiary)' }} />
      ))}
    </div>
  )
}

// ─── Month cell group ──────────────────────────────────────────────────────────

function MonthCells({ cell, clickable, onClick, fontColor, bg, borderTop, selected, adrUnit, revUnit }: {
  cell:      MonthlyPickupCell
  clickable: boolean
  onClick?:  () => void
  isLast?:   boolean
  fontColor?: string
  bg?:       string
  borderTop?: string
  selected?: boolean
  adrUnit?:  '천원' | '원'
  revUnit?:  '원' | '천원' | '백만원'
}) {
  const cursor = clickable ? 'pointer' : 'default'
  const td: React.CSSProperties = { ...tdBase, textAlign: 'right', cursor, background: bg, ...(borderTop ? { borderTop } : {}) }
  return (
    <>
      <td className="font-mono" style={{ ...td, ...MONTH_SEP, ...(selected ? { borderLeft: '3px solid #00E5A0' } : {}), borderRight: BORDER }} onClick={onClick}>
        <FmtPickupNights n={cell.pickupNights} fontColor={fontColor} />
      </td>
      <td className="font-mono" style={{ ...td, borderRight: BORDER }} onClick={onClick}>
        <FmtPickupAdr n={cell.pickupAdr} fontColor={fontColor} unit={adrUnit} />
      </td>
      <td className="font-mono" style={{ ...td, borderRight: BORDER }} onClick={onClick}>
        <FmtPickupRevenue n={cell.pickupRevenue} fontColor={fontColor} unit={revUnit} />
      </td>
    </>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

export default function MonthlyPickupSegModal({
  open, onClose, roomCount, onPickupCellClick, onSwitchToTotal,
}: {
  open:               boolean
  onClose:            () => void
  roomCount:          number
  onPickupCellClick?: (segCodes: string[], monthKey: string | null, label: string) => void
  onSwitchToTotal?:   () => void
}) {
  const { theme }                                         = useTheme()
  const isDark                                            = theme === 'dark'
  const { currentHotel }                                  = useHotel()
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()
  // 우측 패널: 선택된 세그먼트 (대분류 이름 클릭 시 set)
  const [selectedSeg, setSelectedSeg] = useState<{ label: string; codes: string[]; monthKey: string; activeMonthKey: string } | null>(null)
  const days = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0
  const { data: schema, loading: schemaLoading }          = useMarketSchema()
  const { data: pickup, loading: pickupLoading }          = usePickupData()
  const [pageIndex, setPageIndex]                         = useState(0)
  const [titleShifting, setTitleShifting]                 = useState(false)
  const [showUnitSetting, setShowUnitSetting]             = useState(false)
  const [adrUnit, setAdrUnit]                             = useState<'천원' | '원'>('천원')
  const [revUnit, setRevUnit]                             = useState<'원' | '천원' | '백만원'>('백만원')

  const loading = schemaLoading || pickupLoading

  const { rows, summary, monthKeys } = !loading && schema.length > 0
    ? buildMonthlyPickupSegTable({ schema, pickup, roomCount })
    : { rows: [], summary: { monthlyTotals: {}, grandTotal: { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0, occ: 0, revpar: 0 } }, monthKeys: [] }

  const totalPages    = Math.ceil(monthKeys.length / PAGE_SIZE)
  const visibleMonths = monthKeys.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE)

  // ─── 우측 Account Pickup 패널 데이터 ───────────────────────────────────────────
  // 선택된 세그먼트의 monthKey(클릭한 셀의 월) 기준 조회, 미선택 시 첫 달 폴백
  const activeMonthKey = selectedSeg?.monthKey || monthKeys[0] || ''
  const pickupYear  = activeMonthKey ? parseInt(activeMonthKey.slice(0, 4)) : new Date().getFullYear()
  const pickupMonth = activeMonthKey ? parseInt(activeMonthKey.slice(5, 7)) : new Date().getMonth() + 1

  const { data: accountPickupRows = [] } = useAccountPickupData({
    hotelId:     currentHotel?.id ?? '',
    otbDate:     otbDate ?? '',
    vsDate:      vsOtbDate ?? '',
    year:        pickupYear,
    month:       pickupMonth,
    segFilter:   null,
    isPastMonth: false,
  })

  const accountList = useMemo(() => {
    if (!selectedSeg) return []
    return (accountPickupRows as Array<{ account_name: string; segmentation: string; otb_nights: number; vs_nights: number; otb_revenue: number; vs_revenue: number }>)
      .filter(r => selectedSeg.codes.includes(r.segmentation))
      .map(r => ({
        name:    r.account_name,
        diffRn:  r.otb_nights - r.vs_nights,    // 픽업 = 현재OTB - vsOTB
        diffAdr: r.otb_nights > 0
          ? Math.round(r.otb_revenue / r.otb_nights) - (r.vs_nights > 0 ? Math.round(r.vs_revenue / r.vs_nights) : 0)
          : 0,
        diffRev: r.otb_revenue - r.vs_revenue,
      }))
      .filter(a => a.diffRn !== 0 || a.diffRev !== 0)
      .sort((a, b) => b.diffRn - a.diffRn)
  }, [selectedSeg, accountPickupRows])

  // HOU 행 식별
  const houRowIds = new Set<string>()
  for (const s of schema) {
    if (s.segmentation.includes('HOU')) houRowIds.add(s.id)
  }

  // body scroll lock
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  // ESC
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // 열릴 때 페이지 + 선택 세그먼트 리셋
  useEffect(() => {
    if (open) { setPageIndex(0); setSelectedSeg(null) }
  }, [open])

  // 페이지 전환 시 타이틀 잠깐 흐려지며 밀림 (B타입)
  const isPrevDisabled = pageIndex === 0
  useEffect(() => {
    setTitleShifting(true)
    const timer = setTimeout(() => setTitleShifting(false), 350)
    return () => clearTimeout(timer)
  }, [pageIndex])

  // 단위 설정 패널 외부 클릭 시 닫기
  useEffect(() => {
    if (!showUnitSetting) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.unit-setting-wrap')) setShowUnitSetting(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showUnitSetting])

  if (!open) return null

  const rangeStart = visibleMonths[0] || ''
  const rangeEnd   = visibleMonths[visibleMonths.length - 1] || ''
  const startMonth = rangeStart ? String(Number(rangeStart.slice(5, 7))) : ''
  const endMonth   = rangeEnd   ? String(Number(rangeEnd.slice(5, 7)))   : ''
  const startYY    = rangeStart ? rangeStart.slice(2, 4) : ''
  const endYY      = rangeEnd   ? rangeEnd.slice(2, 4)   : ''
  const colCount   = 1 + visibleMonths.length * 3

  const fmtAdr = (val: number) => {
    if (val === 0) return '—'
    if (adrUnit === '천원') return `${val > 0 ? '+' : ''}${Math.round(val / 1000)}`
    return `${val > 0 ? '+' : ''}${Math.round(val).toLocaleString()}`  // 원 — 소수점 없음
  }
  const fmtRev = (val: number) => {
    if (val === 0) return '—'
    const sign = val > 0 ? '+' : ''
    if (revUnit === '백만원') return `${sign}${(val / 1_000_000).toFixed(1)}`
    if (revUnit === '천원')   return `${sign}${Math.round(val / 1000).toLocaleString()}`
    return `${sign}${Math.round(val).toLocaleString()}`  // 원 — 소수점 없음
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4" style={{ paddingTop: 80 }}>
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[96vw] max-w-[1440px]"
        style={{ maxHeight: '88vh', background: '#0a0a0a', border: '0.5px solid rgba(0,229,160,0.2)', borderLeft: '1.5px solid #00E5A0', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="px-6 pt-3 pb-1 shrink-0" style={{ borderBottom: `1px solid ${BORDER.split(' ').pop()}` }}>
          {/* 1줄: 제목 + 페이지네이션 + X */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPageIndex(i => Math.max(0, i - 1))}
                disabled={pageIndex === 0}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  background: 'none', border: 'none',
                  cursor: pageIndex === 0 ? 'default' : 'pointer',
                  borderRadius: 6, overflow: 'hidden',
                  maxWidth: isPrevDisabled ? 0 : 60,
                  opacity: isPrevDisabled ? 0 : 1,
                  transform: `translateX(${isPrevDisabled ? -10 : 0}px)`,
                  padding: isPrevDisabled ? '4px 0' : '4px 8px',
                  pointerEvents: isPrevDisabled ? 'none' : 'auto',
                  transition: ['max-width 0.35s ease', 'opacity 0.25s ease', 'transform 0.35s ease', 'padding 0.35s ease'].join(', '),
                }}
                onMouseEnter={e => { if (pageIndex !== 0) e.currentTarget.style.background = 'rgba(0,229,160,0.1)' }}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span style={{ fontSize: 18, lineHeight: 1, transition: 'color 0.15s', color: pageIndex === 0 ? 'rgba(255,255,255,0.1)' : '#00E5A0' }}>‹</span>
                <span style={{ fontSize: 9, letterSpacing: '0.03em', transition: 'color 0.15s', whiteSpace: 'nowrap', color: pageIndex === 0 ? 'rgba(255,255,255,0.08)' : '#00E5A0' }}>이전</span>
              </button>
              <span className="font-semibold" style={{ color: 'var(--color-text-primary)', fontSize: 15, letterSpacing: '0.02em', transition: 'opacity 0.2s ease, transform 0.35s ease', opacity: titleShifting ? 0.5 : 1, transform: titleShifting ? 'translateX(4px)' : 'translateX(0)' }}>
                월별 픽업_
              </span>
              <span className="font-semibold" style={{ color: '#00E5A0', fontSize: 15, letterSpacing: '0.02em', transition: 'opacity 0.2s ease, transform 0.35s ease', opacity: titleShifting ? 0.5 : 1, transform: titleShifting ? 'translateX(4px)' : 'translateX(0)' }}>
                {startMonth}월<span style={{ fontSize: '0.7em', marginLeft: 2 }}>{startYY}년</span> ~ {endMonth}월<span style={{ fontSize: '0.7em', marginLeft: 2 }}>{endYY}년</span>
              </span>
              <button
                onClick={() => setPageIndex(i => Math.min(totalPages - 1, i + 1))}
                disabled={pageIndex === totalPages - 1}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  background: 'none', border: 'none',
                  cursor: pageIndex === totalPages - 1 ? 'default' : 'pointer',
                  padding: '4px 10px', borderRadius: 6, transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (pageIndex !== totalPages - 1) e.currentTarget.style.background = 'rgba(0,229,160,0.1)' }}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span style={{ fontSize: 18, lineHeight: 1, transition: 'color 0.15s', color: pageIndex === totalPages - 1 ? 'rgba(255,255,255,0.1)' : '#00E5A0' }}>›</span>
                <span style={{ fontSize: 9, letterSpacing: '0.03em', transition: 'color 0.15s', whiteSpace: 'nowrap', color: pageIndex === totalPages - 1 ? 'rgba(255,255,255,0.08)' : '#00E5A0' }}>다음</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
            {/* 월별/합계 토글 (현재 월별) */}
            <div className="flex rounded-md overflow-hidden self-stretch" style={{ height: 30, border: '1px solid var(--color-border-default)', background: 'var(--color-bg-elevated)' }}>
              <button
                className="px-2.5 text-xs transition-colors"
                style={{ background: 'var(--color-accent-primary)', color: '#0A0A0A' }}
              >월별</button>
              <button
                onClick={() => onSwitchToTotal?.()}
                className="px-2.5 text-xs transition-colors"
                style={{ background: 'transparent', color: 'var(--color-text-secondary)' }}
              >합계</button>
            </div>
            {/* 단위 설정 */}
            <div className="unit-setting-wrap" style={{ position: 'relative' }}>
              <button
                onClick={() => setShowUnitSetting(v => !v)}
                style={{
                  width: 30, height: 30, borderRadius: 6,
                  border: showUnitSetting
                    ? '0.5px solid #00E5A0'
                    : '0.5px solid rgba(255,255,255,0.15)',
                  background: showUnitSetting ? 'rgba(0,229,160,0.1)' : 'none',
                  cursor: 'pointer',
                  color: showUnitSetting ? '#00E5A0' : 'rgba(255,255,255,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>

              {showUnitSetting && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: '#1a1a1a',
                  border: '0.5px solid rgba(0,229,160,0.25)',
                  borderRadius: 8, padding: '12px 14px', width: 210,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  zIndex: 9999,
                }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10, letterSpacing: '0.04em' }}>
                    단위 설정
                  </div>

                  {/* ADR */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>객단가</span>
                    <div style={{ display: 'flex', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 5, overflow: 'hidden' }}>
                      {(['원', '천원'] as const).map(u => (
                        <button key={u} onClick={() => setAdrUnit(u)} style={{
                          padding: '3px 8px', fontSize: 10, border: 'none', cursor: 'pointer',
                          fontFamily: 'inherit', whiteSpace: 'nowrap',
                          background: adrUnit === u ? '#00E5A0' : 'transparent',
                          color: adrUnit === u ? '#0a0a0a' : 'rgba(255,255,255,0.35)',
                          fontWeight: adrUnit === u ? 500 : 400,
                        }}>{u}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.07)', margin: '8px 0' }} />

                  {/* REV */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>매출</span>
                    <div style={{ display: 'flex', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 5, overflow: 'hidden' }}>
                      {(['원', '천원', '백만원'] as const).map(u => (
                        <button key={u} onClick={() => setRevUnit(u)} style={{
                          padding: '3px 8px', fontSize: 10, border: 'none', cursor: 'pointer',
                          fontFamily: 'inherit', whiteSpace: 'nowrap',
                          background: revUnit === u ? '#00E5A0' : 'transparent',
                          color: revUnit === u ? '#0a0a0a' : 'rgba(255,255,255,0.35)',
                          fontWeight: revUnit === u ? 500 : 400,
                        }}>{u}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1"
              aria-label="닫기"
            >
              <X size={22} />
            </button>
            </div>
          </div>
        </div>

        {/* Body: 좌측 테이블 + 우측 Account Pickup 패널 */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: 'calc(100% - 340px)', flexShrink: 0, overflowX: 'auto', overflowY: 'auto' }}>
          {loading ? (
            <Skeleton cols={colCount} />
          ) : rows.length === 0 || monthKeys.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>
              표시할 픽업 데이터가 없습니다.
            </p>
          ) : (
            <div className="px-6 py-4">
              <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0, position: 'relative', zIndex: 1 }}>
                {/* 헤더 2단 */}
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left', borderRight: BORDER }} rowSpan={2}>세그먼트</th>
                    {visibleMonths.map(mk => (
                      <th key={mk} colSpan={3} style={{ ...thBase, fontSize: 12, textAlign: 'center', color: '#00E5A0', ...MONTH_SEP, borderRight: BORDER }}>
                        {mk.slice(5, 7)}월
                        <span style={{ fontSize: '0.7em', marginLeft: 2 }}>{mk.slice(2, 4)}년</span>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {visibleMonths.map(mk => ([
                      <th key={`${mk}-rn`}  style={{ ...thBase, textAlign: 'right', ...MONTH_SEP, borderBottom: BORDER }}>Δ객실</th>,
                      <th key={`${mk}-adr`} style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>Δ객단가</th>,
                      <th key={`${mk}-rev`} style={{ ...thBase, textAlign: 'right', borderRight: BORDER, borderBottom: BORDER }}>Δ매출</th>,
                    ]))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map(row => {
                    const rowBg    = (isDark ? row.bgDarkColor  : row.bgLightColor)  ?? '#111111'
                    const rowColor = (isDark ? row.fontDarkColor : row.fontLightColor) ?? 'var(--color-text-primary)'
                    const isHou    = houRowIds.has(row.id)
                    const clickable = !!onPickupCellClick && !isHou && row.segmentationCodes.length > 0
                    const nameColor = row.indent ? 'rgba(255,255,255,0.45)' : rowColor
                    // 우측 패널용: 대분류 행만 클릭 가능 / 선택 시 행 하이라이트
                    const segSelectable = !row.indent && row.segmentationCodes.length > 0
                    const isSelected    = segSelectable && selectedSeg?.label === row.name
                    const baseBg        = isSelected ? 'rgba(0,229,160,0.08)' : rowBg

                    return (
                      <tr
                        key={row.id}
                        style={{ borderBottom: BORDER, color: rowColor, fontWeight: row.isBold ? 600 : 400 }}
                        onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${baseBg}` })}
                        onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = baseBg })}
                      >
                        <td
                          onClick={segSelectable ? () => setSelectedSeg({ label: row.name, codes: row.segmentationCodes, monthKey: visibleMonths[0] ?? '', activeMonthKey: '' }) : undefined}
                          style={{ ...tdBase, paddingLeft: row.indent ? 28 : 12, minWidth: 140, borderRight: BORDER, color: nameColor, background: baseBg, cursor: segSelectable ? 'pointer' : 'default' }}
                        >
                          {row.indent ? (
                            <><span style={{ color: nameColor }}>└ </span>{row.name}</>
                          ) : row.name}
                        </td>
                        {visibleMonths.map((mk, idx) => {
                          const cell = row.monthlyPickup[mk] ?? { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 }
                          const handleClick = clickable
                            ? () => setSelectedSeg({ label: row.name, codes: row.segmentationCodes, monthKey: mk, activeMonthKey: mk })
                            : undefined
                          return <MonthCells key={mk} cell={cell} clickable={clickable} onClick={handleClick} isLast={idx === visibleMonths.length - 1} fontColor={rowColor} bg={baseBg} selected={selectedSeg?.label === row.name && selectedSeg?.activeMonthKey === mk} adrUnit={adrUnit} revUnit={revUnit} />
                        })}
                      </tr>
                    )
                  })}
                </tbody>

                <tfoot>
                  {/* 합계 */}
                  <tr>
                    <td style={{ ...tdBase, paddingLeft: 12, fontWeight: 600, color: 'var(--color-text-primary)', borderRight: BORDER, background: '#111111', borderTop: '1px solid rgba(0,229,160,0.6)' }}>합계 (HOU 제외)</td>
                    {visibleMonths.map((mk, idx) => (
                      <MonthCells key={mk} cell={summary.monthlyTotals[mk] ?? { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 }} clickable={false} isLast={idx === visibleMonths.length - 1} bg="#111111" borderTop="1px solid rgba(0,229,160,0.6)" adrUnit={adrUnit} revUnit={revUnit} />
                    ))}
                  </tr>
                  {/* OCC */}
                  <tr style={{ borderTop: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: BORDER, background: '#111111' }}>점유율</td>
                    {visibleMonths.map(mk => (
                      <td key={mk} colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, ...MONTH_SEP, borderRight: BORDER, background: '#111111' }}>
                        <FmtOcc n={summary.monthlyTotals[mk]?.occ ?? 0} />
                      </td>
                    ))}
                  </tr>
                  {/* RevPAR */}
                  <tr style={{ borderTop: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: BORDER, background: '#111111' }}>RevPAR</td>
                    {visibleMonths.map(mk => (
                      <td key={mk} colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, ...MONTH_SEP, borderRight: BORDER, background: '#111111' }}>
                        <FmtRevpar n={summary.monthlyTotals[mk]?.revpar ?? 0} />
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* 우측 Account Pickup 패널 */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'radial-gradient(ellipse 80% 60% at 100% 100%, rgba(0,229,160,0.1) 0%, transparent 70%), #000000', border: '0.5px solid rgba(0,229,160,0.15)', borderLeft: '0.5px solid rgba(255,255,255,0.06)' }}>
          <div className="px-3 pt-3 pb-2 shrink-0" style={{ borderBottom: BORDER }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#FFC850' }}>어카운트 픽업</div>
            <div style={{ fontSize: 10, color: 'var(--brand-dimmed)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedSeg ? `${selectedSeg.label} · ${selectedSeg.monthKey} · 픽업 R/N 기준` : '세그먼트를 클릭하세요'}
            </div>
          </div>
          {/* 컬럼 헤더 */}
          <div style={{ display: 'flex', padding: '5px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', flex: 1 }}>어카운트</span>
            <div style={{ display: 'flex', flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 40, textAlign: 'right' }}>객실</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 52, textAlign: 'right' }}>객단가</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 56, textAlign: 'right' }}>매출</span>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {!selectedSeg ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
                <span style={{ fontSize: 18 }}>👆</span>
                <span>세그먼트를 클릭하세요</span>
              </div>
            ) : accountList.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--brand-dimmed)', padding: 12 }}>픽업 데이터가 없습니다.</div>
            ) : accountList.map((a, i) => (
              <div
                key={`${a.name}-${i}`}
                style={{ padding: '6px 14px', borderBottom: '0.5px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                  {a.name}
                </span>
                <div style={{ display: 'flex', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: a.diffRn > 0 ? '#00E5A0' : a.diffRn < 0 ? '#E24B4A' : 'rgba(255,255,255,0.3)', width: 40, textAlign: 'right' }}>
                    {a.diffRn === 0 ? '—' : (a.diffRn > 0 ? '+' : '') + a.diffRn}
                  </span>
                  <span style={{ fontSize: 11, color: a.diffAdr > 0 ? '#00E5A0' : a.diffAdr < 0 ? '#E24B4A' : 'rgba(255,255,255,0.3)', width: 52, textAlign: 'right' }}>
                    {fmtAdr(a.diffAdr)}
                  </span>
                  <span style={{ fontSize: 11, color: a.diffRev > 0 ? '#00E5A0' : a.diffRev < 0 ? '#E24B4A' : 'rgba(255,255,255,0.3)', width: 56, textAlign: 'right' }}>
                    {fmtRev(a.diffRev)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between px-6 py-3 shrink-0" style={{ borderTop: BORDER }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} accent bare availableDates={otbDates} />
            <DatePicker label="vs OTB" value={vsOtbDate} onChange={setVsOtbDate} bare availableDates={otbDates.filter(d => d < otbDate)} />
            <span style={{ fontSize: 11, color: 'var(--brand-dimmed)', whiteSpace: 'nowrap' }}>
              {days > 0 ? `${days}일간` : '당일'} 픽업 현황
            </span>
          </div>
          <span style={{ fontSize: 11, color: '#00E5A0', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>단위 : 실 · {adrUnit} · {revUnit}</span>
        </div>
      </div>
    </div>
  )
}
