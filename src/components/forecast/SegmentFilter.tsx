'use client'

import type { SchemaNode } from '@/lib/forecast/types'

interface SegmentFilterProps {
  nodes:           SchemaNode[]
  selectedIds:     Set<string>
  onToggle:        (id: string) => void
  onAll:           () => void
  onReset:         () => void
}

export default function SegmentFilter({
  nodes,
  selectedIds,
  onToggle,
  onAll,
  onReset,
}: SegmentFilterProps) {
  const total    = nodes.length
  const selected = selectedIds.size

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg"
      style={{
        background: 'var(--color-bg-secondary)',
        border:     '1px solid var(--color-border-default)',
        fontSize:   '11px',
      }}
    >
      {/* 레이블 + 카운트 */}
      <span style={{ color: 'var(--color-text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
        세그먼트
      </span>
      <span style={{ color: 'var(--color-text-muted)', marginRight: 4 }}>
        {selected}/{total}
      </span>

      {/* 전체 / 초기화 */}
      <CtrlBtn onClick={onAll} active={false} label="전체" />
      <CtrlBtn onClick={onReset} active={false} label="초기화" />

      {/* 구분선 */}
      <div style={{ width: 1, height: 18, background: 'var(--color-border-default)' }} />

      {/* 세그먼트 버튼 */}
      {nodes.map(node => (
        <SegBtn
          key={node.id}
          label={node.name + (node.isBold ? ' ★' : '')}
          active={selectedIds.has(node.id)}
          onClick={() => onToggle(node.id)}
        />
      ))}
    </div>
  )
}

function CtrlBtn({ onClick, active, label }: { onClick: () => void; active: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding:       '3px 8px',
        borderRadius:  '5px',
        fontSize:      '11px',
        fontWeight:    500,
        cursor:        'pointer',
        border:        '1px solid var(--color-border-default)',
        background:    active ? 'var(--color-accent-primary)' : 'var(--color-bg-surface)',
        color:         active ? '#fff' : 'var(--color-text-secondary)',
        transition:    'background 0.15s, color 0.15s',
        whiteSpace:    'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function SegBtn({ onClick, active, label }: { onClick: () => void; active: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding:      '3px 8px',
        borderRadius: '5px',
        fontSize:     '11px',
        fontWeight:   active ? 600 : 400,
        cursor:       'pointer',
        border:       active
          ? '1px solid var(--color-accent-primary)'
          : '1px solid var(--color-border-default)',
        background:   active ? 'var(--color-accent-primary)' : 'var(--color-bg-surface)',
        color:        active ? '#000' : 'var(--color-text-secondary)',
        transition:   'background 0.15s, color 0.15s, border-color 0.15s',
        whiteSpace:   'nowrap',
      }}
    >
      {label}
    </button>
  )
}
