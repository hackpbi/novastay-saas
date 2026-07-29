'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'

// ─── 타입 ────────────────────────────────────────────────────────────────────────
type Dim = 'segment' | 'country' | 'account'
type SumRow = { year_type: string; dim_key: string; resv: number; room_nights: number; alos: number | null; max_los: number | null; adr: number | null }
type BktRow = { year_type: string; dim_key: string; bucket_no: number; bucket_min: number; bucket_max: number | null; resv: number; room_nights: number; adr: number | null }
type Sum = { resv: number; rn: number; alos: number | null; max: number | null }
type BucketDef = { no: number; min: number; max: number | null; label: string }
type DRow = { name: string; level: 'main' | 'mid' | 'sub' | 'flat'; bg: string | null; font: string | null; isBold: boolean; cy: Sum; ly: Sum; cyBk: Record<number, number>; lyBk: Record<number, number>; cyAdr: Record<number, number | null> }

// ─── 상수 (KST — getUTC 금지) ──────────────────────────────────────────────────────
const MINT = '#00E5A0'
const RED  = '#E24B4A'
const pad = (n: number) => String(n).padStart(2, '0')
const OV = 'inset 0 0 0 999px rgba(0,229,160,0.045)'
const OV_B = 'inset 0 0 0 999px rgba(91,141,239,0.05)'
const CO = ['#00E5A0', '#0FB894', '#1C8A88', '#2A5D7C', '#5B8DEF']
const bktColor = (i: number) => CO[Math.min(i, CO.length - 1)]

