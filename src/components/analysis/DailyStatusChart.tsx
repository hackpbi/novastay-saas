'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Chart, BarController, LineController, BarElement, LineElement, PointElement,
  LinearScale, CategoryScale, Tooltip,
  type ChartConfiguration, type Plugin, type ChartArea, type ScriptableContext,
} from 'chart.js'

Chart.register(BarController, LineController, BarElement, LineElement, PointElement, LinearScale, CategoryScale, Tooltip)

export interface EventItem {
  day:    number
  name:   string
  color?: string
}

interface DailyStatusChartProps {
  year:        number
  month:       number            // 1-based
  occData:     (number | null)[] // 길이 = 해당 월 일수
  adrData:     (number | null)[]
  otbDate:     string            // 'YYYY-MM-DD'
  chartHeight?: number           // 미지정 시 부모 높이 100%
  isLY?:       boolean
  isOTBMonth?: boolean           // 해당 월 전체가 OTB면 true (월 단위 구분)
  barData?:    (number | null)[] // BAR Rate (원), otbDate 이전은 null
  showOcc?:    boolean           // default true
  showAdr?:    boolean           // default true
  showBar?:    boolean           // default true
  events:      EventItem[]
  onDayClick:  (day: number) => void
}

const EVENT_DEFAULT = '#f0a500'
const isValidEventName = (n: unknown): n is string =>
  typeof n === 'string' && n.trim() !== '' && n.trim().toLowerCase() !== 'null'

// 막대 세로 그라데이션 (상단 밝고 하단 어두움)
function createBarGradient(
  ctx: CanvasRenderingContext2D, area: ChartArea,
  opts: { isLY: boolean; isOTB: boolean; isToday: boolean },
): CanvasGradient {
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom)
  if (opts.isToday) {
    g.addColorStop(0, 'rgba(91,141,239,0.95)'); g.addColorStop(1, 'rgba(60,100,200,0.35)')
  } else if (opts.isLY) {
    g.addColorStop(0, 'rgba(100,120,180,0.85)'); g.addColorStop(1, 'rgba(50,70,130,0.35)')
  } else if (opts.isOTB) {
    g.addColorStop(0, 'rgba(0,229,160,0.35)'); g.addColorStop(1, 'rgba(0,229,160,0.05)')
  } else {
    g.addColorStop(0, 'rgba(0,229,160,0.90)'); g.addColorStop(1, 'rgba(0,150,120,0.30)')
  }
  return g
}

interface Badge { day: number; x: number; names: string[]; color: string }
interface LabelItem { day: number; x: number; occY: number; adrY: number | null; barY: number | null; occ: number; adr: number | null; bar: number | null; isOTB: boolean; isLY: boolean }

