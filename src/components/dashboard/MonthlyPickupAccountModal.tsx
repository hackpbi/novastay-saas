'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight, ChevronDown, Search, ArrowLeft } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
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
  padding: '6px 10px', background: 'var(--color-bg-elevated)', whiteSpace: 'nowrap',
}
const tdBase: React.CSSProperties = {
  padding: '6px 10px', verticalAlign: 'middle',
}
const BORDER = '1px solid var(--divider-color)'
const DOUBLE = '3px double rgba(255, 255, 255, 0.25)'
const ZERO_CELL: MonthlyPickupCell = { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 }

// ─── Format helpers ────────────────────────────────────────────────────────────

function formatYYYYMM(key: string): string {
  return key.replace('-', '.')
}

function Dash() {
  return <span style={{ color: 'var(--brand-dimmed)' }}>—</span>
}

function FmtPickupNights({ n }: { n: number }) {
  if (n === 0) return <Dash />
  const sign  = n > 0 ? '+' : ''
  const color = n > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toLocaleString('ko-KR')}</span>
}

function FmtPickupAdr({ n }: { n: number }) {
  if (Math.abs(n) < 500) return <Dash />
  const k     = Math.round(n / 1000)
  const sign  = k > 0 ? '+' : ''
  const color = k > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
}

