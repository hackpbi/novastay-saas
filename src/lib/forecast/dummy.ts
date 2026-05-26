import type { DailyForecast } from './types'

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const
const HOLIDAYS = new Set(['2026-05-05'])

type RuleEntry = {
  weekdayRn: [number, number]
  weekendRn: [number, number]
  adr:       [number, number]
}

const DUMMY_RULES: Record<string, RuleEntry> = {
  COR: { weekdayRn: [14, 17], weekendRn: [18, 22], adr: [200000, 220000] },
  CNC: { weekdayRn: [11, 14], weekendRn: [15, 18], adr: [175000, 195000] },
  RMO: { weekdayRn: [10, 14], weekendRn: [13, 17], adr: [170000, 195000] },
  PKG: { weekdayRn: [8,  12], weekendRn: [12, 15], adr: [180000, 210000] },
  WHD: { weekdayRn: [8,  12], weekendRn: [12, 15], adr: [165000, 190000] },
  WHO: { weekdayRn: [7,  10], weekendRn: [10, 13], adr: [160000, 185000] },
  EMP: { weekdayRn: [1,  3],  weekendRn: [1,  3],  adr: [0,      0     ] },
  MEM: { weekdayRn: [5,  8],  weekendRn: [7,  10], adr: [165000, 175000] },
  MIC: { weekdayRn: [7,  12], weekendRn: [3,  8],  adr: [130000, 160000] },
  TOG: { weekdayRn: [3,  8],  weekendRn: [2,  7],  adr: [125000, 155000] },
  COM: { weekdayRn: [1,  3],  weekendRn: [1,  3],  adr: [0,      0     ] },
  HOU: { weekdayRn: [0,  2],  weekendRn: [0,  2],  adr: [0,      0     ] },
}

const DEFAULT_RULE: RuleEntry = { weekdayRn: [5, 15], weekendRn: [10, 20], adr: [150000, 200000] }

function seeded(n: number): number {
  return (((n * 1664525 + 1013904223) | 0) >>> 0) / 0xffffffff
}

function randBetween(min: number, max: number, t: number): number {
  return Math.round(min + (max - min) * t)
}

export function getDummyForecast(allSegCodes: string[]): DailyForecast[] {
  return Array.from({ length: 31 }, (_, i) => {
    const date = new Date(2026, 4, i + 1)
    const dow = date.getDay()
    const isWeekend = dow === 5 || dow === 6
    const business_date = `2026-05-${String(i + 1).padStart(2, '0')}`
    const isHoliday = HOLIDAYS.has(business_date)
    const day_label = `5/${i + 1} (${DAY_KO[dow]})`

    const values: DailyForecast['values'] = {}
    allSegCodes.forEach((code, si) => {
      const rule = DUMMY_RULES[code] ?? DEFAULT_RULE
      const seed = i * 31 + si
      const [rnMin, rnMax] = isWeekend ? rule.weekendRn : rule.weekdayRn
      const baseRn = randBetween(rnMin, rnMax, seeded(seed))
      const rn = isHoliday ? Math.round(baseRn * 1.5) : baseRn
      const [adrMin, adrMax] = rule.adr
      const adr = adrMin === 0 ? 0 : randBetween(adrMin, adrMax, seeded(seed + 1000))
      values[code] = { rn, adr, rev: rn * adr }
    })

    return { business_date, day_label, values }
  })
}
