'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Search, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'
import { usePickupData } from '@/hooks/usePickupData'
import { buildAccountTable, type AccountGroup, type AccountTableSummary } from '@/utils/accountTable'

// ─── Formatters ─────────────────────────────────────────────────────────────────

function Dash() {
  return <span style={{ color: 'var(--brand-dimmed)' }}>—</span>
}

function FmtNights({ n }: { n: number }) {
  return n === 0 ? <Dash /> : <>{n.toLocaleString('ko-KR')}</>
}

function FmtAdr({ n }: { n: number }) {
  const k = Math.round(n / 1000)
  return k === 0 ? <Dash /> : <>{k}k</>
}

function FmtRev({ n }: { n: number }) {
  return n === 0 ? <Dash /> : <>{(n / 1_000_000).toFixed(1)}M</>
}

// fontWeight 제거 — 그룹 헤더 td의 fontWeight:600 or 행의 inherited weight 사용
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
      <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
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
    <div className="space-y-1.5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded"
          style={{ height: 36, background: i % 3 === 0 ? 'var(--color-bg-secondary)' : 'var(--color-bg-tertiary)' }} />
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

const tdBase: React.CSSProperties = { padding: '7px 10px', verticalAlign: 'middle' }

const BORDER = '1px solid var(--divider-color)'
const DOUBLE = '3px double rgba(255, 255, 255, 0.25)'

// ─── Filter helper ──────────────────────────────────────────────────────────────

function groupHasFilterCode(group: AccountGroup, codes: string[], schema: MarketSchemaRow[]): boolean {
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

// ─── Group Header Row ──────────────────────────────────────────────────────────

function GroupHeaderRow({ group, collapsed, onToggle }: {
  group:    AccountGroup
  collapsed: boolean
  onToggle:  () => void
}) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const { totals: t } = group
  const label = group.parentName
    ? `${group.parentName} · ${group.segmentationName}`
    : group.segmentationName
  const headerBg    = (isDark ? group.bgDarkColor  : group.bgLightColor)  ?? 'var(--color-bg-elevated)'
  const headerColor = (isDark ? group.fontDarkColor : group.fontLightColor) ?? 'var(--color-text-primary)'

  return (
    <tr
      onClick={onToggle} tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      className="cursor-pointer hover:bg-white/5 focus:outline-none focus:bg-white/5"
      style={{ borderTop: BORDER, background: headerBg, color: headerColor }}
    >
      <td style={{ ...tdBase, paddingLeft: 12, borderRight: DOUBLE }}>
        <div className="flex items-center gap-2">
          {collapsed
            ? <ChevronRight size={14} style={{ color: headerColor, flexShrink: 0, opacity: 0.7 }} />
            : <ChevronDown  size={14} style={{ color: headerColor, flexShrink: 0, opacity: 0.7 }} />
          }
          <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>{group.rows.length}개</span>
        </div>
      </td>
      {/* fontWeight: 600 on td — Delta spans inherit this */}
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', fontWeight: 600 }}>
        <FmtNights n={t.otbNights} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', fontWeight: 600 }}>
        <FmtAdr n={t.otbAdr} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', fontWeight: 600, borderRight: DOUBLE }}>
        <FmtRev n={t.otbRevenue} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', fontWeight: 600, borderLeft: BORDER }}>
        <DeltaNights v={t.puNights} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', fontWeight: 600 }}>
        <DeltaAdr v={t.puAdr} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', fontWeight: 600 }}>
        <DeltaRev v={t.puRevenue} />
      </td>
    </tr>
  )
}

// ─── Data Table ─────────────────────────────────────────────────────────────────

