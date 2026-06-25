'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toLocalYMD } from '@/utils/dateLocal'
import { getKSTDateString } from './BaseCalendar'

const PAGE = 15

interface RateChartViewProps {
  hotelId:    string
  otbDate:    string  // 상단 OTB 날짜
  vsOtbDate:  string  // 상단 VS OTB 날짜
  onDayClick: (dateStr: string) => void
}

export function RateChartView({ hotelId, otbDate, vsOtbDate, onDayClick }: RateChartViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  const listenersCleanupRef = useRef<(() => void) | null>(null)
  const [offset,  setOffset]  = useState(0)

  // BAR Rate 조회 — 오늘부터 60일
  const today    = getKSTDateString()
  // 오늘부터 4개월 후 말일까지
  const endDate  = (() => {
    const d        = new Date(today + 'T00:00:00')
    const endMonth = d.getMonth() + 4              // 4개월 후
    const endYear  = d.getFullYear() + Math.floor(endMonth / 12)
    const month    = endMonth % 12
    return toLocalYMD(new Date(endYear, month + 1, 0))   // 해당 월 말일 (로컬)
  })()

  const { data: barRates = [] } = useQuery({
    queryKey: ['bar-rate-chart', hotelId, today],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s02_rate_detail')
        .select('stay_date, new_rate')
        .eq('hotel_id', hotelId)
        .eq('room_type_code', 'BASE')
        .eq('date_type', 'single')
        .gte('stay_date', today)
        .lte('stay_date', endDate)
        .order('stay_date', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId,
  })

  // OCC/픽업 조회 — get_pickup_data RPC (상단 OTB/VS OTB 날짜 사용)
  const { data: pickupRows = [] } = useQuery({
    queryKey: ['chart-pickup', hotelId, otbDate, vsOtbDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_pickup_data', {
          p_hotel_id:    hotelId,
          p_otb_date:    otbDate,
          p_vs_otb_date: vsOtbDate,
          p_min_date:    otbDate,
        })
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId,
  })

  // [디버그] get_pickup_data 결과의 sorting2 컬럼 고유값
  useEffect(() => {
    console.log('[pickup] sorting2 values:',
      [...new Set((pickupRows as any[]).map(r => r.sorting2))]
    )
  }, [pickupRows])

  // roomCount 직접 조회 — 기존 OCC 로직과 동일하게 m03_hotel_details 사용
  const { data: hotelInfo } = useQuery({
    queryKey: ['hotel-room-count', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('m03_hotel_details')
        .select('room_count')
        .eq('hotel_id', hotelId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!hotelId,
  })
  const roomCount = hotelInfo?.room_count ?? 0

  // occMap: business_date → occ% = 합산 otb_nights / roomCount * 100
  const occMap = useMemo(() => {
    if (!roomCount) return {} as Record<string, number>
    const nightsMap: Record<string, number> = {}
    for (const r of pickupRows as any[]) {
      const d = r.business_date as string
      nightsMap[d] = (nightsMap[d] ?? 0) + (r.otb_nights ?? 0)
    }
    const result: Record<string, number> = {}
    for (const [d, nights] of Object.entries(nightsMap)) {
      result[d] = Math.round((nights / roomCount) * 100)
    }
    return result
  }, [pickupRows, roomCount])

  // 날짜별 픽업 데이터 (sorting2: fit/group, ADR)
  const pickupMap = useMemo<Record<string, { fit: number; group: number; adr: number | null }>>(() => {
    const map: Record<string, { fitNights: number; groupNights: number; totalNights: number; totalRev: number }> = {}
    for (const r of pickupRows as any[]) {
      const d = r.business_date as string
      if (!map[d]) map[d] = { fitNights: 0, groupNights: 0, totalNights: 0, totalRev: 0 }
      if (r.sorting2 === 'fit')   map[d].fitNights   += r.pu_nights ?? 0
      if (r.sorting2 === 'group') map[d].groupNights += r.pu_nights ?? 0
      map[d].totalNights += r.otb_nights  ?? 0
      map[d].totalRev    += r.otb_revenue ?? 0
    }
    const result: Record<string, { fit: number; group: number; adr: number | null }> = {}
    for (const [d, v] of Object.entries(map)) {
      result[d] = {
        fit:   v.fitNights,
        group: v.groupNights,
        adr:   v.totalNights > 0 ? Math.round(v.totalRev / v.totalNights / 1000) : null,
      }
    }
    return result
  }, [pickupRows])

  // c06_calendar 조회 — 요일/이벤트 (X축 하단 표시용)
  const { data: calendarRows = [] } = useQuery({
    queryKey: ['c06_calendar_chart', today, endDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c06_calendar')
        .select('date, day, event')
        .gte('date', today)
        .lte('date', endDate)
      if (error) throw error
      return data ?? []
    },
  })

  const calendarMap = useMemo<Record<string, { day: string; event: string | null }>>(() => {
    const result: Record<string, { day: string; event: string | null }> = {}
    for (const r of calendarRows as any[]) {
      result[r.date] = { day: r.day, event: r.event || null }
    }
    return result
  }, [calendarRows])

  // 날짜별 데이터 통합 — 오늘 ~ endDate(4개월 후 말일) 전 구간 (BAR 없고 OCC만 있어도 표시)
  const allData = useMemo(() => {
    console.log('[chart] calendarMap sample:', Object.entries(calendarMap).slice(0, 3))
    console.log('[chart] today:', today)

    const barMap: Record<string, number> = {}
    for (const r of barRates as any[]) barMap[r.stay_date] = r.new_rate

    const result = []
    const end = new Date(endDate + 'T00:00:00')
    for (let d = new Date(today + 'T00:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const wd      = d.getDay()
      result.push({
        label:     `${d.getMonth() + 1}/${d.getDate()}`,
        dateStr,
        occ:       occMap[dateStr] != null ? Math.round(occMap[dateStr]) : null,
        bar:       barMap[dateStr] != null ? Math.round(barMap[dateStr] / 1000) : null,
        isWeekend: wd === 5 || wd === 6,
        dow:       calendarMap[dateStr]?.day ?? '',      // 요일 (월,화,수…)
        event:     calendarMap[dateStr]?.event ?? null,  // 이벤트명 (null이면 표시 안 함)
        fit:       pickupMap[dateStr]?.fit   ?? null,
        group:     pickupMap[dateStr]?.group ?? null,
        adr:       pickupMap[dateStr]?.adr   ?? null,
      })
    }
    return result
  }, [barRates, occMap, calendarMap, pickupMap, today, endDate])

  function occColor(o: number | null) {
    if (o == null) return 'rgba(80,80,80,0.3)'
    if (o >= 80) return 'rgba(0,229,160,0.6)'
    if (o >= 60) return 'rgba(255,160,64,0.6)'
    return 'rgba(255,95,95,0.6)'
  }

  function updateChart(chart: any, data: typeof allData, off: number) {
    const slice = data.slice(off, off + PAGE)
    ;(chart as any)._sliceData              = slice  // afterDraw 플러그인에서 참조
    chart.data.labels                       = slice.map(d => [d.label, d.dow])  // 날짜 + 요일 2줄
    chart.data.datasets[0].data             = slice.map(d => d.occ)
    chart.data.datasets[0].backgroundColor  = slice.map(d => occColor(d.occ))
    chart.data.datasets[1].data             = slice.map(d => d.bar)
    chart.update()
  }

  // Chart.js 초기화 (동적 import — SSR 방지)
  useEffect(() => {
    const init = async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)

      // 데이터 레이블 — chartjs-plugin-datalabels 미설치라 afterDatasetsDraw 커스텀 구현
      const datalabelPlugin = {
        id: 'customDatalabels',
        afterDatasetsDraw(chart: any) {
          const ctx = chart.ctx
          chart.data.datasets.forEach((dataset: any, i: number) => {
            const meta = chart.getDatasetMeta(i)
            meta.data.forEach((el: any, j: number) => {
              const val = dataset.data[j]
              if (val == null) return

              // BAR Rate — pill 스타일
              if (i === 1) {
                const { x, y } = el
                const text = val + 'K'
                ctx.save()
                ctx.font = 'bold 10px sans-serif'
                const tw = ctx.measureText(text).width
                const pw = tw + 14
                const ph = 18
                // pill 배경
                ctx.beginPath()
                if (ctx.roundRect) {
                  ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, ph / 2)
                } else {
                  ctx.rect(x - pw / 2, y - ph / 2, pw, ph)
                }
                ctx.fillStyle = '#00E5A0'
                ctx.fill()
                // 텍스트
                ctx.fillStyle    = '#04342C'
                ctx.textAlign    = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(text, x, y)
                ctx.restore()
                return
              }

              // OCC % — BAR Rate pill(line point) 위 16px 에 고정
              const lineMeta  = chart.getDatasetMeta(1)
              const linePoint = lineMeta.data[j]
              const lineY     = linePoint ? linePoint.y : el.y
              ctx.save()
              ctx.font         = '10px sans-serif'
              ctx.fillStyle    = 'rgba(255,255,255,0.8)'
              ctx.textAlign    = 'center'
              ctx.textBaseline = 'bottom'
              ctx.fillText(val + '%', el.x, lineY - 16)  // pill 위 16px
              ctx.restore()
            })
          })
        },
        // X축 아래 — 이벤트 동그라미 (Chart.js의 DPR transform 유지 → 논리 좌표 그대로 사용)
        afterDraw(chart: any) {
          const ctx = chart.ctx
          ctx.save()

          const xAxis = chart.scales['x']
          const slice = (chart as any)._sliceData ?? []

          xAxis.ticks.forEach((_: any, i: number) => {
            const d = slice[i]
            if (!d) return
            const x = xAxis.getPixelForTick(i)

            // 이벤트 동그라미 (요일 아래)
            if (d.event &&
                d.event.trim() !== '' &&
                d.event.trim().toLowerCase() !== 'null' &&
                d.event.trim().toLowerCase() !== 'nu') {
              const y = chart.chartArea.bottom + 52
              const label = d.event.trim().slice(0, 2)
              ctx.beginPath()
              ctx.arc(x, y, 9, 0, Math.PI * 2)
              ctx.fillStyle   = 'rgba(255,160,64,0.2)'
              ctx.strokeStyle = 'rgba(255,160,64,0.6)'
              ctx.lineWidth   = 1
              ctx.fill()
              ctx.stroke()
              ctx.fillStyle    = '#ffa040'
              ctx.font         = 'bold 9px sans-serif'
              ctx.textAlign    = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(label, x, y)
            }
          })
          ctx.restore()
        },
      }
      Chart.register(datalabelPlugin)

      if (!canvasRef.current) return
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

      const chart = new Chart(canvasRef.current, {
        data: {
          labels: [],
          datasets: [
            {
              type: 'bar',
              label: 'OCC %',
              data: [],
              backgroundColor: [],
              borderRadius: 3,
              yAxisID: 'yOcc',
              order: 2,
            },
            {
              type: 'line',
              label: 'BAR Rate (K)',
              data: [],
              borderColor: '#00E5A0',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 0,
              pointBackgroundColor: '#00E5A0',
              tension: 0.3,
              yAxisID: 'yBar',
              order: 1,
            },
          ],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          layout: { padding: { bottom: 60 } },  // 이벤트 동그라미 공간 (y +52 수용)
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: false,  // 기본 툴팁 비활성화 → 커스텀 HTML 툴팁 사용
              external: (context: any) => {
                const { chart, tooltip } = context
                let el = document.getElementById('chart-tooltip')
                if (!el) {
                  el = document.createElement('div')
                  el.id = 'chart-tooltip'
                  el.style.cssText = `
                    position: fixed;
                    left: 0;
                    top: 0;
                    background: #1a1a1a;
                    border: 0.5px solid #333;
                    border-radius: 8px;
                    padding: 10px 12px;
                    font-family: sans-serif;
                    font-size: 11px;
                    pointer-events: none;
                    z-index: 9999;
                    min-width: 140px;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
                    opacity: 0;
                    transition: opacity 0.2s ease, transform 0.12s ease;
                    will-change: transform, opacity;
                  `
                  document.body.appendChild(el)
                }

                if (tooltip.opacity === 0) {
                  el.style.opacity = '0'
                  return
                }

                const idx   = tooltip.dataPoints?.[0]?.dataIndex
                const slice = (chart as any)._sliceData ?? []
                const d     = slice[idx]
                console.log('[tooltip] idx:', idx, 'd:', d)
                if (!d) return

                const occ   = d.occ   != null ? `${d.occ}%`  : '—'
                const adr   = d.adr   != null ? `${d.adr}K`  : '—'
                const bar   = d.bar   != null ? `${d.bar}K`  : '—'
                const fit   = d.fit   != null ? (d.fit   >= 0 ? `+${d.fit}`   : `${d.fit}`)   + '실' : '—'
                const group = d.group != null ? (d.group >= 0 ? `+${d.group}` : `${d.group}`) + '실' : '—'

                el.innerHTML = `
                  <div style="color:#aaa;font-weight:500;margin-bottom:6px">${d.label} ${d.dow}</div>
                  <div style="display:flex;gap:12px;margin-bottom:6px">
                    <div>
                      <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.05em">OCC</div>
                      <div style="font-size:13px;font-weight:500;color:#ffa040">${occ}</div>
                    </div>
                    <div>
                      <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.05em">ADR</div>
                      <div style="font-size:13px;font-weight:500;color:#eee">${adr}</div>
                    </div>
                    <div>
                      <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.05em">BAR</div>
                      <div style="font-size:13px;font-weight:500;color:#00E5A0">${bar}</div>
                    </div>
                  </div>
                  <div style="height:0.5px;background:#333;margin-bottom:6px"></div>
                  <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Pick-Up</div>
                  <div style="display:flex;flex-direction:column;gap:2px">
                    <div style="display:flex;justify-content:space-between;gap:16px">
                      <span style="color:#555">FIT</span>
                      <span style="color:#00E5A0;font-weight:500">${fit}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;gap:16px">
                      <span style="color:#555">GROUP</span>
                      <span style="color:#00E5A0;font-weight:500">${group}</span>
                    </div>
                  </div>
                `
                // 위치 계산 (fixed → 뷰포트 기준) — transform 으로 이동(부드럽게)
                const rect = chart.canvas.getBoundingClientRect()
                let x = rect.left + tooltip.caretX + 14
                let y = rect.top  + tooltip.caretY - 10
                if (x + 160 > window.innerWidth)  x = rect.left + tooltip.caretX - 165
                if (y + 220 > window.innerHeight) y = rect.top  + tooltip.caretY - 220

                el.style.transform = `translate(${x}px, ${y}px)`
                el.style.opacity   = '1'
              },
            },
          },
          scales: {
            x: {
              grid:  { color: 'rgba(255,255,255,0.04)' },
              ticks: {
                color: (context: any) => {
                  const d = (chartRef.current as any)?._sliceData?.[context.index]
                  return ['금', '토'].includes(d?.dow ?? '') ? '#E24B4A' : '#555'
                },
                font: (context: any) => {
                  const d = (chartRef.current as any)?._sliceData?.[context.index]
                  const isWe = ['금', '토'].includes(d?.dow ?? '')
                  return { size: 11, weight: isWe ? 'bold' : 'normal' }
                },
                autoSkip:    false,
                maxRotation: 0,
              },
            },
            yOcc: {
              position: 'left',
              min: 0, max: 100,
              grid:  { color: 'rgba(255,255,255,0.06)' },
              ticks: {
                color:    '#555',
                font:     { size: 11 },
                callback: (v: any) => v + '%',
              },
            },
            yBar: {
              position: 'right',
              min: 0, max: 400,
              grid: { display: false },
              ticks: {
                color:    '#00E5A0',
                font:     { size: 11 },
                callback: (v: any) => v + 'K',
              },
            },
          },
        },
      } as any)
      chartRef.current = chart
      updateChart(chart, allData, offset)

      // BAR Rate pill 클릭 → 일자 상세 모달 / pill 위 hover 시 pointer
      const canvasEl = canvasRef.current
      if (canvasEl) {
        const hitTest = (e: MouseEvent): string | null => {
          const c = chartRef.current
          if (!c) return null
          const slice = (c as any)._sliceData ?? []
          const meta  = c.getDatasetMeta(1)  // line dataset (BAR Rate)
          const rect  = canvasEl.getBoundingClientRect()
          const mouseX = e.clientX - rect.left
          const mouseY = e.clientY - rect.top
          let hit: string | null = null
          meta.data.forEach((el: any, i: number) => {
            const d = slice[i]
            if (!d?.dateStr || d.bar == null) return
            const { x, y } = el
            const pw = (d.bar + 'K').length * 7 + 14  // pill 폭 추정(10px font)
            const ph = 18
            if (mouseX >= x - pw / 2 && mouseX <= x + pw / 2 && mouseY >= y - ph / 2 && mouseY <= y + ph / 2) {
              hit = d.dateStr
            }
          })
          return hit
        }
        const handleClick = (e: MouseEvent) => {
          const date = hitTest(e)
          if (date) onDayClick(date)
        }
        const handleMouseMove = (e: MouseEvent) => {
          canvasEl.style.cursor = hitTest(e) ? 'pointer' : 'default'
        }
        canvasEl.addEventListener('click', handleClick)
        canvasEl.addEventListener('mousemove', handleMouseMove)
        listenersCleanupRef.current = () => {
          canvasEl.removeEventListener('click', handleClick)
          canvasEl.removeEventListener('mousemove', handleMouseMove)
          canvasEl.style.cursor = 'default'
        }
      }
    }
    init()
    return () => {
      listenersCleanupRef.current?.()
      listenersCleanupRef.current = null
      const tip = document.getElementById('chart-tooltip')
      if (tip && document.body.contains(tip)) document.body.removeChild(tip)
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (chartRef.current) updateChart(chartRef.current, allData, offset)
  }, [allData, offset])

  const slice     = allData.slice(offset, offset + PAGE)
  const rangeText = slice.length > 0
    ? `${slice[0].label} — ${slice[slice.length - 1].label}`
    : ''

  return (
    <div style={{
      border:       '1px solid var(--color-border-default)',
      borderRadius: 12,
      background:   '#000000',
      padding:      '16px 20px',
    }}>
      {/* 상단: 범례 + 네비 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(0,229,160,0.6)', display: 'inline-block' }} />
            OCC %
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 20, height: 2, background: '#00E5A0', display: 'inline-block' }} />
            BAR Rate
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', minWidth: 120, textAlign: 'center' }}>
            {rangeText}
          </span>
          <button
            onClick={() => setOffset(o => Math.max(0, o - PAGE))}
            disabled={offset === 0}
            style={{
              width: 28, height: 28,
              border:       '0.5px solid var(--color-border-default)',
              borderRadius: 6,
              background:   'transparent',
              cursor:       offset === 0 ? 'default' : 'pointer',
              opacity:      offset === 0 ? 0.3 : 1,
              display:      'flex', alignItems: 'center', justifyContent: 'center',
              color:        'var(--color-text-secondary)',
            }}
          >
            <ChevronLeft size={13} aria-hidden="true" />
          </button>
          <button
            onClick={() => setOffset(o => Math.min(allData.length - PAGE, o + PAGE))}
            disabled={offset + PAGE >= allData.length}
            style={{
              width: 28, height: 28,
              border:       '0.5px solid var(--color-border-default)',
              borderRadius: 6,
              background:   'transparent',
              cursor:       offset + PAGE >= allData.length ? 'default' : 'pointer',
              opacity:      offset + PAGE >= allData.length ? 0.3 : 1,
              display:      'flex', alignItems: 'center', justifyContent: 'center',
              color:        'var(--color-text-secondary)',
            }}
          >
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 차트 */}
      <div style={{ position: 'relative', width: '100%', height: 420, background: '#000000', borderRadius: 8 }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="OCC 막대 그래프와 BAR Rate 선형 그래프"
        />
      </div>
    </div>
  )
}
