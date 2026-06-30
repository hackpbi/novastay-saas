'use client'

// BulkEditModalV2 — MarketTable 미사용, 순수 <table> 렌더링
// 데이터/동작은 BulkEditModal과 동일. 우측 패널·calc 헬퍼는 BulkEditModal에서 재사용.
// House Use 행 아래 Total / OCC% / RevPAR 행을 같은 테이블 안에 추가.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Copy, AlertTriangle } from 'lucide-react'
import { fmtRn, fmtAdr, fmtRev } from '@/lib/forecast/format'
import { makeEditKey, type EditedValues } from '@/lib/forecast/save'
import type { ForecastSchema, ForecastDayData } from '@/lib/forecast/types'
import { useDateContext } from '@/contexts/DateContext'
import { ConfirmDialog } from '@/components/forecast/ConfirmDialog'
import { supabase } from '@/lib/supabase'
import {
  calcDailyMetrics,
  calcMonthlyBefore, calcMonthlyAfter,
  gapColor, fmtGap,
  MonthlyImpactCard,
} from '@/components/forecast/BulkEditModal'

// REV 셀 표기(백만 단위, M 미표기) — 기존 표 cell과 동일
const fmtCurrency = fmtRev

// 컬럼 그룹 세로 구분선 — border-left (모든 행에서 픽셀 단위로 정확히 일치)
const GB_BORDER = '1px solid rgba(0,229,160,0.5)'

// ── 타입 (BulkEditModal에서 복사) ───────────────────────────────────────────────

type LyRow = {
  segmentation: string
  ly_date:      string
  ly_rn:        number
  ly_adr:       number
  ly_revenue:   number
}
type LyMap     = Record<string, LyRow>
type TableData = Record<string, Record<string, any>>
type ActiveCell = { segCode: string; field: 'rn' | 'adr' } | null

// 미니 ADR 시뮬레이터 — get_adr_simulator_data RPC 반환 (필요 필드만)
type AdrSimRoom = { room_type_code: string; booked?: number; avail?: number; surcharge?: number }
type AdrSimData = { total_rooms?: number; base_bar_rate?: number; rooms?: AdrSimRoom[] }

// 컬럼 폭 (BulkEditModal COL과 동일) — Total 행/세그 행 정렬 일치용 colgroup
const COL = {
  SEG:     240,
  FC_RN:   100, FC_ADR:  130, FC_REV:  110,
  OTB_RN:   95, OTB_ADR: 110, OTB_REV: 110,
  GAP_RN:   85, GAP_ADR: 100, GAP_REV: 100,
  LY_RN:    85, LY_ADR:  100, LY_REV:  100,
} as const

// ── 데이터 가공 (BulkEditModal.buildMarketTableData 동일 로직 복사) ────────────────

function buildMarketTableData(
  day:          ForecastDayData,
  tempEdits:    EditedValues,
  selectedDate: string,
  lyMap:        LyMap,
): TableData {
  const result: TableData = {}
  for (const [code, orig] of Object.entries(day.values)) {
    const ed    = tempEdits.get(makeEditKey(selectedDate, code))
    const fcRn  = ed?.rn  ?? orig.rn
    const fcAdr = ed?.adr ?? orig.adr
    const fcRev = fcRn * fcAdr
    const ly    = lyMap[code]
    result[code] = {
      rn:      fcRn,
      adr:     fcAdr,
      rev:     fcRev,
      otb_rn:  orig.otb_rn,
      otb_rev: orig.otb_rev,
      gap_rn:  fcRn  - orig.otb_rn,
      gap_rev: fcRev - orig.otb_rev,
      // LY — ly_adr は getCellValue が ly_rev/ly_rn から自動計算
      ly_rn:  ly?.ly_rn  ?? 0,
      ly_rev: ly?.ly_revenue ?? 0,
    }
  }
  return result
}

// ── 집계 헬퍼 ────────────────────────────────────────────────────────────────────

function calcAdr(rev: number, rn: number): number {
  return rn > 0 ? Math.round(rev / rn) : 0
}

function aggregateCodes(codes: string[], tableData: TableData, key: string): number {
  return codes.reduce((sum, code) => sum + (tableData[code]?.[key] ?? 0), 0)
}

// adr 계열 컬럼은 rev/rn 기반 재계산
function getCellValue(codes: string[], tableData: TableData, key: string): number {
  if (key.endsWith('_adr') || key === 'adr') {
    const prefix = key === 'adr' ? '' : key.slice(0, -4)
    const revKey = prefix ? `${prefix}_rev` : 'rev'
    const rnKey  = prefix ? `${prefix}_rn`  : 'rn'
    return calcAdr(aggregateCodes(codes, tableData, revKey), aggregateCodes(codes, tableData, rnKey))
  }
  return aggregateCodes(codes, tableData, key)
}

// ── ModalEditableCellV2 (BulkEditModal.ModalEditableCell 동일 로직 복사) ───────────

interface ModalEditableCellV2Props {
  value:          number
  originalValue?: number   // 수정 전 원래 FC 값 (before→after 표시용)
  fmt:            (n: number) => string
  onSave:         (v: number) => void
  isModified?:    boolean
  isActive?:      boolean
  onTab?:         (shift: boolean) => void
  textColor?:     string   // 읽기 상태일 때 적용할 schema 폰트색
}

function ModalEditableCellV2({ value, originalValue, fmt, onSave, isModified, isActive, onTab, textColor }: ModalEditableCellV2Props) {
  const [editing, setEditing] = useState(false)
  const [input,   setInput]   = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isActive) {
      setInput(String(Math.round(value)))
      setEditing(true)
    }
  }, [isActive])  // value 제외: 편집 중 외부 value 변경에 반응 안 함

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setInput(String(Math.round(value)))
    setEditing(true)
  }

  function commit() {
    const num = parseFloat(input)
    if (!isNaN(num) && num >= 0) onSave(Math.round(num))
    setEditing(false)
  }

  if (editing) {
    return (
      <>
        <style>{`.medit2::-webkit-inner-spin-button,.medit2::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}`}</style>
        <input
          ref={inputRef}
          type="number" className="medit2" value={input}
          onChange={e => setInput(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Tab')    { e.preventDefault(); commit(); onTab?.(e.shiftKey) }
            if (e.key === 'Enter')  { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setEditing(false) }
          }}
          onClick={e => e.stopPropagation()}
          onFocus={e => e.target.select()}
          style={{
            width: `${Math.max(input.length + 1, 4)}ch`, minWidth: '4ch', maxWidth: '10ch',
            padding: '1px 4px', fontSize: 'inherit', textAlign: 'right',
            border: '1px solid var(--color-accent-primary, #00E5A0)', borderRadius: 3,
            background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)',
            outline: 'none', boxSizing: 'border-box',
            MozAppearance: 'textfield', appearance: 'textfield',
          } as React.CSSProperties}
        />
      </>
    )
  }

  return (
    <span onClick={startEdit} style={{ cursor: 'text', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      {isModified && originalValue !== undefined ? (
        <>
          <span style={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'line-through', fontSize: '0.9em' }}>
            {fmt(originalValue)}
          </span>
          <span style={{ color: '#00E5A0', fontSize: '0.9em' }}>→</span>
          <span style={{ color: '#00E5A0', fontWeight: 700 }}>{fmt(value)}</span>
        </>
      ) : (
        <span style={{ color: textColor }}>{fmt(value)}</span>
      )}
    </span>
  )
}

