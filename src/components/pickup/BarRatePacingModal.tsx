'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']
const BAR_GOLD = '#E8C468'

interface BarRatePacingModalProps {
  open:      boolean
  onClose:   () => void
  hotelId:   string
  stayDate:  string    // 'YYYY-MM-DD' (클릭한 일자)
  roomCount: number
}

export default function BarRatePacingModal({ open, onClose, hotelId, stayDate, roomCount }: BarRatePacingModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)

  // 점유율 pacing (최근 30일 스냅샷)
  const { data: pacing = [] } = useQuery({
    queryKey: ['bar-pacing', hotelId, stayDate],
    enabled: open && !!hotelId && !!stayDate,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_bar_pacing', {
        p_hotel_id: hotelId, p_stay_date: stayDate, p_days_back: 30,
      })
      if (error) throw error
      return (data ?? []) as { update_date: string; otb_nights: number; otb_revenue: number }[]
    },
  })

  // BAR Rate 변경 이력
  const { data: rateHist = [] } = useQuery({
    queryKey: ['bar-rate-hist', hotelId, stayDate],
    enabled: open && !!hotelId && !!stayDate,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_bar_rate_history', {
        p_hotel_id: hotelId, p_stay_date: stayDate,
      })
      if (error) throw error
      return (data ?? []) as { changed_date: string; old_rate: number; new_rate: number }[]
    },
  })

  // 현재 BAR Rate (변경 이력 없을 때 fallback용) — change > single > base 우선순위
  const { data: currentRate = null } = useQuery({
    queryKey: ['bar-current-rate', hotelId, stayDate],
    enabled: open && !!hotelId && !!stayDate,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s02_rate_detail')
        .select('new_rate, date_type')
        .eq('hotel_id', hotelId)
        .eq('stay_date', stayDate)
      if (error) throw error
      const rows = (data ?? []) as { new_rate: number; date_type: string }[]
      if (rows.length === 0) return null
      const priority: Record<string, number> = { change: 3, single: 2, base: 1 }
      let best = rows[0]
      for (const r of rows) {
        if ((priority[r.date_type] ?? 0) > (priority[best.date_type] ?? 0)) best = r
      }
      return best.new_rate as number
    },
  })

  // 데이터 가공 — 스냅샷 라벨 + 점유율 + BAR Rate forward-fill
  const chart = useMemo(() => {
    const labels = pacing.map(p => {
      const d = new Date(p.update_date)
      return `${d.getMonth() + 1}/${d.getDate()}`
    })
    const occData = pacing.map(p => (roomCount > 0 ? Math.round((p.otb_nights / roomCount) * 100) : 0))
    const rateData = pacing.map(p => {
      const snap = p.update_date
      // 1) 변경 이력이 있으면 forward-fill
      if (rateHist.length > 0) {
        const applied = rateHist.filter(h => h.changed_date <= snap)
        if (applied.length > 0) return applied[applied.length - 1].new_rate
        return rateHist[0].old_rate   // 첫 변경 이전
      }
      // 2) 이력이 없으면 s02 현재 요금으로 평탄선 (fallback, null이면 미표시)
      return currentRate
    })
    return { labels, occData, rateData }
  }, [pacing, rateHist, currentRate, roomCount])

  const yBarMax = useMemo(() => {
    const rateVals = chart.rateData.filter((v): v is number => v != null && v > 0)
    return rateVals.length > 0 ? Math.max(...rateVals) * 1.2 : 300000
  }, [chart.rateData])

  // ESC + scroll lock
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // 차트
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (cancelled || !canvasRef.current) return
      chartRef.current?.destroy()

      chartRef.current = new Chart(canvasRef.current, {
        data: {
          labels: chart.labels,
          datasets: [
            {
              type: 'bar',
              label: 'OTB 점유율',
              data: chart.occData,
              backgroundColor: 'rgba(180,180,180,0.35)',
              borderColor: 'rgba(180,180,180,0.5)',
              borderWidth: 1,
              borderRadius: 2,
              yAxisID: 'yOcc',
              order: 2,
              barPercentage: 0.85,
              categoryPercentage: 0.9,
            },
            {
              type: 'line',
              label: 'BAR Rate',
              data: chart.rateData,
              borderColor: BAR_GOLD,
              backgroundColor: BAR_GOLD,
              borderWidth: 2,
              pointRadius: 2.5,
              pointBackgroundColor: BAR_GOLD,
              tension: 0.35,
              spanGaps: true,
              yAxisID: 'yBar',
              order: 0,
            } as any,
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 16, bottom: 8 } },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0a0a0a',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              padding: 10,
              titleColor: '#fff',
              bodyColor: '#ccc',
              callbacks: {
                label: (ctx: any) => {
                  if (ctx.dataset.label === 'BAR Rate') {
                    return ctx.parsed.y != null ? `BAR Rate: ${Math.round(ctx.parsed.y).toLocaleString('ko-KR')}` : 'BAR Rate: -'
                  }
                  return `OTB 점유율: ${ctx.parsed.y}%`
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false }, border: { display: false },
              ticks: { color: '#888', font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 16 },
            },
            yOcc: {
              position: 'left', min: 0, max: 110,
              grid: { display: false }, border: { display: false },
              ticks: { color: '#444', font: { size: 10 }, callback: (v: any) => (v <= 100 ? `${v}%` : '') },
            },
            yBar: {
              position: 'right', min: 0, max: yBarMax,
              grid: { display: false }, border: { display: false },
              ticks: { color: BAR_GOLD, font: { size: 10 }, callback: (v: any) => `${Math.round(v / 1000)}K` },
            },
          },
        },
      })
    })()
    return () => {
      cancelled = true
      chartRef.current?.destroy(); chartRef.current = null
    }
  }, [open, chart, yBarMax])

  if (!open) return null

  // 헤더 타이틀용 날짜 파싱 (로컬)
  const [sy, sm, sd] = stayDate.split('-').map(Number)
  const dow = new Date(sy, sm - 1, sd).getDay()
  const title = `${sm}월 ${sd}일 (${DOW_KR[dow]}) 상세`

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 100002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.6)', width: '72vw', maxWidth: 1100, height: '64vh', maxHeight: '64vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 10px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{title}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>점유율 변화 · BAR Rate 이력 (최근 30일)</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: 4, display: 'inline-flex' }} aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        {/* 차트 */}
        <div style={{ padding: '10px 16px 8px', flex: 1, minHeight: 0 }}>
          {pacing.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#555' }}>데이터 없음</div>
          ) : (
            <canvas ref={canvasRef} />
          )}
        </div>

        {/* 범례 */}
        <div style={{ padding: '0 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 10, background: 'rgba(180,180,180,0.5)', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#888' }}>OTB 점유율</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 20, height: 0, borderTop: `2.5px solid ${BAR_GOLD}`, borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#888' }}>BAR Rate</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
