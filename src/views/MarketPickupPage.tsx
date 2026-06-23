'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { usePickupData } from '@/hooks/usePickupData'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import DatePicker from '@/components/DatePicker'
import MarketPickupMonthBlock, { type SegGroup } from '@/components/market-pickup/MarketPickupMonthBlock'
import MarketPickupDayModal from '@/components/market-pickup/MarketPickupDayModal'

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
  const months = useMemo(
    () => [0, 1, 2].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() + monthOffset + i, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    }),
    [now.getFullYear(), now.getMonth(), monthOffset],
  )

  // ── 월 네비게이션 제한 (OTB 날짜 월이 최소값) ────────────────────────────────
  const otbYear  = otbDate ? parseInt(otbDate.slice(0, 4)) : now.getFullYear()
  const otbMonth = otbDate ? parseInt(otbDate.slice(5, 7)) - 1 : now.getMonth()
  const startDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const isPrevDisabled = startDate.getFullYear() < otbYear || (startDate.getFullYear() === otbYear && startDate.getMonth() <= otbMonth)
  useEffect(() => {
    const sd = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    if (sd.getFullYear() < otbYear || (sd.getFullYear() === otbYear && sd.getMonth() < otbMonth)) setMonthOffset(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otbDate])

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
          .map(c => ({ id: c.id, name: c.name, color: c.bg_dark_color ?? '#888888', lightColor: c.bg_light_color, codes: c.segmentation ?? [] })),
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

  return (
    <div>
      {/* 헤더 — 제목 + OTB/vs DatePicker */}
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>Market Pick-up</h1>
      <p className="text-[13px] mb-5" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
        <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
          <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} availableDates={otbDates ?? []} accent bare fontPx={13} plain />
        </span>
        {' '}
        <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
          <DatePicker label="vs" value={vsOtbDate} onChange={setVsOtbDate} availableDates={(otbDates ?? []).filter(d => d < otbDate)} accent bare fontPx={13} plain />
        </span>
        {' '}기준 세그먼트별 픽업 R/N
      </p>

      {/* 월 범위 네비게이션 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {months[0].month + 1}월 &mdash; {months[2].month + 1}월
          </span>
          <span className="text-xs text-brand-dimmed font-mono">{months[0].year}년</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { if (!isPrevDisabled) setMonthOffset(p => p - 1) }}
            disabled={isPrevDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            <ChevronLeft size={13} /> 이전
          </button>
          <button
            onClick={() => setMonthOffset(p => p + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            다음 <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* 월 블록 스택 */}
      {pickupLoading ? (
        <div className="flex flex-col gap-4">
          {months.map(t => (
            <div key={`${t.year}-${t.month}`} className="animate-pulse rounded-2xl" style={{ height: 240, background: 'var(--color-bg-tertiary)' }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {months.map(t => {
            const monthKey = `${t.year}-${t.month}`
            return (
              <MarketPickupMonthBlock
                key={monthKey}
                year={t.year}
                month={t.month}
                monthKey={monthKey}
                pickupRows={pickupRows}
                groups={groups}
                selected={resolveSelected(monthKey)}
                onToggleSeg={(segId) => onToggleSeg(monthKey, segId)}
                onBarClick={(day, defaultTab) => setDayModal({ year: t.year, month: t.month, day, defaultTab })}
                roomCount={roomCount}
                allSegIds={allSegIds}
                isDayModalOpen={!!dayModal}
              />
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
        onDateChange={(newOtb, newVs) => { setOtbDate(newOtb); setVsOtbDate(newVs) }}
      />
    </div>
  )
}
