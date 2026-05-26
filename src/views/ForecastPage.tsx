'use client'

import { useMemo } from 'react'
import ForecastTable from '@/components/forecast/ForecastTable'
import { getDummyForecast } from '@/lib/forecast/dummy'

export default function ForecastPage() {
  const data = useMemo(() => getDummyForecast(), [])

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 페이지 헤더 */}
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

      {/* 표 카드 */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border:     '1px solid var(--color-border-default)',
          background: 'var(--color-bg-surface)',
          boxShadow:  'var(--shadow-card)',
        }}
      >
        <ForecastTable data={data} />
      </div>
    </div>
  )
}
