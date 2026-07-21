'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import Chart from 'chart.js/auto'
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

  // 예산 Step 1: 해당 연도의 최신 update_date 조회
  const { data: budgetDateData } = useQuery({
    queryKey: ['closing_budget_date', hotelId, reportYear],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a03_budget')
        .select('update_date')
        .eq('hotel_id', hotelId)
        .gte('business_date', `${reportYear}-01-01`)
        .lte('business_date', `${reportYear}-12-31`)
        .order('update_date', { ascending: false })
        .limit(1)
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId && !!reportYear,
    staleTime: 10 * 60 * 1000,
  })
  const budgetUpdateDate = budgetDateData?.[0]?.update_date ?? null

  // 예산 Step 2: get_budget_monthly RPC (최신 update_date 사용)
  const { data: budgetRows } = useQuery({
    queryKey: ['closing_budget', hotelId, reportYear, budgetUpdateDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_budget_monthly', { p_hotel_id: hotelId, p_year: reportYear, p_update_date: budgetUpdateDate })
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId && !!reportYear && !!budgetUpdateDate,
    staleTime: 10 * 60 * 1000,
  })
  const monthBudget = (budgetRows ?? []).filter((r: any) => Number(r.month_num) === reportMonth)
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
  const calMap: Record<string, { day: string; yoy_match: string | null; event: string | null }> = {}
  calData?.forEach((r: any) => { calMap[r.date] = { day: r.day, yoy_match: r.yoy_match, event: r.event } })

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
    // segmentation 기준 집계
    const segMap: Record<string, {
      sorting1: string
      actRn: number; actRev: number
      lyRn:  number; lyRev:  number
      budRn: number; budRev: number
    }> = {}

    // 실적
    ;(actualData ?? []).forEach((r: any) => {
      const seg = r.segmentation ?? '기타'
      if (!segMap[seg]) segMap[seg] = { sorting1: r.sorting1 ?? '', actRn:0, actRev:0, lyRn:0, lyRev:0, budRn:0, budRev:0 }
      segMap[seg].actRn  += r.nights ?? 0
      segMap[seg].actRev += r.room_revenue ?? 0
    })

    // 전년
    ;(lyData ?? []).forEach((r: any) => {
      const seg = r.segmentation ?? '기타'
      if (!segMap[seg]) segMap[seg] = { sorting1: r.sorting1 ?? '', actRn:0, actRev:0, lyRn:0, lyRev:0, budRn:0, budRev:0 }
      segMap[seg].lyRn  += r.nights ?? 0
      segMap[seg].lyRev += r.room_revenue ?? 0
    })

    // 예산 (monthBudget: month_num 필터 후)
    ;(monthBudget ?? []).forEach((r: any) => {
      const seg = r.segmentation ?? '기타'
      if (!segMap[seg]) segMap[seg] = { sorting1: r.sorting1 ?? '', actRn:0, actRev:0, lyRn:0, lyRev:0, budRn:0, budRev:0 }
      segMap[seg].budRn  += r.budget_nights ?? 0
      segMap[seg].budRev += r.budget_revenue ?? 0
    })

    // sorting1 기준 정렬
    const rows = Object.entries(segMap)
      .sort((a, b) => (a[1].sorting1).localeCompare(b[1].sorting1))
      .map(([seg, v]) => {
        const actAdrWon = v.actRn > 0 ? v.actRev / v.actRn : 0
        const lyAdrWon  = v.lyRn  > 0 ? v.lyRev  / v.lyRn  : 0
        const budAdrWon = v.budRn > 0 ? v.budRev / v.budRn : 0
        return {
          seg,
          actRn:  v.actRn,
          actAdrWon,
          actRevWon: v.actRev,
          lyRn:   v.lyRn,
          lyAdrWon,
          lyRevWon:  v.lyRev,
          budRn:  v.budRn,
          budAdrWon,
          budRevWon: v.budRev,
        }
      })

    // 합계 행
    const tot = rows.reduce((s, r) => ({
      actRn: s.actRn+r.actRn, actRev: s.actRev+r.actRevWon,
      lyRn:  s.lyRn+r.lyRn,   lyRev:  s.lyRev+r.lyRevWon,
      budRn: s.budRn+r.budRn, budRev: s.budRev+r.budRevWon,
    }), { actRn:0, actRev:0, lyRn:0, lyRev:0, budRn:0, budRev:0 })

    const totActAdrWon = tot.actRn > 0 ? tot.actRev / tot.actRn : 0
    const totLyAdrWon  = tot.lyRn  > 0 ? tot.lyRev  / tot.lyRn  : 0
    const totBudAdrWon = tot.budRn > 0 ? tot.budRev / tot.budRn : 0

    const total = {
      seg: '합계',
      actRn: tot.actRn, actAdrWon: totActAdrWon, actRevWon: tot.actRev,
      lyRn:  tot.lyRn,  lyAdrWon:  totLyAdrWon,  lyRevWon:  tot.lyRev,
      budRn: tot.budRn, budAdrWon: totBudAdrWon, budRevWon: tot.budRev,
    }

    return { rows, total }
  }, [actualData, lyData, monthBudget])

  // ── 요일별 ──
  const dowKpi = useMemo(() => {
    const dowOrder = ['월', '화', '수', '목', '금', '토', '일']
    const map: Record<string, { rn: number; rev: number; dates: Set<string> }> = {}
    dowOrder.forEach(d => { map[d] = { rn: 0, rev: 0, dates: new Set<string>() } })
    ;(actualData ?? []).forEach((r: any) => {
      const day = calMap[r.business_date]?.day
      if (!day || !map[day]) return
      map[day].rn  += r.nights ?? 0
      map[day].rev += r.room_revenue ?? 0
      map[day].dates.add(r.business_date)
    })
    return dowOrder.map(day => {
      const d = map[day]
      const totalAvailForDow = d.dates.size * roomCount   // 해당 요일 날짜 수 × roomCount
      return {
        day,
        occ:    totalAvailForDow > 0 ? Math.round((d.rn / totalAvailForDow) * 1000) / 10 : 0,
        adrWon: d.rn > 0 ? d.rev / d.rn : 0,
        revWon: d.rev,
        isFriSat: day === '금' || day === '토',
      }
    })
  }, [actualData, calMap, roomCount])

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

  // ── 어카운트별 ──
  const accountKpi = useMemo(() => {
    const segMap: Record<string, { sorting1: string; accounts: Record<string, { aRn: number; aRev: number; lRn: number; lRev: number }> }> = {}

    const addRows = (rows: any[], isLy: boolean) => {
      ;(rows ?? []).forEach((r: any) => {
        const seg = r.segmentation ?? '기타', acc = r.account_name ?? '기타'
        if (!segMap[seg]) segMap[seg] = { sorting1: r.sorting1 ?? '', accounts: {} }
        if (!segMap[seg].accounts[acc]) segMap[seg].accounts[acc] = { aRn: 0, aRev: 0, lRn: 0, lRev: 0 }
        if (isLy) { segMap[seg].accounts[acc].lRn += r.nights ?? 0; segMap[seg].accounts[acc].lRev += r.room_revenue ?? 0 }
        else      { segMap[seg].accounts[acc].aRn += r.nights ?? 0; segMap[seg].accounts[acc].aRev += r.room_revenue ?? 0 }
      })
    }
    addRows(actualData ?? [], false)
    addRows(lyData ?? [], true)

    return Object.entries(segMap)
      .sort((a, b) => (a[1].sorting1).localeCompare(b[1].sorting1))
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
          seg, accounts,
          total: {
            ...tot,
            aAdrWon: tot.aRn > 0 ? tot.aRevWon / tot.aRn : 0,
            diffRn: tot.aRn - tot.lRn, diffRevWon: tot.aRevWon - tot.lRevWon,
          },
        }
      })
  }, [actualData, lyData])

  // ── 일자별 그래프 (Chart.js) ──
  const chartRef  = useRef<HTMLCanvasElement>(null)
  const chartInst = useRef<Chart | null>(null)

  useEffect(() => {
    if (!open || !chartRef.current || !dailyKpi.length) return
    chartInst.current?.destroy()
    chartInst.current = new Chart(chartRef.current, {
      data: {
        labels: dailyKpi.map(d => d.label),
        datasets: [
          { type: 'bar',  label: 'OCC%',    data: dailyKpi.map(d => d.actOcc), backgroundColor: dailyKpi.map(d => d.occColor), yAxisID: 'yOcc', barPercentage: 0.8 } as any,
          { type: 'line', label: 'LY OCC%', data: dailyKpi.map(d => d.lyOcc) as any,  borderColor: '#c8c7c0', borderWidth: 1, borderDash: [3, 3], pointRadius: 0, yAxisID: 'yOcc', tension: 0.3 },
          { type: 'line', label: 'ADR',     data: dailyKpi.map(d => Math.round(d.actAdrWon / (adrUnit === '원' ? 1 : 1000))), borderColor: '#eda100', borderWidth: 1.5, pointRadius: 0, yAxisID: 'yAdr', tension: 0.3 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index', intersect: false,
            callbacks: { label: (ctx: any) => ctx.dataset.label === 'ADR' ? ` ADR: ${ctx.raw.toLocaleString()}${adrUnit === '원' ? '' : 'k'}` : ` ${ctx.dataset.label}: ${ctx.raw}%` },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 7 }, color: '#898781', maxRotation: 0, autoSkip: true, maxTicksLimit: 15 }, border: { display: false } },
          yOcc: { type: 'linear', position: 'left', min: 0, max: 100, grid: { color: '#e1e0d9', lineWidth: 0.5 }, ticks: { font: { size: 8 }, color: '#898781', stepSize: 25, callback: (v: any) => v + '%' }, border: { display: false } },
          yAdr: { type: 'linear', position: 'right', min: 0, grid: { display: false }, ticks: { font: { size: 8 }, color: '#eda100', callback: (v: any) => v.toLocaleString() + (adrUnit === '원' ? '' : 'k') }, border: { display: false } },
        },
      },
    })
    return () => { chartInst.current?.destroy(); chartInst.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dailyKpi, adrUnit])

  // ESC + 스크롤락
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  if (!open) return null

  // ── 스타일 헬퍼 ──
  const th: React.CSSProperties = { fontSize: 10, color: C.textMuted, fontWeight: 500, padding: '5px 6px', borderBottom: `0.5px solid ${C.border}` }
  const td: React.CSSProperties = { fontSize: 11, color: C.textPrimary, padding: '4px 6px' }

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

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: C.overlay, zIndex: 99999,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px 0',
    colorScheme: 'light',
  }
  const contentStyle: React.CSSProperties = {
    width: 'min(794px, 95vw)', background: '#fff', color: '#0b0b0b', colorScheme: 'light',
    borderRadius: 8, position: 'relative', flexShrink: 0,
  }

  const report = (
    <div className="mcr-overlay" style={overlayStyle} onClick={onClose}>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 14mm; }
          .mcr-header { display: none !important; }
          body > *:not(.mcr-overlay) { display: none !important; }
          .mcr-overlay { position: static !important; background: transparent !important; padding: 0 !important; }
          .mcr-content { position: static !important; box-shadow: none !important; border-radius: 0 !important; max-height: none !important; overflow: visible !important; width: 100% !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="mcr-content" style={contentStyle} onClick={e => e.stopPropagation()}>

        {/* ── 헤더 ── */}
        <div className="mcr-header" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: `0.5px solid ${C.border}`,
          background: '#fff', position: 'sticky', top: 0, zIndex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#898781', padding: '0 4px', lineHeight: 1 }}>‹</button>
            <span style={{ fontSize: 16, fontWeight: 500, color: '#0b0b0b', whiteSpace: 'nowrap' }}>
              마감보고서_{String(reportMonth).padStart(2, '0')}월 {String(reportYear).slice(-2)}년
            </span>
            <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#898781', padding: '0 4px', lineHeight: 1 }}>›</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: C.mint, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
              단위 : 실 · {adrUnit} · {revUnit}
            </span>
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
            <button onClick={() => window.print()} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: `0.5px solid ${C.borderStrong}`, background: 'transparent', cursor: 'pointer', color: '#4a4a48', display: 'flex', alignItems: 'center', gap: 4 }}>
              🖨 출력
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#898781' }}>✕</button>
          </div>
        </div>

        {/* ── 콘텐츠 ── */}
        <div style={{ padding: '24px 28px', colorScheme: 'light', background: '#fff', color: '#0b0b0b' }}>

          {/* ══════════ 1페이지 ══════════ */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, paddingBottom: 12, borderBottom: '1.5px solid #0b0b0b' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>월간 마감 보고</div>
              <div style={{ fontSize: 13, color: '#898781', marginTop: 3 }}>{reportYear}년 {reportMonth}월</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#898781', lineHeight: 1.6 }}>
              객실 수: {roomCount}실<br />
              작성일: {new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })}
            </div>
          </div>

          {/* KPI 4개 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
            {kpiCards.map(c => (
              <div key={c.label} style={{ background: C.cardBg, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 5 }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: C.textPrimary }}>{renderVal(c.value, 20)}</div>
                <div style={{ borderTop: `0.5px solid ${C.border}`, paddingTop: 6, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
                    <span style={{ color: C.textMuted }}>목표대비</span>
                    <span style={{ fontWeight: 500 }}>{renderVal(c.budSub, 10, diffColor(c.budSubN))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
                    <span style={{ color: C.textMuted }}>전년비</span>
                    <span style={{ fontWeight: 500 }}>{renderVal(c.sub, 10, diffColor(c.subN))}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 비교표 */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>구분</th>
                <th style={{ ...th, textAlign: 'right' }}>실적</th>
                <th style={{ ...th, textAlign: 'right' }}>목표</th>
                <th style={{ ...th, textAlign: 'right' }}>목표대비</th>
                <th style={{ ...th, textAlign: 'right' }}>전년</th>
                <th style={{ ...th, textAlign: 'right' }}>전년대비</th>
              </tr>
            </thead>
            <tbody>
              {kpiRows.map(r => (
                <tr key={r.name} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 500 }}>{r.name}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{renderVal(r.act, 11)}</td>
                  <td style={{ ...td, textAlign: 'right', color: C.textSecondary }}>{renderVal(r.bud, 11)}</td>
                  <td style={{ ...td, textAlign: 'right', color: diffColor(r.vsBudN), fontWeight: 500 }}>{renderVal(r.vsBud, 11)}</td>
                  <td style={{ ...td, textAlign: 'right', color: C.textSecondary }}>{renderVal(r.ly, 11)}</td>
                  <td style={{ ...td, textAlign: 'right', color: diffColor(r.vsLyN), fontWeight: 500 }}>{renderVal(r.vsLy, 11)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 세그별 실적 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#0b0b0b', marginBottom: 10 }}>세그별 실적</div>
            <div style={{ background: '#f5f5f3', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '16%' }} />
                  {/* R/N: 실적/목표/전년 */}
                  <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
                  {/* ADR: 실적/목표/전년 */}
                  <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
                  {/* REV: 실적/목표/전년 */}
                  <col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
                </colgroup>
                <thead>
                  {/* 그룹 헤더 */}
                  <tr>
                    <th rowSpan={2} style={{ textAlign:'left', padding:'8px 10px', fontSize:9, color:'#898781', fontWeight:500, borderBottom:'0.5px solid #e1e0d9' }}>
                      세그먼트
                    </th>
                    {[['R/N'], ['ADR'], ['REV']].map(([label]) => (
                      <th key={label} colSpan={3} style={{
                        textAlign:'center', padding:'6px 8px', fontSize:10,
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
                    {['실적','목표','전년', '실적','목표','전년', '실적','목표','전년'].map((h, i) => (
                      <th key={i} style={{
                        textAlign:'right', padding:'5px 8px', fontSize:9, color:'#898781', fontWeight:500,
                        borderBottom:'0.5px solid #e1e0d9',
                        borderLeft: i % 3 === 0 ? '0.5px solid #e1e0d9' : 'none',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...segKpi.rows, { ...segKpi.total, isTotal: true }].map((row: any, idx: number) => (
                    <tr key={idx} style={row.isTotal ? { background:'#eeecea', borderTop:'1px solid #c8c7c0' } : {}}>
                      <td style={{ textAlign:'left', fontWeight: row.isTotal ? 500 : 400, padding:'5px 10px', borderBottom: row.isTotal ? 'none' : '0.5px solid #e1e0d9', color:'#0b0b0b' }}>
                        {row.seg}
                      </td>
                      {/* R/N */}
                      <td style={{ textAlign:'right', padding:'5px 8px', borderBottom: row.isTotal ? 'none' : '0.5px solid #e1e0d9', borderLeft:'0.5px solid #e1e0d9', fontWeight: row.isTotal ? 500 : 400 }}>
                        {row.actRn.toLocaleString()}
                      </td>
                      <td style={{ textAlign:'right', padding:'5px 8px', borderBottom: row.isTotal ? 'none' : '0.5px solid #e1e0d9', color:'#898781' }}>
                        {row.budRn.toLocaleString()}
                      </td>
                      <td style={{ textAlign:'right', padding:'5px 8px', borderBottom: row.isTotal ? 'none' : '0.5px solid #e1e0d9', color: row.actRn - row.lyRn >= 0 ? '#1d9e75' : '#a32d2d' }}>
                        {row.actRn - row.lyRn > 0 ? `+${(row.actRn - row.lyRn).toLocaleString()}` : (row.actRn - row.lyRn).toLocaleString()}
                      </td>
                      {/* ADR */}
                      <td style={{ textAlign:'right', padding:'5px 8px', borderBottom: row.isTotal ? 'none' : '0.5px solid #e1e0d9', borderLeft:'0.5px solid #e1e0d9', fontWeight: row.isTotal ? 500 : 400 }}>
                        {fmtAdr(row.actAdrWon)}
                      </td>
                      <td style={{ textAlign:'right', padding:'5px 8px', borderBottom: row.isTotal ? 'none' : '0.5px solid #e1e0d9', color:'#898781' }}>
                        {fmtAdr(row.budAdrWon)}
                      </td>
                      <td style={{ textAlign:'right', padding:'5px 8px', borderBottom: row.isTotal ? 'none' : '0.5px solid #e1e0d9', color: row.actAdrWon - row.lyAdrWon >= 0 ? '#1d9e75' : '#a32d2d' }}>
                        {sAdr(row.actAdrWon - row.lyAdrWon)}
                      </td>
                      {/* REV */}
                      <td style={{ textAlign:'right', padding:'5px 8px', borderBottom: row.isTotal ? 'none' : '0.5px solid #e1e0d9', borderLeft:'0.5px solid #e1e0d9', fontWeight: row.isTotal ? 500 : 400 }}>
                        {fmtRev(row.actRevWon)}
                      </td>
                      <td style={{ textAlign:'right', padding:'5px 8px', borderBottom: row.isTotal ? 'none' : '0.5px solid #e1e0d9', color:'#898781' }}>
                        {fmtRev(row.budRevWon)}
                      </td>
                      <td style={{ textAlign:'right', padding:'5px 8px', borderBottom: row.isTotal ? 'none' : '0.5px solid #e1e0d9', color: row.actRevWon - row.lyRevWon >= 0 ? '#1d9e75' : '#a32d2d' }}>
                        {sRev(row.actRevWon - row.lyRevWon)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ══════════ 2페이지 — 요일별 + 이벤트 ══════════ */}
          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b0b0b', marginBottom: 10, breakBefore: 'page' } as React.CSSProperties}>요일별 실적</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 20 }}>
            {dowKpi.map(d => (
              <div key={d.day} style={{ background: C.cardBg, borderRadius: 8, padding: '10px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: d.isFriSat ? '#e24b4a' : C.textPrimary, marginBottom: 6 }}>{d.day}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.blue }}>{d.occ}%</div>
                <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3 }}>{fmtAdr(d.adrWon)} · {fmtRev(d.revWon)}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b0b0b', marginBottom: 10 }}>이벤트 실적</div>
          {eventKpi.length === 0 ? (
            <div style={{ fontSize: 11, color: C.textMuted, padding: '8px 0' }}>해당 월 이벤트 없음</div>
          ) : eventKpi.map(g => (
            <div key={g.name} style={{ background: C.cardBg, borderRadius: 8, padding: '10px 14px', marginBottom: 8, breakInside: 'avoid' } as React.CSSProperties}>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.textPrimary, marginBottom: 4, paddingBottom: 4, borderBottom: `0.5px solid ${C.border}` }}>{g.name}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left', padding: '2px 4px' }}>일자</th>
                    <th style={{ ...th, textAlign: 'right', padding: '2px 4px' }}>점유율</th>
                    <th style={{ ...th, textAlign: 'right', padding: '2px 4px' }}>객단가</th>
                    <th style={{ ...th, textAlign: 'right', padding: '2px 4px' }}>매출</th>
                    <th style={{ ...th, textAlign: 'right', padding: '2px 4px' }}>전년 점유율</th>
                    <th style={{ ...th, textAlign: 'right', padding: '2px 4px' }}>전년 객단가</th>
                  </tr>
                </thead>
                <tbody>
                  {g.dates.map((d: any, i: number) => (
                    <tr key={i} style={{ borderBottom: i < g.dates.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
                      <td style={{ fontSize: 10, color: C.textPrimary, padding: '2px 4px' }}>{d.label}</td>
                      <td style={{ fontSize: 10, color: C.blue, fontWeight: 500, textAlign: 'right', padding: '2px 4px' }}>{d.actOcc}%</td>
                      <td style={{ fontSize: 10, color: C.textSecondary, textAlign: 'right', padding: '2px 4px' }}>{fmtAdr(d.actAdrWon)}</td>
                      <td style={{ fontSize: 10, color: C.textSecondary, textAlign: 'right', padding: '2px 4px' }}>{fmtRev(d.actRevWon)}</td>
                      <td style={{ fontSize: 10, color: C.textMuted, textAlign: 'right', padding: '2px 4px' }}>{d.lyOcc !== null ? `${d.lyOcc}%` : '-'}</td>
                      <td style={{ fontSize: 10, color: C.textMuted, textAlign: 'right', padding: '2px 4px' }}>{d.lyAdrWon !== null ? fmtAdr(d.lyAdrWon) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* ══════════ 3페이지 — 일자별 그래프 ══════════ */}
          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b0b0b', marginBottom: 10, breakBefore: 'page' } as React.CSSProperties}>
            일자별 OCC% & ADR
            <span style={{ fontSize: 10, color: '#898781', marginLeft: 8 }}>· 전년 포함</span>
          </div>
          <div style={{ background: '#f5f5f3', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 9, color: '#898781' }}>
              <span>■ <span style={{ color: '#2a78d6' }}>OCC% (실적)</span></span>
              <span>- - <span style={{ color: '#c8c7c0' }}>LY OCC%</span></span>
              <span>━ <span style={{ color: '#eda100' }}>ADR</span></span>
            </div>
            <div style={{ height: 180 }}>
              <canvas ref={chartRef} />
            </div>
          </div>

          {/* ══════════ 4페이지 — 어카운트별 실적 ══════════ */}
          <div style={{ fontSize: 13, fontWeight: 500, color: '#0b0b0b', marginBottom: 10, breakBefore: 'page' } as React.CSSProperties}>세그먼트별 어카운트 실적</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>어카운트</th>
                <th style={{ ...th, textAlign: 'right' }}>RN</th>
                <th style={{ ...th, textAlign: 'right' }}>매출</th>
                <th style={{ ...th, textAlign: 'right' }}>객단가</th>
                <th style={{ ...th, textAlign: 'right' }}>전년 RN</th>
                <th style={{ ...th, textAlign: 'right' }}>RN 증감</th>
                <th style={{ ...th, textAlign: 'right' }}>매출 증감</th>
              </tr>
            </thead>
            <tbody>
              {accountKpi.map(seg => (
                <React.Fragment key={`seg-group-${seg.seg}`}>
                  <tr key={`seg-${seg.seg}`} style={{ background: C.cardBg }}>
                    <td colSpan={7} style={{ ...td, fontWeight: 600, color: C.textPrimary, padding: '5px 6px' }}>{seg.seg}</td>
                  </tr>
                  {seg.accounts.map(a => (
                    <tr key={`${seg.seg}-${a.acc}`} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                      <td style={{ ...td, textAlign: 'left', paddingLeft: 16 }}>{a.acc}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{a.aRn.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtRev(a.aRevWon)}</td>
                      <td style={{ ...td, textAlign: 'right', color: C.textSecondary }}>{fmtAdr(a.aAdrWon)}</td>
                      <td style={{ ...td, textAlign: 'right', color: C.textSecondary }}>{a.lRn.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: 'right', color: diffColor(a.diffRn), fontWeight: 500 }}>{diffText(a.diffRn, '')}</td>
                      <td style={{ ...td, textAlign: 'right', color: diffColor(a.diffRevWon), fontWeight: 500 }}>{sRev(a.diffRevWon)}</td>
                    </tr>
                  ))}
                  <tr key={`tot-${seg.seg}`} style={{ borderBottom: `1px solid ${C.borderStrong}` }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: C.textSecondary }}>{seg.seg} 소계</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{seg.total.aRn.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtRev(seg.total.aRevWon)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: C.textSecondary }}>{fmtAdr(seg.total.aAdrWon)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: C.textSecondary }}>{seg.total.lRn.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: diffColor(seg.total.diffRn) }}>{diffText(seg.total.diffRn, '')}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: diffColor(seg.total.diffRevWon) }}>{sRev(seg.total.diffRevWon)}</td>
                  </tr>
                </React.Fragment>
              ))}
              {/* 전체 합계 */}
              {(() => {
                const g = accountKpi.reduce((s, seg) => ({
                  aRn: s.aRn + seg.total.aRn, aRevWon: s.aRevWon + seg.total.aRevWon,
                  lRn: s.lRn + seg.total.lRn, diffRn: s.diffRn + seg.total.diffRn, diffRevWon: s.diffRevWon + seg.total.diffRevWon,
                }), { aRn: 0, aRevWon: 0, lRn: 0, diffRn: 0, diffRevWon: 0 })
                return (
                  <tr style={{ borderTop: `2px solid #0b0b0b`, background: C.cardBg }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>전체 합계</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{g.aRn.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtRev(g.aRevWon)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{g.aRn > 0 ? fmtAdr(g.aRevWon / g.aRn) : fmtAdr(0)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: C.textSecondary }}>{g.lRn.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: diffColor(g.diffRn) }}>{diffText(g.diffRn, '')}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: diffColor(g.diffRevWon) }}>{sRev(g.diffRevWon)}</td>
                  </tr>
                )
              })()}
            </tbody>
          </table>

        </div>
      </div>
    </div>
  )

  return createPortal(report, document.body)
}
