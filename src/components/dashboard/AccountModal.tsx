'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'
import { usePickupData } from '@/hooks/usePickupData'
import { buildAccountTable, type AccountGroup, type AccountTableSummary } from '@/utils/accountTable'
import DatePicker from '@/components/DatePicker'

// ─── Formatters ─────────────────────────────────────────────────────────────────

function Dash({ fontColor }: { fontColor?: string }) {
  return <span style={{ color: fontColor ?? 'var(--brand-dimmed)' }}>—</span>
}

function FmtNights({ n, fontColor }: { n: number; fontColor?: string }) {
  return n === 0 ? <Dash fontColor={fontColor} /> : <span style={{ color: fontColor }}>{n.toLocaleString('ko-KR')}</span>
}
function FmtAdr({ n, fontColor }: { n: number; fontColor?: string }) {
  const k = Math.round(n / 1000)
  return k === 0 ? <Dash fontColor={fontColor} /> : <span style={{ color: fontColor }}>{k}k</span>
}
function FmtRev({ n, fontColor }: { n: number; fontColor?: string }) {
  return n === 0 ? <Dash fontColor={fontColor} /> : <span style={{ color: fontColor }}>{(n / 1_000_000).toFixed(1)}M</span>
}
// Pickup(Δ) — 양수 fontColor(없으면 흰색), 음수 red, 0/Dash fontColor
function DeltaNights({ v, fontColor }: { v: number; fontColor?: string }) {
  if (v === 0) return <Dash fontColor={fontColor} />
  const color = v > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{v > 0 ? '+' : ''}{v.toLocaleString('ko-KR')}</span>
}
function DeltaAdr({ v, fontColor }: { v: number; fontColor?: string }) {
  if (v === 0) return <Dash fontColor={fontColor} />
  const k = Math.round(v / 1000)
  if (k === 0) return <Dash fontColor={fontColor} />
  const color = k > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{k > 0 ? '+' : ''}{k}k</span>
}
function DeltaRev({ v, fontColor }: { v: number; fontColor?: string }) {
  if (v === 0) return <Dash fontColor={fontColor} />
  const m = v / 1_000_000
  const color = m > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{m > 0 ? '+' : ''}{m.toFixed(1)}M</span>
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
  padding: '6px 10px', background: '#0a0a0a', whiteSpace: 'nowrap',
}

const GRID = '0.5px solid rgba(255,255,255,0.06)'
const GRID_HEAD = '0.5px solid rgba(255,255,255,0.12)'

const tdBase: React.CSSProperties = { padding: '7px 10px', verticalAlign: 'middle', borderBottom: GRID }

