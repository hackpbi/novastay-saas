'use client'

type VsBudget = { occDiff: number; adrDiff: number; revDiff: number }

type KpiBarProps = {
  fcst:      { occ: number; adr: number; rev: number }
  vsBudget?: VsBudget | null
  isLoaded?: boolean
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

function fmtDiffOcc(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%p'
}

function fmtDiffAdr(v: number): string {
  const k = Math.round(v / 1000)
  return (k >= 0 ? '+' : '') + k + 'K'
}

function fmtDiffRev(v: number): string {
  const m = v / 1_000_000
  return (m >= 0 ? '+' : '') + m.toFixed(1) + 'M'
}

function DiffItem({ label, value, fmtValue }: { label: string; value: number; fmtValue: string }) {
  const color = value > 0.001
    ? 'var(--color-accent-primary)'
    : value < -0.001
    ? 'var(--color-text-danger, #ef4444)'
    : 'var(--color-text-secondary)'
  return (
    <span>
      <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>{label} </span>
      <span style={{ color, fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>{fmtValue}</span>
    </span>
  )
}

const boxStyle: React.CSSProperties = {
  display:      'flex',
  alignItems:   'baseline',
  gap:          10,
  padding:      '6px 12px',
  borderRadius: 8,
  whiteSpace:   'nowrap',
}

export default function KpiBar({ fcst, vsBudget, isLoaded }: KpiBarProps) {
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

      {/* 구분선 */}
      <span style={{ fontSize: 12, color: 'var(--color-border-default)' }}>│</span>

      {/* vs Budget */}
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
        vs Budget
      </span>

      {isLoaded && vsBudget ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontSize: 12, whiteSpace: 'nowrap' }}>
          <DiffItem label="OCC" value={vsBudget.occDiff} fmtValue={fmtDiffOcc(vsBudget.occDiff)} />
          <DiffItem label="ADR" value={vsBudget.adrDiff} fmtValue={fmtDiffAdr(vsBudget.adrDiff)} />
          <DiffItem label="REV" value={vsBudget.revDiff} fmtValue={fmtDiffRev(vsBudget.revDiff)} />
        </div>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', opacity: 0.5, whiteSpace: 'nowrap' }}>
          {isLoaded ? '—' : '— (forecast를 생성하세요)'}
        </span>
      )}
    </div>
  )
}
