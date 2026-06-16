'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useTheme } from '@/contexts/ThemeContext'
import DatePicker from '@/components/DatePicker'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { useLyPacing, type LyPacingMode } from '@/hooks/useLyPacing'
import {
  buildLyComparisonSegTable,
} from '@/utils/lyComparisonSegTable'
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

// ─── Format helpers ────────────────────────────────────────────────────────────

function formatYYYYMM(key: string): string {
  return key.replace('-', '.')
}

function Dash() { return <span style={{ color: 'var(--brand-dimmed)' }}>—</span> }
function GapDash() { return <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span> }

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
function FmtGapNights({ n, fontColor }: { n: number; fontColor?: string }) {
  if (n === 0) return <GapDash />
  const sign =n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toLocaleString('ko-KR')}</span>
}
function FmtGapAdr({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 500) return <GapDash />
  const k = Math.round(n / 1000)
  const sign = k > 0 ? '+' : ''
  const color = k > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
}
function FmtGapRevenue({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 50_000) return <Dash />
  const m = (n / 1_000_000).toFixed(1)
  const sign = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{m}M</span>
}
function FmtOcc({ n }: { n: number }) {
  if (Math.abs(n) < 0.1) return <Dash />
  return <>{n.toFixed(1)}%</>
}
function FmtGapPct({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 0.1) return <GapDash />
  const sign =n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toFixed(1)}%p</span>
}
function FmtRevpar({ n }: { n: number }) {
  if (Math.abs(n) < 500) return <Dash />
  return <>{Math.round(n / 1000)}k</>
}
function FmtGapRevpar({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 500) return <GapDash />
  const k = Math.round(n / 1000)
  const sign = k > 0 ? '+' : ''
  const color = k > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
}

// ─── Cell group components ─────────────────────────────────────────────────────