export default function DailyStatusChart({
  year, month, occData, adrData, otbDate, chartHeight, isLY = false, isOTBMonth = false, barData, showOcc = true, showAdr = true, showBar = true, events, onDayClick,
}: DailyStatusChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const chartRef  = useRef<Chart | null>(null)
  const wrapRef   = useRef<HTMLDivElement | null>(null)
  const [badges, setBadges]         = useState<Badge[]>([])
  const [labelItems, setLabelItems] = useState<LabelItem[]>([])

  const days     = occData.length
  const pad      = (n: number) => String(n).padStart(2, '0')
  const ymd      = (d: number) => `${year}-${pad(month)}-${pad(d)}`
  const todayYMD = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
  const isOTBDay = (_d: number) => !isLY && isOTBMonth   // 월 단위: 해당 월 전체가 OTB

  const eventsByDay = new Map<number, EventItem[]>()
  for (const e of events ?? []) {
    if (!e || !isValidEventName(e.name)) continue
    const arr = eventsByDay.get(e.day) ?? []
    arr.push(e); eventsByDay.set(e.day, arr)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const labels = Array.from({ length: days }, (_, i) => String(i + 1))

    // ── 라벨(칩) 오버레이 위치: afterLayout에서 계산 (chart.update 미호출 → 무한루프 없음) ──
    const labelPositionPlugin: Plugin<'bar'> = {
      id: 'labelPosition',
      afterLayout(chart) {
        const meta = chart.getDatasetMeta(0)
        if (!meta?.data?.length) return
        const adrDs = chart.data.datasets[1]
        const yAdr = chart.scales.yAdr
        const chartTop = chart.chartArea.top
        const items: LabelItem[] = []
        meta.data.forEach((bar, i) => {
          const occ = chart.data.datasets[0].data[i] as number | null
          if (occ == null || occ <= 0) return
          const b = bar as unknown as { x: number; y: number; width: number }
          if ((b.width ?? 0) < 12) return
          const adr = adrDs.data[i] as number | null
          // ADR 숫자 y = ADR 선의 실제 픽셀 위치(yAdr scale). 너무 위(차트 상단)면 생략
          let adrY: number | null = null
          if (adr != null && adr > 0 && yAdr) {
            const py = yAdr.getPixelForValue(adr)
            adrY = py >= chartTop + 8 ? py : null
          }
          // BAR Rate — ADR과 동일 yAdr scale로 y 계산
          const barVal = barData?.[i] ?? null
          let barY: number | null = null
          if (barVal != null && barVal > 0 && yAdr) {
            const py = yAdr.getPixelForValue(barVal)
            barY = py >= chartTop + 8 ? py : null
          }
          // x는 xScale 기준 (dataset show/hide로 bar.x가 흔들려도 tick 위치는 고정)
          items.push({ day: i + 1, x: chart.scales.x.getPixelForTick(i), occY: b.y - 20, adrY, barY, occ, adr, bar: barVal, isOTB: isOTBDay(i + 1), isLY })
        })
        setLabelItems(items)
      },
    }

    // ── ADR 선 글로우 (dataset index 1) ──
    const glowPlugin: Plugin<'bar'> = {
      id: 'lineGlow',
      beforeDatasetDraw(chart, args) {
        if (args.index !== 1) return
        const ctx = chart.ctx
        ctx.save()
        ctx.shadowColor = isLY ? 'rgba(100,160,255,0.8)' : 'rgba(0,229,160,0.8)'
        ctx.shadowBlur = 12
      },
      afterDatasetDraw(chart, args) {
        if (args.index !== 1) return
        chart.ctx.restore()
      },
    }

    // ── X축 일자+요일 2줄 ──
    const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const xTickPlugin: Plugin<'bar'> = {
      id: 'xTickCustom',
      afterDraw(chart) {
        const ctx = chart.ctx
        const xScale = chart.scales.x
        const baseY = chart.chartArea.bottom
        ctx.save()
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        for (let i = 0; i < days; i++) {
          const d   = i + 1
          const dow = new Date(year, month - 1, d).getDay()
          const isToday   = ymd(d) === todayYMD
          const isWeekend = dow === 5 || dow === 6
          const x = xScale.getPixelForTick(i)
          ctx.font = '9px -apple-system, system-ui, sans-serif'
          ctx.fillStyle = isToday ? '#5B8DEF' : isWeekend ? '#E24B4A' : '#484848'
          ctx.fillText(String(d), x, baseY + 4)
          ctx.font = '8px -apple-system, system-ui, sans-serif'
          ctx.fillStyle = isToday ? '#5B8DEF' : isWeekend ? '#E24B4A' : '#333'
          ctx.fillText(DOW_LABEL[dow], x, baseY + 15)
        }
        ctx.restore()
      },
    }

    // yAdr 축 범위 고정 — ADR 숨김(hidden) 시에도 scale이 붕괴되지 않아 BAR 위치 계산이 유지됨
    const yAdrSrc = [...adrData, ...(barData ?? [])].filter((v): v is number => typeof v === 'number' && v > 0)
    const yAdrMin = yAdrSrc.length ? Math.floor(Math.min(...yAdrSrc) / 10000) * 10000 : undefined
    const yAdrMax = yAdrSrc.length ? Math.ceil(Math.max(...yAdrSrc) / 10000) * 10000 : undefined

    const config: ChartConfiguration = {
      type: 'bar',
      plugins: [labelPositionPlugin, glowPlugin, xTickPlugin],
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'OCC%',
            data: occData as number[],
            backgroundColor: (ctx: ScriptableContext<'bar'>) => {
              const area = ctx.chart.chartArea
              if (!area) return 'rgba(0,229,160,0.7)'   // 최초 레이아웃 전 fallback (이후 자동 재계산)
              const i = ctx.dataIndex
              return createBarGradient(ctx.chart.ctx, area, { isLY, isOTB: isOTBDay(i + 1), isToday: ymd(i + 1) === todayYMD })
            },
            borderColor: occData.map((_, i) => (isOTBDay(i + 1) ? 'rgba(0,229,160,0.45)' : 'transparent')),
            borderWidth: 1,
            borderRadius: 2,
            hidden: !showOcc,
            yAxisID: 'yOcc',
            order: 2,
          },
          {
            type: 'line',
            label: 'ADR',
            data: adrData as number[],
            borderColor: isLY ? 'rgba(100,160,255,0.9)' : 'rgba(0,229,160,0.9)',
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.4,
            spanGaps: true,
            fill: false,
            hidden: !showAdr,
            yAxisID: 'yAdr',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 28, bottom: 32 } },
        onClick: (_e, els) => { if (els.length > 0) onDayClick(els[0].index + 1) },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          tooltip: { enabled: false },
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { display: false, autoSkip: false, maxTicksLimit: 31 },
            grid:  { color: '#181818' },
          },
          yOcc: {
            position: 'left', min: 0, max: 100,
            ticks: { color: '#484848', font: { size: 9 }, callback: (v) => `${v}%`, maxTicksLimit: 5 },
            grid:  { color: '#181818' },
          },
          yAdr: {
            position: 'right',
            min: yAdrMin, max: yAdrMax,                        // 범위 고정 → ADR 숨김 시 BAR y 계산 유지
            afterFit: (scale: any) => { scale.width = 42 },   // 폭 고정 → ADR 토글 시 chartArea 이동 방지
            ticks: {
              color: isLY ? 'rgba(136,153,204,0.7)' : '#5B8DEF',
              font: { size: 9 },
              callback: (v) => `₩${(Number(v) / 1000).toFixed(0)}K`,
              maxTicksLimit: 5,
            },
            grid: { display: false },
          },
        },
      },
    }

    const chart = new Chart(canvas, config)
    chartRef.current = chart

    const computeBadges = () => {
      const meta = chart.getDatasetMeta(0)
      const next: Badge[] = []
      eventsByDay.forEach((evs, day) => {
        const bar = meta.data[day - 1] as { x?: number } | undefined
        if (bar?.x == null) return
        next.push({ day, x: bar.x, names: evs.map(e => e.name), color: evs[0].color || EVENT_DEFAULT })
      })
      setBadges(next)
    }
    computeBadges()

    const ro = new ResizeObserver(() => {
      chart.resize()   // 스크립터블 backgroundColor가 새 chartArea로 자동 재계산됨
      computeBadges()
    })
    if (wrapRef.current) ro.observe(wrapRef.current)

    return () => { ro.disconnect(); chart.destroy(); chartRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, occData, adrData, otbDate, isLY, isOTBMonth, barData, showBar, events])

  // OCC bar / ADR line 표시 토글 (차트 재생성 없이 hidden만 갱신)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.data.datasets[0].hidden = !showOcc
    chart.data.datasets[1].hidden = !showAdr
    chart.update('none')
  }, [showOcc, showAdr])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: chartHeight ?? '100%', minHeight: 0 }}>
      <div ref={wrapRef} style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%' }}>
        <canvas ref={canvasRef} />
        {/* OCC% 칩 + ADR 숫자 HTML 오버레이 (canvas 위, clip 없음) — 독립 배치 */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* OCC% — 텍스트만 (배경/테두리 제거) */}
          {showOcc && labelItems.map(item => (
            <div key={`o${item.day}`} style={{
              position: 'absolute', left: item.x, top: item.occY, transform: 'translateX(-50%)',
              fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: '13px',
              color: item.isOTB ? 'rgba(0,229,160,0.7)' : item.isLY ? 'rgba(255,255,255,0.6)' : '#00E5A0',
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            }}>
              {Math.round(item.occ)}%
            </div>
          ))}
          {/* ADR — 칩 형태 (₩ 없이 숫자K), ADR 선 y 위치 */}
          {showAdr && labelItems.map(item => (
            item.adr != null && item.adr > 0 && item.adrY != null ? (
              <div key={`a${item.day}`} style={{
                position: 'absolute', left: item.x, top: item.adrY - 16, transform: 'translateX(-50%)',
                background: item.isLY ? 'rgba(100,140,220,0.85)' : 'rgba(0,229,160,0.85)',
                color: '#000', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                whiteSpace: 'nowrap', lineHeight: '13px', textShadow: 'none',
              }}>
                {Math.round(item.adr / 1000)}K
              </div>
            ) : null
          ))}
          {/* BAR Rate — 골드 텍스트, BAR 요금 y 위치(yAdr scale) */}
          {showBar && labelItems.map(item => (
            item.bar != null && item.bar > 0 && item.barY != null ? (
              <div key={`b${item.day}`} style={{
                position: 'absolute', left: item.x, top: item.barY - 12, transform: 'translateX(-50%)',
                fontSize: 8, fontWeight: 600, whiteSpace: 'nowrap', lineHeight: '11px',
                color: 'rgba(240,165,0,0.95)', textShadow: '0 1px 3px rgba(0,0,0,0.9)',
              }}>
                {Math.round(item.bar / 1000)}K
              </div>
            ) : null
          ))}
        </div>
      </div>
      {/* 이벤트 뱃지 row */}
      <div style={{ position: 'relative', height: 20, flexShrink: 0, marginTop: 4 }}>
        {badges.map(b => (
          <div
            key={b.day}
            title={b.names.join('\n')}
            onClick={() => onDayClick(b.day)}
            style={{
              position: 'absolute', top: 0, left: b.x, transform: 'translateX(-50%)',
              width: 18, height: 18, borderRadius: '50%', background: b.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 600, color: '#000', cursor: 'pointer', letterSpacing: '-0.3px', pointerEvents: 'auto',
            }}
          >
            {b.names[0].slice(0, 2)}
          </div>
        ))}
      </div>
    </div>
  )
}
