'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { X, AlertTriangle, TrendingDown, ChevronDown, Check, SlidersHorizontal, Search, Pencil } from 'lucide-react'
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
  onSave:        () => Promise<void>
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
  // 드롭다운 임시 선택 — Done 클릭 시에만 segFilter로 반영
  const [tempSegFilter, setTempSegFilter] = useState<Set<string> | null>(segFilter)
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

  // 검색 조건 (Search 드롭다운)
  const [searchDropOpen, setSearchDropOpen] = useState(false)
  const searchDropRef = useRef<HTMLDivElement>(null)
  const [condRnEnabled,  setCondRnEnabled]  = useState(false)  // R/N: FCST<OTB
  const [condAdrEnabled, setCondAdrEnabled] = useState(false)  // ADR 차이
  const [adrThreshold,   setAdrThreshold]   = useState(10)     // ±%
  const [condOccEnabled, setCondOccEnabled] = useState(false)  // OCC%
  const [occDirection,   setOccDirection]   = useState<'gte' | 'lte'>('gte')
  const [occThreshold,   setOccThreshold]   = useState(90)
  const [occBasis,       setOccBasis]       = useState<'otb' | 'fcst'>('otb')
  // 검색 실행 여부 — 검색 버튼을 누르기 전엔 false
  const [searched, setSearched] = useState(false)
  const [searchWarning, setSearchWarning] = useState(false)   // 조건 미선택 경고
  // 실제 검색에 적용된 조건 스냅샷 (입력 중인 값과 분리)
  const [appliedCond, setAppliedCond] = useState({
    rn: false, adr: false, adrThreshold: 10,
    occ: false, occDirection: 'gte' as 'gte' | 'lte', occThreshold: 90,
    occBasis: 'otb' as 'otb' | 'fcst',
  })
  // Bulk edit 드롭다운
  const [bulkDropOpen, setBulkDropOpen] = useState(false)
  const bulkDropRef = useRef<HTMLDivElement>(null)
  // Match OTB 버튼 눌림 효과
  const [matchOtbPressed, setMatchOtbPressed] = useState(false)
  // Filter 드롭다운
  const [filterDropOpen, setFilterDropOpen] = useState(false)
  const filterDropRef = useRef<HTMLDivElement>(null)

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

  // 드롭다운 열릴 때 임시 선택을 현재 적용값(segFilter)으로 초기화
  useEffect(() => {
    if (segDropOpen) setTempSegFilter(segFilter)
  }, [segDropOpen])

  // Search 드롭다운 외부 클릭 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchDropRef.current && !searchDropRef.current.contains(e.target as Node)) setSearchDropOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Bulk edit 드롭다운 외부 클릭 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bulkDropRef.current && !bulkDropRef.current.contains(e.target as Node)) setBulkDropOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Filter 드롭다운 외부 클릭 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterDropRef.current && !filterDropRef.current.contains(e.target as Node)) setFilterDropOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // 선택된 행이 0개가 되면 Bulk edit 드롭다운 자동 닫기
  useEffect(() => {
    if (selectedIds.size === 0) setBulkDropOpen(false)
  }, [selectedIds])

  // Search 드롭다운 열릴 때 경고 초기화
  useEffect(() => {
    if (searchDropOpen) setSearchWarning(false)
  }, [searchDropOpen])

  // 검색 버튼 — 입력 조건을 스냅샷으로 적용하고 검색 실행
  function handleSearch() {
    if (!condRnEnabled && !condAdrEnabled && !condOccEnabled) {
      setSearchWarning(true)
      return  // 조건 미선택 → 검색 실행 안 함
    }
    setSearchWarning(false)

    const cond = {
      rn: condRnEnabled,
      adr: condAdrEnabled,
      adrThreshold,
      occ: condOccEnabled,
      occDirection,
      occThreshold,
      occBasis,
    }
    setAppliedCond(cond)
    setSearched(true)
    setSearchDropOpen(false)
  }

  // ── 이상 항목 계산 ──────────────────────────────────────────────────────────
  const alertRows = useMemo((): AlertRow[] => {
    if (!searched) return []   // 검색 전엔 빈 배열

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

        // R/N 조건: FCST < OTB (체크박스 ON일 때만)
        const isRnAlert = appliedCond.rn && (otb_rn > fcst_rn)

        // ADR 조건 (체크박스 ON일 때만)
        const adrDiffPct = otb_adr > 0 ? ((fcst_adr - otb_adr) / otb_adr) * 100 : 0
        const isAdrAlert = appliedCond.adr && (Math.abs(adrDiffPct) >= appliedCond.adrThreshold)

        // OCC% 조건 (체크박스 ON일 때만) — 날짜 전체 OCC 기준
        let isOccAlert = false
        if (appliedCond.occ) {
          let totalRn = 0
          for (const c of schema.allSegmentationCodes) {
            const dv = day.values[c]
            if (!dv) continue
            if (appliedCond.occBasis === 'fcst') {
              const edited = editedValues.get(makeEditKey(day.business_date, c))
              totalRn += edited?.rn ?? dv.rn
            } else {
              totalRn += dv.otb_rn ?? 0
            }
          }
          const occPct = roomCount > 0 ? (totalRn / roomCount) * 100 : 0
          isOccAlert = appliedCond.occDirection === 'gte'
            ? occPct >= appliedCond.occThreshold
            : occPct <= appliedCond.occThreshold
        }

        // 체크된 조건 중 하나라도 만족하면 alert (OR)
        if (!isRnAlert && !isAdrAlert && !isOccAlert) continue

        const alertType: AlertType =
          (isRnAlert && isAdrAlert) ? 'both' :
          isRnAlert ? 'rn' :
          isAdrAlert ? 'adr' :
          isOccAlert ? 'both' : 'rn'  // OCC 단독이면 R/N+ADR 둘다 보이게 'both'

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
  }, [searched, appliedCond, data, schema, editedValues, otbDate, roomCount])

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

    // 세그별 surcharge 프리미엄 = OTB ADR - 현재 BAR Rate
    // (이 세그가 평소 BAR 대비 어느 정도 비싼/저렴한 객실타입을 쓰는지)
    const premium = r.otb_rn > 0 ? (r.otb_adr - barInfo.bar_rate) : 0

    // R/N 증가율 반영 — FCST RN이 OTB RN보다 많이 늘었으면 프리미엄을 약하게 할인 (재고 소진 가정)
    const rnGrowth = r.otb_rn > 0 ? r.fcst_rn / r.otb_rn : 1
    const decay = Math.max(0.7, 1 - (rnGrowth - 1) * 0.1)
    const adjustedPremium = premium * decay

    const base = barInfo.bar_rate + adjustedPremium
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
  async function handleSave() {
    const next = new Map(editedValues)
    for (const [key, fix] of localFix.entries()) {
      const existing = next.get(key) ?? {}
      next.set(key, { ...existing, ...fix })
    }
    onEditChange(next)
    await onSave()          // 저장 완료(+재조회)까지 대기
    setLocalFix(new Map())  // localFix 초기화
    // onClose() 제거 — 저장 후에도 모달은 열린 채로 유지(데이터만 갱신)
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
                {searched ? `${alertRows.length} items` : '검색 대기 중'} · Room cap: {roomCount}
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
            {/* Search 트리거 + 드롭다운 */}
            <div ref={searchDropRef} style={{ position: 'relative' }}>
              <button
                onClick={e => { e.stopPropagation(); setSearchDropOpen(prev => !prev) }}
                style={{
                  padding: '5px 14px', borderRadius: 7, height: 30, boxSizing: 'border-box',
                  border: '0.5px solid rgba(0,229,160,0.3)',
                  background: 'rgba(0,229,160,0.08)', color: '#00E5A0',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <Search size={13} />
                Search
                {((condRnEnabled ? 1 : 0) + (condAdrEnabled ? 1 : 0) + (condOccEnabled ? 1 : 0)) > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 15, height: 15, borderRadius: '50%', background: '#00E5A0', color: '#0a2018',
                    fontSize: 9, fontWeight: 700,
                  }}>
                    {(condRnEnabled ? 1 : 0) + (condAdrEnabled ? 1 : 0) + (condOccEnabled ? 1 : 0)}
                  </span>
                )}
              </button>

              {searchDropOpen && (
                <div onClick={e => e.stopPropagation()} style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: '#161616', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
                  padding: 8, minWidth: 360, maxWidth: 380, zIndex: 100,
                  display: 'flex', flexDirection: 'column', gap: 4,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                }}>
                  {/* R/N 조건 */}
                  <div
                    onClick={() => { setCondRnEnabled(p => !p); setSearchWarning(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '12px 12px', borderRadius: 10, cursor: 'pointer',
                      background: condRnEnabled ? 'rgba(0,229,160,0.06)' : 'transparent',
                      border: condRnEnabled ? '1px solid rgba(0,229,160,0.25)' : '1px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6,
                        border: `1.5px solid ${condRnEnabled ? '#00E5A0' : 'rgba(255,255,255,0.2)'}`,
                        background: condRnEnabled ? '#00E5A0' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {condRnEnabled && <Check size={13} color="#0a2018" strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: condRnEnabled ? '#fff' : 'rgba(255,255,255,0.5)' }}>R/N</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>
                      FCST &lt; OTB
                    </span>
                  </div>

                  {/* ADR 차이 조건 */}
                  <div
                    onClick={() => { setCondAdrEnabled(p => !p); setSearchWarning(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '12px 12px', borderRadius: 10, cursor: 'pointer',
                      background: condAdrEnabled ? 'rgba(0,229,160,0.06)' : 'transparent',
                      border: condAdrEnabled ? '1px solid rgba(0,229,160,0.25)' : '1px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6,
                        border: `1.5px solid ${condAdrEnabled ? '#00E5A0' : 'rgba(255,255,255,0.2)'}`,
                        background: condAdrEnabled ? '#00E5A0' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {condAdrEnabled && <Check size={13} color="#0a2018" strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: condAdrEnabled ? '#fff' : 'rgba(255,255,255,0.5)' }}>ADR 차이</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: condAdrEnabled ? 1 : 0.3 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>±</span>
                      <input
                        type="number"
                        value={adrThreshold}
                        onClick={e => e.stopPropagation()}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => setAdrThreshold(parseInt(e.target.value) || 0)}
                        style={{
                          width: 52, padding: '7px 6px', fontSize: 13, fontWeight: 600, borderRadius: 7,
                          border: 'none', background: '#0d0d0d',
                          color: '#fff', textAlign: 'center', outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>%</span>
                    </div>
                  </div>

                  {/* OCC% 조건 — 강조 카드 */}
                  <div
                    onClick={() => { setCondOccEnabled(p => !p); setSearchWarning(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 12px', borderRadius: 12, cursor: 'pointer',
                      background: condOccEnabled ? 'rgba(0,229,160,0.08)' : 'transparent',
                      border: condOccEnabled ? '1px solid rgba(0,229,160,0.3)' : '1px solid transparent',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 6,
                      border: `1.5px solid ${condOccEnabled ? '#00E5A0' : 'rgba(255,255,255,0.2)'}`,
                      background: condOccEnabled ? '#00E5A0' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {condOccEnabled && <Check size={13} color="#0a2018" strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: condOccEnabled ? '#fff' : 'rgba(255,255,255,0.5)', flexShrink: 0 }}>OCC%</span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: condOccEnabled ? 1 : 0.3, flexWrap: 'nowrap' }}>
                      {/* OTB / FCST 토글 */}
                      <div style={{ display: 'inline-flex', borderRadius: 7, background: '#0d0d0d', overflow: 'hidden' }}>
                        <button
                          onClick={e => { e.stopPropagation(); setOccBasis('otb') }}
                          style={{
                            padding: '6px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: occBasis === 'otb' ? 'rgba(99,102,241,0.2)' : 'transparent',
                            color: occBasis === 'otb' ? '#a5b4fc' : 'rgba(255,255,255,0.35)',
                          }}
                        >OTB</button>
                        <button
                          onClick={e => { e.stopPropagation(); setOccBasis('fcst') }}
                          style={{
                            padding: '6px 10px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: occBasis === 'fcst' ? 'rgba(0,229,160,0.2)' : 'transparent',
                            color: occBasis === 'fcst' ? '#00E5A0' : 'rgba(255,255,255,0.35)',
                          }}
                        >FCST</button>
                      </div>

                      {/* 이상 / 이하 토글 */}
                      <div style={{ display: 'inline-flex', borderRadius: 7, background: '#0d0d0d', overflow: 'hidden' }}>
                        <button
                          onClick={e => { e.stopPropagation(); setOccDirection('gte') }}
                          style={{
                            padding: '6px 11px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: occDirection === 'gte' ? 'rgba(0,229,160,0.2)' : 'transparent',
                            color: occDirection === 'gte' ? '#00E5A0' : 'rgba(255,255,255,0.35)',
                          }}
                        >이상</button>
                        <button
                          onClick={e => { e.stopPropagation(); setOccDirection('lte') }}
                          style={{
                            padding: '6px 11px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            background: occDirection === 'lte' ? 'rgba(0,229,160,0.2)' : 'transparent',
                            color: occDirection === 'lte' ? '#00E5A0' : 'rgba(255,255,255,0.35)',
                          }}
                        >이하</button>
                      </div>

                      <input
                        type="number"
                        value={occThreshold}
                        onClick={e => e.stopPropagation()}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => setOccThreshold(parseInt(e.target.value) || 0)}
                        style={{
                          width: 52, padding: '7px 6px', fontSize: 13, fontWeight: 600, borderRadius: 7,
                          border: 'none', background: '#0d0d0d',
                          color: '#fff', textAlign: 'center', outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>%</span>
                    </div>
                  </div>

                  {searchWarning && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)',
                      fontSize: 11, color: '#f87171',
                    }}>
                      <AlertTriangle size={13} />
                      하나 이상의 조건을 선택해주세요
                    </div>
                  )}

                  {/* 안내 텍스트 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px 4px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                    체크된 조건만
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', padding: '1px 6px', borderRadius: 4,
                      background: 'rgba(255,255,255,0.08)', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
                    }}>OR</span>
                    조건으로 적용됩니다
                  </div>

                  <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />

                  {/* footer */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 4px' }}>
                    <span
                      onClick={() => {
                        setCondRnEnabled(false)
                        setCondAdrEnabled(false)
                        setAdrThreshold(10)
                        setCondOccEnabled(false)
                        setOccBasis('otb')
                        setOccDirection('gte')
                        setOccThreshold(90)
                      }}
                      style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', cursor: 'pointer' }}
                    >
                      초기화
                    </span>
                    <button
                      onClick={handleSearch}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '9px 22px', borderRadius: 10, border: 'none',
                        background: '#00E5A0', color: '#0a2018', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <Search size={14} />
                      검색
                    </button>
                  </div>
                </div>
              )}
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
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 320 }}>

          {/* Bulk bar — sticky (트리거 + 드롭다운) */}
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
          }}>
            {/* Filter 트리거 — Bulk edit 왼쪽 */}
            <div ref={filterDropRef} style={{ position: 'relative' }}>
              <button
                onClick={e => { e.stopPropagation(); setFilterDropOpen(prev => !prev) }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 14px', borderRadius: 7, height: 30, boxSizing: 'border-box',
                  border: filter !== 'all' ? '0.5px solid rgba(0,229,160,0.4)' : '0.5px solid rgba(255,255,255,0.12)',
                  background: filter !== 'all' ? 'rgba(0,229,160,0.1)' : 'rgba(255,255,255,0.05)',
                  color: filter !== 'all' ? '#00E5A0' : 'rgba(255,255,255,0.6)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                Filter: {filter === 'all' ? 'All' : filter === 'rn' ? 'R/N' : filter === 'adr' ? 'ADR' : 'R/N+ADR'}
                <ChevronDown size={11} style={{ opacity: 0.5 }} />
              </button>

              {filterDropOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                  background: '#1a1a1a', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 10,
                  padding: 6, minWidth: 160, zIndex: 100,
                  display: 'flex', flexDirection: 'column', gap: 2,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                }}>
                  {([
                    ['all', 'All'],
                    ['rn', 'R/N'],
                    ['adr', 'ADR'],
                    ['both', 'R/N+ADR'],
                  ] as [FilterType, string][]).map(([f, label]) => (
                    <div
                      key={f}
                      onClick={() => setFilter(f)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 9px', borderRadius: 6, cursor: 'pointer',
                        background: filter === f ? 'rgba(0,229,160,0.08)' : 'transparent',
                      }}
                      onMouseEnter={e => { if (filter !== f) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                      onMouseLeave={e => { if (filter !== f) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <div style={{
                        width: 14, height: 14, borderRadius: '50%',
                        border: `1.5px solid ${filter === f ? '#00E5A0' : 'rgba(255,255,255,0.25)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {filter === f && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00E5A0' }} />}
                      </div>
                      <span style={{
                        fontSize: 12, fontWeight: 500,
                        color: filter === f ? '#fff' : 'rgba(255,255,255,0.6)',
                      }}>
                        {label}
                      </span>
                    </div>
                  ))}

                  <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', margin: '4px 2px' }} />

                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setFilter('all')} style={{ flex: 1, padding: '5px', borderRadius: 5, border: '0.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', fontSize: 10, cursor: 'pointer' }}>All</button>
                    <button onClick={() => setFilter('all')} style={{ flex: 1, padding: '5px', borderRadius: 5, border: '0.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', fontSize: 10, cursor: 'pointer' }}>Reset</button>
                    <button onClick={() => setFilterDropOpen(false)} style={{ flex: 1, padding: '5px', borderRadius: 5, border: 'none', background: 'rgba(0,229,160,0.12)', color: '#00E5A0', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Done</button>
                  </div>
                </div>
              )}
            </div>

            {/* Segment 트리거 — Filter와 Bulk edit 사이 */}
            <div ref={segDropRef} style={{ position: 'relative' }}>
              <button
                onClick={e => { e.stopPropagation(); setSegDropOpen(prev => !prev) }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 7, height: 30, boxSizing: 'border-box',
                  border: segFilter !== null && segFilter.size > 0
                    ? '0.5px solid rgba(0,229,160,0.4)' : '0.5px solid rgba(255,255,255,0.12)',
                  background: segFilter !== null && segFilter.size > 0
                    ? 'rgba(0,229,160,0.1)' : 'rgba(255,255,255,0.05)',
                  color: segFilter !== null && segFilter.size > 0 ? '#00E5A0' : 'rgba(255,255,255,0.6)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                <SlidersHorizontal size={13} />
                Segment
                {segFilter !== null && segFilter.size > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 15, height: 15, borderRadius: '50%', background: '#00E5A0', color: '#0a2018',
                    fontSize: 9, fontWeight: 700,
                  }}>
                    {segFilter.size}
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
                  left:          rect ? rect.left : 0,
                  background:    '#1a1a1a',
                  border:        '0.5px solid rgba(255,255,255,0.12)',
                  borderRadius:  8,
                  minWidth:      200,
                  width:         200,
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
                    const isSelected = tempSegFilter === null ||
                      node.segmentationCodes.some(c => tempSegFilter.has(c))
                    return (
                      <div
                        key={node.id}
                        onClick={e => {
                          e.stopPropagation()
                          setTempSegFilter(prev => {
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
                      onClick={e => { e.stopPropagation(); setTempSegFilter(null) }}
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
                      onClick={e => { e.stopPropagation(); setTempSegFilter(new Set()) }}
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
                      onClick={e => { e.stopPropagation(); setSegFilter(tempSegFilter); setSegDropOpen(false) }}
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

            <div ref={bulkDropRef} style={{ position: 'relative' }}>
              <button
                onClick={() => selectedIds.size > 0 && setBulkDropOpen(prev => !prev)}
                disabled={selectedIds.size === 0}
                style={{
                  padding: '5px 14px', borderRadius: 7, height: 30, boxSizing: 'border-box',
                  border: selectedIds.size > 0 ? '0.5px solid rgba(0,229,160,0.3)' : '0.5px solid rgba(255,255,255,0.08)',
                  background: selectedIds.size > 0 ? 'rgba(0,229,160,0.08)' : 'rgba(255,255,255,0.03)',
                  color: selectedIds.size > 0 ? '#00E5A0' : 'rgba(255,255,255,0.2)',
                  fontSize: 12, fontWeight: 600,
                  cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <Pencil size={13} />
                Bulk edit
                <ChevronDown size={11} style={{ opacity: 0.5 }} />
              </button>

              {bulkDropOpen && (
                <div onClick={e => e.stopPropagation()} style={{
                  position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                  background: '#1f1f1f', border: '1px solid rgba(0,229,160,0.3)', borderRadius: 10,
                  padding: 14, minWidth: 280, zIndex: 100,
                  display: 'flex', flexDirection: 'column', gap: 10,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                }}>
                  {/* 대상: RN/ADR */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>대상</span>
                    <div style={{ display: 'inline-flex', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                      {(['rn', 'adr'] as BulkField[]).map(f => (
                        <button key={f} onClick={() => setBulkField(f)} style={{
                          padding: '5px 11px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                          borderRight: '0.5px solid rgba(255,255,255,0.08)',
                          background: bulkField === f ? 'rgba(0,229,160,0.15)' : '#161616',
                          color: bulkField === f ? '#00E5A0' : 'rgba(255,255,255,0.4)',
                        }}>{f.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>
                  {/* 방식: +flat/+%/set */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>방식</span>
                    <div style={{ display: 'inline-flex', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                      {([['flat', '+flat'], ['pct', '+%'], ['set', 'set']] as [BulkMode, string][]).map(([m, label]) => (
                        <button key={m} onClick={() => setBulkMode(m)} style={{
                          padding: '5px 11px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                          borderRight: '0.5px solid rgba(255,255,255,0.08)',
                          background: bulkMode === m ? 'rgba(0,229,160,0.15)' : '#161616',
                          color: bulkMode === m ? '#00E5A0' : 'rgba(255,255,255,0.4)',
                        }}>{label}</button>
                      ))}
                    </div>
                  </div>
                  {/* 값 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>값</span>
                    <input
                      value={bulkValue}
                      onChange={e => setBulkValue(e.target.value)}
                      style={{
                        width: 60, padding: '5px 6px', fontSize: 11, borderRadius: 5,
                        border: '0.5px solid rgba(255,255,255,0.15)', background: '#161616',
                        color: 'rgba(255,255,255,0.9)', textAlign: 'center', outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <button
                      onClick={() => { matchOtb(); setBulkDropOpen(false) }}
                      onMouseDown={() => setMatchOtbPressed(true)}
                      onMouseUp={() => setMatchOtbPressed(false)}
                      onMouseLeave={() => setMatchOtbPressed(false)}
                      style={{
                        padding: '6px 12px', borderRadius: 7,
                        border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent',
                        color: '#00E5A0', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                        opacity: matchOtbPressed ? 0.7 : 1,
                        transform: matchOtbPressed ? 'scale(0.97)' : 'scale(1)',
                        transition: 'opacity 0.1s, transform 0.1s',
                      }}
                    >Match OTB</button>
                    <button onClick={() => { applyBulk(); setBulkDropOpen(false) }} style={{
                      flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '6px 16px', borderRadius: 7, border: 'none',
                      background: '#00E5A0', color: '#0a2018', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>
                      <Check size={12} />
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 현재 설정 요약 */}
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
              {bulkField.toUpperCase()} · {bulkMode === 'flat' ? '+flat' : bulkMode === 'pct' ? '+%' : 'set'} {bulkValue}
            </span>

            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>
              {selectedIds.size} selected
            </span>
          </div>

          {!searched ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 320, gap: 8 }}>
              <Search size={28} style={{ color: 'rgba(255,255,255,0.15)' }} />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>검색 조건을 설정하고 검색해주세요</span>
            </div>
          ) : (
          <>
        {/* ── Table ── */}
          <style>{`
            .alert-row:hover td { background: rgba(0,229,160,0.025) !important; }
            /* 예상 ADR hover apply 버튼 */
            .exp-adr-cell { position: relative; }
            .exp-adr-val { transition: opacity 0.15s; }
            .exp-adr-apply-btn {
              position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
              display: none; align-items: center; gap: 3px;
              padding: 3px 8px; border-radius: 5px; border: none;
              background: #00E5A0; color: #0a2018; font-size: 10px; font-weight: 700; cursor: pointer;
              box-shadow: 0 2px 8px rgba(0,229,160,0.3);
            }
            .alert-row:hover .exp-adr-apply-btn { display: inline-flex; }
            .alert-row:hover .exp-adr-val { opacity: 0.4; }
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
                        // ADR 전용 알럿 행 — 읽기 전용으로 현재 FCST RN 표시
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                          {fmtRn(r.fcst_rn)}
                        </span>
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
                      const alreadyApplied = localFix.get(rowKey(r))?.adr === expected
                      return (
                        <td className="exp-adr-cell" style={{ ...tdBase, fontWeight: 600 }}>
                          {alreadyApplied ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#00E5A0', fontWeight: 600 }}>
                              <Check size={11} />
                              적용됨 {Math.round(expected / 1000)}K
                            </span>
                          ) : (
                            <>
                              <span className="exp-adr-val" style={{ color: isGood ? '#00E5A0' : '#f87171' }}>
                                {`${Math.round(expected / 1000)}K`}
                              </span>
                              <button
                                className="exp-adr-apply-btn"
                                onClick={e => {
                                  e.stopPropagation()
                                  setFix(r.business_date, r.segmentation, 'adr', expected)
                                }}
                              >
                                <Check size={10} />
                                적용
                              </button>
                            </>
                          )}
                        </td>
                      )
                    })()}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </>
          )}
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
