'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MarketCode = {
  id:                      string
  hotel_id:                string
  market_code:             string
  segmentation:            string
  market_code_description: string | null
  sequence:                number | null
  color:                   string | null
  is_parent:               boolean
  parent_id:               string | null
  is_bold:                 boolean
  order_index:             number
  sorting1:                string | null
  sorting2:                string | null
  sorting3:                string | null
  sorting4:                string | null
  sorting5:                string | null
  is_active:               boolean
  created_at:              string
  updated_at:              string
}

export type MarketCodeColumn = {
  key:     keyof MarketCode | string
  label:   string
  width?:  string
  render?: (row: MarketCode) => React.ReactNode
}

export type MarketCodeTableProps = {
  hotelId:   string
  columns?:  MarketCodeColumn[]
  editable?: boolean
  onEdit?:   (row: MarketCode) => void
  onDelete?: (ids: string[]) => void
}

type MarketCodeGroup = {
  parent:   MarketCode
  children: MarketCode[]
}

// ── 기본 컬럼 ─────────────────────────────────────────────────────────────────

const DEFAULT_COLUMNS: MarketCodeColumn[] = [
  { key: 'market_code',             label: '마켓 코드', width: '120px' },
  { key: 'market_code_description', label: '설명',      width: '200px' },
  { key: 'sorting1',                label: '분류1',     width: '100px' },
  { key: 'sorting2',                label: '분류2',     width: '100px' },
  { key: 'sorting3',                label: '분류3',     width: '100px' },
  { key: 'sorting4',                label: '분류4',     width: '100px' },
  { key: 'sorting5',                label: '분류5',     width: '100px' },
  {
    key:    'is_active',
    label:  '활성',
    width:  '60px',
    render: row => (
      <span style={{ color: row.is_active ? '#00D48A' : '#4A5568' }}>
        {row.is_active ? 'ON' : 'OFF'}
      </span>
    ),
  },
]

// ── 트리 구조 변환 ─────────────────────────────────────────────────────────────

const FLAT_PARENT: MarketCode = {
  id: '__flat__', hotel_id: '', market_code: '', segmentation: '',
  market_code_description: null, sequence: null, color: null,
  is_parent: true, parent_id: null, is_bold: false, order_index: 0,
  sorting1: null, sorting2: null, sorting3: null, sorting4: null, sorting5: null,
  is_active: true, created_at: '', updated_at: '',
}

