'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useDateContext } from '@/contexts/DateContext'
import { useHotel } from '@/contexts/HotelContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'
import { usePickupData } from '@/hooks/usePickupData'
import { useAccountPickupData } from '@/hooks/useAccountPickupData'
import { buildSegTable, type SegTableRow, type SegTableSummary } from '@/utils/segmentationTable'
import DatePicker from '@/components/DatePicker'
import AccountModal from '@/components/dashboard/AccountModal'

// ─── Number formatters ─────────────────────────────────────────────────────────

function Dash({ fontColor }: { fontColor?: string }) {
  return <span style={{ color: fontColor ?? 'var(--brand-dimmed)' }}>—</span>
}

// 현재 OTB 수치 — 항상 fontColor(없으면 상속), 음수도 fontColor
function FmtNights({ n, fontColor }: { n: number; fontColor?: string }) {
  return n === 0 ? <Dash fontColor={fontColor} /> : <span style={{ color: fontColor }}>{n.toLocaleString('ko-KR')}</span>
}
function FmtAdr({ n, fontColor }: { n: number; fontColor?: string }) {
  return n === 0 ? <Dash fontColor={fontColor} /> : <span style={{ color: fontColor }}>{Math.round(n / 1000)}<span style={{ fontSize: '0.7em', marginLeft: 1 }}>k</span></span>
}
function FmtRev({ n, fontColor }: { n: number; fontColor?: string }) {
  return n === 0 ? <Dash fontColor={fontColor} /> : <span style={{ color: fontColor }}>{(n / 1_000_000).toFixed(1)}<span style={{ fontSize: '0.7em', marginLeft: 1 }}>M</span></span>
}
// Pickup(Δ) — 양수 fontColor(없으면 흰색), 음수 red, 0/Dash fontColor
function DeltaNights({ v, fontColor }: { v: number; fontColor?: string }) {
  if (v === 0) return <Dash fontColor={fontColor} />
  const color = v > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{v > 0 ? '+' : ''}{v.toLocaleString('ko-KR')}</span>
}
function DeltaAdr({ v, fontColor }: { v: number; fontColor?: string }) {
  if (v === 0) return <Dash fontColor={fontColor} />
  const k = Math.round(v / 1000)
  if (k === 0) return <Dash fontColor={fontColor} />
  const color = k > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{k > 0 ? '+' : ''}{k}<span style={{ fontSize: '0.7em', marginLeft: 1 }}>k</span></span>
}
function DeltaRev({ v, fontColor }: { v: number; fontColor?: string }) {
  if (v === 0) return <Dash fontColor={fontColor} />
  const m = v / 1_000_000
  const color = m > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{m > 0 ? '+' : ''}{m.toFixed(1)}<span style={{ fontSize: '0.7em', marginLeft: 1 }}>M</span></span>
}

// ─── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 p-3 rounded-lg" style={{ background: 'var(--color-bg-elevated)' }}>
      <p style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: 'var(--color-text-secondary)', marginBottom: 4,
      }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono, monospace)' }}>
        {value}
      </p>
    </div>
  )
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded" style={{ height: 36, background: 'var(--color-bg-tertiary)' }} />
      ))}
    </div>
  )
}

// ─── Table constants ────────────────────────────────────────────────────────────

const thBase: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--color-text-secondary)',
  padding: '6px 10px', background: '#0a0a0a', whiteSpace: 'nowrap',
}

const GRID = '0.5px solid rgba(255,255,255,0.06)'
const GRID_HEAD = '0.5px solid rgba(255,255,255,0.12)'

const tdBase: React.CSSProperties = {
  padding: '6px 10px', verticalAlign: 'middle', borderBottom: GRID,
}

// OTB / PICK-UP 6개 숫자 컬럼 공통 너비 (좌우 그룹 간격 동일화)
const NUM_COL_MIN = 60

const BORDER_GROUP = '1px solid var(--divider-color)'
const DOUBLE_GROUP = '1px solid rgba(0,229,160,0.3)'   // 섹션 구분선 (초록)

