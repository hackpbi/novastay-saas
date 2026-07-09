'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import DatePicker from '@/components/DatePicker'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { PickupMonthSummaryModal } from '@/components/market-pickup/PickupMonthSummaryModal'
import MarketPickupDayModal from '@/components/market-pickup/MarketPickupDayModal'
import type { PickupRow } from '@/hooks/usePickupData'
import { fmtK, fmtM } from '@/utils/pickupPageUtils'

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LY_EMPTY: (number | null)[] = []   // 전년 OCC 비활성 시 안정적 참조용 빈 배열

export default function PickupChartModal({
  open, onClose, year, month, pickupRows, roomCount,
  otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate,
}: {
  open:         boolean
  onClose:      () => void
  year:         number
  month:        number   // 0-based (모달 진입 시 초기 월)
  pickupRows:   PickupRow[]
  roomCount:    number
  otbDate:      string
  vsOtbDate:    string
  otbDates:     string[]
  setOtbDate:   (v: string) => void
  setVsOtbDate: (v: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''
  // 전년 토글: lyOn(전년 ON/OFF) + lyPeriod(동기간/동일자) → lyMode 파생
  const [lyOn,        setLyOn]        = useState(true)
  const [lyPeriod,    setLyPeriod]    = useState(true)   // true=동기간(period), false=동일자(day)
  const [showLyFinal, setShowLyFinal] = useState(true)   // 전년마감 실선
  const [showLyOtb,   setShowLyOtb]   = useState(false)  // 전년OTB 점선
  const [showPickup,  setShowPickup]  = useState(true)   // 픽업 바/라벨
  const lyMode: 'none' | 'day' | 'period' = !lyOn ? 'none' : (lyPeriod ? 'period' : 'day')
  const { data: schema = [] } = useMarketSchema()
  const [summaryModalOpen, setSummaryModalOpen] = useState(false)
  const [showOccLabel, setShowOccLabel] = useState(true)
  const showOccLabelRef = useRef(showOccLabel)   // 플러그인이 라이브 값 참조 (토글 시 재생성 없이 update)
  const [occOpacity, setOccOpacity] = useState(0.05)          // OCC 바 투명도 (기본 5%)
  const occOpacityRef = useRef(0.05)                          // 차트 재생성 시 최신값 참조
  const [occLabelOpacity, setOccLabelOpacity] = useState(0.40) // OCC 숫자 투명도 (기본 40%)
  const occLabelOpacityRef = useRef(occLabelOpacity)          // 플러그인 라이브 참조
  const [selectedDay,  setSelectedDay]  = useState<number | null>(null)   // 막대 클릭 → Day 모달 (1-based)
  const [dayModalOpen, setDayModalOpen] = useState(false)

  // ── 모달 내부 월 상태 (진입 시 클릭한 카드 월로 초기화) ───────────────────────────
  const [modalYear,  setModalYear]  = useState(year)
  const [modalMonth, setModalMonth] = useState(month)
  useEffect(() => {
    if (open) { setModalYear(year); setModalMonth(month) }
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

  // ── 선택 월의 일자별 픽업 R/N + 배너 집계 (카드 로직과 동일) ───────────────────────
  const { daily, totalPuRn, totalPuRev, totalPuAdr } = useMemo(() => {
    const month1 = modalMonth + 1
    const days   = new Date(modalYear, month1, 0).getDate()
    const pm = (pickupRows ?? []).filter(r => {
      const d = new Date(r.business_date)
      return d.getFullYear() === modalYear && d.getMonth() === modalMonth
    })
    let otbN = 0, otbR = 0, vsN = 0, vsR = 0, puN = 0, puR = 0
    const puByDate  = new Map<string, number>()
    const otbByDate = new Map<string, number>()
    for (const r of pm) {
      if (r.segmentation !== 'HOU') {
        otbN += r.otb_nights ?? 0; vsN += r.vs_otb_nights ?? 0; puN += r.pu_nights ?? 0
        puByDate.set(r.business_date, (puByDate.get(r.business_date) ?? 0) + (r.pu_nights ?? 0))
        otbByDate.set(r.business_date, (otbByDate.get(r.business_date) ?? 0) + (r.otb_nights ?? 0))
      }
      otbR += r.otb_revenue ?? 0; vsR += r.vs_otb_revenue ?? 0; puR += r.pu_revenue ?? 0
    }
    const arr: { day: number; dow: number; isWeekend: boolean; puNights: number; occ: number }[] = []
    for (let day = 1; day <= days; day++) {
      const dateStr = `${modalYear}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dow = new Date(modalYear, modalMonth, day).getDay()
      const occ = roomCount > 0 ? Math.round((otbByDate.get(dateStr) ?? 0) / roomCount * 100) : 0
      arr.push({ day, dow, isWeekend: dow === 0 || dow === 6, puNights: puByDate.get(dateStr) ?? 0, occ })
    }
    const otbAdr = otbN > 0 ? otbR / otbN : 0
    const vsAdr  = vsN > 0 ? vsR / vsN : 0
    return { daily: arr, totalPuRn: puN, totalPuRev: puR, totalPuAdr: otbAdr - vsAdr }
  }, [pickupRows, modalYear, modalMonth, roomCount])

  const pickupDays = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0

  // ── 이벤트 (c06_calendar) — 막대 하단 표시용 ───────────────────────────────────
  const { data: events = [] } = useQuery<{ date: string; event: string }[]>({
    queryKey: ['pickup-chart-events', modalYear, modalMonth],
    enabled: open,
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

  // 일자별 세그먼트 픽업 R/N — pickupRows에서 직접 집계 (index 0-based → [{segName, rn}])
  // MonthBlock과 동일 소스(main 직속 자식 세그의 segmentation 코드)로 묶어 전 일자 커버, 바와 동일하게 HOU 제외
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

  // ── 전년(LY) OCC 오버레이 — c06 yoy_match + a01_actual_daily (DailyStatusPage 컨벤션) ──
  const lyPad = (n: number) => String(n).padStart(2, '0')
  const lyLastDay = new Date(modalYear, modalMonth + 1, 0).getDate()
  // 전년동기간(period)일 때만 c06 yoy_match 조회
  const { data: lyCalRows = [] } = useQuery({
    queryKey: ['pc-ly-cal', modalYear, modalMonth],
    enabled: open && lyMode === 'period',
    queryFn: async () => {
      const start = `${modalYear}-${lyPad(modalMonth + 1)}-01`
      const end   = `${modalYear}-${lyPad(modalMonth + 1)}-${lyPad(lyLastDay)}`
      const { data } = await (supabase as any)
        .from('c06_calendar').select('date, yoy_match').gte('date', start).lte('date', end)
      return (data ?? []) as { date: string; yoy_match: string | null }[]
    },
  })
  // 일자(1..lastDay) → 전년 매핑 날짜: period=yoy_match(없으면 -1년 fallback), day=단순 -1년
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
  // 전년 OCC(%) — a01_actual_daily nights / roomCount, 일자 인덱스(0-based) 정렬
  const { data: lyOccArr } = useQuery({
    queryKey: ['pc-ly-occ', hotelId, modalYear, modalMonth, lyMode, lyDateByDay.join(',')],
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
  const lyOccData = lyOccArr ?? LY_EMPTY   // 비활성 시 안정적 참조 유지 (차트 useEffect 불필요 재생성 방지)
  // ── 전년 OTB(%) — get_ly_pacing_data(.ly_nights) / roomCount (작년 OTB pacing, day=v1 / period=v2) ──
  const { data: lyOtbArr } = useQuery({
    queryKey: ['pc-ly-otb', hotelId, otbDate, modalYear, modalMonth, lyMode],
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
  const lyOtbData = lyOtbArr ?? LY_EMPTY

  // ESC + scroll lock
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // ── 차트 (픽업 R/N 막대만) ────────────────────────────────────────────────────
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
      const pickupData = daily.map(d => d.puNights)
      const hasEvents = Object.keys(eventMap).length > 0
      const rcMax = roomCount > 0 ? roomCount : 100   // yPickup 범위 = ±객실수 (픽업 절대 안 잘림)

      // 오늘 기준 (과거/오늘/미래 분기 + 오늘 마커)
      const today = new Date()
      const todayYear = today.getFullYear()
      const todayMonth = today.getMonth() + 1   // 1-based
      const todayDate = today.getDate()
      const curY = modalYear, curM = modalMonth + 1   // 1-based
      const isTodayMonth = curY === todayYear && curM === todayMonth
      // 일자(0-based index)별 픽업 R/N 합 — 툴팁/호버/클릭 0 판정
      const dayTotal = (i: number) => (pickupBySegment[i] ?? []).reduce((s, r) => s + r.rn, 0)

      // x축 라벨(일자+요일) 아래에 이벤트 원(연한 민트 배경 + 민트 테두리) + 2글자
      const eventPlugin = {
        id: 'eventLabels',
        afterDraw(chart: any) {
          const x = chart.scales.x
          const { ctx } = chart
          // 실제 그려진 라벨 최하단을 측정 → 그 아래에 도트 (콘솔 없이 자가 측정)
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
          const yCenter = labelBottom + 6 + 9   // 요일 아래 gap(6) + 반지름(9)
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

      // OCC% 숫자 — 전부 회색 (투명도 슬라이더 연동)
      const occLabels = {
        id: 'occLabels',
        afterDatasetsDraw(chart: any) {
          if (!showOccLabelRef.current) return
          const { ctx, scales: { x, yOcc } } = chart
          occData.forEach((val: number, i: number) => {
            if (val == null || val === 0) return   // 0%는 차트 바닥(x축 위)에 그려져 일자와 겹치므로 제외
            const xPos = x.getPixelForValue(i)
            const yPos = yOcc.getPixelForValue(val)
            ctx.save()
            ctx.fillStyle = `rgba(160,160,160,${occLabelOpacityRef.current})`
            ctx.font = '9px sans-serif'
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
            ctx.fillText(`${val}%`, xPos, yPos - 3)
            ctx.restore()
          })
        },
      }

      // 픽업 R/N — 픽업 바(dataset 1) 세로 중앙에 표시
      const pickupLabels = {
        id: 'pickupLabels',
        afterDatasetsDraw(chart: any) {
          if (!showPickup) return
          const { ctx, scales } = chart
          const yPickup = scales.yPickup
          if (!yPickup) return
          // 픽업 dataset을 yAxisID로 탐색 (LY 오버레이 유무에 따라 index가 바뀌므로 고정 index 금지)
          const pIdx = chart.data.datasets.findIndex((d: any) => d.yAxisID === 'yPickup')
          if (pIdx === -1) return
          const meta = chart.getDatasetMeta(pIdx)
          if (!meta?.data) return
          pickupData.forEach((val: number, i: number) => {
            if (!val || !meta.data[i]) return
            const xPos = meta.data[i].x
            const yTop = yPickup.getPixelForValue(val)   // yPickup 축 기준 → LY 면적 영향 없음
            ctx.save()
            ctx.fillStyle = val > 0 ? '#00E5A0' : '#E24B4A'
            ctx.font = 'bold 10px sans-serif'
            ctx.textAlign = 'center'
            if (val > 0) {
              ctx.textBaseline = 'bottom'
              ctx.fillText(`+${val}`, xPos, yTop - 3)                          // 양수: 바 상단 위
            } else {
              ctx.textBaseline = 'top'
              ctx.fillText(`${val}`, xPos, yTop + 3)                           // 음수: 바 하단 아래
            }
            ctx.restore()
          })
        },
      }

      // 픽업 0 기준선 (흰색 점선, yPickup=0)
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

      // 전년(LY) OCC 틱 마크 — OCC 막대 뒤(beforeDatasetsDraw)에 가로선, lyMode 색상
      const lyTick = {
        id: 'lyTick',
        beforeDatasetsDraw(chart: any) {
          if (lyMode === 'none') return
          const { ctx, scales: { yOcc } } = chart
          const occIdx = chart.data.datasets.findIndex((d: any) => d.type === 'bar' && d.label === 'OCC%')
          if (occIdx === -1) return
          const meta = chart.getDatasetMeta(occIdx)   // OCC 막대 meta (x/width 기준)
          if (!meta.data.length) return
          const color     = lyMode === 'day' ? 'rgba(245,158,11,0.9)'  : 'rgba(167,139,250,0.9)'   // 전년마감 실선 (황금/보라)
          const dashColor = lyMode === 'day' ? 'rgba(245,158,11,0.15)' : 'rgba(167,139,250,0.15)'  // 수직 연결 점선(투명)
          const otbColor  = lyMode === 'day' ? 'rgba(245,158,11,0.65)' : 'rgba(167,139,250,0.65)'  // 전년OTB 점선 가로선
          const todayMid = new Date(todayYear, todayMonth - 1, todayDate).getTime()   // 오늘 자정(로컬)
          meta.data.forEach((el: any, i: number) => {
            if (!el) return
            const bw = (el.width ?? 10) * 0.85 * 0.30   // 기존 길이의 30% (70% 축소), 중앙 정렬 유지
            const finalVal = lyOccData[i]
            const otbVal   = lyOtbData[i]
            const yFinal = finalVal != null ? yOcc.getPixelForValue(finalVal) : null
            const yOtb   = otbVal   != null ? yOcc.getPixelForValue(otbVal)   : null
            ctx.save()
            // 1) 전년OTB 점선 가로선 (showLyOtb + 값 있을 때만)
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
            // 2) 전년마감 실선 가로선 (showLyFinal + 값 있을 때만)
            if (showLyFinal && yFinal != null) {
              ctx.beginPath()
              ctx.moveTo(el.x - bw / 2, yFinal)
              ctx.lineTo(el.x + bw / 2, yFinal)
              ctx.strokeStyle = color
              ctx.lineWidth = 2
              ctx.setLineDash([])
              ctx.stroke()
            }
            // 3) 세로 점선: 전년OTB ↔ 전년마감 (둘 다 표시 + 값 있음 + 오늘 이후 일자만)
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
              backgroundColor: () => `rgba(180,180,180,${occOpacityRef.current})`,
              borderColor: () => `rgba(180,180,180,${Math.min(occOpacityRef.current + 0.05, 1)})`,
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
              grouped: false,            // OCC 바와 나란히 두지 않고 중앙에 겹치기
              barPercentage: 0.25,
              categoryPercentage: 0.9,
            } as any] : []),
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 18, bottom: hasEvents ? 30 : 8 } },   // 픽업 라벨 위 / 이벤트 원(라벨 실측 아래) 최소 공간
          interaction: { mode: 'index', intersect: false },
          // 막대 클릭 → 해당 일자 Day 모달 / hover 시 포인터
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
              // body append + position:fixed HTML 툴팁 (모달 경계 잘림 방지)
              external: (context: any) => {
                const { chart, tooltip } = context
                let el = document.getElementById('pickup-chart-tooltip')
                if (!el) {
                  el = document.createElement('div')
                  el.id = 'pickup-chart-tooltip'
                  el.style.cssText = 'position:fixed;background:#0a0a0a;border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 14px;pointer-events:none;font-size:12px;min-width:180px;box-shadow:0 4px 16px rgba(0,0,0,0.5);z-index:99999;opacity:0;transition:opacity 0.1s;'
                  document.body.appendChild(el)
                }
                if (tooltip.opacity === 0) { el.style.opacity = '0'; return }
                const i = tooltip.dataPoints?.[0]?.dataIndex
                if (i == null) { el.style.opacity = '0'; return }
                const segs      = (pickupBySegment[i] ?? []).filter(s => s.rn !== 0)
                const total     = dayTotal(i)
                const otbOccVal = occData[i]        // OTB OCC%
                const lyOccVal  = lyOccData[i]      // LY OCC%
                const hasPickup = total !== 0
                const hasLy     = lyMode !== 'none' && lyOccVal != null
                if (!hasPickup && !hasLy) { el.style.opacity = '0'; return }   // 픽업 0 + LY OFF → 숨김
                const d = daily[i]
                const title = d ? `${modalMonth + 1}월 ${d.day}일 (${DOW_KR[d.dow]})` : ''

                // Pick-up 섹션 (픽업 있을 때만)
                let pickupSection = ''
                if (hasPickup) {
                  const rows = segs.map(s =>
                    `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:3px 0;font-size:11px;"><span style="color:rgba(255,255,255,0.6);display:flex;align-items:center;gap:5px;"><span style="width:7px;height:7px;border-radius:2px;background:${s.color};flex-shrink:0;display:inline-block;"></span>${s.segName}</span><span style="font-weight:500;font-variant-numeric:tabular-nums;color:${s.rn < 0 ? '#E24B4A' : 'rgba(255,255,255,0.6)'};">${s.rn > 0 ? '+' : ''}${s.rn}</span></div>`
                  ).join('')
                  const tColor = total < 0 ? '#E24B4A' : '#00E5A0'
                  pickupSection = `<div style="font-size:10px;color:#555;letter-spacing:0.5px;margin-bottom:5px;">Pick-up</div>${rows}<div style="border-top:0.5px solid rgba(255,255,255,0.08);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-size:11px;font-weight:600;"><span style="color:rgba(255,255,255,0.5);">Total</span><span style="color:${tColor};">${total >= 0 ? '+' : ''}${total}</span></div>`
                }

                // 점유율 섹션 (OTB OCC 항상 + LY OCC)
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
                const finalX = x + tw > window.innerWidth - 16 ? x - tw - 24 : x   // 우측 잘림 → 좌측 반전
                const finalY = y < 8 ? 8 : (y + th > window.innerHeight - 8 ? window.innerHeight - th - 8 : y)   // 상/하 경계 보정
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
                // 오늘 파랑 / 금(5)·토(6) 빨강 / 기본 회색
                color: (c: any) => {
                  const day = c.index + 1
                  if (isTodayMonth && day === todayDate) return '#5B8DEF'
                  const dow = daily[c.index]?.dow
                  return dow === 5 || dow === 6 ? '#E24B4A' : '#888'
                },
                font: { size: 10 },
                maxRotation: 0,
                padding: 6,
                // 숫자 + 영문 요일 2줄 표시
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
      document.getElementById('pickup-chart-tooltip')?.remove()   // 닫기/월이동 시 잔존 툴팁 제거
    }
  }, [open, daily, modalMonth, eventMap, pickupBySegment, lyMode, lyOccData, lyOtbData, showPickup, showLyFinal, showLyOtb])

  // OCC% 토글 → 차트 라벨만 갱신 (재생성 없이)
  useEffect(() => { showOccLabelRef.current = showOccLabel; chartRef.current?.update('none') }, [showOccLabel])

  // 언마운트 시 툴팁 DOM 제거
  useEffect(() => () => { document.getElementById('pickup-chart-tooltip')?.remove() }, [])

  if (!open) return null

  const mintVal: React.CSSProperties = { color: '#00E5A0', fontWeight: 500, borderBottom: '1px dashed #00E5A0', paddingBottom: 1, cursor: 'pointer' }

  // 토글 스위치 스타일 (inline, 새 컴포넌트 없이)
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="relative rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)', width: '85vw', maxWidth: '85vw', height: '81vh', maxHeight: '81vh' }}
      >
        {/* 헤더 — 제목 + 닫기 (구분선 없음, 요약문이 바로 아래) */}
        <div className="flex items-center justify-between px-5 pt-3.5 pb-0.5 shrink-0">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Daily Pick-Up</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            {/* 구분선 */}
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
            {/* OCC% (기존 showOccLabel 연동) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={trackStyle(showOccLabel, '#5B8DEF', '#2a2a2a')} onClick={() => setShowOccLabel(p => !p)}>
                <div style={thumbStyle(showOccLabel)} />
              </div>
              <span style={{ fontSize: 11, color: '#666' }}>OCC%</span>
            </div>
            <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 요약문 + Bar/Label 슬라이더 (같은 행) — 타이틀 바로 아래, 네비 위 (구분선은 아래) */}
        <div className="px-5 pt-0 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8, margin: 0 }}>
            <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
              <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} availableDates={otbDates ?? []} accent bare fontPx={13} plain />
            </span>
            {' '}
            <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
              <DatePicker label="vs" value={vsOtbDate} onChange={setVsOtbDate} availableDates={(otbDates ?? []).filter(d => d < otbDate)} accent bare fontPx={13} plain />
            </span>
            {' '}{pickupDays === 0 ? '0-day' : `${pickupDays}-day`} pickup for {MONTH_NAMES[modalMonth]}:{' '}
            <span onClick={() => setSummaryModalOpen(true)} style={mintVal}>{totalPuRn >= 0 ? '+' : ''}{totalPuRn.toLocaleString('ko-KR')} R/N</span>
            , ADR <span onClick={() => setSummaryModalOpen(true)} style={mintVal}>{totalPuAdr >= 0 ? '+' : ''}{fmtK(totalPuAdr)}</span>
            , REV <span onClick={() => setSummaryModalOpen(true)} style={mintVal}>{totalPuRev >= 0 ? '+' : ''}{fmtM(totalPuRev)}</span>
          </p>
          {/* OCC 바 / 숫자 투명도 슬라이더 (헤더에서 이동) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1a1a1a', borderRadius: 8, padding: '4px 10px', border: '1px solid #2a2a2a', flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>Bar</span>
            <input
              type="range" min={0} max={50} step={1}
              value={Math.round(occOpacity * 100)}
              onChange={e => {
                const val = Number(e.target.value) / 100
                setOccOpacity(val); occOpacityRef.current = val
                chartRef.current?.update('none')   // scriptable backgroundColor가 ref를 다시 읽음
              }}
              style={{ width: 60, accentColor: '#00E5A0', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 10, color: '#00E5A0', minWidth: 24 }}>{Math.round(occOpacity * 100)}%</span>
            <div style={{ width: 1, height: 14, background: '#2a2a2a' }} />
            <span style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>Label</span>
            <input
              type="range" min={0} max={100} step={1}
              value={Math.round(occLabelOpacity * 100)}
              onChange={e => {
                const val = Number(e.target.value) / 100
                setOccLabelOpacity(val); occLabelOpacityRef.current = val
                chartRef.current?.update('none')
              }}
              style={{ width: 60, accentColor: '#00E5A0', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 10, color: '#00E5A0', minWidth: 24 }}>{Math.round(occLabelOpacity * 100)}%</span>
          </div>
        </div>

        {/* 월 변경 — 배너 아래, 가운데 정렬 */}
        <div className="px-5 pb-2 shrink-0" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <button
            onClick={handlePrev}
            disabled={isMinMonth}
            aria-label="이전 달"
            className="flex items-center justify-center p-1.5 rounded-lg text-brand-muted hover:text-brand-text disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
            style={{ border: 'none', background: 'transparent' }}
          >
            <ChevronLeft size={15} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 100, textAlign: 'center' }}>
            {MONTH_NAMES[modalMonth]} {modalYear}
          </span>
          <button
            onClick={handleNext}
            aria-label="다음 달"
            className="flex items-center justify-center p-1.5 rounded-lg text-brand-muted hover:text-brand-text transition-all duration-150"
            style={{ border: 'none', background: 'transparent' }}
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {/* 차트 */}
        <div className="px-4 pb-4 pt-1" style={{ flex: 1, minHeight: 0 }}>
          <canvas ref={canvasRef} />
        </div>

        {/* 차트 하단 범례 (이벤트 도트 행 아래) */}
        <div className="px-4 pb-3 shrink-0" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
          {/* OTB OCC */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 10, background: 'rgba(75,75,85,0.85)', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#888' }}>OTB OCC</span>
          </div>
          {/* Pickup + */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 10, background: '#00E5A0', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#888' }}>Pickup (+)</span>
          </div>
          {/* Pickup - */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 10, background: '#E24B4A', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#888' }}>Pickup (−)</span>
          </div>
          {/* 전년마감 (실선) — 전년 ON + showLyFinal */}
          {lyOn && showLyFinal && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 0, borderTop: `2.5px solid ${lyMode === 'day' ? 'rgba(245,158,11,0.95)' : 'rgba(167,139,250,0.95)'}`, borderRadius: 2 }} />
              <span style={{ fontSize: 11, color: '#888' }}>전년마감</span>
            </div>
          )}
          {/* 전년OTB (점선) — 전년 ON + showLyOtb */}
          {lyOn && showLyOtb && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 0, borderTop: `1px dashed ${lyMode === 'day' ? 'rgba(245,158,11,0.7)' : 'rgba(167,139,250,0.7)'}` }} />
              <span style={{ fontSize: 11, color: '#888' }}>전년OTB</span>
            </div>
          )}
        </div>
      </div>

      {/* 요약 수치 클릭 → 월별 픽업 요약 모달 */}
      <PickupMonthSummaryModal
        open={summaryModalOpen}
        onClose={() => setSummaryModalOpen(false)}
        year={modalYear}
        month={modalMonth}
        schema={schema}
        pickupRows={pickupRows}
        roomCount={roomCount}
        otbDate={otbDate}
        vsDate={vsOtbDate}
        otbDates={otbDates ?? []}
        onDateChange={(o, v) => { setOtbDate(o); setVsOtbDate(v) }}
      />

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
        otbDates={otbDates ?? []}
        onDateChange={(o, v) => { setOtbDate(o); setVsOtbDate(v) }}
      />
    </div>
  )
}
