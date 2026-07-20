'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { usePickupData } from '@/hooks/usePickupData'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import MarketPickupMonthBlock, { type SegGroup } from '@/components/market-pickup/MarketPickupMonthBlock'
import MarketPickupDayModal from '@/components/market-pickup/MarketPickupDayModal'
import PickDetailChart from '@/components/pickup/PickDetailChart'

export default function PickDetailPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate, vsOtbDate } = useDateContext()
  const { data: pickupRows } = usePickupData()
  const { data: schema } = useMarketSchema()

  // ── room_count (기존 컨벤션 동일) ──────────────────────────────────────────────
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

  // ── 현재 보는 월/년 (otbDate 월이 초기·최소값) ─────────────────────────────────
  const now = new Date()
  const [viewYear,  setViewYear]  = useState(() => (otbDate ? new Date(otbDate).getFullYear()   : now.getFullYear()))
  const [viewMonth, setViewMonth] = useState(() => (otbDate ? new Date(otbDate).getMonth() + 1  : now.getMonth() + 1))

  useEffect(() => {
    if (!otbDate) return
    setViewYear(new Date(otbDate).getFullYear())
    setViewMonth(new Date(otbDate).getMonth() + 1)
  }, [otbDate])

  const initialYear  = otbDate ? new Date(otbDate).getFullYear()  : viewYear
  const initialMonth = otbDate ? new Date(otbDate).getMonth() + 1 : viewMonth
  const isPrevHidden = viewYear === initialYear && viewMonth === initialMonth

  const [titleShifting, setTitleShifting] = useState(false)
  const [isAnimating,   setIsAnimating]   = useState(false)

  useEffect(() => {
    setTitleShifting(true)
    const t = setTimeout(() => setTitleShifting(false), 350)
    return () => clearTimeout(t)
  }, [viewMonth, viewYear])

  const handlePrev = () => {
    if (isPrevHidden || isAnimating) return
    setIsAnimating(true)
    setTimeout(() => {
      if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) }
      else setViewMonth(m => m - 1)
      setIsAnimating(false)
    }, 300)
  }
  const handleNext = () => {
    if (isAnimating) return
    setIsAnimating(true)
    setTimeout(() => {
      if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) }
      else setViewMonth(m => m + 1)
      setIsAnimating(false)
    }, 300)
  }

  // ── 세그먼트 그룹 + 선택 상태 (MarketPickupPage 동일 패턴) ───────────────────────
  const groups: SegGroup[] = useMemo(() => {
    const mains = schema.filter(s => s.level === 'main' && s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
    return mains
      .map(main => ({
        id: main.id,
        name: main.name,
        segs: schema
          .filter(c => c.parent_id === main.id)
          .sort((a, b) => a.order_index - b.order_index)
          .map(c => ({ id: c.id, name: c.name, color: c.bg_dark_color ?? '#888888', lightColor: c.bg_light_color, fontDarkColor: c.font_dark_color, isBold: c.is_bold, codes: c.segmentation ?? [] })),
      }))
      .filter(g => g.segs.length > 0)
  }, [schema])
  const allSegIds = useMemo(() => new Set(groups.flatMap(g => g.segs.map(s => s.id))), [groups])
  const [selectedSegs, setSelectedSegs] = useState<Record<string, Set<string>>>({})
  const resolveSelected = (mk: string) => selectedSegs[mk] ?? allSegIds
  const onToggleSeg = (mk: string, segId: string) => {
    setSelectedSegs(prev => {
      const cur = new Set(prev[mk] ?? allSegIds)
      if (cur.has(segId)) cur.delete(segId)
      else cur.add(segId)
      return { ...prev, [mk]: cur }
    })
  }

  // 섹션 헤더 블록 바 클릭 → 일자별 픽업 상세 모달
  const [dayModal, setDayModal] = useState<{ day: number; defaultTab: 'pickup' | 'otb' } | null>(null)

  const month0   = viewMonth - 1   // MarketPickupMonthBlock은 0-based month
  const monthKey = `${viewYear}-${month0}`

  return (
    <div style={{ height: 'calc(100vh - 104px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* 헤더 행 — 좌: 월 네비게이션 / 우: 세그 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0, marginBottom: 12 }}>
        {/* 좌 — 월 네비게이션 (dashboard5 패턴) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={handlePrev}
          style={{
            overflow: 'hidden',
            maxWidth: isPrevHidden ? 0 : 60,
            opacity: isPrevHidden ? 0 : 1,
            transform: `translateX(${isPrevHidden ? -10 : 0}px)`,
            padding: isPrevHidden ? '4px 0' : '4px 10px',
            pointerEvents: isPrevHidden ? 'none' : 'auto',
            transition: 'max-width 0.35s ease, opacity 0.25s ease, transform 0.35s ease, padding 0.35s ease',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 22, color: '#00E5A0', lineHeight: 1 }}>‹</span>
          <span style={{ fontSize: 11, color: 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>이전</span>
        </button>

        <span style={{
          fontSize: 19, fontWeight: 500, color: '#fff', letterSpacing: '0.04em',
          transition: 'opacity 0.2s ease, transform 0.35s ease',
          opacity: titleShifting ? 0.5 : 1,
          transform: titleShifting ? 'translateX(4px)' : 'translateX(0)',
        }}>
          일자별 픽업 상세_
          <span style={{ color: '#00E5A0' }}>
            {String(viewMonth).padStart(2, '0')}월{' '}
            <span style={{ fontSize: '0.7em' }}>{String(viewYear).slice(-2)}년</span>
          </span>
        </span>

        <button
          onClick={handleNext}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px 10px', borderRadius: 6,
          }}
        >
          <span style={{ fontSize: 22, color: '#00E5A0', lineHeight: 1 }}>›</span>
          <span style={{ fontSize: 11, color: 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>다음</span>
        </button>
        </div>

        {/* 우 — 세그 헤더 (Segment 필터 + Picked up 칩 + 픽업 합계, 테두리/바/History·Detail 없음) */}
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <MarketPickupMonthBlock
            year={viewYear}
            month={month0}
            monthKey={monthKey}
            pickupRows={pickupRows}
            groups={groups}
            selected={resolveSelected(monthKey)}
            onToggleSeg={(segId) => onToggleSeg(monthKey, segId)}
            onBarClick={(day, defaultTab) => setDayModal({ day, defaultTab })}
            onOpenDetail={() => {}}
            roomCount={roomCount}
            allSegIds={allSegIds}
            isDayModalOpen={!!dayModal}
            showActions={false}
            showBar={false}
            showBorder={false}
          />
        </div>
      </div>

      {/* 콘텐츠 — 월 이동 슬라이드 애니메이션 (PickDetailChart 단독) */}
      <div style={{
        flex: 1, minHeight: 0,
        transform: isAnimating ? 'translateX(-40px)' : 'translateX(0)',
        opacity: isAnimating ? 0 : 1,
        transition: isAnimating ? 'none' : 'transform 0.3s ease, opacity 0.3s ease',
      }}>
        <PickDetailChart
          hotelId={hotelId ?? ''}
          otbDate={otbDate}
          vsOtbDate={vsOtbDate}
          viewYear={viewYear}
          viewMonth={viewMonth}
          roomCount={roomCount}
        />
      </div>

      {/* 섹션 헤더 바 클릭 → 일자별 픽업 상세 모달 */}
      <MarketPickupDayModal
        open={!!dayModal}
        onClose={() => setDayModal(null)}
        year={viewYear}
        month={month0}
        day={dayModal?.day ?? 1}
        schema={schema}
        pickupRows={pickupRows}
        roomCount={roomCount}
        defaultTab={dayModal?.defaultTab ?? 'pickup'}
        otbDate={otbDate}
        vsDate={vsOtbDate}
        otbDates={[]}
        onDateChange={() => {}}
      />
    </div>
  )
}
