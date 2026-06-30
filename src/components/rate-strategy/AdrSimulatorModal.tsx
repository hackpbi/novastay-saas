'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Sparkles, Lock, RotateCcw, Save, Columns3 } from 'lucide-react'
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
  const [otaFeePct, setOtaFeePct] = useState(15)
  const [showFcstPanel, setShowFcstPanel] = useState(false)
  const [showRoomPanel, setShowRoomPanel] = useState(false)
  const [editedFcst, setEditedFcst] = useState<Record<string, { rn: number; adr: number }>>({})
  const [fcstSaving, setFcstSaving] = useState(false)
  const [editCell, setEditCell] = useState<{ code: string; field: 'rn' | 'adr' } | null>(null)
  const [occFilter, setOccFilter] = useState(90)   // 고점유 퀵셀렉터 OTB OCC 필터
  const [editMode, setEditMode] = useState<'fcst' | 'otb'>('fcst')   // 일괄 편집 모드
  const [selectedFields, setSelectedFields] = useState<('rn' | 'adr')[]>([])
  const [modeOpen, setModeOpen] = useState(false)   // 모드 커스텀 드롭다운
  const modeDropRef = useRef<HTMLDivElement>(null)
  const [checkedSegs,  setCheckedSegs]  = useState<string[]>([])   // 체크된 segCode
  const [sellOverride, setSellOverride] = useState<Record<string, number>>({})   // 객실타입별 예상판매 수동값
  const [showOtb, setShowOtb] = useState(false)   // Forecast 패널 OTB 컬럼 표시(기본 숨김)

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
    enabled: isOpen && showFcstPanel && !!hotelId,
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
  const highOccDates = useMemo(() => {
    const by: Record<string, { otbRn: number; otbRev: number; fcstRn: number; fcstRev: number }> = {}
    for (const r of monthRows) {
      const o = by[r.business_date] ?? (by[r.business_date] = { otbRn: 0, otbRev: 0, fcstRn: 0, fcstRev: 0 })
      o.otbRn  += r.current_otb_rn ?? 0
      o.otbRev += r.current_otb_revenue ?? 0
      o.fcstRn += r.forecast_rn ?? 0
      o.fcstRev += r.forecast_revenue ?? 0
    }
    const rooms = effTotal
    return Object.entries(by).map(([d, v]) => {
      const otbOcc  = rooms > 0 ? Math.round((v.otbRn / rooms) * 100) : 0
      const fcstOcc = rooms > 0 ? Math.round((v.fcstRn / rooms) * 100) : 0
      const otbAdr  = v.otbRn > 0 ? v.otbRev / v.otbRn : 0
      const fcstAdr = v.fcstRn > 0 ? v.fcstRev / v.fcstRn : 0
      return { date: d, otbOcc, fcstOcc, dOcc: fcstOcc - otbOcc, dAdr: Math.round((fcstAdr - otbAdr) / 1000) }
    }).sort((a, b) => b.otbOcc - a.otbOcc)
  }, [monthRows, effTotal])
  const filteredHighOcc = useMemo(() => highOccDates.filter(d =>
    occFilter === 0 ? true : occFilter === 100 ? d.otbOcc === 100 : d.otbOcc >= occFilter
  ), [highOccDates, occFilter])

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

  // 세그먼트별 잔여(Forecast − OTB)를 채널별 합산 (simDate 기준, 편집값 반영)
  const segGaps = useMemo(() => {
    let directAvail = 0, otaAvail = 0, otherAvail = 0
    for (const r of monthRows) {
      if (r.business_date !== date) continue
      const fcRn = editedFcst[r.segmentation]?.rn ?? r.forecast_rn ?? 0   // 편집값 우선 → 슬라이더 자동 재계산
      const gap = Math.max(0, fcRn - (r.current_otb_rn ?? 0))
      if (gap <= 0) continue
      const ch = channelOf[r.segmentation] ?? 'other'
      if (ch === 'direct') directAvail += gap
      else if (ch === 'ota') otaAvail += gap
      else otherAvail += gap
    }
    return { directAvail, otaAvail, otherAvail }
  }, [monthRows, date, channelOf, editedFcst])

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

  // 날짜 변경 시 Forecast 편집값 초기화
  useEffect(() => { setEditedFcst({}); setEditCell(null); setCheckedSegs([]); setSellOverride({}) }, [date])

  // 모드 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modeDropRef.current && !modeDropRef.current.contains(e.target as Node)) setModeOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // 세그먼트 채널 잔여 비율로 OTA/다이렉트 슬라이더 자동 세팅 (이후 사용자 수동 조정 가능)
  useEffect(() => {
    const total = segGaps.directAvail + segGaps.otaAvail
    if (total <= 0) return   // 세그 데이터 없거나 잔여 0 → 기존 슬라이더 값 유지(fallback)
    setOtaPct(Math.round((segGaps.otaAvail / total) * 100))
  }, [segGaps])

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
  // 고점유 퀵셀렉터 GAP 표시 (0이면 '=')
  const hoGap = (v: number, unit: string) => (
    v === 0
      ? <span style={{ color: TXT3 }}>=</span>
      : <span style={{ color: v > 0 ? POS : RED }}>{v > 0 ? '▲ +' : '▼ '}{Math.abs(v)}{unit}</span>
  )

  const navBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: TXT2, width: 22, height: 22, cursor: 'pointer', fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const chanBox: React.CSSProperties = { flex: 1, minWidth: 0, background: BG_CARD, border: `0.5px solid ${BORDER}`, borderRadius: 7, padding: '5px 7px' }

  // ── Forecast 편집 패널 — 입력/저장/초기화 ──
  const segGapColor = (v: number) => (v > 0 ? POS : v < 0 ? RED : TXT3)
  const setEdit = (code: string, field: 'rn' | 'adr', val: number) => setEditedFcst(prev => ({
    ...prev,
    [code]: {
      rn:  field === 'rn'  ? val : (prev[code]?.rn  ?? getFcstRn(code)),
      adr: field === 'adr' ? val : (prev[code]?.adr ?? getFcstAdr(code)),
    },
  }))
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
      <div className="relative rounded-2xl overflow-hidden flex flex-row w-full" style={{ maxWidth: 400 + (showRoomPanel ? 200 : 0) + (showFcstPanel ? 700 : 0), transition: 'max-width 0.2s ease', border: `0.5px solid ${BORDER}`, height: '80vh', boxShadow: 'var(--shadow-elevated)' }}>
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
        <div className="flex flex-col" style={{ flex: '0 0 auto', width: 360, background: BG_BODY, height: '100%', overflow: 'hidden' }}>
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

          {/* BAR Rate 입력 + Recommended BAR (통합 카드) */}
          <div className="shrink-0" style={{ margin: '10px 14px 8px', background: BG_CARD, border: `0.5px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
            {/* 줄 1: BAR 입력 + 배지 (rec 제외) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: recState?.kind === 'rec' ? `0.5px solid ${BORDER}` : 'none' }}>
              <span style={{ fontSize: 11, color: TXT3, whiteSpace: 'nowrap' }}>BAR Rate</span>
              <span style={{ fontSize: 11, color: TXT3, whiteSpace: 'nowrap' }}>{Math.round(effBase / 1000)}K →</span>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <input type="number" className="fc-spin-hide" value={Math.round(barRaw / 1000)} onChange={e => setBarRaw(Math.max(0, (Number(e.target.value) || 0) * 1000))}
                  style={{ background: BG_INPUT, border: `0.5px solid ${BORDER_ACCENT}`, borderRadius: 6, color: MINT, fontSize: 14, fontWeight: 500, width: 60, textAlign: 'right', padding: '3px 22px 3px 7px', outline: 'none' }} />
                <span style={{ position: 'absolute', right: 7, fontSize: 11, color: TXT3, pointerEvents: 'none' }}>K</span>
              </div>
              {fcst && recState && recState.kind !== 'rec' && (
                <div style={{ marginLeft: 'auto' }}>
                  {recState.kind === 'achievable' && (
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap', background: SUCCESS_BG, color: POS, border: `0.5px solid ${SUCCESS_BD}` }}>✓ Achievable</span>
                  )}
                  {recState.kind === 'review' && (
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap', background: 'rgba(245,166,35,0.10)', color: WARN, border: '0.5px solid rgba(245,166,35,0.30)' }}>⚠ FC ADR 재검토</span>
                  )}
                  {recState.kind === 'soldout' && (
                    <span style={{ fontSize: 11, color: TXT3, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={11} />매진</span>
                  )}
                </div>
              )}
            </div>
            {/* 줄 2: Recommended BAR — rec만 */}
            {recState?.kind === 'rec' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: SUCCESS_BG }}>
                <Sparkles size={11} style={{ color: POS }} />
                <span style={{ fontSize: 11, color: POS }}>Recommended BAR</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: POS }}>{Math.round(recState.bar / 1000)}K</span>
                <button onClick={() => setBarRaw(recState.bar)}
                  style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap', background: POS, color: '#0a0a0a', border: 'none', cursor: 'pointer' }}>
                  Apply
                </button>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500, color: RED, whiteSpace: 'nowrap' }}>▼ {revGap}K short</span>
              </div>
            )}
          </div>

          {/* 채널 슬라이더 3개 가로 */}
          <div className="shrink-0" style={{ display: 'flex', gap: 5, padding: '7px 14px', borderBottom: `0.5px solid ${BORDER}`, overflow: 'hidden' }}>
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

          {/* 본문 (고정 상단 + 잔여 객실타입 현황이 하단 채움) */}
          <div className="flex-1 flex flex-col" style={{ minHeight: 0, overflowY: 'auto' }}>
            <div>
              {/* 달성률 바 3개 — Forecast 있을 때만 */}
              {fcst && ach && (
                <div style={{ display: 'flex', gap: 5, margin: '0 14px 11.2px' }}>
                  {(['OCC', 'ADR', 'REV'] as const).map(label => {
                    const pct = ach[label]
                    const c  = pct >= 100 ? POS : pct >= 80 ? WARN : RED
                    return (
                      <div key={label} style={{ flex: 1, background: BG_CARD, border: `0.5px solid ${BORDER}`, borderRadius: 7, padding: '5px 7px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: TXT3 }}>{label}</span>
                          <span style={{ fontSize: 9, fontWeight: 500, color: c }}>{Math.min(pct, 999)}%</span>
                        </div>
                        <div style={{ height: 3, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: 3, borderRadius: 2, width: `${Math.min(pct, 100)}%`, background: c, transition: 'width 0.2s' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 고점유 날짜 퀵셀렉터 — 하단 빈 공간 채움 */}
            <div style={{ flex: 1, minHeight: 0, margin: '6px 14px 10px', border: `0.5px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '6px 12px', borderBottom: `0.5px solid ${BORDER}`, fontSize: 10, color: TXT3, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>고점유 날짜</div>
              {/* OCC 필터 칩 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: `0.5px solid ${BORDER}`, flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: TXT3, whiteSpace: 'nowrap' }}>OTB OCC</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[{ label: '전체', val: 0 }, { label: '90%+', val: 90 }, { label: '95%+', val: 95 }, { label: '100%', val: 100 }].map(({ label, val }) => (
                    <button key={val} onClick={() => setOccFilter(val)}
                      style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap',
                        background: occFilter === val ? 'var(--color-accent-dim)' : 'transparent',
                        border: `0.5px solid ${occFilter === val ? BORDER_ACCENT : BORDER}`,
                        color: occFilter === val ? MINT : TXT3 }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* 2행 헤더 */}
              <div style={{ display: 'grid', gridTemplateColumns: '92px 56px 112px', padding: '3px 12px', borderBottom: `0.5px solid ${BORDER}`, flexShrink: 0 }}>
                <span style={{ fontSize: 9, color: TXT3 }} />
                <span style={{ fontSize: 9, color: TXT3, textAlign: 'right' }}>OTB</span>
                <span style={{ fontSize: 9, color: PURPLE, textAlign: 'center', borderBottom: `0.5px solid ${PURPLE}40`, paddingBottom: 2 }}>FC − OTB</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '92px 56px 56px 56px', padding: '3px 12px', borderBottom: `0.5px solid ${BORDER}`, flexShrink: 0 }}>
                <span style={{ fontSize: 9, color: TXT3 }}>날짜</span>
                <span style={{ fontSize: 9, color: TXT3, textAlign: 'right' }}>OCC</span>
                <span style={{ fontSize: 9, color: PURPLE, textAlign: 'right', opacity: 0.5 }}>ΔOCC</span>
                <span style={{ fontSize: 9, color: PURPLE, textAlign: 'right', opacity: 0.5 }}>ΔADR</span>
              </div>
              {/* 날짜 목록 */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {filteredHighOcc.length === 0 ? (
                  <div style={{ padding: 14, textAlign: 'center', fontSize: 11, color: TXT3 }}>해당 조건의 날짜가 없습니다</div>
                ) : filteredHighOcc.map(d => {
                  const isActive = d.date === date
                  const occColor = d.otbOcc >= 95 ? POS : d.otbOcc >= 90 ? WARN : TXT2
                  return (
                    <div key={d.date} onClick={() => onDateChange(d.date)}
                      style={{ display: 'grid', gridTemplateColumns: '92px 56px 56px 56px', alignItems: 'center', padding: '5px 12px',
                        borderTop: `0.5px solid ${BORDER}`, cursor: 'pointer',
                        background: isActive ? SUCCESS_BG : 'transparent',
                        borderLeft: `2px solid ${isActive ? MINT : 'transparent'}` }}>
                      <span style={{ fontSize: 11, color: isActive ? MINT : TXT2 }}>{formatDate(d.date)}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, textAlign: 'right', color: occColor }}>{d.otbOcc}%</span>
                      <span style={{ fontSize: 11, textAlign: 'right' }}>{hoGap(d.dOcc, '%')}</span>
                      <span style={{ fontSize: 11, textAlign: 'right' }}>{hoGap(d.dAdr, 'K')}</span>
                    </div>
                  )
                })}
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
      </div>
    </div>
  )
}