function MonthCells({ m, clickable, onGapClick, bg, gapColor, gapBold }: {
  m: LyComparisonMonthly
  clickable: boolean
  onGapClick?: () => void
  bg?: string
  gapColor?: string
  gapBold?: boolean
}) {
  const cursor = clickable ? 'pointer' : 'default'
  const c: React.CSSProperties = { ...tdBase, textAlign: 'right', background: bg }
  const g: React.CSSProperties = { ...c, cursor, fontWeight: gapBold ? 600 : 400 }
  return (
    <>
      {/* OTB */}
      <td className="font-mono" style={{ ...c, borderLeft: BORDER }}><FmtNights n={m.otb.nights} /></td>
      <td className="font-mono" style={c}><FmtAdr n={m.otb.adr} /></td>
      <td className="font-mono" style={{ ...c, borderRight: DOUBLE }}><FmtRevenue n={m.otb.revenue} /></td>
      {/* LY */}
      <td className="font-mono" style={c}><FmtNights n={m.ly.nights} /></td>
      <td className="font-mono" style={c}><FmtAdr n={m.ly.adr} /></td>
      <td className="font-mono" style={{ ...c, borderRight: DOUBLE }}><FmtRevenue n={m.ly.revenue} /></td>
      {/* GAP */}
      <td className="font-mono" style={g} onClick={onGapClick}><FmtGapNights n={m.gap.nights} fontColor={gapColor} /></td>
      <td className="font-mono" style={g} onClick={onGapClick}><FmtGapAdr n={m.gap.adr} fontColor={gapColor} /></td>
      <td className="font-mono" style={g} onClick={onGapClick}><FmtGapRevenue n={m.gap.revenue} fontColor={gapColor} /></td>
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

// ─── Nav button helper ─────────────────────────────────────────────────────────

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

// ─── Modal ─────────────────────────────────────────────────────────────────────

export default function LyComparisonSegModal({
  open, onClose, roomCount, initialMonthKey, onAccountDrillDown,
}: {
  open:                boolean
  onClose:             () => void
  roomCount:           number
  initialMonthKey?:    string
  onAccountDrillDown?: (segCodes: string[], monthKey: string, label: string) => void
}) {
  const { currentHotel }                                 = useHotel()
  const { otbDate, otbDates, setOtbDate }                = useDateContext()
  const { theme }                                        = useTheme()
  const isDark                                           = theme === 'dark'
  const { data: schema, loading: schemaLoading }         = useMarketSchema()
  const [mode, setMode]                                  = useState<LyPacingMode>('v1')
  const [tooltip, setTooltip]                            = useState<{ visible: boolean; x: number; y: number; text: string }>({ visible: false, x: 0, y: 0, text: '' })
  const { data: lyPacing, loading: lyLoading }           = useLyPacing(mode)
  const lyMatchUpdateDate = lyPacing?.[0]?.ly_match_update_date ?? null
  const [currentMonthIndex, setCurrentMonthIndex]        = useState(0)

  const loading = schemaLoading || lyLoading

  const { rows, summary, monthKeys } = useMemo(
    () => !loading && schema.length > 0
      ? buildLyComparisonSegTable({ schema, lyPacing, roomCount })
      : { rows: [], summary: { monthly: {} }, monthKeys: [] },
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

  const sumTd: React.CSSProperties = {
    ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)', paddingTop: 8, paddingBottom: 8, background: '#111111',
    borderTop: '1px solid rgba(0,229,160,0.6)',   // 합계 행 위 초록선 (separate 모드: 셀 보더만 렌더)
  }

  const ZERO_MONTHLY: LyComparisonMonthly = {
    otb: { nights: 0, adr: 0, revenue: 0 },
    ly:  { nights: 0, adr: 0, revenue: 0 },
    gap: { nights: 0, adr: 0, revenue: 0 },
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-5xl"
        style={{ maxHeight: '88vh', background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: BORDER }}>
          {/* Left: title */}
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              전년 동기간 비교
            </h2>
          </div>

          {/* Center: month nav */}
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

          {/* Right: mode toggle + close */}
          <div className="flex items-center gap-3">
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
                  <div
                    style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default' }}
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
            <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <Skeleton />
          ) : monthKeys.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>월 데이터가 없습니다.</p>
          ) : rows.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>표시할 LY 비교 데이터가 없습니다.</p>
          ) : (
            <div className="px-6 py-4">
              <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                {/* 헤더 2단 */}
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left', borderRight: DOUBLE }} rowSpan={2}>Segmentation</th>
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
                    <th style={{ ...thBase, textAlign: 'right', borderLeft: BORDER, borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>R-N</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>ADR</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: DOUBLE, borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>REV</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>R-N</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>ADR</th>
                    <th style={{ ...thBase, textAlign: 'right', borderRight: DOUBLE, borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>REV</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>ΔR-N</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>ΔADR</th>
                    <th style={{ ...thBase, textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>ΔREV</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map(row => {
                    const rowBg    = (isDark ? row.bgDarkColor  : row.bgLightColor)  ?? '#111111'
                    const rowColor = (isDark ? row.fontDarkColor : row.fontLightColor) ?? 'var(--color-text-primary)'
                    const isHou    = houRowIds.has(row.id)
                    const clickable = !!onAccountDrillDown && !isHou && row.segmentationCodes.length > 0
                    const m        = row.monthly[currentMonthKey] ?? ZERO_MONTHLY

                    return (
                      <tr
                        key={row.id}
                        style={{ borderBottom: BORDER, color: rowColor, fontWeight: row.isBold ? 600 : 400 }}
                        onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${rowBg}` })}
                        onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = rowBg })}
                      >
                        <td style={{ ...tdBase, paddingLeft: row.indent ? 28 : 12, minWidth: 140, borderRight: DOUBLE, background: rowBg }}>
                          {row.indent ? <><span style={{ color: 'var(--brand-dimmed)' }}>└ </span>{row.name}</> : row.name}
                        </td>
                        <MonthCells
                          m={m}
                          clickable={clickable}
                          bg={rowBg}
                          gapColor={rowColor}
                          gapBold={row.isBold}
                          onGapClick={clickable ? () => onAccountDrillDown!(row.segmentationCodes, currentMonthKey, row.name) : undefined}
                        />
                      </tr>
                    )
                  })}
                </tbody>

                <tfoot>
                  {/* 합계 */}
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
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtGapNights n={sumMonth.gap.nights} fontColor="var(--color-text-primary)" /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtGapAdr n={sumMonth.gap.adr} fontColor="var(--color-text-primary)" /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtGapRevenue n={sumMonth.gap.revenue} fontColor="var(--color-text-primary)" /></td>
                      </>
                    ) : <td colSpan={9} />}
                  </tr>
                  {/* OCC */}
                  <tr style={{ borderTop: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE, background: '#111111' }}>OCC</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderLeft: BORDER, borderRight: DOUBLE, background: '#111111' }}>
                      <FmtOcc n={sumMonth?.otb.occ ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderRight: DOUBLE, background: '#111111' }}>
                      <FmtOcc n={sumMonth?.ly.occ ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: '#111111' }}>
                      <FmtGapPct n={sumMonth?.gap.occDiff ?? 0} fontColor="var(--color-text-primary)" />
                    </td>
                  </tr>
                  {/* Rev.PAR */}
                  <tr style={{ borderTop: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE, background: '#111111' }}>RevPAR</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderLeft: BORDER, borderRight: DOUBLE, background: '#111111' }}>
                      <FmtRevpar n={sumMonth?.otb.revpar ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderRight: DOUBLE, background: '#111111' }}>
                      <FmtRevpar n={sumMonth?.ly.revpar ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: '#111111' }}>
                      <FmtGapRevpar n={sumMonth?.gap.revparDiff ?? 0} fontColor="var(--color-text-primary)" />
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
      {tooltip.visible && createPortal(
        <div style={{
          position:     'fixed',
          left:         tooltip.x,
          top:          tooltip.y,
          transform:    'translateX(-50%)',
          zIndex:       9999,
          width:        192,
          background:   '#1a1a1a',
          border:       '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          padding:      8,
          fontSize:     11,
          color:        'rgba(255,255,255,0.7)',
          whiteSpace:   'pre-line',
          lineHeight:   1.5,
          pointerEvents: 'none',
        }}>
          {tooltip.text}
        </div>,
        document.body
      )}
    </div>
  )
}
