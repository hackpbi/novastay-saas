'use client'

// 당일 픽업 세그먼트 상세 모달.
// LyComparisonSegModal.tsx를 동일 구조로 복제. 3그룹만 교체:
//   현재 OTB / 전년 / GAP  →  새벽 OTB(base·from) / 현재 OTB(cur·to) / 픽업(pu)
// ⇄ 토글(v1/v2)·DatePicker 제거(구간은 페이지에서 선택). 단위는 props로 수신.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { useTodayPickupData } from '@/hooks/useTodayPickup'
import { buildTodayPickupSegTable } from '@/utils/todayPickupSegTable'
import type { TodayPickupMonthly } from '@/utils/todayPickupSegTable'

// ─── Constants ─────────────────────────────────────────────────────────────────

const thBase: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--color-text-secondary)',
  padding: '6px 10px', background: '#000000', whiteSpace: 'nowrap',
}
const tdBase: React.CSSProperties = {
  padding: '6px 10px', verticalAlign: 'middle', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
}
const BORDER = '1px solid var(--divider-color)'
// 섹션 구분선(새벽 OTB / 현재 OTB / 픽업 경계) — 초록
const DOUBLE = '1px solid rgba(0,229,160,0.3)'

// ─── Format helpers ────────────────────────────────────────────────────────────

function Dash() { return <span style={{ color: 'var(--brand-dimmed)' }}>—</span> }
function GapDash() { return <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span> }

function FmtNights({ n }: { n: number }) {
  if (n === 0) return <Dash />
  return <>{n.toLocaleString('ko-KR')}</>
}
function FmtAdr({ n, unit = '천원' }: { n: number; unit?: '천원' | '원' }) {
  if (Math.abs(n) < 500) return <Dash />
  return <>{unit === '천원' ? Math.round(n / 1000).toLocaleString() : Math.round(n).toLocaleString()}</>
}
function FmtRevenue({ n, unit = '백만원' }: { n: number; unit?: '원' | '천원' | '백만원' }) {
  if (Math.abs(n) < 50_000) return <Dash />
  return <>{unit === '백만원' ? Math.round(n / 1_000_000).toLocaleString() : unit === '천원' ? Math.round(n / 1000).toLocaleString() : Math.round(n).toLocaleString()}</>
}
function FmtPuNights({ n, fontColor }: { n: number; fontColor?: string }) {
  if (n === 0) return <GapDash />
  const sign = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toLocaleString('ko-KR')}</span>
}
function FmtPuAdr({ n, fontColor, unit = '천원' }: { n: number; fontColor?: string; unit?: '천원' | '원' }) {
  if (Math.abs(n) < 500) return <GapDash />
  const sign = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  const text = unit === '천원' ? Math.round(n / 1000).toLocaleString() : Math.round(n).toLocaleString()
  return <span style={{ color }}>{sign}{text}</span>
}
function FmtPuRevenue({ n, fontColor, unit = '백만원' }: { n: number; fontColor?: string; unit?: '원' | '천원' | '백만원' }) {
  if (Math.abs(n) < 50_000) return <Dash />
  const sign = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  const text = unit === '백만원' ? Math.round(n / 1_000_000).toLocaleString() : unit === '천원' ? Math.round(n / 1000).toLocaleString() : Math.round(n).toLocaleString()
  return <span style={{ color }}>{sign}{text}</span>
}
function FmtOcc({ n }: { n: number }) {
  if (Math.abs(n) < 0.1) return <Dash />
  return <>{n.toFixed(1)}%</>
}
function FmtPuPct({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 0.1) return <GapDash />
  const sign = n > 0 ? '+' : ''
  const color = n > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{n.toFixed(1)}%p</span>
}
function FmtRevpar({ n }: { n: number }) {
  if (Math.abs(n) < 500) return <Dash />
  return <>{Math.round(n / 1000)}k</>
}
function FmtPuRevpar({ n, fontColor }: { n: number; fontColor?: string }) {
  if (Math.abs(n) < 500) return <GapDash />
  const k = Math.round(n / 1000)
  const sign = k > 0 ? '+' : ''
  const color = k > 0 ? (fontColor ?? 'var(--color-text-primary)') : 'var(--color-negative)'
  return <span style={{ color }}>{sign}{k}k</span>
}

// ─── Cell group ────────────────────────────────────────────────────────────────

