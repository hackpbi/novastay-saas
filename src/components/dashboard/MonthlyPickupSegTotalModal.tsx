'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useDateContext } from '@/contexts/DateContext'
import DatePicker from '@/components/DatePicker'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { usePickupData } from '@/hooks/usePickupData'
import {
  buildMonthlyPickupSegTable,
  type MonthlyPickupCell,
} from '@/utils/monthlyPickupSegTable'

// ─── Constants ─────────────────────────────────────────────────────────────────

const thBase: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--color-text-secondary)',
  padding: '0px 10px', height: 30, verticalAlign: 'middle',
  background: 'var(--color-bg-elevated)', whiteSpace: 'nowrap',
}
const tdBase: React.CSSProperties = {
  padding: '0px 10px', height: 30, verticalAlign: 'middle',
}
const BORDER = '1px solid var(--divider-color)'

// ─── Format helpers ────────────────────────────────────────────────────────────

function formatYYYYMM(key: string): string {
  return key.replace('-', '.')
}

function Dash({ fontColor }: { fontColor?: string }) {
  return <span style={{ color: fontColor ?? 'var(--brand-dimmed)' }}>—</span>
}

// 양수 → schema 폰트색(fontColor, 없으면 text-primary), 음수 → red, 0/Dash → schema 폰트색
function FmtPickupNights({ n, fontColor }: { n: number; fontColor?: string }) {
  if (n === 0) return <Dash fontColor={fontColor} />
  const sign  = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toLocaleString('ko-KR')}</span>
}

function FmtPickupAdr({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 500) return <Dash fontColor={fontColor} />
  const k     = Math.round(n / 1000)
  const sign  = k > 0 ? '+' : ''
  const color = k > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
}

function FmtPickupRevenue({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 50_000) return <Dash fontColor={fontColor} />
  const m     = (n / 1_000_000).toFixed(1)
  const sign  = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{m}M</span>
}

function FmtOcc({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 0.1) return <Dash fontColor={fontColor} />
  const sign  = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toFixed(1)}%</span>
}

