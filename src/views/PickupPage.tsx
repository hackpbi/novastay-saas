'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useFcstDateContext } from '@/contexts/FcstDateContext'
import { usePickupData } from '@/hooks/usePickupData'
import { useLyPacing } from '@/hooks/useLyPacing'
import { useLatestConfirmedBudgetDate } from '@/hooks/useLatestConfirmedBudgetDate'
import DatePicker from '@/components/DatePicker'
import PickupMonthCard from '@/components/pickup/PickupMonthCard'
import PickupChartModal from '@/components/pickup/PickupChartModal'
import MonthlyPickupSegModal from '@/components/dashboard/MonthlyPickupSegModal'
import { type PickupDaily } from '@/utils/pickupPageUtils'

// 대시보드 배너 숫자 포맷 복제
function formatPuParts(n: number, type: 'nights' | 'currency'): { num: string; unit: string } {
  const sign = n >= 0 ? '+' : ''
  if (type === 'nights') return { num: `${sign}${n.toLocaleString('ko-KR')}`, unit: '실' }
  if (Math.abs(n) >= 1_000_000) return { num: `${sign}${(n / 1_000_000).toFixed(1)}`, unit: 'M' }
  if (Math.abs(n) >= 1_000)     return { num: `${sign}${(n / 1_000).toFixed(0)}`,     unit: 'k' }
  return { num: `${sign}${n.toLocaleString('ko-KR')}`, unit: '' }
}

export default function PickupPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate, vsOtbDate, otbDates, setVsOtbDate } = useDateContext()
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

  // ── 3개월 구간 (KST 오늘 기준 + monthOffset) ─────────────────────────────────
  const now = new Date()
  const [monthOffset, setMonthOffset] = useState(0)
  const targetMonths = useMemo(
    () => [0, 1, 2].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() + monthOffset + i, 1)
      return { year: d.getFullYear(), month: d.getMonth(), label: `${d.getMonth() + 1}월` }
    }),
    [now.getFullYear(), now.getMonth(), monthOffset],
  )

  // ── 픽업 데이터 (대시보드와 동일: usePickupData / DateContext vsOtbDate) ─────────
  // 전체 stay-date rows 반환 → 카드별로 business_date 월 필터
  const { data: pickupRows, loading: pickupLoading } = usePickupData()

  // ── LY (전년 동일자 v1 / 전년 동기간 v2) ───────────────────────────────────────
  const { data: lyDjRows = [] } = useLyPacing('v1')
  const { data: lyDgRows = [] } = useLyPacing('v2')

  const [chartModal, setChartModal] = useState<{ year: number; month: number; daily: PickupDaily[] } | null>(null)
  const [mpOpen, setMpOpen] = useState(false)

  // ── 요약 배너 데이터 (대시보드와 동일) ───────────────────────────────────────────
  const pickupDays = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0
  const totalPuNights  = pickupRows.reduce((s, r) => s + (r.pu_nights ?? 0), 0)
  const totalPuRevenue = pickupRows.reduce((s, r) => s + (r.pu_revenue ?? 0), 0)
  const totalPuAdr     = totalPuNights > 0 ? Math.round(totalPuRevenue / totalPuNights) : 0
  const puBtn = (color: string): React.CSSProperties => ({
    color, fontWeight: 600, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
    textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3,
  })

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
            value={vsOtbDate}
            onChange={setVsOtbDate}
            availableDates={(otbDates ?? []).filter(d => d < otbDate)}
          />
        </div>
      </div>

      {/* 상단 요약 배너 (대시보드 동일) */}
      {pickupLoading ? (
        <div className="h-5 w-80 rounded animate-pulse mb-5" style={{ background: 'var(--color-bg-tertiary)' }} />
      ) : (
        <p className="text-sm mb-5" style={{ color: 'var(--color-text-secondary)' }}>
          오늘 ({otbDate}) 기준{' '}
          {pickupDays > 0 ? (
            <span style={{ color: 'var(--color-accent-primary)' }}>
              <span style={{ fontSize: '1.5em', fontWeight: 700 }}>{pickupDays}</span>일간
            </span>
          ) : (
            <span style={{ color: 'var(--color-accent-primary)' }}>당일</span>
          )}
          {' '}6개월 실적은 총{' '}
          <button onClick={() => setMpOpen(true)} title="월별 픽업 추이 보기" style={puBtn(totalPuNights >= 0 ? '#00A86B' : '#E53E3E')}>
            {(() => { const { num, unit } = formatPuParts(totalPuNights, 'nights'); return <><span style={{ fontSize: '1.5em' }}>{num}</span>{unit}</> })()}
          </button>
          ,{' '}ADR{' '}
          <button onClick={() => setMpOpen(true)} title="월별 픽업 추이 보기" style={puBtn(totalPuAdr >= 0 ? '#00A86B' : '#E53E3E')}>
            {(() => { const { num, unit } = formatPuParts(totalPuAdr, 'currency'); return <><span style={{ fontSize: '1.5em' }}>{num}</span>{unit}</> })()}
          </button>
          ,{' '}REV{' '}
          <button onClick={() => setMpOpen(true)} title="월별 픽업 추이 보기" style={puBtn(totalPuRevenue >= 0 ? '#00A86B' : '#E53E3E')}>
            {(() => { const { num, unit } = formatPuParts(totalPuRevenue, 'currency'); return <><span style={{ fontSize: '1.5em' }}>{num}</span>{unit}</> })()}
          </button>
          {' '}픽업 되었습니다.
        </p>
      )}

      {/* 월 범위 네비게이션 (대시보드 스타일) */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {targetMonths[0].month + 1}월 &mdash; {targetMonths[2].month + 1}월
          </span>
          <span className="text-xs text-brand-dimmed font-mono">{targetMonths[0].year}년</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMonthOffset(p => p - 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            <ChevronLeft size={13} />
            이전
          </button>
          <button
            onClick={() => setMonthOffset(p => p + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            다음
            <ChevronRight size={13} />
          </button>
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

      <MonthlyPickupSegModal open={mpOpen} onClose={() => setMpOpen(false)} roomCount={roomCount} />
    </div>
  )
}
