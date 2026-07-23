'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useDateContext } from '@/contexts/DateContext'
import { useTheme } from '@/contexts/ThemeContext'
import DatePicker from '@/components/DatePicker'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { useLyPacing, type LyPacingMode } from '@/hooks/useLyPacing'
import {
  buildLyComparisonSegTable,
} from '@/utils/lyComparisonSegTable'
import type { LyComparisonMonthly } from '@/utils/lyComparisonSegTable'

// ─── Constants ─────────────────────────────────────────────────────────────────

const thBase: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--color-text-secondary)',
  padding: '6px 10px', background: '#000000', whiteSpace: 'nowrap',
}
const tdBase: React.CSSProperties = {
  padding: '6px 10px', verticalAlign: 'middle', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
}
const BORDER = '1px solid var(--divider-color)'
// 섹션 구분선(현재 OTB / 작년 OTB / GAP 경계) — 초록
const DOUBLE = '1px solid rgba(0,229,160,0.3)'

// ─── Format helpers ────────────────────────────────────────────────────────────

function Dash() { return <span style={{ color: 'var(--brand-dimmed)' }}>—</span> }
function GapDash() { return <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span> }

function FmtNights({ n }: { n: number }) {
  if (n === 0) return <Dash />
  return <>{n.toLocaleString('ko-KR')}</>
}
function FmtAdr({ n, unit = '천원' }: { n: number; unit?: '천원' | '원' }) {
  if (Math.abs(n) < 500) return <Dash />
  return <>{unit === '천원' ? Math.round(n / 1000).toLocaleString() : Math.round(n).toLocaleString()}</>
}
function FmtRevenue({ n, unit = '백만원' }: { n: number; unit?: '원' | '천원' | '백만원' }) {
  if (Math.abs(n) < 50_000) return <Dash />
  return <>{unit === '백만원' ? Math.round(n / 1_000_000).toLocaleString() : unit === '천원' ? Math.round(n / 1000).toLocaleString() : Math.round(n).toLocaleString()}</>
}
function FmtGapNights({ n, fontColor }: { n: number; fontColor?: string }) {
  if (n === 0) return <GapDash />
  const sign =n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toLocaleString('ko-KR')}</span>
}
function FmtGapAdr({ n, fontColor, unit = '천원' }: { n: number; fontColor?: string; unit?: '천원' | '원' }) {
  if (Math.abs(n) < 500) return <GapDash />
  const sign = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  const text = unit === '천원' ? Math.round(n / 1000).toLocaleString() : Math.round(n).toLocaleString()
  return <span style={{ color }}>{sign}{text}</span>
}
function FmtGapRevenue({ n, fontColor, unit = '백만원' }: { n: number; fontColor?: string; unit?: '원' | '천원' | '백만원' }) {
  if (Math.abs(n) < 50_000) return <Dash />
  const sign = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  const text = unit === '백만원' ? Math.round(n / 1_000_000).toLocaleString() : unit === '천원' ? Math.round(n / 1000).toLocaleString() : Math.round(n).toLocaleString()
  return <span style={{ color }}>{sign}{text}</span>
}
function FmtOcc({ n }: { n: number }) {
  if (Math.abs(n) < 0.1) return <Dash />
  return <>{n.toFixed(1)}%</>
}
function FmtGapPct({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 0.1) return <GapDash />
  const sign =n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toFixed(1)}%p</span>
}
function FmtRevpar({ n }: { n: number }) {
  if (Math.abs(n) < 500) return <Dash />
  return <>{Math.round(n / 1000)}k</>
}
function FmtGapRevpar({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 500) return <GapDash />
  const k = Math.round(n / 1000)
  const sign = k > 0 ? '+' : ''
  const color = k > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
}

// ─── Cell group components ─────────────────────────────────────────────────────

