'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Settings } from 'lucide-react'
import type { PickupRow } from '@/hooks/usePickupData'
import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import { buildSegTable, type SegTableRow } from '@/utils/segmentationTable'
import { useLyPacing } from '@/hooks/useLyPacing'
import { useHotel } from '@/contexts/HotelContext'
import { supabase } from '@/lib/supabase'
import { WEEKDAY_KR, inMonth } from '@/utils/pickupPageUtils'
import { getDayColor } from '@/utils/dateUtils'
import { FmtVal } from '@/utils/FmtVal'
import DatePicker from '@/components/DatePicker'

// 날짜 문자열 직접 파싱 (KST 이슈 없음)
const inDay = (dateStr: string, year: number, month: number, day: number) => {
  const d = new Date(dateStr)
  return d.getFullYear() === year && d.getMonth() + 1 === month && d.getDate() === day
}

type AccStat = {
  otbNights: number; otbRevenue: number
  vsNights:  number; vsRevenue:  number
  puNights:  number; puRevenue:  number
}

export default function MarketPickupDayModal({
  open, onClose, year: propYear, month: propMonth, day, schema, pickupRows, roomCount, defaultTab, otbDate, vsDate, otbDates = [], onDateChange,
}: {
  open:          boolean
  onClose:       () => void
  year:          number
  month:         number   // 0-based
  day:           number   // 1-based
  schema:        MarketSchemaRow[]
  pickupRows:    PickupRow[]
  roomCount:     number
  defaultTab?:   'pickup' | 'otb'
  otbDate:       string   // 'YYYY-MM-DD'
  vsDate:        string   // 'YYYY-MM-DD'
  otbDates?:     string[]
  onDateChange?: (otbDate: string, vsDate: string) => void
}) {
  const [selType, setSelType] = useState<'pickup' | 'otb'>('pickup')
  const [selMain, setSelMain] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'otb' | 'ly'>('otb')     // OTB & Pick-up / 전년 비교
  const [lyMode,    setLyMode]    = useState<'day' | 'period'>('day')  // 전년동일자(v1) / 전년동기간(v2)
  const [lyAccSource, setLyAccSource] = useState<'otb' | 'ly' | 'gap'>('gap')  // 전년 비교 어카운트 패널 소스
  const [lyColMode, setLyColMode] = useState(true)   // 작년 OTB 컬럼: true=전년OTB(pacing) / false=전년마감(a01 실적)
  // ── 금액 단위 설정 (ADR/REV 각각) — 셀엔 접미사 없이 숫자만, 단위는 하단 안내로 표시 ──
  const [adrUnit, setAdrUnit] = useState<'won' | 'k' | 'm'>('k')   // ADR 기본: 천원
  const [revUnit, setRevUnit] = useState<'won' | 'k' | 'm'>('m')   // REV 기본: 백만원
  const [unitPanelOpen, setUnitPanelOpen] = useState(false)
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''
  const [localOtbDate, setLocalOtbDate] = useState(otbDate)
  const [localVsDate,  setLocalVsDate]  = useState(vsDate)
  const [localDay,     setLocalDay]     = useState(day)
  const [year,  setYear]  = useState(propYear)     // 월합계 모드 ‹ › 네비용 로컬 상태
  const [month, setMonth] = useState(propMonth)    // 0-based
  const [viewMode,     setViewMode]     = useState<'day' | 'month'>('day')   // 일자별 / 월합계
  // day 모드: 해당 일자만 / month 모드: 해당 월 전체
  const matchDate = (bd: string) => viewMode === 'month' ? inMonth(bd, year, month + 1) : inDay(bd, year, month + 1, localDay)

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // open 시 로컬 상태(날짜·일자·탭·선택) 초기화
  useEffect(() => {
    if (open) {
      setLocalOtbDate(otbDate)
      setLocalVsDate(vsDate)
      setLocalDay(day)
      setYear(propYear)
      setMonth(propMonth)
      setViewMode('day')
      setSelType('pickup')
      setSelMain(null)
      setActiveTab('otb')
      setLyMode('day')
      setLyAccSource('gap')
      setLyColMode(true)
    }
  }, [open, otbDate, vsDate, day, propYear, propMonth, defaultTab])

  // 날짜 변경 시 페이지에 반영 (onDateChange 있을 때만)
  useEffect(() => {
    if (localOtbDate !== otbDate || localVsDate !== vsDate) {
      onDateChange?.(localOtbDate, localVsDate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOtbDate, localVsDate])

  // 선택된 세그(main/sub)의 어카운트별 집계 — 훅은 early-return 위에서 호출
  const accountRows = useMemo(() => {
    if (!open || !selMain) return []
    const selSchema = schema.find(s => s.id === selMain)
    if (!selSchema) return []
    // main 클릭 → 자식 sub들의 segmentation 코드 / sub 클릭 → 자신의 코드
    const codes = selSchema.level === 'main'
      ? schema.filter(s => s.parent_id === selMain).flatMap(s => s.segmentation ?? [])
      : (selSchema.segmentation ?? [])
    const codeSet = new Set(codes)

    const map = new Map<string, AccStat>()
    for (const r of pickupRows) {
      if (!matchDate(r.business_date)) continue
      if (!codeSet.has(r.segmentation)) continue
      const acc = r.account_name || '(미지정)'
      if (!map.has(acc)) map.set(acc, { otbNights: 0, otbRevenue: 0, vsNights: 0, vsRevenue: 0, puNights: 0, puRevenue: 0 })
      const a = map.get(acc)!
      a.otbNights  += r.otb_nights     ?? 0
      a.otbRevenue += r.otb_revenue    ?? 0
      a.vsNights   += r.vs_nights  ?? 0
      a.vsRevenue  += r.vs_revenue ?? 0
      a.puNights   += r.pu_nights      ?? 0
      a.puRevenue  += r.pu_revenue     ?? 0
    }

    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        ...v,
        puAdr: v.otbNights > 0 && v.vsNights > 0
          ? Math.round(v.otbRevenue / v.otbNights) - Math.round(v.vsRevenue / v.vsNights)
          : 0,
        otbAdr: v.otbNights > 0 ? Math.round(v.otbRevenue / v.otbNights) : 0,
      }))
      .filter(a => a.otbNights > 0 || a.puNights !== 0)
      .sort((a, b) => Math.abs(b.puNights) - Math.abs(a.puNights))
  }, [open, selMain, schema, pickupRows, year, month, localDay, viewMode])

  // ── 전년(LY) 비교 — useLyPacing(v1=전년동일자 / v2=전년동기간), 해당 일자 필터 ──
  const { data: lyPacing } = useLyPacing(lyMode === 'day' ? 'v1' : 'v2')
  // 스키마 id별 세그 코드 (main=자식 코드 합집합 / sub=자기 코드) — accountRows와 동일 규칙
  const codesBySchemaId = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const s of schema) {
      m[s.id] = s.level === 'main'
        ? schema.filter(c => c.parent_id === s.id).flatMap(c => c.segmentation ?? [])
        : (s.segmentation ?? [])
    }
    return m
  }, [schema])
  // 해당 일자 코드별 현재 OTB / 작년 OTB 집계 (lyPacing 단일 소스 → GAP 일관성)
  const lyByCode = useMemo(() => {
    const m: Record<string, { otbN: number; otbR: number; lyN: number; lyR: number }> = {}
    for (const r of (lyPacing ?? [])) {
      if (!matchDate(r.business_date)) continue
      const c = m[r.segmentation] ?? (m[r.segmentation] = { otbN: 0, otbR: 0, lyN: 0, lyR: 0 })
      c.otbN += r.otb_nights ?? 0; c.otbR += r.otb_revenue ?? 0
      c.lyN  += r.ly_nights  ?? 0; c.lyR  += r.ly_revenue  ?? 0
    }
    return m
  }, [lyPacing, year, month, localDay, viewMode])
  // 전년마감(a01_actual_daily 실적) 원본 행 — lyColMode=false일 때만 조회 (day=단순-1년 / period=c06 yoy_match)
  const { data: lyFinalRows = [] } = useQuery({
    queryKey: ['mp-ly-final', hotelId, year, month, localDay, lyMode, viewMode],
    enabled: open && !lyColMode && !!hotelId,
    queryFn: async () => {
      const pad = (n: number) => String(n).padStart(2, '0')
      const sel = 'segmentation, account_name, nights, room_revenue'
      if (viewMode === 'month') {
        // 월합계: 전년 동월 전체 (day=단순-1년 월 / period=해당 월 각 일자의 yoy_match 모음)
        const lastDay = new Date(year, month + 1, 0).getDate()
        let lyDates: string[]
        if (lyMode === 'period') {
          const curStart = `${year}-${pad(month + 1)}-01`
          const curEnd = `${year}-${pad(month + 1)}-${pad(lastDay)}`
          const { data: cal } = await (supabase as any).from('c06_calendar')
            .select('yoy_match').gte('date', curStart).lte('date', curEnd)
          lyDates = (Array.isArray(cal) ? cal : []).map((c: any) => c?.yoy_match).filter(Boolean)
        } else {
          const lyLast = new Date(year - 1, month + 1, 0).getDate()
          lyDates = Array.from({ length: lyLast }, (_, i) => `${year - 1}-${pad(month + 1)}-${pad(i + 1)}`)
        }
        if (lyDates.length === 0) return []
        const { data } = await (supabase as any).from('a01_actual_daily')
          .select(sel).eq('hotel_id', hotelId).in('business_date', lyDates)
        return (data ?? []) as { segmentation: string; account_name: string | null; nights: number; room_revenue: number }[]
      }
      const curDate = `${year}-${pad(month + 1)}-${pad(localDay)}`
      let lyDate = `${year - 1}-${pad(month + 1)}-${pad(localDay)}`   // day: 단순 -1년
      if (lyMode === 'period') {
        const { data: cal } = await (supabase as any).from('c06_calendar').select('yoy_match').eq('date', curDate).limit(1)
        const ym = Array.isArray(cal) ? cal[0]?.yoy_match : null
        if (ym) lyDate = ym
      }
      const { data } = await (supabase as any).from('a01_actual_daily')
        .select(sel).eq('hotel_id', hotelId).eq('business_date', lyDate)
      return (data ?? []) as { segmentation: string; account_name: string | null; nights: number; room_revenue: number }[]
    },
  })
  // 세그 코드별 전년마감 집계 (테이블 작년 OTB 컬럼용)
  const lyFinalByCode = useMemo(() => {
    const m: Record<string, { lyN: number; lyR: number }> = {}
    for (const r of lyFinalRows) {
      const c = m[r.segmentation] ?? (m[r.segmentation] = { lyN: 0, lyR: 0 })
      c.lyN += r.nights ?? 0; c.lyR += r.room_revenue ?? 0
    }
    return m
  }, [lyFinalRows])
  // 선택 세그 어카운트별 현재 OTB / 작년 OTB / GAP — 전년 비교 탭 우측 패널 (소스별 표시)
  const lyAccountRows = useMemo(() => {
    if (!open || !selMain) return []
    const codeSet = new Set(codesBySchemaId[selMain] ?? [])
    // 현재 OTB(항상 pacing)
    const otbMap = new Map<string, { otbN: number; otbR: number }>()
    for (const r of (lyPacing ?? [])) {
      if (!matchDate(r.business_date)) continue
      if (!codeSet.has(r.segmentation)) continue
      const acc = r.account_name || '(미지정)'
      const a = otbMap.get(acc) ?? { otbN: 0, otbR: 0 }
      a.otbN += r.otb_nights ?? 0; a.otbR += r.otb_revenue ?? 0
      otbMap.set(acc, a)
    }
    // 작년 OTB: lyColMode=true → pacing ly / false → 전년마감(a01)
    const lyMap = new Map<string, { lyN: number; lyR: number }>()
    if (lyColMode) {
      for (const r of (lyPacing ?? [])) {
        if (!matchDate(r.business_date)) continue
        if (!codeSet.has(r.segmentation)) continue
        const acc = r.account_name || '(미지정)'
        const a = lyMap.get(acc) ?? { lyN: 0, lyR: 0 }
        a.lyN += r.ly_nights ?? 0; a.lyR += r.ly_revenue ?? 0
        lyMap.set(acc, a)
      }
    } else {
      for (const r of lyFinalRows) {
        if (!codeSet.has(r.segmentation)) continue
        const acc = r.account_name || '(미지정)'
        const a = lyMap.get(acc) ?? { lyN: 0, lyR: 0 }
        a.lyN += r.nights ?? 0; a.lyR += r.room_revenue ?? 0
        lyMap.set(acc, a)
      }
    }
    const names = new Set<string>([...otbMap.keys(), ...lyMap.keys()])
    const list = Array.from(names).map(name => {
      const o = otbMap.get(name) ?? { otbN: 0, otbR: 0 }
      const l = lyMap.get(name) ?? { lyN: 0, lyR: 0 }
      const otbAdr = o.otbN > 0 ? Math.round(o.otbR / o.otbN) : 0
      const lyAdr  = l.lyN  > 0 ? Math.round(l.lyR  / l.lyN)  : 0
      return {
        name,
        otbN: o.otbN, otbAdr, otbR: o.otbR,
        lyN:  l.lyN,  lyAdr,  lyR:  l.lyR,
        gapN: o.otbN - l.lyN, gapAdr: otbAdr - lyAdr, gapR: o.otbR - l.lyR,
      }
    })
    // 소스별 정렬/필터: 해당 소스 R/N 크기순, 소스 값이 모두 0인 행 제외
    const keyN = lyAccSource === 'otb' ? 'otbN' : lyAccSource === 'ly' ? 'lyN' : 'gapN'
    const keyR = lyAccSource === 'otb' ? 'otbR' : lyAccSource === 'ly' ? 'lyR' : 'gapR'
    return list
      .filter(a => a[keyN] !== 0 || a[keyR] !== 0)
      .sort((a, b) => Math.abs(b[keyN]) - Math.abs(a[keyN]))
  }, [open, selMain, codesBySchemaId, lyPacing, lyFinalRows, lyColMode, year, month, localDay, lyAccSource, viewMode])

  if (!open) return null

  const { rows, summary } = buildSegTable({ schema, pickup: pickupRows, year, month: month + 1, roomCount, day: viewMode === 'month' ? undefined : localDay })
  const selRow = rows.find(r => r.id === selMain)

  // 해당 날짜에 픽업(pu_nights≠0)이 하나라도 있으면 PICK-UP 컬럼 표시, 없으면 OTB만
  const hasPickup = (pickupRows ?? []).some(r => matchDate(r.business_date) && (r.pu_nights ?? 0) !== 0)

  // 행(세그)별 전년 비교 값 — 현재 OTB / 작년 OTB / GAP (codesBySchemaId + lyByCode)
  const lyForRow = (rowId: string) => {
    const codes = codesBySchemaId[rowId] ?? []
    let otbN = 0, otbR = 0, lyN = 0, lyR = 0
    for (const code of codes) {
      const c = lyByCode[code]
      if (c) { otbN += c.otbN; otbR += c.otbR }
      // 작년 OTB 값: lyColMode=true → 전년OTB(pacing), false → 전년마감(a01 실적)
      if (lyColMode) { if (c) { lyN += c.lyN; lyR += c.lyR } }
      else { const f = lyFinalByCode[code]; if (f) { lyN += f.lyN; lyR += f.lyR } }
    }
    const otbAdr = otbN > 0 ? Math.round(otbR / otbN) : 0
    const lyAdr  = lyN  > 0 ? Math.round(lyR  / lyN)  : 0
    return { otbN, otbAdr, otbR, lyN, lyAdr, lyR, gapN: otbN - lyN, gapAdr: otbAdr - lyAdr, gapR: otbR - lyR }
  }
  // HOU(House Use) 코드 식별 — lyComparisonSegTable 방식과 동일 (Total 합산에서 제외)
  const houCodes = new Set<string>()
  for (const s of schema) {
    if (s.segmentation.includes('HOU')) {
      for (const code of s.segmentation) houCodes.add(code)
    }
  }
  // 전년 비교 합계 — HOU 제외, leaf 행(non-main)만 합산 (lyComparisonSegTable 방식과 동일)
  const lyTotal = rows
    .filter(r => r.level !== 'main' && !(codesBySchemaId[r.id] ?? []).some(c => houCodes.has(c)))
    .reduce((t, r) => {
      const v = lyForRow(r.id)
      return { otbN: t.otbN + v.otbN, otbR: t.otbR + v.otbR, lyN: t.lyN + v.lyN, lyR: t.lyR + v.lyR }
    }, { otbN: 0, otbR: 0, lyN: 0, lyR: 0 })
  const lyTotOtbAdr = lyTotal.otbN > 0 ? Math.round(lyTotal.otbR / lyTotal.otbN) : 0
  const lyTotLyAdr  = lyTotal.lyN  > 0 ? Math.round(lyTotal.lyR  / lyTotal.lyN)  : 0
  // 전년 비교 컬럼(현재 OTB/작년 OTB/GAP) 클릭 → 세그 선택 + 어카운트 소스 지정 (같은 세그·소스 재클릭 시 해제)
  const selectLy = (id: string, src: 'otb' | 'ly' | 'gap') => {
    if (selMain === id && lyAccSource === src) setSelMain(null)
    else { setSelMain(id); setLyAccSource(src) }
  }

  // 월합계 모드 월 이동 (0-based month, 연도 경계 처리 · 이동 시 localDay=1 리셋)
  const handlePrevMonth = () => { setLocalDay(1); setMonth(m => { if (m === 0) { setYear(y => y - 1); return 11 } return m - 1 }) }
  const handleNextMonth = () => { setLocalDay(1); setMonth(m => { if (m === 11) { setYear(y => y + 1); return 0 } return m + 1 }) }

  const localDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(localDay).padStart(2, '0')}`
  // OTB ~ vs 일수 차 (픽업 요약 문구용)
  const diffDays = (() => {
    if (!localOtbDate || !localVsDate) return 1
    const o = new Date(localOtbDate).getTime(), v = new Date(localVsDate).getTime()
    if (Number.isNaN(o) || Number.isNaN(v)) return 1
    const d = Math.round((o - v) / 86400000)
    return d > 0 ? d : 1
  })()

  // ── OCC / Rev.PAR 분모 — 월합계 모드는 가용 객실수 × 일수 (일자 모드는 일수 1) ──
  // buildSegTable(summary.occ/revpar)는 이미 일수 반영됨. 아래는 그 외 인라인 계산(픽업·전년비교)용.
  const occDays    = viewMode === 'month' ? new Date(year, month + 1, 0).getDate()     : 1  // 당해 월 일수
  const occLyDays  = viewMode === 'month' ? new Date(year - 1, month + 1, 0).getDate() : 1  // 전년 동월 일수(윤년 반영)
  const occDenom   = (roomCount || 1) * occDays    // 당해(현재 OTB·픽업·GAP) 분모
  const occLyDenom = (roomCount || 1) * occLyDays  // 전년 OTB 분모

  // ── 포맷 헬퍼 ───────────────────────────────────────────────────────────────
  // 금액 단위 변환 — 원/천원/백만원 (셀엔 접미사 없이 숫자만, 단위는 하단 안내 텍스트로 표시)
  const unitLabel  = (u: 'won' | 'k' | 'm') => u === 'won' ? '원' : u === 'k' ? '천원' : '백만원'
  const fmtUnitNum = (v: number, u: 'won' | 'k' | 'm') =>
    u === 'won' ? Math.round(v).toLocaleString()
    : u === 'k' ? Math.round(v / 1000).toLocaleString()
    : (Math.round(v / 1e5) / 10).toLocaleString()
  const fmtPuRn  = (v: number) => v === 0 ? '—' : `${v > 0 ? '+' : ''}${Math.round(v)}`
  const fmtPuAdr = (v: number, valid: boolean) => !valid || v === 0 ? '—' : `${v > 0 ? '+' : ''}${fmtUnitNum(v, adrUnit)}`
  const fmtPuRev = (v: number) => v === 0 ? '—' : `${v > 0 ? '+' : ''}${fmtUnitNum(v, revUnit)}`
  const fmtOtbRn  = (v: number) => v === 0 ? '—' : v.toLocaleString()
  const fmtOtbAdr = (v: number) => v === 0 ? '—' : fmtUnitNum(v, adrUnit)
  const fmtOtbRev = (v: number) => v === 0 ? '—' : fmtUnitNum(v, revUnit)
  const puColor   = (v: number) => v > 0 ? '#00B883' : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
  // 전년 비교 GAP 포맷/색
  const gapColor   = (v: number) => v > 0 ? '#00E5A0' : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
  const fmtGapRn   = (v: number) => v === 0 ? '—' : `${v > 0 ? '+' : ''}${v}`
  const fmtGapAdrK = (v: number) => Math.abs(v) < 500 ? '—' : `${v > 0 ? '+' : ''}${fmtUnitNum(v, adrUnit)}`
  const fmtGapRevM = (v: number) => Math.abs(v) < 50000 ? '—' : `${v > 0 ? '+' : ''}${fmtUnitNum(v, revUnit)}`
  const lyGray = 'rgba(255,255,255,0.45)'
  // 단위 설정 패널의 한 줄 (ADR / REV) — 원/천원/백만원 선택
  const renderUnitRow = (label: string, val: 'won' | 'k' | 'm', onPick: (u: 'won' | 'k' | 'm') => void) => (
    <div style={{ marginBottom: label === 'ADR' ? 8 : 0 }}>
      <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['won', 'k', 'm'] as const).map(u => (
          <div
            key={u}
            onClick={() => onPick(u)}
            style={{
              flex: 1, textAlign: 'center', padding: '5px 6px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
              color: val === u ? '#00E5A0' : '#ccc',
              background: val === u ? 'rgba(0,229,160,0.1)' : 'transparent',
              border: `0.5px solid ${val === u ? 'rgba(0,229,160,0.3)' : 'rgba(255,255,255,0.08)'}`,
              whiteSpace: 'nowrap',
            }}
          >
            {unitLabel(u)}
          </div>
        ))}
      </div>
    </div>
  )

  // ── c05 스키마 기반 세그 색상 (이 모달은 항상 다크모드) ──────────────────────────
  const segTextColor = (r: SegTableRow) => r.fontDarkColor ?? 'var(--color-text-primary)'
  const segBgColor   = (r: SegTableRow) =>
    r.bgDarkColor ?? (r.level === 'main' ? '#1A1F2E' : r.level === 'mid' ? '#15192A' : 'transparent')
  // 세그 숫자: 양수 → 세그 폰트색 / 음수 → 빨강 / 0 → 흐림
  const numColor    = (v: number, r: SegTableRow) =>
    v > 0 ? (r.fontDarkColor ?? 'var(--color-text-primary)') : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
  const otbNumColor = (r: SegTableRow) =>
    r.otbNights > 0 ? (r.fontDarkColor ?? 'var(--color-text-primary)') : 'rgba(255,255,255,0.25)'
  // 어카운트 숫자: 선택 세그(selRow)의 폰트색 기준
  const accNumColor = (v: number) =>
    v > 0 ? (selRow?.fontDarkColor ?? 'var(--color-text-primary)') : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
  const accOtbColor = (otbN: number) =>
    otbN > 0 ? (selRow?.fontDarkColor ?? 'var(--color-text-primary)') : 'rgba(255,255,255,0.25)'

  // OCC / Rev.PAR 픽업 색상 (양수=흰색 / 음수=빨강 / 0=흐림)
  const occPuVal      = summary.puNights / (roomCount || 1) * 100
  const occPuColor    = occPuVal > 0 ? 'var(--color-text-primary)' : occPuVal < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
  const revparPuColor = summary.puRevenue > 0 ? 'var(--color-text-primary)' : summary.puRevenue < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'

  const segHeadTh: React.CSSProperties = { textAlign: 'right', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)' }
  const accHeadTh: React.CSSProperties = { textAlign: 'right', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }

  // 어카운트 — 현재 탭 기준 R/N·ADR·REV 모두 0이면 제외 + 합계
  const accVisible = accountRows.filter(a => selType === 'pickup'
    ? (a.puNights !== 0 || a.puAdr !== 0 || a.puRevenue !== 0)
    : (a.otbNights !== 0 || a.otbAdr !== 0 || a.otbRevenue !== 0))
  const accTotal = accVisible.reduce((t, a) => ({
    puNights:   t.puNights   + a.puNights,
    puRevenue:  t.puRevenue  + a.puRevenue,
    otbNights:  t.otbNights  + a.otbNights,
    otbRevenue: t.otbRevenue + a.otbRevenue,
  }), { puNights: 0, puRevenue: 0, otbNights: 0, otbRevenue: 0 })
  const accTotalOtbAdr = accTotal.otbNights > 0 ? Math.round(accTotal.otbRevenue / accTotal.otbNights) : 0

  // 통합 세그 테이블 렌더 — SEGMENT 1컬럼 + OTB(R/N·ADR·REV) + Pick-up(R/N·ADR·REV)
  const DIV = '#1e1e1e'   // OTB / Pick-up 세로 구분선
  const stickyTop0 = { position: 'sticky', top: 0, background: '#000000', zIndex: 2 } as React.CSSProperties
  const stickyTop24 = { position: 'sticky', top: 24, background: '#000000', zIndex: 2 } as React.CSSProperties
  const renderUnifiedTable = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        {/* 그룹 헤더 */}
        <tr>
          <th style={{ ...stickyTop0, textAlign: 'left', padding: '6px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>SEGMENT</th>
          <th colSpan={3} style={{ ...stickyTop0, textAlign: 'center', padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#5B8DEF', letterSpacing: '0.07em', background: '#0f0f0f', borderLeft: `1px solid ${DIV}`, borderBottom: '2px solid #5B8DEF' }}>OTB</th>
          {hasPickup && (
          <th colSpan={3} style={{ ...stickyTop0, textAlign: 'center', padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#00E5A0', letterSpacing: '0.07em', background: '#0f0f0f', borderLeft: `1px solid ${DIV}`, borderBottom: '2px solid #00E5A0' }}>PICK-UP</th>
          )}
        </tr>
        {/* 서브 헤더 */}
        <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
          <th style={{ ...stickyTop24, padding: '4px 12px 6px' }} />
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => (
            <th key={`otb-${h}`} style={{ ...segHeadTh, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>
          ))}
          {hasPickup && (['R/N', 'ADR', 'REV'] as const).map((h, i) => (
            <th key={`pu-${h}`} style={{ ...segHeadTh, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const isSub     = r.level === 'sub'   // mid는 main과 동일 처리(들여쓰기 X)
          const adrValid  = r.otbNights > 0 && (r.otbNights - r.puNights) > 0
          const otbActive = selMain === r.id && selType === 'otb'
          const puActive  = selMain === r.id && selType === 'pickup'
          const selOtb = () => { if (otbActive) { setSelMain(null) } else { setSelMain(r.id); setSelType('otb') } }
          const selPu  = () => { if (puActive)  { setSelMain(null) } else { setSelMain(r.id); setSelType('pickup') } }
          return (
            <tr key={r.id} style={{ background: selMain === r.id ? 'rgba(0,229,160,0.06)' : segBgColor(r), borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: isSub ? '5px 12px 5px 24px' : '7px 12px', color: segTextColor(r), fontWeight: r.isBold ? 600 : 400, boxShadow: selMain === r.id ? 'inset 3px 0 0 #00E5A0' : undefined }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {isSub && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>└</span>}
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: r.bgDarkColor || '#888', flexShrink: 0 }} />
                  {r.name}
                </span>
              </td>
              {/* OTB */}
              <td onClick={selOtb} style={{ padding: '5px 12px', textAlign: 'right', color: otbNumColor(r), cursor: 'pointer', borderLeft: `1px solid ${otbActive ? '#00E5A0' : DIV}` }}>{fmtOtbRn(r.otbNights)}</td>
              <td onClick={selOtb} style={{ padding: '5px 12px', textAlign: 'right', color: otbNumColor(r), cursor: 'pointer' }}><FmtVal val={fmtOtbAdr(r.otbAdr)} numSize={11} /></td>
              <td onClick={selOtb} style={{ padding: '5px 12px', textAlign: 'right', color: otbNumColor(r), cursor: 'pointer' }}><FmtVal val={fmtOtbRev(r.otbRevenue)} numSize={11} /></td>
              {/* Pick-up */}
              {hasPickup && (<>
              <td onClick={selPu} style={{ padding: '5px 12px', textAlign: 'right', color: numColor(r.puNights, r), cursor: 'pointer', borderLeft: `1px solid ${puActive ? '#00E5A0' : DIV}` }}>{fmtPuRn(r.puNights)}</td>
              <td onClick={selPu} style={{ padding: '5px 12px', textAlign: 'right', color: numColor(r.puAdr, r), cursor: 'pointer' }}><FmtVal val={fmtPuAdr(r.puAdr, adrValid)} numSize={11} /></td>
              <td onClick={selPu} style={{ padding: '5px 12px', textAlign: 'right', color: numColor(r.puRevenue, r), cursor: 'pointer' }}><FmtVal val={fmtPuRev(r.puRevenue)} numSize={11} /></td>
              </>)}
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        {/* Total 행 */}
        <tr style={{ position: 'sticky', bottom: 0, background: '#000000' }}>
          <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}>합계 (HOU 제외)</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtOtbRn(summary.totalNights)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbAdr(summary.totalAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbRev(summary.totalRevenue)} numSize={11} /></td>
          {hasPickup && (<>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: puColor(summary.puNights), borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtPuRn(summary.puNights)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(0,229,160,0.5)' }}>—</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: puColor(summary.puRevenue), borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtPuRev(summary.puRevenue)} numSize={11} /></td>
          </>)}
        </tr>
        {/* OCC 행 */}
        <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>점유율</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}>{summary.occ.toFixed(1)}%</td>
          {hasPickup && (
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: occPuColor, borderLeft: `1px solid ${DIV}` }}>{summary.puNights >= 0 ? '+' : ''}{(summary.puNights / occDenom * 100).toFixed(1)}%</td>
          )}
        </tr>
        {/* Rev.PAR 행 */}
        <tr>
          <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Rev.PAR</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${Math.round(summary.revpar / 1000)}k`} /></td>
          {hasPickup && (
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: revparPuColor, borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${summary.puRevenue >= 0 ? '+' : ''}${Math.round(summary.puRevenue / occDenom / 1000)}k`} /></td>
          )}
        </tr>
      </tfoot>
    </table>
  )

  // ── 전년 비교 테이블 (현재 OTB · 작년 OTB · GAP) ──
  const grpTh = (color: string): React.CSSProperties => ({ ...stickyTop0, textAlign: 'center', padding: '6px 12px', fontSize: 10, fontWeight: 700, color, letterSpacing: '0.07em', background: '#0f0f0f', borderLeft: `1px solid ${DIV}`, borderBottom: `2px solid ${color}` })
  const lyGapTotN   = lyTotal.otbN - lyTotal.lyN
  const lyGapTotAdr = lyTotOtbAdr - lyTotLyAdr
  const lyGapTotR   = lyTotal.otbR - lyTotal.lyR
  // OCC / Rev.PAR — 현재는 당해 월 일수, 전년은 전년 동월 일수 분모로 각각 계산 (GAP은 두 값의 차)
  const lyCurOcc    = lyTotal.otbN / occDenom   * 100
  const lyLyOcc     = lyTotal.lyN  / occLyDenom * 100
  const lyCurRevpar = lyTotal.otbR / occDenom
  const lyLyRevpar  = lyTotal.lyR  / occLyDenom
  const renderLyTable = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr>
          <th style={{ ...stickyTop0, textAlign: 'left', padding: '6px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>SEGMENT</th>
          <th colSpan={3} style={grpTh('#5B8DEF')}>현재 OTB</th>
          <th colSpan={3} style={grpTh(lyColMode ? '#a78bfa' : '#F59E0B')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div
                style={{
                  display: 'inline-flex', alignItems: 'center', height: 24, borderRadius: 12,
                  background: lyColMode ? '#a78bfa' : '#F59E0B', border: `1px solid ${lyColMode ? '#a78bfa' : '#F59E0B'}`,
                  cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                  padding: lyColMode ? '0 10px 0 26px' : '0 26px 0 10px', whiteSpace: 'nowrap',
                }}
                onClick={() => setLyColMode(p => !p)}
              >
                <div style={{ position: 'absolute', width: 16, height: 16, top: 3, left: lyColMode ? 5 : 'auto', right: lyColMode ? 'auto' : 5, borderRadius: '50%', background: '#fff', transition: 'all 0.2s' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.65)', position: 'relative', zIndex: 1 }}>{lyColMode ? '전년OTB' : '전년마감'}</span>
              </div>
            </div>
          </th>
          <th colSpan={3} style={grpTh('#F59E0B')}>GAP</th>
        </tr>
        <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
          <th style={{ ...stickyTop24, padding: '4px 12px 6px' }} />
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => (<th key={`c-${h}`} style={{ ...segHeadTh, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>))}
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => (<th key={`l-${h}`} style={{ ...segHeadTh, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>))}
          {(['ΔR/N', 'ΔADR', 'ΔREV'] as const).map((h, i) => (<th key={`g-${h}`} style={{ ...segHeadTh, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const isSub = r.level === 'sub'
          const v = lyForRow(r.id)
          const active = selMain === r.id
          const cColor = v.otbN > 0 ? segTextColor(r) : 'rgba(255,255,255,0.25)'
          return (
            <tr key={r.id} style={{ background: active ? 'rgba(0,229,160,0.06)' : segBgColor(r), borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: isSub ? '5px 12px 5px 24px' : '7px 12px', color: segTextColor(r), fontWeight: r.isBold ? 600 : 400, boxShadow: active ? 'inset 3px 0 0 #00E5A0' : undefined }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {isSub && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>└</span>}
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: r.bgDarkColor || '#888', flexShrink: 0 }} />
                  {r.name}
                </span>
              </td>
              {/* 현재 OTB — 클릭 시 현재 OTB 어카운트 */}
              <td onClick={() => selectLy(r.id, 'otb')} style={{ padding: '5px 12px', textAlign: 'right', color: cColor, cursor: 'pointer', borderLeft: `1px solid ${active && lyAccSource === 'otb' ? '#00E5A0' : DIV}` }}>{fmtOtbRn(v.otbN)}</td>
              <td onClick={() => selectLy(r.id, 'otb')} style={{ padding: '5px 12px', textAlign: 'right', color: cColor, cursor: 'pointer' }}><FmtVal val={fmtOtbAdr(v.otbAdr)} numSize={11} /></td>
              <td onClick={() => selectLy(r.id, 'otb')} style={{ padding: '5px 12px', textAlign: 'right', color: cColor, cursor: 'pointer' }}><FmtVal val={fmtOtbRev(v.otbR)} numSize={11} /></td>
              {/* 작년 OTB — 클릭 시 작년 OTB 어카운트 */}
              <td onClick={() => selectLy(r.id, 'ly')} style={{ padding: '5px 12px', textAlign: 'right', color: lyGray, cursor: 'pointer', borderLeft: `1px solid ${active && lyAccSource === 'ly' ? '#00E5A0' : DIV}` }}>{fmtOtbRn(v.lyN)}</td>
              <td onClick={() => selectLy(r.id, 'ly')} style={{ padding: '5px 12px', textAlign: 'right', color: lyGray, cursor: 'pointer' }}><FmtVal val={fmtOtbAdr(v.lyAdr)} numSize={11} /></td>
              <td onClick={() => selectLy(r.id, 'ly')} style={{ padding: '5px 12px', textAlign: 'right', color: lyGray, cursor: 'pointer' }}><FmtVal val={fmtOtbRev(v.lyR)} numSize={11} /></td>
              {/* GAP — 클릭 시 GAP 어카운트 */}
              <td onClick={() => selectLy(r.id, 'gap')} style={{ padding: '5px 12px', textAlign: 'right', color: gapColor(v.gapN), cursor: 'pointer', borderLeft: `1px solid ${active && lyAccSource === 'gap' ? '#00E5A0' : DIV}`, fontWeight: 500 }}>{fmtGapRn(v.gapN)}</td>
              <td onClick={() => selectLy(r.id, 'gap')} style={{ padding: '5px 12px', textAlign: 'right', color: gapColor(v.gapAdr), cursor: 'pointer' }}><FmtVal val={fmtGapAdrK(v.gapAdr)} numSize={11} /></td>
              <td onClick={() => selectLy(r.id, 'gap')} style={{ padding: '5px 12px', textAlign: 'right', color: gapColor(v.gapR), cursor: 'pointer' }}><FmtVal val={fmtGapRevM(v.gapR)} numSize={11} /></td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr style={{ position: 'sticky', bottom: 0, background: '#000000' }}>
          <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}>합계 (HOU 제외)</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtOtbRn(lyTotal.otbN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbAdr(lyTotOtbAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbRev(lyTotal.otbR)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: lyGray, borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtOtbRn(lyTotal.lyN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: lyGray, borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbAdr(lyTotLyAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: lyGray, borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbRev(lyTotal.lyR)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(lyGapTotN), borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtGapRn(lyGapTotN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(lyGapTotAdr), borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtGapAdrK(lyGapTotAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(lyGapTotR), borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtGapRevM(lyGapTotR)} numSize={11} /></td>
        </tr>
        <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>점유율</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}>{lyCurOcc.toFixed(1)}%</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: lyGray, borderLeft: `1px solid ${DIV}` }}>{lyLyOcc.toFixed(1)}%</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: gapColor(lyGapTotN), borderLeft: `1px solid ${DIV}` }}>{(lyCurOcc - lyLyOcc) >= 0 ? '+' : ''}{(lyCurOcc - lyLyOcc).toFixed(1)}%p</td>
        </tr>
        <tr>
          <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Rev.PAR</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${Math.round(lyCurRevpar / 1000)}k`} /></td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: lyGray, borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${Math.round(lyLyRevpar / 1000)}k`} /></td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: gapColor(lyGapTotR), borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${(lyCurRevpar - lyLyRevpar) >= 0 ? '+' : ''}${Math.round((lyCurRevpar - lyLyRevpar) / 1000)}k`} /></td>
        </tr>
      </tfoot>
    </table>
  )

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div style={{
        position: 'relative',
        background: `
          radial-gradient(circle at 100% 100%, rgba(0,229,160,0.08) 0%, transparent 40%),
          #000000
        `,
        border: '0.5px solid rgba(0,229,160,0.2)',
        borderLeft: '3px solid rgba(0,229,160,0.6)',
        borderRadius: 16, display: 'flex', flexDirection: 'column',
        width: activeTab === 'ly' ? 'min(96vw, 1400px)' : 'min(96vw, 1040px)', maxHeight: '82vh',
        boxShadow: 'var(--shadow-card)', overflow: 'hidden', transition: 'width 0.15s',
      }}>

        {/* 상단 — 일자/월 네비(가운데) + 월합계 토글 + 닫기 */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          {/* 가운데: 일자별 ‹ 날짜 › / 월합계 {year}년 {month}월 합계 */}
          {viewMode === 'day' ? (
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setLocalDay(d => Math.max(1, d - 1))}
                style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >‹</button>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: getDayColor(localDateStr) }}>
                {month + 1}/{localDay} ({WEEKDAY_KR[new Date(year, month, localDay).getDay()]})
              </h2>
              <button
                onClick={() => setLocalDay(d => Math.min(new Date(year, month + 1, 0).getDate(), d + 1))}
                style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >›</button>
            </div>
          ) : (
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={handlePrevMonth}
                style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >‹</button>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', whiteSpace: 'nowrap' }}>
                {year}년 {month + 1}월 합계
              </h2>
              <button
                onClick={handleNextMonth}
                style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >›</button>
            </div>
          )}

          {/* 우측: 일자별/월합계 · OTB&Pickup/전년비교 · 전년동일자/전년동기간 스위치 (한 줄 통합) */}
          <div style={{ position: 'absolute', right: 44, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* 일자별 ↔ 월합계 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: viewMode === 'day' ? '#00E5A0' : '#666', fontWeight: viewMode === 'day' ? 600 : 400 }}>일자별</span>
              <div
                onClick={() => setViewMode(v => v === 'day' ? 'month' : 'day')}
                style={{ width: 34, height: 19, borderRadius: 10, position: 'relative', cursor: 'pointer', background: viewMode === 'month' ? '#00E5A0' : '#2a2a2a', transition: 'background 0.15s' }}
              >
                <div style={{ width: 15, height: 15, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: viewMode === 'month' ? 17 : 2, transition: 'left 0.15s' }} />
              </div>
              <span style={{ fontSize: 11, color: viewMode === 'month' ? '#00E5A0' : '#666', fontWeight: viewMode === 'month' ? 600 : 400 }}>월합계</span>
            </div>

            <div style={{ width: 1, height: 18, background: '#2a2a2a' }} />

            {/* OTB & Pick-up ↔ 전년 비교 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 11, color: activeTab === 'otb' ? '#00E5A0' : '#666', fontWeight: activeTab === 'otb' ? 600 : 400 }}>OTB & Pick-up</span>
              <div
                onClick={() => { setActiveTab(t => t === 'otb' ? 'ly' : 'otb'); setSelMain(null); setLyAccSource('gap') }}
                style={{ width: 32, height: 18, borderRadius: 9, position: 'relative', cursor: 'pointer', background: activeTab === 'ly' ? '#00E5A0' : '#2a2a2a', transition: 'background 0.15s' }}
              >
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: activeTab === 'ly' ? 16 : 2, transition: 'left 0.15s' }} />
              </div>
              <span style={{ fontSize: 11, color: activeTab === 'ly' ? '#00E5A0' : '#666', fontWeight: activeTab === 'ly' ? 600 : 400 }}>전년 비교</span>
            </div>

            {/* 전년동일자 ↔ 전년동기간 (전년 비교 ON일 때만) */}
            {activeTab === 'ly' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginLeft: 4 }}>
                <span style={{ fontSize: 11, color: lyMode === 'day' ? '#00E5A0' : '#666', fontWeight: lyMode === 'day' ? 600 : 400 }}>전년동일자</span>
                <div
                  onClick={() => setLyMode(m => m === 'day' ? 'period' : 'day')}
                  style={{ width: 28, height: 16, borderRadius: 8, position: 'relative', cursor: 'pointer', background: lyMode === 'period' ? '#00E5A0' : '#2a2a2a', transition: 'background 0.15s' }}
                >
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: lyMode === 'period' ? 14 : 2, transition: 'left 0.15s' }} />
                </div>
                <span style={{ fontSize: 11, color: lyMode === 'period' ? '#00E5A0' : '#666', fontWeight: lyMode === 'period' ? 600 : 400 }}>전년동기간</span>
              </div>
            )}
          </div>

          {/* 우측 끝: 닫기 */}
          <button onClick={onClose} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {/* 본문 — 통합 세그 테이블 · 어카운트 */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 16 }}>

          {/* 좌측: 세그 테이블 (탭에 따라 OTB&Pickup / 전년 비교) */}
          <div style={{ width: activeTab === 'ly' ? 900 : 560, flexShrink: 0, borderRight: '0.5px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
            {activeTab === 'otb' ? renderUnifiedTable() : renderLyTable()}
          </div>

          {/* 우측 어카운트 패널 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!selMain ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 28, opacity: 0.2 }}>👆</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Select a segment</span>
              </div>
            ) : activeTab === 'ly' ? (
              (() => {
                const src = lyAccSource
                const accTitle = src === 'otb' ? '현재 OTB' : src === 'ly' ? (lyColMode ? '작년 OTB' : '전년마감') : 'GAP (증감)'
                const isGap = src === 'gap'
                const heads = isGap ? ['ΔR/N', 'ΔADR', 'ΔREV'] : ['R/N', 'ADR', 'REV']
                type LAcc = (typeof lyAccountRows)[number]
                const rowN   = (a: LAcc) => src === 'otb' ? a.otbN   : src === 'ly' ? a.lyN   : a.gapN
                const rowAdr = (a: LAcc) => src === 'otb' ? a.otbAdr : src === 'ly' ? a.lyAdr : a.gapAdr
                const rowR   = (a: LAcc) => src === 'otb' ? a.otbR   : src === 'ly' ? a.lyR   : a.gapR
                const valColor = (v: number) => isGap ? gapColor(v) : src === 'ly' ? lyGray : (v !== 0 ? '#fff' : 'rgba(255,255,255,0.25)')
                const fmtN = (v: number) => isGap ? fmtGapRn(v)   : fmtOtbRn(v)
                const fmtA = (v: number) => isGap ? fmtGapAdrK(v) : fmtOtbAdr(v)
                const fmtR = (v: number) => isGap ? fmtGapRevM(v) : fmtOtbRev(v)
                const tN = lyAccountRows.reduce((s, a) => s + rowN(a), 0)
                const tR = lyAccountRows.reduce((s, a) => s + rowR(a), 0)
                return (
                  <>
                    {/* 전년 비교 어카운트 헤더 (소스별) */}
                    <div style={{ padding: '10px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: selRow?.bgDarkColor || '#888', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{selRow?.name} · {accTitle}</span>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {lyAccountRows.length === 0 ? (
                        <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No data</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#000000', zIndex: 1 }}>
                              <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>ACCOUNT</th>
                              {heads.map(h => <th key={h} style={accHeadTh}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {lyAccountRows.map(a => (
                              <tr key={a.name} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                              >
                                <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,0.75)' }}>{a.name}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', color: valColor(rowN(a)) }}>{fmtN(rowN(a))}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', color: valColor(rowAdr(a)) }}><FmtVal val={fmtA(rowAdr(a))} numSize={11} /></td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', color: valColor(rowR(a)) }}><FmtVal val={fmtR(rowR(a))} numSize={11} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )
              })()
            ) : (
              <>
                {/* 어카운트 헤더 */}
                <div style={{ padding: '10px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: selRow?.bgDarkColor || '#888', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{selRow?.name} · {selType === 'otb' ? 'OTB Account' : 'Pickup Account'}</span>
                </div>
                {/* 어카운트 테이블 */}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {accVisible.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No data</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#000000', zIndex: 1 }}>
                          <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>ACCOUNT</th>
                          <th style={accHeadTh}>{selType === 'pickup' ? 'R/N' : 'OTB R/N'}</th>
                          <th style={accHeadTh}>ADR</th>
                          <th style={accHeadTh}>REV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accVisible.map(a => (
                          <tr key={a.name} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                          >
                            <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,0.75)' }}>{a.name}</td>
                            {selType === 'pickup' ? (<>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accNumColor(a.puNights) }}>{fmtPuRn(a.puNights)}</td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accNumColor(a.puAdr) }}><FmtVal val={fmtPuAdr(a.puAdr, a.otbNights > 0 && a.vsNights > 0)} numSize={11} /></td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accNumColor(a.puRevenue) }}><FmtVal val={fmtPuRev(a.puRevenue)} numSize={11} /></td>
                            </>) : (<>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accOtbColor(a.otbNights) }}>{fmtOtbRn(a.otbNights)}</td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accOtbColor(a.otbNights) }}><FmtVal val={fmtOtbAdr(a.otbAdr)} numSize={11} /></td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accOtbColor(a.otbNights) }}><FmtVal val={fmtOtbRev(a.otbRevenue)} numSize={11} /></td>
                            </>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>

        </div>

        {/* 하단 — OTB/vs 날짜 피커 + 픽업 요약 */}
        <div style={{ padding: '11px 18px', borderTop: '0.5px solid #1c1c1c', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
          <DatePicker label="OTB" value={localOtbDate} onChange={setLocalOtbDate} availableDates={otbDates} accent bare plain fontPx={11} />
          <DatePicker label="vs" value={localVsDate} onChange={setLocalVsDate} availableDates={otbDates.filter(d => d < localOtbDate)} accent bare plain fontPx={11} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
            {diffDays}일 간{' '}
            <span style={{ fontWeight: 600, color: puColor(summary.puNights) }}>
              {summary.puNights >= 0 ? '+' : ''}{summary.puNights}
            </span>{' '}객실 픽업 하였습니다
          </span>

          {/* 금액 단위 설정 — 우측 정렬, 셀엔 숫자만 표시하고 단위는 여기서 안내 */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <span style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>
              단위 : 실, ADR {unitLabel(adrUnit)}, REV {unitLabel(revUnit)}
            </span>
            <button
              onClick={() => setUnitPanelOpen(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)',
                borderRadius: 6, padding: '3px 8px', color: '#888', cursor: 'pointer',
              }}
              aria-label="단위 설정"
            >
              <Settings size={12} />
            </button>
            {unitPanelOpen && (<>
              <div onClick={() => setUnitPanelOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
              <div style={{
                position: 'absolute', bottom: '100%', right: 0, marginBottom: 6,
                background: '#161616', border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: 10, zIndex: 11, minWidth: 160,
              }}>
                {renderUnitRow('ADR', adrUnit, setAdrUnit)}
                {renderUnitRow('REV', revUnit, setRevUnit)}
              </div>
            </>)}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
