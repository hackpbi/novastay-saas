'use client'

import { Fragment, useMemo } from 'react'
import type { ForecastSchema, ForecastDayData, CalendarMap } from '@/lib/forecast/types'
import { buildColumnGroups } from '@/lib/forecast/schema'
import { fmtRn, fmtAdr, fmtRev, fmtOcc } from '@/lib/forecast/format'

interface ForecastTableProps {
  schema:          ForecastSchema
  data:            ForecastDayData[]
  selectedNodeIds: Set<string>
  calendar?:       CalendarMap
}

const BORDER       = '0.5px solid var(--color-border-default)'
const DASH_BORDER  = '0.5px dashed var(--color-border-default)'
const GROUP_BORDER = '1.5px solid var(--color-border-default)'

const HEADER_BG = 'var(--color-bg-secondary)'
const TOTAL_BG  = 'rgba(180,178,169,0.10)'
const SUM_BG    = 'rgba(180,178,169,0.06)'
const BODY_ODD  = 'var(--color-bg-primary)'
const BODY_EVN  = 'var(--overlay-xs)'
const TEXT      = 'var(--color-text-primary)'
const TEXT_SEC  = 'var(--color-text-secondary)'
const MUTED     = 'var(--color-text-muted)'
const WARNING   = 'var(--color-warning, #F5A623)'

const thBase: React.CSSProperties = {
  borderBottom: BORDER,
  borderRight:  BORDER,
  padding:      '8px 10px',
  fontSize:     '12px',
  whiteSpace:   'nowrap',
  color:        TEXT,
  background:   HEADER_BG,
}

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

