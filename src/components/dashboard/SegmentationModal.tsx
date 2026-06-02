'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'
import { usePickupData } from '@/hooks/usePickupData'
import {
  buildSegTable,
  type SegTableRow,
  type SegTableSummary,
  type MonthlyPickupCell,
} from '@/utils/segmentationTable'
import DatePicker from '@/components/DatePicker'

// ─── Formatters ────────────────────────────────────────────────────────────────

function Dash() {
  return <span style={{ color: 'var(--brand-dimmed)' }}>—</span>
}

function DeltaNights({ v }: { v: number }) {
  if (v === 0) return <Dash />
  const cls = v > 0 ? 'text-status-positive' : 'text-status-negative'
  return <span className={cls}>{v > 0 ? '+' : ''}{v.toLocaleString('ko-KR')}</span>
}

function DeltaAdr({ v }: { v: number }) {
  if (v === 0) return <Dash />
  const k = Math.round(v / 1000)
  if (k === 0) return <Dash />
  const cls = k > 0 ? 'text-status-positive' : 'text-status-negative'
  return <span className={cls}>{k > 0 ? '+' : ''}{k}k</span>
}

function DeltaRev({ v }: { v: number }) {
  if (v === 0) return <Dash />
  const m = v / 1_000_000
  const cls = m > 0 ? 'text-status-positive' : 'text-status-negative'
  return <span className={cls}>{m > 0 ? '+' : ''}{m.toFixed(1)}M</span>
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

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 3

const thBase: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--color-text-secondary)',
  padding: '6px 8px', background: 'var(--color-bg-elevated)', whiteSpace: 'nowrap',
}

const tdBase: React.CSSProperties = {
  padding: '6px 8px', verticalAlign: 'middle',
}

const BORDER = '1px solid var(--divider-color)'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatYYYYMM(mk: string): string {
  const [y, m] = mk.split('-')
  return `${y}.${m}`
}

function puColor(v: number): string {
  return v > 0.001 ? 'var(--color-accent-primary, #00E5A0)'
    : v < -0.001 ? 'var(--color-text-danger, #ef4444)'
    : 'var(--brand-dimmed)'
}

function fmtOcc(v: number): string {
  if (Math.abs(v) < 0.001) return '0.0%'
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%'
}

