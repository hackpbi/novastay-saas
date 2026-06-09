'use client'

import { Fragment, useMemo, useState } from 'react'
import type { ForecastSchema, ForecastDayData, CalendarMap } from '@/lib/forecast/types'
import { buildColumnGroups } from '@/lib/forecast/schema'
import { fmtRn, fmtAdr, fmtRev, fmtOcc } from '@/lib/forecast/format'
import { useTheme } from '@/contexts/ThemeContext'
import { type EditedValues, makeEditKey } from '@/lib/forecast/save'

interface ForecastTableProps {
  schema:                ForecastSchema
  data:                  ForecastDayData[]
  selectedNodeIds:       Set<string>
  calendar?:             CalendarMap
  threshold?:            number
  editedValues:          EditedValues
  onEditChange:          (next: EditedValues) => void
  editMode?:             'inline' | 'bulk'
  onOpenBulkEditModal?:  (date: string) => void
}

const BORDER       = '0.5px solid var(--color-border-default)'
const DASH_BORDER  = '0.5px dashed var(--color-border-default)'
const GROUP_BORDER = '1.5px solid var(--color-border-default)'

const HEADER_BG = 'var(--color-bg-secondary)'
const OTB_BG    = 'var(--color-bg-secondary)'
const BODY_BG   = 'var(--color-bg-primary)'
const TEXT_SEC  = 'var(--color-text-secondary)'
const MUTED     = 'var(--color-text-muted)'
const TERTIARY  = 'var(--color-text-tertiary)'
const WARNING   = 'var(--color-warning, #F5A623)'

const DATE_W         = 150
const TOT_W          = 72
const TOT_OCC_L      = DATE_W
const TOT_RN_L       = TOT_OCC_L + TOT_W
const TOT_ADR_L      = TOT_RN_L  + TOT_W
const TOT_REV_L      = TOT_ADR_L + TOT_W
const HDR_H          = 35
const TOT_REV_W      = 90
const SEG_COL_W      = TOT_W
const TOT_HDR_BORDER = '1px solid var(--color-border-default)'

const tdBase: React.CSSProperties = {
  borderBottom: BORDER,
  borderRight:  BORDER,
  padding:      '5px 10px',
  fontSize:     '12px',
  whiteSpace:   'nowrap',
}

// ── Edit helpers ─────────────────────────────────────────────────────────────

function getEffectiveSegValue(
  daily:        ForecastDayData,
  segCode:      string,
  editedValues: EditedValues,
): { rn: number; adr: number; rev: number } {
  const original = daily.values[segCode]
  if (!original) return { rn: 0, adr: 0, rev: 0 }
  const edited = editedValues.get(makeEditKey(daily.business_date, segCode))
  const rn  = edited?.rn  ?? original.rn
  const adr = edited?.adr ?? original.adr
  return { rn, adr, rev: rn * adr }
}

function calcEffective(
  daily:        ForecastDayData,
  segCodes:     string[],
  editedValues: EditedValues,
): { rn: number; adr: number; rev: number } | null {
  let rn = 0, rev = 0, hasData = false
  for (const code of segCodes) {
    if (!daily.values[code]) continue
    hasData = true
    const v = getEffectiveSegValue(daily, code, editedValues)
    rn += v.rn; rev += v.rev
  }
  if (!hasData) return null
  return { rn, adr: rn > 0 ? Math.round(rev / rn) : 0, rev }
}

function calcOtbFromData(
  daily:    ForecastDayData,
  segCodes: string[],
): { rn: number; adr: number; rev: number } | null {
  let rn = 0, rev = 0, hasData = false
  for (const code of segCodes) {
    const v = daily.values[code]
    if (v) { rn += v.otb_rn; rev += v.otb_rev; hasData = true }
  }
  if (!hasData) return null
  return { rn, adr: rn > 0 ? Math.round(rev / rn) : 0, rev }
}

function subColRightBorder(
  groupIdx:    number,
  totalGroups: number,
  subColIdx:   number,
  subColCount: number,
  isSummary:   boolean,
): string {
  if (isSummary && subColIdx === 0 && subColCount > 1) return DASH_BORDER
  if (subColIdx === subColCount - 1 && groupIdx < totalGroups - 1) return GROUP_BORDER
  return BORDER
}

