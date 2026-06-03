'use client'

import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { useLyPacing } from '@/hooks/useLyPacing'
import {
  buildLyComparisonSegTable,
  type LyComparisonSegRow,
  type LyComparisonCell,
} from '@/utils/lyComparisonSegTable'

// ─── Constants ─────────────────────────────────────────────────────────────────

const thBase: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--color-text-secondary)',
  padding: '6px 10px', background: 'var(--color-bg-elevated)', whiteSpace: 'nowrap',
}
const tdBase: React.CSSProperties = {
  padding: '6px 10px', verticalAlign: 'middle',
}
const BORDER = '1px solid var(--divider-color)'

// ─── Format helpers ────────────────────────────────────────────────────────────

function Dash() {
  return <span style={{ color: 'var(--brand-dimmed)' }}>—</span>
}

function FmtNights({ n }: { n: number }) {
  if (n === 0) return <Dash />
  return <>{n.toLocaleString('ko-KR')}</>
}

function FmtAdr({ n }: { n: number }) {
  if (Math.abs(n) < 500) return <Dash />
  return <>{Math.round(n / 1000)}k</>
}

function FmtRevenue({ n }: { n: number }) {
  if (Math.abs(n) < 50_000) return <Dash />
  return <>{(n / 1_000_000).toFixed(1)}M</>
}

function FmtGapNights({ n }: { n: number }) {
  if (n === 0) return <Dash />
  const sign  = n > 0 ? '+' : ''
  const color = n > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toLocaleString('ko-KR')}</span>
}

function FmtGapRevenue({ n }: { n: number }) {
  if (Math.abs(n) < 50_000) return <Dash />
  const m     = (n / 1_000_000).toFixed(1)
  const sign  = n > 0 ? '+' : ''
  const color = n > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{m}M</span>
}

function FmtOcc({ n }: { n: number }) {
  if (Math.abs(n) < 0.1) return <Dash />
  return <>{n.toFixed(1)}%</>
}

function FmtGapPct({ n }: { n: number }) {
  if (Math.abs(n) < 0.1) return <Dash />
  const sign  = n > 0 ? '+' : ''
  const color = n > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toFixed(1)}%p</span>
}

function FmtRevpar({ n }: { n: number }) {
  if (Math.abs(n) < 500) return <Dash />
  return <>{Math.round(n / 1000)}k</>
}

function FmtGapRevpar({ n }: { n: number }) {
  if (Math.abs(n) < 500) return <Dash />
  const k     = Math.round(n / 1000)
  const sign  = k > 0 ? '+' : ''
  const color = k > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
}

// ─── Cell group components ─────────────────────────────────────────────────────

function OtbCells({ cell }: { cell: LyComparisonCell }) {
  return (
    <>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: BORDER }}>
        <FmtNights n={cell.nights} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}>
        <FmtAdr n={cell.adr} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: BORDER }}>
        <FmtRevenue n={cell.revenue} />
      </td>
    </>
  )
}

function LyCells({ cell }: { cell: LyComparisonCell }) {
  return (
    <>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}>
        <FmtNights n={cell.nights} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}>
        <FmtAdr n={cell.adr} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: BORDER }}>
        <FmtRevenue n={cell.revenue} />
      </td>
    </>
  )
}