// GAP 텍스트 색: 음수만 빨강, 그 외(양수/0)는 schema 폰트색(없으면 중립 기본)
function gapTextColor(value: number, schemaColor?: string): string {
  if (value < 0) return '#f87171'
  return schemaColor || 'rgba(255,255,255,0.65)'
}

// 셀 텍스트 색: schema의 fontDarkColor 우선, 없으면 fallback
function cellTextColor(node: { fontDarkColor?: string } | undefined, fallback = 'rgba(255,255,255,0.65)'): string {
  return node?.fontDarkColor || fallback
}

// ── Gap 셀 (값 0이면 '-' 표기) ───────────────────────────────────────────────────
// unit 'm'(REV)은 0.1M 단위 반올림 후 0 비교, 그 외는 정확히 0 비교
function gapCell(value: number, unit: 'k' | 'm' | '', opts?: { className?: string; bg?: string; textColor?: string }): React.ReactNode {
  const isZero = unit === 'm' ? Math.round(value * 10) / 10 === 0 : value === 0
  return (
    <td
      className={opts?.className}
      style={{
        color: isZero ? 'rgba(255,255,255,0.2)' : gapTextColor(value, opts?.textColor),
        ...(opts?.bg ? { background: opts.bg } : {}),
        ...(opts?.className ? { borderLeft: GB_BORDER } : {}),
      }}
    >
      {isZero ? '-' : fmtGap(value, unit)}
    </td>
  )
}

// ── 세그먼트 트리 순회 → 행 생성 ────────────────────────────────────────────────

type SchemaNodeT = ForecastSchema['nodes'][number]

