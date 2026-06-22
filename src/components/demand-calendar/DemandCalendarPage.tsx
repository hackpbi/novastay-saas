'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDateContext } from '@/contexts/DateContext'
import { generateMockDemandData } from './mockData'
import DemandCalendar from './DemandCalendar'

const LEGEND = [
  { label: '현재 OTB',       color: '#00E5A0' },
  { label: '픽업기준 D-30',  color: 'rgba(184,169,255,0.85)' },
  { label: '전년동기',       color: 'rgba(180,178,169,0.75)' },
]

export default function DemandCalendarPage() {
  const { otbDate } = useDateContext()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const [calYear, setCalYear]   = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())

  const otbDateObj = useMemo(() => (otbDate ? new Date(otbDate + 'T00:00:00') : today), [otbDate])  // eslint-disable-line react-hooks/exhaustive-deps
  const data = useMemo(() => generateMockDemandData(calYear, calMonth, otbDateObj), [calYear, calMonth, otbDateObj])

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
  }

  const navBtn = "w-7 h-7 flex items-center justify-center rounded-lg text-brand-muted hover:text-brand-text transition-all duration-150"

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>Demand Calendar</h1>
      <p className="text-[13px] mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        현재 OTB · 픽업기준(D-30) · 전년동기 점유율을 한눈에 (mock 데이터)
      </p>

      {/* 월 네비 + OTB 기준 + 범례 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className={navBtn} style={{ border: '1px solid var(--control-border)' }} aria-label="이전 달"><ChevronLeft size={15} /></button>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{calYear}년 {calMonth + 1}월</span>
          <button onClick={nextMonth} className={navBtn} style={{ border: '1px solid var(--control-border)' }} aria-label="다음 달"><ChevronRight size={15} /></button>
        </div>
        <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>
          OTB 기준: {otbDate || todayStr}
        </span>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {LEGEND.map(l => (
          <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-text-secondary)' }}>
            <span style={{ width: 12, height: 6, borderRadius: 2, background: l.color, flexShrink: 0 }} />
            {l.label}
          </span>
        ))}
      </div>

      <DemandCalendar year={calYear} month={calMonth} data={data} today={todayStr} otbDate={otbDateObj} />
    </div>
  )
}
