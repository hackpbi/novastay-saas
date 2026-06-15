'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useDateContext } from '@/contexts/DateContext'
import DatePicker from '@/components/DatePicker'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'
import { usePickupData } from '@/hooks/usePickupData'
import {
  buildMonthlyPickupAccountTable,
  type MonthlyPickupAccountGroup,
} from '@/utils/monthlyPickupAccountTable'
import type { MonthlyPickupCell } from '@/utils/monthlyPickupSegTable'

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 3

const thBase: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--color-text-secondary)',
  padding: '6px 10px', background: '#0a0a0a', whiteSpace: 'nowrap',
}
const tdBase: React.CSSProperties = {
  padding: '6px 10px', verticalAlign: 'middle',
}
const BORDER = '1px solid var(--divider-color)'
const ZERO_CELL: MonthlyPickupCell = { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 }

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

// ─── Month cells ───────────────────────────────────────────────────────────────

function MonthCells({ cell, fontColor }: { cell: MonthlyPickupCell; isLast?: boolean; fontColor?: string }) {
  return (
    <>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: BORDER, borderRight: BORDER }}>
        <FmtPickupNights n={cell.pickupNights} fontColor={fontColor} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: BORDER }}>
        <FmtPickupAdr n={cell.pickupAdr} fontColor={fontColor} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: BORDER }}>
        <FmtPickupRevenue n={cell.pickupRevenue} fontColor={fontColor} />
      </td>
    </>
  )
}

// ─── groupHasFilterCode (AccountModal 동일 패턴) ───────────────────────────────