function renderSegmentRows(
  nodes:        SchemaNodeT[],
  tableData:    TableData,
  tempEdits:    EditedValues,
  selectedDate: string,
  save:         (code: string, field: 'rn' | 'adr', val: number) => void,
  activeCell:   ActiveCell,
  onTab:        (segCode: string, field: 'rn' | 'adr', shift: boolean) => void,
  day:          ForecastDayData,
): React.ReactNode[] {
  const rows: React.ReactNode[] = []

  for (const node of nodes) {
    const isMainOnly = node.level === 'main'                        // 읽기전용 대분류(자식 합산)
    const isTopStyle = node.level === 'main' || node.level === 'mid' // 대분류 스타일(들여쓰기 없음)
    const codes  = node.segmentationCodes

    if (isMainOnly) {
      // ── 대분류: 읽기 전용, 자식 합산 ──
      const allCodes  = node.segmentationCodes
      const mainBg    = node.bgDarkColor || '#161616'
      const mainColor = cellTextColor(node)
      const tdBg = { background: mainBg, color: mainColor }
      rows.push(
        <tr key={node.id} className="row-main" style={{ background: mainBg }}>
          <td className="l seg-main" style={{ fontWeight: node.isBold ? 700 : 600, background: mainBg, color: mainColor }}>{node.name}</td>
          <td className="gb-fc" style={{ ...tdBg, borderLeft: GB_BORDER }}><b>{fmtRn(getCellValue(allCodes, tableData, 'rn'))}</b></td>
          <td style={tdBg}><b>{fmtAdr(getCellValue(allCodes, tableData, 'adr'))}</b></td>
          <td style={tdBg}><b>{fmtCurrency(getCellValue(allCodes, tableData, 'rev'))}</b></td>
          <td className="gb-otb" style={{ ...tdBg, borderLeft: GB_BORDER }}>{fmtRn(getCellValue(allCodes, tableData, 'otb_rn'))}</td>
          <td style={tdBg}>{fmtAdr(getCellValue(allCodes, tableData, 'otb_adr'))}</td>
          <td style={tdBg}>{fmtCurrency(getCellValue(allCodes, tableData, 'otb_rev'))}</td>
          {/* GAP — gap_adr은 FCST ADR - OTB ADR 직접 계산 */}
          {gapCell(getCellValue(allCodes, tableData, 'gap_rn'), '', { className: 'gb-gap', bg: mainBg, textColor: mainColor })}
          {gapCell(getCellValue(allCodes, tableData, 'adr') - getCellValue(allCodes, tableData, 'otb_adr'), 'k', { bg: mainBg, textColor: mainColor })}
          {gapCell(getCellValue(allCodes, tableData, 'gap_rev'), 'm', { bg: mainBg, textColor: mainColor })}
          <td className="gb-ly" style={{ ...tdBg, borderLeft: GB_BORDER }}>{fmtRn(getCellValue(allCodes, tableData, 'ly_rn'))}</td>
          <td style={tdBg}>{fmtAdr(getCellValue(allCodes, tableData, 'ly_adr'))}</td>
          <td style={tdBg}>{fmtCurrency(getCellValue(allCodes, tableData, 'ly_rev'))}</td>
        </tr>
      )
      rows.push(...renderSegmentRows(node.children, tableData, tempEdits, selectedDate, save, activeCell, onTab, day))
    } else if (isTopStyle) {
      // ── 중분류(mid): 대분류 스타일 + FC RN/ADR 편집 가능 ──
      const code      = codes[0]
      const allCodes  = node.segmentationCodes
      const mainBg    = node.bgDarkColor || '#161616'
      const mainColor = cellTextColor(node)
      const tdBg = { background: mainBg, color: mainColor }
      const midGapAdr = getCellValue(allCodes, tableData, 'adr') - getCellValue(allCodes, tableData, 'otb_adr')
      rows.push(
        <tr key={node.id} className="row-main" style={{ background: mainBg }}>
          <td className="l seg-main" style={{ fontWeight: node.isBold ? 700 : 600, background: mainBg, color: mainColor }}>{node.name}</td>
          {/* FC RN/ADR — 편집 가능 */}
          <td className="gb-fc" style={{ background: mainBg, borderLeft: GB_BORDER }}>
            <ModalEditableCellV2
              value={getCellValue(codes, tableData, 'rn')}
              originalValue={day.values[code]?.rn}
              fmt={fmtRn}
              isModified={!!tempEdits.get(makeEditKey(selectedDate, code))?.rn}
              onSave={v => save(code, 'rn', v)}
              isActive={activeCell?.segCode === code && activeCell?.field === 'rn'}
              onTab={shift => onTab(code, 'rn', shift)}
              textColor={mainColor}
            />
          </td>
          <td style={{ background: mainBg }}>
            <ModalEditableCellV2
              value={getCellValue(codes, tableData, 'adr')}
              originalValue={day.values[code]?.adr}
              fmt={fmtAdr}
              isModified={!!tempEdits.get(makeEditKey(selectedDate, code))?.adr}
              onSave={v => save(code, 'adr', v)}
              isActive={activeCell?.segCode === code && activeCell?.field === 'adr'}
              onTab={shift => onTab(code, 'adr', shift)}
              textColor={mainColor}
            />
          </td>
          <td style={tdBg}>{fmtCurrency(getCellValue(allCodes, tableData, 'rev'))}</td>
          <td className="gb-otb" style={{ ...tdBg, borderLeft: GB_BORDER }}>{fmtRn(getCellValue(allCodes, tableData, 'otb_rn'))}</td>
          <td style={tdBg}>{fmtAdr(getCellValue(allCodes, tableData, 'otb_adr'))}</td>
          <td style={tdBg}>{fmtCurrency(getCellValue(allCodes, tableData, 'otb_rev'))}</td>
          {gapCell(getCellValue(allCodes, tableData, 'gap_rn'), '', { className: 'gb-gap', bg: mainBg, textColor: mainColor })}
          {gapCell(midGapAdr, 'k', { bg: mainBg, textColor: mainColor })}
          {gapCell(getCellValue(allCodes, tableData, 'gap_rev'), 'm', { bg: mainBg, textColor: mainColor })}
          <td className="gb-ly" style={{ ...tdBg, borderLeft: GB_BORDER }}>{fmtRn(getCellValue(allCodes, tableData, 'ly_rn'))}</td>
          <td style={tdBg}>{fmtAdr(getCellValue(allCodes, tableData, 'ly_adr'))}</td>
          <td style={tdBg}>{fmtCurrency(getCellValue(allCodes, tableData, 'ly_rev'))}</td>
        </tr>
      )
    } else {
      // ── 소분류(sub): 편집 가능 + 들여쓰기 ──
      const code = codes[0]
      const leafGapAdr = getCellValue(codes, tableData, 'adr') - getCellValue(codes, tableData, 'otb_adr')
      const subBg    = node.bgDarkColor || 'transparent'
      const leafColor = cellTextColor(node, 'rgba(255,255,255,0.55)')
      const subTd    = { background: subBg, color: leafColor }
      rows.push(
        <tr key={node.id} className="seg-row" style={{ background: subBg }}>
          <td className="l seg-sub" style={{ fontWeight: node.isBold ? 600 : 400, background: subBg, color: leafColor }}>
            <span style={{ color: 'rgba(255,255,255,0.2)', marginRight: 4, fontSize: 11 }}>└</span>
            {node.name}
          </td>
          {/* FC RN/ADR — 편집셀: wrapper td 배경만 */}
          <td className="gb-fc" style={{ background: subBg, borderLeft: GB_BORDER }}>
            <ModalEditableCellV2
              value={getCellValue(codes, tableData, 'rn')}
              originalValue={day.values[code]?.rn}
              fmt={fmtRn}
              isModified={!!tempEdits.get(makeEditKey(selectedDate, code))?.rn}
              onSave={v => save(code, 'rn', v)}
              isActive={activeCell?.segCode === code && activeCell?.field === 'rn'}
              onTab={shift => onTab(code, 'rn', shift)}
              textColor={leafColor}
            />
          </td>
          <td style={{ background: subBg }}>
            <ModalEditableCellV2
              value={getCellValue(codes, tableData, 'adr')}
              originalValue={day.values[code]?.adr}
              fmt={fmtAdr}
              isModified={!!tempEdits.get(makeEditKey(selectedDate, code))?.adr}
              onSave={v => save(code, 'adr', v)}
              isActive={activeCell?.segCode === code && activeCell?.field === 'adr'}
              onTab={shift => onTab(code, 'adr', shift)}
              textColor={leafColor}
            />
          </td>
          <td style={subTd}>{fmtCurrency(getCellValue(codes, tableData, 'rev'))}</td>
          <td className="gb-otb" style={{ ...subTd, borderLeft: GB_BORDER }}>{fmtRn(getCellValue(codes, tableData, 'otb_rn'))}</td>
          <td style={subTd}>{fmtAdr(getCellValue(codes, tableData, 'otb_adr'))}</td>
          <td style={subTd}>{fmtCurrency(getCellValue(codes, tableData, 'otb_rev'))}</td>
          {gapCell(getCellValue(codes, tableData, 'gap_rn'), '', { className: 'gb-gap', bg: subBg, textColor: leafColor })}
          {gapCell(leafGapAdr, 'k', { bg: subBg, textColor: leafColor })}
          {gapCell(getCellValue(codes, tableData, 'gap_rev'), 'm', { bg: subBg, textColor: leafColor })}
          <td className="gb-ly" style={{ ...subTd, borderLeft: GB_BORDER }}>{fmtRn(getCellValue(codes, tableData, 'ly_rn'))}</td>
          <td style={subTd}>{fmtAdr(getCellValue(codes, tableData, 'ly_adr'))}</td>
          <td style={subTd}>{fmtCurrency(getCellValue(codes, tableData, 'ly_rev'))}</td>
        </tr>
      )
    }
  }

  return rows
}

// ── 스타일 (.bev2 스코프) ────────────────────────────────────────────────────────

