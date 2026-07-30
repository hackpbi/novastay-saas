'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'

// ─── 타입 ────────────────────────────────────────────────────────────────────────
type Dim = 'segment' | 'country' | 'account'
type SumRow = { year_type: string; dim_key: string; alpha2: string | null; resv: number; rooms: number; room_nights: number; avg_lead: number | null; max_lead: number | null; adr: number | null }
type BktRow = { year_type: string; dim_key: string; bucket_no: number; bucket_min: number; bucket_max: number | null; resv: number; room_nights: number; adr: number | null }
type Sum = { resv: number; rn: number; rooms: number; avgLead: number | null; max: number | null }
type BucketDef = { no: number; min: number; max: number | null; label: string }
type DRow = { name: string; alpha2: string | null; level: 'main' | 'mid' | 'sub' | 'flat'; bg: string | null; font: string | null; isBold: boolean; cy: Sum; ly: Sum; cyBk: Record<number, number>; lyBk: Record<number, number>; cyBkResv: Record<number, number>; lyBkResv: Record<number, number>; cyAdr: Record<number, number | null>; lyAdr: Record<number, number | null> }

// ─── 상수 (KST — getUTC 금지) ──────────────────────────────────────────────────────
const MINT = '#00E5A0'
const RED  = '#E24B4A'
const pad = (n: number) => String(n).padStart(2, '0')
const OV = 'inset 0 0 0 999px rgba(0,229,160,0.045)'
const OV_B = 'inset 0 0 0 999px rgba(91,141,239,0.05)'
const CO = ['#00E5A0', '#0FB894', '#1C8A88', '#2A5D7C', '#5B8DEF']
const bktColor = (i: number) => CO[Math.min(i, CO.length - 1)]

// ─── 리드타임 그룹 막대 미니차트 레이아웃 (px 고정 — 막대·숫자는 HTML, 화살표만 SVG) ────
const BAR_AREA_H = 30              // 막대 영역 높이
const BAR_W      = 26             // 막대 하나의 폭
const BAR_GAP    = 24             // LY·CY 막대 사이 간격 (화살표 공간)
const ROW_H      = 62             // 행 전체 높이
const FONT       = 11             // 모든 숫자 폰트 크기
const BAR_MIN_H  = 2             // 0% 초과일 때 최소 막대 높이
const LY_PURPLE  = 'rgba(167,139,250,0.5)'   // 전년(LY) 막대 — 전역 퍼플 계열
const MIN_RESV_FOR_HIGHLIGHT = 10   // 최다 구간 민트 강조 최소 예약건수
const ARROW_FLAT_PP = 0.5           // ±이 값 이내면 회색 수평선(화살촉 없음)

// 유형 배지 — avg_lead 기준. 호텔 특성에 따라 조정될 임계값이므로 상수로 분리
const LEAD_BADGE = [
  { max: 14,       label: '임박', bg: 'rgba(226,75,74,0.14)',  fg: '#F09595' },
  { max: 45,       label: '중기', bg: 'rgba(91,141,239,0.16)', fg: '#85B7EB' },
  { max: Infinity, label: '장기', bg: 'rgba(60,52,137,0.30)',  fg: '#AFA9EC' },
]

// 국적 탭 — alpha-2 → 국기 이미지 URL (Windows 이모지 미지원으로 flagcdn 사용)
const flagUrl = (a2?: string | null) =>
  a2 && a2.length === 2 ? `https://flagcdn.com/16x12/${a2.toLowerCase()}.png` : ''