function MonthCells({ m, clickable, onGapClick, onOtbClick, onLyClick, bg, gapColor, gapBold, otbSelected, lySelected, adrUnit, revUnit }: {
  m: LyComparisonMonthly
  clickable: boolean
  onGapClick?: () => void
  onOtbClick?: () => void
  onLyClick?: () => void
  bg?: string
  gapColor?: string
  gapBold?: boolean
  otbSelected?: boolean
  lySelected?: boolean
  adrUnit?: '천원' | '원'
  revUnit?: '원' | '천원' | '백만원'
}) {
  const cursor = clickable ? 'pointer' : 'default'
  const c: React.CSSProperties = { ...tdBase, textAlign: 'right', background: bg, cursor: onOtbClick ? 'pointer' : 'default' }
  const g: React.CSSProperties = { ...c, cursor, fontWeight: gapBold ? 600 : 400 }
  return (
    <>
      {/* OTB */}
      <td className="font-mono" style={{ ...c, borderLeft: otbSelected ? '3px solid #00E5A0' : BORDER }} onClick={onOtbClick}><FmtNights n={m.otb.nights} /></td>
      <td className="font-mono" style={c} onClick={onOtbClick}><FmtAdr n={m.otb.adr} unit={adrUnit} /></td>
      <td className="font-mono" style={{ ...c, borderRight: DOUBLE }} onClick={onOtbClick}><FmtRevenue n={m.otb.revenue} unit={revUnit} /></td>
      {/* LY */}
      <td className="font-mono" style={{ ...c, borderLeft: lySelected ? '3px solid #00E5A0' : BORDER }} onClick={onLyClick}><FmtNights n={m.ly.nights} /></td>
      <td className="font-mono" style={c} onClick={onLyClick}><FmtAdr n={m.ly.adr} unit={adrUnit} /></td>
      <td className="font-mono" style={{ ...c, borderRight: DOUBLE }} onClick={onLyClick}><FmtRevenue n={m.ly.revenue} unit={revUnit} /></td>
      {/* GAP */}
      <td className="font-mono" style={g} onClick={onGapClick}><FmtGapNights n={m.gap.nights} fontColor={gapColor} /></td>
      <td className="font-mono" style={g} onClick={onGapClick}><FmtGapAdr n={m.gap.adr} fontColor={gapColor} unit={adrUnit} /></td>
      <td className="font-mono" style={g} onClick={onGapClick}><FmtGapRevenue n={m.gap.revenue} fontColor={gapColor} unit={revUnit} /></td>
    </>
  )
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded" style={{ height: 30, background: 'var(--color-bg-tertiary)' }} />
      ))}
    </div>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

