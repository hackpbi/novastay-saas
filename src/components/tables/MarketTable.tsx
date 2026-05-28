'use client'

import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/contexts/ThemeContext'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MarketTableColumn = {
  key:     string
  label:   string
  type?:   'number' | 'currency' | 'adr' | 'percent' | 'string'
  width?:  string
  group?:  string
  render?: (value: any, row: MarketTableRow) => React.ReactNode
}

export type MarketTableRow  = Record<string, any>
export type MarketTableData = Record<string, Record<string, any>>

export type MarketTableProps = {
  hotelId:           string
  columns:           MarketTableColumn[]
  data:              MarketTableData
  groupHeader?:      string
  loading?:          boolean
  className?:        string
  year?:             number
  month?:            number
  stickyFirstGroup?: boolean
  opaqueBg?:         boolean
  maxHeight?:        string
  segWidth?:         number
}

type Schema = {
  id:               string
  hotel_id:         string
  name:             string
  level:            'main' | 'mid' | 'sub'
  parent_id:        string | null
  segmentation:     string[] | null
  order_index:      number
  color:            string | null
  font_dark_color:  string | null
  font_light_color: string | null
  is_bold:          boolean
  is_active:        boolean
}

type SchemaGroup = { parent: Schema; children: Schema[] }
type SchemaTree  = { groups: SchemaGroup[]; mids: Schema[] }

// ── Tree ──────────────────────────────────────────────────────────────────────

function buildTree(schemas: Schema[]): SchemaTree {
  const mains = schemas.filter(s => s.level === 'main').sort((a, b) => a.order_index - b.order_index)
  const subs  = schemas.filter(s => s.level === 'sub')
  const mids  = schemas.filter(s => s.level === 'mid').sort((a, b) => a.order_index - b.order_index)
  return {
    groups: mains.map(main => ({
      parent:   main,
      children: subs.filter(s => s.parent_id === main.id).sort((a, b) => a.order_index - b.order_index),
    })),
    mids,
  }
}

// ── Aggregates ────────────────────────────────────────────────────────────────

function aggregateSub(sub: Schema, data: MarketTableData, key: string): number {
  return (sub.segmentation ?? []).reduce((s, seg) => s + (data[seg]?.[key] ?? 0), 0)
}
function aggregateMain(group: SchemaGroup, data: MarketTableData, key: string): number {
  return group.children.reduce((s, child) => s + aggregateSub(child, data, key), 0)
}
function aggregateMid(mid: Schema, data: MarketTableData, key: string): number {
  return (mid.segmentation ?? []).reduce((s, seg) => s + (data[seg]?.[key] ?? 0), 0)
}
function aggregateTotal(tree: SchemaTree, data: MarketTableData, key: string): number {
  return tree.groups.reduce((s, g) => s + aggregateMain(g, data, key), 0)
       + tree.mids.reduce((s, m) => s + aggregateMid(m, data, key), 0)
}

// ── Value helpers ─────────────────────────────────────────────────────────────

function formatValue(value: number, type?: string): string {
  if (!value) return '-'
  switch (type) {
    case 'adr':      return `${Math.round(value / 1_000).toLocaleString('ko-KR')}`
    case 'currency': return `${(value / 1_000_000).toFixed(1)}`
    case 'percent':  return `${value.toFixed(1)}%`
    default:         return value.toLocaleString('ko-KR')
  }
}

function calcAdr(rev: number, rn: number): number {
  return rn > 0 ? Math.round(rev / rn) : 0
}

function computeCell(col: MarketTableColumn, rawVal: number, getAgg: (key: string) => number): number {
  if (col.key === 'adr' || col.key === 'rate' || col.key.endsWith('_adr')) {
    const prefix = col.key.endsWith('_adr') ? col.key.slice(0, -4) : ''
    return calcAdr(getAgg(prefix ? `${prefix}_rev` : 'rev'), getAgg(prefix ? `${prefix}_rn` : 'rn'))
  }
  return rawVal
}

// group 경계: 굵은선 / 그룹 내부: 얇은선 / 첫 컬럼: Segmentation과의 경계선
function colBorderLeft(columns: MarketTableColumn[], i: number): string {
  if (i === 0) return '1px solid var(--color-border-default)'
  return (columns[i].group ?? '') !== (columns[i - 1].group ?? '')
    ? '1px solid var(--color-border-default)'
    : '1px solid var(--color-border-subtle)'
}