function aggSum(map: Record<string, SumRow>, codes: string[]): Sum {
  let resv = 0, rn = 0, rooms = 0, mx: number | null = null
  let leadNum = 0, leadDen = 0
  for (const c of codes) {
    const r = map[c]; if (!r) continue
    resv += r.resv; rn += r.room_nights; rooms += r.rooms
    if (r.max_lead != null) mx = mx == null ? r.max_lead : Math.max(mx, r.max_lead)
    if (r.avg_lead != null) { leadNum += r.avg_lead * r.resv; leadDen += r.resv }
  }
  return { resv, rn, rooms, avgLead: leadDen > 0 ? leadNum / leadDen : null, max: mx }
}
function aggBkt(bmap: Record<string, Record<number, number>>, codes: string[]): Record<number, number> {
  const out: Record<number, number> = {}
  for (const c of codes) {
    const m = bmap[c]; if (!m) continue
    for (const k in m) out[k] = (out[k] ?? 0) + m[k]
  }
  return out
}
// 구간별 ADR — 룸나잇 가중 (cy)
function aggBktAdr(bmap: Record<string, Record<number, { rn: number; adr: number | null }>>, bkts: BucketDef[], codes: string[]): Record<number, number | null> {
  const num: Record<number, number> = {}, den: Record<number, number> = {}
  for (const c of codes) {
    const m = bmap[c]; if (!m) continue
    for (const k in m) { const e = m[k]; if (e.adr != null && e.rn > 0) { num[k] = (num[k] ?? 0) + e.adr * e.rn; den[k] = (den[k] ?? 0) + e.rn } }
  }
  const out: Record<number, number | null> = {}
  for (const b of bkts) out[b.no] = (den[b.no] ?? 0) > 0 ? num[b.no] / den[b.no] : null
  return out
}
// 도넛 조각(환형 섹터) path
function arc(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number): string {
  const px = (r: number, a: number) => cx + r * Math.cos(a)
  const py = (r: number, a: number) => cy + r * Math.sin(a)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M ${px(rO, a0)} ${py(rO, a0)} A ${rO} ${rO} 0 ${large} 1 ${px(rO, a1)} ${py(rO, a1)} L ${px(rI, a1)} ${py(rI, a1)} A ${rI} ${rI} 0 ${large} 0 ${px(rI, a0)} ${py(rI, a0)} Z`
}

// ─── 페이지 ─────────────────────────────────────────────────────────────────────
export default function LeadTimePage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate } = useDateContext()
  const { data: schema } = useMarketSchema()

  const otbBase = otbDate ? new Date(otbDate + 'T00:00:00') : new Date()
  const [selYear, setSelYear]   = useState(otbBase.getFullYear())
  const [selMonth, setSelMonth] = useState(otbBase.getMonth())
  useEffect(() => {
    const b = otbDate ? new Date(otbDate + 'T00:00:00') : new Date()
    setSelYear(b.getFullYear()); setSelMonth(b.getMonth())
  }, [otbDate])
  const prevMonth = () => { if (selMonth === 0) { setSelYear(y => y - 1); setSelMonth(11) } else setSelMonth(m => m - 1) }
  const nextMonth = () => { if (selMonth === 11) { setSelYear(y => y + 1); setSelMonth(0) } else setSelMonth(m => m + 1) }

  const m1 = selMonth + 1
  const fromDate = `${selYear}-${pad(m1)}-01`
  const toDate   = `${selYear}-${pad(m1)}-${pad(new Date(selYear, m1, 0).getDate())}`

  const [dim, setDim] = useState<Dim>('segment')
  const [applied, setApplied] = useState<string[]>([])
  const [draft, setDraft] = useState<string[]>([])
  const [segFilterOpen, setSegFilterOpen] = useState(false)
  const [appliedAcc, setAppliedAcc] = useState<string[]>([])
  const [draftAcc, setDraftAcc] = useState<string[]>([])
  const [accFilterOpen, setAccFilterOpen] = useState(false)
  const [accSearch, setAccSearch] = useState('')
  const [selName, setSelName] = useState<string | null>(null)
  const [hoverKey, setHoverKey] = useState<React.Key | null>(null)

  const segKey = dim === 'segment' ? null : applied.slice().sort().join(',')
  const p_segments = dim === 'segment' || applied.length === 0 ? null : applied
  // 어카운트 전체 목록 (필터 미적용) — get_lead_summary(p_dim:'account') 재사용
  const { data: accountList = [] } = useQuery<string[]>({
    queryKey: ['lead-account-list', hotelId, otbDate, fromDate, toDate, segKey],
    enabled: !!hotelId && !!otbDate,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_lead_summary', {
        p_hotel_id: hotelId, p_update_date: otbDate, p_from: fromDate, p_to: toDate, p_dim: 'account', p_segments, p_accounts: null,
      })
      if (error) throw error
      return [...new Set(((data ?? []) as any[]).filter(r => r.year_type === 'cy').map(r => r.dim_key as string))].sort((a, b) => a.localeCompare(b, 'ko'))
    },
  })
  const accKey = dim === 'segment' || appliedAcc.length === 0 || appliedAcc.length === accountList.length ? null : appliedAcc.slice().sort().join(',')
  const p_accounts = dim === 'segment' || appliedAcc.length === 0 || appliedAcc.length === accountList.length ? null : appliedAcc

  // ─── RPC 2개 ────────────────────────────────────────────────────────────────────
  const { data: sumRows = [], isLoading: sumLoading } = useQuery<SumRow[]>({
    queryKey: ['lead-summary', hotelId, otbDate, fromDate, toDate, dim, segKey, accKey],
    enabled: !!hotelId && !!otbDate,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_lead_summary', {
        p_hotel_id: hotelId, p_update_date: otbDate, p_from: fromDate, p_to: toDate, p_dim: dim, p_segments, p_accounts,
      })
      if (error) throw error
      return ((data ?? []) as any[]).map(r => ({
        year_type: r.year_type as string, dim_key: r.dim_key as string,
        alpha2: r.alpha2 == null ? null : String(r.alpha2),
        resv: Number(r.resv) || 0, rooms: Number(r.rooms) || 0, room_nights: Number(r.room_nights) || 0,
        avg_lead: r.avg_lead == null ? null : Number(r.avg_lead),
        max_lead: r.max_lead == null ? null : Number(r.max_lead),
        adr: r.adr == null ? null : Number(r.adr),
      })) as SumRow[]
    },
  })
  const { data: bktRows = [], isLoading: bktLoading } = useQuery<BktRow[]>({
    queryKey: ['lead-buckets', hotelId, otbDate, fromDate, toDate, dim, segKey, accKey],
    enabled: !!hotelId && !!otbDate,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_lead_buckets', {
        p_hotel_id: hotelId, p_update_date: otbDate, p_from: fromDate, p_to: toDate, p_dim: dim, p_segments, p_accounts,
      })
      if (error) throw error
      return ((data ?? []) as any[]).map(r => ({
        year_type: r.year_type as string, dim_key: r.dim_key as string,
        bucket_no: Number(r.bucket_no) || 0,
        bucket_min: Number(r.bucket_min) || 0,
        bucket_max: r.bucket_max == null ? null : Number(r.bucket_max),
        resv: Number(r.resv) || 0, room_nights: Number(r.room_nights) || 0,
        adr: r.adr == null ? null : Number(r.adr),
      })) as BktRow[]
    },
  })
  const isLoading = sumLoading || bktLoading

  // 맵 구성
  const sumBy = useMemo(() => {
    const cy: Record<string, SumRow> = {}, ly: Record<string, SumRow> = {}
    for (const r of sumRows) { if (r.year_type === 'cy') cy[r.dim_key] = r; else if (r.year_type === 'ly') ly[r.dim_key] = r }
    return { cy, ly }
  }, [sumRows])
  const bktBy = useMemo(() => {
    const cy: Record<string, Record<number, number>> = {}, ly: Record<string, Record<number, number>> = {}
    for (const r of bktRows) {
      const t = r.year_type === 'cy' ? cy : r.year_type === 'ly' ? ly : null
      if (!t) continue
      ;(t[r.dim_key] ??= {})[r.bucket_no] = (t[r.dim_key][r.bucket_no] ?? 0) + r.room_nights
    }
    return { cy, ly }
  }, [bktRows])
  // 구간별 예약 건수 (resv) — 패널 예약 컬럼용
  const bktResvBy = useMemo(() => {
    const cy: Record<string, Record<number, number>> = {}, ly: Record<string, Record<number, number>> = {}
    for (const r of bktRows) {
      const t = r.year_type === 'cy' ? cy : r.year_type === 'ly' ? ly : null
      if (!t) continue
      ;(t[r.dim_key] ??= {})[r.bucket_no] = (t[r.dim_key][r.bucket_no] ?? 0) + r.resv
    }
    return { cy, ly }
  }, [bktRows])
  // 구간별 룸나잇·ADR (cy) — 패널 ADR 가중 계산용
  const bktAdrCy = useMemo(() => {
    const cy: Record<string, Record<number, { rn: number; adr: number | null }>> = {}
    for (const r of bktRows) { if (r.year_type !== 'cy') continue; (cy[r.dim_key] ??= {})[r.bucket_no] = { rn: r.room_nights, adr: r.adr } }
    return cy
  }, [bktRows])
  const bktAdrLy = useMemo(() => {
    const ly: Record<string, Record<number, { rn: number; adr: number | null }>> = {}
    for (const r of bktRows) { if (r.year_type !== 'ly') continue; (ly[r.dim_key] ??= {})[r.bucket_no] = { rn: r.room_nights, adr: r.adr } }
    return ly
  }, [bktRows])
  // 버킷 정의 (반환된 bucket_no 만큼 동적)
  const buckets = useMemo<BucketDef[]>(() => {
    const byNo: Record<number, { min: number; max: number | null }> = {}
    for (const r of bktRows) if (!(r.bucket_no in byNo)) byNo[r.bucket_no] = { min: r.bucket_min, max: r.bucket_max }
    return Object.keys(byNo).map(Number).sort((a, b) => a - b).map(no => {
      const { min, max } = byNo[no]
      const label =
        max === null                 ? `${min}일+`
        : min === 0 && max === 0      ? '당일'
        : min === max                 ? `${min}일`
        : `${min}-${max}일`
      return { no, min, max, label }
    })
  }, [bktRows])

  // ─── 세그먼트 필터 트리 ──────────────────────────────────────────────────────────
  const segTree = useMemo(() => {
    const tops = schema.filter(s => s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
    const groups: { key: string; name: string; codes: string[]; children: { name: string; codes: string[] }[] }[] = []
    const allCodes: string[] = []
    for (const top of tops) {
      if (top.segmentation.includes('HOU')) continue
      if (top.level === 'main') {
        const kids = schema.filter(c => c.parent_id === top.id && !c.segmentation.includes('HOU')).sort((a, b) => a.order_index - b.order_index)
        const children = kids.map(k => ({ name: k.name, codes: k.segmentation }))
        const codes = kids.flatMap(k => k.segmentation)
        groups.push({ key: top.id, name: top.name, codes, children })
        allCodes.push(...codes)
      } else {
        groups.push({ key: top.id, name: top.name, codes: top.segmentation, children: [] })
        allCodes.push(...top.segmentation)
      }
    }
    return { groups, allCodes }
  }, [schema])
  const segSeeded = useRef(false)
  useEffect(() => { segSeeded.current = false }, [hotelId])
  useEffect(() => {
    if (segSeeded.current || segTree.allCodes.length === 0) return
    setApplied(segTree.allCodes); setDraft(segTree.allCodes); segSeeded.current = true
  }, [segTree])
  useEffect(() => {
    if (!segFilterOpen) return
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.seg-filter-wrap')) setSegFilterOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [segFilterOpen])
  useEffect(() => {
    if (!accFilterOpen) { setAccSearch(''); return }
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.acc-filter-wrap')) setAccFilterOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [accFilterOpen])
  const toggleCodes = (codes: string[]) => setDraft(prev =>
    codes.every(c => prev.includes(c)) ? prev.filter(c => !codes.includes(c)) : [...new Set([...prev, ...codes])])
  const toggleAcc = (name: string) => setDraftAcc(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name])
  // 세그먼트 변경 등으로 어카운트 목록이 바뀌면 적용값을 교집합으로 정리 (비면 전체)
  useEffect(() => {
    if (accountList.length === 0) return
    setAppliedAcc(prev => {
      const next = prev.filter(a => accountList.includes(a))
      return next.length === 0 ? accountList : next
    })
  }, [accountList])

  // ─── 표시 행 ────────────────────────────────────────────────────────────────────
  const displayRows = useMemo<DRow[]>(() => {
    const make = (name: string, level: DRow['level'], node: MarketSchemaRow | null, codes: string[]): DRow => ({
      name, level,
      alpha2: sumBy.cy[codes[0]]?.alpha2 ?? sumBy.ly[codes[0]]?.alpha2 ?? null,
      bg: node ? node.bg_dark_color : (level === 'flat' ? '#15211D14' : null),
      font: node ? node.font_dark_color : null,
      isBold: node ? node.is_bold : true,
      cy: aggSum(sumBy.cy, codes), ly: aggSum(sumBy.ly, codes),
      cyBk: aggBkt(bktBy.cy, codes), lyBk: aggBkt(bktBy.ly, codes),
      cyBkResv: aggBkt(bktResvBy.cy, codes), lyBkResv: aggBkt(bktResvBy.ly, codes),
      cyAdr: aggBktAdr(bktAdrCy, buckets, codes),
      lyAdr: aggBktAdr(bktAdrLy, buckets, codes),
    })
    if (dim === 'segment') {
      const tops = schema.filter(s => s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
      const out: DRow[] = []
      for (const top of tops) {
        if (top.segmentation.includes('HOU')) continue
        if (top.level === 'main') {
          const kids = schema.filter(c => c.parent_id === top.id && !c.segmentation.includes('HOU')).sort((a, b) => a.order_index - b.order_index)
          const mainCodes = kids.length ? kids.flatMap(k => k.segmentation) : top.segmentation
          out.push(make(top.name, 'main', top, mainCodes))
          for (const k of kids) out.push(make(k.name, 'sub', k, k.segmentation))
        } else {
          out.push(make(top.name, top.level === 'mid' ? 'mid' : 'sub', top, top.segmentation))
        }
      }
      return out
    }
    const keys = [...new Set(sumRows.filter(r => r.year_type === 'cy' || r.year_type === 'ly').map(r => r.dim_key))]
    const scored = keys.map(k => ({ key: k, rn: sumBy.cy[k]?.room_nights ?? 0, lyRn: sumBy.ly[k]?.room_nights ?? 0 })).sort((a, b) => b.rn - a.rn || b.lyRn - a.lyRn)
    if (dim === 'country') return scored.map(s => make(s.key, 'flat', null, [s.key]))
    const top15 = scored.slice(0, 15)
    const restKeys = scored.slice(15).map(s => s.key)
    const out = top15.map(s => make(s.key, 'flat', null, [s.key]))
    if (restKeys.length) out.push(make('기타', 'flat', null, restKeys))
    return out
  }, [dim, sumRows, schema, sumBy, bktBy, bktResvBy, bktAdrCy, bktAdrLy, buckets])

  // ─── 합계 (부모 main 제외) ───────────────────────────────────────────────────────
  const totalRow = useMemo<DRow>(() => {
    let resv = 0, rn = 0, rooms = 0, mx: number | null = null
    let lresv = 0, lrn = 0, lrooms = 0
    let leadNum = 0, leadDen = 0, lLeadNum = 0, lLeadDen = 0
    const cyBk: Record<number, number> = {}, lyBk: Record<number, number> = {}
    const cyBkResv: Record<number, number> = {}, lyBkResv: Record<number, number> = {}
    for (const r of displayRows) {
      if (r.level === 'main') continue
      resv += r.cy.resv; rn += r.cy.rn; rooms += r.cy.rooms
      if (r.cy.max != null) mx = mx == null ? r.cy.max : Math.max(mx, r.cy.max)
      if (r.cy.avgLead != null) { leadNum += r.cy.avgLead * r.cy.resv; leadDen += r.cy.resv }
      lresv += r.ly.resv; lrn += r.ly.rn; lrooms += r.ly.rooms
      if (r.ly.avgLead != null) { lLeadNum += r.ly.avgLead * r.ly.resv; lLeadDen += r.ly.resv }
      for (const b of buckets) { cyBk[b.no] = (cyBk[b.no] ?? 0) + (r.cyBk[b.no] ?? 0); lyBk[b.no] = (lyBk[b.no] ?? 0) + (r.lyBk[b.no] ?? 0); cyBkResv[b.no] = (cyBkResv[b.no] ?? 0) + (r.cyBkResv[b.no] ?? 0); lyBkResv[b.no] = (lyBkResv[b.no] ?? 0) + (r.lyBkResv[b.no] ?? 0) }
    }
    return {
      name: '합계', alpha2: null, level: 'flat', bg: null, font: null, isBold: true,
      cy: { resv, rn, rooms, avgLead: leadDen > 0 ? leadNum / leadDen : null, max: mx },
      ly: { resv: lresv, rn: lrn, rooms: lrooms, avgLead: lLeadDen > 0 ? lLeadNum / lLeadDen : null, max: null },
      cyBk, lyBk, cyBkResv, lyBkResv,
      cyAdr: aggBktAdr(bktAdrCy, buckets, Object.keys(bktAdrCy)),
      lyAdr: aggBktAdr(bktAdrLy, buckets, Object.keys(bktAdrLy)),
    }
  }, [displayRows, buckets, bktAdrCy, bktAdrLy])

  // ─── 미니차트 스케일 — 화면 전체(모든 행 × 버킷 × cy/ly) 최대 비중으로 통일 (행별 정규화 아님) ─
  const maxPct = useMemo(() => {
    let m = 1
    for (const r of [...displayRows, totalRow]) {
      const cyTot = buckets.reduce((s, b) => s + (r.cyBkResv[b.no] ?? 0), 0)
      const lyTot = buckets.reduce((s, b) => s + (r.lyBkResv[b.no] ?? 0), 0)
      for (const b of buckets) {
        const cp = cyTot > 0 ? (r.cyBkResv[b.no] ?? 0) / cyTot * 100 : 0
        const lp = lyTot > 0 ? (r.lyBkResv[b.no] ?? 0) / lyTot * 100 : 0
        if (cp > m) m = cp
        if (lp > m) m = lp
      }
    }
    return m
  }, [displayRows, totalRow, buckets])

  // ─── 도넛 ───────────────────────────────────────────────────────────────────────
  const renderDonut = (bk: Record<number, number>, isCy: boolean) => {
    const total = buckets.reduce((s, b) => s + (bk[b.no] ?? 0), 0)
    if (total <= 0) return <div style={{ width: 190, height: 155, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#333', opacity: isCy ? 1 : 0.45 }}>없음</div>
    const cx = 97, cy = 70, rO = 44, rI = 28, gap = 0.014
    let a = -Math.PI / 2
    const segs: { d: string; color: string }[] = []
    const labels: { color: string; label: string; pct: number; right: boolean; sx: number; sy: number; y: number }[] = []
    buckets.forEach((b, i) => {
      const v = bk[b.no] ?? 0
      if (v <= 0) return
      const frac = v / total
      segs.push({ d: arc(cx, cy, rO, rI, a + gap / 2, a + frac * 2 * Math.PI - gap / 2), color: bktColor(i) })
      const pct = frac * 100
      if (pct >= 2) {
        const mid = a + frac * Math.PI
        labels.push({ color: bktColor(i), label: b.label, pct, right: Math.cos(mid) >= 0, sx: cx + 46 * Math.cos(mid), sy: cy + 46 * Math.sin(mid), y: cy + 49 * Math.sin(mid) })
      }
      a += frac * 2 * Math.PI
    })
    const leftLabels = labels.filter(l => !l.right)
    const rightLabels = labels.filter(l => l.right)
    ;[leftLabels, rightLabels].forEach(arr => {
      arr.sort((x, y) => x.y - y.y)
      for (let i = 1; i < arr.length; i++) if (arr[i].y - arr[i - 1].y < 12) arr[i].y = arr[i - 1].y + 12
    })
    return (
      <svg viewBox="0 0 194 158" width={190} height={155} style={{ opacity: isCy ? 1 : 0.45 }}>
        {segs.map((s, i) => <path key={i} d={s.d} fill={s.color} />)}
        {[...leftLabels, ...rightLabels].map((l, i) => {
          const lineEnd = l.right ? cx + 50 : cx - 50
          const tx = l.right ? cx + 54 : cx - 54
          return (
            <g key={`lb${i}`}>
              <polyline points={`${l.sx},${l.sy} ${lineEnd},${l.y} ${tx},${l.y}`} fill="none" stroke={l.color} strokeWidth={0.9} opacity={isCy ? 0.65 : 0.4} />
              <text x={tx} y={l.y} textAnchor={l.right ? 'start' : 'end'} dominantBaseline="central" fontSize={10}>
                <tspan fill={isCy ? '#d8d8d8' : '#7f7f7f'}>{l.label}</tspan>
                <tspan dx={3} fontWeight={600} fill={isCy ? l.color : '#8f8f8f'}>{l.pct < 1 ? '<1' : Math.round(l.pct)}%</tspan>
              </text>
            </g>
          )
        })}
        <text x={cx} y={72} textAnchor="middle" dominantBaseline="central" fontSize={21} fill="#f2f2f2">{total.toLocaleString()}</text>
        <text x={cx} y={86} textAnchor="middle" dominantBaseline="central" fontSize={9} fill="#6a6a6a">예약</text>
        <text x={cx} y={152} textAnchor="middle" fontSize={12} fontWeight={500} fill={isCy ? MINT : '#8a8a8a'}>{isCy ? "'26년" : "'25년"}</text>
      </svg>
    )
  }

  // ─── 버킷 그룹 막대 미니차트 (막대·숫자 = HTML, 화살표만 px 고정 SVG) ─────────────────
  const renderBucketChart = (r: DRow, rowKey: string) => {
    const cyTot = buckets.reduce((s, b) => s + (r.cyBkResv[b.no] ?? 0), 0)
    const lyTot = buckets.reduce((s, b) => s + (r.lyBkResv[b.no] ?? 0), 0)
    const hasLy = buckets.some(b => (r.lyBkResv[b.no] ?? 0) > 0)
    const canHighlight = cyTot >= MIN_RESV_FOR_HIGHLIGHT   // 표본 적으면 최다 구간 강조 억제
    // 최다 비중(cy) 구간
    let maxBucketNo = -1, maxBucketPct = -1
    for (const b of buckets) {
      const cp = cyTot > 0 ? (r.cyBkResv[b.no] ?? 0) / cyTot * 100 : 0
      if (cp > maxBucketPct) { maxBucketPct = cp; maxBucketNo = b.no }
    }
    // 화면 전체 최대 비중(maxPct) 기준 통일 스케일 (행별 정규화 아님)
    const barH = (pct: number) => pct > 0 ? Math.max((pct / maxPct) * BAR_AREA_H, BAR_MIN_H) : 0
    const cyColor = (no: number, pct: number) =>
      (no === maxBucketNo && canHighlight) ? '#00E5A0' : pct >= 20 ? '#1D9E75' : '#0F6E56'
    // 막대 컬럼 (건수 라벨 위 + 막대 아래)
    const barCol = (resv: number, pct: number, color: string, labelColor: string) => (
      <div style={{ width: BAR_W, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
        <span style={{ fontSize: FONT, lineHeight: 1, color: labelColor, marginBottom: 1 }}>{resv}</span>
        <div style={{ width: BAR_W, height: barH(pct), background: color, borderRadius: '1px 1px 0 0' }} />
      </div>
    )
    const spacer = (w: number) => <div style={{ width: w, flexShrink: 0 }} />
    const pctLabel = (pct: number, color: string) =>
      <span style={{ width: BAR_W, textAlign: 'center', fontSize: FONT, lineHeight: 1, color }}>{Math.round(pct)}%</span>
    return (
      <div style={{ display: 'flex', width: '100%' }} role="img" aria-label={`${r.name} 리드타임 구간별 예약 건수와 비중`}>
        {buckets.map(b => {
          const cyResv = r.cyBkResv[b.no] ?? 0, lyResv = r.lyBkResv[b.no] ?? 0
          const cyPct = cyTot > 0 ? cyResv / cyTot * 100 : 0
          const lyPct = lyTot > 0 ? lyResv / lyTot * 100 : 0
          const empty = cyResv === 0 && lyResv === 0
          const isMax = b.no === maxBucketNo
          const diff  = cyPct - lyPct
          const flat  = Math.abs(diff) <= ARROW_FLAT_PP
          const arrowColor = flat ? '#6b6b6b' : diff > 0 ? '#00E5A0' : '#E24B4A'
          const showArrow  = hasLy && cyPct > 0 && lyPct > 0
          const cyLabelColor = (isMax && canHighlight) ? '#00E5A0' : '#e8e8e8'
          return (
            <div key={b.no} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              {/* 막대 영역 — 기준선(borderBottom)이 버킷을 관통 */}
              <div style={{ height: BAR_AREA_H, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderBottom: '1px solid #3a3a3a' }}>
                {empty ? (
                  <span style={{ fontSize: FONT, color: '#3f3f3f', alignSelf: 'center' }}>-</span>
                ) : !hasLy ? (
                  cyPct > 0 ? barCol(cyResv, cyPct, cyColor(b.no, cyPct), '#8f8f8f') : spacer(BAR_W)
                ) : (
                  <>
                    {lyPct > 0 ? barCol(lyResv, lyPct, LY_PURPLE, '#6b5f96') : spacer(BAR_W)}
                    {showArrow ? (
                      <svg width={BAR_GAP} height={BAR_AREA_H} viewBox={`0 0 ${BAR_GAP} ${BAR_AREA_H}`} style={{ display: 'block', flexShrink: 0 }} aria-hidden="true">
                        <defs>
                          <marker id={`arr-${rowKey}-${b.no}`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L7,4 L0,8 z" fill={arrowColor} /></marker>
                        </defs>
                        <line x1={2} y1={BAR_AREA_H - barH(lyPct)} x2={BAR_GAP - 2} y2={BAR_AREA_H - barH(cyPct)} stroke={arrowColor} strokeWidth={1.5} markerEnd={flat ? undefined : `url(#arr-${rowKey}-${b.no})`} />
                      </svg>
                    ) : spacer(BAR_GAP)}
                    {cyPct > 0 ? barCol(cyResv, cyPct, cyColor(b.no, cyPct), '#8f8f8f') : spacer(BAR_W)}
                  </>
                )}
              </div>
              {/* 비중 행 (기준선 아래) */}
              <div style={{ paddingTop: 3, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                {empty ? null : !hasLy ? (
                  cyPct > 0 ? pctLabel(cyPct, cyLabelColor) : spacer(BAR_W)
                ) : (
                  <>
                    {lyPct > 0 ? pctLabel(lyPct, '#8579b8') : spacer(BAR_W)}
                    {spacer(BAR_GAP)}
                    {cyPct > 0 ? pctLabel(cyPct, cyLabelColor) : spacer(BAR_W)}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── 행 렌더 ───────────────────────────────────────────────────────────────────
  function renderRow(r: DRow, key: React.Key, isTotal = false) {
    const noData = r.cy.resv <= 0 && r.ly.resv <= 0
    const bg = isTotal ? 'rgba(0,229,160,0.07)' : (r.bg ?? 'transparent')
    const dim35 = !isTotal && noData ? 0.35 : 1
    const rowOp = !isTotal && r.cy.resv <= 4 ? 0.55 : 1
    const sel = selName === r.name
    const isHover = hoverKey === key
    const dLead = (r.cy.avgLead != null && r.ly.avgLead != null) ? r.cy.avgLead - r.ly.avgLead : null
    const badge = !isTotal && r.cy.avgLead != null
      ? LEAD_BADGE.find(t => (r.cy.avgLead as number) <= t.max) ?? null
      : null
    const mixDen = totalRow.cy.rn
    const mix = mixDen > 0 ? Math.round(r.cy.rn / mixDen * 100) : null
    return (
      <div key={key} onClick={() => setSelName(prev => prev === r.name ? null : r.name)}
        onMouseEnter={() => setHoverKey(key)} onMouseLeave={() => setHoverKey(null)} style={{
        display: 'flex', alignItems: 'stretch', height: ROW_H, cursor: 'pointer',
        opacity: rowOp, background: bg,
        boxShadow: isHover ? 'inset 0 0 0 999px rgba(0,229,160,0.07)' : undefined,
        transition: 'box-shadow 0.12s ease',
        ...(sel ? { outline: '1px solid rgba(0,229,160,0.5)', outlineOffset: -1 } : {}),
        ...(isTotal ? { borderTop: '1px solid rgba(255,255,255,0.22)' } : { borderBottom: '0.5px solid rgba(255,255,255,0.09)' }),
      }}>
        {/* 구분 */}
        <div style={{
          width: 138, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box',
          paddingLeft: r.level === 'sub' ? 32 : 16, paddingRight: 8, gap: 3, opacity: dim35,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', maxWidth: '100%',
            fontSize: r.level === 'sub' ? 12 : 13, fontWeight: (isTotal ? true : r.isBold) ? 500 : 400,
            color: isTotal ? MINT : r.level === 'sub' ? '#9a9a9a' : r.level === 'flat' ? '#e8e8e8' : (r.font ?? '#e8e8e8'),
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{dim === 'country' && flagUrl(r.alpha2) && <img src={flagUrl(r.alpha2)} alt="" style={{ width: 14, height: 10.5, marginRight: 5, verticalAlign: 'middle', border: '0.5px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />}{r.name}</div>
          {badge && <span style={{ alignSelf: 'flex-start', fontSize: 11, padding: '1px 6px', borderRadius: 3, background: badge.bg, color: badge.fg, whiteSpace: 'nowrap' }}>{badge.label}</span>}
        </div>

        {/* 리드타임 구간별 예약 건수 — 그룹 막대 미니차트 */}
        <div style={{ flex: 7, minWidth: 0, display: 'flex', alignItems: 'center' }}>
          {noData ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#333' }}>데이터 없음</div>
          ) : (
            <div style={{ flex: 1, minWidth: 0 }}>{renderBucketChart(r, String(key))}</div>
          )}
        </div>

        {/* 간격 + 세로 구분선 */}
        <div style={{ width: 10, flexShrink: 0, display: 'flex', justifyContent: 'center', alignSelf: 'stretch' }}>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.14)' }} />
        </div>

        {/* 룸나잇 · Mix · 평균 · 최장 */}
        <div style={{ flex: 3, minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1.2, minWidth: 0, textAlign: 'right', fontSize: 13.5, color: isTotal ? MINT : '#dcdcdc' }}>{r.cy.rn > 0 ? r.cy.rn.toLocaleString() : <span style={{ color: '#3f3f3f' }}>–</span>}</div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 12, color: isTotal ? MINT : '#a8a8a8' }}>{mix != null && r.cy.rn > 0 ? `${mix}%` : <span style={{ color: '#3f3f3f' }}>–</span>}</div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 13, color: isTotal ? MINT : '#e8e8e8' }}>{r.cy.avgLead != null ? r.cy.avgLead.toFixed(1) : <span style={{ color: '#3f3f3f' }}>–</span>}</div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 11, color: dLead == null ? '#3f3f3f' : dLead > 0 ? MINT : dLead < 0 ? RED : '#8a8a8a' }}>
            {dLead == null ? '—' : `${dLead > 0 ? '▲' : dLead < 0 ? '▼' : ''}${Math.abs(dLead).toFixed(1)}`}
          </div>
          <div style={{ flex: 0.9, minWidth: 0, textAlign: 'right', paddingRight: 4, fontSize: 12, color: '#8a8a8a' }}>{r.cy.max != null ? `${r.cy.max}일` : <span style={{ color: '#3f3f3f' }}>–</span>}</div>
        </div>
      </div>
    )
  }

  // ─── 도넛 상세 패널 ─────────────────────────────────────────────────────────────
  const panelRow = selName == null ? null : [...displayRows, totalRow].find(r => r.name === selName) ?? null
  const renderPanel = (r: DRow) => {
    const ctr = buckets.reduce((s, b) => s + (r.cyBkResv[b.no] ?? 0), 0)
    const ltr = buckets.reduce((s, b) => s + (r.lyBkResv[b.no] ?? 0), 0)
    return (
      <div style={{ background: '#101410', border: '1px solid rgba(0,229,160,0.45)', borderLeft: '4px solid #00E5A0', borderRadius: 4, overflow: 'hidden', marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 8px', borderBottom: '1px solid rgba(0,229,160,0.28)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            {dim === 'country' && flagUrl(r.alpha2) && <img src={flagUrl(r.alpha2)} alt="" style={{ width: 14, height: 10.5, marginRight: 6, verticalAlign: 'middle', border: '0.5px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />}
            <span style={{ fontSize: 14, color: '#EAFFF7', fontWeight: 500 }}>{r.name}</span>
            <span style={{ fontSize: 11, color: '#6a6a6a', marginLeft: 6 }}>리드타임 구간별 비중 · 단가</span>
          </div>
          <span onClick={() => setSelName(null)} style={{ fontSize: 16, color: '#6a6a6a', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</span>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '14px 18px 12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* 도넛 '26년 */}
          <div style={{ width: 190, flex: 'none', lineHeight: 0 }}>
            {renderDonut(r.cyBkResv, true)}
          </div>
          {/* 도넛 '25년 */}
          <div style={{ width: 190, flex: 'none', lineHeight: 0 }}>
            {renderDonut(r.lyBkResv, false)}
          </div>
          {/* 표 */}
          <div style={{ flex: 1, minWidth: 0, paddingLeft: 8 }}>
            {/* 헤더 1단 — 연도 */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ width: 10, marginRight: 9, flex: 'none' }} />
              <span style={{ width: 44, flex: 'none' }} />
              <div style={{ flex: 4, textAlign: 'center', fontSize: 10.5, fontWeight: 500, color: MINT }}>{"'26년"}</div>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.09)', margin: '0 7px' }} />
              <div style={{ flex: 3.1, textAlign: 'center', fontSize: 10.5, fontWeight: 500, color: '#8a8a8a' }}>{"'25년"}</div>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.09)', margin: '0 7px' }} />
              <div style={{ flex: 2.9, textAlign: 'center', fontSize: 10.5, fontWeight: 500, color: '#c8c8c8' }}>증감</div>
            </div>
            {/* 헤더 2단 — 예약 · 룸나잇 · 비중 · ADR */}
            <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 4 }}>
              <span style={{ width: 10, marginRight: 9, flex: 'none' }} />
              <span style={{ width: 44, flex: 'none' }} />
              <div style={{ flex: 4, display: 'flex' }}>
                <span style={{ flex: 1.1, textAlign: 'right', fontSize: 9.5, color: '#6a6a6a' }}>예약</span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: 9.5, color: '#5a5a5a' }}>룸나잇</span>
                <span style={{ flex: 0.9, textAlign: 'right', fontSize: 9.5, color: '#5a5a5a' }}>비중</span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: 9.5, color: '#5a5a5a' }}>ADR</span>
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.09)', margin: '0 7px' }} />
              <div style={{ flex: 3.1, display: 'flex' }}>
                <span style={{ flex: 1.1, textAlign: 'right', fontSize: 9.5, color: '#6a6a6a' }}>예약</span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: 9.5, color: '#5a5a5a' }}>룸나잇</span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: 9.5, color: '#5a5a5a' }}>ADR</span>
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.09)', margin: '0 7px' }} />
              <div style={{ flex: 2.9, display: 'flex' }}>
                <span style={{ flex: 1, textAlign: 'right', fontSize: 9.5, color: '#6a6a6a' }}>예약</span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: 9.5, color: '#5a5a5a' }}>룸나잇</span>
                <span style={{ flex: 0.9, textAlign: 'right', fontSize: 9.5, color: '#5a5a5a' }}>비중</span>
              </div>
            </div>
            {/* 본문 */}
            {buckets.map((b, i) => {
              const c = r.cyBk[b.no] ?? 0, l = r.lyBk[b.no] ?? 0
              const cr = r.cyBkResv[b.no] ?? 0, lr = r.lyBkResv[b.no] ?? 0
              const cp = ctr ? cr / ctr * 100 : 0, lp = ltr ? lr / ltr * 100 : 0
              const ca = r.cyAdr[b.no], la = r.lyAdr[b.no]
              const dr = cr - lr
              const dn = c - l
              const dp = cp - lp
              const drColor = dr > 0 ? MINT : dr < 0 ? RED : '#4a4a4a'
              const dnColor = dn > 0 ? MINT : dn < 0 ? RED : '#4a4a4a'
              const dpShow = Math.abs(dp) >= 0.5
              const dpColor = !dpShow ? '#4a4a4a' : dp > 0 ? MINT : RED
              return (
                <div key={b.no} style={{ display: 'flex', alignItems: 'center', padding: '5px 0', ...(i > 0 ? { borderTop: '0.5px solid rgba(255,255,255,0.06)' } : {}) }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, marginRight: 9, flex: 'none', background: bktColor(i) }} />
                  <span style={{ width: 44, flex: 'none', fontSize: 12.5, color: '#d8d8d8' }}>{b.label}</span>
                  {/* '26년 */}
                  <div style={{ flex: 4, display: 'flex' }}>
                    <span style={{ flex: 1.1, textAlign: 'right', fontSize: 14, color: '#f2f2f2' }}>{cr.toLocaleString()}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontSize: 12.5, color: '#b0b0b0' }}>{c.toLocaleString()}</span>
                    <span style={{ flex: 0.9, textAlign: 'right', fontSize: 11.5, color: '#9a9a9a' }}>{cr === 0 ? '·' : cp < 1 ? '<1%' : `${Math.round(cp)}%`}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontSize: 12.5, color: '#d0d0d0' }}>{ca == null ? '–' : Math.round(ca / 1000).toLocaleString()}</span>
                  </div>
                  <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.09)', margin: '0 7px' }} />
                  {/* '25년 */}
                  <div style={{ flex: 3.1, display: 'flex' }}>
                    <span style={{ flex: 1.1, textAlign: 'right', fontSize: 13, color: '#8a8a8a' }}>{lr.toLocaleString()}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontSize: 12, color: '#787878' }}>{l.toLocaleString()}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontSize: 12, color: '#7a7a7a' }}>{la == null ? '–' : Math.round(la / 1000).toLocaleString()}</span>
                  </div>
                  <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.09)', margin: '0 7px' }} />
                  {/* 증감 */}
                  <div style={{ flex: 2.9, display: 'flex' }}>
                    <span style={{ flex: 1, textAlign: 'right', fontSize: 12, color: drColor }}>{dr === 0 ? '—' : dr > 0 ? `▲${dr}` : `▼${Math.abs(dr)}`}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontSize: 11.5, color: dnColor }}>{dn === 0 ? '—' : dn > 0 ? `▲${dn}` : `▼${Math.abs(dn)}`}</span>
                    <span style={{ flex: 0.9, textAlign: 'right', fontSize: 11, color: dpColor }}>{!dpShow ? '—' : `${dp > 0 ? '+' : '−'}${Math.abs(Math.round(dp))}p`}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 10, color: '#5a5a5a', padding: '0 16px 10px' }}>비중은 예약 건수 기준 · 단위 : 건, 룸나잇, 천원</div>
      </div>
    )
  }

  // ─── 탭 · 필터 ──────────────────────────────────────────────────────────────────
  const TAB_W = 112
  const tabs = [
    { d: 'segment' as Dim, label: '세그먼트', icon: <><rect x="1" y="1" width="4" height="4" rx="1" fill="currentColor"/><rect x="7" y="1" width="4" height="4" rx="1" fill="currentColor"/><rect x="1" y="7" width="4" height="4" rx="1" fill="currentColor"/><rect x="7" y="7" width="4" height="4" rx="1" fill="currentColor"/></> },
    { d: 'country' as Dim, label: '국적', icon: <><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M1 6h10M6 1c1.6 1.6 2.4 3.3 2.4 5S7.6 10.4 6 11C4.4 10.4 3.6 8.7 3.6 6S4.4 2.6 6 1z" stroke="currentColor" strokeWidth="1.1" fill="none"/></> },
    { d: 'account' as Dim, label: '어카운트', icon: <><path d="M1.5 1.5h4.2L11 6.8 6.8 11 1.5 5.7V1.5z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round"/><circle cx="3.9" cy="3.9" r="1" fill="currentColor"/></> },
  ]
  const activeIdx = tabs.findIndex(t => t.d === dim)
  const segSize = segFilterOpen ? draft.length : applied.length
  const accSize = accFilterOpen ? draftAcc.length : appliedAcc.length
  const segAllBtn = segSize === 0 || segSize === segTree.allCodes.length
  const accAllBtn = accSize === 0 || accSize === accountList.length
  const segFiltered = applied.length > 0 && applied.length < segTree.allCodes.length
  const accFiltered = appliedAcc.length > 0 && appliedAcc.length < accountList.length
  const resetAll = () => { setApplied(segTree.allCodes); setAppliedAcc(accountList) }
  const chk = (state: 'checked' | 'unchecked' | 'inter') => (
    <span style={{
      width: 14, height: 14, borderRadius: 4, flexShrink: 0, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: `1px solid ${state === 'unchecked' ? '#3a3a3a' : '#00E5A0'}`, background: state === 'checked' ? '#00E5A0' : 'transparent',
    }}>
      {state === 'checked' && <span style={{ color: '#0a0a0a', fontSize: 9, lineHeight: 1 }}>✓</span>}
      {state === 'inter' && <span style={{ width: 6, height: 2, background: '#00E5A0' }} />}
    </span>
  )

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={prevMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 26, color: MINT, lineHeight: 1 }}>‹</span><span style={{ fontSize: 9, color: MINT }}>이전</span>
          </button>
          <span style={{ fontSize: 19, fontWeight: 500, color: '#e8e8e8', letterSpacing: '0.04em' }}>
            Lead Time <span style={{ color: MINT }}>{selYear}년 {m1}월</span>
          </span>
          <button onClick={nextMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 26, color: MINT, lineHeight: 1 }}>›</span><span style={{ fontSize: 9, color: MINT }}>다음</span>
          </button>
        </div>
        <span style={{ fontSize: 11, color: '#5f5f5f' }}>도착일 기준 · 룸나잇 · HOU 제외</span>
      </div>

      {/* 탭 + 필터 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        {/* 탭 — 세그먼티드 컨트롤 */}
        <div style={{ position: 'relative', display: 'inline-flex', background: '#131313', border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 9, padding: 3, flex: 'none' }}>
          <div style={{ position: 'absolute', top: 3, left: 3, width: TAB_W, height: 'calc(100% - 6px)', borderRadius: 7, background: '#00E5A0', transform: `translateX(${activeIdx * TAB_W}px)`, transition: 'transform .26s cubic-bezier(.34,1.32,.5,1)', willChange: 'transform' }} />
          {tabs.map(t => {
            const active = dim === t.d
            return (
              <div key={t.d} onClick={() => setDim(t.d)} style={{ position: 'relative', zIndex: 1, cursor: 'pointer', width: TAB_W, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12.5, padding: '7px 0', fontWeight: active ? 500 : 400, color: active ? '#08150f' : '#8a8a8a', transition: 'color .18s ease' }}>
                <svg viewBox="0 0 12 12" width={12} height={12}>{t.icon}</svg>{t.label}
              </div>
            )
          })}
        </div>
        {/* 필터 */}
        {dim !== 'segment' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: '#4a4a4a', letterSpacing: '0.08em', marginRight: 2 }}>FILTER</span>
            <div className="seg-filter-wrap" style={{ position: 'relative' }}>
              <div onClick={() => { if (!segFilterOpen) { setDraft(applied); setAccFilterOpen(false) } setSegFilterOpen(o => !o) }} style={{ cursor: 'pointer', position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '7px 13px', borderRadius: 8, border: `0.5px solid rgba(255,255,255,${segFilterOpen ? 0.24 : 0.13})`, background: segFilterOpen ? 'rgba(255,255,255,0.05)' : 'transparent', color: segAllBtn ? '#8f8f8f' : '#dcdcdc', transition: 'all .15s' }}>
                <svg viewBox="0 0 12 12" width={12} height={12} style={{ opacity: segAllBtn ? 0.45 : 0.85 }}><path d="M1 2h10L7 6.6V11L5 9.8V6.6L1 2z" fill="currentColor"/></svg>
                <span>세그먼트</span>
                <span style={{ color: segAllBtn ? '#5a5a5a' : '#00E5A0' }}>{segAllBtn ? '전체' : `${segSize}개`}</span>
                <span style={{ fontSize: 9 }}>{segFilterOpen ? '▴' : '▾'}</span>
                {!segAllBtn && <span style={{ position: 'absolute', top: -3, right: -3, width: 7, height: 7, borderRadius: '50%', background: '#00E5A0', boxShadow: '0 0 0 2px #0a0a0a' }} />}
              </div>
              {segFilterOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 252, zIndex: 20, background: '#101410', border: '0.5px solid rgba(0,229,160,0.26)', borderRadius: 9, overflow: 'hidden', boxShadow: '0 10px 28px rgba(0,0,0,0.8)' }}>
                  <div style={{ fontSize: 10, color: '#565656', padding: '8px 12px 4px' }}>{draft.length} / {segTree.allCodes.length} 선택</div>
                  <div style={{ maxHeight: 250, overflowY: 'auto', paddingBottom: 6 }}>
                  {segTree.groups.map(g => {
                    const isLeaf = g.children.length === 0
                    const childSel = g.children.filter(c => c.codes.every(cc => draft.includes(cc))).length
                    const gState: 'checked' | 'unchecked' | 'inter' = isLeaf
                      ? (g.codes.every(c => draft.includes(c)) ? 'checked' : 'unchecked')
                      : (childSel === g.children.length ? 'checked' : childSel === 0 ? 'unchecked' : 'inter')
                    return (
                      <div key={g.key}>
                        <div onClick={() => toggleCodes(g.codes)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 12px 4px 12px' }}>
                          {chk(gState)}<span style={{ fontSize: 12.5, color: '#EAFFF7', fontWeight: 500 }}>{g.name}</span>
                        </div>
                        {g.children.map(c => (
                          <div key={c.name} onClick={() => toggleCodes(c.codes)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 12px 4px 26px' }}>
                            {chk(c.codes.every(cc => draft.includes(cc)) ? 'checked' : 'unchecked')}<span style={{ fontSize: 12, color: '#b0b0b0' }}>{c.name}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  </div>
                  <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: '0.5px solid rgba(255,255,255,0.1)', background: '#0c110c' }}>
                    <span onClick={() => setDraft([])} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, padding: '6px 0', borderRadius: 6, cursor: 'pointer', border: '0.5px solid rgba(255,255,255,0.14)', color: '#a8a8a8' }}>초기화</span>
                    <span onClick={() => setDraft(segTree.allCodes)} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, padding: '6px 0', borderRadius: 6, cursor: 'pointer', border: '0.5px solid rgba(255,255,255,0.14)', color: '#a8a8a8' }}>전체</span>
                    <span onClick={() => { setApplied(draft); setSegFilterOpen(false) }} style={{ flex: 1.2, textAlign: 'center', fontSize: 11.5, padding: '6px 0', borderRadius: 6, cursor: 'pointer', background: '#00E5A0', color: '#08150f', fontWeight: 500 }}>완료</span>
                  </div>
                </div>
              )}
            </div>
            <div className="acc-filter-wrap" style={{ position: 'relative' }}>
              <div onClick={() => { if (!accFilterOpen) { setDraftAcc(appliedAcc); setSegFilterOpen(false) } setAccFilterOpen(o => !o) }} style={{ cursor: 'pointer', position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '7px 13px', borderRadius: 8, border: `0.5px solid rgba(255,255,255,${accFilterOpen ? 0.24 : 0.13})`, background: accFilterOpen ? 'rgba(255,255,255,0.05)' : 'transparent', color: accAllBtn ? '#8f8f8f' : '#dcdcdc', transition: 'all .15s' }}>
                <svg viewBox="0 0 12 12" width={12} height={12} style={{ opacity: accAllBtn ? 0.45 : 0.85 }}><path d="M1 2h10L7 6.6V11L5 9.8V6.6L1 2z" fill="currentColor"/></svg>
                <span>어카운트</span>
                <span style={{ color: accAllBtn ? '#5a5a5a' : '#00E5A0' }}>{accAllBtn ? '전체' : `${accSize}개`}</span>
                <span style={{ fontSize: 9 }}>{accFilterOpen ? '▴' : '▾'}</span>
                {!accAllBtn && <span style={{ position: 'absolute', top: -3, right: -3, width: 7, height: 7, borderRadius: '50%', background: '#00E5A0', boxShadow: '0 0 0 2px #0a0a0a' }} />}
              </div>
              {accFilterOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 252, zIndex: 20, background: '#101410', border: '0.5px solid rgba(0,229,160,0.26)', borderRadius: 9, overflow: 'hidden', boxShadow: '0 10px 28px rgba(0,0,0,0.8)' }}>
                  <div style={{ padding: '9px 10px 7px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                    <input value={accSearch} onChange={e => setAccSearch(e.target.value)} placeholder="어카운트 검색" style={{ width: '100%', boxSizing: 'border-box', background: '#0a0f0a', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 5, padding: '5px 8px', fontSize: 11.5, color: '#e0e0e0', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 12px 3px' }}>
                    <span style={{ fontSize: 10, color: '#565656' }}>{draftAcc.length} / {accountList.length} 선택</span>
                    {segFiltered && <span style={{ fontSize: 10, color: '#00E5A0', opacity: 0.75 }}>세그먼트 연동</span>}
                  </div>
                  <div style={{ maxHeight: 250, overflowY: 'auto', paddingBottom: 6 }}>
                    {(() => {
                      const q = accSearch.trim().toLowerCase()
                      const shown = q ? accountList.filter(a => a.toLowerCase().includes(q)) : accountList
                      return shown.length === 0 ? (
                        <div style={{ fontSize: 11.5, color: '#454545', textAlign: 'center', padding: '16px 12px' }}>해당 없음</div>
                      ) : shown.map(name => (
                        <div key={name} onClick={() => toggleAcc(name)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 12px' }}>
                          <span style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${draftAcc.includes(name) ? '#00E5A0' : '#3a3a3a'}`, background: draftAcc.includes(name) ? '#00E5A0' : 'transparent' }}>{draftAcc.includes(name) && <span style={{ color: '#0a0a0a', fontSize: 9, lineHeight: 1 }}>✓</span>}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: draftAcc.includes(name) ? '#e0e0e0' : '#8a8a8a' }}>{name}</span>
                        </div>
                      ))
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: '0.5px solid rgba(255,255,255,0.1)', background: '#0c110c' }}>
                    <span onClick={() => setDraftAcc([])} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, padding: '6px 0', borderRadius: 6, cursor: 'pointer', border: '0.5px solid rgba(255,255,255,0.14)', color: '#a8a8a8' }}>초기화</span>
                    <span onClick={() => setDraftAcc(accountList)} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, padding: '6px 0', borderRadius: 6, cursor: 'pointer', border: '0.5px solid rgba(255,255,255,0.14)', color: '#a8a8a8' }}>전체</span>
                    <span onClick={() => { setAppliedAcc(draftAcc); setAccFilterOpen(false) }} style={{ flex: 1.2, textAlign: 'center', fontSize: 11.5, padding: '6px 0', borderRadius: 6, cursor: 'pointer', background: '#00E5A0', color: '#08150f', fontWeight: 500 }}>완료</span>
                  </div>
                </div>
              )}
            </div>
            {(segFiltered || accFiltered) && <span onClick={resetAll} style={{ fontSize: 11, color: '#6a6a6a', cursor: 'pointer', padding: '7px 3px' }}>해제</span>}
          </div>
        )}
      </div>

      {isLoading && sumRows.length === 0 ? (
        <div className="animate-pulse" style={{ height: 420, background: 'var(--color-bg-tertiary)', borderRadius: 12 }} />
      ) : (
        <div>
          <div style={{ border: '1px solid rgba(0,229,160,0.45)', borderLeft: '4px solid #00E5A0', borderRadius: 4, overflow: 'hidden' }}>
          {/* 헤더 1단 — 그룹명 */}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ width: 138, flexShrink: 0 }} />
            <div style={{ flex: 7, boxShadow: OV, borderRadius: '4px 4px 0 0', textAlign: 'center', fontSize: 12, fontWeight: 500, color: MINT, padding: '4px 0' }}>리드타임 구간별 예약 건수</div>
            <div style={{ width: 10, flexShrink: 0 }} />
            <div style={{ flex: 3, boxShadow: OV_B, borderRadius: '4px 4px 0 0', textAlign: 'center', fontSize: 12, fontWeight: 500, color: '#5B8DEF', padding: '4px 0' }}>룸나잇 · 평균 · 최장</div>
          </div>
          {/* 헤더 2단 — 구간 라벨 (가운데) */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 138, flexShrink: 0 }} />
            <div style={{ flex: 7, minWidth: 0, display: 'flex', boxShadow: OV }}>
              {buckets.map(b => <div key={b.no} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 11.5, color: '#9a9a9a' }}>{b.label}</div>)}
            </div>
            <div style={{ width: 10, flexShrink: 0 }} />
            <div style={{ flex: 3, minWidth: 0, boxShadow: OV_B }} />
          </div>
          {/* 헤더 3단 — 예약/비중/전년비 증감 · 리드/전년비/최장 */}
          <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid rgba(0,229,160,0.28)' }}>
            <div style={{ width: 138, flexShrink: 0 }} />
            <div style={{ flex: 7, minWidth: 0, boxShadow: OV }} />
            <div style={{ width: 10, flexShrink: 0 }} />
            <div style={{ flex: 3, minWidth: 0, display: 'flex', boxShadow: OV_B }}>
              <div style={{ flex: 1.2, minWidth: 0, textAlign: 'right', fontSize: 10, color: '#6a6a6a' }}>룸나잇</div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 10, color: '#5f5f5f' }}>Mix</div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 10, color: '#5f5f5f' }}>리드</div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 10, color: '#5f5f5f' }}>전년비</div>
              <div style={{ flex: 0.9, minWidth: 0, textAlign: 'right', paddingRight: 4, fontSize: 10, color: '#5f5f5f' }}>최장</div>
            </div>
          </div>

          {displayRows.map((r, i) => renderRow(r, i))}
          {renderRow(totalRow, 'total', true)}
          </div>

          <div style={{ fontSize: 11, color: '#6b6b6b', marginTop: 10 }}>막대 위 = 예약 건수 · 막대 아래 = 비중 · 화살표 = 비중 증감 · 밝은 민트 = 최다 예약 구간</div>
          <div style={{ fontSize: 11, color: '#5a5a5a', marginTop: 10 }}>도착일 기준 집계 · 예약 생성일 기준 리드타임</div>

          {panelRow && renderPanel(panelRow)}
        </div>
      )}
    </div>
  )
}
