'use client'

import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ForecastHeaderProps {
  year:      number
  month:     number
  onPrev:    () => void
  onNext:    () => void
  // 1행 우측: 불러오기 + 자동생성 버튼 영역
  rightActions?: ReactNode
  // 2행 좌측: KPI 바
  kpiBar?: ReactNode
  // 2행 우측: 보기그룹 + 수정토글
  rightControls?: ReactNode
}

const navBtnStyle: React.CSSProperties = {
  width:          22,
  height:         22,
  borderRadius:   5,
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
  rightActions, kpiBar, rightControls,
}: ForecastHeaderProps) {
  return (
    <div>
      {/* 1행: 월 네비 (좌) + 데이터 액션 (우) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <button onClick={onPrev} style={navBtnStyle} aria-label="이전 월"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
          >
            <ChevronLeft size={12} />
          </button>
          <span style={{
            fontSize: 14, fontWeight: 500,
            color: 'var(--color-text-primary)',
            margin: '0 8px', minWidth: 80, textAlign: 'center', whiteSpace: 'nowrap',
          }}>
            {year}년 {month}월
          </span>
          <button onClick={onNext} style={navBtnStyle} aria-label="다음 월"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
          >
            <ChevronRight size={12} />
          </button>
        </div>
        {rightActions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {rightActions}
          </div>
        )}
      </div>

      {/* 구분선 */}
      {(kpiBar || rightControls) && (
        <div style={{ height: 1, background: 'var(--color-border-default)', margin: '10px 0' }} />
      )}

      {/* 2행: KPI 바 (좌) + 보기·수정 컨트롤 (우) */}
      {(kpiBar || rightControls) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {kpiBar}
          </div>
          {rightControls && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {rightControls}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
