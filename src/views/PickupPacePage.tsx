'use client'

// Pick-up Pace (/pickup/pace)
// OTB 스냅샷 기준 월간 일자별 OCC 막대 + ADR 선형 차트 + 하단 월간 OCC 누적 페이스. 날짜 클릭 → BarRatePacingModal.

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import PaceChart from '@/components/pickup/PaceChart'
import MonthlyOccPaceChart from '@/components/pickup/MonthlyOccPaceChart'
import { PaceSegmentModal } from '@/components/pickup/PaceSegmentModal'
import BarRatePacingModal from '@/components/pickup/BarRatePacingModal'

const cardStyle: React.CSSProperties = {
  background: '#0a0a0a', border: '1px solid var(--color-border-default)', borderRadius: 12,
}

// 동기간/동일자 토글 스위치
const trackStyle = (on: boolean, onColor: string, offColor: string): React.CSSProperties => ({
  position: 'relative', display: 'inline-block', width: 36, height: 20, borderRadius: 20,
  background: on ? onColor : offColor, border: `1px solid ${on ? onColor : offColor}`,
  cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
})
const thumbStyle = (on: boolean): React.CSSProperties => ({
  position: 'absolute', width: 14, height: 14, top: 2, left: on ? 20 : 2,
  borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
})