const TABLE_CSS = `
.bev2 table { border-collapse: separate; border-spacing: 0; width: 100%; }
.bev2 .l, .bev2 td.l { text-align: left; }
.bev2 th { background: #131313; color: rgba(255,255,255,0.28); font-weight: 400; text-align: right; position: sticky; top: 0; padding: 6px 10px; font-size: 10px; z-index: 1; }
.bev2 td { text-align: right; padding: 6px 10px; font-size: 11px; border-bottom: 0.5px solid rgba(255,255,255,0.05); }
.bev2 .seg-main { font-weight: 700; color: #fff; }
.bev2 .seg-sub  { color: rgba(255,255,255,0.55); padding-left: 16px; }
.bev2 .row-main td { background: #161616; }
.bev2 .gb-fc, .bev2 .gb-otb, .bev2 .gb-gap, .bev2 .gb-ly { border-left: 1px solid rgba(0,229,160,0.5) !important; box-shadow: none !important; }
.bev2 .muted { color: var(--color-text-muted); }
.bev2 .row-total td { border-top: 1px solid rgba(255,255,255,0.1); background: #0e0e0e; font-weight: 600; }
.bev2 .row-occ td    { background: #0e0e0e; color: rgba(99,102,241,0.8); font-weight: 600; }
.bev2 .row-revpar td { background: #0e0e0e; color: rgba(0,229,160,0.8); font-weight: 600; }
.bev2 tbody tr:hover td { background: rgba(255,255,255,0.03); }
.sim-slider { width: 100%; height: 4px; border-radius: 2px; outline: none; -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.1); margin: 0; display: block; }
.sim-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #00E5A0; cursor: pointer; margin-top: 0; }
.sim-slider::-moz-range-thumb { width: 12px; height: 12px; border: none; border-radius: 50%; background: #00E5A0; cursor: pointer; }
.sim-slider.amber::-webkit-slider-thumb { background: #fbbf24; }
.sim-slider.amber::-moz-range-thumb { background: #fbbf24; }
`

// ── Props ────────────────────────────────────────────────────────────────────────

export interface BulkEditModalV2Props {
  isOpen:         boolean
  selectedDate:   string | null
  onClose:        () => void
  schema:         ForecastSchema | null
  data:           ForecastDayData[]
  editedValues:   EditedValues
  onApply:        (newEdits: EditedValues) => void
  hotelId:        string
  onSelectDate:   (date: string) => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BulkEditModalV2({
  isOpen, selectedDate,
  onClose,
  schema, data, editedValues, onApply,
  hotelId,
  onSelectDate,
}: BulkEditModalV2Props) {
  const [tempEdits, setTempEdits] = useState<EditedValues>(new Map())
  const [lyMap,     setLyMap]     = useState<LyMap>({})
  const [activeCell, setActiveCell] = useState<ActiveCell>(null)
  // 미니 ADR 시뮬레이터 상태
  const [simData,   setSimData]   = useState<AdrSimData | null>(null)
  const [barRaw,    setBarRaw]    = useState<number>(0)
  const [otaPct,    setOtaPct]    = useState<number>(50)
  const [otaFeePct, setOtaFeePct] = useState<number>(15)

  // 진입 시 해당 일자 기존 편집값으로 초기화
  useEffect(() => {
    if (!isOpen || !selectedDate) return
    const initial: EditedValues = new Map()
    for (const [key, val] of editedValues.entries()) {
      if (key.startsWith(selectedDate + '::')) initial.set(key, val)
    }
    setTempEdits(initial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedDate])

  // LY fetch — 일자 변경 시 재fetch
  useEffect(() => {
    if (!isOpen || !selectedDate || !hotelId) return
    let cancelled = false
    ;(supabase as any)
      .rpc('get_ly_for_modal', { p_hotel_id: hotelId, p_business_date: selectedDate })
      .then(({ data: rows, error }: any) => {
        if (cancelled) return
        if (!error && rows && rows.length > 0) {
          const map: LyMap = {}
          for (const r of rows) map[r.segmentation] = r
          setLyMap(map)
        } else {
          setLyMap({})
        }
      })
    return () => { cancelled = true }
  }, [isOpen, selectedDate, hotelId])

  // 미니 ADR 시뮬레이터 — get_adr_simulator_data
  useEffect(() => {
    if (!isOpen || !selectedDate || !hotelId) return
    let cancelled = false
    ;(supabase as any)
      .rpc('get_adr_simulator_data', { p_hotel_id: hotelId, p_date: selectedDate, p_fcst_date: null })
      .then(({ data: rows, error }: any) => {
        if (cancelled || error || !rows) return
        const sim = Array.isArray(rows) ? rows[0] : rows
        setSimData((sim ?? null) as AdrSimData | null)
        if (sim?.base_bar_rate) setBarRaw(sim.base_bar_rate)
      })
    return () => { cancelled = true }
  }, [isOpen, selectedDate, hotelId])

  // ESC to close
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const day = useMemo(
    () => selectedDate ? data.find(d => d.business_date === selectedDate) ?? null : null,
    [data, selectedDate],
  )

  const tableData = useMemo(
    () => day && selectedDate ? buildMarketTableData(day, tempEdits, selectedDate, lyMap) : {},
    [day, tempEdits, selectedDate, lyMap],
  )

  // 편집 가능 셀 순서 (기존 DailyTab과 동일 — schema.nodes orderIndex 기준)
  const editableCellOrder = useMemo(() => {
    const list: Array<{ segCode: string; field: 'rn' | 'adr' }> = []
    if (!schema || !day) return list
    const sorted = [...schema.nodes].sort((a, b) => a.orderIndex - b.orderIndex)
    for (const node of sorted) {
      // main은 자식(sub)들, mid/sub는 자기 자신이 편집 대상
      const leaves = node.level === 'main'
        ? [...node.children].sort((a, b) => a.orderIndex - b.orderIndex)
        : [node]
      for (const leaf of leaves) {
        const code = leaf.segmentationCodes[0]
        if (code && day.values[code]) {
          list.push({ segCode: code, field: 'rn' })
          list.push({ segCode: code, field: 'adr' })
        }
      }
    }
    return list
  }, [schema, day])

  const handleTab = useCallback(
    (segCode: string, field: 'rn' | 'adr', shift: boolean) => {
      const idx = editableCellOrder.findIndex(c => c.segCode === segCode && c.field === field)
      if (idx === -1) return
      const next = editableCellOrder[shift ? idx - 1 : idx + 1]
      setActiveCell(next ?? null)
    },
    [editableCellOrder],
  )

  const save = useCallback((code: string, field: 'rn' | 'adr', val: number) => {
    if (!selectedDate) return
    setTempEdits(prev => {
      const next = new Map(prev)
      const key  = makeEditKey(selectedDate, code)
      next.set(key, { ...next.get(key) ?? {}, [field]: val })
      return next
    })
  }, [selectedDate])

  const changedEditCount = useMemo(() => {
    let count = 0
    for (const [key, edited] of tempEdits.entries()) {
      const [date, segCode] = key.split('::')
      const dayData = data.find(d => d.business_date === date)
      if (!dayData) continue
      const orig = dayData.values[segCode]
      if (!orig) continue
      if ((edited.rn  !== undefined && edited.rn  !== orig.rn)  ||
          (edited.adr !== undefined && edited.adr !== orig.adr)) count++
    }
    return count
  }, [tempEdits, data])

  // 우측 패널 KPI (기존과 동일 — calc 헬퍼 재사용, HOU 포함)
  const dailyKpi = useMemo(() => {
    if (!day || !schema) return null
    const before = calcDailyMetrics(day, new Map() as EditedValues, selectedDate ?? '', schema.roomCount)
    const after  = calcDailyMetrics(day, tempEdits, selectedDate ?? '', schema.roomCount)
    return { before, after }
  }, [day, tempEdits, selectedDate, schema])

  const monthlyKpi = useMemo(() => {
    if (!schema || data.length === 0) return null
    const before = calcMonthlyBefore(data, schema.roomCount)
    const after  = calcMonthlyAfter(data, tempEdits, schema.roomCount)
    return { before, after }
  }, [data, tempEdits, schema])

  const [pendingDate, setPendingDate] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { otbDate } = useDateContext()

  const availableDates = useMemo(() => {
    if (!selectedDate || !otbDate) return []
    const prefix = selectedDate.slice(0, 7)
    return data
      .map(d => d.business_date)
      .filter(d => d.startsWith(prefix) && d > otbDate)
      .sort()
  }, [data, selectedDate, otbDate])

  if (!isOpen) return null

  const roomCount = schema?.roomCount ?? 0

  // ── Total / OCC / RevPAR (HOU 제외) ──
  const houNode  = schema?.nodes.find(n => n.name === 'House Use')
  const houCodes = new Set(houNode?.segmentationCodes ?? [])
  const nonHouCodes = (schema?.allSegmentationCodes ?? []).filter(c => !houCodes.has(c))

  const totalFcRn  = getCellValue(nonHouCodes, tableData, 'rn')
  const totalFcAdr = getCellValue(nonHouCodes, tableData, 'adr')
  const totalFcRev = getCellValue(nonHouCodes, tableData, 'rev')
  const totalOtbRn = getCellValue(nonHouCodes, tableData, 'otb_rn')
  const totalOtbAdr= getCellValue(nonHouCodes, tableData, 'otb_adr')
  const totalOtbRev= getCellValue(nonHouCodes, tableData, 'otb_rev')
  const totalLyRn  = getCellValue(nonHouCodes, tableData, 'ly_rn')
  const totalLyAdr = getCellValue(nonHouCodes, tableData, 'ly_adr')
  const totalLyRev = getCellValue(nonHouCodes, tableData, 'ly_rev')

  // 수정 전(원본 FC) 합계 — day.values 기준. 합계/OCC/RevPAR before→after용
  const dv = day?.values ?? {}
  const origTotalFcRn  = nonHouCodes.reduce((s, c) => s + (dv[c]?.rn ?? 0), 0)
  const origTotalFcRev = nonHouCodes.reduce((s, c) => s + ((dv[c]?.rn ?? 0) * (dv[c]?.adr ?? 0)), 0)
  const origTotalFcAdr = origTotalFcRn > 0 ? Math.round(origTotalFcRev / origTotalFcRn) : 0
  const hasAnyEdit = changedEditCount > 0

  // before → after 표시 (수정 시 취소선 원본 → 초록 신값)
  const beforeAfter = (origVal: number, newVal: number, f: (n: number) => string, changed: boolean): React.ReactNode =>
    changed ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
        <span style={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'line-through', fontSize: '0.85em' }}>{f(origVal)}</span>
        <span style={{ color: '#00E5A0', fontSize: '0.85em' }}>→</span>
        <span style={{ color: '#00E5A0', fontWeight: 700 }}>{f(newVal)}</span>
      </span>
    ) : <>{f(newVal)}</>

