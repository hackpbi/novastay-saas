export function fmtRn(rn: number): string {
  return rn.toLocaleString()
}

export function fmtAdr(adr: number): string {
  if (adr === 0) return '-'
  return Math.round(adr / 1000).toLocaleString()
}

export function fmtRev(rev: number): string {
  if (rev === 0) return '-'
  return Math.round(rev / 1000).toLocaleString()
}
