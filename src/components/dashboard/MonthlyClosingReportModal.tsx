'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface MonthlyClosingReportModalProps {
  open: boolean
  onClose: () => void
  hotelId: string
  roomCount: number
  otbDate: string   // 전월 자동 설정 + 미래 월 제한용
}

// 다크/라이트 무관 — 리포트는 항상 라이트 고정 색상 (GMDailyReportModal 참고)
const C = {
  pageBg:       '#ffffff',
  cardBg:       '#f5f5f3',
  border:       '#e1e0d9',
  borderStrong: '#c8c7c0',
  textPrimary:  '#0b0b0b',
  textSecondary:'#4a4a48',
  textMuted:    '#898781',
  overlay:      'rgba(0,0,0,0.75)',
  mint:         '#1d9e75',
  red:          '#a32d2d',
  blue:         '#2a78d6',
  amber:        '#eda100',
} as const

// 증감 색상 (양수 mint / 음수 red / 0 muted)
const diffColor = (n: number): string => (n > 0 ? C.mint : n < 0 ? C.red : C.textMuted)
const diffText = (n: number, unit: string): string => (n > 0 ? `+${n}${unit}` : n < 0 ? `${n}${unit}` : `±0${unit}`)

// 숫자·단위 분리 → 단위 글자를 숫자 크기의 30%로 축소 렌더
const splitUnit = (val: string): { num: string; unit: string } => {
  const match = val.match(/^([+-]?\d+(?:\.\d+)?)([km%p]*)$/)
  return match ? { num: match[1], unit: match[2] } : { num: val, unit: '' }
}
const renderVal = (val: string, fontSize: number, color?: string) => {
  const { num, unit } = splitUnit(val)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, color }}>
      <span style={{ fontSize }}>{num}</span>
      {unit && <span style={{ fontSize: Math.round(fontSize * 0.7), fontWeight: 400, color: color ?? C.textMuted }}>{unit}</span>}
    </span>
  )
}