  // ── 미니 ADR 시뮬레이터 계산 (totalFcRn/totalFcRev 재사용 → early return 이후라 일반 const) ──
  const effTotal  = simData?.total_rooms ?? schema?.roomCount ?? 0
  const effBase   = simData?.base_bar_rate ?? 0
  const effRooms  = simData?.rooms ?? []
  const effBooked = effRooms.reduce((s: number, r: AdrSimRoom) => s + (r.booked ?? 0), 0)

  const miniCalc = (() => {
    const TOTAL  = effTotal
    const curRn  = effBooked
    const curAdr = effBase
    const curRev = curAdr * curRn
    const avail  = Math.max(0, TOTAL - curRn)
    const curOcc = TOTAL > 0 ? Math.round((curRn / TOTAL) * 100) : 0

    const newBar = barRaw
    const otaFee = otaFeePct / 100
    const dirPct = 100 - otaPct

    const fcstRn  = totalFcRn    // 기존 합계 변수 재사용
    const fcstRev = totalFcRev
    const fcSellRooms = Math.min(avail, Math.max(0, fcstRn - curRn))
    const sellRatio = avail > 0 ? fcSellRooms / avail : 0

    const detail = effRooms.filter((r: AdrSimRoom) => (r.avail ?? 0) > 0).map((room: AdrSimRoom) => {
      const rtAvail = room.avail ?? 0
      const rtSell  = Math.round(rtAvail * sellRatio)
      const sc      = room.surcharge ?? 0
      const newFull = newBar + sc
      const avgRate = newFull * (1 - otaFee) * (otaPct / 100) + newFull * (dirPct / 100)
      return { room, rtSell, rev: avgRate * rtSell }
    })

    const sellRooms  = detail.reduce((s, d) => s + d.rtSell, 0)
    const simTotalRn = curRn + sellRooms
    const simOcc = TOTAL > 0 ? Math.round((simTotalRn / TOTAL) * 100) : 0
    const newAvailRev = detail.reduce((s, d) => s + d.rev, 0)
    const simRev = curRev + newAvailRev
    const simAdr = simTotalRn > 0 ? Math.round(simRev / simTotalRn) : 0

    return { curOcc, curAdr, curRn, curRev, simOcc, simAdr, simRev, avail, detail, fcstRn, fcstRev }
  })()

