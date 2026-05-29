'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { usePickupData } from '@/hooks/usePickupData'
import { buildAccountTable, type AccountGroup, type AccountTableSummary } from '@/utils/accountTable'

// ─── Formatters (same pattern as SegmentationModal) ──────────────────────────

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

function DeltaNights({ v }: { v: number }) {
  if (v === 0) return <Dash />
  const cls = v > 0 ? 'text-status-positive' : 'text-status-negative'
  return (
    <span className={cls} style={{ fontWeight: 600 }}>
      {v > 0 ? '+' : ''}{v.toLocaleString('ko-KR')}
    </span>
  )
}

function DeltaAdr({ v }: { v: number }) {
  if (v === 0) return <Dash />
  const k = Math.round(v / 1000)
  if (k === 0) return <Dash />
  const cls = k > 0 ? 'text-status-positive' : 'text-status-negative'
  return (
    <span className={cls} style={{ fontWeight: 600 }}>
      {k > 0 ? '+' : ''}{k}k
    </span>
  )
}

function DeltaRev({ v }: { v: number }) {
  if (v === 0) return <Dash />
  const m = v / 1_000_000
  const cls = m > 0 ? 'text-status-positive' : 'text-status-negative'
  return (
    <span className={cls} style={{ fontWeight: 600 }}>
      {m > 0 ? '+' : ''}{m.toFixed(1)}M
    </span>
  )
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
      <p style={{
        fontSize: 22, fontWeight: 700,
        color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono, monospace)',
      }}>
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
        <div
          key={i}
          className="animate-pulse rounded"
          style={{
            height:     36,
            background: i % 3 === 0 ? 'var(--color-bg-secondary)' : 'var(--color-bg-tertiary)',
          }}
        />
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
  padding: '7px 10px', verticalAlign: 'middle',
}

const BORDER = '1px solid var(--divider-color)'

// ─── Group Header Row ──────────────────────────────────────────────────────────

function GroupHeaderRow({
  group, collapsed, onToggle,
}: {
  group:     AccountGroup
  collapsed: boolean
  onToggle:  () => void
}) {
  const { totals: t } = group
  const label = group.parentName
    ? `${group.parentName} · ${group.segmentationName}`
    : group.segmentationName

  return (
    <tr
      onClick={onToggle}
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      className="cursor-pointer hover:bg-white/5 focus:outline-none focus:bg-white/5"
      style={{ borderTop: BORDER, background: 'var(--color-bg-elevated)' }}
    >
      <td style={{ ...tdBase, paddingLeft: 12 }}>
        <div className="flex items-center gap-2">
          {collapsed
            ? <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
            : <ChevronDown  size={14} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          }
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: 13 }}>
            {label}
          </span>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
            {group.rows.length}개
          </span>
        </div>
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', fontWeight: 600, borderLeft: BORDER }}>
        <FmtNights n={t.otbNights} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', fontWeight: 600 }}>
        <FmtAdr n={t.otbAdr} />
      </td>
      <td className="font-mono" style={{ ...tdBase, textAlign: 'right', fontWeight: 600, borderRight: BORDER }}>
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

