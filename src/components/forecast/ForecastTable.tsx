'use client'

import { Fragment, useMemo, useState } from 'react'
import type { ForecastSchema, ForecastDayData, CalendarMap } from '@/lib/forecast/types'
import { buildColumnGroups } from '@/lib/forecast/schema'
import { fmtRn, fmtAdr, fmtRev, fmtOcc } from '@/lib/forecast/format'
import { useTheme } from '@/contexts/ThemeContext'

interface ForecastTableProps {
  schema:          ForecastSchema
  data:            ForecastDayData[]
  selectedNodeIds: Set<string>
  calendar?:       CalendarMap
  threshold?:      number   // auto-expand when any seg's otb_rn >= rn + threshold
}

const BORDER       = '0.5px solid var(--color-border-default)'
const DASH_BORDER  = '0.5px dashed var(--color-border-default)'
const GROUP_BORDER = '1.5px solid var(--color-border-default)'

const HEADER_BG = 'var(--color-bg-secondary)'
const OTB_BG    = 'var(--color-bg-secondary)'
const BODY_BG   = 'var(--color-bg-primary)'
const TEXT      = 'var(--color-text-primary)'
const TEXT_SEC  = 'var(--color-text-secondary)'
const MUTED     = 'var(--color-text-muted)'
const TERTIARY  = 'var(--color-text-tertiary)'
const WARNING   = 'var(--color-warning, #F5A623)'

// ── Sticky geometry ──────────────────────────────────────────────────────────
const DATE_W    = 150   // date column fixed width
const TOT_W     = 72    // each Total sub-column width (OCC / RN / ADR / REV)
const TOT_OCC_L = DATE_W                 // 150
const TOT_RN_L  = TOT_OCC_L + TOT_W     // 222
const TOT_ADR_L = TOT_RN_L  + TOT_W     // 294
const TOT_REV_L = TOT_ADR_L + TOT_W     // 366
const HDR_H     = 35   // approximate header row height (px)
const TOT_REV_W    = 90   // REV column wider for monthly totals ("1,240,000")
const SEG_COL_W    = TOT_W  // segment metric column width (same as Total)
const TOT_HDR_BORDER = '1px solid var(--color-border-default)'  // opaque 1px for Total header

const tdBase: React.CSSProperties = {
  borderBottom: BORDER,
  borderRight:  BORDER,
  padding:      '8px 10px',
  fontSize:     '12px',
  whiteSpace:   'nowrap',
}

function subColRightBorder(
  groupIdx:    number,
  totalGroups: number,
  subColIdx:   number,
  subColCount: number,
  isSummary:   boolean,
): string {
  if (isSummary && subColIdx === 0 && subColCount > 1) return DASH_BORDER
  if (subColIdx === subColCount - 1 && groupIdx < totalGroups - 1) return GROUP_BORDER
  return BORDER
}

function calcFromData(
  daily:    ForecastDayData,
  segCodes: string[],
): { rn: number; adr: number; rev: number } | null {
  let rn = 0, rev = 0, hasData = false
  for (const code of segCodes) {
    const v = daily.values[code]
    if (v) { rn += v.rn; rev += v.rev; hasData = true }
  }
  if (!hasData) return null
  return { rn, adr: rn > 0 ? Math.round(rev / rn) : 0, rev }
}

function calcOtbFromData(
  daily:    ForecastDayData,
  segCodes: string[],
): { rn: number; adr: number; rev: number } | null {
  let rn = 0, rev = 0, hasData = false
  for (const code of segCodes) {
    const v = daily.values[code]
    if (v) { rn += v.otb_rn; rev += v.otb_rev; hasData = true }
  }
  if (!hasData) return null
  return { rn, adr: rn > 0 ? Math.round(rev / rn) : 0, rev }
}

function canExpand(daily: ForecastDayData): boolean {
  return !daily.is_actual_day
}

