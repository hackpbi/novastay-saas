'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDateContext } from '@/contexts/DateContext'
import { useFcstDateContext } from '@/contexts/FcstDateContext'

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const EMPTY_ARR: (number | null)[] = []
const FCST_ORANGE = '#F5A623'
const LY_FINAL = '#B57EDC'   // 전년마감 (진보라 실선)
const LY_OTB   = '#a89ae0'   // 전년OTB (연보라 점선)

interface DailyStatusModalProps {
  open:      boolean
  onClose:   () => void
  hotelId:   string
  year:      number    // 1-based
  month:     number    // 1-based
  roomCount: number
}

export default function DailyStatusModal({ open, onClose, hotelId, year, month, roomCount }: DailyStatusModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  const { otbDate } = useDateContext()      // 전년OTB pacing / OCC 스냅샷 날짜
  const { fcstDate } = useFcstDateContext() // 전망(FCST) 기준 update_date

  // 전년 토글
  const [lyOn,        setLyOn]        = useState(true)
  const [lyPeriod,    setLyPeriod]    = useState(true)   // true=동기간(period), false=동일자(day)
  const [showLyFinal, setShowLyFinal] = useState(true)   // 전년마감 실선
  const [showLyOtb,   setShowLyOtb]   = useState(true)   // 전년OTB 점선 (기본 ON)
  const lyMode: 'none' | 'day' | 'period' = !lyOn ? 'none' : (lyPeriod ? 'period' : 'day')

  const [showFcst, setShowFcst] = useState(true)         // FCST 추세선 on/off
  const [showOccLabel, setShowOccLabel] = useState(true)
  const showOccLabelRef = useRef(showOccLabel)

  // 모달 내부 월 상태 (month는 1-based → 내부 0-based)
  const [modalYear,  setModalYear]  = useState(year)
  const [modalMonth, setModalMonth] = useState(month - 1)
  useEffect(() => {
    if (open) { setModalYear(year); setModalMonth(month - 1) }
  }, [open, year, month])

  // 이전 버튼 제한 — OTB 날짜 기준 월
  const otbYear  = otbDate ? parseInt(otbDate.slice(0, 4)) : modalYear
  const otbMonth = otbDate ? parseInt(otbDate.slice(5, 7)) - 1 : 0
  const isMinMonth = modalYear < otbYear || (modalYear === otbYear && modalMonth <= otbMonth)
  const handlePrev = () => {
    if (isMinMonth) return
    if (modalMonth === 0) { setModalMonth(11); setModalYear(y => y - 1) }
    else setModalMonth(m => m - 1)
  }
  const handleNext = () => {
    if (modalMonth === 11) { setModalMonth(0); setModalYear(y => y + 1) }
    else setModalMonth(m => m + 1)
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const lyLastDay = new Date(modalYear, modalMonth + 1, 0).getDate()

  // ── 현재 OTB OCC (get_ly_pacing_data.otb_nights / roomCount) — 항상 조회 ──────────
  const { data: otbOccByDay } = useQuery({
    queryKey: ['daily-otb-occ', hotelId, otbDate, modalYear, modalMonth],
    enabled: open && !!hotelId && !!otbDate,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('get_ly_pacing_data', { p_hotel_id: hotelId, p_otb_date: otbDate }).limit(100000)
      const byDay: Record<number, number> = {}
      for (const r of (data ?? []) as { business_date: string; otb_nights: number }[]) {
        const dt = new Date(r.business_date)
        if (dt.getFullYear() !== modalYear || dt.getMonth() !== modalMonth) continue
        byDay[dt.getDate()] = (byDay[dt.getDate()] ?? 0) + Number(r.otb_nights ?? 0)
      }
      return byDay
    },
  })

  // ── 일자별 배열 (OCC) ──────────────────────────────────────────────────────────
  const daily = useMemo(() => {
    const days = new Date(modalYear, modalMonth + 1, 0).getDate()
    const arr: { day: number; dow: number; isWeekend: boolean; occ: number }[] = []
    for (let day = 1; day <= days; day++) {
      const dow = new Date(modalYear, modalMonth, day).getDay()
      const otbN = otbOccByDay?.[day] ?? 0
      const occ = roomCount > 0 ? Math.round(otbN / roomCount * 100) : 0
      arr.push({ day, dow, isWeekend: dow === 0 || dow === 6, occ })
    }
    return arr
  }, [otbOccByDay, modalYear, modalMonth, roomCount])

  // ── FCST 일별 (get_forecast_daily RPC → forecast_nights / roomCount) ──────────────
  const { data: fcstArr } = useQuery({
    queryKey: ['daily-fcst', hotelId, modalYear, modalMonth, fcstDate],
    enabled: open && !!hotelId && !!fcstDate,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const start = `${modalYear}-${pad(modalMonth + 1)}-01`
      const end   = `${modalYear}-${pad(modalMonth + 1)}-${pad(lyLastDay)}`
      const { data, error } = await (supabase as any).rpc('get_forecast_daily', {
        p_hotel_id:    hotelId,
        p_start_date:  start,
        p_end_date:    end,
        p_update_date: fcstDate,      // 글로벌 FCST date picker 값
      })
      if (error) throw error
      const rows = (data ?? []) as {
        business_date: string
        forecast_nights: number
        forecast_revenue: number
        forecast_adr: number
      }[]
      // RPC가 business_date별 세그 전체 합산 반환 → 일자 매핑 + 점유율 계산만
      const byDay: Record<number, number> = {}
      for (const r of rows) {
        const dt = new Date(r.business_date)
        byDay[dt.getDate()] = Number(r.forecast_nights ?? 0)
      }
      return Array.from({ length: lyLastDay }, (_, i) => {
        const n = byDay[i + 1]
        return n != null && roomCount > 0 ? Math.round((n / roomCount) * 100) : null
      })
    },
  })
  const fcstData = fcstArr ?? EMPTY_ARR

  // ── 이벤트 (c06_calendar) ────────────────────────────────────────────────────────
  const { data: events = [] } = useQuery<{ date: string; event: string }[]>({
    queryKey: ['daily-events', modalYear, modalMonth],
    enabled: open,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const m1   = modalMonth + 1
      const days = new Date(modalYear, m1, 0).getDate()
      const start = `${modalYear}-${pad(m1)}-01`
      const end   = `${modalYear}-${pad(m1)}-${pad(days)}`
      const { data, error } = await (supabase as any)
        .from('c06_calendar')
        .select('date, event')
        .gte('date', start).lte('date', end)
        .not('event', 'is', null).neq('event', '')
      if (error) throw error
      return (data ?? []) as { date: string; event: string }[]
    },
  })
  const eventMap = useMemo(() => {
    const m: Record<number, string> = {}
    for (const r of events) {
      if (!r.event || r.event.trim() === '' || r.event === 'null') continue
      m[new Date(r.date).getDate()] = r.event
    }
    return m
  }, [events])

  // ── 전년(LY) OCC 오버레이 — c06 yoy_match + a01_actual_daily ──────────────────────
  const { data: lyCalRows = [] } = useQuery({
    queryKey: ['daily-ly-cal', modalYear, modalMonth],
    enabled: open && lyMode === 'period',
    queryFn: async () => {
      const start = `${modalYear}-${pad(modalMonth + 1)}-01`
      const end   = `${modalYear}-${pad(modalMonth + 1)}-${pad(lyLastDay)}`
      const { data } = await (supabase as any)
        .from('c06_calendar').select('date, yoy_match').gte('date', start).lte('date', end)
      return (data ?? []) as { date: string; yoy_match: string | null }[]
    },
  })
  const lyDateByDay = useMemo(() => {
    const byDate = new Map(lyCalRows.map(r => [r.date, r.yoy_match]))
    const arr: string[] = []
    for (let d = 1; d <= lyLastDay; d++) {
      const date   = `${modalYear}-${pad(modalMonth + 1)}-${pad(d)}`
      const simple = `${modalYear - 1}-${pad(modalMonth + 1)}-${pad(d)}`
      arr.push(lyMode === 'period' ? (byDate.get(date) || simple) : simple)
    }
    return arr
  }, [lyCalRows, modalYear, modalMonth, lyLastDay, lyMode])
  const { data: lyOccArr } = useQuery({
    queryKey: ['daily-ly-occ', hotelId, modalYear, modalMonth, lyMode, lyDateByDay.join(',')],
    enabled: open && lyMode !== 'none' && !!hotelId && lyDateByDay.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('a01_actual_daily').select('business_date, nights')
        .eq('hotel_id', hotelId).in('business_date', lyDateByDay)
      const map = new Map<string, number>()
      for (const r of (data ?? []) as { business_date: string; nights: number }[]) {
        map.set(r.business_date, (map.get(r.business_date) ?? 0) + (r.nights ?? 0))
      }
      return lyDateByDay.map(ly => {
        const n = map.get(ly)
        return n != null && roomCount > 0 ? Math.round((n / roomCount) * 100) : null
      })
    },
  })
  const lyOccData = lyOccArr ?? EMPTY_ARR
  const { data: lyOtbArr } = useQuery({
    queryKey: ['daily-ly-otb', hotelId, otbDate, modalYear, modalMonth, lyMode],
    enabled: open && lyMode !== 'none' && !!hotelId && !!otbDate,
    queryFn: async () => {
      const rpc = lyMode === 'day' ? 'get_ly_pacing_data' : 'get_ly_pacing_data_v2'
      const { data } = await (supabase as any).rpc(rpc, { p_hotel_id: hotelId, p_otb_date: otbDate }).limit(100000)
      const byDay: Record<number, number> = {}
      for (const r of (data ?? []) as { business_date: string; ly_nights: number }[]) {
        const dt = new Date(r.business_date)
        if (dt.getFullYear() !== modalYear || dt.getMonth() !== modalMonth) continue
        byDay[dt.getDate()] = (byDay[dt.getDate()] ?? 0) + Number(r.ly_nights ?? 0)
      }
      return Array.from({ length: lyLastDay }, (_, i) => {
        const n = byDay[i + 1]
        return n != null && roomCount > 0 ? Math.round((n / roomCount) * 100) : null
      })
    },
  })
  const lyOtbData = lyOtbArr ?? EMPTY_ARR

  // ESC + scroll lock
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // ── 차트 ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (cancelled || !canvasRef.current) return
      chartRef.current?.destroy()

      const labels     = daily.map(d => d.day)
      const occData    = daily.map(d => d.occ)
      const hasEvents  = Object.keys(eventMap).length > 0

      const today = new Date()
      const todayYear = today.getFullYear()
      const todayMonth = today.getMonth() + 1
      const todayDate = today.getDate()
      const curY = modalYear, curM = modalMonth + 1
      const isTodayMonth = curY === todayYear && curM === todayMonth

      // x축 라벨 아래 이벤트 원
      const eventPlugin = {
        id: 'eventLabels',
        afterDraw(chart: any) {
          const x = chart.scales.x
          const { ctx } = chart
          let labelBottom = x.bottom
          const items: any[] = x._labelItems || []
          if (items.length) {
            const it = items[0]
            const t = it?.options?.translation ?? it?.translation
            const f = it?.options?.font ?? it?.font
            const lines = Array.isArray(it?.label) ? it.label.length : 1
            const lh = f?.lineHeight ?? ((f?.size ?? 10) * 1.2)
            if (t && typeof t[1] === 'number') labelBottom = t[1] + lines * lh
          }
          const yCenter = labelBottom + 6 + 9
          for (const [day, text] of Object.entries(eventMap)) {
            const idx = Number(day) - 1
            if (idx < 0 || idx >= daily.length) continue
            const xPos = x.getPixelForValue(idx)
            const match = String(text).match(/\(([^)]+)\)/)
            const label = (match ? match[1] : String(text)).slice(0, 2)
            ctx.save()
            ctx.beginPath(); ctx.arc(xPos, yCenter, 9, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(0,229,160,0.15)'; ctx.fill()
            ctx.strokeStyle = '#00E5A0'; ctx.lineWidth = 1; ctx.stroke()
            ctx.font = '9px -apple-system, sans-serif'
            ctx.fillStyle = '#00E5A0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText(label, xPos, yCenter)
            ctx.restore()
          }
        },
      }

      // OCC% 숫자
      const occLabels = {
        id: 'occLabels',
        afterDatasetsDraw(chart: any) {
          if (!showOccLabelRef.current) return
          const { ctx, scales: { x, yOcc } } = chart
          occData.forEach((val: number, i: number) => {
            if (val == null || val === 0) return
            const xPos = x.getPixelForValue(i)
            const yPos = yOcc.getPixelForValue(val)
            ctx.save()
            ctx.fillStyle = 'rgba(160,160,160,0.4)'
            ctx.font = '9px sans-serif'
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
            ctx.fillText(`${val}%`, xPos, yPos - 3)
            ctx.restore()
          })
        },
      }

      // 좌측(전년) / 우측(FCST) 반폭 마커
      const halfMarks = {
        id: 'halfMarks',
        afterDatasetsDraw(chart: any) {
          const { ctx, scales: { x, yOcc } } = chart
          void x
          const meta = chart.getDatasetMeta(0)   // OCC 막대
          if (!meta.data.length) return
          ctx.save()

          for (let i = 0; i < lyLastDay; i++) {
            const el = meta.data[i]
            if (!el) continue
            const cx = el.x
            const bw = (el.width ?? 10) * 0.9      // 막대 폭 기준
            const half = bw / 2
            const barTop = el.y                     // 막대 상단 y

            const L0 = cx - half, L1 = cx - half * 0.06   // 좌측 반폭 구간
            const R0 = cx + half * 0.06, R1 = cx + half   // 우측 반폭 구간

            // ── 좌측: 전년마감 (실선) ──
            if (showLyFinal && lyOccData[i] != null) {
              const y = yOcc.getPixelForValue(lyOccData[i]!)
              ctx.setLineDash([]); ctx.strokeStyle = LY_FINAL; ctx.lineWidth = 2.5
              ctx.beginPath(); ctx.moveTo(L0, y); ctx.lineTo(L1, y); ctx.stroke()
            }
            // ── 좌측: 전년OTB (점선) ──
            if (showLyOtb && lyOtbData[i] != null) {
              const y = yOcc.getPixelForValue(lyOtbData[i]!)
              ctx.setLineDash([3, 2]); ctx.strokeStyle = LY_OTB; ctx.lineWidth = 2
              ctx.beginPath(); ctx.moveTo(L0, y); ctx.lineTo(L1, y); ctx.stroke()
            }
            // ── 좌측: 전년OTB ↔ 전년마감 세로 연결선 ──
            if (showLyFinal && showLyOtb && lyOccData[i] != null && lyOtbData[i] != null) {
              const y1 = yOcc.getPixelForValue(lyOtbData[i]!)
              const y2 = yOcc.getPixelForValue(lyOccData[i]!)
              const lx = (L0 + L1) / 2
              ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(168,154,224,0.4)'
              ctx.beginPath(); ctx.moveTo(lx, y1); ctx.lineTo(lx, y2); ctx.stroke()
            }

            // ── 우측: FCST (실선) + 막대 상단↔FCST 세로 연결선 ──
            if (showFcst && fcstData[i] != null) {
              const y = yOcc.getPixelForValue(fcstData[i]!)
              ctx.setLineDash([]); ctx.strokeStyle = FCST_ORANGE; ctx.lineWidth = 2.5
              ctx.beginPath(); ctx.moveTo(R0, y); ctx.lineTo(R1, y); ctx.stroke()
              // 막대상단↔FCST 세로 연결선 — 막대가 보일 때(OCC 표시 중)만 (공중에 뜬 선 방지)
              if (showOccLabelRef.current) {
                const rx = (R0 + R1) / 2
                ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(245,166,35,0.4)'
                ctx.beginPath(); ctx.moveTo(rx, barTop); ctx.lineTo(rx, y); ctx.stroke()
              }
            }
          }
          ctx.setLineDash([])
          ctx.restore()
        },
      }

      chartRef.current = new Chart(canvasRef.current, {
        plugins: [eventPlugin, occLabels, halfMarks],
        data: {
          labels,
          datasets: [
            {
              type: 'bar',
              label: 'OTB OCC',
              data: occData,
              // OCC% 토글 OFF → 투명(막대 숨김). scriptable이라 update('none')만으로 반영
              // 막대를 더 연하게(0.5/0.7) → 전년/FCST 마커 가독성 향상
              backgroundColor: () => (showOccLabelRef.current ? 'rgba(91,141,239,0.5)' : 'transparent'),
              borderColor:     () => (showOccLabelRef.current ? 'rgba(91,141,239,0.7)' : 'transparent'),
              borderWidth: 1,
              borderRadius: 2,
              yAxisID: 'yOcc',
              barPercentage: 0.78,
              categoryPercentage: 0.9,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 18, bottom: hasEvents ? 30 : 8 } },
          interaction: { mode: 'index', intersect: false },
          onHover: (e: any, els: any[]) => {
            const cv = e?.native?.target as HTMLCanvasElement | undefined
            if (cv) cv.style.cursor = els.length ? 'pointer' : 'default'
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: false,
              external: (context: any) => {
                const { chart, tooltip } = context
                let el = document.getElementById('daily-chart-tooltip')
                if (!el) {
                  el = document.createElement('div')
                  el.id = 'daily-chart-tooltip'
                  el.style.cssText = 'position:fixed;background:#0a0a0a;border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 14px;pointer-events:none;font-size:12px;min-width:170px;box-shadow:0 4px 16px rgba(0,0,0,0.5);z-index:100001;opacity:0;transition:opacity 0.1s;'
                  document.body.appendChild(el)
                }
                if (tooltip.opacity === 0) { el.style.opacity = '0'; return }
                const i = tooltip.dataPoints?.[0]?.dataIndex
                if (i == null) { el.style.opacity = '0'; return }
                const d = daily[i]
                const otbOccVal = occData[i]
                const fcstVal   = fcstData[i]
                const lyFinalVal = lyOccData[i]
                const lyOtbVal   = lyOtbData[i]
                const hasLy      = lyMode !== 'none'
                const title = d ? `${modalMonth + 1}월 ${d.day}일 (${DOW_KR[d.dow]})` : ''
                let rows = ''
                if (otbOccVal != null) {
                  rows += `<div style="display:flex;justify-content:space-between;gap:24px;margin:3px 0;font-size:11px;"><span style="color:#5B8DEF;">OTB OCC</span><span style="color:#8fb0f5;font-weight:600;">${otbOccVal}%</span></div>`
                }
                if (showFcst && fcstVal != null) {
                  rows += `<div style="display:flex;justify-content:space-between;gap:24px;margin:3px 0;font-size:11px;"><span style="color:${FCST_ORANGE};">FCST</span><span style="color:${FCST_ORANGE};font-weight:600;">${fcstVal}%</span></div>`
                }
                if (hasLy && showLyFinal && lyFinalVal != null) {
                  rows += `<div style="display:flex;justify-content:space-between;gap:24px;margin:3px 0;font-size:11px;"><span style="color:#888;">전년 마감</span><span style="color:${LY_FINAL};">${lyFinalVal}%</span></div>`
                }
                if (hasLy && showLyOtb && lyOtbVal != null) {
                  rows += `<div style="display:flex;justify-content:space-between;gap:24px;margin:3px 0;font-size:11px;"><span style="color:#888;">전년 OTB</span><span style="color:${LY_OTB};">${lyOtbVal}%</span></div>`
                }
                el.innerHTML = `<div style="font-size:12px;font-weight:500;color:#fff;margin-bottom:8px;border-bottom:0.5px solid rgba(255,255,255,0.08);padding-bottom:6px;">${title}</div>${rows}`
                const rect = chart.canvas.getBoundingClientRect()
                const x = rect.left + tooltip.caretX + 14
                const y = rect.top + tooltip.caretY - 20
                const tw = el.offsetWidth || 190
                const th = el.offsetHeight || 100
                const finalX = x + tw > window.innerWidth - 16 ? x - tw - 24 : x
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
              border: { display: false },
              ticks: {
                color: (c: any) => {
                  const day = c.index + 1
                  if (isTodayMonth && day === todayDate) return '#5B8DEF'
                  const dow = daily[c.index]?.dow
                  return dow === 5 || dow === 6 ? '#E24B4A' : '#888'
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
              position: 'left', min: 0, max: 118,
              grid: { display: false },
              border: { display: false },
              ticks: { color: '#444', font: { size: 10 }, callback: (v: any) => (v <= 100 ? `${v}%` : '') },
            },
          },
        },
      })
    })()
    return () => {
      cancelled = true
      chartRef.current?.destroy(); chartRef.current = null
      document.getElementById('daily-chart-tooltip')?.remove()
    }
  }, [open, daily, modalMonth, eventMap, lyMode, lyOccData, lyOtbData, showLyFinal, showLyOtb, showFcst, fcstData])

  useEffect(() => { showOccLabelRef.current = showOccLabel; chartRef.current?.update('none') }, [showOccLabel])
  useEffect(() => () => { document.getElementById('daily-chart-tooltip')?.remove() }, [])

  if (!open) return null

  const trackStyle = (on: boolean, onColor: string, offColor: string): React.CSSProperties => ({
    position: 'relative', display: 'inline-block', width: 36, height: 20, borderRadius: 20,
    background: on ? onColor : offColor, border: `1px solid ${on ? onColor : offColor}`,
    cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
  })
  const thumbStyle = (on: boolean): React.CSSProperties => ({
    position: 'absolute', width: 14, height: 14, top: 2, left: on ? 20 : 2,
    borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
  })

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'linear-gradient(175deg, #0d1f1a 0%, #0a0a0a 40%)', border: '1px solid #1e1e1e', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.6)', width: '85vw', maxWidth: '85vw', height: '81vh', maxHeight: '81vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 헤더 — ‹ Jul 2026 Daily Status › */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 4px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handlePrev}
              disabled={isMinMonth}
              aria-label="이전 달"
              style={{
                width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
                color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: isMinMonth ? 'not-allowed' : 'pointer', opacity: isMinMonth ? 0.4 : 1,
                fontSize: 20, lineHeight: 1, padding: 0, transition: 'color .15s, background .15s',
              }}
              onMouseEnter={(e) => { if (isMinMonth) return; e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; e.currentTarget.style.background = 'transparent' }}
            >
              ‹
            </button>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 20, fontWeight: 600, color: '#00E5A0', letterSpacing: '-0.01em' }}>
                {MONTH_NAMES[modalMonth]} {modalYear}
              </span>
              <span style={{ fontSize: 20, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>
                Daily Status
              </span>
            </div>
            <button
              onClick={handleNext}
              aria-label="다음 달"
              style={{
                width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
                color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0, transition: 'color .15s, background .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; e.currentTarget.style.background = 'transparent' }}
            >
              ›
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* 전년 + 동기간/동일자 */}
            <div style={{ display: 'inline-flex', alignItems: 'center', background: '#1a1a1a', borderRadius: 30, padding: '3px 8px', gap: 6, border: '1px solid #2a2a2a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={trackStyle(lyOn, '#a78bfa', '#2a2a2a')} onClick={() => { const next = !lyOn; setLyOn(next); if (!next) setLyPeriod(true) }}>
                  <div style={thumbStyle(lyOn)} />
                </div>
                <span style={{ fontSize: 11, color: '#666' }}>전년</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: lyOn ? 1 : 0.4, pointerEvents: lyOn ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                <div style={trackStyle(lyPeriod, '#a78bfa', '#F59E0B')} onClick={() => setLyPeriod(prev => !prev)}>
                  <div style={thumbStyle(lyPeriod)} />
                </div>
                <span style={{ fontSize: 11, color: lyPeriod ? '#a78bfa' : '#F59E0B', transition: 'color 0.2s' }}>{lyPeriod ? '동기간' : '동일자'}</span>
              </div>
            </div>
            <div style={{ width: 1, height: 26, background: '#222', margin: '0 4px' }} />
            {/* 전년마감 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={trackStyle(showLyFinal, LY_FINAL, '#2a2a2a')} onClick={() => setShowLyFinal(p => !p)}>
                <div style={thumbStyle(showLyFinal)} />
              </div>
              <span style={{ fontSize: 11, color: '#666' }}>전년마감</span>
            </div>
            {/* 전년OTB */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={trackStyle(showLyOtb, LY_OTB, '#2a2a2a')} onClick={() => setShowLyOtb(p => !p)}>
                <div style={thumbStyle(showLyOtb)} />
              </div>
              <span style={{ fontSize: 11, color: '#666' }}>전년OTB</span>
            </div>
            {/* FCST 토글 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={trackStyle(showFcst, FCST_ORANGE, '#2a2a2a')} onClick={() => setShowFcst(p => !p)}>
                <div style={thumbStyle(showFcst)} />
              </div>
              <span style={{ fontSize: 11, color: showFcst ? FCST_ORANGE : '#666' }}>FCST</span>
            </div>
            {/* OCC% */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={trackStyle(showOccLabel, '#5B8DEF', '#2a2a2a')} onClick={() => setShowOccLabel(p => !p)}>
                <div style={thumbStyle(showOccLabel)} />
              </div>
              <span style={{ fontSize: 11, color: '#666' }}>OCC%</span>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: 4, display: 'inline-flex' }} aria-label="닫기">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 서브바 — OTB 날짜(읽기 전용) */}
        <div style={{ padding: '0 20px 12px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#888' }}>OTB <b style={{ color: '#ccc', fontWeight: 500 }}>{otbDate || '-'}</b> 기준 · 일별 점유율 · 전년 비교 · 전망</span>
        </div>

        {/* 차트 */}
        <div style={{ padding: '4px 16px 16px', flex: 1, minHeight: 0 }}>
          <canvas ref={canvasRef} />
        </div>

        {/* 범례 */}
        <div style={{ padding: '0 16px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 10, background: 'rgba(91,141,239,0.7)', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#888' }}>OTB OCC</span>
          </div>
          {lyOn && showLyOtb && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 0, borderTop: `1px dashed ${LY_OTB}` }} />
              <span style={{ fontSize: 11, color: '#888' }}>전년 OTB (좌)</span>
            </div>
          )}
          {lyOn && showLyFinal && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 0, borderTop: `2.5px solid ${LY_FINAL}`, borderRadius: 2 }} />
              <span style={{ fontSize: 11, color: '#888' }}>전년 마감 (좌)</span>
            </div>
          )}
          {showFcst && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 0, borderTop: `2.5px solid ${FCST_ORANGE}`, borderRadius: 2 }} />
              <span style={{ fontSize: 11, color: '#888' }}>FCST (우)</span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
