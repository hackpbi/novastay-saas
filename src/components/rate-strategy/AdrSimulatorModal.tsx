'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, RotateCcw, Save, Columns3 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { fetchBaselineForecast } from '@/lib/forecast/baseline'
import { fetchForecastSchema } from '@/lib/forecast/schema'
import { saveForecastEdits, type SaveEdit } from '@/lib/forecast/save'
import type { SchemaNode, ForecastRpcRow } from '@/lib/forecast/types'

// c05 계층(SchemaNode 트리) → 편집 패널 렌더 행 (대분류/중분류 헤더 + 소분류 코드별 편집행)
type FcstEditRow =
  | { kind: 'main'; name: string }
  | { kind: 'mid';  name: string }
  | { kind: 'sub';  name: string; code: string }

function buildFcstEditRows(nodes: SchemaNode[]): FcstEditRow[] {
  const out: FcstEditRow[] = []
  for (const main of nodes) {
    out.push({ kind: 'main', name: main.name })
    if (main.children.length === 0) {
      for (const code of main.segmentationCodes) out.push({ kind: 'sub', name: main.name, code })
      continue
    }
    for (const child of main.children) {
      if (child.children.length > 0) {
        out.push({ kind: 'mid', name: child.name })
        for (const sub of child.children) {
          for (const code of sub.segmentationCodes) out.push({ kind: 'sub', name: sub.name, code })
        }
      } else {
        for (const code of child.segmentationCodes) out.push({ kind: 'sub', name: child.name, code })
      }
    }
  }
  return out
}

interface RoomTypeLite {
  room_type_code:        string
  room_type_description?: string | null
  no_rooms?:             number | null
  surcharge?:            number | null
}

// get_adr_simulator_data RPC 반환
interface AdrSimRoom {
  room_type_code: string
  room_type_name: string
  surcharge:      number
  total_rooms:    number
  booked:         number
  avail:          number
}
// get_adr_simulator_data RPC forecast 필드 (null이면 Forecast 미설정)
interface AdrSimForecast {
  update_date: string
  rn:          number
  adr:         number   // 원 단위
  revenue:     number   // 원 단위
}
interface AdrSimData {
  total_rooms:   number
  base_bar_rate: number
  otb_date:      string
  rooms:         AdrSimRoom[]
  forecast?:     AdrSimForecast | null
}

// 내부 정규화 Forecast (occ는 rn/total로 계산)
interface Fcst { occ: number; rn: number; adr: number; rev: number }

interface AdrSimulatorModalProps {
  isOpen:         boolean
  onClose:        () => void
  date:           string
  onDateChange:   (d: string) => void
  totalRooms:     number
  roomTypes:      RoomTypeLite[]
  baseBarRate:    number   // BASE new_rate (원) — 해당 날짜
  booked:         number   // 임시: 해당 날짜 총 예약 객실수
  fcstUpdateDate?: string | null   // FCST picker 날짜 (YYYY-MM-DD)
}

// ── NovaStay 테마 (src/index.css CSS 변수 — 라이트/다크 자동 대응) ──
const MINT     = 'var(--color-accent-primary)'
const RED      = 'var(--color-negative)'
const PURPLE   = 'var(--color-ns-purple)'
const WARN     = 'var(--color-warning)'
const POS      = 'var(--color-positive)'
const TXT      = 'var(--color-text-primary)'
const TXT2     = 'var(--color-text-secondary)'
const TXT3     = 'var(--color-text-muted)'
const BG_BODY  = 'var(--color-bg-secondary)'
const BG_CARD  = 'var(--color-bg-tertiary)'
const BG_INPUT = 'var(--color-bg-elevated)'
const BORDER   = 'var(--color-border-default)'
const BORDER_ACCENT = 'var(--color-border-accent)'
const SUCCESS_BG = 'var(--accent-badge-bg)'
const SUCCESS_BD = 'var(--accent-badge-border)'

