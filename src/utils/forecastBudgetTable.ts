import type { MarketSchemaRow }    from '@/hooks/useMarketSchema'
import type { ForecastMonthlyRow } from '@/hooks/useForecastMonthly'
import type { BudgetMonthlyRow }   from '@/hooks/useBudgetMonthly'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type FcstBudgetCell = {
  nights:  number
  adr:     number   // 가중평균: revenue / nights
  revenue: number
}

export type FcstBudgetMonthly = {
  fcst:   FcstBudgetCell
  budget: FcstBudgetCell
  gap: {
    nights:  number   // fcst.nights - budget.nights
    adr:     number   // fcst.adr - budget.adr (가중평균끼리의 차)
    revenue: number   // fcst.revenue - budget.revenue
  }
}

export type FcstBudgetSegRow = {
  id:                string
  name:              string
  level:             'main' | 'mid' | 'sub'
  isBold:            boolean
  bgDarkColor:       string | null
  bgLightColor:      string | null
  fontDarkColor:     string | null
  fontLightColor:    string | null
  indent:            number
  segmentationCodes: string[]
  monthly:           Record<string, FcstBudgetMonthly>
}

export type FcstBudgetSummary = {
  monthly: Record<string, {
    fcst:   FcstBudgetCell & { occ: number; revpar: number }
    budget: FcstBudgetCell & { occ: number; revpar: number }
    gap: {
      nights:     number
      adr:        number
      revenue:    number
      occDiff:    number
      revparDiff: number
    }
    achievement: {
      occ:     number
      adr:     number
      revenue: number
    }
  }>
}

// ─── Internal ──────────────────────────────────────────────────────────────────

type RawStats = {
  fcstNights:    number
  fcstRevenue:   number
  budgetNights:  number
  budgetRevenue: number
}

function emptyRaw(): RawStats {
  return { fcstNights: 0, fcstRevenue: 0, budgetNights: 0, budgetRevenue: 0 }
}

function zeroMonthly(): FcstBudgetMonthly {
  return {
    fcst:   { nights: 0, adr: 0, revenue: 0 },
    budget: { nights: 0, adr: 0, revenue: 0 },
    gap:    { nights: 0, adr: 0, revenue: 0 },
  }
}