export default function PickupPacePage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate } = useDateContext()   // 글로벌 OTB (상단 바 DatePicker에서 설정) — 읽기 전용

  // room_count
  const { data: hotelDetail } = useQuery({
    queryKey: ['m03_hotel_details', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('m03_hotel_details').select('room_count').eq('hotel_id', hotelId).single()
      if (error) throw error
      return data
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
  })
  const roomCount = hotelDetail?.room_count ?? 0

  // 월 네비 — 기본 OTB 월, 최소 = OTB 월 (OtbComparePage 컨벤션 그대로)
  const otbYear  = otbDate ? parseInt(otbDate.slice(0, 4)) : new Date().getFullYear()
  const otbMonth = otbDate ? parseInt(otbDate.slice(5, 7)) - 1 : new Date().getMonth()
  const [viewYear,  setViewYear]  = useState(otbYear)
  const [viewMonth, setViewMonth] = useState(otbMonth)
  useEffect(() => { setViewYear(otbYear); setViewMonth(otbMonth) }, [otbYear, otbMonth])
  const isMinMonth = viewYear < otbYear || (viewYear === otbYear && viewMonth <= otbMonth)
  const handlePrev = () => {
    if (isMinMonth) return
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1)
  }
  const handleNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1)
  }

  // 날짜 클릭 → PickupTrendModal (해당 날짜의 월)
  const [lyMode, setLyMode] = useState<'period' | 'day'>('period')

  // 하단 페이스 막대 클릭 → PaceSegmentModal / 일자별 차트 클릭 → BarRatePacingModal
  const [paceUpdateDate, setPaceUpdateDate] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  useEffect(() => { setSelectedDate(null); setPaceUpdateDate(null) }, [viewYear, viewMonth])

  // 하단 월간 OCC 누적 페이스 (get_monthly_occ_pace, D-30 ~ D-0)
  const paceFromDate = (() => {
    if (!otbDate) return ''
    const [y, m, d] = otbDate.split('-').map(Number)
    const o = new Date(y, m - 1, d - 30)
    return `${o.getFullYear()}-${String(o.getMonth() + 1).padStart(2, '0')}-${String(o.getDate()).padStart(2, '0')}`
  })()
  const { data: paceRows = [] } = useQuery({
    queryKey: ['monthly-occ-pace', hotelId, viewYear, viewMonth, otbDate, lyMode],
    enabled: !!hotelId && !!otbDate,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_monthly_occ_pace', {
        p_hotel_id:  hotelId,
        p_year:      viewYear,
        p_month:     viewMonth + 1,   // viewMonth 는 0-based → RPC 는 1-based
        p_from_date: paceFromDate,
        p_to_date:   otbDate,
        p_ly_mode:   lyMode,
      })
      if (error) throw error
      return (data ?? []) as { update_date: string; otb_occ: number; ly_occ: number; otb_adr: number; ly_adr: number }[]
    },
  })

  // c06_calendar 이벤트 (update_date 범위) — 하단 페이스 차트 도트용 (기존 패턴, 전역/호텔 필터 없음)
  const { data: paceEvents = [] } = useQuery({
    queryKey: ['pace-events', paceFromDate, otbDate],
    enabled: !!paceFromDate && !!otbDate,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('c06_calendar').select('date, event')
        .gte('date', paceFromDate).lte('date', otbDate)
        .not('event', 'is', null)
      return (data ?? []) as { date: string; event: string }[]
    },
  })

  return (
    <div>
      {/* 헤더 — 월 네비 통합 타이틀 + 글로벌 OTB */}
      <div className="flex items-center justify-between mb-4" style={{ gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={handlePrev} disabled={isMinMonth} aria-label="이전 달"
            className="flex items-center justify-center p-1 rounded-lg text-brand-muted hover:text-brand-text disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            style={{ border: 'none', background: 'transparent' }}>
            <ChevronLeft size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 220, justifyContent: 'center' }}>
            <span style={{ color: '#00E5A0', fontSize: 20, fontWeight: 700 }}>{viewMonth + 1}월</span>
            <span style={{ color: '#00E5A0', fontSize: 14, fontWeight: 600 }}>{String(viewYear).slice(2)}년</span>
            <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Pick-up Pace</span>
          </div>
          <button onClick={handleNext} aria-label="다음 달"
            className="flex items-center justify-center p-1 rounded-lg text-brand-muted hover:text-brand-text transition-all"
            style={{ border: 'none', background: 'transparent' }}>
            <ChevronRight size={18} />
          </button>
        </div>
        {/* 전년 비교 모드 — 동기간/동일자 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1a1a1a', borderRadius: 30, padding: '4px 10px', border: '1px solid #2a2a2a' }}>
          <div style={trackStyle(lyMode === 'period', '#a78bfa', '#F59E0B')} onClick={() => setLyMode(p => (p === 'period' ? 'day' : 'period'))}>
            <div style={thumbStyle(lyMode === 'period')} />
          </div>
          <span style={{ fontSize: 11, color: lyMode === 'period' ? '#a78bfa' : '#F59E0B', minWidth: 30 }}>{lyMode === 'period' ? '동기간' : '동일자'}</span>
        </div>
      </div>

      {/* 상단 — 월 픽업 페이스 (월간 OCC 누적 페이스, D-30 ~ D-0) */}
      <div style={{ ...cardStyle, padding: '14px 16px 10px' }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          월 픽업 페이스
        </div>
        <div style={{ height: 300 }}>
          <MonthlyOccPaceChart
            rows={paceRows}
            otbDate={otbDate}
            lyMode={lyMode}
            viewYear={viewYear}
            viewMonth={viewMonth + 1}
            calRows={paceEvents}
            onSelectUpdateDate={setPaceUpdateDate}
          />
        </div>
        {/* 범례는 MonthlyOccPaceChart 내부(ADR 토글 연동)에서 렌더 */}
      </div>

      {/* 하단 — 일자별 픽업 페이스 (OCC 막대 + ADR 선형, 이중 Y축) */}
      <div style={{ ...cardStyle, marginTop: 16, padding: '14px 16px 10px' }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          일자별 픽업 페이스
          <span style={{ fontSize: 11, color: '#444', marginLeft: 8 }}>그래프 클릭하세요</span>
        </div>
        <div style={{ height: 340 }}>
          <PaceChart
            key={`${viewYear}-${viewMonth}`}
            hotelId={hotelId}
            otbDate={otbDate}
            year={viewYear}
            month={viewMonth}
            roomCount={roomCount}
            onSelectDate={setSelectedDate}
          />
        </div>
        {/* 범례 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 10, background: 'rgba(180,180,180,0.4)', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#888' }}>OCC%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 18, height: 0, borderTop: '2.5px solid #F59E0B' }} />
            <span style={{ fontSize: 11, color: '#888' }}>ADR</span>
          </div>
        </div>
      </div>

      {/* 월 페이스 막대 클릭 → 세그먼트 상세 모달 */}
      {paceUpdateDate && hotelId && (
        <PaceSegmentModal
          open={!!paceUpdateDate}
          onClose={() => setPaceUpdateDate(null)}
          updateDate={paceUpdateDate}
          hotelId={hotelId}
          year={viewYear}
          month={viewMonth + 1}
          lyMode={lyMode}
        />
      )}

      {/* 일자별 차트 클릭 → OCC Trend · BAR Rate History 모달 */}
      <BarRatePacingModal
        open={!!selectedDate && !!hotelId}
        onClose={() => setSelectedDate(null)}
        hotelId={hotelId ?? ''}
        stayDate={selectedDate ?? ''}
        roomCount={roomCount}
        showRateEdit={false}
      />
    </div>
  )
}
