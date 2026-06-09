'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { ForecastSchema, ForecastDayData } from '@/lib/forecast/types'
import { type EditedValues, makeEditKey } from '@/lib/forecast/save'
import { fmtRn, fmtAdr, fmtRev, fmtOcc } from '@/lib/forecast/format'

interface MtdModalProps {
  isOpen:       boolean
  onClose:      () => void
  schema:       ForecastSchema
  data:         ForecastDayData[]
  editedValues: EditedValues
  year:         number
  month:        number
  otbDate:      string
  hotelId:      string
}

// ── helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0') }

function isMtd(businessDate: string, start: string, end: string): boolean {
  return businessDate >= start && businessDate <= end
}

function calcSegOtb(
  data:  ForecastDayData[],
  codes: string[],
  start: string,
  end:   string,
): { rn: number; adr: number; rev: number } {
  let rn = 0, rev = 0
  for (const day of data) {
    if (!isMtd(day.business_date, start, end)) continue
    for (const code of codes) {
      const v = day.values[code]
      if (!v) continue
      rn  += v.otb_rn
      rev += v.otb_rev
    }
  }
  return { rn, adr: rn > 0 ? Math.round(rev / rn) : 0, rev }
}

function calcSegFcst(
  data:         ForecastDayData[],
  codes:        string[],
  editedValues: EditedValues,
  start:        string,
  end:          string,
): { rn: number; adr: number; rev: number } {
  let rn = 0, rev = 0
  for (const day of data) {
    if (!isMtd(day.business_date, start, end)) continue
    for (const code of codes) {
      const v = day.values[code]
      if (!v) continue
      const edited = editedValues.get(makeEditKey(day.business_date, code))
      const fRn  = edited?.rn  ?? v.rn
      const fAdr = edited?.adr ?? v.adr
      rn  += fRn
      rev += fRn * fAdr
    }
  }
  return { rn, adr: rn > 0 ? Math.round(rev / rn) : 0, rev }
}

// ── styles ─────────────────────────────────────────────────────────────────────

const BORDER     = '0.5px solid rgba(255,255,255,0.08)'
const GRP_BORDER = '1px solid rgba(255,255,255,0.1)'
const TEXT       = 'rgba(255,255,255,0.85)'
const TEXT_SEC   = 'rgba(255,255,255,0.45)'
const TEXT_MUTED = 'rgba(255,255,255,0.25)'
const BG         = '#111'
const BG_HDR     = '#161616'
const BG_TOTAL   = '#1a1a1a'

const thBase: React.CSSProperties = {
  padding:      '7px 10px',
  fontSize:     11,
  fontWeight:   400,
  color:        TEXT_SEC,
  background:   BG_HDR,
  whiteSpace:   'nowrap',
  textAlign:    'center',
  borderBottom: BORDER,
  borderRight:  BORDER,
  position:     'sticky',
  top:          0,
  zIndex:       2,
}

const tdBase: React.CSSProperties = {
  padding:      '6px 10px',
  fontSize:     11,
  whiteSpace:   'nowrap',
  borderBottom: BORDER,
  borderRight:  BORDER,
  textAlign:    'right',
  color:        TEXT,
}

function gapColor(val: number): React.CSSProperties {
  if (val > 0) return { color: '#00E5A0', fontWeight: 600 }
  if (val < 0) return { color: '#f87171', fontWeight: 600 }
  return { color: TEXT_MUTED }
}

function fmtGapRn(v: number)  { return v === 0 ? '—' : (v > 0 ? '+' : '') + fmtRn(Math.abs(v)) }
function fmtGapAdr(v: number) { return v === 0 ? '—' : (v > 0 ? '+' : '') + fmtAdr(Math.abs(v)) }
function fmtGapRev(v: number) { return v === 0 ? '—' : (v > 0 ? '+' : '') + fmtRev(Math.abs(v)) }

type BudgetRow = {
  segmentation:   string
  budget_nights:  number
  budget_revenue: number
}

type GapBase = 'otb' | 'budget'

type NodeLike = ForecastSchema['nodes'][0]

// ── Component ──────────────────────────────────────────────────────────────────

