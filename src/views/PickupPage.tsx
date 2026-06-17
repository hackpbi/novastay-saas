'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useFcstDateContext } from '@/contexts/FcstDateContext'
import { useLyPacing } from '@/hooks/useLyPacing'
import { useLatestConfirmedBudgetDate } from '@/hooks/useLatestConfirmedBudgetDate'
import type { PickupRow } from '@/hooks/usePickupData'
import DatePicker from '@/components/DatePicker'
import PickupMonthCard from '@/components/pickup/PickupMonthCard'
import PickupChartModal from '@/components/pickup/PickupChartModal'
import { toKST, type PickupDaily } from '@/utils/pickupPageUtils'

export default function PickupPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate, otbDates } = useDateContext()
  const { fcstDate } = useFcstDateContext()
  const { data: budgetDate = null } = useLatestConfirmedBudgetDate(hotelId || undefined)

  // ── room_count ───────────────────────────────────────────────────────────────
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

  // ── 3개월 (KST 오늘 기준) ────────────────────────────────────────────────────
  const now = new Date()
  const targetMonths = useMemo(
    () => [0, 1, 2].map(offset => {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
      return { year: d.getFullYear(), month: d.getMonth(), label: `${d.getMonth() + 1}월` }
    }),
    [now.getFullYear(), now.getMonth()],
  )

  // ── vs Date (로컬 상태, 7일 전 근접값 기본) ────────────────────────────────────
  const [vsDate, setVsDate] = useState<string | null>(null)
  useEffect(() => {
    if (!otbDates?.length || vsDate) return
    const d = new Date(); d.setDate(d.getDate() - 7)
    const target = toKST(d)
    const best = [...otbDates].reverse().find(x => x <= target) ?? otbDates[0]
    setVsDate(best)
  }, [otbDates, vsDate])

  // ── 픽업 데이터 (페이지 1회 호출 → 카드별 월 필터) ─────────────────────────────
  const minDate = otbDates?.[otbDates.length - 1] ?? ''
  const { data: pickupRows = [], isLoading: pickupLoading } = useQuery<PickupRow[]>({
    queryKey: ['pickup_page', hotelId, otbDate, vsDate, minDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_pickup_data', {
        p_hotel_id:    hotelId,
        p_otb_date:    otbDate,
        p_vs_otb_date: vsDate,
        p_min_date:    minDate,
      })
      if (error) throw error
      return (data ?? []) as PickupRow[]
    },
    enabled: !!hotelId && !!otbDate && !!vsDate && !!minDate,
  })

  // ── LY (전년 동일자 v1 / 전년 동기간 v2) ───────────────────────────────────────
  const { data: lyDjRows = [] } = useLyPacing('v1')
  const { data: lyDgRows = [] } = useLyPacing('v2')

  const [chartModal, setChartModal] = useState<{ year: number; month: number; daily: PickupDaily[] } | null>(null)

  return (
    <div className="px-6 py-5 max-w-[1400px] mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Pick-up</h1>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--brand-dimmed)' }}>
            <CalendarDays size={13} /> OTB <span style={{ color: '#00E5A0', fontWeight: 600 }}>{otbDate?.slice(2).replace(/-/g, '.')}</span> vs
          </span>
          <DatePicker
            label="vs"
            value={vsDate ?? ''}
            onChange={setVsDate}
            availableDates={(otbDates ?? []).filter(d => d < otbDate)}
          />
        </div>
      </div>

      {/* 3컬럼 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {pickupLoading
          ? targetMonths.map(t => (
              <div key={`${t.year}-${t.month}`} className="animate-pulse rounded-xl" style={{ height: 560, background: 'var(--color-bg-tertiary)' }} />
            ))
          : targetMonths.map(t => (
              <PickupMonthCard
                key={`${t.year}-${t.month}`}
                year={t.year}
                month={t.month}
                label={t.label}
                hotelId={hotelId}
                roomCount={roomCount}
                fcstDate={fcstDate || null}
                budgetDate={budgetDate}
                pickupRows={pickupRows}
                lyDjRows={lyDjRows}
                lyDgRows={lyDgRows}
                onExpand={(daily) => setChartModal({ year: t.year, month: t.month, daily })}
              />
            ))}
      </div>

      <PickupChartModal
        open={!!chartModal}
        onClose={() => setChartModal(null)}
        year={chartModal?.year ?? now.getFullYear()}
        month={chartModal?.month ?? now.getMonth()}
        daily={chartModal?.daily ?? []}
      />
    </div>
  )
}
