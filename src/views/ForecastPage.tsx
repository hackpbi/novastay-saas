'use client'

import ForecastTable from '@/components/forecast/ForecastTable'
import { FORECAST_MAY_2026 } from '@/lib/forecast/dummy'

export default function ForecastPage() {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Page header */}
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: 'var(--color-text-primary)' }}
        >
          일자별 세그먼트 전망
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          2026년 5월
        </p>
      </div>

      {/* Table card */}
      <div
        className="rounded-xl"
        style={{
          border: '1px solid var(--color-border-default)',
          background: 'var(--color-bg-surface)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'clip',
        }}
      >
        <ForecastTable data={FORECAST_MAY_2026} />
      </div>
    </div>
  )
}
