'use client'
import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useDateContext } from '@/contexts/DateContext'

interface Props {
  open:      boolean
  onClose:   () => void
  hotelId:   string
  roomCount: number
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad2 = (n: number) => String(n).padStart(2, '0')
const fmtM = (v: number) => `${(v / 1_000_000).toFixed(1)}M`
const fmtSignedM = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v / 1_000_000).toFixed(1)}M`

// ── 원형 게이지 (SVG) ──────────────────────────────────────────────────────────
function Gauge({ pct, color, size = 56, stroke = 5, big = false }: { pct: number | null; color: string; size?: number; stroke?: number; big?: boolean }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = pct == null ? 0 : Math.max(0, Math.min(pct, 100))
  const offset = c * (1 - p / 100)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: big ? 16 : 12, fontWeight: 600, color }}>
        {pct == null ? '—' : `${Math.round(pct)}%`}
      </div>
    </div>
  )
}

export default function ActualBudgetModal({ open, onClose, hotelId, roomCount: _roomCount }: Props) {
  const { otbDate, vsOtbDate, otbDates } = useDateContext()
  const baseYear = otbDate ? new Date(otbDate + 'T00:00:00').getFullYear() : new Date().getFullYear()
  const curYM    = otbDate ? otbDate.slice(0, 7) : ''   // 'YYYY-MM' (현재월 경계)
  const minOtbDate = otbDates?.[otbDates.length - 1] ?? ''

  // ESC + scroll lock
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // 표시 월: baseYear 1~12 (12) + baseYear+1 1~6 (6) = 18
  const months = useMemo(() => {
    const arr: { year: number; month: number }[] = []
    for (let m = 1; m <= 12; m++) arr.push({ year: baseYear, month: m })
    for (let m = 1; m <= 6;  m++) arr.push({ year: baseYear + 1, month: m })
    return arr
  }, [baseYear])

  // ── Budget (a04_budget_mtd, 최신 confirmed update_date 기준) ──────────────────
  const { data: budgetRows = [], isLoading: bLoad } = useQuery({
    queryKey: ['ab_budget_mtd', hotelId, baseYear],
    enabled: open && !!hotelId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // 1) 최신 confirmed=true update_date
      const { data: dateRow } = await (supabase as any)
        .from('a04_budget_mtd')
        .select('update_date')
        .eq('hotel_id', hotelId)
        .eq('confirmed', true)
        .order('update_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!dateRow) return []
      // 2) 해당 update_date의 전체 데이터
      const { data, error } = await (supabase as any)
        .from('a04_budget_mtd')
        .select('year, month, segmentation, budget_nights, budget_revenue')
        .eq('hotel_id', hotelId)
        .eq('update_date', dateRow.update_date)
        .eq('confirmed', true)
        .gte('year', baseYear)
        .lte('year', baseYear + 1)
      if (error) throw error
      return (data ?? []) as { year: number; month: number; budget_revenue: number }[]
    },
  })
  const budgetMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of budgetRows) {
      const k = `${r.year}-${pad2(r.month)}`
      m[k] = (m[k] ?? 0) + (r.budget_revenue ?? 0)
    }
    return m
  }, [budgetRows])

  // ── Actual + LY (a01_actual_daily, room_revenue) ────────────────────────────
  const { data: actualRows = [], isLoading: aLoad } = useQuery({
    queryKey: ['ab_actual', hotelId, baseYear],
    enabled: open && !!hotelId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily')
        .select('business_date, room_revenue')
        .eq('hotel_id', hotelId)
        .gte('business_date', `${baseYear - 1}-01-01`)
        .lte('business_date', `${baseYear + 1}-06-30`)
      if (error) throw error
      return (data ?? []) as { business_date: string; room_revenue: number }[]
    },
  })
  const actualMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of actualRows) {
      const ym = r.business_date.slice(0, 7)
      m[ym] = (m[ym] ?? 0) + (r.room_revenue ?? 0)
    }
    return m
  }, [actualRows])

  // ── 미래월 OTB (get_pickup_data, otb_revenue) ────────────────────────────────
  const { data: otbRows = [], isLoading: oLoad } = useQuery({
    queryKey: ['ab_otb', hotelId, otbDate, vsOtbDate, minOtbDate],
    enabled: open && !!hotelId && !!otbDate && !!minOtbDate,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_pickup_data', {
        p_hotel_id:    hotelId,
        p_otb_date:    otbDate,
        p_vs_otb_date: vsOtbDate || otbDate,
        p_min_date:    minOtbDate,
      })
      if (error) throw error
      return (data ?? []) as { business_date: string; otb_revenue: number }[]
    },
  })
  const otbMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of otbRows) {
      const ym = r.business_date.slice(0, 7)
      m[ym] = (m[ym] ?? 0) + (r.otb_revenue ?? 0)
    }
    return m
  }, [otbRows])

  const loading = bLoad || aLoad || oLoad

  // ── 월별 집계 ────────────────────────────────────────────────────────────────
  const monthData = useMemo(() => months.map(({ year, month }) => {
    const ym     = `${year}-${pad2(month)}`
    const lyYm   = `${year - 1}-${pad2(month)}`
    const isFuture = curYM ? ym > curYM : false             // 현재월 이후 = 미래(OTB)
    const value  = isFuture ? (otbMap[ym] ?? 0) : (actualMap[ym] ?? 0)
    const budget = budgetMap[ym] ?? 0
    const ly     = actualMap[lyYm] ?? 0
    const ach    = budget > 0 ? (value / budget) * 100 : null
    return { year, month, ym, value, budget, ly, ach, isFuture }
  }), [months, curYM, otbMap, actualMap, budgetMap])

  // ── YTD 요약 (baseYear 현재월까지 actual) ─────────────────────────────────────
  const ytd = useMemo(() => {
    const cur = monthData.filter(d => d.year === baseYear && !d.isFuture)
    const value  = cur.reduce((s, d) => s + d.value, 0)
    const budget = cur.reduce((s, d) => s + d.budget, 0)
    const ly     = cur.reduce((s, d) => s + d.ly, 0)
    return {
      value, budget, ly,
      ach:    budget > 0 ? (value / budget) * 100 : null,
      growth: ly > 0 ? ((value - ly) / ly) * 100 : null,
      excess: value - budget,
    }
  }, [monthData, baseYear])

  if (!open) return null

  const gaugeColor = (d: { isFuture: boolean; ach: number | null }) =>
    d.isFuture ? '#7EA8FF' : (d.ach != null && d.ach >= 100 ? '#00E5A0' : '#E24B4A')

  const card2026 = monthData.filter(d => d.year === baseYear)
  const card2027 = monthData.filter(d => d.year === baseYear + 1)

  const MonthCell = (d: typeof monthData[number]) => (
    <div key={d.ym} style={{ background: '#0f0f0f', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>
        {MONTH_NAMES[d.month - 1]} <span style={{ color: '#555' }}>'{String(d.year).slice(2)}</span>
      </div>
      <Gauge pct={d.ach} color={gaugeColor(d)} size={56} />
      <div style={{ width: '100%', height: 0.5, background: 'rgba(255,255,255,0.08)' }} />
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#555' }}>Budget</span>
          <span style={{ color: d.value - d.budget >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 500 }}>{fmtSignedM(d.value - d.budget)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#555' }}>Last Year</span>
          <span style={{ color: d.value - d.ly >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 500 }}>{fmtSignedM(d.value - d.ly)}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0a0a0a', border: '1px solid #1f1f1f', borderRadius: 14, width: '92vw', maxWidth: 1040, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Actual vs Budget vs LY</span>
          <button onClick={onClose} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 13 }}>불러오는 중…</div>
          ) : (
            <>
              {/* 상단 요약 카드 2개 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ background: '#0f0f0f', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Gauge pct={ytd.ach} color={ytd.ach != null && ytd.ach >= 100 ? '#00E5A0' : '#E24B4A'} size={76} stroke={6} big />
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>YTD Budget Achievement</div>
                    <div style={{ fontSize: 13, color: ytd.excess >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 600 }}>{fmtSignedM(ytd.excess)} <span style={{ color: '#555', fontWeight: 400 }}>vs budget</span></div>
                    <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>Actual {fmtM(ytd.value)} / Budget {fmtM(ytd.budget)}</div>
                  </div>
                </div>
                <div style={{ background: '#0f0f0f', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Gauge pct={ytd.growth != null ? 100 + ytd.growth : null} color={ytd.growth != null && ytd.growth >= 0 ? '#00E5A0' : '#E24B4A'} size={76} stroke={6} big />
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>YTD Growth vs LY</div>
                    <div style={{ fontSize: 13, color: (ytd.value - ytd.ly) >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 600 }}>{fmtSignedM(ytd.value - ytd.ly)} <span style={{ color: '#555', fontWeight: 400 }}>vs LY</span></div>
                    <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>Actual {fmtM(ytd.value)} / LY {fmtM(ytd.ly)}</div>
                  </div>
                </div>
              </div>

              {/* 2026 (baseYear) — 6열 × 2행 */}
              <div style={{ fontSize: 11, color: '#666', fontWeight: 600, marginBottom: 8 }}>{baseYear}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
                {card2026.map(MonthCell)}
              </div>

              {/* 2027 (baseYear+1) — 6열 × 1행 (1~6월) */}
              <div style={{ fontSize: 11, color: '#666', fontWeight: 600, marginBottom: 8 }}>{baseYear + 1}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                {card2027.map(MonthCell)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