  const recState = (() => {
    if (miniCalc.fcstRev <= 0) return null
    const fRev = miniCalc.simRev >= miniCalc.fcstRev
    const fAdr = miniCalc.simAdr >= (miniCalc.fcstRn > 0 ? miniCalc.fcstRev / miniCalc.fcstRn : 0)
    if (fRev && fAdr) return { kind: 'achievable' as const }
    if (fRev && !fAdr) return { kind: 'review' as const }

    const dirPct = 100 - otaPct
    const channelRate = (otaPct / 100) * (1 - otaFeePct / 100) + (dirPct / 100)
    if (channelRate <= 0) return null
    const needRev = miniCalc.fcstRev - miniCalc.curRev
    if (needRev <= 0) return { kind: 'otb' as const }

    const sellDetail = miniCalc.detail.filter(d => d.rtSell > 0)
    const totalSell = sellDetail.reduce((s, d) => s + d.rtSell, 0)
    if (totalSell <= 0) return { kind: 'soldout' as const }
    const surchargeSum = sellDetail.reduce((s, d) => s + d.rtSell * (d.room.surcharge ?? 0), 0)
    const raw = (needRev / channelRate - surchargeSum) / totalSell
    if (raw <= 0) return { kind: 'otb' as const }
    const bar = Math.round(raw / 1000) * 1000
    return { kind: 'rec' as const, bar }
  })()

  const currentIdx = selectedDate ? availableDates.indexOf(selectedDate) : -1
  const canMove    = availableDates.length > 1
  const prevDate   = currentIdx <= 0
    ? availableDates[availableDates.length - 1]
    : availableDates[currentIdx - 1]
  const nextDate   = currentIdx >= availableDates.length - 1
    ? availableDates[0]
    : availableDates[currentIdx + 1]

  function handlePrevDate() {
    if (!canMove || !prevDate) return
    if (changedEditCount > 0) { setPendingDate(prevDate); setConfirmOpen(true); return }
    onSelectDate(prevDate)
  }
  function handleNextDate() {
    if (!canMove || !nextDate) return
    if (changedEditCount > 0) { setPendingDate(nextDate); setConfirmOpen(true); return }
    onSelectDate(nextDate)
  }

  function handleConfirmApply() {
    if (dailyKpi?.after.isOverCapacity) {
      alert('객실 수를 초과했습니다. 적용할 수 없습니다.')
      setConfirmOpen(false)
      return
    }
    onApply(tempEdits)
    if (pendingDate) onSelectDate(pendingDate)
    setConfirmOpen(false)
    setPendingDate(null)
  }
  function handleConfirmDiscard() {
    setTempEdits(new Map())
    if (pendingDate) onSelectDate(pendingDate)
    setConfirmOpen(false)
    setPendingDate(null)
  }
  function handleConfirmCancel() {
    setConfirmOpen(false)
    setPendingDate(null)
  }

  const canApply = changedEditCount > 0 && !(dailyKpi?.after.isOverCapacity ?? false)

  function handleApply() {
    if (!canApply) return
    onApply(tempEdits)
    onClose()
  }

  function handleCopyOtbToFc() {
    if (!day || !selectedDate || day.is_actual_day) return
    if (!confirm('OTB 값을 FC로 복사합니다.\n기존 FC 편집값은 덮어쓰입니다. 계속하시겠습니까?')) return
    const next = new Map(tempEdits)
    for (const [code, orig] of Object.entries(day.values)) {
      const otbAdr = orig.otb_rn > 0 ? Math.round(orig.otb_rev / orig.otb_rn) : 0
      next.set(makeEditKey(selectedDate, code), { rn: orig.otb_rn, adr: otbAdr })
    }
    setTempEdits(next)
  }

  function handleCopyLyToFc() {
    if (!day || !selectedDate || day.is_actual_day) return
    if (!confirm('LY(작년) 값을 FC로 복사합니다.\n기존 FC 편집값은 덮어쓰입니다. 계속하시겠습니까?')) return
    const next = new Map(tempEdits)
    for (const code of Object.keys(day.values)) {
      const ly = lyMap[code]
      if (!ly) continue
      next.set(makeEditKey(selectedDate, code), { rn: ly.ly_rn, adr: Math.round(ly.ly_adr) })
    }
    setTempEdits(next)
  }

