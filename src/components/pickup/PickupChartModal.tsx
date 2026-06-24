'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import DatePicker from '@/components/DatePicker'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { PickupMonthSummaryModal } from '@/components/market-pickup/PickupMonthSummaryModal'
import type { PickupRow } from '@/hooks/usePickupData'
import { fmtK, fmtM } from '@/utils/pickupPageUtils'

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function PickupChartModal({
  open, onClose, year, month, pickupRows, roomCount,
  otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate,
}: {
  open:         boolean
  onClose:      () => void
  year:         number
  month:        number   // 0-based (모달 진입 시 초기 월)
  pickupRows:   PickupRow[]
  roomCount:    number
  otbDate:      string
  vsOtbDate:    string
  otbDates:     string[]
  setOtbDate:   (v: string) => void
  setVsOtbDate: (v: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  const { data: schema = [] } = useMarketSchema()
  const [summaryModalOpen, setSummaryModalOpen] = useState(false)

  // ── 모달 내부 월 상태 (진입 시 클릭한 카드 월로 초기화) ───────────────────────────
  const [modalYear,  setModalYear]  = useState(year)
  const [modalMonth, setModalMonth] = useState(month)
  useEffect(() => {
    if (open) { setModalYear(year); setModalMonth(month) }
  }, [open, year, month])

  // 이전 버튼 제한 — OTB 날짜 기준 월
  const otbYear  = otbDate ? parseInt(otbDate.slice(0, 4)) : modalYear
  const otbMonth = otbDate ? parseInt(otbDate.slice(5, 7)) - 1 : 0
  const isMinMonth = modalYear < otbYear || (modalYear === otbYear && modalMonth <= otbMonth)
  const handlePrev = () => {
    if (isMinMonth) return
    if (modalMonth === 0) { setModalMonth(11); setModalYear(y => y - 1) }
    else setModalMonth(m => m - 1)
  }
  const handleNext = () => {
    if (modalMonth === 11) { setModalMonth(0); setModalYear(y => y + 1) }
    else setModalMonth(m => m + 1)
  }

  // ── 선택 월의 일자별 픽업 R/N + 배너 집계 (카드 로직과 동일) ───────────────────────
  const { daily, totalPuRn, totalPuRev, totalPuAdr } = useMemo(() => {
    const month1 = modalMonth + 1
    const days   = new Date(modalYear, month1, 0).getDate()
    const pm = (pickupRows ?? []).filter(r => {
      const d = new Date(r.business_date)
      return d.getFullYear() === modalYear && d.getMonth() === modalMonth
    })
    let otbN = 0, otbR = 0, vsN = 0, vsR = 0, puN = 0, puR = 0
    const puByDate  = new Map<string, number>()
    const otbByDate = new Map<string, number>()
    for (const r of pm) {
      if (r.segmentation !== 'HOU') {
        otbN += r.otb_nights ?? 0; vsN += r.vs_otb_nights ?? 0; puN += r.pu_nights ?? 0
        puByDate.set(r.business_date, (puByDate.get(r.business_date) ?? 0) + (r.pu_nights ?? 0))
        otbByDate.set(r.business_date, (otbByDate.get(r.business_date) ?? 0) + (r.otb_nights ?? 0))
      }
      otbR += r.otb_revenue ?? 0; vsR += r.vs_otb_revenue ?? 0; puR += r.pu_revenue ?? 0
    }
    const arr: { day: number; dow: number; isWeekend: boolean; puNights: number; occ: number }[] = []
    for (let day = 1; day <= days; day++) {
      const dateStr = `${modalYear}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dow = new Date(modalYear, modalMonth, day).getDay()
      const occ = roomCount > 0 ? Math.round((otbByDate.get(dateStr) ?? 0) / roomCount * 100) : 0
      arr.push({ day, dow, isWeekend: dow === 0 || dow === 6, puNights: puByDate.get(dateStr) ?? 0, occ })
    }
    const otbAdr = otbN > 0 ? otbR / otbN : 0
    const vsAdr  = vsN > 0 ? vsR / vsN : 0
    return { daily: arr, totalPuRn: puN, totalPuRev: puR, totalPuAdr: otbAdr - vsAdr }
  }, [pickupRows, modalYear, modalMonth, roomCount])

  const pickupDays = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0

  // ── 이벤트 (c06_calendar) — 막대 하단 표시용 ───────────────────────────────────
  const { data: events = [] } = useQuery<{ date: string; event: string }[]>({
    queryKey: ['pickup-chart-events', modalYear, modalMonth],
    enabled: open,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const m1   = modalMonth + 1
      const days = new Date(modalYear, m1, 0).getDate()
      const start = `${modalYear}-${String(m1).padStart(2, '0')}-01`
      const end   = `${modalYear}-${String(m1).padStart(2, '0')}-${String(days).padStart(2, '0')}`
      const { data, error } = await (supabase as any)
        .from('c06_calendar')
        .select('date, event')
        .gte('date', start).lte('date', end)
        .not('event', 'is', null).neq('event', '')
      if (error) throw error
      return (data ?? []) as { date: string; event: string }[]
    },
  })
  const eventMap = useMemo(() => {
    const m: Record<number, string> = {}
    for (const r of events) {
      if (!r.event || r.event.trim() === '' || r.event === 'null') continue
      m[new Date(r.date).getDate()] = r.event
    }
    return m
  }, [events])

  // ESC + scroll lock
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // ── 차트 (픽업 R/N 막대만) ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (cancelled || !canvasRef.current) return
      chartRef.current?.destroy()

      const labels     = daily.map(d => d.day)
      const occData    = daily.map(d => d.occ)
      const pickupData = daily.map(d => d.puNights)
      const gc = 'rgba(255,255,255,0.05)', tc = '#717171'
      const hasEvents = Object.keys(eventMap).length > 0

      // x축 라벨(일자+요일) 아래에 이벤트 원(연한 민트 배경 + 민트 테두리) + 2글자
      const eventPlugin = {
        id: 'eventLabels',
        afterDraw(chart: any) {
          const x = chart.scales.x
          const { ctx } = chart
          const yCenter = x.bottom + 14   // 일자/요일 라벨 아래
          for (const [day, text] of Object.entries(eventMap)) {
            const idx = Number(day) - 1
            if (idx < 0 || idx >= daily.length) continue
            const xPos = x.getPixelForValue(idx)
            const match = String(text).match(/\(([^)]+)\)/)
            const label = (match ? match[1] : String(text)).slice(0, 2)
            ctx.save()
            ctx.beginPath(); ctx.arc(xPos, yCenter, 9, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(0,229,160,0.15)'; ctx.fill()
            ctx.strokeStyle = '#00E5A0'; ctx.lineWidth = 1; ctx.stroke()
            ctx.font = '9px -apple-system, sans-serif'
            ctx.fillStyle = '#00E5A0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText(label, xPos, yCenter)
            ctx.restore()
          }
        },
      }

      // OCC% 숫자 (바 위, 회색)
      const occLabels = {
        id: 'occLabels',
        afterDatasetsDraw(chart: any) {
          const { ctx, scales: { x, yOcc } } = chart
          occData.forEach((val: number, i: number) => {
            const xPos = x.getPixelForValue(i)
            const yPos = yOcc.getPixelForValue(val)
            ctx.save()
            ctx.fillStyle = 'rgba(150,150,150,0.85)'
            ctx.font = '9px -apple-system, sans-serif'
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
            ctx.fillText(`${val}%`, xPos, yPos - 3)
            ctx.restore()
          })
        },
      }

      // 픽업 R/N (픽업 있는 날만 민트 굵은 글씨, OCC% 위)
      const pickupLabels = {
        id: 'pickupLabels',
        afterDatasetsDraw(chart: any) {
          const { ctx, scales: { x, yOcc } } = chart
          pickupData.forEach((val: number, i: number) => {
            if (!val || val === 0) return
            const xPos = x.getPixelForValue(i)
            const yPos = yOcc.getPixelForValue(occData[i])
            ctx.save()
            ctx.fillStyle = '#00E5A0'
            ctx.font = 'bold 11px -apple-system, sans-serif'
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
            ctx.fillText(`${val > 0 ? '+' : ''}${val}`, xPos, yPos - 16)
            ctx.restore()
          })
        },
      }

      chartRef.current = new Chart(canvasRef.current, {
        plugins: [occLabels, pickupLabels, eventPlugin],
        data: {
          labels,
          datasets: [
            {
              type: 'bar',
              label: 'OCC%',
              data: occData,
              backgroundColor: 'rgba(180,180,180,0.26)',
              borderColor: 'rgba(180,180,180,0.31)',
              borderWidth: 1,
              borderRadius: 2,
              yAxisID: 'yOcc',
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 18, bottom: hasEvents ? 32 : 0 } },   // 픽업 라벨 위 / 이벤트 원 아래 공간
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1E1E1E', borderColor: '#2C2C2C', borderWidth: 1,
              titleColor: '#fff', bodyColor: '#ddd', padding: 10,
              callbacks: {
                title: (items: any) => { const d = daily[items[0]?.dataIndex ?? 0]; return d ? `${modalMonth + 1}/${d.day} (${DOW_KR[d.dow]})` : '' },
                label: (ctx: any) => {
                  const i = ctx.dataIndex
                  return [` OCC: ${occData[i]}%`, ` 픽업 R/N: ${pickupData[i] >= 0 ? '+' : ''}${pickupData[i]}`]
                },
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: {
                // 금(5)/토(6) 빨간색
                color: (c: any) => { const dow = daily[c.index]?.dow; return dow === 5 || dow === 6 ? '#E24B4A' : tc },
                font: { size: 10 },
                padding: 6,
                // 숫자 + 요일 2줄 표시
                callback: (_v: any, index: number) => {
                  const d = daily[index]
                  return d ? [String(d.day), DOW_KR[d.dow]] : ''
                },
              },
            },
            yOcc: {
              position: 'left', min: 0, max: 100,
              grid: { color: gc },
              ticks: { color: '#444', font: { size: 10 }, callback: (v: any) => `${v}%` },
            },
          },
        },
      })
    })()
    return () => { cancelled = true; chartRef.current?.destroy(); chartRef.current = null }
  }, [open, daily, modalMonth, eventMap])

  if (!open) return null

  const mintVal: React.CSSProperties = { color: '#00E5A0', fontWeight: 500, borderBottom: '1px dashed #00E5A0', paddingBottom: 1, cursor: 'pointer' }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-4xl"
        style={{ background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* 헤더 — 제목 + 닫기 (구분선 없음, 요약문이 바로 아래) */}
        <div className="flex items-center justify-between px-5 pt-3.5 pb-0.5 shrink-0">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Daily Pick-Up</h2>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        {/* 요약문 — 타이틀 바로 아래, 네비 위 (구분선은 요약문 아래) */}
        <div className="px-5 pt-0 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)' }}>
          <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
            <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
              <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} availableDates={otbDates ?? []} accent bare fontPx={13} plain />
            </span>
            {' '}
            <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
              <DatePicker label="vs" value={vsOtbDate} onChange={setVsOtbDate} availableDates={(otbDates ?? []).filter(d => d < otbDate)} accent bare fontPx={13} plain />
            </span>
            {' '}{pickupDays === 0 ? '0-day' : `${pickupDays}-day`} pickup for {MONTH_NAMES[modalMonth]}:{' '}
            <span onClick={() => setSummaryModalOpen(true)} style={mintVal}>{totalPuRn >= 0 ? '+' : ''}{totalPuRn.toLocaleString('ko-KR')} R/N</span>
            , ADR <span onClick={() => setSummaryModalOpen(true)} style={mintVal}>{totalPuAdr >= 0 ? '+' : ''}{fmtK(totalPuAdr)}</span>
            , REV <span onClick={() => setSummaryModalOpen(true)} style={mintVal}>{totalPuRev >= 0 ? '+' : ''}{fmtM(totalPuRev)}</span>
          </p>
        </div>

        {/* 월 변경 — 배너 아래, 가운데 정렬 */}
        <div className="px-5 pb-2 shrink-0" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <button
            onClick={handlePrev}
            disabled={isMinMonth}
            aria-label="이전 달"
            className="flex items-center justify-center p-1.5 rounded-lg text-brand-muted hover:text-brand-text disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
            style={{ border: 'none', background: 'transparent' }}
          >
            <ChevronLeft size={15} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 100, textAlign: 'center' }}>
            {MONTH_NAMES[modalMonth]} {modalYear}
          </span>
          <button
            onClick={handleNext}
            aria-label="다음 달"
            className="flex items-center justify-center p-1.5 rounded-lg text-brand-muted hover:text-brand-text transition-all duration-150"
            style={{ border: 'none', background: 'transparent' }}
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {/* 차트 */}
        <div className="px-4 pb-4 pt-1" style={{ height: 360 }}>
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* 요약 수치 클릭 → 월별 픽업 요약 모달 */}
      <PickupMonthSummaryModal
        open={summaryModalOpen}
        onClose={() => setSummaryModalOpen(false)}
        year={modalYear}
        month={modalMonth}
        schema={schema}
        pickupRows={pickupRows}
        roomCount={roomCount}
        otbDate={otbDate}
        vsDate={vsOtbDate}
        otbDates={otbDates ?? []}
        onDateChange={(o, v) => { setOtbDate(o); setVsOtbDate(v) }}
      />
    </div>
  )
}
