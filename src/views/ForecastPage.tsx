'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ForecastTable from '@/components/forecast/ForecastTable'
import ForecastHeader from '@/components/forecast/ForecastHeader'
import SegmentFilter from '@/components/forecast/SegmentFilter'
import KpiBar from '@/components/forecast/KpiBar'
import { Download, Upload } from 'lucide-react'
import { fetchForecastSchema } from '@/lib/forecast/schema'
import { fetchBaselineForecast, transformRpcToTableData } from '@/lib/forecast/baseline'
import { fetchCalendarRange, calendarToMap } from '@/lib/forecast/calendar'
import { type EditedValues, saveForecastEdits, type SaveEdit } from '@/lib/forecast/save'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
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
  const { otbDate } = useDateContext()

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
    fetchBaselineForecast(hotelId, start, end, otbDate || undefined)
      .then(rows => setData(transformRpcToTableData(rows)))
      .catch(e => setDataError(String(e)))
      .finally(() => setDataLoading(false))
  }, [hotelId, currentMonth, otbDate])

  // ── 월 FCST 합계 (KPI 바) ────────────────────────────────────────────────────
  const monthFcst = useMemo(() => {
    if (!schema) return { occ: 0, adr: 0, rev: 0 }
    let rn = 0, rev = 0
    for (const day of data) {
      for (const code of schema.allSegmentationCodes) {
        const v = day.values[code]
        if (v) { rn += v.rn; rev += v.rev }
      }
    }
    const adr = rn > 0 ? rev / rn : 0
    const occ = schema.roomCount * data.length > 0
      ? (rn / (schema.roomCount * data.length)) * 100
      : 0
    return { occ, adr, rev }
  }, [data, schema])

  // ── 인라인 편집 state ────────────────────────────────────────────────────────
  const [editedValues, setEditedValues] = useState<EditedValues>(new Map())
  const [saving,       setSaving]       = useState(false)

  // 월/호텔 변경 시 편집 상태 초기화
  useEffect(() => { setEditedValues(new Map()) }, [data])

  const modifiedCount = editedValues.size

  function buildSaveEdits(ev: EditedValues): SaveEdit[] {
    const edits: SaveEdit[] = []
    for (const [key, edited] of ev.entries()) {
      const [businessDate, segmentation] = key.split('::')
      const day = data.find(d => d.business_date === businessDate)
      if (!day) continue
      const original = day.values[segmentation]
      if (!original) continue
      edits.push({
        business_date: businessDate,
        segmentation,
        rn:  edited.rn  ?? original.rn,
        adr: edited.adr ?? original.adr,
      })
    }
    return edits
  }

  async function handleSave() {
    if (editedValues.size === 0 || saving) return
    setSaving(true)
    try {
      const updateDate = otbDate || new Date().toISOString().slice(0, 10)
      const edits      = buildSaveEdits(editedValues)
      const result     = await saveForecastEdits(hotelId, updateDate, edits)
      alert(`저장 완료: 총 ${result.saved_count}건 (신규 ${result.inserted_count}, 수정 ${result.updated_count})`)
      setEditedValues(new Map())
    } catch (err) {
      alert(`저장 실패: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

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
        {/* 1줄: 월 selector + 세그먼트 필터 + 자동 펼침 + KPI 바 */}
        <ForecastHeader
          year={currentMonth.year}
          month={currentMonth.month}
          onPrev={goPrev}
          onNext={goNext}
          leftExtra={schema && <KpiBar fcst={monthFcst} />}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                  자동 펼침
                </span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={threshold}
                  onChange={e => {
                    const v = parseInt(e.target.value)
                    if (!isNaN(v) && v >= 0 && v <= 20) setThreshold(v)
                  }}
                  title="OTB가 FC + 이 값 이상이면 자동 펼침"
                  style={{
                    width:        40,
                    padding:      '3px 6px',
                    fontSize:     12,
                    fontWeight:   600,
                    textAlign:    'center',
                    border:       '1px solid var(--color-border-default)',
                    borderRadius: 4,
                    background:   'var(--color-bg-secondary)',
                    color:        'var(--color-text-primary)',
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                  실
                  {autoCount > 0 && (
                    <span style={{ marginLeft: 6, color: 'var(--color-warning, #F5A623)', fontWeight: 600 }}>
                      ({autoCount}일)
                    </span>
                  )}
                </span>
              </div>

              {/* 변경 건수 안내 */}
              {modifiedCount > 0 && (
                <div style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          4,
                  padding:      '4px 8px',
                  fontSize:     11,
                  fontWeight:   500,
                  color:        'var(--color-warning, #F5A623)',
                  background:   'rgba(245, 158, 11, 0.08)',
                  borderRadius: 4,
                  whiteSpace:   'nowrap',
                }}>
                  ⚠ 변경 {modifiedCount}건 (저장 안 됨)
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      padding:      '3px 10px',
                      fontSize:     11,
                      fontWeight:   600,
                      background:   'var(--color-accent-primary, #00E5A0)',
                      color:        '#000',
                      border:       'none',
                      borderRadius: 4,
                      cursor:       saving ? 'wait' : 'pointer',
                      opacity:      saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              )}

              {/* 데이터 액션 */}
              <div style={{
                display:     'flex',
                alignItems:  'center',
                gap:         6,
                paddingLeft: 12,
                borderLeft:  '1px solid var(--color-border-default)',
              }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                  데이터
                </span>
                <button
                  title="준비 중인 기능입니다"
                  style={{
                    display:      'flex',
                    alignItems:   'center',
                    gap:          4,
                    padding:      '4px 8px',
                    fontSize:     12,
                    fontWeight:   500,
                    cursor:       'pointer',
                    border:       '1px solid var(--color-border-default)',
                    borderRadius: 6,
                    background:   'var(--color-bg-surface)',
                    color:        'var(--color-text-secondary)',
                    opacity:      0.6,
                  }}
                >
                  <Download size={13} />
                  불러오기
                </button>
                <button
                  title="준비 중인 기능입니다"
                  style={{
                    display:      'flex',
                    alignItems:   'center',
                    gap:          4,
                    padding:      '4px 8px',
                    fontSize:     12,
                    fontWeight:   500,
                    cursor:       'pointer',
                    border:       '1px solid var(--color-border-default)',
                    borderRadius: 6,
                    background:   'var(--color-bg-surface)',
                    color:        'var(--color-text-secondary)',
                    opacity:      0.6,
                  }}
                >
                  <Upload size={13} />
                  업로드
                </button>
              </div>
            </>
          )}
        </ForecastHeader>
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
              editedValues={editedValues}
              onEditChange={setEditedValues}
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
