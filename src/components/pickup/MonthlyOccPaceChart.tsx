'use client'

// 월간 OCC 누적 페이스 — get_monthly_occ_pace(D-30~D-0)
// 올해 OTB OCC(막대) + 전년 OTB OCC(내부 막대, 플러그인) + ADR 선형(토글, 이중 Y축)
// 0.0(PAD 공백일) → forward fill. OTB 기준일 수직 점선 · 이벤트 도트. 막대 클릭 → onSelectUpdateDate

import { useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']
const DOW    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// 토글 스위치 (기존 trackStyle/thumbStyle 패턴)
const trackStyle = (on: boolean, onColor: string, offColor: string): React.CSSProperties => ({
  position: 'relative', display: 'inline-block', width: 36, height: 20, borderRadius: 20,
  background: on ? onColor : offColor, border: `1px solid ${on ? onColor : offColor}`,
  cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
})
const thumbStyle = (on: boolean): React.CSSProperties => ({
  position: 'absolute', width: 14, height: 14, top: 2, left: on ? 20 : 2,
  borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
})

interface MonthlyOccPaceChartProps {
  rows:               { update_date: string; otb_occ: number; ly_occ: number; otb_adr: number; ly_adr: number }[]
  otbDate:            string
  lyMode:             'period' | 'day'
  viewYear:           number
  viewMonth:          number   // 표시용 (1-based)
  calRows:            { date: string; event: string }[]
  onSelectUpdateDate: (date: string) => void
}

export default function MonthlyOccPaceChart({
  rows, otbDate, lyMode, viewMonth, calRows = [], onSelectUpdateDate,
}: MonthlyOccPaceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<Chart | null>(null)
  const onSelectRef = useRef(onSelectUpdateDate)
  onSelectRef.current = onSelectUpdateDate
  const [adrOn, setAdrOn] = useState(true)

  useEffect(() => {
    if (!canvasRef.current || rows.length === 0) return
    chartRef.current?.destroy()

    // X축 라벨 — [날짜, 요일] 2줄
    const xLabels = rows.map(r => {
      const d = new Date(r.update_date)
      return [`${d.getMonth() + 1}/${d.getDate()}`, DOW[d.getDay()]]
    })

    // 0.0(공백일) → 직전 값으로 forward fill
    const fwdFill = (raw: (number | null)[]) => {
      const out: (number | null)[] = []
      let last: number | null = null
      for (const v of raw) { if (v !== null) last = v; out.push(last) }
      return out
    }
    const thisData = fwdFill(rows.map(r => (r.otb_occ > 0 ? r.otb_occ : null)))
    const lyData   = fwdFill(rows.map(r => (r.ly_occ  > 0 ? r.ly_occ  : null)))
    const otbIdx   = rows.findIndex(r => String(r.update_date).slice(0, 10) === otbDate)

    // ADR — paceRows(otb_adr/ly_adr)에서 직접 사용 (전년 없는 날짜는 forward fill)
    const thisAdrData = fwdFill(rows.map(r => (r.otb_adr > 0 ? r.otb_adr : null)))
    const lyAdrData   = fwdFill(rows.map(r => (r.ly_adr  > 0 ? r.ly_adr  : null)))

    // 전년 색: 동기간 보라 / 동일자 금색
    const lyBarColor = lyMode === 'period' ? 'rgba(167,139,250,0.30)' : 'rgba(245,158,11,0.30)'

    // c06_calendar 이벤트 도트
    const eventMap: Record<string, string> = {}
    for (const e of calRows) {
      if (!e.event || e.event.trim() === '' || e.event === 'null') continue
      eventMap[String(e.date).slice(0, 10)] = e.event
    }
    const hasEvents = Object.keys(eventMap).length > 0

    // OTB 기준일 수직 점선 + 'OTB' 라벨
    const otbLine = {
      id: 'otbLine',
      afterDraw(c: any) {
        if (otbIdx < 0) return
        const x = c.scales.x, area = c.chartArea
        if (!x || !area) return
        const xPos = x.getPixelForValue(otbIdx)
        const { ctx } = c
        ctx.save()
        ctx.beginPath(); ctx.moveTo(xPos, area.top); ctx.lineTo(xPos, area.bottom)
        ctx.strokeStyle = '#5B8DEF'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([])
        ctx.fillStyle = '#5B8DEF'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        ctx.fillText('OTB', xPos, area.top - 2)
        ctx.restore()
      },
    }

    // 전년 OCC 내부 막대 — 올해 막대(dataset 0) 중앙에 좁은 보라 막대
    const innerBarPlugin = {
      id: 'innerBar',
      afterDatasetsDraw(chart: any) {
        const { ctx, scales: { y } } = chart
        const meta = chart.getDatasetMeta(0)
        if (!meta?.data) return
        lyData.forEach((ly, i) => {
          if (ly == null) return
          const bar = meta.data[i]
          if (!bar) return
          const innerWidth = (bar.width ?? 10) * 0.42
          const yTop = y.getPixelForValue(ly)
          const yBot = y.getPixelForValue(0)
          ctx.save()
          ctx.fillStyle = lyBarColor
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(bar.x - innerWidth / 2, yTop, innerWidth, yBot - yTop, [2, 2, 0, 0])
          else ctx.rect(bar.x - innerWidth / 2, yTop, innerWidth, yBot - yTop)
          ctx.fill()
          ctx.restore()
        })
      },
    }

    // 이벤트 도트 (요일 라벨 아래 민트 원 + 괄호 텍스트 2글자)
    const eventDots = {
      id: 'eventDots',
      afterDraw(c: any) {
        if (!hasEvents) return
        const meta = c.getDatasetMeta(0)
        const bottom = c.scales.x.bottom
        const { ctx } = c
        rows.forEach((r, i) => {
          const label = eventMap[String(r.update_date).slice(0, 10)]
          if (!label || !meta.data[i]) return
          const xPos = meta.data[i].x
          const yc = bottom + 22
          ctx.save()
          ctx.beginPath(); ctx.arc(xPos, yc, 9, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0,229,160,0.12)'; ctx.fill()
          ctx.strokeStyle = '#00E5A0'; ctx.lineWidth = 1; ctx.stroke()
          const match = String(label).match(/\(([^)]+)\)/)
          const text = (match ? match[1] : String(label)).slice(0, 2)
          ctx.fillStyle = '#00E5A0'; ctx.font = '9px sans-serif'
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(text, xPos, yc)
          ctx.restore()
        })
      },
    }

    const adrDatasets: any[] = adrOn ? [
      {
        type: 'line', label: `${viewMonth}월 ADR`, data: thisAdrData as any,
        borderColor: '#F59E0B', borderWidth: 2, pointRadius: 2, pointBackgroundColor: '#F59E0B',
        tension: 0.4, fill: false, yAxisID: 'y2', order: 1,
      },
      {
        type: 'line', label: '전년 ADR', data: lyAdrData as any,
        borderColor: 'rgba(245,158,11,0.4)', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0,
        tension: 0.4, fill: false, yAxisID: 'y2', order: 1,
      },
    ] : []

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: xLabels,
        datasets: [
          {
            type: 'bar', label: `${viewMonth}월 OTB OCC`, data: thisData as any,
            backgroundColor: 'rgba(0,229,160,0.18)', borderColor: '#00E5A0', borderWidth: 1, borderRadius: 2,
            barPercentage: 0.8, categoryPercentage: 0.9, yAxisID: 'y', order: 2,
          },
          ...adrDatasets,
        ] as any,
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 16, bottom: hasEvents ? 34 : 4 } },
        interaction: { mode: 'index', intersect: false },
        onClick: (_e: any, els: any[]) => {
          if (!els.length) return
          const upd = rows[els[0].index]?.update_date
          if (upd) onSelectRef.current(upd)
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
                const d = new Date(rows[items[0].dataIndex]?.update_date)
                return `${d.getMonth() + 1}/${d.getDate()} (${DOW_KR[d.getDay()]}) 기준`
              },
              label: (item: any) => {
                const v = item.raw
                if (item.dataset.yAxisID === 'y2') return ` ${item.dataset.label}: ${v == null ? '-' : `${Math.round(v / 1000)}k`}`
                return ` ${item.dataset.label}: ${v == null ? '-' : `${v}%`}`
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false }, border: { display: false },
            ticks: {
              color: (ctx: any) => {
                const r = rows[ctx.index]
                if (!r) return '#555'
                const dow = new Date(r.update_date).getDay()
                return dow === 5 || dow === 6 ? '#E24B4A' : '#555'
              },
              callback: (_v: any, i: number) => xLabels[i],
              autoSkip: false, maxRotation: 0, font: { size: 10 },
            },
          },
          y: {
            min: 0, max: 100, position: 'left',
            grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false },
            ticks: { color: '#555', font: { size: 10 }, callback: (v: any) => `${v}%` },
          },
          y2: {
            display: adrOn, position: 'right', beginAtZero: true,
            grid: { drawOnChartArea: false }, border: { display: false },
            ticks: { color: '#F59E0B', font: { size: 10 }, callback: (v: any) => `${Math.round(v / 1000)}k` },
          },
        },
      },
      plugins: [innerBarPlugin, otbLine, eventDots],
    })

    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [rows, adrOn, lyMode, otbDate, viewMonth, calRows])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ADR 토글 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <div style={trackStyle(adrOn, '#F59E0B', '#222')} onClick={() => setAdrOn(p => !p)}>
          <div style={thumbStyle(adrOn)} />
        </div>
        <span style={{ fontSize: 11, color: '#888' }}>ADR</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <canvas ref={canvasRef} />
      </div>
      {/* 범례 */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', paddingTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 10, background: 'rgba(0,229,160,0.5)', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: '#666' }}>{viewMonth}월 OTB OCC</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 10, background: lyMode === 'period' ? 'rgba(167,139,250,0.6)' : 'rgba(245,158,11,0.6)', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: '#666' }}>{lyMode === 'period' ? '전년동기간' : '전년동일자'} OCC</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 2, height: 12, background: '#5B8DEF' }} />
          <span style={{ fontSize: 11, color: '#666' }}>OTB 기준일</span>
        </div>
        {adrOn && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 2, background: '#F59E0B' }} />
              <span style={{ fontSize: 11, color: '#666' }}>ADR</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 0, borderTop: '1.5px dashed rgba(245,158,11,0.5)' }} />
              <span style={{ fontSize: 11, color: '#666' }}>{lyMode === 'period' ? '전년동기간 ADR' : '전년동일자 ADR'}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
