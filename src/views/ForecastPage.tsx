'use client'

import { useEffect, useState } from 'react'
import ForecastTable from '@/components/forecast/ForecastTable'
import { fetchForecastSchema } from '@/lib/forecast/schema'
import { fetchBaselineForecast, transformRpcToTableData } from '@/lib/forecast/baseline'
import { useHotel } from '@/contexts/HotelContext'
import type { ForecastSchema, ForecastDayData } from '@/lib/forecast/types'

export default function ForecastPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  const [schema,  setSchema]  = useState<ForecastSchema | null>(null)
  const [data,    setData]    = useState<ForecastDayData[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!hotelId) return
    setLoading(true)
    setError(null)
    Promise.all([
      fetchForecastSchema(hotelId),
      fetchBaselineForecast(hotelId, '2026-05-01', '2026-05-31'),
    ])
      .then(([s, rows]) => {
        setSchema(s)
        setData(transformRpcToTableData(rows))
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
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
        {loading && (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            데이터를 불러오는 중...
          </div>
        )}

        {!loading && error && (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-danger, #ef4444)' }}>
            데이터를 불러오지 못했습니다.
          </div>
        )}

        {!loading && !error && (!schema || schema.nodes.length === 0) && (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            세그먼트 설정이 필요합니다.
          </div>
        )}

        {!loading && !error && schema && schema.nodes.length > 0 && (
          <ForecastTable schema={schema} data={data} />
        )}
      </div>
    </div>
  )
}
