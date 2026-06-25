'use client'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMarketSchema, type MarketSchemaRow } from '@/hooks/useMarketSchema'
import { useOtbData } from '@/hooks/useOtbData'
import { useLyPacing } from '@/hooks/useLyPacing'
import { useTheme } from '@/contexts/ThemeContext'

interface Props {
  open:       boolean
  onClose:    () => void
  monthKey:   string        // 'YYYY-MM'
  monthLabel: string        // 'Jun 2026'
  isOtb:      boolean       // true=OTB월, false=Actual월
  hotelId:    string
  roomCount:  number
}

// ── 포맷 ───────────────────────────────────────────────────────────────────────
const fmtInt      = (v: number) => Math.round(v).toLocaleString()
const fmtSignInt  = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(Math.round(v)).toLocaleString()}`
const fmtRevM     = (v: number) => `${(v / 1_000_000).toFixed(1)}M`
const fmtSignRevM = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v / 1_000_000).toFixed(1)}M`

const NEG = 'var(--color-negative)'

type Stat = { n: number; r: number }       // nights, revenue
const adr = (s: Stat) => (s.n > 0 ? s.r / s.n : 0)

export default function ActualBudgetDetailModal({ open, onClose, monthKey, monthLabel, isOtb, hotelId, roomCount }: Props) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [compareMode, setCompareMode] = useState<'budget' | 'ly'>('budget')

  const year  = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))

  // ── ESC + scroll lock ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // ── 데이터 소스 ─────────────────────────────────────────────────────────────
  const { data: schema = [], loading: sLoad } = useMarketSchema()
  const { data: otbData = [], loading: oLoad } = useOtbData()
  const { data: lyData  = [], loading: lLoad } = useLyPacing('v1')

  const { data: budgetRows = [], isLoading: bLoad } = useQuery({
    queryKey: ['ab_detail_budget', hotelId, monthKey],
    enabled: open && !!hotelId && !!monthKey,
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
      const { data, error } = await (supabase as any)
        .from('a04_budget_mtd')
        .select('segmentation, budget_nights, budget_revenue')
        .eq('hotel_id', hotelId)
        .eq('update_date', dateRow.update_date)
        .eq('confirmed', true)
        .eq('year', year)
        .eq('month', month)
      if (error) throw error
      return (data ?? []) as { segmentation: string; budget_nights: number; budget_revenue: number }[]
    },
  })

  const loading = sLoad || oLoad || lLoad || bLoad

  // ── segmentation 코드별 합산 맵 ──────────────────────────────────────────────
  // Actual/OTB: otbData에서 monthKey 월 필터 → isOtb면 otb_*, 아니면 act_*
  const actualSeg = useMemo(() => {
    const m = new Map<string, Stat>()
    for (const r of otbData) {
      if (r.business_date.slice(0, 7) !== monthKey) continue
      const e = m.get(r.segmentation) ?? { n: 0, r: 0 }
      e.n += (isOtb ? r.otb_nights  : r.act_nights)  ?? 0
      e.r += (isOtb ? r.otb_revenue : r.act_revenue) ?? 0
      m.set(r.segmentation, e)
    }
    return m
  }, [otbData, monthKey, isOtb])

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

  const lySeg = useMemo(() => {
    const m = new Map<string, Stat>()
    for (const r of lyData) {
      if (r.business_date.slice(0, 7) !== monthKey) continue
      const e = m.get(r.segmentation) ?? { n: 0, r: 0 }
      e.n += r.ly_nights  ?? 0
      e.r += r.ly_revenue ?? 0
      m.set(r.segmentation, e)
    }
    return m
  }, [lyData, monthKey])

  const compareSeg = compareMode === 'budget' ? budgetSeg : lySeg

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

  const daysInMonth = new Date(year, month, 0).getDate()
  const denom = roomCount * daysInMonth

  if (!open) return null

  // ── 라벨/색상 상수 ───────────────────────────────────────────────────────────
  const actualLabel  = isOtb ? 'OTB' : 'Actual'
  const compareLabel = compareMode === 'budget' ? 'Budget' : 'Last Year'
  const cmpSep  = 'inset 1px 0 0 rgba(0,229,160,0.3)'
  const gapSep  = compareMode === 'budget' ? 'inset 1px 0 0 rgba(255,100,100,0.3)' : 'inset 1px 0 0 rgba(255,200,80,0.3)'

  // 헤더 셀 스타일
  const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.45)', padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }
  const thL: React.CSSProperties = { ...th, textAlign: 'left' }
  const td: React.CSSProperties = { fontSize: 11, padding: '5px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

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

    return (
      <tr key={s.id} style={{ background: rowBg }}>
        <td style={{ ...td, textAlign: 'left', color: nameColor, fontWeight: s.is_bold ? 700 : 500, paddingLeft: 10 + indent * 14 }}>{s.name}</td>

        {/* Actual / OTB — schema fontColor */}
        <td style={{ ...td, color: rowColor }}>{dash(a.n > 0, fmtInt(a.n))}</td>
        <td style={{ ...td, color: rowColor }}>{dash(a.n > 0, fmtInt(aAdr))}</td>
        <td style={{ ...td, color: rowColor }}>{dash(a.n > 0, fmtRevM(a.r))}</td>

        {/* Budget / LY — 0.5 흐림 */}
        <td style={{ ...td, color: 'rgba(255,255,255,0.5)', boxShadow: cmpSep }}>{dash(c.n > 0, fmtInt(c.n))}</td>
        <td style={{ ...td, color: 'rgba(255,255,255,0.5)' }}>{dash(c.n > 0, fmtInt(cAdr))}</td>
        <td style={{ ...td, color: 'rgba(255,255,255,0.5)' }}>{dash(c.n > 0, fmtRevM(c.r))}</td>

        {/* GAP — 양수 schema, 음수 red */}
        <td style={{ ...td, color: gapColor(a.n - c.n, rowColor), boxShadow: gapSep }}>{dash(a.n > 0 || c.n > 0, fmtSignInt(a.n - c.n))}</td>
        <td style={{ ...td, color: gapColor(aAdr - cAdr, rowColor) }}>{dash(a.n > 0 || c.n > 0, fmtSignInt(aAdr - cAdr))}</td>
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
    <tr style={{ background: '#0d0d0d' }}>
      <td style={{ ...td, textAlign: 'left', color: '#888', fontWeight: 600 }}>{label}</td>
      <td style={{ ...td, color: '#cfcfcf' }} colSpan={3}>{av}</td>
      <td style={{ ...td, color: 'rgba(255,255,255,0.5)', boxShadow: cmpSep }} colSpan={3}>{cv}</td>
      <td style={{ ...td, color: gpos ? '#00E5A0' : NEG, boxShadow: gapSep }} colSpan={3}>{gv}</td>
    </tr>
  )

  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0a0a0a', border: '1px solid #1f1f1f', borderRadius: 14, width: 'auto', maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #1a1a1a', flexShrink: 0, gap: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center' }}>{monthLabel}{badge}</span>
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

        {/* 본문 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 13 }}>불러오는 중…</div>
          ) : (
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead>
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
                <tr style={{ background: '#111111', borderTop: '1px solid rgba(0,229,160,0.4)' }}>
                  <td style={{ ...td, textAlign: 'left', color: '#fff', fontWeight: 700, borderTop: '1px solid rgba(0,229,160,0.4)' }}>TOTAL</td>
                  <td style={{ ...td, color: '#fff', fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtInt(tA.n)}</td>
                  <td style={{ ...td, color: '#fff', fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtInt(tAAdr)}</td>
                  <td style={{ ...td, color: '#fff', fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtRevM(tA.r)}</td>
                  <td style={{ ...td, color: 'rgba(255,255,255,0.6)', fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)', boxShadow: cmpSep }}>{fmtInt(tC.n)}</td>
                  <td style={{ ...td, color: 'rgba(255,255,255,0.6)', fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtInt(tCAdr)}</td>
                  <td style={{ ...td, color: 'rgba(255,255,255,0.6)', fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtRevM(tC.r)}</td>
                  <td style={{ ...td, color: tA.n - tC.n >= 0 ? '#00E5A0' : NEG, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)', boxShadow: gapSep }}>{fmtSignInt(tA.n - tC.n)}</td>
                  <td style={{ ...td, color: tAAdr - tCAdr >= 0 ? '#00E5A0' : NEG, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtSignInt(tAAdr - tCAdr)}</td>
                  <td style={{ ...td, color: tA.r - tC.r >= 0 ? '#00E5A0' : NEG, fontWeight: 600, borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtSignRevM(tA.r - tC.r)}</td>
                </tr>

                {/* OCC / REVPAR */}
                {metricRow('OCC', `${occA.toFixed(1)}%`, `${occC.toFixed(1)}%`, `${occA - occC >= 0 ? '+' : ''}${(occA - occC).toFixed(1)}%p`, occA - occC >= 0)}
                {metricRow('RevPAR', fmtInt(rpA), fmtInt(rpC), fmtSignInt(rpA - rpC), rpA - rpC >= 0)}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