function aggSum(map: Record<string, SumRow>, codes: string[]): Sum {
  let resv = 0, rn = 0, an = 0, ad = 0, mx: number | null = null
  for (const c of codes) {
    const r = map[c]; if (!r) continue
    resv += r.resv; rn += r.room_nights
    if (r.alos != null && r.resv > 0) { an += r.alos * r.resv; ad += r.resv }
    if (r.max_los != null) mx = mx == null ? r.max_los : Math.max(mx, r.max_los)
  }
  return { resv, rn, alos: ad > 0 ? an / ad : null, max: mx }
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
export default function LosPage() {
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
  const [selectedSegments, setSelectedSegments] = useState<string[]>([])
  const [segFilterOpen, setSegFilterOpen] = useState(false)
  const [selName, setSelName] = useState<string | null>(null)

  const segKey = dim === 'segment' ? null : selectedSegments.slice().sort().join(',')
  const p_segments = dim === 'segment' || selectedSegments.length === 0 ? null : selectedSegments

  // ─── RPC 2개 ────────────────────────────────────────────────────────────────────
  const { data: sumRows = [], isLoading: sumLoading } = useQuery<SumRow[]>({
    queryKey: ['los-summary', hotelId, otbDate, fromDate, toDate, dim, segKey],
    enabled: !!hotelId && !!otbDate,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_los_summary', {
        p_hotel_id: hotelId, p_update_date: otbDate, p_from: fromDate, p_to: toDate, p_dim: dim, p_segments,
      })
      if (error) throw error
      return ((data ?? []) as any[]).map(r => ({
        year_type: r.year_type as string, dim_key: r.dim_key as string,
        resv: Number(r.resv) || 0, room_nights: Number(r.room_nights) || 0,
        alos: r.alos == null ? null : Number(r.alos),
        max_los: r.max_los == null ? null : Number(r.max_los),
        adr: r.adr == null ? null : Number(r.adr),
      })) as SumRow[]
    },
  })
  const { data: bktRows = [], isLoading: bktLoading } = useQuery<BktRow[]>({
    queryKey: ['los-buckets', hotelId, otbDate, fromDate, toDate, dim, segKey],
    enabled: !!hotelId && !!otbDate,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_los_buckets', {
        p_hotel_id: hotelId, p_update_date: otbDate, p_from: fromDate, p_to: toDate, p_dim: dim, p_segments,
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
  // 버킷 정의 (반환된 bucket_no 만큼 동적)
  const buckets = useMemo<BucketDef[]>(() => {
    const byNo: Record<number, { min: number; max: number | null }> = {}
    for (const r of bktRows) if (!(r.bucket_no in byNo)) byNo[r.bucket_no] = { min: r.bucket_min, max: r.bucket_max }
    return Object.keys(byNo).map(Number).sort((a, b) => a - b).map(no => {
      const { min, max } = byNo[no]
      const label = max === null ? `${min}박+` : min === max ? `${min}박` : `${min}-${max}박`
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
    setSelectedSegments(segTree.allCodes); segSeeded.current = true
  }, [segTree])
  useEffect(() => {
    if (!segFilterOpen) return
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.seg-filter-wrap')) setSegFilterOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [segFilterOpen])
  const toggleCodes = (codes: string[]) => setSelectedSegments(prev =>
    codes.every(c => prev.includes(c)) ? prev.filter(c => !codes.includes(c)) : [...new Set([...prev, ...codes])])

  // ─── 표시 행 ────────────────────────────────────────────────────────────────────
  const displayRows = useMemo<DRow[]>(() => {
    const make = (name: string, level: DRow['level'], node: MarketSchemaRow | null, codes: string[]): DRow => ({
      name, level,
      bg: node ? node.bg_dark_color : (level === 'flat' ? '#15211D14' : null),
      font: node ? node.font_dark_color : null,
      isBold: node ? node.is_bold : true,
      cy: aggSum(sumBy.cy, codes), ly: aggSum(sumBy.ly, codes),
      cyBk: aggBkt(bktBy.cy, codes), lyBk: aggBkt(bktBy.ly, codes),
      cyAdr: aggBktAdr(bktAdrCy, buckets, codes),
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
    const keys = [...new Set(sumRows.filter(r => r.year_type === 'cy').map(r => r.dim_key))]
    const scored = keys.map(k => ({ key: k, rn: sumBy.cy[k]?.room_nights ?? 0 })).sort((a, b) => b.rn - a.rn)
    if (dim === 'country') return scored.map(s => make(s.key, 'flat', null, [s.key]))
    const top15 = scored.slice(0, 15)
    const restKeys = scored.slice(15).map(s => s.key)
    const out = top15.map(s => make(s.key, 'flat', null, [s.key]))
    if (restKeys.length) out.push(make('기타', 'flat', null, restKeys))
    return out
  }, [dim, sumRows, schema, sumBy, bktBy, bktAdrCy, buckets])

  // ─── 합계 (부모 main 제외) ───────────────────────────────────────────────────────
  const totalRow = useMemo<DRow>(() => {
    let resv = 0, an = 0, ad = 0, mx: number | null = null
    let lresv = 0, lan = 0, lad = 0
    const cyBk: Record<number, number> = {}, lyBk: Record<number, number> = {}
    for (const r of displayRows) {
      if (r.level === 'main') continue
      resv += r.cy.resv
      if (r.cy.alos != null && r.cy.resv > 0) { an += r.cy.alos * r.cy.resv; ad += r.cy.resv }
      if (r.cy.max != null) mx = mx == null ? r.cy.max : Math.max(mx, r.cy.max)
      lresv += r.ly.resv
      if (r.ly.alos != null && r.ly.resv > 0) { lan += r.ly.alos * r.ly.resv; lad += r.ly.resv }
      for (const b of buckets) { cyBk[b.no] = (cyBk[b.no] ?? 0) + (r.cyBk[b.no] ?? 0); lyBk[b.no] = (lyBk[b.no] ?? 0) + (r.lyBk[b.no] ?? 0) }
    }
    return {
      name: '합계', level: 'flat', bg: null, font: null, isBold: true,
      cy: { resv, rn: 0, alos: ad > 0 ? an / ad : null, max: mx },
      ly: { resv: lresv, rn: 0, alos: lad > 0 ? lan / lad : null, max: null },
      cyBk, lyBk,
      cyAdr: aggBktAdr(bktAdrCy, buckets, Object.keys(bktAdrCy)),
    }
  }, [displayRows, buckets, bktAdrCy])

  // ─── 도넛 ───────────────────────────────────────────────────────────────────────
  const renderDonut = (bk: Record<number, number>, isCy: boolean) => {
    const total = buckets.reduce((s, b) => s + (bk[b.no] ?? 0), 0)
    if (total <= 0) return <div style={{ width: 118, height: 118, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#333', opacity: isCy ? 1 : 0.45 }}>없음</div>
    const gap = 0.012
    let a = -Math.PI / 2
    const segs: { d: string; color: string }[] = []
    buckets.forEach((b, i) => {
      const v = bk[b.no] ?? 0
      if (v <= 0) return
      const frac = v / total
      segs.push({ d: arc(59, 59, 52, 33, a + gap / 2, a + frac * 2 * Math.PI - gap / 2), color: bktColor(i) })
      a += frac * 2 * Math.PI
    })
    return (
      <svg viewBox="0 0 118 118" width={118} height={118} style={{ opacity: isCy ? 1 : 0.45 }}>
        {segs.map((s, i) => <path key={i} d={s.d} fill={s.color} />)}
        <text x={59} y={57} textAnchor="middle" dominantBaseline="central" fontSize={20} fill="#e8e8e8">{total.toLocaleString()}</text>
        <text x={59} y={73} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="#6a6a6a">건</text>
      </svg>
    )
  }

  // ─── 행 렌더 ───────────────────────────────────────────────────────────────────
  function renderRow(r: DRow, key: React.Key, isTotal = false) {
    const noData = r.cy.resv <= 0 && r.ly.resv <= 0
    const bg = isTotal ? 'transparent' : (r.bg ?? 'transparent')
    const dim35 = !isTotal && noData ? 0.35 : 1
    const rowOp = !isTotal && r.cy.resv <= 4 ? 0.55 : 1
    const sel = selName === r.name
    const dAlos = (r.cy.alos != null && r.ly.alos != null) ? r.cy.alos - r.ly.alos : null
    return (
      <div key={key} onClick={() => setSelName(prev => prev === r.name ? null : r.name)} style={{
        display: 'flex', alignItems: 'stretch', height: 38, cursor: 'pointer',
        opacity: rowOp,
        ...(sel ? { outline: '1px solid rgba(0,229,160,0.5)', outlineOffset: -1 } : {}),
        ...(isTotal ? { borderTop: '0.5px solid rgba(255,255,255,0.2)' } : { borderBottom: '0.5px solid rgba(255,255,255,0.05)' }),
      }}>
        {/* 구분 */}
        <div style={{
          width: 138, flexShrink: 0, display: 'flex', alignItems: 'center', boxSizing: 'border-box',
          paddingLeft: r.level === 'sub' ? 32 : 16, paddingRight: 8, background: bg,
          fontSize: r.level === 'sub' ? 12 : 13, fontWeight: (isTotal ? true : r.isBold) ? 500 : 400,
          color: isTotal ? MINT : r.level === 'sub' ? '#9a9a9a' : r.level === 'flat' ? '#e8e8e8' : (r.font ?? '#e8e8e8'),
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: dim35,
        }}>{r.name}</div>

        {/* 박수별 예약 건수 */}
        <div style={{ flex: 7, minWidth: 0, display: 'flex', alignItems: 'center', background: bg, boxShadow: OV }}>
          {noData ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#333' }}>데이터 없음</div>
          ) : (() => { const rowTot = buckets.reduce((s, b) => s + (r.cyBk[b.no] ?? 0), 0); return buckets.map(b => {
            const c = r.cyBk[b.no] ?? 0, l = r.lyBk[b.no] ?? 0, d = c - l
            return (
              <div key={b.no} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', whiteSpace: 'nowrap' }}>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'right', paddingRight: 3, fontSize: 14, color: c === 0 ? '#2b2b2b' : isTotal ? MINT : '#e8e8e8' }}>{c === 0 ? '·' : c}</div>
                <div style={{ width: 34, flexShrink: 0, textAlign: 'center', fontSize: 10, color: c === 0 ? 'transparent' : isTotal ? 'rgba(0,229,160,0.75)' : '#6f6f6f' }}>{c === 0 ? '' : (c / rowTot * 100 < 1 ? '<1%' : `${Math.round(c / rowTot * 100)}%`)}</div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left', paddingLeft: 3, fontSize: 10, color: (c === 0 || d === 0) ? 'transparent' : d > 0 ? MINT : RED }}>{(c === 0 || d === 0) ? '' : d > 0 ? `▲${d}` : `▼${Math.abs(d)}`}</div>
              </div>
            )
          }) })()}
        </div>

        {/* 간격 */}
        <div style={{ width: 10, flexShrink: 0 }} />

        {/* 평균 · 최장 */}
        <div style={{ flex: 3, minWidth: 0, display: 'flex', alignItems: 'center', background: bg, boxShadow: OV_B }}>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 13, color: isTotal ? MINT : '#e8e8e8' }}>{r.cy.alos != null ? r.cy.alos.toFixed(2) : <span style={{ color: '#3f3f3f' }}>–</span>}</div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 11, color: dAlos == null ? '#3f3f3f' : dAlos > 0 ? MINT : dAlos < 0 ? RED : '#8a8a8a' }}>
            {dAlos == null ? '—' : `${dAlos > 0 ? '▲' : dAlos < 0 ? '▼' : ''}${Math.abs(dAlos).toFixed(2)}`}
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'right', paddingRight: 4, fontSize: 12, color: '#8a8a8a' }}>{r.cy.max != null ? `${r.cy.max}박` : <span style={{ color: '#3f3f3f' }}>–</span>}</div>
        </div>
      </div>
    )
  }

  // ─── 도넛 상세 패널 ─────────────────────────────────────────────────────────────
  const panelRow = selName == null ? null : [...displayRows, totalRow].find(r => r.name === selName) ?? null
  const renderPanel = (r: DRow) => {
    const cyTot = buckets.reduce((s, b) => s + (r.cyBk[b.no] ?? 0), 0)
    const lyTot = buckets.reduce((s, b) => s + (r.lyBk[b.no] ?? 0), 0)
    return (
      <div style={{ background: '#101410', border: '1px solid rgba(0,229,160,0.45)', borderLeft: '4px solid #00E5A0', borderRadius: 4, overflow: 'hidden', marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 8px', borderBottom: '1px solid rgba(0,229,160,0.28)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, color: '#EAFFF7', fontWeight: 500 }}>{r.name}</span>
            <span style={{ fontSize: 11, color: '#6a6a6a', marginLeft: 6 }}>박수별 비중 · 단가</span>
          </div>
          <span onClick={() => setSelName(null)} style={{ fontSize: 16, color: '#6a6a6a', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</span>
        </div>
        <div style={{ display: 'flex', gap: 24, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
          {/* 도넛 2개 */}
          <div style={{ display: 'flex', gap: 16 }}>
            {([['ly', false, "'25년", '#8a8a8a'], ['cy', true, "'26년", MINT]] as const).map(([yk, isCy, lbl, col]) => (
              <div key={yk} style={{ textAlign: 'center' }}>
                {renderDonut(isCy ? r.cyBk : r.lyBk, isCy)}
                <div style={{ fontSize: 11, color: col, marginTop: -2 }}>{lbl}</div>
              </div>
            ))}
          </div>
          {/* 표 */}
          <div style={{ flex: 1, minWidth: 320 }}>
            {/* 표 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 6 }}>
              <span style={{ width: 9, marginRight: 8, flexShrink: 0 }} />
              <span style={{ width: 46, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 10, color: '#5f5f5f' }}>{"'25년"}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 10, color: '#5f5f5f' }}>{"'26년"}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 10, color: '#5f5f5f' }}>증감</span>
              <span style={{ flex: 1.1, minWidth: 0, textAlign: 'right', fontSize: 10, color: '#5f5f5f' }}>비중</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 10, color: MINT }}>ADR</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 10, color: '#F59E0B' }}>1박대비</span>
            </div>
            {buckets.map((b, i) => {
              const c = r.cyBk[b.no] ?? 0, l = r.lyBk[b.no] ?? 0, d = c - l
              const cp = cyTot ? c / cyTot * 100 : 0, lp = lyTot ? l / lyTot * 100 : 0
              const dp = cp - lp
              const a = r.cyAdr[b.no], a0 = r.cyAdr[buckets[0].no]
              const disc = (a0 && a && i > 0) ? (a - a0) / a0 * 100 : null
              const discRed = disc != null && disc <= -15
              const discColor = i === 0 ? '#3f3f3f' : disc == null ? '#3f3f3f' : disc <= -15 ? RED : disc < 0 ? '#8a8a8a' : MINT
              const discText = i === 0 ? '기준' : disc == null ? '—' : `${disc >= 0 ? '+' : '−'}${Math.abs(disc).toFixed(1)}%`
              return (
                <div key={b.no} style={{ display: 'flex', alignItems: 'center', padding: '5px 0', ...(i > 0 ? { borderTop: '0.5px solid rgba(255,255,255,0.06)' } : {}) }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, marginRight: 8, flexShrink: 0, background: bktColor(i) }} />
                  <span style={{ width: 46, flexShrink: 0, fontSize: 12, color: '#d8d8d8' }}>{b.label}</span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 11, color: '#7a7a7a' }}>{l.toLocaleString()}</span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 13, color: '#e8e8e8' }}>{c.toLocaleString()}</span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 11, color: d > 0 ? MINT : d < 0 ? RED : '#5a5a5a' }}>{d === 0 ? '' : d > 0 ? `▲${d}` : `▼${Math.abs(d)}`}</span>
                  <span style={{ flex: 1.1, minWidth: 0, textAlign: 'right', fontSize: 11, color: '#8a8a8a' }}>
                    {cp.toFixed(0)}%{Math.abs(dp) >= 0.5 && <span style={{ marginLeft: 3, color: dp > 0 ? MINT : RED }}>{dp > 0 ? '+' : '−'}{Math.abs(dp).toFixed(0)}p</span>}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 12, color: a == null ? '#3f3f3f' : discRed ? RED : '#d8d8d8' }}>{a == null ? '–' : Math.round(a / 1000).toLocaleString()}</span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 11, color: discColor }}>{discText}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 10, color: '#5a5a5a', padding: '0 16px 10px' }}>단위 : 건, 천원</div>
      </div>
    )
  }

  // ─── 탭 · 필터 ──────────────────────────────────────────────────────────────────
  const dimItem = (d: Dim, label: string) => (
    <span key={d} onClick={() => setDim(d)} style={{
      fontSize: 12, padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
      ...(dim === d ? { background: 'rgba(0,229,160,0.12)', color: MINT, border: '0.5px solid rgba(0,229,160,0.4)' } : { color: '#777', border: '0.5px solid rgba(255,255,255,0.1)' }),
    }}>{label}</span>
  )
  const chk = (state: 'checked' | 'unchecked' | 'inter') => (
    <span style={{
      width: 12, height: 12, borderRadius: 3, flexShrink: 0, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
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
            Length of Stay <span style={{ color: MINT }}>{selYear}년 {m1}월</span>
          </span>
          <button onClick={nextMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 26, color: MINT, lineHeight: 1 }}>›</span><span style={{ fontSize: 9, color: MINT }}>다음</span>
          </button>
        </div>
        <span style={{ fontSize: 11, color: '#5f5f5f' }}>도착일 기준 · 단체/HOU 제외</span>
      </div>

      {/* 탭 + 세그먼트 필터 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        {dimItem('segment', '세그먼트')}{dimItem('country', '국적')}{dimItem('account', '어카운트')}
        {dim !== 'segment' && (
          <>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />
            <div className="seg-filter-wrap" style={{ position: 'relative' }}>
              <div onClick={() => setSegFilterOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, padding: '5px 12px', borderRadius: 6, color: MINT, border: '0.5px solid rgba(0,229,160,0.4)', background: 'rgba(0,229,160,0.06)' }}>
                <span style={{ fontSize: 11 }}>▦</span><span>세그먼트</span>
                <span style={{ fontSize: 11, background: 'rgba(0,229,160,0.18)', padding: '1px 7px', borderRadius: 4 }}>{selectedSegments.length}개 선택</span>
                <span style={{ fontSize: 9 }}>{segFilterOpen ? '▴' : '▾'}</span>
              </div>
              {segFilterOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 210, zIndex: 20, background: '#101410', border: '0.5px solid rgba(0,229,160,0.3)', borderRadius: 8, padding: '8px 0', boxShadow: '0 8px 24px rgba(0,0,0,0.7)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 12px 8px', marginBottom: 6, borderBottom: '0.5px solid rgba(255,255,255,0.08)', fontSize: 11 }}>
                    <span onClick={() => setSelectedSegments(segTree.allCodes)} style={{ color: MINT, cursor: 'pointer' }}>전체 선택</span>
                    <span style={{ color: '#333' }}>|</span>
                    <span onClick={() => setSelectedSegments([])} style={{ color: '#777', cursor: 'pointer' }}>전체 해제</span>
                  </div>
                  {segTree.groups.map(g => {
                    const isLeaf = g.children.length === 0
                    const childSel = g.children.filter(c => c.codes.every(cc => selectedSegments.includes(cc))).length
                    const gState: 'checked' | 'unchecked' | 'inter' = isLeaf
                      ? (g.codes.every(c => selectedSegments.includes(c)) ? 'checked' : 'unchecked')
                      : (childSel === g.children.length ? 'checked' : childSel === 0 ? 'unchecked' : 'inter')
                    return (
                      <div key={g.key}>
                        <div onClick={() => toggleCodes(g.codes)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 12px 4px 12px' }}>
                          {chk(gState)}<span style={{ fontSize: 12.5, color: '#EAFFF7', fontWeight: 500 }}>{g.name}</span>
                        </div>
                        {g.children.map(c => (
                          <div key={c.name} onClick={() => toggleCodes(c.codes)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 12px 4px 26px' }}>
                            {chk(c.codes.every(cc => selectedSegments.includes(cc)) ? 'checked' : 'unchecked')}<span style={{ fontSize: 12, color: '#b0b0b0' }}>{c.name}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
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
            <div style={{ flex: 7, boxShadow: OV, borderRadius: '4px 4px 0 0', textAlign: 'center', fontSize: 12, fontWeight: 500, color: MINT, padding: '4px 0' }}>박수별 예약 건수</div>
            <div style={{ width: 10, flexShrink: 0 }} />
            <div style={{ flex: 3, boxShadow: OV_B, borderRadius: '4px 4px 0 0', textAlign: 'center', fontSize: 12, fontWeight: 500, color: '#5B8DEF', padding: '4px 0' }}>평균 · 최장</div>
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
          {/* 헤더 3단 — 예약/비중/전년비 증감 · ALOS/전년비/최장 */}
          <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid rgba(0,229,160,0.28)' }}>
            <div style={{ width: 138, flexShrink: 0 }} />
            <div style={{ flex: 7, minWidth: 0, display: 'flex', boxShadow: OV }}>
              {buckets.map(b => (
                <div key={b.no} style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'right', paddingRight: 3, fontSize: 9.5, color: '#4d4d4d', whiteSpace: 'nowrap' }}>예약</div>
                  <div style={{ width: 34, flexShrink: 0, textAlign: 'center', fontSize: 9.5, color: '#5a5a5a', whiteSpace: 'nowrap' }}>비중</div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left', paddingLeft: 3, fontSize: 9.5, color: '#4d4d4d', whiteSpace: 'nowrap' }}>전년비 증감</div>
                </div>
              ))}
            </div>
            <div style={{ width: 10, flexShrink: 0 }} />
            <div style={{ flex: 3, minWidth: 0, display: 'flex', boxShadow: OV_B }}>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 10, color: '#5f5f5f' }}>ALOS</div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 10, color: '#5f5f5f' }}>전년비</div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'right', paddingRight: 4, fontSize: 10, color: '#5f5f5f' }}>최장</div>
            </div>
          </div>

          {displayRows.map((r, i) => renderRow(r, i))}
          {renderRow(totalRow, 'total', true)}
          </div>

          {panelRow && renderPanel(panelRow)}
        </div>
      )}
    </div>
  )
}
