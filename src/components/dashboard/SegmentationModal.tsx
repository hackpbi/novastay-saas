'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'
import { usePickupData } from '@/hooks/usePickupData'
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
  return n === 0 ? <Dash fontColor={fontColor} /> : <span style={{ color: fontColor }}>{Math.round(n / 1000)}k</span>
}
function FmtRev({ n, fontColor }: { n: number; fontColor?: string }) {
  return n === 0 ? <Dash fontColor={fontColor} /> : <span style={{ color: fontColor }}>{(n / 1_000_000).toFixed(1)}M</span>
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
  return <span style={{ color }}>{k > 0 ? '+' : ''}{k}k</span>
}
function DeltaRev({ v, fontColor }: { v: number; fontColor?: string }) {
  if (v === 0) return <Dash fontColor={fontColor} />
  const m = v / 1_000_000
  const color = m > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{m > 0 ? '+' : ''}{m.toFixed(1)}M</span>
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

const BORDER_GROUP = '1px solid var(--divider-color)'
const DOUBLE_GROUP = '1px solid rgba(0,229,160,0.3)'   // 섹션 구분선 (초록)

// ─── Seg code / label helpers ──────────────────────────────────────────────────

function getSegCodes(row: SegTableRow, schema: MarketSchemaRow[]): string[] {
  if (row.level === 'main') {
    return schema.filter(s => s.parent_id === row.id).flatMap(s => s.segmentation)
  }
  return schema.find(s => s.id === row.id)?.segmentation ?? []
}

function getRowLabel(row: SegTableRow, schema: MarketSchemaRow[]): string {
  if (row.level === 'sub') {
    const sr = schema.find(s => s.id === row.id)
    if (sr?.parent_id) {
      const parent = schema.find(p => p.id === sr.parent_id)
      if (parent) return `${parent.name} · ${row.name}`
    }
  }
  return row.name
}

// ─── DataRow ──────────────────────────────────────────────────────────────────

function DataRow({ row, schema, houRowIds, onPickupCellClick, onRowClick }: {
  row:               SegTableRow
  schema:            MarketSchemaRow[]
  houRowIds:         Set<string>
  onPickupCellClick?: (segCodes: string[], label: string) => void
  onRowClick?:        (segCodes: string[], label: string) => void
}) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const rowBg    = (isDark ? row.bgDarkColor  : row.bgLightColor)  ?? '#111111'
  const rowColor = (isDark ? row.fontDarkColor : row.fontLightColor) ?? 'var(--color-text-primary)'
  const nameColor = row.indent ? 'rgba(255,255,255,0.45)' : rowColor

  const isHou      = houRowIds.has(row.id)
  const segCodes   = getSegCodes(row, schema)
  const label      = getRowLabel(row, schema)
  const clickable  = !!onPickupCellClick && !isHou && segCodes.length > 0
  const handlePickup = clickable
    ? (e: React.MouseEvent) => { e.stopPropagation(); onPickupCellClick!(segCodes, label) }
    : undefined

  const rowClickable = !!onRowClick && !isHou && segCodes.length > 0
  const handleRowClick = rowClickable ? () => onRowClick!(segCodes, label) : undefined

  const puTd = (extra: React.CSSProperties): React.CSSProperties => ({
    ...tdBase, textAlign: 'right', cursor: clickable ? 'pointer' : 'default', background: rowBg, ...extra,
  })

  return (
    <tr
      style={{ borderBottom: BORDER_GROUP, color: rowColor, fontWeight: row.isBold ? 600 : 400, cursor: rowClickable ? 'pointer' : 'default' }}
      onClick={handleRowClick}
      onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${rowBg}` })}
      onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = rowBg })}
    >
      <td style={{ ...tdBase, paddingLeft: row.indent ? 28 : 12, minWidth: 140, borderRight: DOUBLE_GROUP, background: rowBg, color: nameColor }}>
        {row.indent ? (
          <>
            <span style={{ color: nameColor }}>└ </span>
            {row.name}
          </>
        ) : row.name}
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', background: rowBg }}>
        <FmtNights n={row.otbNights} fontColor={rowColor} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', background: rowBg }}>
        <FmtAdr n={row.otbAdr} fontColor={rowColor} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: DOUBLE_GROUP, background: rowBg }}>
        <FmtRev n={row.otbRevenue} fontColor={rowColor} />
      </td>
      <td className="font-mono" style={puTd({ borderLeft: DOUBLE_GROUP })} onClick={handlePickup}>
        <DeltaNights v={row.puNights} fontColor={rowColor} />
      </td>
      <td className="font-mono" style={puTd({})} onClick={handlePickup}>
        <DeltaAdr v={row.puAdr} fontColor={rowColor} />
      </td>
      <td className="font-mono" style={puTd({})} onClick={handlePickup}>
        <DeltaRev v={row.puRevenue} fontColor={rowColor} />
      </td>
    </tr>
  )
}

// ─── DataTable ─────────────────────────────────────────────────────────────────

function DataTable({ rows, summary, schema, houRowIds, onPickupCellClick, onRowClick, year, month, day, roomCount, curYear, curMonth, onPrevMonth, onNextMonth, canPrevMonth, canNextMonth }: {
  rows:               SegTableRow[]
  summary:            SegTableSummary
  schema:             MarketSchemaRow[]
  houRowIds:          Set<string>
  onPickupCellClick?: (segCodes: string[], label: string) => void
  onRowClick?:        (segCodes: string[], label: string) => void
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
          <tr>
            <th rowSpan={2} style={{ ...thBase, textAlign: 'left', borderRight: DOUBLE_GROUP, borderBottom: GRID_HEAD, verticalAlign: 'top', paddingTop: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 6 }}>SEGMENTATION</div>
              {day === undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={onPrevMonth} disabled={!canPrevMonth}
                    style={{ background: 'transparent', border: '1px solid var(--color-border-default)', borderRadius: 6, padding: '2px 4px', display: 'flex', alignItems: 'center', cursor: canPrevMonth ? 'pointer' : 'not-allowed', opacity: canPrevMonth ? 1 : 0.35, color: 'var(--color-text-secondary)' }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 600, textTransform: 'none', letterSpacing: 'normal', whiteSpace: 'nowrap' }}>
                    {curYear}년 {curMonth}월
                  </span>
                  <button
                    onClick={onNextMonth} disabled={!canNextMonth}
                    style={{ background: 'transparent', border: '1px solid var(--color-border-default)', borderRadius: 6, padding: '2px 4px', display: 'flex', alignItems: 'center', cursor: canNextMonth ? 'pointer' : 'not-allowed', opacity: canNextMonth ? 1 : 0.35, color: 'var(--color-text-secondary)' }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </th>
            <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: DOUBLE_GROUP, borderRight: DOUBLE_GROUP, height: 42, verticalAlign: 'middle' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>현재 OTB</div>
            </th>
            <th colSpan={3} style={{ ...thBase, textAlign: 'center', height: 42, verticalAlign: 'middle' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>PICKUP VS OTB</div>
            </th>
          </tr>
          <tr>
            <th style={{ ...thBase, textAlign: 'right', borderLeft: DOUBLE_GROUP, borderBottom: GRID_HEAD }}>R-N</th>
            <th style={{ ...thBase, textAlign: 'right', borderBottom: GRID_HEAD }}>ADR</th>
            <th style={{ ...thBase, textAlign: 'right', borderRight: DOUBLE_GROUP, borderBottom: GRID_HEAD }}>REV</th>
            <th style={{ ...thBase, textAlign: 'right', borderLeft: DOUBLE_GROUP, borderBottom: GRID_HEAD }}>ΔR-N</th>
            <th style={{ ...thBase, textAlign: 'right', borderBottom: GRID_HEAD }}>ΔADR</th>
            <th style={{ ...thBase, textAlign: 'right', borderBottom: GRID_HEAD }}>ΔREV</th>
          </tr>
        </thead>

        <tbody>
          {rows.map(row => (
            <DataRow
              key={row.id}
              row={row}
              schema={schema}
              houRowIds={houRowIds}
              onPickupCellClick={onPickupCellClick}
              onRowClick={onRowClick}
            />
          ))}
        </tbody>

        <tfoot>
          <tr>
            <td style={{ ...sumTdBase, paddingLeft: 12, borderRight: DOUBLE_GROUP }}>합계 (HOU 제외)</td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right' }}>
              <FmtNights n={summary.totalNights} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right' }}>
              <FmtAdr n={summary.totalAdr} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right', borderRight: DOUBLE_GROUP }}>
              <FmtRev n={summary.totalRevenue} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right', borderLeft: DOUBLE_GROUP }}>
              <DeltaNights v={summary.puNights} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right' }}>
              <DeltaAdr v={summary.puAdr} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right' }}>
              <DeltaRev v={summary.puRevenue} />
            </td>
          </tr>
          <tr style={{ borderTop: GRID }}>
            <td style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--brand-dimmed)', padding: '8px 12px', borderRight: DOUBLE_GROUP, borderBottom: GRID, background: '#111111' }}>OCC</td>
            <td colSpan={3} className="font-mono" style={{ ...footCell, color: 'var(--color-text-primary)', borderRight: DOUBLE_GROUP }}>
              {otbOcc.toFixed(1)}%
            </td>
            <td colSpan={3} className="font-mono" style={{ ...footCell, color: puColor(puOcc) }}>
              {fmtPuOcc(puOcc)}
            </td>
          </tr>
          <tr style={{ borderTop: GRID }}>
            <td style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--brand-dimmed)', padding: '8px 12px', borderRight: DOUBLE_GROUP, borderBottom: GRID, background: '#111111' }}>RevPAR</td>
            <td colSpan={3} className="font-mono" style={{ ...footCell, color: 'var(--color-text-primary)', borderRight: DOUBLE_GROUP }}>
              {Math.round(otbRevpar / 1000)}k
            </td>
            <td colSpan={3} className="font-mono" style={{ ...footCell, color: puColor(puRevpar) }}>
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

  const [accountModalSeg, setAccountModalSeg] = useState<{ segCodes: string[]; label: string } | null>(null)
  const [curYear,  setCurYear]  = useState(year)
  const [curMonth, setCurMonth] = useState(month)

  // 모달이 열릴 때 동기화 + 내부 AccountModal 초기화
  useEffect(() => {
    if (open) {
      setCurYear(year)
      setCurMonth(month)
      setAccountModalSeg(null)
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
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-4xl"
        style={{ maxHeight: '88vh', background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)' }}>
          {/* 1줄: 제목 + 닫기 */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Segmentation 비교
            </h2>
            <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
              <X size={22} />
            </button>
          </div>

          {/* 2줄: OTB + VS OTB DatePicker + 픽업 현황 */}
          <div className="flex items-center gap-2 mt-1">
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
                : `${days === 0 ? '당일' : `${days}일간`} 픽업 현황 입니다.`}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
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
              onPickupCellClick={
                onPickupCellClick
                  ? (segCodes, label) => onPickupCellClick(segCodes, label, curYear, curMonth)
                  : undefined
              }
              onRowClick={(segCodes, label) => setAccountModalSeg({ segCodes, label })}
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

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 shrink-0" style={{ borderTop: '1px solid var(--divider-color)' }}>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
            대분류 행 클릭 → Account 보기{onPickupCellClick ? ' · Pickup 셀 클릭 → Account 보기' : ''} · ESC로 닫기
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
