'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  Chart, BarController, BarElement, DoughnutController, ArcElement,
  LinearScale, CategoryScale, Tooltip, type Plugin,
} from 'chart.js'

Chart.register(BarController, BarElement, DoughnutController, ArcElement, LinearScale, CategoryScale, Tooltip)

interface DayAgg { rn: number[]; rev: number[] }   // index 0 = 1일

interface DayOfWeekModalProps {
  year:      number
  month:     number
  cur:       DayAgg
  ly:        DayAgg
  roomCount: number
  onClose:   () => void
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const DOW_COLORS = ['#3a3a4a', '#3a4a5a', '#2a4a6a', '#2a5a7a', '#1a5a6a', 'rgba(226,75,74,0.7)', 'rgba(226,75,74,0.9)']

interface DowStat {
  dow: number; label: string; count: number
  avgOcc: number; avgAdr: number; totalRn: number; totalRev: number
}

export default function DayOfWeekModal({ year, month, cur, ly, roomCount, onClose }: DayOfWeekModalProps) {
  const [view, setView] = useState<'current' | 'ly'>('current')
  const barRef   = useRef<HTMLCanvasElement | null>(null)
  const donutRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const agg = view === 'current' ? cur : ly
  const days = agg.rn.length

  const dowStats = useMemo<DowStat[]>(() => {
    const buckets = DOW_LABELS.map((label, dow) => ({ dow, label, occs: [] as number[], rn: 0, rev: 0 }))
    for (let i = 0; i < days; i++) {
      const dow = new Date(year, month - 1, i + 1).getDay()
      const rn = agg.rn[i] ?? 0, rev = agg.rev[i] ?? 0
      const b = buckets[dow]
      if (roomCount > 0) b.occs.push((rn / roomCount) * 100)
      b.rn += rn; b.rev += rev
    }
    return buckets.map(b => ({
      dow: b.dow, label: b.label, count: b.occs.length,
      avgOcc: b.occs.length ? b.occs.reduce((s, v) => s + v, 0) / b.occs.length : 0,
      avgAdr: b.rn > 0 ? b.rev / b.rn : 0,
      totalRn: b.rn, totalRev: b.rev,
    }))
  }, [agg, days, year, month, roomCount])

  const totalRn = dowStats.reduce((s, d) => s + d.totalRn, 0)
  const maxOccDow = dowStats.reduce((mx, d) => (d.avgOcc > dowStats[mx].avgOcc ? d.dow : mx), 0)

  // 차트 생성
  useEffect(() => {
    const charts: Chart[] = []

    if (barRef.current) {
      charts.push(new Chart(barRef.current, {
        type: 'bar',
        data: {
          labels: DOW_LABELS,
          datasets: [{
            data: dowStats.map(d => d.avgOcc),
            backgroundColor: dowStats.map(d =>
              d.dow === maxOccDow ? '#00E5A0' : d.dow >= 5 ? 'rgba(226,75,74,0.7)' : '#3a3a3a'),
            borderRadius: 3,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${Number(c.raw).toFixed(1)}%` } } },
          scales: {
            x: { ticks: { color: (c: any) => (c.index >= 5 ? '#E24B4A' : '#666'), font: { size: 10 } }, grid: { display: false } },
            y: { min: 0, max: 100, ticks: { callback: v => `${v}%`, color: '#555', font: { size: 9 }, maxTicksLimit: 5 }, grid: { color: '#181818' } },
          },
        },
      }))
    }

    if (donutRef.current) {
      const centerText: Plugin<'doughnut'> = {
        id: 'centerText',
        afterDraw(chart) {
          const { ctx, chartArea: { top, bottom, left, right } } = chart
          const cx = (left + right) / 2, cy = (top + bottom) / 2
          ctx.save()
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.font = '500 16px -apple-system, system-ui, sans-serif'; ctx.fillStyle = '#fff'
          ctx.fillText(String(Math.round(totalRn)), cx, cy - 8)
          ctx.font = '11px -apple-system, system-ui, sans-serif'; ctx.fillStyle = '#555'
          ctx.fillText('총 R/N', cx, cy + 10)
          ctx.restore()
        },
      }
      charts.push(new Chart(donutRef.current, {
        type: 'doughnut',
        plugins: [centerText],
        data: {
          labels: DOW_LABELS,
          datasets: [{
            data: dowStats.map(d => d.totalRn),
            backgroundColor: DOW_COLORS,
            borderColor: '#141414',
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false, cutout: '65%',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => `${c.label}: ${Math.round(Number(c.raw))} R/N (${totalRn > 0 ? ((Number(c.raw) / totalRn) * 100).toFixed(1) : '0'}%)` } },
          },
        },
      }))
    }

    return () => charts.forEach(c => c.destroy())
  }, [dowStats, maxOccDow, totalRn])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, width: 680, maxWidth: '96vw', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '0.5px solid #1e1e1e' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>요일별 현황</span>
          <span style={{ fontSize: 12, color: '#888' }}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month - 1]} {view === 'current' ? year : year - 1}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['current', 'ly'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  style={{
                    background: view === v ? '#0d2a1f' : '#1a1a1a',
                    border: `1px solid ${view === v ? '#00E5A0' : '#2a2a2a'}`,
                    color: view === v ? '#00E5A0' : '#666',
                    padding: '3px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 11,
                  }}>
                  {v === 'current' ? '올해' : 'LY'}
                </button>
              ))}
            </div>
            <button onClick={onClose} aria-label="닫기" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#aaa', display: 'flex' }}><X size={16} /></button>
          </div>
        </div>

        {/* 차트 영역 */}
        <div style={{ display: 'flex', gap: 16, padding: 16, height: 220, flexShrink: 0 }}>
          <div style={{ flex: 1.2, position: 'relative' }}><canvas ref={barRef} /></div>
          <div style={{ flex: 1, position: 'relative' }}><canvas ref={donutRef} /></div>
          <div style={{ flex: 0.6, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
            {dowStats.map(stat => (
              <div key={stat.dow} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: DOW_COLORS[stat.dow] }} />
                <span style={{ color: stat.dow >= 5 ? '#E24B4A' : '#666' }}>{stat.label}</span>
                <span style={{ color: '#888', marginLeft: 'auto' }}>{totalRn > 0 ? ((stat.totalRn / totalRn) * 100).toFixed(0) : '0'}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* 테이블 */}
        <div style={{ overflowY: 'auto', padding: '0 16px 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['요일', '날짜수', 'avg OCC%', 'avg ADR', '총 R/N', '총 REV'].map(col => (
                  <th key={col} style={{ color: '#555', fontWeight: 400, padding: '6px 10px', textAlign: col === '요일' || col === '날짜수' ? 'center' : 'right', borderBottom: '1px solid #1e1e1e', fontSize: 11 }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dowStats.map(stat => {
                const weekend = stat.dow === 5 || stat.dow === 6
                return (
                  <tr key={stat.dow} style={{ borderBottom: '1px solid #161616' }}>
                    <td style={{ textAlign: 'center', color: weekend ? '#E24B4A' : '#aaa', fontWeight: weekend ? 500 : 400, padding: '5px 10px' }}>{stat.label}</td>
                    <td style={{ textAlign: 'center', color: '#666', padding: '5px 10px' }}>{stat.count}</td>
                    <td style={{ textAlign: 'right', color: '#00E5A0', padding: '5px 10px' }}>{stat.avgOcc.toFixed(1)}%</td>
                    <td style={{ textAlign: 'right', color: '#5B8DEF', padding: '5px 10px' }}>₩{Math.round(stat.avgAdr / 1000)}K</td>
                    <td style={{ textAlign: 'right', color: '#ccc', padding: '5px 10px' }}>{Math.round(stat.totalRn)}</td>
                    <td style={{ textAlign: 'right', color: '#888', padding: '5px 10px' }}>₩{(stat.totalRev / 1_000_000).toFixed(1)}M</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
