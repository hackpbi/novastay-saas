'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
import MonthlyPickupSegTotalModal from '@/components/dashboard/MonthlyPickupSegTotalModal'
import MonthlyPickupAccountModal from '@/components/dashboard/MonthlyPickupAccountModal'
import MonthlyPickupAccountTotalModal from '@/components/dashboard/MonthlyPickupAccountTotalModal'
import { fmtK, fmtM } from '@/utils/pickupPageUtils'

export default function PickupPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()
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

  // ── 월 네비게이션 제한 (OTB 날짜 월이 최소값, 대시보드 disabled 패턴) ─────────────
  const otbYear  = otbDate ? parseInt(otbDate.slice(0, 4)) : now.getFullYear()
  const otbMonth = otbDate ? parseInt(otbDate.slice(5, 7)) - 1 : now.getMonth()  // 0-based
  const startDate  = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const startYear  = startDate.getFullYear()
  const startMonth = startDate.getMonth()
  const isPrevDisabled = startYear < otbYear || (startYear === otbYear && startMonth <= otbMonth)
  const handlePrev = () => { if (!isPrevDisabled) setMonthOffset(p => p - 1) }
  const handleNext = () => setMonthOffset(p => p + 1)

  // otbDate 변경 시 시작월이 OTB 월보다 이전이면 monthOffset 리셋
  useEffect(() => {
    const sd = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    if (sd.getFullYear() < otbYear || (sd.getFullYear() === otbYear && sd.getMonth() < otbMonth)) {
      setMonthOffset(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otbDate])

  // ── 픽업 데이터 (대시보드와 동일: usePickupData / DateContext vsOtbDate) ─────────
  // 전체 stay-date rows 반환 → 카드별로 business_date 월 필터
  const { data: pickupRows, loading: pickupLoading } = usePickupData()

  // ── LY (전년 동일자 v1 / 전년 동기간 v2) ───────────────────────────────────────
  const { data: lyDjRows = [] } = useLyPacing('v1')
  const { data: lyDgRows = [] } = useLyPacing('v2')

  const [chartModal, setChartModal] = useState<{ year: number; month: number } | null>(null)
  const [mpOpen, setMpOpen] = useState(false)
  const [pickupViewMode, setPickupViewMode] = useState<'monthly' | 'total'>('total')
  const [pickupAccountModal, setPickupAccountModal] = useState<{
    open: boolean; filterSegCodes?: string[]; filterMonthKey?: string; filterLabel?: string; initialViewMode?: 'monthly' | 'total'
  }>({ open: false })

  // ── 요약 배너 데이터 (대시보드와 동일) ───────────────────────────────────────────
  const pickupDays = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0
  const totalPuNights  = pickupRows.reduce((s, r) => s + (r.pu_nights ?? 0), 0)
  const totalPuRevenue = pickupRows.reduce((s, r) => s + (r.pu_revenue ?? 0), 0)
  const totalPuAdr     = totalPuNights > 0 ? Math.round(totalPuRevenue / totalPuNights) : 0
  const valStyle = (v: number): React.CSSProperties => ({ color: v >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 500, cursor: 'pointer' })

  return (
    <div>
      {/* 헤더 — 제목 + 바로 아래 배너 */}
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>Pick-up</h1>

      {/* 상단 요약 배너 — OTB/vs 날짜를 문구 안 인라인으로 (날짜 폰트 = 문구 14px) */}
      {pickupLoading ? (
        <div className="h-5 w-80 rounded animate-pulse mb-5" style={{ background: 'var(--color-bg-tertiary)' }} />
      ) : (
        <p className="text-[13px] mb-5" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
          <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
            <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} availableDates={otbDates ?? []} accent bare fontPx={13} plain />
          </span>
          {' '}
          <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
            <DatePicker label="vs" value={vsOtbDate} onChange={setVsOtbDate} availableDates={(otbDates ?? []).filter(d => d < otbDate)} accent bare fontPx={13} plain />
          </span>
          {' '}{pickupDays === 0 ? '당일' : `${pickupDays}일간`} 6개월 픽업은 총{' '}
          <span onClick={() => setMpOpen(true)} title="월별 픽업 추이 보기" style={valStyle(totalPuNights)}>
            {totalPuNights >= 0 ? '+' : ''}{totalPuNights.toLocaleString('ko-KR')}실
          </span>
          , ADR{' '}
          <span onClick={() => setMpOpen(true)} title="월별 픽업 추이 보기" style={valStyle(totalPuAdr)}>
            {totalPuAdr >= 0 ? '+' : ''}{fmtK(totalPuAdr)}
          </span>
          , REV{' '}
          <span onClick={() => setMpOpen(true)} title="월별 픽업 추이 보기" style={valStyle(totalPuRevenue)}>
            {totalPuRevenue >= 0 ? '+' : ''}{fmtM(totalPuRevenue)}
          </span>
          {' '}입니다.
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
            onClick={handlePrev}
            disabled={isPrevDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            <ChevronLeft size={13} />
            이전
          </button>
          <button
            onClick={handleNext}
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
                onExpand={() => setChartModal({ year: t.year, month: t.month })}
              />
            ))}
      </div>

      <PickupChartModal
        open={!!chartModal}
        onClose={() => setChartModal(null)}
        year={chartModal?.year ?? now.getFullYear()}
        month={chartModal?.month ?? now.getMonth()}
        pickupRows={pickupRows}
        otbDate={otbDate}
        vsOtbDate={vsOtbDate}
        otbDates={otbDates ?? []}
        setOtbDate={setOtbDate}
        setVsOtbDate={setVsOtbDate}
      />

      {/* 픽업 추이 모달 — pickupViewMode(월별/합계) 토글 + Seg→Account 드릴 (대시보드 동일) */}
      <MonthlyPickupSegModal
        open={mpOpen && pickupViewMode === 'monthly'}
        onClose={() => setMpOpen(false)}
        roomCount={roomCount}
        onSwitchToTotal={() => setPickupViewMode('total')}
        onPickupCellClick={(segCodes, monthKey, label) => {
          setMpOpen(false)
          setPickupAccountModal({
            open: true, filterSegCodes: segCodes, filterMonthKey: monthKey ?? undefined,
            filterLabel: label, initialViewMode: monthKey === null ? 'total' : 'monthly',
          })
        }}
      />
      <MonthlyPickupSegTotalModal
        open={mpOpen && pickupViewMode === 'total'}
        onClose={() => setMpOpen(false)}
        roomCount={roomCount}
        onSwitchToMonthly={() => setPickupViewMode('monthly')}
        onPickupCellClick={(segCodes, monthKey, label) => {
          setMpOpen(false)
          setPickupAccountModal({
            open: true, filterSegCodes: segCodes, filterMonthKey: monthKey ?? undefined,
            filterLabel: label, initialViewMode: monthKey === null ? 'total' : 'monthly',
          })
        }}
      />
      <MonthlyPickupAccountModal
        open={pickupAccountModal.open && pickupViewMode === 'monthly'}
        onClose={() => setPickupAccountModal({ open: false })}
        roomCount={roomCount}
        initialFilterSegCodes={pickupAccountModal.filterSegCodes}
        initialFilterMonthKey={pickupAccountModal.filterMonthKey}
        initialFilterLabel={pickupAccountModal.filterLabel}
        initialViewMode={pickupAccountModal.initialViewMode}
        onSwitchToTotal={() => setPickupViewMode('total')}
        onBackToSeg={() => { setPickupAccountModal({ open: false }); setMpOpen(true) }}
      />
      <MonthlyPickupAccountTotalModal
        open={pickupAccountModal.open && pickupViewMode === 'total'}
        onClose={() => setPickupAccountModal({ open: false })}
        roomCount={roomCount}
        initialFilterSegCodes={pickupAccountModal.filterSegCodes}
        initialFilterLabel={pickupAccountModal.filterLabel}
        onSwitchToMonthly={() => setPickupViewMode('monthly')}
        onBackToSeg={() => { setPickupAccountModal({ open: false }); setMpOpen(true) }}
      />
    </div>
  )
}
