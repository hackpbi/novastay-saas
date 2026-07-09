'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'
import DatePicker from '@/components/DatePicker'
import { useLyPacing, type LyPacingMode } from '@/hooks/useLyPacing'
import {
  buildLyComparisonAccountTable,
  type LyComparisonAccountGroup,
} from '@/utils/lyComparisonAccountTable'
import type { LyComparisonMonthly } from '@/utils/lyComparisonSegTable'

// ─── Constants ─────────────────────────────────────────────────────────────────

const thBase: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--color-text-secondary)',
  padding: '6px 10px', background: '#0a0a0a', whiteSpace: 'nowrap',
}
const tdBase: React.CSSProperties = {
  padding: '6px 10px', verticalAlign: 'middle', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
}
const BORDER = '1px solid var(--divider-color)'
// 섹션 구분선(현재 OTB / 작년 OTB / GAP 경계) — 초록
const DOUBLE = '1px solid rgba(0,229,160,0.3)'

const ZERO_MONTHLY: LyComparisonMonthly = {
  otb: { nights: 0, adr: 0, revenue: 0 },
  ly:  { nights: 0, adr: 0, revenue: 0 },
  gap: { nights: 0, adr: 0, revenue: 0 },
}

// ─── Format helpers ────────────────────────────────────────────────────────────

function Dash() { return <span style={{ color: 'var(--brand-dimmed)' }}>—</span> }

// 현재OTB/작년OTB 수치 — 항상 fontColor(없으면 td 상속), 음수도 fontColor(red 아님)
function FmtNights({ n, fontColor }: { n: number; fontColor?: string }) {
  if (n === 0) return <span style={{ color: fontColor ?? 'var(--brand-dimmed)' }}>—</span>
  return <span style={{ color: fontColor }}>{n.toLocaleString('ko-KR')}</span>
}
function FmtAdr({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 500) return <span style={{ color: fontColor ?? 'var(--brand-dimmed)' }}>—</span>
  return <span style={{ color: fontColor }}>{Math.round(n / 1000)}k</span>
}
function FmtRevenue({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 50_000) return <span style={{ color: fontColor ?? 'var(--brand-dimmed)' }}>—</span>
  return <span style={{ color: fontColor }}>{(n / 1_000_000).toFixed(1)}M</span>
}
// GAP — 양수 fontColor(없으면 흰색), 음수 red, 0/Dash fontColor
function FmtGapNights({ n, fontColor }: { n: number; fontColor?: string }) {
  if (n === 0) return <span style={{ color: fontColor ?? 'rgba(255,255,255,0.4)' }}>—</span>
  const sign = n > 0 ? '+' : ''; const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toLocaleString('ko-KR')}</span>
}
function FmtGapAdr({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 500) return <span style={{ color: fontColor ?? 'rgba(255,255,255,0.4)' }}>—</span>
  const k = Math.round(n / 1000); const sign = k > 0 ? '+' : ''; const color = k > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
}
function FmtGapRevenue({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 50_000) return <span style={{ color: fontColor ?? 'rgba(255,255,255,0.4)' }}>—</span>
  const m = (n / 1_000_000).toFixed(1); const sign = n > 0 ? '+' : ''; const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{m}M</span>
}
function FmtOcc({ n }: { n: number }) {
  if (Math.abs(n) < 0.1) return <Dash />
  return <>{n.toFixed(1)}%</>
}
function FmtGapPct({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 0.1) return <span style={{ color: fontColor ?? 'rgba(255,255,255,0.4)' }}>—</span>
  const sign = n > 0 ? '+' : ''; const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toFixed(1)}%p</span>
}
function FmtRevpar({ n }: { n: number }) {
  if (Math.abs(n) < 500) return <Dash />
  return <>{Math.round(n / 1000)}k</>
}
function FmtGapRevpar({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 500) return <span style={{ color: fontColor ?? 'rgba(255,255,255,0.4)' }}>—</span>
  const k = Math.round(n / 1000); const sign = k > 0 ? '+' : ''; const color = k > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
}

// ─── Row cells (shared) ───────────────────────────────────────────────────────