// ─── Seg code / label helpers ──────────────────────────────────────────────────

function getSegCodes(row: SegTableRow, schema: MarketSchemaRow[]): string[] {
  if (row.level === 'main') {
    return schema.filter(s => s.parent_id === row.id).flatMap(s => s.segmentation)
  }
  return schema.find(s => s.id === row.id)?.segmentation ?? []
}

// ─── DataRow ──────────────────────────────────────────────────────────────────

function DataRow({ row, schema, houRowIds, onSelect, selectedLabel, selectedViewMode }: {
  row:               SegTableRow
  schema:            MarketSchemaRow[]
  houRowIds:         Set<string>
  onSelect?:         (segCodes: string[], label: string, viewMode: 'otb' | 'pickup') => void
  selectedLabel?:    string
  selectedViewMode?: 'otb' | 'pickup'
}) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const rowBg    = (isDark ? row.bgDarkColor  : row.bgLightColor)  ?? '#111111'
  const rowColor = (isDark ? row.fontDarkColor : row.fontLightColor) ?? 'var(--color-text-primary)'
  const nameColor = row.indent ? 'rgba(255,255,255,0.45)' : rowColor

  const isHou        = houRowIds.has(row.id)
  const segCodes     = getSegCodes(row, schema)
  const selectable   = !!onSelect && !isHou && segCodes.length > 0
  const nameSelectable = selectable && !row.indent   // 대분류 이름 셀만 클릭
  const isSelected   = selectable && selectedLabel === row.name
  const baseBg       = isSelected ? 'rgba(0,229,160,0.08)' : rowBg
  const handleOtbSelect    = selectable ? () => onSelect!(segCodes, row.name, 'otb')    : undefined
  const handlePickupSelect = selectable ? () => onSelect!(segCodes, row.name, 'pickup') : undefined

  const puTd = (extra: React.CSSProperties): React.CSSProperties => ({
    ...tdBase, textAlign: 'right', minWidth: NUM_COL_MIN, cursor: selectable ? 'pointer' : 'default', background: baseBg, ...extra,
  })

  return (
    <tr
      style={{ borderBottom: BORDER_GROUP, color: rowColor, fontWeight: row.isBold ? 600 : 400 }}
      onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${baseBg}` })}
      onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = baseBg })}
    >
      <td
        onClick={nameSelectable ? handlePickupSelect : undefined}
        style={{ ...tdBase, paddingLeft: row.indent ? 28 : 12, minWidth: 140, background: baseBg, color: nameColor, cursor: nameSelectable ? 'pointer' : 'default' }}
      >
        {row.indent ? (
          <>
            <span style={{ color: nameColor }}>└ </span>
            {row.name}
          </>
        ) : row.name}
      </td>
      <td className="font-mono" onClick={handleOtbSelect} style={{ ...tdBase, textAlign: 'right', minWidth: NUM_COL_MIN, borderLeft: isSelected && selectedViewMode === 'otb' ? '3px solid #00E5A0' : DOUBLE_GROUP, background: baseBg, cursor: selectable ? 'pointer' : 'default' }}>
        <FmtNights n={row.otbNights} fontColor={rowColor} />
      </td>
      <td className="font-mono" onClick={handleOtbSelect} style={{ ...tdBase, textAlign: 'right', minWidth: NUM_COL_MIN, borderLeft: GRID, background: baseBg, cursor: selectable ? 'pointer' : 'default' }}>
        <FmtAdr n={row.otbAdr} fontColor={rowColor} />
      </td>
      <td className="font-mono" onClick={handleOtbSelect} style={{ ...tdBase, textAlign: 'right', minWidth: NUM_COL_MIN, borderLeft: GRID, background: baseBg, cursor: selectable ? 'pointer' : 'default' }}>
        <FmtRev n={row.otbRevenue} fontColor={rowColor} />
      </td>
      <td className="font-mono" style={puTd({ borderLeft: isSelected && selectedViewMode === 'pickup' ? '3px solid #00E5A0' : DOUBLE_GROUP })} onClick={handlePickupSelect}>
        <DeltaNights v={row.puNights} fontColor={rowColor} />
      </td>
      <td className="font-mono" style={puTd({ borderLeft: GRID })} onClick={handlePickupSelect}>
        <DeltaAdr v={row.puAdr} fontColor={rowColor} />
      </td>
      <td className="font-mono" style={puTd({ borderLeft: GRID })} onClick={handlePickupSelect}>
        <DeltaRev v={row.puRevenue} fontColor={rowColor} />
      </td>
    </tr>
  )
}

// ─── DataTable ─────────────────────────────────────────────────────────────────

function DataTable({ rows, summary, schema, houRowIds, onSelect, selectedLabel, selectedViewMode, year, month, day, roomCount, curYear, curMonth, onPrevMonth, onNextMonth, canPrevMonth, canNextMonth }: {
  rows:               SegTableRow[]
  summary:            SegTableSummary
  schema:             MarketSchemaRow[]
  houRowIds:          Set<string>
  onSelect?:          (segCodes: string[], label: string, viewMode: 'otb' | 'pickup') => void
  selectedLabel?:     string
  selectedViewMode?:  'otb' | 'pickup'
  year:               number
  month:              number
  day?:               number
  roomCount:          number
  curYear:            number
  curMonth:           number
  onPrevMonth:        () => void
  onNextMonth:        () => void
  canPrevMonth:       boolean
  canNextMonth:       boolean
}) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const days        = day !== undefined ? 1 : daysInMonth
  const capacity    = roomCount * days
  const otbOcc     = summary.occ    // already computed in buildSegTable (day-aware)
  const otbRevpar  = summary.revpar
  const puOcc      = capacity > 0 ? (summary.puNights  / capacity) * 100  : 0
  const puRevpar   = capacity > 0 ?  summary.puRevenue / capacity          : 0

  const puColor = (v: number) =>
    v > 0.001 ? 'var(--color-accent-primary, #00E5A0)'
    : v < -0.001 ? 'var(--color-text-danger, #ef4444)'
    : 'var(--brand-dimmed)'

  const fmtPuOcc = (v: number) =>
    v === 0 ? '0.0%' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'
  const fmtPuRevpar = (v: number) => {
    const k = Math.round(v / 1000)
    return k === 0 ? '0k' : (k > 0 ? '+' : '') + k + 'k'
  }

  const sumTdBase: React.CSSProperties = {
    ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)', paddingTop: 8, paddingBottom: 8, background: '#111111',
    borderTop: '1px solid rgba(0,229,160,0.6)',   // 합계 행 위 초록선 (separate 모드: 셀 보더만 렌더)
  }
  const footCell: React.CSSProperties = { textAlign: 'center', paddingTop: 8, paddingBottom: 8, fontWeight: 600, borderBottom: GRID, background: '#111111' }
  return (
    <div>
      <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          {/* 0줄: 월 네비게이션 — 표 상단 가운데 */}
          {day === undefined && (
            <tr>
              <th colSpan={7} style={{ ...thBase, height: 36, verticalAlign: 'top', padding: 0, borderBottom: GRID }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={onPrevMonth} disabled={!canPrevMonth}
                    style={{ background: 'transparent', border: '1px solid var(--color-border-default)', borderRadius: 6, padding: '2px 4px', display: 'flex', alignItems: 'center', cursor: canPrevMonth ? 'pointer' : 'not-allowed', opacity: canPrevMonth ? 1 : 0.35, color: 'var(--color-text-secondary)' }}
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', textTransform: 'none', letterSpacing: 'normal', whiteSpace: 'nowrap' }}>
                    {curYear}년 {curMonth}월
                  </span>
                  <button
                    onClick={onNextMonth} disabled={!canNextMonth}
                    style={{ background: 'transparent', border: '1px solid var(--color-border-default)', borderRadius: 6, padding: '2px 4px', display: 'flex', alignItems: 'center', cursor: canNextMonth ? 'pointer' : 'not-allowed', opacity: canNextMonth ? 1 : 0.35, color: 'var(--color-text-secondary)' }}
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </th>
            </tr>
          )}
          {/* 1줄: 섹션 헤더 */}
          <tr>
            <th rowSpan={2} style={{ ...thBase, textAlign: 'left', borderBottom: GRID_HEAD, verticalAlign: 'middle' }}>세그먼트</th>
            <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: DOUBLE_GROUP, height: 42, verticalAlign: 'middle' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>현재 OTB</div>
            </th>
            <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: DOUBLE_GROUP, height: 42, verticalAlign: 'middle' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>PICK-UP</div>
            </th>
          </tr>
          {/* 2줄: 컬럼명 */}
          <tr>
            <th style={{ ...thBase, textAlign: 'right', minWidth: NUM_COL_MIN, borderLeft: DOUBLE_GROUP, borderBottom: GRID_HEAD }}>객실</th>
            <th style={{ ...thBase, textAlign: 'right', minWidth: NUM_COL_MIN, borderLeft: GRID, borderBottom: GRID_HEAD }}>객단가</th>
            <th style={{ ...thBase, textAlign: 'right', minWidth: NUM_COL_MIN, borderLeft: GRID, borderBottom: GRID_HEAD }}>매출</th>
            <th style={{ ...thBase, textAlign: 'right', minWidth: NUM_COL_MIN, borderLeft: DOUBLE_GROUP, borderBottom: GRID_HEAD }}>Δ객실</th>
            <th style={{ ...thBase, textAlign: 'right', minWidth: NUM_COL_MIN, borderLeft: GRID, borderBottom: GRID_HEAD }}>Δ객단가</th>
            <th style={{ ...thBase, textAlign: 'right', minWidth: NUM_COL_MIN, borderLeft: GRID, borderBottom: GRID_HEAD }}>Δ매출</th>
          </tr>
        </thead>

        <tbody>
          {rows.map(row => (
            <DataRow
              key={row.id}
              row={row}
              schema={schema}
              houRowIds={houRowIds}
              onSelect={onSelect}
              selectedLabel={selectedLabel}
              selectedViewMode={selectedViewMode}
            />
          ))}
        </tbody>

        <tfoot>
          <tr>
            <td style={{ ...sumTdBase, paddingLeft: 12 }}>합계 (HOU 제외)</td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right', borderLeft: DOUBLE_GROUP }}>
              <FmtNights n={summary.totalNights} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right', borderLeft: GRID }}>
              <FmtAdr n={summary.totalAdr} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right', borderLeft: GRID }}>
              <FmtRev n={summary.totalRevenue} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right', borderLeft: DOUBLE_GROUP }}>
              <DeltaNights v={summary.puNights} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right', borderLeft: GRID }}>
              <DeltaAdr v={summary.puAdr} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right', borderLeft: GRID }}>
              <DeltaRev v={summary.puRevenue} />
            </td>
          </tr>
          <tr style={{ borderTop: GRID }}>
            <td style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--brand-dimmed)', padding: '8px 12px', borderBottom: GRID, background: '#111111' }}>점유율</td>
            <td colSpan={3} className="font-mono" style={{ ...footCell, color: 'var(--color-text-primary)', borderLeft: DOUBLE_GROUP }}>
              {otbOcc.toFixed(1)}%
            </td>
            <td colSpan={3} className="font-mono" style={{ ...footCell, color: puColor(puOcc), borderLeft: DOUBLE_GROUP }}>
              {fmtPuOcc(puOcc)}
            </td>
          </tr>
          <tr style={{ borderTop: GRID }}>
            <td style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--brand-dimmed)', padding: '8px 12px', borderBottom: GRID, background: '#111111' }}>RevPAR</td>
            <td colSpan={3} className="font-mono" style={{ ...footCell, color: 'var(--color-text-primary)', borderLeft: DOUBLE_GROUP }}>
              {Math.round(otbRevpar / 1000)}k
            </td>
            <td colSpan={3} className="font-mono" style={{ ...footCell, color: puColor(puRevpar), borderLeft: DOUBLE_GROUP }}>
              {fmtPuRevpar(puRevpar)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

const EMPTY_SUMMARY: SegTableSummary = {
  totalNights: 0, totalAdr: 0, totalRevenue: 0,
  puNights: 0, puAdr: 0, puRevenue: 0,
  occ: 0, revpar: 0,
}

export default function SegmentationModal({
  open, onClose, year, month, day, roomCount, onPickupCellClick,
}: {
  open:               boolean
  onClose:            () => void
  year:               number
  month:              number
  day?:               number
  roomCount:          number
  onPickupCellClick?: (segCodes: string[], label: string, year: number, month: number) => void
}) {
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()
  const { currentHotel } = useHotel()

  const [accountModalSeg, setAccountModalSeg] = useState<{ segCodes: string[]; label: string } | null>(null)
  // 우측 Account Pickup 패널: 선택된 세그먼트 (이름/픽업 셀 클릭 시 set)
  const [selectedSeg, setSelectedSeg] = useState<{ label: string; codes: string[]; viewMode: 'otb' | 'pickup' } | null>(null)
  const [curYear,  setCurYear]  = useState(year)
  const [curMonth, setCurMonth] = useState(month)

  // 모달이 열릴 때 동기화 + 내부 AccountModal 초기화
  useEffect(() => {
    if (open) {
      setCurYear(year)
      setCurMonth(month)
      setAccountModalSeg(null)
      setSelectedSeg(null)
    }
  }, [open, year, month])

  // 6개월 범위 (year/month ~ +5개월)
  const monthRange = useMemo(() => {
    const months: { year: number; month: number }[] = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(year, (month - 1) + i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
    }
    return months
  }, [year, month])

  const currentIndex = monthRange.findIndex(m => m.year === curYear && m.month === curMonth)
  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < monthRange.length - 1
  const goPrev = () => { if (canGoPrev) { const t = monthRange[currentIndex - 1]; setCurYear(t.year); setCurMonth(t.month) } }
  const goNext = () => { if (canGoNext) { const t = monthRange[currentIndex + 1]; setCurYear(t.year); setCurMonth(t.month) } }

  const days = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0
  const { data: schema, loading: schemaLoading, error: schemaError } = useMarketSchema()
  const { data: pickup, loading: pickupLoading } = usePickupData()

  const loading = schemaLoading || pickupLoading

  const { rows, summary } = useMemo(
    () => !loading && schema.length > 0
      ? buildSegTable({ schema, pickup, year: curYear, month: curMonth, roomCount, day })
      : { rows: [], summary: EMPTY_SUMMARY },
    [schema, pickup, curYear, curMonth, day, roomCount, loading],
  )

  const houRowIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of schema) {
      if (s.segmentation.includes('HOU')) ids.add(s.id)
    }
    return ids
  }, [schema])

  // ─── 우측 Account Pickup 패널 데이터 ───────────────────────────────────────────
  const { data: accountPickupRows = [] } = useAccountPickupData({
    hotelId:     currentHotel?.id ?? '',
    otbDate:     otbDate ?? '',
    vsDate:      vsOtbDate ?? '',
    year:        curYear,
    month:       curMonth,
    segFilter:   null,
    isPastMonth: false,
  })

  const accountList = useMemo(() => {
    if (!selectedSeg) return []
    return (accountPickupRows as Array<{ account_name: string; segmentation: string; otb_nights: number; vs_nights: number; otb_revenue: number; vs_revenue: number }>)
      .filter(r => selectedSeg.codes.includes(r.segmentation))
      .map(r => selectedSeg.viewMode === 'otb'
        ? {
            name:    r.account_name,
            diffRn:  r.otb_nights,                                         // 현재 OTB 실판매
            diffAdr: r.otb_nights > 0 ? Math.round(r.otb_revenue / r.otb_nights) : 0,
            diffRev: r.otb_revenue,
            otbRn:   r.otb_nights,
            otbRev:  r.otb_revenue,
          }
        : {
            name:    r.account_name,
            diffRn:  r.otb_nights - r.vs_nights,    // 픽업 = 현재OTB - vsOTB
            diffAdr: r.otb_revenue && r.otb_nights
              ? Math.round((r.otb_revenue / r.otb_nights) - (r.vs_nights ? r.vs_revenue / r.vs_nights : 0))
              : 0,
            diffRev: r.otb_revenue - r.vs_revenue,
            otbRn:   r.otb_nights,
            otbRev:  r.otb_revenue,
          })
      // OTB 모드: OTB 실판매 기준 / 픽업 모드: 픽업(R/N) 0인 어카운트 숨김
      .filter(a => selectedSeg?.viewMode === 'otb'
        ? (a.otbRn !== 0 || a.otbRev !== 0)
        : (a.diffRn !== 0 || a.diffRev !== 0))
      .sort((a, b) => b.diffRn - a.diffRn)
  }, [selectedSeg, accountPickupRows])

  const isOtb = selectedSeg?.viewMode === 'otb'

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const error = schemaError

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-[1200px]"
        style={{ maxHeight: '88vh', background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="px-6 py-3 shrink-0 flex items-center gap-3" style={{ borderBottom: '1px solid var(--divider-color)' }}>
          <h2 className="text-base font-semibold shrink-0" style={{ color: 'var(--color-text-primary)' }}>
            세그먼트별 픽업
          </h2>
          <div className="flex items-center gap-2">
            <DatePicker
              label="OTB"
              value={otbDate}
              onChange={setOtbDate}
              availableDates={otbDates}
              accent
              bare
            />
            <DatePicker
              label="VS OTB"
              value={vsOtbDate}
              onChange={setVsOtbDate}
              availableDates={otbDates.filter(d => d < otbDate)}
              bare
            />
            <span className="text-xs" style={{ color: 'var(--brand-dimmed)' }}>
              {day !== undefined
                ? `${curYear}년 ${curMonth}월 ${day}일`
                : `${days === 0 ? '당일' : `${days}일간`} 픽업`}
            </span>
          </div>
          <div className="ml-auto">
            <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Body: 좌측 테이블 + 우측 Account Pickup 패널 */}
        <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
          <div className="overflow-y-auto px-6 py-4" style={{ width: 'calc(100% - 300px)', flexShrink: 0 }}>
            {loading ? (
              <Skeleton />
            ) : error ? (
              <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>데이터를 불러오지 못했습니다.</p>
            ) : rows.length === 0 ? (
              <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>이 기간에 표시할 segmentation 데이터가 없습니다.</p>
            ) : (
              <DataTable
                rows={rows}
                summary={summary}
                schema={schema}
                houRowIds={houRowIds}
                onSelect={(segCodes, label, viewMode) => setSelectedSeg({ label, codes: segCodes, viewMode })}
                selectedLabel={selectedSeg?.label}
                selectedViewMode={selectedSeg?.viewMode}
                year={curYear}
                month={curMonth}
                day={day}
                roomCount={roomCount}
                curYear={curYear}
                curMonth={curMonth}
                onPrevMonth={goPrev}
                onNextMonth={goNext}
                canPrevMonth={canGoPrev}
                canNextMonth={canGoNext}
              />
            )}
          </div>

          {/* 우측 Account Pickup 패널 */}
          <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--divider-color)', display: 'flex', flexDirection: 'column', background: '#0a0a0a', minHeight: 0 }}>
            <div className="px-3 pt-3 pb-2 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#FFC850' }}>어카운트 픽업</div>
              <div style={{ fontSize: 10, color: 'var(--brand-dimmed)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedSeg ? `${selectedSeg.label} · ${curYear}.${String(curMonth).padStart(2, '0')} · ${selectedSeg.viewMode === 'otb' ? '현재 OTB' : '픽업 객실 기준'}` : '세그먼트를 클릭하세요'}
              </div>
              <button
                onClick={() => {
                  if (!selectedSeg) return
                  if (onPickupCellClick) onPickupCellClick(selectedSeg.codes, selectedSeg.label, curYear, curMonth)
                  else setAccountModalSeg({ segCodes: selectedSeg.codes, label: selectedSeg.label })
                }}
                disabled={!selectedSeg}
                style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent',
                  color: selectedSeg ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)',
                  cursor: selectedSeg ? 'pointer' : 'default',
                  marginTop: 4,
                }}
              >
                전체 어카운트 보기
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
              {accountList.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--brand-dimmed)', padding: 12 }}>
                  {selectedSeg ? '픽업 데이터가 없습니다.' : ''}
                </div>
              ) : (
                <>
                  {/* 리스트 헤더 */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '5px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                    <span className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', flex: 1 }}>어카운트</span>
                    <div style={{ display: 'flex', flexShrink: 0 }}>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 52, textAlign: 'right' }}>객실</span>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 56, textAlign: 'right' }}>객단가</span>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 60, textAlign: 'right' }}>매출</span>
                    </div>
                  </div>
                  {accountList.map((a, i) => (
                    <div
                      key={`${a.name}-${i}`}
                      className="font-mono"
                      style={{ padding: '6px 14px', borderBottom: '0.5px solid #1a1a1a', display: 'flex', alignItems: 'center' }}
                    >
                      <span className="font-mono" style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {a.name}
                      </span>
                      <div style={{ display: 'flex', flexShrink: 0 }}>
                        <span className="font-mono" style={{ fontSize: 11, color: isOtb ? (a.diffRn < 0 ? '#E24B4A' : '#fff') : (a.diffRn >= 0 ? '#00E5A0' : '#E24B4A'), width: 52, textAlign: 'right' }}>
                          {isOtb ? (a.diffRn === 0 ? '—' : a.diffRn) : `${a.diffRn >= 0 ? '+' : ''}${a.diffRn}`}
                        </span>
                        <span className="font-mono" style={{ fontSize: 11, color: isOtb ? (a.diffAdr < 0 ? '#E24B4A' : '#fff') : (a.diffAdr >= 0 ? '#00E5A0' : '#E24B4A'), width: 56, textAlign: 'right' }}>
                          {isOtb
                            ? (a.diffAdr === 0 ? '—' : <>{Math.round(a.diffAdr / 1000)}<span style={{ fontSize: '0.7em', marginLeft: 1 }}>k</span></>)
                            : (a.diffAdr === 0 ? '—' : <>{(a.diffAdr > 0 ? '+' : '') + Math.round(a.diffAdr / 1000)}<span style={{ fontSize: '0.7em', marginLeft: 1 }}>k</span></>)}
                        </span>
                        <span className="font-mono" style={{ fontSize: 11, color: isOtb ? (a.diffRev < 0 ? '#E24B4A' : '#fff') : (a.diffRev >= 0 ? '#00E5A0' : '#E24B4A'), width: 60, textAlign: 'right' }}>
                          {isOtb
                            ? (a.diffRev === 0 ? '—' : <>{(a.diffRev / 1_000_000).toFixed(1)}<span style={{ fontSize: '0.7em', marginLeft: 1 }}>M</span></>)
                            : (a.diffRev === 0 ? '—' : <>{(a.diffRev >= 0 ? '+' : '') + (a.diffRev / 1_000_000).toFixed(1)}<span style={{ fontSize: '0.7em', marginLeft: 1 }}>M</span></>)}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 shrink-0" style={{ borderTop: '1px solid var(--divider-color)' }}>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
            세그먼트 · Pickup 셀 클릭 → 우측 Account Pickup · ESC로 닫기
          </span>
        </div>
      </div>

      {accountModalSeg && (
        <AccountModal
          open
          onClose={() => setAccountModalSeg(null)}
          year={curYear}
          month={curMonth}
          roomCount={roomCount}
          initialFilterSegCodes={accountModalSeg.segCodes}
          initialFilterLabel={accountModalSeg.label}
          onBackToSeg={(backYear, backMonth) => {
            setCurYear(backYear)
            setCurMonth(backMonth)
            setAccountModalSeg(null)
          }}
        />
      )}
    </div>
  )
}
