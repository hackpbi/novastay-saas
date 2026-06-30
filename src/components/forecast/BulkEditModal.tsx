'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import { fmtRn, fmtAdr } from '@/lib/forecast/format'
import { makeEditKey, type EditedValues } from '@/lib/forecast/save'
import type { ForecastSchema, ForecastDayData } from '@/lib/forecast/types'
import MarketTable, { type MarketTableColumn, type MarketTableData } from '@/components/tables/MarketTable'
import { useDateContext } from '@/contexts/DateContext'
import { ConfirmDialog } from '@/components/forecast/ConfirmDialog'
import { supabase } from '@/lib/supabase'

// ── LY 타입 ───────────────────────────────────────────────────────────────────

type LyRow = {
  segmentation: string
  ly_date:      string
  ly_rn:        number
  ly_adr:       number
  ly_revenue:   number
}

type LyMap = Record<string, LyRow>  // segmentation code → LyRow

export type BulkEditTab = 'daily' | 'weekday'

const TABLE_FONT_SIZE = 15    // 표 글자 크기 (px) — 여기만 바꾸면 됨
const TABLE_SCALE     = 0.78  // 표 축소율 — 여기만 바꾸면 됨

// 컬럼 폭 — buildColumns width + TotalOccRow grid 둘 다 이 값으로 정렬
const COL = {
  SEG:     240,
  FC_RN:   100,
  FC_ADR:  130,
  FC_REV:  110,
  OTB_RN:   95,
  OTB_ADR: 110,
  OTB_REV: 110,
  GAP_RN:   85,
  GAP_ADR: 100,
  GAP_REV: 100,
  LY_RN:    85,
  LY_ADR:  100,
  LY_REV:  100,
} as const

const GRID_TEMPLATE = [
  COL.SEG,
  COL.FC_RN,  COL.FC_ADR,  COL.FC_REV,
  COL.OTB_RN, COL.OTB_ADR, COL.OTB_REV,
  COL.GAP_RN, COL.GAP_ADR, COL.GAP_REV,
  COL.LY_RN,  COL.LY_ADR,  COL.LY_REV,
].map(w => `${w}px`).join(' ')