function canExpand(daily: ForecastDayData): boolean {
  return !daily.is_actual_day
}

function shouldAutoExpand(daily: ForecastDayData, threshold: number): boolean {
  if (daily.is_actual_day) return false
  for (const code in daily.values) {
    const v = daily.values[code]
    if (v.otb_rn >= v.rn + threshold) return true
  }
  return false
}

// ── EditableCell ─────────────────────────────────────────────────────────────

interface EditableCellProps {
  value:          number
  fmt:            (n: number) => string
  onSave:         (v: number) => void
  editable:       boolean
  isModified?:    boolean
  editMode?:      'inline' | 'bulk'
  onBulkClick?:   () => void
}

function EditableCell({ value, fmt, onSave, editable, isModified, editMode = 'inline', onBulkClick }: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [input,   setInput]   = useState('')

  function startEdit(e: React.MouseEvent) {
    if (!editable) return
    e.stopPropagation()
    if (editMode === 'bulk') {
      onBulkClick?.()
      return
    }
    setInput(String(Math.round(value)))
    setEditing(true)
  }

  function commit() {
    const num = parseFloat(input)
    if (!isNaN(num) && num >= 0) onSave(Math.round(num))
    setEditing(false)
  }

  function cancel() { setEditing(false) }

  if (editing) {
    return (
      <>
        <style>{`
          .fct-edit::-webkit-inner-spin-button,
          .fct-edit::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        `}</style>
        <input
          type="number"
          className="fct-edit"
          value={input}
          autoFocus
          onChange={e => setInput(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') cancel()
          }}
          onClick={e => e.stopPropagation()}
          onFocus={e => e.target.select()}
          style={{
            width:              `${Math.max(input.length + 1, 4)}ch`,
            minWidth:           '4ch',
            maxWidth:           '10ch',
            padding:            '1px 4px',
            fontSize:           'inherit',
            textAlign:          'right',
            border:             '1px solid var(--color-accent-primary, #00E5A0)',
            borderRadius:       3,
            background:         'var(--color-bg-primary)',
            color:              'var(--color-text-primary)',
            outline:            'none',
            boxSizing:          'border-box',
            position:           'relative',
            zIndex:             5,
            boxShadow:          '0 2px 6px rgba(0,0,0,0.15)',
            MozAppearance:      'textfield',
            appearance:         'textfield',
          } as React.CSSProperties}
        />
      </>
    )
  }

  return (
    <span
      onClick={startEdit}
      style={{ cursor: editable ? 'text' : 'default', userSelect: 'none' }}
    >
      {fmt(value)}
      {isModified && (
        <span style={{
          marginLeft:    3,
          display:       'inline-block',
          width:         4,
          height:        4,
          borderRadius:  '50%',
          background:    'var(--color-accent-primary, #00E5A0)',
          verticalAlign: 'middle',
        }} />
      )}
    </span>
  )
}

// ── ForecastTable ────────────────────────────────────────────────────────────

