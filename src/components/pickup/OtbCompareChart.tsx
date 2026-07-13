'use client'

// 일간 OTB 비교 차트 — 현재 월 일자별 현재 OTB OCC 바 + 전년 OTB OCC 가로선 오버레이
// PickupChartModal 차트 스타일 그대로. 날짜 클릭 → onSelectDate(dateStr)

import { useEffect, useMemo, useRef } from 'react'
import type { LyPacingRow } from '@/hooks/useLyPacing'
import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import { mainSegCodes } from '@/utils/otbCompareTable'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function OtbCompareChart({
  lyRows, schema, roomCount, year, month, otbDate, isPeriod, selectedDate, onSelectDate,
}: {
  lyRows:       LyPacingRow[]
  schema:       MarketSchemaRow[]
  roomCount:    number
  year:         number
  month:        number   // 0-based
  otbDate:      string
  isPeriod:     boolean  // true=동기간(보라) / false=동일자(금색)
  selectedDate: string | null
  onSelectDate: (dateStr: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  // 콜백은 ref로 유지 → onSelectDate 신원 변화(부모 리렌더)로 차트가 재생성되지 않도록
  const onSelectDateRef = useRef(onSelectDate)
  onSelectDateRef.current = onSelectDate

  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month + 1, 0).getDate()

  // 표 Total 과 동일한 코드 집합(main 계층)만 집계 → 차트·표 OCC 일치
  const codeSet = useMemo(() => mainSegCodes(schema), [schema])

  // 일자별 현재 OTB / 전년 OTB OCC%
  const daily = useMemo(() => {
    const otbByDay: Record<number, number> = {}
    const lyByDay:  Record<number, number> = {}
    for (const r of lyRows) {
      if (!codeSet.has(r.segmentation)) continue
      const d = new Date(r.business_date)
      if (d.getFullYear() !== year || d.getMonth() !== month) continue
      const day = d.getDate()
      otbByDay[day] = (otbByDay[day] ?? 0) + (r.otb_nights ?? 0)
      lyByDay[day]  = (lyByDay[day]  ?? 0) + (r.ly_nights  ?? 0)
    }
    return Array.from({ length: lastDay }, (_, i) => {
      const day = i + 1
      const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`
      const dow = new Date(year, month, day).getDay()
      const hasOtb = otbByDay[day] != null
      const hasLy  = lyByDay[day]  != null
      return {
        day, dateStr, dow,
        otbOcc: hasOtb && roomCount > 0 ? Math.round((otbByDay[day] / roomCount) * 100) : (hasOtb ? 0 : null),
        lyOcc:  hasLy  && roomCount > 0 ? Math.round((lyByDay[day]  / roomCount) * 100) : null,
      }
    })
  }, [lyRows, codeSet, year, month, lastDay, roomCount])

  // 오늘(otbDate)이 이 월에 속하면 해당 일자 파란색 강조
  const otbDay = otbDate.slice(0, 7) === `${year}-${pad(month + 1)}` ? Number(otbDate.slice(8, 10)) : null
  const selDay = selectedDate && selectedDate.slice(0, 7) === `${year}-${pad(month + 1)}` ? Number(selectedDate.slice(8, 10)) : null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (cancelled || !canvasRef.current) return
      chartRef.current?.destroy()

      const labels  = daily.map(d => d.day)
      const occData = daily.map(d => d.otbOcc)
      const lyData  = daily.map(d => d.lyOcc)

      const lineColor = isPeriod ? 'rgba(167,139,250,0.95)' : 'rgba(245,158,11,0.95)'

      // 현재 OTB OCC% 라벨 (바 상단)
      const occLabels = {
        id: 'occLabels',
        afterDatasetsDraw(chart: any) {
          const { ctx, scales: { x, yOcc } } = chart
          occData.forEach((val: number | null, i: number) => {
            if (val == null || val === 0) return
            const xPos = x.getPixelForValue(i)
            const yPos = yOcc.getPixelForValue(val)
            ctx.save()
            ctx.fillStyle = 'rgba(160,160,160,0.55)'
            ctx.font = '9px sans-serif'
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
            ctx.fillText(`${val}%`, xPos, yPos - 3)
            ctx.restore()
          })
        },
      }

      // 전년 OTB 가로선 (바 폭의 30%, 중앙 정렬)
      const lyTick = {
        id: 'lyTick',
        beforeDatasetsDraw(chart: any) {
          const { ctx, scales: { yOcc } } = chart
          const meta = chart.getDatasetMeta(0)   // OCC 바
          if (!meta?.data?.length) return
          meta.data.forEach((el: any, i: number) => {
            const v = lyData[i]
            if (el == null || v == null) return
            const bw = (el.width ?? 10) * 0.3
            const y  = yOcc.getPixelForValue(v)
            ctx.save()
            ctx.beginPath()
            ctx.moveTo(el.x - bw / 2, y)
            ctx.lineTo(el.x + bw / 2, y)
            ctx.strokeStyle = lineColor
            ctx.lineWidth = 2
            ctx.setLineDash([])
            ctx.stroke()
            ctx.restore()
          })
        },
      }

      chartRef.current = new Chart(canvasRef.current, {
        plugins: [lyTick, occLabels],
        data: {
          labels,
          datasets: [{
            type: 'bar',
            label: 'OTB OCC%',
            data: occData as number[],
            // 기본 색상만 지정 — 선택 막대 하이라이트는 아래 별도 effect에서 in-place 갱신 (재생성 방지)
            backgroundColor: daily.map(() => 'rgba(180,180,180,0.14)'),
            borderColor:     daily.map(() => 'rgba(180,180,180,0.2)'),
            borderWidth: 1,
            borderRadius: 2,
            yAxisID: 'yOcc',
            barPercentage: 0.9,
            categoryPercentage: 0.9,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
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
                title: (items: any[]) => {
                  const d = daily[items[0].dataIndex]
                  return d ? `${month + 1}월 ${d.day}일 (${DAY_NAMES[d.dow]})` : ''
                },
                label: (item: any) => {
                  const d = daily[item.dataIndex]
                  const cur = d.otbOcc == null ? '-' : `${d.otbOcc}%`
                  const ly  = d.lyOcc  == null ? '-' : `${d.lyOcc}%`
                  return [`현재 OTB  ${cur}`, `전년 OTB  ${ly}`]
                },
              },
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
                font: { size: 10 },
                maxRotation: 0,
                padding: 6,
                callback: (_v: any, index: number) => {
                  const d = daily[index]
                  return d ? [String(d.day), DAY_NAMES[d.dow]] : ''
                },
              },
            },
            yOcc: {
              position: 'left', min: 0, max: 110,
              grid: { display: false },
              border: { display: false },
              ticks: { color: '#444', font: { size: 10 }, callback: (v: any) => (v <= 100 ? `${v}%` : '') },
            },
          },
        },
      })
    })()
    return () => { cancelled = true; chartRef.current?.destroy(); chartRef.current = null }
  }, [daily, isPeriod, otbDay, month])

  // 선택 막대 하이라이트 — 차트 재생성 없이 색상만 갱신 (막대 클릭 시 깜빡임 방지)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const ds = chart.data.datasets[0]
    ds.backgroundColor = daily.map(d => (selDay === d.day ? 'rgba(91,141,239,0.45)' : 'rgba(180,180,180,0.14)'))
    ds.borderColor     = daily.map(d => (selDay === d.day ? 'rgba(91,141,239,0.9)'  : 'rgba(180,180,180,0.2)'))
    chart.update('none')
  }, [selDay, daily])

  return <canvas ref={canvasRef} />
}
