'use client'

import { useEffect } from 'react'
import type { MonthStat } from './MtdStatusPage'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const COLS = ['지표', 'Actual', 'Budget', 'vs Budget', 'LY', 'vs LY']

interface MtdStatusModalProps {
  year:          number
  month:         number
  stat:          MonthStat
  roomCount:     number
  onClose:       () => void
  onMonthChange: (month: number) => void
}

const POS = '#00E5A0'
const NEG = '#E24B4A'
const gapColor = (d: number) => (d > 0 ? POS : d < 0 ? NEG : '#666')

export default function MtdStatusModal({ year, month, stat, roomCount, onClose, onMonthChange }: MtdStatusModalProps) {
  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isOTB = stat.type === 'OTB'
  const days  = new Date(year, month, 0).getDate()
  const avail = roomCount * days

  const calc = (rn: number, rev: number) => ({
    occ:    avail > 0 ? (rn / avail) * 100 : 0,
    adr:    rn > 0 ? rev / rn : 0,
    revpar: avail > 0 ? rev / avail : 0,
    rev,
  })
  const A = calc(stat.actualRn, stat.actualRev)
  const B = calc(stat.budgetRn, stat.budgetRev)
  const L = calc(stat.lyRn, stat.lyRev)

  const fmtPct = (v: number) => `${v.toFixed(1)}%`
  const fmtK   = (v: number) => `₩${Math.round(v / 1000)}K`
  const fmtM   = (v: number) => `${(v / 1_000_000).toFixed(1)}M`
  const gapPct = (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(1)}%p`
  const gapK   = (d: number) => `${d >= 0 ? '+' : '-'}₩${Math.abs(Math.round(d / 1000))}K`
  const gapM   = (d: number) => `${d >= 0 ? '+' : ''}${(d / 1_000_000).toFixed(1)}M`

  const rows = [
    { key: 'OCC%',   a: A.occ,    b: B.occ,    l: L.occ,    fmt: fmtPct, gap: gapPct },
    { key: 'ADR',    a: A.adr,    b: B.adr,    l: L.adr,    fmt: fmtK,   gap: gapK },
    { key: 'RevPAR', a: A.revpar, b: B.revpar, l: L.revpar, fmt: fmtK,   gap: gapK },
    { key: 'REV',    a: A.rev,    b: B.rev,    l: L.rev,    fmt: fmtM,   gap: gapM },
  ]

  const th: React.CSSProperties = { fontSize: 11, color: '#555', fontWeight: 500, padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { fontSize: 12, padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1px solid #1a1a1a' }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: '#141414', borderRadius: 12, border: '1px solid #2a2a2a', width: 560, maxWidth: '92vw', overflow: 'hidden' }}>

        {/* 헤더 — 월 네비 + 뱃지 + 닫기 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #1e1e1e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => onMonthChange(month - 1)}
              disabled={month <= 1}
              style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: '#1a1a1a', color: '#888', cursor: 'pointer', fontSize: 15, opacity: month <= 1 ? 0.3 : 1 }}
            >‹</button>
            <span style={{ fontSize: 15, fontWeight: 500, minWidth: 92, textAlign: 'center' }}>{MON[month - 1]} {year}</span>
            <button
              onClick={() => onMonthChange(month + 1)}
              disabled={month >= 12}
              style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: '#1a1a1a', color: '#888', cursor: 'pointer', fontSize: 15, opacity: month >= 12 ? 0.3 : 1 }}
            >›</button>
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 500, marginLeft: 4,
              ...(isOTB
                ? { background: '#0d1a2e', color: '#5B8DEF', border: '1px solid #1e3a5a' }
                : { background: '#0d2a1f', color: '#00E5A0', border: '1px solid #0d3a28' }),
            }}>
              {isOTB ? 'OTB' : 'Actual'}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* 4×5 테이블 */}
        <div style={{ padding: '8px 6px 14px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {COLS.map((c, i) => (
                  <th key={c} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const bGap = r.a - r.b
                const lGap = r.a - r.l
                return (
                  <tr key={r.key}>
                    <td style={{ ...td, textAlign: 'left', color: '#888' }}>{r.key}</td>
                    <td style={{ ...td, color: '#fff', fontWeight: 500 }}>{r.fmt(r.a)}</td>
                    <td style={{ ...td, color: '#aaa' }}>{r.fmt(r.b)}</td>
                    <td style={{ ...td, color: gapColor(bGap), fontWeight: 500 }}>{r.gap(bGap)}</td>
                    <td style={{ ...td, color: '#aaa' }}>{r.fmt(r.l)}</td>
                    <td style={{ ...td, color: gapColor(lGap), fontWeight: 500 }}>{r.gap(lGap)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
