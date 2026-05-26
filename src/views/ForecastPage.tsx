'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ForecastTable from '@/components/forecast/ForecastTable'
import ForecastHeader from '@/components/forecast/ForecastHeader'
import SegmentFilter from '@/components/forecast/SegmentFilter'
import SummaryCards from '@/components/forecast/SummaryCards'
import { fetchForecastSchema } from '@/lib/forecast/schema'
import { fetchBaselineForecast, transformRpcToTableData } from '@/lib/forecast/baseline'
import { fetchCalendarRange, calendarToMap } from '@/lib/forecast/calendar'
import { useHotel } from '@/contexts/HotelContext'
import type { ForecastSchema, ForecastDayData, CalendarMap } from '@/lib/forecast/types'

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
  const [schema,      setSchema]      = useState<ForecastSchema | null>(null)
  const [schemaError, setSchemaError] = useState<string | null>(null)

  useEffect(() => {
    if (!hotelId) return
    fetchForecastSchema(hotelId)
      .then(s => { setSchema(s); setSchemaError(null) })
      .catch(e => setSchemaError(String(e)))
  }, [hotelId])

  // ── Segment filter state ─────────────────────────────────────────────────────
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (schema) setSelectedNodeIds(new Set(schema.nodes.map(n => n.id)))
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
  const [data,        setData]        = useState<ForecastDayData[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError,   setDataError]   = useState<string | null>(null)

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

  // ── 자동 펼침 임계값 ──────────────────────────────────────────────────────────
  const [threshold, setThreshold] = useState(3)

  const autoCount = useMemo(() =>
    data.filter(d => {
      for (const code in d.values) {
        const v = d.values[code]
        if (v.otb_rn >= v.rn + threshold) return true
      }
      return false
    }).length,
  [data, threshold])

  // ── Calendar fetch (월 변경 시마다) ─────────────────────────────────────────
  const [calendar, setCalendar] = useState<CalendarMap>(new Map())

  useEffect(() => {
    const { start, end } = monthRange(currentMonth.year, currentMonth.month)
    fetchCalendarRange(start, end)
      .then(days => setCalendar(calendarToMap(days)))
      .catch(() => {})
  }, [currentMonth])

  // ── Render ───────────────────────────────────────────────────────────────────
  const error = schemaError ?? dataError

  return (
    <div className="animate-fade-in">

      {/* 페이지 제목 (일반 — non-sticky) */}
      <h1
        className="text-2xl font-semibold tracking-tight mb-3"
        style={{ color: 'var(--color-text-primary)' }}
      >
        일자별 세그먼트 전망
      </h1>

      {/* ── 상단 sticky 영역 ── */}
      <div
        style={{
          position:      'sticky',
          top:           0,
          zIndex:        10,
          background:    'var(--color-bg-primary)',
          paddingBottom: 12,
          marginBottom:  12,
          boxShadow:     '0 2px 4px rgba(0,0,0,0.05)',
        }}
      >
        {/* 월 selector + 컨트롤 (한 줄) */}
        <ForecastHeader
          year={currentMonth.year}
          month={currentMonth.month}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
        >
          {schema && schema.nodes.length > 0 && (
            <>
              <SegmentFilter
                nodes={schema.nodes}
                selectedIds={selectedNodeIds}
                onToggle={toggleNode}
                onAll={selectAll}
                onReset={selectNone}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  자동 펼침
                </span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={threshold}
                  onChange={e => setThreshold(parseInt(e.target.value))}
                  style={{
                    width:       110,
                    accentColor: 'var(--color-accent-primary, #00E5A0)',
                    cursor:      'pointer',
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                  OTB ≥ FC +{' '}
                  <strong style={{ color: 'var(--color-text-primary)' }}>{threshold}</strong>실
                  {autoCount > 0 && (
                    <span style={{ marginLeft: 6, color: 'var(--color-warning, #F5A623)', fontWeight: 600 }}>
                      ({autoCount}일)
                    </span>
                  )}
                </span>
              </div>
            </>
          )}
        </ForecastHeader>

        {/* 상단 요약 카드 */}
        {schema && (
          <div style={{ marginTop: 12 }}>
            <SummaryCards schema={schema} data={data} />
          </div>
        )}
      </div>

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
            overflow:   'hidden',
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
              calendar={calendar}
              threshold={threshold}
            />
          )}
        </div>
      )}

      {/* 에러 (별도 표시) */}
      {error && schema && (
        <div className="text-xs text-center mt-2" style={{ color: 'var(--color-text-danger, #ef4444)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