function FmtPickupRevenue({ n }: { n: number }) {
  if (Math.abs(n) < 50_000) return <Dash />
  const m     = (n / 1_000_000).toFixed(1)
  const sign  = n > 0 ? '+' : ''
  const color = n > 0 ? 'var(--color-positive)' : 'var(--color-negative)'
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

function MonthCells({ cell, isLast }: { cell: MonthlyPickupCell; isLast?: boolean }) {
  return (
    <>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: BORDER }}>
        <FmtPickupNights n={cell.pickupNights} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}>
        <FmtPickupAdr n={cell.pickupAdr} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: isLast ? undefined : DOUBLE }}>
        <FmtPickupRevenue n={cell.pickupRevenue} />
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
  onBackToSeg,
}: {
  open:                    boolean
  onClose:                 () => void
  roomCount:               number
  initialFilterSegCodes?:  string[]
  initialFilterMonthKey?:  string
  initialFilterLabel?:     string
  initialViewMode?:        'monthly' | 'total'
  onBackToSeg?:            () => void
}) {
  const { currentHotel }                         = useHotel()
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
  const [viewMode,      setViewMode]      = useState<'monthly' | 'total'>(initialViewMode ?? 'total')
  const [filterCleared, setFilterCleared] = useState(false)

  const loading = schemaLoading || pickupLoading

  const { groups, summary, monthKeys } = useMemo(
    () => !loading && schema.length > 0
      ? buildMonthlyPickupAccountTable({ schema, pickup, roomCount })
      : { groups: [], summary: { monthlyTotals: {}, grandTotal: { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0, occ: 0, revpar: 0 }, accountCount: 0, groupCount: 0 }, monthKeys: [] },
    [schema, pickup, roomCount, loading],
  )

  // Effective filter
  const effectiveSegCodes = !filterCleared ? initialFilterSegCodes : undefined
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

  // group filter + search
  const visibleGroups = useMemo(() => {
    let g = groups

    if (effectiveSegCodes && effectiveSegCodes.length > 0) {
      g = g.filter(group => groupHasFilterCode(group, effectiveSegCodes, schema))
    }

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      g = g
        .map(group => ({ ...group, rows: group.rows.filter(r => r.account_name.toLowerCase().includes(q)) }))
        .filter(group => group.rows.length > 0)
    }

    return g
  }, [groups, effectiveSegCodes, searchQuery, schema])

  // auto-collapse on open / groups change
  useEffect(() => {
    if (!open) return
    if (isFilterMode && !filterCleared) {
      setCollapsedKeys(new Set())  // 필터 진입 시 모두 펼침
    } else {
      setCollapsedKeys(new Set(visibleGroups.map(g => g.key)))  // 전체 모드: 모두 접힘
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isFilterMode, filterCleared, visibleGroups.length])

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
      if (initialFilterMonthKey) {
        setViewMode('monthly')  // 단일 월 필터는 항상 월별 뷰
      } else {
        setViewMode(initialViewMode ?? 'total')
      }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-6xl"
        style={{ maxHeight: '88vh', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 shrink-0" style={{ borderBottom: BORDER }}>
          {/* Left */}
          <div className="flex items-start gap-3">
            {/* Back button */}
            {onBackToSeg && isFilterMode && (
              <button
                onClick={onBackToSeg}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors shrink-0 mt-0.5"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-accent-primary)'; e.currentTarget.style.borderColor = 'var(--color-accent-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--color-border-default)' }}
              >
                <ArrowLeft size={12} />
                Seg로
              </button>
            )}

            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                월별 픽업 추이 — Account
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--brand-dimmed)' }}>
                {isFilterMode && initialFilterLabel
                  ? `필터: ${initialFilterLabel}`
                  : startLabel && endLabel
                    ? `${startLabel} ~ ${endLabel} · ${currentHotel?.hotel_name ?? ''}`
                    : currentHotel?.hotel_name ?? ''
                }
              </p>

              {/* Filter chip */}
              {isFilterMode && initialFilterLabel && (
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]"
                    style={{ background: 'var(--accent-badge-bg)', color: 'var(--color-accent-primary)', border: '1px solid var(--color-accent-primary)' }}>
                    {initialFilterLabel}
                    <button
                      onClick={() => setFilterCleared(true)}
                      className="hover:opacity-60 transition-opacity leading-none ml-0.5"
                      aria-label="필터 해제"
                    >
                      ×
                    </button>
                  </span>
                </div>
              )}

              {/* OTB / vsOTB picker */}
              <div className="flex items-center gap-2 mt-1.5">
                <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} accent availableDates={otbDates} />
                <span className="text-xs" style={{ color: 'var(--brand-dimmed)' }}>vs</span>
                <DatePicker label="vs OTB" value={vsOtbDate} onChange={setVsOtbDate} availableDates={otbDates.filter(d => d < otbDate)} />
                <span className="text-xs" style={{ color: 'var(--brand-dimmed)' }}>
                  {days > 0 ? `${days}일간` : '당일'} 픽업 현황
                </span>
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="account 검색..."
                autoFocus
                className="text-xs pl-7 pr-3 py-1.5 rounded-lg focus:outline-none"
                style={{
                  width: 180,
                  background: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border-default)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>

            {/* Collapse all toggle */}
            {visibleGroups.length > 0 && (
              <button
                onClick={toggleAll}
                className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-accent-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
              >
                {allCollapsed ? '모두 펼치기' : '모두 접기'}
              </button>
            )}

            {/* Pagination — 슬라이드인/아웃 */}
            {!isSingleMonth && totalPages > 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden',
                maxWidth:  viewMode === 'monthly' ? '140px' : '0px',
                opacity:   viewMode === 'monthly' ? 1 : 0,
                transform: viewMode === 'monthly' ? 'translateX(0)' : 'translateX(-10px)',
                transition: 'max-width 280ms cubic-bezier(0.22,1,0.36,1), opacity 220ms ease, transform 280ms cubic-bezier(0.22,1,0.36,1)',
                pointerEvents: viewMode === 'monthly' ? 'auto' : 'none',
              }}>
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

            {/* View mode toggle */}
            {(() => {
              const isToggleDisabled = !!effectiveMonthKey
              return (
                <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--color-border-default)', background: 'var(--color-bg-elevated)', opacity: isToggleDisabled ? 0.4 : 1 }}>
                  {(['monthly', 'total'] as const).map(mode => (
                    <button key={mode}
                      onClick={() => { if (!isToggleDisabled) setViewMode(mode) }}
                      className="px-2.5 py-1 text-xs transition-colors"
                      style={{ cursor: isToggleDisabled ? 'not-allowed' : 'pointer', background: viewMode === mode ? 'var(--color-accent-primary)' : 'transparent', color: viewMode === mode ? '#0A0A0A' : 'var(--color-text-secondary)' }}>
                      {mode === 'monthly' ? '월별' : '합계'}
                    </button>
                  ))}
                </div>
              )
            })()}

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
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                {/* 헤더 2단 */}
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left', borderRight: DOUBLE }} rowSpan={2}>Account</th>
                    {viewMode === 'monthly' ? (
                      visiblePageMonths.map((mk, idx) => (
                        <th key={mk} colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: BORDER, borderRight: idx < visiblePageMonths.length - 1 ? DOUBLE : BORDER }}>
                          {formatYYYYMM(mk)}
                        </th>
                      ))
                    ) : (
                      <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: BORDER, borderRight: BORDER }}>
                        전체 ({formatYYYYMM(monthKeys[0] ?? '')} ~ {formatYYYYMM(monthKeys[monthKeys.length - 1] ?? '')})
                      </th>
                    )}
                  </tr>
                  <tr>
                    {viewMode === 'monthly' ? (
                      visiblePageMonths.map((mk, idx) => ([
                        <th key={`${mk}-rn`}  style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderBottom: BORDER }}>ΔR-N</th>,
                        <th key={`${mk}-adr`} style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔADR</th>,
                        <th key={`${mk}-rev`} style={{ ...thBase, textAlign: 'right', borderRight: idx < visiblePageMonths.length - 1 ? DOUBLE : BORDER, borderBottom: BORDER }}>ΔREV</th>,
                      ]))
                    ) : ([
                      <th key="total-rn"  style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderBottom: BORDER }}>ΔR-N</th>,
                      <th key="total-adr" style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔADR</th>,
                      <th key="total-rev" style={{ ...thBase, textAlign: 'right', borderRight: BORDER, borderBottom: BORDER }}>ΔREV</th>,
                    ])}
                  </tr>
                </thead>

                <tbody>
                  {visibleGroups.map(group => {
                    const collapsed = effectiveCollapsedKeys.has(group.key)
                    const label     = group.segmentationName

                    return (
                      <>
                        {/* 그룹 헤더 행 */}
                        <tr
                          key={`hdr-${group.key}`}
                          onClick={() => toggleCollapse(group.key)}
                          className="cursor-pointer"
                          style={{ borderTop: BORDER, background: 'var(--color-bg-elevated)' }}
                          onMouseEnter={e => e.currentTarget.style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), var(--color-bg-elevated)`}
                          onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                        >
                          <td style={{ ...tdBase, paddingLeft: 12 }}>
                            <div className="flex items-center gap-2">
                              {collapsed
                                ? <ChevronRight size={13} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                                : <ChevronDown  size={13} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                              }
                              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</span>
                              <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>({group.rows.length}개)</span>
                            </div>
                          </td>
                          {viewMode === 'monthly' ? (
                            visiblePageMonths.map(mk => (
                              <MonthCells key={mk} cell={group.monthlyTotals[mk] ?? ZERO_CELL} isLast={visiblePageMonths.indexOf(mk) === visiblePageMonths.length - 1} />
                            ))
                          ) : (
                            <MonthCells cell={group.totalPickup} />
                          )}
                        </tr>

                        {/* Account 행들 */}
                        {!collapsed && group.rows.map(row => (
                          <tr
                            key={`${group.key}-${row.account_name}`}
                            style={{ borderBottom: `1px solid var(--color-border-subtle)`, background: 'var(--color-bg-primary)' }}
                            onMouseEnter={e => e.currentTarget.style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), var(--color-bg-primary)`}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-primary)'}
                          >
                            <td style={{ ...tdBase, paddingLeft: 28, color: 'var(--color-text-secondary)' }}>
                              <span style={{ color: 'var(--brand-dimmed)' }}>└ </span>
                              {!row.account_name || row.account_name === '(미지정)'
                                ? <span style={{ color: 'var(--brand-dimmed)' }}>(미지정)</span>
                                : row.account_name}
                            </td>
                            {viewMode === 'monthly' ? (
                              visiblePageMonths.map(mk => (
                                <MonthCells key={mk} cell={row.monthlyPickup[mk] ?? ZERO_CELL} isLast={visiblePageMonths.indexOf(mk) === visiblePageMonths.length - 1} />
                              ))
                            ) : (
                              <MonthCells cell={row.totalPickup} />
                            )}
                          </tr>
                        ))}
                      </>
                    )
                  })}
                </tbody>

                <tfoot>
                  {/* 합계 */}
                  <tr style={{ borderTop: '2px solid var(--color-accent-primary)', background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontWeight: 600, color: 'var(--color-text-primary)', borderRight: DOUBLE }}>
                      합계 (HOU 제외)
                      {isFilterMode && !filterCleared && (
                        <span style={{ fontSize: 10, color: 'var(--brand-dimmed)', marginLeft: 4 }}>※ 전체 기준</span>
                      )}
                    </td>
                    {viewMode === 'monthly' ? (
                      visiblePageMonths.map(mk => (
                        <MonthCells key={mk} cell={summary.monthlyTotals[mk] ?? ZERO_CELL} isLast={visiblePageMonths.indexOf(mk) === visiblePageMonths.length - 1} />
                      ))
                    ) : (
                      <MonthCells cell={summary.grandTotal} />
                    )}
                  </tr>
                  {/* OCC */}
                  <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE }}>OCC</td>
                    {viewMode === 'monthly' ? (
                      visiblePageMonths.map((mk, idx) => (
                        <td key={mk} colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER, borderRight: idx < visiblePageMonths.length - 1 ? DOUBLE : undefined }}>
                          <FmtOcc n={summary.monthlyTotals[mk]?.occ ?? 0} />
                        </td>
                      ))
                    ) : (
                      <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER }}>
                        <FmtOcc n={summary.grandTotal.occ} />
                      </td>
                    )}
                  </tr>
                  {/* RevPAR */}
                  <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE }}>RevPAR</td>
                    {viewMode === 'monthly' ? (
                      visiblePageMonths.map((mk, idx) => (
                        <td key={mk} colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER, borderRight: idx < visiblePageMonths.length - 1 ? DOUBLE : undefined }}>
                          <FmtRevpar n={summary.monthlyTotals[mk]?.revpar ?? 0} />
                        </td>
                      ))
                    ) : (
                      <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER }}>
                        <FmtRevpar n={summary.grandTotal.revpar} />
                      </td>
                    )}
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
