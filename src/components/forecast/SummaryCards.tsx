'use client'

import { useMemo } from 'react'
import SummaryCard from './SummaryCard'
import type { ForecastSchema, ForecastDayData } from '@/lib/forecast/types'
import { fmtMillion, fmtThousand, fmtInt, fmtPct } from '@/lib/forecast/format'

interface SummaryCardsProps {
  schema: ForecastSchema
  data:   ForecastDayData[]
}

export default function SummaryCards({ schema, data }: SummaryCardsProps) {
  const stats = useMemo(() => {
    const fc  = { rn: 0, rev: 0 }
    const otb = { rn: 0, rev: 0 }

    for (const day of data) {
      for (const code of schema.allSegmentationCodes) {
        const v = day.values[code]
        if (v) {
          fc.rn   += v.rn;     fc.rev  += v.rev
          otb.rn  += v.otb_rn; otb.rev += v.otb_rev
        }
      }
    }

    const fcAdr  = fc.rn  > 0 ? fc.rev  / fc.rn  : 0
    const otbAdr = otb.rn > 0 ? otb.rev / otb.rn : 0

    const daysInMonth   = data.length
    const totalCapacity = schema.roomCount * daysInMonth
    const monthOcc = totalCapacity > 0 ? (fc.rn / totalCapacity) * 100 : 0
    const otbRatio = fc.rev > 0 ? (otb.rev / fc.rev) * 100 : 0

    return { fc: { ...fc, adr: fcAdr }, otb: { ...otb, adr: otbAdr }, monthOcc, otbRatio }
  }, [schema, data])

  const { fc, otb, monthOcc, otbRatio } = stats
  const otbRatioTone = otbRatio >= 80 ? 'success' : otbRatio >= 60 ? 'warning' : 'danger'

  return (
    <div
      style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap:                 '12px',
      }}
    >
      <SummaryCard
        label="FORECAST"
        variant="primary"
        mainValue={fmtMillion(fc.rev)}
        rows={[
          { label: 'R/N', value: fmtInt(fc.rn) },
          { label: 'ADR', value: fmtThousand(fc.adr) },
          { label: 'OCC', value: fmtPct(monthOcc) },
        ]}
      />
      <SummaryCard
        label="CURRENT OTB"
        variant="secondary"
        mainValue={fmtMillion(otb.rev)}
        rows={[
          { label: 'R/N',    value: fmtInt(otb.rn) },
          { label: 'ADR',    value: fmtThousand(otb.adr) },
          { label: 'FC 대비', value: fmtPct(otbRatio), tone: otbRatioTone as 'success' | 'warning' | 'danger' },
        ]}
      />
      <SummaryCard label="BUDGET"    placeholder="준비 중" />
      <SummaryCard label="LAST YEAR" placeholder="준비 중" />
    </div>
  )
}
