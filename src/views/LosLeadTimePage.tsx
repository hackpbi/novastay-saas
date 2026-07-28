'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'

// ─── 타입 ────────────────────────────────────────────────────────────────────────
type Dim = 'segment' | 'country' | 'account'
type TopTab = 'los' | 'nights'
type Row = {
  year_type:   string
  dim_key:     string
  resv:        number
  room_nights: number
  alos:        number | null
  avg_lead:    number | null
  n1: number; n2: number; n3: number
  adr1: number | null; adr2: number | null; adr3: number | null
}
type Agg = {
  resv: number; rn: number; n1: number; n2: number; n3: number
  alos: number | null; lead: number | null
  adr1: number | null; adr2: number | null; adr3: number | null
}
type DRow = { name: string; level: 'main' | 'mid' | 'sub' | 'flat'; bg: string | null; font: string | null; isBold: boolean; cy: Agg; lyc: Agg }

// ─── 상수 (KST — getUTC 금지) ──────────────────────────────────────────────────────
const MINT  = '#00E5A0'
const RED   = '#E24B4A'
const BLUE  = '#5B8DEF'
const AMBER = '#F59E0B'
const pad = (n: number) => String(n).padStart(2, '0')

// 코드 집합을 예약건수/룸나잇 가중으로 합산 (main = 자식 resv 가중평균과 동일)
function aggregate(map: Record<string, Row>, codes: string[]): Agg {
  let resv = 0, rn = 0, n1 = 0, n2 = 0, n3 = 0
  let alosNum = 0, alosDen = 0, leadNum = 0, leadDen = 0
  let adr1Num = 0, adr1Den = 0, adr2Num = 0, adr2Den = 0
  let adr3Val: number | null = null, adr3Contrib = 0
  for (const c of codes) {
    const r = map[c]; if (!r) continue
    resv += r.resv; rn += r.room_nights; n1 += r.n1; n2 += r.n2; n3 += r.n3
    if (r.alos != null && r.resv > 0)     { alosNum += r.alos * r.resv; alosDen += r.resv }
    if (r.avg_lead != null && r.resv > 0) { leadNum += r.avg_lead * r.resv; leadDen += r.resv }
    // ADR = 구간별 룸나잇 가중. 1박 룸나잇=n1, 2박 룸나잇=2·n2(계수 상쇄) → n1·n2 가중
    if (r.adr1 != null && r.n1 > 0) { adr1Num += r.adr1 * r.n1; adr1Den += r.n1 }
    if (r.adr2 != null && r.n2 > 0) { adr2Num += r.adr2 * r.n2; adr2Den += r.n2 }
    // 3박+ 룸나잇은 알 수 없어 다중 코드는 가중 불가 → 단일 기여만 표시, 그 외 null
    if (r.adr3 != null && r.n3 > 0) { adr3Val = r.adr3; adr3Contrib += 1 }
  }
  return {
    resv, rn, n1, n2, n3,
    alos: alosDen > 0 ? alosNum / alosDen : null,
    lead: leadDen > 0 ? leadNum / leadDen : null,
    adr1: adr1Den > 0 ? adr1Num / adr1Den : null,
    adr2: adr2Den > 0 ? adr2Num / adr2Den : null,
    adr3: adr3Contrib === 1 ? adr3Val : null,
  }
}