export interface BulkEditModalProps {
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

// ── Daily metric helpers ──────────────────────────────────────────────────────

export function calcDailyMetrics(
  day:          ForecastDayData,
  tempEdits:    EditedValues,
  selectedDate: string,
  roomCount:    number,
) {
  let totalRn = 0, totalRev = 0
  for (const [code, orig] of Object.entries(day.values)) {
    const ed  = tempEdits.get(makeEditKey(selectedDate, code))
    const rn  = ed?.rn  ?? orig.rn
    const adr = ed?.adr ?? orig.adr
    totalRn  += rn
    totalRev += rn * adr
  }
  return {
    totalRn,
    totalRev,
    occ:            roomCount > 0 ? (totalRn / roomCount) * 100 : 0,
    revpar:         roomCount > 0 ? totalRev / roomCount : 0,
    adr:            totalRn > 0   ? totalRev / totalRn   : 0,
    isOverCapacity: totalRn > roomCount,
  }
}

export function calcOtbMetrics(day: ForecastDayData, roomCount: number) {
  let totalRn = 0, totalRev = 0
  for (const orig of Object.values(day.values)) {
    totalRn  += orig.otb_rn
    totalRev += orig.otb_rev
  }
  return {
    totalRn,
    totalRev,
    occ:    roomCount > 0 ? (totalRn / roomCount) * 100 : 0,
    revpar: roomCount > 0 ? totalRev / roomCount : 0,
    adr:    totalRn > 0   ? totalRev / totalRn   : 0,
  }
}

// ── Monthly metric helpers ────────────────────────────────────────────────────

export function calcMonthlyBefore(data: ForecastDayData[], roomCount: number) {
  let totalRn = 0, totalRev = 0
  for (const day of data) {
    for (const [, orig] of Object.entries(day.values)) {
      totalRn  += orig.rn
      totalRev += orig.rn * orig.adr
    }
  }
  const days = data.length
  return {
    rn:  totalRn,
    rev: totalRev,
    adr: totalRn > 0 ? totalRev / totalRn : 0,
    occ: roomCount > 0 && days > 0 ? (totalRn / (roomCount * days)) * 100 : 0,
  }
}

export function calcMonthlyAfter(data: ForecastDayData[], tempEdits: EditedValues, roomCount: number) {
  let totalRn = 0, totalRev = 0
  for (const day of data) {
    for (const [code, orig] of Object.entries(day.values)) {
      const ed  = tempEdits.get(makeEditKey(day.business_date, code))
      const rn  = ed?.rn  ?? orig.rn
      const adr = ed?.adr ?? orig.adr
      totalRn  += rn
      totalRev += rn * adr
    }
  }
  const days = data.length
  return {
    rn:  totalRn,
    rev: totalRev,
    adr: totalRn > 0 ? totalRev / totalRn : 0,
    occ: roomCount > 0 && days > 0 ? (totalRn / (roomCount * days)) * 100 : 0,
  }
}

// ── Monthly OTB helper ────────────────────────────────────────────────────────

export function calcMonthlyOtb(data: ForecastDayData[], roomCount: number) {
  let totalRn = 0, totalRev = 0
  for (const day of data) {
    for (const orig of Object.values(day.values)) {
      totalRn  += orig.otb_rn
      totalRev += orig.otb_rev
    }
  }
  const days = data.length
  return {
    rn: totalRn, rev: totalRev,
    adr: totalRn > 0 ? totalRev / totalRn : 0,
    occ: roomCount > 0 && days > 0 ? (totalRn / (roomCount * days)) * 100 : 0,
  }
}

// ── Gap helpers ───────────────────────────────────────────────────────────────

export function gapColor(v: number): string {
  if (v > 0) return 'var(--color-success, #10B981)'
  if (v < 0) return 'var(--color-text-danger, #ef4444)'
  return 'var(--color-text-muted)'
}

export function fmtGap(v: number, unit: 'k' | 'm' | '' = ''): string {
  if (v === 0) return '0'
  const sign = v > 0 ? '+' : '-'
  const abs  = Math.abs(v)
  if (unit === 'k') return sign + Math.round(abs / 1000).toLocaleString()
  if (unit === 'm') return sign + (abs / 1_000_000).toFixed(1)
  return sign + Math.round(abs).toLocaleString()
}

function fmtGapPct(v: number): string {
  if (v === 0) return '0%p'
  const sign = v > 0 ? '+' : ''
  return sign + v.toFixed(1) + '%p'
}

// ── ModalEditableCell ─────────────────────────────────────────────────────────

interface ModalEditableCellProps {
  value:       number
  fmt:         (n: number) => string
  onSave:      (v: number) => void
  isModified?: boolean
  isActive?:   boolean
  onTab?:      (shift: boolean) => void
}

function ModalEditableCell({ value, fmt, onSave, isModified, isActive, onTab }: ModalEditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [input,   setInput]   = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Tab 이동으로 이 셀이 활성화되면 편집 모드 진입
  useEffect(() => {
    if (isActive) {
      setInput(String(Math.round(value)))
      setEditing(true)
    }
  }, [isActive])  // value 제외: 편집 중 외부 value 변경에 반응 안 함

  // editing이 true가 되면 포커스 + 전체 선택
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
        <style>{`.medit::-webkit-inner-spin-button,.medit::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}`}</style>
        <input
          ref={inputRef}
          type="number" className="medit" value={input}
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
    <span onClick={startEdit} style={{ cursor: 'text', userSelect: 'none' }}>
      {fmt(value)}
      {isModified && (
        <span style={{
          marginLeft: 3, display: 'inline-block', width: 4, height: 4,
          borderRadius: '50%', background: 'var(--color-accent-primary, #00E5A0)', verticalAlign: 'middle',
        }} />
      )}
    </span>
  )
}

// ── buildMarketTableData ──────────────────────────────────────────────────────

function buildMarketTableData(
  day:          ForecastDayData,
  tempEdits:    EditedValues,
  selectedDate: string,
  lyMap:        LyMap,
): MarketTableData {
  const result: MarketTableData = {}
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
      // LY — ly_adr は computeCell が ly_rev/ly_rn から自動計算
      ly_rn:  ly?.ly_rn  ?? 0,
      ly_rev: ly?.ly_revenue ?? 0,
    }
  }
  return result
}

// ── buildColumns ──────────────────────────────────────────────────────────────

type ActiveCell = { segCode: string; field: 'rn' | 'adr' } | null