function buildMarketCodeTree(data: MarketCode[]): MarketCodeGroup[] {
  const parents  = data
    .filter(m => m.is_parent)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  const children = data.filter(m => !m.is_parent)

  // is_parent 컬럼이 없거나 부모 항목이 없으면 전체를 flat 목록으로 표시
  if (parents.length === 0) {
    return [{ parent: FLAT_PARENT, children: [...data].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)) }]
  }

  return parents.map(parent => ({
    parent,
    children: children
      .filter(c => c.parent_id === parent.market_code)
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
  }))
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MarketCodeTable({
  hotelId, columns, editable = false, onEdit, onDelete,
}: MarketCodeTableProps) {
  const cols = columns ?? DEFAULT_COLUMNS
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const { data = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.marketCodes(hotelId),
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('c03_market_codes')
        .select('*')
        .eq('hotel_id', hotelId)
        .order('order_index')
      if (error) throw error
      return data as MarketCode[]
    },
    enabled:   !!hotelId,
    staleTime: 10 * 60 * 1000,
  })

  const groups = useMemo(() => buildMarketCodeTree(data), [data])

  if (isLoading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-5 h-5 border-2 rounded-full animate-spin"
        style={{ borderColor: 'var(--color-accent-primary)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (data.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm text-brand-muted">마켓 코드가 없습니다</p>
      <p className="text-xs text-brand-dimmed mt-1">추가 버튼을 눌러 시작하세요</p>
    </div>
  )

  const allChecked = selectedIds.length === data.length && data.length > 0

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--color-border-default)' }}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">

          {/* 헤더 */}
          <thead>
            <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
              {editable && (
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={e => setSelectedIds(e.target.checked ? data.map(d => d.id) : [])}
                    className="cursor-pointer"
                    style={{ accentColor: 'var(--color-accent-primary)' }}
                  />
                </th>
              )}
              {cols.map(col => (
                <th key={col.key}
                  className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-brand-muted"
                  style={{ width: col.width }}>
                  {col.label}
                </th>
              ))}
              {editable && (
                <th className="w-20 px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
                  액션
                </th>
              )}
            </tr>
          </thead>

          {/* 바디 */}
          <tbody>
            {groups.map(group => (
              <React.Fragment key={group.parent.id}>

                {/* 그룹 헤더 행 — flat 모드(is_parent 없음)일 때 숨김 */}
                {group.parent.id !== '__flat__' && (
                  <tr style={{
                    background:   group.parent.color ? `${group.parent.color}22` : 'var(--color-bg-secondary)',
                    borderTop:    '1px solid var(--color-border-default)',
                    borderBottom: '1px solid var(--color-border-default)',
                  }}>
                    {editable && <td />}
                    <td colSpan={cols.length + (editable ? 1 : 0)} className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {group.parent.color && (
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ background: group.parent.color }} />
                        )}
                        <span
                          className={group.parent.is_bold ? 'font-bold' : 'font-semibold'}
                          style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                          {group.parent.segmentation}
                        </span>
                        <span className="text-[11px] text-brand-dimmed">
                          ({group.parent.market_code})
                        </span>
                      </div>
                    </td>
                  </tr>
                )}

                {/* 하위 코드 행 */}
                {group.children.length === 0 ? (
                  <tr>
                    <td colSpan={cols.length + (editable ? 2 : 0)}
                      className="px-8 py-2 text-xs text-brand-dimmed italic">
                      — 하위 항목 없음
                    </td>
                  </tr>
                ) : group.children.map((row, i) => (
                  <tr key={row.id}
                    className="transition-colors"
                    style={{
                      borderBottom: i < group.children.length - 1
                        ? '1px solid var(--color-border-subtle)'
                        : 'none',
                      cursor: editable ? 'pointer' : 'default',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => editable && onEdit?.(row)}
                  >
                    {editable && (
                      <td className="w-10 px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={e => setSelectedIds(prev =>
                            e.target.checked
                              ? [...prev, row.id]
                              : prev.filter(id => id !== row.id)
                          )}
                          className="cursor-pointer"
                          style={{ accentColor: 'var(--color-accent-primary)' }}
                        />
                      </td>
                    )}
                    {cols.map(col => (
                      <td key={col.key}
                        className="px-4 py-2.5 text-sm"
                        style={{ paddingLeft: group.parent.id === '__flat__' ? 16 : 32, color: 'var(--color-text-secondary)' }}>
                        {col.render
                          ? col.render(row)
                          : String(row[col.key as keyof MarketCode] ?? '—')}
                      </td>
                    ))}
                    {editable && (
                      <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => onDelete?.([row.id])}
                          className="text-xs px-2 py-1 rounded transition-colors"
                          style={{ color: '#4A5568', border: '1px solid transparent' }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = '#1A0D0D'
                            e.currentTarget.style.color      = '#FC8181'
                            e.currentTarget.style.border     = '1px solid #3D1A1A'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color      = '#4A5568'
                            e.currentTarget.style.border     = '1px solid transparent'
                          }}
                        >
                          삭제
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* 다중 선택 삭제 바 */}
      {editable && selectedIds.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{ borderTop: '1px solid var(--color-border-default)', background: 'var(--color-bg-tertiary)' }}>
          <span className="text-xs text-brand-muted">{selectedIds.length}개 선택됨</span>
          <button
            onClick={() => { onDelete?.(selectedIds); setSelectedIds([]) }}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: '#FC8181', border: '1px solid #3D1A1A', background: '#1A0D0D' }}>
            선택 삭제
          </button>
        </div>
      )}
    </div>
  )
}
