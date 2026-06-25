'use client'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'
import { useActualMonthly } from '@/hooks/useActualMonthly'
import { useOtbData } from '@/hooks/useOtbData'
import { useTheme } from '@/contexts/ThemeContext'

interface Props {
  open:       boolean
  onClose:    () => void
  monthKey:    string                 // 'YYYY-MM' 또는 '' (YTD 모드)
  monthLabel:  string                 // 'Jun 2026' 또는 'YTD 2026'
  isOtb:       boolean                // true=OTB월, false=Actual월
  hotelId:     string
  roomCount:   number
  isYtd?:      boolean                // true = YTD 전체 집계 모드
  ytdToMonth?: number                 // YTD 기준 마지막 월 (curYM 전월)
  defaultMode?: 'budget' | 'ly'       // 진입 시 비교 모드 기본값
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── 포맷 ───────────────────────────────────────────────────────────────────────
const fmtInt      = (v: number) => Math.round(v).toLocaleString()
const fmtSignInt  = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(Math.round(v)).toLocaleString()}`
const fmtRevM     = (v: number) => `${(v / 1_000_000).toFixed(1)}M`
const fmtSignRevM = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v / 1_000_000).toFixed(1)}M`

const NEG = 'var(--color-negative)'

type Stat = { n: number; r: number }       // nights, revenue
const adr = (s: Stat) => (s.n > 0 ? s.r / s.n : 0)

// ADR 천원(k) 단위
const fmtAdrK     = (adrVal: number) => `${Math.round(adrVal / 1000)}k`
const fmtSignAdrK = (d: number) => `${d >= 0 ? '+' : '-'}${Math.abs(Math.round(d / 1000))}k`

