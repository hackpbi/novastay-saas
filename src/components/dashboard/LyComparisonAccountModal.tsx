'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, ChevronDown, ChevronRight, ChevronLeft, Search, ArrowLeft } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'
import { useLyPacing } from '@/hooks/useLyPacing'
import {
  buildLyComparisonAccountTable,
  type LyComparisonAccountGroup,
} from '@/utils/lyComparisonAccountTable'
import type { LyComparisonMonthly } from '@/utils/lyComparisonSegTable'

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

const ZERO_MONTHLY: LyComparisonMonthly = {
  otb: { nights: 0, adr: 0, revenue: 0 },
  ly:  { nights: 0, adr: 0, revenue: 0 },
  gap: { nights: 0, adr: 0, revenue: 0 },
}

// ─── Format helpers ────────────────────────────────────────────────────────────

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

// ─── Row cells (shared) ───────────────────────────────────────────────────────

function MonthCells({ m }: { m: LyComparisonMonthly }) {
  return (
    <>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: BORDER }}><FmtNights n={m.otb.nights} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}><FmtAdr n={m.otb.adr} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: DOUBLE }}><FmtRevenue n={m.otb.revenue} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}><FmtNights n={m.ly.nights} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}><FmtAdr n={m.ly.adr} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: DOUBLE }}><FmtRevenue n={m.ly.revenue} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}><FmtGapNights n={m.gap.nights} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}><FmtGapAdr n={m.gap.adr} /></td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}><FmtGapRevenue n={m.gap.revenue} /></td>
    </>
  )
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

// ─── groupHasFilterCode ────────────────────────────────────────────────────────

