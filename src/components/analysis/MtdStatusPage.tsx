'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { useLatestConfirmedBudgetDate } from '@/hooks/useLatestConfirmedBudgetDate'
import { useBudgetMonthly } from '@/hooks/useBudgetMonthly'
import MtdStatusModal from './MtdStatusModal'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface MonthStat {
  month:     number          // 1~12
  type:      'Actual' | 'OTB'
  actualRn:  number
  actualRev: number
  budgetRn:  number
  budgetRev: number
  lyRn:      number
  lyRev:     number
  budgetPct: number          // actualRev / budgetRev * 100
  lyPct:     number          // actualRev / lyRev * 100
  budgetDiff: number         // actualRev - budgetRev
  lyDiff:    number          // actualRev - lyRev
}

// ── 도넛 차트 (Chart.js, chart.js/auto — GMDailyReport 패턴) ──────────────────────
function DonutChart({ value, color, size = 80 }: { value: number; color: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!canvasRef.current) return
    const chart = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [Math.min(value, 100), Math.max(0, 100 - Math.min(value, 100))],
          backgroundColor: [color, '#1e1e1e'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: false,
        cutout: '75%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { duration: 600 },
      },
      plugins: [{
        id: 'centerText',
        afterDraw(c: any) {
          const { ctx, chartArea: { top, bottom, left, right } } = c
          const cx = (left + right) / 2, cy = (top + bottom) / 2
          ctx.save()
          ctx.font = `700 ${size * 0.18}px -apple-system, sans-serif`
          ctx.fillStyle = color
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(Math.round(value) + '%', cx, cy)
          ctx.restore()
        },
      }],
    })
    return () => chart.destroy()
  }, [value, color, size])
  return <canvas ref={canvasRef} width={size} height={size} />
}