export default function ActualBudgetDetailModal({ open, onClose, monthKey, monthLabel, isOtb, hotelId, roomCount, isYtd = false, ytdToMonth, defaultMode = 'budget' }: Props) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [compareMode, setCompareMode] = useState<'budget' | 'ly'>(defaultMode)
  // vs LY 어카운트 패널: 선택된 세그먼트 행 (id=하이라이트, label=헤더, codes=집계)
  const [selectedSeg, setSelectedSeg] = useState<{ id: string; label: string; codes: string[] } | null>(null)

  // YTD 모드: monthKey 없이 monthLabel('YTD 2026')에서 연도 파싱, 1~ytdMonth 집계
  const ytdMonth = ytdToMonth ?? 12
  const year  = isYtd ? Number(monthLabel.replace(/[^0-9]/g, '')) : Number(monthKey.slice(0, 4))
  const month = isYtd ? ytdMonth : Number(monthKey.slice(5, 7))

  // ── ESC + scroll lock ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // 진입(open)·기본모드 변경 시 비교 모드 동기화
  useEffect(() => { if (open) setCompareMode(defaultMode) }, [open, defaultMode])
  // 비교 모드 전환 시 어카운트 선택 초기화
  useEffect(() => { setSelectedSeg(null) }, [compareMode])

  // ── 데이터 소스 ─────────────────────────────────────────────────────────────
  const { data: schema = [], loading: sLoad } = useMarketSchema()
  // Actual(당해) + LY(전년) 동시 조회
  const { data: actualMonthly = [], isLoading: amLoad } = useActualMonthly({ hotelId, fromYear: year - 1, toYear: year })
  // OTB월용: useOtbData (현재 otbDate 기준 범위, business_date별 otb_nights/otb_revenue)
  const { data: otbRows = [], loading: oLoad } = useOtbData()

  const { data: budgetRows = [], isLoading: bLoad } = useQuery({
    queryKey: ['ab_detail_budget', hotelId, year, isYtd ? `ytd-${ytdMonth}` : month],
    enabled: open && !!hotelId && (isYtd || !!monthKey),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: dateRow } = await (supabase as any)
        .from('a04_budget_mtd')
        .select('update_date')
        .eq('hotel_id', hotelId)
        .eq('confirmed', true)
        .order('update_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!dateRow) return []
      let q = (supabase as any)
        .from('a04_budget_mtd')
        .select('segmentation, budget_nights, budget_revenue')
        .eq('hotel_id', hotelId)
        .eq('update_date', dateRow.update_date)
        .eq('confirmed', true)
        .eq('year', year)
      q = isYtd ? q.lte('month', ytdMonth) : q.eq('month', month)   // YTD: 1~ytdMonth 합산
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as { segmentation: string; budget_nights: number; budget_revenue: number }[]
    },
  })

  const loading = sLoad || amLoad || bLoad || (isOtb && oLoad)

  // ── segmentation 코드별 합산 맵 ──────────────────────────────────────────────
  // Actual/OTB 컬럼: OTB월=useOtbData(otb_*), Actual월=useActualMonthly(actual_*)
  const actualSeg = useMemo(() => {
    const m = new Map<string, Stat>()
    if (isOtb) {
      // OTB 데이터: business_date 기준 해당 기간 필터 후 segmentation별 합산
      for (const r of otbRows) {
        const d = new Date(r.business_date + 'T00:00:00')
        const rowYear  = d.getFullYear()
        const rowMonth = d.getMonth() + 1
        if (rowYear !== year) continue
        if (isYtd ? rowMonth > ytdMonth : rowMonth !== month) continue
        const e = m.get(r.segmentation) ?? { n: 0, r: 0 }
        e.n += r.otb_nights  ?? 0
        e.r += r.otb_revenue ?? 0
        m.set(r.segmentation, e)
      }
    } else {
      // Actual 데이터: useActualMonthly (year/month 또는 1~ytdMonth)
      for (const r of actualMonthly) {
        if (r.year !== year) continue
        if (isYtd ? r.month_num > ytdMonth : r.month_num !== month) continue
        const e = m.get(r.segmentation) ?? { n: 0, r: 0 }
        e.n += r.actual_nights  ?? 0
        e.r += r.actual_revenue ?? 0
        m.set(r.segmentation, e)
      }
    }
    return m
  }, [isOtb, otbRows, actualMonthly, year, month, isYtd, ytdMonth])

  const budgetSeg = useMemo(() => {
    const m = new Map<string, Stat>()
    for (const r of budgetRows) {
      const e = m.get(r.segmentation) ?? { n: 0, r: 0 }
      e.n += r.budget_nights  ?? 0
      e.r += r.budget_revenue ?? 0
      m.set(r.segmentation, e)
    }
    return m
  }, [budgetRows])

  // LY: useActualMonthly에서 전년(year-1) 필터 (YTD=1~ytdMonth, 월별=동월)
  const lySeg = useMemo(() => {
    const m = new Map<string, Stat>()
    for (const r of actualMonthly) {
      if (r.year !== year - 1) continue
      if (isYtd ? r.month_num > ytdMonth : r.month_num !== month) continue
      const e = m.get(r.segmentation) ?? { n: 0, r: 0 }
      e.n += r.actual_nights  ?? 0
      e.r += r.actual_revenue ?? 0
      m.set(r.segmentation, e)
    }
    return m
  }, [actualMonthly, year, month, isYtd, ytdMonth])

  const compareSeg = compareMode === 'budget' ? budgetSeg : lySeg

  // ── 어카운트 증감 (선택 세그먼트, 당해 vs 전년, ΔREV 내림차순) ────────────────
  const accountList = useMemo(() => {
    if (!selectedSeg) return []
    const inCodes = (seg: string) => selectedSeg.codes.includes(seg)

    const currMap: Record<string, { rn: number; rev: number }> = {}
    const lyMap:   Record<string, { rn: number; rev: number }> = {}
    for (const r of actualMonthly) {
      if (!inCodes(r.segmentation)) continue
      const monthOk = isYtd ? r.month_num <= ytdMonth : r.month_num === month
      if (!monthOk) continue
      const k = r.account_name ?? '(없음)'
      if (r.year === year) {
        if (!currMap[k]) currMap[k] = { rn: 0, rev: 0 }
        currMap[k].rn  += r.actual_nights  ?? 0
        currMap[k].rev += r.actual_revenue ?? 0
      } else if (r.year === year - 1) {
        if (!lyMap[k]) lyMap[k] = { rn: 0, rev: 0 }
        lyMap[k].rn  += r.actual_nights  ?? 0
        lyMap[k].rev += r.actual_revenue ?? 0
      }
    }

    const all = new Set([...Object.keys(currMap), ...Object.keys(lyMap)])
    return Array.from(all).map(name => ({
      name,
      diffRn:  (currMap[name]?.rn  ?? 0) - (lyMap[name]?.rn  ?? 0),
      diffRev: (currMap[name]?.rev ?? 0) - (lyMap[name]?.rev ?? 0),
    })).sort((a, b) => Math.abs(b.diffRn) - Math.abs(a.diffRn))
  }, [selectedSeg, actualMonthly, year, month, isYtd, ytdMonth])

  // ── schema 행 순서 정렬 (main 뒤에 sub) ──────────────────────────────────────
  const orderedSchema = useMemo(() => {
    const topLevel = schema.filter(s => s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
    const out: MarketSchemaRow[] = []
    for (const top of topLevel) {
      out.push(top)
      if (top.level === 'main') {
        out.push(...schema.filter(c => c.parent_id === top.id).sort((a, b) => a.order_index - b.order_index))
      }
    }
    return out
  }, [schema])

  // 행 코드: main = 모든 sub 자식 코드 / mid·sub = 자체 코드
  const rowCodes = (s: MarketSchemaRow): string[] =>
    s.level === 'main'
      ? schema.filter(c => c.parent_id === s.id).flatMap(c => c.segmentation)
      : s.segmentation

  const agg = (segMap: Map<string, Stat>, codes: string[]): Stat => {
    let n = 0, r = 0
    for (const c of codes) { const e = segMap.get(c); if (e) { n += e.n; r += e.r } }
    return { n, r }
  }

  // ── HOU 코드 집합 (합계 제외용) ──────────────────────────────────────────────
  const houCodes = useMemo(() => {
    const set = new Set<string>()
    for (const s of schema) if (s.segmentation.includes('HOU')) for (const c of s.segmentation) set.add(c)
    return set
  }, [schema])

  // ── 합계 (HOU 제외) ─────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const sum = (segMap: Map<string, Stat>): Stat => {
      let n = 0, r = 0
      for (const [code, e] of segMap.entries()) { if (houCodes.has(code)) continue; n += e.n; r += e.r }
      return { n, r }
    }
    return { actual: sum(actualSeg), compare: sum(compareSeg) }
  }, [actualSeg, compareSeg, houCodes])

  // 분모 가용객실: YTD=1~ytdMonth 일수 합, 월별=해당 월 일수
  const periodDays = isYtd
    ? Array.from({ length: ytdMonth }, (_, i) => new Date(year, i + 1, 0).getDate()).reduce((a, b) => a + b, 0)
    : new Date(year, month, 0).getDate()
  const denom = roomCount * periodDays

  if (!open) return null

  // ── 라벨/색상 상수 ───────────────────────────────────────────────────────────
  const actualLabel  = isOtb ? 'OTB' : 'Actual'
  const compareLabel = compareMode === 'budget' ? 'Budget' : 'Last Year'
  const cmpSep  = 'inset 1px 0 0 rgba(0,229,160,0.3)'
  const gapSep  = compareMode === 'budget' ? 'inset 1px 0 0 rgba(255,100,100,0.3)' : 'inset 1px 0 0 rgba(255,200,80,0.3)'

  // 헤더 셀 스타일
  const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.45)', padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap', minWidth: 60, background: '#0a0a0a' }
  const thL: React.CSSProperties = { ...th, textAlign: 'left', minWidth: 140 }
  const td: React.CSSProperties = { fontSize: 11, padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', minWidth: 60 }

  // GAP 색상
  const gapColor = (v: number, rowColor: string) => (v >= 0 ? rowColor : NEG)

  const badge = isOtb
    ? <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 6, fontWeight: 600, background: 'rgba(100,160,255,0.15)', color: '#7EA8FF', marginLeft: 5 }}>OTB</span>
    : <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 6, fontWeight: 600, background: 'rgba(0,229,160,0.12)', color: '#00E5A0', marginLeft: 5 }}>Actual</span>

  // ── 데이터 행 렌더 ───────────────────────────────────────────────────────────
  const renderRow = (s: MarketSchemaRow) => {
    const codes    = rowCodes(s)
    const a        = agg(actualSeg, codes)
    const c        = agg(compareSeg, codes)
    const rowBg    = (isDark ? s.bg_dark_color  : s.bg_light_color)  ?? '#111111'
    const rowColor = (isDark ? s.font_dark_color : s.font_light_color) ?? '#e8e8e8'
    const indent   = s.level === 'sub' ? 1 : 0
    const nameColor = indent ? 'rgba(255,255,255,0.5)' : rowColor

    const aAdr = adr(a), cAdr = adr(c)
    const dash = (cond: boolean, node: React.ReactNode) => (cond ? node : <span style={{ opacity: 0.35 }}>—</span>)

    const lyClickable = compareMode === 'ly'
    const isSel  = selectedSeg?.id === s.id
    const baseBg = isSel ? `linear-gradient(rgba(255,200,80,0.06), rgba(255,200,80,0.06)), ${rowBg}` : rowBg

    return (
      <tr
        key={s.id}
        onClick={lyClickable ? () => setSelectedSeg({ id: s.id, label: s.name, codes }) : undefined}
        style={{ background: baseBg, cursor: lyClickable ? 'pointer' : 'default' }}
        onMouseEnter={e => { e.currentTarget.style.background = `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${rowBg}` }}
        onMouseLeave={e => { e.currentTarget.style.background = baseBg }}
      >
        <td style={{ ...td, textAlign: 'left', minWidth: 140, color: nameColor, fontWeight: s.is_bold ? 700 : 500, paddingLeft: 10 + indent * 14 }}>{s.name}</td>

        {/* Actual / OTB — schema fontColor */}
        <td style={{ ...td, color: rowColor }}>{dash(a.n > 0, fmtInt(a.n))}</td>
        <td style={{ ...td, color: rowColor }}>{dash(a.n > 0, fmtAdrK(aAdr))}</td>
        <td style={{ ...td, color: rowColor }}>{dash(a.n > 0, fmtRevM(a.r))}</td>

        {/* Budget / LY — 0.5 흐림 */}
        <td style={{ ...td, color: 'rgba(255,255,255,0.5)', boxShadow: cmpSep }}>{dash(c.n > 0, fmtInt(c.n))}</td>
        <td style={{ ...td, color: 'rgba(255,255,255,0.5)' }}>{dash(c.n > 0, fmtAdrK(cAdr))}</td>
        <td style={{ ...td, color: 'rgba(255,255,255,0.5)' }}>{dash(c.n > 0, fmtRevM(c.r))}</td>

        {/* GAP — 양수 schema, 음수 red */}
        <td style={{ ...td, color: gapColor(a.n - c.n, rowColor), boxShadow: gapSep }}>{dash(a.n > 0 || c.n > 0, fmtSignInt(a.n - c.n))}</td>
        <td style={{ ...td, color: gapColor(aAdr - cAdr, rowColor) }}>{dash(a.n > 0 && c.n > 0, fmtSignAdrK(aAdr - cAdr))}</td>
        <td style={{ ...td, color: gapColor(a.r - c.r, rowColor) }}>{dash(a.n > 0 || c.n > 0, fmtSignRevM(a.r - c.r))}</td>
      </tr>
    )
  }

  // 합계/지표 값
  const tA = totals.actual, tC = totals.compare
  const tAAdr = adr(tA), tCAdr = adr(tC)
  const occA = denom > 0 ? (tA.n / denom) * 100 : 0
  const occC = denom > 0 ? (tC.n / denom) * 100 : 0
  const rpA  = denom > 0 ? tA.r / denom : 0
  const rpC  = denom > 0 ? tC.r / denom : 0

  const metricRow = (label: string, av: string, cv: string, gv: string, gpos: boolean) => (
    <tr
      style={{ background: '#0d0d0d' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(var(--overlay-hover), var(--overlay-hover)), #0d0d0d' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#0d0d0d' }}
    >
      <td style={{ ...td, textAlign: 'left', color: '#888', fontWeight: 600 }}>{label}</td>
      <td style={{ ...td, textAlign: 'center', color: '#cfcfcf' }} colSpan={3}>{av}</td>
      <td style={{ ...td, textAlign: 'center', color: 'rgba(255,255,255,0.5)', boxShadow: cmpSep }} colSpan={3}>{cv}</td>
      <td style={{ ...td, textAlign: 'center', color: gpos ? '#00E5A0' : NEG, boxShadow: gapSep }} colSpan={3}>{gv}</td>
    </tr>
  )

  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0a0a0a', border: '1px solid #1f1f1f', borderRadius: 14, width: compareMode === 'ly' ? '1380px' : '1080px', maxWidth: '98vw', height: 'auto', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.3s cubic-bezier(0.22,1,0.36,1)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #1a1a1a', flexShrink: 0, gap: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'baseline', gap: 6 }}>
            {isYtd ? (
              <>YTD {year}<span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>Jan ~ {MONTH_NAMES[ytdMonth - 1]}</span></>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center' }}>{monthLabel}{badge}</span>
            )}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.12)', background: '#161616' }}>
              <button
                onClick={() => setCompareMode('budget')}
                style={{ fontSize: 10, padding: '4px 12px', border: 'none', cursor: 'pointer', background: compareMode === 'budget' ? 'rgba(0,229,160,0.15)' : 'transparent', color: compareMode === 'budget' ? '#00E5A0' : 'rgba(255,255,255,0.4)' }}>
                vs Budget
              </button>
              <button
                onClick={() => setCompareMode('ly')}
                style={{ fontSize: 10, padding: '4px 12px', border: 'none', cursor: 'pointer', background: compareMode === 'ly' ? 'rgba(255,200,80,0.15)' : 'transparent', color: compareMode === 'ly' ? '#FFC850' : 'rgba(255,255,255,0.4)' }}>
                vs Last Year
              </button>
            </div>
            <button onClick={onClose} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* 본문: 메인 테이블 + (vs LY) 어카운트 패널 */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 메인 테이블 (콘텐츠 높이 기반, 내부 스크롤 없음) */}
          <div style={{ flex: 1, padding: 16 }}>
          {loading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 13 }}>불러오는 중…</div>
          ) : (
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#0a0a0a' }}>
                <tr>
                  <th rowSpan={2} style={{ ...thL, verticalAlign: 'bottom' }}>SEGMENT</th>
                  <th colSpan={3} style={{ ...th, textAlign: 'center', color: '#9fb8ff', borderBottom: '0.5px solid rgba(255,255,255,0.1)' }}>{actualLabel}</th>
                  <th colSpan={3} style={{ ...th, textAlign: 'center', color: compareMode === 'budget' ? '#00E5A0' : '#FFC850', borderBottom: '0.5px solid rgba(255,255,255,0.1)', boxShadow: cmpSep }}>{compareLabel}</th>
                  <th colSpan={3} style={{ ...th, textAlign: 'center', color: 'rgba(255,255,255,0.55)', borderBottom: '0.5px solid rgba(255,255,255,0.1)', boxShadow: gapSep }}>GAP vs {compareMode === 'budget' ? 'Budget' : 'LY'}</th>
                </tr>
                <tr>
                  <th style={th}>R/N</th><th style={th}>ADR</th><th style={th}>REV</th>
                  <th style={{ ...th, boxShadow: cmpSep }}>R/N</th><th style={th}>ADR</th><th style={th}>REV</th>
                  <th style={{ ...th, boxShadow: gapSep }}>ΔR/N</th><th style={th}>ΔADR</th><th style={th}>ΔREV</th>
                </tr>
              </thead>
              <tbody>
                {orderedSchema.filter(s => !s.segmentation.includes('HOU')).map(renderRow)}

                {/* 합계 (HOU 제외) */}
                <tr
                  style={{ background: '#111111', borderTop: '1px solid rgba(0,229,160,0.4)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(var(--overlay-hover), var(--overlay-hover)), #111111' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#111111' }}
                >
                  <td style={{ ...td, textAlign: 'left', color: '#fff', fontWeight: 700, borderTop: '1px solid rgba(0,229,160,0.4)' }}>TOTAL</td>
                  <td style={{ ...td, color: '#fff', fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtInt(tA.n)}</td>
                  <td style={{ ...td, color: '#fff', fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtAdrK(tAAdr)}</td>
                  <td style={{ ...td, color: '#fff', fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtRevM(tA.r)}</td>
                  <td style={{ ...td, color: 'rgba(255,255,255,0.6)', fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)', boxShadow: cmpSep }}>{fmtInt(tC.n)}</td>
                  <td style={{ ...td, color: 'rgba(255,255,255,0.6)', fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtAdrK(tCAdr)}</td>
                  <td style={{ ...td, color: 'rgba(255,255,255,0.6)', fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtRevM(tC.r)}</td>
                  <td style={{ ...td, color: tA.n - tC.n >= 0 ? '#00E5A0' : NEG, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)', boxShadow: gapSep }}>{fmtSignInt(tA.n - tC.n)}</td>
                  <td style={{ ...td, color: tAAdr - tCAdr >= 0 ? '#00E5A0' : NEG, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtSignAdrK(tAAdr - tCAdr)}</td>
                  <td style={{ ...td, color: tA.r - tC.r >= 0 ? '#00E5A0' : NEG, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtSignRevM(tA.r - tC.r)}</td>
                </tr>

                {/* OCC / REVPAR */}
                {metricRow('OCC', `${occA.toFixed(1)}%`, `${occC.toFixed(1)}%`, `${occA - occC >= 0 ? '+' : ''}${(occA - occC).toFixed(1)}%p`, occA - occC >= 0)}
                {metricRow('RevPAR', fmtInt(rpA), fmtInt(rpC), fmtSignInt(rpA - rpC), rpA - rpC >= 0)}
              </tbody>
            </table>
          )}
          </div>

          {/* 어카운트 패널 — vs Last Year 일때만 */}
          {compareMode === 'ly' && (
            <div style={{ width: 280, flexShrink: 0, minHeight: 0, borderLeft: '1px solid rgba(0,229,160,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#FFC850' }}>
                  {selectedSeg ? `${selectedSeg.label} — Account 증감` : 'Account 증감'}
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                  vs Last Year · {monthLabel}
                </div>
              </div>

              {!selectedSeg ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
                  <span style={{ fontSize: 20 }}>👆</span>
                  <span>세그먼트 행을 클릭하세요</span>
                </div>
              ) : accountList.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>데이터 없음</div>
              ) : (
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                  {accountList.map(acc => (
                    <div key={acc.name} style={{ padding: '8px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                        <span style={{ fontSize: 9, color: acc.diffRn >= 0 ? '#00E5A0' : '#FF6B6B' }}>
                          {acc.diffRn >= 0 ? '+' : ''}{acc.diffRn} R/N
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: acc.diffRev >= 0 ? '#00E5A0' : '#FF6B6B' }}>
                          {acc.diffRev >= 0 ? '+' : ''}{(acc.diffRev / 1_000_000).toFixed(1)}M
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
