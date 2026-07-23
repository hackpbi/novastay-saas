'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useFcstDateContext } from '@/contexts/FcstDateContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'
import StartEndSegModal from '@/components/StartEndSegModal'

// ─── 타입 ────────────────────────────────────────────────────────────────────────
type Unit = '원' | '천원' | '백만원'
type Kpi = 'OCC' | 'ADR' | 'REV' | 'RevPAR'
type Cell = { n: number; rev: number }
type SegMap = Record<string, Cell>            // segmentation code → 합산치
type StepKind = 'monthStart' | 'current' | 'forecast' | 'closing'
type Step = {
  kind:     StepKind
  label:    string
  labelColor: string
  thisDate: string | null
  lastDate: string | null
  thisSeg:  SegMap | null
  lastSeg:  SegMap | null
}
type PageData = {
  monthState: 'past' | 'current' | 'future'
  steps:      Step[]
  budget:     Cell | null
}

// ─── 유틸 (KST — getUTC 금지) ──────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m1: number) => new Date(y, m1, 0).getDate()
const monthStartStr = (y: number, m1: number) => `${y}-${pad(m1)}-01`
const monthEndStr   = (y: number, m1: number) => `${y}-${pad(m1)}-${pad(lastDay(y, m1))}`

// 단위 스케일 (항상 반올림 → 소수점 없음)
function scaleUnit(won: number, unit: Unit): number {
  return unit === '원' ? Math.round(won)
       : unit === '천원' ? Math.round(won / 1000)
       : Math.round(won / 1_000_000)
}
const unitLabel = (unit: Unit) => unit

