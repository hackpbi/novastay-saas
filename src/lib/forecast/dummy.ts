import { FORECAST_SEGMENTS } from './segments'
import type { DailyForecast, SegmentValue } from './types'

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

// 2026년 5월 공휴일
const HOLIDAYS = new Set(['2026-05-05']) // 어린이날

type SegCfg = {
  weekdayRnMin: number
  weekdayRnMax: number
  weekendRnMin: number
  weekendRnMax: number
  adrMin: number  // 원
  adrMax: number  // 원
  isFree: boolean
}

const SEG_CONFIG: Record<string, SegCfg> = {
  corpfit:  { weekdayRnMin: 25, weekdayRnMax: 30, weekendRnMin: 35, weekendRnMax: 40, adrMin: 180000, adrMax: 210000, isFree: false },
  direct:   { weekdayRnMin: 18, weekdayRnMax: 25, weekendRnMin: 25, weekendRnMax: 30, adrMin: 175000, adrMax: 205000, isFree: false },
  ta:       { weekdayRnMin: 15, weekdayRnMax: 20, weekendRnMin: 20, weekendRnMax: 25, adrMin: 165000, adrMax: 190000, isFree: false },
  employee: { weekdayRnMin: 1,  weekdayRnMax: 3,  weekendRnMin: 1,  weekendRnMax: 3,  adrMin: 0,      adrMax: 0,      isFree: true  },
  member:   { weekdayRnMin: 5,  weekdayRnMax: 10, weekendRnMin: 5,  weekendRnMax: 10, adrMin: 165000, adrMax: 175000, isFree: false },
  group:    { weekdayRnMin: 10, weekdayRnMax: 20, weekendRnMin: 5,  weekendRnMax: 15, adrMin: 130000, adrMax: 160000, isFree: false },
  comp:     { weekdayRnMin: 1,  weekdayRnMax: 3,  weekendRnMin: 1,  weekendRnMax: 3,  adrMin: 0,      adrMax: 0,      isFree: true  },
  houseuse: { weekdayRnMin: 0,  weekdayRnMax: 2,  weekendRnMin: 0,  weekendRnMax: 2,  adrMin: 0,      adrMax: 0,      isFree: true  },
}

function seeded(n: number): number {
  const s = ((n * 1664525 + 1013904223) | 0) >>> 0
  return s / 0xffffffff
}

function randBetween(min: number, max: number, t: number): number {
  return Math.round(min + (max - min) * t)
}

function buildDaySegments(
  dayIndex: number,
  dayOfWeek: number,
  isHoliday: boolean,
): Record<string, SegmentValue> {
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6
  const result: Record<string, SegmentValue> = {}

  FORECAST_SEGMENTS.forEach((seg, si) => {
    const cfg = SEG_CONFIG[seg.id]
    const seed = dayIndex * 13 + si

    if (cfg.isFree) {
      const rn = randBetween(cfg.weekdayRnMin, cfg.weekdayRnMax, seeded(seed))
      result[seg.id] = { rn, adr: 0, rev: 0 }
    } else {
      const rnMin = isWeekend ? cfg.weekendRnMin : cfg.weekdayRnMin
      const rnMax = isWeekend ? cfg.weekendRnMax : cfg.weekdayRnMax
      const baseRn = randBetween(rnMin, rnMax, seeded(seed))
      const rn = isHoliday ? Math.round(baseRn * 1.5) : baseRn
      const adr = randBetween(cfg.adrMin, cfg.adrMax, seeded(seed + 100))
      result[seg.id] = { rn, adr, rev: rn * adr }
    }
  })

  return result
}

export function getDummyForecast(): DailyForecast[] {
  return Array.from({ length: 31 }, (_, i) => {
    const date = new Date(2026, 4, i + 1) // May 2026 (month is 0-indexed)
    const dow = date.getDay()
    const business_date = `2026-05-${String(i + 1).padStart(2, '0')}`
    const day_label = `5/${i + 1} (${DAY_KO[dow]})`

    return {
      business_date,
      day_label,
      segments: buildDaySegments(i, dow, HOLIDAYS.has(business_date)),
    }
  })
}
