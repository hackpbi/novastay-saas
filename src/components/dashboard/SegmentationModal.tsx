'use client'

import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'
import { usePickupData } from '@/hooks/usePickupData'
import { buildSegTable, type SegTableRow, type SegTableSummary } from '@/utils/segmentationTable'

// ─── Number formatters ─────────────────────────────────────────────────────────

function Dash() {
  return <span style={{ color: 'var(--brand-dimmed)' }}>—</span>
}

function FmtNights({ n }: { n: number }) {
  return n === 0 ? <Dash /> : <>{n.toLocaleString('ko-KR')}</>
}

function FmtAdr({ n }: { n: number }) {
  return n === 0 ? <Dash /> : <>{Math.round(n / 1000)}k</>
}

function FmtRev({ n }: { n: number }) {
  return n === 0 ? <Dash /> : <>{(n / 1_000_000).toFixed(1)}M</>
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
  padding: '6px 10px', background: 'var(--color-bg-elevated)', whiteSpace: 'nowrap',
}

const tdBase: React.CSSProperties = {
  padding: '6px 10px', verticalAlign: 'middle',
}

const BORDER_GROUP = '1px solid var(--divider-color)'

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

function DataRow({ row, schema, houRowIds, onPickupCellClick }: {
  row:               SegTableRow
  schema:            MarketSchemaRow[]
  houRowIds:         Set<string>
  onPickupCellClick?: (segCodes: string[], label: string) => void
}) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const rowBg    = (isDark ? row.bgDarkColor  : row.bgLightColor)  ?? 'var(--color-bg-secondary)'
  const rowColor = (isDark ? row.fontDarkColor : row.fontLightColor) ?? 'var(--color-text-primary)'

  const isHou      = houRowIds.has(row.id)
  const segCodes   = getSegCodes(row, schema)
  const label      = getRowLabel(row, schema)
  const clickable  = !!onPickupCellClick && !isHou && segCodes.length > 0
  const handlePickup = clickable ? () => onPickupCellClick!(segCodes, label) : undefined

  const puTd = (extra: React.CSSProperties): React.CSSProperties => ({
    ...tdBase, textAlign: 'right', cursor: clickable ? 'pointer' : 'default', ...extra,
  })

  return (
    <tr
      style={{ borderBottom: BORDER_GROUP, background: rowBg, color: rowColor, fontWeight: row.isBold ? 600 : 400 }}
      onMouseEnter={e => {
        e.currentTarget.style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${rowBg}`
      }}
      onMouseLeave={e => { e.currentTarget.style.background = rowBg }}
    >
      <td style={{ ...tdBase, paddingLeft: row.indent ? 28 : 12, minWidth: 140 }}>
        {row.indent ? (
          <>
            <span style={{ color: 'var(--brand-dimmed)' }}>└ </span>
            {row.name}
          </>
        ) : row.name}
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: BORDER_GROUP }}>
        <FmtNights n={row.otbNights} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}>
        <FmtAdr n={row.otbAdr} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: BORDER_GROUP }}>
        <FmtRev n={row.otbRevenue} />
      </td>
      <td className="font-mono" style={puTd({ borderLeft: BORDER_GROUP })} onClick={handlePickup}>
        <DeltaNights v={row.puNights} />
      </td>
      <td className="font-mono" style={puTd({})} onClick={handlePickup}>
        <DeltaAdr v={row.puAdr} />
      </td>
      <td className="font-mono" style={puTd({})} onClick={handlePickup}>
        <DeltaRev v={row.puRevenue} />
      </td>
    </tr>
  )
}

// ─── DataTable ─────────────────────────────────────────────────────────────────

function DataTable({ rows, summary, schema, houRowIds, onPickupCellClick, year, month, roomCount }: {
  rows:               SegTableRow[]
  summary:            SegTableSummary
  schema:             MarketSchemaRow[]
  houRowIds:          Set<string>
  onPickupCellClick?: (segCodes: string[], label: string) => void
  year:               number
  month:              number
  roomCount:          number
}) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const capacity    = roomCount * daysInMonth
  const otbOcc     = summary.occ    // already computed in buildSegTable
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
    ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)', paddingTop: 8, paddingBottom: 8,
  }
  return (
    <div>
      <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          <tr>
            <th style={{ ...thBase, textAlign: 'left' }}>Segmentation</th>
            <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: BORDER_GROUP }}>현재 OTB</th>
            <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: BORDER_GROUP }}>Pickup vs OTB</th>
          </tr>
          <tr>
            <th style={{ ...thBase, textAlign: 'left', borderBottom: BORDER_GROUP }} />
            <th style={{ ...thBase, textAlign: 'right', borderLeft: BORDER_GROUP, borderBottom: BORDER_GROUP }}>R-N</th>
            <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER_GROUP }}>ADR</th>
            <th style={{ ...thBase, textAlign: 'right', borderRight: BORDER_GROUP, borderBottom: BORDER_GROUP }}>REV</th>
            <th style={{ ...thBase, textAlign: 'right', borderLeft: BORDER_GROUP, borderBottom: BORDER_GROUP }}>ΔR-N</th>
            <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER_GROUP }}>ΔADR</th>
            <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER_GROUP }}>ΔREV</th>
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
            />
          ))}
        </tbody>

        <tfoot>
          <tr style={{ borderTop: '2px solid var(--color-accent-primary)', background: 'var(--color-bg-secondary)' }}>
            <td style={{ ...sumTdBase, paddingLeft: 12 }}>합계 (HOU 제외)</td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right', borderLeft: BORDER_GROUP }}>
              <FmtNights n={summary.totalNights} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right' }}>
              <FmtAdr n={summary.totalAdr} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right', borderRight: BORDER_GROUP }}>
              <FmtRev n={summary.totalRevenue} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right', borderLeft: BORDER_GROUP }}>
              <DeltaNights v={summary.puNights} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right' }}>
              <DeltaAdr v={summary.puAdr} />
            </td>
            <td className="font-mono" style={{ ...sumTdBase, textAlign: 'right' }}>
              <DeltaRev v={summary.puRevenue} />
            </td>
          </tr>
          <tr style={{ borderTop: '1px solid var(--divider-color)', background: 'var(--color-bg-secondary)' }}>
            <td style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--brand-dimmed)', padding: '8px 12px' }}>OCC</td>
            <td colSpan={3} className="font-mono" style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 8, fontWeight: 600, color: 'var(--color-text-primary)', borderLeft: BORDER_GROUP }}>
              {otbOcc.toFixed(1)}%
            </td>
            <td colSpan={3} className="font-mono" style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 8, fontWeight: 600, color: puColor(puOcc), borderLeft: BORDER_GROUP }}>
              {fmtPuOcc(puOcc)}
            </td>
          </tr>
          <tr style={{ borderTop: '1px solid var(--divider-color)', background: 'var(--color-bg-secondary)' }}>
            <td style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--brand-dimmed)', padding: '8px 12px' }}>RevPAR</td>
            <td colSpan={3} className="font-mono" style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 8, fontWeight: 600, color: 'var(--color-text-primary)', borderLeft: BORDER_GROUP }}>
              {Math.round(otbRevpar / 1000)}k
            </td>
            <td colSpan={3} className="font-mono" style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 8, fontWeight: 600, color: puColor(puRevpar), borderLeft: BORDER_GROUP }}>
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
  open, onClose, year, month, roomCount, onPickupCellClick,
}: {
  open:               boolean
  onClose:            () => void
  year:               number
  month:              number
  roomCount:          number
  onPickupCellClick?: (segCodes: string[], label: string) => void
}) {
  const { currentHotel } = useHotel()
  const { data: schema, loading: schemaLoading, error: schemaError } = useMarketSchema()
  const { data: pickup, loading: pickupLoading } = usePickupData()

  const loading = schemaLoading || pickupLoading

  const { rows, summary } = useMemo(
    () => !loading && schema.length > 0
      ? buildSegTable({ schema, pickup, year, month, roomCount })
      : { rows: [], summary: EMPTY_SUMMARY },
    [schema, pickup, year, month, roomCount, loading],
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
        style={{ maxHeight: '88vh', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Segmentation 비교
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-dimmed)' }}>
              {year}년 {month}월 · {currentHotel?.hotel_name ?? ''}
            </p>
          </div>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
            <X size={22} />
          </button>
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
              onPickupCellClick={onPickupCellClick}
              year={year}
              month={month}
              roomCount={roomCount}
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