const BORDER = '1px solid var(--divider-color)'
const DOUBLE = '1px solid rgba(0,229,160,0.3)'   // 섹션 구분선 (초록)

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
  const headerBg    = (isDark ? group.bgDarkColor  : group.bgLightColor)  ?? '#111111'
  const headerColor = '#ffffff'   // 그룹 헤더 이름/수치는 흰색 (PICKUP 음수만 red — Delta 포맷터 처리)

  // separate 모드에서 tr 배경은 sticky thead 위로 칠해지므로, 배경은 td에 적용
  const hcell = (extra: React.CSSProperties): React.CSSProperties => ({
    ...tdBase, textAlign: 'right', fontWeight: 600, background: headerBg, ...extra,
  })
  return (
    <tr
      onClick={onToggle} tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      className="cursor-pointer focus:outline-none"
      style={{ color: headerColor }}
      onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${headerBg}` })}
      onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = headerBg })}
    >
      <td style={{ ...tdBase, paddingLeft: 12, background: headerBg }}>
        <div className="flex items-center gap-2">
          {collapsed
            ? <ChevronRight size={14} style={{ color: headerColor, flexShrink: 0, opacity: 0.7 }} />
            : <ChevronDown  size={14} style={{ color: headerColor, flexShrink: 0, opacity: 0.7 }} />
          }
          <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>{group.rows.length}개</span>
        </div>
      </td>
      <td className="font-mono" style={hcell({ borderLeft: DOUBLE })}>
        <FmtNights n={t.otbNights} fontColor={headerColor} />
      </td>
      <td className="font-mono" style={hcell({ borderLeft: GRID })}>
        <FmtAdr n={t.otbAdr} fontColor={headerColor} />
      </td>
      <td className="font-mono" style={hcell({ borderLeft: GRID })}>
        <FmtRev n={t.otbRevenue} fontColor={headerColor} />
      </td>
      <td className="font-mono" style={hcell({ borderLeft: DOUBLE })}>
        <DeltaNights v={t.puNights} fontColor={headerColor} />
      </td>
      <td className="font-mono" style={hcell({ borderLeft: GRID })}>
        <DeltaAdr v={t.puAdr} fontColor={headerColor} />
      </td>
      <td className="font-mono" style={hcell({ borderLeft: GRID })}>
        <DeltaRev v={t.puRevenue} fontColor={headerColor} />
      </td>
    </tr>
  )
}

// ─── Data Table ─────────────────────────────────────────────────────────────────

function DataTable({ groups, summary, collapsedKeys, onToggle, isSearching, year, month, roomCount, onPrevMonth, onNextMonth, canPrevMonth, canNextMonth }: {
  groups:        AccountGroup[]
  summary:       AccountTableSummary
  collapsedKeys: Set<string>
  onToggle:      (key: string) => void
  isSearching:   boolean
  year:          number
  month:         number
  roomCount:     number
  onPrevMonth:   () => void
  onNextMonth:   () => void
  canPrevMonth:  boolean
  canNextMonth:  boolean
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
    ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)', paddingTop: 10, paddingBottom: 10, background: '#111111',
    borderTop: '1px solid rgba(0,229,160,0.6)',   // 합계 행 위 초록선 (separate 모드: 셀 보더만 렌더)
  }
  const ACCOUNT_FONT = 'rgba(255,255,255,0.45)'
  return (
    <div>
      <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          {/* 0줄: 월 네비게이션 — 표 상단 가운데 */}
          <tr>
            <th colSpan={7} style={{ ...thBase, height: 36, verticalAlign: 'top', padding: 0, borderBottom: GRID }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={onPrevMonth} disabled={!canPrevMonth}
                  style={{ background: 'transparent', border: '1px solid var(--color-border-default)', borderRadius: 6, padding: '2px 4px', display: 'flex', alignItems: 'center', cursor: canPrevMonth ? 'pointer' : 'not-allowed', opacity: canPrevMonth ? 1 : 0.35, color: 'var(--color-text-secondary)' }}
                >
                  <ChevronLeft size={13} />
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', textTransform: 'none', letterSpacing: 'normal', whiteSpace: 'nowrap' }}>
                  {year}년 {month}월
                </span>
                <button
                  onClick={onNextMonth} disabled={!canNextMonth}
                  style={{ background: 'transparent', border: '1px solid var(--color-border-default)', borderRadius: 6, padding: '2px 4px', display: 'flex', alignItems: 'center', cursor: canNextMonth ? 'pointer' : 'not-allowed', opacity: canNextMonth ? 1 : 0.35, color: 'var(--color-text-secondary)' }}
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </th>
          </tr>
          {/* 1줄: 섹션 헤더 */}
          <tr>
            <th rowSpan={2} style={{ ...thBase, textAlign: 'left', minWidth: 200, borderBottom: GRID_HEAD }}>Account</th>
            <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: DOUBLE }}>현재 OTB</th>
            <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: DOUBLE }}>PICKUP VS OTB</th>
          </tr>
          <tr>
            <th style={{ ...thBase, textAlign: 'right', borderLeft: DOUBLE, borderBottom: GRID_HEAD }}>R-N</th>
            <th style={{ ...thBase, textAlign: 'right', borderLeft: GRID, borderBottom: GRID_HEAD }}>ADR</th>
            <th style={{ ...thBase, textAlign: 'right', borderLeft: GRID, borderBottom: GRID_HEAD }}>REV</th>
            <th style={{ ...thBase, textAlign: 'right', borderLeft: DOUBLE, borderBottom: GRID_HEAD }}>ΔR-N</th>
            <th style={{ ...thBase, textAlign: 'right', borderLeft: GRID, borderBottom: GRID_HEAD }}>ΔADR</th>
            <th style={{ ...thBase, textAlign: 'right', borderLeft: GRID, borderBottom: GRID_HEAD }}>ΔREV</th>
          </tr>
        </thead>

        <tbody>
          {groups.map(g => {
            const isCollapsed = !isSearching && collapsedKeys.has(g.key)
            return (
              <>
                <GroupHeaderRow key={`hdr-${g.key}`} group={g} collapsed={isCollapsed} onToggle={() => onToggle(g.key)} />
                {!isCollapsed && g.rows.map((row, i) => (
                  <tr key={`${g.key}-${i}`} className="hover:bg-white/5" style={{ borderBottom: BORDER, color: ACCOUNT_FONT }}>
                    <td style={{ ...tdBase, paddingLeft: 40 }}>
                      <span style={{ color: ACCOUNT_FONT }}>└ </span>
                      <span style={{ color: ACCOUNT_FONT }}>
                        {row.account_name}
                      </span>
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: DOUBLE }}>
                      <FmtNights n={row.otbNights} fontColor={ACCOUNT_FONT} />
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: GRID }}>
                      <FmtAdr n={row.otbAdr} fontColor={ACCOUNT_FONT} />
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: GRID }}>
                      <FmtRev n={row.otbRevenue} fontColor={ACCOUNT_FONT} />
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: DOUBLE }}>
                      <DeltaNights v={row.puNights} fontColor={ACCOUNT_FONT} />
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: GRID }}>
                      <DeltaAdr v={row.puAdr} fontColor={ACCOUNT_FONT} />
                    </td>
                    <td className="font-mono" style={{ ...tdBase, textAlign: 'right', borderLeft: GRID }}>
                      <DeltaRev v={row.puRevenue} fontColor={ACCOUNT_FONT} />
                    </td>
                  </tr>
                ))}
              </>
            )
          })}
        </tbody>

        <tfoot>
          <tr>
            <td style={{ ...sumTd, paddingLeft: 12 }}>합계 (HOU 제외)</td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: DOUBLE }}>
              <FmtNights n={summary.totalNights} />
            </td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: GRID }}>
              <FmtAdr n={summary.totalAdr} />
            </td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: GRID }}>
              <FmtRev n={summary.totalRevenue} />
            </td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: DOUBLE }}>
              <DeltaNights v={summary.puNights} />
            </td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: GRID }}>
              <DeltaAdr v={summary.puAdr} />
            </td>
            <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: GRID }}>
              <DeltaRev v={summary.puRevenue} />
            </td>
          </tr>
          <tr style={{ borderTop: GRID }}>
            <td style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--brand-dimmed)', padding: '10px 12px', borderBottom: GRID, background: '#111111' }}>OCC</td>
            <td colSpan={3} className="font-mono" style={{ textAlign: 'right', paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontWeight: 600, color: 'var(--color-text-primary)', borderLeft: DOUBLE, borderBottom: GRID, background: '#111111' }}>
              {otbOcc.toFixed(1)}%
            </td>
            <td colSpan={3} className="font-mono" style={{ textAlign: 'right', paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontWeight: 600, color: puColor(puOcc), borderLeft: DOUBLE, borderBottom: GRID, background: '#111111' }}>
              {fmtPuOcc(puOcc)}
            </td>
          </tr>
          <tr style={{ borderTop: GRID }}>
            <td style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--brand-dimmed)', padding: '10px 12px', borderBottom: GRID, background: '#111111' }}>RevPAR</td>
            <td colSpan={3} className="font-mono" style={{ textAlign: 'right', paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontWeight: 600, color: 'var(--color-text-primary)', borderLeft: DOUBLE, borderBottom: GRID, background: '#111111' }}>
              {Math.round(otbRevpar / 1000)}k
            </td>
            <td colSpan={3} className="font-mono" style={{ textAlign: 'right', paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontWeight: 600, color: puColor(puRevpar), borderLeft: DOUBLE, borderBottom: GRID, background: '#111111' }}>
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
  onBackToSeg?:            (year: number, month: number) => void
}) {
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()
  const { data: schema, loading: schemaLoading, error: schemaError } = useMarketSchema()
  const { data: pickup, loading: pickupLoading } = usePickupData()

  const days = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0

  const [searchQuery,   setSearchQuery]   = useState('')
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const [curYear,  setCurYear]  = useState(year)
  const [curMonth, setCurMonth] = useState(month)

  // 모달이 다른 month로 열릴 때 동기화
  useEffect(() => {
    if (open) { setCurYear(year); setCurMonth(month) }
  }, [open, year, month])

  // 6개월 범위 (year/month ~ +5개월)
  const monthRange = useMemo(() => {
    const months: { year: number; month: number }[] = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(year, (month - 1) + i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
    }
    return months
  }, [year, month])

  const currentIndex = monthRange.findIndex(m => m.year === curYear && m.month === curMonth)
  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < monthRange.length - 1
  const goPrev = () => { if (canGoPrev) { const t = monthRange[currentIndex - 1]; setCurYear(t.year); setCurMonth(t.month) } }
  const goNext = () => { if (canGoNext) { const t = monthRange[currentIndex + 1]; setCurYear(t.year); setCurMonth(t.month) } }

  const loading = schemaLoading || pickupLoading

  const { groups, summary } = useMemo(
    () => !loading && schema.length > 0
      ? buildAccountTable({ schema, pickup, year: curYear, month: curMonth, roomCount })
      : { groups: [], summary: EMPTY_SUMMARY },
    [schema, pickup, curYear, curMonth, roomCount, loading],
  )

  // 1. 모든 그룹 표시 (필터 없음 — 클릭 세그는 펼침/나머지 접힘으로 처리)
  const filterGrouped = groups

  // 2. Search within all groups
  const query = searchQuery.trim().toLowerCase()
  const isSearching = query.length > 0

  const filteredGroups = useMemo(() => {
    if (!isSearching) return filterGrouped
    return filterGrouped
      .map(g => ({ ...g, rows: g.rows.filter(r => r.account_name.toLowerCase().includes(query)) }))
      .filter(g => g.rows.length > 0)
  }, [filterGrouped, query, isSearching])

  // 3. Summary: 전체 기준
  const displaySummary = summary

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
    }
  }, [open, initialFilterSegCodes])

  // 클릭한 세그먼트만 펼치고 나머지는 접기
  useEffect(() => {
    if (!open || groups.length === 0) return
    const codes = initialFilterSegCodes
    if (codes && codes.length > 0) {
      setCollapsedKeys(new Set(groups.filter(g => !groupHasFilterCode(g, codes, schema)).map(g => g.key)))
    } else {
      setCollapsedKeys(new Set())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groups, initialFilterSegCodes])

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
        style={{ maxHeight: '88vh', background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)' }}>
          {/* 1줄: 제목 + 닫기 (→ Seg로 복귀) */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Pick-Up Status By Accounts</h2>
            <button
              onClick={() => onBackToSeg ? onBackToSeg(curYear, curMonth) : onClose()}
              className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1 shrink-0"
              aria-label="닫기"
            >
              <X size={22} />
            </button>
          </div>

          {/* 2줄: OTB + VS OTB DatePicker */}
          <div className="flex items-center gap-2 mt-1">
            <DatePicker
              label="OTB"
              value={otbDate}
              onChange={setOtbDate}
              availableDates={otbDates}
              accent
              bare
            />
            <DatePicker
              label="VS OTB"
              value={vsOtbDate}
              onChange={setVsOtbDate}
              availableDates={otbDates.filter(d => d < otbDate)}
              bare
            />
            <span className="text-xs" style={{ color: 'var(--brand-dimmed)', whiteSpace: 'nowrap' }}>
              {days === 0 ? '당일' : `${days}일간`} 픽업 현황 입니다.
            </span>
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
              year={curYear}
              month={curMonth}
              roomCount={roomCount}
              onPrevMonth={goPrev}
              onNextMonth={goNext}
              canPrevMonth={canGoPrev}
              canNextMonth={canGoNext}
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
