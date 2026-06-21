'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import DatePicker from '@/components/DatePicker'
import type { PickupRow } from '@/hooks/usePickupData'
import { fmtK, fmtM } from '@/utils/pickupPageUtils'

// 막대 위/안 픽업 R/N 숫자 라벨 (per-instance 인라인 플러그인 → 전역 중복 등록 없음)
const labelPlugin = {
  id: 'barLabel',
  afterDatasetsDraw(chart: any) {
    const { ctx, data } = chart
    const meta = chart.getDatasetMeta(0)
    meta.data.forEach((bar: any, i: number) => {
      const val = data.datasets[0].data[i] as number
      if (val === 0 || val == null) return
      const x = bar.x, y = bar.y
      const barH = Math.abs(bar.base - bar.y)
      ctx.save()
      ctx.font = '600 10px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      if (barH >= 16) {
        ctx.fillStyle = '#ffffff'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${val > 0 ? '+' : ''}${val}`, x, (y + bar.base) / 2)
      } else {
        ctx.fillStyle = val >= 0 ? '#00E5A0' : '#E24B4A'
        ctx.textBaseline = val >= 0 ? 'bottom' : 'top'
        ctx.fillText(`${val > 0 ? '+' : ''}${val}`, x, val >= 0 ? y - 3 : bar.base + 3)
      }
      ctx.restore()
    })
  },
}

export default function PickupChartModal({
  open, onClose, year, month, pickupRows,
  otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate,
}: {
  open:         boolean
  onClose:      () => void
  year:         number
  month:        number   // 0-based (모달 진입 시 초기 월)
  pickupRows:   PickupRow[]
  otbDate:      string
  vsOtbDate:    string
  otbDates:     string[]
  setOtbDate:   (v: string) => void
  setVsOtbDate: (v: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)

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
    const puByDate = new Map<string, number>()
    for (const r of pm) {
      if (r.segmentation !== 'HOU') {
        otbN += r.otb_nights ?? 0; vsN += r.vs_otb_nights ?? 0; puN += r.pu_nights ?? 0
        puByDate.set(r.business_date, (puByDate.get(r.business_date) ?? 0) + (r.pu_nights ?? 0))
      }
      otbR += r.otb_revenue ?? 0; vsR += r.vs_otb_revenue ?? 0; puR += r.pu_revenue ?? 0
    }
    const arr: { day: number; dow: number; isWeekend: boolean; puNights: number }[] = []
    for (let day = 1; day <= days; day++) {
      const dateStr = `${modalYear}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dow = new Date(modalYear, modalMonth, day).getDay()
      arr.push({ day, dow, isWeekend: dow === 0 || dow === 6, puNights: puByDate.get(dateStr) ?? 0 })
    }
    const otbAdr = otbN > 0 ? otbR / otbN : 0
    const vsAdr  = vsN > 0 ? vsR / vsN : 0
    return { daily: arr, totalPuRn: puN, totalPuRev: puR, totalPuAdr: otbAdr - vsAdr }
  }, [pickupRows, modalYear, modalMonth])

  const pickupDays = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0

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

      const labels   = daily.map(d => d.day)
      const puRnArr  = daily.map(d => d.puNights)
      const gc = 'rgba(255,255,255,0.05)', tc = '#717171'

      chartRef.current = new Chart(canvasRef.current, {
        plugins: [labelPlugin],
        data: {
          labels,
          datasets: [
            {
              type: 'bar',
              label: '픽업 R/N',
              data: puRnArr,
              backgroundColor: puRnArr.map(v => (v >= 0 ? 'rgba(0,229,160,0.6)' : 'rgba(226,75,74,0.6)')),
              borderColor:     puRnArr.map(v => (v >= 0 ? 'rgba(0,229,160,0.8)' : 'rgba(226,75,74,0.8)')),
              borderWidth: 1,
              borderRadius: 2,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1E1E1E', borderColor: '#2C2C2C', borderWidth: 1,
              titleColor: '#fff', bodyColor: '#ddd', padding: 10,
              callbacks: {
                title: (items: any) => `${modalMonth + 1}월 ${items[0]?.label ?? ''}일`,
                label: (ctx: any) => ` 픽업 R/N: ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y}`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: {
                color: (c: any) => (daily[c.index]?.isWeekend ? '#00B883' : tc),
                font: { size: 10 },
              },
            },
            y: {
              position: 'left',
              grid: { color: gc },
              ticks: {
                color: tc, font: { size: 10 }, precision: 0,
                callback: (v: any) => (Number.isInteger(v) ? `${v >= 0 ? '+' : ''}${v}` : null),
              },
            },
          },
        },
      })
    })()
    return () => { cancelled = true; chartRef.current?.destroy(); chartRef.current = null }
  }, [open, daily, modalMonth])

  if (!open) return null

  const mintVal: React.CSSProperties = { color: '#00E5A0', fontWeight: 500 }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-4xl"
        style={{ background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* 헤더 — 제목 + 닫기 */}
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Pick-up 차트</h2>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        {/* 배너 — OTB/vs DatePicker + 월 픽업 집계 (상단) */}
        <div className="px-5 pt-3 pb-1 shrink-0">
          <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
            <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
              <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} availableDates={otbDates ?? []} accent bare fontPx={13} plain />
            </span>
            {' '}
            <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
              <DatePicker label="vs" value={vsOtbDate} onChange={setVsOtbDate} availableDates={(otbDates ?? []).filter(d => d < otbDate)} accent bare fontPx={13} plain />
            </span>
            {' '}{pickupDays === 0 ? '당일' : `${pickupDays}일간`} {modalMonth + 1}월 픽업은 총{' '}
            <span style={mintVal}>{totalPuRn >= 0 ? '+' : ''}{totalPuRn.toLocaleString('ko-KR')}실</span>
            , ADR <span style={mintVal}>{totalPuAdr >= 0 ? '+' : ''}{fmtK(totalPuAdr)}</span>
            , REV <span style={mintVal}>{totalPuRev >= 0 ? '+' : ''}{fmtM(totalPuRev)}</span>
            {' '}입니다.
          </p>
        </div>

        {/* 월 변경 — 배너 아래, 가운데 정렬 */}
        <div className="px-5 pb-2 shrink-0" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <button
            onClick={handlePrev}
            disabled={isMinMonth}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            <ChevronLeft size={13} /> 이전
          </button>
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 100, textAlign: 'center' }}>
            {modalYear}년 {modalMonth + 1}월
          </span>
          <button
            onClick={handleNext}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            다음 <ChevronRight size={13} />
          </button>
        </div>

        {/* 차트 */}
        <div className="px-4 pb-4 pt-1" style={{ height: 360 }}>
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  )
}
