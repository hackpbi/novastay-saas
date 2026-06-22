'use client'

import type { DemandDayData } from './types'
import DemandCell from './DemandCell'
import { DOW } from '@/utils/dateUtils'

export default function DemandCalendar({ year, month, data, today, otbDate }: {
  year:    number
  month:   number   // 0-based
  data:    DemandDayData[]
  today:   string
  otbDate: Date
}) {
  const firstDow = new Date(year, month, 1).getDay()
  const leading  = Array.from({ length: firstDow })

  return (
    <div>
      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
        {DOW.map((d, i) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 500, padding: '2px 0', color: i === 0 ? '#E24B4A' : i === 6 ? '#378ADD' : 'var(--color-text-secondary)' }}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 셀 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {leading.map((_, i) => <div key={`lead-${i}`} />)}
        {data.map(d => (
          <DemandCell key={d.businessDate} data={d} today={today} otbDate={otbDate} />
        ))}
      </div>
    </div>
  )
}
