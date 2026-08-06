import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { TodayPickupRow }  from '@/hooks/useTodayPickup'

// ─── Types ─────────────────────────────────────────────────────────────────────
// lyComparisonSegTable.ts를 동일 구조로 복제. 값 그룹만 교체:
//   원본 otb / ly / gap  →  base(새벽·from) / cur(현재·to) / pu(픽업)
// ※ pu는 pickup 방향(cur − base)으로 계산한다. 원본 gap은 (otb − ly)=(1번째 − 2번째)이나
//   당일픽업은 (현재 − 새벽)=(2번째 − 1번째)가 의미상 맞으므로 이 부분만 방향이 반대다.

export type TodayPickupCell = {
  nights:  number
  adr:     number   // 가중평균: revenue / nights
  revenue: number
}

export type TodayPickupMonthly = {
  base: TodayPickupCell
  cur:  TodayPickupCell
  pu:   {
    nights:  number   // cur.nights - base.nights
    adr:     number   // cur.adr - base.adr (가중평균끼리의 차)
    revenue: number   // cur.revenue - base.revenue
  }
}

export type TodayPickupSegRow = {
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
  monthly:           Record<string, TodayPickupMonthly>
}

export type TodayPickupSegSummary = {
  monthly: Record<string, {
    base: TodayPickupCell & { occ: number; revpar: number }
    cur:  TodayPickupCell & { occ: number; revpar: number }
    pu:   { nights: number; adr: number; revenue: number; occDiff: number; revparDiff: number }
  }>
}

// ─── Internal ──────────────────────────────────────────────────────────────────

type RawStats = {
  baseNights:  number
  baseRevenue: number
  curNights:   number
  curRevenue:  number
}

function emptyRaw(): RawStats {
  return { baseNights: 0, baseRevenue: 0, curNights: 0, curRevenue: 0 }
}

function zeroMonthly(): TodayPickupMonthly {
  return {
    base: { nights: 0, adr: 0, revenue: 0 },
    cur:  { nights: 0, adr: 0, revenue: 0 },
    pu:   { nights: 0, adr: 0, revenue: 0 },
  }
}

function toMonthly(raw: RawStats): TodayPickupMonthly {
  const base: TodayPickupCell = {
    nights:  raw.baseNights,
    adr:     raw.baseNights > 0 ? raw.baseRevenue / raw.baseNights : 0,
    revenue: raw.baseRevenue,
  }
  const cur: TodayPickupCell = {
    nights:  raw.curNights,
    adr:     raw.curNights > 0 ? raw.curRevenue / raw.curNights : 0,
    revenue: raw.curRevenue,
  }
  return {
    base,
    cur,
    pu: {
      nights:  cur.nights  - base.nights,
      adr:     cur.adr     - base.adr,
      revenue: cur.revenue - base.revenue,
    },
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function buildTodayPickupSegTable(args: {
  schema:    MarketSchemaRow[]
  todayRows: TodayPickupRow[]
  roomCount: number
}): {
  rows:      TodayPickupSegRow[]
  summary:   TodayPickupSegSummary
  monthKeys: string[]
} {
  const { schema, todayRows, roomCount } = args

  // Step A: monthKeys
  const monthKeys = Array.from(new Set(
    todayRows.map(r => r.business_date.slice(0, 7))
  )).sort()

  // Step B: (segCode × monthKey) raw 합산
  const rawMap = new Map<string, RawStats>()
  for (const r of todayRows) {
    const mk  = r.business_date.slice(0, 7)
    const key = `${r.segmentation}::${mk}`
    let s = rawMap.get(key)
    if (!s) { s = emptyRaw(); rawMap.set(key, s) }
    s.baseNights  += r.base_nights  ?? 0
    s.baseRevenue += r.base_revenue ?? 0
    s.curNights   += r.cur_nights   ?? 0
    s.curRevenue  += r.cur_revenue  ?? 0
  }

  // Step C: codes 집합 + monthKey → raw 합산 헬퍼
  function getMonthly(codes: string[], mk: string): TodayPickupMonthly {
    const acc = emptyRaw()
    for (const code of codes) {
      const raw = rawMap.get(`${code}::${mk}`)
      if (raw) {
        acc.baseNights  += raw.baseNights
        acc.baseRevenue += raw.baseRevenue
        acc.curNights   += raw.curNights
        acc.curRevenue  += raw.curRevenue
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
  function makeRow(s: MarketSchemaRow, codes: string[]): TodayPickupSegRow {
    const monthly: Record<string, TodayPickupMonthly> = {}
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

  const rows: TodayPickupSegRow[] = []
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

  const summaryMonthly: TodayPickupSegSummary['monthly'] = {}
  for (const mk of monthKeys) {
    const acc = emptyRaw()
    for (const row of nonHouLeafRows) {
      for (const code of row.segmentationCodes) {
        const raw = rawMap.get(`${code}::${mk}`)
        if (raw) {
          acc.baseNights  += raw.baseNights
          acc.baseRevenue += raw.baseRevenue
          acc.curNights   += raw.curNights
          acc.curRevenue  += raw.curRevenue
        }
      }
    }
    const m = toMonthly(acc)
    const [y, mo]     = mk.split('-').map(Number)
    const daysInMonth  = new Date(y, mo, 0).getDate()
    const denom        = roomCount * daysInMonth
    const baseOcc    = denom > 0 ? (m.base.nights / denom) * 100 : 0
    const baseRevpar = denom > 0 ?  m.base.revenue / denom        : 0
    const curOcc     = denom > 0 ? (m.cur.nights  / denom) * 100 : 0
    const curRevpar  = denom > 0 ?  m.cur.revenue / denom         : 0
    summaryMonthly[mk] = {
      base: { ...m.base, occ: baseOcc, revpar: baseRevpar },
      cur:  { ...m.cur,  occ: curOcc,  revpar: curRevpar  },
      pu: {
        nights:     m.pu.nights,
        adr:        m.pu.adr,
        revenue:    m.pu.revenue,
        occDiff:    curOcc    - baseOcc,
        revparDiff: curRevpar - baseRevpar,
      },
    }
  }

  return { rows, summary: { monthly: summaryMonthly }, monthKeys }
}
