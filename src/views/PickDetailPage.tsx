'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { usePickupData } from '@/hooks/usePickupData'
import { useMarketSchema } from '@/hooks/useMarketSchema'
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

  // ── 세그 코드 → display name (schema: main 직속 자식 세그 segmentation 코드 → 세그 이름) ──
  const codeToName = useMemo(() => {
    const mainIds = new Set(schema.filter(s => s.level === 'main' && s.parent_id === null).map(s => s.id))
    const map = new Map<string, string>()
    for (const s of schema) {
      if (s.parent_id && mainIds.has(s.parent_id)) {
        for (const code of (s.segmentation ?? [])) map.set(code, s.name)
      }
    }
    return map
  }, [schema])
  const segDisplayName = (code: string) => codeToName.get(code) ?? code

  // ── 현재 월 rows ───────────────────────────────────────────────────────────────
  const monthRows = useMemo(() => (pickupRows ?? []).filter(r => {
    const d = new Date(r.business_date)
    return d.getFullYear() === viewYear && (d.getMonth() + 1) === viewMonth
  }), [pickupRows, viewYear, viewMonth])

  // 세그별 픽업(칩) — HOU 제외, segmentation별 pu_nights 합산, sorting1 정렬, pu_nights !== 0
  const segChips = useMemo(() => {
    const segMap = new Map<string, { pu_nights: number; sorting1: string | null }>()
    for (const r of monthRows) {
      if (r.segmentation === 'HOU') continue
      const ex = segMap.get(r.segmentation)
      if (ex) ex.pu_nights += r.pu_nights
      else segMap.set(r.segmentation, { pu_nights: r.pu_nights, sorting1: r.sorting1 })
    }
    return Array.from(segMap.entries())
      .filter(([, v]) => v.pu_nights !== 0)
      .sort((a, b) => Number(a[1].sorting1 ?? 999) - Number(b[1].sorting1 ?? 999))
  }, [monthRows])

  // 세그별 어카운트 집계 (칩 hover 툴팁용) — HOU 제외, pu=0 제외, |pu| 내림차순
  const segAccountMap = useMemo(() => {
    const map = new Map<string, { name: string; pu: number }[]>()
    for (const r of monthRows) {
      if (r.segmentation === 'HOU') continue
      if (r.pu_nights === 0) continue
      const list = map.get(r.segmentation) ?? []
      const existing = list.find(a => a.name === r.account_name)
      if (existing) existing.pu += r.pu_nights
      else list.push({ name: r.account_name, pu: r.pu_nights })
      map.set(r.segmentation, list)
    }
    map.forEach((list, key) => { map.set(key, list.sort((a, b) => Math.abs(b.pu) - Math.abs(a.pu))) })
    return map
  }, [monthRows])

  const [tooltip, setTooltip] = useState<{ segCode: string; x: number; y: number } | null>(null)

  return (
    <div style={{ height: 'calc(100vh - 104px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* 헤더 행 — 좌: 월 네비게이션 / 우: 세그 칩 행 */}
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
          <span style={{ fontSize: 29, color: '#00E5A0', lineHeight: 1 }}>‹</span>
          <span style={{ fontSize: 11, color: 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>이전</span>
        </button>

        <span style={{
          fontSize: 24, fontWeight: 500, color: '#fff', letterSpacing: '0.04em',
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
          <span style={{ fontSize: 29, color: '#00E5A0', lineHeight: 1 }}>›</span>
          <span style={{ fontSize: 11, color: 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>다음</span>
        </button>
        </div>

        {/* 우 — 세그 칩 행 (Segment 필터 표시 + Picked up 칩 + 픽업 합계) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0 }}>
          <span style={{ fontSize: 11, color: '#555' }}>픽업</span>

          {/* 세그별 칩 — pu_nights >= 0 민트 / < 0 빨강 */}
          {segChips.map(([segCode, { pu_nights }]) => (
            <div
              key={segCode}
              style={{ position: 'relative', display: 'inline-flex' }}
              onMouseEnter={e => { const rect = e.currentTarget.getBoundingClientRect(); setTooltip({ segCode, x: rect.left, y: rect.bottom + 6 }) }}
              onMouseLeave={() => setTooltip(null)}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                background: 'transparent',
                border: `0.5px solid ${pu_nights >= 0 ? '#00E5A0' : '#E24B4A'}`,
                borderRadius: 20, padding: '3px 10px',
                fontSize: 11,
                color: pu_nights >= 0 ? '#00E5A0' : '#E24B4A',
                whiteSpace: 'nowrap', cursor: 'default',
              }}>
                {segDisplayName(segCode)} {pu_nights >= 0 ? '+' : ''}{Math.round(pu_nights)}
              </span>
            </div>
          ))}
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
          pickupRows={pickupRows}
        />
      </div>

      {tooltip && createPortal(
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y, zIndex: 99999,
          background: '#1a1a1a', border: '0.5px solid #2a2a2a', borderRadius: 8,
          padding: '8px 12px', minWidth: 160, maxWidth: 240,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 11, color: '#00E5A0', fontWeight: 600,
            marginBottom: 6, borderBottom: '0.5px solid #2a2a2a', paddingBottom: 4,
          }}>
            {segDisplayName(tooltip.segCode)}
          </div>
          {(segAccountMap.get(tooltip.segCode) ?? []).map(({ name, pu }) => (
            <div key={name} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '2px 0', gap: 12,
            }}>
              <span style={{ fontSize: 11, color: '#aaa', flex: 1, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, flexShrink: 0,
                color: pu >= 0 ? '#00E5A0' : '#E24B4A' }}>
                {pu >= 0 ? '+' : ''}{Math.round(pu)}
              </span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