// ─── 페이지 ─────────────────────────────────────────────────────────────────────
export default function LosLeadTimePage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate } = useDateContext()
  const { data: schema } = useMarketSchema()

  // 월 선택 (기존 페이지 패턴)
  const otbBase = otbDate ? new Date(otbDate + 'T00:00:00') : new Date()
  const [selYear, setSelYear]   = useState(otbBase.getFullYear())
  const [selMonth, setSelMonth] = useState(otbBase.getMonth())   // 0-based
  useEffect(() => {
    const b = otbDate ? new Date(otbDate + 'T00:00:00') : new Date()
    setSelYear(b.getFullYear()); setSelMonth(b.getMonth())
  }, [otbDate])
  const prevMonth = () => { if (selMonth === 0) { setSelYear(y => y - 1); setSelMonth(11) } else setSelMonth(m => m - 1) }
  const nextMonth = () => { if (selMonth === 11) { setSelYear(y => y + 1); setSelMonth(0) } else setSelMonth(m => m + 1) }

  const m1 = selMonth + 1
  const fromDate = `${selYear}-${pad(m1)}-01`
  const toDate   = `${selYear}-${pad(m1)}-${pad(new Date(selYear, m1, 0).getDate())}`

  const [topTab, setTopTab] = useState<TopTab>('los')
  const [dim, setDim] = useState<Dim>('segment')

  // ─── 데이터 조회 (하단 탭 전환 시에만 재조회 — p_dim 변경) ──────────────────────
  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ['los-leadtime', hotelId, otbDate, fromDate, toDate, dim],
    enabled: !!hotelId && !!otbDate,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_los_leadtime', {
        p_hotel_id: hotelId, p_update_date: otbDate, p_from: fromDate, p_to: toDate, p_dim: dim,
      })
      if (error) throw error
      return ((data ?? []) as any[]).map(r => ({
        year_type: r.year_type as string,
        dim_key: r.dim_key as string,
        resv: Number(r.resv) || 0,
        room_nights: Number(r.room_nights) || 0,
        alos: r.alos == null ? null : Number(r.alos),
        avg_lead: r.avg_lead == null ? null : Number(r.avg_lead),
        n1: Number(r.n1) || 0, n2: Number(r.n2) || 0, n3: Number(r.n3) || 0,
        adr1: r.adr1 == null ? null : Number(r.adr1),
        adr2: r.adr2 == null ? null : Number(r.adr2),
        adr3: r.adr3 == null ? null : Number(r.adr3),
      })) as Row[]
    },
  })

  // year_type 별 맵 (cy = 올해, ly_close = 전년 마감. ly_otb 미사용)
  const byKey = useMemo(() => {
    const cy: Record<string, Row> = {}, lyc: Record<string, Row> = {}
    for (const r of rows) {
      if (r.year_type === 'cy') cy[r.dim_key] = r
      else if (r.year_type === 'ly_close') lyc[r.dim_key] = r
    }
    return { cy, lyc }
  }, [rows])

  // ─── 표시 행 구성 (dim 별) ──────────────────────────────────────────────────────
  const displayRows = useMemo<DRow[]>(() => {
    const make = (name: string, level: DRow['level'], node: MarketSchemaRow | null, codes: string[]): DRow => ({
      name, level,
      bg:   node ? node.bg_dark_color : null,
      font: node ? node.font_dark_color : null,
      isBold: node ? node.is_bold : true,
      cy:  aggregate(byKey.cy, codes),
      lyc: aggregate(byKey.lyc, codes),
    })
    if (dim === 'segment') {
      const tops = schema.filter(s => s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
      const out: DRow[] = []
      for (const top of tops) {
        if (top.segmentation.includes('HOU')) continue   // House Use — RPC에서 제외되어 미표시
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
    // 국적 · 어카운트 — 계층 없음, 룸나잇 내림차순
    const keys = [...new Set(rows.filter(r => r.year_type === 'cy').map(r => r.dim_key))]
    const scored = keys.map(k => ({ key: k, rn: aggregate(byKey.cy, [k]).rn })).sort((a, b) => b.rn - a.rn)
    if (dim === 'country') {
      return scored.map(s => make(s.key, 'flat', null, [s.key]))
    }
    // account — 상위 15 + 기타
    const top15 = scored.slice(0, 15)
    const restKeys = scored.slice(15).map(s => s.key)
    const out = top15.map(s => make(s.key, 'flat', null, [s.key]))
    if (restKeys.length) out.push(make('기타', 'flat', null, restKeys))
    return out
  }, [dim, rows, schema, byKey])

  // ─── 축 범위 (현재 탭 표시값 min/max ± 12%) ──────────────────────────────────────
  const alosDomain = useMemo(() => {
    const vals: number[] = []
    for (const r of displayRows) { if (r.cy.alos != null) vals.push(r.cy.alos); if (r.lyc.alos != null) vals.push(r.lyc.alos) }
    if (vals.length === 0) return [0, 1] as [number, number]
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn
    const p = rng > 0 ? rng * 0.12 : Math.max(mx * 0.06, 0.5)
    return [mn - p, mx + p] as [number, number]
  }, [displayRows])
  const leadMax = useMemo(() => {
    const vals = displayRows.map(r => r.cy.lead).filter((v): v is number => v != null)
    return vals.length ? Math.max(...vals) * 1.12 : 1
  }, [displayRows])

  const alosPct = (v: number) => {
    const [a, b] = alosDomain
    return b > a ? Math.max(0, Math.min(100, (v - a) / (b - a) * 100)) : 50
  }

  // ─── 스타일 헬퍼 ───────────────────────────────────────────────────────────────
  const nameCell = (r: DRow, width: number): React.CSSProperties => {
    const isSub = r.level === 'sub'
    return {
      width, flexShrink: 0, padding: '0 8px', boxSizing: 'border-box',
      paddingLeft: isSub ? 24 : 10,
      fontSize: isSub ? 12 : 13,
      fontWeight: r.isBold ? 500 : 400,
      color: isSub ? '#9a9a9a' : (r.font ?? '#e8e8e8'),
      background: r.bg ?? 'transparent',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      opacity: r.cy.resv > 0 ? 1 : 0.35,
      alignSelf: 'stretch', display: 'flex', alignItems: 'center',
    }
  }
  const rowStyle = (r: DRow): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', borderTop: '0.5px solid rgba(255,255,255,0.05)',
    minHeight: topTab === 'los' ? 44 : 50,
    opacity: r.cy.resv <= 4 ? 0.55 : 1,
  })

  // ─── 탭1: LOS · Lead Time ──────────────────────────────────────────────────────
  function renderLosRow(r: DRow, i: number) {
    const cyA = r.cy.alos, lyA = r.lyc.alos
    const noData = r.cy.resv <= 0
    const hasLy = lyA != null
    const dAlos = (cyA != null && hasLy) ? cyA - lyA! : null
    const leadV = r.cy.lead
    const leadPct = leadMax > 0 && leadV != null ? Math.max(0, Math.min(100, leadV / leadMax * 100)) : 0
    return (
      <div key={i} style={rowStyle(r)}>
        <div style={nameCell(r, 132)}>{r.name}</div>
        {/* ALOS 덤벨 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px' }}>
          {noData || cyA == null ? (
            <div style={{ flex: 1, fontSize: 11, color: '#3a3a3a' }}>데이터 없음</div>
          ) : (
            <>
              <div style={{ position: 'relative', flex: 1, height: 20 }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: '#1e1e1e', transform: 'translateY(-50%)' }} />
                {hasLy && (
                  <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', height: 3, borderRadius: 2,
                    left: `${Math.min(alosPct(cyA), alosPct(lyA!))}%`, width: `${Math.abs(alosPct(cyA) - alosPct(lyA!))}%`,
                    background: cyA >= lyA! ? MINT : RED }} />
                )}
                {hasLy && (
                  <div style={{ position: 'absolute', top: '50%', left: `${alosPct(lyA!)}%`, transform: 'translate(-50%,-50%)',
                    width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #F59E0B', background: '#0a0a0a', boxSizing: 'border-box' }} />
                )}
                <div style={{ position: 'absolute', top: '50%', left: `${alosPct(cyA)}%`, transform: 'translate(-50%,-50%)',
                  width: 10, height: 10, borderRadius: '50%', background: MINT }} />
              </div>
              <div style={{ width: 92, flexShrink: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#e8e8e8' }}>{cyA.toFixed(2)}</span>
                {dAlos != null && (
                  <span style={{ fontSize: 11, color: dAlos >= 0 ? MINT : RED }}>{dAlos >= 0 ? '▲' : '▼'}{Math.abs(dAlos).toFixed(2)}</span>
                )}
              </div>
            </>
          )}
        </div>
        {/* 리드타임 단일 막대 (전년 없음) */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px' }}>
          {noData || leadV == null ? (
            <div style={{ flex: 1, fontSize: 11, color: '#3a3a3a' }}>데이터 없음</div>
          ) : (
            <>
              <div style={{ position: 'relative', flex: 1, height: 16, background: '#151515', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${leadPct}%`, background: BLUE, borderRadius: 3 }} />
              </div>
              <div style={{ width: 40, flexShrink: 0, textAlign: 'right', fontSize: 13, color: '#e8e8e8' }}>{Math.round(leadV)}</div>
            </>
          )}
        </div>
      </div>
    )
  }
  function renderLosTab() {
    return (
      <div>
        {/* 범례 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 11, color: '#888', marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #F59E0B', background: '#0a0a0a', boxSizing: 'border-box' }} />전년 마감</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: MINT }} />{selYear}년</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 3, borderRadius: 2, background: MINT }} />증가</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 3, borderRadius: 2, background: RED }} />감소</span>
        </div>
        {/* 헤더 행 */}
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 8 }}>
          <div style={{ width: 132, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 6px' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: MINT }}>평균 투숙일수</span>
            <span style={{ fontSize: 11, color: '#555' }}>{alosDomain[0].toFixed(1)} – {alosDomain[1].toFixed(1)}박</span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 6px' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: BLUE }}>평균 리드타임</span>
            <span style={{ fontSize: 11, color: '#555' }}>0 – {Math.round(leadMax)}일</span>
          </div>
        </div>
        {displayRows.map((r, i) => renderLosRow(r, i))}
      </div>
    )
  }

  // ─── 탭2: 박수별 예약 · 단가 (올해만) ────────────────────────────────────────────
  function nightCell(cnt: number, adr: number | null, adr1: number | null, first: boolean) {
    const style: React.CSSProperties = { width: 82, flexShrink: 0, padding: '0 8px', boxSizing: 'border-box', textAlign: 'right', ...(first ? { boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.12)' } : {}) }
    if (cnt === 0) return <div style={{ ...style, color: '#3a3a3a', fontSize: 13 }}>·</div>
    const adrLow = adr != null && adr1 != null && adr < adr1 * 0.85
    return (
      <div style={style}>
        <div style={{ fontSize: 13, color: '#e8e8e8' }}>{cnt.toLocaleString()}</div>
        <div style={{ fontSize: 11, color: adr == null ? '#666' : adrLow ? RED : '#888' }}>{adr == null ? '–' : Math.round(adr).toLocaleString()}</div>
      </div>
    )
  }
  function renderNightsTab() {
    return (
      <div>
        {/* 헤더 행 */}
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 8, borderBottom: '0.5px solid rgba(255,255,255,0.12)' }}>
          <div style={{ width: 150, flexShrink: 0 }} />
          {['1박', '2박', '3박+'].map((c, i) => (
            <div key={c} style={{ width: 82, flexShrink: 0, padding: '0 8px', boxSizing: 'border-box', textAlign: 'right', fontSize: 11, color: '#888', ...(i === 0 ? { boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.12)' } : {}) }}>{c}</div>
          ))}
        </div>
        {displayRows.map((r, i) => (
          <div key={i} style={rowStyle(r)}>
            <div style={nameCell(r, 150)}>{r.name}</div>
            {nightCell(r.cy.n1, r.cy.adr1, r.cy.adr1, true)}
            {nightCell(r.cy.n2, r.cy.adr2, r.cy.adr1, false)}
            {nightCell(r.cy.n3, r.cy.adr3, r.cy.adr1, false)}
          </div>
        ))}
      </div>
    )
  }

  // ─── 렌더 ──────────────────────────────────────────────────────────────────────
  const topTabItem = (t: TopTab, label: string) => (
    <span key={t} onClick={() => setTopTab(t)} style={{
      fontSize: 12, padding: '8px 14px', cursor: 'pointer',
      ...(topTab === t ? { color: MINT, borderBottom: `2px solid ${MINT}`, marginBottom: -1 } : { color: '#777', borderBottom: '2px solid transparent' }),
    }}>{label}</span>
  )
  const dimItem = (d: Dim, label: string) => (
    <span key={d} onClick={() => setDim(d)} style={{
      fontSize: 12, padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
      ...(dim === d
        ? { background: 'rgba(0,229,160,0.12)', color: MINT, border: '0.5px solid rgba(0,229,160,0.4)' }
        : { color: '#777', border: '0.5px solid rgba(255,255,255,0.1)' }),
    }}>{label}</span>
  )

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={prevMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 26, color: MINT, lineHeight: 1 }}>‹</span>
            <span style={{ fontSize: 9, color: MINT }}>이전</span>
          </button>
          <span style={{ fontSize: 20, fontWeight: 500, color: '#e8e8e8', letterSpacing: '0.04em' }}>
            LOS · Lead Time <span style={{ color: MINT }}>{selYear}년 {m1}월</span>
          </span>
          <button onClick={nextMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 26, color: MINT, lineHeight: 1 }}>›</span>
            <span style={{ fontSize: 9, color: MINT }}>다음</span>
          </button>
        </div>
        <span style={{ fontSize: 11, color: '#666' }}>도착일 기준 · 단체/HOU 제외</span>
      </div>

      {/* 상단 탭 */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '0.5px solid rgba(255,255,255,0.12)', marginBottom: 12 }}>
        {topTabItem('los', 'LOS · Lead Time')}{topTabItem('nights', '박수별 예약 · 단가')}
      </div>

      {/* 하단 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {dimItem('segment', '세그먼트')}{dimItem('country', '국적')}{dimItem('account', '어카운트')}
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="animate-pulse" style={{ height: 420, background: 'var(--color-bg-tertiary)', borderRadius: 12 }} />
      ) : (
        topTab === 'los' ? renderLosTab() : renderNightsTab()
      )}
    </div>
  )
}
