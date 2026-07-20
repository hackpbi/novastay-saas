'use client'

// PickDetailPage 전용 임베드 차트 — PickupChartModal 차트 로직을 props 구동으로 추출.
// 모달 크롬(backdrop/X/내부 월네비/DatePicker/타이틀) 제거, 차트 기능 전체 유지.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import type { PickupRow } from '@/hooks/usePickupData'
import MarketPickupDayModal from '@/components/market-pickup/MarketPickupDayModal'

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LY_EMPTY: (number | null)[] = []
const BAR_OPACITY = 0.05      // 기존 Bar 슬라이더 기본값 (5%)
const LABEL_OPACITY = 0.40    // 기존 Label 슬라이더 기본값 (40%)

export default function PickDetailChart({
  hotelId, otbDate, vsOtbDate, viewYear, viewMonth, roomCount, pickupRows,
}: {
  hotelId:    string
  otbDate:    string
  vsOtbDate:  string
  viewYear:   number
  viewMonth:  number   // 1-based (PickDetailPage)
  roomCount:  number
  pickupRows: PickupRow[]   // 부모(PickDetailPage)에서 fetch한 데이터
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  const { data: schema = [] } = useMarketSchema()

  // 표시 월 (0-based로 통일 — 모달의 modalMonth와 동일 의미)
  const modalYear  = viewYear
  const modalMonth = viewMonth - 1

  // 토글: 전년(lyOn) + 동기간/동일자(lyPeriod) → lyMode 파생
  const [lyOn,        setLyOn]        = useState(true)
  const [lyPeriod,    setLyPeriod]    = useState(true)
  const [showLyFinal, setShowLyFinal] = useState(true)
  const [showLyOtb,   setShowLyOtb]   = useState(true)
  const [showPickup,  setShowPickup]  = useState(true)
  const lyMode: 'none' | 'day' | 'period' = !lyOn ? 'none' : (lyPeriod ? 'period' : 'day')
  const [showOccLabel, setShowOccLabel] = useState(true)
  const showOccLabelRef = useRef(showOccLabel)
  const [selectedDay,  setSelectedDay]  = useState<number | null>(null)
  const [dayModalOpen, setDayModalOpen] = useState(false)

  // ── 선택 월의 일자별 픽업 R/N + occ ─────────────────────────────────────────────
  const { daily } = useMemo(() => {
    const month1 = modalMonth + 1
    const days   = new Date(modalYear, month1, 0).getDate()
    const pm = (pickupRows ?? []).filter(r => {
      const d = new Date(r.business_date)
      return d.getFullYear() === modalYear && d.getMonth() === modalMonth
    })
    const puByDate  = new Map<string, number>()
    const otbByDate = new Map<string, number>()
    for (const r of pm) {
      if (r.segmentation !== 'HOU') {
        puByDate.set(r.business_date, (puByDate.get(r.business_date) ?? 0) + (r.pu_nights ?? 0))
        otbByDate.set(r.business_date, (otbByDate.get(r.business_date) ?? 0) + (r.otb_nights ?? 0))
      }
    }
    const arr: { day: number; dow: number; isWeekend: boolean; puNights: number; occ: number }[] = []
    for (let day = 1; day <= days; day++) {
      const dateStr = `${modalYear}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dow = new Date(modalYear, modalMonth, day).getDay()
      const occ = roomCount > 0 ? Math.round((otbByDate.get(dateStr) ?? 0) / roomCount * 100) : 0
      arr.push({ day, dow, isWeekend: dow === 0 || dow === 6, puNights: puByDate.get(dateStr) ?? 0, occ })
    }
    return { daily: arr }
  }, [pickupRows, modalYear, modalMonth, roomCount])

  // ── 이벤트 (c06_calendar) ──────────────────────────────────────────────────────
  const { data: events = [] } = useQuery<{ date: string; event: string }[]>({
    queryKey: ['pick-detail-events', modalYear, modalMonth],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const m1   = modalMonth + 1
      const days = new Date(modalYear, m1, 0).getDate()
      const start = `${modalYear}-${String(m1).padStart(2, '0')}-01`
      const end   = `${modalYear}-${String(m1).padStart(2, '0')}-${String(days).padStart(2, '0')}`
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

  // 일자별 세그먼트 픽업 R/N
  const pickupBySegment = useMemo(() => {
    const mainIds = new Set(schema.filter(s => s.level === 'main' && s.parent_id === null).map(s => s.id))
    const codeToName = new Map<string, string>()
    const nameToColor = new Map<string, string>()
    for (const s of schema) {
      if (s.parent_id && mainIds.has(s.parent_id)) {
        nameToColor.set(s.name, (s as any).bg_dark_color ?? '#888888')
        for (const code of (s.segmentation ?? [])) codeToName.set(code, s.name)
      }
    }
    const byDay = new Map<number, Map<string, number>>()
    for (const r of (pickupRows ?? [])) {
      if (r.segmentation === 'HOU') continue
      const dt = new Date(r.business_date)
      if (dt.getFullYear() !== modalYear || dt.getMonth() !== modalMonth) continue
      const name = codeToName.get(r.segmentation)
      if (!name) continue
      const day = dt.getDate()
      if (!byDay.has(day)) byDay.set(day, new Map())
      const m = byDay.get(day)!
      m.set(name, (m.get(name) ?? 0) + (r.pu_nights ?? 0))
    }
    const map: Record<number, { segName: string; rn: number; color: string }[]> = {}
    for (const [day, m] of byDay) {
      map[day - 1] = Array.from(m.entries()).map(([segName, rn]) => ({ segName, rn: Math.round(rn), color: nameToColor.get(segName) ?? '#888888' }))
    }
    return map
  }, [schema, pickupRows, modalYear, modalMonth])

  // ── 전년(LY) OCC — c06 yoy_match + a01_actual_daily ─────────────────────────────
  const lyPad = (n: number) => String(n).padStart(2, '0')
  const lyLastDay = new Date(modalYear, modalMonth + 1, 0).getDate()
  const { data: lyCalRows = [] } = useQuery({
    queryKey: ['pd-ly-cal', modalYear, modalMonth],
    enabled: lyMode === 'period',
    queryFn: async () => {
      const start = `${modalYear}-${lyPad(modalMonth + 1)}-01`
      const end   = `${modalYear}-${lyPad(modalMonth + 1)}-${lyPad(lyLastDay)}`
      const { data } = await (supabase as any)
        .from('c06_calendar').select('date, yoy_match').gte('date', start).lte('date', end)
      return (data ?? []) as { date: string; yoy_match: string | null }[]
    },
  })
  const lyDateByDay = useMemo(() => {
    const byDate = new Map(lyCalRows.map(r => [r.date, r.yoy_match]))
    const arr: string[] = []
    for (let d = 1; d <= lyLastDay; d++) {
      const date   = `${modalYear}-${lyPad(modalMonth + 1)}-${lyPad(d)}`
      const simple = `${modalYear - 1}-${lyPad(modalMonth + 1)}-${lyPad(d)}`
      arr.push(lyMode === 'period' ? (byDate.get(date) || simple) : simple)
    }
    return arr
  }, [lyCalRows, modalYear, modalMonth, lyLastDay, lyMode])
  const { data: lyOccArr } = useQuery({
    queryKey: ['pd-ly-occ', hotelId, modalYear, modalMonth, lyMode, lyDateByDay.join(','), roomCount],
    enabled: lyMode !== 'none' && !!hotelId && lyDateByDay.length > 0,
    queryFn: async () => {
      // 동기간(yoy_match) 날짜에 실적이 없을 수 있어 동일자(-1년)도 함께 조회해 폴백 (period 모드 전년마감 누락 방지)
      const simpleDates = Array.from({ length: lyLastDay }, (_, i) => `${modalYear - 1}-${lyPad(modalMonth + 1)}-${lyPad(i + 1)}`)
      const queryDates = Array.from(new Set([...lyDateByDay, ...simpleDates]))
      const { data } = await (supabase as any)
        .from('a01_actual_daily').select('business_date, nights')
        .eq('hotel_id', hotelId).in('business_date', queryDates)
      const map = new Map<string, number>()
      for (const r of (data ?? []) as { business_date: string; nights: number }[]) {
        map.set(r.business_date, (map.get(r.business_date) ?? 0) + (r.nights ?? 0))
      }
      return lyDateByDay.map((ly, i) => {
        const n = map.get(ly) ?? map.get(simpleDates[i])   // 동기간 실적 없으면 동일자 폴백
        return n != null && roomCount > 0 ? Math.round((n / roomCount) * 100) : null
      })
    },
  })
  const lyOccData = lyOccArr ?? LY_EMPTY
  const { data: lyOtbArr } = useQuery({
    queryKey: ['pd-ly-otb', hotelId, otbDate, modalYear, modalMonth, lyMode, roomCount],
    enabled: lyMode !== 'none' && !!hotelId && !!otbDate,
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
  const lyOtbData = lyOtbArr ?? LY_EMPTY

  // ── 차트 ───────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (cancelled || !canvasRef.current) return
      chartRef.current?.destroy()

      const labels     = daily.map(d => d.day)
      const occData    = daily.map(d => d.occ)
      const pickupData = daily.map(d => d.puNights)
      const hasEvents = Object.keys(eventMap).length > 0
      const rcMax = roomCount > 0 ? roomCount : 100

      const today = new Date()
      const todayYear = today.getFullYear()
      const todayMonth = today.getMonth() + 1
      const todayDate = today.getDate()
      const curY = modalYear, curM = modalMonth + 1
      const isTodayMonth = curY === todayYear && curM === todayMonth
      // OTB date 해당 일자 바 파란색 강조 (해당 월일 때만)
      const otbD = otbDate ? new Date(otbDate) : null
      const isOtbMonth = !!otbD && otbD.getFullYear() === modalYear && otbD.getMonth() === modalMonth
      const otbDay = otbD ? otbD.getDate() : -1
      const dayTotal = (i: number) => (pickupBySegment[i] ?? []).reduce((s, r) => s + r.rn, 0)

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
            ctx.fillStyle = `rgba(160,160,160,${LABEL_OPACITY})`
            ctx.font = '9px sans-serif'
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
            ctx.fillText(`${val}%`, xPos, yPos - 3)
            ctx.restore()
          })
        },
      }

      const pickupLabels = {
        id: 'pickupLabels',
        afterDatasetsDraw(chart: any) {
          if (!showPickup) return
          const { ctx, scales } = chart
          const yPickup = scales.yPickup
          if (!yPickup) return
          const pIdx = chart.data.datasets.findIndex((d: any) => d.yAxisID === 'yPickup')
          if (pIdx === -1) return
          const meta = chart.getDatasetMeta(pIdx)
          if (!meta?.data) return
          pickupData.forEach((val: number, i: number) => {
            if (!val || !meta.data[i]) return
            const xPos = meta.data[i].x
            const yTop = yPickup.getPixelForValue(val)
            ctx.save()
            ctx.fillStyle = val > 0 ? '#00E5A0' : '#E24B4A'
            ctx.font = 'bold 10px sans-serif'
            ctx.textAlign = 'center'
            if (val > 0) {
              ctx.textBaseline = 'bottom'
              ctx.fillText(`+${val}`, xPos, yTop - 3)
            } else {
              ctx.textBaseline = 'top'
              ctx.fillText(`${val}`, xPos, yTop + 3)
            }
            ctx.restore()
          })
        },
      }

      const pickupBaseline = {
        id: 'pickupBaseline',
        afterDraw(chart: any) {
          const { ctx, scales: { x, yPickup } } = chart
          if (!yPickup) return
          const y0 = yPickup.getPixelForValue(0)
          ctx.save()
          ctx.beginPath(); ctx.moveTo(x.left, y0); ctx.lineTo(x.right, y0)
          ctx.strokeStyle = 'rgba(0,229,160,0.4)'; ctx.lineWidth = 1
          ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([])
          ctx.restore()
        },
      }

      const lyTick = {
        id: 'lyTick',
        beforeDatasetsDraw(chart: any) {
          if (lyMode === 'none') return
          const { ctx, scales: { yOcc } } = chart
          const occIdx = chart.data.datasets.findIndex((d: any) => d.type === 'bar' && d.label === 'OCC%')
          if (occIdx === -1) return
          const meta = chart.getDatasetMeta(occIdx)
          if (!meta.data.length) return
          const color     = lyMode === 'day' ? 'rgba(245,158,11,0.9)'  : 'rgba(167,139,250,0.9)'
          const dashColor = lyMode === 'day' ? 'rgba(245,158,11,0.15)' : 'rgba(167,139,250,0.15)'
          const otbColor  = lyMode === 'day' ? 'rgba(245,158,11,0.65)' : 'rgba(167,139,250,0.65)'
          const todayMid = new Date(todayYear, todayMonth - 1, todayDate).getTime()
          meta.data.forEach((el: any, i: number) => {
            if (!el) return
            const bw = (el.width ?? 10) * 0.85 * 0.30
            const finalVal = lyOccData[i]
            const otbVal   = lyOtbData[i]
            const yFinal = finalVal != null ? yOcc.getPixelForValue(finalVal) : null
            const yOtb   = otbVal   != null ? yOcc.getPixelForValue(otbVal)   : null
            ctx.save()
            if (showLyOtb && yOtb != null) {
              ctx.beginPath()
              ctx.moveTo(el.x - bw / 2, yOtb)
              ctx.lineTo(el.x + bw / 2, yOtb)
              ctx.strokeStyle = otbColor
              ctx.lineWidth = 1
              ctx.lineCap = 'round'
              ctx.setLineDash([3, 3])
              ctx.stroke()
              ctx.setLineDash([])
            }
            if (showLyFinal && yFinal != null) {
              ctx.beginPath()
              ctx.moveTo(el.x - bw / 2, yFinal)
              ctx.lineTo(el.x + bw / 2, yFinal)
              ctx.strokeStyle = color
              ctx.lineWidth = 2
              ctx.setLineDash([])
              ctx.stroke()
            }
            const isPast = new Date(modalYear, modalMonth, i + 1).getTime() < todayMid
            if (showLyFinal && showLyOtb && yFinal != null && yOtb != null && !isPast) {
              ctx.beginPath()
              ctx.moveTo(el.x, yFinal)
              ctx.lineTo(el.x, yOtb)
              ctx.strokeStyle = dashColor
              ctx.lineWidth = 1
              ctx.setLineDash([2, 3])
              ctx.stroke()
              ctx.setLineDash([])
            }
            ctx.restore()
          })
        },
      }

      chartRef.current = new Chart(canvasRef.current, {
        plugins: [pickupBaseline, lyTick, occLabels, pickupLabels, eventPlugin],
        data: {
          labels,
          datasets: [
            {
              type: 'bar',
              label: 'OCC%',
              data: occData,
              backgroundColor: (ctx: any) => (isOtbMonth && daily[ctx.dataIndex]?.day === otbDay ? '#5B8DEF' : `rgba(180,180,180,${BAR_OPACITY})`),
              borderColor: (ctx: any) => (isOtbMonth && daily[ctx.dataIndex]?.day === otbDay ? '#5B8DEF' : `rgba(180,180,180,${Math.min(BAR_OPACITY + 0.05, 1)})`),
              borderWidth: 1,
              borderRadius: 2,
              yAxisID: 'yOcc',
              order: 2,
              barPercentage: 0.9,
              categoryPercentage: 0.9,
            },
            ...(showPickup ? [{
              type: 'bar',
              label: 'Pickup',
              data: pickupData,
              backgroundColor: pickupData.map((v: number) => (v > 0 ? 'rgba(0,229,160,0.9)' : v < 0 ? 'rgba(226,75,74,0.9)' : 'transparent')),
              borderColor: 'transparent',
              borderWidth: 0,
              borderRadius: 2,
              yAxisID: 'yPickup',
              order: 1,
              grouped: false,
              barPercentage: 0.25,
              categoryPercentage: 0.9,
            } as any] : []),
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 18, bottom: hasEvents ? 30 : 8 } },
          interaction: { mode: 'index', intersect: false },
          onClick: (_e: any, els: any[]) => {
            if (!els.length) return
            const i = els[0].index
            setSelectedDay(i + 1)
            setDayModalOpen(true)
          },
          onHover: (e: any, els: any[]) => {
            const cv = e?.native?.target as HTMLCanvasElement | undefined
            if (!cv) return
            cv.style.cursor = els.length ? 'pointer' : 'default'
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: false,
              external: (context: any) => {
                const { chart, tooltip } = context
                let el = document.getElementById('pick-detail-tooltip')
                if (!el) {
                  el = document.createElement('div')
                  el.id = 'pick-detail-tooltip'
                  el.style.cssText = 'position:fixed;background:#0a0a0a;border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 14px;pointer-events:none;font-size:12px;min-width:180px;box-shadow:0 4px 16px rgba(0,0,0,0.5);z-index:99999;opacity:0;transition:opacity 0.1s;'
                  document.body.appendChild(el)
                }
                if (tooltip.opacity === 0) { el.style.opacity = '0'; return }
                const i = tooltip.dataPoints?.[0]?.dataIndex
                if (i == null) { el.style.opacity = '0'; return }
                const segs      = (pickupBySegment[i] ?? []).filter(s => s.rn !== 0)
                const total     = dayTotal(i)
                const otbOccVal = occData[i]
                const lyOccVal  = lyOccData[i]
                const hasPickup = total !== 0
                const hasLy     = lyMode !== 'none' && lyOccVal != null
                if (!hasPickup && !hasLy) { el.style.opacity = '0'; return }
                const d = daily[i]
                const title = d ? `${modalMonth + 1}월 ${d.day}일 (${DOW_KR[d.dow]})` : ''
                let pickupSection = ''
                if (hasPickup) {
                  const rows = segs.map(s =>
                    `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:3px 0;font-size:11px;"><span style="color:rgba(255,255,255,0.6);display:flex;align-items:center;gap:5px;"><span style="width:7px;height:7px;border-radius:2px;background:${s.color};flex-shrink:0;display:inline-block;"></span>${s.segName}</span><span style="font-weight:500;font-variant-numeric:tabular-nums;color:${s.rn < 0 ? '#E24B4A' : 'rgba(255,255,255,0.6)'};">${s.rn > 0 ? '+' : ''}${s.rn}</span></div>`
                  ).join('')
                  const tColor = total < 0 ? '#E24B4A' : '#00E5A0'
                  pickupSection = `<div style="font-size:10px;color:#555;letter-spacing:0.5px;margin-bottom:5px;">Pick-up</div>${rows}<div style="border-top:0.5px solid rgba(255,255,255,0.08);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-size:11px;font-weight:600;"><span style="color:rgba(255,255,255,0.5);">Total</span><span style="color:${tColor};">${total >= 0 ? '+' : ''}${total}</span></div>`
                }
                let occSection = ''
                const showOcc = otbOccVal != null || hasLy
                if (showOcc) {
                  let occRows = ''
                  if (otbOccVal != null) {
                    occRows += `<div style="display:flex;justify-content:space-between;gap:24px;margin:3px 0;padding-left:8px;font-size:11px;"><span style="color:#888;">OTB OCC</span><span style="color:#aaa;">${otbOccVal}%</span></div>`
                  }
                  if (hasLy) {
                    const lyLabel = lyMode === 'day' ? 'Same Day LY' : 'Same Period LY'
                    const lyColor = lyMode === 'day' ? '#F59E0B' : '#A78BFA'
                    occRows += `<div style="display:flex;justify-content:space-between;gap:24px;margin:3px 0;padding-left:8px;font-size:11px;"><span style="color:#888;">${lyLabel}</span><span style="color:${lyColor};">${lyOccVal}%</span></div>`
                  }
                  const occWrap = hasPickup ? 'border-top:0.5px solid rgba(255,255,255,0.08);margin-top:8px;padding-top:8px;' : ''
                  occSection = `<div style="${occWrap}"><div style="font-size:10px;color:#555;letter-spacing:0.5px;margin-bottom:5px;">점유율</div>${occRows}</div>`
                }
                el.innerHTML = `<div style="font-size:12px;font-weight:500;color:#fff;margin-bottom:8px;border-bottom:0.5px solid rgba(255,255,255,0.08);padding-bottom:6px;">${title}</div>${pickupSection}${occSection}`
                const rect = chart.canvas.getBoundingClientRect()
                const x = rect.left + tooltip.caretX + 14
                const y = rect.top + tooltip.caretY - 20
                const tw = el.offsetWidth || 200
                const th = el.offsetHeight || 140
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
              position: 'left', min: 0, max: 110,
              grid: { display: false },
              border: { display: false },
              ticks: { color: '#444', font: { size: 10 }, callback: (v: any) => (v <= 100 ? `${v}%` : '') },
            },
            yPickup: {
              position: 'right', min: -rcMax, max: rcMax,
              grid: { display: false },
              border: { display: false },
              ticks: { display: false },
            },
          },
        },
      })
    })()
    return () => {
      cancelled = true
      chartRef.current?.destroy(); chartRef.current = null
      document.getElementById('pick-detail-tooltip')?.remove()
    }
  }, [daily, modalMonth, eventMap, pickupBySegment, lyMode, lyOccData, lyOtbData, showPickup, showLyFinal, showLyOtb])

  useEffect(() => { showOccLabelRef.current = showOccLabel; chartRef.current?.update('none') }, [showOccLabel])
  useEffect(() => () => { document.getElementById('pick-detail-tooltip')?.remove() }, [])

  // 토글 스위치 스타일 (inline)
  const trackStyle = (on: boolean, onColor: string, offColor: string): React.CSSProperties => ({
    position: 'relative', display: 'inline-block', width: 36, height: 20, borderRadius: 20,
    background: on ? onColor : offColor, border: `1px solid ${on ? onColor : offColor}`,
    cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
  })
  const thumbStyle = (on: boolean): React.CSSProperties => ({
    position: 'absolute', width: 14, height: 14, top: 2, left: on ? 20 : 2,
    borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
  })

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#111', borderRadius: 10, padding: '14px 16px', boxSizing: 'border-box' }}>
      {/* 토글 행 + 투명도 슬라이더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
        {/* 전년 + 동기간/동일자 세트 */}
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
          <div style={trackStyle(showLyFinal, '#a78bfa', '#2a2a2a')} onClick={() => setShowLyFinal(p => !p)}>
            <div style={thumbStyle(showLyFinal)} />
          </div>
          <span style={{ fontSize: 11, color: '#666' }}>전년마감</span>
        </div>
        {/* 전년OTB */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={trackStyle(showLyOtb, '#a78bfa', '#2a2a2a')} onClick={() => setShowLyOtb(p => !p)}>
            <div style={thumbStyle(showLyOtb)} />
          </div>
          <span style={{ fontSize: 11, color: '#666' }}>전년OTB</span>
        </div>
        {/* 픽업 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={trackStyle(showPickup, '#00E5A0', '#2a2a2a')} onClick={() => setShowPickup(p => !p)}>
            <div style={thumbStyle(showPickup)} />
          </div>
          <span style={{ fontSize: 11, color: '#666' }}>픽업</span>
        </div>
        {/* OCC% */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={trackStyle(showOccLabel, '#5B8DEF', '#2a2a2a')} onClick={() => setShowOccLabel(p => !p)}>
            <div style={thumbStyle(showOccLabel)} />
          </div>
          <span style={{ fontSize: 11, color: '#666' }}>OCC%</span>
        </div>
      </div>

      {/* 차트 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <canvas ref={canvasRef} />
      </div>

      {/* 하단 범례 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, flexWrap: 'wrap', marginTop: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 10, background: 'rgba(75,75,85,0.85)', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: '#888' }}>OTB OCC</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 10, background: '#00E5A0', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: '#888' }}>Pickup (+)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 10, background: '#E24B4A', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: '#888' }}>Pickup (−)</span>
        </div>
        {lyOn && showLyFinal && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 20, height: 0, borderTop: `2.5px solid ${lyMode === 'day' ? 'rgba(245,158,11,0.95)' : 'rgba(167,139,250,0.95)'}`, borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#888' }}>전년마감</span>
          </div>
        )}
        {lyOn && showLyOtb && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 20, height: 0, borderTop: `1px dashed ${lyMode === 'day' ? 'rgba(245,158,11,0.7)' : 'rgba(167,139,250,0.7)'}` }} />
            <span style={{ fontSize: 11, color: '#888' }}>전년OTB</span>
          </div>
        )}
      </div>

      {/* 막대 클릭 → 일자별 픽업 상세 모달 */}
      <MarketPickupDayModal
        open={dayModalOpen && selectedDay != null}
        onClose={() => { setDayModalOpen(false); setSelectedDay(null) }}
        year={modalYear}
        month={modalMonth}
        day={selectedDay ?? 1}
        schema={schema}
        pickupRows={pickupRows}
        roomCount={roomCount}
        defaultTab="pickup"
        otbDate={otbDate}
        vsDate={vsOtbDate}
        otbDates={[]}
        onDateChange={() => {}}
      />
    </div>
  )
}
