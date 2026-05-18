'use client'

import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MarketTableColumn = {
  key:     string
  label:   string
  type?:   'number' | 'currency' | 'percent' | 'string'
  width?:  string
  render?: (value: number, row: MarketTableRow) => React.ReactNode
}

export type MarketTableRow = Record<string, any>
export type MarketTableData = Record<string, Record<string, any>>

export type MarketTableProps = {
  hotelId:      string
  columns:      MarketTableColumn[]
  data:         MarketTableData
  groupHeader?: string
  loading?:     boolean
  className?:   string
  year?:        number
  month?:       number
}

type Schema = {
  id:           string
  hotel_id:     string
  name:         string
  level:        'main' | 'mid' | 'sub'
  parent_id:    string | null
  segmentation: string[] | null
  order_index:  number
  color:        string | null
  is_bold:      boolean
  is_active:    boolean
}

type SchemaGroup = {
  parent:   Schema
  children: Schema[]
}

type SchemaTree = {
  groups: SchemaGroup[]
  mids:   Schema[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTree(schemas: Schema[]): SchemaTree {
  const mains = schemas
    .filter(s => s.level === 'main')
    .sort((a, b) => a.order_index - b.order_index)
  const subs = schemas.filter(s => s.level === 'sub')
  const mids = schemas
    .filter(s => s.level === 'mid')
    .sort((a, b) => a.order_index - b.order_index)

  return {
    groups: mains.map(main => ({
      parent:   main,
      children: subs
        .filter(s => s.parent_id === main.id)
        .sort((a, b) => a.order_index - b.order_index),
    })),
    mids,
  }
}

function aggregateSub(sub: Schema, data: MarketTableData, colKey: string): number {
  return (sub.segmentation ?? []).reduce((s, seg) => s + (data[seg]?.[colKey] ?? 0), 0)
}

function aggregateMain(group: SchemaGroup, data: MarketTableData, colKey: string): number {
  return group.children.reduce((sum, child) => sum + aggregateSub(child, data, colKey), 0)
}

function aggregateMid(mid: Schema, data: MarketTableData, colKey: string): number {
  return (mid.segmentation ?? []).reduce((s, seg) => s + (data[seg]?.[colKey] ?? 0), 0)
}

function aggregateTotal(tree: SchemaTree, data: MarketTableData, colKey: string): number {
  const groupSum = tree.groups.reduce((s, g) => s + aggregateMain(g, data, colKey), 0)
  const midSum   = tree.mids.reduce((s, m) => s + aggregateMid(m, data, colKey), 0)
  return groupSum + midSum
}

function formatValue(value: number, type?: string): string {
  if (!value) return '-'
  switch (type) {
    case 'currency':
      return value >= 1_000_000
        ? `${(value / 1_000_000).toFixed(1)}M`
        : value.toLocaleString('ko-KR')
    case 'percent':
      return `${value.toFixed(1)}%`
    default:
      return value.toLocaleString('ko-KR')
  }
}

// ── ADR 가중평균 헬퍼 ─────────────────────────────────────────────────────────

function calcAdr(rev: number, rn: number): number {
  return rn > 0 ? Math.round(rev / rn) : 0
}

function resolveValue(
  col:   MarketTableColumn,
  rawValue: number,
  revTotal: number,
  rnTotal:  number,
): number {
  if (col.key === 'adr' || col.key === 'rate') {
    return calcAdr(revTotal, rnTotal)
  }
  return rawValue
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden animate-pulse"
      style={{ border: '1px solid var(--color-border-default)' }}>
      {[1,2,3,4,5,6,7,8].map(i => (
        <div key={i} className="h-10"
          style={{
            background:  i % 2 === 0 ? 'var(--color-bg-secondary)' : 'var(--color-bg-tertiary)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }} />
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MarketTable({
  hotelId, columns, data, groupHeader, loading, className, year, month,
}: MarketTableProps) {

  // ── 스키마 조회 ──────────────────────────────────────────────────────────────
  const { data: schemas = [], isLoading: schemaLoading } = useQuery<Schema[]>({
    queryKey: ['c05_market_table_schema', hotelId],
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

  // ── 호텔 객실수 조회 ─────────────────────────────────────────────────────────
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

  // ── 트리 / 날짜 계산 ─────────────────────────────────────────────────────────
  const tree = useMemo(() => buildTree(schemas), [schemas])

  const daysInMonth = useMemo(() => {
    if (!year || !month) return 0
    return new Date(year, month, 0).getDate()
  }, [year, month])

  const availableRooms = roomCount * daysInMonth

  // ── 전체 합계 ────────────────────────────────────────────────────────────────
  const totalRn  = aggregateTotal(tree, data, 'rn')  || aggregateTotal(tree, data, 'rooms_sold')
  const totalRev = aggregateTotal(tree, data, 'rev') || aggregateTotal(tree, data, 'room_revenue')
  const occ      = availableRooms > 0 ? totalRn / availableRooms : 0
  const adr      = totalRn > 0 ? totalRev / totalRn : 0
  const revpar   = Math.round(occ * adr)

  if (schemaLoading || loading) return <LoadingSkeleton />

  const colCount = columns.length

  // ── Cell 스타일 ──────────────────────────────────────────────────────────────
  const cellStyle = { borderLeft: '1px solid var(--color-border-subtle)' }
  const accentColor = 'var(--color-accent-primary)'

  return (
    <div className={`overflow-x-auto rounded-xl ${className ?? ''}`}
      style={{ border: '1px solid var(--color-border-default)' }}>
      <table className="w-full border-collapse" style={{ fontSize: 13 }}>

        {/* ── 헤더 ── */}
        <thead>
          {groupHeader && (
            <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
              <th className="px-4 py-2 text-left text-xs font-medium text-brand-muted"
                style={{ minWidth: 180 }}>
                Segmentation
              </th>
              <th colSpan={colCount}
                className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider"
                style={{ color: accentColor, borderLeft: '1px solid var(--color-border-default)' }}>
                {groupHeader}
              </th>
            </tr>
          )}
          <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
            <th className="px-4 py-2 text-left text-xs font-medium text-brand-muted"
              style={{ minWidth: 180 }}>
              {!groupHeader && 'Segmentation'}
            </th>
            {columns.map(col => (
              <th key={col.key}
                className="px-4 py-2 text-right text-xs font-medium text-brand-muted"
                style={{ width: col.width ?? 100, ...cellStyle }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* ── 대분류 + 소분류 ── */}
          {tree.groups.map(group => {
            const mainRevForAdr = aggregateMain(group, data, 'rev') || aggregateMain(group, data, 'room_revenue')
            const mainRnForAdr  = aggregateMain(group, data, 'rn')  || aggregateMain(group, data, 'rooms_sold')
            return (
              <React.Fragment key={group.parent.id}>
                <tr style={{
                  background: group.parent.color ? `${group.parent.color}22` : 'var(--color-bg-secondary)',
                  borderTop:  '1px solid var(--color-border-default)',
                }}>
                  <td className="px-4 py-2.5"
                    style={{ fontWeight: group.parent.is_bold ? 700 : 600, color: 'var(--color-text-primary)' }}>
                    {group.parent.name}
                  </td>
                  {columns.map(col => {
                    const raw = aggregateMain(group, data, col.key)
                    const val = resolveValue(col, raw, mainRevForAdr, mainRnForAdr)
                    return (
                      <td key={col.key} className="px-4 py-2.5 text-right"
                        style={{ color: 'var(--color-text-primary)', ...cellStyle }}>
                        {col.render ? col.render(val, {}) : formatValue(val, col.type)}
                      </td>
                    )
                  })}
                </tr>

                {group.children.map((child, i) => {
                  const childRevForAdr = aggregateSub(child, data, 'rev') || aggregateSub(child, data, 'room_revenue')
                  const childRnForAdr  = aggregateSub(child, data, 'rn')  || aggregateSub(child, data, 'rooms_sold')
                  return (
                    <tr key={child.id}
                      style={{ borderBottom: i < group.children.length - 1 ? '1px solid var(--color-border-subtle)' : 'none' }}>
                      <td className="px-4 py-2 text-sm"
                        style={{ paddingLeft: 32, color: 'var(--color-text-secondary)', fontWeight: child.is_bold ? 600 : 400 }}>
                        <span className="text-brand-dimmed mr-1.5" style={{ fontSize: 11 }}>└</span>
                        {child.name}
                      </td>
                      {columns.map(col => {
                        const raw = aggregateSub(child, data, col.key)
                        const val = resolveValue(col, raw, childRevForAdr, childRnForAdr)
                        return (
                          <td key={col.key} className="px-4 py-2 text-right text-sm"
                            style={{ color: 'var(--color-text-secondary)', ...cellStyle }}>
                            {col.render ? col.render(val, {}) : formatValue(val, col.type)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </React.Fragment>
            )
          })}

          {/* ── 중분류 ── */}
          {tree.mids.map(mid => {
            const midRevForAdr = aggregateMid(mid, data, 'rev') || aggregateMid(mid, data, 'room_revenue')
            const midRnForAdr  = aggregateMid(mid, data, 'rn')  || aggregateMid(mid, data, 'rooms_sold')
            return (
              <tr key={mid.id}
                style={{ borderTop: '1px solid var(--color-border-default)' }}>
                <td className="px-4 py-2.5 text-sm"
                  style={{ color: 'var(--color-text-primary)', fontWeight: mid.is_bold ? 600 : 400 }}>
                  {mid.name}
                </td>
                {columns.map(col => {
                  const raw = aggregateMid(mid, data, col.key)
                  const val = resolveValue(col, raw, midRevForAdr, midRnForAdr)
                  return (
                    <td key={col.key} className="px-4 py-2.5 text-right text-sm"
                      style={{ color: 'var(--color-text-primary)', ...cellStyle }}>
                      {col.render ? col.render(val, {}) : formatValue(val, col.type)}
                    </td>
                  )
                })}
              </tr>
            )
          })}

          {/* ── Total ── */}
          <tr style={{ borderTop: '2px solid var(--color-border-default)', background: 'var(--color-bg-tertiary)' }}>
            <td className="px-4 py-2.5 text-sm font-semibold"
              style={{ color: accentColor }}>
              Total
            </td>
            {columns.map(col => {
              const raw = aggregateTotal(tree, data, col.key)
              const val = col.key === 'adr' || col.key === 'rate'
                ? calcAdr(totalRev, totalRn)
                : raw
              return (
                <td key={col.key} className="px-4 py-2.5 text-right text-sm font-semibold"
                  style={{ color: accentColor, ...cellStyle }}>
                  {col.render ? col.render(val, {}) : formatValue(val, col.type)}
                </td>
              )
            })}
          </tr>

          {/* ── Occupancy ── */}
          <tr style={{ borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-tertiary)' }}>
            <td className="px-4 py-2.5 text-sm font-semibold"
              style={{ color: accentColor }}>
              Occ
            </td>
            {columns.map(col => {
              const isRnCol = col.key === 'rn' || col.key === 'rooms_sold'
              const occPct  = isRnCol && availableRooms > 0
                ? (totalRn / availableRooms) * 100
                : null
              return (
                <td key={col.key} className="px-4 py-2.5 text-right text-sm font-semibold"
                  style={{ color: accentColor, ...cellStyle }}>
                  {occPct !== null ? `${occPct.toFixed(1)}%` : '-'}
                </td>
              )
            })}
          </tr>

          {/* ── Rev.PAR ── */}
          <tr style={{ borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-tertiary)' }}>
            <td className="px-4 py-2.5 text-sm font-semibold"
              style={{ color: accentColor }}>
              Rev.PAR
            </td>
            {columns.map(col => {
              const isRevCol = col.key === 'rev' || col.key === 'room_revenue'
              return (
                <td key={col.key} className="px-4 py-2.5 text-right text-sm font-semibold"
                  style={{ color: accentColor, ...cellStyle }}>
                  {isRevCol ? formatValue(revpar, 'currency') : '-'}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
