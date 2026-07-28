'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'

// ─── 타입 ────────────────────────────────────────────────────────────────────────
type Dim = 'segment' | 'country' | 'account'
type Row = {
  year_type:   string
  dim_key:     string
  resv:        number
  room_nights: number
  alos:        number | null
  avg_lead:    number | null
}
type Agg = { resv: number; rn: number; alos: number | null; lead: number | null }
type DRow = { name: string; level: 'main' | 'mid' | 'sub' | 'flat'; bg: string | null; font: string | null; isBold: boolean; cy: Agg; lyc: Agg }

// ─── 상수 (KST — getUTC 금지) ──────────────────────────────────────────────────────
const MINT  = '#00E5A0'
const RED   = '#E24B4A'
const BLUE  = '#5B8DEF'
const AMBER = '#F59E0B'
const pad = (n: number) => String(n).padStart(2, '0')

// 레이아웃 폭
const NAME_W = 132
const LY_W = 44, YOY_W = 140, CY_W = 44          // LOS 구역 = 228
const NEG_W = 40, BAR_W = 60, POS_W = 40         // YoY 내부
const GAP_W = 12
const LLY_W = 32, LCY_W = 38                     // 리드타임 좌/우 (막대 flex)
const LOS_W = LY_W + YOY_W + CY_W
const MINT_OV = 'inset 0 0 0 999px rgba(0,229,160,0.045)'
const BLUE_OV = 'inset 0 0 0 999px rgba(91,141,239,0.05)'