function shouldAutoExpand(daily: ForecastDayData, threshold: number): boolean {
  if (daily.is_actual_day) return false
  for (const code in daily.values) {
    const v = daily.values[code]
    if (v.otb_rn >= v.rn + threshold) return true
  }
  return false
}

export default function ForecastTable({ schema, data, selectedNodeIds, calendar, threshold = 0 }: ForecastTableProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  // 다크모드에서 순수 흰색(#FFF) 대신 off-white로 톤 다운
  const TEXT = isDark ? 'rgba(255,255,255,0.88)' : 'var(--color-text-primary)'
  const thBase: React.CSSProperties = {
    borderBottom: BORDER,
    borderRight:  BORDER,
    padding:      '8px 10px',
    fontSize:     '12px',
    whiteSpace:   'nowrap',
    color:        TEXT,
    background:   HEADER_BG,
  }

  const [manualExpandedDates, setManualExpandedDates] = useState<Set<string>>(new Set())

  function toggleExpand(date: string) {
    setManualExpandedDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const allGroups = useMemo(
    () => buildColumnGroups(schema.nodes, schema.allSegmentationCodes),
    [schema],
  )

  const columnGroups = useMemo(() => {
    return allGroups.filter(g => g.id === 'total' || selectedNodeIds.has(g.id))
  }, [allGroups, selectedNodeIds])

  const totalGroups = columnGroups.length
  const hasSubRow   = columnGroups.some(g => g.parentRowSpan === 1)
  const rowSpanDate = hasSubRow ? 3 : 2
  const metricTop   = hasSubRow ? HDR_H * 2 : HDR_H

  // sticky left offsets for the four Total metric cells
  const TOT_LEFTS = [TOT_OCC_L, TOT_RN_L, TOT_ADR_L, TOT_REV_L] as const

  const monthlyTotals = useMemo(() => {
    let totRn = 0, totRev = 0
    for (const day of data) {
      for (const code of schema.allSegmentationCodes) {
        const v = day.values[code]
        if (v) { totRn += v.rn; totRev += v.rev }
      }
    }
    const totAdr = totRn > 0 ? Math.round(totRev / totRn) : 0
    const bySubCol = new Map<string, { rn: number; adr: number; rev: number }>()
    for (const group of allGroups) {
      for (const col of group.subCols) {
        let rn = 0, rev = 0
        for (const day of data) {
          for (const code of col.segCodes) {
            const v = day.values[code]
            if (v) { rn += v.rn; rev += v.rev }
          }
        }
        bySubCol.set(col.id, { rn, adr: rn > 0 ? Math.round(rev / rn) : 0, rev })
      }
    }
    return { totRn, totAdr, totRev, bySubCol }
  }, [data, schema, allGroups])

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 320px)', minHeight: 200 }}>
      <table
        style={{
          borderCollapse: 'separate',
          borderSpacing:  0,
          borderLeft:     BORDER,
          borderTop:      BORDER,
          tableLayout:    'fixed',
        }}
      >
        {/* colgroup enforces exact widths so sticky left offsets are always correct */}
        <colgroup>
          <col style={{ width: DATE_W }} />
          <col style={{ width: TOT_W }} />
          <col style={{ width: TOT_W }} />
          <col style={{ width: TOT_W }} />
          <col style={{ width: TOT_REV_W }} />
          {columnGroups
            .filter(g => g.id !== 'total')
            .flatMap(g => g.subCols)
            .map((col, i) => (
              <Fragment key={`seg-col-${col.id}-${i}`}>
                <col style={{ width: SEG_COL_W }} />
                <col style={{ width: SEG_COL_W }} />
                <col style={{ width: SEG_COL_W }} />
              </Fragment>
            ))
          }
        </colgroup>
        <thead>
          {/* ── Row 1: parent group labels ── */}
          <tr>
            <th
              rowSpan={rowSpanDate}
              style={{
                ...thBase,
                textAlign:   'left',
                position:    'sticky',
                left:        0,
                top:         0,
                zIndex:      6,
                width:       DATE_W,
                minWidth:    DATE_W,
                fontWeight:  600,
                borderRight: GROUP_BORDER,
              }}
            >
              날짜
            </th>

            {columnGroups.map((group, gi) => {
              const isTotal = group.id === 'total'
              const isLast  = gi === totalGroups - 1
              return (
                <th
                  key={group.id}
                  rowSpan={group.parentRowSpan}
                  colSpan={group.parentColSpan}
                  style={{
                    ...thBase,
                    textAlign:   'center',
                    fontWeight:  group.parentIsBold ? 700 : 600,
                    borderRight: isLast ? BORDER : GROUP_BORDER,
                    background:  HEADER_BG,
                    position:    'sticky',
                    top:         0,
                    zIndex:      isTotal ? 5 : 4,
                    ...(isTotal ? { left: TOT_OCC_L, borderBottom: TOT_HDR_BORDER } : {}),
                  }}
                >
                  {group.parentLabel}
                  {group.parentIsBold ? ' ★' : ''}
                </th>
              )
            })}
          </tr>

          {/* ── Row 2: sub-column labels ── */}
          {hasSubRow && (
            <tr>
              {columnGroups.map((group, gi) => {
                if (group.parentRowSpan !== 1) return null
                return (
                  <Fragment key={group.id}>
                    {group.subCols.map((col, ci) => {
                      const rightBorder = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                      return (
                        <th
                          key={col.id}
                          colSpan={3}
                          style={{
                            ...thBase,
                            textAlign:   'center',
                            fontWeight:  col.isSummary ? 500 : 400,
                            color:       col.isSummary ? TEXT : TEXT_SEC,
                            borderRight: rightBorder,
                            position:    'sticky',
                            top:         HDR_H,
                            zIndex:      4,
                          }}
                        >
                          {col.label}
                        </th>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tr>
          )}

          {/* ── Row 3: metric labels ── */}
          <tr>
            {columnGroups.map((group, gi) => {
              const isTotal = group.id === 'total'
              const bg      = HEADER_BG
              const isLast  = gi === totalGroups - 1

              if (isTotal) {
                const metrics = ['OCC%', 'RN', 'ADR', 'REV'] as const
                return (
                  <Fragment key={group.id}>
                    {metrics.map((metric, mi) => (
                      <th
                        key={metric}
                        style={{
                          ...thBase,
                          background:  bg,
                          textAlign:   'center',
                          fontWeight:  400,
                          color:       TEXT_SEC,
                          width:        TOT_W,
                          minWidth:     TOT_W,
                          borderBottom: TOT_HDR_BORDER,
                          borderRight:  mi === metrics.length - 1
                            ? (isLast ? TOT_HDR_BORDER : GROUP_BORDER)
                            : TOT_HDR_BORDER,
                          position:    'sticky',
                          top:         metricTop,
                          left:        TOT_LEFTS[mi],
                          zIndex:      5,
                        }}
                      >
                        {metric}
                      </th>
                    ))}
                  </Fragment>
                )
              }

              return group.subCols.map((col, ci) => {
                const rightBorder = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                return (
                  <Fragment key={col.id}>
                    {(['RN', 'ADR', 'REV'] as const).map((metric, mi) => (
                      <th
                        key={metric}
                        style={{
                          ...thBase,
                          background:  bg,
                          textAlign:   'center',
                          fontWeight:  400,
                          color:       TEXT_SEC,
                          borderRight: mi === 2 ? rightBorder : BORDER,
                          position:    'sticky',
                          top:         metricTop,
                          zIndex:      4,
                        }}
                      >
                        {metric}
                      </th>
                    ))}
                  </Fragment>
                )
              })
            })}
          </tr>
        </thead>

        <tbody>
          {data.map((row) => {
            const rowBg      = BODY_BG
            const textCol    = row.is_actual_day ? TEXT_SEC : TEXT
            const cal        = calendar?.get(row.business_date)
            const _evt       = cal?.event?.trim()
            const hasEvent   = !!_evt && _evt.toLowerCase() !== 'null'
            const isWeekend  = !hasEvent && cal?.rev_dow === '토'
            const isFriSat   = cal?.day === '금' || cal?.day === '토'
            const expandable = canExpand(row)
            const isExpanded = expandable && (manualExpandedDates.has(row.business_date) || shouldAutoExpand(row, threshold))
            const fcBtm      = isExpanded ? DASH_BORDER : BORDER

            return (
              <Fragment key={row.business_date}>
                {/* ── FC 행 ── */}
                <tr
                  onClick={expandable ? () => toggleExpand(row.business_date) : undefined}
                  style={{
                    cursor:     expandable ? 'pointer' : 'default',
                    opacity:    row.is_actual_day ? 0.55 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {/* 날짜 (sticky) */}
                  <td
                    style={{
                      ...tdBase,
                      borderBottom: fcBtm,
                      background:   rowBg,
                      position:     'sticky',
                      left:         0,
                      zIndex:       3,
                      fontWeight:   500,
                      color:        TEXT,
                      borderRight:  GROUP_BORDER,
                      width:        DATE_W,
                      minWidth:     DATE_W,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 9, color: MUTED, flexShrink: 0, visibility: expandable ? 'visible' : 'hidden' }}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      <span style={isFriSat ? { color: '#3B82F6', fontWeight: 600 } : undefined}>
                        {row.day_label}
                      </span>
                      {hasEvent && (
                        <span
                          title={_evt}
                          style={{
                            display:        'inline-flex',
                            alignItems:     'center',
                            justifyContent: 'center',
                            width:          18,
                            height:         18,
                            borderRadius:   '50%',
                            background:     'var(--color-text-danger, #ef4444)',
                            color:          '#fff',
                            fontSize:       10,
                            fontWeight:     600,
                            flexShrink:     0,
                            cursor:         'help',
                          }}
                        >
                          {_evt!.charAt(0)}
                        </span>
                      )}
                      {!hasEvent && isWeekend && (
                        <span style={{
                          display:      'inline-block',
                          width:        6,
                          height:       6,
                          borderRadius: '50%',
                          background:   '#F59E0B',
                          flexShrink:   0,
                        }} />
                      )}
                    </div>
                  </td>

                  {/* 데이터 셀 */}
                  {columnGroups.map((group, gi) => {
                    const isTotal = group.id === 'total'
                    const isLast  = gi === totalGroups - 1

                    if (isTotal) {
                      const sv          = calcFromData(row, schema.allSegmentationCodes)
                      const rightBorder = isLast ? BORDER : GROUP_BORDER

                      if (sv === null) {
                        return (
                          <Fragment key={group.id}>
                            {([0, 1, 2, 3] as const).map(i => (
                              <td key={i} style={{ ...tdBase, borderBottom: fcBtm, background: HEADER_BG, textAlign: 'right', color: MUTED, fontWeight: 600, width: TOT_W, minWidth: TOT_W, borderRight: i === 3 ? rightBorder : BORDER, position: 'sticky', left: TOT_LEFTS[i], zIndex: 2 }}>-</td>
                            ))}
                          </Fragment>
                        )
                      }

                      return (
                        <Fragment key={group.id}>
                          <td style={{ ...tdBase, borderBottom: fcBtm, background: HEADER_BG, textAlign: 'right', fontWeight: 600, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, position: 'sticky', left: TOT_OCC_L, zIndex: 2 }}>
                            <span style={{ color: sv.rn === 0 ? TERTIARY : textCol }}>{fmtOcc(sv.rn, schema.roomCount)}</span>
                            {row.has_capped && (
                              <span
                                title="호텔 총 객실 수에 도달했습니다"
                                style={{ marginLeft: 4, color: WARNING, fontSize: '10px', cursor: 'default' }}
                              >
                                ⚠
                              </span>
                            )}
                          </td>
                          <td style={{ ...tdBase, borderBottom: fcBtm, background: HEADER_BG, textAlign: 'right', color: sv.rn === 0 ? TERTIARY : textCol, fontWeight: 600, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, position: 'sticky', left: TOT_RN_L, zIndex: 2 }}>
                            {fmtRn(sv.rn)}
                          </td>
                          <td style={{ ...tdBase, borderBottom: fcBtm, background: HEADER_BG, textAlign: 'right', color: sv.adr === 0 ? TERTIARY : textCol, fontWeight: 600, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, position: 'sticky', left: TOT_ADR_L, zIndex: 2 }}>
                            {fmtAdr(sv.adr)}
                          </td>
                          <td style={{ ...tdBase, borderBottom: fcBtm, background: HEADER_BG, textAlign: 'right', color: sv.rev === 0 ? TERTIARY : textCol, fontWeight: 600, width: TOT_W, minWidth: TOT_W, borderRight: rightBorder, position: 'sticky', left: TOT_REV_L, zIndex: 2 }}>
                            {fmtRev(sv.rev)}
                          </td>
                        </Fragment>
                      )
                    }

                    return group.subCols.map((col, ci) => {
                      const rightBorder = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                      const cellBg      = rowBg
                      const fw          = col.isSummary ? 500 : 400
                      const sv          = calcFromData(row, col.segCodes)

                      if (sv === null) {
                        return (
                          <Fragment key={col.id}>
                            <td style={{ ...tdBase, borderBottom: fcBtm, background: cellBg, textAlign: 'right', color: MUTED, fontWeight: fw, borderRight: BORDER }}>-</td>
                            <td style={{ ...tdBase, borderBottom: fcBtm, background: cellBg, textAlign: 'right', color: MUTED, fontWeight: fw, borderRight: BORDER }}>-</td>
                            <td style={{ ...tdBase, borderBottom: fcBtm, background: cellBg, textAlign: 'right', color: MUTED, fontWeight: fw, borderRight: rightBorder }}>-</td>
                          </Fragment>
                        )
                      }

                      return (
                        <Fragment key={col.id}>
                          <td style={{ ...tdBase, borderBottom: fcBtm, background: cellBg, textAlign: 'right', color: sv.rn === 0 ? TERTIARY : textCol, fontWeight: fw, borderRight: BORDER }}>
                            {fmtRn(sv.rn)}
                          </td>
                          <td style={{ ...tdBase, borderBottom: fcBtm, background: cellBg, textAlign: 'right', color: sv.adr === 0 ? TERTIARY : textCol, fontWeight: fw, borderRight: BORDER }}>
                            {fmtAdr(sv.adr)}
                          </td>
                          <td style={{ ...tdBase, borderBottom: fcBtm, background: cellBg, textAlign: 'right', color: sv.rev === 0 ? TERTIARY : textCol, fontWeight: fw, borderRight: rightBorder }}>
                            {fmtRev(sv.rev)}
                          </td>
                        </Fragment>
                      )
                    })
                  })}
                </tr>

                {/* ── OTB 행 (펼침 시) ── */}
                {isExpanded && (
                  <tr>
                    {/* 날짜 셀 (sticky) */}
                    <td
                      style={{
                        ...tdBase,
                        fontSize:     '11px',
                        background:   OTB_BG,
                        position:     'sticky',
                        left:         0,
                        zIndex:       3,
                        color:        TEXT_SEC,
                        borderRight:  GROUP_BORDER,
                        borderBottom: GROUP_BORDER,
                        width:        DATE_W,
                        minWidth:     DATE_W,
                      }}
                    >
                      <div style={{ paddingLeft: 14 }}>└ OTB</div>
                    </td>

                    {/* OTB 데이터 셀 */}
                    {columnGroups.map((group, gi) => {
                      const isTotal = group.id === 'total'
                      const isLast  = gi === totalGroups - 1

                      if (isTotal) {
                        const sv          = calcOtbFromData(row, schema.allSegmentationCodes)
                        const rightBorder = isLast ? BORDER : GROUP_BORDER

                        if (sv === null) {
                          return (
                            <Fragment key={group.id}>
                              {([0, 1, 2, 3] as const).map(i => (
                                <td key={i} style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: MUTED, fontWeight: 500, width: TOT_W, minWidth: TOT_W, borderRight: i === 3 ? rightBorder : BORDER, borderBottom: GROUP_BORDER, position: 'sticky', left: TOT_LEFTS[i], zIndex: 2 }}>-</td>
                              ))}
                            </Fragment>
                          )
                        }

                        return (
                          <Fragment key={group.id}>
                            <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', fontWeight: 500, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, borderBottom: GROUP_BORDER, position: 'sticky', left: TOT_OCC_L, zIndex: 2 }}>
                              <span style={{ color: sv.rn === 0 ? TERTIARY : TEXT_SEC }}>{fmtOcc(sv.rn, schema.roomCount)}</span>
                            </td>
                            <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: sv.rn === 0 ? TERTIARY : TEXT_SEC, fontWeight: 500, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, borderBottom: GROUP_BORDER, position: 'sticky', left: TOT_RN_L, zIndex: 2 }}>
                              {fmtRn(sv.rn)}
                            </td>
                            <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: sv.adr === 0 ? TERTIARY : TEXT_SEC, fontWeight: 500, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, borderBottom: GROUP_BORDER, position: 'sticky', left: TOT_ADR_L, zIndex: 2 }}>
                              {fmtAdr(sv.adr)}
                            </td>
                            <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: sv.rev === 0 ? TERTIARY : TEXT_SEC, fontWeight: 500, width: TOT_W, minWidth: TOT_W, borderRight: rightBorder, borderBottom: GROUP_BORDER, position: 'sticky', left: TOT_REV_L, zIndex: 2 }}>
                              {fmtRev(sv.rev)}
                            </td>
                          </Fragment>
                        )
                      }

                      return group.subCols.map((col, ci) => {
                        const rightBorder = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                        const cellBg      = OTB_BG
                        const sv          = calcOtbFromData(row, col.segCodes)

                        if (sv === null) {
                          return (
                            <Fragment key={col.id}>
                              <td style={{ ...tdBase, fontSize: '11px', background: cellBg, textAlign: 'right', color: MUTED, fontWeight: 400, borderRight: BORDER, borderBottom: GROUP_BORDER }}>-</td>
                              <td style={{ ...tdBase, fontSize: '11px', background: cellBg, textAlign: 'right', color: MUTED, fontWeight: 400, borderRight: BORDER, borderBottom: GROUP_BORDER }}>-</td>
                              <td style={{ ...tdBase, fontSize: '11px', background: cellBg, textAlign: 'right', color: MUTED, fontWeight: 400, borderRight: rightBorder, borderBottom: GROUP_BORDER }}>-</td>
                            </Fragment>
                          )
                        }

                        return (
                          <Fragment key={col.id}>
                            <td style={{ ...tdBase, fontSize: '11px', background: cellBg, textAlign: 'right', color: sv.rn === 0 ? TERTIARY : TEXT_SEC, fontWeight: 400, borderRight: BORDER, borderBottom: GROUP_BORDER }}>
                              {fmtRn(sv.rn)}
                            </td>
                            <td style={{ ...tdBase, fontSize: '11px', background: cellBg, textAlign: 'right', color: sv.adr === 0 ? TERTIARY : TEXT_SEC, fontWeight: 400, borderRight: BORDER, borderBottom: GROUP_BORDER }}>
                              {fmtAdr(sv.adr)}
                            </td>
                            <td style={{ ...tdBase, fontSize: '11px', background: cellBg, textAlign: 'right', color: sv.rev === 0 ? TERTIARY : TEXT_SEC, fontWeight: 400, borderRight: rightBorder, borderBottom: GROUP_BORDER }}>
                              {fmtRev(sv.rev)}
                            </td>
                          </Fragment>
                        )
                      })
                    })}
                  </tr>
                )}
              </Fragment>
            )
          })}
          {/* ── 월 합계 행 ── */}
          {data.length > 0 && (() => {
            const { totRn, totAdr, totRev, bySubCol } = monthlyTotals
            const SUM_BG  = HEADER_BG
            const SUM_TOP = GROUP_BORDER
            return (
              <tr key="monthly-total">
                <td style={{
                  ...tdBase,
                  background:  SUM_BG,
                  position:    'sticky',
                  left:        0,
                  zIndex:      3,
                  fontWeight:  700,
                  color:       TEXT,
                  borderRight: GROUP_BORDER,
                  borderTop:   SUM_TOP,
                  width:       DATE_W,
                  minWidth:    DATE_W,
                }}>
                  월 합계
                </td>
                {columnGroups.map((group, gi) => {
                  const isTotal = group.id === 'total'
                  const isLast  = gi === totalGroups - 1
                  if (isTotal) {
                    const rightBorder = isLast ? BORDER : GROUP_BORDER
                    return (
                      <Fragment key={group.id}>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', fontWeight: 700, color: totRn === 0 ? TERTIARY : TEXT, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, borderTop: SUM_TOP, position: 'sticky', left: TOT_OCC_L, zIndex: 2 }}>
                          {fmtOcc(totRn, schema.roomCount * data.length)}
                        </td>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', fontWeight: 700, color: totRn === 0 ? TERTIARY : TEXT, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, borderTop: SUM_TOP, position: 'sticky', left: TOT_RN_L, zIndex: 2 }}>
                          {fmtRn(totRn)}
                        </td>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', fontWeight: 700, color: totAdr === 0 ? TERTIARY : TEXT, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, borderTop: SUM_TOP, position: 'sticky', left: TOT_ADR_L, zIndex: 2 }}>
                          {fmtAdr(totAdr)}
                        </td>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', fontWeight: 700, color: totRev === 0 ? TERTIARY : TEXT, width: TOT_W, minWidth: TOT_W, borderRight: rightBorder, borderTop: SUM_TOP, position: 'sticky', left: TOT_REV_L, zIndex: 2 }}>
                          {fmtRev(totRev)}
                        </td>
                      </Fragment>
                    )
                  }
                  return group.subCols.map((col, ci) => {
                    const rightBorder = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                    const sv = bySubCol.get(col.id)
                    if (!sv) {
                      return (
                        <Fragment key={col.id}>
                          <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', color: MUTED, fontWeight: 700, borderRight: BORDER, borderTop: SUM_TOP }}>-</td>
                          <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', color: MUTED, fontWeight: 700, borderRight: BORDER, borderTop: SUM_TOP }}>-</td>
                          <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', color: MUTED, fontWeight: 700, borderRight: rightBorder, borderTop: SUM_TOP }}>-</td>
                        </Fragment>
                      )
                    }
                    return (
                      <Fragment key={col.id}>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', color: sv.rn === 0 ? TERTIARY : TEXT, fontWeight: 700, borderRight: BORDER, borderTop: SUM_TOP }}>
                          {fmtRn(sv.rn)}
                        </td>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', color: sv.adr === 0 ? TERTIARY : TEXT, fontWeight: 700, borderRight: BORDER, borderTop: SUM_TOP }}>
                          {fmtAdr(sv.adr)}
                        </td>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', color: sv.rev === 0 ? TERTIARY : TEXT, fontWeight: 700, borderRight: rightBorder, borderTop: SUM_TOP }}>
                          {fmtRev(sv.rev)}
                        </td>
                      </Fragment>
                    )
                  })
                })}
              </tr>
            )
          })()}
        </tbody>
      </table>

      {/* 단위 안내 */}
      <div
        className="text-right text-xs px-3 py-1.5"
        style={{ color: MUTED, borderTop: BORDER }}
      >
        ADR 천원 · REV 백만원
      </div>
    </div>
  )
}