export default function LyComparisonSegModal({
  open, onClose, roomCount, initialMonthKey, onAccountDrillDown,
}: {
  open:                boolean
  onClose:             () => void
  roomCount:           number
  initialMonthKey?:    string
  onAccountDrillDown?: (segCodes: string[], monthKey: string, label: string) => void
}) {
  const { otbDate, otbDates, setOtbDate }                = useDateContext()
  const { theme }                                        = useTheme()
  const isDark                                           = theme === 'dark'
  const { data: schema, loading: schemaLoading }         = useMarketSchema()
  const [mode, setMode]                                  = useState<LyPacingMode>('v1')
  const { data: lyPacing, loading: lyLoading }           = useLyPacing(mode)
  const lyMatchUpdateDate = lyPacing?.[0]?.ly_match_update_date ?? null
  const [currentMonthIndex, setCurrentMonthIndex]        = useState(0)
  const [titleShifting, setTitleShifting]                = useState(false)
  const [showUnitSetting, setShowUnitSetting]            = useState(false)
  const [adrUnit, setAdrUnit]                            = useState<'천원' | '원'>('천원')
  const [revUnit, setRevUnit]                            = useState<'원' | '천원' | '백만원'>('백만원')
  // 우측 Account 증감 패널: 선택된 세그먼트
  const [selectedSeg, setSelectedSeg] = useState<{ label: string; codes: string[]; viewMode: 'otb' | 'ly' | 'gap' } | null>(null)

  const loading = schemaLoading || lyLoading

  const { rows, summary, monthKeys } = useMemo(
    () => !loading && schema.length > 0
      ? buildLyComparisonSegTable({ schema, lyPacing, roomCount })
      : { rows: [], summary: { monthly: {} }, monthKeys: [] },
    [schema, lyPacing, roomCount, loading],
  )

  // HOU 행 식별
  const houRowIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of schema) {
      if (s.segmentation.includes('HOU')) ids.add(s.id)
    }
    return ids
  }, [schema])

  // 열릴 때 월 인덱스 초기화
  useEffect(() => {
    if (!open || monthKeys.length === 0) return
    if (initialMonthKey) {
      const idx = monthKeys.indexOf(initialMonthKey)
      setCurrentMonthIndex(idx >= 0 ? idx : 0)
    } else {
      setCurrentMonthIndex(0)
    }
  }, [open, initialMonthKey, monthKeys])

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

  // 월 전환 시 타이틀 잠깐 흐려지며 밀림 (B타입)
  useEffect(() => {
    setTitleShifting(true)
    const timer = setTimeout(() => setTitleShifting(false), 350)
    return () => clearTimeout(timer)
  }, [currentMonthIndex])

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

  const currentMonthKey = monthKeys[currentMonthIndex] ?? ''

  // 우측 Account 증감 패널 데이터 — 좌측 테이블과 동일 소스(lyPacing)를 어카운트 단위로 집계
  const accountList = useMemo(() => {
    if (!selectedSeg) return []

    const filtered = lyPacing.filter(r =>
      r.business_date.slice(0, 7) === currentMonthKey &&
      selectedSeg.codes.includes(r.segmentation)
    )

    // account_name별 집계
    const accMap: Record<string, { otbRn: number; otbRev: number; lyRn: number; lyRev: number }> = {}
    for (const r of filtered) {
      const k = r.account_name ?? '(없음)'
      if (!accMap[k]) accMap[k] = { otbRn: 0, otbRev: 0, lyRn: 0, lyRev: 0 }
      accMap[k].otbRn  += r.otb_nights  ?? 0
      accMap[k].otbRev += r.otb_revenue ?? 0
      accMap[k].lyRn   += r.ly_nights   ?? 0
      accMap[k].lyRev  += r.ly_revenue  ?? 0
    }

    const viewMode = selectedSeg.viewMode

    return Object.entries(accMap).map(([name, v]) => {
      const valRn  = viewMode === 'otb' ? v.otbRn
                   : viewMode === 'ly'  ? v.lyRn
                   : v.otbRn - v.lyRn   // gap
      const valAdr = viewMode === 'otb' ? (v.otbRn > 0 ? Math.round(v.otbRev / v.otbRn) : 0)
                   : viewMode === 'ly'  ? (v.lyRn  > 0 ? Math.round(v.lyRev  / v.lyRn)  : 0)
                   : (v.otbRn > 0 && v.lyRn > 0
                       ? Math.round(v.otbRev / v.otbRn) - Math.round(v.lyRev / v.lyRn)
                       : 0)
      const valRev = viewMode === 'otb' ? v.otbRev
                   : viewMode === 'ly'  ? v.lyRev
                   : v.otbRev - v.lyRev  // gap
      return { name, valRn, valAdr, valRev }
    })
    .sort((a, b) => b.valRn - a.valRn)
  }, [selectedSeg, lyPacing, currentMonthKey])

  if (!open) return null

  const sumMonth        = summary.monthly[currentMonthKey]

  const sumTd: React.CSSProperties = {
    ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)', paddingTop: 8, paddingBottom: 8, background: '#111111',
    borderTop: '1px solid rgba(0,229,160,0.6)',   // 합계 행 위 초록선 (separate 모드: 셀 보더만 렌더)
  }

  const ZERO_MONTHLY: LyComparisonMonthly = {
    otb: { nights: 0, adr: 0, revenue: 0 },
    ly:  { nights: 0, adr: 0, revenue: 0 },
    gap: { nights: 0, adr: 0, revenue: 0 },
  }

  const currentMonth = currentMonthKey ? currentMonthKey.slice(5, 7) : ''
  const currentYear  = currentMonthKey ? currentMonthKey.slice(0, 4) : ''
  const isFirst      = currentMonthIndex === 0
  const isLast       = currentMonthIndex >= monthKeys.length - 1

  const scaleAdr = (val: number) =>
    adrUnit === '천원' ? String(Math.round(val / 1000)) : Math.round(val).toLocaleString()
  const scaleRev = (val: number) =>
    revUnit === '백만원' ? Math.round(val / 1_000_000).toLocaleString()
    : revUnit === '천원' ? Math.round(val / 1000).toLocaleString()
    : Math.round(val).toLocaleString()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-[1400px]"
        style={{ maxHeight: '88vh', overflow: 'hidden', background: '#000000', border: '0.5px solid rgba(0,229,160,0.2)', borderLeft: '1.5px solid #00E5A0', borderRadius: 10, boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-2 pb-1 shrink-0" style={{ borderBottom: BORDER }}>
          {/* Left: title + E스타일 화살표 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* ‹ 이전 버튼 — B타입 애니메이션 */}
            <button
              onClick={() => setCurrentMonthIndex(i => Math.max(0, i - 1))}
              disabled={isFirst}
              style={{
                overflow: 'hidden',
                maxWidth: isFirst ? 0 : 60,
                opacity: isFirst ? 0 : 1,
                transform: `translateX(${isFirst ? -10 : 0}px)`,
                padding: isFirst ? '4px 0' : '4px 10px',
                pointerEvents: isFirst ? 'none' : 'auto',
                transition: 'max-width 0.35s ease, opacity 0.25s ease, transform 0.35s ease, padding 0.35s ease',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6,
              }}
            >
              <span style={{ fontSize: 18, color: '#00E5A0', lineHeight: 1 }}>‹</span>
              <span style={{ fontSize: 9, color: 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>이전</span>
            </button>

            {/* 타이틀 */}
            <span style={{
              fontSize: 16, fontWeight: 500, color: '#fff', letterSpacing: '0.04em',
              transition: 'opacity 0.2s ease, transform 0.35s ease',
              opacity: titleShifting ? 0.5 : 1,
              transform: titleShifting ? 'translateX(4px)' : 'translateX(0)',
            }}>
              전년 동기간_
              <span style={{ color: '#00E5A0' }}>
                {currentMonth}월 <span style={{ fontSize: '0.7em' }}>{String(currentYear).slice(-2)}년</span>
              </span>
            </span>

            {/* › 다음 버튼 */}
            <button
              onClick={() => setCurrentMonthIndex(i => Math.min(monthKeys.length - 1, i + 1))}
              disabled={isLast}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: 'none', border: 'none',
                cursor: isLast ? 'default' : 'pointer',
                padding: '4px 10px', borderRadius: 6,
              }}
            >
              <span style={{ fontSize: 18, color: isLast ? 'rgba(255,255,255,0.1)' : '#00E5A0', lineHeight: 1 }}>›</span>
              <span style={{ fontSize: 9, color: isLast ? 'rgba(255,255,255,0.08)' : 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>다음</span>
            </button>
          </div>

          {/* Right: mode toggle + close */}
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Body: 좌측 테이블 + 우측 Account 증감 패널 */}
        <div style={{ display: 'flex', overflow: 'hidden' }}>
        <div className="overflow-y-auto" style={{ minWidth: 0, flex: '1 1 0', minHeight: 0 }}>
          {loading ? (
            <Skeleton />
          ) : monthKeys.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>월 데이터가 없습니다.</p>
          ) : rows.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>표시할 LY 비교 데이터가 없습니다.</p>
          ) : (
            <div className="px-6 py-4">
              <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                {/* 헤더 2단 */}
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left', borderRight: DOUBLE }} rowSpan={2}>세그먼트</th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: DOUBLE, borderRight: DOUBLE, height: 42, verticalAlign: 'middle' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>현재 OTB</div>
                      <div style={{ display: 'inline-flex', justifyContent: 'center' }}>
                        <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} availableDates={otbDates} accent bare />
                      </div>
                    </th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderRight: DOUBLE, height: 42, verticalAlign: 'middle' }}>
                      <div
                        onClick={() => setMode(mode === 'v1' ? 'v2' : 'v1')}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          cursor: 'pointer', padding: '2px 8px', borderRadius: 4,
                          transition: 'background 0.15s', marginBottom: 3,
                          color: 'rgba(255,255,255,0.5)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,229,160,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{mode === 'v1' ? '전년 동일자 OTB' : '전년 동기간 OTB'}</span>
                        <span style={{ fontSize: 10, color: 'rgba(0,229,160,0.5)' }}>⇄</span>
                      </div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{lyMatchUpdateDate ?? '-'}</div>
                    </th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', height: 42, verticalAlign: 'middle' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>GAP</div>
                    </th>
                  </tr>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>객실</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>객단가</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: DOUBLE, borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>매출</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>객실</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>객단가</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: DOUBLE, borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>매출</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>Δ객실</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>Δ객단가</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>Δ매출</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map(row => {
                    const rowBg    = (isDark ? row.bgDarkColor  : row.bgLightColor)  ?? '#111111'
                    const rowColor = (isDark ? row.fontDarkColor : row.fontLightColor) ?? 'var(--color-text-primary)'
                    const isHou    = houRowIds.has(row.id)
                    const clickable = !!onAccountDrillDown && !isHou && row.segmentationCodes.length > 0
                    const m        = row.monthly[currentMonthKey] ?? ZERO_MONTHLY
                    // 우측 패널용: 세그 코드 있는 행 클릭 가능(소분류 포함) / 선택 시 행 하이라이트
                    const segSelectable = row.segmentationCodes.length > 0
                    const isSelected    = selectedSeg?.label === row.name
                    const baseBg        = isSelected ? 'rgba(0,229,160,0.06)' : rowBg

                    return (
                      <tr
                        key={row.id}
                        style={{ borderBottom: BORDER, color: rowColor, fontWeight: row.isBold ? 600 : 400 }}
                        onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${baseBg}` })}
                        onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = baseBg })}
                      >
                        <td
                          onClick={segSelectable ? () => setSelectedSeg({ label: row.name, codes: row.segmentationCodes, viewMode: 'gap' }) : undefined}
                          style={{ ...tdBase, paddingLeft: row.indent ? 28 : 12, minWidth: 140, borderRight: DOUBLE, background: baseBg, cursor: segSelectable ? 'pointer' : 'default' }}
                        >
                          {row.indent ? <><span style={{ color: 'var(--brand-dimmed)' }}>└ </span>{row.name}</> : row.name}
                        </td>
                        <MonthCells
                          m={m}
                          clickable={clickable}
                          adrUnit={adrUnit}
                          revUnit={revUnit}
                          otbSelected={selectedSeg?.label === row.name && selectedSeg?.viewMode === 'otb'}
                          lySelected={selectedSeg?.label === row.name && selectedSeg?.viewMode === 'ly'}
                          bg={baseBg}
                          gapColor={rowColor}
                          gapBold={row.isBold}
                          onOtbClick={segSelectable ? () => setSelectedSeg({ label: row.name, codes: row.segmentationCodes, viewMode: 'otb' }) : undefined}
                          onLyClick={segSelectable ? () => setSelectedSeg({ label: row.name, codes: row.segmentationCodes, viewMode: 'ly' }) : undefined}
                          onGapClick={clickable ? () => {
                            setSelectedSeg({ label: row.name, codes: row.segmentationCodes, viewMode: 'gap' })
                          } : undefined}
                        />
                      </tr>
                    )
                  })}
                </tbody>

                <tfoot>
                  {/* 합계 */}
                  <tr>
                    <td style={{ ...sumTd, paddingLeft: 12, borderRight: DOUBLE }}>합계 (HOU 제외)</td>
                    {sumMonth ? (
                      <>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: BORDER }}><FmtNights n={sumMonth.otb.nights} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtAdr n={sumMonth.otb.adr} unit={adrUnit} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderRight: DOUBLE }}><FmtRevenue n={sumMonth.otb.revenue} unit={revUnit} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtNights n={sumMonth.ly.nights} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtAdr n={sumMonth.ly.adr} unit={adrUnit} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderRight: DOUBLE }}><FmtRevenue n={sumMonth.ly.revenue} unit={revUnit} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtGapNights n={sumMonth.gap.nights} fontColor="var(--color-text-primary)" /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtGapAdr n={sumMonth.gap.adr} fontColor="var(--color-text-primary)" unit={adrUnit} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtGapRevenue n={sumMonth.gap.revenue} fontColor="var(--color-text-primary)" unit={revUnit} /></td>
                      </>
                    ) : <td colSpan={9} />}
                  </tr>
                  {/* OCC */}
                  <tr style={{ borderTop: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE, background: '#111111' }}>점유율</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderLeft: BORDER, borderRight: DOUBLE, background: '#111111' }}>
                      <FmtOcc n={sumMonth?.otb.occ ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderRight: DOUBLE, background: '#111111' }}>
                      <FmtOcc n={sumMonth?.ly.occ ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: '#111111' }}>
                      <FmtGapPct n={sumMonth?.gap.occDiff ?? 0} fontColor="var(--color-text-primary)" />
                    </td>
                  </tr>
                  {/* Rev.PAR */}
                  <tr style={{ borderTop: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE, background: '#111111' }}>RevPAR</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderLeft: BORDER, borderRight: DOUBLE, background: '#111111' }}>
                      <FmtRevpar n={sumMonth?.otb.revpar ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderRight: DOUBLE, background: '#111111' }}>
                      <FmtRevpar n={sumMonth?.ly.revpar ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: '#111111' }}>
                      <FmtGapRevpar n={sumMonth?.gap.revparDiff ?? 0} fontColor="var(--color-text-primary)" />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* 우측 Account 증감 패널 */}
        <div style={{ width: 340, flexShrink: 0, border: '0.5px solid rgba(0,229,160,0.15)', borderLeft: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', background: 'radial-gradient(ellipse 80% 60% at 100% 100%, rgba(0,229,160,0.1) 0%, transparent 70%), #000000', alignSelf: 'stretch', maxHeight: 'calc(88vh - 120px)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#FFC850' }}>Account 증감</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
              {selectedSeg
                ? `${selectedSeg.label} · ${selectedSeg.viewMode === 'otb' ? '현재 OTB' : selectedSeg.viewMode === 'ly' ? '작년 OTB' : 'vs LY'}`
                : '세그먼트를 클릭하세요'}
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
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            {!selectedSeg ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
                <span style={{ fontSize: 18 }}>👆</span>
                <span>세그먼트를 클릭하세요</span>
              </div>
            ) : accountList.length === 0 ? (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: 12 }}>데이터가 없습니다.</div>
            ) : accountList.map((a, i) => {
              const isGap = selectedSeg?.viewMode === 'gap'
              return (
              <div key={`${a.name}-${i}`} style={{ padding: '6px 14px', borderBottom: '0.5px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                  {a.name}
                </span>
                <div style={{ display: 'flex', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: isGap ? (a.valRn > 0 ? '#00E5A0' : a.valRn < 0 ? '#E24B4A' : 'rgba(255,255,255,0.3)') : '#fff', width: 40, textAlign: 'right' }}>
                    {a.valRn === 0 ? '—' : (isGap && a.valRn > 0 ? '+' : '') + a.valRn}
                  </span>
                  <span style={{ fontSize: 11, color: isGap ? (a.valAdr > 0 ? '#00E5A0' : a.valAdr < 0 ? '#E24B4A' : 'rgba(255,255,255,0.3)') : '#fff', width: 52, textAlign: 'right' }}>
                    {a.valAdr === 0 ? '—' : (isGap && a.valAdr > 0 ? '+' : '') + scaleAdr(a.valAdr)}
                  </span>
                  <span style={{ fontSize: 11, color: isGap ? (a.valRev > 0 ? '#00E5A0' : a.valRev < 0 ? '#E24B4A' : 'rgba(255,255,255,0.3)') : '#fff', width: 56, textAlign: 'right' }}>
                    {a.valRev === 0 ? '—' : (isGap && a.valRev > 0 ? '+' : '') + scaleRev(a.valRev)}
                  </span>
                </div>
              </div>
              )
            })}
          </div>
        </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between px-6 py-3 shrink-0" style={{ borderTop: BORDER }}>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
            {onAccountDrillDown ? 'GAP 셀 클릭 → Account 보기' : ''}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#00E5A0', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>단위 : 실 · {adrUnit} · {revUnit}</span>
            {/* 단위 설정 */}
            <div className="unit-setting-wrap" style={{ position: 'relative' }}>
              <button
                onClick={() => setShowUnitSetting(v => !v)}
                style={{
                  width: 30, height: 30, borderRadius: 6,
                  border: '1px solid #00E5A0',
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
                  position: 'absolute', bottom: 'calc(100% + 6px)', right: 0,
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
          </div>
        </div>
      </div>
    </div>
  )
}
