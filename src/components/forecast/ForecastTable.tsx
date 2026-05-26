'use client'

import { Fragment } from 'react'
import type { ColumnGroup, DailyForecast } from '@/lib/forecast/types'
import { calcNodeValue } from '@/lib/forecast/calc'
import { fmtRn, fmtAdr, fmtRev } from '@/lib/forecast/format'

interface ForecastTableProps {
  columnGroups: ColumnGroup[]
  data:         DailyForecast[]
}

const BORDER       = '0.5px solid var(--color-border-default)'
const DASH_BORDER  = '0.5px dashed var(--color-border-default)'
const GROUP_BORDER = '1.5px solid var(--color-border-default)'

const HEADER_BG  = 'var(--color-bg-secondary)'
const SUM_BG     = 'rgba(180,178,169,0.06)'
const TOTAL_BG   = 'rgba(180,178,169,0.08)'
const BODY_ODD   = 'var(--color-bg-primary)'
const BODY_EVN   = 'var(--overlay-xs)'
const TEXT       = 'var(--color-text-primary)'
const TEXT_SEC   = 'var(--color-text-secondary)'
const MUTED      = 'var(--color-text-muted)'

const thBase: React.CSSProperties = {
  borderBottom: BORDER,
  borderRight:  BORDER,
  padding:      '4px 7px',
  fontSize:     '11px',
  whiteSpace:   'nowrap',
  color:        TEXT,
  background:   HEADER_BG,
}

const tdBase: React.CSSProperties = {
  borderBottom: BORDER,
  borderRight:  BORDER,
  padding:      '3px 7px',
  fontSize:     '11px',
  whiteSpace:   'nowrap',
}

function subColRightBorder(
  groupIdx:    number,
  totalGroups: number,
  subColIdx:   number,
  subColCount: number,
  isSummary:   boolean,
): string {
  // (합산) column gets dashed right border to separate from children
  if (isSummary && subColIdx === 0 && subColCount > 1) return DASH_BORDER
  // last sub-col of a group (except the very last group) gets thick separator
  if (subColIdx === subColCount - 1 && groupIdx < totalGroups - 1) return GROUP_BORDER
  return BORDER
}

export default function ForecastTable({ columnGroups, data }: ForecastTableProps) {
  const totalGroups = columnGroups.length

  // Groups that have a sub-label row (parentRowSpan=1 means they have children)
  const hasSubRow = columnGroups.some(g => g.parentRowSpan === 1)

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
              rowSpan={hasSubRow ? 3 : 2}
              style={{
                ...thBase,
                textAlign:   'left',
                position:    'sticky',
                left:        0,
                zIndex:      2,
                minWidth:    72,
                fontWeight:  600,
                borderRight: GROUP_BORDER,
              }}
            >
              날짜
            </th>

            {columnGroups.map((group, gi) => {
              const isLast = gi === totalGroups - 1
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
                    background:  group.id === 'total' ? TOTAL_BG : HEADER_BG,
                  }}
                >
                  {group.parentLabel}
                  {group.parentIsBold ? ' ★' : ''}
                </th>
              )
            })}
          </tr>

          {/* ── Row 2: sub-column labels (only for groups with children) ── */}
          {hasSubRow && (
            <tr>
              {columnGroups.map((group, gi) => {
                // parentRowSpan=2 groups already claimed this row via rowSpan
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

          {/* ── Row 3: RN / ADR / REV ── */}
          <tr>
            {columnGroups.map((group, gi) =>
              group.subCols.map((col, ci) => {
                const rightBorder = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                const isTotalGroup = group.id === 'total'
                const bg = isTotalGroup ? TOTAL_BG : HEADER_BG
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
            )}
          </tr>
        </thead>

        <tbody>
          {data.map((row, rowIdx) => {
            const rowBg = rowIdx % 2 === 0 ? BODY_ODD : BODY_EVN
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
                  {row.day_label}
                </td>

                {/* 데이터 셀 */}
                {columnGroups.map((group, gi) =>
                  group.subCols.map((col, ci) => {
                    const rightBorder = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                    const sv = calcNodeValue(row, col.segCodes)
                    const isTotalGroup = group.id === 'total'
                    const cellBg = isTotalGroup
                      ? TOTAL_BG
                      : col.isSummary
                        ? SUM_BG
                        : rowBg
                    const fontWeight = isTotalGroup || col.isSummary ? 500 : 400
                    return (
                      <Fragment key={col.id}>
                        <td style={{ ...tdBase, background: cellBg, textAlign: 'right', color: TEXT, fontWeight, borderRight: BORDER }}>
                          {fmtRn(sv.rn)}
                        </td>
                        <td style={{ ...tdBase, background: cellBg, textAlign: 'right', color: sv.adr === 0 ? MUTED : TEXT, fontWeight, borderRight: BORDER }}>
                          {fmtAdr(sv.adr)}
                        </td>
                        <td style={{ ...tdBase, background: cellBg, textAlign: 'right', color: sv.rev === 0 ? MUTED : TEXT, fontWeight, borderRight: rightBorder }}>
                          {fmtRev(sv.rev)}
                        </td>
                      </Fragment>
                    )
                  })
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
