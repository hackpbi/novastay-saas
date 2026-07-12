'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toLocalYMD } from '@/utils/dateLocal'
import { useHotel } from '@/contexts/HotelContext'
import {
  generateCalendarDays, isFriOrSat, getDow, toDateStr, dayCellStyle, DOW_LABELS,
} from './BaseCalendar'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PromoRow {
  id:              string
  name:            string
  discount_type:   string
  discount_value:  number
  room_type_codes: string[] | null
  stay_start:      string
  stay_end:        string
  sale_start:      string | null
  sale_end:        string | null
  status:          string
  color?:          string   // promoColorById로 계산
}

interface RoomType {
  room_type_code: string
  surcharge:      number | null
}

// 프로모션 색상 (ID 기반 고정)
const PROMO_COLORS = [
  '#00B883', '#534AB7', '#BA7517', '#E24B4A',
  '#185FA5', '#0F6E56', '#993556', '#638522',
]
// 지난 프로모션 전용 — active 보다 채도 낮은 회색 계열
const PAST_COLORS = ['#888', '#999', '#aaa', '#777', '#bbb', '#666']
function promoColorById(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return PROMO_COLORS[Math.abs(hash) % PROMO_COLORS.length]
}

// 상세 패널용 포맷 헬퍼
function fmtDiscValue(dt: string, dv: number): string {
  return dt === 'pct'    ? `-${dv}%`
       : dt === 'amount' ? `-${Math.round(dv / 1000)}K`
       : dt === 'addon'  ? `+${Math.round(dv / 1000)}K`
       : `${Math.round(dv / 1000)}K`
}
function discLabel(dt: string): string {
  return dt === 'pct'    ? '정률 할인'
       : dt === 'amount' ? '정액 할인'
       : dt === 'addon'  ? '추가 금액'
       : '고정 요금'
}
function fmtPeriod(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || start === '2000-01-01') return '상시'
  return `${start} ~ ${end ?? ''}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PromoCalendarView({ year, month, onPrevMonth, onNextMonth, onToday }: {
  year:         number
  month:        number
  onPrevMonth?: () => void
  onNextMonth?: () => void
  onToday?:     () => void
}) {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [selectedPromo, setSelectedPromo] = useState<PromoRow | null>(null)
  const [showPastPromos, setShowPastPromos] = useState(false)   // 지난(inactive) 프로모션 오버레이 토글

  useEffect(() => {
    setSelectedDay(null)
    setSelectedPromo(null)
  }, [year, month])

  useEffect(() => {
    if (!selectedDay && !selectedPromo) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelectedDay(null); setSelectedPromo(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedDay, selectedPromo])

  // ── 데이터 조회 ──────────────────────────────────────────────────────────────

  // 프로모션 조회
  const { data: promos = [] } = useQuery<PromoRow[]>({
    queryKey: ['promo-calendar-view', hotelId, year, month],
    queryFn: async () => {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate   = toLocalYMD(new Date(year, month, 0))
      const { data, error } = await (supabase as any)
        .from('s03_rate_promotion')
        .select('id, name, discount_type, discount_value, room_type_codes, stay_start, stay_end, sale_start, sale_end, status')
        .eq('hotel_id', hotelId)
        .eq('status', 'active')
        .lte('stay_start', endDate)
        .gte('stay_end',   startDate)
        .order('stay_start', { ascending: true })
      if (error) throw error
      return (data ?? []).map((p: any) => ({
        ...p,
        color: promoColorById(p.id),
      }))
    },
    enabled: !!hotelId,
  })

  // 객실타입 조회 (적용 요금 계산용 — surcharge 필요. RateCalendarView 와 select 가 달라 키 분리)
  const { data: roomTypes = [] } = useQuery<RoomType[]>({
    queryKey: ['c01_room_types_promo', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c01_room_types')
        .select('room_type_code, surcharge')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
        .order('surcharge', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
  })

  // BAR Rate 조회
  const { data: barRates = [] } = useQuery<{ stay_date: string; base_rate: number }[]>({
    queryKey: ['bar-rate-calendar', hotelId, year, month],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_bar_rate_calendar', {
          p_hotel_id: hotelId,
          p_year:     year,
          p_month:    month,
        })
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId,
  })

  // BAR Rate 맵 (day → base_rate). KST 기준 day 추출
  const barRateMap = useMemo<Record<number, number>>(() => {
    return Object.fromEntries(
      barRates.map((r: any) => [
        new Date(r.stay_date + 'T00:00:00').getDate(),
        r.base_rate,
      ])
    )
  }, [barRates])

  // ── 날짜별 프로모션 맵 ─────────────────────────────────────────────────────────
  const promosByDate = useMemo<Record<string, PromoRow[]>>(() => {
    const map: Record<string, PromoRow[]> = {}
    const daysInMonth = new Date(year, month, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      map[dateStr] = promos.filter(p => dateStr >= p.stay_start && dateStr <= p.stay_end)
    }
    return map
  }, [promos, year, month])

  // ── Gantt 레인 배치 ────────────────────────────────────────────────────────────
  // 겹치지 않는 프로모션은 같은 레인을 공유(그리디 패킹) → 다일 바가 가로로 정렬되어 이어짐
  const { laneOf, laneCount } = useMemo(() => {
    const laneEnds: string[] = []          // 레인별 마지막 stay_end
    const laneOf: Record<string, number> = {}
    for (const p of promos) {              // promos 는 stay_start 오름차순
      let placed = laneEnds.findIndex(end => p.stay_start > end)
      if (placed === -1) { placed = laneEnds.length; laneEnds.push(p.stay_end) }
      else laneEnds[placed] = p.stay_end
      laneOf[p.id] = placed
    }
    return { laneOf, laneCount: laneEnds.length }
  }, [promos])

  // ── 지난(inactive) 프로모션 — showPastPromos 토글 시에만 조회/오버레이 ──────────────
  const { data: pastPromos = [] } = useQuery<PromoRow[]>({
    queryKey: ['promo-calendar-view-past', hotelId, year, month],
    queryFn: async () => {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate   = toLocalYMD(new Date(year, month, 0))
      const { data, error } = await (supabase as any)
        .from('s03_rate_promotion')
        .select('id, name, discount_type, discount_value, room_type_codes, stay_start, stay_end, sale_start, sale_end, status')
        .eq('hotel_id', hotelId)
        .eq('status', 'inactive')
        .lte('stay_start', endDate)
        .gte('stay_end',   startDate)
        .order('stay_start', { ascending: true })
      if (error) throw error
      return (data ?? []).map((p: any) => ({ ...p, color: promoColorById(p.id) }))
    },
    enabled: !!hotelId && showPastPromos,
  })

  // 지난 fixed 프로모션 실요금 (s06_rate_custom) — 토글 ON 시에만 조회
  const { data: pastCustomRates = [] } = useQuery<{ promotion_id: string; stay_date: string; rate: number }[]>({
    queryKey: ['promo-calendar-view-past-custom', hotelId, year, month],
    queryFn: async () => {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate   = toLocalYMD(new Date(year, month, 0))
      const { data, error } = await (supabase as any)
        .from('s06_rate_custom')
        .select('promotion_id, stay_date, rate')
        .eq('hotel_id', hotelId)
        .gte('stay_date', startDate)
        .lte('stay_date', endDate)
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId && showPastPromos,
  })

  // promotion_id + stay_date 기준 첫 번째 행 rate
  const pastCustomFirstRate = useMemo<Record<string, number>>(() => {
    const result: Record<string, number> = {}
    for (const r of pastCustomRates) {
      const key = `${r.promotion_id}_${r.stay_date}`
      if (result[key] == null) result[key] = r.rate
    }
    return result
  }, [pastCustomRates])

  const pastByDate = useMemo<Record<string, PromoRow[]>>(() => {
    const map: Record<string, PromoRow[]> = {}
    if (!showPastPromos) return map
    const daysInMonth = new Date(year, month, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      map[dateStr] = pastPromos.filter(p => dateStr >= p.stay_start && dateStr <= p.stay_end)
    }
    return map
  }, [pastPromos, showPastPromos, year, month])

  const { pastLaneOf, pastLaneCount, pastColorOf } = useMemo(() => {
    const laneEnds: string[] = []
    const pastLaneOf: Record<string, number> = {}
    const pastColorOf: Record<string, string> = {}
    pastPromos.forEach((p, i) => {
      let placed = laneEnds.findIndex(end => p.stay_start > end)
      if (placed === -1) { placed = laneEnds.length; laneEnds.push(p.stay_end) }
      else laneEnds[placed] = p.stay_end
      pastLaneOf[p.id] = placed
      pastColorOf[p.id] = PAST_COLORS[i % PAST_COLORS.length]
    })
    return { pastLaneOf, pastLaneCount: laneEnds.length, pastColorOf }
  }, [pastPromos])

  // ── 객실타입별 적용 요금 계산 ──────────────────────────────────────────────────
  function getRoomRates(promo: PromoRow, day: number) {
    const targetRooms = promo.room_type_codes?.length
      ? roomTypes.filter(rt => promo.room_type_codes!.includes(rt.room_type_code))
      : roomTypes
    const barRate = barRateMap[day]
    return targetRooms.map(rt => {
      const base = barRate != null ? barRate + (rt.surcharge ?? 0) : null
      let final: number | null = null
      if (base != null) {
        if (promo.discount_type === 'pct')
          final = Math.round(base * (1 - promo.discount_value / 100))
        else if (promo.discount_type === 'amount')
          final = base - promo.discount_value
        else if (promo.discount_type === 'addon')
          final = base + promo.discount_value
        else if (promo.discount_type === 'fixed')
          final = promo.discount_value
        else
          final = base
      }
      return {
        room_type_code: rt.room_type_code,
        bar:            base,
        final,
        disc:           promo.discount_type === 'pct'
          ? `-${promo.discount_value}%`
          : promo.discount_type === 'amount'
            ? `-${Math.round(promo.discount_value / 1000)}K`
            : promo.discount_type === 'addon'
              ? `+${Math.round(promo.discount_value / 1000)}K`
              : `${Math.round(promo.discount_value / 1000)}K`,
      }
    })
  }

  const days               = generateCalendarDays(year, month)
  const selectedDateStr    = selectedDay ? toDateStr(year, month, selectedDay) : null
  const selectedDayPromos  = selectedDateStr ? (promosByDate[selectedDateStr] ?? []) : []

  return (
    <div style={{
      position:     'relative',
      height:       '100%',
      border:       '1px solid var(--color-border-default)',
      borderRadius: 12,
      overflow:     'hidden',
      background:   'var(--color-bg-secondary)',
      boxShadow:    'var(--shadow-card)',
      display:      'flex',
      flexDirection:'column',
    }}>
      {/* 달력 */}
      <div style={{ padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 캘린더 헤더 — 월 네비는 상단 통합 헤더로 이동. 오늘 / 지난 프로모션 버튼만 유지 */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 30, marginBottom: 4, flexShrink: 0 }}>
          <button onClick={() => onToday?.()}
            style={{ position: 'absolute', left: 14, fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '0.5px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>오늘</button>
          {/* 지난 프로모션 토글 — 우측 절대 배치 */}
          <button
            onClick={() => setShowPastPromos(v => !v)}
            style={{
              position: 'absolute', right: 14,
              fontSize: 11, padding: '3px 11px', borderRadius: 999, cursor: 'pointer', fontWeight: 500,
              transition: 'all 0.15s',
              border: showPastPromos ? '1px solid rgba(245,158,11,0.5)' : '1px solid var(--color-border-default)',
              background: showPastPromos ? 'rgba(245,158,11,0.1)' : 'transparent',
              color: showPastPromos ? '#F59E0B' : 'var(--color-text-secondary)',
            }}
          >지난 프로모션</button>
        </div>

        {/* 프로모션 범례 */}
        {(promos.length > 0 || (showPastPromos && pastPromos.length > 0)) && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 4,
            padding: '4px 2px 8px', flexShrink: 0,
          }}>
            {promos.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{p.name}</span>
              </div>
            ))}
            {showPastPromos && pastPromos.map(p => (
              <div key={`past-${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.6 }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, border: `1px dashed ${pastColorOf[p.id]}`, background: 'transparent', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', textDecoration: 'line-through' }}>{p.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* 요일 헤더 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 2 }}>
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

        {/* 날짜 그리드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: '1fr', gap: 3, flex: 1 }}>
          {days.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />
            const dateStr    = toDateStr(year, month, day)
            const promos     = promosByDate[dateStr] ?? []
            const dayPast    = showPastPromos ? (pastByDate[dateStr] ?? []) : []
            const isWeekend  = isFriOrSat(year, month, day)

            return (
              <div
                key={day}
                onClick={() => setSelectedDay(day)}
                style={dayCellStyle(year, month, day, { padding: '6px 8px', overflow: 'hidden' })}
              >
                <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 4, color: isWeekend ? '#00B883' : undefined }}>
                  {day}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {Array.from({ length: laneCount }).map((_, lane) => {
                    const p = promos.find(pp => laneOf[pp.id] === lane)
                    if (!p) return <div key={lane} style={{ height: 13 }} />
                    const isStart = dateStr === p.stay_start
                    const isEnd   = dateStr === p.stay_end
                    return (
                      <div
                        key={p.id}
                        title={p.name}
                        onClick={e => { e.stopPropagation(); setSelectedPromo(p) }}
                        style={{
                          height:        13,
                          display:       'flex',
                          alignItems:    'center',
                          padding:       '0 6px',
                          fontSize:      9,
                          fontWeight:    600,
                          whiteSpace:    'nowrap',
                          overflow:      'hidden',
                          textOverflow:  'ellipsis',
                          cursor:        'pointer',
                          transition:    'opacity 0.15s',
                          background:    `${p.color}25`,
                          color:         p.color,
                          borderTopLeftRadius:     isStart ? 3 : 0,
                          borderBottomLeftRadius:  isStart ? 3 : 0,
                          borderTopRightRadius:    isEnd ? 3 : 0,
                          borderBottomRightRadius: isEnd ? 3 : 0,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                      >
                        {isStart ? p.name : ''}
                      </div>
                    )
                  })}

                  {/* 지난 프로모션 오버레이 바 (점선·배경 없음) */}
                  {showPastPromos && Array.from({ length: pastLaneCount }).map((_, lane) => {
                    const p = dayPast.find(pp => pastLaneOf[pp.id] === lane)
                    if (!p) return <div key={`past-${lane}`} style={{ height: 13 }} />
                    const isStart = dateStr === p.stay_start
                    const isEnd   = dateStr === p.stay_end
                    const pc = pastColorOf[p.id]
                    // 하이브리드: fixed 타입은 s06_rate_custom 실요금, 나머지는 할인율/액
                    const pastCustomRate = p.discount_type === 'fixed'
                      ? pastCustomFirstRate[`${p.id}_${dateStr}`]
                      : undefined
                    const pastLabel = pastCustomRate != null
                      ? `${Math.round(pastCustomRate / 1000)}K`
                      : fmtDiscValue(p.discount_type, p.discount_value)
                    return (
                      <div
                        key={`past-${p.id}`}
                        title={p.name}
                        onClick={e => { e.stopPropagation(); setSelectedPromo(p) }}
                        style={{
                          height:        13,
                          display:       'flex',
                          alignItems:    'center',
                          padding:       '0 5px',
                          fontSize:      9,
                          fontWeight:    600,
                          whiteSpace:    'nowrap',
                          overflow:      'hidden',
                          textOverflow:  'ellipsis',
                          cursor:        'pointer',
                          opacity:       0.5,
                          background:    'transparent',
                          color:         pc,
                          borderTop:     `1px dashed ${pc}`,
                          borderBottom:  `1px dashed ${pc}`,
                          borderLeft:    isStart ? `1px dashed ${pc}` : 'none',
                          borderRight:   isEnd ? `1px dashed ${pc}` : 'none',
                          borderTopLeftRadius:     isStart ? 3 : 0,
                          borderBottomLeftRadius:  isStart ? 3 : 0,
                          borderTopRightRadius:    isEnd ? 3 : 0,
                          borderBottomRightRadius: isEnd ? 3 : 0,
                        }}
                      >
                        {isStart ? `${p.name} ${pastLabel}` : ''}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 날짜 클릭 모달 */}
      {selectedDay && (
        <div
          onClick={() => setSelectedDay(null)}
          style={{
            position:       'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background:     'rgba(0,0,0,0.5)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            zIndex:         200,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:   'var(--color-bg-elevated)',
              border:       '0.5px solid var(--color-border-secondary)',
              borderRadius: '12px',
              width:        440,
              maxHeight:    '80vh',
              overflowY:    'auto',
            }}
          >
            {/* 모달 헤더 */}
            <div style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '14px 16px',
              borderBottom:   '0.5px solid var(--color-border-default)',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  {year}년 {month}월 {selectedDay}일
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {getDow(year, month, selectedDay)}요일 · 프로모션 {selectedDayPromos.length}개
                </div>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                style={{
                  width: 26, height: 26,
                  borderRadius: '6px',
                  border:       '0.5px solid var(--color-border-default)',
                  background:   'transparent',
                  cursor:       'pointer',
                  color:        'var(--color-text-secondary)',
                  fontSize:     14,
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>

            {/* 프로모션 카드 목록 */}
            {selectedDayPromos.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                이 날짜에 적용된 프로모션이 없습니다
              </div>
            ) : selectedDayPromos.map(promo => {
              const roomRates = getRoomRates(promo, selectedDay!)
              return (
                <div key={promo.id} style={{
                  margin:       '10px 14px',
                  border:       `0.5px solid ${promo.color}44`,
                  borderRadius: '6px',
                  overflow:     'hidden',
                }}>
                  {/* 카드 헤더 */}
                  <div style={{
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'space-between',
                    padding:        '8px 12px',
                    background:     `${promo.color}11`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: promo.color }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                          {promo.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 1 }}>
                          {promo.discount_type === 'pct'    ? `${promo.discount_value}% 할인` :
                           promo.discount_type === 'amount' ? `${Math.round(promo.discount_value / 1000)}K 할인` :
                           promo.discount_type === 'addon'  ? `+${Math.round(promo.discount_value / 1000)}K` :
                           '고정 요금'}
                          {' · '}
                          {promo.room_type_codes?.length
                            ? promo.room_type_codes.slice(0, 3).join(', ') + (promo.room_type_codes.length > 3 ? ` 외 ${promo.room_type_codes.length - 3}개` : '')
                            : '전 객실'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 객실타입별 요금 테이블 */}
                  {roomRates.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '0.5px solid var(--color-border-default)' }}>
                          {['객실타입', 'BAR Rate', '할인', '적용 요금'].map((h, i) => (
                            <th key={h} style={{
                              fontSize:   10,
                              color:      'var(--color-text-secondary)',
                              padding:    '5px 12px',
                              textAlign:  i === 0 ? 'left' : 'right',
                              fontWeight: 400,
                            }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {roomRates.map((r, i) => (
                          <tr key={r.room_type_code} style={{
                            borderBottom: i < roomRates.length - 1
                              ? '0.5px solid var(--color-border-default)'
                              : 'none',
                          }}>
                            <td style={{ fontSize: 11, padding: '6px 12px', color: 'var(--color-text-primary)' }}>
                              {r.room_type_code}
                            </td>
                            <td style={{ fontSize: 11, padding: '6px 12px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                              {r.bar != null ? `${Math.round(r.bar / 1000)}K` : '—'}
                            </td>
                            <td style={{ fontSize: 11, padding: '6px 12px', textAlign: 'right', color: promo.color }}>
                              {r.disc}
                            </td>
                            <td style={{ fontSize: 11, padding: '6px 12px', textAlign: 'right', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                              {r.final != null ? `${Math.round(r.final / 1000)}K` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}

            {/* 모달 푸터 */}
            <div style={{
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'center',
              padding:        '10px 14px',
              borderTop:      '0.5px solid var(--color-border-default)',
            }}>
              <button style={{
                fontSize:     11,
                padding:      '5px 11px',
                borderRadius: '6px',
                border:       '0.5px solid var(--color-border-default)',
                background:   'transparent',
                color:        'var(--color-text-primary)',
                cursor:       'pointer',
                display:      'inline-flex',
                alignItems:   'center',
                gap:          4,
              }}>
                + 프로모션 추가
              </button>
              <button
                onClick={() => setSelectedDay(null)}
                style={{
                  fontSize:     11,
                  padding:      '5px 14px',
                  borderRadius: '6px',
                  border:       'none',
                  background:   '#00E5A0',
                  color:        '#04342C',
                  fontWeight:   500,
                  cursor:       'pointer',
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 프로모션 상세 — 우측 슬라이드인 패널 (조회 전용) */}
      <div style={{
        position:      'absolute',
        top: 0, right: 0, bottom: 0,
        width:         300,
        background:    'var(--color-bg-elevated)',
        borderLeft:    '0.5px solid var(--color-border-secondary)',
        boxShadow:     '-8px 0 24px rgba(0,0,0,0.25)',
        transform:     selectedPromo ? 'translateX(0)' : 'translateX(100%)',
        transition:    'transform 0.25s ease',
        zIndex:        50,
        display:       'flex',
        flexDirection: 'column',
        pointerEvents: selectedPromo ? 'auto' : 'none',
      }}>
        {selectedPromo && (
          <>
            {/* 헤더 */}
            <div style={{
              display: 'flex', alignItems: 'center',
              padding: '12px 14px', borderBottom: '0.5px solid var(--color-border-default)',
            }}>
              <button
                onClick={() => setSelectedPromo(null)}
                style={{
                  fontSize: 12, padding: '4px 8px', borderRadius: 6,
                  border: '0.5px solid var(--color-border-default)', background: 'transparent',
                  color: 'var(--color-text-secondary)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >← 목록으로</button>
            </div>

            {/* 본문 */}
            <div style={{ padding: '14px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: selectedPromo.color, flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {selectedPromo.name}
                </span>
              </div>

              {([
                ['할인 방식', discLabel(selectedPromo.discount_type)],
                ['할인값',    fmtDiscValue(selectedPromo.discount_type, selectedPromo.discount_value)],
                ['적용 객실', selectedPromo.room_type_codes?.length ? selectedPromo.room_type_codes.join(', ') : '전 객실'],
                ['투숙 기간', fmtPeriod(selectedPromo.stay_start, selectedPromo.stay_end)],
                ['판매 기간', fmtPeriod(selectedPromo.sale_start, selectedPromo.sale_end)],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  padding: '8px 0', borderBottom: '0.5px solid var(--color-border-default)',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
