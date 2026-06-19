'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useFcstDateContext } from '@/contexts/FcstDateContext'
import { usePickupData } from '@/hooks/usePickupData'
import { useLyPacing } from '@/hooks/useLyPacing'
import { useLatestConfirmedBudgetDate } from '@/hooks/useLatestConfirmedBudgetDate'
import PickupMonthCard from '@/components/pickup/PickupMonthCard'
import PickupChartModal from '@/components/pickup/PickupChartModal'
import MonthlyPickupSegModal from '@/components/dashboard/MonthlyPickupSegModal'
import { fmtK, fmtM, type PickupDaily } from '@/utils/pickupPageUtils'

// 문구 안 인라인 달력 칩 (폰트는 배너 문구와 동일 14px)
function DateChip({ value, onChange, dates }: { value: string; onChange: (d: string) => void; dates: string[] }) {
  const [open, setOpen] = useState(false)
  const init = value ? new Date(value) : new Date()
  const [calYear,  setCalYear]  = useState(init.getFullYear())
  const [calMonth, setCalMonth] = useState(init.getMonth())   // 0-based
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = () => {
    if (!open && value) { const d = new Date(value); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()) }
    setOpen(o => !o)
  }

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const firstDay    = new Date(calYear, calMonth, 1).getDay()   // 0=일
  const dateSet     = new Set(dates)
  const prevMonth   = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }
  const nextMonth   = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }
  const navBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 15, padding: '2px 6px', lineHeight: 1 }

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span onClick={toggle}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 500, color: '#00E5A0', cursor: 'pointer', borderBottom: '1px dashed rgba(0,229,160,0.4)', paddingBottom: 1 }}>
        {value || '—'}
        <CalendarDays size={13} aria-hidden="true" />
      </span>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, width: 240, padding: 12,
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button onClick={prevMonth} style={navBtn} aria-label="이전 달">‹</button>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{calYear}년 {calMonth + 1}월</span>
            <button onClick={nextMonth} style={navBtn} aria-label="다음 달">›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {['일', '월', '화', '수', '목', '금', '토'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--color-text-secondary)', padding: '2px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isValid = dateSet.has(dateStr)
              const isSelected = dateStr === value
              const dow = (firstDay + i) % 7
              const isWeekend = dow === 0 || dow === 6
              return (
                <div key={day}
                  onClick={() => { if (isValid) { onChange(dateStr); setOpen(false) } }}
                  style={{
                    textAlign: 'center', fontSize: 11, padding: '5px 2px', borderRadius: 4,
                    cursor: isValid ? 'pointer' : 'default',
                    background: isSelected ? '#00E5A0' : 'transparent',
                    color: isSelected ? '#0a0a0a' : !isValid ? 'rgba(255,255,255,0.2)' : isWeekend ? '#60A5FA' : 'var(--color-text-primary)',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (isValid && !isSelected) e.currentTarget.style.background = 'var(--color-bg-tertiary)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>
                  {day}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </span>
  )
}

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
  const valStyle = (v: number): React.CSSProperties => ({ color: v >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 500, cursor: 'pointer' })

  return (
    <div>
      {/* 헤더 — 제목 + 바로 아래 배너 */}
      <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>Pick-up</h1>

      {/* 상단 요약 배너 — OTB/vs 날짜를 문구 안 인라인으로 (날짜 폰트 = 문구 14px) */}
      {pickupLoading ? (
        <div className="h-5 w-80 rounded animate-pulse mb-5" style={{ background: 'var(--color-bg-tertiary)' }} />
      ) : (
        <p className="text-sm mb-5" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>OTB</span>{' '}
          <DateChip value={otbDate} onChange={setOtbDate} dates={otbDates ?? []} />
          {' '}<span style={{ color: 'var(--color-text-secondary)' }}>vs</span>{' '}
          <DateChip value={vsOtbDate} onChange={setVsOtbDate} dates={(otbDates ?? []).filter(d => d < otbDate)} />
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