function fmtRevpar(v: number): string {
  const k = Math.round(v / 1000)
  if (k === 0) return '0k'
  return (k > 0 ? '+' : '') + k + 'k'
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

function DataRow({ row, schema, visibleMonths, houRowIds, onPickupCellClick }: {
  row:               SegTableRow
  schema:            MarketSchemaRow[]
  visibleMonths:     string[]
  houRowIds:         Set<string>
  onPickupCellClick?: (segCodes: string[], monthKey: string, label: string) => void
}) {
  const { theme } = useTheme()
  const isDark   = theme === 'dark'
  const rowBg    = (isDark ? row.bgDarkColor  : row.bgLightColor)  ?? 'var(--color-bg-secondary)'
  const rowColor = (isDark ? row.fontDarkColor : row.fontLightColor) ?? 'var(--color-text-primary)'

  const isHou     = houRowIds.has(row.id)
  const baseLabel = getRowLabel(row, schema)
  const canClick  = !!onPickupCellClick && !isHou && row.segmentationCodes.length > 0

  return (
    <tr
      style={{ borderBottom: BORDER, background: rowBg, color: rowColor, fontWeight: row.isBold ? 600 : 400 }}
      onMouseEnter={e => { e.currentTarget.style.background = `linear-gradient(var(--overlay-hover),var(--overlay-hover)),${rowBg}` }}
      onMouseLeave={e => { e.currentTarget.style.background = rowBg }}
    >
      {/* Segmentation 이름 */}
      <td style={{ ...tdBase, paddingLeft: row.indent ? 24 : 10, minWidth: 130 }}>
        {row.indent ? (
          <><span style={{ color: 'var(--brand-dimmed)' }}>└ </span>{row.name}</>
        ) : row.name}
      </td>

      {/* 월별 3컬럼씩 */}
      {visibleMonths.map(mk => {
        const cell  = row.monthlyPickup[mk] ?? { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 }
        const label = `${baseLabel} · ${formatYYYYMM(mk)}`
        const handleClick = canClick ? () => onPickupCellClick!(row.segmentationCodes, mk, label) : undefined
        const cur: React.CSSProperties = {
          ...tdBase, textAlign: 'right',
          cursor: canClick ? 'pointer' : 'default',
        }
        return (
          <React.Fragment key={mk}>
            <td className="font-mono" style={{ ...cur, borderLeft: BORDER }} onClick={handleClick}>
              <DeltaNights v={cell.pickupNights} />
            </td>
            <td className="font-mono" style={cur} onClick={handleClick}>
              <DeltaAdr v={cell.pickupAdr} />
            </td>
            <td className="font-mono" style={cur} onClick={handleClick}>
              <DeltaRev v={cell.pickupRevenue} />
            </td>
          </React.Fragment>
        )
      })}
    </tr>
  )
}

// ─── DataTable ─────────────────────────────────────────────────────────────────

function DataTable({ rows, summary, schema, houRowIds, visibleMonths, onPickupCellClick }: {
  rows:              SegTableRow[]
  summary:           SegTableSummary
  schema:            MarketSchemaRow[]
  houRowIds:         Set<string>
  visibleMonths:     string[]
  onPickupCellClick?: (segCodes: string[], monthKey: string, label: string) => void
}) {
  const sumTd: React.CSSProperties = {
    ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)',
  }

  return (
    <div>
      <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>

        {/* ── 헤더 ── */}
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          {/* 상단: 월 라벨 */}
          <tr>
            <th style={{ ...thBase, textAlign: 'left' }}>Segmentation</th>
            {visibleMonths.map(mk => (
              <th key={mk} colSpan={3}
                style={{ ...thBase, textAlign: 'center', borderLeft: BORDER }}>
                {formatYYYYMM(mk)}
              </th>
            ))}
          </tr>
          {/* 하단: ΔR-N ΔADR ΔREV */}
          <tr>
            <th style={{ ...thBase, textAlign: 'left', borderBottom: BORDER }} />
            {visibleMonths.map(mk => (
              <React.Fragment key={mk}>
                <th style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderBottom: BORDER }}>ΔR-N</th>
                <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔADR</th>
                <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔREV</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>

        {/* ── 본문 ── */}
        <tbody>
          {rows.map(row => (
            <DataRow
              key={row.id}
              row={row}
              schema={schema}
              visibleMonths={visibleMonths}
              houRowIds={houRowIds}
              onPickupCellClick={onPickupCellClick}
            />
          ))}
        </tbody>

        {/* ── 합계 / OCC / RevPAR ── */}
        <tfoot>
          {/* 합계 */}
          <tr style={{ borderTop: '2px solid var(--color-accent-primary)', background: 'var(--color-bg-secondary)' }}>
            <td style={{ ...sumTd, paddingLeft: 10 }}>합계 (HOU 제외)</td>
            {visibleMonths.map(mk => {
              const t = summary.monthlyTotals[mk] ?? { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 }
              return (
                <React.Fragment key={mk}>
                  <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: BORDER }}>
                    <DeltaNights v={t.pickupNights} />
                  </td>
                  <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}>
                    <DeltaAdr v={t.pickupAdr} />
                  </td>
                  <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}>
                    <DeltaRev v={t.pickupRevenue} />
                  </td>
                </React.Fragment>
              )
            })}
          </tr>

          {/* OCC */}
          <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
            <td style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', padding: '8px 10px' }}>
              OCC
            </td>
            {visibleMonths.map(mk => {
              const occ = summary.monthlyTotals[mk]?.occ ?? 0
              return (
                <td key={mk} colSpan={3} className="font-mono"
                  style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 8, fontWeight: 600, color: puColor(occ), borderLeft: BORDER }}>
                  {fmtOcc(occ)}
                </td>
              )
            })}
          </tr>

          {/* RevPAR */}
          <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
            <td style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', padding: '8px 10px' }}>
              Rev.PAR
            </td>
            {visibleMonths.map(mk => {
              const revpar = summary.monthlyTotals[mk]?.revpar ?? 0
              return (
                <td key={mk} colSpan={3} className="font-mono"
                  style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 8, fontWeight: 600, color: puColor(revpar), borderLeft: BORDER }}>
                  {fmtRevpar(revpar)}
                </td>
              )
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

const EMPTY_SUMMARY: SegTableSummary = {
  monthlyTotals: {},
  grandTotal:    { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 },
}

export default function SegmentationModal({
  open, onClose, year, month, roomCount, onPickupCellClick,
}: {
  open:               boolean
  onClose:            () => void
  year?:              number
  month?:             number
  roomCount:          number
  onPickupCellClick?: (segCodes: string[], monthKey: string, label: string) => void
}) {
  const { currentHotel } = useHotel()
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()
  const days = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0

  const { data: schema, loading: schemaLoading, error: schemaError } = useMarketSchema()
  const { data: pickup, loading: pickupLoading } = usePickupData()

  const loading = schemaLoading || pickupLoading

  const { rows, summary, monthKeys } = useMemo(
    () => !loading && schema.length > 0
      ? buildSegTable({ schema, pickup, roomCount })
      : { rows: [], summary: EMPTY_SUMMARY, monthKeys: [] },
    [schema, pickup, roomCount, loading],
  )

  const houRowIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of schema) {
      if (s.segmentation.includes('HOU')) ids.add(s.id)
    }
    return ids
  }, [schema])

  const [pageIndex, setPageIndex] = useState(0)
  const totalPages    = Math.max(1, Math.ceil(monthKeys.length / PAGE_SIZE))
  const visibleMonths = monthKeys.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE)

  // year/month가 있으면 해당 페이지로 초기화
  useEffect(() => {
    if (!open) return
    if (year !== undefined && month !== undefined && monthKeys.length > 0) {
      const target = `${year}-${String(month).padStart(2, '0')}`
      const idx    = monthKeys.indexOf(target)
      if (idx >= 0) { setPageIndex(Math.floor(idx / PAGE_SIZE)); return }
    }
    setPageIndex(0)
  }, [open, year, month, monthKeys])

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

  const subtitle =
    year !== undefined && month !== undefined
      ? `${year}년 ${month}월 · ${currentHotel?.hotel_name ?? ''}`
      : monthKeys.length > 0
        ? `${formatYYYYMM(monthKeys[0])} ~ ${formatYYYYMM(monthKeys[monthKeys.length - 1])} · ${currentHotel?.hotel_name ?? ''}`
        : currentHotel?.hotel_name ?? ''

  const error = schemaError

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[95vw] max-w-5xl"
        style={{ maxHeight: '90vh', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Segmentation 비교
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-dimmed)' }}>
              {subtitle}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} accent availableDates={otbDates} />
              <span className="text-xs" style={{ color: 'var(--brand-dimmed)' }}>vs</span>
              <DatePicker label="vs OTB" value={vsOtbDate} onChange={setVsOtbDate} availableDates={otbDates.filter(d => d < otbDate)} />
              <span className="text-xs" style={{ color: 'var(--brand-dimmed)' }}>
                {days === 0 ? '당일' : `${days}일간`} 픽업 현황 입니다.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPageIndex(p => Math.max(0, p - 1))}
                  disabled={pageIndex === 0}
                  className="text-brand-muted hover:text-accent-primary transition-colors disabled:opacity-30 p-0.5"
                  aria-label="이전 3개월"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)', minWidth: 48, textAlign: 'center' }}>
                  {pageIndex + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPageIndex(p => Math.min(totalPages - 1, p + 1))}
                  disabled={pageIndex === totalPages - 1}
                  className="text-brand-muted hover:text-accent-primary transition-colors disabled:opacity-30 p-0.5"
                  aria-label="다음 3개월"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1"
              aria-label="닫기"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <Skeleton />
          ) : error ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>데이터를 불러오지 못했습니다.</p>
          ) : rows.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>표시할 segmentation 데이터가 없습니다.</p>
          ) : (
            <DataTable
              rows={rows}
              summary={summary}
              schema={schema}
              houRowIds={houRowIds}
              visibleMonths={visibleMonths}
              onPickupCellClick={onPickupCellClick}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 shrink-0" style={{ borderTop: '1px solid var(--divider-color)' }}>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
            {onPickupCellClick ? 'Pickup 셀 클릭 → Account 보기 · ' : ''}ESC로 닫기
          </span>
        </div>
      </div>
    </div>
  )
}
