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

  const cur = monthList[selectedMonthIdx] ?? monthList[0]
  const mk  = `${cur.year}-${String(cur.month0 + 1).padStart(2, '0')}`

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
  const fmtAdr = (n: number) =>
    adrUnit === '천원' ? Math.round(n / 1000).toLocaleString() : Math.round(n).toLocaleString()

  const posColor = '#00E5A0'
  const negColor = '#E24B4A'

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

      const labels = daily.map(d => String(d.day).padStart(2, '0'))
      const puArr  = daily.map(d => d.pu)
      const occArr = daily.map(d => d.occ)
      const mx     = Math.max(2, Math.max(...puArr.map(Math.abs))) * 1.4

      // 픽업 0 기준선 (라인/막대 아래) — 인스턴스 전용 플러그인
      const zeroLine = {
        id: 'zeroLine',
        beforeDatasetsDraw(chart: any) {
          const s = chart.scales.y1
          if (!s) return
          const y = s.getPixelForValue(0)
          const ctx = chart.ctx
          ctx.save()
          ctx.setLineDash([5, 4]); ctx.lineWidth = 1
          ctx.strokeStyle = 'rgba(0,229,160,0.3)'
          ctx.beginPath()
          ctx.moveTo(chart.chartArea.left, y); ctx.lineTo(chart.chartArea.right, y)
          ctx.stroke(); ctx.restore()
        },
      }

      // 값 라벨 — 점유율(막대 안쪽) / 픽업(위·아래, 0 생략)
      const valueLabels = {
        id: 'valueLabels',
        afterDatasetsDraw(chart: any) {
          const ctx = chart.ctx
          ctx.save()
          const occMeta = chart.getDatasetMeta(0)
          const puMeta  = chart.getDatasetMeta(1)
          ctx.font = '600 9px system-ui'
          ctx.textAlign = 'center'
          occMeta.data.forEach((pt: any, i: number) => {
            ctx.fillStyle = 'rgba(160,190,240,0.75)'
            ctx.fillText(Math.round(chart.data.datasets[0].data[i]) + '%', pt.x, pt.y + 11)
          })
          ctx.font = '600 10px system-ui'
          puMeta.data.forEach((pt: any, i: number) => {
            const v = chart.data.datasets[1].data[i]
            if (v === 0) return
            ctx.fillStyle = v < 0 ? '#E24B4A' : '#00E5A0'
            ctx.fillText((v > 0 ? '+' : '') + v, pt.x, v < 0 ? pt.y + 15 : pt.y - 8)
          })
          ctx.restore()
        },
      }

      chartRef.current = new Chart(canvasRef.current, {
        plugins: [zeroLine, valueLabels],
        data: {
          labels,
          datasets: [
            {
              type: 'bar',
              label: 'OTB 점유율',
              data: occArr,
              order: 2,
              yAxisID: 'y',
              backgroundColor: 'rgba(91,141,239,0.4)',
              borderRadius: 2,
              barPercentage: 0.68,
            },
            {
              type: 'line',
              label: '픽업',
              data: puArr,
              order: 1,
              yAxisID: 'y1',
              borderColor: '#00E5A0',
              borderWidth: 2,
              tension: 0.25,
              pointRadius:          puArr.map(v => v === 0 ? 0 : 3.5),
              pointBackgroundColor: puArr.map(v => v < 0 ? '#E24B4A' : '#00E5A0'),
              pointBorderColor:     puArr.map(v => v < 0 ? '#E24B4A' : '#00E5A0'),
              segment: {
                borderColor: (c: any) => (c.p0.parsed.y < 0 || c.p1.parsed.y < 0) ? '#E24B4A' : '#00E5A0',
              },
            } as any,
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 14 } },
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
                  if (item.dataset.yAxisID === 'y') return `OTB 점유율 ${d.occ}%`
                  return `픽업 ${d.pu > 0 ? '+' : ''}${Math.round(d.pu)}실`
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
            y: {
              position: 'left', min: 0, max: 100,
              grid: { color: 'rgba(255,255,255,0.05)' },
              border: { display: false },
              ticks: { color: 'rgba(91,141,239,0.55)', font: { size: 11 }, stepSize: 25, callback: (v: any) => `${v}%` },
            },
            y1: {
              position: 'right', min: -mx, max: mx,
              grid: { display: false },
              border: { display: false },
              ticks: {
                color: 'rgba(0,229,160,0.55)', font: { size: 11 },
                stepSize: Math.max(1, Math.round(mx / 2)),
                callback: (v: any) => (v > 0 ? `+${v}` : `${v}`),
              },
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}>
      {/* ── 헤더 1행: 좌 타이틀 / 우 비교 구간 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0, marginBottom: 12 }}>

        {/* 좌 — 타이틀 + 선택 월 (PickDetailPage 규격) */}
        <span style={{ fontSize: 24, fontWeight: 500, color: '#fff', letterSpacing: '0.04em' }}>
          당일 픽업_
          <span style={{ color: '#00E5A0' }}>
            {String(cur.month0 + 1).padStart(2, '0')}월{' '}
            <span style={{ fontSize: '0.7em' }}>{String(cur.year).slice(-2)}년</span>
          </span>
        </span>

        {/* 우 — 비교 구간 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 40 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>비교</span>

          {/* from */}
          <select
            value={fromSlot ?? ''}
            onChange={e => setFromSlot(e.target.value === '' ? null : e.target.value)}
            style={{ fontSize: 12, padding: '6px 8px', background: '#0a0a0a', color: 'rgba(255,255,255,0.85)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 5, fontFamily: 'inherit', cursor: 'pointer' }}
          >
            <option value="">새벽 OTB</option>
            {sortedSlots.map(s => (
              <option key={s.slot} value={s.slot} disabled={toSlot != null && s.slot >= toSlot}>{s.slot_kst}</option>
            ))}
          </select>

          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>→</span>

          {/* to */}
          <select
            value={toSlot ?? ''}
            onChange={e => setToSlot(e.target.value === '' ? null : e.target.value)}
            style={{ fontSize: 12, padding: '6px 8px', background: '#0a0a0a', color: 'rgba(255,255,255,0.85)', border: '0.5px solid rgba(0,229,160,0.35)', borderRadius: 5, fontFamily: 'inherit', cursor: 'pointer' }}
          >
            {sortedSlots.map(s => (
              <option key={s.slot} value={s.slot} disabled={fromSlot != null && s.slot <= fromSlot}>
                {s.slot_kst}{s.slot === latestSlot ? ' (최신)' : ''}
              </option>
            ))}
          </select>

          {/* 📅 MTD */}
          <button
            onClick={() => setModalState({ businessDate: null })}
            style={{ width: 28, height: 28, border: '0.5px solid rgba(0,229,160,0.25)', borderRadius: 5, background: 'none', color: 'rgba(0,229,160,0.7)', fontSize: 14, marginLeft: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="MTD 픽업"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>

          {/* ⚙ 단위 설정 */}
          <div className="unit-setting-wrap" style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUnitSetting(v => !v)}
              style={{ width: 28, height: 28, border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 5, background: showUnitSetting ? 'rgba(0,229,160,0.1)' : 'none', color: showUnitSetting ? '#00E5A0' : 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
              aria-label="단위 설정"
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

      {/* ── 헤더 2행: 월 박스 6개 (전체 폭) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 16 }}>
        {monthList.map((m, i) => {
          const mkI    = `${m.year}-${String(m.month0 + 1).padStart(2, '0')}`
          const sMo    = summary.monthly[mkI]
          const pu     = sMo?.pu.nights ?? 0
          const base   = sMo?.base.nights ?? 0
          const has    = pu !== 0
          const pos    = pu > 0
          const accent = has ? (pos ? '0,229,160' : '226,75,74') : '255,255,255'
          const on     = i === selectedMonthIdx
          const pct    = base > 0 ? (pu / base) * 100 : 0        // base 0 가드 (먼 미래 월 예약 없음 → Infinity 방지)
          const pctTxt = (pct > 0 ? '+' : '') + pct.toFixed(1) + '%'
          // OTB 현황 (현재 to 슬롯 기준)
          const occTxt = (sMo?.cur.occ ?? 0).toFixed(1) + '%'
          const adrTxt = sMo && sMo.cur.nights > 0 ? fmtAdr(sMo.cur.adr) : '—'
          const curRevVal = sMo?.cur.revenue ?? 0
          const revTxt = revUnit === '백만원' ? (curRevVal / 1_000_000).toFixed(1)
                       : revUnit === '천원'  ? Math.round(curRevVal / 1000).toLocaleString()
                       : Math.round(curRevVal).toLocaleString()
          return (
            <button
              key={mkI}
              onClick={() => setSelectedMonthIdx(i)}
              style={{
                position: 'relative',
                padding: '11px 6px 9px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s',
                borderRadius: 8,
                border: on ? '1px solid rgba(0,229,160,0.55)' : '0.5px solid rgba(255,255,255,0.07)',
                background: on ? 'linear-gradient(175deg,#12241e 0%,#0a0a0a 55%)' : '#0b0b0b',
                ...(on && { boxShadow: '0 0 0 1px rgba(0,229,160,0.12), 0 4px 16px rgba(0,229,160,0.08)' }),
              }}
            >
              {on && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#00E5A0' }} />
              )}

              {/* 라벨 */}
              <div style={{ fontSize: 11, color: `rgba(255,255,255,${on ? 0.75 : has ? 0.5 : 0.3})` }}>
                {m.month0 + 1}월
                <span style={{ fontSize: '0.82em', marginLeft: 3, color: `rgba(255,255,255,${on ? 0.4 : 0.22})` }}>{String(m.year).slice(-2)}년</span>
              </div>

              {/* 픽업 순증감 */}
              {has ? (
                <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 500, color: pos ? '#00E5A0' : '#E24B4A' }}>
                    {pos ? '+' : ''}{pu}
                  </span>
                  <span style={{ fontSize: 11, color: `rgba(${accent},0.6)` }}>({pctTxt})</span>
                </div>
              ) : (
                <div style={{ fontSize: 11, marginTop: 5, marginBottom: 1, color: 'rgba(255,255,255,0.2)' }}>픽업없음</div>
              )}

              {/* OTB 현황 3열 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, marginTop: 8, paddingTop: 7, borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
                {([['OCC', occTxt], ['ADR', adrTxt], ['REV', revTxt]] as const).map(([label, value]) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', marginBottom: 1 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.62)' }}>{value}</div>
                  </div>
                ))}
              </div>
            </button>
          )
        })}
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
          {/* ── 범례 + 차트 ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#888' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 12, height: 10, background: 'rgba(91,141,239,0.4)', borderRadius: 2 }} />OTB 점유율
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 18, height: 0, borderTop: `2px solid ${posColor}` }} />픽업 순증
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 18, height: 0, borderTop: `2px solid ${negColor}` }} />픽업 순감
            </span>
            <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)' }}>막대 클릭 시 세그먼트 상세</span>
          </div>
          <div style={{ position: 'relative', height: 380 }}>
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
