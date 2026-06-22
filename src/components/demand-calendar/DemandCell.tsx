'use client'

import { useState } from 'react'
import type { DemandDayData } from './types'
import DemandCellTooltip from './DemandCellTooltip'

const BASE_BG = 'var(--color-bg-surface)'

function otbColor(occ: number): string {
  if (occ >= 95) return '#E24B4A'
  if (occ >= 80) return '#1D9E75'
  return '#00E5A0'
}

function Bar({ label, occ, color }: { label: string; occ: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)', width: 22, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${occ}%`, height: '100%', borderRadius: 2, background: color }} />
      </div>
      <span style={{ fontSize: 9, color: 'var(--color-text-secondary)', width: 26, textAlign: 'right', flexShrink: 0 }}>{occ}%</span>
    </div>
  )
}

export default function DemandCell({ data, today, otbDate }: {
  data:    DemandDayData
  today:   string       // 'YYYY-MM-DD'
  otbDate: Date
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  const date = new Date(data.businessDate + 'T00:00:00')
  const dow  = date.getDay()
  const dayNum = date.getDate()
  const isToday   = data.businessDate === today
  const isSat     = dow === 6
  const isSun     = dow === 0
  const vsLy = data.otbOcc - data.lyOcc

  const dateColor = isSun ? '#E24B4A' : isSat ? '#378ADD' : 'var(--color-text-primary)'

  const bg = data.isHoliday
    ? `color-mix(in srgb, #E24B4A 7%, ${BASE_BG})`
    : isSat
      ? `color-mix(in srgb, #378ADD 6%, ${BASE_BG})`
      : BASE_BG

  const border = isToday
    ? '1.5px solid #00E5A0'
    : data.isHoliday
      ? '1px solid color-mix(in srgb, #E24B4A 35%, var(--color-border-default))'
      : '1px solid var(--color-border-default)'

  return (
    <div
      onMouseEnter={e => setAnchor(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
      style={{
        position: 'relative', minHeight: 80, borderRadius: 7, padding: '5px 6px',
        background: bg, border, display: 'flex', flexDirection: 'column', gap: 3, cursor: 'default',
      }}
    >
      {/* 날짜 + 공휴일명 */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: dateColor, lineHeight: 1 }}>{dayNum}</span>
        {data.holidayName && (
          <span style={{ fontSize: 8, color: '#E24B4A', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.holidayName}</span>
        )}
      </div>

      {/* 3개 바 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 1 }}>
        <Bar label="현재"  occ={data.otbOcc} color={otbColor(data.otbOcc)} />
        <Bar label="D-30"  occ={data.pkOcc}  color="rgba(184,169,255,0.75)" />
        <Bar label="전년"  occ={data.lyOcc}  color="rgba(180,178,169,0.55)" />
      </div>

      {/* vs LY 배지 */}
      {Math.abs(vsLy) >= 3 && (
        <span style={{
          position: 'absolute', right: 5, bottom: 4, fontSize: 8, fontWeight: 600, padding: '1px 4px', borderRadius: 4,
          color: vsLy >= 3 ? '#00B883' : '#E24B4A',
          background: vsLy >= 3 ? 'rgba(0,180,130,0.14)' : 'rgba(226,75,74,0.14)',
        }}>
          {vsLy > 0 ? '+' : ''}{vsLy}%p
        </span>
      )}

      {anchor && <DemandCellTooltip data={data} otbDate={otbDate} anchor={anchor} />}
    </div>
  )
}
