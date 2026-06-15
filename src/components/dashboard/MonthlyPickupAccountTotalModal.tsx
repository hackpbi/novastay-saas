'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
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

// ─── Total cells ───────────────────────────────────────────────────────────────

function TotalCells({ cell }: { cell: MonthlyPickupCell }) {
  return (
    <>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: BORDER }}>
        <FmtPickupNights n={cell.pickupNights} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}>
        <FmtPickupAdr n={cell.pickupAdr} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}>
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

// ─── Modal (합계 전용) ─────────────────────────────────────────────────────────

export default function MonthlyPickupAccountTotalModal({
  open, onClose, roomCount,
  initialFilterSegCodes, initialFilterLabel,
  onBackToSeg,
}: {
  open:                    boolean
  onClose:                 () => void
  roomCount:               number
  initialFilterSegCodes?:  string[]
  initialFilterLabel?:     string
  onBackToSeg?:            () => void
}) {
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()
  const days = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0
  const { data: schema, loading: schemaLoading } = useMarketSchema()
  const { data: pickup, loading: pickupLoading } = usePickupData()

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
  const effectiveSegCodes = !filterCleared ? initialFilterSegCodes : undefined
  const isFilterMode      = !filterCleared && !!initialFilterSegCodes?.length

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

  // reset on open
  useEffect(() => {
    if (open) {
      setSearchQuery(''); setFilterCleared(false)
    }
  }, [open])

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
        style={{ width: 520, maxWidth: '92vw', maxHeight: '88vh', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="px-6 pt-1 pb-1 shrink-0" style={{ borderBottom: BORDER }}>
          {/* 1줄: 제목 + 닫기(Seg 복귀) */}
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
              onClick={() => (onBackToSeg ? onBackToSeg() : onClose())}
              className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1"
              aria-label="Seg 합계로"
            >
              <X size={22} />
            </button>
          </div>
          {/* 2줄: DatePicker */}
          <div className="flex items-center gap-2" style={{ marginTop: 0 }}>
            <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} accent bare availableDates={otbDates} />
            <DatePicker label="vs OTB" value={vsOtbDate} onChange={setVsOtbDate} bare availableDates={otbDates.filter(d => d < otbDate)} />
            <span style={{ fontSize: 11, color: 'var(--brand-dimmed)', whiteSpace: 'nowrap' }}>
              {days > 0 ? `${days}일간` : '당일'} 픽업 현황
            </span>
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
              <div className="flex items-center justify-end mb-2">
                {visibleGroups.length > 0 && (
                  <button
                    onClick={toggleAll}
                    className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                    style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--color-accent-primary)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
                  >
                    {allCollapsed ? '모두 펼치기' : '모두 접기'}
                  </button>
                )}
              </div>
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                {/* 헤더 2단 */}
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left', borderRight: DOUBLE }} rowSpan={2}>Account</th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: BORDER, borderRight: BORDER }}>
                      전체 ({startLabel} ~ {endLabel})
                    </th>
                  </tr>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderBottom: BORDER }}>ΔR-N</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔADR</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: BORDER, borderBottom: BORDER }}>ΔREV</th>
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
                          <TotalCells cell={group.totalPickup} />
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
                            <TotalCells cell={row.totalPickup} />
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
                    <TotalCells cell={summary.grandTotal} />
                  </tr>
                  {/* OCC */}
                  <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE }}>OCC</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER }}>
                      <FmtOcc n={summary.grandTotal.occ} />
                    </td>
                  </tr>
                  {/* RevPAR */}
                  <tr style={{ borderTop: BORDER, background: 'var(--color-bg-secondary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE }}>RevPAR</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderLeft: BORDER }}>
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
            총 {summary.accountCount} accounts · {summary.groupCount} groups
          </span>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>ESC로 닫기</span>
        </div>
      </div>
    </div>
  )
}
