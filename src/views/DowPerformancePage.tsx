'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { LayoutGrid, Store, BarChart3, Percent, Tag, Coins, BedDouble } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'

// ─── 타입 ────────────────────────────────────────────────────────────────────────
type Unit = '원' | '천원' | '백만원'
type YearType = 'cy' | 'ly_otb' | 'ly_close'
type Metric = 'rn' | 'adr' | 'rev'
type YearSel = 'gap' | 'cy' | 'ly'
type Tab = 'dow' | 'seg' | 'acct'
type Cell = { n: number; rev: number }
type DowRow = {
  year_type:    string
  dow:          number
  is_event:     boolean
  event_name:   string | null
  event_start:  string | null
  event_end:    string | null
  event_days:   number | null
  day_count:    number
  segmentation: string | null
  account_name: string | null
  nights:       number
  room_revenue: number
}

// ─── 유틸 (KST — getUTC 금지) ──────────────────────────────────────────────────────
const MINT = '#00E5A0'
const RED  = '#E24B4A'
const AMBER = '#F59E0B'
const MAX_ACCTS = 5   // 어카운트 최대 선택 개수 (탭3)
const pad = (n: number) => String(n).padStart(2, '0')
const DOWS = [1, 2, 3, 4, 5, 6, 7]
const DOW_NAME: Record<number, string> = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' }
const dowColor = (d: number) => d === 6 ? MINT : d === 7 ? RED : '#ccc'

function scaleUnit(won: number, unit: Unit): number {
  return unit === '원' ? Math.round(won)
       : unit === '천원' ? Math.round(won / 1000)
       : Math.round(won / 1_000_000)
}