export default function ForecastTable({ schema, data, selectedNodeIds, calendar }: ForecastTableProps) {
  // Build column groups filtered by selected nodes
  const allGroups = useMemo(
    () => buildColumnGroups(schema.nodes, schema.allSegmentationCodes),
    [schema],
  )

  // Visible column groups: Total (always) + selected segment groups
  const columnGroups = useMemo(() => {
    return allGroups.filter(g => g.id === 'total' || selectedNodeIds.has(g.id))
  }, [allGroups, selectedNodeIds])

  const totalGroups = columnGroups.length
  const hasSubRow   = columnGroups.some(g => g.parentRowSpan === 1)
  const rowSpanDate = hasSubRow ? 3 : 2

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          borderCollapse: 'separate',
          borderSpacing:  0,
          borderLeft:     BORDER,
          borderTop:      BORDER,
        }}
      >
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
                zIndex:      2,
                minWidth:    150,
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
                    background:  isTotal ? TOTAL_BG : HEADER_BG,
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
              const bg      = isTotal ? TOTAL_BG : HEADER_BG
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
                          borderRight: mi === metrics.length - 1
                            ? (isLast ? BORDER : GROUP_BORDER)
                            : BORDER,
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
          {data.map((row, rowIdx) => {
            const rowBg   = rowIdx % 2 === 0 ? BODY_ODD : BODY_EVN
            const textCol = row.is_actual_day ? TEXT : TEXT_SEC

            const cal        = calendar?.get(row.business_date)
            const _evt       = cal?.event?.trim()
            const hasEvent   = !!_evt && _evt.toLowerCase() !== 'null'
            const isWeekend  = !hasEvent && cal?.rev_dow === '토'

            return (
              <tr key={row.business_date}>
                {/* 날짜 (sticky) */}
                <td
                  style={{
                    ...tdBase,
                    background:  rowBg,
                    position:    'sticky',
                    left:        0,
                    zIndex:      1,
                    fontWeight:  500,
                    color:       TEXT,
                    borderRight: GROUP_BORDER,
                  }}
                >
                  <div>{row.day_label}</div>
                  {hasEvent && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <span style={{
                        display:      'inline-block',
                        width:        6,
                        height:       6,
                        borderRadius: '50%',
                        background:   'var(--color-text-danger, #ef4444)',
                        flexShrink:   0,
                      }} />
                      <span style={{ fontSize: 10, color: TEXT_SEC }}>{cal!.event}</span>
                    </div>
                  )}
                  {isWeekend && (
                    <div style={{ marginTop: 3 }}>
                      <span style={{
                        display:      'inline-block',
                        width:        6,
                        height:       6,
                        borderRadius: '50%',
                        background:   '#F59E0B',
                      }} />
                    </div>
                  )}
                </td>

                {/* 데이터 셀 */}
                {columnGroups.map((group, gi) => {
                  const isTotal = group.id === 'total'
                  const isLast  = gi === totalGroups - 1

                  if (isTotal) {
                    // Total always uses all codes — filter only hides segment columns
                    const sv          = calcFromData(row, schema.allSegmentationCodes)
                    const rightBorder = isLast ? BORDER : GROUP_BORDER

                    if (sv === null) {
                      return (
                        <Fragment key={group.id}>
                          {([0, 1, 2, 3] as const).map(i => (
                            <td key={i} style={{ ...tdBase, background: TOTAL_BG, textAlign: 'right', color: MUTED, fontWeight: 600, borderRight: i === 3 ? rightBorder : BORDER }}>-</td>
                          ))}
                        </Fragment>
                      )
                    }

                    return (
                      <Fragment key={group.id}>
                        {/* OCC% — 맨 앞 */}
                        <td style={{ ...tdBase, background: TOTAL_BG, textAlign: 'right', fontWeight: 600, borderRight: BORDER }}>
                          <span style={{ color: TEXT_SEC }}>{fmtOcc(sv.rn, schema.roomCount)}</span>
                          {row.has_capped && (
                            <span
                              title="호텔 총 객실 수에 도달했습니다"
                              style={{ marginLeft: 4, color: WARNING, fontSize: '10px', cursor: 'default' }}
                            >
                              ⚠
                            </span>
                          )}
                        </td>
                        {/* RN */}
                        <td style={{ ...tdBase, background: TOTAL_BG, textAlign: 'right', color: textCol, fontWeight: 600, borderRight: BORDER }}>
                          {fmtRn(sv.rn)}
                        </td>
                        {/* ADR */}
                        <td style={{ ...tdBase, background: TOTAL_BG, textAlign: 'right', color: sv.adr === 0 ? MUTED : textCol, fontWeight: 600, borderRight: BORDER }}>
                          {fmtAdr(sv.adr)}
                        </td>
                        {/* REV */}
                        <td style={{ ...tdBase, background: TOTAL_BG, textAlign: 'right', color: sv.rev === 0 ? MUTED : textCol, fontWeight: 600, borderRight: rightBorder }}>
                          {fmtRev(sv.rev)}
                        </td>
                      </Fragment>
                    )
                  }

                  return group.subCols.map((col, ci) => {
                    const rightBorder = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                    const cellBg      = col.isSummary ? SUM_BG : rowBg
                    const fw          = col.isSummary ? 500 : 400
                    const sv          = calcFromData(row, col.segCodes)

                    if (sv === null) {
                      return (
                        <Fragment key={col.id}>
                          <td style={{ ...tdBase, background: cellBg, textAlign: 'right', color: MUTED, fontWeight: fw, borderRight: BORDER }}>-</td>
                          <td style={{ ...tdBase, background: cellBg, textAlign: 'right', color: MUTED, fontWeight: fw, borderRight: BORDER }}>-</td>
                          <td style={{ ...tdBase, background: cellBg, textAlign: 'right', color: MUTED, fontWeight: fw, borderRight: rightBorder }}>-</td>
                        </Fragment>
                      )
                    }

                    return (
                      <Fragment key={col.id}>
                        <td style={{ ...tdBase, background: cellBg, textAlign: 'right', color: textCol, fontWeight: fw, borderRight: BORDER }}>
                          {fmtRn(sv.rn)}
                        </td>
                        <td style={{ ...tdBase, background: cellBg, textAlign: 'right', color: sv.adr === 0 ? MUTED : textCol, fontWeight: fw, borderRight: BORDER }}>
                          {fmtAdr(sv.adr)}
                        </td>
                        <td style={{ ...tdBase, background: cellBg, textAlign: 'right', color: sv.rev === 0 ? MUTED : textCol, fontWeight: fw, borderRight: rightBorder }}>
                          {fmtRev(sv.rev)}
                        </td>
                      </Fragment>
                    )
                  })
                })}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* 단위 안내 */}
      <div
        className="text-right text-xs px-3 py-1.5"
        style={{ color: MUTED, borderTop: BORDER }}
      >
        단위: 천원
      </div>
    </div>
  )
}
