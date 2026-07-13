'use client'

// Pick-up Pace 메인 차트 — 월간 일자별 OCC 막대(좌축) + ADR 선형(우축, 이중 Y축)
// 데이터: a02_otb_daily (update_date=otbDate, business_date=해당 월). 날짜 클릭 → onSelectDate

import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import Chart from 'chart.js/auto'
import { supabase } from '@/lib/supabase'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (n: number) => String(n).padStart(2, '0')

export default function PaceChart({
  hotelId, otbDate, year, month, roomCount, onSelectDate,
}: {
  hotelId:      string | undefined
  otbDate:      string
  year:         number
  month:        number   // 0-based
  roomCount:    number
  onSelectDate: (dateStr: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<Chart | null>(null)
  // 콜백 ref 유지 → 신원 변화로 차트 재생성 방지
  const onSelectDateRef = useRef(onSelectDate)
  onSelectDateRef.current = onSelectDate

  const lastDay    = new Date(year, month + 1, 0).getDate()
  const monthStart = `${year}-${pad(month + 1)}-01`
  const monthEnd   = `${year}-${pad(month + 1)}-${pad(lastDay)}`

  // a02_otb_daily — 해당 OTB 스냅샷의 월간 일자별 nights / room_revenue (세그먼트 합산 전 raw)
  const { data: rows = [] } = useQuery({
    queryKey: ['pickup-pace', hotelId, otbDate, monthStart, monthEnd],
    enabled: !!hotelId && !!otbDate,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a02_otb_daily')
        .select('business_date, nights, room_revenue')
        .eq('hotel_id', hotelId)
        .eq('update_date', otbDate)
        .gte('business_date', monthStart)
        .lte('business_date', monthEnd)
      if (error) throw error
      return (data ?? []) as { business_date: string; nights: number; room_revenue: number }[]
    },
  })

  // 일자별 OCC% / ADR
  const daily = useMemo(() => {
    const nByDay: Record<number, number> = {}
    const rByDay: Record<number, number> = {}
    for (const r of rows) {
      const d = new Date(r.business_date)
      if (d.getFullYear() !== year || d.getMonth() !== month) continue
      const day = d.getDate()
      nByDay[day] = (nByDay[day] ?? 0) + (r.nights ?? 0)
      rByDay[day] = (rByDay[day] ?? 0) + (r.room_revenue ?? 0)
    }
    return Array.from({ length: lastDay }, (_, i) => {
      const day = i + 1
      const n = nByDay[day]
      const rev = rByDay[day]
      return {
        day,
        dateStr: `${year}-${pad(month + 1)}-${pad(day)}`,
        dow: new Date(year, month, day).getDay(),
        occ: n != null && roomCount > 0 ? Math.round((n / roomCount) * 100) : (n != null ? 0 : null),
        adr: n ? Math.round(rev / n) : null,
      }
    })
  }, [rows, year, month, lastDay, roomCount])

  // 오늘(otbDate)이 이 월에 속하면 해당 일자 파란색 강조
  const otbDay = otbDate.slice(0, 7) === `${year}-${pad(month + 1)}` ? Number(otbDate.slice(8, 10)) : null

  useEffect(() => {
    if (!canvasRef.current) return
    chartRef.current?.destroy()

    const labels  = daily.map(d => [String(d.day), DAY_NAMES[d.dow]])
    const occData = daily.map(d => d.occ)
    const adrData = daily.map(d => d.adr)

    // 막대 색: otbDate 파랑 / 금·토 진한 회색 / 기본 회색
    const barColor = daily.map(d =>
      otbDay != null && d.day === otbDay ? '#5B8DEF'
        : d.dow === 5 || d.dow === 6 ? 'rgba(120,120,120,0.55)'
        : 'rgba(180,180,180,0.22)')

    // OCC% 라벨 (바 상단)
    const occLabels = {
      id: 'occLabels',
      afterDatasetsDraw(chart: any) {
        const { ctx, scales: { x, y } } = chart
        occData.forEach((val, i) => {
          if (val == null || val === 0) return
          const xPos = x.getPixelForValue(i)
          const yPos = y.getPixelForValue(val)
          ctx.save()
          ctx.fillStyle = 'rgba(160,160,160,0.6)'
          ctx.font = '9px sans-serif'
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
          ctx.fillText(`${val}%`, xPos, yPos - 3)
          ctx.restore()
        })
      },
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: labels as any,
        datasets: [
          {
            type: 'bar',
            label: 'OCC%',
            data: occData as number[],
            backgroundColor: barColor,
            borderRadius: 2,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'line',
            label: 'ADR',
            data: adrData as number[],
            borderColor: '#F59E0B',
            backgroundColor: 'transparent',
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: '#F59E0B',
            spanGaps: true,
            yAxisID: 'y2',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18, bottom: 8 } },
        interaction: { mode: 'index', intersect: false },
        onClick: (_e: any, els: any[]) => {
          if (!els.length) return
          onSelectDateRef.current(daily[els[0].index].dateStr)
        },
        onHover: (e: any, els: any[]) => {
          const cv = e?.native?.target as HTMLCanvasElement | undefined
          if (cv) cv.style.cursor = els.length ? 'pointer' : 'default'
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              // 날짜 + 요일
              title: (items: any[]) => {
                const d = daily[items[0].dataIndex]
                return d ? `${month + 1}월 ${d.day}일 (${DAY_NAMES[d.dow]})` : ''
              },
              // 데이터셋별 1줄만 (0=OCC 막대 / 1=ADR 선형) → 중복 방지
              label: (item: any) => (item.datasetIndex === 0
                ? `OCC  ${item.raw == null ? '-' : `${item.raw}%`}`
                : `ADR  ${item.raw == null ? '-' : `${Math.round(item.raw / 1000)}k`}`),
            },
            // 동일 datasetIndex 가 중복 유입돼도 첫 항목만 표시
            filter: (item: any, index: number, items: any[]) =>
              items.findIndex((i: any) => i.datasetIndex === item.datasetIndex) === index,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: (c: any) => {
                const d = daily[c.index]
                if (otbDay != null && d?.day === otbDay) return '#5B8DEF'
                return d?.dow === 5 || d?.dow === 6 ? '#E24B4A' : '#888'
              },
              font: { size: 10 }, maxRotation: 0, padding: 6,
            },
          },
          y: {
            position: 'left', min: 0, max: 110,
            grid: { color: 'rgba(255,255,255,0.04)' },
            border: { display: false },
            ticks: { color: '#555', font: { size: 10 }, callback: (v: any) => (v <= 100 ? `${v}%` : '') },
          },
          y2: {
            position: 'right', beginAtZero: true,
            grid: { drawOnChartArea: false },
            border: { display: false },
            ticks: { color: '#F59E0B', font: { size: 10 }, callback: (v: any) => `${Math.round(v / 1000)}k` },
          },
        },
      },
      plugins: [occLabels],
    })

    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [daily, otbDay, month])

  return <canvas ref={canvasRef} />
}
