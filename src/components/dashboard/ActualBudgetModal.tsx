'use client'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useDateContext } from '@/contexts/DateContext'
import { FmtVal } from '@/utils/FmtVal'
import ActualBudgetDetailModal from './ActualBudgetDetailModal'

interface Props {
  open:      boolean
  onClose:   () => void
  hotelId:   string
  roomCount: number
}

const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
const pad2 = (n: number) => String(n).padStart(2, '0')
const fmtM = (v: number) => `${(v / 1_000_000).toFixed(1)}M`
const fmtSignedM = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v / 1_000_000).toFixed(1)}M`

// ── 기간 선택 (YTD 카드 공유) 색상 토큰 ──────────────────────────────────────────
const C = {
  border:        'rgba(255,255,255,0.08)',
  borderStrong:  'rgba(255,255,255,0.25)',
  borderSuccess: 'rgba(0,229,160,0.5)',
  bgSuccess:     'rgba(0,229,160,0.12)',
  fillSuccess:   '#00E5A0',
  textSuccess:   '#00E5A0',
  textPrimary:   '#eee',
  textSecondary: '#888',
  textMuted:     '#555',
  cardBg:        '#0f0f0f',
  surface:       '#141414',
}

// 선택 월 Set → 연속 구간 라벨 (예: "1월~3월, 5월~6월 합계" / "4월" / "1월, 3월, 5월 합계")
const formatMonthRangeLabel = (selected: Set<number>): string => {
  if (selected.size === 0) return '기간 선택'
  const sorted = [...selected].sort((a, b) => a - b)
  const groups: number[][] = []
  let group: number[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) group.push(sorted[i])
    else { groups.push(group); group = [sorted[i]] }
  }
  groups.push(group)
  const parts = groups.map(g => g.length === 1 ? MONTH_NAMES[g[0]] : `${MONTH_NAMES[g[0]]}~${MONTH_NAMES[g[g.length - 1]]}`)
  const label = parts.join(', ')
  return selected.size === 1 ? label : `${label} 합계`
}

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

export default function ActualBudgetModal({ open, onClose, hotelId, roomCount }: Props) {
  const { otbDate, vsOtbDate, otbDates } = useDateContext()
  const [detailMonth, setDetailMonth] = useState<{ key: string; label: string; isOtb: boolean; isYtd?: boolean; ytdToMonth?: number; defaultMode?: 'budget' | 'ly' } | null>(null)

  // ── 기간 선택 (공유 버튼 + 체크박스 멀티선택) ────────────────────────────────────
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set())   // confirmed (baseYear 0~11)
  const [pendingMonths,  setPendingMonths]  = useState<Set<number>>(new Set())   // pending (Done 전)
  const [rangeOpen,      setRangeOpen]      = useState(false)
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

  // 모달 열릴 때 otbDate 기준 전월(당월 이전)까지 자동 선택
  useEffect(() => {
    if (!open) return
    const otbM = otbDate ? new Date(otbDate + 'T00:00:00').getMonth() : 0   // 0-based
    const auto = new Set(Array.from({ length: otbM }, (_, i) => i))          // 0 ~ otbM-1 (1월 이전이면 빈 Set)
    setSelectedMonths(auto)
    setPendingMonths(auto)
  }, [open, otbDate])

  // 드롭다운 외부 클릭 시 닫힘 (드롭다운 내부 클릭은 유지 — 멀티선택 보존)
  useEffect(() => {
    if (!rangeOpen) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-ab-range]')) setRangeOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [rangeOpen])

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
    const isOtb  = curYM ? ym >= curYM : false              // 현재월 포함 이후 = OTB / 그 전 = Actual
    const value  = isOtb ? (otbMap[ym] ?? 0) : (actualMap[ym] ?? 0)
    const budget = budgetMap[ym] ?? 0
    const ly     = actualMap[lyYm] ?? 0
    const ach    = budget > 0 ? (value / budget) * 100 : null
    return { year, month, ym, value, budget, ly, ach, isOtb }
  }), [months, curYM, otbMap, actualMap, budgetMap])

  // ── YTD 요약 (전월까지, 즉 ym < curYM 의 Actual만) ────────────────────────────
  const ytd = useMemo(() => {
    const cur = curYM ? monthData.filter(d => d.ym < curYM) : []
    const value  = cur.reduce((s, d) => s + d.value, 0)
    const budget = cur.reduce((s, d) => s + d.budget, 0)
    const ly     = cur.reduce((s, d) => s + d.ly, 0)
    return {
      value, budget, ly,
      ach:    budget > 0 ? (value / budget) * 100 : null,
      growth: ly > 0 ? ((value - ly) / ly) * 100 : null,
      excess: value - budget,
    }
  }, [monthData, curYM])

  // ── baseYear 월별 배열(0~11) — 기간 합계 계산용 ─────────────────────────────────
  const { monthlyActual, monthlyBudget, monthlyLY } = useMemo(() => {
    const a = new Array(12).fill(0), b = new Array(12).fill(0), l = new Array(12).fill(0)
    for (const d of monthData) {
      if (d.year !== baseYear) continue
      a[d.month - 1] = d.value; b[d.month - 1] = d.budget; l[d.month - 1] = d.ly
    }
    return { monthlyActual: a, monthlyBudget: b, monthlyLY: l }
  }, [monthData, baseYear])

  // 선택 월 합계 (won 단위 유지, fmtSignedM/fmtM으로 표시)
  const rangeKpi = useMemo(() => {
    if (selectedMonths.size === 0) return null
    let actSum = 0, budSum = 0, lySum = 0
    selectedMonths.forEach(i => {
      actSum += monthlyActual[i] ?? 0
      budSum += monthlyBudget[i] ?? 0
      lySum  += monthlyLY[i] ?? 0
    })
    const rangeLabel = formatMonthRangeLabel(selectedMonths)
    return { actSum, budSum, lySum, bDiff: actSum - budSum, lDiff: actSum - lySum, rangeLabel, count: selectedMonths.size }
  }, [selectedMonths, monthlyActual, monthlyBudget, monthlyLY])

  if (!open) return null

  const gaugeColor = (d: { isOtb: boolean; ach: number | null }) =>
    d.isOtb ? '#7EA8FF' : (d.ach != null && d.ach >= 100 ? '#00E5A0' : '#FF6B6B')

  const card2026 = monthData.filter(d => d.year === baseYear)
  const card2027 = monthData.filter(d => d.year === baseYear + 1)

  const MonthCell = (d: typeof monthData[number]) => {
    const isCurrent = !!curYM && d.ym === curYM
    const isPast    = !!curYM && d.ym < curYM
    const monthIdx  = d.month - 1
    const isSel     = d.year === baseYear && selectedMonths.has(monthIdx)
    const restColor = isSel ? C.borderSuccess : isCurrent ? 'rgba(100,160,255,0.5)' : 'rgba(255,255,255,0.08)'
    const badge = isPast
      ? <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 8, background: 'rgba(0,229,160,0.12)', color: '#00E5A0', fontWeight: 600 }}>실적</span>
      : <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 8, background: 'rgba(100,160,255,0.12)', color: '#7EA8FF', fontWeight: 600 }}>OTB</span>
    return (
    <div
      key={d.ym}
      onClick={() => setDetailMonth({ key: d.ym, label: `${MONTH_NAMES[d.month - 1]} ${d.year}`, isOtb: !isPast })}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = restColor }}
      style={{ background: isSel ? C.bgSuccess : '#0f0f0f', border: isSel ? `1.5px solid ${C.borderSuccess}` : isCurrent ? '1px solid rgba(100,160,255,0.5)' : '0.5px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>{MONTH_NAMES[d.month - 1]}</span>
          <span style={{ fontSize: 10, color: '#555' }}>'{String(d.year).slice(2)}</span>
        </div>
        {badge}
      </div>
      <Gauge pct={d.ach} color={gaugeColor(d)} size={56} />
      <div style={{ width: '100%', height: 0.5, background: 'rgba(255,255,255,0.08)' }} />
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#555' }}>예산</span>
          <span style={{ color: d.value - d.budget >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 500 }}><FmtVal val={fmtSignedM(d.value - d.budget)} numSize={10} /></span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#555' }}>전년</span>
          <span style={{ color: d.value - d.ly >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 500 }}><FmtVal val={fmtSignedM(d.value - d.ly)} numSize={10} /></span>
        </div>
      </div>
    </div>
    )
  }

  return (
    <>
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
          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>실적 vs 예산 vs 전년</span>
          <button onClick={onClose} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 13 }}>불러오는 중…</div>
          ) : (
            <>
              {/* 공유 기간 선택 버튼 (YTD 카드 위, 우측 정렬) */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10, position: 'relative' }} data-ab-range>
                <button
                  onClick={() => { setPendingMonths(new Set(selectedMonths)); setRangeOpen(v => !v) }}
                  style={{
                    fontSize: 11, padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
                    border: `0.5px solid ${selectedMonths.size > 0 ? C.borderSuccess : C.border}`,
                    background: selectedMonths.size > 0 ? C.bgSuccess : C.cardBg,
                    color: selectedMonths.size > 0 ? C.textSuccess : C.textSecondary,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  📅
                  <span>{formatMonthRangeLabel(selectedMonths)}</span>
                  ▾
                </button>

                {rangeOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                    background: C.surface, border: `0.5px solid ${C.border}`,
                    borderRadius: 8, minWidth: 180, zIndex: 9999,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    display: 'flex', flexDirection: 'column',
                  }}>
                    <div style={{ padding: 6, maxHeight: 240, overflowY: 'auto' }}>
                      <div style={{ fontSize: 9, color: C.textMuted, padding: '2px 6px 4px', fontWeight: 500 }}>월 선택 (복수 가능)</div>
                      {Array.from({ length: 12 }, (_, i) => {
                        const isChecked = pendingMonths.has(i)
                        return (
                          <div
                            key={i}
                            onClick={() => {
                              const next = new Set(pendingMonths)
                              if (next.has(i)) next.delete(i); else next.add(i)
                              setPendingMonths(next)
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '5px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11,
                              color: isChecked ? C.textPrimary : C.textSecondary,
                              background: isChecked ? C.bgSuccess : 'transparent',
                            }}
                          >
                            <div style={{
                              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                              border: `1.5px solid ${isChecked ? C.borderSuccess : C.borderStrong}`,
                              background: isChecked ? C.fillSuccess : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {isChecked && <span style={{ color: '#0a0a0a', fontSize: 9, lineHeight: 1 }}>✓</span>}
                            </div>
                            <span>{MONTH_NAMES[i]}</span>
                          </div>
                        )
                      })}
                    </div>

                    <div style={{ display: 'flex', gap: 4, padding: 8, borderTop: `0.5px solid ${C.border}` }}>
                      <button
                        onClick={() => { setPendingMonths(new Set()); setSelectedMonths(new Set()); setRangeOpen(false) }}
                        style={{ flex: 1, fontSize: 10, padding: '5px 0', borderRadius: 4, cursor: 'pointer', border: `0.5px solid ${C.border}`, background: 'transparent', color: C.textSecondary }}
                      >초기화</button>
                      <button
                        onClick={() => { const all = new Set(Array.from({ length: 12 }, (_, i) => i)); setPendingMonths(all); setSelectedMonths(all); setRangeOpen(false) }}
                        style={{ flex: 1, fontSize: 10, padding: '5px 0', borderRadius: 4, cursor: 'pointer', border: `0.5px solid ${C.border}`, background: 'transparent', color: C.textSecondary }}
                      >전체</button>
                      <button
                        onClick={() => { setSelectedMonths(new Set(pendingMonths)); setRangeOpen(false) }}
                        style={{ flex: 1, fontSize: 10, padding: '5px 0', borderRadius: 4, cursor: 'pointer', border: `0.5px solid ${C.borderSuccess}`, background: C.bgSuccess, color: C.textSuccess, fontWeight: 500 }}
                      >완료 ✓</button>
                    </div>
                  </div>
                )}
              </div>

              {/* 상단 요약 카드 2개 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div
                  onClick={() => setDetailMonth({ key: '', label: `YTD ${baseYear}`, isOtb: false, isYtd: true, ytdToMonth: curYM ? Number(curYM.slice(5, 7)) - 1 : 12, defaultMode: 'budget' })}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                  style={{ background: '#0f0f0f', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Gauge pct={ytd.ach} color={ytd.ach != null && ytd.ach >= 100 ? '#00E5A0' : '#FF6B6B'} size={76} stroke={6} big />
                    {rangeKpi && (
                      <div style={{ textAlign: 'center', fontSize: 10, color: C.textSuccess, fontWeight: 500, marginTop: 4 }}>{rangeKpi.rangeLabel}</div>
                    )}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>YTD 예산 달성</div>
                    <div style={{ color: (rangeKpi ? rangeKpi.bDiff : ytd.excess) >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 600 }}>
                      <FmtVal val={fmtSignedM(rangeKpi ? rangeKpi.bDiff : ytd.excess)} numSize={34} />
                      <span style={{ fontSize: 11, color: '#555', fontWeight: 400, marginLeft: 5 }}>예산 대비</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>실적 <FmtVal val={fmtM(rangeKpi ? rangeKpi.actSum : ytd.value)} numSize={10} /> / 예산 <FmtVal val={fmtM(rangeKpi ? rangeKpi.budSum : ytd.budget)} numSize={10} /></div>
                  </div>
                </div>
                <div
                  onClick={() => setDetailMonth({ key: '', label: `YTD ${baseYear}`, isOtb: false, isYtd: true, ytdToMonth: curYM ? Number(curYM.slice(5, 7)) - 1 : 12, defaultMode: 'ly' })}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                  style={{ background: '#0f0f0f', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Gauge pct={ytd.growth != null ? 100 + ytd.growth : null} color={ytd.growth != null && ytd.growth >= 0 ? '#00E5A0' : '#E24B4A'} size={76} stroke={6} big />
                    {rangeKpi && (
                      <div style={{ textAlign: 'center', fontSize: 10, color: C.textSuccess, fontWeight: 500, marginTop: 4 }}>{rangeKpi.rangeLabel}</div>
                    )}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>YTD 전년 대비 성장</div>
                    <div style={{ color: (rangeKpi ? rangeKpi.lDiff : ytd.value - ytd.ly) >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 600 }}>
                      <FmtVal val={fmtSignedM(rangeKpi ? rangeKpi.lDiff : ytd.value - ytd.ly)} numSize={34} />
                      <span style={{ fontSize: 11, color: '#555', fontWeight: 400, marginLeft: 5 }}>전년 대비</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>실적 <FmtVal val={fmtM(rangeKpi ? rangeKpi.actSum : ytd.value)} numSize={10} /> / 전년 <FmtVal val={fmtM(rangeKpi ? rangeKpi.lySum : ytd.ly)} numSize={10} /></div>
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

    <ActualBudgetDetailModal
      open={!!detailMonth}
      onClose={() => setDetailMonth(null)}
      monthKey={detailMonth?.key ?? ''}
      monthLabel={detailMonth?.label ?? ''}
      isOtb={detailMonth?.isOtb ?? false}
      hotelId={hotelId}
      roomCount={roomCount}
      isYtd={detailMonth?.isYtd}
      ytdToMonth={detailMonth?.ytdToMonth}
      defaultMode={detailMonth?.defaultMode ?? 'budget'}
    />
    </>
  )
}
