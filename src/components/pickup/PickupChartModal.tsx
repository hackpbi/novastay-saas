'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { type PickupDaily, WEEKDAY_KR } from '@/utils/pickupPageUtils'

const MINT    = 'rgba(0,229,160,0.55)'
const MINT_WK = 'rgba(0,229,160,0.9)'
const BLUE    = '#60A5FA'
const ORANGE  = '#F5A04B'
const PURPLE  = '#A78BFA'

export default function PickupChartModal({
  open, onClose, year, month, daily,
}: {
  open:    boolean
  onClose: () => void
  year:    number
  month:   number   // 0-based
  daily:   PickupDaily[]
}) {
  const [viewMode, setViewMode] = useState<'pickup' | 'ly'>('pickup')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)

  // ESC + scroll lock
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (cancelled || !canvasRef.current) return
      chartRef.current?.destroy()

      const labels = daily.map(d => d.day)
      const occBg  = daily.map(d => (d.isWeekend ? MINT_WK : MINT))

      const datasets: any[] =
        viewMode === 'pickup'
          ? [
              { type: 'bar',  label: 'OTB OCC%', data: daily.map(d => d.otbOcc), backgroundColor: occBg, yAxisID: 'yL', order: 2, borderRadius: 2, barPercentage: 0.7 },
              { type: 'line', label: '픽업 RN',  data: daily.map(d => d.puNights), borderColor: BLUE, borderWidth: 2, pointRadius: 0, tension: 0.35, yAxisID: 'yR', order: 1 },
            ]
          : [
              { type: 'bar',  label: 'OTB OCC%', data: daily.map(d => d.otbOcc), backgroundColor: occBg, yAxisID: 'yL', order: 3, borderRadius: 2, barPercentage: 0.7 },
              { type: 'line', label: 'LY OCC%',  data: daily.map(d => d.lyOcc), borderColor: ORANGE, borderWidth: 2, pointRadius: 0, tension: 0.35, yAxisID: 'yL', order: 2 },
              { type: 'line', label: '차이 %p',  data: daily.map(d => d.diffPp), borderColor: PURPLE, borderWidth: 2, borderDash: [4, 3], pointRadius: 0, tension: 0.35, yAxisID: 'yR', order: 1 },
            ]

      chartRef.current = new Chart(canvasRef.current, {
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { color: '#A0A0A0', font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8, boxHeight: 8 } },
            tooltip: {
              backgroundColor: '#1E1E1E', borderColor: '#2C2C2C', borderWidth: 1,
              titleColor: '#fff', bodyColor: '#ddd', padding: 10,
              callbacks: {
                title: (items: any) => {
                  const i = items[0]?.dataIndex ?? 0
                  const d = daily[i]
                  return `${month + 1}월 ${d.day}일 (${WEEKDAY_KR[d.dow]})`
                },
                label: (ctx: any) => {
                  const v = ctx.parsed.y
                  if (ctx.dataset.label === 'OTB OCC%' || ctx.dataset.label === 'LY OCC%') return ` ${ctx.dataset.label}: ${v.toFixed(1)}%`
                  if (ctx.dataset.label === '차이 %p') return ` 차이: ${v >= 0 ? '+' : ''}${v.toFixed(1)}%p`
                  return ` 픽업 RN: ${v >= 0 ? '+' : ''}${v}`
                },
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: {
                color: (c: any) => (daily[c.index]?.isWeekend ? '#00B883' : '#717171'),
                font: { size: 10 },
              },
            },
            yL: { position: 'left', min: 0, max: 110, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#717171', font: { size: 10 }, callback: (v: any) => `${v}%` } },
            yR: {
              position: 'right', grid: { display: false },
              min: viewMode === 'pickup' ? -10 : -15,
              max: viewMode === 'pickup' ? 30 : 15,
              ticks: { color: '#717171', font: { size: 10 }, callback: (v: any) => `${v > 0 ? '+' : ''}${v}` },
            },
          },
        },
      })
    })()
    return () => { cancelled = true; chartRef.current?.destroy(); chartRef.current = null }
  }, [open, viewMode, daily, month])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-4xl"
        style={{ background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)' }}>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{month + 1}월 Pick-up 차트</h2>
            <div className="flex items-center gap-1">
              {(['pickup', 'ly'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className="px-2.5 py-1 rounded-md text-xs transition-colors"
                  style={viewMode === v
                    ? { background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)', color: 'var(--color-accent-primary)', fontWeight: 600 }
                    : { background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                >
                  {v === 'pickup' ? 'OTB 픽업' : 'LY 비교'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
            <X size={20} />
          </button>
        </div>
        <div className="p-4" style={{ height: 380 }}>
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  )
}
