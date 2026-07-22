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
import MarketPickupAllDaysModal from '@/components/market-pickup/MarketPickupAllDaysModal'

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
    () => [0, 1, 2].map(i => {
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
  const isNextDisabled = monthOffset >= 3   // 총 6개월(3개월 블록 2페이지)만 노출 → 마지막 페이지에서 다음 비활성
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
      setMonthOffset(p => p - 3)
      setIsAnimating(false)
      setSlideDir(null)
    }, 300)
  }
  const handleNext = () => {
    if (isNextDisabled || isAnimating) return
    setSlideDir('left')    // 다음 = 왼쪽에서 슬라이드 인
    setIsAnimating(true)
    setTimeout(() => {
      setMonthOffset(p => p + 3)
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

  // ── 세그먼트 선택 상태 (3개 블록 공유, 기본 전체 선택) ──────────────────────────────
  const [selectedSegs, setSelectedSegs] = useState<Set<string> | null>(null)   // null = 전체 선택
  const resolvedSegs = selectedSegs ?? allSegIds
  const onToggleSeg = (segId: string) => {
    setSelectedSegs(prev => {
      const cur = new Set(prev ?? allSegIds)
      if (cur.has(segId)) cur.delete(segId)
      else cur.add(segId)
      return cur
    })
  }

  // 공통 Segment 드롭다운 패널 (페이지 레벨)
  const [segPanelOpen, setSegPanelOpen] = useState(false)
  // 완료(Done) 클릭 시에만 실제 selectedSegs에 커밋 — 그 전까지 tempSelected에만 스테이징
  const [tempSelected, setTempSelected] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (segPanelOpen) setTempSelected(selectedSegs)
  }, [segPanelOpen])   // eslint-disable-line react-hooks/exhaustive-deps
  const handleToggleTemp = (segId: string) => {
    setTempSelected(prev => {
      const next = new Set(prev ?? allSegIds)
      if (next.has(segId)) next.delete(segId)
      else next.add(segId)
      return next
    })
  }
  const handleReset = () => setTempSelected(new Set())
  const handleSelectAll = () => setTempSelected(new Set(allSegIds))
  const handleDone = () => { setSelectedSegs(tempSelected); setSegPanelOpen(false) }
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-page-seg-panel]')) setSegPanelOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const [dayModal, setDayModal] = useState<{ year: number; month: number; day: number; defaultTab: 'pickup' | 'otb' } | null>(null)
  const [detailModal, setDetailModal] = useState<{ year: number; month: number } | null>(null)
  const [reportModalOpen, setReportModalOpen] = useState(false)

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
            <span style={{ fontSize: 29, color: '#00E5A0', lineHeight: 1 }}>‹</span>
            <span style={{ fontSize: 11, color: 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>이전</span>
          </button>
          {/* 타이틀 + 월 (dashboard5 패턴 + shift 애니메이션) */}
          <span style={{
            fontSize: 24, fontWeight: 500, color: '#fff', letterSpacing: '0.04em',
            transition: 'opacity 0.2s ease, transform 0.35s ease',
            opacity: titleShifting ? 0.5 : 1,
            transform: titleShifting ? 'translateX(4px)' : 'translateX(0)',
          }}>
            픽업_
            <span style={{ color: '#00E5A0' }}>
              {String(months[0].month + 1).padStart(2, '0')}월{' '}
              <span style={{ fontSize: '0.7em' }}>{String(months[0].year).slice(-2)}년</span>
            </span>
            {' ~ '}
            <span style={{ color: '#00E5A0' }}>
              {String(months[2].month + 1).padStart(2, '0')}월{' '}
              <span style={{ fontSize: '0.7em' }}>{String(months[2].year).slice(-2)}년</span>
            </span>
          </span>
          {/* 다음 (항상 표시) */}
          <button
            onClick={handleNext}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none',
              cursor: isNextDisabled ? 'default' : 'pointer',
              pointerEvents: isNextDisabled ? 'none' : 'auto',
              padding: '4px 10px', borderRadius: 6,
            }}
          >
            <span style={{ fontSize: 29, color: isNextDisabled ? 'rgba(255,255,255,0.1)' : '#00E5A0', lineHeight: 1 }}>›</span>
            <span style={{ fontSize: 11, color: isNextDisabled ? 'rgba(255,255,255,0.08)' : 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>다음</span>
          </button>
        </div>
        {/* 우측 그룹 — 공통 Segment + Detail */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }} data-page-seg-panel>
          {/* 공통 Segment 버튼 (3개 블록 공유 필터) */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setSegPanelOpen(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'transparent', border: '0.5px solid #00E5A0',
                borderRadius: 6, padding: '5px 11px',
                fontSize: 12, color: '#00E5A0', cursor: 'pointer',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
              Segment
              <span style={{ background: '#1a3a2a', color: '#00E5A0', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>
                {resolvedSegs.size} selected
              </span>
              <span style={{ display: 'inline-block', fontSize: 10, transition: 'transform 0.15s', transform: segPanelOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
            </button>
            {segPanelOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200,
                background: 'radial-gradient(circle at 15% 0%, rgba(0,229,160,0.12) 0%, transparent 55%), #0d0d0d', border: '0.5px solid #333', borderRadius: 10,
                minWidth: 240, maxHeight: 340, boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
                {groups.map(g => (
                  <div key={g.id} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', padding: '2px 8px', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 }}>{g.name}</div>
                    {g.segs.map(seg => {
                      const on = (tempSelected ?? allSegIds).has(seg.id)
                      return (
                        <div key={seg.id}
                          onClick={() => handleToggleTemp(seg.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 5, cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{
                            width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                            border: on ? 'none' : '1.5px solid #444', background: on ? '#00E5A0' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, color: '#0a0a0a', fontWeight: 700, lineHeight: 1,
                          }}>{on ? '✓' : ''}</span>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                          <span style={{ flex: 1, whiteSpace: 'nowrap', fontSize: 12, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{seg.name}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
                </div>
                {/* 하단 고정 액션 버튼 행 */}
                <div style={{
                  display: 'flex', gap: 8, padding: '10px 14px',
                  borderTop: '0.5px solid rgba(255,255,255,0.08)',
                  flexShrink: 0,
                }}>
                  <button onClick={handleReset} style={{
                    flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 8,
                    fontSize: 12, fontWeight: 500, border: '0.5px solid rgba(255,255,255,0.1)',
                    background: 'transparent', color: '#aaa', cursor: 'pointer',
                  }}>
                    초기화
                  </button>
                  <button onClick={handleSelectAll} style={{
                    flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 8,
                    fontSize: 12, fontWeight: 500, border: '0.5px solid rgba(255,255,255,0.1)',
                    background: 'transparent', color: '#aaa', cursor: 'pointer',
                  }}>
                    전체
                  </button>
                  <button onClick={handleDone} style={{
                    flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 8,
                    fontSize: 12, fontWeight: 700, border: 'none',
                    background: '#00E5A0', color: '#003d29', cursor: 'pointer',
                  }}>
                    완료
                  </button>
                </div>
              </div>
            )}
          </div>
        {/* 픽업리포트 버튼 (우측 끝) — 전일자 리포트 모달 */}
        <button
          onClick={() => setReportModalOpen(true)}
          style={{
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
          픽업리포트
        </button>
        </div>
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
                  selected={resolvedSegs}
                  onToggleSeg={onToggleSeg}
                  onBarClick={(day, defaultTab) => setDayModal({ year: t.year, month: t.month, day, defaultTab })}
                  onOpenDetail={() => setDetailModal({ year: t.year, month: t.month })}
                  roomCount={roomCount}
                  allSegIds={allSegIds}
                  isDayModalOpen={!!dayModal}
                  showSegment={false}
                  showActions={false}
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

      {/* 픽업리포트 → 전일자 리포트 모달 */}
      {reportModalOpen && (
        <MarketPickupAllDaysModal
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          year={months[0].year}
          month={months[0].month}
          pickupRows={pickupRows}
          activeSegs={groups.flatMap(g => g.segs).filter(s => resolvedSegs.has(s.id))}
          roomCount={roomCount}
        />
      )}
    </div>
  )
}
