'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import ForecastTable from '@/components/forecast/ForecastTable'
import { fetchForecastSchema, buildColumnGroups } from '@/lib/forecast/schema'
import { getDummyForecast } from '@/lib/forecast/dummy'
import { useHotel } from '@/contexts/HotelContext'
import type { ForecastSchema } from '@/lib/forecast/types'

export default function ForecastPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  const { data: schema, isLoading, error } = useQuery<ForecastSchema>({
    queryKey: ['forecast_schema', hotelId],
    queryFn:  () => fetchForecastSchema(hotelId),
    enabled:  !!hotelId,
  })

  const columnGroups = useMemo(
    () => schema ? buildColumnGroups(schema.nodes, schema.allSegmentationCodes) : [],
    [schema],
  )
  const forecastData = useMemo(
    () => getDummyForecast(schema?.allSegmentationCodes ?? []),
    [schema],
  )

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

        {!isLoading && !error && columnGroups.length > 0 && (
          <ForecastTable columnGroups={columnGroups} data={forecastData} />
        )}
      </div>

      {/* 임시 디버그 영역 (Step 1.5b에서 제거 예정) */}
      {schema && (
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
            Schema Loaded ✅
          </div>
          <div>Room count: {schema.roomCount}</div>
          <div>Top-level nodes: {schema.nodes.length}</div>
          <div>All segmentation codes: {schema.allSegmentationCodes.join(', ')}</div>
        </div>
      )}
    </div>
  )
}