// ── 월 카드 ──────────────────────────────────────────────────────────────────────
function MonthCard({ data, onClick }: { data: MonthStat; onClick: () => void }) {
  const isOTB = data.type === 'OTB'
  const pct = data.budgetPct
  const color = isOTB ? '#5B8DEF' : pct >= 100 ? '#00E5A0' : '#E24B4A'

  return (
    <div
      onClick={onClick}
      style={{
        background: '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: 10,
        padding: '14px 14px 12px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#3a3a3a')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#2a2a2a')}
    >
      {/* 헤더: 월 + Actual/OTB 뱃지 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#888' }}>
          {MON[data.month - 1]} <span style={{ color: '#555' }}>&apos;26</span>
        </span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 500,
          ...(isOTB
            ? { background: '#0d1a2e', color: '#5B8DEF', border: '1px solid #1e3a5a' }
            : { background: '#0d2a1f', color: '#00E5A0', border: '1px solid #0d3a28' }),
        }}>
          {isOTB ? 'OTB' : 'Actual'}
        </span>
      </div>

      {/* 도넛 차트 중앙 */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <DonutChart value={pct} color={color} size={80} />
      </div>

      {/* Budget / Last Year */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: '#555' }}>Budget</span>
          <span style={{ color: data.budgetDiff >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 500 }}>
            {data.budgetDiff >= 0 ? '+' : ''}{(data.budgetDiff / 1000000).toFixed(1)}M
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: '#555' }}>Last Year</span>
          <span style={{ color: data.lyDiff >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 500 }}>
            {data.lyDiff >= 0 ? '+' : ''}{(data.lyDiff / 1000000).toFixed(1)}M
          </span>
        </div>
      </div>
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────────────────────────
export default function MtdStatusPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''
  const { otbDate, vsOtbDate } = useDateContext()

  const currentYear = otbDate ? Number(otbDate.slice(0, 4)) : new Date().getFullYear()
  const otbMonth    = otbDate ? Number(otbDate.slice(5, 7)) : new Date().getMonth() + 1

  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null)

  const yStart = `${currentYear}-01-01`
  const yEnd   = `${currentYear}-12-31`

  // room_count
  const { data: hotelDetail } = useQuery({
    queryKey: ['mtd_m03', hotelId],
    enabled:  !!hotelId,
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('m03_hotel_details').select('room_count').eq('hotel_id', hotelId).single()
      if (error) throw error
      return data
    },
    staleTime: 10 * 60 * 1000,
  })
  const roomCount = hotelDetail?.room_count ?? 0

  // Actual (a01_actual_daily) — 연간
  const { data: actualRows = [] } = useQuery({
    queryKey: ['mtd_actual', hotelId, currentYear],
    enabled:  !!hotelId,
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily')
        .select('business_date, nights, room_revenue')
        .eq('hotel_id', hotelId)
        .gte('business_date', yStart).lte('business_date', yEnd)
      if (error) { console.error('[MTD] actual error:', error); return [] }
      return (data ?? []) as { business_date: string; nights: number; room_revenue: number }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  // OTB (get_pickup_data) — 당월 이후 월
  const { data: otbRows = [] } = useQuery({
    queryKey: ['mtd_otb', hotelId, otbDate, vsOtbDate],
    enabled:  !!hotelId && !!otbDate,
    queryFn:  async () => {
      const { data, error } = await (supabase as any).rpc('get_pickup_data', {
        p_hotel_id:    hotelId,
        p_otb_date:    otbDate,
        p_vs_otb_date: vsOtbDate || otbDate,
        p_min_date:    yStart,
      })
      if (error) { console.error('[MTD] otb error:', error); return [] }
      return (data ?? []) as { business_date: string; otb_nights: number; otb_revenue: number }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  // c06_calendar (yoy_match) — 연간
  const { data: calRows = [] } = useQuery({
    queryKey: ['mtd_cal', currentYear],
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('c06_calendar').select('date, yoy_match')
        .gte('date', yStart).lte('date', yEnd)
      if (error) { console.error('[MTD] cal error:', error); return [] }
      return (data ?? []) as { date: string; yoy_match: string | null }[]
    },
    staleTime: 60 * 60 * 1000,
  })

  // LY 날짜 목록 + 역매핑(전년 날짜 → 올해 월)
  const { lyDates, yoyToMonth } = useMemo(() => {
    const dates: string[] = []
    const map: Record<string, number> = {}
    for (const r of calRows) {
      const ly = r.yoy_match ?? `${currentYear - 1}${r.date.slice(4)}`
      dates.push(ly)
      map[ly] = new Date(r.date).getMonth() + 1
    }
    return { lyDates: dates, yoyToMonth: map }
  }, [calRows, currentYear])

  // LY 실적 (a01_actual_daily, yoy_match 날짜)
  const { data: lyRows = [] } = useQuery({
    queryKey: ['mtd_ly', hotelId, currentYear, lyDates.length],
    enabled:  !!hotelId && lyDates.length > 0,
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily')
        .select('business_date, nights, room_revenue')
        .eq('hotel_id', hotelId)
        .in('business_date', lyDates)
      if (error) { console.error('[MTD] ly error:', error); return [] }
      return (data ?? []) as { business_date: string; nights: number; room_revenue: number }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  // Budget (get_budget_monthly, 최신 확정본)
  const { data: budgetDate = null } = useLatestConfirmedBudgetDate(hotelId || undefined)
  const { data: budgetRows = [] } = useBudgetMonthly({
    hotelId:    hotelId || undefined,
    year:       currentYear,
    updateDate: budgetDate,
  })

  // ── 월별 집계 ──────────────────────────────────────────────────────────────────
  const monthData = useMemo<MonthStat[]>(() => {
    const actualRn: Record<number, number> = {}, actualRev: Record<number, number> = {}
    for (const r of actualRows) {
      const m = new Date(r.business_date).getMonth() + 1
      actualRn[m]  = (actualRn[m]  ?? 0) + (r.nights ?? 0)
      actualRev[m] = (actualRev[m] ?? 0) + (r.room_revenue ?? 0)
    }
    const otbRn: Record<number, number> = {}, otbRev: Record<number, number> = {}
    for (const r of otbRows) {
      const m = new Date(r.business_date).getMonth() + 1
      if (m < otbMonth) continue
      otbRn[m]  = (otbRn[m]  ?? 0) + (r.otb_nights ?? 0)
      otbRev[m] = (otbRev[m] ?? 0) + (r.otb_revenue ?? 0)
    }
    const budRn: Record<number, number> = {}, budRev: Record<number, number> = {}
    for (const r of budgetRows) {
      budRn[r.month_num]  = (budRn[r.month_num]  ?? 0) + (r.budget_nights ?? 0)
      budRev[r.month_num] = (budRev[r.month_num] ?? 0) + (r.budget_revenue ?? 0)
    }
    const lyRn: Record<number, number> = {}, lyRev: Record<number, number> = {}
    for (const r of lyRows) {
      const m = yoyToMonth[r.business_date]
      if (!m) continue
      lyRn[m]  = (lyRn[m]  ?? 0) + (r.nights ?? 0)
      lyRev[m] = (lyRev[m] ?? 0) + (r.room_revenue ?? 0)
    }

    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1
      const type: 'Actual' | 'OTB' = month < otbMonth ? 'Actual' : 'OTB'
      const aRn  = type === 'Actual' ? (actualRn[month]  ?? 0) : (otbRn[month]  ?? 0)
      const aRev = type === 'Actual' ? (actualRev[month] ?? 0) : (otbRev[month] ?? 0)
      const bRn  = budRn[month]  ?? 0, bRev = budRev[month] ?? 0
      const lRn  = lyRn[month]   ?? 0, lRev = lyRev[month]  ?? 0
      return {
        month, type,
        actualRn: aRn, actualRev: aRev,
        budgetRn: bRn, budgetRev: bRev,
        lyRn: lRn, lyRev: lRev,
        budgetPct: bRev > 0 ? (aRev / bRev) * 100 : 0,
        lyPct:     lRev > 0 ? (aRev / lRev) * 100 : 0,
        budgetDiff: aRev - bRev,
        lyDiff:     aRev - lRev,
      }
    })
  }, [actualRows, otbRows, budgetRows, lyRows, yoyToMonth, otbMonth])

  // ── YTD (Actual 월만: month < otbMonth) ─────────────────────────────────────────
  const ytd = useMemo(() => {
    let actual = 0, budget = 0, ly = 0
    for (const m of monthData) {
      if (m.month >= otbMonth) continue
      actual += m.actualRev; budget += m.budgetRev; ly += m.lyRev
    }
    return {
      actual, budget, ly,
      budgetDiff: actual - budget,
      lyDiff:     actual - ly,
      budgetPct:  budget > 0 ? (actual / budget) * 100 : 0,
      lyPct:      ly > 0 ? (actual / ly) * 100 : 0,
    }
  }, [monthData, otbMonth])

  const selectedStat = selectedMonth ? monthData.find(m => m.month === selectedMonth.month) ?? null : null

  return (
    <div style={{ minHeight: '100%', background: '#0a0a0a', color: '#fff' }}>
      <div style={{ fontSize: 22, fontWeight: 500, marginBottom: 20 }}>MTD Status</div>

      {/* YTD 상단 카드 2개 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {/* 좌: YTD Budget Achievement */}
        <div style={{ flex: 1, background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24, display: 'flex', alignItems: 'center', gap: 24 }}>
          <DonutChart value={ytd.budgetPct} color={ytd.budgetPct >= 100 ? '#00E5A0' : '#E24B4A'} size={90} />
          <div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>YTD Budget Achievement</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: ytd.budgetDiff >= 0 ? '#00E5A0' : '#E24B4A' }}>
              {ytd.budgetDiff >= 0 ? '+' : ''}{(ytd.budgetDiff / 1000000).toFixed(1)}M
            </div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>vs budget</div>
            <div style={{ fontSize: 11, color: '#444', marginTop: 6 }}>
              Actual {(ytd.actual / 1000000).toFixed(1)}M / Budget {(ytd.budget / 1000000).toFixed(1)}M
            </div>
          </div>
        </div>

        {/* 우: YTD Growth vs LY */}
        <div style={{ flex: 1, background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24, display: 'flex', alignItems: 'center', gap: 24 }}>
          <DonutChart value={ytd.lyPct} color={ytd.lyPct >= 100 ? '#00E5A0' : '#E24B4A'} size={90} />
          <div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>YTD Growth vs LY</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: ytd.lyDiff >= 0 ? '#00E5A0' : '#E24B4A' }}>
              {ytd.lyDiff >= 0 ? '+' : ''}{(ytd.lyDiff / 1000000).toFixed(1)}M
            </div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>vs LY</div>
            <div style={{ fontSize: 11, color: '#444', marginTop: 6 }}>
              Actual {(ytd.actual / 1000000).toFixed(1)}M / LY {(ytd.ly / 1000000).toFixed(1)}M
            </div>
          </div>
        </div>
      </div>

      {/* 연도 레이블 */}
      <div style={{ fontSize: 13, color: '#555', margin: '16px 0 8px' }}>{currentYear}</div>

      {/* 12개월 카드 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        {monthData.map(m => (
          <MonthCard key={m.month} data={m} onClick={() => setSelectedMonth({ year: currentYear, month: m.month })} />
        ))}
      </div>

      {/* 상세 모달 */}
      {selectedMonth && selectedStat && (
        <MtdStatusModal
          year={selectedMonth.year}
          month={selectedMonth.month}
          stat={selectedStat}
          roomCount={roomCount}
          onClose={() => setSelectedMonth(null)}
          onMonthChange={(m) => setSelectedMonth({ year: currentYear, month: m })}
        />
      )}
    </div>
  )
}
