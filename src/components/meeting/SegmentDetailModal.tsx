'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useForecastMonthly } from '@/hooks/useForecastMonthly'
import { useBudgetMonthly } from '@/hooks/useBudgetMonthly'
import { useFcstDateContext } from '@/contexts/FcstDateContext'
import { useLatestConfirmedBudgetDate } from '@/hooks/useLatestConfirmedBudgetDate'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import type { PickupRow } from '@/hooks/usePickupData'
import type { SegGroup } from './MeetingPickupBlock'
import { monthKeyLabel } from './dummyMeetingData'

interface SegmentDetailModalProps {
  open:       boolean
  onClose:    () => void
  hotelId:    string
  monthKey:   string   // 'YYYY-MM'
  pickupRows: PickupRow[]
  roomCount:  number
  groups:     SegGroup[]
}

// ── 디자인 토큰 ──────────────────────────────────────────────────────────────────
const BG       = '#0a0a0a'
const CARD     = '#141414'
const BOLD_BG  = '#0f1d18'
const MINT     = '#00E5A0'
const RED      = '#E24B4A'
const TXT3     = '#888'
const GROUP_SHADOW = 'inset 1px 0 0 rgba(0,229,160,0.3)'
const BORDER_SUBTLE = '0.5px solid rgba(255,255,255,0.06)'

type Cell = { rn: number; adr: number; rev: number }
type SegRow = { id: string; name: string; isBold: boolean; indent: boolean; codes: string[] }
type CodeMap = Map<string, { rn: number; rev: number }>
type GapBase    = 'otb' | 'fcst'
type GapCompare = 'budget' | 'ly'
type LyMode     = 'match' | 'date'

// ── 포맷 ─────────────────────────────────────────────────────────────────────────
const fmtRn  = (v: number) => (v === 0 ? '-' : v.toLocaleString('ko-KR'))
const fmtAdr = (v: number) => (v === 0 ? '-' : `${Math.round(v / 1000)}K`)
const fmtRev = (v: number) => (v === 0 ? '-' : `${(v / 1_000_000).toFixed(1)}M`)
const fmtGapRn  = (v: number) => (v === 0 ? '-' : `${v > 0 ? '+' : ''}${v.toLocaleString('ko-KR')}`)
const fmtGapAdr = (v: number) => (v === 0 ? '-' : `${v > 0 ? '+' : ''}${Math.round(v / 1000)}K`)
const fmtGapRev = (v: number) => (v === 0 ? '-' : `${v > 0 ? '+' : ''}${(v / 1_000_000).toFixed(1)}M`)
const gapColor  = (v: number) => (v > 0 ? MINT : v < 0 ? RED : TXT3)

// 세그먼트 코드 목록으로 각 데이터소스에서 합산
function aggByCodes(codes: string[], map: CodeMap): Cell {
  let rn = 0, rev = 0
  for (const c of codes) { const v = map.get(c); if (v) { rn += v.rn; rev += v.rev } }
  return { rn, adr: rn > 0 ? Math.round(rev / rn) : 0, rev }
}

const th: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
  color: TXT3, padding: '6px 4px', background: '#131313', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, textAlign: 'right',
}
const td: React.CSSProperties = {
  fontSize: 11, padding: '6px 4px', textAlign: 'right', whiteSpace: 'nowrap',
  borderBottom: BORDER_SUBTLE,
}