function groupHasFilterCode(group: LyComparisonAccountGroup, codes: string[], schema: MarketSchemaRow[]): boolean {
  for (const s of schema) {
    if (s.name !== group.segmentationName) continue
    if (group.parentName !== null) {
      if (s.level !== 'sub') continue
      const parent = schema.find(p => p.id === s.parent_id)
      if (parent?.name !== group.parentName) continue
    } else {
      if (s.level === 'main') continue
    }
    if (s.segmentation.some(c => codes.includes(c))) return true
  }
  return false
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

export default function LyComparisonAccountModal({
  open, onClose, roomCount,
  initialMonthKey,
  initialFilterSegCodes, initialFilterLabel,
  onBackToSeg,
}: {
  open:                   boolean
  onClose:                () => void
  roomCount:              number
  initialMonthKey?:       string
  initialFilterSegCodes?: string[]
  initialFilterLabel?:    string
  onBackToSeg?:           (monthKey: string) => void
}) {
  const { currentHotel }                                 = useHotel()
  const { otbDate }                                      = useDateContext()
  const { data: schema, loading: schemaLoading }         = useMarketSchema()
  const { data: lyPacing, loading: lyLoading }           = useLyPacing()
  const lyMatchUpdateDate = lyPacing?.[0]?.ly_match_update_date ?? null

  const [currentMonthIndex, setCurrentMonthIndex] = useState(0)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const [filterCleared, setFilterCleared] = useState(false)

  const loading = schemaLoading || lyLoading

  const { groups, summary, monthKeys } = useMemo(
    () => !loading && schema.length > 0
      ? buildLyComparisonAccountTable({ schema, lyPacing, roomCount })
      : { groups: [], summary: { monthly: {}, accountCount: 0, groupCount: 0 }, monthKeys: [] },
    [schema, lyPacing, roomCount, loading],
  )

  const effectiveSegCodes = !filterCleared ? initialFilterSegCodes : undefined
  const isFilterMode      = !!effectiveSegCodes && effectiveSegCodes.length > 0

  // 월 인덱스 초기화
  useEffect(() => {
    if (!open || monthKeys.length === 0) return
    if (initialMonthKey) {
      const idx = monthKeys.indexOf(initialMonthKey)
      setCurrentMonthIndex(idx >= 0 ? idx : 0)
    } else {
      setCurrentMonthIndex(0)
    }
  }, [open, initialMonthKey, monthKeys])

  const currentMonthKey = monthKeys[currentMonthIndex] ?? ''

  // 필터 + 검색
  const visibleGroups = useMemo(() => {
    let g = groups
    if (effectiveSegCodes && effectiveSegCodes.length > 0) {
      g = g.filter(group => groupHasFilterCode(group, effectiveSegCodes, schema))
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      g = g.map(group => ({ ...group, rows: group.rows.filter(r => r.account_name.toLowerCase().includes(q)) }))
           .filter(group => group.rows.length > 0)
    }

    // 빈 데이터 필터: 현재 보는 월의 OTB nights > 0 OR LY nights > 0 인 행만 표시
    if (currentMonthKey) {
      g = g.map(group => ({
        ...group,
        rows: group.rows.filter(r => {
          const cell = r.monthly[currentMonthKey]
          if (!cell) return false
          return cell.otb.nights > 0 || cell.ly.nights > 0
        }),
      })).filter(group => group.rows.length > 0)
    }

    return g
  }, [groups, effectiveSegCodes, searchQuery, schema, currentMonthKey])

  // 초기 접힘 상태
  useEffect(() => {
    if (!open) return
    if (isFilterMode && !filterCleared) {
      setCollapsedKeys(new Set())
    } else {
      setCollapsedKeys(new Set(visibleGroups.map(g => g.key)))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isFilterMode, filterCleared, visibleGroups.length])

  const effectiveCollapsedKeys = searchQuery.trim() ? new Set<string>() : collapsedKeys

  const toggleCollapse = (key: string) =>
    setCollapsedKeys(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })

  const allCollapsed = collapsedKeys.size >= visibleGroups.length && visibleGroups.length > 0
  const toggleAll    = () => setCollapsedKeys(allCollapsed ? new Set() : new Set(visibleGroups.map(g => g.key)))

  useEffect(() => {
    if (open) { setSearchQuery(''); setFilterCleared(false) }
  }, [open])

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

  const sumMonth = summary.monthly[currentMonthKey]
  const sumTd: React.CSSProperties = { ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)', paddingTop: 8, paddingBottom: 8 }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-6xl"
        style={{ maxHeight: '88vh', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 shrink-0" style={{ borderBottom: BORDER }}>
          {/* Left */}
          <div className="flex items-start gap-3 min-w-0">
            {onBackToSeg && isFilterMode && !filterCleared && (
              <button
                onClick={() => onBackToSeg(currentMonthKey)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors shrink-0 mt-0.5"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-accent-primary)'; e.currentTarget.style.borderColor = 'var(--color-accent-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--color-border-default)' }}
              >
                <ArrowLeft size={12} />Seg로
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>전년 동기간 비교 — Account</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--brand-dimmed)' }}>
                현재 OTB {otbDate ?? '-'}{' · '}전년 동기간 OTB {lyMatchUpdateDate ?? '-'}
              </p>
              {isFilterMode && initialFilterLabel && !filterCleared && (
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]"
                    style={{ background: 'var(--accent-badge-bg)', color: 'var(--color-accent-primary)', border: '1px solid var(--color-accent-primary)' }}>
                    {initialFilterLabel}
                    <button onClick={() => setFilterCleared(true)} className="hover:opacity-60 transition-opacity leading-none ml-0.5" aria-label="필터 해제">×</button>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Center: month nav */}
          {monthKeys.length > 0 && (
            <div className="flex items-center gap-3 shrink-0">
              <NavBtn onClick={() => setCurrentMonthIndex(i => Math.max(0, i - 1))} disabled={currentMonthIndex === 0}>
                <ChevronLeft size={14} />
              </NavBtn>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 80, textAlign: 'center' }}>
                {currentMonthKey.replace('-', '.')}
              </span>
              <NavBtn onClick={() => setCurrentMonthIndex(i => Math.min(monthKeys.length - 1, i + 1))} disabled={currentMonthIndex === monthKeys.length - 1}>
                <ChevronRight size={14} />
              </NavBtn>
            </div>
          )}

          {/* Right */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="account 검색..." autoFocus
                className="text-xs pl-7 pr-3 py-1.5 rounded-lg focus:outline-none"
                style={{ width: 160, background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
              />
            </div>
            {visibleGroups.length > 0 && (
              <button onClick={toggleAll} className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-accent-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}>
                {allCollapsed ? '모두 펼치기' : '모두 접기'}
              </button>
            )}
            <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <Skeleton />
          ) : groups.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>표시할 LY 비교 데이터가 없습니다.</p>
          ) : visibleGroups.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>
              {searchQuery.trim() ? `'${searchQuery.trim()}'와 일치하는 account가 없습니다.` : '필터 조건에 맞는 그룹이 없습니다.'}
            </p>
          ) : (
            <div className="px-6 py-4">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left', borderRight: DOUBLE }} rowSpan={2}>Account</th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: BORDER, borderRight: DOUBLE }}>현재 OTB</th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderRight: DOUBLE }}>작년 OTB</th>
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
                  {visibleGroups.map(group => {
                    const collapsed = effectiveCollapsedKeys.has(group.key)
                    const gm = group.monthlyTotals[currentMonthKey] ?? ZERO_MONTHLY
                    return (
                      <>
                        <tr key={`hdr-${group.key}`} onClick={() => toggleCollapse(group.key)} className="cursor-pointer"
                          style={{ borderTop: BORDER, background: 'var(--color-bg-elevated)' }}
                          onMouseEnter={e => e.currentTarget.style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), var(--color-bg-elevated)`}
                          onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                        >
                          <td style={{ ...tdBase, paddingLeft: 12 }}>
                            <div className="flex items-center gap-2">
                              {collapsed ? <ChevronRight size={13} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} /> : <ChevronDown size={13} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />}
                              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{group.segmentationName}</span>
                              <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>({group.rows.length}개)</span>
                            </div>
                          </td>
                          <MonthCells m={gm} />
                        </tr>

                        {!collapsed && group.rows.map(row => {
                          const rm = row.monthly[currentMonthKey] ?? ZERO_MONTHLY
                          return (
                            <tr key={`${group.key}-${row.account_name}`}
                              style={{ borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-primary)' }}
                              onMouseEnter={e => e.currentTarget.style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), var(--color-bg-primary)`}
                              onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-primary)'}
                            >
                              <td style={{ ...tdBase, paddingLeft: 28, color: 'var(--color-text-secondary)' }}>
                                <span style={{ color: 'var(--brand-dimmed)' }}>└ </span>
                                {!row.account_name || row.account_name === '(미지정)'
                                  ? <span style={{ color: 'var(--brand-dimmed)' }}>(미지정)</span>
                                  : row.account_name}
                              </td>
                              <MonthCells m={rm} />
                            </tr>
                          )
                        })}
                      </>
                    )
                  })}
                </tbody>

                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--color-accent-primary)', background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...sumTd, paddingLeft: 12, borderRight: DOUBLE }}>합계 (HOU 제외)</td>
                    {sumMonth ? (
                      <>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: BORDER }}><FmtNights n={sumMonth.otb.nights} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtAdr n={sumMonth.otb.adr} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderRight: DOUBLE }}><FmtRevenue n={sumMonth.otb.revenue} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtNights n={sumMonth.ly.nights} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtAdr n={sumMonth.ly.adr} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderRight: DOUBLE }}><FmtRevenue n={sumMonth.ly.revenue} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtGapNights n={sumMonth.gap.nights} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtGapAdr n={sumMonth.gap.adr} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtGapRevenue n={sumMonth.gap.revenue} /></td>
                      </>
                    ) : <td colSpan={9} />}
                  </tr>
                  <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE }}>OCC</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER, borderRight: DOUBLE }}><FmtOcc n={sumMonth?.otb.occ ?? 0} /></td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderRight: DOUBLE }}><FmtOcc n={sumMonth?.ly.occ ?? 0} /></td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}><FmtGapPct n={sumMonth?.gap.occDiff ?? 0} /></td>
                  </tr>
                  <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE }}>RevPAR</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER, borderRight: DOUBLE }}><FmtRevpar n={sumMonth?.otb.revpar ?? 0} /></td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderRight: DOUBLE }}><FmtRevpar n={sumMonth?.ly.revpar ?? 0} /></td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}><FmtGapRevpar n={sumMonth?.gap.revparDiff ?? 0} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-between px-6 py-3 shrink-0" style={{ borderTop: BORDER }}>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
            총 {summary.accountCount} accounts · {summary.groupCount} groups
          </span>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>ESC로 닫기</span>
        </div>
      </div>
    </div>
  )
}
