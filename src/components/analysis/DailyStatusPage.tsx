'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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

  const { otbDate: globalOtbDate } = useDateContext()   // 글로벌 헤더의 master OTB 날짜
  const otbDate = globalOtbDate || todayLocalYMD()      // 로드 전 fallback
  const [currentMonth, setCurrentMonth] = useState<{ year: number; month: number }>(() => {
    const t = new Date()
    return { year: t.getFullYear(), month: t.getMonth() + 1 }
  })
  const [modalDay, setModalDay] = useState<number | null>(null)
  const [showDow, setShowDow] = useState(false)
  const [lyMode, setLyMode] = useState<'date' | 'match'>('date')   // 전년동일자 / 전년동기간(yoy_match)

  const { year, month } = currentMonth
  const days       = new Date(year, month, 0).getDate()
  const monthStart = `${year}-${pad(month)}-01`
  const monthEnd   = `${year}-${pad(month)}-${pad(days)}`

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
    queryKey: ['ds-cur', hotelId, year, month, otbDate],
    enabled:  !!hotelId,
    queryFn:  async () => {
      const [actRes, otbRes] = await Promise.all([
        (supabase as any).from('a01_actual_daily')
          .select('business_date, nights, room_revenue')
          .eq('hotel_id', hotelId).gte('business_date', monthStart).lte('business_date', monthEnd),
        (supabase as any).from('a02_otb_daily')
          .select('business_date, nights, room_revenue')
          .eq('hotel_id', hotelId).eq('update_date', otbDate)
          .gte('business_date', monthStart).lte('business_date', monthEnd),
      ])
      const actMap = new Map<string, { rn: number; rev: number }>()
      const otbMap = new Map<string, { rn: number; rev: number }>()
      for (const r of (actRes.data ?? []) as DailyRow[]) {
        const c = actMap.get(r.business_date) ?? { rn: 0, rev: 0 }; c.rn += r.nights ?? 0; c.rev += r.room_revenue ?? 0; actMap.set(r.business_date, c)
      }
      for (const r of (otbRes.data ?? []) as DailyRow[]) {
        const c = otbMap.get(r.business_date) ?? { rn: 0, rev: 0 }; c.rn += r.nights ?? 0; c.rev += r.room_revenue ?? 0; otbMap.set(r.business_date, c)
      }
      const agg = emptyAgg(days)
      for (let d = 1; d <= days; d++) {
        const date = `${year}-${pad(month)}-${pad(d)}`
        const src  = date < otbDate ? actMap.get(date) : otbMap.get(date)   // 기준일 이전=Actual, 이후=OTB
        if (src) { agg.rn[d - 1] = src.rn; agg.rev[d - 1] = src.rev }
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 104px)', background: '#0a0a0a', color: '#ccc', overflow: 'hidden' }}>
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
      <Section flex={1} badge={{ text: `${year}`, bg: '#0d2a1f', color: MINT }} kpi={cur}>
        <DailyStatusChart
          year={year} month={month} occData={cur.occ} adrData={cur.adr} otbDate={otbDate}
          events={curEvents} onDayClick={setModalDay}
        />
      </Section>

      <div style={{ flexShrink: 0, borderTop: '1px dashed #1e1e1e', margin: '4px 0' }} />

      {/* ── 2025 LY ── */}
      <Section flex={1} badge={{ text: `${year - 1} LY`, bg: '#1a1a2e', color: '#8899cc' }} kpi={ly}
        extra={
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
      >
        <DailyStatusChart
          year={year - 1} month={month} occData={ly.occ} adrData={ly.adr} otbDate={otbDate}
          isLY events={lyEvents} onDayClick={() => {}}
        />
      </Section>

      {/* ── 모달 ── */}
      {modalDay != null && (
        <DailyStatusModal
          hotelId={hotelId} year={year} month={month} day={modalDay} otbDate={otbDate}
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

function Section({ badge, kpi, flex, extra, children }: {
  badge: { text: string; bg: string; color: string }
  kpi: { avgOcc: number; totalRn: number; avgAdr: number; totalRev: number }
  flex: number
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ flex, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '8px 20px' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: badge.bg, color: badge.color }}>{badge.text}</span>
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
