'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ForecastTable from '@/components/forecast/ForecastTable'
import ForecastHeader from '@/components/forecast/ForecastHeader'
import SegmentFilter from '@/components/forecast/SegmentFilter'
import { fetchForecastSchema } from '@/lib/forecast/schema'
import { fetchBaselineForecast, transformRpcToTableData } from '@/lib/forecast/baseline'
import { useHotel } from '@/contexts/HotelContext'
import type { ForecastSchema, ForecastDayData } from '@/lib/forecast/types'

// ── Month helpers ──────────────────────────────────────────────────────────────

function monthRange(year: number, month: number) {
  const mm    = String(month).padStart(2, '0')
  const start = `${year}-${mm}-01`
  const last  = new Date(year, month, 0).getDate()
  const end   = `${year}-${mm}-${String(last).padStart(2, '0')}`
  return { start, end }
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ForecastPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  // ── Month state ──────────────────────────────────────────────────────────────
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date()
    return { year: today.getFullYear(), month: today.getMonth() + 1 }
  })

  const goPrev = useCallback(() => setCurrentMonth(p =>
    p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 }
  ), [])
  const goNext = useCallback(() => setCurrentMonth(p =>
    p.month === 12 ? { year: p.year + 1, month: 1 } : { year: p.year, month: p.month + 1 }
  ), [])
  const goToday = useCallback(() => {
    const t = new Date()
    setCurrentMonth({ year: t.getFullYear(), month: t.getMonth() + 1 })
  }, [])

  // ── Schema fetch (호텔 변경 시에만) ─────────────────────────────────────────
  const [schema,       setSchema]       = useState<ForecastSchema | null>(null)
  const [schemaError,  setSchemaError]  = useState<string | null>(null)

  useEffect(() => {
    if (!hotelId) return
    fetchForecastSchema(hotelId)
      .then(s => {
        setSchema(s)
        setSchemaError(null)
      })
      .catch(e => setSchemaError(String(e)))
  }, [hotelId])

  // ── Segment filter state ─────────────────────────────────────────────────────
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())

  // 스키마 로드 시 전체 선택으로 초기화
  useEffect(() => {
    if (schema) {
      setSelectedNodeIds(new Set(schema.nodes.map(n => n.id)))
    }
  }, [schema])

  const toggleNode = useCallback((id: string) => {
    setSelectedNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const selectAll  = useCallback(() => {
    if (schema) setSelectedNodeIds(new Set(schema.nodes.map(n => n.id)))
  }, [schema])
  const selectNone = useCallback(() => setSelectedNodeIds(new Set()), [])

  // ── Baseline fetch (월 변경 시마다) ─────────────────────────────────────────
  const [data,         setData]         = useState<ForecastDayData[]>([])
  const [dataLoading,  setDataLoading]  = useState(false)
  const [dataError,    setDataError]    = useState<string | null>(null)

  useEffect(() => {
    if (!hotelId) return
    const { start, end } = monthRange(currentMonth.year, currentMonth.month)
    setDataLoading(true)
    setDataError(null)
    fetchBaselineForecast(hotelId, start, end)
      .then(rows => setData(transformRpcToTableData(rows)))
      .catch(e => setDataError(String(e)))
      .finally(() => setDataLoading(false))
  }, [hotelId, currentMonth])

  // ── Render ───────────────────────────────────────────────────────────────────
  const error = schemaError ?? dataError

  return (
    <div className="space-y-3 animate-fade-in">
      {/* 페이지 헤더 + 월 selector */}
      <ForecastHeader
        year={currentMonth.year}
        month={currentMonth.month}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
      />

      {/* 세그먼트 필터 */}
      {schema && schema.nodes.length > 0 && (
        <SegmentFilter
          nodes={schema.nodes}
          selectedIds={selectedNodeIds}
          onToggle={toggleNode}
          onAll={selectAll}
          onReset={selectNone}
        />
      )}

      {/* 0개 선택 안내 */}
      {schema && selectedNodeIds.size === 0 && (
        <div className="text-sm text-center py-4" style={{ color: 'var(--color-text-muted)' }}>
          세그먼트를 1개 이상 선택해주세요.
        </div>
      )}

      {/* 표 카드 */}
      {selectedNodeIds.size > 0 && (
        <div
          className="rounded-xl"
          style={{
            border:     '1px solid var(--color-border-default)',
            background: 'var(--color-bg-surface)',
            boxShadow:  'var(--shadow-card)',
            overflow:   'clip',
            opacity:    dataLoading ? 0.5 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {!schema && !error && (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
              세그먼트 구조를 불러오는 중...
            </div>
          )}

          {!schema && error && (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-danger, #ef4444)' }}>
              데이터를 불러오지 못했습니다.
            </div>
          )}

          {schema && schema.nodes.length === 0 && (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
              세그먼트 설정이 필요합니다.
            </div>
          )}

          {schema && schema.nodes.length > 0 && (
            <ForecastTable
              schema={schema}
              data={data}
              selectedNodeIds={selectedNodeIds}
            />
          )}
        </div>
      )}

      {/* 에러 (별도 표시) */}
      {error && schema && (
        <div className="text-xs text-center" style={{ color: 'var(--color-text-danger, #ef4444)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