function groupHasFilterCode(
  group: MonthlyPickupAccountGroup,
  codes: string[],
  schema: MarketSchemaRow[],
): boolean {
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

// 그룹에 해당하는 schema 행(색상 소스) 찾기 — groupHasFilterCode 와 동일 매칭
function groupSchemaRow(
  group: MonthlyPickupAccountGroup,
  schema: MarketSchemaRow[],
): MarketSchemaRow | undefined {
  for (const s of schema) {
    if (s.name !== group.segmentationName) continue
    if (group.parentName !== null) {
      if (s.level !== 'sub') continue
      const parent = schema.find(p => p.id === s.parent_id)
      if (parent?.name !== group.parentName) continue
    } else {
      if (s.level === 'main') continue
    }
    return s
  }
  return undefined
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

export default function MonthlyPickupAccountModal({
  open, onClose, roomCount,
  initialFilterSegCodes, initialFilterMonthKey, initialFilterLabel, initialViewMode,
  onBackToSeg, onSwitchToTotal,
}: {
  open:                    boolean
  onClose:                 () => void
  roomCount:               number
  initialFilterSegCodes?:  string[]
  initialFilterMonthKey?:  string
  initialFilterLabel?:     string
  initialViewMode?:        'monthly' | 'total'
  onBackToSeg?:            () => void
  onSwitchToTotal?:        () => void
}) {
  const { theme }                                = useTheme()
  const isDark                                   = theme === 'dark'
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()
  const days = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0
  const { data: schema, loading: schemaLoading } = useMarketSchema()
  const { data: pickup, loading: pickupLoading } = usePickupData()

  const [pageIndex,     setPageIndex]     = useState(0)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const [filterCleared, setFilterCleared] = useState(false)

  const loading = schemaLoading || pickupLoading

  const { groups, summary, monthKeys } = useMemo(
    () => !loading && schema.length > 0
      ? buildMonthlyPickupAccountTable({ schema, pickup, roomCount })
      : { groups: [], summary: { monthlyTotals: {}, grandTotal: { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0, occ: 0, revpar: 0 }, accountCount: 0, groupCount: 0 }, monthKeys: [] },
    [schema, pickup, roomCount, loading],
  )

  // Effective filter
  const effectiveMonthKey = !filterCleared ? initialFilterMonthKey : undefined
  const isFilterMode      = !filterCleared && (!!initialFilterSegCodes?.length || !!initialFilterMonthKey)

  // visible months
  const visibleMonthKeys: string[] = useMemo(
    () => effectiveMonthKey ? [effectiveMonthKey] : monthKeys,
    [monthKeys, effectiveMonthKey],
  )
  const isSingleMonth = visibleMonthKeys.length === 1

  // pagination
  const totalPages       = Math.ceil(visibleMonthKeys.length / PAGE_SIZE)
  const visiblePageMonths = isSingleMonth
    ? visibleMonthKeys
    : visibleMonthKeys.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE)

  // 그룹은 전체 표시(필터 없음) + account 검색만 적용
  const visibleGroups = useMemo(() => {
    let g = groups
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      g = g
        .map(group => ({ ...group, rows: group.rows.filter(r => r.account_name.toLowerCase().includes(q)) }))
        .filter(group => group.rows.length > 0)
    }
    return g
  }, [groups, searchQuery])

  // 진입 시: 클릭한 세그(initialFilterSegCodes)에 해당하는 그룹만 펼침, 나머지는 접힘
  useEffect(() => {
    if (!open) return
    const codes = !filterCleared ? initialFilterSegCodes : undefined
    if (codes && codes.length > 0) {
      setCollapsedKeys(new Set(
        groups.filter(g => !groupHasFilterCode(g, codes, schema)).map(g => g.key)
      ))
    } else {
      setCollapsedKeys(new Set(groups.map(g => g.key)))  // 세그 미지정: 모두 접힘
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filterCleared, groups, initialFilterSegCodes])

  // search → auto-expand
  const effectiveCollapsedKeys = searchQuery.trim() ? new Set<string>() : collapsedKeys

  const toggleCollapse = (key: string) =>
    setCollapsedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })

  const allCollapsed = collapsedKeys.size >= visibleGroups.length && visibleGroups.length > 0
  const toggleAll    = () =>
    setCollapsedKeys(allCollapsed ? new Set() : new Set(visibleGroups.map(g => g.key)))

  // reset on open / filter cleared
  useEffect(() => {
    if (open) {
      setPageIndex(0); setSearchQuery(''); setFilterCleared(false)
    }
  }, [open])

  useEffect(() => {
    if (filterCleared) setPageIndex(0)
  }, [filterCleared])

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
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4" style={{ paddingTop: 80 }}>
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-6xl"
        style={{ maxHeight: '88vh', background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="px-6 pt-1 pb-1 shrink-0" style={{ borderBottom: BORDER }}>
          {/* 1줄: 제목 + 페이지네이션 + X(Seg 월별 복귀) */}
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
            <div className="flex items-center gap-2">
              {!isSingleMonth && totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button
                    onClick={() => setPageIndex(i => Math.max(0, i - 1))}
                    disabled={pageIndex === 0}
                    className="px-1.5 py-1 rounded transition-colors disabled:opacity-30"
                    style={{ color: 'var(--color-text-secondary)' }}
                    onMouseEnter={e => { if (pageIndex > 0) (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent-primary)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-secondary)' }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    {pageIndex + 1}/{totalPages}
                  </span>
                  <button
                    onClick={() => setPageIndex(i => Math.min(totalPages - 1, i + 1))}
                    disabled={pageIndex === totalPages - 1}
                    className="px-1.5 py-1 rounded transition-colors disabled:opacity-30"
                    style={{ color: 'var(--color-text-secondary)' }}
                    onMouseEnter={e => { if (pageIndex < totalPages - 1) (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent-primary)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-secondary)' }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
              <button
                onClick={() => (onBackToSeg ? onBackToSeg() : onClose())}
                className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1"
                aria-label="Seg 월별로"
              >
                <X size={22} />
              </button>
            </div>
          </div>
          {/* 2줄: DatePicker(좌) + 월별/합계 토글(우) */}
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2">
              <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} accent bare availableDates={otbDates} />
              <DatePicker label="vs OTB" value={vsOtbDate} onChange={setVsOtbDate} bare availableDates={otbDates.filter(d => d < otbDate)} />
              <span style={{ fontSize: 11, color: 'var(--brand-dimmed)', whiteSpace: 'nowrap' }}>
                {days > 0 ? `${days}일간` : '당일'} 픽업 현황
              </span>
            </div>
            {/* 월별/합계 토글 (현재 월별) */}
            <div className="flex rounded-md overflow-hidden self-stretch" style={{ border: '1px solid var(--color-border-default)', background: 'var(--color-bg-elevated)' }}>
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
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <Skeleton />
          ) : groups.length === 0 || monthKeys.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>
              표시할 account 데이터가 없습니다.
            </p>
          ) : visibleGroups.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>
              {searchQuery.trim()
                ? `'${searchQuery.trim()}'와 일치하는 account가 없습니다.`
                : '필터 조건에 맞는 그룹이 없습니다.'}
            </p>
          ) : (
            <div className="px-6 py-4">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse', position: 'relative', zIndex: 1 }}>
                {/* 헤더 2단 */}
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left', borderRight: BORDER }} rowSpan={2}>Account</th>
                    {visiblePageMonths.map((mk, idx) => (
                      <th key={mk} colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: BORDER, borderRight: BORDER }}>
                        {formatYYYYMM(mk)}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {visiblePageMonths.map((mk, idx) => ([
                      <th key={`${mk}-rn`}  style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderBottom: BORDER }}>ΔR-N</th>,
                      <th key={`${mk}-adr`} style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔADR</th>,
                      <th key={`${mk}-rev`} style={{ ...thBase, textAlign: 'right', borderRight: BORDER, borderBottom: BORDER }}>ΔREV</th>,
                    ]))}
                  </tr>
                </thead>

                <tbody>
                  {visibleGroups.map(group => {
                    const collapsed = effectiveCollapsedKeys.has(group.key)
                    const label     = group.segmentationName
                    const sRow      = groupSchemaRow(group, schema)
                    const groupBg   = (isDark ? sRow?.bg_dark_color  : sRow?.bg_light_color)  ?? '#111111'
                    const groupFont = (isDark ? sRow?.font_dark_color : sRow?.font_light_color) ?? 'var(--color-text-primary)'
                    const ACCOUNT_FONT = 'rgba(255,255,255,0.45)'

                    return (
                      <>
                        {/* 그룹 헤더 행 */}
                        <tr
                          key={`hdr-${group.key}`}
                          onClick={() => toggleCollapse(group.key)}
                          className="cursor-pointer"
                          style={{ borderTop: BORDER, background: groupBg, color: groupFont }}
                          onMouseEnter={e => e.currentTarget.style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${groupBg}`}
                          onMouseLeave={e => e.currentTarget.style.background = groupBg}
                        >
                          <td style={{ ...tdBase, paddingLeft: 12 }}>
                            <div className="flex items-center gap-2">
                              {collapsed
                                ? <ChevronRight size={13} style={{ color: groupFont, flexShrink: 0 }} />
                                : <ChevronDown  size={13} style={{ color: groupFont, flexShrink: 0 }} />
                              }
                              <span style={{ fontWeight: 600, color: groupFont }}>{label}</span>
                              <span style={{ fontSize: 11, color: groupFont, opacity: 0.6 }}>({group.rows.length}개)</span>
                            </div>
                          </td>
                          {visiblePageMonths.map(mk => (
                            <MonthCells key={mk} cell={group.monthlyTotals[mk] ?? ZERO_CELL} isLast={visiblePageMonths.indexOf(mk) === visiblePageMonths.length - 1} fontColor={groupFont} />
                          ))}
                        </tr>

                        {/* Account 행들 */}
                        {!collapsed && group.rows.map(row => (
                          <tr
                            key={`${group.key}-${row.account_name}`}
                            style={{ borderBottom: `1px solid var(--color-border-subtle)`, background: '#111111', color: ACCOUNT_FONT }}
                            onMouseEnter={e => e.currentTarget.style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), #111111`}
                            onMouseLeave={e => e.currentTarget.style.background = '#111111'}
                          >
                            <td style={{ ...tdBase, paddingLeft: 28, color: ACCOUNT_FONT }}>
                              <span style={{ color: ACCOUNT_FONT }}>└ </span>
                              {!row.account_name || row.account_name === '(미지정)'
                                ? <span style={{ color: ACCOUNT_FONT }}>(미지정)</span>
                                : row.account_name}
                            </td>
                            {visiblePageMonths.map(mk => (
                              <MonthCells key={mk} cell={row.monthlyPickup[mk] ?? ZERO_CELL} isLast={visiblePageMonths.indexOf(mk) === visiblePageMonths.length - 1} fontColor={ACCOUNT_FONT} />
                            ))}
                          </tr>
                        ))}
                      </>
                    )
                  })}
                </tbody>

                <tfoot>
                  {/* 합계 */}
                  <tr style={{ borderTop: '2px solid var(--color-accent-primary)', background: '#111111' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontWeight: 600, color: 'var(--color-text-primary)', borderRight: BORDER }}>
                      합계 (HOU 제외)
                      {isFilterMode && !filterCleared && (
                        <span style={{ fontSize: 10, color: 'var(--brand-dimmed)', marginLeft: 4 }}>※ 전체 기준</span>
                      )}
                    </td>
                    {visiblePageMonths.map(mk => (
                      <MonthCells key={mk} cell={summary.monthlyTotals[mk] ?? ZERO_CELL} isLast={visiblePageMonths.indexOf(mk) === visiblePageMonths.length - 1} />
                    ))}
                  </tr>
                  {/* OCC */}
                  <tr style={{ borderTop: BORDER, background: '#111111' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: BORDER }}>OCC</td>
                    {visiblePageMonths.map((mk, idx) => (
                      <td key={mk} colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER, borderRight: BORDER }}>
                        <FmtOcc n={summary.monthlyTotals[mk]?.occ ?? 0} />
                      </td>
                    ))}
                  </tr>
                  {/* RevPAR */}
                  <tr style={{ borderTop: BORDER, background: '#111111' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: BORDER }}>RevPAR</td>
                    {visiblePageMonths.map((mk, idx) => (
                      <td key={mk} colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER, borderRight: BORDER }}>
                        <FmtRevpar n={summary.monthlyTotals[mk]?.revpar ?? 0} />
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
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
