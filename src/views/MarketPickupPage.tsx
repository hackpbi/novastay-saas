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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', padding: '16px 24px', boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* 헤더 — 제목 오른쪽에 OTB/vs DatePicker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)', margin: 0 }}>Market Pick-up</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} availableDates={otbDates ?? []} accent bare fontPx={13} plain />
          <span style={{ color: '#555', fontSize: 13 }}>vs</span>
          <DatePicker label="vs" value={vsOtbDate} onChange={setVsOtbDate} availableDates={(otbDates ?? []).filter(d => d < otbDate)} accent bare fontPx={13} plain />
        </div>
      </div>

      {/* 월 범위 네비게이션 (2개월 단위) */}
      <div className="flex items-center justify-between" style={{ flexShrink: 0, margin: '12px 0' }}>
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {MONTH_NAMES[months[0].month]} &mdash; {MONTH_NAMES[months[1].month]}
          </span>
          <span className="text-xs text-brand-dimmed font-mono">{months[0].year}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { if (!isPrevDisabled) setMonthOffset(p => p - 2) }}
            disabled={isPrevDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            <ChevronLeft size={13} /> Prev
          </button>
          <button
            onClick={() => setMonthOffset(p => p + 2)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* 월 블록 — 2개 카드가 남은 공간 채움 */}
      {pickupLoading ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          {months.map(t => (
            <div key={`${t.year}-${t.month}`} className="animate-pulse rounded-2xl" style={{ flex: 1, minHeight: 0, background: 'var(--color-bg-tertiary)' }} />
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'hidden' }}>
          {months.map(t => {
            const monthKey = `${t.year}-${t.month}`
            return (
              <div key={monthKey} style={{ flex: 1, minHeight: 0 }}>
                <MarketPickupMonthBlock
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
    </div>
  )
}
