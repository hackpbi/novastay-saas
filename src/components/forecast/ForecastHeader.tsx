'use client'

import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ForecastHeaderProps {
  year:          number
  month:         number
  onPrev:        () => void
  onNext:        () => void
  rightExtra?:   ReactNode   // 2행 우측: 불러오기 (테두리 없음)
  viewControls?: ReactNode   // 3행 우측: 보기 그룹 내부
  editControls?: ReactNode   // 3행 우측: 편집 그룹 내부
}

const navBtnStyle: React.CSSProperties = {
  width:          24,
  height:         24,
  borderRadius:   6,
  border:         '0.5px solid rgba(255,255,255,0.12)',
  background:     'rgba(255,255,255,0.05)',
  color:          'rgba(255,255,255,0.45)',
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  cursor:         'pointer',
  flexShrink:     0,
}

export default function ForecastHeader({
  year, month, onPrev, onNext,
  rightExtra, viewControls, editControls,
}: ForecastHeaderProps) {
  return (
    <div>
      {/* 1행: Daily Forecast */}
      <div style={{ padding: '12px 0 0' }}>
        <div style={{
          fontSize:      22,
          fontWeight:    700,
          color:         'var(--color-text-primary)',
          letterSpacing: '-0.02em',
          lineHeight:    1,
        }}>
          Daily Forecast
        </div>
      </div>

      {/* 2행: by Segmentation (좌) + 불러오기 (우) */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '4px 0 10px',
      }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          by Segmentation
        </span>
        {rightExtra && (
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {rightExtra}
          </div>
        )}
      </div>

      {/* 구분선 */}
      <div style={{ height: 1, background: 'var(--color-border-default)', marginBottom: 10 }} />

      {/* 3행: < 월 > (좌) + 보기/편집 그룹 (우) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {/* 좌: 월 네비 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onPrev}
            style={navBtnStyle}
            aria-label="이전 월"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
          >
            <ChevronLeft size={13} />
          </button>
          <span style={{
            fontSize:  15,
            fontWeight: 600,
            color:     'var(--color-text-primary)',
            whiteSpace: 'nowrap',
            minWidth:  80,
            textAlign: 'center',
          }}>
            {year}년 {month}월
          </span>
          <button
            onClick={onNext}
            style={navBtnStyle}
            aria-label="다음 월"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
          >
            <ChevronRight size={13} />
          </button>
        </div>

        {/* 우: 보기 + 편집 그룹 */}
        {(viewControls || editControls) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {viewControls && (
              <div style={{
                display:      'inline-flex',
                alignItems:   'stretch',
                borderRadius: 7,
                border:       '0.5px solid var(--color-border-secondary)',
                background:   'var(--color-bg-elevated)',
                overflow:     'hidden',
              }}>
                <span style={{
                  display:     'flex',
                  alignItems:  'center',
                  padding:     '0 7px 0 9px',
                  fontSize:    10,
                  color:       'var(--color-text-tertiary)',
                  borderRight: '0.5px solid var(--color-border-secondary)',
                  whiteSpace:  'nowrap',
                }}>
                  보기
                </span>
                {viewControls}
              </div>
            )}
            {editControls && (
              <div style={{
                display:      'inline-flex',
                alignItems:   'stretch',
                borderRadius: 7,
                border:       '0.5px solid var(--color-border-secondary)',
                background:   'var(--color-bg-elevated)',
                overflow:     'hidden',
              }}>
                <span style={{
                  display:     'flex',
                  alignItems:  'center',
                  padding:     '0 7px 0 9px',
                  fontSize:    10,
                  color:       'var(--color-text-tertiary)',
                  borderRight: '0.5px solid var(--color-border-secondary)',
                  whiteSpace:  'nowrap',
                }}>
                  편집
                </span>
                {editControls}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