export default function MonthlyClosingReportModal({ open, onClose, hotelId, roomCount, otbDate }: MonthlyClosingReportModalProps) {
  const [reportYear,  setReportYear]  = useState<number>(0)
  const [reportMonth, setReportMonth] = useState<number>(0)

  // ── 단위 설정 (GMDailyReportModal 컨벤션 동일) ──
  const [showUnitSetting, setShowUnitSetting] = useState(false)
  const [adrUnit, setAdrUnit] = useState<'원' | '천원'>('천원')
  const [revUnit, setRevUnit] = useState<'원' | '천원' | '백만원'>('백만원')
  useEffect(() => {
    if (!showUnitSetting) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.mcr-unit-setting-wrap')) setShowUnitSetting(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showUnitSetting])

  // 단위 포맷 헬퍼 (raw 원 → 선택 단위, 소수점 없이 콤마)
  const fmtAdr = (won: number) => (adrUnit === '원' ? Math.round(won) : Math.round(won / 1000)).toLocaleString('ko-KR')
  const fmtRev = (won: number) => (revUnit === '원' ? Math.round(won) : revUnit === '천원' ? Math.round(won / 1000) : Math.round(won / 1_000_000)).toLocaleString('ko-KR')
  const sAdr = (won: number) => (won === 0 ? '±0' : (won > 0 ? '+' : '') + fmtAdr(won))
  const sRev = (won: number) => (won === 0 ? '±0' : (won > 0 ? '+' : '') + fmtRev(won))
  const revFs = (s: string) => (s.length > 10 ? 8 : s.length > 8 ? 9 : s.length > 6 ? 10 : 11)
  const nameFs = (s: string) => (s.length > 14 ? 9 : s.length > 10 ? 10 : 11)

  // 기본값: otbDate 기준 전월
  useEffect(() => {
    if (!open || !otbDate) return
    const [y, m] = otbDate.split('-').map(Number)
    if (m === 1) { setReportYear(y - 1); setReportMonth(12) }
    else         { setReportYear(y);     setReportMonth(m - 1) }
  }, [open, otbDate])

  const prevMonth = () => {
    if (reportMonth === 1) { setReportYear(y => y - 1); setReportMonth(12) }
    else setReportMonth(m => m - 1)
  }
  const nextMonth = () => {
    // 미래 월 제한 (otbDate 전월까지)
    const [maxY, maxM] = otbDate.split('-').map(Number)
    const limitY = maxM === 1 ? maxY - 1 : maxY
    const limitM = maxM === 1 ? 12 : maxM - 1
    if (reportYear > limitY || (reportYear === limitY && reportMonth >= limitM)) return
    if (reportMonth === 12) { setReportYear(y => y + 1); setReportMonth(1) }
    else setReportMonth(m => m + 1)
  }

  // ── 날짜 범위 ──
  const monthStart = reportYear && reportMonth
    ? `${reportYear}-${String(reportMonth).padStart(2, '0')}-01`
    : ''
  const monthEnd = reportYear && reportMonth
    ? new Date(reportYear, reportMonth, 0).toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
    : ''
  const lyStart = reportYear && reportMonth
    ? `${reportYear - 1}-${String(reportMonth).padStart(2, '0')}-01`
    : ''
  const lyEnd = reportYear && reportMonth
    ? new Date(reportYear - 1, reportMonth, 0).toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
    : ''

  // ── 데이터 Fetch ──
  // 당월 실적
  const { data: actualData } = useQuery({
    queryKey: ['closing_actual', hotelId, reportYear, reportMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily')
        .select('business_date, nights, room_revenue, segmentation, account_name, sorting1, sorting2, sorting3')
        .eq('hotel_id', hotelId)
        .gte('business_date', monthStart)
        .lte('business_date', monthEnd)
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId && !!monthStart && !!monthEnd,
    staleTime: 10 * 60 * 1000,
  })

  // 전년 실적
  const { data: lyData } = useQuery({
    queryKey: ['closing_ly', hotelId, reportYear - 1, reportMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily')
        .select('business_date, nights, room_revenue, segmentation, account_name, sorting1, sorting2, sorting3')
        .eq('hotel_id', hotelId)
        .gte('business_date', lyStart)
        .lte('business_date', lyEnd)
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId && !!lyStart && !!lyEnd,
    staleTime: 10 * 60 * 1000,
  })

  // 예산 Step 1: a04_budget_mtd에서 최신 confirmed update_date 조회
  const { data: budgetDateData } = useQuery({
    queryKey: ['closing_budget_mtd_date', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a04_budget_mtd')
        .select('update_date')
        .eq('hotel_id', hotelId)
        .eq('confirmed', true)
        .order('update_date', { ascending: false })
        .limit(1)
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId,
    staleTime: 10 * 60 * 1000,
  })
  const budgetUpdateDate = budgetDateData?.[0]?.update_date ?? null

  // 예산 Step 2: 그 update_date 기준 전체 조회 후 마감월(year/month)로 필터
  const { data: budgetRowsFetched } = useQuery({
    queryKey: ['closing_budget_mtd', hotelId, budgetUpdateDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a04_budget_mtd')
        .select('year, month, segmentation, budget_nights, budget_revenue')
        .eq('hotel_id', hotelId)
        .eq('update_date', budgetUpdateDate)
        .eq('confirmed', true)
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId && !!budgetUpdateDate,
    staleTime: 10 * 60 * 1000,
  })
  const budgetRows = (budgetRowsFetched ?? []).filter((r: any) => r.year === reportYear && r.month === reportMonth)
  const monthBudget = (budgetRows ?? []).filter((r: any) => Number(r.month) === reportMonth)
  console.log('[ClosingReport budget]', {
    reportMonth,
    reportMonthType: typeof reportMonth,
    budgetRowsLen: (budgetRows ?? []).length,
    budgetRows,
    firstMonthNum: (budgetRows ?? [])[0]?.month_num,
    firstMonthNumType: typeof (budgetRows ?? [])[0]?.month_num,
    monthNums: (budgetRows ?? []).map((r: any) => r.month_num),
    monthBudgetLen: monthBudget.length,
    monthBudget,
  })
  const budRn  = monthBudget.reduce((s: number, r: any) => s + (r.budget_nights ?? 0), 0)
  const budRev = monthBudget.reduce((s: number, r: any) => s + (r.budget_revenue ?? 0), 0)

  // 캘린더
  const { data: calData } = useQuery({
    queryKey: ['closing_cal', reportYear, reportMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c06_calendar')
        .select('date, day, event, is_holiday, yoy_match')
        .gte('date', monthStart)
        .lte('date', monthEnd)
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!monthStart && !!monthEnd,
    staleTime: 60 * 60 * 1000,
  })
  const calMap = useMemo(() => {
    const map: Record<string, { day: string; yoy_match: string | null; event: string | null }> = {}
    calData?.forEach((r: any) => { map[r.date] = { day: r.day, yoy_match: r.yoy_match, event: r.event } })
    return map
  }, [calData])

  // c05_market_table_schema — 트리 구조(level/parent_id/is_bold/segmentation/색상)
  const { data: schemaRows = [] } = useQuery({
    queryKey: ['closing_schema', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c05_market_table_schema')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
        .order('order_index', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId,
    staleTime: 10 * 60 * 1000,
  })

  // ── 온북월(마감월의 다음 달) 요약 카드용 데이터 ──
  // 온북월 = 마감월(reportYear/reportMonth)의 다음 달
  const curY = reportMonth === 12 ? reportYear + 1 : reportYear
  const curM = reportMonth === 12 ? 1 : reportMonth + 1

  // 온북 리포트 기준일 = 온북월 1일에 가장 가까운 평일
  // (1일이 토요일이면 전날 금요일, 일요일이면 다음날 월요일, 평일이면 1일 그대로)
  const curOtbDate = (() => {
    if (!curY || !curM) return ''
    const first = new Date(curY, curM - 1, 1)
    const dow = first.getDay()   // 0=일 ... 6=토
    const target = new Date(first)
    if (dow === 6) target.setDate(first.getDate() - 1)        // 토 → 전날(금)
    else if (dow === 0) target.setDate(first.getDate() + 1)   // 일 → 다음날(월)
    return target.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
  })()

  const curMonthStart = curY && curM ? `${curY}-${String(curM).padStart(2, '0')}-01` : ''
  const curMonthEnd   = curY && curM ? new Date(curY, curM, 0).toLocaleDateString('sv', { timeZone: 'Asia/Seoul' }) : ''
  const curLyStart = curY && curM ? `${curY - 1}-${String(curM).padStart(2, '0')}-01` : ''
  const curLyEnd   = curY && curM ? new Date(curY - 1, curM, 0).toLocaleDateString('sv', { timeZone: 'Asia/Seoul' }) : ''

  const { data: curOtbData } = useQuery({
    queryKey: ['closing_cur_otb', hotelId, curOtbDate, curMonthStart, curMonthEnd],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a02_otb_daily')
        .select('nights, room_revenue')
        .eq('hotel_id', hotelId).eq('update_date', curOtbDate)
        .gte('business_date', curMonthStart).lte('business_date', curMonthEnd)
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId && !!curOtbDate && !!curMonthStart && !!curMonthEnd,
    staleTime: 5 * 60 * 1000,
  })

  const { data: curLyData } = useQuery({
    queryKey: ['closing_cur_ly', hotelId, curLyStart, curLyEnd],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily')
        .select('nights, room_revenue')
        .eq('hotel_id', hotelId)
        .gte('business_date', curLyStart).lte('business_date', curLyEnd)
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId && !!curLyStart && !!curLyEnd,
    staleTime: 10 * 60 * 1000,
  })

  // a04_budget_mtd는 최신 confirmed update_date 스냅샷 하나가 여러 연도를 포함하므로
  // budgetRowsFetched(Step 1에서 조회한 것)를 그대로 재사용, year/month만 다르게 필터
  const curBudgetRows = (budgetRowsFetched ?? []).filter((r: any) => r.year === curY && r.month === curM)
  const curMonthBudget = (curBudgetRows ?? []).filter((r: any) => Number(r.month) === curM)
  const curBudRn  = curMonthBudget.reduce((s: number, r: any) => s + (r.budget_nights ?? 0), 0)
  const curBudRev = curMonthBudget.reduce((s: number, r: any) => s + (r.budget_revenue ?? 0), 0)

  // 온북월 KPI (kpi useMemo와 동일한 raw 원 계산 로직)
  const curKpi = useMemo(() => {
    if (!curY || !curM) return null
    const daysInMonth = new Date(curY, curM, 0).getDate()
    const totalAvail  = daysInMonth * roomCount

    const otbRn  = (curOtbData ?? []).reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
    const otbRev = (curOtbData ?? []).reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0)
    const lyRn   = (curLyData ?? []).reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
    const lyRev  = (curLyData ?? []).reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0)

    const calc = (rn: number, rev: number) => ({
      occ:       totalAvail > 0 ? Math.round((rn / totalAvail) * 1000) / 10 : 0,
      rn,
      adrWon:    rn > 0 ? rev / rn : 0,
      revWon:    rev,
      revparWon: totalAvail > 0 ? rev / totalAvail : 0,
    })

    const act = calc(otbRn, otbRev)
    const ly  = calc(lyRn, lyRev)
    const bud = calc(curBudRn, curBudRev)

    const diff = (a: number, b: number, isOcc = false) => (isOcc ? Math.round((a - b) * 10) / 10 : Math.round(a - b))

    return {
      act, ly, bud,
      vsBud: { occ: diff(act.occ, bud.occ, true), rn: diff(act.rn, bud.rn), adrWon: act.adrWon - bud.adrWon, revWon: act.revWon - bud.revWon, revparWon: act.revparWon - bud.revparWon },
      vsLy:  { occ: diff(act.occ, ly.occ, true),  rn: diff(act.rn, ly.rn),  adrWon: act.adrWon - ly.adrWon,  revWon: act.revWon - ly.revWon,  revparWon: act.revparWon - ly.revparWon },
    }
  }, [curOtbData, curLyData, curBudRn, curBudRev, roomCount, curY, curM])

  // ── Start→End 비교: 마감월 1일 온북 vs 마감 실적 ──
  const startOtbDate = (() => {
    if (!reportYear || !reportMonth) return ''
    const first = new Date(reportYear, reportMonth - 1, 1)
    const dow = first.getDay()   // 0=일 ... 6=토
    const target = new Date(first)
    if (dow === 6) target.setDate(first.getDate() - 1)        // 토 → 전날(금)
    else if (dow === 0) target.setDate(first.getDate() + 1)   // 일 → 다음날(월)
    return target.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
  })()

  // 폴백 — startOtbDate 이하 가장 가까운 실제 update_date 조회
  const { data: startDateAvail } = useQuery({
    queryKey: ['closing_start_date_avail', hotelId, startOtbDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a02_otb_daily')
        .select('update_date')
        .eq('hotel_id', hotelId)
        .lte('update_date', startOtbDate)
        .order('update_date', { ascending: false })
        .limit(1)
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId && !!startOtbDate,
    staleTime: 10 * 60 * 1000,
  })
  const startOtbDateResolved = startDateAvail?.[0]?.update_date ?? null

  const { data: startOtbData } = useQuery({
    queryKey: ['closing_start_otb', hotelId, startOtbDateResolved, monthStart, monthEnd],
    queryFn: async () => {
      if (!startOtbDateResolved) return []
      const { data, error } = await (supabase as any)
        .from('a02_otb_daily')
        .select('nights, room_revenue')
        .eq('hotel_id', hotelId).eq('update_date', startOtbDateResolved)
        .gte('business_date', monthStart).lte('business_date', monthEnd)
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId && !!startOtbDateResolved && !!monthStart && !!monthEnd,
    staleTime: 10 * 60 * 1000,
  })

  const startKpi = useMemo(() => {
    if (!reportYear || !reportMonth) return null
    const daysInMonth = new Date(reportYear, reportMonth, 0).getDate()
    const totalAvail  = daysInMonth * roomCount
    const rn  = (startOtbData ?? []).reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
    const rev = (startOtbData ?? []).reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0)
    return {
      occ:       totalAvail > 0 ? Math.round((rn / totalAvail) * 1000) / 10 : 0,
      rn,
      adrWon:    rn > 0 ? rev / rn : 0,
      revWon:    rev,
      revparWon: totalAvail > 0 ? rev / totalAvail : 0,
    }
  }, [startOtbData, roomCount, reportYear, reportMonth])

  // ── KPI ──
  const kpi = useMemo(() => {
    if (!reportYear || !reportMonth) return null
    const daysInMonth = new Date(reportYear, reportMonth, 0).getDate()
    const totalAvail  = daysInMonth * roomCount

    const actRn  = (actualData ?? []).reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
    const actRev = (actualData ?? []).reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0)
    const lyRn   = (lyData ?? []).reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
    const lyRev  = (lyData ?? []).reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0)

    const calc = (rn: number, rev: number) => ({
      occ:       totalAvail > 0 ? Math.round((rn / totalAvail) * 1000) / 10 : 0,
      rn,
      adrWon:    rn > 0 ? rev / rn : 0,
      revWon:    rev,
      revparWon: totalAvail > 0 ? rev / totalAvail : 0,
    })

    const act = calc(actRn, actRev)
    const ly  = calc(lyRn, lyRev)
    const bud = calc(budRn, budRev)

    const diff = (a: number, b: number, isOcc = false) =>
      isOcc ? Math.round((a - b) * 10) / 10 : Math.round(a - b)

    return {
      act, ly, bud,
      vsBud: {
        occ: diff(act.occ, bud.occ, true), rn: diff(act.rn, bud.rn),
        adrWon: act.adrWon - bud.adrWon, revWon: act.revWon - bud.revWon, revparWon: act.revparWon - bud.revparWon,
      },
      vsLy: {
        occ: diff(act.occ, ly.occ, true), rn: diff(act.rn, ly.rn),
        adrWon: act.adrWon - ly.adrWon, revWon: act.revWon - ly.revWon, revparWon: act.revparWon - ly.revparWon,
      },
    }
  }, [actualData, lyData, budRn, budRev, roomCount, reportYear, reportMonth])

  // ── 세그별 ──
  const segKpi = useMemo(() => {
    type Stats = { actRn: number; actRevWon: number; lyRn: number; lyRevWon: number; budRn: number; budRevWon: number }
    const empty = (): Stats => ({ actRn: 0, actRevWon: 0, lyRn: 0, lyRevWon: 0, budRn: 0, budRevWon: 0 })
    const add = (a: Stats, b: Stats) => {
      a.actRn += b.actRn; a.actRevWon += b.actRevWon
      a.lyRn += b.lyRn; a.lyRevWon += b.lyRevWon
      a.budRn += b.budRn; a.budRevWon += b.budRevWon
    }

    // 데이터 행의 segmentation(단일 코드) 기준 통계 맵
    const codeMap = new Map<string, Stats>()
    const ensure = (code: string) => { if (!codeMap.has(code)) codeMap.set(code, empty()); return codeMap.get(code)! }
    ;(actualData ?? []).forEach((r: any) => { const s = ensure(r.segmentation ?? '기타'); s.actRn += r.nights ?? 0; s.actRevWon += r.room_revenue ?? 0 })
    ;(lyData ?? []).forEach((r: any) => { const s = ensure(r.segmentation ?? '기타'); s.lyRn += r.nights ?? 0; s.lyRevWon += r.room_revenue ?? 0 })
    ;(monthBudget ?? []).forEach((r: any) => { const s = ensure(r.segmentation ?? '기타'); s.budRn += r.budget_nights ?? 0; s.budRevWon += r.budget_revenue ?? 0 })

    const aggregateCodes = (codes: string[]): Stats => {
      const acc = empty()
      codes.forEach(code => { const s = codeMap.get(code); if (s) add(acc, s) })
      return acc
    }

    // schema id별 통계: mid/sub=자체 segmentation, main=자식(sub) segmentation 합산
    const statsById = new Map<string, Stats>()
    schemaRows.forEach((s: any) => { if (s.level !== 'main') statsById.set(s.id, aggregateCodes(s.segmentation ?? [])) })
    schemaRows.forEach((s: any) => {
      if (s.level === 'main') {
        const childCodes = schemaRows.filter((c: any) => c.parent_id === s.id).flatMap((c: any) => c.segmentation ?? [])
        statsById.set(s.id, aggregateCodes(childCodes))
      }
    })

    // 정렬: parent_id=null 최상위(order_index순) 뒤에 main의 자식(sub) 이어붙임
    const topLevel = schemaRows.filter((s: any) => s.parent_id === null).sort((a: any, b: any) => a.order_index - b.order_index)
    const ordered: any[] = []
    topLevel.forEach((top: any) => {
      ordered.push(top)
      if (top.level === 'main') {
        const children = schemaRows.filter((c: any) => c.parent_id === top.id).sort((a: any, b: any) => a.order_index - b.order_index)
        ordered.push(...children)
      }
    })

    const rows = ordered.map((s: any) => {
      const st = statsById.get(s.id) ?? empty()
      return {
        id: s.id,
        name: s.name,
        indent: s.level === 'sub' ? 1 : 0,
        isBold: !!s.is_bold,
        bgLightColor: s.bg_light_color,
        fontLightColor: s.font_light_color,
        actRn: st.actRn, actAdrWon: st.actRn > 0 ? st.actRevWon / st.actRn : 0, actRevWon: st.actRevWon,
        lyRn: st.lyRn, lyAdrWon: st.lyRn > 0 ? st.lyRevWon / st.lyRn : 0, lyRevWon: st.lyRevWon,
        budRn: st.budRn, budAdrWon: st.budRn > 0 ? st.budRevWon / st.budRn : 0, budRevWon: st.budRevWon,
      }
    })

    // 합계 (HOU 제외) — schema에서 name === 'House Use'인 항목의 segmentation 코드 제외
    const houCodes = schemaRows.filter((s: any) => s.name === 'House Use').flatMap((s: any) => s.segmentation ?? [])
    const allCodesExceptHou = Array.from(codeMap.keys()).filter(code => !houCodes.includes(code))
    const totalStats = aggregateCodes(allCodesExceptHou)
    const total = {
      seg: '합계 (HOU 제외)',
      actRn: totalStats.actRn, actAdrWon: totalStats.actRn > 0 ? totalStats.actRevWon / totalStats.actRn : 0, actRevWon: totalStats.actRevWon,
      lyRn: totalStats.lyRn, lyAdrWon: totalStats.lyRn > 0 ? totalStats.lyRevWon / totalStats.lyRn : 0, lyRevWon: totalStats.lyRevWon,
      budRn: totalStats.budRn, budAdrWon: totalStats.budRn > 0 ? totalStats.budRevWon / totalStats.budRn : 0, budRevWon: totalStats.budRevWon,
    }

    // 점유율 / RevPAR (합계 HOU 제외 기준, 실적/목표/전년 3열)
    const daysInMonth = reportYear && reportMonth ? new Date(reportYear, reportMonth, 0).getDate() : 0
    const totalAvail  = daysInMonth * roomCount
    const occRow = {
      actOcc: totalAvail > 0 ? Math.round((totalStats.actRn / totalAvail) * 1000) / 10 : 0,
      budOcc: totalAvail > 0 ? Math.round((totalStats.budRn / totalAvail) * 1000) / 10 : 0,
      lyOcc:  totalAvail > 0 ? Math.round((totalStats.lyRn  / totalAvail) * 1000) / 10 : 0,
    }
    const revparRow = {
      actRevparWon: totalAvail > 0 ? totalStats.actRevWon / totalAvail : 0,
      budRevparWon: totalAvail > 0 ? totalStats.budRevWon / totalAvail : 0,
      lyRevparWon:  totalAvail > 0 ? totalStats.lyRevWon  / totalAvail : 0,
    }

    return { rows, total, occRow, revparRow }
  }, [actualData, lyData, monthBudget, schemaRows, roomCount, reportYear, reportMonth])

  // ── 요일별 ──
  const dowKpi = useMemo(() => {
    const dowOrder = ['월', '화', '수', '목', '금', '토', '일']
    const map: Record<string, { rn: number; rev: number; lyRn: number; lyRev: number; dates: Set<string> }> = {}
    dowOrder.forEach(d => { map[d] = { rn: 0, rev: 0, lyRn: 0, lyRev: 0, dates: new Set<string>() } })

    ;(actualData ?? []).forEach((r: any) => {
      const day = calMap[r.business_date]?.day
      if (!day || !map[day]) return
      map[day].rn  += r.nights ?? 0
      map[day].rev += r.room_revenue ?? 0
      map[day].dates.add(r.business_date)
    })

    const lyByDate: Record<string, { rn: number; rev: number }> = {}
    ;(lyData ?? []).forEach((r: any) => {
      if (!lyByDate[r.business_date]) lyByDate[r.business_date] = { rn: 0, rev: 0 }
      lyByDate[r.business_date].rn  += r.nights ?? 0
      lyByDate[r.business_date].rev += r.room_revenue ?? 0
    })
    Object.entries(calMap).forEach(([, cal]: any) => {
      if (!cal.day || !map[cal.day] || !cal.yoy_match) return
      const ly = lyByDate[cal.yoy_match]
      if (!ly) return
      map[cal.day].lyRn  += ly.rn
      map[cal.day].lyRev += ly.rev
    })

    return dowOrder.map(day => {
      const d = map[day]
      const totalAvail = d.dates.size * roomCount
      const occ   = totalAvail > 0 ? Math.round((d.rn / totalAvail) * 1000) / 10 : 0
      const lyOcc = totalAvail > 0 ? Math.round((d.lyRn / totalAvail) * 1000) / 10 : 0
      const adrWon   = d.rn > 0 ? d.rev / d.rn : 0
      const lyAdrWon = d.lyRn > 0 ? d.lyRev / d.lyRn : 0
      return {
        day, occ, adrWon, revWon: d.rev,
        vsLyOcc: Math.round((occ - lyOcc) * 10) / 10,
        vsLyAdrWon: adrWon - lyAdrWon,
        isFriSat: day === '금' || day === '토',
      }
    })
  }, [actualData, lyData, calMap, roomCount])

  // ── 이벤트 실적 ──
  const eventKpi = useMemo(() => {
    const extractName = (ev: string) => ev.match(/\(([^)]+)\)/)?.[1]?.trim() ?? ev
    const groups: Record<string, { name: string; dates: any[] }> = {}

    Object.entries(calMap).forEach(([date, cal]) => {
      if (!cal.event?.includes('(')) return
      const name = extractName(cal.event)
      if (!groups[name]) groups[name] = { name, dates: [] }

      const actRows = (actualData ?? []).filter((r: any) => r.business_date === date)
      const actRn   = actRows.reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
      const actRev  = actRows.reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0)
      const actOcc  = roomCount > 0 ? Math.round((actRn / roomCount) * 1000) / 10 : 0
      const actAdrWon = actRn > 0 ? actRev / actRn : 0

      const lyDate = cal.yoy_match
      const lyRows = lyDate ? (lyData ?? []).filter((r: any) => r.business_date === lyDate) : []
      const lyRn   = lyRows.reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
      const lyOcc  = roomCount > 0 && lyRn > 0 ? Math.round((lyRn / roomCount) * 1000) / 10 : null
      const lyAdrWon = lyRn > 0 ? lyRows.reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0) / lyRn : null

      const [, mm, dd] = date.split('-').map(Number)
      groups[name].dates.push({
        label: `${mm}/${dd} ${cal.day}`, actOcc, actAdrWon,
        actRevWon: actRev, lyOcc, lyAdrWon,
      })
    })
    return Object.values(groups)
  }, [actualData, lyData, calMap, roomCount])

  // ── 일자별 (그래프용) ──
  const dailyKpi = useMemo(() => {
    if (!reportYear || !reportMonth) return []
    const daysInMonth = new Date(reportYear, reportMonth, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => {
      const date = `${reportYear}-${String(reportMonth).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
      const cal  = calMap[date]
      const actRows = (actualData ?? []).filter((r: any) => r.business_date === date)
      const actRn   = actRows.reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
      const actRev  = actRows.reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0)
      const actOcc  = roomCount > 0 ? Math.round((actRn / roomCount) * 1000) / 10 : 0
      const actAdrWon  = actRn > 0 ? actRev / actRn : 0
      const lyDate  = cal?.yoy_match
      const lyRows  = lyDate ? (lyData ?? []).filter((r: any) => r.business_date === lyDate) : []
      const lyRn2   = lyRows.reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
      const lyOcc2  = roomCount > 0 && lyRn2 > 0 ? Math.round((lyRn2 / roomCount) * 1000) / 10 : null
      const occColor = actOcc >= 80 ? '#2a78d6' : actOcc >= 60 ? '#eda100' : '#e24b4a'
      return { label: `${reportMonth}/${i + 1}`, day: cal?.day ?? '', actOcc, actAdrWon, lyOcc: lyOcc2, occColor }
    })
  }, [actualData, lyData, calMap, roomCount, reportYear, reportMonth])

  // 코드 → 세그먼트명 매핑 (schemaRows의 segmentation 배열 기준, 어느 레벨이든 코드를 가진 행의 name 사용)
  const codeToSegName = useMemo(() => {
    const map: Record<string, string> = {}
    schemaRows.forEach((s: any) => {
      (s.segmentation ?? []).forEach((code: string) => { map[code] = s.name })
    })
    return map
  }, [schemaRows])

  // 세그먼트 정렬 순서 — schema 순회 순서대로 (자식 있으면 자식들, 없으면 자신)
  const orderedSegNames = useMemo(() => {
    const names: string[] = []
    const topLevel = schemaRows.filter((s: any) => s.parent_id === null).sort((a: any, b: any) => a.order_index - b.order_index)
    topLevel.forEach((top: any) => {
      const children = schemaRows.filter((c: any) => c.parent_id === top.id).sort((a: any, b: any) => a.order_index - b.order_index)
      if (children.length > 0) {
        children.forEach((c: any) => { if ((c.segmentation ?? []).length > 0) names.push(c.name) })
      } else if ((top.segmentation ?? []).length > 0) {
        names.push(top.name)
      }
    })
    return names
  }, [schemaRows])

  // 세그먼트별 요일 매트릭스 (codeToSegName/orderedSegNames 이후에 선언 — 선언 전 참조 방지)
  const dowSegKpi = useMemo(() => {
    const dowOrder = ['월', '화', '수', '목', '금', '토', '일']
    const map: Record<string, Record<string, { rn: number; rev: number; lyRn: number }>> = {}
    const segTotal: Record<string, number> = {}
    const segLyTotal: Record<string, number> = {}
    let grandRn = 0
    let grandLyRn = 0

    ;(actualData ?? []).forEach((r: any) => {
      const day = calMap[r.business_date]?.day
      if (!day) return
      const segName = codeToSegName[r.segmentation] ?? r.segmentation ?? '기타'
      if (!map[segName]) map[segName] = {}
      if (!map[segName][day]) map[segName][day] = { rn: 0, rev: 0, lyRn: 0 }
      map[segName][day].rn  += r.nights ?? 0
      map[segName][day].rev += r.room_revenue ?? 0
      segTotal[segName] = (segTotal[segName] ?? 0) + (r.nights ?? 0)
      grandRn += r.nights ?? 0
    })

    ;(lyData ?? []).forEach((r: any) => {
      const segName = codeToSegName[r.segmentation] ?? r.segmentation ?? '기타'
      segLyTotal[segName] = (segLyTotal[segName] ?? 0) + (r.nights ?? 0)
      grandLyRn += r.nights ?? 0
    })

    // 전년비(객실) — 요일 매칭(yoy_match) 기준으로 같은 요일 버킷에 전년 RN 누적
    const lyByDate: Record<string, Record<string, number>> = {}
    ;(lyData ?? []).forEach((r: any) => {
      const segName = codeToSegName[r.segmentation] ?? r.segmentation ?? '기타'
      if (!lyByDate[r.business_date]) lyByDate[r.business_date] = {}
      lyByDate[r.business_date][segName] = (lyByDate[r.business_date][segName] ?? 0) + (r.nights ?? 0)
    })
    Object.entries(calMap).forEach(([, cal]: any) => {
      if (!cal.day || !cal.yoy_match) return
      const lyForDate = lyByDate[cal.yoy_match]
      if (!lyForDate) return
      Object.entries(lyForDate).forEach(([segName, rn]) => {
        if (!map[segName]) map[segName] = {}
        if (!map[segName][cal.day]) map[segName][cal.day] = { rn: 0, rev: 0, lyRn: 0 }
        map[segName][cal.day].lyRn += rn as number
      })
    })

    const segNames = Object.keys(map).sort((a, b) => {
      const ia = orderedSegNames.indexOf(a), ib = orderedSegNames.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })

    return segNames.map(seg => {
      const total = segTotal[seg] ?? 0
      return {
        seg,
        shareRn: grandRn > 0 ? Math.round((total / grandRn) * 1000) / 10 : 0,
        shareLyRn: grandLyRn > 0 ? Math.round(((segLyTotal[seg] ?? 0) / grandLyRn) * 1000) / 10 : 0,
        cells: dowOrder.map(day => {
          const c = map[seg]?.[day] ?? { rn: 0, rev: 0, lyRn: 0 }
          return {
            day, rn: c.rn, adrWon: c.rn > 0 ? c.rev / c.rn : 0,
            pctOfSeg: total > 0 ? Math.round((c.rn / total) * 1000) / 10 : 0,
            vsLyRn: c.rn - c.lyRn,
          }
        }),
      }
    })
  }, [actualData, lyData, calMap, codeToSegName, orderedSegNames])

  // ── 어카운트별 실적 (get_account_actual_data RPC — 별칭 적용 account_name + LY/GAP 동시 반환) ──
  const { data: accountActualRows = [] } = useQuery({
    queryKey: ['closing_account_actual', hotelId, reportYear, reportMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_account_actual_data', {
        p_hotel_id: hotelId, p_year: reportYear, p_month: reportMonth, p_segmentation: null,
      })
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId && !!reportYear && !!reportMonth,
    staleTime: 10 * 60 * 1000,
  })

  // ── 국적별 실적 (get_country_actual_data RPC — otb_* 당월 + ly_* 전년 동시 반환, seg_name 포함) ──
  const { data: countryActualRows = [] } = useQuery({
    queryKey: ['closing_country_actual', hotelId, reportYear, reportMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_country_actual_data', {
        p_hotel_id: hotelId, p_year: reportYear, p_month: reportMonth, p_segmentation: null, p_account_name: null,
      })
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId && !!reportYear && !!reportMonth,
    staleTime: 10 * 60 * 1000,
  })

  const accountKpi = useMemo(() => {
    const segMap: Record<string, { accounts: Record<string, { aRn: number; aRev: number; lRn: number; lRev: number }> }> = {}

    ;(accountActualRows ?? []).forEach((r: any) => {
      const seg = r.seg_name || r.segmentation || '기타'
      const acc = r.account_name || '기타'
      if (!segMap[seg]) segMap[seg] = { accounts: {} }
      if (!segMap[seg].accounts[acc]) segMap[seg].accounts[acc] = { aRn: 0, aRev: 0, lRn: 0, lRev: 0 }
      segMap[seg].accounts[acc].aRn  += r.act_nights ?? 0
      segMap[seg].accounts[acc].aRev += r.act_revenue ?? 0
      segMap[seg].accounts[acc].lRn  += r.ly_nights ?? 0
      segMap[seg].accounts[acc].lRev += r.ly_revenue ?? 0
    })

    return Object.entries(segMap)
      .sort((a, b) => {
        const ia = orderedSegNames.indexOf(a[0])
        const ib = orderedSegNames.indexOf(b[0])
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
      })
      .map(([seg, v]) => {
        const accounts = Object.entries(v.accounts)
          .sort((a, b) => b[1].aRn - a[1].aRn)
          .map(([acc, d]) => ({
            acc,
            aRn: d.aRn, aRevWon: d.aRev,
            aAdrWon: d.aRn > 0 ? d.aRev / d.aRn : 0,
            lRn: d.lRn, lRevWon: d.lRev,
            diffRn: d.aRn - d.lRn, diffRevWon: d.aRev - d.lRev,
          }))
        const tot = accounts.reduce((s, a) => ({
          aRn: s.aRn + a.aRn, aRevWon: s.aRevWon + a.aRevWon, lRn: s.lRn + a.lRn, lRevWon: s.lRevWon + a.lRevWon,
        }), { aRn: 0, aRevWon: 0, lRn: 0, lRevWon: 0 })
        return {
          seg,
          accounts: accounts.filter(a => a.aRn !== 0 || a.aRevWon !== 0),   // 당월 객실·매출 모두 0인 계정 숨김
          total: {
            ...tot,
            aAdrWon: tot.aRn > 0 ? tot.aRevWon / tot.aRn : 0,
            diffRn: tot.aRn - tot.lRn, diffRevWon: tot.aRevWon - tot.lRevWon,
          },
        }
      })
  }, [accountActualRows, orderedSegNames])

  // 국기 이미지 URL (alpha2 → flagcdn.com PNG — 플랫폼 무관 항상 그림 표시)
  const flagImgUrl = (alpha2?: string) => (alpha2 && alpha2.length === 2 ? `https://flagcdn.com/16x12/${alpha2.toLowerCase()}.png` : '')

  // 국적별 실적 — get_country_actual_data가 otb_*(당월)/ly_*(전년)를 함께 반환, 상위 10개국 + 기타
  const countryKpi = useMemo(() => {
    const map: Record<string, { nameKo: string; alpha2: string; rn: number; rev: number; lyRn: number; lyRev: number }> = {}
    ;(countryActualRows ?? []).forEach((r: any) => {
      const key = r.country_name_ko || r.country || '(미지정)'
      if (!map[key]) map[key] = { nameKo: key, alpha2: r.alpha2 ?? '', rn: 0, rev: 0, lyRn: 0, lyRev: 0 }
      map[key].rn    += r.otb_nights ?? 0
      map[key].rev   += r.otb_revenue ?? 0
      map[key].lyRn  += r.ly_nights ?? 0
      map[key].lyRev += r.ly_revenue ?? 0
    })
    const list = Object.values(map).sort((a, b) => b.rn - a.rn)
    const top10 = list.slice(0, 10)
    const rest = list.slice(10)

    const rows = top10.map(c => {
      const adrWon = c.rn > 0 ? c.rev / c.rn : 0
      const lyAdrWon = c.lyRn > 0 ? c.lyRev / c.lyRn : 0
      return {
        name: c.nameKo, flag: flagImgUrl(c.alpha2),
        rn: c.rn, adrWon, revWon: c.rev,
        diffRn: c.rn - c.lyRn, diffAdrWon: adrWon - lyAdrWon, diffRevWon: c.rev - c.lyRev,
      }
    })
    if (rest.length > 0) {
      const agg = rest.reduce((s, c) => ({ rn: s.rn + c.rn, rev: s.rev + c.rev, lyRn: s.lyRn + c.lyRn, lyRev: s.lyRev + c.lyRev }), { rn: 0, rev: 0, lyRn: 0, lyRev: 0 })
      const adrWon = agg.rn > 0 ? agg.rev / agg.rn : 0
      const lyAdrWon = agg.lyRn > 0 ? agg.lyRev / agg.lyRn : 0
      rows.push({ name: '기타', flag: '', rn: agg.rn, adrWon, revWon: agg.rev, diffRn: agg.rn - agg.lyRn, diffAdrWon: adrWon - lyAdrWon, diffRevWon: agg.rev - agg.lyRev })
    }
    return rows
  }, [countryActualRows])

  // 세그먼트별 국적 실적 — 각 세그먼트 자체 데이터 안에서 상위 5개국을 독립 산정(객실 내림차순)
  const segCountryKpi = useMemo(() => {
    const bySeg: Record<string, Record<string, { rn: number; rev: number; lyRn: number; lyRev: number }>> = {}
    ;(countryActualRows ?? []).forEach((r: any) => {
      const segName = r.seg_name || r.segmentation || '기타'
      const countryName = r.country_name_ko || r.country || '(미지정)'
      if (!bySeg[segName]) bySeg[segName] = {}
      if (!bySeg[segName][countryName]) bySeg[segName][countryName] = { rn: 0, rev: 0, lyRn: 0, lyRev: 0 }
      bySeg[segName][countryName].rn    += r.otb_nights ?? 0
      bySeg[segName][countryName].rev   += r.otb_revenue ?? 0
      bySeg[segName][countryName].lyRn  += r.ly_nights ?? 0
      bySeg[segName][countryName].lyRev += r.ly_revenue ?? 0
    })
    const segNames = Object.keys(bySeg).sort((a, b) => {
      const ia = orderedSegNames.indexOf(a), ib = orderedSegNames.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
    return segNames.map(seg => {
      const cells = Object.entries(bySeg[seg])
        .map(([name, c]) => ({
          name, rn: c.rn, adrWon: c.rn > 0 ? c.rev / c.rn : 0, diffRn: c.rn - c.lyRn,
        }))
        .sort((a, b) => b.rn - a.rn)
        .slice(0, 5)
      return { seg, cells }
    })
  }, [countryActualRows, orderedSegNames])

  const page1Ref  = useRef<HTMLDivElement>(null)
  const page2Ref  = useRef<HTMLDivElement>(null)

  // ESC + 스크롤락
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  // 인쇄 자동맞춤(zoom) — 페이지별로 한 장에 맞춤 (page1 / page2)
  useEffect(() => {
    const MM_TO_PX = 96 / 25.4
    const TARGET_HEIGHT_PX = 273 * MM_TO_PX

    const fitOne = (el: HTMLDivElement | null) => {
      if (!el) return
      el.style.zoom = '1'
      requestAnimationFrame(() => {
        if (!el) return
        const actual = el.scrollHeight
        if (actual <= 0) return
        let scale = TARGET_HEIGHT_PX / actual
        scale = Math.min(1.25, Math.max(0.6, scale))
        el.style.zoom = String(scale)
      })
    }
    const applyFit = () => {
      fitOne(page1Ref.current)
      fitOne(page2Ref.current)
    }
    const resetFit = () => {
      if (page1Ref.current) page1Ref.current.style.zoom = '1'
      if (page2Ref.current) page2Ref.current.style.zoom = '1'
    }

    window.addEventListener('beforeprint', applyFit)
    window.addEventListener('afterprint', resetFit)
    return () => {
      window.removeEventListener('beforeprint', applyFit)
      window.removeEventListener('afterprint', resetFit)
    }
  }, [])

  // 인쇄 스타일 동적 주입 — open일 때만 (다른 리포트 모달과의 전역 충돌 방지)
  useEffect(() => {
    if (!open) {
      document.getElementById('mcr-report-print')?.remove()
      return
    }
    const style = document.createElement('style')
    style.id = 'mcr-report-print'
    style.textContent = `
      @media print {
        html, body { background: #ffffff !important; }
        @page { size: A4 portrait; margin: 0; }
        .mcr-header { display: none !important; }
        .mcr-page-divider { display: none !important; }
        body > *:not(.mcr-overlay) { display: none !important; }
        .mcr-overlay { position: static !important; background: transparent !important; padding: 0 !important; overflow: visible !important; height: auto !important; width: 100% !important; }
        .mcr-content { position: static !important; box-shadow: none !important; border-radius: 0 !important; max-height: none !important; overflow: visible !important; width: 100% !important; background: #ffffff !important; padding: 12mm 10mm !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `
    document.head.appendChild(style)
    return () => { document.getElementById('mcr-report-print')?.remove() }
  }, [open])

  if (!open) return null

  // ── 스타일 헬퍼 ──
  const th: React.CSSProperties = { fontSize: 10, color: C.textMuted, fontWeight: 500, padding: '3px 6px', borderBottom: `0.5px solid ${C.border}` }
  const td: React.CSSProperties = { fontSize: 11, color: C.textPrimary, padding: '2px 6px' }

  // 비교표 행 정의
  const kpiRows = kpi ? [
    { name: '점유율',   act: `${kpi.act.occ}%`,  bud: `${kpi.bud.occ}%`,  vsBud: diffText(kpi.vsBud.occ, '%p'), ly: `${kpi.ly.occ}%`, vsLy: diffText(kpi.vsLy.occ, '%p'), vsBudN: kpi.vsBud.occ, vsLyN: kpi.vsLy.occ },
    { name: '판매객실', act: `${kpi.act.rn.toLocaleString()}`, bud: `${kpi.bud.rn.toLocaleString()}`, vsBud: diffText(kpi.vsBud.rn, ''), ly: `${kpi.ly.rn.toLocaleString()}`, vsLy: diffText(kpi.vsLy.rn, ''), vsBudN: kpi.vsBud.rn, vsLyN: kpi.vsLy.rn },
    { name: '객단가',   act: fmtAdr(kpi.act.adrWon),  bud: fmtAdr(kpi.bud.adrWon),  vsBud: sAdr(kpi.vsBud.adrWon), ly: fmtAdr(kpi.ly.adrWon), vsLy: sAdr(kpi.vsLy.adrWon), vsBudN: kpi.vsBud.adrWon, vsLyN: kpi.vsLy.adrWon },
    { name: '매출',     act: fmtRev(kpi.act.revWon),  bud: fmtRev(kpi.bud.revWon),  vsBud: sRev(kpi.vsBud.revWon), ly: fmtRev(kpi.ly.revWon), vsLy: sRev(kpi.vsLy.revWon), vsBudN: kpi.vsBud.revWon, vsLyN: kpi.vsLy.revWon },
    { name: 'RevPAR',   act: fmtAdr(kpi.act.revparWon), bud: fmtAdr(kpi.bud.revparWon), vsBud: sAdr(kpi.vsBud.revparWon), ly: fmtAdr(kpi.ly.revparWon), vsLy: sAdr(kpi.vsLy.revparWon), vsBudN: kpi.vsBud.revparWon, vsLyN: kpi.vsLy.revparWon },
  ] : []

  const kpiCards = kpi ? [
    { label: '점유율',  value: `${kpi.act.occ}%`,  budSub: diffText(kpi.vsBud.occ, '%p'), budSubN: kpi.vsBud.occ, sub: diffText(kpi.vsLy.occ, '%p'), subN: kpi.vsLy.occ },
    { label: '객단가',  value: fmtAdr(kpi.act.adrWon),  budSub: sAdr(kpi.vsBud.adrWon),  budSubN: kpi.vsBud.adrWon,  sub: sAdr(kpi.vsLy.adrWon),  subN: kpi.vsLy.adrWon },
    { label: '매출',    value: fmtRev(kpi.act.revWon),  budSub: sRev(kpi.vsBud.revWon),  budSubN: kpi.vsBud.revWon,  sub: sRev(kpi.vsLy.revWon),  subN: kpi.vsLy.revWon },
    { label: 'RevPAR',  value: fmtAdr(kpi.act.revparWon), budSub: sAdr(kpi.vsBud.revparWon), budSubN: kpi.vsBud.revparWon, sub: sAdr(kpi.vsLy.revparWon), subN: kpi.vsLy.revparWon },
  ] : []

  // 요일별 점유율 막대그래프 + 하단 4행 표(객단가/매출/전년비점유율/전년비객단가)
  const renderDowBarChart = () => {
    const dowColor = (d: any) => (d.isFriSat ? '#e24b4a' : '#2a78d6')
    const BAR_MAX_PX = 48
    return (
      <div style={{ background: C.cardBg, borderRadius: 8, padding: '8px 12px 6px' }}>
        <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>점유율 (%)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '18%' }} />
            {dowKpi.map(d => <col key={d.day} style={{ width: '11.7%' }} />)}
          </colgroup>
          <tbody>
            <tr>
              <td></td>
              {dowKpi.map(d => (
                <td key={d.day} style={{ verticalAlign: 'bottom', padding: '0 4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: '#0b0b0b', fontWeight: 500, marginBottom: 3 }}>{d.occ}%</span>
                    <div style={{ width: '100%', background: dowColor(d), borderRadius: '3px 3px 0 0', height: `${Math.round((Math.min(100, d.occ) / 100) * BAR_MAX_PX)}px` }} />
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <td></td>
              {dowKpi.map(d => (
                <td key={d.day} style={{ textAlign: 'center', fontSize: 9, fontWeight: 500, color: d.isFriSat ? '#e24b4a' : '#0b0b0b', padding: '4px' }}>{d.day}</td>
              ))}
            </tr>
            <tr style={{ borderTop: `0.5px solid ${C.border}` }}>
              <td style={{ padding: '2px 4px', color: C.textMuted }}>객단가</td>
              {dowKpi.map(d => <td key={d.day} style={{ textAlign: 'center', padding: '2px 4px', color: '#0b0b0b' }}>{fmtAdr(d.adrWon)}</td>)}
            </tr>
            <tr>
              <td style={{ padding: '2px 4px', color: C.textMuted }}>매출</td>
              {dowKpi.map(d => <td key={d.day} style={{ textAlign: 'center', padding: '2px 4px', color: '#0b0b0b' }}>{fmtRev(d.revWon)}</td>)}
            </tr>
            <tr style={{ borderTop: `0.5px solid ${C.border}` }}>
              <td style={{ padding: '2px 4px', color: C.textMuted }}>전년비(점유율)</td>
              {dowKpi.map(d => <td key={d.day} style={{ textAlign: 'center', padding: '2px 4px', color: diffColor(d.vsLyOcc), fontWeight: 500 }}>{diffText(d.vsLyOcc, '')}</td>)}
            </tr>
            <tr>
              <td style={{ padding: '2px 4px', color: C.textMuted }}>전년비(객단가)</td>
              {dowKpi.map(d => <td key={d.day} style={{ textAlign: 'center', padding: '2px 4px', color: diffColor(d.vsLyAdrWon), fontWeight: 500 }}>{sAdr(d.vsLyAdrWon)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  // 요일별 매출 비중 원형 차트 (순수 SVG, 리더라인으로 라벨 연결)
  const renderDowRevPie = () => {
    const total = dowKpi.reduce((s, d) => s + d.revWon, 0)
    if (total <= 0) return null
    const cx = 150, cy = 90, r = 65
    let cum = 0
    const slices = dowKpi.map(d => {
      const pct = total > 0 ? (d.revWon / total) * 100 : 0
      const startAngle = (cum / total) * 2 * Math.PI - Math.PI / 2
      cum += d.revWon
      const endAngle = (cum / total) * 2 * Math.PI - Math.PI / 2
      const midAngle = (startAngle + endAngle) / 2
      const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle)
      const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle)
      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
      const path = `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
      const lr1 = r + 10, lr2 = r + 32
      const lx1 = cx + lr1 * Math.cos(midAngle), ly1 = cy + lr1 * Math.sin(midAngle)
      const lx2 = cx + lr2 * Math.cos(midAngle), ly2 = cy + lr2 * Math.sin(midAngle)
      const anchor = Math.cos(midAngle) > 0.15 ? 'start' : Math.cos(midAngle) < -0.15 ? 'end' : 'middle'
      return { day: d.day, pct: Math.round(pct), path, lx1, ly1, lx2, ly2, anchor, isFriSat: d.isFriSat }
    })
    return (
      <div style={{ background: C.cardBg, borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>매출 비중</div>
        <svg viewBox="0 0 300 190" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          {slices.map(s => <path key={s.day} d={s.path} fill={s.isFriSat ? '#e24b4a' : '#2a78d6'} />)}
          {slices.map(s => (
            <g key={s.day}>
              <line x1={s.lx1} y1={s.ly1} x2={s.lx2} y2={s.ly2} stroke="#898781" strokeWidth={1} />
              <text x={s.lx2 + (s.anchor === 'start' ? 3 : s.anchor === 'end' ? -3 : 0)} y={s.ly2} textAnchor={s.anchor as any} fontSize={10} fill={s.isFriSat ? '#e24b4a' : '#0b0b0b'} fontWeight={s.isFriSat ? 600 : 400}>{s.day} {s.pct}%</text>
            </g>
          ))}
        </svg>
      </div>
    )
  }

  // 세그먼트별 요일 실적 박스 (R/N · ADR 2행)
  const renderDowSegBox = (seg: { seg: string; shareRn: number; shareLyRn: number; cells: any[] }) => {
    const z = (n: number, str: string) => (n === 0 ? '-' : str)
    return (
      <div key={seg.seg} style={{ background: C.cardBg, borderRadius: 8, padding: '6px 10px', marginBottom: 6, breakInside: 'avoid' } as React.CSSProperties}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#0b0b0b' }}>{seg.seg}</span>
          <span style={{ fontSize: 9, color: C.blue, fontWeight: 500 }}>객실비중 {seg.shareRn}% / 전년 {seg.shareLyRn}%</span>
        </div>
        <div style={{ width: '100%', height: 3, background: C.border, borderRadius: 2, marginBottom: 4, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, seg.shareRn)}%`, height: '100%', background: C.blue }} />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '16%' }} />
            {seg.cells.map((c: any) => <col key={c.day} style={{ width: '12%' }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ borderBottom: `0.5px solid ${C.border}` }}></th>
              {seg.cells.map((c: any) => (
                <th key={c.day} style={{ textAlign: 'right', fontSize: 9, color: c.day === '금' || c.day === '토' ? '#e24b4a' : C.textMuted, fontWeight: 500, padding: '1px 4px', borderBottom: `0.5px solid ${C.border}` }}>{c.day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'right', padding: '1px 4px', color: C.textMuted }}>객실</td>
              {seg.cells.map((c: any) => <td key={c.day} style={{ textAlign: 'right', padding: '1px 4px', color: '#0b0b0b' }}>{z(c.rn, c.rn.toLocaleString())}</td>)}
            </tr>
            <tr>
              <td style={{ textAlign: 'right', padding: '1px 4px', color: C.textMuted }}>객단가</td>
              {seg.cells.map((c: any) => <td key={c.day} style={{ textAlign: 'right', padding: '1px 4px', color: C.textSecondary }}>{z(c.rn, fmtAdr(c.adrWon))}</td>)}
            </tr>
            <tr>
              <td style={{ textAlign: 'right', padding: '1px 4px', color: C.textMuted }}>비중</td>
              {seg.cells.map((c: any) => <td key={c.day} style={{ textAlign: 'right', padding: '1px 4px', color: C.textMuted }}>{z(c.rn, `${c.pctOfSeg}%`)}</td>)}
            </tr>
            <tr>
              <td style={{ textAlign: 'right', padding: '1px 4px', color: C.textMuted }}>전년비</td>
              {seg.cells.map((c: any) => (
                <td key={c.day} style={{ textAlign: 'right', padding: '1px 4px', color: diffColor(c.vsLyRn), fontWeight: 500 }}>
                  {c.vsLyRn > 0 ? `+${c.vsLyRn}` : c.vsLyRn}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  // 세그먼트별 국적 실적 박스 (상위 5개국+기타 컬럼, 객실/객단가/전년비 3행)
  const renderSegCountryBox = (seg: { seg: string; cells: any[] }) => {
    const z = (n: number, str: string) => (n === 0 ? '-' : str)
    return (
      <div key={seg.seg} style={{ background: C.cardBg, borderRadius: 8, padding: '8px 12px', marginBottom: 8, breakInside: 'avoid' } as React.CSSProperties}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#0b0b0b', marginBottom: 4 }}>{seg.seg}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '16%' }} />
            {seg.cells.map((c: any) => <col key={c.name} style={{ width: `${84 / seg.cells.length}%` }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ borderBottom: `0.5px solid ${C.border}` }}></th>
              {seg.cells.map((c: any) => (
                <th key={c.name} style={{ textAlign: 'right', fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '3px 4px', borderBottom: `0.5px solid ${C.border}` }}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'right', padding: '2px 4px', color: C.textMuted }}>객실</td>
              {seg.cells.map((c: any) => <td key={c.name} style={{ textAlign: 'right', padding: '2px 4px', color: '#0b0b0b' }}>{z(c.rn, c.rn.toLocaleString())}</td>)}
            </tr>
            <tr>
              <td style={{ textAlign: 'right', padding: '2px 4px', color: C.textMuted }}>객단가</td>
              {seg.cells.map((c: any) => <td key={c.name} style={{ textAlign: 'right', padding: '2px 4px', color: C.textSecondary }}>{z(c.rn, fmtAdr(c.adrWon))}</td>)}
            </tr>
            <tr>
              <td style={{ textAlign: 'right', padding: '2px 4px', color: C.textMuted }}>전년비</td>
              {seg.cells.map((c: any) => (
                <td key={c.name} style={{ textAlign: 'right', padding: '2px 4px', color: diffColor(c.diffRn), fontWeight: 500 }}>{c.diffRn > 0 ? `+${c.diffRn}` : c.diffRn}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  // 마감월/온북월 미니 요약 카드 — 실적(온북)/목표비/전년비 표시
  const renderMiniSummary = (
    monthLabel: string, yearLabel: string, suffixLabel: string,
    actLabel: string, k: typeof kpi, borderColor: string,
    dateLabel?: string,
  ) => {
    if (!k) return null
    const cols = [
      { name: '점유율', act: `${k.act.occ}%`,        vsBud: diffText(k.vsBud.occ, '%p'), vsBudN: k.vsBud.occ, vsLy: diffText(k.vsLy.occ, '%p'), vsLyN: k.vsLy.occ },
      { name: '객단가', act: fmtAdr(k.act.adrWon),   vsBud: sAdr(k.vsBud.adrWon), vsBudN: k.vsBud.adrWon, vsLy: sAdr(k.vsLy.adrWon), vsLyN: k.vsLy.adrWon },
      { name: '매출',   act: fmtRev(k.act.revWon),   vsBud: sRev(k.vsBud.revWon), vsBudN: k.vsBud.revWon, vsLy: sRev(k.vsLy.revWon), vsLyN: k.vsLy.revWon },
      { name: 'RevPAR', act: fmtAdr(k.act.revparWon), vsBud: sAdr(k.vsBud.revparWon), vsBudN: k.vsBud.revparWon, vsLy: sAdr(k.vsLy.revparWon), vsLyN: k.vsLy.revparWon },
    ]
    const moneyFs = (adrUnit === '원' || revUnit === '원') ? 10 : 12
    const pctFs = (s: string) => (s.length > 8 ? 9 : s.length > 6 ? 10 : 12)
    return (
      <div style={{ border: `1.5px solid ${borderColor}`, borderRadius: 10, padding: '8px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0b0b0b' }}>{monthLabel}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#0b0b0b' }}> {yearLabel}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0b0b0b' }}> {suffixLabel}</span>
          </div>
          {dateLabel && (
            <span style={{ fontSize: 9, color: C.textMuted, whiteSpace: 'nowrap' }}>{dateLabel}</span>
          )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: '19%' }} /><col style={{ width: '19%' }} /><col style={{ width: '19%' }} /><col style={{ width: '19%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}></th>
              {cols.map(c => <th key={c.name} style={{ ...th, textAlign: 'right' }}>{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: `0.5px solid ${C.border}` }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{actLabel}</td>
              {cols.map(c => <td key={c.name} style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#0b0b0b', fontSize: c.name === '점유율' ? pctFs(c.act) : c.name === '매출' ? revFs(c.act) : moneyFs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.act}</td>)}
            </tr>
            <tr style={{ borderBottom: `0.5px solid ${C.border}` }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 500 }}>목표비</td>
              {cols.map(c => <td key={c.name} style={{ ...td, textAlign: 'right', color: diffColor(c.vsBudN), fontWeight: 500, fontSize: c.name === '점유율' ? pctFs(c.vsBud) : c.name === '매출' ? revFs(c.vsBud) : moneyFs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.vsBud}</td>)}
            </tr>
            <tr>
              <td style={{ ...td, textAlign: 'left', fontWeight: 500 }}>전년비</td>
              {cols.map(c => <td key={c.name} style={{ ...td, textAlign: 'right', color: diffColor(c.vsLyN), fontWeight: 500, fontSize: c.name === '점유율' ? pctFs(c.vsLy) : c.name === '매출' ? revFs(c.vsLy) : moneyFs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.vsLy}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  // Start → End 카드 (월초 온북 vs 마감 실적)
  const renderStartEnd = () => {
    if (!startKpi || !kpi) return null
    const rows = [
      { name: '점유율', start: `${startKpi.occ}%`, end: `${kpi.act.occ}%`, diffStr: diffText(Math.round((kpi.act.occ - startKpi.occ) * 10) / 10, '%p'), diffN: kpi.act.occ - startKpi.occ },
      { name: '객단가', start: fmtAdr(startKpi.adrWon), end: fmtAdr(kpi.act.adrWon), diffStr: sAdr(kpi.act.adrWon - startKpi.adrWon), diffN: kpi.act.adrWon - startKpi.adrWon },
      { name: '매출',   start: fmtRev(startKpi.revWon), end: fmtRev(kpi.act.revWon), diffStr: sRev(kpi.act.revWon - startKpi.revWon), diffN: kpi.act.revWon - startKpi.revWon },
      { name: 'RevPAR', start: fmtAdr(startKpi.revparWon), end: fmtAdr(kpi.act.revparWon), diffStr: sAdr(kpi.act.revparWon - startKpi.revparWon), diffN: kpi.act.revparWon - startKpi.revparWon },
    ]
    const moneyFs = (adrUnit === '원' || revUnit === '원') ? 10 : 12
    return (
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '8px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0b0b0b' }}>Start → End</span>
          </div>
          <span style={{ fontSize: 9, color: C.textMuted }}>월초 기준일 : {startOtbDateResolved ?? '-'}</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '28%' }} />
            <col style={{ width: '24%' }} /><col style={{ width: '24%' }} /><col style={{ width: '24%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}></th>
              <th style={{ ...th, textAlign: 'right' }}>월초 온북</th>
              <th style={{ ...th, textAlign: 'right' }}>마감 실적</th>
              <th style={{ ...th, textAlign: 'right' }}>차이</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const cellFs = r.name === '점유율' ? 12 : moneyFs
              return (
              <tr key={r.name} style={{ borderBottom: i < rows.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 500 }}>{r.name}</td>
                <td style={{ ...td, textAlign: 'right', color: C.textSecondary, fontSize: r.name === '매출' ? revFs(r.start) : cellFs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.start}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, fontSize: r.name === '매출' ? revFs(r.end) : cellFs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.end}</td>
                <td style={{ ...td, textAlign: 'right', color: diffColor(r.diffN), fontWeight: 500, fontSize: r.name === '매출' ? revFs(r.diffStr) : cellFs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.diffStr}</td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // 이벤트 일자 마감 미니 카드 — 기존 eventKpi 재사용 (그룹 통합 단일 표)
  const renderEventClosingMini = () => {
    if (eventKpi.length === 0) return null
    const flatRows = eventKpi.flatMap(g => g.dates.map((d: any) => ({ ...d, eventName: g.name })))
    if (flatRows.length === 0) return null
    const moneyFs = (adrUnit === '원' || revUnit === '원') ? 9 : 10
    return (
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '8px 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0b0b0b', marginBottom: 6 }}>이벤트 일자 마감</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '34%' }} /><col style={{ width: '22%' }} /><col style={{ width: '22%' }} /><col style={{ width: '22%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', padding: '2px 4px' }}>일자</th>
              <th style={{ ...th, textAlign: 'right', padding: '2px 4px' }}>점유율</th>
              <th style={{ ...th, textAlign: 'right', padding: '2px 4px' }}>객단가</th>
              <th style={{ ...th, textAlign: 'right', padding: '2px 4px' }}>매출</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.map((d: any, i: number) => (
              <tr key={i} style={{ borderBottom: i < flatRows.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
                <td style={{ padding: '2px 4px', verticalAlign: 'top' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, overflow: 'hidden' }}>
                    <span style={{ fontSize: 10, color: C.textPrimary, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{d.label}</span>
                    <span style={{ fontSize: 9, color: C.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.eventName}</span>
                  </div>
                </td>
                <td style={{ fontSize: 10, color: C.blue, fontWeight: 500, textAlign: 'right', padding: '2px 4px' }}>{d.actOcc}%</td>
                <td style={{ fontSize: moneyFs, color: C.textSecondary, textAlign: 'right', padding: '2px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtAdr(d.actAdrWon)}</td>
                <td style={{ fontSize: moneyFs, color: C.textSecondary, textAlign: 'right', padding: '2px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtRev(d.actRevWon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // 다음 달 이동 가능 여부 (otbDate 전월까지)
  const canNext = (() => {
    const [maxY, maxM] = otbDate.split('-').map(Number)
    const limitY = maxM === 1 ? maxY - 1 : maxY
    const limitM = maxM === 1 ? 12 : maxM - 1
    return !(reportYear > limitY || (reportYear === limitY && reportMonth >= limitM))
  })()

  // 프린트 — 한 틱 지연 후 호출(미리보기 미표시 방지, GMDailyReportModal 동일)
  const handlePrint = () => { setTimeout(() => window.print(), 50) }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: C.overlay, zIndex: 99999,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px 0',
    colorScheme: 'light',
  }
  const contentStyle: React.CSSProperties = {
    width: 'min(900px, 96vw)', background: '#fff', color: '#0b0b0b', colorScheme: 'light',
    borderRadius: 8, position: 'relative', flexShrink: 0,
  }

  const report = (
    <div className="mcr-overlay" style={overlayStyle} onClick={onClose}>
      <div className="mcr-content" style={contentStyle} onClick={e => e.stopPropagation()}>

        {/* ── 헤더 ── */}
        <div className="mcr-header" style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          padding: '12px 16px', borderBottom: `0.5px solid ${C.border}`,
          background: '#fff', position: 'sticky', top: 0, zIndex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="mcr-unit-setting-wrap" style={{ position: 'relative' }}>
              <button onClick={() => setShowUnitSetting(v => !v)} aria-label="단위 설정"
                style={{ width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${showUnitSetting ? C.mint : C.border}`,
                  background: showUnitSetting ? '#e1f5ee' : 'transparent',
                  color: showUnitSetting ? C.mint : C.textMuted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              {showUnitSetting && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#fff', border: `1px solid ${C.mint}33`, borderRadius: 8, padding: '12px 14px', width: 210, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 9999 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 10, letterSpacing: '0.04em' }}>단위 설정</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: C.textSecondary }}>객단가</span>
                    <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 5, overflow: 'hidden' }}>
                      {(['원', '천원'] as const).map(u => (
                        <button key={u} onClick={() => setAdrUnit(u)} style={{ padding: '3px 8px', fontSize: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          background: adrUnit === u ? C.mint : 'transparent', color: adrUnit === u ? '#fff' : C.textMuted, fontWeight: adrUnit === u ? 500 : 400 }}>{u}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ height: 1, background: C.border, margin: '8px 0' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: C.textSecondary }}>매출</span>
                    <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 5, overflow: 'hidden' }}>
                      {(['원', '천원', '백만원'] as const).map(u => (
                        <button key={u} onClick={() => setRevUnit(u)} style={{ padding: '3px 8px', fontSize: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          background: revUnit === u ? C.mint : 'transparent', color: revUnit === u ? '#fff' : C.textMuted, fontWeight: revUnit === u ? 500 : 400 }}>{u}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button onClick={handlePrint} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: `0.5px solid ${C.borderStrong}`, background: 'transparent', cursor: 'pointer', color: '#4a4a48', display: 'flex', alignItems: 'center', gap: 4 }}>
              🖨 출력
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#898781' }}>✕</button>
          </div>
        </div>

        {/* ── 콘텐츠 ── */}
        <div style={{ padding: '16px 28px', colorScheme: 'light', background: '#fff', color: '#0b0b0b' }}>

          {/* ══════════ 1페이지 ══════════ */}
          <div ref={page1Ref} className="mcr-page1">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #0b0b0b' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: C.mint, padding: 0, lineHeight: 1 }}>‹</button>
                <span style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>이전</span>
              </div>
              <div style={{ whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 20, fontWeight: 600, color: '#0b0b0b' }}>월간 마감 보고 _ </span>
                <span style={{ fontSize: 20, fontWeight: 600, color: C.mint }}>{reportMonth}월</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.mint }}> {String(reportYear).slice(-2)}년</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <button onClick={nextMonth} disabled={!canNext} style={{ background: 'none', border: 'none', cursor: canNext ? 'pointer' : 'default', fontSize: 22, color: canNext ? C.mint : '#c8c7c0', padding: 0, lineHeight: 1 }}>›</button>
                <span style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>다음</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#898781', lineHeight: 1.6 }}>
              작성일: {new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })}<br />
              <span style={{ color: C.mint }}>단위 : 실 · {adrUnit} · {revUnit}</span>
            </div>
          </div>

          {/* 마감월 / 온북월 미니 요약 카드 2개 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {renderMiniSummary(`${reportMonth}월`, `${String(reportYear).slice(-2)}년`, '마감', '실적', kpi, C.mint)}
            {renderMiniSummary(`${curM}월`, `${String(curY).slice(-2)}년`, '온북', '온북', curKpi, '#1e2f52', curOtbDate)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {renderStartEnd()}
            {renderEventClosingMini()}
          </div>

          {/* 세그별 실적 */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#0b0b0b', marginBottom: 6 }}>세그별 실적</div>
            <div style={{ background: '#f5f5f3', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '15%' }} />
                  {/* R/N: 실적/목표/전년 */}
                  <col style={{ width: '9.4%' }} /><col style={{ width: '9.4%' }} /><col style={{ width: '9.4%' }} />
                  {/* ADR: 실적/목표/전년 */}
                  <col style={{ width: '9.4%' }} /><col style={{ width: '9.4%' }} /><col style={{ width: '9.4%' }} />
                  {/* REV: 실적/목표/전년 */}
                  <col style={{ width: '9.4%' }} /><col style={{ width: '9.4%' }} /><col style={{ width: '9.4%' }} />
                </colgroup>
                <thead>
                  {/* 그룹 헤더 */}
                  <tr>
                    <th rowSpan={2} style={{ textAlign:'left', padding:'4px 10px', fontSize:9, color:'#898781', fontWeight:500, borderBottom:'0.5px solid #e1e0d9' }}>
                      세그먼트
                    </th>
                    {['실적', '목표비', '전년비'].map(label => (
                      <th key={label} colSpan={3} style={{
                        textAlign:'center', padding:'3px 8px', fontSize:10,
                        color:'#4a4a48', fontWeight:500,
                        borderLeft:'0.5px solid #e1e0d9',
                        borderBottom:'0.5px solid #e1e0d9',
                      }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                  {/* 소컬럼 헤더 */}
                  <tr>
                    {['객실','객단가','매출', '객실','객단가','매출', '객실','객단가','매출'].map((h, i) => (
                      <th key={i} style={{
                        textAlign:'right', padding:'3px 8px', fontSize:9, color:'#898781', fontWeight:500,
                        borderBottom:'0.5px solid #e1e0d9',
                        borderLeft: i % 3 === 0 ? '0.5px solid #e1e0d9' : 'none',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {segKpi.rows.map((row: any) => {
                    const moneyFs = (adrUnit === '원' || revUnit === '원') ? 10 : 11
                    const ov = { whiteSpace: 'nowrap' as const, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const }
                    return (
                    <tr key={row.id} style={{ background: row.bgLightColor || undefined, fontWeight: row.isBold ? 600 : 400 }}>
                      <td style={{ textAlign:'left', padding: '3px 10px 3px ' + (row.indent ? 28 : 10), borderBottom: '0.5px solid #e1e0d9', color: row.fontLightColor || '#0b0b0b', fontSize: nameFs(row.name), ...ov }}>
                        {row.indent ? <><span style={{ color: '#898781' }}>└ </span>{row.name}</> : row.name}
                      </td>
                      {/* 실적 */}
                      <td style={{ textAlign:'right', padding:'3px 8px', borderBottom:'0.5px solid #e1e0d9', borderLeft:'0.5px solid #e1e0d9', ...ov }}>{row.actRn.toLocaleString()}</td>
                      <td style={{ textAlign:'right', padding:'3px 8px', borderBottom:'0.5px solid #e1e0d9', fontSize: revFs(fmtAdr(row.actAdrWon)), ...ov }}>{fmtAdr(row.actAdrWon)}</td>
                      <td style={{ textAlign:'right', padding:'3px 8px', borderBottom:'0.5px solid #e1e0d9', fontSize: revFs(fmtRev(row.actRevWon)), ...ov }}>{fmtRev(row.actRevWon)}</td>
                      {/* 목표비(실적-목표 diff) */}
                      <td style={{ textAlign:'right', padding:'3px 8px', borderBottom:'0.5px solid #e1e0d9', borderLeft:'0.5px solid #e1e0d9', color: row.actRn - row.budRn >= 0 ? '#1d9e75' : '#a32d2d', ...ov }}>
                        {row.actRn - row.budRn > 0 ? `+${(row.actRn - row.budRn).toLocaleString()}` : (row.actRn - row.budRn).toLocaleString()}
                      </td>
                      <td style={{ textAlign:'right', padding:'3px 8px', borderBottom:'0.5px solid #e1e0d9', color: row.actAdrWon - row.budAdrWon >= 0 ? '#1d9e75' : '#a32d2d', fontSize: revFs(sAdr(row.actAdrWon - row.budAdrWon)), ...ov }}>{sAdr(row.actAdrWon - row.budAdrWon)}</td>
                      <td style={{ textAlign:'right', padding:'3px 8px', borderBottom:'0.5px solid #e1e0d9', color: row.actRevWon - row.budRevWon >= 0 ? '#1d9e75' : '#a32d2d', fontSize: revFs(sRev(row.actRevWon - row.budRevWon)), ...ov }}>{sRev(row.actRevWon - row.budRevWon)}</td>
                      {/* 전년(대비 diff) */}
                      <td style={{ textAlign:'right', padding:'3px 8px', borderBottom:'0.5px solid #e1e0d9', borderLeft:'0.5px solid #e1e0d9', color: row.actRn - row.lyRn >= 0 ? '#1d9e75' : '#a32d2d', ...ov }}>
                        {row.actRn - row.lyRn > 0 ? `+${(row.actRn - row.lyRn).toLocaleString()}` : (row.actRn - row.lyRn).toLocaleString()}
                      </td>
                      <td style={{ textAlign:'right', padding:'3px 8px', borderBottom:'0.5px solid #e1e0d9', color: row.actAdrWon - row.lyAdrWon >= 0 ? '#1d9e75' : '#a32d2d', fontSize: revFs(sAdr(row.actAdrWon - row.lyAdrWon)), ...ov }}>{sAdr(row.actAdrWon - row.lyAdrWon)}</td>
                      <td style={{ textAlign:'right', padding:'3px 8px', borderBottom:'0.5px solid #e1e0d9', color: row.actRevWon - row.lyRevWon >= 0 ? '#1d9e75' : '#a32d2d', fontSize: revFs(sRev(row.actRevWon - row.lyRevWon)), ...ov }}>{sRev(row.actRevWon - row.lyRevWon)}</td>
                    </tr>
                    )
                  })}
                  {/* 합계 (HOU 제외) */}
                  <tr style={{ background:'#eeecea', borderTop:'1px solid #c8c7c0' }}>
                    <td style={{ textAlign:'left', fontWeight: 600, padding:'3px 10px', color:'#0b0b0b', fontSize: nameFs(segKpi.total.seg), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{segKpi.total.seg}</td>
                    {/* 실적 */}
                    <td style={{ textAlign:'right', padding:'3px 8px', borderLeft:'0.5px solid #c8c7c0', fontWeight: 600 }}>{segKpi.total.actRn.toLocaleString()}</td>
                    <td style={{ textAlign:'right', padding:'3px 8px', fontWeight: 600, fontSize: revFs(fmtAdr(segKpi.total.actAdrWon)), whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{fmtAdr(segKpi.total.actAdrWon)}</td>
                    <td style={{ textAlign:'right', padding:'3px 8px', fontWeight: 600, fontSize: revFs(fmtRev(segKpi.total.actRevWon)), whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{fmtRev(segKpi.total.actRevWon)}</td>
                    {/* 목표비(실적-목표 diff) */}
                    <td style={{ textAlign:'right', padding:'3px 8px', borderLeft:'0.5px solid #c8c7c0', color: segKpi.total.actRn - segKpi.total.budRn >= 0 ? '#1d9e75' : '#a32d2d' }}>
                      {segKpi.total.actRn - segKpi.total.budRn > 0 ? `+${(segKpi.total.actRn - segKpi.total.budRn).toLocaleString()}` : (segKpi.total.actRn - segKpi.total.budRn).toLocaleString()}
                    </td>
                    <td style={{ textAlign:'right', padding:'3px 8px', color: segKpi.total.actAdrWon - segKpi.total.budAdrWon >= 0 ? '#1d9e75' : '#a32d2d', fontSize: revFs(sAdr(segKpi.total.actAdrWon - segKpi.total.budAdrWon)), whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{sAdr(segKpi.total.actAdrWon - segKpi.total.budAdrWon)}</td>
                    <td style={{ textAlign:'right', padding:'3px 8px', color: segKpi.total.actRevWon - segKpi.total.budRevWon >= 0 ? '#1d9e75' : '#a32d2d', fontSize: revFs(sRev(segKpi.total.actRevWon - segKpi.total.budRevWon)), whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{sRev(segKpi.total.actRevWon - segKpi.total.budRevWon)}</td>
                    {/* 전년(대비 diff) */}
                    <td style={{ textAlign:'right', padding:'3px 8px', borderLeft:'0.5px solid #c8c7c0', color: segKpi.total.actRn - segKpi.total.lyRn >= 0 ? '#1d9e75' : '#a32d2d' }}>
                      {segKpi.total.actRn - segKpi.total.lyRn > 0 ? `+${(segKpi.total.actRn - segKpi.total.lyRn).toLocaleString()}` : (segKpi.total.actRn - segKpi.total.lyRn).toLocaleString()}
                    </td>
                    <td style={{ textAlign:'right', padding:'3px 8px', color: segKpi.total.actAdrWon - segKpi.total.lyAdrWon >= 0 ? '#1d9e75' : '#a32d2d', fontSize: revFs(sAdr(segKpi.total.actAdrWon - segKpi.total.lyAdrWon)), whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{sAdr(segKpi.total.actAdrWon - segKpi.total.lyAdrWon)}</td>
                    <td style={{ textAlign:'right', padding:'3px 8px', color: segKpi.total.actRevWon - segKpi.total.lyRevWon >= 0 ? '#1d9e75' : '#a32d2d', fontSize: revFs(sRev(segKpi.total.actRevWon - segKpi.total.lyRevWon)), whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{sRev(segKpi.total.actRevWon - segKpi.total.lyRevWon)}</td>
                  </tr>
                  {/* 점유율 — 3그룹 병합·가운데 정렬 (실적 / 목표비 diff / 전년비 diff) */}
                  <tr style={{ borderTop:'0.5px solid #e1e0d9' }}>
                    <td style={{ textAlign:'left', fontWeight: 500, padding:'3px 10px', color:'#0b0b0b' }}>점유율</td>
                    <td colSpan={3} style={{ textAlign:'center', padding:'3px 8px', borderLeft:'0.5px solid #e1e0d9', fontWeight: 500 }}>{segKpi.occRow.actOcc}%</td>
                    <td colSpan={3} style={{ textAlign:'center', padding:'3px 8px', borderLeft:'0.5px solid #e1e0d9', color: segKpi.occRow.actOcc - segKpi.occRow.budOcc >= 0 ? '#1d9e75' : '#a32d2d' }}>
                      {diffText(Math.round((segKpi.occRow.actOcc - segKpi.occRow.budOcc) * 10) / 10, '%p')}
                    </td>
                    <td colSpan={3} style={{ textAlign:'center', padding:'3px 8px', borderLeft:'0.5px solid #e1e0d9', color: segKpi.occRow.actOcc - segKpi.occRow.lyOcc >= 0 ? '#1d9e75' : '#a32d2d' }}>
                      {diffText(Math.round((segKpi.occRow.actOcc - segKpi.occRow.lyOcc) * 10) / 10, '%p')}
                    </td>
                  </tr>
                  {/* Rev.PAR — 3그룹 병합·가운데 정렬 (실적 / 목표비 diff / 전년비 diff) */}
                  <tr>
                    <td style={{ textAlign:'left', fontWeight: 500, padding:'3px 10px', color:'#0b0b0b' }}>Rev.PAR</td>
                    <td colSpan={3} style={{ textAlign:'center', padding:'3px 8px', borderLeft:'0.5px solid #e1e0d9', fontWeight: 500, fontSize: (adrUnit === '원' || revUnit === '원') ? 10 : 11, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{fmtAdr(segKpi.revparRow.actRevparWon)}</td>
                    <td colSpan={3} style={{ textAlign:'center', padding:'3px 8px', borderLeft:'0.5px solid #e1e0d9', color: segKpi.revparRow.actRevparWon - segKpi.revparRow.budRevparWon >= 0 ? '#1d9e75' : '#a32d2d', fontSize: (adrUnit === '원' || revUnit === '원') ? 10 : 11, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{sAdr(segKpi.revparRow.actRevparWon - segKpi.revparRow.budRevparWon)}</td>
                    <td colSpan={3} style={{ textAlign:'center', padding:'3px 8px', borderLeft:'0.5px solid #e1e0d9', color: segKpi.revparRow.actRevparWon - segKpi.revparRow.lyRevparWon >= 0 ? '#1d9e75' : '#a32d2d', fontSize: (adrUnit === '원' || revUnit === '원') ? 10 : 11, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{sAdr(segKpi.revparRow.actRevparWon - segKpi.revparRow.lyRevparWon)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          </div>

          {/* ══════════ 2페이지 — 요일별 + 일자별 그래프 ══════════ */}
          <div className="mcr-page-divider" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
            <div style={{ flex: 1, borderTop: '1.5px dashed #e1e0d9' }} />
            <span style={{ fontSize: 10, color: '#898781', background: '#fff', padding: '2px 8px', borderRadius: 10, border: '0.5px solid #e1e0d9' }}>요일별 실적 시작</span>
            <div style={{ flex: 1, borderTop: '1.5px dashed #e1e0d9' }} />
          </div>
          <div ref={page2Ref} className="mcr-page2">
          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b0b0b', marginBottom: 8, breakBefore: 'page' } as React.CSSProperties}>요일별 실적</div>

          {(() => {
            const sorted = [...dowKpi].sort((a, b) => b.occ - a.occ)
            const best = sorted[0], worst = sorted[sorted.length - 1]
            const weakDays = dowKpi.filter(d => d.vsLyOcc < 0 && !d.isFriSat)
            const insight = weakDays.length >= 2
              ? `${weakDays.map(d => d.day).join('·')}요일이 전년 대비 약세 — 주중 프로모션 또는 BAR 조정 검토 필요`
              : `${best.day}요일이 ${best.occ}%로 가장 높고, ${worst.day}요일이 ${worst.occ}%로 가장 낮음`
            return (
              <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span><b style={{ color: C.mint }}>최고</b> {best.day}요일 {best.occ}%</span>
                <span><b style={{ color: '#e24b4a' }}>최저</b> {worst.day}요일 {worst.occ}%</span>
                <span style={{ color: C.textMuted }}>· {insight}</span>
              </div>
            )
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 8, marginBottom: 8 }}>
            {renderDowBarChart()}
            {renderDowRevPie()}
          </div>

          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b0b0b', marginBottom: 5 }}>세그먼트별 요일별 실적</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
            <div>{dowSegKpi.slice(0, Math.ceil(dowSegKpi.length / 2)).map(renderDowSegBox)}</div>
            <div>{dowSegKpi.slice(Math.ceil(dowSegKpi.length / 2)).map(renderDowSegBox)}</div>
          </div>
          </div>
          {/* page2Ref 닫는 태그 — 요일별 실적 + 세그먼트별 요일 실적까지만 포함하도록 위치 조정 */}

          {/* ══════════ 3페이지 — 국적별 실적 + 세그먼트별 국적 실적 ══════════ */}
          <div className="mcr-page-divider" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
            <div style={{ flex: 1, borderTop: '1.5px dashed #e1e0d9' }} />
            <span style={{ fontSize: 10, color: '#898781', background: '#fff', padding: '2px 8px', borderRadius: 10, border: '0.5px solid #e1e0d9' }}>국적별 실적 시작</span>
            <div style={{ flex: 1, borderTop: '1.5px dashed #e1e0d9' }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b0b0b', marginBottom: 10, breakBefore: 'page' } as React.CSSProperties}>국적별 실적</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            <colgroup>
              <col style={{ width: '20%' }} /><col style={{ width: '11.4%' }} /><col style={{ width: '11.4%' }} /><col style={{ width: '11.4%' }} /><col style={{ width: '15.2%' }} /><col style={{ width: '15.2%' }} /><col style={{ width: '15.2%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>국가</th>
                <th style={{ ...th, textAlign: 'right' }}>객실</th>
                <th style={{ ...th, textAlign: 'right' }}>객단가</th>
                <th style={{ ...th, textAlign: 'right' }}>매출</th>
                <th style={{ ...th, textAlign: 'right' }}>전년비(객실)</th>
                <th style={{ ...th, textAlign: 'right' }}>전년비(객단가)</th>
                <th style={{ ...th, textAlign: 'right' }}>전년비(매출)</th>
              </tr>
            </thead>
            <tbody>
              {countryKpi.map(c => (
                <tr key={c.name} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: c.name === '기타' ? 500 : 400 }}>
                    {c.flag && <img src={c.flag} alt="" style={{ width: 14, height: 10.5, marginRight: 5, verticalAlign: 'middle', border: '0.5px solid #e1e0d9' }} />}
                    {c.name}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.rn.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'right', color: C.textSecondary }}>{fmtAdr(c.adrWon)}</td>
                  <td style={{ ...td, textAlign: 'right', color: C.textSecondary }}>{fmtRev(c.revWon)}</td>
                  <td style={{ ...td, textAlign: 'right', color: diffColor(c.diffRn), fontWeight: 500 }}>{c.diffRn > 0 ? `+${c.diffRn}` : c.diffRn}</td>
                  <td style={{ ...td, textAlign: 'right', color: diffColor(c.diffAdrWon), fontWeight: 500 }}>{sAdr(c.diffAdrWon)}</td>
                  <td style={{ ...td, textAlign: 'right', color: diffColor(c.diffRevWon), fontWeight: 500 }}>{sRev(c.diffRevWon)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b0b0b', marginBottom: 10, marginTop: 16 }}>세그먼트별 국적 실적</div>
          {(() => {
            const multiCountrySegs = segCountryKpi.filter(s => s.cells.length > 1)
            const singleCountrySegs = segCountryKpi.filter(s => s.cells.length === 1)
            const dominantCountry = (() => {
              const freq: Record<string, number> = {}
              singleCountrySegs.forEach(s => { const n = s.cells[0].name; freq[n] = (freq[n] ?? 0) + 1 })
              let best = '', bestCount = 0
              Object.entries(freq).forEach(([name, count]) => { if (count > bestCount) { best = name; bestCount = count } })
              return best
            })()

            const mid = Math.ceil(multiCountrySegs.length / 2)
            const leftCards = multiCountrySegs.slice(0, mid)
            const rightCards = multiCountrySegs.slice(mid)

            const singleTable = singleCountrySegs.length > 0 && (
              <div style={{ background: C.cardBg, borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0b0b0b', marginBottom: 4 }}>기타 세그먼트 (국가 1개)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '34%' }} /><col style={{ width: '22%' }} /><col style={{ width: '16%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '2px 4px', borderBottom: `0.5px solid ${C.border}` }}>세그먼트</th>
                      <th style={{ textAlign: 'left', fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '2px 4px', borderBottom: `0.5px solid ${C.border}` }}>국가</th>
                      <th style={{ textAlign: 'right', fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '2px 4px', borderBottom: `0.5px solid ${C.border}` }}>객실</th>
                      <th style={{ textAlign: 'right', fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '2px 4px', borderBottom: `0.5px solid ${C.border}` }}>객단가</th>
                      <th style={{ textAlign: 'right', fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '2px 4px', borderBottom: `0.5px solid ${C.border}` }}>전년비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {singleCountrySegs.map((s, i) => {
                      const c = s.cells[0]
                      const isDifferent = c.name !== dominantCountry
                      return (
                        <tr key={s.seg} style={{ borderBottom: i < singleCountrySegs.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
                          <td style={{ padding: '2px 4px', color: '#0b0b0b', fontWeight: 500 }}>{s.seg}</td>
                          <td style={{ padding: '2px 4px', color: isDifferent ? C.blue : C.textSecondary, fontWeight: isDifferent ? 600 : 400 }}>{c.name}</td>
                          <td style={{ textAlign: 'right', padding: '2px 4px', color: '#0b0b0b' }}>{c.rn > 0 ? c.rn.toLocaleString() : '-'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 4px', color: C.textSecondary }}>{c.rn > 0 ? fmtAdr(c.adrWon) : '-'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 4px', color: diffColor(c.diffRn), fontWeight: 500 }}>{c.diffRn > 0 ? `+${c.diffRn}` : c.diffRn}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )

            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>{leftCards.map(renderSegCountryBox)}</div>
                <div>{rightCards.map(renderSegCountryBox)}{singleTable}</div>
              </div>
            )
          })()}

          {/* ══════════ 4페이지 — 어카운트별 실적 → 일자별 점유율 ══════════ */}
          <div className="mcr-page-divider" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
            <div style={{ flex: 1, borderTop: '1.5px dashed #e1e0d9' }} />
            <span style={{ fontSize: 10, color: '#898781', background: '#fff', padding: '2px 8px', borderRadius: 10, border: '0.5px solid #e1e0d9' }}>세그먼트별 어카운트 실적 시작</span>
            <div style={{ flex: 1, borderTop: '1.5px dashed #e1e0d9' }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b0b0b', marginBottom: 10, breakBefore: 'page' } as React.CSSProperties}>세그먼트별 어카운트 실적</div>
          {(() => {
            const mid = Math.ceil(accountKpi.length / 2)
            const leftGroups = accountKpi.slice(0, mid)
            const rightGroups = accountKpi.slice(mid)

            const renderAccBox = (seg: { seg: string; accounts: any[]; total: any }) => (
              <div key={seg.seg} style={{ background: '#f5f5f3', borderRadius: 8, padding: '10px 14px', marginBottom: 8, breakInside: 'avoid' } as React.CSSProperties}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0b0b0b', marginBottom: 6, paddingBottom: 5, borderBottom: '0.5px solid #e1e0d9' }}>{seg.seg}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '32%' }} /><col style={{ width: '16%' }} /><col style={{ width: '20%' }} /><col style={{ width: '18%' }} /><col style={{ width: '14%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', fontSize: 9, color: '#898781', fontWeight: 500, padding: '0 4px 4px 0', borderBottom: '0.5px solid #e1e0d9' }}>어카운트</th>
                      <th style={{ textAlign: 'right', fontSize: 9, color: '#898781', fontWeight: 500, padding: '0 4px 4px 0', borderBottom: '0.5px solid #e1e0d9' }}>객실</th>
                      <th style={{ textAlign: 'right', fontSize: 9, color: '#898781', fontWeight: 500, padding: '0 4px 4px 0', borderBottom: '0.5px solid #e1e0d9' }}>객단가</th>
                      <th style={{ textAlign: 'right', fontSize: 9, color: '#898781', fontWeight: 500, padding: '0 4px 4px 0', borderBottom: '0.5px solid #e1e0d9' }}>매출</th>
                      <th style={{ textAlign: 'right', fontSize: 9, color: '#898781', fontWeight: 500, padding: '0 0 4px 4px', borderBottom: '0.5px solid #e1e0d9' }}>전년비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seg.accounts.map((a: any) => (
                      <tr key={a.acc} style={{ borderBottom: '0.5px solid #e1e0d9' }}>
                        <td style={{ textAlign: 'left', padding: '3px 4px 3px 0', color: '#0b0b0b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.acc}</td>
                        <td style={{ textAlign: 'right', padding: '3px 4px 3px 0', color: '#0b0b0b' }}>{a.aRn.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', padding: '3px 4px 3px 0', color: '#4a4a48', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtAdr(a.aAdrWon)}</td>
                        <td style={{ textAlign: 'right', padding: '3px 4px 3px 0', color: '#4a4a48', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtRev(a.aRevWon)}</td>
                        <td style={{ textAlign: 'right', padding: '3px 0 3px 4px', color: a.diffRn >= 0 ? '#1d9e75' : '#a32d2d', fontWeight: 500 }}>{a.diffRn > 0 ? `+${a.diffRn}` : a.diffRn}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '1px solid #c8c7c0' }}>
                      <td style={{ textAlign: 'left', padding: '3px 4px 3px 0', color: '#4a4a48', fontWeight: 600 }}>소계</td>
                      <td style={{ textAlign: 'right', padding: '3px 4px 3px 0', color: '#0b0b0b', fontWeight: 600 }}>{seg.total.aRn.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', padding: '3px 4px 3px 0', color: '#4a4a48', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtAdr(seg.total.aAdrWon)}</td>
                      <td style={{ textAlign: 'right', padding: '3px 4px 3px 0', color: '#4a4a48', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtRev(seg.total.aRevWon)}</td>
                      <td style={{ textAlign: 'right', padding: '3px 0 3px 4px', color: seg.total.diffRn >= 0 ? '#1d9e75' : '#a32d2d', fontWeight: 600 }}>{seg.total.diffRn > 0 ? `+${seg.total.diffRn}` : seg.total.diffRn}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )

            const grand = accountKpi.reduce((s, seg) => ({
              aRn: s.aRn + seg.total.aRn, aRevWon: s.aRevWon + seg.total.aRevWon, diffRn: s.diffRn + seg.total.diffRn,
            }), { aRn: 0, aRevWon: 0, diffRn: 0 })

            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>{leftGroups.map(renderAccBox)}</div>
                  <div>{rightGroups.map(renderAccBox)}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f5f5f3', borderRadius: 8, padding: '8px 14px', marginTop: 4, fontWeight: 700 }}>
                  <span style={{ fontSize: 12, color: '#0b0b0b' }}>전체 합계</span>
                  <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
                    <span>객실 {grand.aRn.toLocaleString()}</span>
                    <span>매출 {fmtRev(grand.aRevWon)}</span>
                    <span style={{ color: grand.diffRn >= 0 ? '#1d9e75' : '#a32d2d' }}>객실 증감 {grand.diffRn > 0 ? `+${grand.diffRn}` : grand.diffRn}</span>
                  </div>
                </div>
              </>
            )
          })()}

          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b0b0b', marginBottom: 10, marginTop: 20 }}>
            일자별 점유율
          </div>
          <div style={{ background: '#f5f5f3', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 130 }}>
              {dailyKpi.map(d => (
                <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <span style={{ fontSize: 6.5, color: '#0b0b0b', fontWeight: 500, marginBottom: 2, whiteSpace: 'nowrap' }}>{d.actOcc}%</span>
                  <div style={{ width: '100%', background: d.occColor, borderRadius: '2px 2px 0 0', height: `${Math.min(100, d.actOcc)}%` }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
              {dailyKpi.map(d => (
                <div key={d.label} style={{ flex: 1, textAlign: 'center', fontSize: 6, color: '#898781', writingMode: 'vertical-rl', height: 24 }}>{d.label}</div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )

  return createPortal(report, document.body)
}
