'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ForecastTable from '@/components/forecast/ForecastTable'
import ForecastHeader from '@/components/forecast/ForecastHeader'
import SegmentFilter from '@/components/forecast/SegmentFilter'
import KpiBar from '@/components/forecast/KpiBar'
import { Download, Pencil, ClipboardList, Zap, TrendingUp, BarChart2 } from 'lucide-react'
import { fetchForecastSchema } from '@/lib/forecast/schema'
import { fetchBaselineForecast, transformRpcToTableData } from '@/lib/forecast/baseline'
import { fetchCalendarRange, calendarToMap } from '@/lib/forecast/calendar'
import { type EditedValues, saveForecastEdits, type SaveEdit } from '@/lib/forecast/save'
import { BulkEditModal } from '@/components/forecast/BulkEditModal'
import { ForecastGraphModal } from '@/components/forecast/ForecastGraphModal'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import type { ForecastSchema, ForecastDayData, CalendarMap } from '@/lib/forecast/types'
import DatePicker from '@/components/DatePicker'
import { supabase } from '@/lib/supabase'

// ── Month helpers ──────────────────────────────────────────────────────────────

function fmtLoadDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}/${parseInt(d)}`
}

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

  // ── Baseline data state ───────────────────────────────────────────────────────
  const [data,         setData]         = useState<ForecastDayData[]>([])
  const [dataError,    setDataError]    = useState<string | null>(null)
  const [isLoaded,     setIsLoaded]     = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false)

  // 월/호텔 변경 시 빈 표로 리셋
  useEffect(() => {
    setIsLoaded(false)
    setData([])
    setDataError(null)
    setHasAutoLoaded(false)
  }, [hotelId, currentMonth])

  async function doFetch() {
    const { start, end } = monthRange(currentMonth.year, currentMonth.month)
    const rows = await fetchBaselineForecast(hotelId, start, end, otbDate || undefined)
    setData(transformRpcToTableData(rows))
    setIsLoaded(true)
  }

  async function handleGenerate() {
    if (isGenerating || !hotelId) return
    if (isLoaded || editedValues.size > 0) {
      if (!confirm('기존 데이터가 있습니다. 새롭게 다시 생성하시겠습니까?')) return
    }
    setIsGenerating(true)
    setDataError(null)
    try {
      await doFetch()
      setEditedValues(new Map())
      setSelectedLoadDate('')
    } catch (e) {
      setDataError((e as Error).message ?? String(e))
    } finally {
      setIsGenerating(false)
    }
  }

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

  // ── Budget monthly fetch ─────────────────────────────────────────────────────
  type BudgetMonthRow = { budget_nights: number; budget_revenue: number }
  const [budgetMonthRows, setBudgetMonthRows] = useState<BudgetMonthRow[]>([])

  useEffect(() => {
    if (!hotelId) { setBudgetMonthRows([]); return }
    ;(async () => {
      const { data: rows, error } = await (supabase as any).rpc('get_budget_mtd_summary', {
        p_hotel_id: hotelId,
        p_year:     currentMonth.year,
        p_month:    currentMonth.month,
      })
      if (!error && rows) setBudgetMonthRows(rows)
      else setBudgetMonthRows([])
    })().catch(() => setBudgetMonthRows([]))
  }, [hotelId, currentMonth.year, currentMonth.month])

  const budgetMonth = useMemo(() => {
    if (budgetMonthRows.length === 0) return null
    let nights = 0, revenue = 0
    for (const r of budgetMonthRows) { nights += r.budget_nights; revenue += r.budget_revenue }
    return { nights, revenue }
  }, [budgetMonthRows])

  const vsBudget = useMemo(() => {
    if (!isLoaded || !budgetMonth || !schema || data.length === 0) return null
    const bdOcc = schema.roomCount * data.length > 0
      ? (budgetMonth.nights / (schema.roomCount * data.length)) * 100
      : 0
    const bdAdr = budgetMonth.nights > 0 ? budgetMonth.revenue / budgetMonth.nights : 0
    return {
      occDiff: monthFcst.occ - bdOcc,
      adrDiff: monthFcst.adr - bdAdr,
      revDiff: monthFcst.rev - budgetMonth.revenue,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, monthFcst, budgetMonth, schema, data.length])

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

  function buildAllSaveEdits(): SaveEdit[] {
    const edits: SaveEdit[] = []
    for (const day of data) {
      for (const [code, value] of Object.entries(day.values)) {
        edits.push({
          business_date: day.business_date,
          segmentation:  code,
          rn:            value.rn  ?? 0,
          adr:           value.adr ?? 0,
        })
      }
    }
    return edits
  }

  async function handleSave() {
    if (editedValues.size === 0 || saving) return

    // 오늘 첫 저장 — 편집분이 아닌 표 전체 업로드
    if (!hasTodayData) {
      if (!confirm(
        `오늘 첫 저장입니다.\n편집분이 아닌 표 전체 데이터를 저장합니다.\n\n계속하시겠습니까?`
      )) return
      setSaving(true)
      try {
        const edits = buildAllSaveEdits()
        if (edits.length === 0) { alert('저장할 데이터가 없습니다.'); return }
        const updateDate = otbDate || new Date().toISOString().slice(0, 10)
        const result     = await saveForecastEdits(hotelId, updateDate, edits)
        alert(`전체 저장 완료\n총 ${result.saved_count}건 (신규 ${result.inserted_count}, 수정 ${result.updated_count})`)
        setEditedValues(new Map())
        setSelectedLoadDate(updateDate)
        if (!loadableDates.includes(updateDate)) {
          setLoadableDates(prev => [updateDate, ...prev])
        }
        doFetch().catch(() => {})
      } catch (err) {
        alert(`저장 실패: ${(err as Error).message}`)
      } finally {
        setSaving(false)
      }
      return
    }

    // 재저장 — 편집분만
    setSaving(true)
    try {
      const updateDate = otbDate || new Date().toISOString().slice(0, 10)
      const edits      = buildSaveEdits(editedValues)
      const result     = await saveForecastEdits(hotelId, updateDate, edits)
      alert(`저장 완료: 총 ${result.saved_count}건 (신규 ${result.inserted_count}, 수정 ${result.updated_count})`)
      setEditedValues(new Map())
      doFetch().catch(() => {})
    } catch (err) {
      alert(`저장 실패: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── 편집 모드 ────────────────────────────────────────────────────────────────
  type EditMode = 'inline' | 'bulk'
  const [editMode, setEditMode] = useState<EditMode>('inline')

  // ── 일괄수정 모달 ─────────────────────────────────────────────────────────────
  const [bulkEdit, setBulkEdit] = useState<{
    isOpen:       boolean
    selectedDate: string | null
    fromGraph:    boolean
  }>({ isOpen: false, selectedDate: null, fromGraph: false })

  const [graphModalOpen, setGraphModalOpen] = useState(false)
  const [mtdModalOpen,   setMtdModalOpen]   = useState(false)

  const openBulkEditModal  = useCallback((date: string, fromGraph = false) => {
    setBulkEdit({ isOpen: true, selectedDate: date, fromGraph })
  }, [])
  const closeBulkEditModal = useCallback(() => {
    setBulkEdit(prev => ({ ...prev, isOpen: false }))
    if (bulkEdit.fromGraph) setGraphModalOpen(true)
  }, [bulkEdit.fromGraph])
  const selectBulkEditDate = useCallback((date: string) => {
    setBulkEdit(prev => ({ ...prev, selectedDate: date }))
  }, [])

  const handleBulkApply = useCallback((newEdits: EditedValues) => {
    setEditedValues(prev => {
      const next = new Map(prev)
      for (const [key, val] of newEdits.entries()) next.set(key, val)
      return next
    })
    // 그래프에서 진입했으면 적용 후 그래프로 복귀
    if (bulkEdit.fromGraph) {
      setBulkEdit({ isOpen: false, selectedDate: null, fromGraph: false })
      setGraphModalOpen(true)
    }
  }, [bulkEdit.fromGraph])

  // ── Calendar fetch (월 변경 시마다) ─────────────────────────────────────────
  const [calendar, setCalendar] = useState<CalendarMap>(new Map())

  useEffect(() => {
    const { start, end } = monthRange(currentMonth.year, currentMonth.month)
    fetchCalendarRange(start, end)
      .then(days => setCalendar(calendarToMap(days)))
      .catch(() => {})
  }, [currentMonth])

  // ── 불러오기 — a05의 update_date 목록 (현재 월) ──────────────────────────────
  const [loadableDates,    setLoadableDates]    = useState<string[]>([])
  const [selectedLoadDate, setSelectedLoadDate] = useState<string>('')

  // 오늘(otbDate) 데이터가 이미 저장되어 있는지 여부
  const hasTodayData = useMemo(
    () => !!otbDate && loadableDates.includes(otbDate),
    [loadableDates, otbDate],
  )

  useEffect(() => {
    if (!hotelId) return
    setLoadableDates([])        // 스테일 날짜 초기화 (월 변경 시 이전 월 날짜 방지)
    setSelectedLoadDate('')
    const { start, end } = monthRange(currentMonth.year, currentMonth.month)
    ;(async () => {
      const { data: rows } = await supabase
        .from('a05_forecast_daily')
        .select('update_date')
        .eq('hotel_id', hotelId)
        .gte('business_date', start)
        .lte('business_date', end)
      if (!rows) return
      const unique = [...new Set(rows.map((r: { update_date: string }) => r.update_date))]
      unique.sort((a, b) => b.localeCompare(a))
      setLoadableDates(unique)
    })().catch(() => {})
  }, [hotelId, currentMonth])

  // ── 진입/월변경 시 최신 update_date 자동 로드 ──────────────────────────────
  useEffect(() => {
    if (!hotelId || loadableDates.length === 0 || hasAutoLoaded) return
    setHasAutoLoaded(true)
    handleLoadConfirm(loadableDates[0])
    // handleLoadConfirm은 컴포넌트 내부 함수라 deps에서 제외 (loadableDates 변경 시만 실행)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadableDates])

  async function handleLoadConfirm(loadDate: string) {
    if (editedValues.size > 0) {
      if (!confirm('편집한 내용이 있습니다. 불러오면 사라집니다. 계속하시겠습니까?')) return
    }
    setIsGenerating(true)
    setDataError(null)
    try {
      const { start, end } = monthRange(currentMonth.year, currentMonth.month)
      const rows = await fetchBaselineForecast(hotelId, start, end, otbDate || undefined, loadDate)
      setData(transformRpcToTableData(rows))
      setEditedValues(new Map())
      setIsLoaded(true)
      setSelectedLoadDate(loadDate)
    } catch (e) {
      setDataError(String(e))
      const msg = (e as Error).message ?? String(e)
      setDataError(msg)
      alert(`불러오기 실패: ${msg}`)
    } finally {
      setIsGenerating(false)
    }
  }

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
          paddingBottom: 10,
          marginBottom:  10,
          boxShadow:     '0 2px 4px rgba(0,0,0,0.05)',
        }}
      >
        {/* ── 헤더: 1행(월 네비 + 데이터 액션) / 2행(KPI + 편집 컨트롤) ── */}
        <ForecastHeader
          year={currentMonth.year}
          month={currentMonth.month}
          onPrev={goPrev}
          onNext={goNext}
          rightActions={schema && schema.nodes.length > 0 ? (
            <>
              {loadableDates.length > 0 ? (
                <DatePicker
                  label="불러오기"
                  value={selectedLoadDate}
                  onChange={() => {}}
                  availableDates={loadableDates}
                  confirmMode
                  onConfirm={handleLoadConfirm}
                />
              ) : (
                <button
                  disabled
                  title="저장된 forecast가 없습니다"
                  style={{
                    display:      'flex',
                    alignItems:   'center',
                    gap:          4,
                    padding:      '4px 8px',
                    fontSize:     12,
                    fontWeight:   500,
                    cursor:       'not-allowed',
                    border:       '1px solid var(--color-border-default)',
                    borderRadius: 6,
                    background:   'var(--color-bg-surface)',
                    color:        'var(--color-text-tertiary)',
                    opacity:      0.5,
                  }}
                >
                  <Download size={13} />
                  불러오기
                </button>
              )}
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !hotelId}
                title="baseline + a05 기준으로 자동 생성"
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          4,
                  padding:      '4px 10px',
                  fontSize:     12,
                  fontWeight:   600,
                  cursor:       isGenerating ? 'wait' : 'pointer',
                  border:       'none',
                  borderRadius: 6,
                  background:   'var(--color-accent-primary, #00E5A0)',
                  color:        '#000',
                  opacity:      isGenerating ? 0.6 : 1,
                  whiteSpace:   'nowrap',
                }}
              >
                <Zap size={13} />
                {isGenerating ? '생성 중...' : '자동 생성'}
              </button>
            </>
          ) : undefined}
          kpiBar={schema && <KpiBar fcst={monthFcst} vsBudget={vsBudget} isLoaded={isLoaded} />}
          rightControls={schema && schema.nodes.length > 0 ? (
            <>
              {/* [보기] 칩: Seg / 그래프 / MTD */}
              <div style={{
                display:      'inline-flex',
                alignItems:   'center',
                borderRadius: 7,
                border:       '0.5px solid var(--color-border-secondary)',
                background:   'var(--color-bg-elevated)',
              }}>
                <span style={{
                  padding:     '5px 9px 5px 11px',
                  fontSize:    11,
                  color:       'var(--color-text-tertiary)',
                  borderRight: '0.5px solid var(--color-border-secondary)',
                  background:  'rgba(255,255,255,0.02)',
                  whiteSpace:  'nowrap',
                }}>
                  보기
                </span>
                <div style={{ borderRight: '0.5px solid var(--color-border-secondary)' }}>
                  <SegmentFilter
                    nodes={schema.nodes}
                    selectedIds={selectedNodeIds}
                    onToggle={toggleNode}
                    onAll={selectAll}
                    onReset={selectNone}
                  />
                </div>
                <button
                  onClick={() => setGraphModalOpen(true)}
                  disabled={!isLoaded || data.length === 0}
                  title={!isLoaded ? 'forecast를 먼저 생성하세요' : 'OTB vs FCST 그래프'}
                  onMouseEnter={e => {
                    if (!(!isLoaded || data.length === 0))
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent-primary, #00E5A0)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = !isLoaded ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)'
                  }}
                  style={{
                    display:     'flex',
                    alignItems:  'center',
                    gap:         4,
                    padding:     '5px 9px',
                    fontSize:    12,
                    fontWeight:  500,
                    background:  'transparent',
                    border:      'none',
                    borderRight: '0.5px solid var(--color-border-secondary)',
                    cursor:      !isLoaded || data.length === 0 ? 'not-allowed' : 'pointer',
                    color:       !isLoaded ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                    opacity:     !isLoaded || data.length === 0 ? 0.45 : 1,
                    whiteSpace:  'nowrap',
                    transition:  'color 0.15s',
                  }}
                >
                  <TrendingUp size={12} />
                  그래프
                </button>
                <button
                  onClick={() => setMtdModalOpen(true)}
                  title="MTD 보기 (세그별 + 월 전체)"
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-accent-primary, #00E5A0)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-primary)'
                  }}
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        4,
                    padding:    '5px 11px 5px 9px',
                    fontSize:   12,
                    fontWeight: 500,
                    background: 'transparent',
                    border:     'none',
                    cursor:     'pointer',
                    color:      'var(--color-text-primary)',
                    whiteSpace: 'nowrap',
                    transition: 'color 0.15s',
                  }}
                >
                  <BarChart2 size={12} aria-hidden="true" />
                  MTD
                </button>
              </div>
              {/* 슬라이딩 pill 토글 */}
              <div
                onClick={() => setEditMode(prev => prev === 'bulk' ? 'inline' : 'bulk')}
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  background:   'rgba(255,255,255,0.06)',
                  borderRadius: 999,
                  padding:      3,
                  border:       '1px solid rgba(255,255,255,0.1)',
                  cursor:       'pointer',
                  userSelect:   'none',
                  position:     'relative',
                  flexShrink:   0,
                }}
              >
                <div style={{
                  position:     'absolute',
                  top:          3,
                  left:         editMode === 'bulk' ? 3 : '50%',
                  width:        'calc(50% - 3px)',
                  height:       'calc(100% - 6px)',
                  background:   '#00E5A0',
                  borderRadius: 999,
                  transition:   'left 0.22s cubic-bezier(0.4,0,0.2,1)',
                  zIndex:       0,
                }} />
                <div style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          4,
                  padding:      '5px 12px',
                  borderRadius: 999,
                  fontSize:     12,
                  fontWeight:   600,
                  position:     'relative',
                  zIndex:       1,
                  color:        editMode === 'bulk' ? '#0F2E20' : 'var(--color-text-tertiary)',
                  transition:   'color 0.2s',
                  whiteSpace:   'nowrap',
                }}>
                  <ClipboardList size={13} aria-hidden="true" />
                  일괄수정
                </div>
                <div style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          4,
                  padding:      '5px 12px',
                  borderRadius: 999,
                  fontSize:     12,
                  fontWeight:   600,
                  position:     'relative',
                  zIndex:       1,
                  color:        editMode === 'inline' ? '#0F2E20' : 'var(--color-text-tertiary)',
                  transition:   'color 0.2s',
                  whiteSpace:   'nowrap',
                }}>
                  <Pencil size={13} aria-hidden="true" />
                  직접수정
                </div>
              </div>
              {/* 변경/저장 */}
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
                  ⚠ 변경 {modifiedCount}건
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
            </>
          ) : undefined}
        />
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
            opacity:    isGenerating ? 0.5 : 1,
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

          {schema && schema.nodes.length > 0 && !isLoaded && (
            <div style={{
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              minHeight:      300,
              gap:            16,
            }}>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
                forecast를 생성하거나 불러오세요
              </p>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          6,
                  padding:      '10px 20px',
                  fontSize:     13,
                  fontWeight:   600,
                  cursor:       isGenerating ? 'wait' : 'pointer',
                  border:       'none',
                  borderRadius: 8,
                  background:   'var(--color-accent-primary, #00E5A0)',
                  color:        '#000',
                  opacity:      isGenerating ? 0.6 : 1,
                }}
              >
                <Zap size={15} />
                {isGenerating ? '생성 중...' : '자동 생성'}
              </button>
            </div>
          )}

          {schema && schema.nodes.length > 0 && isLoaded && (
            <ForecastTable
              schema={schema}
              data={data}
              selectedNodeIds={selectedNodeIds}
              calendar={calendar}
              threshold={1}
              editedValues={editedValues}
              onEditChange={setEditedValues}
              editMode={editMode}
              onOpenBulkEditModal={openBulkEditModal}
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

      {/* 그래프 모달 */}
      {schema && (
        <ForecastGraphModal
          isOpen={graphModalOpen}
          onClose={() => setGraphModalOpen(false)}
          data={data}
          editedValues={editedValues}
          schema={schema}
          year={currentMonth.year}
          month={currentMonth.month}
          calendar={calendar}
          onDateClick={(date) => {
            setGraphModalOpen(false)
            openBulkEditModal(date, true)
          }}
        />
      )}

      {/* MTD 모달 */}
      {mtdModalOpen && (
        <div
          onClick={() => setMtdModalOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 60,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:   'var(--color-bg-elevated)',
              border:       '0.5px solid var(--color-border-secondary)',
              borderRadius: 10,
              padding:      24,
              minWidth:     400,
            }}
          >
            <h3 style={{ fontSize: 16, margin: 0, marginBottom: 12, color: 'var(--color-text-primary)' }}>
              MTD
            </h3>
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13, margin: 0 }}>
              MTD 보기 (세그별 + 월 전체)
            </p>
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 12, marginTop: 16 }}>
              준비 중입니다.
            </p>
            <button
              onClick={() => setMtdModalOpen(false)}
              style={{
                marginTop:    16,
                padding:      '6px 14px',
                fontSize:     12,
                borderRadius: 6,
                border:       '1px solid var(--color-border-default)',
                background:   'var(--color-bg-surface)',
                color:        'var(--color-text-primary)',
                cursor:       'pointer',
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 일괄수정 모달 */}
      <BulkEditModal
        isOpen={bulkEdit.isOpen}
        selectedDate={bulkEdit.selectedDate}
        onClose={closeBulkEditModal}
        schema={schema}
        data={data}
        editedValues={editedValues}
        onApply={handleBulkApply}
        hotelId={hotelId}
        onSelectDate={selectBulkEditDate}
      />
    </div>
  )
}