function buildColumns(
  day:          ForecastDayData,
  selectedDate: string,
  tempEdits:    EditedValues,
  setTempEdits: (next: EditedValues) => void,
  activeCell:   ActiveCell,
  onTab:        (segCode: string, field: 'rn' | 'adr', shift: boolean) => void,
): MarketTableColumn[] {
  function save(code: string, field: 'rn' | 'adr', val: number) {
    const next = new Map(tempEdits)
    const key  = makeEditKey(selectedDate, code)
    next.set(key, { ...next.get(key) ?? {}, [field]: val })
    setTempEdits(next)
  }

  return [
    // ── FC ─────────────────────────────────────────────────────
    {
      key: 'rn', label: 'RN', type: 'number', group: 'FC · 편집', width: `${COL.FC_RN}px`,
      render: (val, row) => {
        const code = row.segmentation
        const orig = code ? day.values[code] : undefined
        if (!orig) return <span>{fmtRn(val)}</span>
        const ed  = tempEdits.get(makeEditKey(selectedDate, code))
        const rn  = ed?.rn ?? orig.rn
        const mod = ed?.rn !== undefined && ed.rn !== orig.rn
        return <ModalEditableCell value={rn} fmt={fmtRn} isModified={mod} onSave={v => save(code, 'rn', v)}
          isActive={activeCell?.segCode === code && activeCell?.field === 'rn'}
          onTab={shift => onTab(code, 'rn', shift)} />
      },
    },
    {
      key: 'adr', label: 'ADR', type: 'adr', group: 'FC · 편집', width: `${COL.FC_ADR}px`,
      render: (val, row) => {
        const code = row.segmentation
        const orig = code ? day.values[code] : undefined
        if (!orig) return <span>{fmtAdr(val)}</span>
        const ed  = tempEdits.get(makeEditKey(selectedDate, code))
        const adr = ed?.adr ?? orig.adr
        const mod = ed?.adr !== undefined && ed.adr !== orig.adr
        return <ModalEditableCell value={adr} fmt={fmtAdr} isModified={mod} onSave={v => save(code, 'adr', v)}
          isActive={activeCell?.segCode === code && activeCell?.field === 'adr'}
          onTab={shift => onTab(code, 'adr', shift)} />
      },
    },
    { key: 'rev', label: 'REV', type: 'currency', group: 'FC · 편집', width: `${COL.FC_REV}px` },

    // ── OTB (읽기 전용 — render 없음 → formatValue) ──────────
    { key: 'otb_rn',  label: 'RN',  type: 'number',  group: 'OTB · 참고', width: `${COL.OTB_RN}px`  },
    { key: 'otb_adr', label: 'ADR', type: 'adr',     group: 'OTB · 참고', width: `${COL.OTB_ADR}px` },
    { key: 'otb_rev', label: 'REV', type: 'currency', group: 'OTB · 참고', width: `${COL.OTB_REV}px` },

    // ── Gap ────────────────────────────────────────────────────
    {
      key: 'gap_rn', label: 'RN', type: 'number', group: 'Gap', width: `${COL.GAP_RN}px`,
      render: (val, row) => {
        const code = row.segmentation
        const orig = code ? day.values[code] : undefined
        const gapRn = orig
          ? (tempEdits.get(makeEditKey(selectedDate, code))?.rn ?? orig.rn) - orig.otb_rn
          : val
        return <span style={{ color: gapColor(gapRn) }}>{fmtGap(gapRn)}</span>
      },
    },
    {
      key: 'gap_adr', label: 'ADR', type: 'adr', group: 'Gap', width: `${COL.GAP_ADR}px`,
      // val from computeCell = gap_rev/gap_rn (weighted, used for parent rows via formatValue)
      // render overrides with simple fc_adr - otb_adr for leaf rows
      render: (val, row) => {
        const code = row.segmentation
        const orig = code ? day.values[code] : undefined
        if (!orig) return <span style={{ color: gapColor(val) }}>{fmtGap(val, 'k')}</span>
        const ed     = tempEdits.get(makeEditKey(selectedDate, code))
        const fcAdr  = ed?.adr ?? orig.adr
        const otbAdr = orig.otb_rn > 0 ? Math.round(orig.otb_rev / orig.otb_rn) : 0
        const gapAdr = fcAdr - otbAdr
        return <span style={{ color: gapColor(gapAdr) }}>{fmtGap(gapAdr, 'k')}</span>
      },
    },
    {
      key: 'gap_rev', label: 'REV', type: 'currency', group: 'Gap', width: `${COL.GAP_REV}px`,
      render: (val, row) => {
        const code = row.segmentation
        const orig = code ? day.values[code] : undefined
        if (!orig) return <span style={{ color: gapColor(val) }}>{fmtGap(val, 'm')}</span>
        const ed     = tempEdits.get(makeEditKey(selectedDate, code))
        const fcRn   = ed?.rn  ?? orig.rn
        const fcAdr  = ed?.adr ?? orig.adr
        const gapRev = fcRn * fcAdr - orig.otb_rev
        return <span style={{ color: gapColor(gapRev) }}>{fmtGap(gapRev, 'm')}</span>
      },
    },

    // ── LY 컬럼 (읽기 전용) ──────────────────────────────────────────────────
    {
      key: 'ly_rn', label: 'RN', type: 'number', group: 'LY · 작년', width: `${COL.LY_RN}px`,
    },
    {
      key: 'ly_adr', label: 'ADR', type: 'adr', group: 'LY · 작년', width: `${COL.LY_ADR}px`,
      // ly_adr → computeCell이 ly_rev/ly_rn으로 자동 계산 (endsWith('_adr') 패턴)
    },
    {
      key: 'ly_rev', label: 'REV', type: 'currency', group: 'LY · 작년', width: `${COL.LY_REV}px`,
    },
  ]
}

// ── TotalOccRow ───────────────────────────────────────────────────────────────

type FcMetrics  = ReturnType<typeof calcDailyMetrics>
type OtbMetrics = ReturnType<typeof calcOtbMetrics>