function MonthCells({ m, bg, fontColor }: { m: LyComparisonMonthly; bg?: string; fontColor?: string }) {
  const c: React.CSSProperties = { ...tdBase, textAlign: 'right', background: bg }
  return (
    <>
      <td className="font-mono" style={{ ...c, borderLeft: BORDER }}><FmtNights n={m.otb.nights} fontColor={fontColor} /></td>
      <td className="font-mono" style={c}><FmtAdr n={m.otb.adr} fontColor={fontColor} /></td>
      <td className="font-mono" style={{ ...c, borderRight: DOUBLE }}><FmtRevenue n={m.otb.revenue} fontColor={fontColor} /></td>
      <td className="font-mono" style={c}><FmtNights n={m.ly.nights} fontColor={fontColor} /></td>
      <td className="font-mono" style={c}><FmtAdr n={m.ly.adr} fontColor={fontColor} /></td>
      <td className="font-mono" style={{ ...c, borderRight: DOUBLE }}><FmtRevenue n={m.ly.revenue} fontColor={fontColor} /></td>
      <td className="font-mono" style={c}><FmtGapNights n={m.gap.nights} fontColor={fontColor} /></td>
      <td className="font-mono" style={c}><FmtGapAdr n={m.gap.adr} fontColor={fontColor} /></td>
      <td className="font-mono" style={c}><FmtGapRevenue n={m.gap.revenue} fontColor={fontColor} /></td>
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
  const { otbDate, otbDates, setOtbDate }                = useDateContext()
  const { data: schema, loading: schemaLoading }         = useMarketSchema()
  const [mode, setMode]                                  = useState<LyPacingMode>('v1')
  const [tooltip, setTooltip]                            = useState<{ visible: boolean; x: number; y: number; text: string }>({ visible: false, x: 0, y: 0, text: '' })
  const { data: lyPacing, loading: lyLoading }           = useLyPacing(mode)
  const lyMatchUpdateDate = lyPacing?.[0]?.ly_match_update_date ?? null

  const [currentMonthIndex, setCurrentMonthIndex] = useState(0)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())

  const loading = schemaLoading || lyLoading

  const { groups, summary, monthKeys } = useMemo(
    () => !loading && schema.length > 0
      ? buildLyComparisonAccountTable({ schema, lyPacing, roomCount })
      : { groups: [], summary: { monthly: {}, accountCount: 0, groupCount: 0 }, monthKeys: [] },
    [schema, lyPacing, roomCount, loading],
  )

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

  // 그룹 전체 표시(필터 없음) + 검색 + 빈데이터 필터
  const visibleGroups = useMemo(() => {
    let g = groups
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
  }, [groups, searchQuery, currentMonthKey])

  // 진입 시: 클릭한 세그(initialFilterSegCodes)에 해당하는 그룹만 펼침, 나머지는 접힘
  useEffect(() => {
    if (!open) return
    const codes = initialFilterSegCodes
    if (codes && codes.length > 0) {
      setCollapsedKeys(new Set(groups.filter(g => !groupHasFilterCode(g, codes, schema)).map(g => g.key)))
    } else {
      setCollapsedKeys(new Set(groups.map(g => g.key)))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groups, initialFilterSegCodes])

  const effectiveCollapsedKeys = searchQuery.trim() ? new Set<string>() : collapsedKeys

  const toggleCollapse = (key: string) =>
    setCollapsedKeys(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })


  useEffect(() => {
    if (open) { setSearchQuery('') }
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
  const sumTd: React.CSSProperties = { ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)', paddingTop: 8, paddingBottom: 8, background: '#111111', borderTop: '1px solid rgba(0,229,160,0.6)' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-6xl"
        style={{ maxHeight: '88vh', background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 shrink-0" style={{ borderBottom: BORDER }}>
          {/* Left */}
          <div className="flex items-start gap-3 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>전년 동기간 비교 — Account</h2>
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
            {/* mode 토글 */}
            <div style={{ display: 'inline-flex', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)' }}>
              {(['v1', 'v2'] as LyPacingMode[]).map((m, i) => (
                <div
                  key={m}
                  style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    gap:          4,
                    padding:      '4px 8px 4px 10px',
                    borderRight:  i === 0 ? '1px solid rgba(255,255,255,0.12)' : 'none',
                    background:   mode === m ? 'rgba(0,229,160,0.15)' : 'transparent',
                    borderRadius: i === 0 ? '999px 0 0 999px' : '0 999px 999px 0',
                  }}
                >
                  <button
                    onClick={() => setMode(m)}
                    style={{
                      padding:    0,
                      fontSize:   11,
                      fontWeight: 600,
                      cursor:     'pointer',
                      border:     'none',
                      background: 'transparent',
                      whiteSpace: 'nowrap',
                      color:      mode === m ? '#00E5A0' : 'rgba(255,255,255,0.35)',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => { if (mode !== m) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.6)' }}
                    onMouseLeave={e => { if (mode !== m) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.35)' }}
                  >
                    {m === 'v1' ? '전년 동일자' : '전년 동기간'}
                  </button>
                  <div style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default' }}
                    onMouseEnter={e => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setTooltip({
                        visible: true,
                        x: rect.left + rect.width / 2,
                        y: rect.bottom + 8,
                        text: m === 'v1'
                          ? `오늘 일자 기준 작년 OTB 현황\n예) 오늘 ${otbDate ?? '-'} OTB → 작년 ${lyMatchUpdateDate ?? '-'} OTB`
                          : `오늘 일자 기준 작년 OTB 및 일자별 요일·공휴일 매칭\n예) 오늘 ${otbDate ?? '-'} OTB → 작년 ${lyMatchUpdateDate ?? '-'} OTB`,
                      })
                    }}
                    onMouseLeave={() => setTooltip(prev => ({ ...prev, visible: false }))}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%',
                      border: '1px solid rgba(255,255,255,0.3)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: 'rgba(255,255,255,0.4)', flexShrink: 0,
                    }}>?</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => (onBackToSeg ? onBackToSeg(currentMonthKey) : onClose())} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="Seg로">
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
              <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left', borderRight: DOUBLE }} rowSpan={2}>Account</th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: DOUBLE, borderRight: DOUBLE, height: 42, verticalAlign: 'middle' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>현재 OTB</div>
                      <div style={{ display: 'inline-flex', justifyContent: 'center' }}>
                        <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} availableDates={otbDates} accent bare />
                      </div>
                    </th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderRight: DOUBLE, height: 42, verticalAlign: 'middle' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>작년 OTB</div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{lyMatchUpdateDate ?? '-'}</div>
                    </th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', height: 42, verticalAlign: 'middle' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>GAP</div>
                    </th>
                  </tr>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>객실</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>객단가</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: DOUBLE, borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>매출</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>객실</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>객단가</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: DOUBLE, borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>매출</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>Δ객실</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>Δ객단가</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>Δ매출</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleGroups.map(group => {
                    const collapsed = effectiveCollapsedKeys.has(group.key)
                    const gm = group.monthlyTotals[currentMonthKey] ?? ZERO_MONTHLY
                    return (
                      <>
                        <tr key={`hdr-${group.key}`} onClick={() => toggleCollapse(group.key)} className="cursor-pointer"
                          style={{ borderTop: BORDER, fontWeight: 600 }}
                          onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), #111111` })}
                          onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = '#111111' })}
                        >
                          <td style={{ ...tdBase, paddingLeft: 12, background: '#111111', borderRight: DOUBLE }}>
                            <div className="flex items-center gap-2">
                              {collapsed ? <ChevronRight size={13} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} /> : <ChevronDown size={13} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />}
                              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{group.segmentationName}</span>
                              <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>({group.rows.length}개)</span>
                            </div>
                          </td>
                          <MonthCells m={gm} bg="#111111" fontColor="#fff" />
                        </tr>

                        {!collapsed && group.rows.map(row => {
                          const rm = row.monthly[currentMonthKey] ?? ZERO_MONTHLY
                          return (
                            <tr key={`${group.key}-${row.account_name}`}
                              style={{ borderBottom: '1px solid var(--color-border-subtle)', fontWeight: 400 }}
                              onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), var(--color-bg-primary)` })}
                              onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = 'var(--color-bg-primary)' })}
                            >
                              <td style={{ ...tdBase, paddingLeft: 28, color: 'var(--color-text-secondary)', background: 'var(--color-bg-primary)', borderRight: DOUBLE }}>
                                <span style={{ color: 'var(--brand-dimmed)' }}>└ </span>
                                {!row.account_name || row.account_name === '(미지정)'
                                  ? <span style={{ color: 'var(--brand-dimmed)' }}>(미지정)</span>
                                  : row.account_name}
                              </td>
                              <MonthCells m={rm} bg="var(--color-bg-primary)" fontColor="rgba(255,255,255,0.45)" />
                            </tr>
                          )
                        })}
                      </>
                    )
                  })}
                </tbody>

                <tfoot>
                  <tr>
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
                  <tr style={{ borderTop: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE, background: '#111111' }}>점유율</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderLeft: BORDER, borderRight: DOUBLE, background: '#111111' }}><FmtOcc n={sumMonth?.otb.occ ?? 0} /></td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderRight: DOUBLE, background: '#111111' }}><FmtOcc n={sumMonth?.ly.occ ?? 0} /></td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: '#111111' }}><FmtGapPct n={sumMonth?.gap.occDiff ?? 0} /></td>
                  </tr>
                  <tr style={{ borderTop: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE, background: '#111111' }}>RevPAR</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderLeft: BORDER, borderRight: DOUBLE, background: '#111111' }}><FmtRevpar n={sumMonth?.otb.revpar ?? 0} /></td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderRight: DOUBLE, background: '#111111' }}><FmtRevpar n={sumMonth?.ly.revpar ?? 0} /></td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: '#111111' }}><FmtGapRevpar n={sumMonth?.gap.revparDiff ?? 0} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-between px-6 py-3 shrink-0" style={{ borderTop: BORDER }}>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>
            총 {summary.accountCount} 어카운트 · {summary.groupCount} 그룹
          </span>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>ESC로 닫기</span>
        </div>
      </div>
      {tooltip.visible && createPortal(
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y,
          transform: 'translateX(-50%)', zIndex: 9999,
          width: 192, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6, padding: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)',
          whiteSpace: 'pre-line', lineHeight: 1.5, pointerEvents: 'none',
        }}>
          {tooltip.text}
        </div>,
        document.body
      )}
    </div>
  )
}
