'use client'

import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useDateContext } from '@/contexts/DateContext'
import DatePicker from '@/components/DatePicker'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { usePickupData } from '@/hooks/usePickupData'
import {
  buildMonthlyPickupSegTable,
  type MonthlyPickupSegRow,
  type MonthlyPickupCell,
} from '@/utils/monthlyPickupSegTable'
import { formatYYYYMM } from '@/utils/pickupFormatters'

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
// 월 경계 (각 월 첫 컬럼 좌측) — border-collapse 환경에서 묻히지 않도록 box-shadow inset
const MONTH_SEP: React.CSSProperties = { boxShadow: 'inset 1px 0 0 rgba(0,229,160,0.25)' }

// ─── Format helpers (fontColor: 양수 schema 폰트색 / 음수 red / Dash 폰트색) ──────────

function Dash({ fontColor }: { fontColor?: string }) {
  return <span style={{ color: fontColor ?? 'var(--brand-dimmed)' }}>—</span>
}
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

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ cols }: { cols: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded" style={{ height: 30, background: 'var(--color-bg-tertiary)' }} />
      ))}
    </div>
  )
}

// ─── Month cell group ──────────────────────────────────────────────────────────

function MonthCells({ cell, clickable, onClick, fontColor, bg }: {
  cell:      MonthlyPickupCell
  clickable: boolean
  onClick?:  () => void
  isLast?:   boolean
  fontColor?: string
  bg?:       string
}) {
  const cursor = clickable ? 'pointer' : 'default'
  const td: React.CSSProperties = { ...tdBase, textAlign: 'right', cursor, background: bg }
  return (
    <>
      <td className="font-mono" style={{ ...td, ...MONTH_SEP, borderRight: BORDER }} onClick={onClick}>
        <FmtPickupNights n={cell.pickupNights} fontColor={fontColor} />
      </td>
      <td className="font-mono" style={{ ...td, borderRight: BORDER }} onClick={onClick}>
        <FmtPickupAdr n={cell.pickupAdr} fontColor={fontColor} />
      </td>
      <td className="font-mono" style={{ ...td, borderRight: BORDER }} onClick={onClick}>
        <FmtPickupRevenue n={cell.pickupRevenue} fontColor={fontColor} />
      </td>
    </>
  )
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

export default function MonthlyPickupSegModal({
  open, onClose, roomCount, onPickupCellClick, onSwitchToTotal,
}: {
  open:               boolean
  onClose:            () => void
  roomCount:          number
  onPickupCellClick?: (segCodes: string[], monthKey: string | null, label: string) => void
  onSwitchToTotal?:   () => void
}) {
  const { theme }                                         = useTheme()
  const isDark                                            = theme === 'dark'
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()
  const days = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0
  const { data: schema, loading: schemaLoading }          = useMarketSchema()
  const { data: pickup, loading: pickupLoading }          = usePickupData()
  const [pageIndex, setPageIndex]                         = useState(0)

  const loading = schemaLoading || pickupLoading

  const { rows, summary, monthKeys } = !loading && schema.length > 0
    ? buildMonthlyPickupSegTable({ schema, pickup, roomCount })
    : { rows: [], summary: { monthlyTotals: {}, grandTotal: { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0, occ: 0, revpar: 0 } }, monthKeys: [] }

  const totalPages    = Math.ceil(monthKeys.length / PAGE_SIZE)
  const visibleMonths = monthKeys.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE)

  // HOU 행 식별
  const houRowIds = new Set<string>()
  for (const s of schema) {
    if (s.segmentation.includes('HOU')) houRowIds.add(s.id)
  }

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

  // 열릴 때 페이지 리셋
  useEffect(() => {
    if (open) setPageIndex(0)
  }, [open])

  if (!open) return null

  const startLabel = monthKeys.length > 0 ? formatYYYYMM(monthKeys[0]) : ''
  const endLabel   = monthKeys.length > 0 ? formatYYYYMM(monthKeys[monthKeys.length - 1]) : ''
  const colCount   = 1 + visibleMonths.length * 3

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4" style={{ paddingTop: 80 }}>
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-5xl"
        style={{ maxHeight: '88vh', background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="px-6 pt-1 pb-1 shrink-0" style={{ borderBottom: `1px solid ${BORDER.split(' ').pop()}` }}>
          {/* 1줄: 제목 + 페이지네이션 + X */}
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
              {totalPages > 1 && (
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
                onClick={onClose}
                className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1"
                aria-label="닫기"
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
            <Skeleton cols={colCount} />
          ) : rows.length === 0 || monthKeys.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>
              표시할 픽업 데이터가 없습니다.
            </p>
          ) : (
            <div className="px-6 py-4">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse', position: 'relative', zIndex: 1 }}>
                {/* 헤더 2단 */}
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left', borderRight: BORDER }} rowSpan={2}>Segmentation</th>
                    {visibleMonths.map(mk => (
                      <th key={mk} colSpan={3} style={{ ...thBase, textAlign: 'center', color: '#00E5A0', ...MONTH_SEP, borderRight: BORDER }}>
                        {formatYYYYMM(mk)}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {visibleMonths.map(mk => ([
                      <th key={`${mk}-rn`}  style={{ ...thBase, textAlign: 'right', ...MONTH_SEP, borderBottom: BORDER }}>ΔR-N</th>,
                      <th key={`${mk}-adr`} style={{ ...thBase, textAlign: 'right', borderBottom: BORDER }}>ΔADR</th>,
                      <th key={`${mk}-rev`} style={{ ...thBase, textAlign: 'right', borderRight: BORDER, borderBottom: BORDER }}>ΔREV</th>,
                    ]))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map(row => {
                    const rowBg    = (isDark ? row.bgDarkColor  : row.bgLightColor)  ?? '#111111'
                    const rowColor = (isDark ? row.fontDarkColor : row.fontLightColor) ?? 'var(--color-text-primary)'
                    const isHou    = houRowIds.has(row.id)
                    const clickable = !!onPickupCellClick && !isHou && row.segmentationCodes.length > 0
                    const nameColor = row.indent ? 'rgba(255,255,255,0.45)' : rowColor

                    return (
                      <tr
                        key={row.id}
                        style={{ borderBottom: BORDER, color: rowColor, fontWeight: row.isBold ? 600 : 400 }}
                        onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${rowBg}` })}
                        onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = rowBg })}
                      >
                        <td style={{ ...tdBase, paddingLeft: row.indent ? 28 : 12, minWidth: 140, borderRight: BORDER, color: nameColor, background: rowBg }}>
                          {row.indent ? (
                            <><span style={{ color: nameColor }}>└ </span>{row.name}</>
                          ) : row.name}
                        </td>
                        {visibleMonths.map((mk, idx) => {
                          const cell = row.monthlyPickup[mk] ?? { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 }
                          const handleClick = clickable
                            ? () => onPickupCellClick!(row.segmentationCodes, mk, `${row.name} · ${formatYYYYMM(mk)}`)
                            : undefined
                          return <MonthCells key={mk} cell={cell} clickable={clickable} onClick={handleClick} isLast={idx === visibleMonths.length - 1} fontColor={rowColor} bg={rowBg} />
                        })}
                      </tr>
                    )
                  })}
                </tbody>

                <tfoot>
                  {/* 합계 */}
                  <tr style={{ borderTop: '2px solid var(--color-accent-primary)' }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontWeight: 600, color: 'var(--color-text-primary)', borderRight: BORDER, background: '#111111' }}>합계 (HOU 제외)</td>
                    {visibleMonths.map((mk, idx) => (
                      <MonthCells key={mk} cell={summary.monthlyTotals[mk] ?? { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 }} clickable={false} isLast={idx === visibleMonths.length - 1} bg="#111111" />
                    ))}
                  </tr>
                  {/* OCC */}
                  <tr style={{ borderTop: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: BORDER, background: '#111111' }}>OCC</td>
                    {visibleMonths.map(mk => (
                      <td key={mk} colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, ...MONTH_SEP, borderRight: BORDER, background: '#111111' }}>
                        <FmtOcc n={summary.monthlyTotals[mk]?.occ ?? 0} />
                      </td>
                    ))}
                  </tr>
                  {/* RevPAR */}
                  <tr style={{ borderTop: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: BORDER, background: '#111111' }}>RevPAR</td>
                    {visibleMonths.map(mk => (
                      <td key={mk} colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, ...MONTH_SEP, borderRight: BORDER, background: '#111111' }}>
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
            {onPickupCellClick ? 'Pickup 셀 클릭 → Account 보기' : ''}
          </span>
          <span style={{ fontSize: 11, color: 'var(--brand-dimmed)' }}>ESC로 닫기</span>
        </div>
      </div>
    </div>
  )
}
