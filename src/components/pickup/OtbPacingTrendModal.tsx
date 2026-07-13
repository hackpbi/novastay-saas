'use client'

// OTB Pacing Trend — 선택 일자의 30일(D-30~D-0) OTB OCC 추이 + 전년(동기간/동일자) 오버레이
// 데이터: get_otb_pacing_trend RPC (update_date 행=추이 / account_name 행=account 스냅샷)

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import Chart from 'chart.js/auto'
import { supabase } from '@/lib/supabase'

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']

interface OtbPacingTrendModalProps {
  open:      boolean
  onClose:   () => void
  date:      string   // 'YYYY-MM-DD' — 선택한 날짜
  hotelId:   string
  otbDate:   string   // 글로벌 OTB date
  roomCount: number
}

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

export function OtbPacingTrendModal({ open, onClose, date, hotelId, otbDate, roomCount }: OtbPacingTrendModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<Chart | null>(null)
  const [lyMode, setLyMode] = useState<'period' | 'day'>('period')   // ON(보라)=동기간 / OFF(금색)=동일자

  // from_date = otbDate 기준 D-30 (KST 컨벤션)
  const fromDate = useMemo(() => {
    if (!otbDate) return ''
    const [y, m, d] = otbDate.split('-').map(Number)
    const o = new Date(y, m - 1, d - 30)
    return [o.getFullYear(), String(o.getMonth() + 1).padStart(2, '0'), String(o.getDate()).padStart(2, '0')].join('-')
  }, [otbDate])

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['otb-pacing-trend', hotelId, date, otbDate, lyMode],
    enabled: open && !!hotelId && !!date && !!otbDate,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_otb_pacing_trend', {
        p_hotel_id:      hotelId,
        p_business_date: date,
        p_from_date:     fromDate,
        p_to_date:       otbDate,
        p_ly_mode:       lyMode,
      })
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  // 추이(update_date 있는 행) / account(account_name 있는 행, acct_nights 내림차순)
  const trendRows = useMemo(() => rows.filter((r: any) => r.update_date !== null), [rows])
  const acctRows  = useMemo(
    () => rows.filter((r: any) => r.account_name !== null).sort((a: any, b: any) => (b.acct_nights ?? 0) - (a.acct_nights ?? 0)),
    [rows],
  )

  // ESC + scroll lock
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // 추이 차트
  useEffect(() => {
    if (!open || !canvasRef.current || trendRows.length === 0) return
    chartRef.current?.destroy()

    const dateLabels  = trendRows.map((r: any) => { const d = new Date(r.update_date); return `${d.getMonth() + 1}/${d.getDate()}` })
    const thisOccData = trendRows.map((r: any) => (r.otb_nights > 0 && roomCount > 0 ? Math.round((r.otb_nights / roomCount) * 100) : null))
    const lyOccData   = trendRows.map((r: any) => (r.ly_nights  > 0 && roomCount > 0 ? Math.round((r.ly_nights  / roomCount) * 100) : null))
    const lyColor     = lyMode === 'period' ? '#a78bfa' : '#F59E0B'
    const otbIdx      = trendRows.length - 1   // OTB 기준일 = 마지막 스냅샷

    // OTB 기준일 수직 점선 + 'OTB' 라벨
    const otbLine = {
      id: 'otbLine',
      afterDraw(c: any) {
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

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: dateLabels,
        datasets: [
          { label: '올해 OTB OCC', data: thisOccData as any, borderColor: '#00E5A0', borderWidth: 2, pointRadius: 2, pointBackgroundColor: '#00E5A0', tension: 0.4, spanGaps: false },
          { label: lyMode === 'period' ? '전년동기간 OCC' : '전년동일자 OCC', data: lyOccData as any, borderColor: lyColor, borderWidth: 1.5, borderDash: [4, 3], pointRadius: 2, pointBackgroundColor: lyColor, tension: 0.4, spanGaps: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 16, bottom: 4 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items: any[]) => {
                const d = new Date(trendRows[items[0].dataIndex]?.update_date)
                return `${d.getMonth() + 1}/${d.getDate()} (${DOW_KR[d.getDay()]})`
              },
              label: (item: any) => ` ${item.dataset.label}: ${item.raw == null ? '-' : `${item.raw}%`}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false }, border: { display: false },
            ticks: {
              color: (ctx: any) => {
                const r = trendRows[ctx.index]
                if (!r) return '#555'
                const dow = new Date(r.update_date).getDay()
                return dow === 0 || dow === 6 ? '#E24B4A' : '#555'
              },
              callback: (_v: any, i: number) => (i === 0 || i === trendRows.length - 1 || i % 5 === 0 ? dateLabels[i] : ''),
              autoSkip: false, maxRotation: 0, font: { size: 9 },
            },
          },
          y: {
            min: 0, max: 110,
            grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false },
            ticks: { color: '#555', font: { size: 10 }, callback: (v: any) => `${v}%` },
          },
        },
      },
      plugins: [otbLine],
    })

    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [open, trendRows, lyMode, roomCount])

  if (!open) return null

  // 헤더 타이틀
  const dateObj = new Date(date)
  const title = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 (${DOW_KR[dateObj.getDay()]}) — 30일 픽업 추이`

  // KPI (D-0 = 마지막 trendRow 기준)
  const last  = trendRows[trendRows.length - 1]
  const first = trendRows.find((r: any) => r.otb_nights > 0)
  const currentOcc = last && last.otb_nights > 0 && roomCount > 0 ? Math.round((last.otb_nights / roomCount) * 100) : 0
  const lyOcc      = last && last.ly_nights  > 0 && roomCount > 0 ? Math.round((last.ly_nights  / roomCount) * 100) : 0
  const gap      = currentOcc - lyOcc
  const pickup30 = Math.round((last?.otb_nights ?? 0) - (first?.otb_nights ?? 0))
  const lyColor  = lyMode === 'period' ? '#a78bfa' : '#F59E0B'

  const kpis = [
    { label: '현재 OCC', value: `${currentOcc}%`, color: '#00E5A0' },
    { label: lyMode === 'period' ? '전년동기간 OCC' : '전년동일자 OCC', value: `${lyOcc}%`, color: lyColor },
    { label: 'GAP', value: `${gap > 0 ? '+' : ''}${gap}%p`, color: gap >= 0 ? '#00E5A0' : '#E24B4A' },
    { label: '30일 픽업', value: `${pickup30 > 0 ? '+' : ''}${pickup30} R/N`, color: '#fff' },
  ]

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: 'min(860px, 95vw)', background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={trackStyle(lyMode === 'period', '#a78bfa', '#F59E0B')} onClick={() => setLyMode(p => (p === 'period' ? 'day' : 'period'))}>
                <div style={thumbStyle(lyMode === 'period')} />
              </div>
              <span style={{ fontSize: 11, color: lyMode === 'period' ? '#a78bfa' : '#F59E0B', minWidth: 30 }}>{lyMode === 'period' ? '동기간' : '동일자'}</span>
            </div>
            <button onClick={onClose} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: 2, display: 'inline-flex' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 본문 — 좌: 차트 / 우: account */}
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 280 }}>
              {isLoading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#555' }}>로딩 중…</div>
              ) : trendRows.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#555' }}>No data</div>
              ) : (
                <canvas ref={canvasRef} />
              )}
            </div>
            {/* 범례 */}
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 20, height: 2, background: '#00E5A0' }} />
                <span style={{ fontSize: 11, color: '#666' }}>올해 OTB OCC</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 20, height: 0, borderTop: `2px dashed ${lyMode === 'period' ? '#a78bfa' : '#F59E0B'}` }} />
                <span style={{ fontSize: 11, color: '#666' }}>{lyMode === 'period' ? '전년동기간 OCC' : '전년동일자 OCC'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 2, height: 12, background: '#5B8DEF' }} />
                <span style={{ fontSize: 11, color: '#666' }}>OTB 기준일</span>
              </div>
            </div>
          </div>

          {/* account 패널 */}
          <div style={{ width: 220, flexShrink: 0, borderLeft: '1px solid #1f1f1f', paddingLeft: 16, maxHeight: 300, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>어카운트별 OTB ({otbDate} 기준)</div>
            {acctRows.length === 0 ? (
              <div style={{ fontSize: 11, color: '#444' }}>—</div>
            ) : acctRows.map((a: any) => (
              <div key={a.account_name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 7 }}>
                <span style={{ color: '#aaa' }}>{a.account_name}</span>
                <span style={{ color: '#fff', fontWeight: 600, minWidth: 24, textAlign: 'right' }}>{a.acct_nights}</span>
              </div>
            ))}
          </div>
        </div>

        {/* KPI 카드 4개 */}
        <div style={{ display: 'flex', gap: 12 }}>
          {kpis.map(k => (
            <div key={k.label} style={{ flex: 1, background: '#131313', border: '1px solid #1f1f1f', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
