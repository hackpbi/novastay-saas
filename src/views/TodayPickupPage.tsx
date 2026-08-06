'use client'

// 당일 픽업 페이지 (/today_pickup)
// 새벽 baseline(a02_otb_daily) 대비 시간별 스냅샷(a02b_otb_today) 픽업.
// MarketPickupPage 헤더 B타입 애니메이션 + LyComparisonSegModal 기어 팝오버 패턴 재사용.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import {
  useTodayPickupStatus,
  useTodayPickupSlots,
  useTodayPickupData,
} from '@/hooks/useTodayPickup'
import { buildTodayPickupSegTable, type TodayPickupSegSummary } from '@/utils/todayPickupSegTable'
import TodayPickupSegModal from '@/components/pickup/TodayPickupSegModal'

export default function TodayPickupPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id

  // 스냅샷 기준일 = KST 오늘 (투숙월 이동은 client-side)
  const updateDate = useMemo(
    () => new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' }),
    [],
  )

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

  // ── 상태 / 슬롯 ─────────────────────────────────────────────────────────────────
  const { data: status } = useTodayPickupStatus({ hotelId, updateDate })
  const { data: slots = [] } = useTodayPickupSlots({ hotelId, updateDate })

  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0)),
    [slots],
  )
  const latestSlot = sortedSlots.length > 0 ? sortedSlots[sortedSlots.length - 1].slot : null

  // ── 비교 구간 (from = null → 새벽 OTB) ───────────────────────────────────────────
  const [fromSlot, setFromSlot] = useState<string | null>(null)
  const [toSlot,   setToSlot]   = useState<string | null>(null)
  // 슬롯 로드되면 최신 슬롯을 to 기본값으로
  useEffect(() => {
    if (latestSlot && toSlot == null) setToSlot(latestSlot)
  }, [latestSlot, toSlot])

  const { data: todayRows = [] } = useTodayPickupData({ hotelId, updateDate, fromSlot, toSlot })

  // ── 세그 테이블(요약) — HOU 제외 · occ/revpar 포함 ───────────────────────────────
  const { summary } = useMemo(
    (): { summary: TodayPickupSegSummary } => schema.length > 0
      ? buildTodayPickupSegTable({ schema, todayRows, roomCount })
      : { summary: { monthly: {} } },
    [schema, todayRows, roomCount],
  )

  // ── 6개월 (updateDate 월부터) ────────────────────────────────────────────────────
  const monthList = useMemo(() => {
    const [y, mo] = updateDate.split('-').map(Number)   // mo: 1-based
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(y, mo - 1 + i, 1)
      return { year: d.getFullYear(), month0: d.getMonth() }
    })
  }, [updateDate])

  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0)
  const [titleShifting, setTitleShifting] = useState(false)
  useEffect(() => {
    setTitleShifting(true)
    const t = setTimeout(() => setTitleShifting(false), 350)
    return () => clearTimeout(t)
  }, [selectedMonthIdx])

  const cur       = monthList[selectedMonthIdx] ?? monthList[0]
  const mk        = `${cur.year}-${String(cur.month0 + 1).padStart(2, '0')}`
  const isFirst   = selectedMonthIdx === 0
  const isLast    = selectedMonthIdx >= monthList.length - 1

  // ── 단위 설정 (기어) ─────────────────────────────────────────────────────────────
  const [adrUnit, setAdrUnit] = useState<'원' | '천원'>('천원')
  const [revUnit, setRevUnit] = useState<'원' | '천원' | '백만원'>('백만원')
  const [showUnitSetting, setShowUnitSetting] = useState(false)
  useEffect(() => {
    if (!showUnitSetting) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.unit-setting-wrap')) setShowUnitSetting(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showUnitSetting])

  // ── 모달 상태 ────────────────────────────────────────────────────────────────────
  const [modalState, setModalState] = useState<{ businessDate: string | null } | null>(null)

  // ── 포맷 헬퍼 ────────────────────────────────────────────────────────────────────
  const fmtNights = (n: number) => Math.round(n).toLocaleString('ko-KR')
  const fmtAdr = (n: number) =>
    adrUnit === '천원' ? Math.round(n / 1000).toLocaleString() : Math.round(n).toLocaleString()
  const fmtRev = (n: number) =>
    revUnit === '백만원' ? Math.round(n / 1_000_000).toLocaleString()
    : revUnit === '천원' ? Math.round(n / 1000).toLocaleString()
    : Math.round(n).toLocaleString()

  const posColor = '#00E5A0'
  const negColor = '#E24B4A'
  const signColor = (n: number) => (n > 0 ? posColor : n < 0 ? negColor : 'rgba(255,255,255,0.25)')

  // ── KPI (선택 월) ────────────────────────────────────────────────────────────────
  const sm = summary.monthly[mk]
  const puNights = sm?.pu.nights ?? 0
  const puRev    = sm?.pu.revenue ?? 0
  const puAdr    = sm && sm.pu.nights !== 0 ? sm.pu.revenue / sm.pu.nights : 0
  const curNights = sm?.cur.nights ?? 0
  const curAdr    = sm?.cur.adr ?? 0
  const curRev    = sm?.cur.revenue ?? 0
  const occDiff   = sm?.pu.occDiff ?? 0

  // ── 최종 갱신 시각 (KST) ─────────────────────────────────────────────────────────
  const lastUpdated = status?.snapshot_at
    ? new Date(status.snapshot_at).toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
      })
    : '--:--'

  const hasBaseline = status?.has_baseline ?? false
  const hasToday    = status?.has_today ?? false

  // ── 차트 데이터 (선택 월 일자별) ─────────────────────────────────────────────────
  const daily = useMemo(() => {
    const [y, mo] = mk.split('-').map(Number)   // mo: 1-based
    const days = new Date(y, mo, 0).getDate()
    const puByDate  = new Map<string, number>()
    const curByDate = new Map<string, number>()
    for (const r of todayRows) {
      if (r.segmentation === 'HOU') continue
      const d = new Date(r.business_date)
      if (d.getFullYear() !== y || d.getMonth() !== mo - 1) continue
      puByDate.set(r.business_date,  (puByDate.get(r.business_date)  ?? 0) + (r.pu_nights  ?? 0))
      curByDate.set(r.business_date, (curByDate.get(r.business_date) ?? 0) + (r.cur_nights ?? 0))
    }
    const arr: { day: number; dateStr: string; pu: number; occ: number }[] = []
    for (let day = 1; day <= days; day++) {
      const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const occ = roomCount > 0 ? Math.round((curByDate.get(dateStr) ?? 0) / roomCount * 100) : 0
      arr.push({ day, dateStr, pu: puByDate.get(dateStr) ?? 0, occ })
    }
    return arr
  }, [todayRows, mk, roomCount])

  // ── 차트 ─────────────────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  useEffect(() => {
    if (!hasBaseline || !hasToday) return
    let cancelled = false
    ;(async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (cancelled || !canvasRef.current) return
      chartRef.current?.destroy()

      const labels   = daily.map(d => String(d.day).padStart(2, '0'))
      const puData   = daily.map(d => d.pu)
      const occData  = daily.map(d => d.occ)

      const puBaseline = {
        id: 'puBaseline',
        afterDraw(chart: any) {
          const { ctx, scales: { x, yBar } } = chart
          if (!yBar) return
          const y0 = yBar.getPixelForValue(0)
          ctx.save()
          ctx.beginPath(); ctx.moveTo(x.left, y0); ctx.lineTo(x.right, y0)
          ctx.strokeStyle = 'rgba(0,229,160,0.4)'; ctx.lineWidth = 1
          ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([])
          ctx.restore()
        },
      }

      const puLabels = {
        id: 'puLabels',
        afterDatasetsDraw(chart: any) {
          const { ctx, scales } = chart
          const yBar = scales.yBar
          if (!yBar) return
          const idx = chart.data.datasets.findIndex((d: any) => d.yAxisID === 'yBar')
          if (idx === -1) return
          const meta = chart.getDatasetMeta(idx)
          if (!meta?.data) return
          puData.forEach((val: number, i: number) => {
            if (!val || !meta.data[i]) return
            const xPos = meta.data[i].x
            const yTop = yBar.getPixelForValue(val)
            ctx.save()
            ctx.fillStyle = val > 0 ? posColor : negColor
            ctx.font = 'bold 10px sans-serif'
            ctx.textAlign = 'center'
            if (val > 0) { ctx.textBaseline = 'bottom'; ctx.fillText(`+${Math.round(val)}`, xPos, yTop - 3) }
            else         { ctx.textBaseline = 'top';    ctx.fillText(`${Math.round(val)}`,  xPos, yTop + 3) }
            ctx.restore()
          })
        },
      }

      chartRef.current = new Chart(canvasRef.current, {
        plugins: [puBaseline, puLabels],
        data: {
          labels,
          datasets: [
            {
              type: 'bar',
              label: '순증감',
              data: puData,
              backgroundColor: puData.map(v => (v > 0 ? posColor : v < 0 ? negColor : 'transparent')),
              borderColor: 'transparent',
              borderWidth: 0,
              borderRadius: 3,
              barPercentage: 0.6,
              categoryPercentage: 0.9,
              yAxisID: 'yBar',
              order: 2,
            },
            {
              type: 'line',
              label: 'OTB 점유율',
              data: occData,
              borderColor: '#5B8DEF',
              borderWidth: 2,
              pointRadius: 0,
              borderDash: [4, 3],
              tension: 0.3,
              yAxisID: 'yOcc',
              order: 1,
            } as any,
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          onClick: (_e: any, els: any[]) => {
            if (!els.length) return
            const d = daily[els[0].index]
            if (d) setModalState({ businessDate: d.dateStr })
          },
          onHover: (e: any, els: any[]) => {
            const cv = e?.native?.target as HTMLCanvasElement | undefined
            if (cv) cv.style.cursor = els.length ? 'pointer' : 'default'
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#111',
              borderColor: 'rgba(0,229,160,0.3)',
              borderWidth: 1,
              padding: 10,
              callbacks: {
                title: (items: any[]) => {
                  const d = daily[items[0]?.dataIndex]
                  return d ? `${cur.month0 + 1}월 ${d.day}일` : ''
                },
                label: (item: any) => {
                  const d = daily[item.dataIndex]
                  if (!d) return ''
                  if (item.dataset.yAxisID === 'yBar') {
                    return `순증감 ${d.pu > 0 ? '+' : ''}${Math.round(d.pu)}실`
                  }
                  return `OTB 점유율 ${d.occ}%`
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: '#888', font: { size: 10 }, autoSkip: false, maxRotation: 0 },
            },
            yBar: {
              position: 'left',
              grid: { color: 'rgba(255,255,255,0.05)' },
              border: { display: false },
              ticks: {
                color: '#444', font: { size: 10 }, stepSize: 1,
                callback: (v: any) => (v > 0 ? `+${v}` : `${v}`),
              },
            },
            yOcc: {
              position: 'right', min: 0, max: 100,
              grid: { display: false },
              border: { display: false },
              ticks: { color: '#444', font: { size: 10 }, stepSize: 25, callback: (v: any) => `${v}%` },
            },
          },
        },
      })
    })()
    return () => {
      cancelled = true
      chartRef.current?.destroy(); chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, hasBaseline, hasToday, cur.month0])

  // ── 스타일 ───────────────────────────────────────────────────────────────────────
  const kpiCard: React.CSSProperties = {
    background: 'linear-gradient(175deg, #0d1f1a 0%, #0a0a0a 40%)',
    border: '0.5px solid rgba(0,229,160,0.15)',
    borderLeft: '3px solid rgba(0,229,160,0.6)',
    borderRadius: 0,
    padding: '12px 14px',
  }
  const kpiLabel: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.4)' }
  const kpiSub: React.CSSProperties = {
    marginTop: 6, paddingTop: 6, borderTop: '0.5px solid rgba(255,255,255,0.06)',
    fontSize: 11, color: 'rgba(255,255,255,0.4)',
  }
  const unitSuffix: React.CSSProperties = { fontSize: '0.55em', marginLeft: 2, color: 'rgba(255,255,255,0.4)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}>
      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* ‹ 이전 (B타입) */}
          <button
            onClick={() => setSelectedMonthIdx(i => Math.max(0, i - 1))}
            disabled={isFirst}
            style={{
              overflow: 'hidden',
              maxWidth: isFirst ? 0 : 60,
              opacity: isFirst ? 0 : 1,
              transform: `translateX(${isFirst ? -10 : 0}px)`,
              padding: isFirst ? '4px 0' : '4px 10px',
              pointerEvents: isFirst ? 'none' : 'auto',
              transition: 'max-width 0.35s ease, opacity 0.25s ease, transform 0.35s ease, padding 0.35s ease',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6,
            }}
          >
            <span style={{ fontSize: 24, color: '#00E5A0', lineHeight: 1 }}>‹</span>
            <span style={{ fontSize: 10, color: 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>이전</span>
          </button>

          {/* 타이틀 */}
          <span style={{
            fontSize: 19, fontWeight: 500, color: '#fff', letterSpacing: '0.04em',
            transition: 'opacity 0.2s ease, transform 0.35s ease',
            opacity: titleShifting ? 0.5 : 1,
            transform: titleShifting ? 'translateX(4px)' : 'translateX(0)',
          }}>
            당일 픽업{'  '}
            <span style={{ color: '#fff' }}>{cur.month0 + 1}월</span>
            {' '}
            <span style={{ fontSize: '0.7em', color: '#00E5A0' }}>{String(cur.year).slice(-2)}년</span>
          </span>

          {/* › 다음 */}
          <button
            onClick={() => setSelectedMonthIdx(i => Math.min(monthList.length - 1, i + 1))}
            disabled={isLast}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer',
              padding: '4px 10px', borderRadius: 6,
            }}
          >
            <span style={{ fontSize: 24, color: isLast ? 'rgba(255,255,255,0.1)' : '#00E5A0', lineHeight: 1 }}>›</span>
            <span style={{ fontSize: 10, color: isLast ? 'rgba(255,255,255,0.08)' : 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>다음</span>
          </button>
        </div>

        {/* 우측: 상태 + 버튼 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: hasToday ? '#00E5A0' : 'rgba(255,255,255,0.2)', display: 'inline-block' }} />
            최종 갱신 {lastUpdated}
          </span>

          {/* 📅 MTD 픽업 모달 */}
          <button
            onClick={() => setModalState({ businessDate: null })}
            style={{
              width: 30, height: 30, borderRadius: 6, border: '0.5px solid rgba(0,229,160,0.25)',
              background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="MTD 픽업"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>

          {/* ⚙ 단위 설정 */}
          <div className="unit-setting-wrap" style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUnitSetting(v => !v)}
              style={{
                width: 30, height: 30, borderRadius: 6, border: '1px solid #00E5A0',
                background: showUnitSetting ? 'rgba(0,229,160,0.1)' : 'none', cursor: 'pointer',
                color: showUnitSetting ? '#00E5A0' : 'rgba(255,255,255,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {showUnitSetting && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: '#1a1a1a', border: '0.5px solid rgba(0,229,160,0.25)',
                borderRadius: 8, padding: '12px 14px', width: 210,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 9999,
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10, letterSpacing: '0.04em' }}>단위 설정</div>
                {/* ADR */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>객단가</span>
                  <div style={{ display: 'flex', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 5, overflow: 'hidden' }}>
                    {(['원', '천원'] as const).map(u => (
                      <button key={u} onClick={() => setAdrUnit(u)} style={{
                        padding: '3px 8px', fontSize: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        background: adrUnit === u ? '#00E5A0' : 'transparent',
                        color: adrUnit === u ? '#0a0a0a' : 'rgba(255,255,255,0.35)',
                        fontWeight: adrUnit === u ? 500 : 400,
                      }}>{u}</button>
                    ))}
                  </div>
                </div>
                <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.07)', margin: '8px 0' }} />
                {/* REV */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>매출</span>
                  <div style={{ display: 'flex', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 5, overflow: 'hidden' }}>
                    {(['원', '천원', '백만원'] as const).map(u => (
                      <button key={u} onClick={() => setRevUnit(u)} style={{
                        padding: '3px 8px', fontSize: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        background: revUnit === u ? '#00E5A0' : 'transparent',
                        color: revUnit === u ? '#0a0a0a' : 'rgba(255,255,255,0.35)',
                        fontWeight: revUnit === u ? 500 : 400,
                      }}>{u}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 상태 분기 ── */}
      {!hasBaseline ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: '#E24B4A', border: '0.5px solid rgba(226,75,74,0.3)', borderRadius: 8, background: '#0d0d0d' }}>
          🔴 새벽 업로드 없음 — 일일 업로드가 필요합니다.
        </div>
      ) : !hasToday ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.5)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, background: '#0d0d0d' }}>
          ⏳ 당일 업로드 대기 중
        </div>
      ) : (
        <>
          {/* ── 비교 구간 선택 바 ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '8px 14px', background: '#0d0d0d', borderLeft: '2px solid rgba(0,229,160,0.4)',
          }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>비교 구간</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* from */}
              <select
                value={fromSlot ?? ''}
                onChange={e => setFromSlot(e.target.value === '' ? null : e.target.value)}
                style={{
                  background: '#111', color: '#fff', border: '0.5px solid rgba(255,255,255,0.15)',
                  borderRadius: 5, padding: '4px 8px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                <option value="">새벽 OTB</option>
                {sortedSlots.map(s => (
                  <option key={s.slot} value={s.slot} disabled={toSlot != null && s.slot >= toSlot}>
                    {s.slot_kst}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>→</span>
              {/* to */}
              <select
                value={toSlot ?? ''}
                onChange={e => setToSlot(e.target.value === '' ? null : e.target.value)}
                style={{
                  background: '#111', color: '#fff', border: '0.5px solid rgba(0,229,160,0.3)',
                  borderRadius: 5, padding: '4px 8px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                {sortedSlots.map(s => (
                  <option key={s.slot} value={s.slot} disabled={fromSlot != null && s.slot <= fromSlot}>
                    {s.slot_kst}{s.slot === latestSlot ? ' (최신)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── 6개월 pill ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
            {monthList.map((m, i) => {
              const mkI = `${m.year}-${String(m.month0 + 1).padStart(2, '0')}`
              const net = summary.monthly[mkI]?.pu.nights ?? 0
              const selected = i === selectedMonthIdx
              return (
                <button
                  key={mkI}
                  onClick={() => setSelectedMonthIdx(i)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                    border: selected ? '0.5px solid rgba(0,229,160,0.5)' : '0.5px solid rgba(255,255,255,0.08)',
                    background: selected ? 'linear-gradient(175deg, #0d1f1a 0%, #0a0a0a 60%)' : '#0d0d0d',
                  }}
                >
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{m.month0 + 1}월</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: signColor(net) }}>
                    {net > 0 ? '+' : ''}{fmtNights(net)}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── KPI 카드 3개 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {/* 픽업 객실 */}
            <div style={kpiCard}>
              <div style={kpiLabel}>픽업 객실</div>
              <div style={{ fontSize: 24, fontWeight: 500, color: signColor(puNights) }}>
                {puNights > 0 ? '+' : ''}{fmtNights(puNights)}<span style={unitSuffix}>실</span>
              </div>
              <div style={kpiSub}>
                OTB {fmtNights(curNights)}실 · <span style={{ color: signColor(occDiff) }}>{occDiff > 0 ? '▲' : occDiff < 0 ? '▼' : ''}{Math.abs(occDiff).toFixed(1)}%p</span>
              </div>
            </div>
            {/* 픽업 객단가 */}
            <div style={kpiCard}>
              <div style={kpiLabel}>픽업 객단가</div>
              <div style={{ fontSize: 24, fontWeight: 500, color: signColor(puAdr) }}>
                {puAdr > 0 ? '+' : ''}{fmtAdr(puAdr)}<span style={unitSuffix}>{adrUnit}</span>
              </div>
              <div style={kpiSub}>OTB 객단가 {fmtAdr(curAdr)}</div>
            </div>
            {/* 픽업 매출 */}
            <div style={kpiCard}>
              <div style={kpiLabel}>픽업 매출</div>
              <div style={{ fontSize: 24, fontWeight: 500, color: signColor(puRev) }}>
                {puRev > 0 ? '+' : ''}{fmtRev(puRev)}<span style={unitSuffix}>{revUnit}</span>
              </div>
              <div style={kpiSub}>OTB 매출 {fmtRev(curRev)}</div>
            </div>
          </div>

          {/* ── 범례 + 차트 ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#888' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 12, height: 10, background: posColor, borderRadius: 2 }} />순증
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 12, height: 10, background: negColor, borderRadius: 2 }} />순감
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 18, height: 0, borderTop: '2px dashed #5B8DEF' }} />OTB 점유율
            </span>
            <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)' }}>막대 클릭 시 세그먼트 상세</span>
          </div>
          <div style={{ position: 'relative', height: 290 }}>
            <canvas ref={canvasRef} />
          </div>

          {/* ── 하단 주석 ── */}
          <div style={{ fontSize: 11, color: '#00E5A0', letterSpacing: '0.02em' }}>
            단위 : 실 · {adrUnit} · {revUnit}  ·  HOU 제외  ·  순증감 기준
          </div>
        </>
      )}

      {/* ── 세그먼트 상세 모달 (막대 클릭 = 일자 / 📅 = 월 전체) ── */}
      <TodayPickupSegModal
        open={modalState != null}
        onClose={() => setModalState(null)}
        roomCount={roomCount}
        updateDate={updateDate}
        fromSlot={fromSlot}
        toSlot={toSlot}
        monthKey={mk}
        businessDate={modalState?.businessDate ?? undefined}
        adrUnit={adrUnit}
        revUnit={revUnit}
      />
    </div>
  )
}
