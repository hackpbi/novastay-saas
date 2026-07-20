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
import PickupChartModal from '@/components/pickup/PickupChartModal'

export default function MarketPickupPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()
  const { data: pickupRows, loading: pickupLoading } = usePickupData()
  const { data: schema } = useMarketSchema()

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

  // ── 3개월 구간 (KST 오늘 기준 + monthOffset) ─────────────────────────────────
  const now = new Date()
  const [monthOffset, setMonthOffset] = useState(0)
  const [slideDir, setSlideDir]       = useState<'left' | 'right' | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [titleShifting, setTitleShifting] = useState(false)
  const months = useMemo(
    () => [0, 1].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() + monthOffset + i, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    }),
    [now.getFullYear(), now.getMonth(), monthOffset],
  )

  // ── 월 네비게이션 제한 (2개월 단위, OTB 날짜 월이 최소값) ───────────────────────
  const otbYear  = otbDate ? parseInt(otbDate.slice(0, 4)) : now.getFullYear()
  const otbMonth = otbDate ? parseInt(otbDate.slice(5, 7)) - 1 : now.getMonth()
  const prevStart = new Date(now.getFullYear(), now.getMonth() + monthOffset - 2, 1)
  const isPrevDisabled = prevStart.getFullYear() < otbYear || (prevStart.getFullYear() === otbYear && prevStart.getMonth() < otbMonth)
  useEffect(() => {
    const sd = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    if (sd.getFullYear() < otbYear || (sd.getFullYear() === otbYear && sd.getMonth() < otbMonth)) setMonthOffset(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otbDate])

  // 월 이동 시 타이틀 shift 애니메이션 (스르륵)
  useEffect(() => {
    setTitleShifting(true)
    const timer = setTimeout(() => setTitleShifting(false), 350)
    return () => clearTimeout(timer)
  }, [monthOffset])

  // 월 이동 — 슬라이드 애니메이션 (연속 클릭 방지)
  const handlePrev = () => {
    if (isPrevDisabled || isAnimating) return
    setSlideDir('right')   // 이전 = 오른쪽에서 슬라이드 인
    setIsAnimating(true)
    setTimeout(() => {
      setMonthOffset(p => p - 2)
      setIsAnimating(false)
      setSlideDir(null)
    }, 300)
  }
  const handleNext = () => {
    if (isAnimating) return
    setSlideDir('left')    // 다음 = 왼쪽에서 슬라이드 인
    setIsAnimating(true)
    setTimeout(() => {
      setMonthOffset(p => p + 2)
      setIsAnimating(false)
      setSlideDir(null)
    }, 300)
  }

  // ── 세그먼트 그룹 (main 노드 → 자식 세그) ──────────────────────────────────────
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

  // ── 세그먼트 선택 상태 (월별 독립, 기본 전체 선택) ──────────────────────────────
  const [selectedSegs, setSelectedSegs] = useState<Record<string, Set<string>>>({})
  const resolveSelected = (monthKey: string) => selectedSegs[monthKey] ?? allSegIds
  const onToggleSeg = (monthKey: string, segId: string) => {
    setSelectedSegs(prev => {
      const cur = new Set(prev[monthKey] ?? allSegIds)
      if (cur.has(segId)) cur.delete(segId)
      else cur.add(segId)
      return { ...prev, [monthKey]: cur }
    })
  }

  const [dayModal, setDayModal] = useState<{ year: number; month: number; day: number; defaultTab: 'pickup' | 'otb' } | null>(null)
  const [detailModal, setDetailModal] = useState<{ year: number; month: number } | null>(null)

  return (
    // height = 100vh − 56px(상단 헤더 h-14) − 48px(main p-6 상하) ; 좌우 패딩은 셸 main의 p-6 사용
    <div style={{ height: 'calc(100vh - 104px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* 헤더 — 제목 오른쪽에 월 네비게이션 (OTB/vs 날짜는 Global DateContext 사용) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
        {/* 월 네비게이션 (기존 monthOffset 2개월 단위 재사용) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* 이전 (B타입 — 첫 달일 때 공간까지 사라짐) */}
          <button
            onClick={handlePrev}
            style={{
              overflow: 'hidden',
              maxWidth: isPrevDisabled ? 0 : 60,
              opacity: isPrevDisabled ? 0 : 1,
              transform: `translateX(${isPrevDisabled ? -10 : 0}px)`,
              padding: isPrevDisabled ? '4px 0' : '4px 10px',
              pointerEvents: isPrevDisabled ? 'none' : 'auto',
              transition: 'max-width 0.35s ease, opacity 0.25s ease, transform 0.35s ease, padding 0.35s ease',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 22, color: '#00E5A0', lineHeight: 1 }}>‹</span>
            <span style={{ fontSize: 11, color: 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>이전</span>
          </button>
          {/* 타이틀 + 월 (dashboard5 패턴 + shift 애니메이션) */}
          <span style={{
            fontSize: 19, fontWeight: 500, color: '#fff', letterSpacing: '0.04em',
            transition: 'opacity 0.2s ease, transform 0.35s ease',
            opacity: titleShifting ? 0.5 : 1,
            transform: titleShifting ? 'translateX(4px)' : 'translateX(0)',
          }}>
            일자별 픽업_
            <span style={{ color: '#00E5A0' }}>
              {String(months[0].month + 1).padStart(2, '0')}월{' '}
              <span style={{ fontSize: '0.7em' }}>{String(months[0].year).slice(-2)}년</span>
            </span>
          </span>
          {/* 다음 (항상 표시) */}
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
        {/* Detail 버튼 (우측 끝) — onClick 추후 연결 */}
        <button
          onClick={() => {}}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: 'transparent',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: 7,
            padding: '5px 11px',
            fontSize: 12,
            color: 'rgba(255,255,255,0.55)',
            cursor: 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#00E5A0'
            e.currentTarget.style.color = '#00E5A0'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
          }}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <rect x="3" y="12" width="4" height="9" rx="1" />
            <rect x="10" y="7" width="4" height="14" rx="1" />
            <rect x="17" y="3" width="4" height="18" rx="1" />
          </svg>
          Detail
        </button>
      </div>

      {/* 월 블록 — 2개 카드가 남은 공간 채움 */}
      {pickupLoading ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, marginTop: 16 }}>
          {months.map(t => (
            <div key={`${t.year}-${t.month}`} className="animate-pulse rounded-2xl" style={{ flex: 1, minHeight: 0, background: 'var(--color-bg-tertiary)' }} />
          ))}
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'hidden',
          marginTop: 16,
          transform: isAnimating ? `translateX(${slideDir === 'left' ? '-40px' : '40px'})` : 'translateX(0)',
          opacity: isAnimating ? 0 : 1,
          transition: isAnimating ? 'none' : 'transform 0.3s ease, opacity 0.3s ease',
        }}>
          {months.map(t => {
            const monthKey = `${t.year}-${t.month}`
            return (
              <div key={monthKey} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <MarketPickupMonthBlock
                  year={t.year}
                  month={t.month}
                  monthKey={monthKey}
                  pickupRows={pickupRows}
                  groups={groups}
                  selected={resolveSelected(monthKey)}
                  onToggleSeg={(segId) => onToggleSeg(monthKey, segId)}
                  onBarClick={(day, defaultTab) => setDayModal({ year: t.year, month: t.month, day, defaultTab })}
                  onOpenDetail={() => setDetailModal({ year: t.year, month: t.month })}
                  roomCount={roomCount}
                  allSegIds={allSegIds}
                  isDayModalOpen={!!dayModal}
                />
              </div>
            )
          })}
        </div>
      )}

      <MarketPickupDayModal
        open={!!dayModal}
        onClose={() => setDayModal(null)}
        year={dayModal?.year ?? now.getFullYear()}
        month={dayModal?.month ?? now.getMonth()}
        day={dayModal?.day ?? 1}
        schema={schema}
        pickupRows={pickupRows}
        roomCount={roomCount}
        defaultTab={dayModal?.defaultTab ?? 'pickup'}
        otbDate={otbDate}
        vsDate={vsOtbDate}
        otbDates={otbDates ?? []}
        onDateChange={(newOtb, newVs) => { setOtbDate(newOtb); setVsOtbDate(newVs) }}
      />

      {/* Detail 버튼 → Daily Pick-Up 차트 모달 */}
      <PickupChartModal
        open={!!detailModal}
        onClose={() => setDetailModal(null)}
        year={detailModal?.year ?? now.getFullYear()}
        month={detailModal?.month ?? now.getMonth()}
        pickupRows={pickupRows}
        roomCount={roomCount}
        otbDate={otbDate}
        vsOtbDate={vsOtbDate}
        otbDates={otbDates ?? []}
        setOtbDate={setOtbDate}
        setVsOtbDate={setVsOtbDate}
      />
    </div>
  )
}
