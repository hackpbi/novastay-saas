'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import Chart from 'chart.js/auto'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import type { PickupRow } from '@/hooks/usePickupData'

interface Props {
  open:      boolean
  onClose:   () => void
  year:      number
  month:     number   // 0-based (PickupPage t.month)
  hotelId?:  string
  pickupRows: PickupRow[]
  otbDate:   string
  vsOtbDate: string
  roomCount?: number
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_KR      = ['일', '월', '화', '수', '목', '금', '토']

export function PickupTrendModal({ open, onClose, year, month, hotelId, pickupRows, otbDate: _otbDate, vsOtbDate: _vsOtbDate, roomCount }: Props) {
  const chartRef  = useRef<HTMLCanvasElement>(null)
  const chartInst = useRef<Chart | null>(null)
  const [modalYear,  setModalYear]  = useState(year)
  const [modalMonth, setModalMonth] = useState(month + 1)   // 내부 1-based
  const { data: schema = [] } = useMarketSchema()

  // 진입(open) 시 클릭한 카드 월로 초기화
  useEffect(() => { if (open) { setModalYear(year); setModalMonth(month + 1) } }, [open, year, month])

  const lastDay = new Date(modalYear, modalMonth, 0).getDate()

  // ── 이벤트 fetch (c06_calendar, 전역 — hotel 필터 없음) ──────────────────────────
  const { data: calEvents } = useQuery({
    queryKey: ['calendar_events', hotelId, modalYear, modalMonth],
    enabled: open,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('c06_calendar')
        .select('date, event')
        .gte('date', `${modalYear}-${String(modalMonth).padStart(2, '0')}-01`)
        .lte('date', `${modalYear}-${String(modalMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`)
        .not('event', 'is', null)
      return (data ?? []) as { date: string; event: string }[]
    },
  })

  const eventMap = useMemo(() => {
    const m: Record<number, string> = {}
    for (const r of (calEvents ?? [])) {
      if (!r.event || r.event.trim() === '' || r.event === 'null') continue
      m[new Date(r.date).getDate()] = r.event
    }
    return m
  }, [calEvents])

  // ── pickupRows → 일자별 픽업 R/N 합산 (HOU 제외) ───────────────────────────────
  const pickupByDay = useMemo(() => {
    const map: Record<number, number> = {}
    for (const r of (pickupRows ?? [])) {
      if (r.segmentation === 'HOU') continue
      const d = new Date(r.business_date)
      if (d.getFullYear() !== modalYear || d.getMonth() + 1 !== modalMonth) continue
      const day = d.getDate()
      map[day] = (map[day] ?? 0) + (r.pu_nights ?? 0)
    }
    return map
  }, [pickupRows, modalYear, modalMonth])

  // ── 일자별 세그먼트 픽업 (툴팁용) — 코드 → 세그명(main 직속 자식) 매핑 ─────────────
  const pickupByDaySeg = useMemo(() => {
    const mainIds = new Set(schema.filter(s => s.level === 'main' && s.parent_id === null).map(s => s.id))
    const codeToName = new Map<string, string>()
    for (const s of schema) {
      if (s.parent_id && mainIds.has(s.parent_id)) {
        for (const code of (s.segmentation ?? [])) codeToName.set(code, s.name)
      }
    }
    const map: Record<number, { segName: string; rn: number }[]> = {}
    for (const r of (pickupRows ?? [])) {
      if (r.segmentation === 'HOU') continue
      if ((r.pu_nights ?? 0) === 0) continue
      const d = new Date(r.business_date)
      if (d.getFullYear() !== modalYear || d.getMonth() + 1 !== modalMonth) continue
      const name = codeToName.get(r.segmentation)
      if (!name) continue
      const day = d.getDate()
      if (!map[day]) map[day] = []
      const existing = map[day].find(s => s.segName === name)
      if (existing) existing.rn += r.pu_nights ?? 0
      else map[day].push({ segName: name, rn: r.pu_nights ?? 0 })
    }
    for (const day in map) map[day] = map[day].map(s => ({ segName: s.segName, rn: Math.round(s.rn) }))
    return map
  }, [pickupRows, schema, modalYear, modalMonth])

