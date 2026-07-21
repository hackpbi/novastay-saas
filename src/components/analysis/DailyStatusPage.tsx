'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { supabase } from '@/lib/supabase'
import { fetchForecastSchema } from '@/lib/forecast/schema'
import { todayLocalYMD } from '@/utils/dateLocal'
import DailyStatusChart, { type EventItem } from './DailyStatusChart'
import DailyStatusModal from './DailyStatusModal'
import DayOfWeekModal from './DayOfWeekModal'

const MINT = '#00E5A0'
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

interface DailyRow { business_date: string; nights: number; room_revenue: number }
interface DayAgg   { rn: number[]; rev: number[] }   // index 0 = 1일

function emptyAgg(days: number): DayAgg {
  return { rn: Array(days).fill(0), rev: Array(days).fill(0) }
}

export default function DailyStatusPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  const { otbDate: globalOtbDate, vsOtbDate } = useDateContext()   // 글로벌 헤더의 master OTB 날짜
  const otbDate = globalOtbDate || todayLocalYMD()                 // 로드 전 fallback
  const [currentMonth, setCurrentMonth] = useState<{ year: number; month: number }>(() => {
    const t = new Date()
    return { year: t.getFullYear(), month: t.getMonth() + 1 }
  })
  const [modalDay, setModalDay] = useState<number | null>(null)
  const [showDow, setShowDow] = useState(false)
  const [lyMode, setLyMode] = useState<'date' | 'match'>('date')   // 전년동일자 / 전년동기간(yoy_match)
  const [showOcc, setShowOcc] = useState(true)   // OCC% 표시 (올해/LY 공유)
  const [showAdr, setShowAdr] = useState(true)   // ADR 표시 (올해/LY 공유)
  const [showBar, setShowBar] = useState(true)   // BAR Rate 표시 (올해 차트만)

  const { year, month } = currentMonth
  const days       = new Date(year, month, 0).getDate()
  const monthStart = `${year}-${pad(month)}-01`
  const monthEnd   = `${year}-${pad(month)}-${pad(days)}`

  // Actual/OTB 구분을 월 단위로: 보고 있는 월 < otbDate 월 → 전체 Actual, 같거나 이후 → 전체 OTB
  const otbYear   = parseInt(otbDate.slice(0, 4), 10)
  const otbMonth  = parseInt(otbDate.slice(5, 7), 10)
  const isActualMonth = year < otbYear || (year === otbYear && month < otbMonth)
  const isOTBMonth    = !isActualMonth

  const goPrev = () => setCurrentMonth(p => (p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 }))
  const goNext = () => setCurrentMonth(p => (p.month === 12 ? { year: p.year + 1, month: 1 } : { year: p.year, month: p.month + 1 }))

  // roomCount
  const { data: schema } = useQuery({
    queryKey: ['ds-schema', hotelId],
    queryFn:  () => fetchForecastSchema(hotelId),
    enabled:  !!hotelId,
  })
  const roomCount = schema?.roomCount ?? 0

  // c06_calendar (당월) — 이벤트 + yoy_match
  const { data: calRows = [] } = useQuery({
    queryKey: ['ds-cal', year, month],
    queryFn:  async () => {
      const { data } = await (supabase as any)
        .from('c06_calendar').select('date, event, yoy_match')
        .gte('date', monthStart).lte('date', monthEnd)
      return (data ?? []) as { date: string; event: string | null; yoy_match: string | null }[]
    },
  })

  // 당해년도 — Actual(a01) + OTB(a02) 병합
  const { data: curAgg } = useQuery({
    queryKey: ['ds-cur', hotelId, year, month, otbDate, vsOtbDate],
    enabled:  !!hotelId,
    queryFn:  async () => {
      const agg = emptyAgg(days)

      // 이전 월 → 전체 Actual (a01_actual_daily)
      if (isActualMonth) {
        const { data } = await (supabase as any).from('a01_actual_daily')
          .select('business_date, nights, room_revenue')
          .eq('hotel_id', hotelId).gte('business_date', monthStart).lte('business_date', monthEnd)
        for (const r of (data ?? []) as DailyRow[]) {
          const d = Number(r.business_date.slice(8, 10))
          if (d >= 1 && d <= days) { agg.rn[d - 1] += r.nights ?? 0; agg.rev[d - 1] += r.room_revenue ?? 0 }
        }
        return agg
      }

      // 당월 이상 → 전체 OTB (get_pickup_data) — 단일 조회
      const { data } = await (supabase as any).rpc('get_pickup_data', {
        p_hotel_id: hotelId, p_otb_date: otbDate, p_vs_otb_date: vsOtbDate || otbDate, p_min_date: monthStart,
      })
      for (const r of (data ?? []) as { business_date: string; otb_nights: number; otb_revenue: number }[]) {
        if (r.business_date < monthStart || r.business_date > monthEnd) continue
        const d = Number(r.business_date.slice(8, 10))
        if (d >= 1 && d <= days) { agg.rn[d - 1] += r.otb_nights ?? 0; agg.rev[d - 1] += r.otb_revenue ?? 0 }
      }
      return agg
    },
  })

  // 전년(LY) — c06 yoy_match로 매핑한 날짜의 Actual(a01)
  const lyDateByDay = useMemo(() => {
    const byDate = new Map(calRows.map(r => [r.date, r.yoy_match]))
    const arr: string[] = []
    for (let d = 1; d <= days; d++) {
      const date   = `${year}-${pad(month)}-${pad(d)}`
      const simple = `${year - 1}-${pad(month)}-${pad(d)}`   // 전년 동일자
      // 'match' = yoy_match(이동 공휴일 반영, 없으면 -1년 fallback), 'date' = 단순 -1년
      arr.push(lyMode === 'match' ? (byDate.get(date) || simple) : simple)
    }
    return arr
  }, [calRows, year, month, days, lyMode])

  const { data: lyAgg } = useQuery({
    queryKey: ['ds-ly', hotelId, year, month, lyDateByDay.join(',')],
    enabled:  !!hotelId && lyDateByDay.length > 0,
    queryFn:  async () => {
      const { data } = await (supabase as any).from('a01_actual_daily')
        .select('business_date, nights, room_revenue')
        .eq('hotel_id', hotelId).in('business_date', lyDateByDay)
      const map = new Map<string, { rn: number; rev: number }>()
      for (const r of (data ?? []) as DailyRow[]) {
        const c = map.get(r.business_date) ?? { rn: 0, rev: 0 }; c.rn += r.nights ?? 0; c.rev += r.room_revenue ?? 0; map.set(r.business_date, c)
      }
      const agg = emptyAgg(days)
      lyDateByDay.forEach((ly, i) => { const v = map.get(ly); if (v) { agg.rn[i] = v.rn; agg.rev[i] = v.rev } })
      return agg
    },
  })

  // LY 이벤트 (매핑된 날짜의 c06 event)
  const { data: lyEvents = [] } = useQuery({
    queryKey: ['ds-ly-ev', lyDateByDay.join(',')],
    enabled:  lyDateByDay.length > 0,
    queryFn:  async () => {
      const { data } = await (supabase as any).from('c06_calendar').select('date, event').in('date', lyDateByDay)
      const evByDate = new Map((data ?? []).map((r: any) => [r.date, r.event]))
      const out: EventItem[] = []
      lyDateByDay.forEach((ly, i) => {
        const ev = evByDate.get(ly)
        if (typeof ev === 'string' && ev.trim() !== '' && ev.trim().toLowerCase() !== 'null') out.push({ day: i + 1, name: ev })
      })
      return out
    },
  })

  // BAR Rate (당월) — s02_rate_detail new_rate (Rate Strategy와 동일 소스)
  // room_type_code='BASE'만 조회: 대표 BAR 요금 행(룸타입별 rack rate 제외) → 행수 급감(1000행 한도 회피) + 정확도↑
  // date_type 우선순위: change > single > base (조회 후 우선순위 선택)
  const { data: barRows = [] } = useQuery({
    queryKey: ['ds-bar', hotelId, year, month],
    enabled:  !!hotelId,
    queryFn:  async () => {
      const { data } = await (supabase as any).from('s02_rate_detail')
        .select('stay_date, new_rate, date_type')
        .eq('hotel_id', hotelId).eq('room_type_code', 'BASE')
        .gte('stay_date', monthStart).lte('stay_date', monthEnd)
        .order('stay_date', { ascending: true })
      return (data ?? []) as { stay_date: string; new_rate: number; date_type: string }[]
    },
  })
  // otbDate 이전은 null (BAR는 기준일 이후 미래 요금)
  const barData = useMemo<(number | null)[]>(() => {
    // date_type 우선순위: change(0) > single(1) > base(2)
    const dtPriority: Record<string, number> = { change: 0, single: 1, base: 2 }
    const m: Record<string, { rate: number; priority: number }> = {}
    for (const r of barRows) {
      const p = dtPriority[r.date_type] ?? 99
      const existing = m[r.stay_date]
      if (!existing || p < existing.priority) m[r.stay_date] = { rate: r.new_rate, priority: p }
    }
    return Array.from({ length: days }, (_, i) => {
      const date = `${year}-${pad(month)}-${pad(i + 1)}`
      if (date < otbDate) return null
      return m[date]?.rate ?? null
    })
  }, [barRows, year, month, days, otbDate])

  // OCC/ADR 배열 + KPI 파생
  const derive = (agg: DayAgg | undefined) => {
    const rn = agg?.rn ?? Array(days).fill(0)
    const rev = agg?.rev ?? Array(days).fill(0)
    const occ: (number | null)[] = rn.map(v => (roomCount > 0 ? (v / roomCount) * 100 : null))
    const adr: (number | null)[] = rn.map((v, i) => (v > 0 ? rev[i] / v : null))
    const totRn = rn.reduce((s, v) => s + v, 0)
    const totRev = rev.reduce((s, v) => s + v, 0)
    return {
      occ, adr,
      // 월 평균 OCC = 총 R/N / (객실수 × 일수) — LY는 yoy_match 매핑된 날짜 기준으로 집계됨
      avgOcc: roomCount > 0 ? (totRn / (roomCount * days)) * 100 : 0,
      totalRn: totRn,
      avgAdr: totRn > 0 ? totRev / totRn : 0,
      totalRev: totRev,
    }
  }
  const cur = useMemo(() => derive(curAgg), [curAgg, roomCount, days])
  const ly  = useMemo(() => derive(lyAgg),  [lyAgg, roomCount, days])

  const isValidEvent = (v: unknown): v is string =>
    typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() !== 'null'
  const curEvents: EventItem[] = useMemo(
    () => calRows.filter(r => isValidEvent(r.event)).map(r => ({ day: Number(r.date.slice(8, 10)), name: String(r.event) })),
    [calRows],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 104px)', background: '#000000', color: '#ccc', overflow: 'hidden' }}>
      {/* ── 헤더 ── */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '0.5px solid #1e1e1e' }}>
        <span style={{ fontSize: 17, fontWeight: 500, color: '#fff' }}>Daily Status</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={goPrev} style={navBtn} aria-label="이전 달"><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#fff', minWidth: 78, textAlign: 'center' }}>{MONTH_NAMES[month - 1]} {year}</span>
            <button onClick={goNext} style={navBtn} aria-label="다음 달"><ChevronRight size={16} /></button>
          </div>
          <button onClick={() => setShowDow(true)}
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#aaa', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            요일별 현황
          </button>
        </div>
      </div>

      {/* ── 2026 (당해년도) ── */}
      <Section flex={1} badge={{ text: `${year}`, bg: '#0d2a1f', color: MINT }} kpi={cur}
        extra={
          <div style={{ display: 'flex', gap: 5 }}>
            <EyeToggle label="OCC%" active={showOcc} color="#00E5A0" onToggle={() => setShowOcc(v => !v)} />
            <EyeToggle label="ADR"  active={showAdr} color="#5B8DEF" onToggle={() => setShowAdr(v => !v)} />
            <EyeToggle label="BAR"  active={showBar} color="#f0a500" onToggle={() => setShowBar(v => !v)} />
          </div>
        }
      >
        <DailyStatusChart
          year={year} month={month} occData={cur.occ} adrData={cur.adr} otbDate={otbDate}
          isOTBMonth={isOTBMonth} showOcc={showOcc} showAdr={showAdr}
          barData={barData} showBar={showBar} events={curEvents} onDayClick={setModalDay}
        />
      </Section>

      <div style={{ flexShrink: 0, borderTop: '1px dashed #1e1e1e', margin: '4px 0' }} />

      {/* ── 2025 LY ── */}
      <Section flex={1} badge={{ text: `${year - 1} LY`, bg: '#1a1a2e', color: '#8899cc' }} kpi={ly}
        afterBadge={
          <div style={{ display: 'flex', gap: 4 }}>
            {(['date', 'match'] as const).map(mode => (
              <button key={mode} onClick={() => setLyMode(mode)}
                style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 5, cursor: 'pointer',
                  border: `1px solid ${lyMode === mode ? 'rgba(0,229,160,0.4)' : '#2a2a2a'}`,
                  background: lyMode === mode ? 'rgba(0,229,160,0.1)' : 'transparent',
                  color: lyMode === mode ? '#00E5A0' : '#555',
                }}>
                {mode === 'date' ? '전년동일자' : '전년동기간'}
              </button>
            ))}
          </div>
        }
        extra={
          <div style={{ display: 'flex', gap: 5 }}>
            <EyeToggle label="OCC%" active={showOcc} color="#8899cc" onToggle={() => setShowOcc(v => !v)} />
            <EyeToggle label="ADR"  active={showAdr} color="#8899cc" onToggle={() => setShowAdr(v => !v)} />
          </div>
        }
      >
        <DailyStatusChart
          year={year - 1} month={month} occData={ly.occ} adrData={ly.adr} otbDate={otbDate}
          isLY showOcc={showOcc} showAdr={showAdr} events={lyEvents} onDayClick={() => {}}
        />
      </Section>

      {/* ── 모달 ── */}
      {modalDay != null && (
        <DailyStatusModal
          hotelId={hotelId} year={year} month={month} day={modalDay} otbDate={otbDate}
          isOTBMonth={isOTBMonth}
          onClose={() => setModalDay(null)}
          onDayChange={d => { if (d >= 1 && d <= days) setModalDay(d) }}
        />
      )}

      {/* ── 요일별 현황 모달 ── */}
      {showDow && (
        <DayOfWeekModal
          year={year} month={month}
          cur={curAgg ?? { rn: Array(days).fill(0), rev: Array(days).fill(0) }}
          ly={lyAgg ?? { rn: Array(days).fill(0), rev: Array(days).fill(0) }}
          roomCount={roomCount}
          onClose={() => setShowDow(false)}
        />
      )}
    </div>
  )
}