function GapCells({ gap, clickable, onClick }: {
  gap: { nights: number; revenue: number }
  clickable: boolean
  onClick?: () => void
}) {
  const cursor = clickable ? 'pointer' : 'default'
  return (
    <>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', cursor }} onClick={onClick}>
        <FmtGapNights n={gap.nights} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', cursor }} onClick={onClick}>
        <FmtGapRevenue n={gap.revenue} />
      </td>
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
  open, onClose, roomCount, onAccountDrillDown,
}: {
  open:                boolean
  onClose:             () => void
  roomCount:           number
  onAccountDrillDown?: (segCodes: string[], label: string) => void
}) {
  const { currentHotel }                                 = useHotel()
  const { theme }                                        = useTheme()
  const isDark                                           = theme === 'dark'
  const { data: schema, loading: schemaLoading }         = useMarketSchema()
  const { data: lyPacing, loading: lyLoading }           = useLyPacing()

  const loading = schemaLoading || lyLoading

  const { rows, summary } = useMemo(
    () => !loading && schema.length > 0
      ? buildLyComparisonSegTable({ schema, lyPacing, roomCount })
      : { rows: [], summary: {
          otb: { nights: 0, adr: 0, revenue: 0, occ: 0, revpar: 0 },
          ly:  { nights: 0, adr: 0, revenue: 0, occ: 0, revpar: 0 },
          gap: { nights: 0, revenue: 0, occDiff: 0, revparDiff: 0 },
        }},
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

  // 날짜 범위 라벨
  const { startLabel, endLabel } = useMemo(() => {
    const months = [...new Set(lyPacing.map(r => r.business_date.slice(0, 7)))].sort()
    const fmt = (ym: string) => ym.replace('-', '.')
    return {
      startLabel: months.length > 0 ? fmt(months[0]) : '',
      endLabel:   months.length > 0 ? fmt(months[months.length - 1]) : '',
    }
  }, [lyPacing])

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

  const sumTd: React.CSSProperties = {
    ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)', paddingTop: 8, paddingBottom: 8,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-5xl"
        style={{ maxHeight: '88vh', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 shrink-0" style={{ borderBottom: BORDER }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              전년 동기간 비교
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-dimmed)' }}>
              {startLabel && endLabel ? `${startLabel} ~ ${endLabel} · ` : ''}{currentHotel?.hotel_name ?? ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1"
            aria-label="닫기"
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <Skeleton />
          ) : rows.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>
              표시할 LY 비교 데이터가 없습니다.
            </p>
          ) : (
            <div className="px-6 py-4">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                {/* 헤더 2단 */}
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left' }} rowSpan={2}>Segmentation</th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: BORDER, borderRight: BORDER }}>현재 OTB</th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderRight: BORDER }}>작년 OTB</th>
                    <th colSpan={2} style={{ ...thBase, textAlign: 'center' }}>GAP</th>
                  </tr>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderBottom: BORDER }}>R-N</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ADR</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: BORDER, borderBottom: BORDER }}>REV</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>R-N</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ADR</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: BORDER, borderBottom: BORDER }}>REV</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔR-N</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔREV</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map(row => {
                    const rowBg    = (isDark ? row.bgDarkColor  : row.bgLightColor)  ?? 'var(--color-bg-secondary)'
                    const rowColor = (isDark ? row.fontDarkColor : row.fontLightColor) ?? 'var(--color-text-primary)'
                    const isHou    = houRowIds.has(row.id)
                    const clickable = !!onAccountDrillDown && !isHou && row.segmentationCodes.length > 0

                    return (
                      <tr
                        key={row.id}
                        style={{ borderBottom: BORDER, background: rowBg, color: rowColor, fontWeight: row.isBold ? 600 : 400 }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${rowBg}`
                        }}
                        onMouseLeave={e => { e.currentTarget.style.background = rowBg }}
                      >
                        <td style={{ ...tdBase, paddingLeft: row.indent ? 28 : 12, minWidth: 140 }}>
                          {row.indent ? (
                            <><span style={{ color: 'var(--brand-dimmed)' }}>└ </span>{row.name}</>
                          ) : row.name}
                        </td>
                        <OtbCells cell={row.otb} />
                        <LyCells  cell={row.ly} />
                        <GapCells
                          gap={row.gap}
                          clickable={clickable}
                          onClick={clickable ? () => onAccountDrillDown!(row.segmentationCodes, row.name) : undefined}
                        />
                      </tr>
                    )
                  })}
                </tbody>

                <tfoot>
                  {/* 합계 */}
                  <tr style={{ borderTop: '2px solid var(--color-accent-primary)', background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...sumTd, paddingLeft: 12 }}>합계 (HOU 제외)</td>
                    <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: BORDER }}>
                      <FmtNights n={summary.otb.nights} />
                    </td>
                    <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}>
                      <FmtAdr n={summary.otb.adr} />
                    </td>
                    <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderRight: BORDER }}>
                      <FmtRevenue n={summary.otb.revenue} />
                    </td>
                    <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}>
                      <FmtNights n={summary.ly.nights} />
                    </td>
                    <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}>
                      <FmtAdr n={summary.ly.adr} />
                    </td>
                    <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderRight: BORDER }}>
                      <FmtRevenue n={summary.ly.revenue} />
                    </td>
                    <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}>
                      <FmtGapNights n={summary.gap.nights} />
                    </td>
                    <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}>
                      <FmtGapRevenue n={summary.gap.revenue} />
                    </td>
                  </tr>
                  {/* OCC */}
                  <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)' }}>OCC</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER }}>
                      <FmtOcc n={summary.otb.occ} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}>
                      <FmtOcc n={summary.ly.occ} />
                    </td>
                    <td colSpan={2} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}>
                      <FmtGapPct n={summary.gap.occDiff} />
                    </td>
                  </tr>
                  {/* RevPAR */}
                  <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)' }}>RevPAR</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER }}>
                      <FmtRevpar n={summary.otb.revpar} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}>
                      <FmtRevpar n={summary.ly.revpar} />
                    </td>
                    <td colSpan={2} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}>
                      <FmtGapRevpar n={summary.gap.revparDiff} />
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
            {onAccountDrillDown ? 'GAP 셀 클릭 → Account 보기' : ''}
          </span>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>ESC로 닫기</span>
        </div>
      </div>
    </div>
  )
}