export default function AdrSimulatorModal({
  isOpen, onClose, date, onDateChange, totalRooms, baseBarRate, booked, fcstUpdateDate,
}: AdrSimulatorModalProps) {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate } = useDateContext()   // 전역 OTB 기준일 (이전 날짜 이동 제한용)
  const queryClient = useQueryClient()

  const [barRaw,    setBarRaw]    = useState(baseBarRate)   // 원단위 저장 (표시는 K)
  const [otaPct,    setOtaPct]    = useState(60)
  const [otaFeePct, setOtaFeePct] = useState(13.5)
  const [showFcstPanel, setShowFcstPanel] = useState(false)
  const [showRoomPanel, setShowRoomPanel] = useState(false)
  const [editedFcst, setEditedFcst] = useState<Record<string, { rn: number; adr: number }>>({})
  const [fcstSaving, setFcstSaving] = useState(false)
  const [editCell, setEditCell] = useState<{ code: string; field: 'rn' | 'adr' } | null>(null)
  const [editMode, setEditMode] = useState<'fcst' | 'otb'>('fcst')   // 일괄 편집 모드
  const [selectedFields, setSelectedFields] = useState<('rn' | 'adr')[]>([])
  const [modeOpen, setModeOpen] = useState(false)   // 모드 커스텀 드롭다운
  const modeDropRef = useRef<HTMLDivElement>(null)
  const [checkedSegs,  setCheckedSegs]  = useState<string[]>([])   // 체크된 segCode
  const [sellOverride, setSellOverride] = useState<Record<string, number>>({})   // 객실타입별 예상판매 수동값
  const [showOtb, setShowOtb] = useState(false)   // Forecast 패널 OTB 컬럼 표시(기본 숨김)
  const [appliedSegs, setAppliedSegs] = useState<Record<string, boolean>>({})   // 세그별 예상 ADR '적용' → ✓ 피드백
  // 픽업 급증 — 요금 인상 추천
  const [pickupThreshold,   setPickupThreshold]   = useState(20)     // 픽업 증가 기준 %
  const [pickupMult,        setPickupMult]        = useState(0.5)    // 계수
  const [pickupCap,         setPickupCap]         = useState(30)     // 상한 %
  const [selectedPickupIdx, setSelectedPickupIdx] = useState<number | null>(null)
  const [pickupToast,       setPickupToast]       = useState<string | null>(null)
  const scrollBodyRef   = useRef<HTMLDivElement>(null)                       // 좌측 본문 스크롤 컨테이너
  const pendingRecBarRef = useRef<{ date: string; bar: number } | null>(null) // 픽업 추천 적용 → sim 로드 후 재적용용

  // get_adr_simulator_data — simDate(date)/FCST date 변경 시 재호출
  const { data: sim } = useQuery({
    queryKey: ['adr_simulator', hotelId, date, fcstUpdateDate],
    enabled: isOpen && !!hotelId && !!date,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_adr_simulator_data', {
        p_hotel_id:  hotelId,
        p_date:      date,
        p_fcst_date: fcstUpdateDate ?? null,
      })
      if (error) throw error
      // RPC가 RETURNS TABLE/SETOF면 배열로 옴 → 첫 행 언랩 (객체면 그대로)
      const raw = data
      const sim = Array.isArray(raw) ? raw[0] : raw
      return (sim ?? null) as AdrSimData | null
    },
  })

  // ── ② 왜 올려야 하나 — get_pickup_trend (30/14/7/1일전 픽업 추이). RPC 미존재 시 에러 격리 → null ──
  const { data: pickupTrend = null } = useQuery({
    queryKey: ['adr_pickup_trend', hotelId, date],
    enabled: isOpen && !!hotelId && !!date,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_pickup_trend', {
        p_hotel_id:  hotelId,
        p_stay_date: date,
      })
      if (error) throw error
      const raw = Array.isArray(data) ? data[0] : data
      return (raw ?? null) as {
        d30_rn: number; d14_rn: number; d7_rn: number; d1_rn: number
        d30_date: string; d14_date: string; d7_date: string; d1_date: string
      } | null
    },
  })

  // RPC 우선, 미로딩/없음 시 prop 폴백
  const effTotal  = sim?.total_rooms   ?? totalRooms
  const effBase   = sim?.base_bar_rate ?? baseBarRate
  const effRooms  = sim?.rooms ?? []
  const effBooked = effRooms.length ? effRooms.reduce((s, r) => s + (r.booked ?? 0), 0) : booked

  // ── Forecast 편집 패널 데이터 — 패널 열렸을 때만 로드 (검증된 calculate_baseline_forecast_v7) ──
  const { data: fcstRows = [] } = useQuery({
    queryKey: ['adr_fcst_segs', hotelId, date, fcstUpdateDate],
    enabled: isOpen && showFcstPanel && !!hotelId && !!date && !!fcstUpdateDate,
    queryFn: () => fetchBaselineForecast(hotelId!, date, date, undefined, fcstUpdateDate!),
  })
  const { data: fcstSchema } = useQuery({
    queryKey: ['adr_fcst_schema', hotelId],
    enabled: isOpen && !!hotelId,   // 예상 ADR 패널의 세그먼트명/코드용 — 패널 미개봉에도 필요
    queryFn: () => fetchForecastSchema(hotelId!),
  })

  // 고점유 날짜 퀵셀렉터 — 현재 월 날짜별 OTB/Forecast 집계 (fetchBaselineForecast 1회로 OTB+FC 동시)
  const monthYM = date ? date.slice(0, 7) : ''
  const { data: monthRows = [] } = useQuery({
    queryKey: ['adr_high_occ', hotelId, monthYM, fcstUpdateDate],
    enabled: isOpen && !!hotelId && !!monthYM,
    queryFn: () => {
      const [yy, mm] = monthYM.split('-').map(Number)
      const lastDay = new Date(yy, mm, 0).getDate()
      const start = `${monthYM}-01`
      const end   = `${monthYM}-${String(lastDay).padStart(2, '0')}`
      return fetchBaselineForecast(hotelId!, start, end, undefined, fcstUpdateDate ?? null)
    },
  })
  // ── 픽업 급증 — get_pickup_data (어제/30일전/월1일 기준) + 현 BAR(s02_rate_detail) ──
  const pickupOtbDate = new Date(Date.now() - 86400000).toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })          // 어제
  const pickupVsDate  = new Date(Date.now() - 30 * 86400000).toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })     // 30일 전
  const pickupMinDate = monthYM ? `${monthYM}-01` : ''                                                                 // 조회 월 1일
  const { data: pickupRows = [], refetch: refetchPickup } = useQuery({
    queryKey: ['adr_pickup', hotelId, pickupOtbDate, pickupVsDate, pickupMinDate],
    enabled: isOpen && !!hotelId && !!pickupOtbDate && !!pickupVsDate && !!pickupMinDate,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_pickup_data', {
        p_hotel_id:    hotelId,
        p_otb_date:    pickupOtbDate,
        p_vs_otb_date: pickupVsDate,
        p_min_date:    pickupMinDate,
      })
      if (error) throw error
      return (data ?? []) as { business_date: string; otb_nights: number; vs_otb_nights: number }[]
    },
  })
  const { data: barRateRows = [] } = useQuery({
    queryKey: ['adr_bar_rates', hotelId, monthYM],
    enabled: isOpen && !!hotelId && !!monthYM,
    queryFn: async () => {
      const [yy, mm] = monthYM.split('-').map(Number)
      const lastDay = new Date(yy, mm, 0).getDate()
      const { data, error } = await (supabase as any)
        .from('s02_rate_detail')
        .select('stay_date, new_rate')
        .eq('hotel_id', hotelId).eq('room_type_code', 'BASE').eq('date_type', 'single')
        .gte('stay_date', `${monthYM}-01`).lte('stay_date', `${monthYM}-${String(lastDay).padStart(2, '0')}`)
      if (error) throw error
      return (data ?? []) as { stay_date: string; new_rate: number }[]
    },
  })
  // stay_date별 픽업 급증 + 추천 BAR (pickupPct 내림차순, 조회 월·미래 일자, BAR 존재분)
  const pickupList = useMemo(() => {
    const agg: Record<string, { otb: number; vs: number }> = {}
    for (const r of pickupRows) {
      const a = agg[r.business_date] ?? (agg[r.business_date] = { otb: 0, vs: 0 })
      a.otb += r.otb_nights ?? 0
      a.vs  += r.vs_otb_nights ?? 0
    }
    const barMap: Record<string, number> = {}
    for (const b of barRateRows) barMap[b.stay_date] = b.new_rate
    return Object.entries(agg).map(([d, v]) => {
      const p1 = v.otb, p30 = v.vs                                             // 1일전(현재)/1달전 OTB R/N
      const pickupPct = p30 > 0 ? Math.round((p1 - p30) / p30 * 100) : 0
      const occ  = effTotal > 0 ? Math.round((p1 / effTotal) * 100) : 0
      const barK = Math.round((barMap[d] ?? 0) / 1000)
      const rawIncrease    = pickupPct / 100 * pickupMult
      const actualIncrease = Math.min(rawIncrease, pickupCap / 100)
      const capped         = rawIncrease > pickupCap / 100
      const recBarK        = Math.round(barK * (1 + actualIncrease) / 5) * 5   // 5K 단위 반올림
      return { date: d, occ, barK, p1, p30, pickupPct, recBarK, capped, incPct: Math.round(actualIncrease * 100) }
    })
      .filter(r => r.pickupPct >= pickupThreshold && r.barK > 0
        && (!otbDate || r.date >= otbDate) && r.date.slice(0, 7) === monthYM)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [pickupRows, barRateRows, effTotal, pickupThreshold, pickupMult, pickupCap, otbDate, monthYM])

  // 좌측 OTB 실현값 — simDate(date) 기준 monthRows 집계 (우측 Forecast 패널 OTB와 동일 정의)
  const otbForDate = useMemo(() => {
    let rn = 0, rev = 0
    for (const r of monthRows) {
      if (r.business_date === date) {
        rn  += r.current_otb_rn      ?? 0
        rev += r.current_otb_revenue ?? 0
      }
    }
    return { rn, rev, adr: rn > 0 ? rev / rn : 0 }
  }, [monthRows, date])

  // simDate 세그먼트별 map (monthRows 기반 — 항상 로드, Forecast 패널 미개봉에도 사용) — 예상 ADR 패널용
  const segByDate = useMemo(() => {
    const m: Record<string, { otbRn: number; otbRev: number; fcRn: number; fcAdr: number }> = {}
    for (const r of monthRows) {
      if (r.business_date !== date) continue
      m[r.segmentation] = {
        otbRn:  r.current_otb_rn      ?? 0,
        otbRev: r.current_otb_revenue ?? 0,
        fcRn:   r.forecast_rn         ?? 0,
        fcAdr:  r.forecast_adr        ?? 0,
      }
    }
    return m
  }, [monthRows, date])

  // 세그먼트 채널 분류 — c05_market_table_schema.sorting1 ('direct'/'ota'/그 외, 대소문자 무관)
  const { data: segSchemaRows = [] } = useQuery({
    queryKey: ['adr_seg_channel', hotelId],
    enabled: isOpen && !!hotelId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c05_market_table_schema')
        .select('segmentation, sorting1')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []) as { segmentation: string[] | null; sorting1: string | null }[]
    },
  })
  const channelOf = useMemo(() => {
    const m: Record<string, 'direct' | 'ota' | 'other'> = {}
    for (const r of segSchemaRows) {
      const s1 = (r.sorting1 ?? '').trim().toLowerCase()
      const ch: 'direct' | 'ota' | 'other' = s1 === 'direct' ? 'direct' : s1 === 'ota' ? 'ota' : 'other'
      for (const code of r.segmentation ?? []) m[code] = ch
    }
    return m
  }, [segSchemaRows])

  const fcstByCode = useMemo(() => {
    const m: Record<string, ForecastRpcRow> = {}
    for (const r of fcstRows) m[r.segmentation] = r
    return m
  }, [fcstRows])
  const fcstEditRows = useMemo(() => buildFcstEditRows(fcstSchema?.nodes ?? []), [fcstSchema])
  const fcstAllCodes = useMemo(
    () => [...new Set(fcstEditRows.filter(r => r.kind === 'sub').map(r => (r as { code: string }).code))],
    [fcstEditRows],
  )

  // 소분류 코드별 값 — 편집값 우선, 없으면 원본 forecast
  const getFcstRn  = (code: string) => editedFcst[code]?.rn  ?? fcstByCode[code]?.forecast_rn  ?? 0
  const getFcstAdr = (code: string) => editedFcst[code]?.adr ?? fcstByCode[code]?.forecast_adr ?? 0
  const getFcstRev = (code: string) => getFcstRn(code) * getFcstAdr(code)
  const otbRnOf  = (code: string) => fcstByCode[code]?.current_otb_rn ?? 0
  const otbRevOf = (code: string) => fcstByCode[code]?.current_otb_revenue ?? 0

  // 편집 반영 합계
  const fcstTotalRn  = fcstAllCodes.reduce((s, c) => s + getFcstRn(c), 0)
  const fcstTotalRev = fcstAllCodes.reduce((s, c) => s + getFcstRev(c), 0)
  const fcstTotalAdr = fcstTotalRn > 0 ? Math.round(fcstTotalRev / fcstTotalRn) : 0
  const fcstTotalOcc = effTotal > 0 ? Math.round((fcstTotalRn / effTotal) * 100) : 0
  const otbTotalRn   = fcstAllCodes.reduce((s, c) => s + otbRnOf(c), 0)
  const otbTotalRev  = fcstAllCodes.reduce((s, c) => s + otbRevOf(c), 0)
  const otbTotalAdr  = otbTotalRn > 0 ? Math.round(otbTotalRev / otbTotalRn) : 0
  const otbTotalOcc  = effTotal > 0 ? Math.round((otbTotalRn / effTotal) * 100) : 0

  // 좌측 Forecast 행: 패널 세그 합계(편집 반영)로 override, 미로드 시 sim.forecast 총계 사용
  const fcstRaw = sim?.forecast ?? null
  const simFcst: Fcst | null = fcstRaw ? {
    rn:  fcstRaw.rn,
    adr: fcstRaw.adr,
    rev: fcstRaw.revenue,
    occ: effTotal > 0 ? Math.round((fcstRaw.rn / effTotal) * 100) : 0,
  } : null
  const usePanelFcst = showFcstPanel && fcstRows.length > 0 && fcstAllCodes.length > 0
  const fcst: Fcst | null = usePanelFcst
    ? { rn: fcstTotalRn, adr: fcstTotalAdr, rev: fcstTotalRev, occ: fcstTotalOcc }
    : simFcst

  // 현재 BAR(effBase) 변경 시 BAR 입력 동기화 — 0이면 현재 입력값 유지
  useEffect(() => { if (effBase > 0) setBarRaw(effBase) }, [effBase])

  // 픽업 추천 클릭 → 날짜 이동 후 sim 로드로 위 effBase 효과가 barRaw를 덮어쓰면 추천 BAR 재적용 (일회성)
  useEffect(() => {
    const p = pendingRecBarRef.current
    if (p && effBase > 0 && p.date === date) {
      setBarRaw(p.bar)
      pendingRecBarRef.current = null
    }
  }, [effBase, date])

  // 날짜 변경 시 Forecast 편집값 초기화
  useEffect(() => { setEditedFcst({}); setEditCell(null); setCheckedSegs([]); setSellOverride({}); setAppliedSegs({}) }, [date])

  // 모드 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modeDropRef.current && !modeDropRef.current.contains(e.target as Node)) setModeOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // OTA 비중 초기 세팅 — direct/ota 세그의 FCST R/N 합계 기준 (BulkEditV2 방식, editedFcst 반영). 이후 수동 조정 가능
  useEffect(() => {
    let otaRn = 0, directRn = 0
    for (const code of Object.keys(segByDate)) {
      const ch = channelOf[code]
      if (ch !== 'direct' && ch !== 'ota') continue
      const rn = editedFcst[code]?.rn ?? segByDate[code]?.fcRn ?? 0   // 편집값 우선 → 원본 FCST R/N
      if (ch === 'ota') otaRn += rn
      else directRn += rn
    }
    const total = otaRn + directRn
    setOtaPct(total > 0 ? Math.round((otaRn / total) * 100) : 50)   // fallback 50 (BulkEditV2 동일)
  }, [segByDate, channelOf, editedFcst])

  // ESC + scroll lock
  useEffect(() => {
    if (!isOpen) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [isOpen, onClose])

  const calc = useMemo(() => {
    const TOTAL = effTotal
    // OTB 현황 — 실현값(매출÷박수) 우선, monthRows 미로드 시 RPC 값 폴백
    const curRn  = otbForDate.rn  > 0 ? otbForDate.rn  : effBooked
    const curAdr = otbForDate.adr > 0 ? Math.round(otbForDate.adr) : effBase
    const curRev = otbForDate.rev > 0 ? otbForDate.rev : curAdr * curRn
    const avail = Math.max(0, TOTAL - curRn)
    const curOcc = TOTAL > 0 ? Math.round((curRn / TOTAL) * 100) : 0
    const newBar = barRaw
    const otaFee = otaFeePct / 100
    const dirPct = 100 - otaPct

    // 기본 판매율: Forecast 있으면 목표 R/N까지, 없으면 잔여 전량 (타입별 override 없을 때 기본값)
    const fcSellRooms = fcst ? Math.min(avail, Math.max(0, fcst.rn - curRn)) : avail
    const sellRatio   = avail > 0 ? fcSellRooms / avail : 0

    // 객실타입별 — RPC rooms의 avail/surcharge 사용 (잔여 0 타입은 제외)
    // rtSell = 사용자 입력(override) 우선, 없으면 Forecast 분배 기본값
    const detail = effRooms.filter(r => (r.avail ?? 0) > 0).map(room => {
      const rtAvail = room.avail ?? 0
      const ov      = sellOverride[room.room_type_code]
      const rtSell  = ov != null ? Math.max(0, Math.min(rtAvail, ov)) : Math.round(rtAvail * sellRatio)
      const sc      = room.surcharge ?? 0
      const curFull = effBase + sc
      const newFull = newBar + sc
      const otaRate = Math.round(newFull * (1 - otaFee))
      const avgRate = newFull * (1 - otaFee) * (otaPct / 100) + newFull * (dirPct / 100)
      return { room, rtAvail, rtSell, curFull, newFull, otaRate, dirRate: newFull, rev: avgRate * rtSell }
    })

    // 실제 판매 합계(override 반영)로 R/N·OCC·REV 산출
    const sellRooms  = detail.reduce((s, d) => s + d.rtSell, 0)
    const simTotalRn = curRn + sellRooms
    const simOcc = TOTAL > 0 ? Math.round((simTotalRn / TOTAL) * 100) : 0
    const newAvailRev = detail.reduce((s, d) => s + d.rev, 0)
    const simRev = curRev + newAvailRev
    const simAdr = simTotalRn > 0 ? Math.round(simRev / simTotalRn) : 0

    return {
      avail, curOcc, curAdr, curRn, simOcc, simTotalRn, sellRooms, curRev, simRev, simAdr, detail,
      gapOcc: simOcc - curOcc,
      gapRn:  simTotalRn - curRn,
      gapAdr: simAdr - curAdr,
      gapRev: simRev - curRev,
    }
  }, [effTotal, effBooked, effBase, effRooms, barRaw, otaPct, otaFeePct, fcst, otbForDate, sellOverride])

  // ── ① 오늘 추천 BAR — get_bar_recommendation. RPC 미존재 시 에러 격리 → null ──
  const { data: barRec = null } = useQuery({
    queryKey: ['adr_bar_rec', hotelId, date, effBase, calc.curOcc],
    enabled: isOpen && !!hotelId && !!date && effBase > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_bar_recommendation', {
        p_hotel_id:  hotelId,
        p_stay_date: date,
        p_cur_bar:   effBase,          // 현재 BAR (원 단위)
        p_otb_occ:   calc.curOcc,      // OTB OCC%
      })
      if (error) throw error
      const raw = Array.isArray(data) ? data[0] : data
      return (raw ?? null) as {
        direction: string; base_bar: number; rec_bar: number; cur_bar: number; delta_pct: number
        pickup_pct: number; p1_rn: number; p30_rn: number; otb_date: string; vs_otb_date: string
        tier_label: string; dday: number; decay_rate: number; real_mult: number; strategy: string; used_mult: number; used_cap: number
      } | null
    },
  })

  // Forecast 파생값 (표시용)
  const ach = fcst ? {
    OCC: fcst.occ > 0 ? Math.round((calc.simOcc / fcst.occ) * 100) : 0,
    ADR: fcst.adr > 0 ? Math.round((calc.simAdr / fcst.adr) * 100) : 0,
    REV: fcst.rev > 0 ? Math.round((calc.simRev / fcst.rev) * 100) : 0,
  } : null
  const revGap   = fcst ? Math.max(0, Math.round((fcst.rev - calc.simRev) / 1000)) : 0

  // 권장 BAR 상태 — feasible 세분화 (achievable/review/rec/soldout/otb). Forecast 없으면 null
  type RecState =
    | { kind: 'achievable' }
    | { kind: 'review'; simAdr: number; fcstAdr: number }
    | { kind: 'rec'; bar: number }
    | { kind: 'soldout' }
    | { kind: 'otb' }
    | null
  const recState = useMemo<RecState>(() => {
    if (!fcst || fcst.rev <= 0) return null
    const fRev = calc.simRev >= fcst.rev
    const fAdr = calc.simAdr >= fcst.adr
    if (fRev && fAdr) return { kind: 'achievable' }                          // REV·ADR 모두 달성
    if (fRev && !fAdr) return { kind: 'review', simAdr: calc.simAdr, fcstAdr: fcst.adr }  // REV만 달성, ADR 미달

    const dirPct = 100 - otaPct
    const channelRate = (otaPct / 100) * (1 - otaFeePct / 100) + (dirPct / 100)
    if (channelRate <= 0) return null
    const needRev = fcst.rev - calc.curRev                   // 필요 잔여 REV (실현 OTB 기준)
    if (needRev <= 0) return { kind: 'otb' }                 // OTB만으로 달성
    // 객실타입별 surcharge 반영 역산:
    // needRev = channelRate × Σ(rtSell × (BAR + surcharge)) = channelRate × (BAR × totalSell + surchargeSum)
    // BAR = (needRev / channelRate − surchargeSum) / totalSell
    const sellDetail = calc.detail.filter(d => d.rtSell > 0)
    const totalSell = sellDetail.reduce((s, d) => s + d.rtSell, 0)
    if (totalSell <= 0) return { kind: 'soldout' }           // 잔여 없음/매진
    const surchargeSum = sellDetail.reduce((s, d) => s + d.rtSell * (d.room.surcharge ?? 0), 0)
    const raw = (needRev / channelRate - surchargeSum) / totalSell
    if (raw <= 0) return { kind: 'otb' }                     // surcharge만으로 충분 → BAR 인상 불필요
    const bar = Math.round(raw / 1000) * 1000                // 천원 단위 반올림
    // [DEBUG] 역산 검증 (완료 후 제거) — verifyRev ≈ needRev 이어야 정확
    const verifyRev = sellDetail.reduce((s, d) => s + (bar + (d.room.surcharge ?? 0)) * channelRate * d.rtSell, 0)
    console.log('[권장BAR 검증] 예상잔여REV:', Math.round(verifyRev), '필요잔여REV:', Math.round(needRev), 'BAR:', bar)
    return { kind: 'rec', bar }
  }, [fcst, calc.simRev, calc.simAdr, calc.curRev, calc.curRn, calc.avail, calc.detail, otaPct, otaFeePct])

  if (!isOpen) return null

  // 날짜 ±1 (KST 기준) — OTB 기준일 이전으론 이동 금지
  const changeDate = (delta: number) => {
    if (!date) return
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    const newDate = d.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
    if (otbDate && newDate < otbDate) return
    onDateChange(newDate)
  }
  const canGoPrev = !otbDate || date > otbDate
  // 'YYYY-MM-DD' → 'MM/DD (요일)'
  const formatDate = (s: string) => {
    if (!s) return '—'
    const d = new Date(s + 'T00:00:00')
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`
  }
  const navBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: TXT2, width: 22, height: 22, cursor: 'pointer', fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const chanBox: React.CSSProperties = { flex: 1, minWidth: 0, background: BG_CARD, border: `0.5px solid ${BORDER}`, borderRadius: 7, padding: '5px 7px' }
  // 픽업 급증 섹션 컨트롤 스타일
  const pickupInput: React.CSSProperties = { width: 32, background: '#0a0a0a', border: '1px solid #2a2a2a', color: '#00E5A0', borderRadius: 3, fontSize: 10, textAlign: 'right', padding: '1px 3px', outline: 'none' }
  const pickupCtrl:  React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: '#666' }
  const pickupCols = '58px 34px 42px 30px 62px 1fr'
  // 픽업 추천 행 클릭 → 날짜 이동 + 추천 BAR 자동 입력 + 상단 스크롤 + 토스트
  const handlePickupRowClick = (idx: number, row: { date: string; recBarK: number }) => {
    setSelectedPickupIdx(idx)
    pendingRecBarRef.current = { date: row.date, bar: row.recBarK * 1000 }   // sim 로드 후 재적용 보장
    onDateChange(row.date)
    setBarRaw(row.recBarK * 1000)
    scrollBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    const mmdd = `${row.date.slice(5, 7)}/${row.date.slice(8, 10)}`
    setPickupToast(`${mmdd} · BAR ${row.recBarK}K 적용됨`)
    setTimeout(() => setPickupToast(null), 1800)
  }

  // ── Forecast 편집 패널 — 입력/저장/초기화 ──
  const segGapColor = (v: number) => (v > 0 ? POS : v < 0 ? RED : TXT3)
  const setEdit = (code: string, field: 'rn' | 'adr', val: number) => setEditedFcst(prev => ({
    ...prev,
    [code]: {
      rn:  field === 'rn'  ? val : (prev[code]?.rn  ?? getFcstRn(code)),
      adr: field === 'adr' ? val : (prev[code]?.adr ?? getFcstAdr(code)),
    },
  }))

  // ── 세그먼트별 예상 ADR (BulkEditModalV2 로직 재사용, segByDate 기반) ──
  const segNameByCode: Record<string, string> = {}
  for (const r of fcstEditRows) if (r.kind === 'sub') segNameByCode[r.code] = r.name
  // 편집(editedFcst) 우선 → segByDate(forecast) 폴백
  const segFcRn  = (code: string) => editedFcst[code]?.rn  ?? segByDate[code]?.fcRn  ?? 0
  const segFcAdr = (code: string) => editedFcst[code]?.adr ?? segByDate[code]?.fcAdr ?? 0
  // 세그(code)별 surcharge 프리미엄 — OTB ADR − 현재 BAR(effBase)
  const getSegPremium = (code: string): number => {
    const s = segByDate[code]
    if (!s || s.otbRn <= 0) return 0
    return Math.round(s.otbRev / s.otbRn) - effBase
  }
  // 세그별 예상 ADR (direct/ota만, R/N 증가율로 premium 감쇠) — barRaw/otaFeePct/editedFcst 변화 시 재계산
  const getSegExpectedAdr = (code: string, newBar: number): number | null => {
    const ch = channelOf[code]
    if (ch !== 'direct' && ch !== 'ota') return null
    const s = segByDate[code]
    if (!s) return null
    const premium  = getSegPremium(code)
    const fcRn     = segFcRn(code)
    const rnGrowth = s.otbRn > 0 ? fcRn / s.otbRn : 1
    const decay    = Math.max(0.7, 1 - (rnGrowth - 1) * 0.1)   // 판매량↑ → 평균 surcharge↓ (최대 30% 감쇠)
    const base     = newBar + premium * decay
    if (ch === 'ota') return Math.round(base * (1 - otaFeePct / 100))
    return Math.round(base)
  }
  // 적용 → 해당 세그 FCST ADR을 예상값으로 set (editedFcst 체인 → 좌/우 패널 동기화)
  const applyExpected = (code: string, expected: number) => {
    setEditedFcst(prev => ({ ...prev, [code]: { rn: prev[code]?.rn ?? segFcRn(code), adr: expected } }))
    setAppliedSegs(prev => ({ ...prev, [code]: true }))
    setTimeout(() => setAppliedSegs(prev => ({ ...prev, [code]: false })), 1800)
  }
  // 렌더용 direct/ota 세그 목록 (R/N > 0)
  const segExpectedList = Object.keys(segByDate)
    .filter(code => (channelOf[code] === 'direct' || channelOf[code] === 'ota') && segFcRn(code) > 0)
    .map(code => {
      const expected = getSegExpectedAdr(code, barRaw)
      if (expected === null) return null
      return { code, name: segNameByCode[code] ?? code, expected, currentAdr: segFcAdr(code) }
    })
    .filter((x): x is { code: string; name: string; expected: number; currentAdr: number } => x !== null)
  // 전체 적용 시 예상 — 모든 direct/ota 세그에 예상 ADR을 적용했다고 가정한 합계
  const previewAfterApply = (() => {
    const codes = Object.keys(segByDate)
    if (codes.length === 0) return null
    let totalRn = 0, totalRev = 0
    for (const code of codes) {
      const fcRn = segFcRn(code)
      if (fcRn <= 0) continue
      const ch = channelOf[code]
      const fcAdr = (ch === 'direct' || ch === 'ota')
        ? (getSegExpectedAdr(code, barRaw) ?? segFcAdr(code))
        : segFcAdr(code)
      totalRn  += fcRn
      totalRev += fcRn * fcAdr
    }
    if (totalRn === 0) return null
    return {
      rn:  totalRn,
      rev: totalRev,
      occ: effTotal > 0 ? (totalRn / effTotal) * 100 : 0,
      adr: Math.round(totalRev / totalRn),
    }
  })()
  // 표시 포맷 — 값 0이면 '-'
  const fmtRN  = (v: number) => (v === 0 ? '-' : `${v}`)
  const fmtADR = (v: number) => (v === 0 ? '-' : `${Math.round(v / 1000).toLocaleString('ko-KR')}K`)
  const fmtREV = (v: number) => (v === 0 ? '-' : Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000).toLocaleString('ko-KR')}K`)
  const fmtGap = (v: number, kind: 'rn' | 'adr' | 'rev') => {
    if (v === 0) return '-'
    const arrow = v > 0 ? '▲' : '▼'
    const m = Math.abs(v)
    const body = kind === 'rn' ? `${m}` : kind === 'adr' ? `${Math.round(m / 1000).toLocaleString('ko-KR')}K` : fmtREV(m)
    return `${arrow} ${body}`
  }
  // 편집 셀 — 클릭 시 입력 전환 (R/N·ADR 모두 원 단위 입력, 표시는 K)
  const editInput = (code: string, field: 'rn' | 'adr', val: number, width: number) => (
    <input className="fc-spin-hide" type="number" autoFocus defaultValue={val}
      onBlur={e => { setEdit(code, field, Math.max(0, Number(e.target.value) || 0)); setEditCell(null) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); else if (e.key === 'Escape') setEditCell(null) }}
      style={{ width, textAlign: 'right', fontSize: 12, background: BG_INPUT, border: 'none', borderBottom: `0.5px solid ${BORDER_ACCENT}`, color: PURPLE, padding: '1px 2px', outline: 'none' }} />
  )
  const editText = (code: string, field: 'rn' | 'adr', display: string) => (
    <span onClick={() => setEditCell({ code, field })} style={{ cursor: 'pointer', color: PURPLE, borderBottom: `1px dashed ${BORDER_ACCENT}` }}>{display}</span>
  )
  const editedCount = Object.keys(editedFcst).length
  const canSave = editedCount > 0 && !fcstSaving && !!hotelId && !!fcstUpdateDate
  const handleFcstReset = () => setEditedFcst({})
  // FCST 모드 — 선택 항목을 체크된 세그먼트에 ±1 즉시 적용 (체크 없으면 변화 없음)
  const handleFcstAdj = (act: 'add' | 'sub') => {
    if (selectedFields.length === 0) return
    const d = act === 'add' ? 1 : -1
    const next = { ...editedFcst }
    for (const code of checkedSegs) {
      const curRn = getFcstRn(code), curAdr = getFcstAdr(code)
      next[code] = {
        rn:  selectedFields.includes('rn')  ? Math.max(0, curRn  + d) : curRn,
        adr: selectedFields.includes('adr') ? Math.max(0, curAdr + d) : curAdr,
      }
    }
    setEditedFcst(next)
  }
  // OTB 모드 — 선택 항목에 OTB 값 복사 (otbRnOf/otbRevOf → otbAdr)
  const handleOtbCopy = () => {
    if (selectedFields.length === 0 || checkedSegs.length === 0) return
    const next = { ...editedFcst }
    for (const code of checkedSegs) {
      const oRn = otbRnOf(code), oRev = otbRevOf(code)
      const otbAdr = oRn > 0 ? Math.round(oRev / oRn) : 0
      next[code] = {
        rn:  selectedFields.includes('rn')  ? oRn    : getFcstRn(code),
        adr: selectedFields.includes('adr') ? otbAdr : getFcstAdr(code),
      }
    }
    setEditedFcst(next)
  }
  const handleFcstSave = async () => {
    if (!canSave) return
    // 해당 일자 Forecast 데이터 존재 확인 — 없으면 전체 업로드 확인 팝업
    try {
      const { data: existing } = await (supabase as any)
        .from('a05_forecast_daily')
        .select('business_date')
        .eq('hotel_id', hotelId)
        .eq('business_date', date)
        .eq('update_date', fcstUpdateDate)
        .limit(1)
      if (!(existing && existing.length > 0)) {
        if (!window.confirm(`${date} Forecast 데이터가 없습니다.\n전체 업로드하시겠습니까?`)) return
      }
    } catch { /* 존재 확인 실패 시 그대로 저장 진행 */ }
    setFcstSaving(true)
    try {
      const edits: SaveEdit[] = Object.keys(editedFcst).map(code => ({
        business_date: date,
        segmentation:  code,
        rn:  getFcstRn(code),
        adr: getFcstAdr(code),
      }))
      await saveForecastEdits(hotelId!, fcstUpdateDate!, edits)
      setEditedFcst({})
      queryClient.invalidateQueries({ queryKey: ['adr_fcst_segs', hotelId, date, fcstUpdateDate] })
      queryClient.invalidateQueries({ queryKey: ['adr_simulator', hotelId, date, fcstUpdateDate] })
    } catch (err) {
      alert(`저장 실패: ${(err as Error).message}`)
    } finally {
      setFcstSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2">
      <style>{`@keyframes slideInRight { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInLeft { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        .fc-spin-hide::-webkit-outer-spin-button, .fc-spin-hide::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .fc-spin-hide { -moz-appearance: textfield; }`}</style>
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose} />
      {/* 래퍼 — 좌측 Simulation + 우측 Forecast 편집 패널 */}
      <div className="relative rounded-2xl overflow-hidden flex flex-row w-full" style={{ maxWidth: 440 + (showRoomPanel ? 200 : 0) + (showFcstPanel ? 700 : 0), transition: 'max-width 0.2s ease', border: `0.5px solid ${BORDER}`, height: '80vh', boxShadow: 'var(--shadow-elevated)' }}>
        {/* ───────── 객실타입 패널 (세로탭 왼쪽, 슬라이드인) ───────── */}
        {showRoomPanel && (
          <div style={{ width: 200, flexShrink: 0, background: BG_BODY, borderRight: `0.5px solid ${BORDER}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideInLeft 0.15s ease' }}>
            <div style={{ padding: '8px 12px', borderBottom: `0.5px solid ${BORDER}`, fontSize: 11, fontWeight: 500, color: TXT, flexShrink: 0 }}>예상판매 (객실타입)</div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {effRooms.filter(r => (r.avail ?? 0) > 0).map(r => {
                const occPct = r.total_rooms > 0 ? Math.round((r.booked / r.total_rooms) * 100) : 0
                const cur = calc.detail.find(d => d.room.room_type_code === r.room_type_code)?.rtSell ?? 0
                return (
                  <div key={r.room_type_code} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', padding: '5px 12px', borderTop: `0.5px solid ${BORDER}`, fontSize: 11 }}>
                    <div>
                      <div style={{ fontWeight: 500, color: TXT }}>{r.room_type_code}</div>
                      <div style={{ fontSize: 9, color: TXT3 }}>{r.room_type_name}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                      <input type="number" className="fc-spin-hide" value={cur}
                        onChange={e => { const v = Math.max(0, Math.min(r.avail ?? 0, Number(e.target.value) || 0)); setSellOverride(prev => ({ ...prev, [r.room_type_code]: v })) }}
                        style={{ width: 34, textAlign: 'right', fontSize: 11, fontWeight: 500, background: BG_INPUT, border: `0.5px solid ${BORDER_ACCENT}`, borderRadius: 4, color: MINT, padding: '1px 4px', outline: 'none' }} />
                      <span style={{ fontSize: 9, color: TXT3, whiteSpace: 'nowrap' }}>/{r.avail}</span>
                    </div>
                    <div style={{ fontSize: 10, color: TXT3, paddingLeft: 8, textAlign: 'right' }}>{occPct}%</div>
                  </div>
                )
              })}
              {effRooms.filter(r => (r.avail ?? 0) > 0).length === 0 && (
                <div style={{ padding: 12, textAlign: 'center', fontSize: 10, color: TXT3 }}>잔여 객실타입이 없습니다.</div>
              )}
            </div>
            {/* 예상판매 합계 */}
            <div style={{ flexShrink: 0, borderTop: `0.5px solid ${BORDER}`, padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: TXT3 }}>예상판매 합계</span>
              <span style={{ fontWeight: 600, color: MINT }}>{calc.sellRooms}실</span>
            </div>
          </div>
        )}

        {/* ───────── 세로 탭 (Simulation 좌측, 항상 표시) ───────── */}
        <div onClick={() => setShowRoomPanel(p => !p)} role="button" aria-label="객실타입 현황 패널 토글"
          style={{ width: 20, flexShrink: 0, background: showRoomPanel ? 'var(--color-accent-dim)' : BG_CARD, borderRight: `0.5px solid ${showRoomPanel ? BORDER_ACCENT : BORDER}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ writingMode: 'vertical-lr', textOrientation: 'mixed', transform: 'none', fontSize: 9, color: showRoomPanel ? MINT : TXT3, letterSpacing: '0.5px', userSelect: 'none', whiteSpace: 'nowrap' }}>Room Types</span>
        </div>

        {/* ───────── 좌측: Simulation ───────── */}
        <div className="flex flex-col" style={{ flex: '0 0 auto', width: 400, background: BG_BODY, height: '100%', overflow: 'hidden' }}>
          {/* Header */}
          <div className="shrink-0" style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `0.5px solid ${BORDER}`, position: 'relative' }}>
            {/* 날짜 네비 — 정중앙 */}
            <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => changeDate(-1)} disabled={!canGoPrev} aria-label="이전 날짜"
                style={{ ...navBtn, opacity: canGoPrev ? 1 : 0.3, cursor: canGoPrev ? 'pointer' : 'not-allowed' }}>‹</button>
              <span style={{ fontSize: 12, color: TXT, minWidth: 82, textAlign: 'center' }}>{formatDate(date)}</span>
              <button onClick={() => changeDate(+1)} aria-label="다음 날짜" style={navBtn}>›</button>
            </div>
            {/* 우측 — 닫기 */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기"><X size={18} /></button>
            </div>
          </div>

          {/* 본문 (고정 상단 + 잔여 객실타입 현황이 하단 채움) */}
          <div ref={scrollBodyRef} className="flex-1 flex flex-col" style={{ minHeight: 0, overflowY: 'auto' }}>
            <div>
              {/* ① 오늘 추천 BAR (get_bar_recommendation, 데이터 있을 때만) */}
              {barRec && (() => {
                const dir = barRec.direction
                const dirColor = dir === 'up' ? MINT : dir === 'dn' ? RED : TXT3
                return (
                  <div style={{ margin: '10px 14px 8px', background: BG_CARD, border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TXT, marginBottom: 6 }}>오늘 추천 BAR</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: dirColor }}>{Math.round(barRec.rec_bar / 1000)}K</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: dirColor }}>{barRec.delta_pct > 0 ? '+' : ''}{barRec.delta_pct}%</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: TXT3 }}>현재 {Math.round(barRec.cur_bar / 1000)}K</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: TXT3 }}>BAR</span>
                      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                        <input type="number" className="fc-spin-hide" value={Math.round(barRaw / 1000)} onChange={e => setBarRaw(Math.max(0, (Number(e.target.value) || 0) * 1000))}
                          style={{ background: BG_INPUT, border: `0.5px solid ${BORDER_ACCENT}`, borderRadius: 6, color: MINT, fontSize: 14, fontWeight: 500, width: 60, textAlign: 'right', padding: '3px 22px 3px 7px', outline: 'none' }} />
                        <span style={{ position: 'absolute', right: 7, fontSize: 11, color: TXT3, pointerEvents: 'none' }}>K</span>
                      </div>
                      <button onClick={() => setBarRaw(barRec.rec_bar)}
                        style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 5, whiteSpace: 'nowrap', background: MINT, color: '#0a0a0a', border: 'none', cursor: 'pointer' }}>
                        추천값 적용
                      </button>
                    </div>
                  </div>
                )
              })()}
              {/* ② 왜 올려야 하나? — 픽업 추이 (get_pickup_trend, 데이터 있을 때만) */}
              {pickupTrend && (() => {
                const occ = (rn: number) => effTotal > 0 ? Math.round(rn / effTotal * 100 * 10) / 10 : 0
                const cells = [
                  { label: '30일전', date: pickupTrend.d30_date, rn: pickupTrend.d30_rn },
                  { label: '14일전', date: pickupTrend.d14_date, rn: pickupTrend.d14_rn },
                  { label: '7일전',  date: pickupTrend.d7_date,  rn: pickupTrend.d7_rn },
                  { label: '어제',   date: pickupTrend.d1_date,  rn: pickupTrend.d1_rn },
                ]
                const diffPp = Math.round((occ(pickupTrend.d1_rn) - occ(pickupTrend.d30_rn)) * 10) / 10
                const d7cancel = occ(pickupTrend.d7_rn) < occ(pickupTrend.d14_rn)
                return (
                  <div style={{ margin: '10px 14px 8px', background: BG_CARD, border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TXT, marginBottom: 6 }}>왜 올려야 하나?</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                      {cells.map((c, i) => {
                        const cOcc = occ(c.rn)
                        const prev = i > 0 ? occ(cells[i - 1].rn) : null
                        const up = prev != null && cOcc > prev
                        const down = prev != null && cOcc < prev
                        const isYesterday = i === cells.length - 1
                        const cancel = c.label === '7일전' && d7cancel
                        return (
                          <div key={c.label} style={{ background: isYesterday ? SUCCESS_BG : BG_INPUT, border: `0.5px solid ${isYesterday ? SUCCESS_BD : BORDER}`, borderRadius: 6, padding: '5px 4px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: TXT3 }}>{c.label}</div>
                            <div style={{ fontSize: 8, color: TXT3 }}>{c.date ? c.date.slice(5) : '-'}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: cancel ? RED : up ? POS : down ? RED : TXT }}>
                              {up ? '▲' : down ? '▼' : ''}{cOcc}%
                            </div>
                            <div style={{ fontSize: 9, color: TXT3 }}>{c.rn} R/N</div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10, color: diffPp >= 0 ? POS : RED, textAlign: 'right' }}>
                      30일전 대비 점유율 {diffPp >= 0 ? '+' : ''}{diffPp}%p {diffPp >= 0 ? '↑' : '↓'}
                    </div>
                  </div>
                )
              })()}
              {/* ③ 올리면 어떻게 되지? — OTB vs 시뮬 비교 + 슬라이더(이동) */}
              <div style={{ margin: '10px 14px 8px', background: BG_CARD, border: `0.5px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '8px 10px 4px', fontSize: 11, fontWeight: 600, color: TXT }}>올리면 어떻게 되지?</div>
                <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 1fr 1fr', columnGap: 6, rowGap: 3, padding: '0 10px 8px', fontSize: 11, alignItems: 'center' }}>
                  <span />
                  <span style={{ fontSize: 9, color: TXT3, textAlign: 'right' }}>OCC</span>
                  <span style={{ fontSize: 9, color: TXT3, textAlign: 'right' }}>ADR</span>
                  <span style={{ fontSize: 9, color: TXT3, textAlign: 'right' }}>REV</span>
                  <span style={{ color: TXT3 }}>현재 OTB</span>
                  <span style={{ textAlign: 'right', color: TXT }}>{calc.curOcc}%</span>
                  <span style={{ textAlign: 'right', color: TXT }}>{fmtADR(calc.curAdr)}</span>
                  <span style={{ textAlign: 'right', color: TXT }}>{fmtREV(calc.curRev)}</span>
                  <span style={{ color: MINT }}>시뮬</span>
                  <span style={{ textAlign: 'right', color: TXT }}>{calc.simOcc}%</span>
                  <span style={{ textAlign: 'right', color: MINT, fontWeight: 600 }}>{fmtADR(calc.simAdr)}{calc.gapAdr > 0 ? ' ▲' : calc.gapAdr < 0 ? ' ▼' : ''}</span>
                  <span style={{ textAlign: 'right', color: MINT, fontWeight: 600 }}>{fmtREV(calc.simRev)}{calc.gapRev > 0 ? ' ▲' : calc.gapRev < 0 ? ' ▼' : ''}</span>
                </div>
                {(calc.gapAdr !== 0 || calc.gapRev !== 0) && (
                  <div style={{ padding: '0 10px 8px', fontSize: 10, color: TXT3, textAlign: 'right' }}>
                    ADR {fmtGap(calc.gapAdr, 'adr')} · REV {fmtGap(calc.gapRev, 'rev')}
                  </div>
                )}
                {/* 채널 슬라이더 3개 (③ 아래로 이동) */}
                <div style={{ display: 'flex', gap: 5, padding: '7px 10px', borderTop: `0.5px solid ${BORDER}` }}>
                  <div style={chanBox}>
                    <div style={{ fontSize: 9, color: TXT3, marginBottom: 2 }}>OTA</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <input type="range" min={0} max={100} step={1} value={otaPct} onChange={e => setOtaPct(Number(e.target.value))}
                        style={{ flex: 1, minWidth: 0, width: '100%', accentColor: MINT, cursor: 'pointer' }} />
                      <span style={{ fontSize: 10, color: TXT, minWidth: 22, textAlign: 'right' }}>{otaPct}%</span>
                    </div>
                  </div>
                  <div style={chanBox}>
                    <div style={{ fontSize: 9, color: TXT3, marginBottom: 2 }}>Direct</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <input type="range" min={0} max={100} step={1} value={100 - otaPct} disabled
                        style={{ flex: 1, minWidth: 0, width: '100%', accentColor: MINT, opacity: 0.5, cursor: 'not-allowed' }} />
                      <span style={{ fontSize: 10, color: TXT, minWidth: 22, textAlign: 'right' }}>{100 - otaPct}%</span>
                    </div>
                  </div>
                  <div style={chanBox}>
                    <div style={{ fontSize: 9, color: TXT3, marginBottom: 2 }}>Commission</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <input type="range" min={0} max={40} step={1} value={otaFeePct} onChange={e => setOtaFeePct(Number(e.target.value))}
                        style={{ flex: 1, minWidth: 0, width: '100%', accentColor: MINT, cursor: 'pointer' }} />
                      <span style={{ fontSize: 10, color: TXT, minWidth: 22, textAlign: 'right' }}>{otaFeePct}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 세그먼트별 예상 ADR + 전체 적용 시 예상 (KPI 아래 divider) */}
            {segExpectedList.length > 0 && (
              <div style={{ margin: '0 14px 10px', paddingTop: 10, borderTop: '1px solid #1f1f1f', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 세그먼트별 예상 ADR */}
                <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '7px 14px', color: '#888', fontSize: 11, borderBottom: '1px solid #1f1f1f' }}>세그먼트별 예상 ADR</div>
                  {segExpectedList.map((s, i) => {
                    const isMint   = s.expected >= s.currentAdr
                    const adrColor = isMint ? '#00E5A0' : '#E24B4A'
                    const applied  = !!appliedSegs[s.code]
                    return (
                      <div key={s.code} style={{ display: 'flex', alignItems: 'center', padding: '6px 14px', gap: 10, borderBottom: i < segExpectedList.length - 1 ? '1px solid #1a1a1a' : 'none' }}>
                        <span style={{ color: '#ccc', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                        <span style={{ color: adrColor, fontSize: 13, fontWeight: 600 }}>{Math.round(s.expected / 1000)}K</span>
                        <button onClick={() => applyExpected(s.code, s.expected)}
                          style={{ borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', flexShrink: 0,
                            background: isMint ? '#0a2e1f' : '#2e0a0a', border: `1px solid ${adrColor}`, color: adrColor }}>
                          {applied ? '✓' : '적용'}
                        </button>
                      </div>
                    )
                  })}
                </div>
                {/* 전체 적용 시 예상 */}
                {previewAfterApply && (
                  <div style={{ background: '#0d1f17', border: '1px solid rgba(0,229,160,0.19)', borderRadius: 8, padding: '7px 14px' }}>
                    <div style={{ color: '#888', fontSize: 10, marginBottom: 8 }}>전체 적용 시 예상</div>
                    <div style={{ display: 'flex', gap: 24 }}>
                      {([
                        ['OCC', `${previewAfterApply.occ.toFixed(1)}%`],
                        ['ADR', `${Math.round(previewAfterApply.adr / 1000)}K`],
                        ['REV', `${(previewAfterApply.rev / 1e6).toFixed(1)}M`],
                      ] as const).map(([label, val]) => (
                        <div key={label}>
                          <div style={{ color: '#666', fontSize: 10 }}>{label}</div>
                          <div style={{ color: '#00E5A0', fontSize: 14, fontWeight: 700 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 픽업 급증 — 요금 인상 추천 (전체 적용 시 예상 아래, divider) */}
            <div style={{ flex: 1, minHeight: 0, margin: '0 14px 10px', paddingTop: 10, borderTop: '1px solid #1f1f1f', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 0, background: '#111', border: '1px solid rgba(0,229,160,0.12)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* 헤더행: 제목 + 컨트롤 + 조회 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 14px', borderBottom: '1px solid #1f1f1f', flexShrink: 0 }}>
                  <span style={{ color: '#00E5A0', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>픽업 급증</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={pickupCtrl}>픽업<input className="fc-spin-hide" type="number" value={pickupThreshold} onChange={e => setPickupThreshold(Number(e.target.value) || 0)} style={pickupInput} />%↑</label>
                    <label style={pickupCtrl}>계수<input className="fc-spin-hide" type="number" step={0.1} value={pickupMult} onChange={e => setPickupMult(Number(e.target.value) || 0)} style={pickupInput} /></label>
                    <label style={pickupCtrl}>상한<input className="fc-spin-hide" type="number" value={pickupCap} onChange={e => setPickupCap(Number(e.target.value) || 0)} style={pickupInput} />%</label>
                    <button onClick={() => refetchPickup()} style={{ background: '#00E5A0', color: '#0a0a0a', fontWeight: 600, border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>조회</button>
                  </div>
                </div>
                {/* 컬럼 헤더 */}
                <div style={{ display: 'grid', gridTemplateColumns: pickupCols, gap: 4, padding: '4px 14px', borderBottom: '1px solid #1f1f1f', color: '#444', fontSize: 10, flexShrink: 0 }}>
                  <span>일자</span>
                  <span style={{ textAlign: 'right' }}>OCC</span>
                  <span style={{ textAlign: 'right' }}>현 BAR</span>
                  <span style={{ textAlign: 'right' }}>1달전</span>
                  <span style={{ textAlign: 'right' }}>1일전</span>
                  <span style={{ textAlign: 'right' }}>추천 BAR</span>
                </div>
                {/* 목록 */}
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  {pickupList.length === 0 ? (
                    <div style={{ padding: 14, textAlign: 'center', fontSize: 11, color: '#333' }}>해당 조건의 날짜가 없습니다</div>
                  ) : pickupList.map((r, idx) => {
                    const selected = selectedPickupIdx === idx
                    const occColor = r.occ >= 80 ? '#00E5A0' : r.occ >= 65 ? '#f59e0b' : '#555'
                    const wd = new Date(r.date + 'T00:00:00').getDay()
                    const isFriSat = wd === 5 || wd === 6
                    return (
                      <div key={r.date} onClick={() => handlePickupRowClick(idx, r)}
                        onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = '#161f16' }}
                        onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        style={{ display: 'grid', gridTemplateColumns: pickupCols, gap: 4, alignItems: 'center', padding: '6px 14px', cursor: 'pointer', fontSize: 11,
                          borderTop: '1px solid #1a1a1a',
                          background: selected ? '#0d1f17' : 'transparent',
                          borderLeft: `2px solid ${selected ? '#00E5A0' : 'transparent'}` }}>
                        <span style={{ color: isFriSat ? '#E24B4A' : '#ccc', whiteSpace: 'nowrap' }}>{formatDate(r.date)}</span>
                        <span style={{ textAlign: 'right', color: occColor }}>{r.occ}%</span>
                        <span style={{ textAlign: 'right', color: '#888' }}>{r.barK}K</span>
                        <span style={{ textAlign: 'right', color: '#888' }}>{r.p30}</span>
                        <span style={{ textAlign: 'right', color: '#ccc', whiteSpace: 'nowrap' }}>{r.p1} <span style={{ color: r.pickupPct >= 0 ? '#00E5A0' : '#E24B4A' }}>({r.pickupPct >= 0 ? '+' : ''}{r.pickupPct}%)</span></span>
                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, lineHeight: 1.15 }}>
                          <span style={{ color: '#00E5A0', fontSize: 12, fontWeight: 600 }}>{r.recBarK}K</span>
                          {r.capped
                            ? <span style={{ background: '#2e1a0a', color: '#f59e0b', fontSize: 9, borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap' }}>+{r.incPct}%상한</span>
                            : <span style={{ color: '#00E5A0', fontSize: 9 }}>+{r.incPct}%</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ───────── Forecast 세로 탭 (Simulation 우측, 항상 표시) ───────── */}
        <div onClick={() => setShowFcstPanel(p => !p)} role="button" aria-label="Forecast 편집 패널 토글"
          style={{ width: 20, flexShrink: 0, background: showFcstPanel ? 'rgba(159,122,234,0.12)' : BG_CARD, borderLeft: `0.5px solid ${showFcstPanel ? 'rgba(159,122,234,0.4)' : BORDER}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ writingMode: 'vertical-lr', textOrientation: 'mixed', fontSize: 9, color: showFcstPanel ? PURPLE : TXT3, letterSpacing: '0.5px', userSelect: 'none', whiteSpace: 'nowrap' }}>Forecast</span>
        </div>

        {/* ───────── 우측: Forecast 편집 패널 ───────── */}
        {showFcstPanel && (
          <div style={{ width: 700, flex: '0 0 auto', borderLeft: `0.5px solid ${BORDER}`, background: BG_CARD, height: '100%', display: 'flex', flexDirection: 'column', overflowX: 'hidden', animation: 'slideInRight 0.15s ease' }}>
            {/* 모드 선택 + 항목 + 액션 — 단일 툴바 */}
            <div className="shrink-0" style={{ padding: '7px 14px', borderBottom: `0.5px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8, background: BG_CARD }}>
              {/* 모드 커스텀 드롭다운 */}
              <div style={{ position: 'relative' }} ref={modeDropRef}>
                <button onClick={() => setModeOpen(p => !p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: TXT }}>{editMode === 'fcst' ? 'FCST' : 'OTB'}</span>
                  <span style={{ fontSize: 10, color: TXT3 }}>▾</span>
                </button>
                {modeOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: BG_INPUT, border: `0.5px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', zIndex: 100, minWidth: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                    {(['fcst', 'otb'] as const).map(m => (
                      <button key={m} onClick={() => { setEditMode(m); setSelectedFields([]); setModeOpen(false) }}
                        style={{ width: '100%', padding: '8px 14px', textAlign: 'left', border: 'none', cursor: 'pointer', display: 'block',
                          fontSize: 12, fontWeight: editMode === m ? 600 : 400,
                          background: editMode === m ? '#00E5A010' : 'transparent',
                          color: editMode === m ? '#00E5A0' : TXT2 }}>
                        {m === 'fcst' ? 'FCST' : 'OTB'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ width: '0.5px', height: 18, background: BORDER }} />
              <span style={{ fontSize: 12, color: TXT3 }}>항목</span>

              {/* 항목 칩 (FCST=단일, OTB=멀티) */}
              {(['rn', 'adr'] as const).map(f => {
                const isOn = selectedFields.includes(f)
                return (
                  <button key={f}
                    onClick={() => {
                      if (editMode === 'fcst') setSelectedFields(prev => prev[0] === f ? [] : [f])
                      else setSelectedFields(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])
                    }}
                    style={isOn
                      ? { padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: '#0a2a1a', border: '1.5px solid #00E5A0', color: '#00E5A0' }
                      : { padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 400, cursor: 'pointer', background: 'transparent', border: `0.5px solid ${BORDER}`, color: TXT3 }}>
                    {f === 'rn' ? 'R/N' : 'ADR'}
                  </button>
                )
              })}

              <div style={{ width: '0.5px', height: 18, background: BORDER }} />

              {/* FCST 모드: +/- (즉시 적용) */}
              {editMode === 'fcst' && (['add', 'sub'] as const).map(a => (
                <button key={a} onClick={() => handleFcstAdj(a)}
                  style={{ width: 32, height: 28, borderRadius: 6, border: '1px solid #444', background: BG_CARD, color: '#ccc', fontSize: 18, fontWeight: 300, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, transition: 'all 0.1s' }}
                  onMouseEnter={e => { const t = e.currentTarget; t.style.borderColor = '#00E5A0'; t.style.color = '#00E5A0'; t.style.background = '#00E5A015' }}
                  onMouseLeave={e => { const t = e.currentTarget; t.style.borderColor = '#444'; t.style.color = '#ccc'; t.style.background = BG_CARD }}>
                  {a === 'add' ? '+' : '−'}
                </button>
              ))}

              {/* OTB 모드: OTB Copy */}
              {editMode === 'otb' && (
                <button onClick={handleOtbCopy} disabled={selectedFields.length === 0 || checkedSegs.length === 0}
                  style={{ padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: (selectedFields.length > 0 && checkedSegs.length > 0) ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
                    background: '#00E5A0', border: 'none', color: '#000', transition: 'all 0.1s',
                    opacity: (selectedFields.length > 0 && checkedSegs.length > 0) ? 1 : 0.3 }}>
                  OTB Copy
                </button>
              )}
            </div>

            {/* 힌트 텍스트 */}
            <div className="shrink-0" style={{ fontSize: 10, color: TXT3, padding: '5px 12px', borderBottom: `0.5px solid ${BORDER}` }}>
              {editMode === 'fcst'
                ? 'R/N 또는 ADR 선택 → + / − 클릭하면 체크된 세그먼트에 즉시 적용'
                : 'R/N, ADR 복수 선택 가능 → OTB Copy 클릭하면 OTB 값 복사'}
            </div>

            {/* 본문 — 세그먼트 편집 테이블 */}
            <div className="flex-1" style={{ minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
              {!fcstUpdateDate ? (
                <div style={{ padding: 16, fontSize: 11, color: TXT3 }}>상단 FCST 날짜를 선택하면 Forecast를 편집할 수 있습니다.</div>
              ) : fcstRows.length === 0 ? (
                <div style={{ padding: 16, fontSize: 11, color: TXT3 }}>해당 날짜의 Forecast 데이터가 없습니다.</div>
              ) : (
                <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', fontSize: 10, whiteSpace: 'nowrap', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: showOtb ? '22%' : '28%' }} />
                    <col style={{ width: showOtb ? '9%' : '12%' }} /><col style={{ width: showOtb ? '9%' : '12%' }} /><col style={{ width: showOtb ? '10%' : '12%' }} />
                    {showOtb && <><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '10%' }} /></>}
                    <col style={{ width: showOtb ? '9%' : '12%' }} /><col style={{ width: showOtb ? '9%' : '12%' }} /><col style={{ width: showOtb ? '10%' : '12%' }} />
                  </colgroup>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr style={{ color: TXT3, background: BG_BODY }}>
                      <th rowSpan={2} style={{ textAlign: 'left', padding: '4.4px 8px', fontWeight: 500, minWidth: 80, position: 'sticky', left: 0, background: BG_BODY }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <input type="checkbox" checked={fcstAllCodes.length > 0 && checkedSegs.length === fcstAllCodes.length}
                            onChange={e => setCheckedSegs(e.target.checked ? [...fcstAllCodes] : [])}
                            style={{ accentColor: PURPLE, cursor: 'pointer' }} />
                          세그먼트
                        </span>
                      </th>
                      <th colSpan={3} style={{ textAlign: 'center', padding: '3.3px 4px', fontWeight: 500, color: PURPLE, borderLeft: `0.5px solid ${BORDER}` }}>FORECAST</th>
                      {showOtb && <th colSpan={3} style={{ textAlign: 'center', padding: '3.3px 4px', fontWeight: 500, borderLeft: `0.5px solid ${BORDER}` }}>OTB</th>}
                      <th colSpan={3} style={{ textAlign: 'center', padding: '3.3px 4px', fontWeight: 500, borderLeft: `0.5px solid ${BORDER}` }}>GAP</th>
                    </tr>
                    <tr style={{ color: TXT3, background: BG_BODY, fontSize: 9 }}>
                      {([
                        [['R/N', 46], ['ADR', 55], ['REV', 60]],
                        ...(showOtb ? [[['R/N', 46], ['ADR', 55], ['REV', 60]]] : []),
                        [['ΔR/N', 46], ['ΔADR', 60], ['ΔREV', 60]],
                      ] as [string, number][][]).flatMap((g, gi) => g.map(([h, w], ci) => (
                        <th key={`${gi}-${ci}`} style={{ textAlign: 'right', padding: '2.2px 4px', fontWeight: 400, minWidth: w, borderLeft: ci === 0 ? `0.5px solid ${BORDER}` : undefined }}>{h}</th>
                      )))}
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: 12 }}>
                    {fcstEditRows.map((row, i) => {
                      if (row.kind === 'main') return (
                        <tr key={`m${i}`} style={{ height: 22, background: BG_BODY }}>
                          <td colSpan={showOtb ? 10 : 7} style={{ padding: '3.3px 8px', fontSize: 9, fontWeight: 600, color: TXT3, textTransform: 'uppercase', letterSpacing: '0.4px', borderTop: `0.5px solid ${BORDER}` }}>{row.name}</td>
                        </tr>
                      )
                      if (row.kind === 'mid') return (
                        <tr key={`d${i}`} style={{ height: 22 }}>
                          <td colSpan={showOtb ? 10 : 7} style={{ padding: '3.3px 8px', fontWeight: 600, color: TXT2, borderTop: `0.5px solid ${BORDER}` }}>{row.name}</td>
                        </tr>
                      )
                      const code = row.code
                      const rn = getFcstRn(code), adr = getFcstAdr(code)
                      const oRn = otbRnOf(code), oRev = otbRevOf(code), oAdr = oRn > 0 ? oRev / oRn : 0
                      const gRn = rn - oRn, gAdr = adr - oAdr, gRev = getFcstRev(code) - oRev
                      const edited = editedFcst[code] != null
                      const checked = checkedSegs.includes(code)
                      const editingRn  = editCell?.code === code && editCell.field === 'rn'
                      const editingAdr = editCell?.code === code && editCell.field === 'adr'
                      return (
                        <tr key={`s${i}`} style={{ borderTop: `0.5px solid ${BORDER}`, background: checked ? BG_INPUT : (edited ? 'var(--color-accent-dim)' : undefined) }}>
                          <td style={{ padding: '2.2px 4px 2.2px 8px', color: TXT, position: 'sticky', left: 0, background: checked ? BG_INPUT : BG_CARD }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <input type="checkbox" checked={checked} onChange={e => setCheckedSegs(prev => e.target.checked ? [...prev, code] : prev.filter(c => c !== code))}
                                style={{ accentColor: PURPLE, cursor: 'pointer', flexShrink: 0 }} />
                              {row.name}
                            </span>
                          </td>
                          <td style={{ padding: '2.2px 4px', textAlign: 'right', borderLeft: `0.5px solid ${BORDER}` }}>{editingRn ? editInput(code, 'rn', rn, 34) : editText(code, 'rn', fmtRN(rn))}</td>
                          <td style={{ padding: '2.2px 4px', textAlign: 'right' }}>{editingAdr ? editInput(code, 'adr', adr, 52) : editText(code, 'adr', fmtADR(adr))}</td>
                          <td style={{ padding: '2.2px 4px', textAlign: 'right', color: PURPLE }}>{fmtREV(getFcstRev(code))}</td>
                          {showOtb && (<>
                            <td style={{ padding: '2.2px 4px', textAlign: 'right', color: TXT2, borderLeft: `0.5px solid ${BORDER}` }}>{fmtRN(oRn)}</td>
                            <td style={{ padding: '2.2px 4px', textAlign: 'right', color: TXT2 }}>{fmtADR(oAdr)}</td>
                            <td style={{ padding: '2.2px 4px', textAlign: 'right', color: TXT2 }}>{fmtREV(oRev)}</td>
                          </>)}
                          <td style={{ padding: '2.2px 4px', textAlign: 'right', color: segGapColor(gRn), borderLeft: `0.5px solid ${BORDER}` }}>{fmtGap(gRn, 'rn')}</td>
                          <td style={{ padding: '2.2px 4px', textAlign: 'right', color: segGapColor(gAdr) }}>{fmtGap(gAdr, 'adr')}</td>
                          <td style={{ padding: '2.2px 4px', textAlign: 'right', color: segGapColor(gRev) }}>{fmtGap(gRev, 'rev')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 2, fontSize: 12 }}>
                    <tr style={{ background: BG_CARD, borderTop: `0.5px solid ${BORDER}`, fontWeight: 600 }}>
                      <td style={{ padding: '4.4px 8px', color: TXT, position: 'sticky', left: 0, background: BG_CARD }}>합계</td>
                      <td style={{ padding: '4.4px 4px', textAlign: 'right', color: PURPLE, borderLeft: `0.5px solid ${BORDER}` }}>{fmtRN(fcstTotalRn)}</td>
                      <td style={{ padding: '4.4px 4px', textAlign: 'right', color: PURPLE }}>{fmtADR(fcstTotalAdr)}</td>
                      <td style={{ padding: '4.4px 4px', textAlign: 'right', color: PURPLE }}>{fmtREV(fcstTotalRev)}</td>
                      {showOtb && (<>
                        <td style={{ padding: '4.4px 4px', textAlign: 'right', color: TXT2, borderLeft: `0.5px solid ${BORDER}` }}>{fmtRN(otbTotalRn)}</td>
                        <td style={{ padding: '4.4px 4px', textAlign: 'right', color: TXT2 }}>{fmtADR(otbTotalAdr)}</td>
                        <td style={{ padding: '4.4px 4px', textAlign: 'right', color: TXT2 }}>{fmtREV(otbTotalRev)}</td>
                      </>)}
                      <td style={{ padding: '4.4px 4px', textAlign: 'right', color: segGapColor(fcstTotalRn - otbTotalRn), borderLeft: `0.5px solid ${BORDER}` }}>{fmtGap(fcstTotalRn - otbTotalRn, 'rn')}</td>
                      <td style={{ padding: '4.4px 4px', textAlign: 'right', color: segGapColor(fcstTotalAdr - otbTotalAdr) }}>{fmtGap(fcstTotalAdr - otbTotalAdr, 'adr')}</td>
                      <td style={{ padding: '4.4px 4px', textAlign: 'right', color: segGapColor(fcstTotalRev - otbTotalRev) }}>{fmtGap(fcstTotalRev - otbTotalRev, 'rev')}</td>
                    </tr>
                    <tr style={{ background: BG_CARD, fontSize: 11 }}>
                      <td style={{ padding: '2.2px 8px', color: TXT3, position: 'sticky', left: 0, background: BG_CARD }}>OCC</td>
                      <td colSpan={3} style={{ padding: '2.2px 4px', textAlign: 'center', color: PURPLE, borderLeft: `0.5px solid ${BORDER}` }}>{fcstTotalOcc}%</td>
                      {showOtb && <td colSpan={3} style={{ padding: '2.2px 4px', textAlign: 'center', color: TXT2, borderLeft: `0.5px solid ${BORDER}` }}>{otbTotalOcc}%</td>}
                      <td colSpan={3} style={{ padding: '2.2px 4px', textAlign: 'center', color: segGapColor(fcstTotalOcc - otbTotalOcc), borderLeft: `0.5px solid ${BORDER}` }}>{fcstTotalOcc - otbTotalOcc === 0 ? '-' : `${fcstTotalOcc - otbTotalOcc > 0 ? '▲' : '▼'} ${Math.abs(fcstTotalOcc - otbTotalOcc)}%`}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* 초기화 / Forecast 저장 / OTB 컬럼 */}
            <div className="shrink-0" style={{ padding: '7px 10px', borderTop: `0.5px solid ${BORDER}`, display: 'flex', gap: 6 }}>
              <button onClick={handleFcstReset} disabled={editedCount === 0}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, borderRadius: 6, fontSize: 11, background: BG_INPUT, border: `0.5px solid ${BORDER}`, color: TXT2, cursor: editedCount === 0 ? 'not-allowed' : 'pointer', opacity: editedCount === 0 ? 0.4 : 1 }}>
                <RotateCcw size={12} />초기화
              </button>
              <button onClick={handleFcstSave} disabled={!canSave}
                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, borderRadius: 6, fontSize: 11, fontWeight: 500, background: PURPLE, border: 'none', color: '#fff', cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.4 }}>
                <Save size={12} />{fcstSaving ? '저장 중…' : `Forecast 저장${editedCount > 0 ? ` (${editedCount})` : ''}`}
              </button>
              <button onClick={() => setShowOtb(p => !p)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, borderRadius: 6, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer',
                  border: `0.5px solid ${showOtb ? '#00E5A0' : BORDER}`,
                  background: showOtb ? '#00E5A015' : BG_INPUT,
                  color: showOtb ? '#00E5A0' : TXT2 }}>
                <Columns3 size={12} />OTB
              </button>
            </div>
          </div>
        )}

        {/* 픽업 추천 적용 토스트 */}
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#0a2e1f', border: '1px solid #00E5A0', color: '#00E5A0',
          borderRadius: 6, padding: '6px 14px', fontSize: 11, whiteSpace: 'nowrap',
          pointerEvents: 'none', opacity: pickupToast ? 1 : 0, transition: 'opacity 0.25s',
        }}>
          {pickupToast ?? ''}
        </div>
      </div>
    </div>
  )
}
