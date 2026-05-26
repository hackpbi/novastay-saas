import type { SegmentValue } from './types'

export function calcTotal(segments: Record<string, SegmentValue>): SegmentValue {
  let totalRn = 0
  let totalRev = 0
  for (const sv of Object.values(segments)) {
    totalRn += sv.rn
    totalRev += sv.rev
  }
  return {
    rn: totalRn,
    adr: totalRn > 0 ? Math.round(totalRev / totalRn) : 0,
    rev: totalRev,
  }
}