export default function ForecastTable({
  schema,
  data,
  selectedNodeIds,
  calendar,
  threshold = 0,
  editedValues,
  onEditChange,
  editMode = 'inline',
  onOpenBulkEditModal,
}: ForecastTableProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const TEXT = isDark ? 'rgba(255,255,255,0.88)' : 'var(--color-text-primary)'
  const thBase: React.CSSProperties = {
    borderBottom: BORDER,
    borderRight:  BORDER,
    padding:      '8px 10px',
    fontSize:     '12px',
    whiteSpace:   'nowrap',
    color:        TEXT,
    background:   HEADER_BG,
  }

  const [manualExpandedDates, setManualExpandedDates] = useState<Set<string>>(new Set())

  function toggleExpand(date: string) {
    setManualExpandedDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  function saveEdit(date: string, segCode: string, field: 'rn' | 'adr', value: number) {
    const next     = new Map(editedValues)
    const key      = makeEditKey(date, segCode)
    next.set(key, { ...next.get(key) ?? {}, [field]: value })
    onEditChange(next)
  }

  const allGroups = useMemo(
    () => buildColumnGroups(schema.nodes, schema.allSegmentationCodes),
    [schema],
  )

  const columnGroups = useMemo(() => {
    return allGroups.filter(g => g.id === 'total' || selectedNodeIds.has(g.id))
  }, [allGroups, selectedNodeIds])

  const totalGroups = columnGroups.length
  const hasSubRow   = columnGroups.some(g => g.parentRowSpan === 1)
  const rowSpanDate = hasSubRow ? 3 : 2
  const metricTop   = hasSubRow ? HDR_H * 2 : HDR_H

  const TOT_LEFTS = [TOT_OCC_L, TOT_RN_L, TOT_ADR_L, TOT_REV_L] as const

  const monthlyTotals = useMemo(() => {
    let totRn = 0, totRev = 0
    for (const day of data) {
      for (const code of schema.allSegmentationCodes) {
        if (!day.values[code]) continue
        const v = getEffectiveSegValue(day, code, editedValues)
        totRn += v.rn; totRev += v.rev
      }
    }
    const totAdr   = totRn > 0 ? Math.round(totRev / totRn) : 0
    const bySubCol = new Map<string, { rn: number; adr: number; rev: number }>()
    for (const group of allGroups) {
      for (const col of group.subCols) {
        let rn = 0, rev = 0
        for (const day of data) {
          for (const code of col.segCodes) {
            if (!day.values[code]) continue
            const v = getEffectiveSegValue(day, code, editedValues)
            rn += v.rn; rev += v.rev
          }
        }
        bySubCol.set(col.id, { rn, adr: rn > 0 ? Math.round(rev / rn) : 0, rev })
      }
    }
    return { totRn, totAdr, totRev, bySubCol }
  }, [data, schema, allGroups, editedValues])

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 190px)', minHeight: 200 }}>
      <table
        style={{
          borderCollapse: 'separate',
          borderSpacing:  0,
          borderLeft:     BORDER,
          borderTop:      BORDER,
          tableLayout:    'fixed',
        }}
      >
        <colgroup>
          <col style={{ width: DATE_W }} />
          <col style={{ width: TOT_W }} />
          <col style={{ width: TOT_W }} />
          <col style={{ width: TOT_W }} />
          <col style={{ width: TOT_REV_W }} />
          {columnGroups
            .filter(g => g.id !== 'total')
            .flatMap(g => g.subCols)
            .map((col, i) => (
              <Fragment key={`seg-col-${col.id}-${i}`}>
                <col style={{ width: SEG_COL_W }} />
                <col style={{ width: SEG_COL_W }} />
                <col style={{ width: SEG_COL_W }} />
              </Fragment>
            ))
          }
        </colgroup>

        <thead>
          {/* Row 1: parent group labels */}
          <tr>
            <th
              rowSpan={rowSpanDate}
              style={{
                ...thBase,
                textAlign:   'left',
                position:    'sticky',
                left:        0,
                top:         0,
                zIndex:      6,
                width:       DATE_W,
                minWidth:    DATE_W,
                fontWeight:  600,
                borderRight: GROUP_BORDER,
              }}
            >
              날짜
            </th>

            {columnGroups.map((group, gi) => {
              const isTotal = group.id === 'total'
              const isLast  = gi === totalGroups - 1
              return (
                <th
                  key={group.id}
                  rowSpan={group.parentRowSpan}
                  colSpan={group.parentColSpan}
                  style={{
                    ...thBase,
                    textAlign:   'center',
                    fontWeight:  group.parentIsBold ? 700 : 600,
                    borderRight: isLast ? BORDER : GROUP_BORDER,
                    background:  HEADER_BG,
                    position:    'sticky',
                    top:         0,
                    zIndex:      isTotal ? 5 : 4,
                    ...(isTotal ? { left: TOT_OCC_L, borderBottom: TOT_HDR_BORDER } : {}),
                  }}
                >
                  {group.parentLabel}
                  {group.parentIsBold ? ' ★' : ''}
                </th>
              )
            })}
          </tr>

          {/* Row 2: sub-column labels */}
          {hasSubRow && (
            <tr>
              {columnGroups.map((group, gi) => {
                if (group.parentRowSpan !== 1) return null
                return (
                  <Fragment key={group.id}>
                    {group.subCols.map((col, ci) => {
                      const rightBorder = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                      return (
                        <th
                          key={col.id}
                          colSpan={3}
                          style={{
                            ...thBase,
                            textAlign:   'center',
                            fontWeight:  col.isSummary ? 500 : 400,
                            color:       col.isSummary ? TEXT : TEXT_SEC,
                            borderRight: rightBorder,
                            position:    'sticky',
                            top:         HDR_H,
                            zIndex:      4,
                          }}
                        >
                          {col.label}
                        </th>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tr>
          )}

          {/* Row 3: metric labels */}
          <tr>
            {columnGroups.map((group, gi) => {
              const isTotal = group.id === 'total'
              const isLast  = gi === totalGroups - 1

              if (isTotal) {
                const metrics = ['OCC%', 'RN', 'ADR', 'REV'] as const
                return (
                  <Fragment key={group.id}>
                    {metrics.map((metric, mi) => (
                      <th
                        key={metric}
                        style={{
                          ...thBase,
                          background:   HEADER_BG,
                          textAlign:    'center',
                          fontWeight:   400,
                          color:        TEXT_SEC,
                          width:        TOT_W,
                          minWidth:     TOT_W,
                          borderBottom: TOT_HDR_BORDER,
                          borderRight:  mi === metrics.length - 1
                            ? (isLast ? TOT_HDR_BORDER : GROUP_BORDER)
                            : TOT_HDR_BORDER,
                          position:    'sticky',
                          top:         metricTop,
                          left:        TOT_LEFTS[mi],
                          zIndex:      5,
                        }}
                      >
                        {metric}
                      </th>
                    ))}
                  </Fragment>
                )
              }

              return group.subCols.map((col, ci) => {
                const rightBorder = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                return (
                  <Fragment key={col.id}>
                    {(['RN', 'ADR', 'REV'] as const).map((metric, mi) => (
                      <th
                        key={metric}
                        style={{
                          ...thBase,
                          background:  HEADER_BG,
                          textAlign:   'center',
                          fontWeight:  400,
                          color:       TEXT_SEC,
                          borderRight: mi === 2 ? rightBorder : BORDER,
                          position:    'sticky',
                          top:         metricTop,
                          zIndex:      4,
                        }}
                      >
                        {metric}
                      </th>
                    ))}
                  </Fragment>
                )
              })
            })}
          </tr>
        </thead>

        <tbody>
          {data.map((row) => {
            const rowBg      = BODY_BG
            const textCol    = row.is_actual_day ? TEXT_SEC : TEXT
            const cal        = calendar?.get(row.business_date)
            const _evt       = cal?.event?.trim()
            const hasEvent   = !!_evt && _evt.toLowerCase() !== 'null'
            const isWeekend  = !hasEvent && (cal?.day === '금' || cal?.day === '토')
            const isFriSat   = cal?.day === '금' || cal?.day === '토'
            const expandable = canExpand(row)
            const isExpanded = expandable && (manualExpandedDates.has(row.business_date) || shouldAutoExpand(row, threshold))
            const fcBtm      = isExpanded ? DASH_BORDER : BORDER

            return (
              <Fragment key={row.business_date}>
                {/* ── FC 행 ── */}
                <tr
                  style={{
                    opacity:    row.is_actual_day ? 0.55 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {/* 날짜 (sticky) */}
                  <td
                    style={{
                      ...tdBase,
                      borderBottom: fcBtm,
                      background:   rowBg,
                      position:     'sticky',
                      left:         0,
                      zIndex:       3,
                      fontWeight:   500,
                      color:        TEXT,
                      borderRight:  GROUP_BORDER,
                      width:        DATE_W,
                      minWidth:     DATE_W,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span
                        onClick={expandable ? () => toggleExpand(row.business_date) : undefined}
                        style={{
                          fontSize:   9,
                          color:      MUTED,
                          flexShrink: 0,
                          visibility: expandable ? 'visible' : 'hidden',
                          cursor:     expandable ? 'pointer' : 'default',
                          padding:    '2px 3px',
                        }}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      <span style={isFriSat ? { color: '#3B82F6', fontWeight: 600 } : undefined}>
                        {row.day_label}
                      </span>
                      {hasEvent && (
                        <span
                          title={_evt}
                          style={{
                            marginLeft:     'auto',
                            display:        'inline-flex',
                            alignItems:     'center',
                            justifyContent: 'center',
                            width:          22,
                            height:         18,
                            borderRadius:   '50%',
                            background:     'var(--color-text-danger, #ef4444)',
                            color:          '#fff',
                            fontSize:       9,
                            fontWeight:     600,
                            flexShrink:     0,
                            cursor:         'help',
                          }}
                        >
                          {_evt!.slice(0, 2)}
                        </span>
                      )}
                      {!hasEvent && isWeekend && (
                        <span style={{
                          marginLeft:   'auto',
                          display:      'inline-block',
                          width:        6,
                          height:       6,
                          borderRadius: '50%',
                          background:   '#F59E0B',
                          flexShrink:   0,
                        }} />
                      )}
                    </div>
                  </td>

                  {/* 데이터 셀 */}
                  {columnGroups.map((group, gi) => {
                    const isTotal = group.id === 'total'
                    const isLast  = gi === totalGroups - 1

                    if (isTotal) {
                      const sv          = calcEffective(row, schema.allSegmentationCodes, editedValues)
                      const rightBorder = isLast ? BORDER : GROUP_BORDER

                      if (sv === null) {
                        return (
                          <Fragment key={group.id}>
                            {([0, 1, 2, 3] as const).map(i => (
                              <td key={i} style={{ ...tdBase, borderBottom: fcBtm, background: HEADER_BG, textAlign: 'right', color: MUTED, fontWeight: 600, width: TOT_W, minWidth: TOT_W, borderRight: i === 3 ? rightBorder : BORDER, position: 'sticky', left: TOT_LEFTS[i], zIndex: 2 }}>-</td>
                            ))}
                          </Fragment>
                        )
                      }

                      return (
                        <Fragment key={group.id}>
                          <td style={{ ...tdBase, borderBottom: fcBtm, background: HEADER_BG, textAlign: 'right', fontWeight: 600, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, position: 'sticky', left: TOT_OCC_L, zIndex: 2 }}>
                            <span style={{ color: sv.rn === 0 ? TERTIARY : textCol }}>{fmtOcc(sv.rn, schema.roomCount)}</span>
                            {row.has_capped && (
                              <span title="호텔 총 객실 수에 도달했습니다" style={{ marginLeft: 4, color: WARNING, fontSize: '10px', cursor: 'default' }}>⚠</span>
                            )}
                          </td>
                          <td style={{ ...tdBase, borderBottom: fcBtm, background: HEADER_BG, textAlign: 'right', color: sv.rn === 0 ? TERTIARY : textCol, fontWeight: 600, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, position: 'sticky', left: TOT_RN_L, zIndex: 2 }}>
                            {fmtRn(sv.rn)}
                          </td>
                          <td style={{ ...tdBase, borderBottom: fcBtm, background: HEADER_BG, textAlign: 'right', color: sv.adr === 0 ? TERTIARY : textCol, fontWeight: 600, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, position: 'sticky', left: TOT_ADR_L, zIndex: 2 }}>
                            {fmtAdr(sv.adr)}
                          </td>
                          <td style={{ ...tdBase, borderBottom: fcBtm, background: HEADER_BG, textAlign: 'right', color: sv.rev === 0 ? TERTIARY : textCol, fontWeight: 600, width: TOT_W, minWidth: TOT_W, borderRight: rightBorder, position: 'sticky', left: TOT_REV_L, zIndex: 2 }}>
                            {fmtRev(sv.rev)}
                          </td>
                        </Fragment>
                      )
                    }

                    return group.subCols.map((col, ci) => {
                      const rightBorder  = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                      const cellBg       = rowBg
                      const fw           = col.isSummary ? 500 : 400
                      const sv           = calcEffective(row, col.segCodes, editedValues)

                      const isLeaf       = !col.isSummary && col.segCodes.length === 1
                      const editable     = isLeaf && !row.is_actual_day
                      const segCode      = isLeaf ? col.segCodes[0] : ''
                      const editedEntry  = isLeaf ? editedValues.get(makeEditKey(row.business_date, segCode)) : undefined
                      const isRnEdited   = editedEntry?.rn  !== undefined
                      const isAdrEdited  = editedEntry?.adr !== undefined
                      const isOtbOver    = (() => {
                        if (!isLeaf || !isExpanded || row.is_actual_day || !sv) return false
                        const otbV = row.values[segCode]
                        if (!otbV) return false
                        return otbV.otb_rn >= sv.rn + threshold
                      })()

                      if (sv === null) {
                        return (
                          <Fragment key={col.id}>
                            <td style={{ ...tdBase, borderBottom: fcBtm, background: cellBg, textAlign: 'right', color: MUTED, fontWeight: fw, borderRight: BORDER }}>-</td>
                            <td style={{ ...tdBase, borderBottom: fcBtm, background: cellBg, textAlign: 'right', color: MUTED, fontWeight: fw, borderRight: BORDER }}>-</td>
                            <td style={{ ...tdBase, borderBottom: fcBtm, background: cellBg, textAlign: 'right', color: MUTED, fontWeight: fw, borderRight: rightBorder }}>-</td>
                          </Fragment>
                        )
                      }

                      return (
                        <Fragment key={col.id}>
                          <td style={{
                            ...tdBase,
                            borderBottom: fcBtm,
                            background:   isRnEdited ? 'rgba(0,184,131,0.12)' : isOtbOver ? 'rgba(239,68,68,0.10)' : cellBg,
                            textAlign:    'right',
                            color:        sv.rn === 0 ? TERTIARY : isOtbOver ? 'var(--color-warning, #F5A623)' : textCol,
                            fontWeight:   isRnEdited ? 600 : fw,
                            borderRight:  BORDER,
                          }}>
                            {editable ? (
                              <EditableCell
                                value={sv.rn}
                                fmt={fmtRn}
                                editable={true}
                                isModified={isRnEdited}
                                editMode={editMode}
                                onBulkClick={() => onOpenBulkEditModal?.(row.business_date)}
                                onSave={v => saveEdit(row.business_date, segCode, 'rn', v)}
                              />
                            ) : fmtRn(sv.rn)}
                          </td>
                          <td style={{
                            ...tdBase,
                            borderBottom: fcBtm,
                            background:   isAdrEdited ? 'rgba(0,184,131,0.12)' : cellBg,
                            textAlign:    'right',
                            color:        sv.adr === 0 ? TERTIARY : textCol,
                            fontWeight:   isAdrEdited ? 600 : fw,
                            borderRight:  BORDER,
                          }}>
                            {editable ? (
                              <EditableCell
                                value={sv.adr}
                                fmt={fmtAdr}
                                editable={true}
                                isModified={isAdrEdited}
                                editMode={editMode}
                                onBulkClick={() => onOpenBulkEditModal?.(row.business_date)}
                                onSave={v => saveEdit(row.business_date, segCode, 'adr', v)}
                              />
                            ) : fmtAdr(sv.adr)}
                          </td>
                          <td style={{
                            ...tdBase,
                            borderBottom: fcBtm,
                            background:   cellBg,
                            textAlign:    'right',
                            color:        sv.rev === 0 ? TERTIARY : textCol,
                            fontWeight:   fw,
                            borderRight:  rightBorder,
                          }}>
                            {fmtRev(sv.rev)}
                          </td>
                        </Fragment>
                      )
                    })
                  })}
                </tr>

                {/* ── OTB 행 (펼침 시) ── */}
                {isExpanded && (
                  <tr>
                    <td
                      style={{
                        ...tdBase,
                        fontSize:     '11px',
                        background:   OTB_BG,
                        position:     'sticky',
                        left:         0,
                        zIndex:       3,
                        color:        TEXT_SEC,
                        borderRight:  GROUP_BORDER,
                        borderBottom: GROUP_BORDER,
                        width:        DATE_W,
                        minWidth:     DATE_W,
                      }}
                    >
                      <div style={{ paddingLeft: 14 }}>└ OTB</div>
                    </td>

                    {columnGroups.map((group, gi) => {
                      const isTotal = group.id === 'total'
                      const isLast  = gi === totalGroups - 1

                      if (isTotal) {
                        const sv          = calcOtbFromData(row, schema.allSegmentationCodes)
                        const rightBorder = isLast ? BORDER : GROUP_BORDER

                        if (sv === null) {
                          return (
                            <Fragment key={group.id}>
                              {([0, 1, 2, 3] as const).map(i => (
                                <td key={i} style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: MUTED, fontWeight: 500, width: TOT_W, minWidth: TOT_W, borderRight: i === 3 ? rightBorder : BORDER, borderBottom: GROUP_BORDER, position: 'sticky', left: TOT_LEFTS[i], zIndex: 2 }}>-</td>
                              ))}
                            </Fragment>
                          )
                        }

                        return (
                          <Fragment key={group.id}>
                            <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', fontWeight: 500, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, borderBottom: GROUP_BORDER, position: 'sticky', left: TOT_OCC_L, zIndex: 2 }}>
                              <span style={{ color: sv.rn === 0 ? TERTIARY : TEXT_SEC }}>{fmtOcc(sv.rn, schema.roomCount)}</span>
                            </td>
                            <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: sv.rn === 0 ? TERTIARY : TEXT_SEC, fontWeight: 500, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, borderBottom: GROUP_BORDER, position: 'sticky', left: TOT_RN_L, zIndex: 2 }}>
                              {fmtRn(sv.rn)}
                            </td>
                            <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: sv.adr === 0 ? TERTIARY : TEXT_SEC, fontWeight: 500, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, borderBottom: GROUP_BORDER, position: 'sticky', left: TOT_ADR_L, zIndex: 2 }}>
                              {fmtAdr(sv.adr)}
                            </td>
                            <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: sv.rev === 0 ? TERTIARY : TEXT_SEC, fontWeight: 500, width: TOT_W, minWidth: TOT_W, borderRight: rightBorder, borderBottom: GROUP_BORDER, position: 'sticky', left: TOT_REV_L, zIndex: 2 }}>
                              {fmtRev(sv.rev)}
                            </td>
                          </Fragment>
                        )
                      }

                      return group.subCols.map((col, ci) => {
                        const rightBorder = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                        const sv          = calcOtbFromData(row, col.segCodes)

                        if (sv === null) {
                          return (
                            <Fragment key={col.id}>
                              <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: MUTED, fontWeight: 400, borderRight: BORDER, borderBottom: GROUP_BORDER }}>-</td>
                              <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: MUTED, fontWeight: 400, borderRight: BORDER, borderBottom: GROUP_BORDER }}>-</td>
                              <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: MUTED, fontWeight: 400, borderRight: rightBorder, borderBottom: GROUP_BORDER }}>-</td>
                            </Fragment>
                          )
                        }

                        return (
                          <Fragment key={col.id}>
                            <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: sv.rn === 0 ? TERTIARY : TEXT_SEC, fontWeight: 400, borderRight: BORDER, borderBottom: GROUP_BORDER }}>
                              {fmtRn(sv.rn)}
                            </td>
                            <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: sv.adr === 0 ? TERTIARY : TEXT_SEC, fontWeight: 400, borderRight: BORDER, borderBottom: GROUP_BORDER }}>
                              {fmtAdr(sv.adr)}
                            </td>
                            <td style={{ ...tdBase, fontSize: '11px', background: OTB_BG, textAlign: 'right', color: sv.rev === 0 ? TERTIARY : TEXT_SEC, fontWeight: 400, borderRight: rightBorder, borderBottom: GROUP_BORDER }}>
                              {fmtRev(sv.rev)}
                            </td>
                          </Fragment>
                        )
                      })
                    })}
                  </tr>
                )}
              </Fragment>
            )
          })}

          {/* ── 월 합계 행 ── */}
          {data.length > 0 && (() => {
            const { totRn, totAdr, totRev, bySubCol } = monthlyTotals
            const SUM_BG  = HEADER_BG
            const SUM_TOP = GROUP_BORDER
            return (
              <tr key="monthly-total">
                <td style={{ ...tdBase, background: SUM_BG, position: 'sticky', left: 0, zIndex: 3, fontWeight: 700, color: TEXT, borderRight: GROUP_BORDER, borderTop: SUM_TOP, width: DATE_W, minWidth: DATE_W }}>
                  월 합계
                </td>
                {columnGroups.map((group, gi) => {
                  const isTotal = group.id === 'total'
                  const isLast  = gi === totalGroups - 1
                  if (isTotal) {
                    const rightBorder = isLast ? BORDER : GROUP_BORDER
                    return (
                      <Fragment key={group.id}>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', fontWeight: 700, color: totRn === 0 ? TERTIARY : TEXT, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, borderTop: SUM_TOP, position: 'sticky', left: TOT_OCC_L, zIndex: 2 }}>
                          {fmtOcc(totRn, schema.roomCount * data.length)}
                        </td>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', fontWeight: 700, color: totRn === 0 ? TERTIARY : TEXT, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, borderTop: SUM_TOP, position: 'sticky', left: TOT_RN_L, zIndex: 2 }}>
                          {fmtRn(totRn)}
                        </td>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', fontWeight: 700, color: totAdr === 0 ? TERTIARY : TEXT, width: TOT_W, minWidth: TOT_W, borderRight: BORDER, borderTop: SUM_TOP, position: 'sticky', left: TOT_ADR_L, zIndex: 2 }}>
                          {fmtAdr(totAdr)}
                        </td>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', fontWeight: 700, color: totRev === 0 ? TERTIARY : TEXT, width: TOT_W, minWidth: TOT_W, borderRight: rightBorder, borderTop: SUM_TOP, position: 'sticky', left: TOT_REV_L, zIndex: 2 }}>
                          {fmtRev(totRev)}
                        </td>
                      </Fragment>
                    )
                  }
                  return group.subCols.map((col, ci) => {
                    const rightBorder = subColRightBorder(gi, totalGroups, ci, group.subCols.length, col.isSummary)
                    const sv = bySubCol.get(col.id)
                    if (!sv) {
                      return (
                        <Fragment key={col.id}>
                          <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', color: MUTED, fontWeight: 700, borderRight: BORDER, borderTop: SUM_TOP }}>-</td>
                          <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', color: MUTED, fontWeight: 700, borderRight: BORDER, borderTop: SUM_TOP }}>-</td>
                          <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', color: MUTED, fontWeight: 700, borderRight: rightBorder, borderTop: SUM_TOP }}>-</td>
                        </Fragment>
                      )
                    }
                    return (
                      <Fragment key={col.id}>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', color: sv.rn === 0 ? TERTIARY : TEXT, fontWeight: 700, borderRight: BORDER, borderTop: SUM_TOP }}>
                          {fmtRn(sv.rn)}
                        </td>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', color: sv.adr === 0 ? TERTIARY : TEXT, fontWeight: 700, borderRight: BORDER, borderTop: SUM_TOP }}>
                          {fmtAdr(sv.adr)}
                        </td>
                        <td style={{ ...tdBase, background: SUM_BG, textAlign: 'right', color: sv.rev === 0 ? TERTIARY : TEXT, fontWeight: 700, borderRight: rightBorder, borderTop: SUM_TOP }}>
                          {fmtRev(sv.rev)}
                        </td>
                      </Fragment>
                    )
                  })
                })}
              </tr>
            )
          })()}
        </tbody>
      </table>

      <div className="text-right text-xs px-3 py-1.5" style={{ color: MUTED, borderTop: BORDER }}>
        ADR 천원 · REV 백만원
      </div>
    </div>
  )
}