  const colWidths = [
    COL.SEG, COL.FC_RN, COL.FC_ADR, COL.FC_REV,
    COL.OTB_RN, COL.OTB_ADR, COL.OTB_REV,
    COL.GAP_RN, COL.GAP_ADR, COL.GAP_REV,
    COL.LY_RN, COL.LY_ADR, COL.LY_REV,
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <style>{TABLE_CSS}</style>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="일괄수정 V2"
        className="relative w-full bg-ns-bg border border-ns-border rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col"
        style={{ maxWidth: 1480, maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ns-border flex-shrink-0">
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={handlePrevDate} disabled={!canMove} aria-label="이전 일자"
              style={{
                padding: '4px 6px', background: 'transparent', border: 'none', lineHeight: 0,
                cursor: canMove ? 'pointer' : 'not-allowed', opacity: canMove ? 1 : 0.3,
                color: 'var(--color-text-primary)',
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 90, textAlign: 'center' }}>
              {day?.day_label ?? '—'}
            </span>
            <button
              onClick={handleNextDate} disabled={!canMove} aria-label="다음 일자"
              style={{
                padding: '4px 6px', background: 'transparent', border: 'none', lineHeight: 0,
                cursor: canMove ? 'pointer' : 'not-allowed', opacity: canMove ? 1 : 0.3,
                color: 'var(--color-text-primary)',
              }}
            >
              <ChevronRight size={16} />
            </button>
            <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>V2</span>
          </div>

          <button onClick={onClose} aria-label="닫기" className="text-ns-text-muted hover:text-ns-text transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6" style={{ minHeight: 240 }}>
          {!schema ? (
            <div className="flex items-center justify-center py-10">
              <span className="text-ns-text-muted text-sm">스키마 로딩 중...</span>
            </div>
          ) : !selectedDate || !day ? (
            <div className="flex items-center justify-center py-10">
              <span className="text-ns-text-muted text-sm">해당 일자 데이터를 찾을 수 없습니다</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
              {/* 좌측: 순수 table */}
              <div className="bev2" style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
                <table>
                  <colgroup>
                    {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="l" rowSpan={2} style={{ textAlign: 'left' }}>Segmentation</th>
                      <th colSpan={3} className="grp-fc gb-fc" style={{ textAlign: 'center', color: 'var(--color-accent-primary)' }}>Forecast</th>
                      <th colSpan={3} className="grp-otb gb-otb" style={{ textAlign: 'center' }}>OTB</th>
                      <th colSpan={3} className="grp-gap gb-gap" style={{ textAlign: 'center', color: '#fbbf24', fontWeight: 700 }}>⚡ Forecast vs OTB</th>
                      <th colSpan={3} className="grp-ly gb-ly" style={{ textAlign: 'center' }}>Last Year</th>
                    </tr>
                    <tr>
                      <th className="gb-fc">RN</th><th>ADR</th><th>REV</th>
                      <th className="gb-otb">RN</th><th>ADR</th><th>REV</th>
                      <th className="gb-gap" style={{ color: '#fbbf24' }}>R/N</th>
                      <th style={{ color: '#fbbf24' }}>ADR</th>
                      <th style={{ color: '#fbbf24' }}>REV</th>
                      <th className="gb-ly">RN</th><th>ADR</th><th>REV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderSegmentRows(schema.nodes, tableData, tempEdits, selectedDate, save, activeCell, handleTab, day)}

                    {/* 합계 (HOU 제외) */}
                    <tr className="row-total">
                      <td className="l">합계 (HOU 제외)</td>
                      <td className="gb-fc" style={{ borderLeft: GB_BORDER }}>{beforeAfter(origTotalFcRn,  totalFcRn,  fmtRn,       hasAnyEdit && origTotalFcRn  !== totalFcRn)}</td>
                      <td>{beforeAfter(origTotalFcAdr, totalFcAdr, fmtAdr,      hasAnyEdit && origTotalFcAdr !== totalFcAdr)}</td>
                      <td>{beforeAfter(origTotalFcRev, totalFcRev, fmtCurrency, hasAnyEdit && origTotalFcRev !== totalFcRev)}</td>
                      <td className="gb-otb" style={{ borderLeft: GB_BORDER }}>{fmtRn(totalOtbRn)}</td>
                      <td>{fmtAdr(totalOtbAdr)}</td>
                      <td>{fmtCurrency(totalOtbRev)}</td>
                      {gapCell(totalFcRn - totalOtbRn, '', { className: 'gb-gap' })}
                      {gapCell(totalFcAdr - totalOtbAdr, 'k')}
                      {gapCell(totalFcRev - totalOtbRev, 'm')}
                      <td className="gb-ly" style={{ borderLeft: GB_BORDER }}>{fmtRn(totalLyRn)}</td>
                      <td>{fmtAdr(totalLyAdr)}</td>
                      <td>{fmtCurrency(totalLyRev)}</td>
                    </tr>
                    {/* OCC% */}
                    <tr className="row-occ">
                      <td className="l">OCC%</td>
                      <td className="gb-fc" colSpan={3} style={{ textAlign: 'center', borderLeft: GB_BORDER }}>
                        {beforeAfter(
                          roomCount > 0 ? (origTotalFcRn / roomCount) * 100 : 0,
                          roomCount > 0 ? (totalFcRn / roomCount) * 100 : 0,
                          v => `${v.toFixed(1)}%`,
                          hasAnyEdit && origTotalFcRn !== totalFcRn,
                        )}
                        {totalFcRn > roomCount && <AlertTriangle size={11} style={{ marginLeft: 4, display: 'inline', color: '#f87171' }} />}
                      </td>
                      <td className="gb-otb" colSpan={3} style={{ textAlign: 'center', borderLeft: GB_BORDER }}>
                        {roomCount > 0 ? ((totalOtbRn / roomCount) * 100).toFixed(1) : 0}%
                      </td>
                      <td className="gb-gap" colSpan={3} style={{ textAlign: 'center', color: gapColor(totalFcRn - totalOtbRn), borderLeft: GB_BORDER }}>
                        {(() => {
                          const v = roomCount > 0 ? (totalFcRn - totalOtbRn) / roomCount * 100 : 0
                          return v === 0 ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`
                        })()}
                      </td>
                      <td className="gb-ly" colSpan={3} style={{ textAlign: 'center', borderLeft: GB_BORDER }}>
                        {roomCount > 0 ? ((totalLyRn / roomCount) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                    {/* RevPAR */}
                    <tr className="row-revpar">
                      <td className="l">RevPAR</td>
                      <td className="gb-fc" colSpan={3} style={{ textAlign: 'center', borderLeft: GB_BORDER }}>
                        {beforeAfter(
                          roomCount > 0 ? origTotalFcRev / roomCount : 0,
                          roomCount > 0 ? totalFcRev / roomCount : 0,
                          fmtAdr,
                          hasAnyEdit && origTotalFcRev !== totalFcRev,
                        )}
                      </td>
                      <td className="gb-otb" colSpan={3} style={{ textAlign: 'center', borderLeft: GB_BORDER }}>
                        {fmtAdr(roomCount > 0 ? totalOtbRev / roomCount : 0)}
                      </td>
                      <td className="gb-gap" colSpan={3} style={{ textAlign: 'center', color: gapColor(totalFcRev - totalOtbRev), borderLeft: GB_BORDER }}>
                        {fmtGap(roomCount > 0 ? (totalFcRev - totalOtbRev) / roomCount : 0, 'k')}
                      </td>
                      <td className="gb-ly" colSpan={3} style={{ textAlign: 'center', borderLeft: GB_BORDER }}>
                        {fmtAdr(roomCount > 0 ? totalLyRev / roomCount : 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 우측: 영향 패널 (기존 카드 재사용) */}
              <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <MonthlyImpactCard selectedDate={selectedDate} kpi={monthlyKpi} />

                {/* 미니 ADR 시뮬레이터 */}
                <div style={{ background: '#161616', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.07)', padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>ADR 시뮬레이터</div>

                  {/* BAR Rate 조정 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>BAR Rate</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{Math.round(effBase / 1000)}K →</span>
                    <input
                      type="number"
                      value={Math.round(barRaw / 1000)}
                      onChange={e => setBarRaw((parseInt(e.target.value) || 0) * 1000)}
                      style={{
                        width: 50, padding: '2px 5px', fontSize: 11, borderRadius: 4,
                        border: '1px solid rgba(0,229,160,0.4)', background: 'rgba(0,229,160,0.06)',
                        color: '#00E5A0', textAlign: 'center', outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>K</span>
                  </div>

                  {/* Recommended BAR */}
                  {recState?.kind === 'rec' && (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 8px', borderRadius: 6, background: 'rgba(0,229,160,0.08)',
                      border: '0.5px solid rgba(0,229,160,0.2)', marginBottom: 8,
                    }}>
                      <span style={{ fontSize: 10, color: 'rgba(0,229,160,0.7)' }}>Recommended BAR</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#00E5A0' }}>{Math.round(recState.bar / 1000)}K</span>
                      <button
                        onClick={() => setBarRaw(recState.bar)}
                        style={{
                          padding: '2px 8px', borderRadius: 4, border: 'none',
                          background: '#00E5A0', color: '#0a2018', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  )}
                  {recState?.kind === 'achievable' && (
                    <div style={{ fontSize: 10, color: '#00E5A0', marginBottom: 8 }}>✓ 목표 달성 가능</div>
                  )}
                  {recState?.kind === 'soldout' && (
                    <div style={{ fontSize: 10, color: '#f87171', marginBottom: 8 }}>매진 — 잔여 없음</div>
                  )}

                  {/* 슬라이더 3개 — 라벨/트랙/값 높이 고정으로 세로 정렬 통일 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                    {/* OTA */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 6, height: 12 }}>OTA</div>
                      <div style={{ width: '100%', height: 12, display: 'flex', alignItems: 'center' }}>
                        <input type="range" min={0} max={100} value={otaPct} onChange={e => setOtaPct(parseInt(e.target.value))} className="sim-slider" style={{ width: '100%', margin: 0 }} />
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#00E5A0', marginTop: 6, height: 14 }}>{otaPct}%</div>
                    </div>
                    {/* Direct — 읽기전용이지만 동일한 박스 모델로 통일 */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 6, height: 12 }}>Direct</div>
                      <div style={{ width: '100%', height: 12, display: 'flex', alignItems: 'center', position: 'relative' }}>
                        <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', position: 'relative' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${100 - otaPct}%`, background: 'rgba(255,255,255,0.4)', borderRadius: 2 }} />
                          <div style={{ position: 'absolute', top: '50%', left: `${100 - otaPct}%`, width: 12, height: 12, borderRadius: '50%', background: 'rgba(255,255,255,0.6)', transform: 'translate(-50%, -50%)' }} />
                        </div>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginTop: 6, height: 14 }}>{100 - otaPct}%</div>
                    </div>
                    {/* Commission */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 6, height: 12 }}>Commission</div>
                      <div style={{ width: '100%', height: 12, display: 'flex', alignItems: 'center' }}>
                        <input type="range" min={0} max={30} value={otaFeePct} onChange={e => setOtaFeePct(parseInt(e.target.value))} className="sim-slider amber" style={{ width: '100%', margin: 0 }} />
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#fbbf24', marginTop: 6, height: 14 }}>{otaFeePct}%</div>
                    </div>
                  </div>

                  {/* OCC/ADR/REV 미리보기 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>OCC</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24' }}>{miniCalc.simOcc}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>ADR</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24' }}>{Math.round(miniCalc.simAdr / 1000)}K</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>REV</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24' }}>{(miniCalc.simRev / 1e6).toFixed(1)}M</div>
                    </div>
                  </div>
                </div>

                {/* 버튼 영역 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={handleCopyOtbToFc}
                      disabled={!day || day.is_actual_day}
                      title={day?.is_actual_day ? '과거 일자는 복사할 수 없습니다' : '현재 일자의 OTB 값을 FC로 복사'}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        padding: '5px 10px', fontSize: 12, fontWeight: 500,
                        border: '0.5px solid var(--color-border-secondary)', borderRadius: 6,
                        background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
                        cursor: (!day || day.is_actual_day) ? 'not-allowed' : 'pointer',
                        opacity: (!day || day.is_actual_day) ? 0.3 : 1,
                      }}
                    >
                      <Copy size={13} />
                      OTB → FC
                    </button>
                    <button
                      onClick={handleCopyLyToFc}
                      disabled={!day || day.is_actual_day || Object.keys(lyMap).length === 0}
                      title={
                        day?.is_actual_day ? '과거 일자는 복사할 수 없습니다'
                        : Object.keys(lyMap).length === 0 ? 'LY 데이터가 없습니다'
                        : '현재 일자의 LY(작년) 값을 FC로 복사'
                      }
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        padding: '5px 10px', fontSize: 12, fontWeight: 500,
                        border: '0.5px solid var(--color-border-secondary)', borderRadius: 6,
                        background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
                        cursor: (!day || day.is_actual_day || Object.keys(lyMap).length === 0) ? 'not-allowed' : 'pointer',
                        opacity: (!day || day.is_actual_day || Object.keys(lyMap).length === 0) ? 0.3 : 1,
                      }}
                    >
                      <Copy size={13} />
                      LY → FC
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={onClose}
                      style={{
                        flex: 1, padding: '8px 0', background: 'transparent',
                        border: '1px solid var(--color-border-default)', borderRadius: 6,
                        color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      취소
                    </button>
                    <button
                      onClick={handleApply}
                      disabled={!canApply}
                      title={dailyKpi?.after.isOverCapacity ? '객실 수를 초과했습니다' : undefined}
                      style={{
                        flex: 1, padding: '8px 0',
                        background: canApply ? 'var(--color-accent-primary, #00E5A0)' : 'var(--color-bg-secondary)',
                        border: 'none', borderRadius: 6,
                        color:   canApply ? '#000' : 'var(--color-text-muted)',
                        fontSize: 12, fontWeight: 600,
                        cursor:  canApply ? 'pointer' : 'not-allowed',
                        opacity: canApply ? 1 : 0.5,
                      }}
                    >
                      {dailyKpi?.after.isOverCapacity
                        ? '객실 초과'
                        : `적용${changedEditCount > 0 ? ` (${changedEditCount}건)` : ''}`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        message={`편집한 ${changedEditCount}건의 변경 사항이 있습니다.\n어떻게 처리하시겠습니까?`}
        onApply={handleConfirmApply}
        onDiscard={handleConfirmDiscard}
        onCancel={handleConfirmCancel}
      />
    </div>
  )
}
