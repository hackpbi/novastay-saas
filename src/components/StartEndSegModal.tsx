'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Calendar, History, Play, LineChart, Flag } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'

type Unit = '원' | '천원' | '백만원'
type MonthState = 'past' | 'current' | 'future'
type Raw = { segmentation: string; nights: number; room_revenue: number }

const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m1: number) => new Date(y, m1, 0).getDate()
const monthEndStr   = (y: number, m1: number) => `${y}-${pad(m1)}-${pad(lastDay(y, m1))}`

function scaleUnit(won: number, unit: Unit): number {
  return unit === '원' ? Math.round(won) : unit === '천원' ? Math.round(won / 1000) : Math.round(won / 1_000_000)
}
function sumCodes(rows: Raw[] | null, codes: string[]): { n: number; rev: number } {
  const acc = { n: 0, rev: 0 }
  if (!rows) return acc
  const set = new Set(codes)
  for (const r of rows) if (set.has(r.segmentation)) { acc.n += r.nights; acc.rev += r.room_revenue }
  return acc
}

// 세그먼트 트리 행 (대분류 + 자식)
type TreeRow = { id: string; name: string; indent: number; codes: string[]; isMain: boolean }
function buildTree(schema: MarketSchemaRow[]): TreeRow[] {
  const tops = schema.filter(s => s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
  const out: TreeRow[] = []
  for (const top of tops) {
    if (top.level === 'main') {
      const children = schema.filter(c => c.parent_id === top.id).sort((a, b) => a.order_index - b.order_index)
      const childCodes = children.length ? children.flatMap(c => c.segmentation) : top.segmentation
      out.push({ id: top.id, name: top.name, indent: 0, codes: childCodes, isMain: true })
      for (const c of children) out.push({ id: c.id, name: c.name, indent: 1, codes: c.segmentation, isMain: false })
    } else {
      out.push({ id: top.id, name: top.name, indent: 0, codes: top.segmentation, isMain: false })
    }
  }
  return out
}

// 비교 모드 5종 — 좌/우에 놓을 (year_type, point_type) 조합
type Mode = 'cy' | 'ly' | 'cmp_start' | 'cmp_otb' | 'cmp_closing'
type ModeCfg = { L: [string, string]; R: [string, string]; gap: string }
const MODE_MAP: Record<Mode, ModeCfg> = {
  cy:          { L: ['cy', 'month_start'], R: ['cy', 'current_otb'], gap: '픽업' },
  ly:          { L: ['ly', 'month_start'], R: ['ly', 'current_otb'], gap: '픽업' },
  cmp_start:   { L: ['cy', 'month_start'], R: ['ly', 'month_start'], gap: '전년 대비' },
  cmp_otb:     { L: ['cy', 'current_otb'], R: ['ly', 'current_otb'], gap: '전년 대비' },
  cmp_closing: { L: ['cy', 'closing'],     R: ['ly', 'closing'],     gap: '전년 대비' },
}

// 올해/전년 모드는 과거월일 때 우측 시점을 current_otb → closing(마감)으로 전환
// (지나간 투숙일은 오늘자 OTB 스냅샷에 없으므로 실적은 closing 에 있음)
function resolveCfg(mode: Mode, monthState: MonthState): ModeCfg {
  const base = MODE_MAP[mode]
  if ((mode === 'cy' || mode === 'ly') && monthState === 'past') {
    return { ...base, R: [base.R[0], 'closing'] as [string, string] }
  }
  return base
}

export default function StartEndSegModal({
  hotelId, year, month, monthState: initialState, roomCount, otbDate, onClose,
}: {
  hotelId:    string | undefined
  year:       number
  month:      number      // 1-based
  monthState: MonthState
  roomCount:  number
  otbDate:    string
  onClose:    () => void
}) {
  const { data: schema } = useMarketSchema()
  const [selYear, setSelYear]   = useState(year)
  const [selMonth, setSelMonth] = useState(month)   // 1-based
  const [titleShifting, setTitleShifting] = useState(false)
  const [adrUnit, setAdrUnit] = useState<Unit>('천원')
  const [revUnit, setRevUnit] = useState<Unit>('백만원')
  const [showUnit, setShowUnit] = useState(false)
  const [selectedSeg, setSelectedSeg] = useState<{ name: string; codes: string[]; grp: 'L' | 'R' | 'gap' } | null>(null)
  const [mode, setMode] = useState<Mode>('cy')

  useEffect(() => {
    setTitleShifting(true)
    const t = setTimeout(() => setTitleShifting(false), 350)
    return () => clearTimeout(t)
  }, [selMonth, selYear])
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  useEffect(() => {
    if (!showUnit) return
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.se-unit-wrap')) setShowUnit(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showUnit])

  const prevMonth = () => { if (selMonth === 1) { setSelYear(y => y - 1); setSelMonth(12) } else setSelMonth(m => m - 1) }
  const nextMonth = () => { if (selMonth === 12) { setSelYear(y => y + 1); setSelMonth(1) } else setSelMonth(m => m + 1) }

  // 현재 월 상태 재계산 (모달 내 네비 반영)
  const otbBase = otbDate ? new Date(otbDate + 'T00:00:00') : new Date()
  const otbY = otbBase.getFullYear(), otbM = otbBase.getMonth() + 1
  const monthState: MonthState =
    selYear < otbY || (selYear === otbY && selMonth < otbM) ? 'past'
    : selYear === otbY && selMonth === otbM ? 'current' : 'future'

  // 비교>OTB 모드는 기준월 이전으로 이동 불가 → 기준월(current)에서 '이전' 비활성
  const otbPrevDisabled = mode === 'cmp_otb' && monthState === 'current'

  // 비교>마감 모드는 기준월 이후로 이동 불가 → 최대 조회월(기준월의 이전달)에서 '다음' 비활성
  const prevBaseY = otbM === 1 ? otbY - 1 : otbY
  const prevBaseM = otbM === 1 ? 12 : otbM - 1
  const closingNextDisabled = mode === 'cmp_closing' && selYear === prevBaseY && selMonth === prevBaseM

  const cap = roomCount * lastDay(selYear, selMonth)

  const { data, isLoading } = useQuery<{ seg: Record<string, Record<string, Raw[]>>; snap: Record<string, Record<string, string | null>> }>({
    queryKey: ['start-end-modal', hotelId, selYear, selMonth, otbDate, monthState],
    enabled: !!hotelId && !!otbDate,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_start_end_data', {
        p_hotel_id: hotelId, p_year: selYear, p_month: selMonth, p_otb_date: otbDate,
      })
      if (error) throw error
      // cy/ly × point_type 전부 분리 (snap_date 그대로 사용)
      const seg: Record<string, Record<string, Raw[]>> = { cy: {}, ly: {} }
      const snap: Record<string, Record<string, string | null>> = { cy: {}, ly: {} }
      for (const r of (data ?? []) as any[]) {
        const yt = r.year_type as string
        if (yt !== 'cy' && yt !== 'ly') continue
        const pt = r.point_type as string
        ;(seg[yt][pt] ??= []).push({ segmentation: r.segmentation, nights: Number(r.nights ?? 0), room_revenue: Number(r.room_revenue ?? 0) })
        if (!(pt in snap[yt])) snap[yt][pt] = r.snap_date ?? null
      }
      return { seg, snap }
    },
  })

  const tree = useMemo(() => buildTree(schema), [schema])
  const houCodes = useMemo(() => {
    const set = new Set<string>()
    for (const s of schema) if (s.segmentation.includes('HOU')) for (const c of s.segmentation) set.add(c)
    return set
  }, [schema])

  // 선택 모드 → 좌/우 (year_type, point_type)  — 올해/전년은 월 상태에 따라 우측 시점 분기
  const cfg = resolveCfg(mode, monthState)
  const [lYt, lPt] = cfg.L
  const [rYt, rPt] = cfg.R
  // 비교 모드는 좌(올해)/우(전년)로 배치 → GAP = 좌−우(=올해−전년) 유지 위해 부호 반전. 픽업(올해/전년)은 우−좌 그대로
  const gapSign = cfg.gap === '전년 대비' ? -1 : 1
  const g1 = data?.seg?.[lYt]?.[lPt] ?? null
  const g2 = data?.seg?.[rYt]?.[rPt] ?? null
  const g1Date = data?.snap?.[lYt]?.[lPt] ?? null
  const g2Date = data?.snap?.[rYt]?.[rPt] ?? null
  const noL = g1 === null
  const noR = g2 === null
  const noGap = noL || noR

  // 시점별 헤더 라벨·색상 (cy 마감은 과거월=마감 / 당월·미래월=전망)
  const sideTitle = (yt: string, pt: string) =>
    yt === 'cy'
      ? (pt === 'month_start' ? '당월초 OTB' : pt === 'current_otb' ? '현재 OTB' : (monthState === 'past' ? '마감' : '전망'))
      : (pt === 'month_start' ? '전년 당월초 OTB' : pt === 'current_otb' ? '전년 동일자 OTB' : '전년 마감')
  const sideColor = (yt: string, pt: string) =>
    yt === 'ly' ? '#F59E0B' : (pt === 'month_start' ? '#7ea3e8' : '#00E5A0')

  // 데이터 없음 라벨: 미래월의 당월초(month_start)만 '미도래', 그 외는 '—'
  const missingLabel = (pt: string) => pt === 'month_start' && monthState === 'future' ? '미도래' : '—'
  const groups = [
    { title: sideTitle(lYt, lPt), color: sideColor(lYt, lPt), date: g1Date, missing: noL, empty: missingLabel(lPt) },
    { title: sideTitle(rYt, rPt), color: sideColor(rYt, rPt), date: g2Date, missing: noR, empty: missingLabel(rPt) },
    { title: `GAP (${cfg.gap})`, color: '#00E5A0', date: null, missing: false, empty: '—' },
  ]

  // 요약 줄용 기준일 포맷 (snap_date 우선, closing 은 'YY.MM 마감/전망' 대체)
  const yy = (yt: string) => String(yt === 'ly' ? selYear - 1 : selYear).slice(2)
  const fmtSideDate = (yt: string, pt: string, date: string | null) =>
    date ? date.slice(2).replace(/-/g, '.')
         : pt === 'closing' ? `${yy(yt)}.${pad(selMonth)} ${yt === 'cy' && monthState !== 'past' ? '전망' : '마감'}`
         : '—'
  const summaryText = `${fmtSideDate(lYt, lPt, g1Date)} → ${fmtSideDate(rYt, rPt, g2Date)} · GAP = ${cfg.gap}`

  // 하단 합계 (HOU 제외)
  const nonHou = useMemo(() => tree.filter(r => !r.isMain && !r.codes.some(c => houCodes.has(c))), [tree, houCodes])
  const allCodes = useMemo(() => nonHou.flatMap(r => r.codes), [nonHou])

  // 우측 Account 패널 — GAP 셀 클릭 시 전용 RPC (account_name 은 별칭 적용됨)
  const { data: acctData } = useQuery<any[]>({
    queryKey: ['start-end-acct', hotelId, selYear, selMonth, otbDate, monthState, selectedSeg ? selectedSeg.codes.join(',') : null],
    enabled: !!hotelId && !!otbDate && !!selectedSeg,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_start_end_account_data', {
        p_hotel_id: hotelId, p_year: selYear, p_month: selMonth, p_otb_date: otbDate,
        p_seg_codes: selectedSeg!.codes,
      })
      if (error) throw error
      return (data ?? []) as any[]
    },
  })
  const accountList = useMemo(() => {
    if (!selectedSeg || !acctData) return []
    const cfg = resolveCfg(mode, monthState)
    const [alYt, alPt] = cfg.L
    const [arYt, arPt] = cfg.R
    const gapSign = cfg.gap === '전년 대비' ? -1 : 1
    const grp = selectedSeg.grp
    const DIM = 'rgba(255,255,255,0.3)'
    const acc: Record<string, { n1: number; n2: number; rev1: number; rev2: number }> = {}
    for (const r of acctData) {
      const k = r.account_name ?? '(없음)'
      acc[k] ??= { n1: 0, n2: 0, rev1: 0, rev2: 0 }
      if (r.year_type === alYt && r.point_type === alPt) { acc[k].n1 += Number(r.nights ?? 0); acc[k].rev1 += Number(r.room_revenue ?? 0) }
      if (r.year_type === arYt && r.point_type === arPt) { acc[k].n2 += Number(r.nights ?? 0); acc[k].rev2 += Number(r.room_revenue ?? 0) }
    }
    if (grp === 'gap') {
      // 증감 (Δ객실 0 제외, Δ객실 내림차순 — 기존)
      return Object.entries(acc).map(([name, v]) => {
        const adr1 = v.n1 > 0 ? v.rev1 / v.n1 : null
        const adr2 = v.n2 > 0 ? v.rev2 / v.n2 : null
        const dN = gapSign * (v.n2 - v.n1)
        const sAdr = (adr1 === null || adr2 === null) ? null : scaleUnit(gapSign * (adr2 - adr1), adrUnit)
        const sRev = scaleUnit(gapSign * (v.rev2 - v.rev1), revUnit)
        return { name, dN, cells: [
          { text: dN === 0 ? '—' : `${dN > 0 ? '+' : ''}${dN.toLocaleString('ko-KR')}`, color: dN > 0 ? '#00E5A0' : dN < 0 ? '#E24B4A' : DIM },
          { text: sAdr === null || sAdr === 0 ? '—' : `${sAdr > 0 ? '+' : ''}${sAdr.toLocaleString()}`, color: sAdr === null || sAdr === 0 ? DIM : sAdr > 0 ? '#00E5A0' : '#E24B4A' },
          { text: sRev === 0 ? '—' : `${sRev > 0 ? '+' : ''}${sRev.toLocaleString()}`, color: sRev > 0 ? '#00E5A0' : sRev < 0 ? '#E24B4A' : DIM },
        ] }
      }).filter(a => a.dN !== 0).sort((a, b) => b.dN - a.dN)
    }
    // 올해(L) / 전년(R) 절대값 (객실 0 제외, 객실 내림차순)
    const col = grp === 'L' ? '#e8e8e8' : '#888'
    return Object.entries(acc).map(([name, v]) => {
      const n = grp === 'L' ? v.n1 : v.n2
      const rev = grp === 'L' ? v.rev1 : v.rev2
      const adrS = n > 0 ? scaleUnit(rev / n, adrUnit) : 0
      const revS = scaleUnit(rev, revUnit)
      return { name, n, cells: [
        { text: n.toLocaleString('ko-KR'), color: col },
        { text: adrS === 0 ? '—' : adrS.toLocaleString(), color: adrS === 0 ? DIM : col },
        { text: revS === 0 ? '—' : revS.toLocaleString(), color: revS === 0 ? DIM : col },
      ] }
    }).filter(a => a.n > 0).sort((a, b) => b.n - a.n)
  }, [selectedSeg, acctData, mode, monthState, adrUnit, revUnit])

  const GBORDER = 'inset 1px 0 0 rgba(0,229,160,0.3)'
  const SEL_BORDER = 'inset 3px 0 0 #00E5A0'
  // 클릭한 '해당 행 + 해당 그룹'의 객실(첫 컬럼) 셀만 강조
  const grpBorder = (grp: 'L' | 'R' | 'gap', name: string) => selectedSeg?.grp === grp && selectedSeg?.name === name ? SEL_BORDER : GBORDER
  // 그룹 셀 클릭 — 같은 그룹+세그 재클릭이면 해제, 아니면 이동
  const pickSeg = (name: string, codes: string[], grp: 'L' | 'R' | 'gap') =>
    setSelectedSeg(prev => prev && prev.grp === grp && prev.name === name ? null : { name, codes, grp })
  const th: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { fontSize: 11, padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }

  // 값 렌더
  const fmtN = (n: number) => n === 0 ? '—' : n.toLocaleString('ko-KR')
  const fmtRev = (rev: number) => rev === 0 ? '—' : scaleUnit(rev, revUnit).toLocaleString()
  const gapColor = (v: number, main: boolean) => v > 0 ? (main ? '#00E5A0' : '#3d9d7c') : v < 0 ? (main ? '#E24B4A' : '#b04745') : 'rgba(255,255,255,0.3)'
  const gapNum = (v: number) => v === 0 ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('ko-KR')}`

  function GroupCells({ name, codes, isMain }: { name: string; codes: string[]; isMain: boolean }) {
    const a = noL ? { n: 0, rev: 0 } : sumCodes(g1, codes)
    const b = noR ? { n: 0, rev: 0 } : sumCodes(g2, codes)
    const dN = gapSign * (b.n - a.n)
    const adrA = a.n > 0 ? a.rev / a.n : 0, adrB = b.n > 0 ? b.rev / b.n : 0
    const dAdr = scaleUnit(gapSign * (adrB - adrA), adrUnit)
    const dRev = scaleUnit(gapSign * (b.rev - a.rev), revUnit)
    return (
      <>
        {/* 그룹1 (올해) */}
        <td style={{ ...td, boxShadow: grpBorder('L', name), cursor: noL ? 'default' : 'pointer' }} onClick={noL ? undefined : () => pickSeg(name, codes, 'L')}>{noL ? '—' : fmtN(a.n)}</td>
        <td style={{ ...td, cursor: noL ? 'default' : 'pointer' }} onClick={noL ? undefined : () => pickSeg(name, codes, 'L')}>{noL ? '—' : (a.n === 0 ? '—' : scaleUnit(a.rev / a.n, adrUnit).toLocaleString())}</td>
        <td style={{ ...td, cursor: noL ? 'default' : 'pointer' }} onClick={noL ? undefined : () => pickSeg(name, codes, 'L')}>{noL ? '—' : fmtRev(a.rev)}</td>
        {/* 그룹2 (전년) */}
        <td style={{ ...td, boxShadow: grpBorder('R', name), cursor: noR ? 'default' : 'pointer' }} onClick={noR ? undefined : () => pickSeg(name, codes, 'R')}>{noR ? '—' : fmtN(b.n)}</td>
        <td style={{ ...td, cursor: noR ? 'default' : 'pointer' }} onClick={noR ? undefined : () => pickSeg(name, codes, 'R')}>{noR ? '—' : (b.n === 0 ? '—' : scaleUnit(b.rev / b.n, adrUnit).toLocaleString())}</td>
        <td style={{ ...td, cursor: noR ? 'default' : 'pointer' }} onClick={noR ? undefined : () => pickSeg(name, codes, 'R')}>{noR ? '—' : fmtRev(b.rev)}</td>
        {/* GAP */}
        <td style={{ ...td, boxShadow: grpBorder('gap', name), cursor: noGap ? 'default' : 'pointer', color: noGap ? 'rgba(255,255,255,0.3)' : gapColor(dN, isMain) }}
            onClick={noGap ? undefined : () => pickSeg(name, codes, 'gap')}>
          {noGap ? '—' : gapNum(dN)}
        </td>
        <td style={{ ...td, cursor: noGap ? 'default' : 'pointer', color: noGap ? 'rgba(255,255,255,0.3)' : gapColor(dAdr, isMain) }}
            onClick={noGap ? undefined : () => pickSeg(name, codes, 'gap')}>
          {noGap ? '—' : (dAdr === 0 ? '—' : `${dAdr > 0 ? '+' : ''}${dAdr.toLocaleString()}`)}
        </td>
        <td style={{ ...td, cursor: noGap ? 'default' : 'pointer', color: noGap ? 'rgba(255,255,255,0.3)' : gapColor(dRev, isMain) }}
            onClick={noGap ? undefined : () => pickSeg(name, codes, 'gap')}>
          {noGap ? '—' : (dRev === 0 ? '—' : `${dRev > 0 ? '+' : ''}${dRev.toLocaleString()}`)}
        </td>
      </>
    )
  }

  // 하단 합계/점유율/REVPAR
  const totA = sumCodes(g1, allCodes)
  const totB = noR ? { n: 0, rev: 0 } : sumCodes(g2, allCodes)
  // 합계 Δ객단가 — 각 그룹의 합계 객단가(매출합/객실합) 차이 (세그별 합산 아님)
  const noAdrTot = noGap || totA.n === 0 || totB.n === 0
  const dAdrTot = scaleUnit(gapSign * ((totB.n > 0 ? totB.rev / totB.n : 0) - (totA.n > 0 ? totA.rev / totA.n : 0)), adrUnit)
  const occ = (n: number) => cap > 0 ? `${((n / cap) * 100).toFixed(1)}%` : '—'
  const revpar = (rev: number) => cap > 0 ? `${Math.round(rev / cap / 1000)}k` : '—'

  const content = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '92vw', maxWidth: 1400, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: '#000', border: '0.5px solid rgba(0,229,160,0.2)', borderLeft: '1.5px solid #00E5A0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={otbPrevDisabled ? undefined : prevMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: otbPrevDisabled ? 'default' : 'pointer', padding: '4px 8px', opacity: otbPrevDisabled ? 0.25 : 1 }}>
              <span style={{ fontSize: 18, color: '#00E5A0', lineHeight: 1 }}>‹</span>
              <span style={{ fontSize: 9, color: 'rgba(0,229,160,0.6)' }}>이전</span>
            </button>
            <span style={{ fontSize: 16, fontWeight: 500, color: '#fff', letterSpacing: '0.04em', transition: 'opacity 0.2s ease, transform 0.35s ease', opacity: titleShifting ? 0.5 : 1, transform: titleShifting ? 'translateX(4px)' : 'translateX(0)' }}>
              Start-End_<span style={{ color: '#00E5A0' }}>{pad(selMonth)}월 <span style={{ fontSize: '0.7em' }}>{String(selYear).slice(-2)}년</span></span>
            </span>
            {monthState === 'past' && (
              <span style={{ fontSize: 9, color: '#F59E0B', border: '0.5px solid rgba(245,158,11,0.35)', borderRadius: 4, padding: '2px 6px', marginLeft: 6 }}>마감</span>
            )}
            <button onClick={closingNextDisabled ? undefined : nextMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: closingNextDisabled ? 'default' : 'pointer', padding: '4px 8px', opacity: closingNextDisabled ? 0.25 : 1 }}>
              <span style={{ fontSize: 18, color: '#00E5A0', lineHeight: 1 }}>›</span>
              <span style={{ fontSize: 9, color: 'rgba(0,229,160,0.6)' }}>다음</span>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: '#555' }}>Start-End</span>
            {/* 올해 / 전년 — 붙은 세그먼트 컨트롤 */}
            <div style={{ display: 'flex', background: '#0c0c0c', border: '0.5px solid #242424', borderRadius: 7, padding: 2 }}>
              <div onClick={() => setMode('cy')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '5px 11px', borderRadius: 5, cursor: 'pointer', ...(mode === 'cy' ? { background: 'rgba(0,229,160,0.12)', color: '#00E5A0' } : { color: '#777' }) }}>
                <Calendar size={12} />올해
              </div>
              <div onClick={() => setMode('ly')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '5px 11px', borderRadius: 5, cursor: 'pointer', ...(mode === 'ly' ? { background: 'rgba(0,229,160,0.12)', color: '#00E5A0' } : { color: '#777' }) }}>
                <History size={12} />전년
              </div>
            </div>
            <div style={{ width: 1, height: 18, background: '#242424' }} />
            {/* 비교 3종 — 분리된 옵션버튼 */}
            <span style={{ fontSize: 10, color: '#555' }}>비교</span>
            <div style={{ display: 'flex', gap: 5 }}>
              <div onClick={() => setMode('cmp_start')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '6px 11px', borderRadius: 6, cursor: 'pointer', ...(mode === 'cmp_start' ? { border: '0.5px solid rgba(0,229,160,0.5)', background: 'rgba(0,229,160,0.08)', color: '#00E5A0' } : { border: '0.5px solid #262626', color: '#888' }) }}>
                <Play size={12} />월초
              </div>
              <div onClick={() => { setMode('cmp_otb'); if (monthState === 'past') { setSelYear(otbY); setSelMonth(otbM) } }} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '6px 11px', borderRadius: 6, cursor: 'pointer', ...(mode === 'cmp_otb' ? { border: '0.5px solid rgba(0,229,160,0.5)', background: 'rgba(0,229,160,0.08)', color: '#00E5A0' } : { border: '0.5px solid #262626', color: '#888' }) }}>
                <LineChart size={12} />OTB
              </div>
              <div onClick={() => { setMode('cmp_closing'); if (monthState !== 'past') { setSelYear(prevBaseY); setSelMonth(prevBaseM) } }} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '6px 11px', borderRadius: 6, cursor: 'pointer', ...(mode === 'cmp_closing' ? { border: '0.5px solid rgba(0,229,160,0.5)', background: 'rgba(0,229,160,0.08)', color: '#00E5A0' } : { border: '0.5px solid #262626', color: '#888' }) }}>
                <Flag size={12} />마감
              </div>
            </div>
            <div style={{ width: 1, height: 18, background: '#242424' }} />
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 4 }}><X size={22} /></button>
          </div>
        </div>

        {/* 본문: 테이블 + Account 패널 */}
        <div style={{ display: 'flex', overflow: 'hidden', flex: 1 }}>
          <div style={{ flex: '1 1 0', minWidth: 0, overflow: 'auto', padding: '12px 20px' }}>
            <div style={{ fontSize: 9, color: '#4a4a4a', marginBottom: 14 }}>{summaryText}</div>
            {isLoading ? (
              <div className="animate-pulse" style={{ height: 300, background: 'var(--color-bg-tertiary)', borderRadius: 8 }} />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }} rowSpan={2}>세그먼트</th>
                    {groups.map((g, i) => (
                      <th key={i} colSpan={3} style={{ ...th, textAlign: 'center', boxShadow: GBORDER, height: 38, verticalAlign: 'middle' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{g.title}</div>
                        <div style={{ fontSize: 9, color: g.color }}>{g.date ? g.date.slice(5).replace('-', '/') : (g.missing ? g.empty : ' ')}</div>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {groups.map((g, gi) => (
                      ['객실', '객단가', '매출'].map((c, ci) => (
                        <th key={`${gi}-${ci}`} style={{ ...th, boxShadow: ci === 0 ? GBORDER : undefined, borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>
                          {gi === 2 ? `Δ${c}` : c}
                        </th>
                      ))
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tree.map(row => (
                    <tr key={row.id} style={{ background: row.isMain ? '#0f1d18' : 'transparent' }}>
                      <td style={{ fontSize: 11, padding: '5px 8px', paddingLeft: row.indent ? 12 : 8, color: row.isMain ? '#fff' : '#999', fontWeight: row.isMain ? 500 : 400, whiteSpace: 'nowrap', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
                        {row.indent ? <><span style={{ color: '#555' }}>└ </span>{row.name}</> : row.name}
                      </td>
                      <GroupCells name={row.name} codes={row.codes} isMain={row.isMain} />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.7)', padding: '7px 8px', borderTop: '1px solid rgba(0,229,160,0.35)' }}>합계 (HOU 제외)</td>
                    {/* 그룹1 */}
                    <td style={{ ...td, boxShadow: GBORDER, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.35)' }}>{fmtN(totA.n)}</td>
                    <td style={{ ...td, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.35)' }}>{totA.n === 0 ? '—' : scaleUnit(totA.rev / totA.n, adrUnit).toLocaleString()}</td>
                    <td style={{ ...td, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.35)' }}>{fmtRev(totA.rev)}</td>
                    {/* 그룹2 */}
                    <td style={{ ...td, boxShadow: GBORDER, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.35)' }}>{noR ? '—' : fmtN(totB.n)}</td>
                    <td style={{ ...td, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.35)' }}>{noR ? '—' : (totB.n === 0 ? '—' : scaleUnit(totB.rev / totB.n, adrUnit).toLocaleString())}</td>
                    <td style={{ ...td, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.35)' }}>{noR ? '—' : fmtRev(totB.rev)}</td>
                    {/* GAP */}
                    <td style={{ ...td, boxShadow: GBORDER, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.35)', color: gapColor(gapSign * (totB.n - totA.n), true) }}>{noGap ? '—' : gapNum(gapSign * (totB.n - totA.n))}</td>
                    <td style={{ ...td, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.35)', color: noAdrTot ? '#3f3f3f' : gapColor(dAdrTot, true) }}>{noAdrTot ? '—' : gapNum(dAdrTot)}</td>
                    <td style={{ ...td, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.35)', color: gapColor(gapSign * (totB.rev - totA.rev), true) }}>{noGap ? '—' : gapNum(scaleUnit(gapSign * (totB.rev - totA.rev), revUnit))}</td>
                  </tr>
                  {/* 점유율 */}
                  <tr>
                    <td style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', padding: '6px 8px' }}>점유율</td>
                    <td colSpan={3} style={{ ...td, textAlign: 'center', boxShadow: GBORDER, fontWeight: 600 }}>{occ(totA.n)}</td>
                    <td colSpan={3} style={{ ...td, textAlign: 'center', boxShadow: GBORDER, fontWeight: 600 }}>{noR ? '—' : occ(totB.n)}</td>
                    <td colSpan={3} style={{ ...td, textAlign: 'center', boxShadow: GBORDER, fontWeight: 600 }}>{noGap ? '—' : `${((gapSign * (totB.n - totA.n) / (cap || 1)) * 100).toFixed(1)}%p`}</td>
                  </tr>
                  {/* REVPAR */}
                  <tr>
                    <td style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', padding: '6px 8px' }}>REVPAR</td>
                    <td colSpan={3} style={{ ...td, textAlign: 'center', boxShadow: GBORDER, fontWeight: 600 }}>{revpar(totA.rev)}</td>
                    <td colSpan={3} style={{ ...td, textAlign: 'center', boxShadow: GBORDER, fontWeight: 600 }}>{noR ? '—' : revpar(totB.rev)}</td>
                    <td colSpan={3} style={{ ...td, textAlign: 'center', boxShadow: GBORDER, fontWeight: 600 }}>{noGap ? '—' : `${Math.round(gapSign * (totB.rev - totA.rev) / (cap || 1) / 1000)}k`}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* 우측 Account 패널 */}
          <div style={{ width: 340, flexShrink: 0, borderLeft: '0.5px solid rgba(0,229,160,0.18)', display: 'flex', flexDirection: 'column', background: '#000' }}>
            <div style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#F59E0B' }}>{selectedSeg && selectedSeg.grp !== 'gap' ? 'Account 실적' : 'Account 증감'}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>{selectedSeg ? (selectedSeg.grp === 'gap' ? (selectedSeg.name || '선택됨') : `${selectedSeg.grp === 'L' ? sideTitle(lYt, lPt) : sideTitle(rYt, rPt)} · ${selectedSeg.name}`) : '세그먼트를 클릭하세요'}</div>
            </div>
            <div style={{ display: 'flex', padding: '4px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', flex: 1 }}>어카운트</span>
              <div style={{ display: 'flex', flexShrink: 0 }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 40, textAlign: 'right' }}>객실</span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 52, textAlign: 'right' }}>객단가</span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 56, textAlign: 'right' }}>매출</span>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {!selectedSeg ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, color: '#3a3a3a', fontSize: 10, padding: 12, textAlign: 'center' }}>
                  <span style={{ fontSize: 16 }}>👆</span>
                  <span>GAP 셀을 클릭하세요</span>
                </div>
              ) : accountList.length === 0 ? (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', padding: 12 }}>데이터 없음</div>
              ) : accountList.map((a, i) => (
                <div key={`${a.name}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 12px', borderBottom: '0.5px solid #141414' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{a.name}</span>
                  <div style={{ display: 'flex', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, width: 40, textAlign: 'right', color: a.cells[0].color }}>{a.cells[0].text}</span>
                    <span style={{ fontSize: 11, width: 52, textAlign: 'right', color: a.cells[1].color }}>{a.cells[1].text}</span>
                    <span style={{ fontSize: 11, width: 56, textAlign: 'right', color: a.cells[2].color }}>{a.cells[2].text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 하단 바 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ fontSize: 10, color: '#666' }}>GAP 셀 클릭 → Account 보기</span>
          <div className="se-unit-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#00E5A0' }}>단위 : 실 · {adrUnit} · {revUnit}</span>
            <button onClick={() => setShowUnit(v => !v)} style={{ width: 22, height: 22, borderRadius: 6, border: '0.5px solid rgba(0,229,160,0.45)', background: '#0d1512', color: '#00E5A0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            {showUnit && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, width: 190, background: '#0f0f0f', border: '0.5px solid #242424', borderRadius: 10, padding: '12px 14px', zIndex: 99999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                <UnitRow label="ADR" value={adrUnit} onChange={setAdrUnit} />
                <div style={{ height: 8 }} />
                <UnitRow label="REV" value={revUnit} onChange={setRevUnit} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

function UnitRow({ label, value, onChange }: { label: string; value: Unit; onChange: (u: Unit) => void }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#777', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['원', '천원', '백만원'] as Unit[]).map(u => {
          const on = value === u
          return (
            <button key={u} onClick={() => onChange(u)} style={{
              flex: 1, fontSize: 11, padding: '6px 0', borderRadius: 6, cursor: 'pointer', background: 'transparent',
              border: on ? '0.5px solid rgba(0,229,160,0.5)' : '0.5px solid #2a2a2a',
              color: on ? '#00E5A0' : '#999',
            }}>{u}</button>
          )
        })}
      </div>
    </div>
  )
}