function Section({ badge, kpi, flex, afterBadge, extra, children }: {
  badge: { text: string; bg: string; color: string }
  kpi: { avgOcc: number; totalRn: number; avgAdr: number; totalRev: number }
  flex: number
  afterBadge?: React.ReactNode
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ flex, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '8px 20px' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: badge.bg, color: badge.color }}>{badge.text}</span>
        {afterBadge}
        {afterBadge && <div style={{ width: 1, height: 14, background: '#2a2a2a' }} />}
        <Kpi label="OCC" value={`${kpi.avgOcc.toFixed(1)}%`} color="#00E5A0" />
        <Kpi label="R/N" value={kpi.totalRn.toLocaleString('ko-KR')} color="#ccc" />
        <Kpi label="ADR" value={`₩${Math.round(kpi.avgAdr).toLocaleString('ko-KR')}`} color="#5B8DEF" />
        <Kpi label="REV" value={`₩${(kpi.totalRev / 1_000_000).toFixed(1)}M`} color="#aaa" />
        {extra && <div style={{ marginLeft: 'auto' }}>{extra}</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  )
}

function EyeToggle({ label, active, color, onToggle }: { label: string; active: boolean; color: string; onToggle: () => void }) {
  const Icon = active ? Eye : EyeOff
  return (
    <div onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '3px 8px', borderRadius: 5,
      border: `1px solid ${active ? color + '4d' : '#2a2a2a'}`,
      background: active ? color + '14' : 'transparent',
      transition: 'all 0.15s', userSelect: 'none',
    }}>
      <Icon size={13} style={{ color: active ? color : '#444' }} />
      <span style={{ fontSize: 11, color: active ? color : '#444' }}>{label}</span>
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: 10, color: '#555' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{value}</span>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6,
  background: 'transparent', border: '0.5px solid #2a2a2a', cursor: 'pointer', color: '#aaa',
}