// 코드 집합을 예약건수 가중으로 합산 (main = 자식 resv 가중평균과 동일)
function aggregate(map: Record<string, Row>, codes: string[]): Agg {
  let resv = 0, rn = 0, alosNum = 0, alosDen = 0, leadNum = 0, leadDen = 0
  for (const c of codes) {
    const r = map[c]; if (!r) continue
    resv += r.resv; rn += r.room_nights
    if (r.alos != null && r.resv > 0)     { alosNum += r.alos * r.resv; alosDen += r.resv }
    if (r.avg_lead != null && r.resv > 0) { leadNum += r.avg_lead * r.resv; leadDen += r.resv }
  }
  return { resv, rn, alos: alosDen > 0 ? alosNum / alosDen : null, lead: leadDen > 0 ? leadNum / leadDen : null }
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

  const [dim, setDim] = useState<Dim>('segment')

  // ─── 데이터 조회 (dim 변경 시 재조회) ───────────────────────────────────────────
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
        if (top.segmentation.includes('HOU')) continue   // House Use — RPC 제외되어 미표시
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
    if (dim === 'country') return scored.map(s => make(s.key, 'flat', null, [s.key]))
    // account — 상위 15 + 기타
    const top15 = scored.slice(0, 15)
    const restKeys = scored.slice(15).map(s => s.key)
    const out = top15.map(s => make(s.key, 'flat', null, [s.key]))
    if (restKeys.length) out.push(make('기타', 'flat', null, restKeys))
    return out
  }, [dim, rows, schema, byKey])

  // ─── 합계 (부모 main 제외, 자식·독립 행만 예약건수 가중) ─────────────────────────
  const totalRow = useMemo<DRow>(() => {
    let cyN = 0, cyD = 0, lyN = 0, lyD = 0, ldN = 0, ldD = 0
    for (const r of displayRows) {
      if (r.level === 'main') continue
      if (r.cy.alos != null && r.cy.resv > 0)   { cyN += r.cy.alos * r.cy.resv; cyD += r.cy.resv }
      if (r.lyc.alos != null && r.lyc.resv > 0) { lyN += r.lyc.alos * r.lyc.resv; lyD += r.lyc.resv }
      if (r.cy.lead != null && r.cy.lead > 0 && r.cy.resv > 0) { ldN += r.cy.lead * r.cy.resv; ldD += r.cy.resv }
    }
    return {
      name: '합계', level: 'flat', bg: null, font: null, isBold: true,
      cy:  { resv: cyD, rn: 0, alos: cyD > 0 ? cyN / cyD : null, lead: ldD > 0 ? ldN / ldD : null },
      lyc: { resv: lyD, rn: 0, alos: lyD > 0 ? lyN / lyD : null, lead: null },
    }
  }, [displayRows])

  // ─── 리드타임 축 (최대 × 1.06) · 전체 평균선 ──────────────────────────────────────
  const leadMax = useMemo(() => {
    const vals = displayRows.map(r => r.cy.lead).filter((v): v is number => v != null && v > 0)
    return vals.length ? Math.max(...vals) * 1.06 : 1
  }, [displayRows])
  const leadAvg = totalRow.cy.lead   // 전체 예약건수 가중 평균

  // ─── 행 렌더 ───────────────────────────────────────────────────────────────────
  function renderRow(r: DRow, key: React.Key, isTotal = false) {
    const cyA = r.cy.alos, lyA = r.lyc.alos
    const noLos = cyA == null && lyA == null
    const yoy = (cyA != null && lyA != null && lyA !== 0) ? (cyA - lyA) / lyA * 100 : null
    const leadV = r.cy.lead
    const showLead = leadV != null && leadV > 0
    const bg = isTotal ? 'transparent' : (r.bg ?? 'transparent')
    const dim35 = !isTotal && noLos ? 0.35 : 1
    const rowOp = !isTotal && r.cy.resv <= 4 ? 0.55 : 1

    const negColor = isTotal ? MINT : RED
    const posColor = MINT
    const dash = <span style={{ color: '#3f3f3f' }}>–</span>

    return (
      <div key={key} style={{
        display: 'flex', alignItems: 'stretch', height: 40,
        opacity: rowOp,
        ...(isTotal
          ? { borderTop: '0.5px solid rgba(255,255,255,0.2)' }
          : { borderBottom: '0.5px solid rgba(255,255,255,0.05)' }),
      }}>
        {/* 구분 */}
        <div style={{
          width: NAME_W, flexShrink: 0, display: 'flex', alignItems: 'center',
          paddingLeft: r.level === 'sub' ? 26 : (isTotal ? 12 : 12), paddingRight: 8, boxSizing: 'border-box',
          background: bg,
          fontSize: r.level === 'sub' ? 12 : 13,
          fontWeight: (isTotal ? true : r.isBold) ? 500 : 400,
          color: isTotal ? MINT : (r.level === 'sub' ? '#9a9a9a' : (r.font ?? '#e8e8e8')),
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          opacity: dim35,
        }}>{r.name}</div>

        {/* LOS 구역 (민트 오버레이) */}
        <div style={{ width: LOS_W, flexShrink: 0, display: 'flex', alignItems: 'stretch', background: bg, boxShadow: MINT_OV }}>
          {noLos ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#333' }}>데이터 없음</div>
          ) : (
            <>
              <div style={{ width: LY_W, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, fontSize: 12, color: isTotal ? MINT : '#8a8a8a' }}>
                {lyA != null ? lyA.toFixed(2) : dash}
              </div>
              <div style={{ width: YOY_W, display: 'flex', alignItems: 'stretch' }}>
                {yoy == null ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#3f3f3f' }}>—</div>
                ) : (
                  <>
                    <div style={{ width: NEG_W, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, fontSize: 11, color: yoy < 0 ? negColor : 'transparent' }}>
                      {yoy < 0 ? `${Math.abs(yoy).toFixed(1)}%` : ' '}
                    </div>
                    <div style={{ width: BAR_W, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: BAR_W / 2, top: 0, bottom: 0, width: 1, background: '#2e2e2e' }} />
                      {yoy < 0 && (
                        <div style={{ position: 'absolute', right: BAR_W / 2, top: '50%', transform: 'translateY(-50%)', height: 7, borderRadius: 1, width: Math.min(Math.abs(yoy), 100) / 100 * (BAR_W / 2), background: negColor }} />
                      )}
                      {yoy > 0 && (
                        <div style={{ position: 'absolute', left: BAR_W / 2, top: '50%', transform: 'translateY(-50%)', height: 7, borderRadius: 1, width: Math.min(yoy, 100) / 100 * (BAR_W / 2), background: posColor }} />
                      )}
                      {yoy === 0 && (
                        <div style={{ position: 'absolute', left: BAR_W / 2, top: '50%', transform: 'translate(-50%,-50%)', width: 5, height: 5, borderRadius: '50%', background: '#5a5a5a' }} />
                      )}
                    </div>
                    <div style={{ width: POS_W, display: 'flex', alignItems: 'center', paddingLeft: 4, fontSize: 11, color: yoy > 0 ? posColor : 'transparent' }}>
                      {yoy > 0 ? `${Math.abs(yoy).toFixed(1)}%` : ' '}
                    </div>
                  </>
                )}
              </div>
              <div style={{ width: CY_W, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, fontSize: 13, color: isTotal ? MINT : '#e8e8e8' }}>
                {cyA != null ? cyA.toFixed(2) : dash}
              </div>
            </>
          )}
        </div>

        {/* 간격 (검정) */}
        <div style={{ width: GAP_W, flexShrink: 0 }} />

        {/* 리드타임 구역 (파랑 오버레이) — '25년 없음 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', background: bg, boxShadow: BLUE_OV }}>
          <div style={{ width: LLY_W, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, fontSize: 11, color: '#3f3f3f' }}>—</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 6px' }}>
            <div style={{ position: 'relative', flex: 1, height: 10, borderRadius: 2, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
              {showLead && (
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(0, Math.min(100, leadV / leadMax * 100))}%`, background: isTotal ? MINT : BLUE }} />
              )}
              {leadAvg != null && leadAvg > 0 && (
                <div style={{ position: 'absolute', left: `${Math.max(0, Math.min(100, leadAvg / leadMax * 100))}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.22)' }} />
              )}
            </div>
          </div>
          <div style={{ width: LCY_W, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, fontSize: 13, color: isTotal ? MINT : '#e8e8e8' }}>
            {showLead ? Math.round(leadV) : dash}
          </div>
        </div>
      </div>
    )
  }

  // ─── 탭 ────────────────────────────────────────────────────────────────────────
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={prevMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 26, color: MINT, lineHeight: 1 }}>‹</span>
            <span style={{ fontSize: 9, color: MINT }}>이전</span>
          </button>
          <span style={{ fontSize: 19, fontWeight: 500, color: '#e8e8e8', letterSpacing: '0.04em' }}>
            LOS · Lead Time <span style={{ color: MINT }}>{selYear}년 {m1}월</span>
          </span>
          <button onClick={nextMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 26, color: MINT, lineHeight: 1 }}>›</span>
            <span style={{ fontSize: 9, color: MINT }}>다음</span>
          </button>
        </div>
        <span style={{ fontSize: 11, color: '#5f5f5f' }}>도착일 기준 · 단체/HOU 제외</span>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {dimItem('segment', '세그먼트')}{dimItem('country', '국적')}{dimItem('account', '어카운트')}
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="animate-pulse" style={{ height: 420, background: 'var(--color-bg-tertiary)', borderRadius: 12 }} />
      ) : (
        <div>
          {/* 2단 헤더 — 1단: 그룹명 */}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ width: NAME_W, flexShrink: 0 }} />
            <div style={{ width: LOS_W, flexShrink: 0, boxShadow: MINT_OV, borderRadius: '4px 4px 0 0', textAlign: 'center', fontSize: 12, fontWeight: 500, color: MINT, padding: '4px 0' }}>평균 투숙일수</div>
            <div style={{ width: GAP_W, flexShrink: 0 }} />
            <div style={{ flex: 1, boxShadow: BLUE_OV, borderRadius: '4px 4px 0 0', textAlign: 'center', fontSize: 12, fontWeight: 500, color: BLUE, padding: '4px 0' }}>평균 리드타임</div>
          </div>
          {/* 2단 헤더 — 2단: 컬럼명 */}
          <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 6, borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ width: NAME_W, flexShrink: 0 }} />
            <div style={{ width: LOS_W, flexShrink: 0, display: 'flex', boxShadow: MINT_OV }}>
              <div style={{ width: LY_W, textAlign: 'right', paddingRight: 6, fontSize: 10, color: '#666' }}>{"'25년"}</div>
              <div style={{ width: YOY_W, textAlign: 'center', fontSize: 10, color: AMBER }}>YoY %</div>
              <div style={{ width: CY_W, textAlign: 'right', paddingRight: 6, fontSize: 10, color: '#666' }}>{"'26년"}</div>
            </div>
            <div style={{ width: GAP_W, flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', boxShadow: BLUE_OV }}>
              <div style={{ width: LLY_W, textAlign: 'right', paddingRight: 6, fontSize: 10, color: '#666' }}>{"'25년"}</div>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#454545' }}>0–{Math.round(leadMax)}일</div>
              <div style={{ width: LCY_W, textAlign: 'right', paddingRight: 6, fontSize: 10, color: '#666' }}>{"'26년"}</div>
            </div>
          </div>

          {displayRows.map((r, i) => renderRow(r, i))}
          {renderRow(totalRow, 'total', true)}

          {/* 하단 주석 */}
          <div style={{ fontSize: 11, color: '#5a5a5a', marginTop: 10 }}>리드타임 전년값 없음 — 과거 예약의 생성일이 원본에 남지 않음</div>
        </div>
      )}
    </div>
  )
}
