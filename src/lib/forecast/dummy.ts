import { SEGMENTS } from './segments'

export type SegmentValue = {
  rn: number
  adr: number
  rev: number
}

export type DailyForecast = {
  business_date: string
  day_label: string
  segments: Record<string, SegmentValue>
}

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

const FREE_SEGMENTS = new Set(['employee', 'comp', 'houseuse'])

const BASE_CONFIG: Record<string, { baseRn: number; baseAdr: number }> = {
  corpfit:  { baseRn: 25, baseAdr: 198 },
  direct:   { baseRn: 18, baseAdr: 182 },
  ta:       { baseRn: 12, baseAdr: 162 },
  employee: { baseRn: 3,  baseAdr: 0 },
  member:   { baseRn: 6,  baseAdr: 138 },
  group:    { baseRn: 10, baseAdr: 147 },
  comp:     { baseRn: 2,  baseAdr: 0 },
  houseuse: { baseRn: 1,  baseAdr: 0 },
}

function seeded(n: number): number {
  const s = ((n * 1664525 + 1013904223) | 0) >>> 0
  return s / 0xffffffff
}

function generateDayData(dayIndex: number, dayOfWeek: number): Record<string, SegmentValue> {
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6
  const wf = isWeekend ? 1.3 : 1.0
  const result: Record<string, SegmentValue> = {}

  SEGMENTS.forEach((seg, si) => {
    const cfg = BASE_CONFIG[seg.id]
    const seed = dayIndex * 17 + si

    if (FREE_SEGMENTS.has(seg.id)) {
      const rn = Math.max(1, Math.round(cfg.baseRn * (0.9 + seeded(seed + 100) * 0.4)))
      result[seg.id] = { rn, adr: 0, rev: 0 }
    } else {
      const rnVar = 0.88 + seeded(seed) * 0.24
      const adrVar = 0.94 + seeded(seed + 200) * 0.12
      const rn = Math.max(1, Math.round(cfg.baseRn * wf * rnVar))
      const adr = Math.round(cfg.baseAdr * adrVar)
      result[seg.id] = { rn, adr, rev: rn * adr }
    }
  })

  return result
}

export const FORECAST_MAY_2026: DailyForecast[] = Array.from({ length: 31 }, (_, i) => {
  const date = new Date(2026, 4, i + 1)
  const dow = date.getDay()
  const business_date = `2026-05-${String(i + 1).padStart(2, '0')}`
  const day_label = `5/${i + 1} (${DAY_KO[dow]})`
  return {
    business_date,
    day_label,
    segments: generateDayData(i, dow),
  }
})
