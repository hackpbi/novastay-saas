'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { X, AlertTriangle, TrendingDown, ChevronDown, Check, SlidersHorizontal } from 'lucide-react'
import type { ForecastSchema, ForecastDayData } from '@/lib/forecast/types'
import { type EditedValues, makeEditKey, type SaveEdit } from '@/lib/forecast/save'
import { fmtRn, fmtAdr } from '@/lib/forecast/format'
import { supabase } from '@/lib/supabase'

interface ForecastAlertModalProps {
  isOpen:        boolean
  onClose:       () => void
  schema:        ForecastSchema
  data:          ForecastDayData[]
  editedValues:  EditedValues
  onEditChange:  (next: EditedValues) => void
  saving:        boolean
  onSave:        () => void
  otbDate:       string
}

type AlertType = 'rn' | 'adr' | 'both'
type FilterType = 'all' | 'rn' | 'adr' | 'both'
type BulkMode = 'flat' | 'pct' | 'set'
type BulkField = 'rn' | 'adr'

interface AlertRow {
  business_date:  string
  day_label:      string
  segmentation:   string
  seg_name:       string
  alertType:      AlertType
  otb_rn:         number
  fcst_rn:        number
  otb_adr:        number
  fcst_adr:       number
  adr_diff_pct:   number
  occ_pct:        number   // OTB 기준 전체 점유율
  fcst_occ_pct:   number   // FCST 기준 전체 점유율
}

const RN_THRESHOLD  = 0    // otb_rn > fcst_rn
const ADR_THRESHOLD = 10   // |diff| >= 10%
const OTA_COMMISSION_DEFAULT = 15   // OTA 수수료 기본값(%)
const ROOM_CAP_LABEL = 'rooms'

// ── helpers ──────────────────────────────────────────────────────────────────

function getEffectiveRn(
  day:          ForecastDayData,
  segCode:      string,
  editedValues: EditedValues,
): number {
  const original = day.values[segCode]
  if (!original) return 0
  const edited = editedValues.get(makeEditKey(day.business_date, segCode))
  return edited?.rn ?? original.rn
}

function getEffectiveAdr(
  day:          ForecastDayData,
  segCode:      string,
  editedValues: EditedValues,
): number {
  const original = day.values[segCode]
  if (!original) return 0
  const edited = editedValues.get(makeEditKey(day.business_date, segCode))
  return edited?.adr ?? original.adr
}

function occColor(pct: number): string {
  if (pct >= 90) return '#fbbf24'
  if (pct >= 70) return '#00E5A0'
  return '#00E5A0'
}