function TotalOccRow({ fc, otb, roomCount }: { fc: FcMetrics; otb: OtbMetrics; roomCount: number }) {
  const gapRn     = fc.totalRn  - otb.totalRn
  const gapRev    = fc.totalRev - otb.totalRev
  const gapAdr    = fc.adr      - otb.adr
  const gapOcc    = fc.occ      - otb.occ
  const gapRevpar = fc.revpar   - otb.revpar

  const cell:  React.CSSProperties = { textAlign: 'right', fontSize: 12 }
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }
  const PURPLE = 'rgba(99,102,241,0.8)'
  const MINT   = 'rgba(0,229,160,0.8)'
  // GAP 색상 (양수 민트 / 음수 빨강)
  const gColor = (v: number) => (v > 0 ? '#00E5A0' : v < 0 ? '#f87171' : 'var(--color-text-muted)')
  // LY 합계는 미제공 → '—' 자리 (테이블 LY 컬럼 정렬)
  const dash: React.CSSProperties = { ...cell, gridColumn: 'span 3', textAlign: 'center', color: 'var(--color-text-muted)' }

  return (
    <div style={{
      marginTop:    12,
      padding:      '10px 16px',
      background:   'var(--color-bg-secondary)',
      borderRadius: 8,
      border:       '1px solid var(--color-border-default)',
      borderTop:    '1px solid rgba(255,255,255,0.1)',
    }}>

      {/* 그룹 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: GRID_TEMPLATE, gap: 4, marginBottom: 4 }}>
        <div />
        <div style={{ ...label, gridColumn: 'span 3', textAlign: 'center', color: 'var(--color-accent-primary)' }}>FC</div>
        <div style={{ ...label, gridColumn: 'span 3', textAlign: 'center', color: 'var(--color-text-muted)' }}>OTB</div>
        <div style={{ ...label, gridColumn: 'span 3', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Gap</div>
        <div style={{ ...label, gridColumn: 'span 3', textAlign: 'center', color: 'var(--color-text-muted)' }}>LY</div>
      </div>

      {/* Total 행 */}
      <div style={{ display: 'grid', gridTemplateColumns: GRID_TEMPLATE, gap: 4, alignItems: 'center' }}>
        <div style={{ ...label, color: 'rgba(255,255,255,0.85)' }}>Total</div>
        {/* FC */}
        <div style={{ ...cell, color: fc.isOverCapacity ? 'var(--color-text-danger, #ef4444)' : 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
          {fc.totalRn}{fc.isOverCapacity ? ' ⚠' : ''}
        </div>
        <div style={{ ...cell, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{Math.round(fc.adr / 1000)}K</div>
        <div style={{ ...cell, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{(fc.totalRev / 1_000_000).toFixed(1)}M</div>
        {/* OTB */}
        <div style={{ ...cell, color: 'var(--color-text-secondary)' }}>{otb.totalRn}</div>
        <div style={{ ...cell, color: 'var(--color-text-secondary)' }}>{Math.round(otb.adr / 1000)}K</div>
        <div style={{ ...cell, color: 'var(--color-text-secondary)' }}>{(otb.totalRev / 1_000_000).toFixed(1)}M</div>
        {/* Gap */}
        <div style={{ ...cell, color: gColor(gapRn) }}>{fmtGap(gapRn)}</div>
        <div style={{ ...cell, color: gColor(gapAdr) }}>{fmtGap(gapAdr, 'k')}</div>
        <div style={{ ...cell, color: gColor(gapRev) }}>{fmtGap(gapRev, 'm')}</div>
        {/* LY */}
        <div style={dash}>—</div>
      </div>

      {/* 구분선 */}
      <div style={{ borderTop: '1px solid var(--color-border-default)', margin: '8px 0' }} />

      {/* OCC 행 (보라) */}
      <div style={{ display: 'grid', gridTemplateColumns: GRID_TEMPLATE, gap: 4, alignItems: 'center' }}>
        <div style={{ ...label, color: PURPLE }}>OCC</div>
        <div style={{ ...cell, gridColumn: 'span 3', textAlign: 'center', fontWeight: 700,
          color: fc.isOverCapacity ? 'var(--color-text-danger, #ef4444)' : PURPLE,
        }}>
          {fc.occ.toFixed(1)}%{fc.isOverCapacity ? ' ⚠' : ''}
        </div>
        <div style={{ ...cell, gridColumn: 'span 3', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          {otb.occ.toFixed(1)}%
        </div>
        <div style={{ ...cell, gridColumn: 'span 3', textAlign: 'center', color: gColor(gapOcc) }}>
          {fmtGapPct(gapOcc)}
        </div>
        <div style={dash}>—</div>
      </div>

      {/* RevPAR 행 (민트) */}
      <div style={{ display: 'grid', gridTemplateColumns: GRID_TEMPLATE, gap: 4, alignItems: 'center', marginTop: 4 }}>
        <div style={{ ...label, color: MINT }}>RevPAR</div>
        <div style={{ ...cell, gridColumn: 'span 3', textAlign: 'center', fontWeight: 700, color: MINT }}>
          {Math.round(fc.revpar / 1000)}K
        </div>
        <div style={{ ...cell, gridColumn: 'span 3', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          {Math.round(otb.revpar / 1000)}K
        </div>
        <div style={{ ...cell, gridColumn: 'span 3', textAlign: 'center', color: gColor(gapRevpar) }}>
          {fmtGap(gapRevpar, 'k')}
        </div>
        <div style={dash}>—</div>
      </div>

      <div style={{ marginTop: 6, textAlign: 'right', fontSize: 10, color: 'var(--color-text-muted)' }}>
        객실 {roomCount}실
      </div>
    </div>
  )
}

// ── DailyImpactCard ───────────────────────────────────────────────────────────

type DailyMetrics = ReturnType<typeof calcDailyMetrics>

export function DailyImpactCard({ kpi, isOverCapacity = false }: {
  kpi: { before: DailyMetrics; after: DailyMetrics } | null
  isOverCapacity?: boolean
}) {
  const danger = 'var(--color-text-danger, #ef4444)'
  const cardStyle: React.CSSProperties = {
    background:   'var(--color-bg-tertiary)',
    borderRadius: 8,
    padding:      12,
    border:       isOverCapacity ? `1px solid ${danger}` : '1px solid transparent',
  }
  const titleStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    letterSpacing: '0.05em',
    margin: 0,
  }
  const cell: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-secondary)' }

  if (!kpi) {
    return <div style={cardStyle}><p style={titleStyle}>일별 영향</p></div>
  }

  const { before, after } = kpi
  const occDiff = after.occ      - before.occ
  const adrDiff = after.adr      - before.adr
  const revDiff = after.totalRev - before.totalRev
  const hasChange = Math.abs(occDiff) > 0.01 || Math.abs(adrDiff) > 1 || Math.abs(revDiff) > 1

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={titleStyle}>일별 영향</p>
        {isOverCapacity && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: danger,
            background: 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: 4,
          }}>⚠ 객실 초과</span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr', gap: '3px 4px', fontSize: 11, lineHeight: 1.7 }}>
        <span style={cell}>OCC</span>
        <span style={cell}>{before.occ.toFixed(1)}%</span>
        <span style={{ ...cell, color: isOverCapacity ? danger : hasChange ? gapColor(occDiff) : 'var(--color-text-tertiary)' }}>→ {after.occ.toFixed(1)}%</span>

        <span style={cell}>ADR</span>
        <span style={cell}>{Math.round(before.adr / 1000)}K</span>
        <span style={{ ...cell, color: hasChange ? gapColor(adrDiff) : 'var(--color-text-tertiary)' }}>→ {Math.round(after.adr / 1000)}K</span>

        <span style={cell}>REV</span>
        <span style={cell}>{(before.totalRev / 1_000_000).toFixed(1)}M</span>
        <span style={{ ...cell, color: hasChange ? gapColor(revDiff) : 'var(--color-text-tertiary)' }}>→ {(after.totalRev / 1_000_000).toFixed(1)}M</span>
      </div>
    </div>
  )
}

// ── MonthlyImpactCard ─────────────────────────────────────────────────────────

type MonthlyMetrics = ReturnType<typeof calcMonthlyBefore>

export function MonthlyImpactCard({
  selectedDate,
  kpi,
}: {
  selectedDate: string | null
  kpi: { before: MonthlyMetrics; after: MonthlyMetrics } | null
}) {
  const cardStyle: React.CSSProperties = {
    background: 'var(--color-bg-tertiary)',
    borderRadius: 8,
    padding: 12,
  }
  const titleStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    letterSpacing: '0.05em',
    margin: '0 0 8px',
  }
  const cell: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-secondary)' }

  const monthLabel = selectedDate
    ? `${parseInt(selectedDate.split('-')[1])}월 전체`
    : '월별'

  if (!kpi) {
    return <div style={cardStyle}><p style={{ ...titleStyle, margin: 0 }}>월별 영향</p></div>
  }

  const { before, after } = kpi
  const occDiff = after.occ - before.occ
  const adrDiff = after.adr - before.adr
  const revDiff = after.rev - before.rev

  return (
    <div style={cardStyle}>
      <p style={titleStyle}>월별 영향 · {monthLabel}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr', gap: '3px 4px', fontSize: 11, lineHeight: 1.7 }}>
        <span style={cell}>OCC</span>
        <span style={cell}>{before.occ.toFixed(1)}%</span>
        <span style={{ ...cell, color: gapColor(occDiff) }}>→ {after.occ.toFixed(1)}%</span>

        <span style={cell}>ADR</span>
        <span style={cell}>{Math.round(before.adr / 1000)}K</span>
        <span style={{ ...cell, color: gapColor(adrDiff) }}>→ {Math.round(after.adr / 1000)}K</span>

        <span style={cell}>REV</span>
        <span style={cell}>{(before.rev / 1_000_000).toFixed(1)}M</span>
        <span style={{ ...cell, color: gapColor(revDiff) }}>→ {(after.rev / 1_000_000).toFixed(1)}M</span>
      </div>
    </div>
  )
}

// ── StatusCard ────────────────────────────────────────────────────────────────

function StatusSection({
  label, otbOcc, otbAdr, otbRev, fcOcc, fcAdr, fcRev,
}: {
  label:  string
  otbOcc: number; otbAdr: number; otbRev: number
  fcOcc:  number; fcAdr:  number; fcRev:  number
}) {
  const gapOcc = fcOcc - otbOcc
  const gapAdr = fcAdr - otbAdr
  const gapRev = fcRev - otbRev
  const cell: React.CSSProperties = { fontSize: 10, lineHeight: 1.65 }
  return (
    <>
      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 1fr 1fr', gap: '1px 0' }}>
        <span />
        <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', textAlign: 'right' }}>OTB</span>
        <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', textAlign: 'right' }}>FCST</span>
        <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', textAlign: 'right' }}>GAP</span>

        <span style={{ ...cell, color: 'var(--color-text-secondary)' }}>OCC</span>
        <span style={{ ...cell, color: 'var(--color-text-tertiary)', textAlign: 'right' }}>{otbOcc.toFixed(1)}%</span>
        <span style={{ ...cell, color: 'var(--color-text-primary)',   textAlign: 'right' }}>{fcOcc.toFixed(1)}%</span>
        <span style={{ ...cell, color: gapColor(gapOcc), fontWeight: 600, textAlign: 'right' }}>{fmtGapPct(gapOcc)}</span>

        <span style={{ ...cell, color: 'var(--color-text-secondary)' }}>ADR</span>
        <span style={{ ...cell, color: 'var(--color-text-tertiary)', textAlign: 'right' }}>{Math.round(otbAdr / 1000)}K</span>
        <span style={{ ...cell, color: 'var(--color-text-primary)',   textAlign: 'right' }}>{Math.round(fcAdr / 1000)}K</span>
        <span style={{ ...cell, color: gapColor(gapAdr), fontWeight: 600, textAlign: 'right' }}>{fmtGap(gapAdr, 'k')}K</span>

        <span style={{ ...cell, color: 'var(--color-text-secondary)' }}>REV</span>
        <span style={{ ...cell, color: 'var(--color-text-tertiary)', textAlign: 'right' }}>{(otbRev / 1_000_000).toFixed(1)}M</span>
        <span style={{ ...cell, color: 'var(--color-text-primary)',   textAlign: 'right' }}>{(fcRev / 1_000_000).toFixed(1)}M</span>
        <span style={{ ...cell, color: gapColor(gapRev), fontWeight: 600, textAlign: 'right' }}>{fmtGap(gapRev, 'm')}M</span>
      </div>
    </>
  )
}

export function StatusCard({
  dayLabel, monthLabel,
  dayOtb, dayFcst, monthOtb, monthFcst,
}: {
  dayLabel:   string
  monthLabel: string
  dayOtb:   { occ: number; adr: number; totalRev: number }
  dayFcst:  { occ: number; adr: number; totalRev: number }
  monthOtb:  { occ: number; adr: number; rev: number }
  monthFcst: { occ: number; adr: number; rev: number }
}) {
  return (
    <div style={{
      background:   'var(--color-bg-elevated)',
      border:       '1px solid var(--color-border-default)',
      borderRadius: 8,
      padding:      '10px 12px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500, marginBottom: 8 }}>
        📊 현황
      </div>
      <StatusSection
        label={`일별 · ${dayLabel}`}
        otbOcc={dayOtb.occ} otbAdr={dayOtb.adr} otbRev={dayOtb.totalRev}
        fcOcc={dayFcst.occ} fcAdr={dayFcst.adr} fcRev={dayFcst.totalRev}
      />
      <div style={{ height: 1, background: 'var(--color-border-default)', margin: '8px 0' }} />
      <StatusSection
        label={monthLabel}
        otbOcc={monthOtb.occ} otbAdr={monthOtb.adr} otbRev={monthOtb.rev}
        fcOcc={monthFcst.occ} fcAdr={monthFcst.adr} fcRev={monthFcst.rev}
      />
    </div>
  )
}

// ── DailyTab ──────────────────────────────────────────────────────────────────

interface DailyTabProps {
  schema:       ForecastSchema
  day:          ForecastDayData
  selectedDate: string
  tempEdits:    EditedValues
  setTempEdits: (next: EditedValues) => void
  hotelId:      string
  lyMap:        LyMap
}

function DailyTab({ schema, day, selectedDate, tempEdits, setTempEdits, hotelId, lyMap }: DailyTabProps) {
  const [activeCell, setActiveCell] = useState<ActiveCell>(null)

  // 편집 가능 셀 순서 — 표 시각 순서와 동일 (schema.nodes orderIndex 기준)
  const editableCellOrder = useMemo(() => {
    const list: Array<{ segCode: string; field: 'rn' | 'adr' }> = []
    const sorted = [...schema.nodes].sort((a, b) => a.orderIndex - b.orderIndex)
    for (const node of sorted) {
      const leaves = node.children.length > 0
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
      const idx  = editableCellOrder.findIndex(c => c.segCode === segCode && c.field === field)
      if (idx === -1) return
      const next = editableCellOrder[shift ? idx - 1 : idx + 1]
      setActiveCell(next ?? null)
    },
    [editableCellOrder],
  )

  const columns = useMemo(
    () => buildColumns(day, selectedDate, tempEdits, setTempEdits, activeCell, handleTab),
    [day, selectedDate, tempEdits, setTempEdits, activeCell, handleTab],
  )

  const tableData = useMemo(
    () => buildMarketTableData(day, tempEdits, selectedDate, lyMap),
    [day, tempEdits, selectedDate, lyMap],
  )

  return (
    <div>
      {/* 표 축소 + 풋터 숨김 + 글자 크기 */}
      <style>{`
        .mtnf tfoot { display: none !important; }
        .mtnf table { font-size: ${TABLE_FONT_SIZE}px !important; }

        /* ── OTB 컬럼 (5,6,7): 흐림 + 음영 ── */
        .mtnf tbody td:nth-child(5),
        .mtnf tbody td:nth-child(6),
        .mtnf tbody td:nth-child(7) {
          color: var(--color-text-tertiary) !important;
          background: rgba(128,128,128,0.06) !important;
        }
        /* ── OTB 호버: overlay-hover 적용 (음영 위에) ── */
        .mtnf tbody tr:hover td:nth-child(5),
        .mtnf tbody tr:hover td:nth-child(6),
        .mtnf tbody tr:hover td:nth-child(7) {
          background: linear-gradient(var(--overlay-hover), var(--overlay-hover)), rgba(128,128,128,0.06) !important;
        }
        .mtnf thead tr:last-child th:nth-child(5),
        .mtnf thead tr:last-child th:nth-child(6),
        .mtnf thead tr:last-child th:nth-child(7) {
          background: rgba(128,128,128,0.06) !important;
        }

        /* ── 그룹 경계 굵은선: OTB 시작(5), GAP 시작(8) ── */
        .mtnf thead tr:first-child th:nth-child(3),
        .mtnf thead tr:first-child th:nth-child(4),
        .mtnf thead tr:last-child th:nth-child(5),
        .mtnf thead tr:last-child th:nth-child(8),
        .mtnf tbody td:nth-child(5),
        .mtnf tbody td:nth-child(8) {
          border-left: 2px solid var(--color-border-default) !important;
        }

        /* ── LY 컬럼 (11,12,13): 흐림 + 파란 음영 ── */
        .mtnf tbody td:nth-child(11),
        .mtnf tbody td:nth-child(12),
        .mtnf tbody td:nth-child(13) {
          color: var(--color-text-tertiary) !important;
          background: rgba(100,149,237,0.04) !important;
        }
        .mtnf tbody tr:hover td:nth-child(11),
        .mtnf tbody tr:hover td:nth-child(12),
        .mtnf tbody tr:hover td:nth-child(13) {
          background: linear-gradient(var(--overlay-hover), var(--overlay-hover)), rgba(100,149,237,0.04) !important;
        }
        .mtnf thead tr:last-child th:nth-child(11),
        .mtnf thead tr:last-child th:nth-child(12),
        .mtnf thead tr:last-child th:nth-child(13) {
          background: rgba(100,149,237,0.04) !important;
        }

        /* ── 그룹 경계 굵은선: LY 시작(11) ── */
        .mtnf thead tr:first-child th:nth-child(5),
        .mtnf thead tr:last-child th:nth-child(11),
        .mtnf tbody td:nth-child(11) {
          border-left: 2px solid var(--color-border-default) !important;
        }

        /* ── 그룹 헤더 행 스타일 ── */
        .mtnf thead tr:first-child th:nth-child(2) {
          border-bottom: 2px solid var(--color-accent-primary) !important;
        }
        .mtnf thead tr:first-child th:nth-child(3) {
          color: var(--color-text-tertiary) !important;
          background: rgba(128,128,128,0.06) !important;
          border-bottom: 2px solid var(--color-border-default) !important;
        }
        .mtnf thead tr:first-child th:nth-child(4) {
          color: var(--color-text-secondary) !important;
          border-bottom: 1px solid var(--color-border-subtle) !important;
        }
        .mtnf thead tr:first-child th:nth-child(5) {
          color: var(--color-text-tertiary) !important;
          background: rgba(100,149,237,0.04) !important;
          border-bottom: 1px solid var(--color-border-subtle) !important;
        }
      `}</style>
      <div className="mtnf" style={{ zoom: TABLE_SCALE }}>
        <MarketTable
          hotelId={hotelId}
          columns={columns}
          data={tableData}
          segWidth={COL.SEG}
        />
        <TotalOccRow
          fc={calcDailyMetrics(day, tempEdits, selectedDate, schema.roomCount)}
          otb={calcOtbMetrics(day, schema.roomCount)}
          roomCount={schema.roomCount}
        />
      </div>
    </div>
  )
}

// ── TabButton ─────────────────────────────────────────────────────────────────

// ── BulkEditModal ─────────────────────────────────────────────────────────────

export function BulkEditModal({
  isOpen, selectedDate,
  onClose,
  schema, data, editedValues, onApply,
  hotelId,
  onSelectDate,
}: BulkEditModalProps) {
  const [tempEdits, setTempEdits] = useState<EditedValues>(new Map())
  const [lyMap,     setLyMap]     = useState<LyMap>({})
  const [lyLoading, setLyLoading] = useState(false)
  const [lyDate,    setLyDate]    = useState<string | null>(null)

  // Initialize tempEdits from existing editedValues for this date
  useEffect(() => {
    if (!isOpen || !selectedDate) return
    const initial: EditedValues = new Map()
    for (const [key, val] of editedValues.entries()) {
      if (key.startsWith(selectedDate + '::')) initial.set(key, val)
    }
    setTempEdits(initial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedDate])  // editedValues excluded: don't reset mid-edit

  // LY fetch — 일자(selectedDate) 변경 시 재fetch
  useEffect(() => {
    if (!isOpen || !selectedDate || !hotelId) return
    let cancelled = false
    setLyLoading(true)
    ;(supabase as any)
      .rpc('get_ly_for_modal', { p_hotel_id: hotelId, p_business_date: selectedDate })
      .then(({ data: rows, error }: any) => {
        if (cancelled) return
        if (!error && rows && rows.length > 0) {
          const map: LyMap = {}
          for (const r of rows) map[r.segmentation] = r
          setLyMap(map)
          setLyDate(rows[0]?.ly_date ?? null)
        } else {
          setLyMap({})
          setLyDate(null)
        }
        setLyLoading(false)
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

  // hooks는 early return 전에
  const day = useMemo(
    () => selectedDate ? data.find(d => d.business_date === selectedDate) ?? null : null,
    [data, selectedDate],
  )

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

  const statusKpi = useMemo(() => {
    if (!day || !schema || data.length === 0) return null
    return {
      dayOtb:    calcOtbMetrics(day, schema.roomCount),
      dayFcst:   calcDailyMetrics(day, new Map() as EditedValues, selectedDate ?? '', schema.roomCount),
      monthOtb:  calcMonthlyOtb(data, schema.roomCount),
      monthFcst: calcMonthlyBefore(data, schema.roomCount),
    }
  }, [day, data, schema, selectedDate])

  const [pendingDate, setPendingDate] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { otbDate } = useDateContext()

  // OTB 이후 + 같은 달 일자만 (정렬)
  const availableDates = useMemo(() => {
    if (!selectedDate || !otbDate) return []
    const prefix = selectedDate.slice(0, 7)  // 'YYYY-MM'
    return data
      .map(d => d.business_date)
      .filter(d => d.startsWith(prefix) && d > otbDate)
      .sort()
  }, [data, selectedDate, otbDate])

  if (!isOpen) return null

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
      if (!ly) continue  // LY 없는 세그 건너뜀
      next.set(makeEditKey(selectedDate, code), { rn: ly.ly_rn, adr: Math.round(ly.ly_adr) })
    }
    setTempEdits(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="일괄수정"
        className="relative w-full bg-ns-bg border border-ns-border rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col"
        style={{ maxWidth: 1480, maxHeight: '90vh' }}
      >
        {/* Header — 날짜 이동 + X */}
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
              {/* 좌측: 표 */}
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <DailyTab
                  schema={schema}
                  day={day}
                  selectedDate={selectedDate}
                  tempEdits={tempEdits}
                  setTempEdits={setTempEdits}
                  hotelId={hotelId}
                  lyMap={lyMap}
                />
              </div>

              {/* 우측: 영향 패널 */}
              <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {statusKpi && (
                  <StatusCard
                    dayLabel={day?.day_label ?? selectedDate ?? ''}
                    monthLabel={`월별 · ${parseInt(selectedDate!.split('-')[1])}월 전체`}
                    dayOtb={statusKpi.dayOtb}
                    dayFcst={statusKpi.dayFcst}
                    monthOtb={statusKpi.monthOtb}
                    monthFcst={statusKpi.monthFcst}
                  />
                )}
                <DailyImpactCard kpi={dailyKpi} isOverCapacity={dailyKpi?.after.isOverCapacity ?? false} />

                <MonthlyImpactCard selectedDate={selectedDate} kpi={monthlyKpi} />

                {/* 버튼 영역 — 패널 맨 아래 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={handleCopyOtbToFc}
                    disabled={!day || day.is_actual_day}
                    title={day?.is_actual_day ? '과거 일자는 복사할 수 없습니다' : '현재 일자의 OTB 값을 FC로 복사'}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      padding: '5px 10px', fontSize: 12, fontWeight: 500,
                      border: '0.5px solid var(--color-border-secondary)',
                      borderRadius: 6,
                      background: 'var(--color-bg-surface)',
                      color: 'var(--color-text-primary)',
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
                      border: '0.5px solid var(--color-border-secondary)',
                      borderRadius: 6,
                      background: 'var(--color-bg-surface)',
                      color: 'var(--color-text-primary)',
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
                        flex: 1, padding: '8px 0',
                        background: 'transparent',
                        border: '1px solid var(--color-border-default)',
                        borderRadius: 6,
                        color: 'var(--color-text-primary)',
                        fontSize: 12, cursor: 'pointer',
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