  // ── 차트 ───────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !chartRef.current) return
    chartInst.current?.destroy()

    const today = new Date()
    const todayY = today.getFullYear(), todayM = today.getMonth() + 1, todayD = today.getDate()

    const days   = Array.from({ length: lastDay }, (_, i) => i + 1)
    const data   = days.map(d => Math.round(pickupByDay[d] ?? 0))
    const rc     = roomCount && roomCount > 0 ? roomCount : 72   // 객실 수 (없으면 72)
    const minVal = Math.min(...data, 0)
    const labels = days.map(d => [String(d), DAY_NAMES[new Date(modalYear, modalMonth - 1, d).getDay()]])

    const tickColors = days.map(d => {
      if (modalYear === todayY && modalMonth === todayM && d === todayD) return '#5B8DEF'
      const dow = new Date(modalYear, modalMonth - 1, d).getDay()
      return (dow === 5 || dow === 6) ? '#E24B4A' : '#666'
    })

    chartInst.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: labels as any,
        datasets: [{
          data,
          backgroundColor: data.map(v => (v >= 0 ? 'rgba(0,229,160,0.8)' : 'rgba(226,75,74,0.8)')),
          borderRadius: 3,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 14, bottom: Object.keys(eventMap).length > 0 ? 36 : 8 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: (context: any) => {
              const { chart, tooltip } = context
              let el = document.getElementById('pickup-trend-tooltip')
              if (!el) {
                el = document.createElement('div')
                el.id = 'pickup-trend-tooltip'
                el.style.cssText = "position:fixed;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:12px 14px;pointer-events:none;font-family:'DM Sans',sans-serif;font-size:13px;min-width:160px;z-index:99999;transition:opacity 0.1s;box-shadow:0 4px 16px rgba(0,0,0,0.4);color:#ddd;"
                document.body.appendChild(el)
              }
              if (tooltip.opacity === 0) { el.style.opacity = '0'; return }
              const i = tooltip.dataPoints?.[0]?.dataIndex
              if (i == null) { el.style.opacity = '0'; return }
              const day = i + 1
              const segs = (pickupByDaySeg[day] ?? []).filter(s => s.rn !== 0)
              const total = segs.reduce((s, r) => s + r.rn, 0)
              if (segs.length === 0) { el.style.opacity = '0'; return }   // 픽업 없는 날 숨김
              const dt = new Date(modalYear, modalMonth - 1, day)
              const title = `${modalMonth}월 ${day}일 (${DAY_KR[dt.getDay()]})`
              const rows = segs.map(s =>
                `<div style="display:flex;justify-content:space-between;gap:32px;margin:4px 0;padding-left:8px;"><span style="color:#888;">${s.segName}</span><span style="color:${s.rn > 0 ? '#fff' : '#E24B4A'};">${s.rn > 0 ? '+' : ''}${s.rn}</span></div>`
              ).join('')
              const tc = total > 0 ? '#00E5A0' : total < 0 ? '#E24B4A' : '#888'
              el.innerHTML = `<div style="color:#fff;font-size:14px;font-weight:600;margin-bottom:10px;">${title}</div>${rows}<div style="border-top:1px solid #2a2a2a;margin-top:8px;padding-top:8px;display:flex;justify-content:space-between;gap:32px;"><span style="color:#fff;font-weight:700;">Total</span><span style="color:${tc};font-weight:700;">${total > 0 ? '+' : ''}${total}</span></div>`
              const rect = chart.canvas.getBoundingClientRect()
              const x = rect.left + tooltip.caretX + 14
              const y = rect.top + tooltip.caretY - 20
              const tw = el.offsetWidth || 180
              const th = el.offsetHeight || 120
              const finalX = x + tw > window.innerWidth - 16 ? x - tw - 14 : x
              const finalY = y < 8 ? 8 : (y + th > window.innerHeight - 8 ? window.innerHeight - th - 8 : y)
              el.style.left = `${finalX}px`
              el.style.top = `${finalY}px`
              el.style.opacity = '1'
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: (ctx: any) => tickColors[ctx.index], font: { size: 10 }, maxRotation: 0 },
          },
          y: {
            suggestedMax: rc,                                                          // 객실 수 기준 (초과 시 자동 확장)
            suggestedMin: minVal < 0 ? Math.min(minVal - Math.ceil(rc * 0.1), -1) : 0, // 음수면 최솟값 -10% 여유, 아니면 0
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#555', font: { size: 10 }, callback: (v: any) => (v > 0 ? `+${v}` : `${v}`) },
          },
        },
      },
      plugins: [
        // 바 위(양수)/아래(음수) 숫자
        {
          id: 'valueLabels',
          afterDatasetsDraw(chart: any) {
            const { ctx, scales: { x, y } } = chart
            data.forEach((val, i) => {
              if (!val) return
              const xPos = x.getPixelForValue(i)
              const yPos = y.getPixelForValue(val)
              ctx.save()
              ctx.fillStyle = val >= 0 ? '#00E5A0' : '#E24B4A'
              ctx.font = 'bold 10px sans-serif'
              ctx.textAlign = 'center'
              ctx.textBaseline = val >= 0 ? 'bottom' : 'top'
              ctx.fillText(val > 0 ? `+${val}` : `${val}`, xPos, val >= 0 ? yPos - 3 : yPos + 3)
              ctx.restore()
            })
          },
        },
        // 이벤트 도트 (요일 아래 민트 원 + 2글자)
        {
          id: 'eventDots',
          afterDraw(chart: any) {
            const { ctx } = chart
            const meta = chart.getDatasetMeta(0)
            const bottom = chart.scales.x.bottom
            for (const [day, label] of Object.entries(eventMap)) {
              const i = Number(day) - 1
              if (!meta.data[i]) continue
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
            }
          },
        },
      ],
    })

    return () => {
      chartInst.current?.destroy(); chartInst.current = null
      document.getElementById('pickup-trend-tooltip')?.remove()
    }
  }, [open, pickupByDay, pickupByDaySeg, eventMap, modalYear, modalMonth, lastDay, roomCount])

  // ESC + scroll lock
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // 언마운트 시 툴팁 DOM 제거
  useEffect(() => () => { document.getElementById('pickup-trend-tooltip')?.remove() }, [])

  if (!open) return null

  const handlePrev = () => {
    const d = new Date(modalYear, modalMonth - 2, 1)
    setModalYear(d.getFullYear()); setModalMonth(d.getMonth() + 1)
  }
  const handleNext = () => {
    const d = new Date(modalYear, modalMonth, 1)
    setModalYear(d.getFullYear()); setModalMonth(d.getMonth() + 1)
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#000000', border: '1px solid #1f1f1f', borderRadius: 12, padding: 20, width: '85vw', height: '70vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 — 타이틀 + 월 네비 + 닫기 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          {/* 좌: 타이틀 */}
          <span style={{ fontSize: 15, fontWeight: 500, color: '#fff' }}>Pick-up Trend</span>
          {/* 가운데: 월 네비 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handlePrev} aria-label="이전 달" style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer' }}>‹</button>
            <span style={{ color: '#fff', fontSize: 13, minWidth: 80, textAlign: 'center' }}>{MONTH_NAMES[modalMonth - 1]} {modalYear}</span>
            <button onClick={handleNext} aria-label="다음 달" style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer' }}>›</button>
          </div>
          {/* 우: 닫기 */}
          <button onClick={onClose} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {/* 차트 */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <canvas ref={chartRef} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