// ── Group days helper (Occ/RevPAR 그룹별 가용 일수) ──────────────────────────

function getDaysForGroup(groupName: string, year: number): number {
  if (groupName === '합계') {
    return Array.from({ length: 12 }, (_, i) => new Date(year, i + 1, 0).getDate())
      .reduce((s, d) => s + d, 0)
  }
  const match = groupName.match(/^(\d+)월$/)
  if (match) return new Date(year, Number(match[1]), 0).getDate()
  return 0
}

// ── Column width helper ───────────────────────────────────────────────────────

function getColWidth(col: MarketTableColumn): string {
  if (col.width) return col.width
  switch (col.type) {
    case 'number':   return '72px'
    case 'adr':      return '68px'
    case 'currency': return '80px'
    case 'percent':  return '68px'
    default:         return '80px'
  }
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden animate-pulse"
      style={{ border: '1px solid var(--color-border-default)' }}>
      {[1,2,3,4,5,6,7,8].map(i => (
        <div key={i} className="h-10"
          style={{ background: i % 2 === 0 ? 'var(--color-bg-secondary)' : 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-subtle)' }} />
      ))}
    </div>
  )
}

// ── SegCell ───────────────────────────────────────────────────────────────────

function SegCell({
  label, codes, codeColor, indent, allExpanded, onToggle,
}: {
  label:       string
  codes:       string[]
  codeColor:   string
  indent?:     boolean
  allExpanded: boolean
  onToggle:    () => void
}) {
  return (
    <div className="flex items-center gap-1.5" style={{ paddingLeft: indent ? 16 : 0 }}>
      {indent && <span className="flex-shrink-0 text-brand-dimmed" style={{ fontSize: 11 }}>└</span>}
      <span className="whitespace-nowrap">{label}</span>
      {codes.length > 0 && (
        <>
          <div className="flex items-center gap-1 overflow-hidden"
            style={{ maxWidth: allExpanded ? '600px' : '0px', transition: 'max-width 0.28s cubic-bezier(0.4,0,0.2,1)' }}>
            {codes.map(seg => (
              <span key={seg} className="text-[11px] whitespace-nowrap px-1.5 py-0.5 rounded"
                style={{ background: 'var(--overlay-sm)', color: codeColor }}>
                {seg}
              </span>
            ))}
          </div>
          <button onClick={e => { e.stopPropagation(); onToggle() }}
            className="flex-shrink-0 text-xs leading-none hover:opacity-60 transition-opacity"
            style={{ color: 'var(--color-accent-primary)' }}>
            {allExpanded ? '−' : '+'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MarketTable({
  hotelId, columns, data, groupHeader, loading, className, year, month, stickyFirstGroup, opaqueBg, maxHeight,
  segWidth,
}: MarketTableProps) {

  // queryKey에 'full' 추가 — BudgetPage의 minimal 쿼리 캐시와 충돌 방지
  const { data: schemas = [], isLoading: schemaLoading } = useQuery<Schema[]>({
    queryKey: ['c05_market_table_schema', hotelId, 'full'],
    queryFn:  async () => {
      const { data: rows, error } = await (supabase as any)
        .from('c05_market_table_schema')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
        .order('order_index')
      if (error) throw error
      return rows as Schema[]
    },
    enabled:   !!hotelId,
    staleTime: 10 * 60 * 1000,
  })

  const { data: hotelDetail } = useQuery<{ room_count: number }>({
    queryKey: ['m03_hotel_details', hotelId],
    queryFn:  async () => {
      const { data: row, error } = await (supabase as any)
        .from('m03_hotel_details')
        .select('room_count')
        .eq('hotel_id', hotelId)
        .single()
      if (error) throw error
      return row
    },
    enabled:   !!hotelId,
    staleTime: 10 * 60 * 1000,
  })

  const roomCount = hotelDetail?.room_count ?? 0
  const tree      = useMemo(() => buildTree(schemas), [schemas])

  const SEG_WIDTH  = segWidth ?? 280
  const tableWidth = useMemo(() => {
    const colsWidth = columns.reduce((sum, col) => sum + parseInt(getColWidth(col)), 0)
    return SEG_WIDTH + colsWidth
  }, [columns])

  const [allExpanded,  setAllExpanded]  = useState(false)
  const toggleAll = () => setAllExpanded(prev => !prev)
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const hoverBg = (id: string, bg: string) =>
    hoveredRowId === id
      ? `linear-gradient(var(--overlay-hover), var(--overlay-hover)), ${bg}`
      : bg

  const { theme } = useTheme()
  const isDark    = theme === 'dark'
  const fontColor = (item: Schema, fallback: string) =>
    isDark ? (item.font_dark_color ?? fallback) : (item.font_light_color ?? fallback)

  const daysInMonth    = year && month ? new Date(year, month, 0).getDate() : 0
  const availableRooms = roomCount * daysInMonth

  const totalRn  = aggregateTotal(tree, data, 'rn')  || aggregateTotal(tree, data, 'rooms_sold')
  const totalRev = aggregateTotal(tree, data, 'rev') || aggregateTotal(tree, data, 'room_revenue')
  const occ      = availableRooms > 0 ? totalRn / availableRooms : 0
  const revpar   = Math.round(occ * (totalRn > 0 ? totalRev / totalRn : 0))

  if (schemaLoading || loading) return <LoadingSkeleton />

  const accentColor = 'var(--color-accent-primary)'
  const colCount    = columns.length

  // group 병합 헤더 계산 (Budget 월별용)
  const hasGroups = columns.some(col => !!col.group)
  const groupSpans: { group: string; span: number }[] = []
  if (hasGroups) {
    columns.forEach(col => {
      const g    = col.group ?? ''
      const last = groupSpans[groupSpans.length - 1]
      if (last && last.group === g) last.span++
      else groupSpans.push({ group: g, span: 1 })
    })
  }

  // color + 불투명도 헬퍼: opaqueBg=true면 순색, 아니면 13% 투명
  const rowBg = (color: string | null, fallback: string) =>
    color ? (opaqueBg ? color : `${color}22`) : fallback

  // ── Sticky first-group helpers ────────────────────────────────────────────────
  const stickyGroupCols = stickyFirstGroup && hasGroups ? (groupSpans[0]?.span ?? 0) : 0

  // 각 컬럼의 left 위치 (SEG_WIDTH 이후)
  const colLeft: number[] = []
  {
    let acc = SEG_WIDTH
    columns.forEach((col, i) => { colLeft[i] = acc; acc += parseInt(getColWidth(col)) })
  }

  const sColStyle = (i: number, bg: string): React.CSSProperties =>
    i < stickyGroupCols
      ? { position: 'sticky', left: colLeft[i], zIndex: 2, background: bg,
          ...(i === stickyGroupCols - 1 ? { boxShadow: '2px 0 0 0 var(--color-border-default)' } : {}) }
      : { position: 'relative', zIndex: 0 }

  const sColHdrStyle = (i: number): React.CSSProperties =>
    i < stickyGroupCols
      ? { position: 'sticky', left: colLeft[i], zIndex: 2, background: 'var(--color-bg-tertiary)',
          ...(i === stickyGroupCols - 1 ? { boxShadow: '2px 0 0 0 var(--color-border-default)' } : {}) }
      : {}

  const sSegStyle = (bg: string): React.CSSProperties =>
    stickyFirstGroup
      ? { position: 'sticky', left: 0, zIndex: 2, background: bg, boxShadow: '2px 0 0 0 var(--color-border-default)' }
      : { position: 'relative', zIndex: 0 }

  const sSegHdrStyle: React.CSSProperties = stickyFirstGroup
    ? { position: 'sticky', left: 0, zIndex: 3, background: 'var(--color-bg-tertiary)', boxShadow: '2px 0 0 0 var(--color-border-default)' }
    : {}

  const FOOTER_BG = 'var(--color-bg-tertiary)'

  // 헤더 공통 스타일
  const headerRowStyle = {
    background:   'var(--color-bg-tertiary)',
    borderBottom: '1px solid var(--color-border-default)',
  }

  return (
    <div className={`overflow-auto rounded-xl ${className ?? ''}`}
      style={{ border: '1px solid var(--color-border-default)', ...(maxHeight ? { maxHeight } : {}) }}>
      <table className="" style={{ fontSize: 12, tableLayout: 'fixed', fontVariantNumeric: 'tabular-nums', width: `${tableWidth}px`, borderCollapse: 'separate', borderSpacing: 0 }}>

        {/* ── colgroup: 컬럼 너비 고정 ── */}
        <colgroup>
          <col style={{ width: SEG_WIDTH }} />
          {columns.map(col => (
            <col key={col.key} style={{ width: getColWidth(col) }} />
          ))}
        </colgroup>

        {/* ── 헤더 ── */}
        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg-tertiary)' }}>
          {/* group 병합 행: 기존 헤더 위에 추가 (Budget 월별) */}
          {hasGroups && (
            <tr style={headerRowStyle}>
              {/* Segmentation 자리 — 비워둠 */}
              <th style={sSegHdrStyle} />
              {groupSpans.map((gs, gi) => (
                <th key={gs.group} colSpan={gs.span}
                  style={{
                    borderLeft:    '1px solid var(--color-border-default)',
                    color:         accentColor,
                    fontSize:      11,
                    fontWeight:    600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    textAlign:     'center',
                    paddingTop:    6,
                    paddingBottom: 6,
                    ...(stickyFirstGroup && gi === 0 ? {
                      position:    'sticky',
                      left:        SEG_WIDTH,
                      zIndex:      2,
                      background:  'var(--color-bg-tertiary)',
                      boxShadow: '2px 0 0 0 var(--color-border-default)',
                    } : {}),
                  }}>
                  {gs.group}
                </th>
              ))}
            </tr>
          )}

          {/* groupHeader 행 (기존 prop 유지) */}
          {groupHeader && (
            <tr style={headerRowStyle}>
              <th className="px-4 py-2 text-left text-xs font-medium text-brand-muted">
                Segmentation
              </th>
              <th colSpan={colCount}
                className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider"
                style={{ color: accentColor, borderLeft: '1px solid var(--color-border-default)' }}>
                {groupHeader}
              </th>
            </tr>
          )}

          {/* 컬럼 레이블 행 */}
          <tr style={headerRowStyle}>
            <th className="px-4 py-2 text-left text-xs font-medium text-brand-muted"
              style={sSegHdrStyle}>
              {!groupHeader && 'Segmentation'}
            </th>
            {columns.map((col, i) => (
              <th key={col.key}
                className="px-2 py-2 text-center text-xs font-medium text-brand-muted whitespace-nowrap"
                style={{
                  borderLeft: hasGroups
                    ? colBorderLeft(columns, i)
                    : '1px solid var(--color-border-subtle)',
                  ...sColHdrStyle(i),
                }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* ── 대분류/중분류 order_index 순 인터리빙 (MarketPreviewTable과 동일) ── */}
          {[
            ...tree.groups.map(g => ({ kind: 'group' as const, data: g, idx: g.parent.order_index })),
            ...tree.mids.map(m  => ({ kind: 'mid'   as const, data: m, idx: m.order_index })),
          ].sort((a, b) => a.idx - b.idx).map(item => {

            if (item.kind === 'group') {
              const group = item.data
              return (
                <React.Fragment key={group.parent.id}>
                  {/* 대분류 */}
                  {(() => {
                    const rowId  = `main-${group.parent.id}`
                    const mainBg = rowBg(group.parent.color, 'var(--color-bg-secondary)')
                    const bg     = hoverBg(rowId, mainBg)
                    return (
                      <tr
                        style={{ borderTop: '1px solid var(--color-border-default)', fontWeight: group.parent.is_bold ? 700 : 600 }}
                        onMouseEnter={() => setHoveredRowId(rowId)}
                        onMouseLeave={() => setHoveredRowId(null)}
                      >
                        <td className="px-4 py-2"
                          style={{ background: bg, color: fontColor(group.parent, 'var(--color-text-primary)'), ...sSegStyle(bg) }}>
                          {group.parent.name}
                        </td>
                        {columns.map((col, i) => {
                          const getAgg = (k: string) => aggregateMain(group, data, k)
                          const val    = computeCell(col, getAgg(col.key), getAgg)
                          return (
                            <td key={col.key} className="px-2 py-2 text-right whitespace-nowrap"
                              style={{
                                background: bg,
                                color:      fontColor(group.parent, 'var(--color-text-primary)'),
                                borderLeft: hasGroups ? colBorderLeft(columns, i) : '1px solid var(--color-border-subtle)',
                                ...sColStyle(i, bg),
                              }}>
                              {formatValue(val, col.type)}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })()}

                  {/* 소분류 */}
                  {group.children.map((child, ci) => {
                    const rowId      = `sub-${child.id}`
                    const subFallback = child.color ?? 'var(--color-accent-primary)'
                    const subBg       = 'var(--color-bg-primary)'
                    const bg          = hoverBg(rowId, subBg)
                    return (
                      <tr key={child.id}
                        style={{
                          borderBottom: ci < group.children.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                          fontWeight: child.is_bold ? 600 : 400,
                        }}
                        onMouseEnter={() => setHoveredRowId(rowId)}
                        onMouseLeave={() => setHoveredRowId(null)}
                      >
                        <td className="py-2"
                          style={{ background: bg, paddingLeft: 16, color: fontColor(child, subFallback), ...sSegStyle(bg) }}>
                          <SegCell
                            label={child.name}
                            codes={child.segmentation ?? []}
                            codeColor={fontColor(child, subFallback)}
                            indent
                            allExpanded={allExpanded}
                            onToggle={toggleAll}
                          />
                        </td>
                        {columns.map((col, i) => {
                          const getAgg = (k: string) => aggregateSub(child, data, k)
                          const val    = computeCell(col, getAgg(col.key), getAgg)
                          const row    = { segmentation: child.segmentation?.[0] ?? '' }
                          return (
                            <td key={col.key} className="px-2 py-2 text-right whitespace-nowrap"
                              style={{
                                background: bg,
                                color:      fontColor(child, subFallback),
                                borderLeft: hasGroups ? colBorderLeft(columns, i) : '1px solid var(--color-border-subtle)',
                                ...sColStyle(i, bg),
                              }}>
                              {col.render ? col.render(val, row) : formatValue(val, col.type)}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </React.Fragment>
              )
            }

            // 중분류
            const mid   = item.data
            const rowId = `mid-${mid.id}`
            const midBg = rowBg(mid.color, 'var(--color-bg-secondary)')
            const bg    = hoverBg(rowId, midBg)
            return (
              <tr key={mid.id}
                style={{ borderTop: '1px solid var(--color-border-default)', fontWeight: mid.is_bold ? 600 : 400 }}
                onMouseEnter={() => setHoveredRowId(rowId)}
                onMouseLeave={() => setHoveredRowId(null)}
              >
                <td className="px-4 py-2"
                  style={{ background: bg, color: fontColor(mid, 'var(--color-text-primary)'), ...sSegStyle(bg) }}>
                  <SegCell
                    label={mid.name}
                    codes={mid.segmentation ?? []}
                    codeColor={fontColor(mid, 'var(--color-text-muted)')}
                    allExpanded={allExpanded}
                    onToggle={toggleAll}
                  />
                </td>
                {columns.map((col, i) => {
                  const getAgg = (k: string) => aggregateMid(mid, data, k)
                  const val    = computeCell(col, getAgg(col.key), getAgg)
                  const row    = { segmentation: mid.segmentation?.[0] ?? '' }
                  return (
                    <td key={col.key} className="px-2 py-2 text-right whitespace-nowrap"
                      style={{
                        background: bg,
                        color:      fontColor(mid, 'var(--color-text-primary)'),
                        borderLeft: hasGroups ? colBorderLeft(columns, i) : '1px solid var(--color-border-subtle)',
                        ...sColStyle(i, bg),
                      }}>
                      {col.render ? col.render(val, row) : formatValue(val, col.type)}
                    </td>
                  )
                })}
              </tr>
            )
          })}

        </tbody>
        <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 10, background: FOOTER_BG }}>
          {/* ── Total ── */}
          <tr style={{ borderTop: '2px solid var(--color-border-default)', background: FOOTER_BG, fontWeight: 600 }}>
            <td className="px-4 py-2 font-semibold" style={{ color: accentColor, ...sSegStyle(FOOTER_BG) }}>Total</td>
            {columns.map((col, i) => {
              const getAgg = (k: string) => aggregateTotal(tree, data, k)
              const val    = computeCell(col, getAgg(col.key), getAgg)
              return (
                <td key={col.key} className="px-2 py-2 text-right whitespace-nowrap"
                  style={{
                    color:      accentColor,
                    borderLeft: hasGroups ? colBorderLeft(columns, i) : '1px solid var(--color-border-subtle)',
                    background: FOOTER_BG,
                    ...sColStyle(i, FOOTER_BG),
                  }}>
                  {formatValue(val, col.type)}
                </td>
              )
            })}
          </tr>

          {/* ── Occupancy ── */}
          <tr style={{ borderTop: '1px solid var(--color-border-subtle)', background: FOOTER_BG, fontWeight: 600 }}>
            <td className="px-4 py-2 font-semibold" style={{ color: accentColor, ...sSegStyle(FOOTER_BG) }}>Occ</td>
            {hasGroups ? (
              groupSpans.map((gs, gi) => {
                const groupCols  = columns.filter(c => (c.group ?? '') === gs.group)
                const rnCol      = groupCols.find(c => c.type === 'number' || c.key.endsWith('_rn') || c.key === 'total_rn')
                const rnVal      = rnCol ? aggregateTotal(tree, data, rnCol.key) : 0
                const daysForGrp = year ? getDaysForGroup(gs.group, year) : 0
                const availForGrp = roomCount * daysForGrp
                const occPct     = availForGrp > 0 ? (rnVal / availForGrp) * 100 : null
                return (
                  <td key={gs.group} colSpan={gs.span}
                    className="px-2 py-2 text-center whitespace-nowrap"
                    style={{
                      color: accentColor,
                      borderLeft: '1px solid var(--color-border-default)',
                      background: FOOTER_BG,
                      ...(stickyFirstGroup && gi === 0 ? { position: 'sticky', left: SEG_WIDTH, zIndex: 2, background: FOOTER_BG } : {}),
                    }}>
                    {occPct !== null && occPct > 0 ? `${occPct.toFixed(1)}%` : '-'}
                  </td>
                )
              })
            ) : (
              columns.map(col => {
                const isRnCol = col.key === 'rn' || col.key === 'rooms_sold'
                const occPct  = isRnCol && availableRooms > 0 ? (totalRn / availableRooms) * 100 : null
                return (
                  <td key={col.key} className="px-2 py-2 text-right whitespace-nowrap"
                    style={{ color: accentColor, borderLeft: '1px solid var(--color-border-subtle)', background: FOOTER_BG }}>
                    {occPct !== null ? `${occPct.toFixed(1)}%` : '-'}
                  </td>
                )
              })
            )}
          </tr>

          {/* ── Rev.PAR ── */}
          <tr style={{ borderTop: '1px solid var(--color-border-subtle)', background: FOOTER_BG, fontWeight: 600 }}>
            <td className="px-4 py-2 font-semibold" style={{ color: accentColor, ...sSegStyle(FOOTER_BG) }}>Rev.PAR</td>
            {hasGroups ? (
              groupSpans.map((gs, gi) => {
                const groupCols   = columns.filter(c => (c.group ?? '') === gs.group)
                const rnCol       = groupCols.find(c => c.type === 'number' || c.key.endsWith('_rn') || c.key === 'total_rn')
                const revCol      = groupCols.find(c => c.type === 'currency' || c.key.endsWith('_rev') || c.key === 'total_rev')
                const rnVal       = rnCol  ? aggregateTotal(tree, data, rnCol.key)  : 0
                const revVal      = revCol ? aggregateTotal(tree, data, revCol.key) : 0
                const adr         = rnVal > 0 ? revVal / rnVal : 0
                const daysForGrp  = year ? getDaysForGroup(gs.group, year) : 0
                const availForGrp = roomCount * daysForGrp
                const occRatio    = availForGrp > 0 ? rnVal / availForGrp : 0
                const grpRevpar   = Math.round(occRatio * adr)
                return (
                  <td key={gs.group} colSpan={gs.span}
                    className="px-2 py-2 text-center whitespace-nowrap"
                    style={{
                      color: accentColor,
                      borderLeft: '1px solid var(--color-border-default)',
                      background: FOOTER_BG,
                      ...(stickyFirstGroup && gi === 0 ? { position: 'sticky', left: SEG_WIDTH, zIndex: 2, background: FOOTER_BG } : {}),
                    }}>
                    {grpRevpar > 0 ? formatValue(grpRevpar, 'adr') : '-'}
                  </td>
                )
              })
            ) : (
              columns.map(col => {
                const isRevCol = col.key === 'rev' || col.key === 'room_revenue'
                return (
                  <td key={col.key} className="px-2 py-2 text-right whitespace-nowrap"
                    style={{ color: accentColor, borderLeft: '1px solid var(--color-border-subtle)', background: FOOTER_BG }}>
                    {isRevCol ? formatValue(revpar, 'adr') : '-'}
                  </td>
                )
              })
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
