'use client'

import type { DemandDayData } from './types'
import { DOW } from '@/utils/dateUtils'

const GREEN = '#3B6D11'
const RED   = '#A32D2D'
const TOOLTIP_W = 210

const fmtDot = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${DOW[d.getDay()]}`
const fmtWon = (n: number) => `₩${n.toLocaleString('ko-KR')}`
const fmtPp  = (n: number) => `${n > 0 ? '+' : ''}${n}%p`

export default function DemandCellTooltip({ data, otbDate, anchor }: {
  data:    DemandDayData
  otbDate: Date
  anchor:  DOMRect
}) {
  const biz = new Date(data.businessDate + 'T00:00:00')
  const pkDate = new Date(otbDate.getTime() - 30 * 86400000)        // 픽업기준 (D-30)
  const lyDate = new Date(biz.getTime() - 364 * 86400000)           // 전년동기 (yoy weekday match)

  const pickup = data.otbOcc - data.pkOcc
  const vsLy   = data.otbOcc - data.lyOcc

  // 위치 — 셀 우측, 화면 밖이면 좌측 반전
  const flipLeft = anchor.right + 8 + TOOLTIP_W > window.innerWidth
  const left = flipLeft ? anchor.left - TOOLTIP_W - 8 : anchor.right + 8
  const top  = Math.max(8, Math.min(anchor.top, window.innerHeight - 230))

  const secHead: React.CSSProperties = { fontSize: 9, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, marginTop: 8 }
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--color-text-primary)', padding: '1px 0' }
  const lbl: React.CSSProperties = { color: 'var(--color-text-secondary)', fontSize: 11 }

  return (
    <div style={{
      position: 'fixed', left, top, width: TOOLTIP_W, zIndex: 1000, pointerEvents: 'none',
      background: '#0a0a0a', border: '0.5px solid #333', borderRadius: 8, padding: '10px 12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#e5e5e5', paddingBottom: 6, borderBottom: '0.5px solid #333' }}>
        {fmtDot(biz)}{data.holidayName ? ` · ${data.holidayName}` : ''}
      </div>

      <div style={secHead}>현재 OTB</div>
      <div style={row}><span style={lbl}>OCC</span><span>{data.otbOcc}%</span></div>
      <div style={row}><span style={lbl}>ADR</span><span>{fmtWon(data.otbAdr)}</span></div>

      <div style={secHead}>픽업기준 ({fmtDot(pkDate).slice(0, 10)})</div>
      <div style={row}><span style={lbl}>OCC</span><span>{data.pkOcc}%</span></div>
      <div style={row}><span style={lbl}>픽업</span><span style={{ color: pickup >= 0 ? GREEN : RED }}>{fmtPp(pickup)}</span></div>

      <div style={secHead}>전년동기 ({fmtDot(lyDate).slice(0, 10)})</div>
      <div style={row}><span style={lbl}>OCC</span><span>{data.lyOcc}%</span></div>
      <div style={row}><span style={lbl}>ADR</span><span>{fmtWon(data.lyAdr)}</span></div>
      <div style={row}><span style={lbl}>vs LY</span><span style={{ color: vsLy >= 0 ? GREEN : RED }}>{fmtPp(vsLy)}</span></div>
    </div>
  )
}
