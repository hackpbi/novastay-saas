'use client'

import { Fragment } from 'react'
import type { DailyForecast } from '@/lib/forecast/dummy'
import { SEGMENTS } from '@/lib/forecast/segments'
import { calcTotal } from '@/lib/forecast/calc'

interface ForecastTableProps {
  data: DailyForecast[]
}

const BORDER = '0.5px solid var(--color-border-default)'

const thBase: React.CSSProperties = {
  border: BORDER,
  padding: '4px 8px',
  fontWeight: 600,
  fontSize: '11px',
  whiteSpace: 'nowrap',
}

const tdBase: React.CSSProperties = {
  border: BORDER,
  padding: '3px 6px',
  fontSize: '11px',
  whiteSpace: 'nowrap',
}

const HEADER_BG   = 'var(--color-bg-secondary)'
const BODY_BG     = 'var(--color-bg-primary)'
const TOTAL_BG    = 'rgba(180,178,169,0.08)'
const MUTED_COLOR = 'var(--color-text-muted)'

const ROW1_HEIGHT = 30

export default function ForecastTable({ data }: ForecastTableProps) {
  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'auto' }}>
        <thead>
          {/* Row 1: segment name headers */}
          <tr>
            <th
              rowSpan={2}
              style={{
                ...thBase,
                background: HEADER_BG,
                textAlign: 'left',
                position: 'sticky',
                left: 0,
                top: 0,
                zIndex: 4,
                minWidth: 72,
              }}
            >
              날짜
            </th>

            {SEGMENTS.map(seg => (
              <th
                key={seg.id}
                colSpan={3}
                style={{
                  ...thBase,
                  background: HEADER_BG,
                  textAlign: 'center',
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                }}
              >
                {seg.name}
                {seg.isBold ? ' ★' : ''}
              </th>
            ))}

            <th
              colSpan={3}
              style={{
                ...thBase,
                background: TOTAL_BG,
                textAlign: 'center',
                position: 'sticky',
                top: 0,
                zIndex: 2,
              }}
            >
              Total
            </th>
          </tr>

          {/* Row 2: RN / ADR / REV sub-headers */}
          <tr>
            {SEGMENTS.map(seg => (
              <Fragment key={seg.id}>
                {(['RN', 'ADR', 'REV'] as const).map(label => (
                  <th
                    key={label}
                    style={{
                      ...thBase,
                      background: HEADER_BG,
                      textAlign: 'center',
                      position: 'sticky',
                      top: ROW1_HEIGHT,
                      zIndex: 2,
                      fontWeight: 500,
                      color: 'var(--color-text-secondary)',
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
                  textAlign: 'center',
                  position: 'sticky',
                  top: ROW1_HEIGHT,
                  zIndex: 2,
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
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
            const isEven = rowIdx % 2 === 0
            const rowBg = isEven ? BODY_BG : 'var(--overlay-xs)'

            return (
              <tr key={row.business_date}>
                {/* Sticky date cell */}
                <td
                  style={{
                    ...tdBase,
                    background: rowBg,
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    fontWeight: 500,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {row.day_label}
                </td>

                {/* Segment cells */}
                {SEGMENTS.map(seg => {
                  const sv = row.segments[seg.id]
                  return (
                    <Fragment key={seg.id}>
                      <td style={{ ...tdBase, background: rowBg, textAlign: 'right', color: 'var(--color-text-primary)' }}>
                        {sv.rn.toLocaleString()}
                      </td>
                      <td style={{ ...tdBase, background: rowBg, textAlign: 'right', color: sv.adr === 0 ? MUTED_COLOR : 'var(--color-text-primary)' }}>
                        {sv.adr === 0 ? '-' : sv.adr.toLocaleString()}
                      </td>
                      <td style={{ ...tdBase, background: rowBg, textAlign: 'right', color: sv.rev === 0 ? MUTED_COLOR : 'var(--color-text-primary)' }}>
                        {sv.rev === 0 ? '-' : sv.rev.toLocaleString()}
                      </td>
                    </Fragment>
                  )
                })}

                {/* Total cells */}
                <td style={{ ...tdBase, background: TOTAL_BG, textAlign: 'right', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {total.rn.toLocaleString()}
                </td>
                <td style={{ ...tdBase, background: TOTAL_BG, textAlign: 'right', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {total.adr.toLocaleString()}
                </td>
                <td style={{ ...tdBase, background: TOTAL_BG, textAlign: 'right', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {total.rev.toLocaleString()}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
