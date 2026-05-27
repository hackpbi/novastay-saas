'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SchemaNode } from '@/lib/forecast/types'

interface SegmentFilterProps {
  nodes:       SchemaNode[]
  selectedIds: Set<string>
  onToggle:    (id: string) => void
  onAll:       () => void
  onReset:     () => void
}

export default function SegmentFilter({
  nodes,
  selectedIds,
  onToggle,
  onAll,
  onReset,
}: SegmentFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  const total    = nodes.length
  const selected = selectedIds.size

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* 트리거 버튼 */}
      <button
        onClick={() => setIsOpen(v => !v)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        style={{
          display:    'flex',
          alignItems: 'center',
          gap:        6,
          padding:    '6px 12px',
          borderRadius: '8px',
          fontSize:   '12px',
          fontWeight: 500,
          cursor:     'pointer',
          border:     '1px solid var(--color-border-default)',
          background: isOpen ? 'var(--color-bg-secondary)' : 'var(--color-bg-surface)',
          color:      'var(--color-text-secondary)',
          transition: 'background 0.15s',
        }}
      >
        <span>Seg</span>
        <span style={{
          fontWeight: 600,
          color: selected < total
            ? 'var(--color-accent-primary, #00E5A0)'
            : 'var(--color-text-primary)',
        }}>
          {selected}/{total}
        </span>
        <ChevronDown
          size={14}
          style={{
            color:      'var(--color-text-muted)',
            transform:  isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        />
      </button>

      {/* 드롭다운 패널 */}
      {isOpen && (
        <div
          style={{
            position:     'absolute',
            top:          'calc(100% + 6px)',
            left:         0,
            zIndex:       50,
            width:        300,
            borderRadius: '10px',
            border:       '1px solid var(--color-border-default)',
            background:   'var(--color-bg-surface)',
            boxShadow:    'var(--shadow-card, 0 4px 16px rgba(0,0,0,0.12))',
            overflow:     'hidden',
          }}
        >
          {/* 패널 헤더 */}
          <div style={{
            padding:        '10px 14px 8px',
            borderBottom:   '1px solid var(--color-border-default)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              세그먼트 표시 설정
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <CtrlBtn label="전체" onClick={onAll} />
              <CtrlBtn label="초기화" onClick={onReset} />
            </div>
          </div>

          {/* 체크박스 목록 */}
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: '6px 0' }}>
            {nodes.map(node => {
              const checked = selectedIds.has(node.id)
              return (
                <label
                  key={node.id}
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        8,
                    padding:    '7px 14px',
                    cursor:     'pointer',
                    fontSize:   12,
                    color:      checked ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    background: 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-secondary)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(node.id)}
                    style={{
                      accentColor: 'var(--color-accent-primary)',
                      width:       14,
                      height:      14,
                      cursor:      'pointer',
                      flexShrink:  0,
                    }}
                  />
                  <span style={{ fontWeight: checked ? 500 : 400 }}>
                    {node.name}{node.isBold ? ' ★' : ''}
                  </span>
                </label>
              )
            })}
          </div>

          {/* 닫기 */}
          <div style={{
            padding:        '8px 14px',
            borderTop:      '1px solid var(--color-border-default)',
            display:        'flex',
            justifyContent: 'flex-end',
          }}>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                padding:      '4px 14px',
                borderRadius: '6px',
                fontSize:     '12px',
                fontWeight:   500,
                cursor:       'pointer',
                border:       '1px solid var(--color-border-default)',
                background:   'var(--color-bg-surface)',
                color:        'var(--color-text-secondary)',
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CtrlBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding:      '3px 10px',
        borderRadius: '5px',
        fontSize:     '11px',
        fontWeight:   500,
        cursor:       'pointer',
        border:       '1px solid var(--color-border-default)',
        background:   'var(--color-bg-secondary)',
        color:        'var(--color-text-secondary)',
      }}
    >
      {label}
    </button>
  )
}