export default function SegmentDetailModal({ open, onClose, hotelId, monthKey, pickupRows, roomCount }: SegmentDetailModalProps) {
  const [lyMode,    setLyMode]    = useState<LyMode>('match')
  const [gapBase,   setGapBase]   = useState<GapBase>('otb')
  const [gapCompare, setGapCompare] = useState<GapCompare>('budget')

  const [year, month] = monthKey.split('-').map(Number)   // month: 1-based

  // 세그먼트 스키마 (자식 없는 단독 main = Comp/House Use 포함) — groups는 자식 있는 main만이라 직접 조회
  const { data: schema = [] } = useMarketSchema()

  // FCST / BUDGET (기존 훅 재사용) — 세그먼트별 월 데이터
  const { fcstDate } = useFcstDateContext()
  const { data: budgetDate = null } = useLatestConfirmedBudgetDate(hotelId || undefined)
  const { data: fcstRows = [] }   = useForecastMonthly({ hotelId, year, updateDate: fcstDate })
  const { data: budgetRows = [] } = useBudgetMonthly({ hotelId, year, updateDate: budgetDate })

  // LY (a01_actual_daily) — lyMode: date=전년동일자(-1년) / match=전년동기간(c06 yoy_match)
  const { data: lyRows = [] } = useQuery({
    queryKey: ['seg-detail-ly', hotelId, monthKey, lyMode],
    enabled: !!hotelId && !!monthKey && open,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      if (lyMode === 'date') {
        const lyYear = year - 1
        const start = `${lyYear}-${String(month).padStart(2, '0')}-01`
        const end   = `${lyYear}-${String(month).padStart(2, '0')}-31`
        const { data, error } = await (supabase as any)
          .from('a01_actual_daily')
          .select('segmentation, nights, room_revenue')
          .eq('hotel_id', hotelId)
          .gte('business_date', start).lte('business_date', end)
        if (error) throw error
        return (data ?? []) as any[]
      }
      // match: c06_calendar.yoy_match → a01_actual_daily
      const calStart = `${year}-${String(month).padStart(2, '0')}-01`
      const calEnd   = `${year}-${String(month).padStart(2, '0')}-31`
      const { data: calRows, error: calErr } = await (supabase as any)
        .from('c06_calendar')
        .select('date, yoy_match')
        .gte('date', calStart).lte('date', calEnd)
      if (calErr) throw calErr
      const lyDates = (calRows ?? []).map((r: any) => r.yoy_match).filter(Boolean) as string[]
      if (lyDates.length === 0) return [] as any[]
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily')
        .select('segmentation, nights, room_revenue')
        .eq('hotel_id', hotelId)
        .in('business_date', lyDates)
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  // ── 세그먼트 코드별 집계 Map ─────────────────────────────────────────────────────
  const otbByCode = useMemo<CodeMap>(() => {
    const map: CodeMap = new Map()
    for (const r of pickupRows) {
      const d = new Date(r.business_date)
      if (d.getFullYear() !== year || d.getMonth() !== month - 1) continue
      const cur = map.get(r.segmentation) ?? { rn: 0, rev: 0 }
      map.set(r.segmentation, { rn: cur.rn + (r.otb_nights ?? 0), rev: cur.rev + (r.otb_revenue ?? 0) })
    }
    return map
  }, [pickupRows, year, month])

  const fcstByCode = useMemo<CodeMap>(() => {
    const map: CodeMap = new Map()
    for (const r of fcstRows) {
      if (Number(r.month_num) !== month) continue
      const cur = map.get(r.segmentation) ?? { rn: 0, rev: 0 }
      map.set(r.segmentation, { rn: cur.rn + (r.forecast_nights ?? 0), rev: cur.rev + (r.forecast_revenue ?? 0) })
    }
    return map
  }, [fcstRows, month])

  const budgetByCode = useMemo<CodeMap>(() => {
    const map: CodeMap = new Map()
    for (const r of budgetRows) {
      if (Number(r.month_num) !== month) continue
      const cur = map.get(r.segmentation) ?? { rn: 0, rev: 0 }
      map.set(r.segmentation, { rn: cur.rn + (r.budget_nights ?? 0), rev: cur.rev + (r.budget_revenue ?? 0) })
    }
    return map
  }, [budgetRows, month])

  const lyByCode = useMemo<CodeMap>(() => {
    const map: CodeMap = new Map()
    for (const r of lyRows as any[]) {
      const cur = map.get(r.segmentation) ?? { rn: 0, rev: 0 }
      map.set(r.segmentation, { rn: cur.rn + (r.nights ?? 0), rev: cur.rev + (r.room_revenue ?? 0) })
    }
    return map
  }, [lyRows])

  // ── 세그먼트 트리 → 평탄화 (부모 bold + 자식 indent, 부모 codes = 자식 union) ──
  // 자식 있는 main → 부모행 + 자식행 / 자식 없는 단독 main(Comp·House Use) → 단독 bold 행
  const rows = useMemo<SegRow[]>(() => {
    const mains = schema.filter(s => s.level === 'main' && s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
    const out: SegRow[] = []
    for (const main of mains) {
      const children = schema.filter(c => c.parent_id === main.id).sort((a, b) => a.order_index - b.order_index)
      if (children.length > 0) {
        out.push({ id: main.id, name: main.name, isBold: true, indent: false, codes: children.flatMap(c => c.segmentation ?? []) })
        for (const c of children) out.push({ id: c.id, name: c.name, isBold: false, indent: true, codes: c.segmentation ?? [] })
      } else {
        out.push({ id: main.id, name: main.name, isBold: true, indent: false, codes: main.segmentation ?? [] })
      }
    }
    return out
  }, [schema])

  // body scroll lock + ESC
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  if (!open) return null

  const daysInMonth = new Date(year, month, 0).getDate()
  const avail = roomCount * daysInMonth

  const otbOf    = (r: SegRow): Cell => aggByCodes(r.codes, otbByCode)
  const fcstOf   = (r: SegRow): Cell => aggByCodes(r.codes, fcstByCode)
  const budgetOf = (r: SegRow): Cell => aggByCodes(r.codes, budgetByCode)
  const lyOf     = (r: SegRow): Cell => aggByCodes(r.codes, lyByCode)
  const baseOf   = (r: SegRow): Cell => (gapBase === 'otb' ? otbOf(r) : fcstOf(r))
  const compOf   = (r: SegRow): Cell => (gapCompare === 'budget' ? budgetOf(r) : lyOf(r))

  const baseLabel = gapBase === 'otb' ? 'OTB' : 'FCST'
  const compLabel = gapCompare === 'budget' ? 'BUDGET' : 'LY'
  const lyColLabel = lyMode === 'match' ? '전년동기간' : '전년일자'

  // 합계 (HOU 제외) — 부모(자식 합산) 행 제외, HOU 세그 제외, leaf(sub)만 합산
  const isParent = (i: number) => rows[i].isBold && !!rows[i + 1]?.indent
  const isHou = (r: SegRow) => r.codes.includes('HOU')
  const sumGroup = (pick: (r: SegRow) => Cell): Cell => {
    let rn = 0, rev = 0
    rows.forEach((r, i) => { if (!isParent(i) && !isHou(r)) { const c = pick(r); rn += c.rn; rev += c.rev } })
    return { rn, rev, adr: rn > 0 ? Math.round(rev / rn) : 0 }
  }
  const totOtb    = sumGroup(otbOf)
  const totFcst   = sumGroup(fcstOf)
  const totBudget = sumGroup(budgetOf)
  const totLy     = sumGroup(lyOf)
  const totBase   = gapBase === 'otb' ? totOtb : totFcst
  const totComp   = gapCompare === 'budget' ? totBudget : totLy
  const occOf    = (rn: number) => (avail > 0 ? ((rn / avail) * 100).toFixed(1) : '0') + '%'
  const revparOf = (rev: number) => (avail > 0 ? Math.round(rev / avail).toLocaleString('ko-KR') : '—')

  // 그룹 cells 렌더 (R/N, ADR, REV) — 첫 셀에 그룹 구분선
  const groupCells = (c: Cell, color?: string, bold?: boolean) => (
    <>
      <td style={{ ...td, boxShadow: GROUP_SHADOW, color, fontWeight: bold ? 600 : 400 }} className="font-mono">{fmtRn(c.rn)}</td>
      <td style={{ ...td, color, fontWeight: bold ? 600 : 400 }} className="font-mono">{fmtAdr(c.adr)}</td>
      <td style={{ ...td, color, fontWeight: bold ? 600 : 400 }} className="font-mono">{fmtRev(c.rev)}</td>
    </>
  )
  const gapCells = (b: Cell, cmp: Cell, bold?: boolean) => {
    const gRn = b.rn - cmp.rn, gAdr = b.adr - cmp.adr, gRev = b.rev - cmp.rev
    return (
      <>
        <td style={{ ...td, boxShadow: GROUP_SHADOW, color: gapColor(gRn), fontWeight: bold ? 600 : 500 }} className="font-mono">{fmtGapRn(gRn)}</td>
        <td style={{ ...td, color: gapColor(gAdr), fontWeight: bold ? 600 : 500 }} className="font-mono">{fmtGapAdr(gAdr)}</td>
        <td style={{ ...td, color: gapColor(gRev), fontWeight: bold ? 600 : 500 }} className="font-mono">{fmtGapRev(gRev)}</td>
      </>
    )
  }

  const Pill = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} style={{
      fontSize: 11, padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
      background: active ? MINT : 'transparent', color: active ? '#0a2018' : TXT3, fontWeight: active ? 600 : 400,
    }}>{children}</button>
  )
  const Select = <T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: T[] }) => (
    <select value={value} onChange={e => onChange(e.target.value as T)} style={{
      fontSize: 11, padding: '3px 6px', borderRadius: 6, background: CARD,
      border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', outline: 'none', cursor: 'pointer',
    }}>
      {options.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
    </select>
  )

  const groupTh = (label: string, sub?: string) => (
    <th colSpan={3} style={{ ...th, textAlign: 'center', boxShadow: GROUP_SHADOW, color: '#fff' }}>
      {label}{sub && <span style={{ color: TXT3, fontWeight: 400 }}> · {sub}</span>}
    </th>
  )

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '80%', maxWidth: 1200, height: '85vh', background: BG, borderRadius: 10, border: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: BORDER_SUBTLE, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>세그먼트 상세 — {monthKeyLabel(monthKey)}</div>
          <div style={{ fontSize: 13, color: TXT3, marginTop: 2 }}>{hotelId}</div>
        </div>
        <button onClick={onClose} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 14px',
          borderRadius: 8, border: 'none', background: CARD, color: '#ccc', cursor: 'pointer',
        }}>
          <X size={16} /> 닫기
        </button>
      </div>

      {/* 컨트롤 바 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', gap: 16, flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: TXT3 }}>LY 기준</span>
          <div style={{ display: 'flex', background: CARD, borderRadius: 999, padding: 2 }}>
            <Pill active={lyMode === 'match'} onClick={() => setLyMode('match')}>전년동기간</Pill>
            <Pill active={lyMode === 'date'} onClick={() => setLyMode('date')}>전년일자</Pill>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: TXT3 }}>GAP</span>
          <Select value={gapBase} onChange={setGapBase} options={['otb', 'fcst']} />
          <span style={{ fontSize: 11, color: TXT3 }}>vs</span>
          <Select value={gapCompare} onChange={setGapCompare} options={['budget', 'ly']} />
        </div>
      </div>

      {/* 테이블 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 32px' }}>
        <table style={{ minWidth: 980, borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...th, padding: '6px 8px', textAlign: 'left', position: 'sticky', left: 0, width: 170, minWidth: 170, zIndex: 2 }}>SEGMENTATION</th>
              {groupTh('OTB')}
              {groupTh('FCST')}
              {groupTh('BUDGET')}
              {groupTh('LY', lyColLabel)}
              {groupTh(`GAP`, `${baseLabel} vs ${compLabel}`)}
            </tr>
            <tr>
              {['OTB', 'FCST', 'BUDGET', 'LY', 'GAP'].map(g => (
                ['R/N', 'ADR', 'REV'].map((s, si) => (
                  <th key={`${g}-${s}`} style={{ ...th, ...(si === 0 ? { boxShadow: GROUP_SHADOW } : {}) }}>{s}</th>
                ))
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rowBg = r.isBold ? BOLD_BG : 'transparent'
              const nameColor = r.indent ? '#999' : '#fff'
              const otb = otbOf(r), fcst = fcstOf(r), budget = budgetOf(r), ly = lyOf(r)
              return (
                <tr key={r.id} style={{ background: rowBg }}>
                  <td style={{ ...td, padding: '6px 8px', textAlign: 'left', position: 'sticky', left: 0, background: r.isBold ? BOLD_BG : BG, fontWeight: r.isBold ? 700 : 400, color: nameColor, minWidth: 170 }}>
                    {r.indent ? <><span style={{ color: '#555', marginRight: 4 }}>└</span>{r.name}</> : r.name}
                  </td>
                  {groupCells(otb,    undefined, r.isBold)}
                  {groupCells(fcst,   undefined, r.isBold)}
                  {groupCells(budget, undefined, r.isBold)}
                  {groupCells(ly,     undefined, r.isBold)}
                  {gapCells(baseOf(r), compOf(r), r.isBold)}
                </tr>
              )
            })}
            {/* 합계 (HOU 제외) */}
            <tr style={{ background: '#111' }}>
              <td style={{ ...td, padding: '6px 8px', textAlign: 'left', position: 'sticky', left: 0, background: '#111', fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.1)' }}>합계 (HOU 제외)</td>
              {[totOtb, totFcst, totBudget, totLy].map((c, i) => (
                <GroupTotal key={i} c={c} />
              ))}
              {(() => {
                const gRn = totBase.rn - totComp.rn, gAdr = totBase.adr - totComp.adr, gRev = totBase.rev - totComp.rev
                return (
                  <>
                    <td style={{ ...td, boxShadow: GROUP_SHADOW, color: gapColor(gRn), fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtGapRn(gRn)}</td>
                    <td style={{ ...td, color: gapColor(gAdr), fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtGapAdr(gAdr)}</td>
                    <td style={{ ...td, color: gapColor(gRev), fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtGapRev(gRev)}</td>
                  </>
                )
              })()}
            </tr>
            {/* OCC */}
            <tr style={{ background: '#111' }}>
              <td style={{ ...td, padding: '6px 8px', textAlign: 'left', position: 'sticky', left: 0, background: '#111', fontWeight: 600, color: TXT3 }}>OCC</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: MINT, fontWeight: 600 }}>{occOf(totOtb.rn)}</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: MINT, fontWeight: 600 }}>{occOf(totFcst.rn)}</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: TXT3, fontWeight: 600 }}>{occOf(totBudget.rn)}</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: TXT3, fontWeight: 600 }}>{occOf(totLy.rn)}</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: TXT3 }}>—</td>
            </tr>
            {/* Rev.PAR */}
            <tr style={{ background: '#111' }}>
              <td style={{ ...td, padding: '6px 8px', textAlign: 'left', position: 'sticky', left: 0, background: '#111', fontWeight: 600, color: TXT3 }}>Rev.PAR</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: '#fff', fontWeight: 600 }}>{revparOf(totOtb.rev)}</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: '#fff', fontWeight: 600 }}>{revparOf(totFcst.rev)}</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: TXT3, fontWeight: 600 }}>{revparOf(totBudget.rev)}</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: TXT3, fontWeight: 600 }}>{revparOf(totLy.rev)}</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: TXT3 }}>—</td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </div>,
    document.body,
  )
}

// 합계 행의 그룹 셀 (R/N, ADR, REV)
function GroupTotal({ c }: { c: Cell }) {
  return (
    <>
      <td style={{ ...td, boxShadow: GROUP_SHADOW, fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtRn(c.rn)}</td>
      <td style={{ ...td, fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtAdr(c.adr)}</td>
      <td style={{ ...td, fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtRev(c.rev)}</td>
    </>
  )
}