function DataTable({
  groups, summary, collapsedKeys, onToggle, isSearching,
}: {
  groups:       AccountGroup[]
  summary:      AccountTableSummary
  collapsedKeys: Set<string>
  onToggle:     (key: string) => void
  isSearching:  boolean
}) {
  const sumTd: React.CSSProperties = {
    ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)', paddingTop: 10, paddingBottom: 10,
  }
  return (
    <div>
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          <tr>
            <th style={{ ...thBase, textAlign: 'left', minWidth: 200 }}>Account</th>
            <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: BORDER }}>현재 OTB</th>
            <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: BORDER }}>Pickup vs OTB</th>
          </tr>
          <tr>
            <th style={{ ...thBase, textAlign: 'left', borderBottom: BORDER }} />
            <th style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderBottom: BORDER }}>R-N</th>
            <th style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ADR</th>
            <th style={{ ...thBase, textAlign: 'right', borderRight: BORDER, borderBottom: BORDER }}>REV</th>
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
                <GroupHeaderRow
                  key={`hdr-${g.key}`}
                  group={g}
                  collapsed={isCollapsed}
                  onToggle={() => onToggle(g.key)}
                />
                {!isCollapsed && g.rows.map((row, i) => (
                  <tr
                    key={`${g.key}-${i}`}
                    className="hover:bg-white/5"
                    style={{ borderBottom: BORDER }}
                  >
                    <td style={{
                      ...tdBase,
                      paddingLeft: 40,
                      color: row.account_name === '(미지정)'
                        ? 'var(--brand-dimmed)'
                        : 'var(--color-text-primary)',
                    }}>
                      {row.account_name}
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: BORDER }}>
                      <FmtNights n={row.otbNights} />
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right' }}>
                      <FmtAdr n={row.otbAdr} />
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderRight: BORDER }}>
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
            <td style={{ ...sumTd, paddingLeft: 12 }}>합계 (HOU 제외)</td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: BORDER }}>
              <FmtNights n={summary.totalNights} />
            </td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}>
              <FmtAdr n={summary.totalAdr} />
            </td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderRight: BORDER }}>
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
        </tfoot>
      </table>

      {/* OCC / RevPAR 카드 */}
      <div className="flex gap-3 mt-4">
        <StatCard label="OCC"    value={`${summary.occ.toFixed(1)}%`} />
        <StatCard label="RevPAR" value={`${Math.round(summary.revpar / 1000)}k`} />
      </div>
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
}: {
  open:      boolean
  onClose:   () => void
  year:      number
  month:     number
  roomCount: number
}) {
  const { currentHotel } = useHotel()
  const { data: schema, loading: schemaLoading, error: schemaError } = useMarketSchema()
  const { data: pickup, loading: pickupLoading } = usePickupData()

  const [searchQuery,   setSearchQuery]   = useState('')
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())

  const loading = schemaLoading || pickupLoading

  const { groups, summary } = useMemo(
    () => !loading && schema.length > 0
      ? buildAccountTable({ schema, pickup, year, month, roomCount })
      : { groups: [], summary: EMPTY_SUMMARY },
    [schema, pickup, year, month, roomCount, loading],
  )

  // 검색 필터링
  const query = searchQuery.trim().toLowerCase()
  const isSearching = query.length > 0

  const filteredGroups = useMemo(() => {
    if (!isSearching) return groups
    return groups
      .map(g => ({ ...g, rows: g.rows.filter(r => r.account_name.toLowerCase().includes(query)) }))
      .filter(g => g.rows.length > 0)
  }, [groups, query, isSearching])

  // 모두 접기 / 펼치기
  const allCollapsed = collapsedKeys.size === groups.length && groups.length > 0
  function toggleAll() {
    setCollapsedKeys(allCollapsed ? new Set() : new Set(groups.map(g => g.key)))
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

  // 모달 열릴 때 검색 초기화
  useEffect(() => {
    if (open) setSearchQuery('')
  }, [open])

  if (!open) return null

  const error = schemaError
  const hasData = groups.length > 0
  const searchEmpty = isSearching && filteredGroups.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[94vw] max-w-5xl"
        style={{
          maxHeight:  '88vh',
          background: 'var(--color-bg-surface)',
          border:     '1px solid var(--color-border-default)',
          boxShadow:  'var(--shadow-card)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-4 px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--divider-color)' }}
        >
          {/* 좌측: 제목 */}
          <div className="shrink-0">
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Account 비교
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--brand-dimmed)' }}>
              {year}년 {month}월 · {currentHotel?.hotel_name ?? ''}
            </p>
          </div>

          {/* 우측: 검색 + 토글 + 닫기 */}
          <div className="flex items-center gap-3 min-w-0">
            {/* 검색 */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--brand-dimmed)' }}
              />
              <input
                type="text"
                autoFocus
                placeholder="account 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-3 text-sm rounded-lg focus:outline-none"
                style={{
                  width:      224,
                  background: 'var(--color-bg-elevated)',
                  border:     `1px solid ${searchQuery ? 'var(--color-accent-primary)' : 'var(--color-border-default)'}`,
                  color:      'var(--color-text-primary)',
                }}
              />
            </div>

            {/* 모두 접기/펼치기 */}
            {!isSearching && hasData && (
              <button
                onClick={toggleAll}
                className="text-xs whitespace-nowrap hover:opacity-80 transition-opacity"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {allCollapsed ? '모두 펼치기' : '모두 접기'}
              </button>
            )}

            {/* 닫기 */}
            <button
              onClick={onClose}
              className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1 shrink-0"
              aria-label="닫기"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <Skeleton />
          ) : error ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>
              데이터를 불러오지 못했습니다.
            </p>
          ) : !hasData ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>
              이 기간에 표시할 account 데이터가 없습니다.
            </p>
          ) : searchEmpty ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>
              '{searchQuery}'와 일치하는 account가 없습니다.
            </p>
          ) : (
            <DataTable
              groups={filteredGroups}
              summary={summary}
              collapsedKeys={collapsedKeys}
              onToggle={toggleGroup}
              isSearching={isSearching}
            />
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{ borderTop: '1px solid var(--divider-color)' }}
        >
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
            총 {summary.accountCount} accounts · {summary.groupCount} groups
          </span>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
            ESC 또는 바깥 클릭으로 닫기
          </span>
        </div>
      </div>
    </div>
  )
}
