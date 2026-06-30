'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useDateContext } from '@/contexts/DateContext'
import { useHotel } from '@/contexts/HotelContext'
import DatePicker from '@/components/DatePicker'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { usePickupData } from '@/hooks/usePickupData'
import { useAccountPickupData } from '@/hooks/useAccountPickupData'
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
const BORDER = '0.5px solid rgba(255,255,255,0.06)'
// 월 경계 (각 월 첫 컬럼 좌측) — border-collapse: separate 라 borderLeft가 독립 렌더
const MONTH_SEP: React.CSSProperties = { borderLeft: '1px solid rgba(0,229,160,0.35)' }

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

function MonthCells({ cell, clickable, onClick, fontColor, bg, borderTop }: {
  cell:      MonthlyPickupCell
  clickable: boolean
  onClick?:  () => void
  isLast?:   boolean
  fontColor?: string
  bg?:       string
  borderTop?: string
}) {
  const cursor = clickable ? 'pointer' : 'default'
  const td: React.CSSProperties = { ...tdBase, textAlign: 'right', cursor, background: bg, ...(borderTop ? { borderTop } : {}) }
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
  const { currentHotel }                                  = useHotel()
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()
  // 우측 패널: 선택된 세그먼트 (대분류 이름 클릭 시 set)
  const [selectedSeg, setSelectedSeg] = useState<{ label: string; codes: string[]; monthKey: string } | null>(null)
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

  // ─── 우측 Account Pickup 패널 데이터 ───────────────────────────────────────────
  // 선택된 세그먼트의 monthKey(클릭한 셀의 월) 기준 조회, 미선택 시 첫 달 폴백
  const activeMonthKey = selectedSeg?.monthKey || monthKeys[0] || ''
  const pickupYear  = activeMonthKey ? parseInt(activeMonthKey.slice(0, 4)) : new Date().getFullYear()
  const pickupMonth = activeMonthKey ? parseInt(activeMonthKey.slice(5, 7)) : new Date().getMonth() + 1

  const { data: accountPickupRows = [] } = useAccountPickupData({
    hotelId:     currentHotel?.id ?? '',
    otbDate:     otbDate ?? '',
    vsDate:      vsOtbDate ?? '',
    year:        pickupYear,
    month:       pickupMonth,
    segFilter:   null,
    isPastMonth: false,
  })

  const accountList = useMemo(() => {
    if (!selectedSeg) return []
    return (accountPickupRows as Array<{ account_name: string; segmentation: string; otb_nights: number; vs_nights: number; otb_revenue: number; vs_revenue: number }>)
      .filter(r => selectedSeg.codes.includes(r.segmentation))
      .map(r => ({
        name:    r.account_name,
        diffRn:  r.otb_nights - r.vs_nights,    // 픽업 = 현재OTB - vsOTB
        diffRev: r.otb_revenue - r.vs_revenue,
      }))
      .sort((a, b) => b.diffRn - a.diffRn)
  }, [selectedSeg, accountPickupRows])

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

  // 열릴 때 페이지 + 선택 세그먼트 리셋
  useEffect(() => {
    if (open) { setPageIndex(0); setSelectedSeg(null) }
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
        className="relative rounded-2xl overflow-hidden flex flex-col w-[96vw] max-w-[1400px]"
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
                onClick={() => onPickupCellClick?.(selectedSeg?.codes ?? [], selectedSeg?.monthKey || null, selectedSeg?.label ?? '')}
                style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                }}
              >
                Account View →
              </button>
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

        {/* Body: 좌측 테이블 + 우측 Account Pickup 패널 */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: 'calc(100% - 220px)', flexShrink: 0, overflowX: 'auto', overflowY: 'auto' }}>
          {loading ? (
            <Skeleton cols={colCount} />
          ) : rows.length === 0 || monthKeys.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>
              표시할 픽업 데이터가 없습니다.
            </p>
          ) : (
            <div className="px-6 py-4">
              <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0, position: 'relative', zIndex: 1 }}>
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
                    // 우측 패널용: 대분류 행만 클릭 가능 / 선택 시 행 하이라이트
                    const segSelectable = !row.indent && row.segmentationCodes.length > 0
                    const isSelected    = segSelectable && selectedSeg?.label === row.name
                    const baseBg        = isSelected ? 'rgba(0,229,160,0.08)' : rowBg

                    return (
                      <tr
                        key={row.id}
                        style={{ borderBottom: BORDER, color: rowColor, fontWeight: row.isBold ? 600 : 400 }}
                        onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${baseBg}` })}
                        onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = baseBg })}
                      >
                        <td
                          onClick={segSelectable ? () => setSelectedSeg({ label: row.name, codes: row.segmentationCodes, monthKey: visibleMonths[0] ?? '' }) : undefined}
                          style={{ ...tdBase, paddingLeft: row.indent ? 28 : 12, minWidth: 140, borderRight: BORDER, color: nameColor, background: baseBg, cursor: segSelectable ? 'pointer' : 'default' }}
                        >
                          {row.indent ? (
                            <><span style={{ color: nameColor }}>└ </span>{row.name}</>
                          ) : row.name}
                        </td>
                        {visibleMonths.map((mk, idx) => {
                          const cell = row.monthlyPickup[mk] ?? { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 }
                          const handleClick = clickable
                            ? () => setSelectedSeg({ label: row.name, codes: row.segmentationCodes, monthKey: mk })
                            : undefined
                          return <MonthCells key={mk} cell={cell} clickable={clickable} onClick={handleClick} isLast={idx === visibleMonths.length - 1} fontColor={rowColor} bg={baseBg} />
                        })}
                      </tr>
                    )
                  })}
                </tbody>

                <tfoot>
                  {/* 합계 */}
                  <tr>
                    <td style={{ ...tdBase, paddingLeft: 12, fontWeight: 600, color: 'var(--color-text-primary)', borderRight: BORDER, background: '#111111', borderTop: '1px solid rgba(0,229,160,0.6)' }}>합계 (HOU 제외)</td>
                    {visibleMonths.map((mk, idx) => (
                      <MonthCells key={mk} cell={summary.monthlyTotals[mk] ?? { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 }} clickable={false} isLast={idx === visibleMonths.length - 1} bg="#111111" borderTop="1px solid rgba(0,229,160,0.6)" />
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

        {/* 우측 Account Pickup 패널 */}
        <div style={{ width: 220, flexShrink: 0, borderLeft: BORDER, display: 'flex', flexDirection: 'column', background: '#0a0a0a', overflowY: 'auto' }}>
          <div className="px-3 pt-3 pb-2 shrink-0" style={{ borderBottom: BORDER }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#FFC850' }}>Account Pickup</div>
            <div style={{ fontSize: 10, color: 'var(--brand-dimmed)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedSeg ? `${selectedSeg.label} · ${selectedSeg.monthKey} · 픽업 R/N 기준` : '세그먼트를 클릭하세요'}
            </div>
            <button
              onClick={() => selectedSeg && onPickupCellClick?.(selectedSeg.codes, selectedSeg.monthKey || null, selectedSeg.label)}
              disabled={!selectedSeg}
              style={{
                fontSize: 10,
                padding: '3px 8px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                color: selectedSeg ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)',
                cursor: selectedSeg ? 'pointer' : 'default',
                marginTop: 4,
              }}
            >
              Account 보기 →
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {accountList.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--brand-dimmed)', padding: 12 }}>
                {selectedSeg ? '픽업 데이터가 없습니다.' : ''}
              </div>
            ) : accountList.map((a, i) => (
              <div
                key={`${a.name}-${i}`}
                className="flex items-center justify-between"
                style={{ padding: '6px 12px', borderBottom: '0.5px solid #1a1a1a' }}
              >
                <span style={{ fontSize: 11, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 92 }}>
                  {a.name}
                </span>
                <span className="font-mono" style={{ display: 'flex', gap: 6, fontSize: 10, whiteSpace: 'nowrap' }}>
                  <span style={{ color: a.diffRn >= 0 ? '#00E5A0' : '#E24B4A' }}>
                    {a.diffRn >= 0 ? '+' : ''}{a.diffRn.toLocaleString('ko-KR')}
                  </span>
                  <span style={{ color: a.diffRev >= 0 ? '#00E5A0' : '#E24B4A' }}>
                    {a.diffRev >= 0 ? '+' : ''}{(a.diffRev / 1_000_000).toFixed(1)}M
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
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
