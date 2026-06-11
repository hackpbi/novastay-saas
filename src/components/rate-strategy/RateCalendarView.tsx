'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  generateCalendarDays, isFriOrSat, toDateStr, dayCellStyle, DOW_LABELS, getKSTDateString,
} from './BaseCalendar'
import { DayPanel } from './DayPanel'
import type { PromoFormData } from './DayPanel'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'

// ── Types ─────────────────────────────────────────────────────────────────────

type PromoType = 'disc' | 'pkg' | 'hot'

interface BarRateDay {
  stay_date:  string
  base_rate:  number
  rack_rate:  number | null
  room_rates: Record<string, number>
}

interface CalPromo {
  id:             string
  promo_type:     PromoType
  name:           string
  discount_type:  'pct' | 'amount' | 'fixed' | 'addon'
  discount_value: number
  room_type_code: string | null
  stay_start:     string
  stay_end:       string
  color:          string
  row:            number
}

const EMPTY_PROMO_FORM: PromoFormData = {
  name: '', description: '', min_stay: '', max_stay: '',
  discount_type: 'pct', discount_value: '',
  stay_start: '', stay_end: '', sale_start: '', sale_end: '', status: 'active',
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PROMO_LINE_H = 18
const BASE_CELL_H  = 80

// ── Color helpers ──────────────────────────────────────────────────────────────

function occColor(o: number): string {
  return o >= 80 ? '#00e5a0' : o >= 60 ? '#ffa040' : '#ff5555'
}

function promoBarStyle(type: PromoType): React.CSSProperties {
  const map: Record<PromoType, React.CSSProperties> = {
    disc: { background: 'rgba(0,229,160,0.13)',   borderLeft: '2.5px solid #00e5a0' },
    pkg:  { background: 'rgba(100,140,255,0.13)', borderLeft: '2.5px solid #648cff' },
    hot:  { background: 'rgba(255,120,60,0.13)',  borderLeft: '2.5px solid #ff783c' },
  }
  return map[type]
}

function promoLabelColor(type: PromoType): string {
  return { disc: '#00e5a0', pkg: '#648cff', hot: '#ff783c' }[type]
}

function promoRateColor(type: PromoType): string {
  return {
    disc: 'rgba(0,229,160,0.8)',
    pkg:  'rgba(100,140,255,0.8)',
    hot:  'rgba(255,120,60,0.8)',
  }[type]
}

function getRateColor(rate: number): string {
  if (rate >= 200) return '#E24B4A'
  if (rate >= 150) return '#BA7517'
  if (rate >= 100) return '#00B883'
  return '#534AB7'
}

const PROMO_COLORS = [
  '#00B883', '#534AB7', '#BA7517', '#E24B4A',
  '#185FA5', '#0F6E56', '#993556', '#638522',
]

function promoColorById(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return PROMO_COLORS[Math.abs(hash) % PROMO_COLORS.length]
}

function toKSTDateStr(isoStr: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  }).format(new Date(isoStr))
}