function SlotCells({ m, onBaseClick, onCurClick, onPuClick, bg, gapColor, gapBold, baseSelected, curSelected, adrUnit, revUnit }: {
  m: TodayPickupMonthly
  onBaseClick?: () => void
  onCurClick?:  () => void
  onPuClick?:   () => void
  bg?: string
  gapColor?: string
  gapBold?: boolean
  baseSelected?: boolean
  curSelected?:  boolean
  adrUnit?: '천원' | '원'
  revUnit?: '원' | '천원' | '백만원'
}) {
  const c: React.CSSProperties = { ...tdBase, textAlign: 'right', background: bg, cursor: onBaseClick ? 'pointer' : 'default' }
  const g: React.CSSProperties = { ...c, cursor: onPuClick ? 'pointer' : 'default', fontWeight: gapBold ? 600 : 400 }
  return (
    <>
      {/* base (새벽 OTB) */}
      <td className="font-mono" style={{ ...c, borderLeft: baseSelected ? '3px solid #00E5A0' : BORDER }} onClick={onBaseClick}><FmtNights n={m.base.nights} /></td>
      <td className="font-mono" style={c} onClick={onBaseClick}><FmtAdr n={m.base.adr} unit={adrUnit} /></td>
      <td className="font-mono" style={{ ...c, borderRight: DOUBLE }} onClick={onBaseClick}><FmtRevenue n={m.base.revenue} unit={revUnit} /></td>
      {/* cur (현재 OTB) */}
      <td className="font-mono" style={{ ...c, borderLeft: curSelected ? '3px solid #00E5A0' : BORDER }} onClick={onCurClick}><FmtNights n={m.cur.nights} /></td>
      <td className="font-mono" style={c} onClick={onCurClick}><FmtAdr n={m.cur.adr} unit={adrUnit} /></td>
      <td className="font-mono" style={{ ...c, borderRight: DOUBLE }} onClick={onCurClick}><FmtRevenue n={m.cur.revenue} unit={revUnit} /></td>
      {/* pu (픽업) */}
      <td className="font-mono" style={g} onClick={onPuClick}><FmtPuNights n={m.pu.nights} fontColor={gapColor} /></td>
      <td className="font-mono" style={g} onClick={onPuClick}><FmtPuAdr n={m.pu.adr} fontColor={gapColor} unit={adrUnit} /></td>
      <td className="font-mono" style={g} onClick={onPuClick}><FmtPuRevenue n={m.pu.revenue} fontColor={gapColor} unit={revUnit} /></td>
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

// KST HH:MM
function hhmm(ts: string): string {
  return new Date(ts).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

export default function TodayPickupSegModal({
  open, onClose, roomCount, updateDate, fromSlot, toSlot, monthKey, businessDate, adrUnit, revUnit,
}: {
  open:          boolean
  onClose:       () => void
  roomCount:     number
  updateDate:    string
  fromSlot:      string | null
  toSlot:        string | null
  monthKey:      string
  businessDate?: string
  adrUnit:       '원' | '천원'
  revUnit:       '원' | '천원' | '백만원'
}) {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const { data: schema, loading: schemaLoading } = useMarketSchema()
  const { data: rowsData = [], isLoading: dataLoading } = useTodayPickupData({ hotelId, updateDate, fromSlot, toSlot })

  // 우측 Account 증감 패널: 선택된 세그먼트
  const [selectedSeg, setSelectedSeg] = useState<{ label: string; codes: string[]; viewMode: 'base' | 'cur' | 'pu' } | null>(null)

  // 모달 스코프: businessDate 있으면 해당 일자, 없으면 월(MTD)
  const scopedRows = useMemo(
    () => businessDate
      ? rowsData.filter(r => r.business_date === businessDate)
      : rowsData.filter(r => r.business_date.slice(0, 7) === monthKey),
    [rowsData, businessDate, monthKey],
  )

  const loading = schemaLoading || dataLoading

  const { rows, summary } = useMemo(
    () => !loading && schema.length > 0
      ? buildTodayPickupSegTable({ schema, todayRows: scopedRows, roomCount })
      : { rows: [], summary: { monthly: {} } as ReturnType<typeof buildTodayPickupSegTable>['summary'] },
    [schema, scopedRows, roomCount, loading],
  )

  // HOU 행 식별
  const houRowIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of schema) {
      if (s.segmentation.includes('HOU')) ids.add(s.id)
    }
    return ids
  }, [schema])

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

  // 우측 Account 증감 패널 데이터 — 좌측과 동일 소스(scopedRows)를 어카운트 단위로 집계
  const accountList = useMemo(() => {
    if (!selectedSeg) return []

    const filtered = scopedRows.filter(r => selectedSeg.codes.includes(r.segmentation))

    // account_name별 집계
    const accMap: Record<string, { baseRn: number; baseRev: number; curRn: number; curRev: number }> = {}
    for (const r of filtered) {
      const k = r.account_name ?? '(없음)'
      if (!accMap[k]) accMap[k] = { baseRn: 0, baseRev: 0, curRn: 0, curRev: 0 }
      accMap[k].baseRn  += r.base_nights  ?? 0
      accMap[k].baseRev += r.base_revenue ?? 0
      accMap[k].curRn   += r.cur_nights   ?? 0
      accMap[k].curRev  += r.cur_revenue  ?? 0
    }

    const viewMode = selectedSeg.viewMode

    return Object.entries(accMap).map(([name, v]) => {
      const valRn  = viewMode === 'base' ? v.baseRn
                   : viewMode === 'cur'  ? v.curRn
                   : v.curRn - v.baseRn   // pu
      const valAdr = viewMode === 'base' ? (v.baseRn > 0 ? Math.round(v.baseRev / v.baseRn) : 0)
                   : viewMode === 'cur'  ? (v.curRn  > 0 ? Math.round(v.curRev  / v.curRn)  : 0)
                   : (v.baseRn > 0 && v.curRn > 0
                       ? Math.round(v.curRev / v.curRn) - Math.round(v.baseRev / v.baseRn)
                       : 0)
      const valRev = viewMode === 'base' ? v.baseRev
                   : viewMode === 'cur'  ? v.curRev
                   : v.curRev - v.baseRev  // pu
      return { name, valRn, valAdr, valRev }
    })
    .sort((a, b) => b.valRn - a.valRn)
  }, [selectedSeg, scopedRows])

  if (!open) return null

  const sumMonth = summary.monthly[monthKey]

  const sumTd: React.CSSProperties = {
    ...tdBase, fontWeight: 600, color: 'var(--color-text-primary)', paddingTop: 8, paddingBottom: 8, background: '#111111',
    borderTop: '1px solid rgba(0,229,160,0.6)',
  }

  const ZERO_MONTHLY: TodayPickupMonthly = {
    base: { nights: 0, adr: 0, revenue: 0 },
    cur:  { nights: 0, adr: 0, revenue: 0 },
    pu:   { nights: 0, adr: 0, revenue: 0 },
  }

  const [, mm] = monthKey.split('-')
  const scopeLabel = businessDate
    ? `${Number(mm)}월 ${Number(businessDate.slice(8, 10))}일`
    : `${Number(mm)}월 MTD`
  const baseSub = fromSlot ? hhmm(fromSlot) : '새벽'
  const curSub  = toSlot ? hhmm(toSlot) : '최신'

  const scaleAdr = (val: number) =>
    adrUnit === '천원' ? String(Math.round(val / 1000)) : Math.round(val).toLocaleString()
  const scaleRev = (val: number) =>
    revUnit === '백만원' ? Math.round(val / 1_000_000).toLocaleString()
    : revUnit === '천원' ? Math.round(val / 1000).toLocaleString()
    : Math.round(val).toLocaleString()

  const content = (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />

      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-[1400px]"
        style={{ maxHeight: '88vh', overflow: 'hidden', background: '#000000', border: '0.5px solid rgba(0,229,160,0.2)', borderLeft: '1.5px solid #00E5A0', borderRadius: 10, boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-2 pb-1 shrink-0" style={{ borderBottom: BORDER }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#fff', letterSpacing: '0.04em' }}>
            당일 픽업 <span style={{ color: '#00E5A0' }}>· {scopeLabel}</span>
          </span>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
            <X size={22} />
          </button>
        </div>

        {/* Body: 좌측 테이블 + 우측 Account 증감 패널 */}
        <div style={{ display: 'flex', overflow: 'hidden' }}>
        <div className="overflow-y-auto" style={{ minWidth: 0, flex: '1 1 0', minHeight: 0 }}>
          {loading ? (
            <Skeleton />
          ) : rows.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--brand-dimmed)' }}>표시할 당일 픽업 데이터가 없습니다.</p>
          ) : (
            <div className="px-6 py-4">
              <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                {/* 헤더 2단 */}
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ ...thBase, textAlign: 'left', borderRight: DOUBLE }} rowSpan={2}>세그먼트</th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderLeft: DOUBLE, borderRight: DOUBLE, height: 42, verticalAlign: 'middle' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>새벽 OTB</div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{baseSub}</div>
                    </th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', borderRight: DOUBLE, height: 42, verticalAlign: 'middle' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>현재 OTB</div>
                      <div style={{ fontSize: 9, color: 'rgba(0,229,160,0.5)' }}>{curSub}</div>
                    </th>
                    <th colSpan={3} style={{ ...thBase, textAlign: 'center', height: 42, verticalAlign: 'middle' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>픽업</div>
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
                  {rows.map(row => {
                    const rowBg    = (isDark ? row.bgDarkColor  : row.bgLightColor)  ?? '#111111'
                    const rowColor = (isDark ? row.fontDarkColor : row.fontLightColor) ?? 'var(--color-text-primary)'
                    const isHou    = houRowIds.has(row.id)
                    const m        = row.monthly[monthKey] ?? ZERO_MONTHLY
                    const segSelectable = row.segmentationCodes.length > 0 && !isHou
                    const isSelected    = selectedSeg?.label === row.name
                    const baseBg        = isSelected ? 'rgba(0,229,160,0.06)' : rowBg

                    return (
                      <tr
                        key={row.id}
                        style={{ borderBottom: BORDER, color: rowColor, fontWeight: row.isBold ? 600 : 400 }}
                        onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${baseBg}` })}
                        onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => { (td as HTMLElement).style.background = baseBg })}
                      >
                        <td
                          onClick={segSelectable ? () => setSelectedSeg({ label: row.name, codes: row.segmentationCodes, viewMode: 'pu' }) : undefined}
                          style={{ ...tdBase, paddingLeft: row.indent ? 28 : 12, minWidth: 140, borderRight: DOUBLE, background: baseBg, cursor: segSelectable ? 'pointer' : 'default' }}
                        >
                          {row.indent ? <><span style={{ color: 'var(--brand-dimmed)' }}>└ </span>{row.name}</> : row.name}
                        </td>
                        <SlotCells
                          m={m}
                          adrUnit={adrUnit}
                          revUnit={revUnit}
                          baseSelected={selectedSeg?.label === row.name && selectedSeg?.viewMode === 'base'}
                          curSelected={selectedSeg?.label === row.name && selectedSeg?.viewMode === 'cur'}
                          bg={baseBg}
                          gapColor={rowColor}
                          gapBold={row.isBold}
                          onBaseClick={segSelectable ? () => setSelectedSeg({ label: row.name, codes: row.segmentationCodes, viewMode: 'base' }) : undefined}
                          onCurClick={segSelectable ? () => setSelectedSeg({ label: row.name, codes: row.segmentationCodes, viewMode: 'cur' }) : undefined}
                          onPuClick={segSelectable ? () => setSelectedSeg({ label: row.name, codes: row.segmentationCodes, viewMode: 'pu' }) : undefined}
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
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderLeft: BORDER }}><FmtNights n={sumMonth.base.nights} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtAdr n={sumMonth.base.adr} unit={adrUnit} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderRight: DOUBLE }}><FmtRevenue n={sumMonth.base.revenue} unit={revUnit} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtNights n={sumMonth.cur.nights} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtAdr n={sumMonth.cur.adr} unit={adrUnit} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right', borderRight: DOUBLE }}><FmtRevenue n={sumMonth.cur.revenue} unit={revUnit} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtPuNights n={sumMonth.pu.nights} fontColor="var(--color-text-primary)" /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtPuAdr n={sumMonth.pu.adr} fontColor="var(--color-text-primary)" unit={adrUnit} /></td>
                        <td className="font-mono" style={{ ...sumTd, textAlign: 'right' }}><FmtPuRevenue n={sumMonth.pu.revenue} fontColor="var(--color-text-primary)" unit={revUnit} /></td>
                      </>
                    ) : <td colSpan={9} />}
                  </tr>
                  {/* OCC */}
                  <tr style={{ borderTop: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE, background: '#111111' }}>점유율</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderLeft: BORDER, borderRight: DOUBLE, background: '#111111' }}>
                      <FmtOcc n={sumMonth?.base.occ ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderRight: DOUBLE, background: '#111111' }}>
                      <FmtOcc n={sumMonth?.cur.occ ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: '#111111' }}>
                      <FmtPuPct n={sumMonth?.pu.occDiff ?? 0} fontColor="var(--color-text-primary)" />
                    </td>
                  </tr>
                  {/* Rev.PAR */}
                  <tr style={{ borderTop: BORDER }}>
                    <td style={{ ...tdBase, paddingLeft: 12, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--brand-dimmed)', borderRight: DOUBLE, background: '#111111' }}>RevPAR</td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderLeft: BORDER, borderRight: DOUBLE, background: '#111111' }}>
                      <FmtRevpar n={sumMonth?.base.revpar ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', borderRight: DOUBLE, background: '#111111' }}>
                      <FmtRevpar n={sumMonth?.cur.revpar ?? 0} />
                    </td>
                    <td colSpan={3} className="font-mono" style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: '#111111' }}>
                      <FmtPuRevpar n={sumMonth?.pu.revparDiff ?? 0} fontColor="var(--color-text-primary)" />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* 우측 Account 증감 패널 */}
        <div style={{ width: 340, flexShrink: 0, border: '0.5px solid rgba(0,229,160,0.15)', borderLeft: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', background: 'radial-gradient(ellipse 80% 60% at 100% 100%, rgba(0,229,160,0.1) 0%, transparent 70%), #000000', alignSelf: 'stretch', maxHeight: 'calc(88vh - 120px)', overflow: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#FFC850' }}>Account 증감</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
              {selectedSeg
                ? `${selectedSeg.label} · ${selectedSeg.viewMode === 'base' ? '새벽 OTB' : selectedSeg.viewMode === 'cur' ? '현재 OTB' : '픽업'}`
                : '세그먼트를 클릭하세요'}
            </div>
          </div>
          {/* 컬럼 헤더 */}
          <div style={{ display: 'flex', padding: '5px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', flex: 1 }}>어카운트</span>
            <div style={{ display: 'flex', flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 40, textAlign: 'right' }}>객실</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 52, textAlign: 'right' }}>객단가</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 56, textAlign: 'right' }}>매출</span>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            {!selectedSeg ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
                <span style={{ fontSize: 18 }}>👆</span>
                <span>세그먼트를 클릭하세요</span>
              </div>
            ) : accountList.length === 0 ? (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: 12 }}>데이터가 없습니다.</div>
            ) : accountList.map((a, i) => {
              const isPu = selectedSeg?.viewMode === 'pu'
              return (
              <div key={`${a.name}-${i}`} style={{ padding: '6px 14px', borderBottom: '0.5px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                  {a.name}
                </span>
                <div style={{ display: 'flex', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: isPu ? (a.valRn > 0 ? '#00E5A0' : a.valRn < 0 ? '#E24B4A' : 'rgba(255,255,255,0.3)') : '#fff', width: 40, textAlign: 'right' }}>
                    {a.valRn === 0 ? '—' : (isPu && a.valRn > 0 ? '+' : '') + a.valRn}
                  </span>
                  <span style={{ fontSize: 11, color: isPu ? (a.valAdr > 0 ? '#00E5A0' : a.valAdr < 0 ? '#E24B4A' : 'rgba(255,255,255,0.3)') : '#fff', width: 52, textAlign: 'right' }}>
                    {a.valAdr === 0 ? '—' : (isPu && a.valAdr > 0 ? '+' : '') + scaleAdr(a.valAdr)}
                  </span>
                  <span style={{ fontSize: 11, color: isPu ? (a.valRev > 0 ? '#00E5A0' : a.valRev < 0 ? '#E24B4A' : 'rgba(255,255,255,0.3)') : '#fff', width: 56, textAlign: 'right' }}>
                    {a.valRev === 0 ? '—' : (isPu && a.valRev > 0 ? '+' : '') + scaleRev(a.valRev)}
                  </span>
                </div>
              </div>
              )
            })}
          </div>
        </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 shrink-0" style={{ borderTop: BORDER }}>
          <span style={{ fontSize: 11, color: '#00E5A0', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>단위 : 실 · {adrUnit} · {revUnit} · HOU 제외 · 픽업 기준</span>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
