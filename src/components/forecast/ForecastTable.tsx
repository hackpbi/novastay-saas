'use client'

import { Fragment } from 'react'
import type { DailyForecast } from '@/lib/forecast/types'
import { FORECAST_SEGMENTS } from '@/lib/forecast/segments'
import { calcTotal } from '@/lib/forecast/calc'
import { fmtRn, fmtAdr, fmtRev } from '@/lib/forecast/format'

interface ForecastTableProps {
  data: DailyForecast[]
}

const BORDER     = '0.5px solid var(--color-border-default)'
const SEP_BORDER = '1px solid var(--color-border-default)'

const HEADER_BG   = 'var(--color-bg-secondary)'
const BODY_BG_ODD = 'var(--color-bg-primary)'
const BODY_BG_EVN = 'var(--overlay-xs)'
const TOTAL_BG    = 'rgba(180,178,169,0.08)'
const MUTED       = 'var(--color-text-muted)'
const TEXT        = 'var(--color-text-primary)'
const TEXT_SEC    = 'var(--color-text-secondary)'

const thBase: React.CSSProperties = {
  borderRight:  BORDER,
  borderBottom: BORDER,
  padding:      '4px 7px',
  fontSize:     '11px',
  whiteSpace:   'nowrap',
  color:        TEXT,
}

const tdBase: React.CSSProperties = {
  borderRight:  BORDER,
  borderBottom: BORDER,
  padding:      '3px 7px',
  fontSize:     '11px',
  whiteSpace:   'nowrap',
}

export default function ForecastTable({ data }: ForecastTableProps) {
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
          {/* ── Row 1: 세그먼트 이름 ── */}
          <tr>
            <th
              rowSpan={2}
              style={{
                ...thBase,
                background:  HEADER_BG,
                textAlign:   'left',
                position:    'sticky',
                left:        0,
                zIndex:      2,
                minWidth:    72,
                fontWeight:  600,
                borderRight: SEP_BORDER,
              }}
            >
              날짜
            </th>

            {FORECAST_SEGMENTS.map(seg => (
              <th
                key={seg.id}
                colSpan={3}
                style={{
                  ...thBase,
                  background: HEADER_BG,
                  textAlign:  'center',
                  fontWeight: seg.isBold ? 700 : 600,
                }}
              >
                {seg.name}
                {seg.isBold ? ' ★' : ''}
              </th>
            ))}

            {/* Total 헤더 */}
            <th
              colSpan={3}
              style={{
                ...thBase,
                background: TOTAL_BG,
                textAlign:  'center',
                fontWeight: 700,
              }}
            >
              Total
            </th>
          </tr>

          {/* ── Row 2: RN / ADR / REV ── */}
          <tr>
            {FORECAST_SEGMENTS.map(seg => (
              <Fragment key={seg.id}>
                {(['RN', 'ADR', 'REV'] as const).map(label => (
                  <th
                    key={label}
                    style={{
                      ...thBase,
                      background: HEADER_BG,
                      textAlign:  'center',
                      fontWeight: 400,
                      color:      TEXT_SEC,
                    }}
                  >
                    {label}
                  </th>
                ))}
              </Fragment>
            ))}

            {(['RN', 'ADR', 'REV'] as const).map(label => (
              <th
                key={label}
                style={{
                  ...thBase,
                  background: TOTAL_BG,
                  textAlign:  'center',
                  fontWeight: 400,
                  color:      TEXT_SEC,
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row, rowIdx) => {
            const total = calcTotal(row.segments)
            const rowBg = rowIdx % 2 === 0 ? BODY_BG_ODD : BODY_BG_EVN

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
                    borderRight: SEP_BORDER,
                  }}
                >
                  {row.day_label}
                </td>

                {/* 세그먼트 셀 */}
                {FORECAST_SEGMENTS.map(seg => {
                  const sv = row.segments[seg.id]
                  const isZeroAdr = sv.adr === 0
                  const isZeroRev = sv.rev === 0
                  return (
                    <Fragment key={seg.id}>
                      <td style={{ ...tdBase, background: rowBg, textAlign: 'right', color: TEXT }}>
                        {fmtRn(sv.rn)}
                      </td>
                      <td style={{ ...tdBase, background: rowBg, textAlign: 'right', color: isZeroAdr ? MUTED : TEXT }}>
                        {fmtAdr(sv.adr)}
                      </td>
                      <td style={{ ...tdBase, background: rowBg, textAlign: 'right', color: isZeroRev ? MUTED : TEXT }}>
                        {fmtRev(sv.rev)}
                      </td>
                    </Fragment>
                  )
                })}

                {/* Total 셀 */}
                <td style={{ ...tdBase, background: TOTAL_BG, textAlign: 'right', color: TEXT, fontWeight: 500 }}>
                  {fmtRn(total.rn)}
                </td>
                <td style={{ ...tdBase, background: TOTAL_BG, textAlign: 'right', color: TEXT, fontWeight: 500 }}>
                  {fmtAdr(total.adr)}
                </td>
                <td style={{ ...tdBase, background: TOTAL_BG, textAlign: 'right', color: TEXT, fontWeight: 500 }}>
                  {fmtRev(total.rev)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
