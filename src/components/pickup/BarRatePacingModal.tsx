'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useFcstDateContext } from '@/contexts/FcstDateContext'
import AdrSimulatorModal from '@/components/rate-strategy/AdrSimulatorModal'
import PacingDeltaModal from './PacingDeltaModal'

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']
const BAR_GOLD = '#E8C468'

// 요금대별 색상 팔레트 (구간 순서대로 순환)
const TIER_PALETTE = ['#5B8DEF', '#00E5A0', '#E8C468', '#B57EDC', '#F5A623', '#E24B4A']

interface BarRatePacingModalProps {
  open:      boolean
  onClose:   () => void
  hotelId:   string
  stayDate:  string    // 'YYYY-MM-DD' (클릭한 일자)
  roomCount: number
  showRateEdit?: boolean   // '요금 수정' 버튼 표시 (Rate Strategy 페이지에서만 true)
}

export default function BarRatePacingModal({ open, onClose, hotelId, stayDate, roomCount, showRateEdit = false }: BarRatePacingModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  // 점유율 막대 클릭 → 전날 대비 증감 모달 (현재/전날 스냅샷)
  const [deltaSnap, setDeltaSnap] = useState<{ cur: string; prev: string } | null>(null)
  // 요금 수정 → AdrSimulatorModal
  const { fcstDate } = useFcstDateContext()
  const [adrSimOpen, setAdrSimOpen] = useState(false)
  const [simDate, setSimDate] = useState(stayDate)

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

  // 고유 요금대 → 색 매핑 (구간별 색상 전환용)
  const rateTiers = useMemo(() => {
    const uniq = Array.from(new Set(chart.rateData.filter((v): v is number => v != null))).sort((a, b) => a - b)
    const map = new Map<number, string>()
    uniq.forEach((r, i) => map.set(r, TIER_PALETTE[i % TIER_PALETTE.length]))
    return map
  }, [chart.rateData])

  // 각 포인트(스냅샷)의 요금대 색
  const pointColors = chart.rateData.map(v => (v != null ? rateTiers.get(v) ?? BAR_GOLD : BAR_GOLD))

  // yBar 축 범위 — min을 요금 최솟값 근처로 좁혀 선을 중앙에 표시
  const yBarRange = useMemo(() => {
    const rateVals = chart.rateData.filter((v): v is number => v != null && v > 0)
    if (rateVals.length === 0) return { min: 0, max: 300000 }
    return { min: Math.max(0, Math.min(...rateVals) - 40000), max: Math.max(...rateVals) + 40000 }
  }, [chart.rateData])

  // ESC + scroll lock
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // 점유율 라벨 (각 막대 위 %)
  const occLabels = {
    id: 'occLabels',
    afterDatasetsDraw(c: any) {
      const meta = c.getDatasetMeta(0)   // 막대 dataset
      if (!meta || meta.hidden) return
      const { ctx } = c
      ctx.save()
      ctx.font = '9px -apple-system, sans-serif'
      ctx.fillStyle = '#999'
      ctx.textAlign = 'center'
      meta.data.forEach((bar: any, i: number) => {
        const pct = Math.round(c.data.datasets[0].data[i] ?? 0)
        ctx.fillText(`${pct}%`, bar.x, bar.y - 4)
      })
      ctx.restore()
    },
  }

  // BAR Rate 요금 라벨 (변경점만, 12px bold, 구간색)
  const barRateLabels = {
    id: 'barRateLabels',
    afterDatasetsDraw(c: any) {
      const dsIdx = c.data.datasets.findIndex((d: any) => d.type === 'line' && d.label === 'BAR Rate')
      if (dsIdx === -1) return
      const meta = c.getDatasetMeta(dsIdx)
      if (meta.hidden) return
      const { ctx } = c
      ctx.save()
      ctx.font = '700 12px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      const data = c.data.datasets[dsIdx].data
      data.forEach((v: any, i: number) => {
        if (v == null) return
        // 변경점(값이 이전과 다름) 또는 첫 포인트만 표시
        if (i === 0 || v !== data[i - 1]) {
          const pt = meta.data[i]
          if (!pt) return
          ctx.fillStyle = pointColors[i] ?? BAR_GOLD
          ctx.fillText(String(Math.round(v / 1000)), pt.x, pt.y - 12)
        }
      })
      ctx.restore()
    },
  }

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
        plugins: [occLabels, barRateLabels],
        data: {
          labels: chart.labels,
          datasets: [
            {
              type: 'bar',
              label: 'OTB OCC',
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
              borderColor: BAR_GOLD,          // 기본(폴백)
              backgroundColor: BAR_GOLD,
              borderWidth: 2.5,
              pointRadius: 2.5,
              pointBackgroundColor: pointColors,
              pointBorderColor: pointColors,
              segment: {
                // 두 점 사이 선 색 = 뒤 점(p1)의 요금대 색
                borderColor: (ctx: any) => pointColors[ctx.p1DataIndex] ?? BAR_GOLD,
              },
              tension: 0,
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
          onClick: (_e: any, els: any[]) => {
            if (!els.length) return
            const i = els[0].index
            if (i <= 0) return   // 첫 스냅샷은 전날 없음 → 무시
            const cur  = pacing[i]?.update_date
            const prev = pacing[i - 1]?.update_date
            if (!cur || !prev) return
            setDeltaSnap({ cur, prev })
          },
          onHover: (e: any, els: any[]) => {
            const cv = e?.native?.target as HTMLCanvasElement | undefined
            if (cv) cv.style.cursor = els.length ? 'pointer' : 'default'
          },
          plugins: {
            legend: { display: false },
            // 그래프 탭(RateChartView)이 전역 등록하는 'customDatalabels' 플러그인이
            // 이 차트에도 적용되어 BAR Rate 레이블이 새어나오는 문제 → 이 차트에선 비활성
            ...({ customDatalabels: false } as any),
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
                  return `OTB OCC: ${ctx.parsed.y}%`
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
              position: 'right', min: yBarRange.min, max: yBarRange.max,
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
  }, [open, chart, yBarRange])

  if (!open) return null

  // 헤더 타이틀용 날짜 파싱 (로컬)
  const [sy, sm, sd] = stayDate.split('-').map(Number)
  const dow = new Date(sy, sm - 1, sd).getDay()
  const title = `${sm}월 ${sd}일 (${DOW_KR[dow]}) 상세`

  return createPortal(
    <>
    <div style={{ position: 'fixed', inset: 0, zIndex: 100002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.6)', width: '72vw', maxWidth: 1100, height: '64vh', maxHeight: '64vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 10px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{title}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>OCC Trend · BAR Rate History (Last 30 days)</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {showRateEdit && (
              <button
                onClick={() => { setSimDate(stayDate); setAdrSimOpen(true) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#ccc', cursor: 'pointer' }}
              >
                <Pencil size={13} /> 요금 수정
              </button>
            )}
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: 4, display: 'inline-flex' }} aria-label="닫기">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 차트 */}
        <div style={{ padding: '10px 16px 8px', flex: 1, minHeight: 0 }}>
          {pacing.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#555' }}>No data</div>
          ) : (
            <canvas ref={canvasRef} />
          )}
        </div>

        {/* 범례 — OTB OCC + 요금대별 색상 */}
        <div style={{ padding: '0 16px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 10, background: 'rgba(180,180,180,0.5)', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#888' }}>OTB OCC</span>
          </div>
          {rateTiers.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 0, borderTop: `2.5px solid ${rateTiers.size === 1 ? Array.from(rateTiers.values())[0] : BAR_GOLD}`, borderRadius: 2 }} />
              <span style={{ fontSize: 11, color: '#888' }}>Bar Rate</span>
            </div>
          )}
        </div>
      </div>

      {/* 요금 수정 — AdrSimulatorModal (overlay 내부 중첩 → z-index 스택 정상) */}
      {adrSimOpen && (
        <AdrSimulatorModal
          isOpen={adrSimOpen}
          onClose={() => setAdrSimOpen(false)}
          date={simDate}
          onDateChange={setSimDate}
          totalRooms={roomCount}
          roomTypes={[]}
          baseBarRate={currentRate ?? 0}
          booked={pacing.length ? Math.round(Number(pacing[pacing.length - 1].otb_nights ?? 0)) : 0}
          fcstUpdateDate={fcstDate}
        />
      )}
    </div>

    {deltaSnap && (
      <PacingDeltaModal
        open={!!deltaSnap}
        onClose={() => setDeltaSnap(null)}
        hotelId={hotelId}
        stayDate={stayDate}
        snapshot={deltaSnap.cur}
        prevSnapshot={deltaSnap.prev}
        roomCount={roomCount}
      />
    )}
    </>,
    document.body,
  )
}
