'use client'

import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ForecastHeaderProps {
  year:      number
  month:     number
  onPrev:    () => void
  onNext:    () => void
  onToday:   () => void
  children?: ReactNode
}

const btnBase: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  padding:        '4px 8px',
  borderRadius:   '6px',
  fontSize:       '12px',
  fontWeight:     500,
  cursor:         'pointer',
  border:         '1px solid var(--color-border-default)',
  background:     'var(--color-bg-surface)',
  color:          'var(--color-text-secondary)',
  transition:     'background 0.15s, color 0.15s',
}

export default function ForecastHeader({ year, month, onPrev, onNext, onToday, children }: ForecastHeaderProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      {/* 좌측: 월 selector */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          style={btnBase}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-secondary)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-surface)' }}
          aria-label="이전 월"
        >
          <ChevronLeft size={14} />
        </button>

        <span className="text-sm font-medium min-w-[80px] text-center" style={{ color: 'var(--color-text-primary)' }}>
          {year}년 {month}월
        </span>

        <button
          onClick={onNext}
          style={btnBase}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-secondary)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-surface)' }}
          aria-label="다음 월"
        >
          <ChevronRight size={14} />
        </button>

        <button
          onClick={onToday}
          style={{ ...btnBase, padding: '4px 10px' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-secondary)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-surface)' }}
        >
          오늘
        </button>
      </div>

      {/* 우측: 세그먼트 필터 + 자동 펼침 슬라이더 */}
      {children && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {children}
        </div>
      )}
    </div>
  )
}
