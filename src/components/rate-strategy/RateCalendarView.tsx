'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  generateCalendarDays, isFriOrSat, toDateStr, dayCellStyle, DOW_LABELS, getKSTDateString,
} from './BaseCalendar'
import { DayPanel } from './DayPanel'
import type { MonthPromo, PromoFormData } from './DayPanel'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'

// ── Types ─────────────────────────────────────────────────────────────────────

type RateEntry  = { current: number; prev?: number }
type PromoType  = 'disc' | 'pkg' | 'hot'

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
  row:            number
}


const MOCK_MONTH_PROMOS: MonthPromo[] = [
  {
    id: '1', name: '얼리버드', type: '정률', rooms: '전 객실', disc: '-10%', color: '#00B883',
    dateRange: '6/1~6/30',
    dates: ['2026-06-05', '2026-06-06', '2026-06-12', '2026-06-13'],
  },
  {
    id: '2', name: '2연박', type: '정률', rooms: 'DFT, SDB', disc: '-8%', color: '#534AB7',
    dateRange: '6/10~6/20',
    dates: ['2026-06-12', '2026-06-13'],
  },
  {
    id: '3', name: '주중특가', type: '정률', rooms: 'DFT', disc: '-5%', color: '#BA7517',
    dateRange: '6/7~6/8',
    dates: ['2026-06-07', '2026-06-08'],
  },
]

