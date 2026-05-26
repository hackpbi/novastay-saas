export function fmtRn(rn: number): string {
  if (rn === 0) return '-'
  return Math.round(rn).toLocaleString()
}

export function fmtAdr(adr: number): string {
  if (adr === 0) return '-'
  return Math.round(adr / 1000).toLocaleString()
}

export function fmtRev(rev: number): string {
  if (rev === 0) return '-'
  return (rev / 1_000_000).toFixed(1)
}

export function fmtOcc(rn: number, roomCount: number): string {
  if (roomCount === 0 || rn === 0) return '-'
  return ((rn / roomCount) * 100).toFixed(1) + '%'
}

// ── Card summary helpers ───────────────────────────────────────────────────────

export function fmtMillion(won: number): string {
  return '₩' + (won / 1_000_000).toFixed(1) + 'M'
}

export function fmtThousand(won: number): string {
  return '₩' + Math.round(won / 1000).toLocaleString() + 'K'
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString()
}

export function fmtPct(n: number): string {
  return n.toFixed(1) + '%'
}