function getDayColor(businessDate: string, otbDate: string): string {
  if (businessDate === otbDate) return '#3B82F6'  // 오늘 → 파란색
  const dow = new Date(businessDate + 'T12:00:00').getDay()
  if (dow === 5 || dow === 6) return '#f87171'    // 금(5)/토(6) → 빨간색
  return 'rgba(255,255,255,0.85)'                  // 기본
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ForecastAlertModal({
  isOpen, onClose, schema, data, editedValues, onEditChange, saving, onSave, otbDate,
}: ForecastAlertModalProps) {
  const [filter,      setFilter]      = useState<FilterType>('all')
  // 세그먼트 필터 (null = 전체)
  const [segFilter,   setSegFilter]   = useState<Set<string> | null>(null)
  const [segDropOpen, setSegDropOpen] = useState(false)
  const segDropRef = useRef<HTMLDivElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // FCST 인라인 수정 임시값 — key = `${date}::${seg}`
  const [localFix, setLocalFix] = useState<Map<string, { rn?: number; adr?: number }>>(new Map())
  // bulk bar
  const [bulkField, setBulkField] = useState<BulkField>('rn')
  const [bulkMode,  setBulkMode]  = useState<BulkMode>('flat')
  const [bulkValue, setBulkValue] = useState<string>('3')
  // BAR Rate / OTA 수수료
  const [commission, setCommission] = useState<number>(OTA_COMMISSION_DEFAULT)
  // key: business_date → { bar_rate, surcharge_avg }
  const [barRateMap, setBarRateMap] = useState<Map<string, { bar_rate: number; surcharge_avg: number }>>(new Map())
  // 세그 코드 → 채널 (c05.sorting1 raw 값, 예: 'direct'/'ota'/'member' 등)
  const [channelMap, setChannelMap] = useState<Record<string, string>>({})
  // FCST ADR 입력 포커스 여부 (포커스 시 원단위, 아니면 천원단위 표시)
  const [focusedAdrKey, setFocusedAdrKey] = useState<string | null>(null)

  const roomCount = schema.roomCount

  // 세그 채널 분류 — c05를 직접 조회 (ADR 시뮬레이터와 동일, 코드별 last-write-wins)
  useEffect(() => {
    if (!isOpen || !schema.hotelId) return
    ;(supabase as any)
      .from('c05_market_table_schema')
      .select('segmentation, sorting1')
      .eq('hotel_id', schema.hotelId)
      .eq('is_active', true)
      .then(({ data, error }: any) => {
        if (error || !data) return
        const m: Record<string, string> = {}
        for (const row of data) {
          const sorting1 = (row.sorting1 ?? '').trim().toLowerCase() || 'other'
          // segmentation이 ["COR"] 형태의 JSON 배열일 수 있으므로 파싱
          let codes: string[] = []
          if (Array.isArray(row.segmentation)) {
            codes = row.segmentation
          } else if (typeof row.segmentation === 'string') {
            try {
              const parsed = JSON.parse(row.segmentation)
              codes = Array.isArray(parsed) ? parsed : [row.segmentation]
            } catch {
              codes = [row.segmentation]
            }
          }
          for (const code of codes) {
            m[code] = sorting1
          }
        }
        setChannelMap(m)
        console.log('[channelMap]', m)   // [DEBUG] 확인 후 제거
      })
  }, [isOpen, schema.hotelId])

  // 세그먼트 드롭다운 외부 클릭 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (segDropRef.current && !segDropRef.current.contains(e.target as Node)) {
        setSegDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── 이상 항목 계산 ──────────────────────────────────────────────────────────
  const alertRows = useMemo((): AlertRow[] => {
    const rows: AlertRow[] = []
    // schema에서 세그 이름 맵
    const segNameMap = new Map<string, string>()
    function walkNodes(nodes: typeof schema.nodes) {
      for (const node of nodes) {
        for (const code of node.segmentationCodes) segNameMap.set(code, node.name)
        if (node.children?.length) walkNodes(node.children)
      }
    }
    walkNodes(schema.nodes)

    for (const day of data) {
      if (day.is_actual_day) continue
      if (day.business_date < otbDate) continue  // otbDate 당일부터 포함

      for (const code of schema.allSegmentationCodes) {
        const v = day.values[code]
        if (!v) continue

        const fcst_rn  = getEffectiveRn(day, code, editedValues)
        const fcst_adr = getEffectiveAdr(day, code, editedValues)
        const otb_rn   = v.otb_rn
        const otb_adr  = otb_rn > 0 ? Math.round(v.otb_rev / otb_rn) : 0

        const isRnAlert  = otb_rn > fcst_rn + RN_THRESHOLD
        const adrDiffPct = otb_adr > 0
          ? ((fcst_adr - otb_adr) / otb_adr) * 100
          : 0
        const isAdrAlert = Math.abs(adrDiffPct) >= ADR_THRESHOLD

        if (!isRnAlert && !isAdrAlert) continue

        const alertType: AlertType = isRnAlert && isAdrAlert ? 'both'
          : isRnAlert ? 'rn' : 'adr'

        rows.push({
          business_date: day.business_date,
          day_label:     day.day_label,
          segmentation:  code,
          seg_name:      segNameMap.get(code) ?? code,
          alertType,
          otb_rn,
          fcst_rn,
          otb_adr,
          fcst_adr,
          adr_diff_pct:  adrDiffPct,
          occ_pct:       (() => {
            if (roomCount <= 0) return 0
            let totalOtbRn = 0
            for (const c of schema.allSegmentationCodes) {
              totalOtbRn += day.values[c]?.otb_rn ?? 0
            }
            return (totalOtbRn / roomCount) * 100
          })(),
          fcst_occ_pct:  (() => {
            if (roomCount <= 0) return 0
            let totalFcstRn = 0
            for (const c of schema.allSegmentationCodes) {
              const v = day.values[c]
              if (!v) continue
              const edited = editedValues.get(makeEditKey(day.business_date, c))
              totalFcstRn += edited?.rn ?? v.rn
            }
            return (totalFcstRn / roomCount) * 100
          })(),
        })
      }
    }
    return rows
  }, [data, schema, editedValues, otbDate, roomCount])

  // ── BAR Rate fetch — 모달 열릴 때 alertRows 날짜들에 대해 ─────────────────────
  useEffect(() => {
    if (!isOpen || alertRows.length === 0) return

    const dates = [...new Set(alertRows.map(r => r.business_date))]

    console.log('[dates]', dates)
    ;(supabase as any).rpc('get_bar_rates_for_dates', {
      p_hotel_id: schema.hotelId,
      p_dates:    `{${dates.join(',')}}`,
      p_otb_date: otbDate,
    }).then(({ data, error }: any) => {
      // [DEBUG] RPC 응답 확인 (확인 후 제거)
      console.log('[get_bar_rates_for_dates] error =', error, 'data =', data)
      if (error || !data) return
      const map = new Map<string, { bar_rate: number; surcharge_avg: number }>()
      for (const row of data) {
        map.set(String(row.business_date).slice(0, 10), {
          bar_rate:      row.bar_rate,
          surcharge_avg: row.surcharge_avg,
        })
      }
      setBarRateMap(map)
      // [DEBUG] barRateMap 확인 (확인 후 제거)
      console.log('[barRateMap]', [...map.entries()])
      console.log('[barRateMap first entry]', [...map.entries()][0])
    })
  }, [isOpen, alertRows, otbDate, schema.hotelId])

  const filteredRows = useMemo(() => {
    let rows = alertRows
    // 타입 필터
    if (filter !== 'all') {
      rows = rows.filter(r =>
        filter === 'both'
          ? r.alertType === 'both'
          : filter === 'rn'
            ? r.alertType === 'rn'  || r.alertType === 'both'
            : r.alertType === 'adr' || r.alertType === 'both'
      )
    }
    // 세그먼트 필터
    if (segFilter !== null) {
      if (segFilter.size === 0) {
        rows = []  // Reset = 아무것도 선택 안 함 = 0건
      } else {
        rows = rows.filter(r => segFilter.has(r.segmentation))
      }
    }
    return rows
  }, [alertRows, filter, segFilter])

  const rnCount  = alertRows.filter(r => r.alertType === 'rn' || r.alertType === 'both').length
  const adrCount = alertRows.filter(r => r.alertType === 'adr' || r.alertType === 'both').length

  // ── row key ─────────────────────────────────────────────────────────────────
  const rowKey = (r: AlertRow) => `${r.business_date}::${r.segmentation}`

  // ── 선택 토글 ────────────────────────────────────────────────────────────────
  function toggleSelect(key: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(filteredRows.map(rowKey)) : new Set())
  }

  // ── FCST 인라인 수정 ─────────────────────────────────────────────────────────
  function setFix(date: string, seg: string, field: 'rn' | 'adr', val: number) {
    const key = `${date}::${seg}`
    setLocalFix(prev => {
      const next = new Map(prev)
      next.set(key, { ...next.get(key), [field]: val })
      return next
    })
  }
  function getFixRn(r: AlertRow): number {
    return localFix.get(rowKey(r))?.rn ?? r.fcst_rn
  }
  function getFixAdr(r: AlertRow): number {
    return localFix.get(rowKey(r))?.adr ?? r.fcst_adr
  }

  // ── 예상 ADR (BAR + 부가 − OTA 수수료) ───────────────────────────────────────
  function getExpectedAdr(r: AlertRow, barInfo: { bar_rate: number; surcharge_avg: number } | undefined): number | null {
    if (!barInfo || barInfo.bar_rate === 0) return null

    // 채널: c05.sorting1 기반 channelMap (코드 단위)
    const channel = channelMap[r.segmentation]
    if (channel !== 'direct' && channel !== 'ota') return null

    const base = barInfo.bar_rate + barInfo.surcharge_avg
    if (channel === 'ota') {
      return Math.round(base * (1 - commission / 100))
    }
    return Math.round(base)
  }

  // ── bulk apply ───────────────────────────────────────────────────────────────
  function applyBulk() {
    const num = parseFloat(bulkValue)
    if (isNaN(num)) return
    const targets = filteredRows.filter(r => selectedIds.has(rowKey(r)))
    setLocalFix(prev => {
      const next = new Map(prev)
      for (const r of targets) {
        const key = rowKey(r)
        const cur = next.get(key) ?? {}
        if (bulkField === 'rn') {
          const base = cur.rn ?? r.fcst_rn
          const val  = bulkMode === 'flat' ? base + num
            : bulkMode === 'pct' ? Math.round(base * (1 + num / 100))
            : num
          next.set(key, { ...cur, rn: Math.min(Math.round(val), roomCount) })
        } else {
          const base = cur.adr ?? r.fcst_adr
          const val  = bulkMode === 'flat' ? base + num * 1000
            : bulkMode === 'pct' ? Math.round(base * (1 + num / 100))
            : num * 1000
          next.set(key, { ...cur, adr: Math.round(val) })
        }
      }
      return next
    })
  }

  function matchOtb() {
    const targets = filteredRows.filter(r => selectedIds.has(rowKey(r)))
    setLocalFix(prev => {
      const next = new Map(prev)
      for (const r of targets) {
        const key = rowKey(r)
        const cur = next.get(key) ?? {}
        if (bulkField === 'rn') next.set(key, { ...cur, rn: r.otb_rn })
        else next.set(key, { ...cur, adr: r.otb_adr })
      }
      return next
    })
  }

  // ── 저장 — localFix를 editedValues에 머지 후 onSave ──────────────────────────
  function handleSave() {
    const next = new Map(editedValues)
    for (const [key, fix] of localFix.entries()) {
      const existing = next.get(key) ?? {}
      next.set(key, { ...existing, ...fix })
    }
    onEditChange(next)
    setTimeout(() => onSave(), 0)
  }

  if (!isOpen) return null

  // ── styles ───────────────────────────────────────────────────────────────────
  const BORDER  = '0.5px solid rgba(255,255,255,0.07)'
  const GBORDER = '1px solid rgba(255,255,255,0.08)'
  const BG      = '#0f0f0f'
  const TEXT    = 'rgba(255,255,255,0.85)'
  const MUTED   = 'rgba(255,255,255,0.2)'

  const thBase: React.CSSProperties = {
    background:  '#131313',
    color:       'rgba(255,255,255,0.28)',
    fontWeight:  400,
    fontSize:    11,
    padding:     '5px 10px',
    whiteSpace:  'nowrap',
    textAlign:   'right',
    borderBottom: BORDER,
    position:    'sticky',
    top:          0,
    zIndex:       2,
  }
  const tdBase: React.CSSProperties = {
    padding:      '7px 10px',
    fontSize:     11,
    whiteSpace:   'nowrap',
    borderBottom: BORDER,
    textAlign:    'right',
    color:        'rgba(255,255,255,0.65)',
  }

  const allChecked = filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(rowKey(r)))

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 60, padding: '24px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:    BG,
          border:        '0.5px solid rgba(255,255,255,0.1)',
          borderRadius:  12,
          width:         '100%',
          maxWidth:      1000,
          maxHeight:     'calc(100vh - 48px)',
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 18px', borderBottom: BORDER, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: TEXT }}>Forecast Alerts</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                {alertRows.length} items · Room cap: {roomCount}
              </div>
            </div>
            {rnCount > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 500, background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '0.5px solid rgba(239,68,68,0.2)' }}>
                <TrendingDown size={10} />{rnCount} RN gaps
              </div>
            )}
            {adrCount > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 500, background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '0.5px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={10} />{adrCount} ADR issues
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {/* 통합 필터: All / R/N / ADR / Segment */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

              {/* 통합 필터 컨테이너 */}
              <div style={{
                display:      'inline-flex',
                alignItems:   'center',
                background:   'rgba(255,255,255,0.05)',
                borderRadius: 999,
                padding:      4,
                border:       '0.5px solid rgba(255,255,255,0.12)',
                gap:          2,
              }}>
                {(['all', 'rn', 'adr', 'both'] as FilterType[]).map(f => (
                  <button
                    key={f}
                    onClick={e => { e.stopPropagation(); setFilter(f) }}
                    style={{
                      padding:      '5px 14px',
                      borderRadius: 999,
                      fontSize:     12,
                      fontWeight:   600,
                      border:       'none',
                      cursor:       'pointer',
                      background:   filter === f ? '#00E5A0' : 'transparent',
                      color:        filter === f ? '#0a2018' : 'rgba(255,255,255,0.3)',
                      transition:   'all 0.15s',
                      whiteSpace:   'nowrap',
                    }}
                  >
                    {f === 'all' ? 'All' : f === 'rn' ? 'R/N' : f === 'adr' ? 'ADR' : 'R/N+ADR'}
                  </button>
                ))}

                {/* 구분선 */}
                <div style={{ width: '0.5px', height: 16, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

                {/* Segment 드롭다운 트리거 */}
                <div ref={segDropRef} style={{ position: 'relative' }}>
                  <button
                    onClick={e => { e.stopPropagation(); setSegDropOpen(prev => !prev) }}
                    style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      gap:          5,
                      padding:      '5px 12px',
                      borderRadius: 999,
                      border:       'none',
                      cursor:       'pointer',
                      background:   segFilter !== null && segFilter.size > 0
                        ? 'rgba(0,229,160,0.15)'
                        : 'transparent',
                      color:        segFilter !== null && segFilter.size > 0
                        ? '#00E5A0'
                        : 'rgba(255,255,255,0.3)',
                      fontSize:     12,
                      fontWeight:   600,
                      whiteSpace:   'nowrap',
                      transition:   'all 0.15s',
                    }}
                  >
                    <SlidersHorizontal size={11} />
                    Segment
                    {segFilter !== null && segFilter.size > 0 && (
                      <span style={{
                        display:        'inline-flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        width:          16,
                        height:         16,
                        borderRadius:   '50%',
                        background:     '#00E5A0',
                        color:          '#0a2018',
                        fontSize:       9,
                        fontWeight:     700,
                      }}>
                        {(() => {
                          const leafNodes: typeof schema.nodes[0][] = []
                          function collectLeaves(nodes: typeof schema.nodes) {
                            for (const node of nodes) {
                              if (node.children && node.children.length > 0) collectLeaves(node.children)
                              else leafNodes.push(node)
                            }
                          }
                          collectLeaves(schema.nodes)
                          return leafNodes.filter(n => n.segmentationCodes.some(c => segFilter!.has(c))).length
                        })()}
                      </span>
                    )}
                    <ChevronDown size={11} style={{ opacity: 0.5 }} />
                  </button>

                  {/* 드롭다운 — fixed 위치 (잘림 방지) */}
                  {segDropOpen && (() => {
                    const rect = segDropRef.current?.getBoundingClientRect()
                    return (
                    <div style={{
                      position:      'fixed',
                      top:           rect ? rect.bottom + 8 : 0,
                      right:         rect ? window.innerWidth - rect.right : 0,
                      background:    '#1a1a1a',
                      border:        '0.5px solid rgba(255,255,255,0.12)',
                      borderRadius:  8,
                      minWidth:      200,
                      maxHeight:     360,
                      zIndex:        100,
                      display:       'flex',
                      flexDirection: 'column',
                    }}>
                      {/* 세그먼트 목록 (스크롤) — 대분류 제외, leaf만 */}
                      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {(() => {
                      const leafNodes: typeof schema.nodes[0][] = []
                      function collectLeaves(nodes: typeof schema.nodes) {
                        for (const node of nodes) {
                          if (node.children && node.children.length > 0) {
                            collectLeaves(node.children)
                          } else {
                            leafNodes.push(node)
                          }
                        }
                      }
                      collectLeaves(schema.nodes)
                      return leafNodes.map(node => {
                        const isSelected = segFilter === null ||
                          node.segmentationCodes.some(c => segFilter.has(c))
                        return (
                          <div
                            key={node.id}
                            onClick={e => {
                              e.stopPropagation()
                              setSegFilter(prev => {
                                const allCodes = new Set(schema.allSegmentationCodes)
                                const base = prev === null ? new Set(allCodes) : new Set(prev)
                                const codes = node.segmentationCodes
                                const allIn = codes.every(c => base.has(c))
                                if (allIn) codes.forEach(c => base.delete(c))
                                else codes.forEach(c => base.add(c))
                                if (base.size === allCodes.size) return null
                                return new Set(base)
                              })
                            }}
                            style={{
                              display:      'flex',
                              alignItems:   'center',
                              gap:          8,
                              padding:      '6px 8px',
                              borderRadius: 5,
                              cursor:       'pointer',
                              fontSize:     12,
                              color:        isSelected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                          >
                            <div style={{
                              width:           14,
                              height:          14,
                              borderRadius:    3,
                              background:      isSelected ? '#00E5A0' : 'transparent',
                              border:          `0.5px solid ${isSelected ? '#00E5A0' : 'rgba(255,255,255,0.2)'}`,
                              display:         'flex',
                              alignItems:      'center',
                              justifyContent:  'center',
                              flexShrink:      0,
                              transition:      'all 0.15s',
                            }}>
                              {isSelected && <Check size={9} color="#0a2018" />}
                            </div>
                            {node.name}
                          </div>
                        )
                      })
                      })()}
                      </div>

                      {/* 하단: 버튼 고정 */}
                      <div style={{ flexShrink: 0, borderTop: '0.5px solid rgba(255,255,255,0.08)', padding: '4px 6px', display: 'flex', gap: 4 }}>
                        <button
                          onClick={e => { e.stopPropagation(); setSegFilter(null) }}
                          style={{
                            flex: 1, padding: '5px', borderRadius: 5,
                            border: '0.5px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.04)',
                            color: 'rgba(255,255,255,0.4)', fontSize: 10, cursor: 'pointer',
                          }}
                        >
                          All
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setSegFilter(new Set()) }}
                          style={{
                            flex: 1, padding: '5px', borderRadius: 5,
                            border: '0.5px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.04)',
                            color: 'rgba(255,255,255,0.4)', fontSize: 10, cursor: 'pointer',
                          }}
                        >
                          Reset
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setSegDropOpen(false) }}
                          style={{
                            flex: 1, padding: '5px', borderRadius: 5,
                            border: 'none',
                            background: 'rgba(0,229,160,0.12)',
                            color: '#00E5A0', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          Done
                        </button>
                      </div>
                    </div>
                    )
                  })()}
                </div>
              </div>

            </div>
            <button onClick={onClose} style={{
              width: 26, height: 26, borderRadius: 6,
              border: '0.5px solid rgba(255,255,255,0.09)',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <X size={13} />
            </button>
          </div>
        </div>

        {/* ── 테이블 스크롤 컨테이너 ── */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* Bulk bar — sticky */}
          <div style={{
            position:    'sticky',
            top:         0,
            zIndex:      10,
            display:     'flex',
            alignItems:  'center',
            gap:         7,
            padding:     '8px 18px',
            background:  '#0f0f0f',
            borderBottom: '0.5px solid rgba(0,229,160,0.07)',
            flexWrap:    'wrap',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(0,229,160,0.7)' }}>Bulk edit</span>
            <div style={{ width: '0.5px', height: 13, background: 'rgba(255,255,255,0.08)' }} />
            {/* RN / ADR */}
            {(['rn', 'adr'] as BulkField[]).map(f => (
              <div key={f} onClick={() => setBulkField(f)} style={{
                padding: '3px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 4,
                background: bulkField === f ? '#00E5A0' : 'rgba(255,255,255,0.05)',
                color: bulkField === f ? '#0a2018' : 'rgba(255,255,255,0.3)',
              }}>
                {f.toUpperCase()}
              </div>
            ))}
            {/* +flat / +% / set */}
            <div style={{ display: 'inline-flex', border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 4, overflow: 'hidden' }}>
              {([['flat', '+flat'], ['pct', '+%'], ['set', 'set']] as [BulkMode, string][]).map(([m, label]) => (
                <div key={m} onClick={() => setBulkMode(m)} style={{
                  padding: '3px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  borderRight: '0.5px solid rgba(255,255,255,0.07)',
                  background: bulkMode === m ? 'rgba(0,229,160,0.15)' : 'transparent',
                  color: bulkMode === m ? '#00E5A0' : 'rgba(255,255,255,0.3)',
                }}>{label}</div>
              ))}
            </div>
            <input
              value={bulkValue}
              onChange={e => setBulkValue(e.target.value)}
              style={{ width: 42, padding: '3px 6px', fontSize: 10, borderRadius: 4, border: '0.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', textAlign: 'center', outline: 'none' }}
            />
            <button onClick={applyBulk} style={{
              padding: '3px 9px', borderRadius: 4, border: 'none',
              background: '#00E5A0', color: '#0a2018', fontSize: 10, fontWeight: 600, cursor: 'pointer',
            }}>Apply</button>
            <button onClick={matchOtb} style={{
              padding: '3px 9px', borderRadius: 4,
              border: '0.5px solid rgba(255,255,255,0.08)', background: 'transparent',
              color: 'rgba(255,255,255,0.3)', fontSize: 10, cursor: 'pointer',
            }}>Match OTB</button>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>
              {selectedIds.size} selected
            </span>
          </div>

        {/* ── Table ── */}
          <style>{`
            .alert-row:hover td { background: rgba(0,229,160,0.025) !important; }
            input[type=number]::-webkit-inner-spin-button,
            input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
            input[type=number] { -moz-appearance: textfield; }
          `}</style>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', minWidth: 860 }}>
            <colgroup>
              <col style={{ width: 26 }} />   {/* checkbox */}
              <col style={{ width: 88 }} />   {/* Date */}
              <col style={{ width: 110 }} />  {/* Segment */}
              <col style={{ width: 72 }} />   {/* Alert */}
              <col style={{ width: 58 }} />   {/* OCC OTB */}
              <col style={{ width: 58 }} />   {/* OCC FCST */}
              <col style={{ width: 52 }} />   {/* R/N OTB */}
              <col style={{ width: 52 }} />   {/* R/N FCST */}
              <col style={{ width: 52 }} />   {/* R/N GAP */}
              <col style={{ width: 56 }} />   {/* ADR OTB */}
              <col style={{ width: 56 }} />   {/* ADR FCST */}
              <col style={{ width: 52 }} />   {/* ADR Δ% */}
              <col style={{ width: 60 }} />   {/* BAR 현재 */}
              <col style={{ width: 72 }} />   {/* 예상 ADR */}
            </colgroup>
            <thead>
              {/* 그룹 헤더 */}
              <tr>
                <th style={{ ...thBase, top: 37,textAlign: 'center' }} rowSpan={2}>
                  <input type="checkbox" checked={allChecked} onChange={e => toggleAll(e.target.checked)}
                    style={{ width: 13, height: 13, accentColor: '#00E5A0', cursor: 'pointer' }} />
                </th>
                <th style={{ ...thBase, top: 37,textAlign: 'left' }} rowSpan={2}>Date</th>
                <th style={{ ...thBase, top: 37,textAlign: 'left' }} rowSpan={2}>Segment</th>
                <th style={{ ...thBase, top: 37,textAlign: 'center' }} rowSpan={2}>Alert</th>
                {/* OCC 그룹 */}
                <th style={{ ...thBase, top: 37,textAlign: 'center', color: 'rgba(99,102,241,0.8)', borderLeft: GBORDER }} colSpan={2}>
                  OCC%
                </th>
                {/* R/N 그룹 */}
                <th style={{ ...thBase, top: 37,textAlign: 'center', color: 'rgba(239,68,68,0.8)', borderLeft: GBORDER }} colSpan={3}>
                  R/N
                </th>
                {/* ADR 그룹 */}
                <th style={{ ...thBase, top: 37,textAlign: 'center', color: 'rgba(245,158,11,0.5)', borderLeft: GBORDER, opacity: 0.6 }} colSpan={3}>
                  ADR
                </th>
                {/* BAR 그룹 — 수수료 입력 포함 */}
                <th
                  colSpan={2}
                  style={{
                    ...thBase,
                    top:        37,
                    textAlign:  'center',
                    color:      'rgba(0,229,160,0.8)',
                    borderLeft: '1px solid rgba(0,229,160,0.2)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <span>BAR</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>수수료</span>
                      <input
                        type="number"
                        value={commission}
                        onChange={e => setCommission(parseFloat(e.target.value) || 0)}
                        min={0}
                        max={50}
                        style={{
                          width:         32,
                          padding:       '1px 4px',
                          fontSize:      10,
                          borderRadius:  4,
                          border:        '0.5px solid rgba(0,229,160,0.35)',
                          background:    'rgba(0,229,160,0.06)',
                          color:         '#00E5A0',
                          textAlign:     'center',
                          outline:       'none',
                          MozAppearance: 'textfield' as any,
                        }}
                      />
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>%</span>
                    </div>
                  </div>
                </th>
              </tr>
              {/* 서브 헤더 */}
              <tr>
                {/* OCC */}
                <th style={{ ...thBase, top: 64, borderLeft: GBORDER }}>OTB</th>
                <th style={{ ...thBase, top: 64 }}>FCST</th>
                {/* R/N */}
                <th style={{ ...thBase, top: 64, borderLeft: GBORDER }}>OTB</th>
                <th style={{ ...thBase, top: 64 }}>FCST</th>
                <th style={{ ...thBase, top: 64, color: '#00E5A0', fontWeight: 600 }}>GAP</th>
                {/* ADR */}
                <th style={{ ...thBase, top: 64, borderLeft: GBORDER, opacity: 0.5 }}>OTB</th>
                <th style={{ ...thBase, top: 64, opacity: 0.5 }}>FCST</th>
                <th style={{ ...thBase, top: 64, opacity: 0.5 }}>Δ%</th>
                {/* BAR */}
                <th style={{ ...thBase, top: 64, borderLeft: '1px solid rgba(0,229,160,0.2)' }}>BAR</th>
                <th style={{ ...thBase, top: 64, color: 'rgba(0,229,160,0.7)' }}>예상 ADR</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={14} style={{ ...tdBase, textAlign: 'center', color: MUTED, padding: '32px 0' }}>
                    No alerts detected
                  </td>
                </tr>
              )}
              {filteredRows.map((r, i) => {
                const key      = rowKey(r)
                const checked  = selectedIds.has(key)
                const prevDate = i > 0 ? filteredRows[i - 1].business_date : null
                const isNewDay = prevDate !== r.business_date
                // 인라인 수정값 기반 파생값 (실시간 재계산)
                const fixRn      = getFixRn(r)
                const fixAdr     = getFixAdr(r)
                const fixOccPct  = (() => {
                  // 해당 날짜 전체 세그 FCST(수정값 우선) 합산 기준
                  if (roomCount <= 0) return 0
                  const day = data.find(d => d.business_date === r.business_date)
                  if (!day) return 0
                  let total = 0
                  for (const code of schema.allSegmentationCodes) {
                    if (!day.values[code]) continue
                    const fixed = localFix.get(`${r.business_date}::${code}`)?.rn
                    total += fixed !== undefined ? fixed : getEffectiveRn(day, code, editedValues)
                  }
                  return (total / roomCount) * 100
                })()
                const rnGap      = fixRn - r.otb_rn
                const adrDiffPct = r.otb_adr > 0 ? ((fixAdr - r.otb_adr) / r.otb_adr) * 100 : 0

                return (
                  <tr key={key} className="alert-row" style={{ borderTop: isNewDay && i > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
                    {/* checkbox */}
                    <td style={{ ...tdBase, textAlign: 'center' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleSelect(key)} style={{ width: 13, height: 13, accentColor: '#00E5A0', cursor: 'pointer' }} />
                    </td>
                    {/* date */}
                    <td style={{
                      ...tdBase,
                      textAlign: 'left',
                      fontWeight: 500,
                      color: isNewDay ? getDayColor(r.business_date, otbDate) : MUTED,
                    }}>
                      {isNewDay ? r.day_label : '↳'}
                    </td>
                    {/* seg */}
                    <td style={{ ...tdBase, textAlign: 'left', color: 'rgba(255,255,255,0.5)' }}>{r.seg_name}</td>
                    {/* alert tag */}
                    <td style={{ ...tdBase, textAlign: 'center', padding: '7px 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                        {/* RN↓ — 왼쪽 */}
                        <span style={{
                          visibility: (r.alertType === 'rn' || r.alertType === 'both') ? 'visible' : 'hidden',
                          display:    'inline-flex',
                          alignItems: 'center',
                          padding:    '2px 5px',
                          borderRadius: 3,
                          fontSize:   9,
                          fontWeight: 700,
                          background: 'rgba(239,68,68,0.15)',
                          color:      '#f87171',
                        }}>RN↓</span>
                        {/* ADR! — 오른쪽 */}
                        <span style={{
                          visibility: (r.alertType === 'adr' || r.alertType === 'both') ? 'visible' : 'hidden',
                          display:    'inline-flex',
                          alignItems: 'center',
                          padding:    '2px 5px',
                          borderRadius: 3,
                          fontSize:   9,
                          fontWeight: 700,
                          background: 'rgba(245,158,11,0.15)',
                          color:      '#fbbf24',
                        }}>ADR!</span>
                      </div>
                    </td>
                    {/* OCC OTB */}
                    <td style={{ ...tdBase, borderLeft: GBORDER }}>
                      {r.occ_pct.toFixed(0)}%
                    </td>
                    {/* OCC FCST */}
                    <td style={{
                      ...tdBase,
                      color: fixOccPct > r.occ_pct ? '#00E5A0'
                           : fixOccPct < r.occ_pct ? '#f87171'
                           : 'rgba(255,255,255,0.65)',
                      fontWeight: localFix.get(rowKey(r))?.rn !== undefined ? 600 : 400,
                    }}>
                      {fixOccPct.toFixed(0)}%
                    </td>
                    {/* R/N OTB */}
                    <td style={{ ...tdBase, borderLeft: GBORDER }}>{fmtRn(r.otb_rn)}</td>
                    {/* R/N FCST — 인라인 수정 (RN alert만) */}
                    <td style={{ ...tdBase, padding: '4px 6px', cursor: 'pointer' }}
                      onClick={e => e.stopPropagation()}
                    >
                      {r.alertType !== 'adr' ? (
                        <input
                          type="number"
                          value={getFixRn(r)}
                          min={0}
                          max={roomCount}
                          onFocus={e => e.currentTarget.select()}
                          onChange={e => {
                            const v = Math.min(parseInt(e.target.value) || 0, roomCount)
                            setFix(r.business_date, r.segmentation, 'rn', v)
                          }}
                          style={{
                            width:        48,
                            padding:      '2px 5px',
                            fontSize:     11,
                            borderRadius: 4,
                            border:       localFix.get(rowKey(r))?.rn !== undefined
                              ? '1px solid rgba(0,229,160,0.5)'
                              : '1px solid rgba(255,255,255,0.1)',
                            background:   localFix.get(rowKey(r))?.rn !== undefined
                              ? 'rgba(0,229,160,0.06)'
                              : 'rgba(255,255,255,0.04)',
                            color:        localFix.get(rowKey(r))?.rn !== undefined
                              ? '#00E5A0'
                              : 'rgba(255,255,255,0.65)',
                            textAlign:    'right',
                            outline:      'none',
                          }}
                        />
                      ) : (
                        <span style={{ color: MUTED }}>—</span>
                      )}
                    </td>
                    {/* GAP (FCST - OTB) */}
                    <td style={{
                      ...tdBase,
                      color:      rnGap > 0 ? '#00E5A0' : rnGap < 0 ? '#f87171' : MUTED,
                      fontWeight: rnGap !== 0 ? 600 : 400,
                    }}>
                      {rnGap === 0 ? '—' : (rnGap > 0 ? '+' : '') + rnGap}
                    </td>
                    {/* ADR OTB */}
                    <td style={{ ...tdBase, borderLeft: GBORDER, opacity: 0.5, color: r.otb_adr > 0 ? 'rgba(255,255,255,0.65)' : MUTED }}>
                      {r.otb_adr > 0 ? fmtAdr(r.otb_adr) : '—'}
                    </td>
                    {/* ADR FCST — 인라인 수정 (ADR alert만) */}
                    <td style={{ ...tdBase, padding: '4px 6px', opacity: 0.7, cursor: 'pointer' }}
                      onClick={e => e.stopPropagation()}
                    >
                      {r.alertType !== 'rn' ? (
                        <input
                          type="number"
                          value={focusedAdrKey === rowKey(r) ? getFixAdr(r) : Math.round(getFixAdr(r) / 1000)}
                          step={focusedAdrKey === rowKey(r) ? 1000 : 1}
                          onFocus={e => {
                            setFocusedAdrKey(rowKey(r))
                            // 포커스 시 원단위로 전환 후 전체 선택
                            const el = e.currentTarget
                            setTimeout(() => el?.select(), 0)
                          }}
                          onBlur={() => setFocusedAdrKey(null)}
                          onChange={e => {
                            const raw = parseInt(e.target.value) || 0
                            // 포커스 중이면 원단위, 아니면 천원단위 × 1000
                            const val = focusedAdrKey === rowKey(r) ? raw : raw * 1000
                            setFix(r.business_date, r.segmentation, 'adr', val)
                          }}
                          style={{
                            width:        56,
                            padding:      '3px 5px',
                            fontSize:     11,
                            borderRadius: 4,
                            border:       localFix.get(rowKey(r))?.adr !== undefined
                              ? '1px solid rgba(0,229,160,0.5)'
                              : '1px solid rgba(255,255,255,0.1)',
                            background:   localFix.get(rowKey(r))?.adr !== undefined
                              ? 'rgba(0,229,160,0.06)'
                              : 'rgba(255,255,255,0.04)',
                            color:        localFix.get(rowKey(r))?.adr !== undefined
                              ? '#00E5A0'
                              : 'rgba(255,255,255,0.65)',
                            textAlign:    'right',
                            outline:      'none',
                          }}
                        />
                      ) : (
                        <span style={{ color: MUTED }}>—</span>
                      )}
                    </td>
                    {/* ADR Δ% */}
                    <td style={{
                      ...tdBase,
                      opacity:    localFix.get(rowKey(r))?.adr !== undefined ? 1 : 0.5,
                      color:      adrDiffPct < 0 ? '#f87171' : adrDiffPct > 0 ? '#00E5A0' : MUTED,
                      fontWeight: 600,
                    }}>
                      {r.otb_adr > 0 ? `${adrDiffPct > 0 ? '+' : ''}${adrDiffPct.toFixed(1)}%` : '—'}
                    </td>
                    {/* BAR 현재 */}
                    {(() => {
                      const barInfo = barRateMap.get(r.business_date)
                      const bar = barInfo?.bar_rate ?? 0
                      return (
                        <td style={{
                          ...tdBase,
                          borderLeft: '1px solid rgba(0,229,160,0.2)',
                          fontWeight: bar > 0 ? 600 : 400,
                          color:      bar > 0 ? 'rgba(255,255,255,0.8)' : MUTED,
                        }}>
                          {bar > 0 ? `${Math.round(bar / 1000)}K` : '—'}
                        </td>
                      )
                    })()}
                    {/* 예상 ADR */}
                    {(() => {
                      const barInfo  = barRateMap.get(r.business_date)
                      const expected = getExpectedAdr(r, barInfo)
                      const fcstAdr  = getFixAdr(r)
                      if (expected === null) {
                        return <td style={{ ...tdBase, color: MUTED }}>—</td>
                      }
                      const isGood = expected >= fcstAdr
                      return (
                        <td style={{
                          ...tdBase,
                          fontWeight: 600,
                          color:      isGood ? '#00E5A0' : '#f87171',
                        }}>
                          {`${Math.round(expected / 1000)}K`}
                        </td>
                      )
                    })()}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '10px 18px', borderTop: BORDER, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: MUTED }}>
              OCC/RN/ADR 비교 · GAP = FCST − OTB · Cap: {roomCount} rooms
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onClose} style={{
              padding: '5px 12px', borderRadius: 6,
              border: '0.5px solid rgba(255,255,255,0.09)', background: 'transparent',
              color: 'rgba(255,255,255,0.35)', fontSize: 11, cursor: 'pointer',
            }}>Cancel</button>
            <button
              onClick={() => setLocalFix(new Map())}
              disabled={localFix.size === 0}
              style={{
                padding:      '5px 12px',
                borderRadius: 6,
                border:       '0.5px solid rgba(255,255,255,0.09)',
                background:   'transparent',
                color:        localFix.size > 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                fontSize:     11,
                cursor:       localFix.size > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              Revert
            </button>
            <button onClick={handleSave} disabled={localFix.size === 0 && editedValues.size === 0 || saving} style={{
              padding: '5px 16px', borderRadius: 6, border: 'none',
              background: localFix.size > 0 || editedValues.size > 0 ? '#00E5A0' : 'rgba(255,255,255,0.07)',
              color: localFix.size > 0 || editedValues.size > 0 ? '#0a2018' : 'rgba(255,255,255,0.2)',
              fontSize: 11, fontWeight: 600,
              cursor: (localFix.size > 0 || editedValues.size > 0) && !saving ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