const EMPTY_PROMO_FORM: PromoFormData = {
  name: '', description: '', min_stay: '', max_stay: '',
  discount_type: 'pct', discount_value: '',
  stay_start: '', stay_end: '', sale_start: '', sale_end: '', status: 'active',
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PROMO_ROW_H = 22
const PROMO_PAD   = 5

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

// ── Component ─────────────────────────────────────────────────────────────────

export function RateCalendarView({
  year, month,
  occMap = {},
}: {
  year:    number
  month:   number
  occMap?: Record<string, number>
}) {
  const { currentHotel } = useHotel()
  const hotelId    = currentHotel?.id ?? ''
  const queryClient = useQueryClient()

  const [selectedDay,   setSelectedDay]   = useState<string>(() => {
    const today = getKSTDateString()
    const todayYear  = Number(today.slice(0, 4))
    const todayMonth = Number(today.slice(5, 7))
    const todayDay   = Number(today.slice(8, 10))
    if (todayYear === year && todayMonth === month) return toDateStr(year, month, todayDay)
    return toDateStr(year, month, 1)
  })
  const [selectedBar,   setSelectedBar]   = useState<number | null>(null)
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [rateMap,       setRateMap]       = useState<Record<string, RateEntry>>({})
  const [hoveredDate,   setHoveredDate]   = useState<string | null>(null)
  const [showAddPromo,  setShowAddPromo]  = useState(false)
  const [promoForm,     setPromoForm]     = useState<PromoFormData>(EMPTY_PROMO_FORM)
  const [monthPromos,   setMonthPromos]   = useState<MonthPromo[]>(MOCK_MONTH_PROMOS)

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
    setRateMap({})
    setSelectedDates([])
  }, [year, month])

  // ── DB 조회 ──────────────────────────────────────────────────────────────────

  const { data: barRates = [] } = useQuery<BarRateDay[]>({
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

  const { data: promoRaw = [] } = useQuery<Omit<CalPromo, 'row'>[]>({
    queryKey: ['promotion-calendar', hotelId, year, month],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_promotion_calendar', {
          p_hotel_id: hotelId,
          p_year:     year,
          p_month:    month,
        })
      if (error) throw error
      return data ?? []
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

  // ── 데이터 가공 ───────────────────────────────────────────────────────────────

  const barRateMap = useMemo<Record<number, BarRateDay>>(() => {
    return Object.fromEntries(
      barRates.map(r => [new Date(r.stay_date + 'T00:00:00').getDate(), r])
    )
  }, [barRates])

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
      return { ...p, row: r }
    })
  }, [promoRaw])

  const maxPromoRows    = calPromos.length > 0 ? Math.max(...calPromos.map(p => p.row)) + 1 : 0
  const promoAreaHeight = maxPromoRows > 0 ? maxPromoRows * PROMO_ROW_H + PROMO_PAD * 2 : 8

  const START_DOW = new Date(year, month - 1, 1).getDay()

  // ── 저장 ──────────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = selectedDates.map(date => ({
        hotel_id:       hotelId,
        stay_date:      date,
        room_type_code: 'BASE',
        date_type:      'single',
        new_rate:       selectedBar,
        strategy_id:    null,
      }))
      const { error } = await (supabase as any)
        .from('s02_rate_detail')
        .upsert(rows, { onConflict: 'hotel_id,stay_date', ignoreDuplicates: false })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bar-rate-calendar', hotelId] })
      setSelectedDates([])
      setRateMap({})
    },
  })

  const handleResetDates = () => {
    setSelectedDates([])
    setSelectedBar(null)
    setRateMap({})
  }

  // ── イベントハンドラ ──────────────────────────────────────────────────────────

  const handleDayClick = (dateStr: string) => {
    if (dateStr < getKSTDateString()) return
    const day = new Date(dateStr + 'T00:00:00').getDate()
    const barDay = barRateMap[day]
    setSelectedDay(dateStr)
    setSelectedDates(prev =>
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
    )
    if (barDay?.base_rate != null) {
      setSelectedBar(barDay.base_rate)
    }
  }

  const handlePromoFormChange = (field: string, val: string) => {
    setPromoForm(prev => ({ ...prev, [field]: val }))
  }

  const handleDeletePromo = (id: string) => {
    setMonthPromos(prev => prev.filter(p => p.id !== id))
  }

  // ── 프로모션 적용 요금 계산 (원 단위) ─────────────────────────────────────────

  function getPromoRate(p: CalPromo, day: number): number | null {
    const barDay = barRateMap[day]
    if (!barDay) return null
    const base = p.room_type_code
      ? (barDay.room_rates[p.room_type_code] ?? barDay.base_rate)
      : barDay.base_rate
    if (p.discount_type === 'pct')    return Math.round(base * (1 - p.discount_value / 100))
    if (p.discount_type === 'amount') return base - p.discount_value
    if (p.discount_type === 'fixed')  return p.discount_value
    if (p.discount_type === 'addon')  return base + p.discount_value
    return base
  }

  // ── 주 단위 분할 ──────────────────────────────────────────────────────────────

  const allDays = generateCalendarDays(year, month)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7))

  // ── 렌더 ──────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      height:       '100%',
      border:       '1px solid var(--color-border-default)',
      borderRadius: 12,
      overflow:     'hidden',
      background:   'var(--color-bg-secondary)',
      boxShadow:    'var(--shadow-card)',
      display:      'flex',
    }}>

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
            const nonNull      = weekDays.filter((d): d is number => d !== null)
            const weekStartDay = nonNull[0]  ?? 1
            const weekEndDay   = nonNull[nonNull.length - 1] ?? 1

            const weekPromos = calPromos.filter(p => {
              const s = new Date(p.stay_start + 'T00:00:00').getDate()
              const e = new Date(p.stay_end   + 'T00:00:00').getDate()
              return s <= weekEndDay && e >= weekStartDay
            })

            return (
              <div key={wIdx} style={{ marginBottom: 3 }}>

                {/* 날짜 셀 행 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
                  {weekDays.map((day, colIdx) => {
                    if (!day) return <div key={`e-${wIdx}-${colIdx}`} />
                    const dateStr      = toDateStr(year, month, day)
                    const isWeekend    = isFriOrSat(year, month, day)
                    const isSelected    = selectedDay === dateStr
                    const isInSelection = selectedDates.includes(dateStr)
                    const isHoverApply  = selectedBar !== null && hoveredDate === dateStr
                    const localEntry   = rateMap[dateStr]
                    const barDay       = barRateMap[day]
                    const occ          = occMap[dateStr] != null ? Math.round(occMap[dateStr]!) : null

                    // 표시 요금 (로컬 overide 우선, 없으면 RPC 데이터)
                    let baseRateK: number | null = null
                    let rackRateK: number | null = null
                    if (localEntry) {
                      baseRateK = localEntry.current
                      rackRateK = localEntry.prev ?? null
                    } else if (barDay) {
                      baseRateK = barDay.base_rate != null ? Math.round(barDay.base_rate / 1000) : null
                      rackRateK = barDay.rack_rate != null && barDay.rack_rate !== barDay.base_rate
                        ? Math.round(barDay.rack_rate / 1000)
                        : null
                    }

                    return (
                      <div
                        key={day}
                        onClick={() => handleDayClick(dateStr)}
                        onMouseEnter={() => setHoveredDate(dateStr)}
                        onMouseLeave={() => setHoveredDate(null)}
                        style={dayCellStyle(year, month, day, {
                          padding:       '6px 7px 5px',
                          overflow:      'hidden',
                          cursor:        'pointer',
                          minHeight:     80,
                          display:       'flex',
                          flexDirection: 'column',
                          outline:       isInSelection ? '2px solid #00E5A0' : isSelected ? '1.5px dashed rgba(0,229,160,0.4)' : undefined,
                          ...(isHoverApply ? { background: 'rgba(0,229,160,0.10)' } : {}),
                        })}
                      >
                        {/* 날짜 숫자 */}
                        <span style={{ fontSize: 11, fontWeight: 600, color: isWeekend ? '#00e5a0' : '#777' }}>
                          {day}
                        </span>

                        {/* BAR Rate */}
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#ddd', marginTop: 3, minHeight: 16 }}>
                          {baseRateK != null ? (
                            <>
                              <span style={{ color: getRateColor(baseRateK) }}>{baseRateK}K</span>
                              {rackRateK != null && (
                                <span style={{ fontSize: 9, color: '#ff8c50', textDecoration: 'line-through', marginLeft: 4 }}>
                                  {rackRateK}K
                                </span>
                              )}
                            </>
                          ) : '—'}
                        </div>

                        {/* OCC 바 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 'auto' }}>
                          <div style={{ flex: 1, height: 3, borderRadius: 99, background: '#2a2a2a', overflow: 'hidden' }}>
                            {occ !== null && (
                              <div style={{ height: 3, borderRadius: 99, width: `${Math.min(100, occ)}%`, background: occColor(occ) }} />
                            )}
                          </div>
                          <span style={{ fontSize: 9, color: '#555', minWidth: 22, textAlign: 'right' }}>
                            {occ !== null ? `${occ}%` : '—'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 프로모션 바 행 */}
                <div
                  style={{
                    position:     'relative',
                    height:       promoAreaHeight,
                    background:   '#131313',
                    borderBottom: '1px solid var(--color-border-default)',
                    marginTop:    2,
                  }}
                >
                  {/* 세로 구분선 */}
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', pointerEvents: 'none' }}>
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} style={{ borderRight: i < 6 ? '1px solid #1e1e1e' : 'none', height: '100%' }} />
                    ))}
                  </div>

                  {/* 프로모션 바 */}
                  {weekPromos.map(p => {
                    const pS   = new Date(p.stay_start + 'T00:00:00').getDate()
                    const pE   = new Date(p.stay_end   + 'T00:00:00').getDate()
                    const visS = Math.max(pS, weekStartDay)
                    const visE = Math.min(pE, weekEndDay)
                    if (visS > visE) return null

                    const colS      = (visS - 1 + START_DOW) % 7
                    const colE      = (visE - 1 + START_DOW) % 7
                    const spanCols  = colE - colS + 1
                    const showLabel = visS === pS || colS === 0
                    const topPx     = PROMO_PAD + p.row * PROMO_ROW_H

                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedDay(toDateStr(year, month, visS))}
                        style={{
                          position:     'absolute',
                          height:       18,
                          borderRadius: 3,
                          display:      'flex',
                          alignItems:   'center',
                          overflow:     'hidden',
                          cursor:       'pointer',
                          left:         `calc(${(colS / 7) * 100}% + 2px)`,
                          width:        `calc(${(spanCols / 7) * 100}% - 4px)`,
                          top:          topPx,
                          ...promoBarStyle(p.promo_type),
                        }}
                      >
                        {showLabel && (
                          <span style={{
                            fontSize:   9,
                            fontWeight: 500,
                            padding:    '0 5px',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                            color:      promoLabelColor(p.promo_type),
                          }}>
                            {p.name}
                          </span>
                        )}
                        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                          {Array.from({ length: spanCols }, (_, i) => {
                            const d    = visS + i
                            const rate = getPromoRate(p, d)
                            return (
                              <div key={d} style={{
                                flex:           1,
                                display:        'flex',
                                alignItems:     'center',
                                justifyContent: 'center',
                                fontSize:       9,
                                fontWeight:     500,
                                borderLeft:     (i > 0 || showLabel) ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                whiteSpace:     'nowrap',
                                color:          promoRateColor(p.promo_type),
                              }}>
                                {rate !== null ? `${Math.round(rate / 1000)}K` : '—'}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

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
          onDeletePromo={handleDeletePromo}
          hotelId={hotelId}
          year={year}
          month={month}
          roomTypes={roomTypes}
          selectedDates={selectedDates}
          onSave={() => saveMutation.mutate()}
          onResetDates={handleResetDates}
          isSaving={saveMutation.isPending}
        />
      </div>

    </div>
  )
}
