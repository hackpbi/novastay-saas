'use client'

type KpiBarProps = {
  fcst: { occ: number; adr: number; rev: number }
}

function fmtPct(n: number): string {
  return n.toFixed(1) + '%'
}

function fmtAdrK(adr: number): string {
  if (adr === 0) return '-'
  return Math.round(adr / 1000) + 'K'
}

function fmtRevM(rev: number): string {
  if (rev === 0) return '-'
  return (rev / 1_000_000).toFixed(1) + 'M'
}

const boxStyle: React.CSSProperties = {
  display:      'flex',
  alignItems:   'baseline',
  gap:          10,
  padding:      '6px 12px',
  borderRadius: 8,
  whiteSpace:   'nowrap',
}

export default function KpiBar({ fcst }: KpiBarProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* FCST 박스 */}
      <div style={boxStyle}>
        <span style={{
          fontSize:      10,
          fontWeight:    600,
          letterSpacing: '0.05em',
          color:         'var(--color-text-secondary)',
        }}>
          FCST
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {fmtPct(fcst.occ)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {fmtAdrK(fcst.adr)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {fmtRevM(fcst.rev)}
        </span>
      </div>

      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
        vs Budget
      </span>

      {/* Budget 박스 — 준비 중 */}
      <div style={{
        ...boxStyle,
        alignItems: 'center',
        opacity:    0.5,
      }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          준비 중
        </span>
      </div>
    </div>
  )
}