// 대분류(main + 단독 mid) 트리 — 각 top의 중분류(children)와 코드 집합
type MidUnit = { id: string; name: string; codes: string[]; groupName: string | null }
type TopNode = { id: string; name: string; level: 'main' | 'mid' | 'sub'; codes: string[]; children: { id: string; name: string; codes: string[] }[] }
function buildTops(schema: MarketSchemaRow[]): TopNode[] {
  const tops = schema.filter(s => s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
  return tops.map(top => {
    const kids = schema.filter(c => c.parent_id === top.id).sort((a, b) => a.order_index - b.order_index)
    const children = kids.map(k => ({ id: k.id, name: k.name, codes: k.segmentation }))
    const codes = kids.length ? kids.flatMap(k => k.segmentation) : top.segmentation
    return { id: top.id, name: top.name, level: top.level, codes, children }
  })
}
function houCodesOf(schema: MarketSchemaRow[]): Set<string> {
  const set = new Set<string>()
  for (const s of schema) if (s.segmentation.includes('HOU')) for (const c of s.segmentation) set.add(c)
  return set
}

// ─── 페이지 ─────────────────────────────────────────────────────────────────────
export default function DowPerformancePage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate } = useDateContext()
  const { data: schema } = useMarketSchema()

  // 월 네비게이션 (StartEndPage 패턴)
  const otbBase = otbDate ? new Date(otbDate + 'T00:00:00') : new Date()
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

  // 단위 설정 (StartEndPage 패턴)
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

  // 탭
  const [tab, setTab] = useState<Tab>('dow')
  // 탭1 행 호버
  const [dowHover, setDowHover] = useState<string | null>(null)
  // 탭1 전년비 막대 기준
  const [barBasis, setBarBasis] = useState<'occ' | 'adr' | 'rev'>('occ')
  // 전년 기준 (동기간 온북 / 마감)
  const [lyBasis, setLyBasis] = useState<'ly_otb' | 'ly_close'>('ly_otb')

  // 탭3 컨트롤
  const [selectedSegs, setSelectedSegs] = useState<Set<string>>(new Set())
  const [selectedAccts, setSelectedAccts] = useState<Set<string>>(new Set())
  // 드롭다운 임시값(draft) — '완료' 클릭 시에만 확정값으로 반영
  const [draftSegs, setDraftSegs] = useState<Set<string>>(new Set())
  const [draftAccts, setDraftAccts] = useState<Set<string>>(new Set())
  const [openDrop, setOpenDrop] = useState<'seg' | 'acct' | null>(null)
  const [acctSearch, setAcctSearch] = useState('')
  // 탭3 하단 요일별 구성 카드 대상 (null = 세그 전체)
  const [dowCardAcct, setDowCardAcct] = useState<string | null>(null)

  const m1 = selectedMonth + 1
  const otbY = otbBase.getFullYear()
  const otbM = otbBase.getMonth() + 1
  const monthState: 'past' | 'current' | 'future' =
    selectedYear < otbY || (selectedYear === otbY && m1 < otbM) ? 'past'
    : selectedYear === otbY && m1 === otbM ? 'current'
    : 'future'

  // 객실 수 (StartEndPage 패턴)
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

  // ─── 데이터 조회 (RPC 하나로 3탭 모두) ──────────────────────────────────────────
  const { data: rpcRows = [], isLoading } = useQuery<DowRow[]>({
    queryKey: ['dow_data', hotelId, selectedYear, m1, otbDate],
    enabled: !!hotelId && !!otbDate,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_dow_data', {
        p_hotel_id: hotelId, p_year: selectedYear, p_month: m1, p_otb_date: otbDate,
      })
      if (error) throw error
      return (data ?? []) as DowRow[]
    },
  })

  const tops    = useMemo(() => buildTops(schema), [schema])
  const houCodes = useMemo(() => houCodesOf(schema), [schema])
  // 중분류 단위(체크 대상) — main의 children / 단독 mid
  const midUnits = useMemo<MidUnit[]>(() => {
    const out: MidUnit[] = []
    for (const top of tops) {
      if (top.children.length) for (const c of top.children) out.push({ id: c.id, name: c.name, codes: c.codes, groupName: top.name })
      else out.push({ id: top.id, name: top.name, codes: top.codes, groupName: null })
    }
    return out
  }, [tops])
  const codeToMid = useMemo(() => {
    const m: Record<string, string> = {}
    for (const mu of midUnits) for (const c of mu.codes) m[c] = mu.id
    return m
  }, [midUnits])

  // ─── 집계 ────────────────────────────────────────────────────────────────────────
  const agg = useMemo(() => {
    const dayCount: Record<YearType, Record<number, number>> = { cy: {}, ly_otb: {}, ly_close: {} }
    const seg:      Record<YearType, Record<string, Record<number, Cell>>> = { cy: {}, ly_otb: {}, ly_close: {} }
    const acct:     Record<YearType, Record<string, Record<number, Cell>>> = { cy: {}, ly_otb: {}, ly_close: {} }
    const dowTot:   Record<YearType, Record<number, Cell>> = { cy: {}, ly_otb: {}, ly_close: {} }   // HOU 제외
    const dowTotNoEv:   Record<YearType, Record<number, Cell>> = { cy: {}, ly_otb: {}, ly_close: {} }   // 연휴 제외 (탭1)
    const eventTot:     Record<YearType, Cell> = { cy: { n: 0, rev: 0 }, ly_otb: { n: 0, rev: 0 }, ly_close: { n: 0, rev: 0 } }   // 연휴 전체 (탭1)
    const dayCountNoEv: Record<YearType, Record<number, number>> = { cy: {}, ly_otb: {}, ly_close: {} }   // 연휴 제외 일수 (탭1)
    const eventDays:    Record<YearType, number> = { cy: 0, ly_otb: 0, ly_close: 0 }   // 연휴 일수 (탭1)
    const eventCl:  Record<YearType, Record<string, { n: number; rev: number; days: number; start: string; end: string }>> = { cy: {}, ly_otb: {}, ly_close: {} }   // 연휴 클러스터별 (탭1 참고)
    const acctMid:  Record<string, string> = {}
    const names = new Set<string>()
    const dcSeen = new Set<string>()   // (year_type, dow, is_event, event_name) 조합별 day_count 를 1회만 합산 (행 반복 중복 제거)
    for (const r of rpcRows) {
      const yt = r.year_type as YearType
      if (yt !== 'cy' && yt !== 'ly_otb' && yt !== 'ly_close') continue
      const dow = r.dow
      const evKey = `${yt}|${dow}|${r.is_event}|${r.event_name ?? ''}`
      if (!dcSeen.has(evKey)) {
        dcSeen.add(evKey)
        const dc = Number(r.day_count ?? 0)
        dayCount[yt][dow] = (dayCount[yt][dow] ?? 0) + dc
        if (r.is_event) {
          eventDays[yt] += dc
          if (r.event_name) {
            const ec = (eventCl[yt][r.event_name] ??= { n: 0, rev: 0, days: 0, start: r.event_start ?? '', end: r.event_end ?? '' })
            ec.days = Number(r.event_days ?? 0)
          }
        } else dayCountNoEv[yt][dow] = (dayCountNoEv[yt][dow] ?? 0) + dc
      }
      const n = Number(r.nights ?? 0), rev = Number(r.room_revenue ?? 0)
      const code = r.segmentation
      if (code != null) {   // 값 없는 채움 행(segmentation NULL)은 세그·어카운트 집계에서 제외
        const sc = (seg[yt][code] ??= {}); const sd = (sc[dow] ??= { n: 0, rev: 0 }); sd.n += n; sd.rev += rev
        if (!houCodes.has(code)) {
          const td = (dowTot[yt][dow] ??= { n: 0, rev: 0 }); td.n += n; td.rev += rev
          if (r.is_event) {
            eventTot[yt].n += n; eventTot[yt].rev += rev
            if (r.event_name) { const ec = eventCl[yt][r.event_name]; if (ec) { ec.n += n; ec.rev += rev } }
          }
          else { const tdn = (dowTotNoEv[yt][dow] ??= { n: 0, rev: 0 }); tdn.n += n; tdn.rev += rev }
        }
        const nm = r.account_name
        if (nm) {
          const ac = (acct[yt][nm] ??= {}); const ad = (ac[dow] ??= { n: 0, rev: 0 }); ad.n += n; ad.rev += rev
          if (codeToMid[code]) acctMid[nm] = codeToMid[code]
          names.add(nm)
        }
      }
    }
    const monthDays: Record<YearType, number> = {
      cy: DOWS.reduce((s, d) => s + (dayCount.cy[d] ?? 0), 0),
      ly_otb: DOWS.reduce((s, d) => s + (dayCount.ly_otb[d] ?? 0), 0),
      ly_close: DOWS.reduce((s, d) => s + (dayCount.ly_close[d] ?? 0), 0),
    }
    const monthTot: Record<YearType, Cell> = {
      cy: DOWS.reduce((a, d) => ({ n: a.n + (dowTot.cy[d]?.n ?? 0), rev: a.rev + (dowTot.cy[d]?.rev ?? 0) }), { n: 0, rev: 0 }),
      ly_otb: DOWS.reduce((a, d) => ({ n: a.n + (dowTot.ly_otb[d]?.n ?? 0), rev: a.rev + (dowTot.ly_otb[d]?.rev ?? 0) }), { n: 0, rev: 0 }),
      ly_close: DOWS.reduce((a, d) => ({ n: a.n + (dowTot.ly_close[d]?.n ?? 0), rev: a.rev + (dowTot.ly_close[d]?.rev ?? 0) }), { n: 0, rev: 0 }),
    }
    return { dayCount, seg, acct, dowTot, dowTotNoEv, eventTot, dayCountNoEv, eventDays, eventCl, acctMid, monthDays, monthTot, accountNames: [...names] }
  }, [rpcRows, houCodes, codeToMid])

  // ─── 셀 헬퍼 ───────────────────────────────────────────────────────────────────
  const totCell = (yt: YearType, dow: number): Cell => agg.dowTot[yt][dow] ?? { n: 0, rev: 0 }
  const segCell = (codes: string[], yt: YearType, dow: number): Cell => {
    let n = 0, rev = 0
    for (const c of codes) { const d = agg.seg[yt][c]?.[dow]; if (d) { n += d.n; rev += d.rev } }
    return { n, rev }
  }
  const segCellSum = (codes: string[], yt: YearType): Cell => {
    let n = 0, rev = 0
    for (const c of codes) for (const dow of DOWS) { const d = agg.seg[yt][c]?.[dow]; if (d) { n += d.n; rev += d.rev } }
    return { n, rev }
  }
  const acctCell = (nm: string, yt: YearType, dow: number): Cell => agg.acct[yt][nm]?.[dow] ?? { n: 0, rev: 0 }
  const acctCellSum = (nm: string, yt: YearType): Cell => {
    let n = 0, rev = 0
    for (const dow of DOWS) { const d = agg.acct[yt][nm]?.[dow]; if (d) { n += d.n; rev += d.rev } }
    return { n, rev }
  }
  const occOf = (n: number, dc: number) => (roomCount > 0 && dc > 0) ? (n / (roomCount * dc)) * 100 : 0

  // 지표 표시 값 (단일 연도)
  const showVal = (metric: Metric, c: Cell): string => {
    if (metric === 'rn')  return c.n === 0 ? '—' : c.n.toLocaleString()
    if (metric === 'adr') return c.n === 0 ? '—' : scaleUnit(c.rev / c.n, adrUnit).toLocaleString()
    return c.rev === 0 ? '—' : scaleUnit(c.rev, revUnit).toLocaleString()
  }
  const gapRaw = (metric: Metric, cy: Cell, ly: Cell): number => {
    if (metric === 'rn')  return cy.n - ly.n
    if (metric === 'adr') return scaleUnit((cy.n > 0 ? cy.rev / cy.n : 0) - (ly.n > 0 ? ly.rev / ly.n : 0), adrUnit)
    return scaleUnit(cy.rev - ly.rev, revUnit)
  }
  const gapNode = (metric: Metric, cy: Cell, ly: Cell): { text: string; color: string } => {
    if (cy.n === 0 && ly.n === 0 && cy.rev === 0 && ly.rev === 0) return { text: '—', color: '#555' }
    const d = gapRaw(metric, cy, ly)
    const color = d > 0 ? MINT : d < 0 ? RED : '#888'
    const text = `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toLocaleString()}`
    return { text, color }
  }
  // YearSel 에 따른 셀 표시 (탭2/탭3 공용)
  const cellBySel = (sel: YearSel, metric: Metric, cy: Cell, ly: Cell): { text: string; color: string } => {
    if (sel === 'cy') return { text: showVal(metric, cy), color: cy.n === 0 && cy.rev === 0 ? '#555' : MINT }
    if (sel === 'ly') return { text: showVal(metric, ly), color: ly.n === 0 && ly.rev === 0 ? '#555' : AMBER }
    return gapNode(metric, cy, ly)
  }

  // ─── 공유 지표 '점유율' 셀 (탭2/탭3) — 분모는 요일별 전체 캐파와 동일 ───────────────
  const occText = (n: number, dc: number, pctColor: string): React.ReactNode =>
    n === 0 ? '—' : <>{occOf(n, dc).toFixed(1)}<span style={{ fontSize: 11, color: pctColor }}>%</span></>
  const occCellBySel = (sel: YearSel, cy: Cell, ly: Cell, dcCy: number, dcLy: number): { text: React.ReactNode; color: string } => {
    if (sel === 'cy') return { text: cy.n === 0 ? '—' : cy.n.toLocaleString(), color: cy.n === 0 ? '#555' : MINT }
    if (sel === 'ly') return { text: ly.n === 0 ? '—' : ly.n.toLocaleString(), color: ly.n === 0 ? '#555' : AMBER }
    if (cy.n === 0 && ly.n === 0) return { text: '—', color: '#555' }
    const d = cy.n - ly.n
    const color = d > 0 ? MINT : d < 0 ? RED : '#888'
    return { text: `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toLocaleString()}`, color }
  }
  // 어카운트 정렬·드롭다운용 — 공유 지표 기준 (occ 는 전체 월 캐파 분모)
  const acctGapRaw = (cy: Cell, ly: Cell): number =>
    barBasis === 'occ' ? cy.n - ly.n : gapRaw(barBasis, cy, ly)
  const acctGapNode = (cy: Cell, ly: Cell): { text: string; color: string } => {
    if (barBasis !== 'occ') return gapNode(barBasis, cy, ly)
    if (cy.n === 0 && ly.n === 0) return { text: '—', color: '#555' }
    const d = cy.n - ly.n
    const color = d > 0 ? MINT : d < 0 ? RED : '#888'
    return { text: `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toLocaleString()}`, color }
  }

  // 전년 기준 토글 — ly_otb 행이 없으면(과거월) 마감 고정, 월 이동 시 기본값 복귀
  const hasLyOtb = useMemo(() => rpcRows.some(r => r.year_type === 'ly_otb'), [rpcRows])
  useEffect(() => { setLyBasis(hasLyOtb ? 'ly_otb' : 'ly_close') }, [hasLyOtb, selectedYear, m1])

  // ─── 탭3 기본 선택 시드 & 연동 ─────────────────────────────────────────────────
  const seededRef = useRef(false)
  useEffect(() => { seededRef.current = false }, [selectedYear, m1, hotelId])
  useEffect(() => {
    if (seededRef.current) return
    if (midUnits.length === 0 || rpcRows.length === 0) return
    setSelectedSegs(new Set(midUnits.map(m => m.id)))
    const scored = agg.accountNames.map(nm => ({
      nm, v: Math.abs(acctGapRaw(acctCellSum(nm, 'cy'), acctCellSum(nm, lyBasis))),
    }))
    scored.sort((a, b) => b.v - a.v)
    setSelectedAccts(new Set(scored.slice(0, 3).map(s => s.nm)))
    seededRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midUnits, rpcRows, agg])
  // 세그 해제 시 해당 어카운트 자동 제거
  useEffect(() => {
    setSelectedAccts(prev => {
      const next = new Set([...prev].filter(nm => selectedSegs.has(agg.acctMid[nm])))
      return next.size === prev.size ? prev : next
    })
  }, [selectedSegs, agg])
  // 드롭다운 외부 클릭 / ESC 닫기
  useEffect(() => {
    if (!openDrop) return
    const md = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.dow-dd-panel') && !t.closest('.dow-dd-btn')) setOpenDrop(null)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenDrop(null) }
    document.addEventListener('mousedown', md)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', md); document.removeEventListener('keydown', esc) }
  }, [openDrop])

  // ─── 요약 줄 ───────────────────────────────────────────────────────────────────
  const summaryText = (() => {
    const yy = (y: number) => String(y).slice(-2)
    if (monthState === 'past') {
      return `${yy(selectedYear)}.${pad(m1)} 마감 ↔ ${yy(selectedYear - 1)}.${pad(m1)} 마감`
    }
    const iso = otbDate || ''
    const fmt = (s: string) => `${s.slice(2, 4)}.${s.slice(5, 7)}.${s.slice(8, 10)}`
    const lyIso = iso ? `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}` : ''
    return `${fmt(iso)} 현재 OTB ↔ ${fmt(lyIso)} 전년 동일자 OTB`
  })()

  // ─── 공통 스타일 ───────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    position: 'relative', background: '#000', border: '0.5px solid rgba(0,229,160,0.22)',
    borderRadius: 12, overflow: 'hidden', padding: '16px 18px 20px',
  }
  const leftBar: React.CSSProperties = {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
    background: 'linear-gradient(180deg,#00E5A0 0%,rgba(0,229,160,0.45) 45%,rgba(0,229,160,0) 100%)',
  }
  const groupStart: React.CSSProperties = { boxShadow: 'inset 1px 0 0 rgba(0,229,160,0.3)' }
  const td: React.CSSProperties = { fontSize: 12, padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }
  const th: React.CSSProperties = { fontSize: 10, padding: '5px 8px', textAlign: 'right', color: '#666', fontWeight: 400, whiteSpace: 'nowrap' }

  // ─── 단위 설정 (표 하단 우측) ───────────────────────────────────────────────────
  function renderUnitControl() {
    return (
      <div className="unit-setting-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: MINT, whiteSpace: 'nowrap' }}>단위 : 실 · {adrUnit} · {revUnit}</span>
        <button onClick={() => setShowUnitSetting(v => !v)} style={{
          width: 28, height: 28, borderRadius: 7, border: '0.5px solid rgba(0,229,160,0.45)',
          background: '#0d1512', color: MINT, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        {showUnitSetting && (
          <div style={{ position: 'absolute', bottom: 34, right: 0, width: 190, background: '#0f0f0f', border: '0.5px solid #242424', borderRadius: 10, padding: '12px 14px', zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <UnitRow label="객단가" value={adrUnit} onChange={setAdrUnit} />
            <div style={{ height: 8 }} />
            <UnitRow label="매출" value={revUnit} onChange={setRevUnit} />
          </div>
        )}
      </div>
    )
  }
  function unitFooter(left: React.ReactNode) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, paddingTop: 11, borderTop: '0.5px solid #161616', gap: 12, flexWrap: 'wrap' }}>
        {left}
        {renderUnitControl()}
      </div>
    )
  }

  // ─── 탭1: 요일별 실적 ──────────────────────────────────────────────────────────
  function renderDowTab() {
    const rowH = 36, totH = 38
    const hCell: React.CSSProperties = { fontSize: 12, padding: '5px 6px', textAlign: 'right', color: '#666', fontWeight: 400, whiteSpace: 'nowrap' }
    const dCell: React.CSSProperties = { fontSize: 15, padding: '0 6px', textAlign: 'right', whiteSpace: 'nowrap', height: rowH }
    const rowBg = (key: string, isEvent: boolean) => {
      const hov = dowHover === key
      if (isEvent) return hov ? 'rgba(167,139,250,0.12)' : 'rgba(167,139,250,0.06)'
      return hov ? 'rgba(0,229,160,0.06)' : 'transparent'
    }
    const occNode = (n: number, occ: number, pctColor: string) =>
      n === 0 ? '—' : <>{occ.toFixed(1)}<span style={{ fontSize: 11, color: pctColor }}>%</span></>
    const dOccNode = (cy: Cell, ly: Cell, dOcc: number) =>
      cy.n === 0 && ly.n === 0 ? '—' : `${dOcc > 0 ? '+' : dOcc < 0 ? '−' : ''}${Math.abs(dOcc).toFixed(1)}`
    // 전년비 막대 값 (막대 기준에 따른 전년비)
    const barValueOf = (cy: Cell, ly: Cell, dcCy: number, dcLy: number) => {
      const hasPrev = barBasis === 'occ' ? dcLy > 0 : (ly.n > 0 || ly.rev > 0)
      const val = barBasis === 'occ' ? occOf(cy.n, dcCy) - occOf(ly.n, dcLy)
                : barBasis === 'adr' ? gapRaw('adr', cy, ly)
                : gapRaw('rev', cy, ly)
      return { val, hasPrev }
    }
    const barFmt = (val: number) => barBasis === 'occ' ? Math.abs(val).toFixed(1) : Math.abs(val).toLocaleString()
    const barSuffix = barBasis === 'occ' ? '%p' : barBasis === 'adr' ? adrUnit : revUnit
    // 스케일 최대값 — 요일 7행 + 연휴 행 (합계 제외)
    const scaleRows: { cy: Cell; ly: Cell; dcCy: number; dcLy: number }[] = DOWS.map(d => ({
      cy: agg.dowTot.cy[d] ?? { n: 0, rev: 0 }, ly: agg.dowTot[lyBasis][d] ?? { n: 0, rev: 0 },
      dcCy: agg.dayCount.cy[d] ?? 0, dcLy: agg.dayCount[lyBasis][d] ?? 0,
    }))
    if (agg.eventDays.cy > 0 || agg.eventDays[lyBasis] > 0) scaleRows.push({ cy: agg.eventTot.cy, ly: agg.eventTot[lyBasis], dcCy: agg.eventDays.cy, dcLy: agg.eventDays[lyBasis] })
    const barMax = scaleRows.reduce((mx, r) => { const b = barValueOf(r.cy, r.ly, r.dcCy, r.dcLy); return b.hasPrev ? Math.max(mx, Math.abs(b.val)) : mx }, 0)
    // 영점선 기준 좌우 막대 + 막대 바깥쪽 값 텍스트 (전년 값 없으면 영점선만)
    const barInner = (cy: Cell, ly: Cell, dcCy: number, dcLy: number, h: number, tone = false) => {
      const { val, hasPrev } = barValueOf(cy, ly, dcCy, dcLy)
      const pct = hasPrev && barMax > 0 ? Math.abs(val) / barMax * 15 : 0
      const show = hasPrev && Math.abs(val) > 0
      const posBar = tone ? 'linear-gradient(90deg,rgba(0,229,160,0.35),rgba(0,229,160,0.75))' : 'linear-gradient(90deg,rgba(0,229,160,0.5),#00E5A0)'
      const negBar = tone ? 'linear-gradient(90deg,rgba(226,75,74,0.75),rgba(226,75,74,0.35))' : 'linear-gradient(90deg,#E24B4A,rgba(226,75,74,0.5))'
      const posTxt = tone ? '#3d9d7c' : '#00E5A0', negTxt = tone ? '#b04745' : '#E24B4A', txtSize = tone ? 13 : 15
      return (
        <div style={{ position: 'relative', height: h }}>
          <div style={{ position: 'absolute', left: '50%', top: 8, bottom: 8, width: 1, background: '#242424' }} />
          {show && val > 0 && (
            <>
              <div style={{ position: 'absolute', left: '50%', top: 12, height: 12, width: `${pct}%`, background: posBar, borderRadius: '0 2px 2px 0' }} />
              <span style={{ position: 'absolute', left: `calc(50% + ${pct}% + 6px)`, top: 9, fontSize: txtSize, color: posTxt, whiteSpace: 'nowrap' }}>{barFmt(val)}<span style={{ fontSize: 11 }}>{barSuffix}</span></span>
            </>
          )}
          {show && val < 0 && (
            <>
              <div style={{ position: 'absolute', right: '50%', top: 12, height: 12, width: `${pct}%`, background: negBar, borderRadius: '2px 0 0 2px' }} />
              <span style={{ position: 'absolute', right: `calc(50% + ${pct}% + 6px)`, top: 9, fontSize: txtSize, color: negTxt, whiteSpace: 'nowrap' }}>{barFmt(val)}<span style={{ fontSize: 11 }}>{barSuffix}</span></span>
            </>
          )}
        </div>
      )
    }
    // 전년 기준 토글 (2025년 헤더) — 골드 계열, ly_otb 없으면 '동기간 온북' 비활성
    const lyItem = (v: 'ly_otb' | 'ly_close', label: string) => {
      const disabled = v === 'ly_otb' && !hasLyOtb
      const active = lyBasis === v
      return (
        <span key={v} onClick={disabled ? undefined : () => setLyBasis(v)} style={{
          fontSize: 10, padding: '3px 8px', borderRadius: 4,
          cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
          ...(active ? { background: 'rgba(245,158,11,0.14)', color: '#F59E0B' } : { color: '#777' }),
        }}>{label}</span>
      )
    }
    return (
      <div style={card}>
        <div style={leftBar} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...hCell, textAlign: 'left', color: '#bbb', fontSize: 14, fontWeight: 500 }}>요일</th>
                <th style={{ ...hCell, textAlign: 'center', color: '#bbb', fontSize: 14, fontWeight: 500 }}>전년비</th>
                <th colSpan={3} style={{ ...hCell, textAlign: 'center', color: MINT, fontSize: 14, fontWeight: 500, ...groupStart }}>{selectedYear}년</th>
                <th colSpan={3} style={{ ...hCell, textAlign: 'center', color: AMBER, fontSize: 14, fontWeight: 500, ...groupStart }}>
                  {selectedYear - 1}년
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 }}>
                    <div style={{ display: 'flex', background: '#0c0c0c', border: '0.5px solid #242424', borderRadius: 5, padding: 2 }}>
                      {lyItem('ly_otb', '동기간 온북')}{lyItem('ly_close', '마감')}
                    </div>
                  </div>
                </th>
                <th colSpan={3} style={{ ...hCell, textAlign: 'center', color: '#bbb', fontSize: 14, fontWeight: 500, ...groupStart }}>GAP</th>
              </tr>
              <tr>
                <th style={{ ...hCell, textAlign: 'left', color: '#3a3a3a' }}>일수</th>
                <th style={{ ...hCell, textAlign: 'center', color: '#6a6a6a' }}>{barBasis === 'occ' ? '점유율 대비' : barBasis === 'adr' ? '객단가 대비' : '매출 대비'}</th>
                <th style={{ ...hCell, ...groupStart }}>점유율</th><th style={hCell}>객단가</th><th style={hCell}>매출</th>
                <th style={{ ...hCell, ...groupStart }}>점유율</th><th style={hCell}>객단가</th><th style={hCell}>매출</th>
                <th style={{ ...hCell, ...groupStart }}>Δ점유</th><th style={hCell}>Δ단가</th><th style={hCell}>Δ매출</th>
              </tr>
            </thead>
            <tbody>
              {DOWS.map(dow => {
                const dcCy = agg.dayCount.cy[dow] ?? 0, dcLy = agg.dayCount[lyBasis][dow] ?? 0
                const cy = agg.dowTot.cy[dow] ?? { n: 0, rev: 0 }, ly = agg.dowTot[lyBasis][dow] ?? { n: 0, rev: 0 }
                const occCy = occOf(cy.n, dcCy), occLy = occOf(ly.n, dcLy)
                const dOcc = occCy - occLy
                const dcColor = dcCy === dcLy ? '#4a4a4a' : dcCy > dcLy ? MINT : RED
                const both = (cy.n > 0 || cy.rev > 0) && (ly.n > 0 || ly.rev > 0)
                const adrGap = both ? gapNode('adr', cy, ly) : { text: '—', color: '#3f3f3f' }
                const revGap = both ? gapNode('rev', cy, ly) : { text: '—', color: '#3f3f3f' }
                const key = `dow-${dow}`, bg = rowBg(key, false)
                return (
                  <tr key={dow} onMouseEnter={() => setDowHover(key)} onMouseLeave={() => setDowHover(null)}>
                    <td style={{ ...dCell, textAlign: 'left', color: dowColor(dow), background: bg }}>
                      <span style={{ fontSize: 16 }}>{DOW_NAME[dow]}</span>
                      <span style={{ fontSize: 14, marginLeft: 12, color: dcColor }}>{dcCy}일/{dcLy}일</span>
                    </td>
                    <td style={{ ...dCell, position: 'relative', padding: '0 5px', background: bg }}>{barInner(cy, ly, dcCy, dcLy, rowH)}</td>
                    <td style={{ ...dCell, color: '#e8e8e8', background: bg, ...groupStart }}>{occNode(cy.n, occCy, '#666')}</td>
                    <td style={{ ...dCell, color: '#e8e8e8', background: bg }}>{showVal('adr', cy)}</td>
                    <td style={{ ...dCell, color: '#e8e8e8', background: bg }}>{showVal('rev', cy)}</td>
                    <td style={{ ...dCell, color: '#bbb', background: bg, ...groupStart }}>{occNode(ly.n, occLy, '#555')}</td>
                    <td style={{ ...dCell, color: '#bbb', background: bg }}>{showVal('adr', ly)}</td>
                    <td style={{ ...dCell, color: '#bbb', background: bg }}>{showVal('rev', ly)}</td>
                    <td style={{ ...dCell, color: !both ? '#3f3f3f' : dOcc > 0 ? MINT : dOcc < 0 ? RED : '#888', background: bg, ...groupStart }}>
                      {both ? dOccNode(cy, ly, dOcc) : '—'}
                    </td>
                    <td style={{ ...dCell, color: adrGap.color, background: bg }}>{adrGap.text}</td>
                    <td style={{ ...dCell, color: revGap.color, background: bg }}>{revGap.text}</td>
                  </tr>
                )
              })}
              {/* 합계 */}
              {(() => {
                const cy = agg.monthTot.cy, ly = agg.monthTot[lyBasis]
                const occCy = roomCount > 0 && agg.monthDays.cy > 0 ? (cy.n / (roomCount * agg.monthDays.cy)) * 100 : 0
                const occLy = roomCount > 0 && agg.monthDays[lyBasis] > 0 ? (ly.n / (roomCount * agg.monthDays[lyBasis])) * 100 : 0
                const dOcc = occCy - occLy
                const both = (cy.n > 0 || cy.rev > 0) && (ly.n > 0 || ly.rev > 0)
                const adrGap = both ? gapNode('adr', cy, ly) : { text: '—', color: '#3f3f3f' }
                const revGap = both ? gapNode('rev', cy, ly) : { text: '—', color: '#3f3f3f' }
                const key = 'total', bg = dowHover === key ? 'rgba(0,229,160,0.06)' : 'transparent'
                const tb: React.CSSProperties = { ...dCell, height: totH, borderTop: '1px solid rgba(0,229,160,0.35)', fontWeight: 500, background: bg }
                return (
                  <tr onMouseEnter={() => setDowHover(key)} onMouseLeave={() => setDowHover(null)}>
                    <td style={{ ...tb, textAlign: 'left', color: '#fff' }}>
                      <span style={{ fontSize: 16 }}>합계</span>
                      <span style={{ fontSize: 14, marginLeft: 12, color: '#4a4a4a' }}>{agg.monthDays.cy}일/{agg.monthDays[lyBasis]}일</span>
                    </td>
                    <td style={{ ...tb, position: 'relative', padding: '0 5px' }}>{barInner(cy, ly, agg.monthDays.cy, agg.monthDays[lyBasis], totH)}</td>
                    <td style={{ ...tb, color: '#fff', ...groupStart }}>{occNode(cy.n, occCy, '#666')}</td>
                    <td style={{ ...tb, color: '#fff' }}>{showVal('adr', cy)}</td>
                    <td style={{ ...tb, color: '#fff' }}>{showVal('rev', cy)}</td>
                    <td style={{ ...tb, color: '#cfcfcf', ...groupStart }}>{occNode(ly.n, occLy, '#555')}</td>
                    <td style={{ ...tb, color: '#cfcfcf' }}>{showVal('adr', ly)}</td>
                    <td style={{ ...tb, color: '#cfcfcf' }}>{showVal('rev', ly)}</td>
                    <td style={{ ...tb, color: !both ? '#3f3f3f' : dOcc > 0 ? MINT : dOcc < 0 ? RED : '#888', ...groupStart }}>
                      {both ? dOccNode(cy, ly, dOcc) : '—'}
                    </td>
                    <td style={{ ...tb, color: adrGap.color }}>{adrGap.text}</td>
                    <td style={{ ...tb, color: revGap.color }}>{revGap.text}</td>
                  </tr>
                )
              })()}
              {/* ─── 참고: 연휴 (합계에 이미 포함된 부분집합) ─── */}
              {(agg.eventDays.cy > 0 || agg.eventDays[lyBasis] > 0) && (
                <tr>
                  <td colSpan={11} style={{ padding: '12px 0 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ fontSize: 12, color: '#6a5a9a' }}>참고</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(167,139,250,0.22)' }} />
                    </div>
                  </td>
                </tr>
              )}
              {(agg.eventDays.cy > 0 || agg.eventDays[lyBasis] > 0) && (() => {
                const dcCy = agg.eventDays.cy, dcLy = agg.eventDays[lyBasis]
                const cy = agg.eventTot.cy, ly = agg.eventTot[lyBasis]
                const occCy = occOf(cy.n, dcCy), occLy = occOf(ly.n, dcLy)
                const dOcc = occCy - occLy
                const both = (cy.n > 0 || cy.rev > 0) && (ly.n > 0 || ly.rev > 0)
                const adrGap = both ? gapNode('adr', cy, ly) : { text: '—', color: '#3f3f3f' }
                const revGap = both ? gapNode('rev', cy, ly) : { text: '—', color: '#3f3f3f' }
                const key = 'event', bg = rowBg(key, true)
                const eb: React.CSSProperties = { ...dCell, height: 46, background: bg, color: '#a78bfa' }
                // 연휴 클러스터 (cy/ly 합집합, event_start 오름차순)
                const clNames = [...new Set([...Object.keys(agg.eventCl.cy), ...Object.keys(agg.eventCl[lyBasis])])]
                const clMeta = (nm: string) => agg.eventCl.cy[nm] ?? agg.eventCl[lyBasis][nm]
                clNames.sort((a, b) => (clMeta(a)?.start ?? '').localeCompare(clMeta(b)?.start ?? ''))
                const fmtPeriod = (s: string, e: string) => {
                  if (!s || !e) return ''
                  const sm = s.slice(5, 7), sd = s.slice(8, 10), em = e.slice(5, 7), ed = e.slice(8, 10)
                  return sm === em ? `${sm}/${sd}~${ed}` : `${sm}/${sd}~${em}/${ed}`
                }
                const first = clNames[0] ? clMeta(clNames[0]) : undefined
                const eventSub = clNames.length === 1 && first
                  ? `${clNames[0]} ${fmtPeriod(first.start, first.end)}`.trim()
                  : `${clNames.length}건 · ${clNames.join(' · ')}`
                return (
                  <>
                    <tr key="event" onMouseEnter={() => setDowHover(key)} onMouseLeave={() => setDowHover(null)}>
                      <td style={{ ...eb, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 16, color: '#a78bfa' }}>연휴</span>
                          <span style={{ fontSize: 14, marginLeft: 12, color: '#6a5a9a' }}>{dcCy}일/{dcLy}일</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#6a5a9a', marginTop: 2 }}>{eventSub}</div>
                      </td>
                      <td style={{ ...eb, position: 'relative', padding: '0 5px' }}>{barInner(cy, ly, dcCy, dcLy, 46)}</td>
                      <td style={{ ...eb, ...groupStart }}>{occNode(cy.n, occCy, '#6a5a9a')}</td>
                      <td style={eb}>{showVal('adr', cy)}</td>
                      <td style={eb}>{showVal('rev', cy)}</td>
                      <td style={{ ...eb, ...groupStart }}>{occNode(ly.n, occLy, '#6a5a9a')}</td>
                      <td style={eb}>{showVal('adr', ly)}</td>
                      <td style={eb}>{showVal('rev', ly)}</td>
                      <td style={{ ...eb, ...groupStart, color: both ? (dOcc > 0 ? MINT : dOcc < 0 ? RED : '#888') : '#3f3f3f' }}>{both ? dOccNode(cy, ly, dOcc) : '—'}</td>
                      <td style={{ ...eb, color: adrGap.color }}>{adrGap.text}</td>
                      <td style={{ ...eb, color: revGap.color }}>{revGap.text}</td>
                    </tr>
                    {clNames.length >= 2 && clNames.map(nm => {
                      const cyEc = agg.eventCl.cy[nm], lyEc = agg.eventCl[lyBasis][nm]
                      const ccy: Cell = { n: cyEc?.n ?? 0, rev: cyEc?.rev ?? 0 }
                      const cly: Cell = { n: lyEc?.n ?? 0, rev: lyEc?.rev ?? 0 }
                      const cdCy = cyEc?.days ?? 0, cdLy = lyEc?.days ?? 0
                      const cOccCy = occOf(ccy.n, cdCy), cOccLy = occOf(cly.n, cdLy)
                      const cdOcc = cOccCy - cOccLy
                      const cBoth = (ccy.n > 0 || ccy.rev > 0) && (cly.n > 0 || cly.rev > 0)
                      const cAdr = cBoth ? gapNode('adr', ccy, cly) : { text: '—', color: '#3f3f3f' }
                      const cRev = cBoth ? gapNode('rev', ccy, cly) : { text: '—', color: '#3f3f3f' }
                      const meta = cyEc ?? lyEc
                      const period = meta ? fmtPeriod(meta.start, meta.end) : ''
                      const days = cyEc?.days ?? lyEc?.days ?? 0
                      const gapCol = (c: { color: string }) => c.color === MINT ? '#3d9d7c' : c.color === RED ? '#b04745' : c.color
                      const sb: React.CSSProperties = { ...dCell, height: 36, fontSize: 13, background: 'rgba(167,139,250,0.03)', color: '#8a7ab8' }
                      return (
                        <tr key={`cl-${nm}`}>
                          <td style={{ ...sb, textAlign: 'left', paddingLeft: 16 }}>
                            <div style={{ fontSize: 13, color: '#8a7ab8' }}>└ {nm}</div>
                            <div style={{ fontSize: 10, color: '#5a4d80', marginTop: 1 }}>{period}{period ? ' · ' : ''}{days}일</div>
                          </td>
                          <td style={{ ...sb, position: 'relative', padding: '0 5px' }}>{barInner(ccy, cly, cdCy, cdLy, 36, true)}</td>
                          <td style={{ ...sb, ...groupStart }}>{occNode(ccy.n, cOccCy, '#5a4d80')}</td>
                          <td style={sb}>{showVal('adr', ccy)}</td>
                          <td style={sb}>{showVal('rev', ccy)}</td>
                          <td style={{ ...sb, color: '#777', ...groupStart }}>{occNode(cly.n, cOccLy, '#5a4d80')}</td>
                          <td style={{ ...sb, color: '#777' }}>{showVal('adr', cly)}</td>
                          <td style={{ ...sb, color: '#777' }}>{showVal('rev', cly)}</td>
                          <td style={{ ...sb, ...groupStart, color: !cBoth ? '#3f3f3f' : cdOcc > 0 ? '#3d9d7c' : cdOcc < 0 ? '#b04745' : '#888' }}>{cBoth ? dOccNode(ccy, cly, cdOcc) : '—'}</td>
                          <td style={{ ...sb, color: gapCol(cAdr) }}>{cAdr.text}</td>
                          <td style={{ ...sb, color: gapCol(cRev) }}>{cRev.text}</td>
                        </tr>
                      )
                    })}
                  </>
                )
              })()}
            </tbody>
          </table>
        </div>
        {unitFooter(
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#3a3a3a', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 16, height: 7, borderRadius: 2, background: '#00E5A0' }} />전년비 상승</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 16, height: 7, borderRadius: 2, background: '#E24B4A' }} />전년비 하락</span>
            <span><span style={{ color: '#a78bfa' }}>연휴</span> 행은 요일 행에 포함된 구간 (합산 아님)</span>
          </div>
        )}
      </div>
    )
  }

  // ─── 탭2: 세그먼트 실적 ────────────────────────────────────────────────────────
  function renderSegTab() {
    const rows: { level: 'main' | 'mid'; name: string; codes: string[] }[] = []
    for (const top of tops) {
      rows.push({ level: 'main', name: top.name, codes: top.codes })
      if (top.children.length) for (const c of top.children) rows.push({ level: 'mid', name: c.name, codes: c.codes })
    }
    const totCodes = midUnits.filter(m => !m.codes.some(c => houCodes.has(c))).flatMap(m => m.codes)
    const metricHeadLabel = barBasis === 'occ' ? '객실' : barBasis === 'adr' ? '객단가' : '매출'
    const fmt = (v: number) => v.toLocaleString()
    // 전년 기준 토글 (탭1과 lyBasis 공유) — 골드 계열, ly_otb 없으면 '동기간 온북' 비활성
    const lyItem = (v: 'ly_otb' | 'ly_close', label: string) => {
      const disabled = v === 'ly_otb' && !hasLyOtb
      const active = lyBasis === v
      return (
        <span key={v} onClick={disabled ? undefined : () => setLyBasis(v)} style={{
          fontSize: 10, padding: '3px 8px', borderRadius: 4,
          cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
          ...(active ? { background: 'rgba(245,158,11,0.14)', color: '#F59E0B' } : { color: '#777' }),
        }}>{label}</span>
      )
    }
    // 요일별 26년/25년/Δ 값 (선택 지표 1종)
    const triple = (codes: string[], dow: number) => {
      const cy = segCell(codes, 'cy', dow), ly = segCell(codes, lyBasis, dow)
      let v26: number | null, v25: number | null, dRaw: number, dPresent: boolean, isZeroD: boolean
      if (barBasis === 'occ') {
        v26 = cy.n === 0 ? null : cy.n
        v25 = ly.n === 0 ? null : ly.n
        dRaw = cy.n - ly.n
        dPresent = !(cy.n === 0 && ly.n === 0)
        isZeroD = dRaw === 0
      } else if (barBasis === 'adr') {
        v26 = cy.n === 0 ? null : scaleUnit(cy.rev / cy.n, adrUnit)
        v25 = ly.n === 0 ? null : scaleUnit(ly.rev / ly.n, adrUnit)
        dRaw = scaleUnit((cy.n > 0 ? cy.rev / cy.n : 0) - (ly.n > 0 ? ly.rev / ly.n : 0), adrUnit)
        dPresent = (cy.n > 0 || cy.rev > 0) && (ly.n > 0 || ly.rev > 0)
        isZeroD = dRaw === 0
      } else {
        v26 = cy.rev === 0 ? null : scaleUnit(cy.rev, revUnit)
        v25 = ly.rev === 0 ? null : scaleUnit(ly.rev, revUnit)
        dRaw = scaleUnit(cy.rev - ly.rev, revUnit)
        dPresent = (cy.n > 0 || cy.rev > 0) && (ly.n > 0 || ly.rev > 0)
        isZeroD = dRaw === 0
      }
      return { v26, v25, dRaw, dPresent, isZeroD }
    }
    // 한 요일의 3칸(26/25/Δ) td
    const triCells = (codes: string[], dow: number, tier: 'main' | 'mid' | 'total', base: React.CSSProperties) => {
      const { v26, v25, dRaw, dPresent, isZeroD } = triple(codes, dow)
      const c26 = tier === 'main' ? '#e8e8e8' : tier === 'mid' ? '#bbb' : '#fff'
      const c25 = tier === 'main' ? '#888' : tier === 'mid' ? '#777' : '#aaa'
      const up = tier === 'mid' ? '#3d9d7c' : MINT
      const down = tier === 'mid' ? '#b04745' : RED
      const size = tier === 'mid' ? 12 : 13
      const t26 = v26 === null ? '—' : fmt(v26)
      const t25 = v25 === null ? '—' : fmt(v25)
      const dText = !dPresent ? '—' : isZeroD ? '0' : `${dRaw > 0 ? '+' : '−'}${fmt(Math.abs(dRaw))}`
      const dCol = !dPresent ? '#3f3f3f' : isZeroD ? '#555' : dRaw > 0 ? up : down
      const cs = (color: string): React.CSSProperties => ({ ...base, textAlign: 'right', whiteSpace: 'nowrap', fontSize: size, color })
      return (
        <Fragment key={dow}>
          <td style={{ ...cs(v26 === null ? '#3f3f3f' : c26), ...groupStart }}>{t26}</td>
          <td style={cs(v25 === null ? '#3f3f3f' : c25)}>{t25}</td>
          <td style={cs(dCol)}>{dText}</td>
        </Fragment>
      )
    }
    return (
      <div style={card}>
        <div style={leftBar} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <div style={{ display: 'flex', background: '#0c0c0c', border: '0.5px solid #242424', borderRadius: 5, padding: 2 }}>
            {lyItem('ly_otb', '동기간 온북')}{lyItem('ly_close', '마감')}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
            <colgroup>
              <col style={{ width: '13%' }} />
              {DOWS.map(d => <Fragment key={d}><col style={{ width: '4.14%' }} /><col style={{ width: '4.14%' }} /><col style={{ width: '4.14%' }} /></Fragment>)}
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }} />
                {DOWS.map(d => <th key={d} colSpan={3} style={{ fontSize: 14, textAlign: 'center', paddingBottom: 3, color: dowColor(d), fontWeight: 500, whiteSpace: 'nowrap', ...groupStart }}>{DOW_NAME[d]}</th>)}
              </tr>
              <tr>
                <th style={{ fontSize: 12, color: '#3a3a3a', textAlign: 'left', padding: '0 5px 7px', fontWeight: 400 }}>{metricHeadLabel}</th>
                {DOWS.map(d => (
                  <Fragment key={d}>
                    <th style={{ fontSize: 11, textAlign: 'right', padding: '0 3px 7px', color: '#2f6b57', fontWeight: 400, whiteSpace: 'nowrap', ...groupStart }}>26년</th>
                    <th style={{ fontSize: 11, textAlign: 'right', padding: '0 3px 7px', color: '#7a6030', fontWeight: 400, whiteSpace: 'nowrap' }}>25년</th>
                    <th style={{ fontSize: 11, textAlign: 'right', padding: '0 3px 7px', color: '#6a6a6a', fontWeight: 400, whiteSpace: 'nowrap' }}>Δ</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isMain = r.level === 'main'
                const height = isMain ? 34 : 30
                const bg = isMain ? '#0f1d18' : 'transparent'
                const base: React.CSSProperties = { padding: '0 5px', height, background: bg, borderBottom: '0.5px solid #141414' }
                return (
                  <tr key={`${r.name}-${i}`}>
                    <td style={{ ...base, textAlign: 'left', color: isMain ? '#fff' : '#999', fontWeight: isMain ? 500 : 400, fontSize: isMain ? 13 : 12, paddingLeft: isMain ? 8 : 16 }}>
                      {isMain ? r.name : <span><span style={{ color: '#555' }}>└ </span>{r.name}</span>}
                    </td>
                    {DOWS.map(dow => triCells(r.codes, dow, isMain ? 'main' : 'mid', base))}
                  </tr>
                )
              })}
              {/* 합계 (HOU 제외) */}
              {(() => {
                const base: React.CSSProperties = { padding: '0 5px', height: 36, borderTop: '1px solid rgba(0,229,160,0.35)' }
                return (
                  <tr>
                    <td style={{ ...base, textAlign: 'left', color: '#fff', fontWeight: 500, fontSize: 13 }}>합계</td>
                    {DOWS.map(dow => triCells(totCodes, dow, 'total', base))}
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
        {unitFooter(<div />)}
      </div>
    )
  }

  // ─── 탭3: 어카운트 ─────────────────────────────────────────────────────────────
  const acctAllowed = useMemo(
    () => agg.accountNames.filter(nm => draftSegs.has(agg.acctMid[nm])),
    [agg, draftSegs],
  )
  function acctControlsRow() {
    const selBtn = (which: 'seg' | 'acct', Icon: typeof LayoutGrid, label: string, count: number) => {
      const full = which === 'acct' && count >= MAX_ACCTS
      const accent = full ? '#F59E0B' : MINT
      return (
        <div className="dow-dd-btn" onClick={() => {
          if (openDrop === which) { setOpenDrop(null); return }
          setDraftSegs(new Set(selectedSegs)); setDraftAccts(new Set(selectedAccts))
          setOpenDrop(which)
        }} style={{
          display: 'flex', alignItems: 'center', gap: 7, background: '#0d1512',
          border: full ? '0.5px solid rgba(245,158,11,0.45)' : '0.5px solid rgba(0,229,160,0.45)',
          borderRadius: 8, padding: '7px 11px', cursor: 'pointer',
        }}>
          <Icon size={13} color={accent} />
          <span style={{ fontSize: 12, color: '#e8e8e8' }}>{label}</span>
          <span style={{ fontSize: 10, background: full ? 'rgba(245,158,11,0.18)' : 'rgba(0,229,160,0.18)', color: accent, padding: '2px 7px', borderRadius: 5 }}>{full ? `${MAX_ACCTS}개 · 가득` : `${count}개 선택`}</span>
          <span style={{ fontSize: 9, color: accent }}>▾</span>
        </div>
      )
    }
    // 전년 기준 토글 (탭1·탭2와 lyBasis 공유) — 골드 계열, ly_otb 없으면 '동기간 온북' 비활성
    const lyItem = (v: 'ly_otb' | 'ly_close', label: string) => {
      const disabled = v === 'ly_otb' && !hasLyOtb
      const active = lyBasis === v
      return (
        <span key={v} onClick={disabled ? undefined : () => setLyBasis(v)} style={{
          fontSize: 10, padding: '3px 8px', borderRadius: 4,
          cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
          ...(active ? { background: 'rgba(245,158,11,0.14)', color: '#F59E0B' } : { color: '#777' }),
        }}>{label}</span>
      )
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          {selBtn('seg', LayoutGrid, '세그먼트', selectedSegs.size)}
          {openDrop === 'seg' && segDropdown()}
        </div>
        <div style={{ position: 'relative' }}>
          {selBtn('acct', Store, '어카운트', selectedAccts.size)}
          {openDrop === 'acct' && acctDropdown()}
        </div>
        <span style={{ fontSize: 10, color: '#3a3a3a' }}>최대 {MAX_ACCTS}개</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', background: '#0c0c0c', border: '0.5px solid #242424', borderRadius: 5, padding: 2 }}>
          {lyItem('ly_otb', '동기간 온북')}{lyItem('ly_close', '마감')}
        </div>
      </div>
    )
  }
  const checkbox = (on: boolean) => (
    <span style={{
      width: 15, height: 15, borderRadius: 4, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      ...(on ? { background: MINT } : { border: '0.5px solid #2e2e2e' }),
    }}>{on && <span style={{ color: '#000', fontSize: 10, lineHeight: 1 }}>✓</span>}</span>
  )
  const ddPanel: React.CSSProperties = {
    position: 'absolute', top: 40, left: 0, width: 206, background: '#0d0d0d',
    border: '0.5px solid rgba(0,229,160,0.30)', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.8)', zIndex: 20,
  }
  const ddBtns = (onClear: () => void, onAll: () => void, onDone: () => void) => (
    <div style={{ padding: '9px 10px', borderTop: '0.5px solid #1a1a1a', display: 'flex', gap: 5 }}>
      <button onClick={onClear} style={{ flex: 1, fontSize: 10, padding: '6px 0', borderRadius: 6, textAlign: 'center', border: '0.5px solid #2a2a2a', background: 'transparent', color: '#999', cursor: 'pointer' }}>초기화</button>
      <button onClick={onAll} style={{ flex: 1, fontSize: 10, padding: '6px 0', borderRadius: 6, textAlign: 'center', border: '0.5px solid #2a2a2a', background: 'transparent', color: '#999', cursor: 'pointer' }}>전체</button>
      <button onClick={onDone} style={{ flex: 1.3, fontSize: 10, padding: '6px 0', borderRadius: 6, textAlign: 'center', border: 'none', background: MINT, color: '#000', fontWeight: 500, cursor: 'pointer' }}>완료</button>
    </div>
  )
  function segDropdown() {
    const toggle = (id: string) => setDraftSegs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    return (
      <div className="dow-dd-panel" style={ddPanel}>
        <div style={{ maxHeight: 212, overflowY: 'auto', padding: '6px 8px' }}>
          {tops.map(top => (
            <Fragment key={top.id}>
              {top.children.length > 0 && (
                <div style={{ fontSize: 9, color: '#4a4a4a', letterSpacing: 0.5, padding: '6px 2px 3px', textTransform: 'uppercase' }}>{top.name}</div>
              )}
              {(top.children.length ? top.children : [{ id: top.id, name: top.name, codes: top.codes }]).map(mu => {
                const on = draftSegs.has(mu.id)
                return (
                  <div key={mu.id} onClick={() => toggle(mu.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 3px', cursor: 'pointer' }}>
                    {checkbox(on)}
                    <span style={{ fontSize: 11, color: on ? '#e8e8e8' : '#777' }}>{mu.name}</span>
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
        {ddBtns(() => setDraftSegs(new Set()), () => setDraftSegs(new Set(midUnits.map(m => m.id))), () => { setSelectedSegs(new Set(draftSegs)); setOpenDrop(null) })}
      </div>
    )
  }
  function acctDropdown() {
    const toggle = (nm: string) => setDraftAccts(prev => { const n = new Set(prev); n.has(nm) ? n.delete(nm) : n.add(nm); return n })
    const q = acctSearch.trim().toLowerCase()
    // 중분류(midUnit) 별 그룹핑
    const groups = midUnits.filter(mu => draftSegs.has(mu.id)).map(mu => {
      const names = acctAllowed
        .filter(nm => agg.acctMid[nm] === mu.id)
        .filter(nm => !q || nm.toLowerCase().includes(q))
        .sort((a, b) => Math.abs(acctGapRaw(acctCellSum(b, 'cy'), acctCellSum(b, lyBasis))) - Math.abs(acctGapRaw(acctCellSum(a, 'cy'), acctCellSum(a, lyBasis))))
      return { mu, names }
    }).filter(g => g.names.length > 0)
    return (
      <div className="dow-dd-panel" style={ddPanel}>
        <div style={{ padding: '8px 8px 4px' }}>
          <input value={acctSearch} onChange={e => setAcctSearch(e.target.value)} placeholder="어카운트 검색"
            style={{ width: '100%', boxSizing: 'border-box', background: '#141414', border: '0.5px solid #262626', borderRadius: 6, padding: '4px 8px', fontSize: 10, color: '#e8e8e8', outline: 'none' }} />
        </div>
        <div style={{ maxHeight: 212, overflowY: 'auto', padding: '2px 8px 6px' }}>
          {groups.length === 0 && <div style={{ fontSize: 10, color: '#555', padding: '8px 2px' }}>표시할 어카운트 없음</div>}
          {groups.map(g => (
            <Fragment key={g.mu.id}>
              <div style={{ fontSize: 9, color: '#4a4a4a', letterSpacing: 0.5, padding: '6px 2px 3px', textTransform: 'uppercase' }}>{g.mu.name}</div>
              {g.names.map(nm => {
                const on = draftAccts.has(nm)
                const disabled = !on && draftAccts.size >= MAX_ACCTS
                const gp = acctGapNode(acctCellSum(nm, 'cy'), acctCellSum(nm, lyBasis))
                return (
                  <div key={nm} onClick={disabled ? undefined : () => toggle(nm)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 3px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1 }}>
                    {checkbox(on)}
                    <span style={{ fontSize: 11, color: on ? '#e8e8e8' : '#777', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nm}</span>
                    <span style={{ fontSize: 10, color: gp.color }}>{gp.text}</span>
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
        {ddBtns(() => setDraftAccts(new Set()), () => setDraftAccts(new Set([...acctAllowed].sort((a, b) => Math.abs(acctGapRaw(acctCellSum(b, 'cy'), acctCellSum(b, lyBasis))) - Math.abs(acctGapRaw(acctCellSum(a, 'cy'), acctCellSum(a, lyBasis)))).slice(0, MAX_ACCTS))), () => { setSelectedAccts(new Set(draftAccts)); setOpenDrop(null) })}
      </div>
    )
  }
  function renderAcctTab() {
    const selNames = [...selectedAccts]
      .filter(nm => selectedSegs.has(agg.acctMid[nm]))
      .sort((a, b) => Math.abs(acctGapRaw(acctCellSum(b, 'cy'), acctCellSum(b, lyBasis))) - Math.abs(acctGapRaw(acctCellSum(a, 'cy'), acctCellSum(a, lyBasis))))
    const selCodes = midUnits.filter(m => selectedSegs.has(m.id)).flatMap(m => m.codes)
    const fmt = (v: number) => v.toLocaleString()
    const purpleStart: React.CSSProperties = { boxShadow: 'inset 1px 0 0 rgba(167,139,250,0.3)' }
    // 폭 비율(%) — 요일 12 / 세그전체 각 6 / 어카운트 컬럼(N×3)이 나머지 70 균등. 0개면 세그전체가 나머지 채움
    const nAcct = selNames.length
    const acctColW = nAcct > 0 ? 70 / (nAcct * 3) : 0
    const segColW = nAcct > 0 ? 6 : 88 / 3
    // ── 하단 요일별 구성 카드 (객실수 고정, 지표 버튼 무관) ──
    const activeCardAcct = dowCardAcct && selNames.includes(dowCardAcct) ? dowCardAcct : null
    const cardN = (yt: YearType, dow: number) => activeCardAcct ? acctCell(activeCardAcct, yt, dow).n : segCell(selCodes, yt, dow).n
    const cardTotCy = activeCardAcct ? acctCellSum(activeCardAcct, 'cy').n : segCellSum(selCodes, 'cy').n
    const cardTotLy = activeCardAcct ? acctCellSum(activeCardAcct, lyBasis).n : segCellSum(selCodes, lyBasis).n
    const cardData = DOWS.map(dow => {
      const cyN = cardN('cy', dow)
      const share = cardTotCy > 0 ? cyN / cardTotCy * 100 : 0
      const yoy = cardTotLy > 0 ? share - (cardN(lyBasis, dow) / cardTotLy * 100) : null
      return { dow, cyN, share, yoy }
    })
    const cardTopDow = cardTotCy > 0 ? cardData.reduce((mx, d) => d.share > mx.share ? d : mx).dow : -1
    // 어카운트/세그 26년·25년·Δ 값 (선택 지표 1종) — occ = 객실수
    const triple = (cy: Cell, ly: Cell) => {
      let v26: number | null, v25: number | null, dRaw: number, dPresent: boolean, isZeroD: boolean
      if (barBasis === 'occ') {
        v26 = cy.n === 0 ? null : cy.n
        v25 = ly.n === 0 ? null : ly.n
        dRaw = cy.n - ly.n
        dPresent = !(cy.n === 0 && ly.n === 0)
        isZeroD = dRaw === 0
      } else if (barBasis === 'adr') {
        v26 = cy.n === 0 ? null : scaleUnit(cy.rev / cy.n, adrUnit)
        v25 = ly.n === 0 ? null : scaleUnit(ly.rev / ly.n, adrUnit)
        dRaw = scaleUnit((cy.n > 0 ? cy.rev / cy.n : 0) - (ly.n > 0 ? ly.rev / ly.n : 0), adrUnit)
        dPresent = (cy.n > 0 || cy.rev > 0) && (ly.n > 0 || ly.rev > 0)
        isZeroD = dRaw === 0
      } else {
        v26 = cy.rev === 0 ? null : scaleUnit(cy.rev, revUnit)
        v25 = ly.rev === 0 ? null : scaleUnit(ly.rev, revUnit)
        dRaw = scaleUnit(cy.rev - ly.rev, revUnit)
        dPresent = (cy.n > 0 || cy.rev > 0) && (ly.n > 0 || ly.rev > 0)
        isZeroD = dRaw === 0
      }
      return { v26, v25, dRaw, dPresent, isZeroD }
    }
    const triCells = (cy: Cell, ly: Cell, tier: 'acct' | 'seg' | 'total', base: React.CSSProperties, firstStart: React.CSSProperties) => {
      const { v26, v25, dRaw, dPresent, isZeroD } = triple(cy, ly)
      const c26 = tier === 'acct' ? '#e8e8e8' : tier === 'seg' ? '#bbb' : '#fff'
      const c25 = tier === 'acct' ? '#888' : tier === 'seg' ? '#777' : '#aaa'
      const up = tier === 'seg' ? '#3d9d7c' : MINT
      const down = tier === 'seg' ? '#b04745' : RED
      const size = tier === 'seg' ? 12 : 13
      const t26 = v26 === null ? '—' : fmt(v26)
      const t25 = v25 === null ? '—' : fmt(v25)
      const dText = !dPresent ? '—' : isZeroD ? '0' : `${dRaw > 0 ? '+' : '−'}${fmt(Math.abs(dRaw))}`
      const dCol = !dPresent ? '#3f3f3f' : isZeroD ? '#555' : dRaw > 0 ? up : down
      const cs = (color: string): React.CSSProperties => ({ ...base, textAlign: 'right', whiteSpace: 'nowrap', fontSize: size, color })
      return (
        <>
          <td style={{ ...cs(v26 === null ? '#3f3f3f' : c26), ...firstStart }}>{t26}</td>
          <td style={cs(v25 === null ? '#3f3f3f' : c25)}>{t25}</td>
          <td style={cs(dCol)}>{dText}</td>
        </>
      )
    }
    return (
      <>
        {acctControlsRow()}
        <div style={card}>
          <div style={leftBar} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              <colgroup>
                <col style={{ width: '12%' }} />
                {selNames.map(nm => <Fragment key={nm}><col style={{ width: `${acctColW}%` }} /><col style={{ width: `${acctColW}%` }} /><col style={{ width: `${acctColW}%` }} /></Fragment>)}
                <col style={{ width: `${segColW}%` }} /><col style={{ width: `${segColW}%` }} /><col style={{ width: `${segColW}%` }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }} />
                  {selNames.map(nm => <th key={nm} colSpan={3} onClick={() => setDowCardAcct(nm)} style={{ fontSize: 13, textAlign: 'center', paddingBottom: 3, color: activeCardAcct === nm ? MINT : '#ccc', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', ...groupStart }}>{nm}</th>)}
                  <th colSpan={3} onClick={() => setDowCardAcct(null)} style={{ fontSize: 13, textAlign: 'center', paddingBottom: 3, color: activeCardAcct === null ? MINT : '#7a7a7a', fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', ...purpleStart }}>세그 전체</th>
                </tr>
                <tr>
                  <th style={{ fontSize: 12, color: '#3a3a3a', textAlign: 'left', padding: '0 5px 7px', fontWeight: 400 }}>일수 · 객실</th>
                  {selNames.map(nm => (
                    <Fragment key={nm}>
                      <th style={{ fontSize: 11, textAlign: 'right', padding: '0 3px 7px', color: '#2f6b57', fontWeight: 400, whiteSpace: 'nowrap', ...groupStart }}>26년</th>
                      <th style={{ fontSize: 11, textAlign: 'right', padding: '0 3px 7px', color: '#7a6030', fontWeight: 400, whiteSpace: 'nowrap' }}>25년</th>
                      <th style={{ fontSize: 11, textAlign: 'right', padding: '0 3px 7px', color: '#6a6a6a', fontWeight: 400, whiteSpace: 'nowrap' }}>Δ</th>
                    </Fragment>
                  ))}
                  <th style={{ fontSize: 11, textAlign: 'right', padding: '0 3px 7px', color: '#2f6b57', fontWeight: 400, whiteSpace: 'nowrap', ...purpleStart }}>26년</th>
                  <th style={{ fontSize: 11, textAlign: 'right', padding: '0 3px 7px', color: '#7a6030', fontWeight: 400, whiteSpace: 'nowrap' }}>25년</th>
                  <th style={{ fontSize: 11, textAlign: 'right', padding: '0 3px 7px', color: '#6a6a6a', fontWeight: 400, whiteSpace: 'nowrap' }}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {DOWS.map(dow => {
                  const dcCy = agg.dayCount.cy[dow] ?? 0, dcLy = agg.dayCount[lyBasis][dow] ?? 0
                  const dcColor = dcCy === dcLy ? '#4a4a4a' : dcCy > dcLy ? MINT : RED
                  const base: React.CSSProperties = { padding: '0 5px', height: 36, borderBottom: '0.5px solid #141414' }
                  return (
                    <tr key={dow}>
                      <td style={{ ...base, textAlign: 'left' }}>
                        <span style={{ fontSize: 16, color: dowColor(dow) }}>{DOW_NAME[dow]}</span>
                        <span style={{ fontSize: 14, marginLeft: 12, color: dcColor }}>{dcCy}일/{dcLy}일</span>
                      </td>
                      {selNames.map(nm => <Fragment key={nm}>{triCells(acctCell(nm, 'cy', dow), acctCell(nm, lyBasis, dow), 'acct', base, groupStart)}</Fragment>)}
                      {triCells(segCell(selCodes, 'cy', dow), segCell(selCodes, lyBasis, dow), 'seg', base, purpleStart)}
                    </tr>
                  )
                })}
                {/* 합계 */}
                {(() => {
                  const base: React.CSSProperties = { padding: '0 5px', height: 38, borderTop: '1px solid rgba(0,229,160,0.35)' }
                  return (
                    <tr>
                      <td style={{ ...base, textAlign: 'left' }}>
                        <span style={{ fontSize: 16, color: '#fff' }}>합계</span>
                        <span style={{ fontSize: 14, marginLeft: 12, color: '#4a4a4a' }}>{agg.monthDays.cy}일/{agg.monthDays[lyBasis]}일</span>
                      </td>
                      {selNames.map(nm => <Fragment key={nm}>{triCells(acctCellSum(nm, 'cy'), acctCellSum(nm, lyBasis), 'total', base, groupStart)}</Fragment>)}
                      {triCells(segCellSum(selCodes, 'cy'), segCellSum(selCodes, lyBasis), 'total', base, purpleStart)}
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
          {unitFooter(<div />)}
        </div>
        {/* ── 하단: 요일별 구성 카드 7개 (객실수 고정) ── */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: MINT }}>요일별 구성</span>
              <span style={{ fontSize: 11, color: '#4a4a4a' }}>{activeCardAcct ?? '세그 전체'}</span>
            </div>
            <span style={{ fontSize: 10, color: '#3a3a3a' }}>표의 어카운트명을 클릭하면 해당 어카운트로 전환</span>
          </div>
          <div style={{ fontSize: 10, color: '#4a4a4a', marginBottom: 12 }}>비중 = 월 전체 객실수 중 그 요일이 차지하는 몫 · 전년비 = 작년 같은 달의 비중과 비교</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {cardData.map(d => {
              const dowCol = d.dow === 6 ? MINT : d.dow === 7 ? RED : '#999'
              const empty = cardTotCy <= 0
              const noPrev = d.yoy === null
              const up = d.yoy !== null && d.yoy >= 0
              const isTop = d.dow === cardTopDow
              const barColor = noPrev ? '#2a2a2a' : up ? MINT : RED
              return (
                <div key={d.dow} style={{ flex: 1, background: '#0d0d0d', border: isTop ? '0.5px solid rgba(0,229,160,0.28)' : '0.5px solid #1c1c1c', borderRadius: 10, padding: '11px 11px 10px' }}>
                  <div style={{ textAlign: 'center', fontSize: 12, marginBottom: 7, color: dowCol }}>{DOW_NAME[d.dow]}</div>
                  <div style={{ textAlign: 'center', marginBottom: 9 }}>
                    {empty ? <span style={{ fontSize: 23, fontWeight: 500, color: '#3f3f3f' }}>—</span> : (
                      <>
                        <span style={{ fontSize: 23, fontWeight: 500, letterSpacing: '-0.5px', color: isTop ? MINT : '#e8e8e8' }}>{d.share.toFixed(1)}</span>
                        <span style={{ fontSize: 12, color: isTop ? '#2f6b57' : '#666', marginLeft: 1 }}>%</span>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: '#4a4a4a' }}>객실</span>
                    <span style={{ fontSize: 12, color: '#ccc' }}>{empty ? '—' : (<>{d.cyN.toLocaleString()}<span style={{ fontSize: 9, color: '#666', marginLeft: 1 }}>실</span></>)}</span>
                  </div>
                  <div style={{ height: 5, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden', marginBottom: 7 }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${empty ? 0 : d.share}%`, background: barColor }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 10, color: '#4a4a4a' }}>전년비</span>
                    <span style={{ fontSize: 11, color: empty || noPrev ? '#4a4a4a' : up ? MINT : RED }}>
                      {empty || noPrev ? '—' : (<>{up ? '▲' : '▼'}{Math.abs(d.yoy!).toFixed(1)}<span style={{ fontSize: 9 }}>%p</span></>)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  // ─── 렌더 ──────────────────────────────────────────────────────────────────────
  const tabItem = (t: Tab, label: string) => (
    <span key={t} onClick={() => setTab(t)} style={{
      fontSize: 12, padding: '8px 14px', cursor: 'pointer',
      ...(tab === t ? { color: MINT, borderBottom: `2px solid ${MINT}`, marginBottom: -1 } : { color: '#777' }),
    }}>{label}</span>
  )
  const METRIC_ICON = { occ: Percent, adr: Tag, rev: Coins } as const
  const metricBtn = (v: 'occ' | 'adr' | 'rev', label: string) => {
    const Icon = v === 'occ' && (tab === 'seg' || tab === 'acct') ? BedDouble : METRIC_ICON[v]
    return (
      <span key={v} onClick={() => setBarBasis(v)} style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 11, padding: '3px 9px', borderRadius: 4, cursor: 'pointer',
        ...(barBasis === v
          ? { background: 'rgba(0,229,160,0.14)', color: MINT }
          : { color: '#777' }),
      }}><Icon size={11} />{label}</span>
    )
  }

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={handlePrevMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 29, color: MINT, lineHeight: 1 }}>‹</span>
            <span style={{ fontSize: 9, color: MINT, letterSpacing: '0.03em' }}>이전</span>
          </button>
          <span style={{
            fontSize: 19, fontWeight: 500, color: '#fff', letterSpacing: '0.04em',
            transition: 'opacity 0.2s ease, transform 0.35s ease',
            opacity: titleShifting ? 0.5 : 1,
            transform: titleShifting ? 'translateX(4px)' : 'translateX(0)',
          }}>
            요일별 실적_
            <span style={{ color: MINT }}>{pad(m1)}월</span>
            <span style={{ fontSize: 12, color: '#888', marginLeft: 5 }}>{String(selectedYear).slice(-2)}년</span>
          </span>
          <button onClick={handleNextMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 29, color: MINT, lineHeight: 1 }}>›</span>
            <span style={{ fontSize: 9, color: MINT, letterSpacing: '0.03em' }}>다음</span>
          </button>
        </div>
      </div>

      {/* 탭 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid #1c1c1c', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {tabItem('dow', '요일별 실적')}{tabItem('seg', '세그먼트 실적')}{tabItem('acct', '어카운트')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 6 }}>
          <BarChart3 size={12} color="#3a3a3a" />
          <div style={{ display: 'flex', background: '#0c0c0c', border: '0.5px solid #232323', borderRadius: 6, padding: 2 }}>
            {metricBtn('occ', (tab === 'seg' || tab === 'acct') ? '객실' : '점유율')}{metricBtn('adr', '객단가')}{metricBtn('rev', '매출')}
          </div>
        </div>
      </div>

      {isLoading && rpcRows.length === 0 ? (
        <div className="animate-pulse" style={{ height: 420, background: 'var(--color-bg-tertiary)', borderRadius: 12 }} />
      ) : (
        tab === 'dow' ? renderDowTab() : tab === 'seg' ? renderSegTab() : renderAcctTab()
      )}
    </div>
  )
}

// ─── 단위 선택 행 (StartEndPage 패턴) ───────────────────────────────────────────────
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
