'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, ArrowDown, AlignJustify, User } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usePickupData, type PickupRow } from '@/hooks/usePickupData'
import { useOtbData } from '@/hooks/useOtbData'
import { useLyPacing, type LyPacingMode } from '@/hooks/useLyPacing'
import SegmentationModal          from '@/components/dashboard/SegmentationModal'
import AccountModal               from '@/components/dashboard/AccountModal'
import MonthlyPickupSegModal      from '@/components/dashboard/MonthlyPickupSegModal'
import MonthlyPickupSegTotalModal from '@/components/dashboard/MonthlyPickupSegTotalModal'
import MonthlyPickupAccountModal  from '@/components/dashboard/MonthlyPickupAccountModal'
import MonthlyPickupAccountTotalModal from '@/components/dashboard/MonthlyPickupAccountTotalModal'
import LyComparisonSegModal       from '@/components/dashboard/LyComparisonSegModal'
import LyComparisonAccountModal   from '@/components/dashboard/LyComparisonAccountModal'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useFcstDateContext } from '@/contexts/FcstDateContext'
import { useLatestConfirmedBudgetDate } from '@/hooks/useLatestConfirmedBudgetDate'
import ForecastBudgetModal from '@/components/dashboard/ForecastBudgetModal'
import ActualBudgetModal from '@/components/dashboard/ActualBudgetModal'
import GMDailyReportModal from '@/components/dashboard/GMDailyReportModal'
import MonthlyClosingReportModal from '@/components/dashboard/MonthlyClosingReportModal'
import { useForecastMonthly, type ForecastMonthlyRow } from '@/hooks/useForecastMonthly'
import { useBudgetMonthly, type BudgetMonthlyRow } from '@/hooks/useBudgetMonthly'
import { supabase } from '@/lib/supabase'
import { FmtVal } from '@/utils/FmtVal'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MetricData {
  current: number
  unit: string
  yoy: number
  yoyUnit: string
  fit: number
  grp: number
}

interface MonthData {
  year:  number
  month: number
  occ: MetricData
  adr: MetricData
  rev: MetricData
  forecast?: { occ: number | null; adr: number | null; revenue: number | null }
  budget?:   { occ: number | null; adr: number | null; revenue: number | null }
  pu: number
  rmAction: string | null
}