function toMonthly(raw: RawStats): FcstBudgetMonthly {
  const fcst: FcstBudgetCell = {
    nights:  raw.fcstNights,
    adr:     raw.fcstNights > 0 ? raw.fcstRevenue / raw.fcstNights : 0,
    revenue: raw.fcstRevenue,
  }
  const budget: FcstBudgetCell = {
    nights:  raw.budgetNights,
    adr:     raw.budgetNights > 0 ? raw.budgetRevenue / raw.budgetNights : 0,
    revenue: raw.budgetRevenue,
  }
  return {
    fcst,
    budget,
    gap: {
      nights:  fcst.nights  - budget.nights,
      adr:     fcst.adr     - budget.adr,
      revenue: fcst.revenue - budget.revenue,
    },
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function buildForecastBudgetTable(args: {
  schema:       MarketSchemaRow[]
  forecastRows: ForecastMonthlyRow[]
  budgetRows:   BudgetMonthlyRow[]
  roomCount:    number
  year:         number
}): {
  rows:      FcstBudgetSegRow[]
  summary:   FcstBudgetSummary
  monthKeys: string[]
} {
  const { schema, forecastRows, budgetRows, roomCount, year } = args

  // Step A: monthKeys — forecast + budget month_num 합집합 → 'YYYY-MM' 형식
  const allMonthNums = new Set<number>()
  for (const r of forecastRows) allMonthNums.add(r.month_num)
  for (const r of budgetRows)   allMonthNums.add(r.month_num)
  const monthKeys = [...allMonthNums]
    .sort((a, b) => a - b)
    .map(m => `${year}-${String(m).padStart(2, '0')}`)

  const monthNumFromKey = (mk: string) => Number(mk.slice(5))

  // Step B: (segCode × monthKey) raw 합산
  const rawMap = new Map<string, RawStats>()

  for (const r of forecastRows) {
    const mk  = `${year}-${String(r.month_num).padStart(2, '0')}`
    const key = `${r.segmentation}::${mk}`
    let s = rawMap.get(key)
    if (!s) { s = emptyRaw(); rawMap.set(key, s) }
    s.fcstNights  += r.forecast_nights
    s.fcstRevenue += r.forecast_revenue
  }

  for (const r of budgetRows) {
    const mk  = `${year}-${String(r.month_num).padStart(2, '0')}`
    const key = `${r.segmentation}::${mk}`
    let s = rawMap.get(key)
    if (!s) { s = emptyRaw(); rawMap.set(key, s) }
    s.budgetNights  += r.budget_nights
    s.budgetRevenue += r.budget_revenue
  }

  // Step C: codes 집합 + monthKey → raw 합산 헬퍼
  function getMonthly(codes: string[], mk: string): FcstBudgetMonthly {
    const acc = emptyRaw()
    for (const code of codes) {
      const raw = rawMap.get(`${code}::${mk}`)
      if (raw) {
        acc.fcstNights    += raw.fcstNights
        acc.fcstRevenue   += raw.fcstRevenue
        acc.budgetNights  += raw.budgetNights
        acc.budgetRevenue += raw.budgetRevenue
      }
    }
    return toMonthly(acc)
  }

  // HOU 코드 식별
  const houCodes = new Set<string>()
  for (const s of schema) {
    if (s.segmentation.includes('HOU')) {
      for (const code of s.segmentation) houCodes.add(code)
    }
  }

  // Step D: row 생성 헬퍼
  function makeRow(s: MarketSchemaRow, codes: string[]): FcstBudgetSegRow {
    const monthly: Record<string, FcstBudgetMonthly> = {}
    for (const mk of monthKeys) {
      monthly[mk] = getMonthly(codes, mk)
    }
    return {
      id:                s.id,
      name:              s.name,
      level:             s.level,
      isBold:            s.is_bold,
      bgDarkColor:       s.bg_dark_color  ?? null,
      bgLightColor:      s.bg_light_color ?? null,
      fontDarkColor:     s.font_dark_color  ?? null,
      fontLightColor:    s.font_light_color ?? null,
      indent:            s.level === 'sub' ? 1 : 0,
      segmentationCodes: codes,
      monthly,
    }
  }

  // Step E: rows 정렬 (main → 자식 sub, mid interleaving)
  const topLevel = schema
    .filter(s => s.parent_id === null)
    .sort((a, b) => a.order_index - b.order_index)

  const rows: FcstBudgetSegRow[] = []
  for (const top of topLevel) {
    if (top.level === 'main') {
      const children = schema
        .filter(c => c.parent_id === top.id)
        .sort((a, b) => a.order_index - b.order_index)
      const childCodes = children.flatMap(c => c.segmentation)
      rows.push(makeRow(top, childCodes))
      for (const child of children) {
        rows.push(makeRow(child, child.segmentation))
      }
    } else {
      rows.push(makeRow(top, top.segmentation))
    }
  }

  // Step F: summary.monthly (HOU 제외, leaf rows만 합산)
  const nonHouLeafRows = rows.filter(row =>
    row.level !== 'main' &&
    !row.segmentationCodes.some(c => houCodes.has(c))
  )

  const summaryMonthly: FcstBudgetSummary['monthly'] = {}
  for (const mk of monthKeys) {
    const acc = emptyRaw()
    for (const row of nonHouLeafRows) {
      for (const code of row.segmentationCodes) {
        const raw = rawMap.get(`${code}::${mk}`)
        if (raw) {
          acc.fcstNights    += raw.fcstNights
          acc.fcstRevenue   += raw.fcstRevenue
          acc.budgetNights  += raw.budgetNights
          acc.budgetRevenue += raw.budgetRevenue
        }
      }
    }
    const m           = toMonthly(acc)
    const monthNum    = monthNumFromKey(mk)
    const daysInMonth = new Date(year, monthNum, 0).getDate()
    const denom       = roomCount * daysInMonth

    const fcstOcc     = denom > 0 ? (m.fcst.nights  / denom) * 100 : 0
    const fcstRevpar  = denom > 0 ?  m.fcst.revenue / denom         : 0
    const budgetOcc   = denom > 0 ? (m.budget.nights  / denom) * 100 : 0
    const budgetRevpar = denom > 0 ?  m.budget.revenue / denom        : 0

    summaryMonthly[mk] = {
      fcst:   { ...m.fcst,   occ: fcstOcc,   revpar: fcstRevpar },
      budget: { ...m.budget, occ: budgetOcc, revpar: budgetRevpar },
      gap: {
        nights:     m.gap.nights,
        adr:        m.gap.adr,
        revenue:    m.gap.revenue,
        occDiff:    fcstOcc   - budgetOcc,
        revparDiff: fcstRevpar - budgetRevpar,
      },
      achievement: {
        occ:     budgetOcc     > 0 ? (fcstOcc     / budgetOcc)     * 100 : 0,
        adr:     m.budget.adr  > 0 ? (m.fcst.adr  / m.budget.adr)  * 100 : 0,
        revenue: m.budget.revenue > 0 ? (m.fcst.revenue / m.budget.revenue) * 100 : 0,
      },
    }
  }

  return { rows, summary: { monthly: summaryMonthly }, monthKeys }
}
