'use client'

import { useState, useEffect } from 'react'
import { ArrowUp, ArrowDown, AlignJustify, User, ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usePickupData } from '@/hooks/usePickupData'
import { useOtbData } from '@/hooks/useOtbData'
import { useLyPacing } from '@/hooks/useLyPacing'
import SegmentationModal          from '@/components/dashboard/SegmentationModal'
import AccountModal               from '@/components/dashboard/AccountModal'
import MonthlyPickupSegModal      from '@/components/dashboard/MonthlyPickupSegModal'
import MonthlyPickupAccountModal  from '@/components/dashboard/MonthlyPickupAccountModal'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { supabase } from '@/lib/supabase'

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
  forecast: { occ: number; adr: number; adrUnit: string; rev: number; revUnit: string }
  goal: { pct: number; target: number; targetUnit: string; otb: number; fc: number }
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
    forecast: { occ: 63.3, adr: 125, adrUnit: 'k', rev: 171,   revUnit: 'M' },
    goal: { pct: 71, target: 197, targetUnit: 'M', otb: 60, fc: 63 },
    pu: 6, rmAction: null,
  },
  {
    year: 2025, month: 5,
    occ: { current: 34.3, unit: '%', yoy: -3.4, yoyUnit: '%', fit:  27, grp: -57 },
    adr: { current: 152,  unit: 'k', yoy:  3,   yoyUnit: 'k', fit:  -6, grp:  -6 },
    rev: { current: 116.7,unit: 'M', yoy: -9.6, yoyUnit: 'M', fit:  20, grp: -59 },
    forecast: { occ: 61.6, adr: 132, adrUnit: 'k', rev: 181.7, revUnit: 'M' },
    goal: { pct: 80, target: 272, targetUnit: 'M', otb: 34, fc: 62 },
    pu: 3, rmAction: null,
  },
  {
    year: 2025, month: 6,
    occ: { current: 18.8, unit: '%', yoy:  8.7, yoyUnit: '%', fit:  96, grp:  77 },
    adr: { current: 119,  unit: 'k', yoy: -15,  yoyUnit: 'k', fit:  -1, grp: -23 },
    rev: { current: 48.5, unit: 'M', yoy:  19.0,yoyUnit: 'M', fit:  94, grp:  37 },
    forecast: { occ: 60.3, adr: 118, adrUnit: 'k', rev: 153.2, revUnit: 'M' },
    goal: { pct: 88, target: 227, targetUnit: 'M', otb: 19, fc: 60 },
    pu: 7, rmAction: null,
  },
  {
    year: 2025, month: 7,
    occ: { current: 12.1, unit: '%', yoy:  15.3,yoyUnit: '%', fit:  42, grp: -12 },
    adr: { current: 145,  unit: 'k', yoy:  8,   yoyUnit: 'k', fit:   5, grp: -15 },
    rev: { current: 31.2, unit: 'M', yoy:  24.5,yoyUnit: 'M', fit:  38, grp: -18 },
    forecast: { occ: 72.1, adr: 148, adrUnit: 'k', rev: 189.3, revUnit: 'M' },
    goal: { pct: 43, target: 312, targetUnit: 'M', otb: 12, fc: 72 },
    pu: 12, rmAction: '성수기 요금 전략을 검토하세요.',
  },
  {
    year: 2025, month: 8,
    occ: { current: 8.4,  unit: '%', yoy:  22.1,yoyUnit: '%', fit:  67, grp:  31 },
    adr: { current: 168,  unit: 'k', yoy:  12,  yoyUnit: 'k', fit:   8, grp:  -7 },
    rev: { current: 22.8, unit: 'M', yoy:  31.2,yoyUnit: 'M', fit:  71, grp:  -9 },
    forecast: { occ: 78.5, adr: 172, adrUnit: 'k', rev: 241.6, revUnit: 'M' },
    goal: { pct: 31, target: 398, targetUnit: 'M', otb: 8,  fc: 79 },
    pu: 18, rmAction: null,
  },
  {
    year: 2025, month: 9,
    occ: { current: 4.2,  unit: '%', yoy:  -2.8,yoyUnit: '%', fit:  15, grp: -44 },
    adr: { current: 135,  unit: 'k', yoy:  -5,  yoyUnit: 'k', fit:  -3, grp: -18 },
    rev: { current: 8.9,  unit: 'M', yoy:  -4.1,yoyUnit: 'M', fit:  22, grp: -51 },
    forecast: { occ: 65.8, adr: 142, adrUnit: 'k', rev: 177.4, revUnit: 'M' },
    goal: { pct: 18, target: 356, targetUnit: 'M', otb: 4,  fc: 66 },
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

// ─── Sub-components ─────────────────────────────────────────────────────────────

function ChangeTag({ value, unit }: { value: number; unit: string }) {
  const pos = value >= 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[12px] font-semibold leading-none ${
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
}

function SubMetric({ label, value }: { label: string; value: number }) {
  const pos = value >= 0
  return (
    <span className="text-[11px] whitespace-nowrap">
      <span className="text-brand-dimmed">{label} </span>
      <span className={pos ? 'text-status-positive' : 'text-status-negative'}>
        {pos ? '▲' : '▼'}{Math.abs(value)}%
      </span>
    </span>
  )
}

function MetricRow({ label, value, metric, subValue, tooltip, yoyOverride, yoyLoading }: {
  label:       string
  value:       string
  metric:      MetricData
  subValue?:   string
  tooltip?:    string
  yoyOverride?: { value: number | null; unit: string; fitPct?: number | null; grpPct?: number | null; showFitGrp?: boolean }
  yoyLoading?: boolean
}) {
  return (
    <div
      className="flex items-center justify-between py-3 last:border-0"
      style={{ borderBottom: '1px solid var(--divider-color)' }}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold text-brand-dimmed tracking-widest w-8 shrink-0">
          {label}
        </span>
        <div className="flex flex-col" title={tooltip}>
          <span
            className="font-mono font-bold leading-none"
            style={{ fontSize: 26, color: 'var(--color-text-primary)', cursor: tooltip ? 'help' : 'default' }}
          >
            {value}
          </span>
          {subValue && (
            <span className="text-[10px] text-brand-dimmed mt-0.5">{subValue}</span>
          )}
        </div>
      </div>
      <div className="text-right space-y-1 shrink-0 ml-2">
        <p className="text-[10px] text-brand-dimmed">동기간대비</p>
        {yoyLoading ? (
          <span className="text-[11px] text-brand-dimmed">-</span>
        ) : yoyOverride ? (
          <>
            {yoyOverride.value !== null
              ? <ChangeTag value={yoyOverride.value} unit={yoyOverride.unit} />
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
            <ChangeTag value={metric.yoy} unit={metric.yoyUnit} />
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

function MonthCard({ data, stats, loading, roomCount, yoyStats, yoyLoading, onSegClick, onAccountClick, pickupNights }: {
  data:             MonthData
  stats:            MonthStats
  loading:          boolean
  roomCount:        number
  yoyStats:         MonthYoyStats
  yoyLoading:       boolean
  onSegClick?:      (year: number, month: number) => void
  onAccountClick?:  (year: number, month: number) => void
  pickupNights:     number
}) {
  const { year, month, occ, adr, rev, forecast, goal, pu, rmAction } = data
  // occ, adr, rev are mock data used as fallback; stats holds live OTB values

  const occValue = loading ? '-' : roomCount === 0 ? '-' : `${stats.occ.toFixed(1)}%`
  const adrValue = loading ? '-' : formatCurrency(stats.adr)
  const revValue = loading ? '-' : formatCurrency(stats.rev)

  const fitPct = yoyStats.byGroup.find(g => g.group === 'fit')?.varPct ?? null
  const grpPct = yoyStats.byGroup.find(g => g.group === 'group')?.varPct ?? null

  const otbBarPct  = Math.min((goal.otb / goal.pct) * 100, 100)
  const fcBarExtra = Math.max(0, Math.min(((goal.fc - goal.otb) / goal.pct) * 100, 100 - otbBarPct))

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
        <div className="relative flex items-end gap-1.5">
          <span className="font-bold leading-none" style={{ fontSize: 54, color: 'var(--color-text-primary)' }}>
            {month}
          </span>
          <span className="text-lg font-medium text-brand-muted mb-1.5">월</span>
          <span className="text-xs font-medium text-brand-dimmed mb-2 ml-0.5">{year}</span>
        </div>
      </div>

      {/* ── OCC / ADR / REV ── */}
      <div className="px-5 pb-1">
        <MetricRow
          label="OCC"
          value={occValue}
          metric={occ}
          subValue={loading ? undefined : `${stats.otbNights.toLocaleString('ko-KR')} nights`}
          yoyOverride={{
            value:      yoyStats.varNightsPct !== null ? Math.round(yoyStats.varNightsPct * 10) / 10 : null,
            unit:       '%',
            fitPct,
            grpPct,
            showFitGrp: true,
          }}
          yoyLoading={yoyLoading}
        />
        <MetricRow
          label="ADR"
          value={adrValue}
          metric={adr}
          tooltip={loading ? undefined : stats.adr.toLocaleString('ko-KR')}
          yoyOverride={{
            value:      Math.round(yoyStats.varAdr / 1000),
            unit:       'k',
            showFitGrp: false,
          }}
          yoyLoading={yoyLoading}
        />
        <MetricRow
          label="REV"
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
        />
      </div>


      {/* ── Forecasting ── */}
      <div
        className="mx-4 mt-2 rounded-xl p-3.5"
        style={{
          background: 'var(--forecast-bg)',
          border:     '1px solid var(--forecast-border)',
        }}
      >
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[10px] font-bold text-accent-primary tracking-[0.12em] uppercase">
            Forecasting
          </span>
          <div className="flex-1 h-px" style={{ background: 'var(--forecast-line)' }} />
        </div>
        <div className="grid grid-cols-3 gap-1 text-center">
          {[
            { label: 'OCC', value: `${forecast.occ}%` },
            { label: 'ADR', value: `${forecast.adr}${forecast.adrUnit}` },
            { label: 'REV', value: `${forecast.rev}${forecast.revUnit}` },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[9px] text-brand-muted mb-0.5 uppercase tracking-wider">{label}</p>
              <p className="font-mono text-sm font-semibold text-accent-primary">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Goal ── */}
      <div className="px-5 py-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-brand-dimmed tracking-widest uppercase">Goal</span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {goal.pct}%
            </span>
            <span className="text-[10px] text-brand-dimmed">/ 목표 {goal.target}{goal.targetUnit}</span>
          </div>
        </div>

        <div className="h-2 rounded-full bg-bg-elevated overflow-hidden">
          <div className="h-full flex">
            <div
              className="h-full rounded-l-full transition-all duration-700"
              style={{ width: `${otbBarPct}%`, background: 'var(--color-info)' }}
            />
            <div
              className="h-full transition-all duration-700"
              style={{
                width:        `${fcBarExtra}%`,
                background:   'var(--color-accent-primary)',
                borderRadius: fcBarExtra > 0 ? '0 2px 2px 0' : 0,
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[10px] text-brand-muted">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-info)' }} />
              OTB {goal.otb}%
            </span>
            <span className="flex items-center gap-1 text-[10px] text-brand-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-primary shrink-0" />
              FC {goal.fc}%
            </span>
          </div>
          <span className="text-[10px] text-brand-dimmed">목표 {goal.target}{goal.targetUnit}</span>
        </div>
      </div>

      {/* ── Action buttons ── */}
      {/* group: P/U 호버 시 보조 버튼 슬라이드인 */}
      <div className="px-4 pb-4 flex items-center group">
        {/* 메인 버튼 — 카드 전체 너비 */}
        <button
          className="flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[12px] font-bold transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
          style={{
            background: 'var(--gradient-cta)',
            boxShadow:  'var(--accent-btn-glow)',
            color:      '#0A0A0A',
          }}
        >
          {pickupNights >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          P/U {pickupNights >= 0 ? '+' : ''}{pickupNights} rooms
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
  const [page, setPage] = useState(0)
  const [segModal,     setSegModal]     = useState<{ open: boolean; year?: number; month?: number }>({ open: false })
  const [monthlyPickupSegOpen,       setMonthlyPickupSegOpen]       = useState(false)
  const [monthlyPickupAccountModal,  setMonthlyPickupAccountModal]  = useState<{
    open: boolean; filterSegCodes?: string[]; filterMonthKey?: string; filterLabel?: string
  }>({ open: false })
  const [accountModal, setAccountModal] = useState<{
    open: boolean; year?: number; month?: number
    filterSegCodes?: string[]; filterLabel?: string
  }>({ open: false })

  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  const { vsOtbDate } = useDateContext()
  const { data: pickupData, loading: pickupLoading, otbDate } = usePickupData()

  const pickupDays = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0
  const { data: otbData } = useOtbData()
  const { data: lyData, loading: lyLoading } = useLyPacing()

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

  // otbDate 변경 시 페이지 초기화
  useEffect(() => {
    setPage(0)
  }, [otbDate])

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
          대시보드
        </h1>
        {pickupLoading ? (
          <div className="h-5 w-80 rounded animate-pulse" style={{ background: 'var(--color-bg-tertiary)' }} />
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            오늘 ({otbDate}) 기준 {pickupDays > 0 ? `${pickupDays}일간` : '당일'}&nbsp;
            총&nbsp;
            <button
              onClick={() => setMonthlyPickupSegOpen(true)}
              title="월별 픽업 추이 보기"
              style={{ color: totalPuNights >= 0 ? '#00A86B' : '#E53E3E', fontWeight: 600, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
            >
              {formatPu(totalPuNights, 'nights')}실
            </button>
            ,&nbsp;ADR&nbsp;
            <button
              onClick={() => setMonthlyPickupSegOpen(true)}
              title="월별 픽업 추이 보기"
              style={{ color: totalPuAdr >= 0 ? '#00A86B' : '#E53E3E', fontWeight: 600, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
            >
              {formatPu(totalPuAdr, 'currency')}
            </button>
            ,&nbsp;REV&nbsp;
            <button
              onClick={() => setMonthlyPickupSegOpen(true)}
              title="월별 픽업 추이 보기"
              style={{ color: totalPuRevenue >= 0 ? '#00A86B' : '#E53E3E', fontWeight: 600, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
            >
              {formatPu(totalPuRevenue, 'currency')}
            </button>
            &nbsp;픽업 되었습니다.
          </p>
        )}
      </div>



      {/* ── Month range navigator ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {months[0]?.month}월 &mdash; {months[months.length - 1]?.month}월
          </span>
          <span className="text-xs text-brand-dimmed font-mono">{months[0]?.year}년</span>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className="rounded-full transition-all duration-200"
                style={{
                  width:      i === page ? 20 : 6,
                  height:     6,
                  background: i === page
                    ? 'var(--color-accent-primary)'
                    : 'var(--dot-inactive)',
                }}
                aria-label={`페이지 ${i + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            <ChevronLeft size={13} />
            이전
          </button>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            다음
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* ── Month cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleMonths.map(m => (
          <MonthCard
            key={`${m.year}-${m.month}`}
            data={m}
            stats={getMonthStats(m.year, m.month)}
            loading={pickupLoading}
            roomCount={roomCount}
            yoyStats={getMonthLyStats(m.year, m.month)}
            yoyLoading={lyLoading}
            onSegClick={(y, mo) => setSegModal({ open: true, year: y, month: mo })}
            onAccountClick={(y, mo) => setAccountModal({ open: true, year: y, month: mo })}
            pickupNights={getMonthPickup(m.year, m.month)}
          />
        ))}
      </div>

      <MonthlyPickupSegModal
        open={monthlyPickupSegOpen}
        onClose={() => setMonthlyPickupSegOpen(false)}
        roomCount={roomCount}
        onPickupCellClick={(segCodes, monthKey, label) => {
          setMonthlyPickupSegOpen(false)
          setMonthlyPickupAccountModal({ open: true, filterSegCodes: segCodes, filterMonthKey: monthKey, filterLabel: label })
        }}
      />
      <MonthlyPickupAccountModal
        open={monthlyPickupAccountModal.open}
        onClose={() => setMonthlyPickupAccountModal({ open: false })}
        roomCount={roomCount}
        initialFilterSegCodes={monthlyPickupAccountModal.filterSegCodes}
        initialFilterMonthKey={monthlyPickupAccountModal.filterMonthKey}
        initialFilterLabel={monthlyPickupAccountModal.filterLabel}
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
        onPickupCellClick={(segCodes, label) => {
          const y = segModal.year
          const m = segModal.month
          setSegModal({ open: false })
          setAccountModal({ open: true, year: y, month: m, filterSegCodes: segCodes, filterLabel: label })
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
            ? () => {
                const y = accountModal.year
                const m = accountModal.month
                setAccountModal({ open: false })
                setSegModal({ open: true, year: y, month: m })
              }
            : undefined
        }
      />
    </div>
  )
}
