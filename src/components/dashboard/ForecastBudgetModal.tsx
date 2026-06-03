'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useFcstDateContext } from '@/contexts/FcstDateContext'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { useLatestConfirmedBudgetDate } from '@/hooks/useLatestConfirmedBudgetDate'
import { useForecastMonthly } from '@/hooks/useForecastMonthly'
import { useBudgetMonthly } from '@/hooks/useBudgetMonthly'
import {
  buildForecastBudgetTable,
} from '@/utils/forecastBudgetTable'
import type { FcstBudgetMonthly } from '@/utils/forecastBudgetTable'

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
const DOUBLE = '3px double rgba(255, 255, 255, 0.25)'

const ZERO_MONTHLY: FcstBudgetMonthly = {
  fcst:   { nights: 0, adr: 0, revenue: 0 },
  budget: { nights: 0, adr: 0, revenue: 0 },
  gap:    { nights: 0, adr: 0, revenue: 0 },
}

// ─── Format helpers ────────────────────────────────────────────────────────────

function formatYYYYMM(key: string): string {
  return key.replace('-', '.')
}

function Dash() { return <span style={{ color: 'var(--brand-dimmed)' }}>—</span> }

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
  const sign = n > 0 ? '+' : ''; const color = n > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toLocaleString('ko-KR')}</span>
}
function FmtGapAdr({ n }: { n: number }) {
  if (Math.abs(n) < 500) return <Dash />
  const k = Math.round(n / 1000); const sign = k > 0 ? '+' : ''; const color = k > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
}
function FmtGapRevenue({ n }: { n: number }) {
  if (Math.abs(n) < 50_000) return <Dash />
  const m = (n / 1_000_000).toFixed(1); const sign = n > 0 ? '+' : ''; const color = n > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{m}M</span>
}
function FmtOcc({ n }: { n: number }) {
  if (Math.abs(n) < 0.1) return <Dash />
  return <>{n.toFixed(1)}%</>
}
function FmtGapPct({ n }: { n: number }) {
  if (Math.abs(n) < 0.1) return <Dash />
  const sign = n > 0 ? '+' : ''; const color = n > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toFixed(1)}%p</span>
}
function FmtRevpar({ n }: { n: number }) {
  if (Math.abs(n) < 500) return <Dash />
  return <>{Math.round(n / 1000)}k</>
}
function FmtGapRevpar({ n }: { n: number }) {
  if (Math.abs(n) < 500) return <Dash />
  const k = Math.round(n / 1000); const sign = k > 0 ? '+' : ''; const color = k > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
}
function FmtAchievement({ pct }: { pct: number }) {
  if (!pct) return <Dash />
  const color = pct >= 100 ? 'var(--color-positive)' : pct >= 95 ? '#ffc857' : 'var(--color-negative)'
  return <span style={{ color }}>{pct.toFixed(1)}%</span>
}

// ─── Nav button ───────────────────────────────────────────────────────────────

function NavBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: 'transparent', border: '1px solid var(--color-border-default)', borderRadius: 6,
      padding: '4px 8px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
      color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center',
    }}>
      {children}
    </button>
  )
}

// ─── Cell group ────────────────────────────────────────────────────────────────

function RowCells({ m }: { m: FcstBudgetMonthly }) {
  return (
    <>
      {/* FCST */}
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: BORDER }}><FmtNights n={m.fcst.nights} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}><FmtAdr n={m.fcst.adr} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: DOUBLE }}><FmtRevenue n={m.fcst.revenue} /></td>
      {/* BUDGET */}
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}><FmtNights n={m.budget.nights} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}><FmtAdr n={m.budget.adr} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: DOUBLE }}><FmtRevenue n={m.budget.revenue} /></td>
      {/* GAP */}
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}><FmtGapNights n={m.gap.nights} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}><FmtGapAdr n={m.gap.adr} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}><FmtGapRevenue n={m.gap.revenue} /></td>
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