// ─── 세그먼트 대분류(main) 목록 ────────────────────────────────────────────────────
type MainSeg = { id: string; name: string; codes: string[] }
function buildMains(schema: MarketSchemaRow[]): MainSeg[] {
  const tops = schema.filter(s => s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
  const mains: MainSeg[] = []
  for (const top of tops) {
    if (top.level === 'main') {
      const children = schema.filter(c => c.parent_id === top.id)
      const codes = children.length ? children.flatMap(c => c.segmentation) : top.segmentation
      mains.push({ id: top.id, name: top.name, codes })
    }
  }
  return mains
}
function houCodesOf(schema: MarketSchemaRow[]): Set<string> {
  const set = new Set<string>()
  for (const s of schema) if (s.segmentation.includes('HOU')) for (const c of s.segmentation) set.add(c)
  return set
}

// ─── 팝오버용 계층 트리 (대분류→중분류→소분류, 깊이는 스키마가 지원하는 만큼) ────────────
type PopLevel = 'main' | 'mid' | 'sub'
type PopRow = { id: string; name: string; level: PopLevel; codes: string[]; parentId: string | null }
function collectPopCodes(schema: MarketSchemaRow[], node: MarketSchemaRow): string[] {
  const kids = schema.filter(c => c.parent_id === node.id)
  return kids.length ? kids.flatMap(k => collectPopCodes(schema, k)) : node.segmentation
}
function buildPopTree(schema: MarketSchemaRow[], hou: Set<string>): PopRow[] {
  const tops = schema.filter(s => s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
  const out: PopRow[] = []
  const walk = (node: MarketSchemaRow, level: PopLevel) => {
    const codes = collectPopCodes(schema, node)
    if (codes.some(c => hou.has(c))) return
    out.push({ id: node.id, name: node.name, level, codes, parentId: node.parent_id })
    const kids = schema.filter(c => c.parent_id === node.id).sort((a, b) => a.order_index - b.order_index)
    for (const k of kids) walk(k, level === 'main' ? 'mid' : 'sub')
  }
  for (const t of tops) if (t.level === 'main') walk(t, 'main')
  return out
}

// SegMap → HOU 제외 전체 합산
function totalOf(seg: SegMap | null, hou: Set<string>): Cell {
  const acc: Cell = { n: 0, rev: 0 }
  if (!seg) return acc
  for (const [code, v] of Object.entries(seg)) {
    if (hou.has(code)) continue
    acc.n += v.n; acc.rev += v.rev
  }
  return acc
}
// SegMap → 특정 코드 집합 합산
function sumCodes(seg: SegMap | null, codes: string[]): Cell {
  const acc: Cell = { n: 0, rev: 0 }
  if (!seg) return acc
  for (const c of codes) { const v = seg[c]; if (v) { acc.n += v.n; acc.rev += v.rev } }
  return acc
}

// KPI 값 (원 단위 raw)
function kpiRaw(kpi: Kpi, c: Cell, cap: number): number {
  if (kpi === 'OCC')    return cap > 0 ? (c.n / cap) * 100 : 0
  if (kpi === 'ADR')    return c.n > 0 ? c.rev / c.n : 0
  if (kpi === 'REV')    return c.rev
  return cap > 0 ? c.rev / cap : 0   // RevPAR
}

// ─── 페이지 ─────────────────────────────────────────────────────────────────────
export default function StartEndPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate, otbDates } = useDateContext()
  const { fcstDate } = useFcstDateContext()
  const { data: schema } = useMarketSchema()

  // 월 네비게이션 (CountryPickupPage 패턴 이식 — 타이틀 밀림 방지)
  const now = new Date()
  const otbBase = otbDate ? new Date(otbDate + 'T00:00:00') : now
  const [selectedYear, setSelectedYear]   = useState(otbBase.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(otbBase.getMonth())   // 0-based
  useEffect(() => {
    const b = otbDate ? new Date(otbDate + 'T00:00:00') : new Date()
    setSelectedYear(b.getFullYear()); setSelectedMonth(b.getMonth())
  }, [otbDate])
  const [titleShifting, setTitleShifting] = useState(false)
  const [isAnimating,   setIsAnimating]   = useState(false)
  useEffect(() => {
    setTitleShifting(true)
    const t = setTimeout(() => setTitleShifting(false), 350)
    return () => clearTimeout(t)
  }, [selectedMonth, selectedYear])
  const handlePrevMonth = () => {
    if (isAnimating) return
    setIsAnimating(true)
    setTimeout(() => {
      if (selectedMonth === 0) { setSelectedYear(y => y - 1); setSelectedMonth(11) }
      else setSelectedMonth(m => m - 1)
      setIsAnimating(false)
    }, 300)
  }
  const handleNextMonth = () => {
    if (isAnimating) return
    setIsAnimating(true)
    setTimeout(() => {
      if (selectedMonth === 11) { setSelectedYear(y => y + 1); setSelectedMonth(0) }
      else setSelectedMonth(m => m + 1)
      setIsAnimating(false)
    }, 300)
  }

  // 단위 설정 (DashboardPage 패턴)
  const [showUnitSetting, setShowUnitSetting] = useState(false)
  const [adrUnit, setAdrUnit] = useState<Unit>('천원')
  const [revUnit, setRevUnit] = useState<Unit>('백만원')
  useEffect(() => {
    if (!showUnitSetting) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.unit-setting-wrap')) setShowUnitSetting(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showUnitSetting])

  const [showModal, setShowModal] = useState(false)

  // 세그먼트 기여 팝오버 (한 번에 하나만) — 배지 위치에 포털로 띄움
  const [openPop, setOpenPop]     = useState<string | null>(null)
  const [popAnchor, setPopAnchor] = useState<{ left: number; top: number; maxHeight: number; dir: 'up' | 'down' } | null>(null)
  const [popSearch, setPopSearch] = useState('')
  const [popFocus, setPopFocus]   = useState(false)
  useEffect(() => {
    if (!openPop) return
    const md = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.se-pop-panel') && !t.closest('.se-pop-badge')) setOpenPop(null)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenPop(null) }
    const onScroll = (e: Event) => {
      if ((e.target as HTMLElement)?.closest?.('.se-pop-panel')) return
      setOpenPop(null)
    }
    const close = () => setOpenPop(null)
    document.addEventListener('mousedown', md)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', md)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [openPop])

  const m1 = selectedMonth + 1
  const otbY  = otbBase.getFullYear()
  const otbM  = otbBase.getMonth() + 1
  const monthState: 'past' | 'current' | 'future' =
    selectedYear < otbY || (selectedYear === otbY && m1 < otbM) ? 'past'
    : selectedYear === otbY && m1 === otbM ? 'current'
    : 'future'

  // ─── 객실 수 ────────────────────────────────────────────────────────────────────
  const { data: hotelDetail } = useQuery({
    queryKey: ['m03_hotel_details', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('m03_hotel_details').select('room_count').eq('hotel_id', hotelId).single()
      if (error) throw error
      return data
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
  })
  const roomCount = hotelDetail?.room_count ?? 0
  const cap = roomCount * lastDay(selectedYear, m1)

  // ─── 데이터 조회 ─────────────────────────────────────────────────────────────────
  const { data: pageData, isLoading } = useQuery<PageData>({
    queryKey: ['start-end', hotelId, selectedYear, m1, otbDate, fcstDate, monthState],
    enabled: !!hotelId && !!otbDate && otbDates.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const fetchForecast = async (): Promise<SegMap> => {
        if (!fcstDate) return {}
        const { data, error } = await (supabase as any).rpc('get_forecast_monthly', {
          p_hotel_id: hotelId, p_year: selectedYear, p_update_date: fcstDate,
        })
        if (error) throw error
        const rows = ((data ?? []) as any[]).filter(r => Number(r.month_num) === m1)
        const m: SegMap = {}
        for (const r of rows) {
          const code = r.segmentation; if (!code) continue
          if (!m[code]) m[code] = { n: 0, rev: 0 }
          m[code].n   += Number(r.forecast_nights ?? 0)
          m[code].rev += Number(r.forecast_revenue ?? 0)
        }
        return m
      }
      const fetchBudget = async (): Promise<Cell | null> => {
        const { data: d1 } = await (supabase as any)
          .from('a04_budget_mtd').select('update_date')
          .eq('hotel_id', hotelId).eq('confirmed', true)
          .order('update_date', { ascending: false }).limit(1)
        const bDate = d1?.[0]?.update_date ?? null
        if (!bDate) return null
        const { data: d2, error } = await (supabase as any)
          .from('a04_budget_mtd')
          .select('budget_nights, budget_revenue')
          .eq('hotel_id', hotelId).eq('update_date', bDate).eq('confirmed', true)
          .eq('year', selectedYear).eq('month', m1)
        if (error) throw error
        const acc: Cell = { n: 0, rev: 0 }
        for (const r of (d2 ?? []) as any[]) { acc.n += Number(r.budget_nights ?? 0); acc.rev += Number(r.budget_revenue ?? 0) }
        return acc
      }

      // OTB/마감 세그먼트 데이터 — 전용 RPC (권한체크·별칭·1일 fallback 내장, 1000행 제한 없음)
      const { data: seData, error: seErr } = await (supabase as any).rpc('get_start_end_data', {
        p_hotel_id: hotelId, p_year: selectedYear, p_month: m1, p_otb_date: otbDate,
      })
      if (seErr) throw seErr

      // (year_type × point_type) 인덱싱 — RPC 가 준 point_type / snap_date 그대로 사용
      const segMaps: Record<string, Record<string, SegMap>> = { cy: {}, ly: {} }
      const snapDates: Record<string, Record<string, string | null>> = { cy: {}, ly: {} }
      const present: Record<string, Record<string, boolean>> = { cy: {}, ly: {} }
      for (const r of (seData ?? []) as any[]) {
        const yt = r.year_type as string, pt = r.point_type as string
        if (yt !== 'cy' && yt !== 'ly') continue
        present[yt][pt] = true
        if (!(pt in snapDates[yt])) snapDates[yt][pt] = r.snap_date ?? null
        const code = r.segmentation
        if (!code) continue
        const mm = (segMaps[yt][pt] ??= {})
        if (!mm[code]) mm[code] = { n: 0, rev: 0 }
        mm[code].n   += Number(r.nights ?? 0)
        mm[code].rev += Number(r.room_revenue ?? 0)
      }
      const pickSeg  = (yt: 'cy' | 'ly', pt: string): SegMap | null => present[yt][pt] ? (segMaps[yt][pt] ?? {}) : null
      const pickSnap = (yt: 'cy' | 'ly', pt: string): string | null => snapDates[yt][pt] ?? null

      const [budget] = await Promise.all([fetchBudget()])
      const forecastThis = await fetchForecast()

      const mkMonthStart = (): Step => ({
        kind: 'monthStart', label: '당월초', labelColor: '#7ea3e8',
        thisDate: pickSnap('cy', 'month_start'), lastDate: pickSnap('ly', 'month_start'),
        thisSeg: pickSeg('cy', 'month_start'), lastSeg: pickSeg('ly', 'month_start'),
      })
      const mkCurrent = (): Step => ({
        kind: 'current', label: '현재 OTB', labelColor: '#e8e8e8',
        thisDate: pickSnap('cy', 'current_otb'), lastDate: pickSnap('ly', 'current_otb'),
        thisSeg: pickSeg('cy', 'current_otb'), lastSeg: pickSeg('ly', 'current_otb'),
      })
      const mkForecast = (): Step => ({
        kind: 'forecast', label: '전망', labelColor: '#00E5A0',
        thisDate: fcstDate || otbDate, lastDate: pickSnap('ly', 'closing'),
        thisSeg: forecastThis, lastSeg: pickSeg('ly', 'closing'),
      })
      const mkClosing = (): Step => ({
        kind: 'closing', label: '마감', labelColor: '#00E5A0',
        thisDate: pickSnap('cy', 'closing') ?? monthEndStr(selectedYear, m1), lastDate: pickSnap('ly', 'closing') ?? monthEndStr(selectedYear - 1, m1),
        thisSeg: pickSeg('cy', 'closing'), lastSeg: pickSeg('ly', 'closing'),
      })

      let steps: Step[]
      if (monthState === 'past')      steps = [mkMonthStart(), mkClosing()]
      else if (monthState === 'current') steps = [mkMonthStart(), mkCurrent(), mkForecast()]
      else                            steps = [mkCurrent(), mkMonthStart(), mkForecast()]

      return { monthState, steps, budget }
    },
  })

  const mains = useMemo(() => buildMains(schema), [schema])
  const hou   = useMemo(() => houCodesOf(schema), [schema])
  const popTree = useMemo(() => buildPopTree(schema, hou), [schema, hou])

  const steps  = pageData?.steps ?? []
  const budget = pageData?.budget ?? null

  // ─── 렌더 헬퍼 ───────────────────────────────────────────────────────────────────
  const dash = <span style={{ color: '#3a3a3a' }}>—</span>

  // KPI 표시 문자열
  function fmtKpi(kpi: Kpi, c: Cell | null): React.ReactNode {
    if (!c || (c.n === 0 && c.rev === 0)) return dash
    const raw = kpiRaw(kpi, c, cap)
    if (kpi === 'OCC') return `${raw.toFixed(1)}%`
    const unit = kpi === 'ADR' ? adrUnit : revUnit
    return scaleUnit(raw, unit).toLocaleString()
  }
  // 세그먼트 기여값 (칩·팝오버 공용 — from→to 차분)
  function segVal(kpi: Kpi, ma: Cell, mb: Cell): number {
    if (kpi === 'OCC') return mb.n - ma.n
    if (kpi === 'ADR') return scaleUnit((mb.n > 0 ? mb.rev / mb.n : 0) - (ma.n > 0 ? ma.rev / ma.n : 0), adrUnit)
    if (kpi === 'REV') return scaleUnit(mb.rev - ma.rev, revUnit)
    return scaleUnit(cap > 0 ? (mb.rev - ma.rev) / cap : 0, revUnit)
  }
  // 시점별 숫자 크기·색상 위계
  function valStyleThis(kind: StepKind): { size: number; color: string } {
    if (kind === 'monthStart') return { size: 26, color: '#7ea3e8' }
    if (kind === 'current')    return { size: 30, color: '#f0f0f0' }
    return { size: 26, color: '#00E5A0' }              // forecast | closing
  }
  function valStyleLast(kind: StepKind): { size: number; color: string } {
    if (kind === 'monthStart') return { size: 20, color: '#7a7a7a' }
    if (kind === 'current')    return { size: 24, color: '#a8a8a8' }
    return { size: 22, color: '#F59E0B' }             // forecast(=전년 마감) | closing
  }
  // 구간 델타 표시 (숫자 + 단위 접미사 분리)
  function deltaNode(kpi: Kpi, a: Cell | null, b: Cell | null, muted: boolean): React.ReactNode {
    if (!a || !b) return null
    let d: number, num: string, suf: string
    if (kpi === 'OCC') { d = kpiRaw('OCC', b, cap) - kpiRaw('OCC', a, cap); num = `${d > 0 ? '+' : ''}${d.toFixed(1)}`; suf = '%p' }
    else if (kpi === 'ADR') { d = scaleUnit(kpiRaw('ADR', b, cap) - kpiRaw('ADR', a, cap), adrUnit); num = `${d > 0 ? '+' : ''}${d.toLocaleString()}`; suf = '' }
    else if (kpi === 'REV') { d = scaleUnit(b.rev - a.rev, revUnit); num = `${d > 0 ? '+' : ''}${d.toLocaleString()}`; suf = '' }
    else { d = scaleUnit(kpiRaw('RevPAR', b, cap) - kpiRaw('RevPAR', a, cap), revUnit); num = `${d > 0 ? '+' : ''}${d.toLocaleString()}`; suf = '' }
    const color = muted ? '#8a8a8a' : d > 0 ? '#00E5A0' : d < 0 ? '#E24B4A' : '#8a8a8a'
    const numSize = muted ? 13 : 15
    const sufSize = muted ? 10 : 11
    return (
      <span style={{ color }}>
        <span style={{ fontSize: numSize }}>{num}</span>
        {suf && <span style={{ fontSize: sufSize }}>{suf}</span>}
      </span>
    )
  }
  // 세그먼트 기여 칩 (플러스만, 상위 2개 + 외 N 배지) — 한 줄 고정
  function chips(kpi: Kpi, aSeg: SegMap | null, bSeg: SegMap | null, isThis: boolean, popKey: string): React.ReactNode {
    if (kpi === 'ADR') return null
    if (!aSeg || !bSeg) return null
    const plus: { name: string; val: number }[] = []
    const minus: { name: string; val: number }[] = []
    for (const main of mains) {
      if (main.codes.some(c => hou.has(c))) continue
      const val = segVal(kpi, sumCodes(aSeg, main.codes), sumCodes(bSeg, main.codes))
      if (val > 0) plus.push({ name: main.name, val })
      else if (val < 0) minus.push({ name: main.name, val })
    }
    plus.sort((a, b) => b.val - a.val)
    minus.sort((a, b) => Math.abs(b.val) - Math.abs(a.val))
    const total = plus.length + minus.length
    if (total === 0) return null
    const shown = plus.length > 0 && minus.length > 0 ? [plus[0], minus[0]]
      : plus.length === 0 ? minus.slice(0, 2)
      : plus.slice(0, 2)
    const extra = total - shown.length
    const plusStyle: React.CSSProperties = isThis
      ? { background: 'rgba(0,229,160,0.10)', border: '0.5px solid rgba(0,229,160,0.25)', color: '#59d3a8' }
      : { background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.20)', color: '#b8862c' }
    const minusStyle: React.CSSProperties = isThis
      ? { background: 'rgba(226,75,74,0.10)', border: '0.5px solid rgba(226,75,74,0.30)', color: '#e07a79' }
      : { background: 'rgba(226,75,74,0.07)', border: '0.5px solid rgba(226,75,74,0.22)', color: '#b06463' }
    const isOpen = openPop === popKey
    return (
      <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 6, height: 15 }}>
        {shown.map(t => (
          <span key={t.name} style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4, whiteSpace: 'nowrap', ...(t.val > 0 ? plusStyle : minusStyle) }}>
            {t.name} {t.val > 0 ? '+' : '−'}{Math.abs(t.val).toLocaleString()}
          </span>
        ))}
        {extra > 0 && (
          <span
            className="se-pop-badge"
            onClick={(e) => {
              e.stopPropagation()
              const willOpen = openPop !== popKey
              if (willOpen) {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const POP_W = 218, POP_MAX = 220, MARGIN = 12
                const spaceBelow = window.innerHeight - r.bottom - MARGIN
                const spaceAbove = r.top - MARGIN
                const openUp = spaceBelow < POP_MAX && spaceAbove > spaceBelow
                const maxHeight = Math.max(120, Math.min(POP_MAX, openUp ? spaceAbove : spaceBelow))
                const top = openUp ? r.top - maxHeight - 6 : r.bottom + 6
                const half = POP_W / 2
                const left = Math.max(8 + half, Math.min(r.left + r.width / 2, window.innerWidth - 8 - half))
                setPopAnchor({ left, top, maxHeight, dir: openUp ? 'up' : 'down' })
                setOpenPop(popKey); setPopSearch(''); setPopFocus(false)
              } else setOpenPop(null)
            }}
            style={{
              fontSize: 9, padding: '2px 5px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
              ...(isOpen
                ? { border: '0.5px solid rgba(0,229,160,0.45)', background: 'rgba(0,229,160,0.08)', color: '#00E5A0' }
                : { border: '0.5px solid #2e2e2e', background: 'transparent', color: '#777' }),
            }}
          >
            외 {extra} {isOpen ? (popAnchor?.dir === 'up' ? '▾' : '▴') : '▾'}
          </span>
        )}
        {isOpen && renderPopover(kpi, aSeg, bSeg)}
      </div>
    )
  }
  // 검색어 하이라이트
  function highlightSeg(name: string, q: string): React.ReactNode {
    if (!q) return name
    const lower = name.toLowerCase()
    if (!lower.includes(q)) return name
    const parts: React.ReactNode[] = []
    let i = 0
    while (i < name.length) {
      const j = lower.indexOf(q, i)
      if (j < 0) { parts.push(<Fragment key={i}>{name.slice(i)}</Fragment>); break }
      if (j > i) parts.push(<Fragment key={i}>{name.slice(i, j)}</Fragment>)
      parts.push(<span key={`h${j}`} style={{ background: 'rgba(0,229,160,0.25)', color: '#00E5A0' }}>{name.slice(j, j + q.length)}</span>)
      i = j + q.length
    }
    return parts
  }
  // 세그먼트 트리 팝오버 (포털 — 카드 바깥에서 배지 위치에 고정)
  function renderPopover(kpi: Kpi, aSeg: SegMap | null, bSeg: SegMap | null): React.ReactNode {
    if (!popAnchor) return null
    const rows = popTree
      .map(r => ({ ...r, val: segVal(kpi, sumCodes(aSeg, r.codes), sumCodes(bSeg, r.codes)) }))
      .filter(r => r.val !== 0)
    const showSearch = rows.length >= 8
    const q = popSearch.trim().toLowerCase()
    let displayRows = rows
    let matchedCount = 0
    if (q) {
      const parentOf = new Map(popTree.map(r => [r.id, r.parentId]))
      const childrenMap = new Map<string, string[]>()
      for (const r of popTree) if (r.parentId) {
        const arr = childrenMap.get(r.parentId) ?? []
        arr.push(r.id); childrenMap.set(r.parentId, arr)
      }
      const matchedRows = rows.filter(r => r.name.toLowerCase().includes(q))
      matchedCount = matchedRows.length
      const vis = new Set<string>()
      for (const mr of matchedRows) {
        vis.add(mr.id)
        let p = parentOf.get(mr.id) ?? null
        while (p) { vis.add(p); p = parentOf.get(p) ?? null }
        const stack = [...(childrenMap.get(mr.id) ?? [])]
        while (stack.length) { const c = stack.pop()!; vis.add(c); for (const cc of (childrenMap.get(c) ?? [])) stack.push(cc) }
      }
      displayRows = rows.filter(r => vis.has(r.id))
    }
    const hiddenCount = rows.length - displayRows.length
    const renderRow = (r: (typeof displayRows)[number]) => {
      const indent = r.level === 'main' ? 11 : r.level === 'mid' ? 19 : 27
      const nameColor = r.level === 'main' ? '#fff' : r.level === 'mid' ? '#999' : '#777'
      const isNeg = r.val < 0
      const valColor = isNeg
        ? (r.level === 'main' ? '#E24B4A' : r.level === 'mid' ? '#b04745' : '#8a3a39')
        : (r.level === 'main' ? '#00E5A0' : r.level === 'mid' ? '#3d9d7c' : '#357f66')
      const mainBg = isNeg ? '#1d0f0f' : '#0f1d18'
      return (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '3px 11px', paddingLeft: indent, background: r.level === 'main' ? mainBg : 'transparent', marginTop: r.level === 'main' ? 2 : 0, fontWeight: r.level === 'main' ? 500 : 400, color: nameColor }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 6 }}>
            {r.level !== 'main' && <span style={{ color: '#555' }}>└ </span>}{highlightSeg(r.name, q)}
          </span>
          <span style={{ color: valColor, whiteSpace: 'nowrap' }}>{r.val > 0 ? '+' : '−'}{Math.abs(r.val).toLocaleString()}</span>
        </div>
      )
    }
    const plusRows = displayRows.filter(r => r.val > 0)
    const minusRows = displayRows.filter(r => r.val < 0)
    return createPortal(
      <div
        className="se-pop-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left: popAnchor.left, top: popAnchor.top, transform: 'translateX(-50%)',
          background: '#0d0d0d', border: '0.5px solid rgba(0,229,160,0.30)', borderRadius: 8,
          width: 218, padding: '9px 0 7px', boxShadow: '0 8px 24px rgba(0,0,0,0.75)',
          zIndex: 10000, maxHeight: popAnchor.maxHeight, overflowY: 'auto',
        }}
      >
        {showSearch ? (
          <div style={{ padding: '0 10px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#141414', border: `0.5px solid ${(popSearch || popFocus) ? 'rgba(0,229,160,0.40)' : '#262626'}`, borderRadius: 6, padding: '4px 7px' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={(popSearch || popFocus) ? '#00E5A0' : '#4a4a4a'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={popSearch}
                onChange={(e) => setPopSearch(e.target.value)}
                onFocus={() => setPopFocus(true)}
                onBlur={() => setPopFocus(false)}
                onClick={(e) => e.stopPropagation()}
                placeholder="세그먼트 검색"
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: 10, color: '#e8e8e8' }}
              />
              {popSearch && (
                <span onClick={(e) => { e.stopPropagation(); setPopSearch('') }} style={{ fontSize: 11, color: '#555', cursor: 'pointer' }}>✕</span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 9, color: '#666', padding: '0 11px 7px' }}>전체 기여 세그먼트</div>
        )}
        {plusRows.map(renderRow)}
        {minusRows.length > 0 && <div style={{ height: 1, background: '#1c1c1c', margin: '6px 0' }} />}
        {minusRows.map(renderRow)}
        {q && (
          <div style={{ fontSize: 9, color: '#555', padding: '7px 11px 2px', borderTop: '0.5px solid #1a1a1a', marginTop: 5 }}>
            {matchedCount}건 일치 · 나머지 {hiddenCount}건 숨김
          </div>
        )}
      </div>,
      document.body,
    )
  }

  // ─── 카드 ───────────────────────────────────────────────────────────────────────
  const kpiUnit = (kpi: Kpi) => kpi === 'OCC' ? '%' : kpi === 'ADR' ? unitLabel(adrUnit) : unitLabel(revUnit)
  const kpiTitle = (kpi: Kpi) => kpi === 'OCC' ? '점유율' : kpi === 'ADR' ? '객단가' : kpi === 'REV' ? '매출' : kpi

  function KpiCard({ kpi }: { kpi: Kpi }) {
    const nStep = steps.length
    // 미래월 올해행 병합 여부 (당월초 미도래)
    const futureThisMerge = monthState === 'future'

    return (
      <div
        onClick={() => setShowModal(true)}
        style={{
          position: 'relative', background: '#000', border: '0.5px solid rgba(0,229,160,0.22)',
          borderRadius: 12, padding: '14px 16px 20px 20px', overflow: 'hidden', cursor: 'pointer',
        }}
      >
        {/* 좌측 그라데이션 바 */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'linear-gradient(180deg,#00E5A0 0%,rgba(0,229,160,0.45) 45%,rgba(0,229,160,0) 100%)' }} />
        {/* 좌상단 글로우 */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 220, height: 100, pointerEvents: 'none', background: 'radial-gradient(circle at 0% 0%, rgba(0,229,160,0.10), rgba(0,229,160,0) 70%)' }} />

        {/* 타이틀 */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10, position: 'relative' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#00E5A0' }}>{kpiTitle(kpi)}</span>
          <span style={{ fontSize: 10, color: '#4a4a4a' }}>{kpiUnit(kpi)}</span>
          {kpi === 'OCC' && <span style={{ fontSize: 9, color: '#3a3a3a', marginLeft: 4 }}>칩 단위 : 실</span>}
        </div>

        {/* 테이블 */}
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', position: 'relative' }}>
          <colgroup>
            <col style={{ width: 38 }} />
            {steps.map((_, i) => (
              <Fragment key={i}>
                <col />
                {i < nStep - 1 && <col style={{ width: '13%' }} />}
              </Fragment>
            ))}
            <col style={{ width: '13%' }} />
          </colgroup>
          <thead>
            <tr>
              <th />
              {steps.map((s, i) => (
                <Fragment key={i}>
                  <th style={{ textAlign: 'center', padding: '2px 4px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 11, color: '#8a8a8a' }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: '#4a4a4a', marginTop: 1 }}>{s.thisDate ? s.thisDate.slice(5).replace('-', '/') : '—'}</div>
                  </th>
                  {i < nStep - 1 && <th />}
                </Fragment>
              ))}
              <th style={{ textAlign: 'center', padding: '2px 4px', verticalAlign: 'top' }}>
                <div style={{ fontSize: 10, color: '#a78bfa' }}>목표</div>
                <div style={{ fontSize: 9, color: '#444' }}>&nbsp;</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* 올해 행 */}
            <tr>
              <td style={{ textAlign: 'center', verticalAlign: 'middle', fontSize: 11, color: '#00E5A0' }}>{selectedYear}</td>
              {futureThisMerge ? (
                <>
                  {/* [0] 현재 OTB 값 */}
                  <td style={{ textAlign: 'center', verticalAlign: 'middle', fontWeight: 400, letterSpacing: '-0.5px', fontSize: valStyleThis(steps[0]?.kind ?? 'current').size, color: valStyleThis(steps[0]?.kind ?? 'current').color }}>{fmtKpi(kpi, totalOf(steps[0]?.thisSeg ?? null, hou))}</td>
                  {/* 병합 화살표 (현재→전망) colspan=3: arrow0 + 당월초 + arrow1 */}
                  <td colSpan={3} style={{ verticalAlign: 'middle', padding: '3px 6px 0' }}>
                    {arrowBlock(deltaNode(kpi, totalOf(steps[0]?.thisSeg ?? null, hou), totalOf(steps[2]?.thisSeg ?? null, hou), false), true, chips(kpi, steps[0]?.thisSeg ?? null, steps[2]?.thisSeg ?? null, true, `${kpi}-cy-merge`), kpi !== 'ADR')}
                    <div style={{ fontSize: 9, color: '#3a3a3a', textAlign: 'center', marginTop: 2 }}>당월초 {monthStartStr(selectedYear, m1).slice(5).replace('-', '/')} 미도래</div>
                  </td>
                  {/* [2] 전망 값 */}
                  <td style={{ textAlign: 'center', verticalAlign: 'middle', fontWeight: 400, letterSpacing: '-0.5px', fontSize: valStyleThis(steps[2]?.kind ?? 'forecast').size, color: valStyleThis(steps[2]?.kind ?? 'forecast').color }}>{fmtKpi(kpi, totalOf(steps[2]?.thisSeg ?? null, hou))}</td>
                </>
              ) : (
                steps.map((s, i) => (
                  <Fragment key={i}>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', fontWeight: 400, letterSpacing: '-0.5px', fontSize: valStyleThis(s.kind).size, color: valStyleThis(s.kind).color }}>
                      {fmtKpi(kpi, totalOf(s.thisSeg, hou))}
                    </td>
                    {i < nStep - 1 && (
                      <td style={{ verticalAlign: 'middle', padding: '3px 6px 0' }}>
                        {arrowBlock(deltaNode(kpi, totalOf(s.thisSeg, hou), totalOf(steps[i + 1].thisSeg, hou), false), true, chips(kpi, s.thisSeg, steps[i + 1].thisSeg, true, `${kpi}-cy-${i}`), kpi !== 'ADR')}
                      </td>
                    )}
                  </Fragment>
                ))
              )}
              {/* 목표 */}
              <td style={{ textAlign: 'center', verticalAlign: 'middle', fontSize: 22, color: '#a78bfa', fontWeight: 400, letterSpacing: '-0.5px' }}>{fmtKpi(kpi, budget)}</td>
            </tr>

            {/* 연도 구분선 */}
            <tr>
              <td colSpan={nStep + (nStep - 1) + 2} style={{ padding: '22px 0 5px' }}>
                <div style={{ height: 1, background: 'linear-gradient(90deg,rgba(0,229,160,0.35),rgba(0,229,160,0.10) 55%,rgba(0,229,160,0))' }} />
              </td>
            </tr>

            {/* 전년 행 */}
            <tr>
              <td style={{ textAlign: 'center', verticalAlign: 'middle', paddingTop: 18, fontSize: 11, color: '#F59E0B' }}>{selectedYear - 1}</td>
              {steps.map((s, i) => (
                <Fragment key={i}>
                  <td style={{ textAlign: 'center', verticalAlign: 'middle', paddingTop: 18, fontWeight: 400, letterSpacing: '-0.5px', fontSize: valStyleLast(s.kind).size, color: valStyleLast(s.kind).color }}>
                    {fmtKpi(kpi, totalOf(s.lastSeg, hou))}
                  </td>
                  {i < nStep - 1 && (
                    <td style={{ verticalAlign: 'middle', padding: '21px 6px 0' }}>
                      {arrowBlock(deltaNode(kpi, totalOf(s.lastSeg, hou), totalOf(steps[i + 1].lastSeg, hou), true), false, chips(kpi, s.lastSeg, steps[i + 1].lastSeg, false, `${kpi}-ly-${i}`), kpi !== 'ADR')}
                    </td>
                  )}
                </Fragment>
              ))}
              {/* 목표 (전년 없음) */}
              <td style={{ textAlign: 'center', verticalAlign: 'middle', paddingTop: 18, fontSize: 18, color: '#3f3f3f' }}>—</td>
            </tr>

            {/* 전년 행 라벨용 연도 (좌측 최상단 대체) — 생략: 값 색상으로 구분 */}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        {/* 좌: 월 네비 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={handlePrevMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 29, color: '#00E5A0', lineHeight: 1 }}>‹</span>
            <span style={{ fontSize: 9, color: '#00E5A0', letterSpacing: '0.03em' }}>이전</span>
          </button>
          <span style={{
            fontSize: 20, fontWeight: 500, color: '#fff', letterSpacing: '0.04em',
            transition: 'opacity 0.2s ease, transform 0.35s ease',
            opacity: titleShifting ? 0.5 : 1,
            transform: titleShifting ? 'translateX(4px)' : 'translateX(0)',
          }}>
            Start-End_
            <span style={{ color: '#00E5A0' }}>{pad(m1)}월</span>
            <span style={{ fontSize: 13, color: '#888', marginLeft: 5 }}>{String(selectedYear).slice(-2)}년</span>
          </span>
          <button onClick={handleNextMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 29, color: '#00E5A0', lineHeight: 1 }}>›</span>
            <span style={{ fontSize: 9, color: '#00E5A0', letterSpacing: '0.03em' }}>다음</span>
          </button>
        </div>

        {/* 우: 단위 요약 + 톱니 */}
        <div className="unit-setting-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#00E5A0', whiteSpace: 'nowrap' }}>단위 : 실 · {adrUnit} · {revUnit}</span>
          <button
            onClick={() => setShowUnitSetting(v => !v)}
            style={{
              width: 28, height: 28, borderRadius: 7, border: '0.5px solid rgba(0,229,160,0.45)',
              background: '#0d1512', color: '#00E5A0', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {showUnitSetting && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 190, background: '#0f0f0f', border: '0.5px solid #242424', borderRadius: 10, padding: '12px 14px', zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <UnitRow label="ADR" value={adrUnit} onChange={setAdrUnit} />
              <div style={{ height: 8 }} />
              <UnitRow label="REV" value={revUnit} onChange={setRevUnit} />
            </div>
          )}
        </div>
      </div>

      {/* KPI 카드 */}
      {isLoading ? (
        <div className="animate-pulse" style={{ height: 520, background: 'var(--color-bg-tertiary)', borderRadius: 12 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <KpiCard kpi="OCC" />
          <KpiCard kpi="ADR" />
          <KpiCard kpi="REV" />
        </div>
      )}

      {showModal && (
        <StartEndSegModal
          hotelId={hotelId}
          year={selectedYear}
          month={m1}
          monthState={monthState}
          roomCount={roomCount}
          otbDate={otbDate}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

// ─── 화살표 블록 ───────────────────────────────────────────────────────────────────
function arrowBlock(delta: React.ReactNode, isThis: boolean, chipsNode: React.ReactNode, reserveChip: boolean = true): React.ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ textAlign: 'center', minHeight: 12, marginBottom: 4, lineHeight: 1 }}>{delta}</div>
      <div style={{ position: 'relative', height: 2, borderRadius: 1, margin: '3px 4px', background: isThis ? 'linear-gradient(90deg,rgba(0,229,160,0.10),#00E5A0)' : 'linear-gradient(90deg,rgba(245,158,11,0.10),rgba(245,158,11,0.75))' }}>
        <span style={{ position: 'absolute', right: -2, top: -2, width: 6, height: 6, borderRadius: '50%', background: isThis ? '#00E5A0' : 'rgba(245,158,11,0.75)' }} />
      </div>
      {chipsNode ?? (reserveChip ? <div style={{ marginTop: 6, height: 15 }} /> : null)}
    </div>
  )
}

// ─── 단위 선택 행 ──────────────────────────────────────────────────────────────────
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
