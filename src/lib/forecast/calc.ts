import type { DailyForecast, SegmentValue } from './types'

export function calcNodeValue(row: DailyForecast, segCodes: string[]): SegmentValue {
  let rn = 0, rev = 0
  for (const code of segCodes) {
    const v = row.values[code]
    if (v) { rn += v.rn; rev += v.rev }
  }
  return { rn, adr: rn > 0 ? Math.round(rev / rn) : 0, rev }
}