export default function ForecastBudgetModal({
  open, onClose, roomCount, year, initialMonthKey,
}: {
  open:             boolean
  onClose:          () => void
  roomCount:        number
  year:             number
  initialMonthKey?: string
}) {
  const { currentHotel }                                 = useHotel()
  const { theme }                                        = useTheme()
  const isDark                                           = theme === 'dark'
  const { fcstDate }                                     = useFcstDateContext()
  const { data: schema, loading: schemaLoading }         = useMarketSchema()
  const { data: budgetDate = null }                      = useLatestConfirmedBudgetDate(currentHotel?.id || undefined)
  const { data: forecastRows = [], isLoading: fcLoading } = useForecastMonthly({
    hotelId:    currentHotel?.id || undefined,
    year,
    updateDate: fcstDate || null,
  })
  const { data: budgetRows = [], isLoading: bgLoading } = useBudgetMonthly({
    hotelId:    currentHotel?.id || undefined,
    year,
    updateDate: budgetDate,
  })
  const [currentMonthIndex, setCurrentMonthIndex] = useState(0)

  const loading = schemaLoading || fcLoading || bgLoading

  const { rows, summary, monthKeys } = useMemo(
    () => !loading && schema.length > 0
      ? buildForecastBudgetTable({ schema, forecastRows, budgetRows, roomCount, year })
      : { rows: [], summary: { monthly: {} }, monthKeys: [] },
    [schema, forecastRows, budgetRows, roomCount, year, loading],
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

  if (!open) return null

  const currentMonthKey = monthKeys[currentMonthIndex] ?? ''
  const sumMonth        = summary.monthly[currentMonthKey]
  const sumTd: React.CSSProperties = { ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)', paddingTop: 8, paddingBottom: 8 }
  const labelTd: React.CSSProperties = { ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-5xl"
        style={{ maxHeight: '88vh', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: BORDER }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>FCST vs BUDGET 비교</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-dimmed)' }}>{currentHotel?.hotel_name ?? ''}</p>
          </div>

          {monthKeys.length > 0 && (
            <div className="flex items-center gap-3">
              <NavBtn onClick={() => setCurrentMonthIndex(i => Math.max(0, i - 1))} disabled={currentMonthIndex === 0}>
                <ChevronLeft size={14} />
              </NavBtn>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 80, textAlign: 'center' }}>
                {formatYYYYMM(currentMonthKey)}
              </span>
              <NavBtn onClick={() => setCurrentMonthIndex(i => Math.min(monthKeys.length - 1, i + 1))} disabled={currentMonthIndex === monthKeys.length - 1}>
                <ChevronRight size={14} />
              </NavBtn>
            </div>
          )}

          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <Skeleton />
          ) : monthKeys.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>월 데이터가 없습니다.</p>
          ) : rows.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>표시할 데이터가 없습니다.</p>
          ) : (
            <div className="px-6 py-4">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left' }} rowSpan={2}>Segmentation</th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: BORDER, borderRight: DOUBLE }}>FCST</th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderRight: DOUBLE }}>BUDGET</th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center' }}>GAP</th>
                  </tr>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderBottom: BORDER }}>R-N</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ADR</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: DOUBLE, borderBottom: BORDER }}>REV</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>R-N</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ADR</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: DOUBLE, borderBottom: BORDER }}>REV</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔR-N</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔADR</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔREV</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map(row => {
                    const rowBg    = (isDark ? row.bgDarkColor  : row.bgLightColor)  ?? 'var(--color-bg-secondary)'
                    const rowColor = (isDark ? row.fontDarkColor : row.fontLightColor) ?? 'var(--color-text-primary)'
                    const m        = row.monthly[currentMonthKey] ?? ZERO_MONTHLY

                    return (
                      <tr
                        key={row.id}
                        style={{ borderBottom: BORDER, background: rowBg, color: rowColor, fontWeight: row.isBold ? 600 : 400 }}
                        onMouseEnter={e => { e.currentTarget.style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${rowBg}` }}
                        onMouseLeave={e => { e.currentTarget.style.background = rowBg }}
                      >
                        <td style={{ ...tdBase, paddingLeft: row.indent ? 28 : 12, minWidth: 140 }}>
                          {row.indent ? <><span style={{ color: 'var(--brand-dimmed)' }}>└ </span>{row.name}</> : row.name}
                        </td>
                        <RowCells m={m} />
                      </tr>
                    )
                  })}
                </tbody>

                <tfoot>
                  {/* 합계 */}
                  <tr style={{ borderTop: '2px solid var(--color-accent-primary)', background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...sumTd, paddingLeft: 12 }}>합계 (HOU 제외)</td>
                    {sumMonth ? <RowCells m={{ fcst: sumMonth.fcst, budget: sumMonth.budget, gap: sumMonth.gap }} /> : <td colSpan={9} />}
                  </tr>
                  {/* 달성 */}
                  {sumMonth && (
                    <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                      <td style={labelTd}>달성</td>
                      <td colSpan={3} style={{ padding: '8px 10px', borderLeft: BORDER }} />
                      <td colSpan={3} style={{ padding: '8px 10px' }} />
                      <td className="font-mono" style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600 }}>
                        <FmtAchievement pct={sumMonth.achievement.occ} />
                      </td>
                      <td className="font-mono" style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600 }}>
                        <FmtAchievement pct={sumMonth.achievement.adr} />
                      </td>
                      <td className="font-mono" style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600 }}>
                        <FmtAchievement pct={sumMonth.achievement.revenue} />
                      </td>
                    </tr>
                  )}
                  {/* OCC */}
                  <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                    <td style={labelTd}>OCC</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER }}>
                      <FmtOcc n={sumMonth?.fcst.occ ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}>
                      <FmtOcc n={sumMonth?.budget.occ ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}>
                      <FmtGapPct n={sumMonth?.gap.occDiff ?? 0} />
                    </td>
                  </tr>
                  {/* RevPAR */}
                  <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                    <td style={labelTd}>RevPAR</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER }}>
                      <FmtRevpar n={sumMonth?.fcst.revpar ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}>
                      <FmtRevpar n={sumMonth?.budget.revpar ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}>
                      <FmtGapRevpar n={sumMonth?.gap.revparDiff ?? 0} />
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
            FCST {fcstDate || '-'} · BUDGET {budgetDate || '-'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>ESC로 닫기</span>
        </div>
      </div>
    </div>
  )
}