export function MtdModal({
  isOpen, onClose, schema, data, editedValues, year, month, otbDate, hotelId,
}: MtdModalProps) {
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([])
  const [gapBase,    setGapBase]    = useState<GapBase>('otb')

  // Budget fetch — a04_budget_mtd 직접 조회 (confirmed=true)
  useEffect(() => {
    if (!isOpen || !hotelId) return
    ;(async () => {
      const { data: rows } = await (supabase as any)
        .from('a04_budget_mtd')
        .select('segmentation, budget_nights, budget_revenue')
        .eq('hotel_id', hotelId)
        .eq('year',     year)
        .eq('month',    month)
        .eq('confirmed', true)
      if (rows) setBudgetRows(rows as BudgetRow[])
      else setBudgetRows([])
    })().catch(() => setBudgetRows([]))
  }, [isOpen, hotelId, year, month])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const startDate = `${year}-${pad(month)}-01`
  const lastDay   = new Date(year, month, 0).getDate()
  const endDate   = `${year}-${pad(month)}-${pad(lastDay)}`

  const budgetMap = useMemo(() => {
    const map = new Map<string, { rn: number; adr: number; rev: number }>()
    for (const r of budgetRows) {
      const existing = map.get(r.segmentation)
      if (existing) {
        existing.rn  += r.budget_nights
        existing.rev += r.budget_revenue
      } else {
        map.set(r.segmentation, { rn: r.budget_nights, adr: 0, rev: r.budget_revenue })
      }
    }
    for (const [, v] of map) {
      v.adr = v.rn > 0 ? Math.round(v.rev / v.rn) : 0
    }
    return map
  }, [budgetRows])

  function getBudget(codes: string[]): { rn: number; adr: number; rev: number } {
    let rn = 0, rev = 0
    for (const code of codes) {
      const b = budgetMap.get(code)
      if (b) { rn += b.rn; rev += b.rev }
    }
    return { rn, adr: rn > 0 ? Math.round(rev / rn) : 0, rev }
  }

  const totals = useMemo(() => {
    const codes = schema.allSegmentationCodes
    const otb   = calcSegOtb(data, codes, startDate, endDate)
    const fcst  = calcSegFcst(data, codes, editedValues, startDate, endDate)
    const bgt   = getBudget(codes)
    return { otb, fcst, bgt }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, schema, editedValues, budgetMap, startDate, endDate])

  const daysInRange = new Date(year, month, 0).getDate()
  const rc          = schema.roomCount

  // ── 노드 행 렌더링 ────────────────────────────────────────────────────────────

  function renderNodeRows(): JSX.Element[] {
    const rows: JSX.Element[] = []

    function renderNode(node: NodeLike, depth: number) {
      const codes  = node.segmentationCodes
      const otb    = calcSegOtb(data, codes, startDate, endDate)
      const fcst   = calcSegFcst(data, codes, editedValues, startDate, endDate)
      const bgt    = getBudget(codes)
      const base   = gapBase === 'otb' ? otb : bgt
      const gapRn  = fcst.rn  - base.rn
      const gapAdr = fcst.adr - base.adr
      const gapRev = fcst.rev - base.rev
      const isMain = depth === 0
      const pl     = depth === 0 ? 12 : 20 + (depth - 1) * 12
      const fw     = isMain ? 600 : 400
      const col    = isMain ? TEXT : TEXT_SEC
      const rowBg  = node.bgDarkColor ?? BG

      const dash = <span style={{ color: TEXT_MUTED }}>—</span>

      rows.push(
        <tr key={node.id} className="mtd-row" style={{ background: rowBg }}>
          {/* Segmentation */}
          <td style={{
            ...tdBase,
            textAlign:   'left',
            paddingLeft: pl,
            fontWeight:  fw,
            color:       col,
            position:    'sticky',
            left:        0,
            zIndex:      1,
            background:  rowBg,
            borderRight: GRP_BORDER,
          }}>
            {depth > 0 && <span style={{ marginRight: 4, color: TEXT_MUTED }}>└</span>}
            {node.name}
          </td>

          {/* OTB */}
          <td style={{ ...tdBase, borderLeft: GRP_BORDER, fontWeight: fw, background: rowBg }}>{fmtRn(otb.rn)}</td>
          <td style={{ ...tdBase, fontWeight: fw, background: rowBg }}>{otb.rn > 0 ? fmtAdr(otb.adr) : dash}</td>
          <td style={{ ...tdBase, fontWeight: fw, borderRight: GRP_BORDER, background: rowBg }}>{otb.rn > 0 ? fmtRev(otb.rev) : dash}</td>

          {/* FCST */}
          <td style={{ ...tdBase, fontWeight: fw, background: rowBg }}>{fmtRn(fcst.rn)}</td>
          <td style={{ ...tdBase, fontWeight: fw, background: rowBg }}>{fcst.rn > 0 ? fmtAdr(fcst.adr) : dash}</td>
          <td style={{ ...tdBase, fontWeight: fw, borderRight: GRP_BORDER, background: rowBg }}>{fcst.rn > 0 ? fmtRev(fcst.rev) : dash}</td>

          {/* BUDGET */}
          <td style={{ ...tdBase, fontWeight: fw, background: rowBg }}>{bgt.rn > 0 ? fmtRn(bgt.rn) : dash}</td>
          <td style={{ ...tdBase, fontWeight: fw, background: rowBg }}>{bgt.rn > 0 ? fmtAdr(bgt.adr) : dash}</td>
          <td style={{ ...tdBase, fontWeight: fw, borderRight: GRP_BORDER, background: rowBg }}>{bgt.rn > 0 ? fmtRev(bgt.rev) : dash}</td>

          {/* GAP */}
          <td style={{ ...tdBase, borderLeft: GRP_BORDER, background: rowBg, ...gapColor(gapRn) }}>{fmtGapRn(gapRn)}</td>
          <td style={{ ...tdBase, background: rowBg, ...gapColor(gapAdr) }}>{fmtGapAdr(gapAdr)}</td>
          <td style={{ ...tdBase, background: rowBg, ...gapColor(gapRev) }}>{fmtGapRev(gapRev)}</td>
        </tr>
      )

      for (const child of node.children ?? []) renderNode(child, depth + 1)
    }

    for (const node of schema.nodes) renderNode(node, 0)
    return rows
  }

  if (!isOpen) return null

  const { otb: totOtb, fcst: totFcst, bgt: totBgt } = totals
  const totBase   = gapBase === 'otb' ? totOtb : totBgt
  const totGapRn  = totFcst.rn  - totBase.rn
  const totGapAdr = totFcst.adr - totBase.adr
  const totGapRev = totFcst.rev - totBase.rev

  const metricLabels = ['R-N','ADR','REV','R-N','ADR','REV','R-N','ADR','REV','ΔR-N','ΔADR','ΔREV'] as const
  const gapLabel = gapBase === 'otb' ? 'GAP (FCST−OTB)' : 'GAP (FCST−Budget)'

  return (
    <div
      onClick={onClose}
      style={{
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.65)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:         60,
        padding:        '24px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:    BG,
          border:        '0.5px solid rgba(255,255,255,0.12)',
          borderRadius:  12,
          width:         '100%',
          maxWidth:      1100,
          maxHeight:     'calc(100vh - 48px)',
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '14px 20px',
          borderBottom:   BORDER,
          flexShrink:     0,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>MTD 실적 요약</div>
            <div style={{ fontSize: 11, color: TEXT_SEC, marginTop: 2 }}>
              {year}년 {month}월 · 월 전체 기준
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* GAP 기준 토글 */}
            <div
              onClick={() => setGapBase(prev => prev === 'otb' ? 'budget' : 'otb')}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                background:   'rgba(255,255,255,0.06)',
                borderRadius: 999,
                padding:      3,
                border:       '0.5px solid rgba(255,255,255,0.12)',
                cursor:       'pointer',
                userSelect:   'none',
                position:     'relative',
                flexShrink:   0,
              }}
            >
              <div style={{
                position:     'absolute',
                top:          3,
                left:         gapBase === 'otb' ? 3 : '50%',
                width:        'calc(50% - 3px)',
                height:       'calc(100% - 6px)',
                background:   '#00E5A0',
                borderRadius: 999,
                transition:   'left 0.22s cubic-bezier(0.4,0,0.2,1)',
                zIndex:       0,
              }} />
              <div style={{
                padding:    '4px 10px',
                borderRadius: 999,
                fontSize:   11,
                fontWeight: 600,
                position:   'relative',
                zIndex:     1,
                whiteSpace: 'nowrap',
                color:      gapBase === 'otb' ? '#0F2E20' : 'rgba(255,255,255,0.35)',
                transition: 'color 0.2s',
              }}>
                vs OTB
              </div>
              <div style={{
                padding:    '4px 10px',
                borderRadius: 999,
                fontSize:   11,
                fontWeight: 600,
                position:   'relative',
                zIndex:     1,
                whiteSpace: 'nowrap',
                color:      gapBase === 'budget' ? '#0F2E20' : 'rgba(255,255,255,0.35)',
                transition: 'color 0.2s',
              }}>
                vs Budget
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                width:          28,
                height:         28,
                borderRadius:   6,
                border:         '0.5px solid rgba(255,255,255,0.1)',
                background:     'rgba(255,255,255,0.05)',
                color:          TEXT_SEC,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                cursor:         'pointer',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
          <style>{`
            .mtd-row:hover td { background: rgba(0,229,160,0.04) !important; }
          `}</style>
          <table style={{
            borderCollapse: 'separate',
            borderSpacing:  0,
            borderLeft:     BORDER,
            borderTop:      BORDER,
            tableLayout:    'fixed',
            minWidth:       1050,
            width:          '100%',
          }}>
            <colgroup>
              <col style={{ width: 150 }} />
              <col style={{ width: 64 }} /><col style={{ width: 68 }} /><col style={{ width: 76 }} />
              <col style={{ width: 64 }} /><col style={{ width: 68 }} /><col style={{ width: 76 }} />
              <col style={{ width: 64 }} /><col style={{ width: 68 }} /><col style={{ width: 76 }} />
              <col style={{ width: 64 }} /><col style={{ width: 68 }} /><col style={{ width: 76 }} />
            </colgroup>

            <thead>
              <tr>
                <th style={{ ...thBase, textAlign: 'left', position: 'sticky', left: 0, zIndex: 3, borderRight: GRP_BORDER }}>
                  SEGMENTATION
                </th>
                <th style={{ ...thBase, borderLeft: GRP_BORDER }} colSpan={3}>현재 OTB</th>
                <th style={{ ...thBase, borderLeft: GRP_BORDER }} colSpan={3}>FCST</th>
                <th style={{ ...thBase, borderLeft: GRP_BORDER }} colSpan={3}>BUDGET</th>
                <th style={{ ...thBase, borderLeft: GRP_BORDER }} colSpan={3}>{gapLabel}</th>
              </tr>
              <tr>
                <th style={{ ...thBase, textAlign: 'left', position: 'sticky', left: 0, zIndex: 3, borderRight: GRP_BORDER }} />
                {metricLabels.map((m, i) => (
                  <th key={i} style={{
                    ...thBase,
                    borderLeft: [0, 3, 6, 9].includes(i) ? GRP_BORDER : BORDER,
                  }}>
                    {m}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {renderNodeRows()}

              {/* 합계 */}
              <tr style={{ background: BG_TOTAL }}>
                <td style={{
                  ...tdBase,
                  textAlign:   'left',
                  fontWeight:  700,
                  color:       TEXT,
                  background:  BG_TOTAL,
                  position:    'sticky',
                  left:        0,
                  zIndex:      1,
                  borderRight: GRP_BORDER,
                  borderTop:   '1px solid rgba(255,255,255,0.15)',
                }}>
                  합계
                </td>
                {[
                  { v: fmtRn(totOtb.rn),   bl: GRP_BORDER },
                  { v: fmtAdr(totOtb.adr)  },
                  { v: fmtRev(totOtb.rev),  br: GRP_BORDER },
                  { v: fmtRn(totFcst.rn)   },
                  { v: fmtAdr(totFcst.adr) },
                  { v: fmtRev(totFcst.rev), br: GRP_BORDER },
                  { v: fmtRn(totBgt.rn)    },
                  { v: fmtAdr(totBgt.adr)  },
                  { v: fmtRev(totBgt.rev),  br: GRP_BORDER },
                ].map((c, i) => (
                  <td key={i} style={{
                    ...tdBase,
                    fontWeight:  700,
                    background:  BG_TOTAL,
                    borderLeft:  c.bl ?? BORDER,
                    borderRight: c.br ?? BORDER,
                    borderTop:   '1px solid rgba(255,255,255,0.15)',
                  }}>
                    {c.v}
                  </td>
                ))}
                <td style={{ ...tdBase, background: BG_TOTAL, borderLeft: GRP_BORDER, borderTop: '1px solid rgba(255,255,255,0.15)', ...gapColor(totGapRn) }}>
                  {fmtGapRn(totGapRn)}
                </td>
                <td style={{ ...tdBase, background: BG_TOTAL, borderTop: '1px solid rgba(255,255,255,0.15)', ...gapColor(totGapAdr) }}>
                  {fmtGapAdr(totGapAdr)}
                </td>
                <td style={{ ...tdBase, background: BG_TOTAL, borderTop: '1px solid rgba(255,255,255,0.15)', ...gapColor(totGapRev) }}>
                  {fmtGapRev(totGapRev)}
                </td>
              </tr>

              {/* OCC */}
              <tr style={{ background: BG_HDR }}>
                <td style={{ ...tdBase, textAlign: 'left', color: TEXT_SEC, fontStyle: 'italic', background: BG_HDR, position: 'sticky', left: 0, zIndex: 1, borderRight: GRP_BORDER }}>
                  OCC
                </td>
                <td colSpan={2} style={{ ...tdBase, textAlign: 'center', background: BG_HDR, borderLeft: GRP_BORDER }}>
                  {daysInRange > 0 && rc > 0 ? fmtOcc(totOtb.rn, rc * daysInRange) : '—'}
                </td>
                <td style={{ ...tdBase, background: BG_HDR, borderRight: GRP_BORDER }} />
                <td colSpan={2} style={{ ...tdBase, textAlign: 'center', background: BG_HDR }}>
                  {daysInRange > 0 && rc > 0 ? fmtOcc(totFcst.rn, rc * daysInRange) : '—'}
                </td>
                <td style={{ ...tdBase, background: BG_HDR, borderRight: GRP_BORDER }} />
                <td colSpan={2} style={{ ...tdBase, textAlign: 'center', background: BG_HDR }}>
                  {daysInRange > 0 && rc > 0 ? fmtOcc(totBgt.rn, rc * daysInRange) : '—'}
                </td>
                <td style={{ ...tdBase, background: BG_HDR, borderRight: GRP_BORDER }} />
                <td colSpan={3} style={{
                  ...tdBase,
                  textAlign:   'center',
                  background:  BG_HDR,
                  borderLeft:  GRP_BORDER,
                  ...gapColor(totGapRn),
                }}>
                  {daysInRange > 0 && rc > 0
                    ? (() => {
                        const diff = (totGapRn / (rc * daysInRange)) * 100
                        return (diff > 0 ? '+' : '') + diff.toFixed(1) + '%p'
                      })()
                    : '—'
                  }
                </td>
              </tr>

              {/* REVPAR */}
              <tr style={{ background: BG_HDR }}>
                <td style={{ ...tdBase, textAlign: 'left', color: TEXT_SEC, fontStyle: 'italic', background: BG_HDR, position: 'sticky', left: 0, zIndex: 1, borderRight: GRP_BORDER }}>
                  REVPAR
                </td>
                <td colSpan={2} style={{ ...tdBase, textAlign: 'center', background: BG_HDR, borderLeft: GRP_BORDER }}>
                  {daysInRange > 0 && rc > 0 ? fmtAdr(Math.round(totOtb.rev / (rc * daysInRange))) : '—'}
                </td>
                <td style={{ ...tdBase, background: BG_HDR, borderRight: GRP_BORDER }} />
                <td colSpan={2} style={{ ...tdBase, textAlign: 'center', background: BG_HDR }}>
                  {daysInRange > 0 && rc > 0 ? fmtAdr(Math.round(totFcst.rev / (rc * daysInRange))) : '—'}
                </td>
                <td style={{ ...tdBase, background: BG_HDR, borderRight: GRP_BORDER }} />
                <td colSpan={2} style={{ ...tdBase, textAlign: 'center', background: BG_HDR }}>
                  {daysInRange > 0 && rc > 0 ? fmtAdr(Math.round(totBgt.rev / (rc * daysInRange))) : '—'}
                </td>
                <td style={{ ...tdBase, background: BG_HDR, borderRight: GRP_BORDER }} />
                <td colSpan={3} style={{
                  ...tdBase,
                  textAlign:   'center',
                  background:  BG_HDR,
                  borderLeft:  GRP_BORDER,
                  ...gapColor(totGapRev),
                }}>
                  {daysInRange > 0 && rc > 0
                    ? (() => {
                        const diff = Math.round(totGapRev / (rc * daysInRange))
                        return (diff > 0 ? '+' : '') + fmtAdr(Math.abs(diff))
                      })()
                    : '—'
                  }
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{
          padding:        '10px 20px',
          borderTop:      BORDER,
          flexShrink:     0,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, color: TEXT_MUTED }}>ADR 천원 · REV 백만원 · GAP = FCST − {gapBase === 'otb' ? 'OTB' : 'Budget'} · 월 전체</span>
          <span style={{ fontSize: 11, color: TEXT_MUTED }}>ESC · 닫기</span>
        </div>
      </div>
    </div>
  )
}