function FmtRevpar({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 500) return <Dash fontColor={fontColor} />
  const k     = Math.round(n / 1000)
  const sign  = k > 0 ? '+' : ''
  const color = k > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
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

// ─── Month cell group (전체 합계용) ───────────────────────────────────────────────

function TotalCells({ cell, clickable, onClick, fontColor }: {
  cell:      MonthlyPickupCell
  clickable: boolean
  onClick?:  () => void
  fontColor?: string
}) {
  const cursor = clickable ? 'pointer' : 'default'
  const td: React.CSSProperties = { ...tdBase, textAlign: 'right', cursor }
  return (
    <>
      <td className="font-mono" style={{ ...td, borderLeft: BORDER, borderRight: BORDER }} onClick={onClick}>
        <FmtPickupNights n={cell.pickupNights} fontColor={fontColor} />
      </td>
      <td className="font-mono" style={{ ...td, borderRight: BORDER }} onClick={onClick}>
        <FmtPickupAdr n={cell.pickupAdr} fontColor={fontColor} />
      </td>
      <td className="font-mono" style={{ ...td, borderRight: BORDER }} onClick={onClick}>
        <FmtPickupRevenue n={cell.pickupRevenue} fontColor={fontColor} />
      </td>
    </>
  )
}

// ─── Modal (합계 전용) ─────────────────────────────────────────────────────────

export default function MonthlyPickupSegTotalModal({
  open, onClose, roomCount, onPickupCellClick,
}: {
  open:               boolean
  onClose:            () => void
  roomCount:          number
  onPickupCellClick?: (segCodes: string[], monthKey: string | null, label: string) => void
}) {
  const { theme }                                         = useTheme()
  const isDark                                            = theme === 'dark'
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()
  const days = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0
  const { data: schema, loading: schemaLoading }          = useMarketSchema()
  const { data: pickup, loading: pickupLoading }          = usePickupData()

  const loading = schemaLoading || pickupLoading

  const { rows, summary, monthKeys } = !loading && schema.length > 0
    ? buildMonthlyPickupSegTable({ schema, pickup, roomCount })
    : { rows: [], summary: { monthlyTotals: {}, grandTotal: { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0, occ: 0, revpar: 0 } }, monthKeys: [] }

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

  if (!open) return null

  const startLabel = monthKeys.length > 0 ? formatYYYYMM(monthKeys[0]) : ''
  const endLabel   = monthKeys.length > 0 ? formatYYYYMM(monthKeys[monthKeys.length - 1]) : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col"
        style={{ width: 598, maxWidth: '92vw', maxHeight: '79vh', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="px-6 pt-1 pb-1 shrink-0" style={{ borderBottom: `1px solid ${BORDER.split(' ').pop()}` }}>
          {/* 1줄: 제목 + 닫기 */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                6개월 픽업
              </span>
              {startLabel && endLabel && (
                <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
                  ({startLabel} ~ {endLabel})
                </span>
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
          {/* 2줄: DatePicker */}
          <div className="flex items-center gap-2" style={{ marginTop: 0 }}>
            <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} accent bare availableDates={otbDates} />
            <DatePicker label="vs OTB" value={vsOtbDate} onChange={setVsOtbDate} bare availableDates={otbDates.filter(d => d < otbDate)} />
            <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
              {days > 0 ? `${days}일간` : '당일'} 픽업 현황
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <Skeleton />
          ) : rows.length === 0 || monthKeys.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>
              표시할 픽업 데이터가 없습니다.
            </p>
          ) : (
            <div className="px-6 py-4">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                {/* 헤더 2단 */}
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left', borderRight: BORDER, borderBottom: BORDER }}>Segmentation</th>
                    <th style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderRight: BORDER, borderBottom: BORDER }}>ΔR-N</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: BORDER, borderBottom: BORDER }}>ΔADR</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: BORDER, borderBottom: BORDER }}>ΔREV</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map(row => {
                    const rowBg    = (isDark ? row.bgDarkColor  : row.bgLightColor)  ?? 'var(--color-bg-secondary)'
                    const rowColor = (isDark ? row.fontDarkColor : row.fontLightColor) ?? 'var(--color-text-primary)'
                    const isHou    = houRowIds.has(row.id)
                    const clickable = !!onPickupCellClick && !isHou && row.segmentationCodes.length > 0

                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderBottom: BORDER,
                          background: rowBg,
                          color: rowColor,   // schema 폰트 색상(레벨별 밝기 반영) — 이름·Dash 모두 적용
                          fontWeight: row.isBold ? 600 : 400,
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${rowBg}`
                        }}
                        onMouseLeave={e => { e.currentTarget.style.background = rowBg }}
                      >
                        <td style={{ ...tdBase, paddingLeft: row.indent ? 28 : 12, minWidth: 140, borderRight: BORDER }}>
                          {row.indent ? (
                            <><span style={{ color: 'var(--brand-dimmed)' }}>└ </span>{row.name}</>
                          ) : row.name}
                        </td>
                        <TotalCells
                          cell={row.totalPickup}
                          clickable={clickable}
                          fontColor={isDark ? row.fontDarkColor ?? undefined : row.fontLightColor ?? undefined}
                          onClick={clickable ? () => onPickupCellClick!(row.segmentationCodes, null, `${row.name} · 전체`) : undefined}
                        />
                      </tr>
                    )
                  })}
                </tbody>

                <tfoot>
                  {/* 합계 */}
                  <tr style={{ borderTop: '2px solid var(--color-accent-primary)', background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontWeight: 600, color: 'var(--color-text-primary)', borderRight: BORDER }}>합계 (HOU 제외)</td>
                    <TotalCells cell={summary.grandTotal} clickable={false} />
                  </tr>
                  {/* OCC */}
                  <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: BORDER }}>OCC</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '0px 10px', height: 30, verticalAlign: 'middle', fontWeight: 600, borderLeft: BORDER, borderRight: BORDER }}>
                      <FmtOcc n={summary.grandTotal.occ} />
                    </td>
                  </tr>
                  {/* RevPAR */}
                  <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: BORDER }}>RevPAR</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '0px 10px', height: 30, verticalAlign: 'middle', fontWeight: 600, borderLeft: BORDER, borderRight: BORDER }}>
                      <FmtRevpar n={summary.grandTotal.revpar} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between px-6 py-3 shrink-0" style={{ borderTop: BORDER }}>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
            {onPickupCellClick ? 'Pickup 셀 클릭 → Account 보기' : ''}
          </span>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>ESC로 닫기</span>
        </div>
      </div>
    </div>
  )
}
