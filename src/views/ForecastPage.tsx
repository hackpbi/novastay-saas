'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ForecastTable from '@/components/forecast/ForecastTable'
import { fetchForecastSchema } from '@/lib/forecast/schema'
import { getDummyForecast } from '@/lib/forecast/dummy'
import { fetchBaselineForecast, transformRpcToTableData } from '@/lib/forecast/baseline'
import { useHotel } from '@/contexts/HotelContext'
import type { ForecastSchema, ForecastDayData } from '@/lib/forecast/types'

export default function ForecastPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  // ── Schema (c05) ────────────────────────────────────────────────────────────
  const { data: schema, isLoading, error } = useQuery<ForecastSchema>({
    queryKey: ['forecast_schema', hotelId],
    queryFn:  () => fetchForecastSchema(hotelId),
    enabled:  !!hotelId,
  })

  const forecastData = useMemo(
    () => getDummyForecast(schema?.allSegmentationCodes ?? []),
    [schema],
  )

  // ── Baseline RPC (Step 2a 검증용) ───────────────────────────────────────────
  const [baselineData,  setBaselineData]  = useState<ForecastDayData[]>([])
  const [baselineError, setBaselineError] = useState<string | null>(null)

  useEffect(() => {
    if (!hotelId) return
    fetchBaselineForecast(hotelId, '2026-05-01', '2026-05-31')
      .then(rows => {
        console.log('=== Raw RPC rows ===', rows.length, 'rows')
        console.log('First row:', rows[0])
        const transformed = transformRpcToTableData(rows)
        console.log('=== Transformed (날짜별) ===', transformed.length, 'days')
        console.log('First day:', transformed[0])
        setBaselineData(transformed)
      })
      .catch(e => {
        console.error('Baseline fetch error:', e)
        setBaselineError(String(e))
      })
  }, [hotelId])

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

      {/* 표 카드 (더미 데이터) */}
      <div
        className="rounded-xl"
        style={{
          border:     '1px solid var(--color-border-default)',
          background: 'var(--color-bg-surface)',
          boxShadow:  'var(--shadow-card)',
          overflow:   'clip',
        }}
      >
        {isLoading && (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            세그먼트 구조를 불러오는 중...
          </div>
        )}

        {!isLoading && error && (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-danger, #ef4444)' }}>
            세그먼트 구조를 불러오지 못했습니다.
          </div>
        )}

        {!isLoading && !error && (!schema || schema.nodes.length === 0) && (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            세그먼트 설정이 필요합니다.
          </div>
        )}

        {!isLoading && !error && schema && schema.nodes.length > 0 && (
          <ForecastTable schema={schema} data={forecastData} />
        )}
      </div>

      {/* 임시 디버그 영역 (Step 2b에서 제거 예정) */}
      <div
        className="rounded-lg text-xs"
        style={{
          padding:    '10px 14px',
          background: 'var(--color-bg-secondary)',
          border:     '1px solid var(--color-border-default)',
          color:      'var(--color-text-secondary)',
          lineHeight: 1.7,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--color-text-primary)' }}>
          Baseline Data {baselineData.length > 0 ? '✅' : baselineError ? '❌' : '⏳'}
        </div>
        {baselineError ? (
          <div style={{ color: '#ef4444' }}>Error: {baselineError}</div>
        ) : (
          <>
            <div>Days loaded: {baselineData.length}</div>
            <div>First date: {baselineData[0]?.business_date ?? '-'}</div>
            <div>First date label: {baselineData[0]?.day_label ?? '-'}</div>
            <div>
              Segments on first day:{' '}
              {baselineData[0] ? Object.keys(baselineData[0].values).join(', ') : '-'}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