function DataTable({ groups, summary, collapsedKeys, onToggle, isSearching, year, month, roomCount }: {
  groups:        AccountGroup[]
  summary:       AccountTableSummary
  collapsedKeys: Set<string>
  onToggle:      (key: string) => void
  isSearching:   boolean
  year:          number
  month:         number
  roomCount:     number
}) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const capacity    = roomCount * daysInMonth
  const otbOcc    = summary.occ
  const otbRevpar = summary.revpar
  const puOcc     = capacity > 0 ? (summary.puNights  / capacity) * 100  : 0
  const puRevpar  = capacity > 0 ?  summary.puRevenue / capacity          : 0

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

  const sumTd: React.CSSProperties = {
    ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)', paddingTop: 10, paddingBottom: 10,
  }
  return (
    <div>
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          <tr>
            <th style={{ ...thBase, textAlign: 'left', minWidth: 200, borderRight: DOUBLE }}>Account</th>
            <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderRight: DOUBLE }}>현재 OTB</th>
            <th colSpan={3} style={{ ...thBase, textAlign: 'center' }}>Pickup vs OTB</th>
          </tr>
          <tr>
            <th style={{ ...thBase, textAlign: 'left', borderRight: DOUBLE, borderBottom: BORDER }} />
            <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>R-N</th>
            <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ADR</th>
            <th style={{ ...thBase, textAlign: 'right', borderRight: DOUBLE, borderBottom: BORDER }}>REV</th>
            <th style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderBottom: BORDER }}>ΔR-N</th>
            <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔADR</th>
            <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔREV</th>
          </tr>
        </thead>

        <tbody>
          {groups.map(g => {
            const isCollapsed = !isSearching && collapsedKeys.has(g.key)
            return (
              <>
                <GroupHeaderRow key={`hdr-${g.key}`} group={g} collapsed={isCollapsed} onToggle={() => onToggle(g.key)} />
                {!isCollapsed && g.rows.map((row, i) => (
                  <tr key={`${g.key}-${i}`} className="hover:bg-white/5" style={{ borderBottom: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 40, borderRight: DOUBLE }}>
                      <span style={{ color: 'var(--brand-dimmed)' }}>└ </span>
                      <span style={{ color: row.account_name === '(미지정)' ? 'var(--brand-dimmed)' : 'var(--color-text-primary)' }}>
                        {row.account_name}
                      </span>
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}>
                      <FmtNights n={row.otbNights} />
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}>
                      <FmtAdr n={row.otbAdr} />
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: DOUBLE }}>
                      <FmtRev n={row.otbRevenue} />
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: BORDER }}>
                      <DeltaNights v={row.puNights} />
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}>
                      <DeltaAdr v={row.puAdr} />
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}>
                      <DeltaRev v={row.puRevenue} />
                    </td>
                  </tr>
                ))}
              </>
            )
          })}
        </tbody>

        <tfoot>
          <tr style={{ borderTop: '2px solid var(--color-accent-primary)' }}>
            <td style={{ ...sumTd, paddingLeft: 12, borderRight: DOUBLE }}>합계 (HOU 제외)</td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}>
              <FmtNights n={summary.totalNights} />
            </td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}>
              <FmtAdr n={summary.totalAdr} />
            </td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderRight: DOUBLE }}>
              <FmtRev n={summary.totalRevenue} />
            </td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: BORDER }}>
              <DeltaNights v={summary.puNights} />
            </td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}>
              <DeltaAdr v={summary.puAdr} />
            </td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}>
              <DeltaRev v={summary.puRevenue} />
            </td>
          </tr>
          <tr style={{ borderTop: '1px solid var(--divider-color)', background: 'var(--color-bg-secondary)' }}>
            <td style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--brand-dimmed)', padding: '10px 12px', borderRight: DOUBLE }}>OCC</td>
            <td colSpan={3} className="font-mono" style={{ textAlign: 'right', paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontWeight: 600, color: 'var(--color-text-primary)', borderRight: DOUBLE }}>
              {otbOcc.toFixed(1)}%
            </td>
            <td colSpan={3} className="font-mono" style={{ textAlign: 'right', paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontWeight: 600, color: puColor(puOcc) }}>
              {fmtPuOcc(puOcc)}
            </td>
          </tr>
          <tr style={{ borderTop: '1px solid var(--divider-color)', background: 'var(--color-bg-secondary)' }}>
            <td style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--brand-dimmed)', padding: '10px 12px', borderRight: DOUBLE }}>RevPAR</td>
            <td colSpan={3} className="font-mono" style={{ textAlign: 'right', paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontWeight: 600, color: 'var(--color-text-primary)', borderRight: DOUBLE }}>
              {Math.round(otbRevpar / 1000)}k
            </td>
            <td colSpan={3} className="font-mono" style={{ textAlign: 'right', paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontWeight: 600, color: puColor(puRevpar) }}>
              {fmtPuRevpar(puRevpar)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

const EMPTY_SUMMARY: AccountTableSummary = {
  totalNights: 0, totalAdr: 0, totalRevenue: 0,
  puNights: 0, puAdr: 0, puRevenue: 0,
  occ: 0, revpar: 0, accountCount: 0, groupCount: 0,
}

export default function AccountModal({
  open, onClose, year, month, roomCount,
  initialFilterSegCodes, initialFilterLabel, onBackToSeg,
}: {
  open:                    boolean
  onClose:                 () => void
  year:                    number
  month:                   number
  roomCount:               number
  initialFilterSegCodes?:  string[]
  initialFilterLabel?:     string
  onBackToSeg?:            () => void
}) {
  const { currentHotel } = useHotel()
  const { data: schema, loading: schemaLoading, error: schemaError } = useMarketSchema()
  const { data: pickup, loading: pickupLoading } = usePickupData()

  const [searchQuery,   setSearchQuery]   = useState('')
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const [filterCleared, setFilterCleared] = useState(false)

  const loading = schemaLoading || pickupLoading

  const { groups, summary } = useMemo(
    () => !loading && schema.length > 0
      ? buildAccountTable({ schema, pickup, year, month, roomCount })
      : { groups: [], summary: EMPTY_SUMMARY },
    [schema, pickup, year, month, roomCount, loading],
  )

  const filterActive = !filterCleared && !!initialFilterSegCodes?.length

  // 1. Segment filter (후처리)
  const filterGrouped = useMemo(() => {
    if (!filterActive || !initialFilterSegCodes?.length) return groups
    return groups.filter(g => groupHasFilterCode(g, initialFilterSegCodes, schema))
  }, [groups, filterActive, initialFilterSegCodes, schema])

  // 2. Search within filtered groups
  const query = searchQuery.trim().toLowerCase()
  const isSearching = query.length > 0

  const filteredGroups = useMemo(() => {
    if (!isSearching) return filterGrouped
    return filterGrouped
      .map(g => ({ ...g, rows: g.rows.filter(r => r.account_name.toLowerCase().includes(query)) }))
      .filter(g => g.rows.length > 0)
  }, [filterGrouped, query, isSearching])

  // 3. Summary: filtered R-N/REV/ADR/PU, but OCC/RevPAR from full data
  const displaySummary = useMemo((): AccountTableSummary => {
    if (!filterActive || !initialFilterSegCodes?.length) return summary
    let nights = 0, rev = 0, vsN = 0, vsR = 0
    for (const g of filterGrouped) {
      if (g.isHou) continue
      for (const r of g.rows) {
        nights += r.otbNights
        rev    += r.otbRevenue
        vsN    += r.otbNights  - r.puNights
        vsR    += r.otbRevenue - r.puRevenue
      }
    }
    const adr  = nights > 0 ? rev / nights : 0
    const vsAdr = vsN  > 0 ? vsR / vsN  : 0
    return {
      ...summary,   // OCC/RevPAR from full data
      totalNights:  nights,
      totalAdr:     adr,
      totalRevenue: rev,
      puNights:     nights - vsN,
      puAdr:        adr - vsAdr,
      puRevenue:    rev - vsR,
      accountCount: filterGrouped.reduce((s, g) => s + g.rows.length, 0),
      groupCount:   filterGrouped.length,
    }
  }, [filterActive, filterGrouped, summary, initialFilterSegCodes])

  // 모두 접기 / 펼치기
  const allCollapsed = collapsedKeys.size === filterGrouped.length && filterGrouped.length > 0
  function toggleAll() {
    setCollapsedKeys(allCollapsed ? new Set() : new Set(filterGrouped.map(g => g.key)))
  }
  function toggleGroup(key: string) {
    setCollapsedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Body scroll lock
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  // ESC key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // 모달 열리거나 필터 변경 시 상태 리셋
  useEffect(() => {
    if (open) {
      setSearchQuery('')
      setCollapsedKeys(new Set())
      setFilterCleared(false)
    }
  }, [open, initialFilterSegCodes])

  if (!open) return null

  const error = schemaError
  const hasData = groups.length > 0
  const searchEmpty = isSearching && filteredGroups.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />

      {/* Modal */}
      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[94vw] max-w-5xl"
        style={{ maxHeight: '88vh', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)' }}>
          {/* 좌측: 돌아가기 버튼 + 제목 + 필터 칩 */}
          <div className="shrink-0">
            <div className="flex items-center gap-2 mb-0.5">
              {onBackToSeg && filterActive && (
                <button
                  onClick={onBackToSeg}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors"
                  style={{
                    border:  '1px solid var(--color-border-default)',
                    color:   'var(--color-text-secondary)',
                    cursor:  'pointer',
                    background: 'transparent',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--color-accent-primary)'
                    e.currentTarget.style.color = 'var(--color-accent-primary)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--color-border-default)'
                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                  }}
                  aria-label="Segmentation 모달로 돌아가기"
                >
                  <ArrowLeft size={14} />
                  Seg로
                </button>
              )}
              <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Account 비교</h2>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs" style={{ color: 'var(--brand-dimmed)' }}>
                {year}년 {month}월 · {currentHotel?.hotel_name ?? ''}
              </span>
              {filterActive && initialFilterLabel && (
                <span
                  className="flex items-center gap-1"
                  style={{
                    fontSize: 11, background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-accent-primary)',
                    paddingLeft: 8, paddingRight: 4, paddingTop: 2, paddingBottom: 2,
                    borderRadius: 9999, color: 'var(--color-accent-primary)',
                  }}
                >
                  필터: {initialFilterLabel}
                  <button
                    onClick={() => setFilterCleared(true)}
                    className="flex items-center hover:opacity-60 transition-opacity"
                    aria-label="필터 해제"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
            </div>
          </div>

          {/* 우측: 검색 + 모두 접기/펼치기 + 닫기 */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--brand-dimmed)' }} />
              <input
                type="text"
                autoFocus
                placeholder="account 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-3 text-sm rounded-lg focus:outline-none"
                style={{
                  width: 224,
                  background: 'var(--color-bg-elevated)',
                  border: `1px solid ${searchQuery ? 'var(--color-accent-primary)' : 'var(--color-border-default)'}`,
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>

            {!isSearching && hasData && (
              <button onClick={toggleAll} className="text-xs whitespace-nowrap hover:opacity-80 transition-opacity" style={{ color: 'var(--color-text-secondary)' }}>
                {allCollapsed ? '모두 펼치기' : '모두 접기'}
              </button>
            )}

            <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1 shrink-0" aria-label="닫기">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <Skeleton />
          ) : error ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>데이터를 불러오지 못했습니다.</p>
          ) : !hasData ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>이 기간에 표시할 account 데이터가 없습니다.</p>
          ) : searchEmpty ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>'{searchQuery}'와 일치하는 account가 없습니다.</p>
          ) : filteredGroups.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>필터에 해당하는 데이터가 없습니다.</p>
          ) : (
            <DataTable
              groups={filteredGroups}
              summary={displaySummary}
              collapsedKeys={collapsedKeys}
              onToggle={toggleGroup}
              isSearching={isSearching}
              year={year}
              month={month}
              roomCount={roomCount}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderTop: '1px solid var(--divider-color)' }}>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
            총 {displaySummary.accountCount} accounts · {displaySummary.groupCount} groups
          </span>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>ESC 또는 바깥 클릭으로 닫기</span>
        </div>
      </div>
    </div>
  )
}