function toKSTTimeStr(isoStr: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  }).format(new Date(isoStr))
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RateCalendarView({
  year, month,
  occMap = {},
  saleDate,
  pickupRows = [],
}: {
  year:        number
  month:       number
  occMap?:     Record<string, number>
  saleDate?:   string
  pickupRows?: any[]
}) {
  const { currentHotel } = useHotel()
  const hotelId    = currentHotel?.id ?? ''
  const queryClient = useQueryClient()

  console.log('[pickupRows] 6월 1~5일 데이터:',
    pickupRows.filter((r: any) =>
      r.business_date >= '2026-06-01' && r.business_date <= '2026-06-05'
    )
  )
  console.log('[occMap] 6월 1~5일:',
    Object.entries(occMap).filter(([k]) => k >= '2026-06-01' && k <= '2026-06-05')
  )

  const [selectedDay,   setSelectedDay]   = useState<string>(() => {
    const today = getKSTDateString()
    const todayYear  = Number(today.slice(0, 4))
    const todayMonth = Number(today.slice(5, 7))
    const todayDay   = Number(today.slice(8, 10))
    if (todayYear === year && todayMonth === month) return toDateStr(year, month, todayDay)
    return toDateStr(year, month, 1)
  })
  const [selectedBar,  setSelectedBar]  = useState<number | null>(null)
  const [pendingRates, setPendingRates] = useState<Record<string, number>>({})
  const [hoveredDate,  setHoveredDate]  = useState<string | null>(null)
  const [toast,             setToast]             = useState<string | null>(null)
  const [historyModalDate, setHistoryModalDate] = useState<string | null>(null)

  const selectedDates = Object.keys(pendingRates)
  const [showAddPromo,  setShowAddPromo]  = useState(false)
  const [promoForm,     setPromoForm]     = useState<PromoFormData>(EMPTY_PROMO_FORM)
  const [dayModalDate,  setDayModalDate]  = useState<string | null>(null)
  const [rateUnit,      setRateUnit]      = useState<'k' | 'w'>('k')

  useEffect(() => {
    const today = getKSTDateString()
    const todayYear  = Number(today.slice(0, 4))
    const todayMonth = Number(today.slice(5, 7))
    const todayDay   = Number(today.slice(8, 10))
    if (todayYear === year && todayMonth === month) {
      setSelectedDay(toDateStr(year, month, todayDay))
    } else {
      setSelectedDay(toDateStr(year, month, 1))
    }
    setSelectedBar(null)
    setShowAddPromo(false)
    setPromoForm(EMPTY_PROMO_FORM)
    setPendingRates({})
  }, [year, month])

  useEffect(() => {
    if (dayModalDate) setRateUnit('k')
  }, [dayModalDate])

  // ── DB 조회 ──────────────────────────────────────────────────────────────────

  const { data: barRates = [], isLoading: barLoading } = useQuery<BarRateDay[]>({
    queryKey: ['bar-rate-calendar', hotelId, year, month],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_bar_rate_calendar', {
          p_hotel_id: hotelId,
          p_year:     year,
          p_month:    month,
        })
      if (error) throw error
      return (data ?? []) as BarRateDay[]
    },
    enabled: !!hotelId,
  })

  const { data: promoRaw = [], isLoading: promoLoading } = useQuery<Omit<CalPromo, 'row'>[]>({
    queryKey: ['promotion-calendar', hotelId, year, month, saleDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_promotion_calendar', {
          p_hotel_id:  hotelId,
          p_year:      year,
          p_month:     month,
          p_sale_date: saleDate || null,
        })
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId,
  })

  const { data: rateHistory = [] } = useQuery<{
    stay_date:  string
    old_rate:   number
    new_rate:   number
    created_at: string
  }[]>({
    queryKey: ['rate-history', hotelId, year, month],
    queryFn: async () => {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate   = new Date(year, month, 0).toISOString().slice(0, 10)
      const { data, error } = await (supabase as any)
        .from('s01_rate_detail_history')
        .select('stay_date, old_rate, new_rate, created_at')
        .eq('hotel_id', hotelId)
        .eq('room_type_code', 'BASE')
        .gte('stay_date', startDate)
        .lte('stay_date', endDate)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId,
  })

  const { data: monthPromos = [] } = useQuery({
    queryKey: ['s03_rate_promotion', hotelId, year, month, saleDate],
    queryFn: async () => {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate   = new Date(year, month, 0).toISOString().slice(0, 10)
      let query = (supabase as any)
        .from('s03_rate_promotion')
        .select('id, name, discount_type, discount_value, room_type_codes, stay_start, stay_end, sale_start, sale_end, min_stay, max_stay, status, description')
        .eq('hotel_id', hotelId)
        .eq('status', 'active')
        .lte('stay_start', endDate)
        .gte('stay_end',   startDate)
      if (saleDate) {
        query = query
          .or(`sale_start.is.null,sale_start.lte.${saleDate}`)
          .or(`sale_end.is.null,sale_end.gte.${saleDate}`)
      }
      const { data, error } = await query.order('stay_start', { ascending: true })
      if (error) throw error
      return (data ?? []).map((p: any) => ({
        id:        p.id,
        name:      p.name,
        type:      p.discount_type === 'pct' ? '정률' : p.discount_type === 'amount' ? '정액' : '고정',
        rooms:     p.room_type_codes?.join(', ') ?? '전 객실',
        disc:      p.discount_type === 'pct'
          ? `-${p.discount_value}%`
          : p.discount_type === 'amount'
            ? `-${Math.round(p.discount_value / 1000)}K`
            : `${Math.round(p.discount_value / 1000)}K`,
        color:     promoColorById(p.id),
        dateRange: `${p.stay_start?.slice(5).replace('-', '/')}~${p.stay_end?.slice(5).replace('-', '/')}`,
        dates:     [] as string[],
        _raw:      p,
      }))
    },
    enabled: !!hotelId,
  })

  const { data: roomTypes = [] } = useQuery<{ room_type_code: string; room_type_description: string }[]>({
    queryKey: ['c01_room_types', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c01_room_types')
        .select('room_type_code, room_type_description')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
        .order('surcharge', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId,
  })

  const { data: customRates = [] } = useQuery<{
    promotion_id:   string
    stay_date:      string
    room_type_code: string
    rate:           number
  }[]>({
    queryKey: ['s06_rate_custom', hotelId, year, month],
    queryFn: async () => {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate   = new Date(year, month, 0).toISOString().slice(0, 10)
      const { data, error } = await (supabase as any)
        .from('s06_rate_custom')
        .select('promotion_id, stay_date, room_type_code, rate')
        .eq('hotel_id', hotelId)
        .gte('stay_date', startDate)
        .lte('stay_date', endDate)
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId,
  })

  // ── 데이터 가공 ───────────────────────────────────────────────────────────────

  const barRateMap = useMemo<Record<number, BarRateDay>>(() => {
    return Object.fromEntries(
      barRates.map(r => [new Date(r.stay_date + 'T00:00:00').getDate(), r])
    )
  }, [barRates])

  const customRateMap = useMemo<Record<string, number>>(() => {
    const result: Record<string, number> = {}
    for (const r of customRates) {
      result[`${r.promotion_id}_${r.stay_date}_${r.room_type_code}`] = r.rate
    }
    return result
  }, [customRates])

  const effectiveBarRateMap = useMemo<Record<number, BarRateDay>>(() => {
    const result = { ...barRateMap }
    for (const [dateStr, rate] of Object.entries(pendingRates)) {
      const d = new Date(dateStr + 'T00:00:00').getDate()
      if (result[d]) {
        result[d] = { ...result[d], base_rate: rate }
      } else {
        result[d] = { stay_date: dateStr, base_rate: rate, rack_rate: null, room_rates: {} }
      }
    }
    return result
  }, [barRateMap, pendingRates])

  const calPromos = useMemo<CalPromo[]>(() => {
    const withDays = promoRaw
      .map(p => ({
        ...p,
        _s: new Date(p.stay_start + 'T00:00:00').getDate(),
        _e: new Date(p.stay_end   + 'T00:00:00').getDate(),
      }))
      .sort((a, b) => a._s - b._s)

    const rowEnds: number[] = []
    return withDays.map(({ _s, _e, ...p }) => {
      let r = rowEnds.findIndex(e => e < _s)
      if (r === -1) { r = rowEnds.length; rowEnds.push(0) }
      rowEnds[r] = _e
      return { ...p, color: promoColorById(p.id), row: r }
    })
  }, [promoRaw])

  type HistEntry = { stay_date: string; old_rate: number; new_rate: number; created_at: string }

  const rateHistoryGrouped = useMemo<Record<number, { changedDate: string; oldRate: number; newRate: number }[]>>(() => {
    const byStayDate: Record<string, Record<string, { firstOld: number; lastNew: number }>> = {}
    for (const r of rateHistory) {
      const changedDate = toKSTDateStr(r.created_at)
      if (!byStayDate[r.stay_date]) byStayDate[r.stay_date] = {}
      if (!byStayDate[r.stay_date][changedDate]) {
        byStayDate[r.stay_date][changedDate] = { firstOld: r.old_rate, lastNew: r.new_rate }
      } else {
        byStayDate[r.stay_date][changedDate].lastNew = r.new_rate
      }
    }
    const result: Record<number, { changedDate: string; oldRate: number; newRate: number }[]> = {}
    for (const [stayDateStr, byChanged] of Object.entries(byStayDate)) {
      const day    = new Date(stayDateStr + 'T00:00:00').getDate()
      const sorted = Object.entries(byChanged)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([changedDate, v]) => ({ changedDate, oldRate: v.firstOld, newRate: v.lastNew }))
      result[day] = sorted.slice(-3)
    }
    return result
  }, [rateHistory])

  const rateHistoryAll = useMemo<Record<string, HistEntry[]>>(() => {
    const result: Record<string, HistEntry[]> = {}
    for (const r of rateHistory) {
      if (!result[r.stay_date]) result[r.stay_date] = []
      result[r.stay_date].push(r)
    }
    return result
  }, [rateHistory])

  const maxPromosPerDay = useMemo(() => {
    if (calPromos.length === 0) return 0
    const daysInMonth = new Date(year, month, 0).getDate()
    let max = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const count = calPromos.filter(p => {
        const s = new Date(p.stay_start + 'T00:00:00').getDate()
        const e = new Date(p.stay_end   + 'T00:00:00').getDate()
        return d >= s && d <= e
      }).length
      if (count > max) max = count
    }
    return max
  }, [calPromos, year, month])

  const dayPromosMap = useMemo<Record<number, CalPromo[]>>(() => {
    const daysInMonth = new Date(year, month, 0).getDate()
    const result: Record<number, CalPromo[]> = {}
    for (let d = 1; d <= daysInMonth; d++) {
      result[d] = calPromos.filter(p => {
        const s = new Date(p.stay_start + 'T00:00:00').getDate()
        const e = new Date(p.stay_end   + 'T00:00:00').getDate()
        return d >= s && d <= e
      })
    }
    return result
  }, [calPromos, year, month])

  const cellMinHeight = maxPromosPerDay > 0
    ? BASE_CELL_H + maxPromosPerDay * PROMO_LINE_H + 8
    : BASE_CELL_H

  const adrRevMap = useMemo<Record<string, { adr: number | null; rev: number }>>(() => {
    const map: Record<string, { nights: number; revenue: number }> = {}
    for (const r of pickupRows as any[]) {
      const d = r.business_date as string
      if (!map[d]) map[d] = { nights: 0, revenue: 0 }
      map[d].nights  += r.otb_nights  ?? 0
      map[d].revenue += r.otb_revenue ?? 0
    }
    const result: Record<string, { adr: number | null; rev: number }> = {}
    for (const [d, v] of Object.entries(map)) {
      result[d] = {
        adr: v.nights > 0 ? Math.round(v.revenue / v.nights / 1000) : null,
        rev: v.revenue,
      }
    }
    return result
  }, [pickupRows])

  // ── 저장 ──────────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(pendingRates).map(([date, rate]) => ({
        hotel_id:       hotelId,
        stay_date:      date,
        room_type_code: 'BASE',
        date_type:      'single',
        new_rate:       rate,
      }))
      const { error } = await (supabase as any)
        .from('s02_rate_detail')
        .upsert(rows, { onConflict: 'hotel_id,room_type_code,stay_date,date_type', ignoreDuplicates: false })
      console.log('[save] rows:', JSON.stringify(rows))
      console.log('[save] error:', JSON.stringify(error))
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bar-rate-calendar', hotelId] })
      queryClient.invalidateQueries({ queryKey: ['rate-history', hotelId] })
      queryClient.invalidateQueries({ queryKey: ['promotion-calendar', hotelId] })
      queryClient.invalidateQueries({ queryKey: ['s06_rate_custom', hotelId] })
      setPendingRates({})
      setToast('저장되었습니다')
      setTimeout(() => setToast(null), 2500)
    },
  })

  const handleResetDates = () => {
    setSelectedBar(null)
    setPendingRates({})
  }

  // ── 이벤트 핸들러 ─────────────────────────────────────────────────────────────

  const handleDayClick = (dateStr: string) => {
    if (selectedBar !== null) {
      if (dateStr < getKSTDateString()) return
      setSelectedDay(dateStr)
      setPendingRates(prev => {
        if (prev[dateStr] === selectedBar) {
          const next = { ...prev }
          delete next[dateStr]
          return next
        }
        return { ...prev, [dateStr]: selectedBar }
      })
      return
    }
    setDayModalDate(dateStr)
  }

  const handlePromoFormChange = (field: string, val: string) => {
    setPromoForm(prev => ({ ...prev, [field]: val }))
  }

  // ── 프로모션 적용 요금 계산 (원 단위) ─────────────────────────────────────────

  function getPromoRate(p: CalPromo, day: number): number | null {
    if (p.discount_type === 'fixed') {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const keys = Object.keys(customRateMap).filter(k => k.startsWith(`${p.id}_${dateStr}_`))
      if (keys.length === 0) return null
      if (p.room_type_code) {
        return customRateMap[`${p.id}_${dateStr}_${p.room_type_code}`] ?? null
      }
      return customRateMap[keys[0]] ?? null
    }
    const barDay = effectiveBarRateMap[day]
    if (!barDay) return null
    const base = p.room_type_code
      ? (barDay.room_rates[p.room_type_code] ?? barDay.base_rate)
      : barDay.base_rate
    if (p.discount_type === 'pct')    return Math.round(base * (1 - p.discount_value / 100))
    if (p.discount_type === 'amount') return base - p.discount_value
    if (p.discount_type === 'addon')  return base + p.discount_value
    return base
  }

  const todayStr = getKSTDateString()

  // ── 주 단위 분할 ──────────────────────────────────────────────────────────────

  const allDays = generateCalendarDays(year, month)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7))

  // ── 렌더 ──────────────────────────────────────────────────────────────────────

  return (
    <>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <div style={{
      position:     'relative',
      minHeight:    400,
      border:       '1px solid var(--color-border-default)',
      borderRadius: 12,
      overflow:     'hidden',
      background:   'var(--color-bg-secondary)',
      boxShadow:    'var(--shadow-card)',
      display:      'flex',
    }}>

      {/* 로딩 오버레이 */}
      {(barLoading || promoLoading) && (
        <div style={{
          position:       'absolute',
          inset:          0,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          background:     'rgba(0,0,0,0.3)',
          zIndex:         10,
          borderRadius:   12,
          fontSize:       12,
          color:          'var(--color-text-secondary)',
          gap:            6,
        }}>
          <div style={{ width: 14, height: 14, border: '2px solid #00e5a0', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          불러오는 중...
        </div>
      )}

      {/* 달력 영역 */}
      <div style={{ flex: 1, minWidth: 0, padding: '8px 12px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        {/* 요일 헤더 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 2, flexShrink: 0 }}>
          {DOW_LABELS.map((d, i) => (
            <div key={d} style={{
              fontSize:  10,
              color:     i >= 5 ? '#00B883' : 'var(--color-text-secondary)',
              textAlign: 'center',
              padding:   '2px 0',
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* 주 단위 그리드 */}
        <div style={{ flex: 1 }}>
          {weeks.map((weekDays, wIdx) => {
            return (
              <div key={wIdx} style={{ marginBottom: 3 }}>

                {/* 날짜 셀 행 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
                  {weekDays.map((day, colIdx) => {
                    if (!day) return <div key={`e-${wIdx}-${colIdx}`} />
                    const dateStr       = toDateStr(year, month, day)
                    const isWeekend     = isFriOrSat(year, month, day)
                    const isPast        = dateStr < todayStr
                    const isSelected    = selectedDay === dateStr
                    const isInSelection = selectedDates.includes(dateStr)
                    const isHoverApply  = selectedBar !== null && hoveredDate === dateStr
                    const barDay        = barRateMap[day]
                    const occ           = occMap[dateStr] != null ? Math.round(occMap[dateStr]!) : null
                    const dayPromos     = dayPromosMap[day] ?? []

                    const pendingRate = pendingRates[dateStr] != null ? pendingRates[dateStr] : null
                    const histGroup  = rateHistoryGrouped[day] ?? []

                    let displayChain: { rate: number; isPending?: boolean }[] = []
                    if (histGroup.length > 0) {
                      displayChain.push({ rate: Math.round(histGroup[0].oldRate / 1000) })
                      for (const h of histGroup) {
                        displayChain.push({ rate: Math.round(h.newRate / 1000) })
                      }
                      if (pendingRate != null) {
                        displayChain.push({ rate: Math.round(pendingRate / 1000), isPending: true })
                      }
                    } else if (barDay?.base_rate != null) {
                      displayChain.push({ rate: Math.round(barDay.base_rate / 1000) })
                      if (pendingRate != null) {
                        displayChain.push({ rate: Math.round(pendingRate / 1000), isPending: true })
                      }
                    }
                    if (displayChain.length > 3) displayChain = displayChain.slice(-3)

                    return (
                      <div
                        key={day}
                        onClick={() => handleDayClick(dateStr)}
                        onMouseEnter={() => setHoveredDate(dateStr)}
                        onMouseLeave={() => setHoveredDate(null)}
                        style={dayCellStyle(year, month, day, {
                          padding:       '6px 7px 5px',
                          overflow:      'hidden',
                          cursor:        isPast && selectedBar === null ? 'default' : 'pointer',
                          opacity:       isPast ? 0.4 : 1,
                          minHeight:     cellMinHeight,
                          display:       'flex',
                          flexDirection: 'column',
                          outline:       isInSelection ? '2px solid #00E5A0' : isSelected ? '1.5px dashed rgba(0,229,160,0.4)' : undefined,
                          ...(isHoverApply ? { background: 'rgba(0,229,160,0.10)' } : {}),
                        })}
                      >
                        {/* 날짜(좌) + BAR Rate(우) */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: isPast ? '#444' : isWeekend ? '#00e5a0' : '#777' }}>
                              {day}
                            </span>
                            {histGroup.length > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); setHistoryModalDate(dateStr) }}
                                style={{ fontSize: 9, color: '#555', background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px 2px', lineHeight: 1, borderRadius: 3 }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#00e5a0')}
                                onMouseLeave={e => (e.currentTarget.style.color = '#555')}
                                title="요금 변경 이력"
                              >⟳</button>
                            )}
                          </div>

                          {/* BAR Rate — 우측 정렬 */}
                          <div style={{ textAlign: 'right' }}>
                            {displayChain.length === 0 ? (
                              <span style={{ fontSize: 10, color: '#333' }}>—</span>
                            ) : displayChain.map((item, i) => (
                              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                                {i > 0 && <span style={{ color: '#ff8c50', fontSize: 8, margin: '0 1px' }}>→</span>}
                                <span style={{
                                  color:          item.isPending ? '#F5B800' : i === displayChain.length - 1 ? getRateColor(item.rate) : '#444',
                                  fontSize:       displayChain.length >= 3 ? 9 : 11,
                                  fontWeight:     i === displayChain.length - 1 ? 600 : 400,
                                  textDecoration: i < displayChain.length - 1 ? 'line-through' : 'none',
                                }}>
                                  {item.rate}K
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* OCC 프로그레스바 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
                          <div style={{ flex: 1, height: 3, borderRadius: 99, background: '#2a2a2a', overflow: 'hidden' }}>
                            {occ !== null && (
                              <div style={{ height: 3, borderRadius: 99, width: `${Math.min(100, occ)}%`, background: occColor(occ) }} />
                            )}
                          </div>
                          <span style={{ fontSize: 9, color: '#555', minWidth: 22, textAlign: 'right' }}>
                            {occ !== null ? `${occ}%` : '—'}
                          </span>
                        </div>

                        {/* 프로모션 영역 */}
                        {maxPromosPerDay > 0 && (
                          <>
                            <div style={{ height: '0.5px', background: '#222', margin: '4px 0 3px' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {Array.from({ length: maxPromosPerDay }, (_, i) => {
                                const promo = dayPromos[i]
                                if (!promo) {
                                  return <div key={i} style={{ height: PROMO_LINE_H }} />
                                }
                                const rate       = getPromoRate(promo, day)
                                const promoColor = (promo as any).color ?? '#00B883'
                                return (
                                  <div key={promo.id} style={{
                                    height:         PROMO_LINE_H,
                                    display:        'flex',
                                    alignItems:     'center',
                                    justifyContent: 'space-between',
                                    gap:            4,
                                    padding:        '1px 0',
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
                                      <div style={{
                                        width:        14,
                                        height:       5,
                                        borderRadius: 2,
                                        flexShrink:   0,
                                        background:   `${promoColor}55`,
                                        borderLeft:   `3px solid ${promoColor}`,
                                      }} />
                                      <span style={{
                                        fontSize:     9,
                                        color:        '#888',
                                        whiteSpace:   'nowrap',
                                        overflow:     'hidden',
                                        textOverflow: 'ellipsis',
                                      }}>
                                        {promo.name}
                                      </span>
                                    </div>
                                    <span style={{
                                      fontSize:   9,
                                      fontWeight: 600,
                                      color:      promoColor,
                                      flexShrink: 0,
                                    }}>
                                      {rate != null ? `${Math.round(rate / 1000)}K` : '—'}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

              </div>
            )
          })}
        </div>

        {/* BAR Rate 데이터 없음 안내 */}
        {!barLoading && barRates.length === 0 && (
          <div style={{
            textAlign:  'center',
            fontSize:   11,
            color:      '#444',
            padding:    '8px 0 4px',
            flexShrink: 0,
          }}>
            이 달의 BAR Rate 데이터가 없습니다
          </div>
        )}

        {/* 범례 */}
        <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap', flexShrink: 0, paddingBottom: 4 }}>
          {([
            { type: 'disc' as PromoType, label: '할인 프로모션', color: '#00e5a0' },
            { type: 'pkg'  as PromoType, label: '패키지',        color: '#648cff' },
            { type: 'hot'  as PromoType, label: 'HOT DEAL',      color: '#ff783c' },
          ]).map(l => (
            <div key={l.type} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-text-secondary)' }}>
              <div style={{
                width:        16,
                height:       6,
                borderRadius: 2,
                background:   `${l.color}40`,
                borderLeft:   `3px solid ${l.color}`,
              }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      {/* 슬라이드 패널 */}
      <div style={{
        width:      300,
        flexShrink: 0,
        borderLeft: '0.5px solid var(--color-border-default)',
        overflow:   'hidden',
      }}>
        <DayPanel
          day={selectedDay}
          selectedBar={selectedBar}
          onSelectBar={setSelectedBar}
          monthPromos={monthPromos}
          showAddPromo={showAddPromo}
          promoForm={promoForm}
          onToggleAddPromo={() => setShowAddPromo(p => !p)}
          onPromoFormChange={handlePromoFormChange}
          onDeletePromo={() => {}}
          onPromoSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['s03_rate_promotion', hotelId] })
            queryClient.invalidateQueries({ queryKey: ['promotion-calendar', hotelId] })
            queryClient.invalidateQueries({ queryKey: ['s06_rate_custom', hotelId] })
          }}
          onExcelSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['bar-rate-calendar', hotelId] })
            queryClient.invalidateQueries({ queryKey: ['rate-history', hotelId] })
          }}
          hotelId={hotelId}
          year={year}
          month={month}
          roomTypes={roomTypes}
          barRateMap={barRateMap}
          selectedDates={selectedDates}
          onSave={() => saveMutation.mutate()}
          onResetDates={handleResetDates}
          isSaving={saveMutation.isPending}
          saveToast={toast}
        />
      </div>

    </div>

    {/* 일자 상세 모달 */}
    {dayModalDate && (() => {
      const _d        = new Date(dayModalDate + 'T00:00:00')
      const _day      = _d.getDate()
      const _m        = _d.getMonth() + 1
      const dowLabel  = ['일','월','화','수','목','금','토'][_d.getDay()]
      const barDay    = effectiveBarRateMap[_day]
      const baseRateK = barDay?.base_rate != null ? Math.round(barDay.base_rate / 1000) : null
      const hasHist   = barDay?.rack_rate != null && barDay.rack_rate !== barDay.base_rate
      const occ       = occMap[dayModalDate] != null ? Math.round(occMap[dayModalDate]!) : null
      const adrRev    = adrRevMap[dayModalDate]
      const dayPromos = dayPromosMap[_day] ?? []

      const _occColor = (o: number) => o >= 80 ? '#00B883' : o >= 60 ? '#ffa040' : '#ff5555'
      const fmtRev    = (rev: number) =>
        rev >= 1_000_000 ? `${(rev / 1_000_000).toFixed(1)}M` : rev > 0 ? `${Math.round(rev / 1000)}K` : '—'
      const fmtRate = (rate: number | null): string => {
        if (rate == null) return '—'
        if (rateUnit === 'k') return `${Math.round(rate / 1000)}K`
        return rate.toLocaleString('ko-KR')
      }

      return (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)',
          }}
          onClick={() => setDayModalDate(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-secondary)',
              border:     '0.5px solid var(--color-border-default)',
              borderRadius: 12, width: 360, overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            {/* 헤더 */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: '0.5px solid var(--color-border-default)',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  {_m}월 {_day}일 {dowLabel}요일
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* 단위 토글 */}
                <div style={{
                  display:      'flex',
                  border:       '0.5px solid var(--color-border-default)',
                  borderRadius: 5,
                  overflow:     'hidden',
                }}>
                  {(['k', 'w'] as const).map(unit => (
                    <button
                      key={unit}
                      onClick={() => setRateUnit(unit)}
                      style={{
                        fontSize:   10,
                        padding:    '2px 8px',
                        border:     'none',
                        cursor:     'pointer',
                        background: rateUnit === unit ? '#00E5A0' : 'transparent',
                        color:      rateUnit === unit ? '#04342C' : 'var(--color-text-secondary)',
                        fontWeight: rateUnit === unit ? 500 : 400,
                      }}
                    >
                      {unit === 'k' ? '천원' : '원'}
                    </button>
                  ))}
                </div>
                {hasHist && (
                  <button
                    onClick={() => { setDayModalDate(null); setHistoryModalDate(dayModalDate) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      fontSize: 10, color: '#555', background: 'transparent',
                      border: '0.5px solid var(--color-border-default)', borderRadius: 5,
                      padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#00E5A0'; e.currentTarget.style.borderColor = '#00E5A0' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = 'var(--color-border-default)' }}
                  >
                    ⟳ 이력
                  </button>
                )}
                <button
                  onClick={() => setDayModalDate(null)}
                  style={{
                    width: 24, height: 24, borderRadius: 5,
                    border: '0.5px solid var(--color-border-default)',
                    background: 'transparent', color: '#555', fontSize: 14, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >×</button>
              </div>
            </div>

            {/* KPI */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6, padding: '12px 16px',
              borderBottom: '0.5px solid var(--color-border-default)',
            }}>
              {[
                { label: 'OCC', value: occ != null ? `${occ}%` : '—', color: occ != null ? _occColor(occ) : 'var(--color-text-secondary)' },
                {
                  label: 'ADR',
                  value: adrRev?.adr != null
                    ? rateUnit === 'k'
                      ? `${adrRev.adr}K`
                      : (adrRev.adr * 1000).toLocaleString('ko-KR')
                    : '—',
                  color: 'var(--color-text-primary)',
                },
                {
                  label: 'REV',
                  value: adrRev?.rev != null && adrRev.rev > 0
                    ? rateUnit === 'k'
                      ? adrRev.rev >= 1000000
                        ? `${(adrRev.rev / 1000000).toFixed(1)}M`
                        : `${Math.round(adrRev.rev / 1000)}K`
                      : adrRev.rev.toLocaleString('ko-KR')
                    : '—',
                  color: 'var(--color-text-primary)',
                },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--color-bg-tertiary)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9, color: '#555', fontWeight: 500, letterSpacing: '.05em', textTransform: 'uppercase' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 500, marginTop: 4, color: item.color }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {/* BAR Rate 섹션 */}
            <div style={{
              padding:        '10px 16px',
              borderBottom:   '0.5px solid var(--color-border-default)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
            }}>
              <div style={{
                fontSize:      10,
                fontWeight:    500,
                color:         '#555',
                letterSpacing: '.05em',
                textTransform: 'uppercase',
              }}>
                BAR Rate
              </div>
              {baseRateK != null ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {barDay?.rack_rate != null && barDay.rack_rate !== barDay.base_rate && (
                    <>
                      <span style={{ fontSize: 12, color: '#444', textDecoration: 'line-through' }}>
                        {fmtRate(barDay.rack_rate)}
                      </span>
                      <span style={{ fontSize: 10, color: '#ff8c50' }}>→</span>
                    </>
                  )}
                  <span style={{ fontSize: 16, fontWeight: 600, color: getRateColor(baseRateK) }}>
                    {fmtRate(barDay!.base_rate)}
                  </span>
                  {barDay?.rack_rate != null && barDay.rack_rate !== barDay.base_rate && (
                    <span style={{
                      fontSize:   11,
                      fontWeight: 500,
                      color:      barDay.base_rate > barDay.rack_rate ? '#00B883' : '#E24B4A',
                    }}>
                      {barDay.base_rate > barDay.rack_rate ? '▲' : '▼'}
                      {fmtRate(Math.abs(barDay.base_rate - barDay.rack_rate))}
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: 14, color: '#333' }}>—</span>
              )}
            </div>

            {/* 프로모션 요금 */}
            {dayPromos.length > 0 ? (
              <div style={{ padding: '12px 16px' }}>
                <div style={{
                  fontSize: 10, fontWeight: 500, color: '#555',
                  letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 8,
                }}>
                  프로모션 요금
                </div>
                {dayPromos.map(promo => {
                  const rate = getPromoRate(promo, _day)
                  return (
                    <div key={promo.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 0', borderBottom: '0.5px solid var(--color-border-default)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: (promo as any).color ?? '#00B883', flexShrink: 0,
                        }} />
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-primary)' }}>{promo.name}</div>
                          <div style={{ fontSize: 9, color: '#555', marginTop: 1 }}>
                            {promo.discount_type === 'pct'    ? `-${promo.discount_value}%`
                             : promo.discount_type === 'amount' ? `-${Math.round(promo.discount_value / 1000)}K`
                             : promo.discount_type === 'addon'  ? `+${Math.round(promo.discount_value / 1000)}K`
                             : `${Math.round(promo.discount_value / 1000)}K`}
                            {promo.room_type_code ? ` · ${promo.room_type_code}` : ' · 전 객실'}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: (promo as any).color ?? '#00B883' }}>
                        {fmtRate(rate)}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: 11, color: '#444' }}>
                적용 중인 프로모션이 없습니다
              </div>
            )}
          </div>
        </div>
      )
    })()}

    {/* 요금 변경 이력 모달 */}
    {historyModalDate && (() => {
      const rows = rateHistoryAll[historyModalDate] ?? []
      const d    = historyModalDate.slice(8, 10)
      return (
        <div
          style={{
            position:       'fixed',
            inset:          0,
            zIndex:         200,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            background:     'rgba(0,0,0,0.6)',
          }}
          onClick={() => setHistoryModalDate(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:    'var(--color-bg-secondary)',
              border:        '0.5px solid var(--color-border-default)',
              borderRadius:  12,
              width:         440,
              maxHeight:     '70vh',
              overflow:      'hidden',
              display:       'flex',
              flexDirection: 'column',
              boxShadow:     '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            {/* 헤더 */}
            <div style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '14px 16px',
              borderBottom:   '0.5px solid var(--color-border-default)',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  요금 변경 이력
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {month}월 {d}일
                </div>
              </div>
              <button
                onClick={() => setHistoryModalDate(null)}
                style={{ fontSize: 16, color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >×</button>
            </div>

            {/* 이력 목록 */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {rows.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  변경 이력이 없습니다
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '0.5px solid var(--color-border-default)' }}>
                      <th style={{ padding: '8px 16px', textAlign: 'left',   color: 'var(--color-text-secondary)', fontWeight: 500 }}>변경일</th>
                      <th style={{ padding: '8px 16px', textAlign: 'right',  color: 'var(--color-text-secondary)', fontWeight: 500 }}>변경 전</th>
                      <th style={{ padding: '8px 0',    textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 500, width: 24 }}></th>
                      <th style={{ padding: '8px 16px', textAlign: 'right',  color: 'var(--color-text-secondary)', fontWeight: 500 }}>변경 후</th>
                      <th style={{ padding: '8px 16px', textAlign: 'right',  color: 'var(--color-text-secondary)', fontWeight: 500 }}>변경 시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const diff = r.new_rate - r.old_rate
                      return (
                        <tr key={i} style={{ borderBottom: '0.5px solid var(--color-border-default)' }}>
                          <td style={{ padding: '8px 16px', color: 'var(--color-text-secondary)' }}>
                            {toKSTDateStr(r.created_at)}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', color: '#666', fontFamily: 'monospace' }}>
                            {Math.round(r.old_rate / 1000)}K
                          </td>
                          <td style={{ textAlign: 'center', color: '#ff8c50', fontSize: 10 }}>→</td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 500, color: diff > 0 ? '#00B883' : diff < 0 ? '#E24B4A' : 'var(--color-text-primary)' }}>
                            {Math.round(r.new_rate / 1000)}K
                            <span style={{ fontSize: 10, marginLeft: 4, fontWeight: 400 }}>
                              ({diff > 0 ? '+' : ''}{Math.round(diff / 1000)}K)
                            </span>
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                            {toKSTTimeStr(r.created_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )
    })()}
    </>
  )
}