interface MonthYoyStats {
  varNightsPct:  number | null
  varRevenuePct: number | null
  varAdr:        number
  byGroup: { group: string; varPct: number | null }[]
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MONTHS: MonthData[] = [
  {
    year: 2025, month: 4,
    occ: { current: 60.2, unit: '%', yoy: -4.6, yoyUnit: '%', fit: -1,  grp: -29 },
    adr: { current: 129,  unit: 'k', yoy: -1,   yoyUnit: 'k', fit:  0,  grp:  -9 },
    rev: { current: 167.4,unit: 'M', yoy: -13.6,yoyUnit: 'M', fit: -1,  grp: -35 },
    forecast: { occ: 63.3, adr: 125_000, revenue: 171_000_000 },
    pu: 6, rmAction: null,
  },
  {
    year: 2025, month: 5,
    occ: { current: 34.3, unit: '%', yoy: -3.4, yoyUnit: '%', fit:  27, grp: -57 },
    adr: { current: 152,  unit: 'k', yoy:  3,   yoyUnit: 'k', fit:  -6, grp:  -6 },
    rev: { current: 116.7,unit: 'M', yoy: -9.6, yoyUnit: 'M', fit:  20, grp: -59 },
    forecast: { occ: 61.6, adr: 132_000, revenue: 181_700_000 },
    pu: 3, rmAction: null,
  },
  {
    year: 2025, month: 6,
    occ: { current: 18.8, unit: '%', yoy:  8.7, yoyUnit: '%', fit:  96, grp:  77 },
    adr: { current: 119,  unit: 'k', yoy: -15,  yoyUnit: 'k', fit:  -1, grp: -23 },
    rev: { current: 48.5, unit: 'M', yoy:  19.0,yoyUnit: 'M', fit:  94, grp:  37 },
    forecast: { occ: 60.3, adr: 118_000, revenue: 153_200_000 },
    pu: 7, rmAction: null,
  },
  {
    year: 2025, month: 7,
    occ: { current: 12.1, unit: '%', yoy:  15.3,yoyUnit: '%', fit:  42, grp: -12 },
    adr: { current: 145,  unit: 'k', yoy:  8,   yoyUnit: 'k', fit:   5, grp: -15 },
    rev: { current: 31.2, unit: 'M', yoy:  24.5,yoyUnit: 'M', fit:  38, grp: -18 },
    forecast: { occ: 72.1, adr: 148_000, revenue: 189_300_000 },
    pu: 12, rmAction: '성수기 요금 전략을 검토하세요.',
  },
  {
    year: 2025, month: 8,
    occ: { current: 8.4,  unit: '%', yoy:  22.1,yoyUnit: '%', fit:  67, grp:  31 },
    adr: { current: 168,  unit: 'k', yoy:  12,  yoyUnit: 'k', fit:   8, grp:  -7 },
    rev: { current: 22.8, unit: 'M', yoy:  31.2,yoyUnit: 'M', fit:  71, grp:  -9 },
    forecast: { occ: 78.5, adr: 172_000, revenue: 241_600_000 },
    pu: 18, rmAction: null,
  },
  {
    year: 2025, month: 9,
    occ: { current: 4.2,  unit: '%', yoy:  -2.8,yoyUnit: '%', fit:  15, grp: -44 },
    adr: { current: 135,  unit: 'k', yoy:  -5,  yoyUnit: 'k', fit:  -3, grp: -18 },
    rev: { current: 8.9,  unit: 'M', yoy:  -4.1,yoyUnit: 'M', fit:  22, grp: -51 },
    forecast: { occ: 65.8, adr: 142_000, revenue: 177_400_000 },
    pu: 24, rmAction: null,
  },
]

interface MonthStats {
  occ:       number
  adr:       number
  rev:       number
  otbNights: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}k`
  return n.toLocaleString('ko-KR')
}

function formatPu(n: number, type: 'nights' | 'currency'): string {
  const sign = n >= 0 ? '+' : ''
  if (type === 'currency') {
    if (Math.abs(n) >= 1_000_000) return `${sign}${(n / 1_000_000).toFixed(1)}M`
    if (Math.abs(n) >= 1_000)     return `${sign}${(n / 1_000).toFixed(0)}k`
    return `${sign}${n.toLocaleString('ko-KR')}`
  }
  return `${sign}${n.toLocaleString('ko-KR')}`
}

// 숫자 부분과 단위를 분리 (1.5배 강조용)
function formatPuParts(n: number, type: 'nights' | 'currency'): { num: string; unit: string } {
  const sign = n >= 0 ? '+' : ''
  if (type === 'nights') return { num: `${sign}${n.toLocaleString('ko-KR')}`, unit: '실' }
  if (Math.abs(n) >= 1_000_000) return { num: `${sign}${(n / 1_000_000).toFixed(1)}`, unit: 'M' }
  if (Math.abs(n) >= 1_000)     return { num: `${sign}${(n / 1_000).toFixed(0)}`,     unit: 'k' }
  return { num: `${sign}${n.toLocaleString('ko-KR')}`, unit: '' }
}

// ── 이벤트 뱃지 (c06_calendar) ───────────────────────────────────────────────────
type EventGroup = {
  name:      string
  startDate: string   // 'YYYY-MM-DD'
  endDate:   string   // 'YYYY-MM-DD'
  dates:     string[]
  isPast:    boolean  // otbDate 기준 모든 날짜가 이전이면 true
}
// 괄호 () 안 텍스트 추출 (없으면 null) — PickupMonthCard 기준
const extractParenText = (event: string): string | null => {
  const m = event.match(/\(([^)]+)\)/)
  return m ? m[1].trim() : null
}
// 뱃지 날짜 라벨: 단일 M/D · 복수(같은 달) M/D~D · 복수(다른 달) M/D~M/D
const eventRangeLabel = (g: EventGroup) => {
  const [, sM, sD] = g.startDate.split('-').map(Number)
  const [, eM, eD] = g.endDate.split('-').map(Number)
  if (g.startDate === g.endDate) return `${sM}/${sD}`
  return sM === eM ? `${sM}/${sD}~${eD}` : `${sM}/${sD}~${eM}/${eD}`
}

// ── 이벤트 hover 툴팁 ─────────────────────────────────────────────────────────────
const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']

type DayAggEntry = { otbN: number; otbR: number; vsN: number; vsR: number }

// 이벤트 뱃지 + hover 툴팁 — 뱃지 스타일은 Phase 1(민트/블루) 유지, 툴팁은 PickupMonthCard 이식.
// 카드 overflow-hidden 잘림 방지를 위해 툴팁만 createPortal + position:fixed 로 렌더.
function EventBadge({ group, pickupRows, roomCount }: { group: EventGroup; pickupRows: PickupRow[]; roomCount: number }) {
  const [hovered, setHovered] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const [barData, setBarData] = useState<Record<string, { cur: number | null }>>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''
  const { otbDate } = useDateContext()

  const dayAgg = useMemo(() => {
    const map: Record<string, DayAggEntry> = {}
    for (const r of pickupRows) {
      if (!group.dates.includes(r.business_date)) continue
      let a = map[r.business_date]
      if (!a) { a = { otbN: 0, otbR: 0, vsN: 0, vsR: 0 }; map[r.business_date] = a }
      a.otbN += r.otb_nights ?? 0;     a.otbR += r.otb_revenue ?? 0
      a.vsN  += r.vs_otb_nights ?? 0;  a.vsR  += r.vs_otb_revenue ?? 0
    }
    return map
  }, [pickupRows, group.dates])

  // 미래 이벤트만 hover 시 BAR 현재값(s02_rate_detail) fetch
  useEffect(() => {
    if (!hovered || group.isPast || !hotelId || group.dates.length === 0) return
    let cancelled = false
    ;(async () => {
      // BAR 현재값 — s02_rate_detail (GMDailyReportModal 패턴: change>single>base)
      const PRIORITY: Record<string, number> = { change: 3, single: 2, base: 1 }
      const barByDate: Record<string, number> = {}
      const prioByDate: Record<string, number> = {}
      try {
        const { data: rateRows, error } = await (supabase as any)
          .from('s02_rate_detail').select('stay_date, date_type, new_rate')
          .eq('hotel_id', hotelId).in('stay_date', group.dates)
          .in('date_type', ['change', 'single', 'base'])
        if (!error) {
          for (const r of rateRows ?? []) {
            const p = PRIORITY[r.date_type] ?? 0
            if (barByDate[r.stay_date] === undefined || p > prioByDate[r.stay_date]) {
              barByDate[r.stay_date] = r.new_rate; prioByDate[r.stay_date] = p
            }
          }
        }
      } catch { /* 무시 → cur null */ }
      if (cancelled) return
      const next: Record<string, { cur: number | null }> = {}
      for (const date of group.dates) {
        next[date] = { cur: barByDate[date] != null ? Math.round(barByDate[date] / 1000) : null }
      }
      setBarData(next)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered])

  const openTip = () => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    setHovered(true)
  }

  const label   = eventRangeLabel(group)
  const isPast  = group.isPast
  const puTotal = pickupRows.filter(r => group.dates.includes(r.business_date)).reduce((s, r) => s + (r.pu_nights ?? 0), 0)

  // 과거 기간 합계 (dayAgg 집계). 전년(LY)은 소스 없어 —
  const pastSummary = (() => {
    let totOtbN = 0, totOtbR = 0
    for (const d of group.dates) { const a = dayAgg[d]; if (a) { totOtbN += a.otbN; totOtbR += a.otbR } }
    const avail = roomCount * group.dates.length
    return {
      avgOcc:   avail > 0 ? (totOtbN / avail * 100).toFixed(1) : null,
      avgAdr:   totOtbN > 0 ? Math.round(totOtbR / totOtbN / 1000) : null,
      totalRev: totOtbR > 0 ? (totOtbR / 1e6).toFixed(1) : null,
    }
  })()

  // 날짜 수 기반 동적 폭: 날짜당 130px, 최소 400 · 미래 상한 700 / 과거 상한 450
  const tipWidth = isPast
    ? Math.min(450, Math.max(400, group.dates.length * 130))
    : Math.min(700, Math.max(400, group.dates.length * 130))

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={openTip} onMouseLeave={() => setHovered(false)}>
      {group.isPast ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(91,141,239,0.1)', border: '0.5px solid rgba(91,141,239,0.3)', borderRadius: 20, padding: '4px 10px 4px 8px', fontSize: 12, color: '#5B8DEF', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          마감 · {group.name} {label}
        </div>
      ) : (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,229,160,0.1)', border: '0.5px solid rgba(0,229,160,0.3)', borderRadius: 20, padding: '4px 10px 4px 8px', fontSize: 12, color: '#00E5A0', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {group.name} {label}
          {puTotal !== 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, background: '#00E5A0', color: '#0a0a0a', borderRadius: 10, padding: '1px 6px' }}>
              {puTotal > 0 ? `+${puTotal}` : puTotal}
            </span>
          )}
        </div>
      )}

      {hovered && pos && createPortal(
        <div style={{
          position: 'fixed', top: pos.top, right: pos.right, zIndex: 99999, width: tipWidth,
          borderRadius: 10, overflow: 'hidden',
          background: `radial-gradient(ellipse 70% 60% at 95% 100%, rgba(0,229,160,0.1) 0%, transparent 70%), #141414`,
          border: '0.5px solid rgba(0,229,160,0.3)',
          borderLeft: '3px solid #00E5A0',
          boxShadow: '0 6px 20px rgba(0,0,0,0.6)', pointerEvents: 'none',
        }}>
          {/* 헤더 */}
          <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{group.name}</span>
            <span style={{ fontSize: 10, background: 'rgba(0,229,160,0.1)', border: '0.5px solid rgba(0,229,160,0.3)', color: '#00E5A0', borderRadius: 20, padding: '2px 8px' }}>
              {label} · {group.dates.length}일
            </span>
          </div>

          {/* 날짜별 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${group.dates.length}, 1fr)` }}>
            {group.dates.map(date => {
              const row = dayAgg[date]
              const hasPu = !!row && row.vsN !== row.otbN
              const currOcc = row && roomCount ? (row.otbN / roomCount * 100).toFixed(1) : null
              const prevOcc = row && roomCount ? (row.vsN / roomCount * 100).toFixed(1) : null
              const adr = row && row.otbN ? Math.round(row.otbR / row.otbN / 1000) : null
              const rev = row && row.otbR ? (row.otbR / 1e6).toFixed(1) : null
              const puOcc = row && roomCount ? ((row.otbN - row.vsN) / roomCount * 100).toFixed(1) : null
              const dd = new Date(date)
              const dLabel = `${dd.getMonth() + 1}/${dd.getDate()} ${DOW_KR[dd.getDay()]}`
              const before = !!otbDate && date < otbDate
              return (
                <div key={date} style={{ padding: '11px 14px', borderRight: '0.5px solid rgba(255,255,255,0.04)', ...(before ? { filter: 'grayscale(1)', opacity: 0.4 } : {}) }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginBottom: 7 }}>{dLabel}</div>
                  {!isPast && hasPu ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{prevOcc}%</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.12)' }}>›</span>
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#00E5A0' }}>{currOcc ?? '—'}%</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#00E5A0', textAlign: 'right', marginBottom: 5 }}>{currOcc ?? '—'}%</div>
                  )}
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, marginBottom: 9, position: 'relative' }}>
                    {!isPast && hasPu && (
                      <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${prevOcc}%`, background: 'rgba(255,255,255,0.18)', borderRadius: 3 }} />
                    )}
                    <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${currOcc ?? 0}%`, background: '#00E5A0', boxShadow: '0 0 6px rgba(0,229,160,0.6)', borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>ADR</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{adr ? `${adr}k` : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>REV</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{rev ? `${rev}M` : '—'}</span>
                  </div>
                  {!isPast && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>픽업</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: hasPu ? '#00E5A0' : 'rgba(255,255,255,0.18)' }}>
                        {hasPu && puOcc ? `+${puOcc}%` : '—'}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 하단 — 미래: BAR·추천 / 과거: 기간 합계 요약 */}
          {!isPast ? (
            <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: `repeat(${group.dates.length},1fr)`, background: 'rgba(0,0,0,0.15)' }}>
              {group.dates.map(date => {
                const bar = barData[date]
                const before = !!otbDate && date < otbDate
                return (
                  <div key={date} style={{ padding: '8px 14px', borderRight: '0.5px solid rgba(255,255,255,0.04)', ...(before ? { filter: 'grayscale(1)', opacity: 0.4 } : {}) }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginBottom: 5 }}>BAR</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 13, color: '#00E5A0' }}>{bar?.cur ? `${bar.cur}k` : '—'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: 'rgba(0,0,0,0.15)' }}>
              <div style={{ padding: '8px 14px', borderRight: '0.5px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginBottom: 3 }}>기간 합계 OCC</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>{pastSummary.avgOcc ?? '—'}%</div>
                <div style={{ fontSize: 10, color: 'rgba(0,229,160,0.6)', marginTop: 2 }}>전년 —</div>
              </div>
              <div style={{ padding: '8px 14px', borderRight: '0.5px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginBottom: 3 }}>평균 ADR</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>{pastSummary.avgAdr != null ? `${pastSummary.avgAdr}k` : '—'}</div>
                <div style={{ fontSize: 10, color: 'rgba(0,229,160,0.6)', marginTop: 2 }}>전년 —</div>
              </div>
              <div style={{ padding: '8px 14px' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginBottom: 3 }}>합계 REV</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>{pastSummary.totalRev != null ? `${pastSummary.totalRev}M` : '—'}</div>
                <div style={{ fontSize: 10, color: 'rgba(0,229,160,0.6)', marginTop: 2 }}>전년 —</div>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function ChangeTag({ value, unit, onClick }: { value: number; unit: string; onClick?: () => void }) {
  const pos = value >= 0
  const inner = (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[13px] font-semibold leading-none ${
        pos ? 'text-status-positive' : 'text-status-negative'
      }`}
      style={{
        background: pos ? 'var(--accent-badge-bg)' : 'var(--negative-bg)',
        border:     `1px solid ${pos ? 'var(--accent-badge-border)' : 'var(--negative-border)'}`,
      }}
    >
      {pos ? '▲' : '▼'}&nbsp;{Math.abs(value)}{unit}
    </span>
  )
  if (!onClick) return inner
  return (
    <button
      onClick={onClick}
      title="전년 동기간 비교 보기"
      style={{ background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer', borderRadius: 4, transition: 'background 0.15s', display: 'inline-flex' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {inner}
    </button>
  )
}

function SubMetric({ label, value }: { label: string; value: number }) {
  const pos = value >= 0
  return (
    <span className="text-[11px] whitespace-nowrap" style={{ opacity: 0.65 }}>
      <span className="text-brand-dimmed">{label} </span>
      <span className={pos ? 'text-status-positive' : 'text-status-negative'}>
        {pos ? '▲' : '▼'}{Math.abs(value)}%
      </span>
    </span>
  )
}

function MetricRow({ label, value, metric, subValue, unitLabel, tooltip, yoyOverride, yoyLoading, onLyClick, modeLabelNode }: {
  label:          string
  value:          string
  metric:         MetricData
  subValue?:      string
  unitLabel?:     string
  tooltip?:       string
  yoyOverride?:   { value: number | null; unit: string; fitPct?: number | null; grpPct?: number | null; showFitGrp?: boolean }
  yoyLoading?:    boolean
  onLyClick?:     () => void
  modeLabelNode?: React.ReactNode
}) {
  return (
    <div
      className="flex items-center justify-between py-[18px] last:border-0"
      style={{ borderBottom: '1px solid var(--divider-color)' }}
    >
      <div className="flex items-center gap-2">
        <div className="w-12 shrink-0 flex flex-col" style={{ gap: 2, alignSelf: 'center', marginTop: 4 }}>
          <span className="text-[11px] font-semibold text-brand-dimmed tracking-widest whitespace-nowrap">{label}</span>
          {unitLabel && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap' }}>{unitLabel}</span>
          )}
        </div>
        <div className="flex flex-col" title={tooltip}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              className="font-mono font-bold leading-none"
              style={{ color: 'var(--color-text-primary)', cursor: tooltip ? 'help' : 'default', letterSpacing: '0.05em' }}
            >
              <FmtVal val={value} numSize={29} />
            </span>
            {subValue && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{subValue}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-y-[5px] shrink-0 ml-2">
        {modeLabelNode}
        {yoyLoading ? (
          <span className="text-[11px] text-brand-dimmed">-</span>
        ) : yoyOverride ? (
          <>
            {yoyOverride.value !== null
              ? <ChangeTag value={yoyOverride.value} unit={yoyOverride.unit} onClick={onLyClick} />
              : <span className="text-[11px] text-brand-dimmed">-</span>
            }
            {yoyOverride.showFitGrp && (
              <div className="flex items-center gap-2 justify-end">
                <SubMetric label="FIT" value={Math.round(yoyOverride.fitPct ?? 0)} />
                <SubMetric label="GRP" value={Math.round(yoyOverride.grpPct ?? 0)} />
              </div>
            )}
          </>
        ) : (
          <>
            <ChangeTag value={metric.yoy} unit={metric.yoyUnit} onClick={onLyClick} />
            <div className="flex items-center gap-2 justify-end">
              <SubMetric label="FIT" value={metric.fit} />
              <SubMetric label="GRP" value={metric.grp} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Month Card ─────────────────────────────────────────────────────────────────

// ─── Forecasting helpers ───────────────────────────────────────────────────────

function fmtFcOcc(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${n.toFixed(1)}%`
}
function fmtFcAdr(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${Math.round(n / 1000)}`
}
function fmtFcRevenue(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${(n / 1_000_000).toFixed(1)}`
}
function fmtFcPct(n: number | null): string {
  if (n == null) return '-'
  return `${n.toFixed(1)}%`
}
function getAchievementColor(pct: number | null): string {
  if (pct === null) return 'var(--brand-dimmed)'
  if (pct >= 100) return 'var(--color-positive)'
  if (pct >= 95)  return '#ffc857'
  return 'var(--color-negative)'
}

// ─── Month Card ─────────────────────────────────────────────────────────────────

function MonthCard({ data, stats, loading, roomCount, yoyStats, yoyLoading, onSegClick, onAccountClick, pickupNights, onLyClick, onAchievementClick, lyMode, onLyModeToggle, events = [], pickupRows = [] }: {
  data:             MonthData
  stats:            MonthStats
  loading:          boolean
  roomCount:        number
  yoyStats:         MonthYoyStats
  yoyLoading:       boolean
  onSegClick?:      (year: number, month: number) => void
  onAccountClick?:  (year: number, month: number) => void
  pickupNights:     number
  onLyClick?:              (year: number, month: number) => void
  onAchievementClick?:     (year: number, month: number) => void
  lyMode:           'v1' | 'v2'
  onLyModeToggle:   () => void
  events?:          EventGroup[]
  pickupRows?:      PickupRow[]
}) {
  const { year, month, occ, adr, rev, forecast, budget, pu, rmAction } = data

  const achievementOcc = forecast?.occ && budget?.occ ? (forecast.occ / budget.occ) * 100 : null
  const achievementAdr = forecast?.adr && budget?.adr ? (forecast.adr / budget.adr) * 100 : null
  const achievementRev = forecast?.revenue && budget?.revenue ? (forecast.revenue / budget.revenue) * 100 : null
  // occ, adr, rev are mock data used as fallback; stats holds live OTB values

  const occValue = loading ? '-' : roomCount === 0 ? '-' : `${stats.occ.toFixed(1)}%`
  const adrValue = loading ? '-' : formatCurrency(stats.adr).replace(/k$/, '')
  const revValue = loading ? '-' : formatCurrency(stats.rev).replace(/M$/, '')

  const fitPct = yoyStats.byGroup.find(g => g.group === 'fit')?.varPct ?? null
  const grpPct = yoyStats.byGroup.find(g => g.group === 'group')?.varPct ?? null


  return (
    <div
      className="flex flex-col rounded-2xl bg-bg-surface overflow-hidden"
      style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      {/* ── Month header ── */}
      <div
        className="relative px-5 pt-5 pb-2 overflow-hidden"
        style={{ background: 'var(--card-header-bg)' }}
      >
        <div
          className="pointer-events-none absolute -top-6 -left-6 w-28 h-28 rounded-full opacity-20"
          style={{ background: `radial-gradient(circle, var(--card-header-glow-color) 0%, transparent 70%)` }}
        />
        <div className="relative flex items-end justify-between gap-1.5">
          <div className="flex items-end gap-1.5">
            <span className="font-bold leading-none" style={{ fontSize: 54, color: 'var(--color-text-primary)' }}>
              {month}
            </span>
            <span className="text-lg font-medium text-brand-muted mb-1.5">월</span>
            <span className="text-xs font-medium text-brand-dimmed mb-2 ml-0.5">{year}</span>
          </div>
          {events.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 6 }}>
              {events.map(ev => (
                <EventBadge key={ev.startDate + ev.name} group={ev} pickupRows={pickupRows} roomCount={roomCount} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── OCC / ADR / REV ── */}
      <div className="px-5 pb-1">
        <MetricRow
          label="점유율"
          value={occValue}
          metric={occ}
          subValue={loading ? undefined : `${stats.otbNights.toLocaleString('ko-KR')} 객실`}
          yoyOverride={{
            value:      yoyStats.varNightsPct !== null ? Math.round(yoyStats.varNightsPct * 10) / 10 : null,
            unit:       '%',
            fitPct,
            grpPct,
            showFitGrp: true,
          }}
          yoyLoading={yoyLoading}
          onLyClick={onLyClick ? () => onLyClick(year, month) : undefined}
          modeLabelNode={
            <span
              onClick={onLyModeToggle}
              className="text-[10px] cursor-pointer transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)', borderBottom: '1px dashed rgba(255,255,255,0.3)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.color = 'rgba(255,255,255,0.7)'; (e.currentTarget as HTMLSpanElement).style.borderBottomColor = 'rgba(255,255,255,0.5)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.color = 'rgba(255,255,255,0.4)'; (e.currentTarget as HTMLSpanElement).style.borderBottomColor = 'rgba(255,255,255,0.3)' }}
            >
              {lyMode === 'v1' ? '전년 동일자 ⇅' : '전년 동기간 ⇅'}
            </span>
          }
        />
        <MetricRow
          label="객단가"
          value={adrValue}
          metric={adr}
          tooltip={loading ? undefined : stats.adr.toLocaleString('ko-KR')}
          yoyOverride={{
            value:      Math.round(yoyStats.varAdr / 1000),
            unit:       'k',
            showFitGrp: false,
          }}
          yoyLoading={yoyLoading}
          onLyClick={onLyClick ? () => onLyClick(year, month) : undefined}
          modeLabelNode={
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {lyMode === 'v1' ? '전년 동일자' : '전년 동기간'}
            </span>
          }
        />
        <MetricRow
          label="매출"
          value={revValue}
          metric={rev}
          tooltip={loading ? undefined : stats.rev.toLocaleString('ko-KR')}
          yoyOverride={{
            value:      yoyStats.varRevenuePct !== null ? Math.round(yoyStats.varRevenuePct * 10) / 10 : null,
            unit:       '%',
            fitPct,
            grpPct,
            showFitGrp: true,
          }}
          yoyLoading={yoyLoading}
          onLyClick={onLyClick ? () => onLyClick(year, month) : undefined}
          modeLabelNode={
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {lyMode === 'v1' ? '전년 동일자' : '전년 동기간'}
            </span>
          }
        />
      </div>


      {/* ── Forecasting (FCST / BUDGET / 달성 매트릭스) ── */}
      <div className="mx-4 mt-2 rounded-xl p-3.5" style={{ background: 'var(--forecast-bg)', border: '1px solid var(--forecast-border)' }}>
        <div style={{ fontSize: 10, letterSpacing: '1.5px', fontWeight: 500, color: 'var(--color-accent-primary)', marginBottom: 10, textTransform: 'uppercase' }}>
          목표 및 전망
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr 1fr 1fr', gap: '8px 10px', alignItems: 'center' }}>
          {/* 헤더 */}
          <div />
          <div style={{ fontSize: 10, color: 'var(--brand-dimmed)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>점유율</div>
          <div style={{ fontSize: 10, color: 'var(--brand-dimmed)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>객단가</div>
          <div style={{ fontSize: 10, color: 'var(--brand-dimmed)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>매출</div>
          {/* FCST 행 */}
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--brand-dimmed)' }}>전망</div>
          <div className="font-mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-accent-primary)', textAlign: 'right' }}>{fmtFcOcc(forecast?.occ)}</div>
          <div className="font-mono" style={{ fontWeight: 600, color: 'var(--color-accent-primary)', textAlign: 'right' }}><FmtVal val={fmtFcAdr(forecast?.adr)} numSize={16} /></div>
          <div className="font-mono" style={{ fontWeight: 600, color: 'var(--color-accent-primary)', textAlign: 'right' }}><FmtVal val={fmtFcRevenue(forecast?.revenue)} numSize={16} /></div>
          {/* BUDGET 행 */}
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--brand-dimmed)' }}>목표</div>
          <div className="font-mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'right' }}>{fmtFcOcc(budget?.occ)}</div>
          <div className="font-mono" style={{ fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'right' }}><FmtVal val={fmtFcAdr(budget?.adr)} numSize={16} /></div>
          <div className="font-mono" style={{ fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'right' }}><FmtVal val={fmtFcRevenue(budget?.revenue)} numSize={16} /></div>
          {/* 달성 행 */}
          {(['달성', achievementOcc, achievementAdr, achievementRev] as const).map((val, i) => {
            const borderTop = '1px solid var(--color-border-default)'
            const pt = '7px'
            if (i === 0) return (
              <div key="달성" style={{ fontSize: 12, fontWeight: 500, color: 'var(--brand-dimmed)', borderTop, paddingTop: pt }}>달성</div>
            )
            const pct = val as number | null
            const clickable = pct !== null && !!onAchievementClick
            return (
              <button
                key={i}
                onClick={clickable ? () => onAchievementClick!(year, month) : undefined}
                disabled={!clickable}
                title={clickable ? 'FCST vs BUDGET 비교 보기' : undefined}
                className="font-mono"
                style={{
                  fontSize: 14, fontWeight: 600, textAlign: 'right',
                  color: getAchievementColor(pct),
                  borderTop, paddingTop: pt,
                  background: 'transparent', border: 'none',
                  padding: `${pt} 6px 0`, margin: 0,
                  cursor: clickable ? 'pointer' : 'default',
                  borderRadius: 4, transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'var(--color-bg-elevated)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {fmtFcPct(pct)}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Action buttons ── */}
      {/* group: P/U 호버 시 보조 버튼 슬라이드인 */}
      <div className="px-4 pb-4 flex items-center group" style={{ marginTop: 14 }}>
        {/* 메인 버튼 — 카드 전체 너비 */}
        <button
          className="flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[12px] font-bold transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
          style={{
            background: 'var(--gradient-cta)',
            boxShadow:  'var(--accent-btn-glow)',
            color:      pickupNights >= 0 ? '#0A0A0A' : '#E24B4A',
          }}
        >
          {pickupNights >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          픽업 {pickupNights >= 0 ? '+' : ''}{pickupNights} rooms
        </button>

        {/* 보조 버튼 컨테이너 — 호버 전 숨김, 호버 시 슬라이드인 */}
        <div className="flex items-center gap-2 overflow-hidden max-w-0 opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-out">
          <button
            onClick={() => onSegClick?.(year, month)}
            className="flex items-center gap-1 px-3 py-2.5 rounded-full text-brand-muted text-[11px] font-medium whitespace-nowrap hover:text-brand-text transition-colors duration-150"
            style={{ border: '1px solid var(--ghost-btn-border)' }}
          >
            <AlignJustify size={11} />
            Seg
          </button>
          <button
            onClick={() => onAccountClick?.(year, month)}
            className="flex items-center gap-1 px-3 py-2.5 rounded-full text-brand-muted text-[11px] font-medium whitespace-nowrap hover:text-brand-text transition-colors duration-150"
            style={{ border: '1px solid var(--ghost-btn-border)' }}
          >
            <User size={11} />
            Account
          </button>
        </div>
      </div>

      {/* ── RM Action ── */}
      <div
        className="bg-bg-secondary px-4 py-3 flex items-center gap-2.5"
        style={{ borderTop: '1px solid var(--divider-color)' }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ background: 'var(--rm-icon-bg)', border: '1px solid var(--rm-icon-border)' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              stroke="var(--rm-icon-stroke)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-accent-primary leading-none mb-0.5">RM 액션</p>
          <p className="text-[10px] text-brand-dimmed truncate">
            {rmAction ?? 'RM 액션 데이터가 준비되지 않았습니다.'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard Page ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 3

export default function DashboardPage() {
  const [page, setPage]     = useState(0)
  const [titleShifting, setTitleShifting] = useState(false)
  const [lyMode, setLyMode] = useState<LyPacingMode>('v1')
  const [segModal,     setSegModal]     = useState<{ open: boolean; year?: number; month?: number }>({ open: false })
  const [actualBudgetModal, setActualBudgetModal] = useState(false)
  const [gmReportOpen, setGmReportOpen] = useState(false)
  const [closingReportOpen, setClosingReportOpen] = useState(false)
  const [monthlyPickupSegOpen,       setMonthlyPickupSegOpen]       = useState(false)
  const [pickupViewMode,             setPickupViewMode]             = useState<'monthly' | 'total'>('total')
  const [forecastBudgetModal,        setForecastBudgetModal]        = useState<{
    open: boolean; monthKey?: string
  }>({ open: false })
  const [lyComparisonSegModal,       setLyComparisonSegModal]       = useState<{
    open: boolean; monthKey?: string
  }>({ open: false })
  const [lyComparisonAccountModal,   setLyComparisonAccountModal]   = useState<{
    open: boolean; monthKey?: string; filterSegCodes?: string[]; filterLabel?: string
  }>({ open: false })
  const [monthlyPickupAccountModal,  setMonthlyPickupAccountModal]  = useState<{
    open: boolean; filterSegCodes?: string[]; filterMonthKey?: string; filterLabel?: string; initialViewMode?: 'monthly' | 'total'
  }>({ open: false })
  const [accountModal, setAccountModal] = useState<{
    open: boolean; year?: number; month?: number
    filterSegCodes?: string[]; filterLabel?: string
  }>({ open: false })

  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  const { vsOtbDate, otbDates } = useDateContext()
  const { fcstDate, fcstDates } = useFcstDateContext()
  const { data: pickupData, loading: pickupLoading, otbDate } = usePickupData()

  const pickupDays = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0
  const { data: otbData } = useOtbData()
  const { data: lyData, loading: lyLoading } = useLyPacing(lyMode)

  function getMonthPickup(year: number, month: number): number {
    return pickupData
      .filter(row => {
        const d = new Date(row.business_date)
        return d.getFullYear() === year
            && d.getMonth() + 1 === month
            && row.segmentation !== 'HOU'
      })
      .reduce((sum, r) => sum + (r.pu_nights ?? 0), 0)
  }

  function getMonthLyStats(year: number, month: number): MonthYoyStats {
    const monthData = lyData.filter(row => {
      const d = new Date(row.business_date)
      return d.getFullYear() === year && d.getMonth() + 1 === month && row.segmentation !== 'HOU'
    })

    const otbNights  = monthData.reduce((sum, r) => sum + (r.otb_nights  ?? 0), 0)
    const lyNights   = monthData.reduce((sum, r) => sum + (r.ly_nights   ?? 0), 0)
    const otbRevenue = monthData.reduce((sum, r) => sum + (r.otb_revenue ?? 0), 0)
    const lyRevenue  = monthData.reduce((sum, r) => sum + (r.ly_revenue  ?? 0), 0)

    const varNightsPct  = lyNights  > 0 ? (otbNights  - lyNights)  / lyNights  * 100 : null
    const varRevenuePct = lyRevenue > 0 ? (otbRevenue - lyRevenue) / lyRevenue * 100 : null

    const otbAdr = otbNights > 0 ? Math.round(otbRevenue / otbNights) : 0
    const lyAdr  = lyNights  > 0 ? Math.round(lyRevenue  / lyNights)  : 0
    const varAdr = otbAdr - lyAdr

    const byGroup = ['fit', 'group'].map(grp => {
      const grpData = monthData.filter(r => r.sorting2 === grp)
      const otbN = grpData.reduce((sum, r) => sum + (r.otb_nights ?? 0), 0)
      const lyN  = grpData.reduce((sum, r) => sum + (r.ly_nights  ?? 0), 0)
      const varPct = lyN > 0 ? (otbN - lyN) / lyN * 100 : null
      return { group: grp, varPct }
    })

    return { varNightsPct, varRevenuePct, varAdr, byGroup }
  }

  const { data: hotelDetail } = useQuery({
    queryKey: ['m03_hotel_details', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('m03_hotel_details')
        .select('room_count')
        .eq('hotel_id', hotelId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
  })
  const roomCount = hotelDetail?.room_count ?? 0

  // ── Forecast / Budget 월별 집계 ──────────────────────────────────────────────
  const { data: budgetDate = null } = useLatestConfirmedBudgetDate(hotelId || undefined)

  // 카드가 보여주는 연도 (otbDate 기준 첫 번째 월)
  const cardYear = otbDate ? new Date(otbDate).getFullYear() : new Date().getFullYear()

  const { data: forecastRows = [] } = useForecastMonthly({
    hotelId: hotelId || undefined,
    year:    cardYear,
    updateDate: fcstDate || null,
  })

  const { data: budgetRows = [] } = useBudgetMonthly({
    hotelId: hotelId || undefined,
    year:    cardYear,
    updateDate: budgetDate,
  })

  type MonthForecast = { occ: number | null; adr: number | null; revenue: number | null }

  function aggregateByMonth(
    rows: (ForecastMonthlyRow | BudgetMonthlyRow)[],
    nightsKey: 'forecast_nights' | 'budget_nights',
    revenueKey: 'forecast_revenue' | 'budget_revenue',
    rc: number,
    yr: number,
  ): Record<number, MonthForecast> {
    const acc: Record<number, { nights: number; revenue: number }> = {}
    for (const r of rows) {
      const n = (r as any)[nightsKey] as number
      const v = (r as any)[revenueKey] as number
      if (!acc[r.month_num]) acc[r.month_num] = { nights: 0, revenue: 0 }
      acc[r.month_num].nights  += n
      acc[r.month_num].revenue += v
    }
    const result: Record<number, MonthForecast> = {}
    for (const [mStr, sum] of Object.entries(acc)) {
      const m           = Number(mStr)
      const daysInMonth = new Date(yr, m, 0).getDate()
      result[m] = {
        occ:     rc > 0 && sum.nights > 0 ? (sum.nights / (rc * daysInMonth)) * 100 : null,
        adr:     sum.nights > 0 ? sum.revenue / sum.nights : null,
        revenue: sum.revenue > 0 ? sum.revenue : null,
      }
    }
    return result
  }

  const forecastByMonth = useMemo(
    () => aggregateByMonth(forecastRows, 'forecast_nights', 'forecast_revenue', roomCount, cardYear),
    [forecastRows, roomCount, cardYear],
  )

  const budgetByMonth = useMemo(
    () => aggregateByMonth(budgetRows, 'budget_nights', 'budget_revenue', roomCount, cardYear),
    [budgetRows, roomCount, cardYear],
  )

  function getMonthStats(year: number, month: number): MonthStats {
    const monthData = otbData.filter(row => {
      const d = new Date(row.business_date)
      return d.getFullYear() === year && d.getMonth() + 1 === month
    })
    console.log(`OTB Stats ${year}-${month}:`, monthData.length,
      '첫번째:', monthData[0]?.business_date,
      'otb_nights:', monthData[0]?.otb_nights)
    const otbNights = monthData
      .filter(r => r.segmentation !== 'HOU')
      .reduce((sum, r) => sum + (r.otb_nights ?? 0), 0)
    const otbRevenue = monthData
      .reduce((sum, r) => sum + (r.otb_revenue ?? 0), 0)
    const daysInMonth = new Date(year, month, 0).getDate()
    const occ = roomCount > 0 && daysInMonth > 0
      ? (otbNights / (daysInMonth * roomCount)) * 100
      : 0
    const adr = otbNights > 0 ? Math.round(otbRevenue / otbNights) : 0
    return { occ, adr, rev: otbRevenue, otbNights }
  }

  const totalPuNights  = pickupData.reduce((sum, row) => sum + (row.pu_nights  ?? 0), 0)
  const totalPuRevenue = pickupData.reduce((sum, row) => sum + (row.pu_revenue ?? 0), 0)
  const totalPuAdr     = totalPuNights > 0 ? Math.round(totalPuRevenue / totalPuNights) : 0

  // otbDate 기준 6개월 범위 생성
  const base = otbDate ? new Date(otbDate) : new Date()
  const months: MonthData[] = Array.from({ length: 6 }, (_, i) => {
    const d    = new Date(base.getFullYear(), base.getMonth() + i, 1)
    const year = d.getFullYear()
    const mon  = d.getMonth() + 1
    const mock = MONTHS[i % MONTHS.length]
    return { ...mock, year, month: mon }
  })

  const totalPages    = Math.ceil(months.length / PAGE_SIZE)
  const visibleMonths = months.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  // ── 이벤트(c06_calendar) — 카드 6개월 범위 fetch → 같은 이름·연속 날짜 병합 ──
  const eventRangeStart = months.length ? `${months[0].year}-${String(months[0].month).padStart(2, '0')}-01` : ''
  const eventRangeEnd = (() => {
    if (!months.length) return ''
    const last = months[months.length - 1]
    const end  = new Date(last.year, last.month, 0)   // 마지막 달 말일
    return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
  })()
  const { data: calEventRows = [] } = useQuery({
    queryKey: ['dash_cal_events', eventRangeStart, eventRangeEnd],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c06_calendar')
        .select('date, event')
        .gte('date', eventRangeStart)
        .lte('date', eventRangeEnd)
        .not('event', 'is', null)
        .ilike('event', '%(%)%')
        .order('date', { ascending: true })
      if (error) { console.error('[Dashboard] c06 events error:', error); return [] }
      return data ?? []
    },
    enabled: !!eventRangeStart && !!eventRangeEnd,
    staleTime: 60 * 60 * 1000,
  })
  const eventGroups: EventGroup[] = useMemo(() => {
    // 연속 날짜를 하나의 그룹으로 (PickupMonthCard groupConsecutiveEvents 동일 로직)
    const rows = (calEventRows as Array<{ date: string; event: string }>)
      .filter(r => r.event && extractParenText(r.event))
      .sort((a, b) => a.date.localeCompare(b.date))
    const groups: EventGroup[] = []
    let cur: EventGroup | null = null
    for (const row of rows) {
      const paren = extractParenText(row.event)!   // 뱃지 표시 이름 = 괄호 안 텍스트
      if (!cur) {
        cur = { name: paren, startDate: row.date, endDate: row.date, dates: [row.date], isPast: false }
      } else {
        const diff = (new Date(row.date).getTime() - new Date(cur.endDate).getTime()) / 86400000
        if (diff <= 1) { cur.endDate = row.date; cur.dates.push(row.date) }
        else { groups.push(cur); cur = { name: paren, startDate: row.date, endDate: row.date, dates: [row.date], isPast: false } }
      }
    }
    if (cur) groups.push(cur)
    return groups.map(g => ({ ...g, isPast: otbDate ? g.dates.every(d => d < otbDate) : false }))
  }, [calEventRows, otbDate])

  // otbDate 변경 시 페이지 초기화
  useEffect(() => {
    setPage(0)
  }, [otbDate])

  // 이전 버튼 표시 전환 시 타이틀 잠깐 흐려지며 밀림 (B타입)
  const isPrevDisabled = page === 0
  useEffect(() => {
    setTitleShifting(true)
    const timer = setTimeout(() => setTitleShifting(false), 350)
    return () => clearTimeout(timer)
  }, [isPrevDisabled])

  return (
    <div className="animate-fade-in">

      {/* ── Header ── */}
      <div className="mb-6">
        {/* 1행: 타이틀 + 픽업요약 (로딩중이면 빈칸) */}
        <div className="flex items-center justify-between mb-1" style={{ gap: 12 }}>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                background: 'none',
                border: 'none',
                cursor: page === 0 ? 'default' : 'pointer',
                borderRadius: 6,
                overflow: 'hidden',
                maxWidth: isPrevDisabled ? 0 : 60,
                opacity: isPrevDisabled ? 0 : 1,
                transform: `translateX(${isPrevDisabled ? -10 : 0}px)`,
                padding: isPrevDisabled ? '4px 0' : '4px 8px',
                pointerEvents: isPrevDisabled ? 'none' : 'auto',
                transition: [
                  'max-width 0.35s ease',
                  'opacity 0.25s ease',
                  'transform 0.35s ease',
                  'padding 0.35s ease',
                ].join(', '),
              }}
              onMouseEnter={e => {
                if (page !== 0) e.currentTarget.style.background = 'rgba(0,229,160,0.1)'
              }}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span className="arr-char" style={{
                fontSize: 20,
                lineHeight: 1,
                transition: 'color 0.15s',
                color: page === 0 ? 'rgba(255,255,255,0.1)' : '#00E5A0',
              }}>‹</span>
              <span className="arr-hint" style={{
                fontSize: 9,
                letterSpacing: '0.03em',
                transition: 'color 0.15s',
                whiteSpace: 'nowrap',
                color: page === 0 ? 'rgba(255,255,255,0.08)' : '#00E5A0',
              }}>이전</span>
            </button>
            <h1 className="font-semibold" style={{ color: 'var(--color-text-primary)', margin: 0, fontSize: 32, letterSpacing: '0.04em', transition: 'opacity 0.2s ease, transform 0.35s ease', opacity: titleShifting ? 0.5 : 1, transform: titleShifting ? 'translateX(4px)' : 'translateX(0)' }}>
              대시보드_
            </h1>
            <span className="font-semibold" style={{ color: '#00E5A0', fontSize: 32, letterSpacing: '0.04em', transition: 'opacity 0.2s ease, transform 0.35s ease', opacity: titleShifting ? 0.5 : 1, transform: titleShifting ? 'translateX(4px)' : 'translateX(0)' }}>
              {visibleMonths[0]?.month}월~{visibleMonths[visibleMonths.length - 1]?.month}월
              <span style={{ fontSize: '0.7em', marginLeft: 2 }}>{String(visibleMonths[0]?.year ?? '').slice(2)}년</span>
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                background: 'none',
                border: 'none',
                cursor: page === totalPages - 1 ? 'default' : 'pointer',
                padding: '4px 10px',
                borderRadius: 6,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => {
                if (page !== totalPages - 1) e.currentTarget.style.background = 'rgba(0,229,160,0.1)'
              }}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span className="arr-char" style={{
                fontSize: 20,
                lineHeight: 1,
                transition: 'color 0.15s',
                color: page === totalPages - 1 ? 'rgba(255,255,255,0.1)' : '#00E5A0',
              }}>›</span>
              <span className="arr-hint" style={{
                fontSize: 9,
                letterSpacing: '0.03em',
                transition: 'color 0.15s',
                whiteSpace: 'nowrap',
                color: page === totalPages - 1 ? 'rgba(255,255,255,0.08)' : '#00E5A0',
              }}>다음</span>
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 월별 현황 (아이콘 전용) */}
          <div style={{ position: 'relative', display: 'inline-flex' }}
            onMouseEnter={e => { const tip = e.currentTarget.querySelector('.btn-tip') as HTMLElement | null; if (tip) tip.style.opacity = '1' }}
            onMouseLeave={e => { const tip = e.currentTarget.querySelector('.btn-tip') as HTMLElement | null; if (tip) tip.style.opacity = '0' }}
          >
            <button
              onClick={() => setActualBudgetModal(true)}
              title="월별 현황"
              style={{
                width: 34, height: 34, borderRadius: 7,
                border: 'none',
                background: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#00E5A0',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(0,229,160,0.08)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'none'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="12" width="4" height="9"/><rect x="10" y="8" width="4" height="13"/><rect x="17" y="4" width="4" height="17"/>
              </svg>
            </button>
            <span className="btn-tip" style={{
              position: 'absolute', right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)', zIndex: 99999,
              background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.7)', fontSize: 10, padding: '3px 8px',
              borderRadius: 4, whiteSpace: 'nowrap', pointerEvents: 'none',
              opacity: 0, transition: 'opacity 0.15s',
            }}>월별 현황</span>
          </div>
          {/* 데일리 리포트 (아이콘 전용) */}
          <div style={{ position: 'relative', display: 'inline-flex' }}
            onMouseEnter={e => { const tip = e.currentTarget.querySelector('.btn-tip') as HTMLElement | null; if (tip) tip.style.opacity = '1' }}
            onMouseLeave={e => { const tip = e.currentTarget.querySelector('.btn-tip') as HTMLElement | null; if (tip) tip.style.opacity = '0' }}
          >
            <button
              onClick={() => setGmReportOpen(true)}
              title="데일리 리포트"
              style={{
                width: 34, height: 34, borderRadius: 7,
                border: 'none',
                background: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#00E5A0',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(0,229,160,0.08)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'none'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </button>
            <span className="btn-tip" style={{
              position: 'absolute', right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)', zIndex: 99999,
              background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.7)', fontSize: 10, padding: '3px 8px',
              borderRadius: 4, whiteSpace: 'nowrap', pointerEvents: 'none',
              opacity: 0, transition: 'opacity 0.15s',
            }}>데일리 리포트</span>
          </div>
          {/* 마감 보고서 (아이콘 전용) */}
          <div style={{ position: 'relative', display: 'inline-flex' }}
            onMouseEnter={e => { const tip = e.currentTarget.querySelector('.btn-tip') as HTMLElement | null; if (tip) tip.style.opacity = '1' }}
            onMouseLeave={e => { const tip = e.currentTarget.querySelector('.btn-tip') as HTMLElement | null; if (tip) tip.style.opacity = '0' }}
          >
            <button
              onClick={() => setClosingReportOpen(true)}
              title="마감 보고서"
              style={{
                width: 34, height: 34, borderRadius: 7,
                border: 'none',
                background: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#00E5A0',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(0,229,160,0.08)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'none'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
              </svg>
            </button>
            <span className="btn-tip" style={{
              position: 'absolute', right: 'calc(100% + 6px)', top: '50%', transform: 'translateY(-50%)', zIndex: 99999,
              background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.7)', fontSize: 10, padding: '3px 8px',
              borderRadius: 4, whiteSpace: 'nowrap', pointerEvents: 'none',
              opacity: 0, transition: 'opacity 0.15s',
            }}>마감 보고서</span>
          </div>
            </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              {!pickupLoading && (
                <button
                  onClick={() => setMonthlyPickupSegOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 13,
                    background: 'none',
                    border: 'none',
                    borderRadius: 20,
                    padding: '8px 16px 8px 13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    width: 9, height: 9, borderRadius: '50%',
                    background: '#00E5A0', flexShrink: 0,
                    boxShadow: '0 0 0 2px rgba(0,229,160,0.2)',
                  }} />
                  <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    {(() => { const [, mm, dd] = otbDate.split('-'); return `${Number(mm)}/${Number(dd)}` })()}{' '}
                    {pickupDays > 0 ? `${pickupDays}일` : '당일'} 픽업 ·{' '}
                    {(() => { const { num, unit } = formatPuParts(totalPuNights, 'nights'); return `${num}${unit}` })()}{' '}
                    {(() => { const { num, unit } = formatPuParts(totalPuRevenue, 'currency'); return `${num}${unit === 'M' ? '백만' : unit}` })()}
                  </span>
                  <span style={{
                    fontSize: 14, fontWeight: 500,
                    color: 'rgba(0,229,160,0.6)',
                    display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
                  }}>
                    상세 ›
                  </span>
                </button>
              )}
              <div style={{ width: '0.5px', height: 16, background: 'rgba(255,255,255,0.15)' }} />
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 14,
                color: '#00E5A0',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
              }}>
                  [ 단위 : % · 실 · 천원 · 백만원 ]
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Month cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleMonths.map(m => (
          <MonthCard
            key={`${m.year}-${m.month}`}
            data={{ ...m, forecast: forecastByMonth[m.month], budget: budgetByMonth[m.month] }}
            stats={getMonthStats(m.year, m.month)}
            loading={pickupLoading}
            roomCount={roomCount}
            yoyStats={getMonthLyStats(m.year, m.month)}
            yoyLoading={lyLoading}
            onSegClick={(y, mo) => setSegModal({ open: true, year: y, month: mo })}
            onAccountClick={(y, mo) => setAccountModal({ open: true, year: y, month: mo })}
            onLyClick={(year, month) => {
              const monthKey = `${year}-${String(month).padStart(2, '0')}`
              setLyComparisonSegModal({ open: true, monthKey })
            }}
            onAchievementClick={(year, month) => {
              const monthKey = `${year}-${String(month).padStart(2, '0')}`
              setForecastBudgetModal({ open: true, monthKey })
            }}
            pickupNights={getMonthPickup(m.year, m.month)}
            lyMode={lyMode}
            onLyModeToggle={() => setLyMode(prev => prev === 'v1' ? 'v2' : 'v1')}
            events={eventGroups.filter(g => { const [gy, gm] = g.startDate.split('-').map(Number); return gy === m.year && gm === m.month })}
            pickupRows={pickupData.filter(r => { const d = new Date(r.business_date); return d.getFullYear() === m.year && d.getMonth() + 1 === m.month })}
          />
        ))}
      </div>

      <ForecastBudgetModal
        open={forecastBudgetModal.open}
        onClose={() => setForecastBudgetModal({ open: false })}
        roomCount={roomCount}
        year={cardYear}
        initialMonthKey={forecastBudgetModal.monthKey}
      />

      <ActualBudgetModal
        open={actualBudgetModal}
        onClose={() => setActualBudgetModal(false)}
        hotelId={hotelId}
        roomCount={roomCount}
      />

      <LyComparisonSegModal
        open={lyComparisonSegModal.open}
        onClose={() => setLyComparisonSegModal({ open: false })}
        roomCount={roomCount}
        initialMonthKey={lyComparisonSegModal.monthKey}
        onAccountDrillDown={(segCodes, monthKey, label) => {
          setLyComparisonSegModal({ open: false })
          setLyComparisonAccountModal({ open: true, monthKey, filterSegCodes: segCodes, filterLabel: label })
        }}
      />
      <LyComparisonAccountModal
        open={lyComparisonAccountModal.open}
        onClose={() => setLyComparisonAccountModal({ open: false })}
        roomCount={roomCount}
        initialMonthKey={lyComparisonAccountModal.monthKey}
        initialFilterSegCodes={lyComparisonAccountModal.filterSegCodes}
        initialFilterLabel={lyComparisonAccountModal.filterLabel}
        onBackToSeg={
          lyComparisonAccountModal.filterSegCodes
            ? (monthKey) => {
                setLyComparisonAccountModal({ open: false })
                setLyComparisonSegModal({ open: true, monthKey })
              }
            : undefined
        }
      />

      {/* 픽업 추이 모달 — 토글(pickupViewMode)에 따라 월별/합계 전환 */}
      <MonthlyPickupSegModal
        open={monthlyPickupSegOpen && pickupViewMode === 'monthly'}
        onClose={() => setMonthlyPickupSegOpen(false)}
        roomCount={roomCount}
        onSwitchToTotal={() => setPickupViewMode('total')}
        onPickupCellClick={(segCodes, monthKey, label) => {
          setMonthlyPickupSegOpen(false)
          setMonthlyPickupAccountModal({
            open: true,
            filterSegCodes:  segCodes,
            filterMonthKey:  monthKey ?? undefined,
            filterLabel:     label,
            initialViewMode: monthKey === null ? 'total' : 'monthly',
          })
        }}
      />
      <MonthlyPickupSegTotalModal
        open={monthlyPickupSegOpen && pickupViewMode === 'total'}
        onClose={() => setMonthlyPickupSegOpen(false)}
        roomCount={roomCount}
        onSwitchToMonthly={() => setPickupViewMode('monthly')}
        onPickupCellClick={(segCodes, monthKey, label) => {
          setMonthlyPickupSegOpen(false)
          setMonthlyPickupAccountModal({
            open: true,
            filterSegCodes:  segCodes,
            filterMonthKey:  monthKey ?? undefined,
            filterLabel:     label,
            initialViewMode: monthKey === null ? 'total' : 'monthly',
          })
        }}
      />
      <MonthlyPickupAccountModal
        open={monthlyPickupAccountModal.open && pickupViewMode === 'monthly'}
        onClose={() => setMonthlyPickupAccountModal({ open: false })}
        roomCount={roomCount}
        initialFilterSegCodes={monthlyPickupAccountModal.filterSegCodes}
        initialFilterMonthKey={monthlyPickupAccountModal.filterMonthKey}
        initialFilterLabel={monthlyPickupAccountModal.filterLabel}
        initialViewMode={monthlyPickupAccountModal.initialViewMode}
        onSwitchToTotal={() => setPickupViewMode('total')}
        onBackToSeg={() => {
          setMonthlyPickupAccountModal({ open: false })
          setMonthlyPickupSegOpen(true)
        }}
      />
      <MonthlyPickupAccountTotalModal
        open={monthlyPickupAccountModal.open && pickupViewMode === 'total'}
        onClose={() => setMonthlyPickupAccountModal({ open: false })}
        roomCount={roomCount}
        initialFilterSegCodes={monthlyPickupAccountModal.filterSegCodes}
        initialFilterLabel={monthlyPickupAccountModal.filterLabel}
        onSwitchToMonthly={() => setPickupViewMode('monthly')}
        onBackToSeg={() => {
          setMonthlyPickupAccountModal({ open: false })
          setMonthlyPickupSegOpen(true)
        }}
      />

      <SegmentationModal
        open={segModal.open}
        onClose={() => setSegModal({ open: false })}
        year={segModal.year ?? 0}
        month={segModal.month ?? 0}
        roomCount={roomCount}
        onPickupCellClick={(segCodes, label, clickedYear, clickedMonth) => {
          setSegModal({ open: false })
          setAccountModal({ open: true, year: clickedYear, month: clickedMonth, filterSegCodes: segCodes, filterLabel: label })
        }}
      />
      <AccountModal
        open={accountModal.open}
        onClose={() => setAccountModal({ open: false })}
        year={accountModal.year ?? 0}
        month={accountModal.month ?? 0}
        roomCount={roomCount}
        initialFilterSegCodes={accountModal.filterSegCodes}
        initialFilterLabel={accountModal.filterLabel}
        onBackToSeg={
          accountModal.filterSegCodes
            ? (backYear, backMonth) => {
                setAccountModal({ open: false })
                setSegModal({ open: true, year: backYear, month: backMonth })
              }
            : undefined
        }
      />

      <GMDailyReportModal
        open={gmReportOpen}
        onClose={() => setGmReportOpen(false)}
        hotelId={hotelId}
        otbDate={otbDate}
        otbDates={otbDates ?? []}
        lyData={lyData}
        lyLoading={lyLoading}
        forecastRows={forecastRows}
        budgetRows={budgetRows}
      />

      <MonthlyClosingReportModal
        open={closingReportOpen}
        onClose={() => setClosingReportOpen(false)}
        hotelId={hotelId}
        roomCount={roomCount}
        otbDate={otbDate}
      />
    </div>
  )
}
