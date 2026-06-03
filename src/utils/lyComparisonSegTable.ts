import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { LyPacingRow }    from '@/hooks/useLyPacing'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type LyComparisonCell = {
  nights:  number
  adr:     number   // 가중평균: revenue / nights
  revenue: number
}

export type LyComparisonMonthly = {
  otb:  LyComparisonCell
  ly:   LyComparisonCell
  gap:  {
    nights:  number   // otb.nights - ly.nights
    adr:     number   // otb.adr - ly.adr (가중평균끼리의 차)
    revenue: number   // otb.revenue - ly.revenue
  }
}

export type LyComparisonSegRow = {
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
  monthly:           Record<string, LyComparisonMonthly>
}

export type LyComparisonSegSummary = {
  monthly: Record<string, {
    otb:  LyComparisonCell & { occ: number; revpar: number }
    ly:   LyComparisonCell & { occ: number; revpar: number }
    gap:  { nights: number; adr: number; revenue: number; occDiff: number; revparDiff: number }
  }>
}

// ─── Internal ──────────────────────────────────────────────────────────────────

type RawStats = {
  otbNights:  number
  otbRevenue: number
  lyNights:   number
  lyRevenue:  number
}

function emptyRaw(): RawStats {
  return { otbNights: 0, otbRevenue: 0, lyNights: 0, lyRevenue: 0 }
}

function zeroMonthly(): LyComparisonMonthly {
  return {
    otb: { nights: 0, adr: 0, revenue: 0 },
    ly:  { nights: 0, adr: 0, revenue: 0 },
    gap: { nights: 0, adr: 0, revenue: 0 },
  }
}

function toMonthly(raw: RawStats): LyComparisonMonthly {
  const otb: LyComparisonCell = {
    nights:  raw.otbNights,
    adr:     raw.otbNights > 0 ? raw.otbRevenue / raw.otbNights : 0,
    revenue: raw.otbRevenue,
  }
  const ly: LyComparisonCell = {
    nights:  raw.lyNights,
    adr:     raw.lyNights > 0 ? raw.lyRevenue / raw.lyNights : 0,
    revenue: raw.lyRevenue,
  }
  return {
    otb,
    ly,
    gap: {
      nights:  otb.nights  - ly.nights,
      adr:     otb.adr     - ly.adr,
      revenue: otb.revenue - ly.revenue,
    },
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function buildLyComparisonSegTable(args: {
  schema:    MarketSchemaRow[]
  lyPacing:  LyPacingRow[]
  roomCount: number
}): {
  rows:      LyComparisonSegRow[]
  summary:   LyComparisonSegSummary
  monthKeys: string[]
} {
  const { schema, lyPacing, roomCount } = args

  // Step A: monthKeys
  const monthKeys = Array.from(new Set(
    lyPacing.map(r => r.business_date.slice(0, 7))
  )).sort()

  // Step B: (segCode × monthKey) raw 합산
  const rawMap = new Map<string, RawStats>()
  for (const r of lyPacing) {
    const mk  = r.business_date.slice(0, 7)
    const key = `${r.segmentation}::${mk}`
    let s = rawMap.get(key)
    if (!s) { s = emptyRaw(); rawMap.set(key, s) }
    s.otbNights  += r.otb_nights  ?? 0
    s.otbRevenue += r.otb_revenue ?? 0
    s.lyNights   += r.ly_nights   ?? 0
    s.lyRevenue  += r.ly_revenue  ?? 0
  }

  // Step C: codes 집합 + monthKey → raw 합산 헬퍼
  function getMonthly(codes: string[], mk: string): LyComparisonMonthly {
    const acc = emptyRaw()
    for (const code of codes) {
      const raw = rawMap.get(`${code}::${mk}`)
      if (raw) {
        acc.otbNights  += raw.otbNights
        acc.otbRevenue += raw.otbRevenue
        acc.lyNights   += raw.lyNights
        acc.lyRevenue  += raw.lyRevenue
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
  function makeRow(s: MarketSchemaRow, codes: string[]): LyComparisonSegRow {
    const monthly: Record<string, LyComparisonMonthly> = {}
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

  const rows: LyComparisonSegRow[] = []
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

  const summaryMonthly: LyComparisonSegSummary['monthly'] = {}
  for (const mk of monthKeys) {
    const acc = emptyRaw()
    for (const row of nonHouLeafRows) {
      for (const code of row.segmentationCodes) {
        const raw = rawMap.get(`${code}::${mk}`)
        if (raw) {
          acc.otbNights  += raw.otbNights
          acc.otbRevenue += raw.otbRevenue
          acc.lyNights   += raw.lyNights
          acc.lyRevenue  += raw.lyRevenue
        }
      }
    }
    const m = toMonthly(acc)
    const [y, mo]     = mk.split('-').map(Number)
    const daysInMonth  = new Date(y, mo, 0).getDate()
    const denom        = roomCount * daysInMonth
    const otbOcc     = denom > 0 ? (m.otb.nights / denom) * 100 : 0
    const otbRevpar  = denom > 0 ?  m.otb.revenue / denom        : 0
    const lyOcc      = denom > 0 ? (m.ly.nights   / denom) * 100 : 0
    const lyRevpar   = denom > 0 ?  m.ly.revenue  / denom        : 0
    summaryMonthly[mk] = {
      otb: { ...m.otb, occ: otbOcc,  revpar: otbRevpar },
      ly:  { ...m.ly,  occ: lyOcc,   revpar: lyRevpar  },
      gap: {
        nights:     m.gap.nights,
        adr:        m.gap.adr,
        revenue:    m.gap.revenue,
        occDiff:    otbOcc  - lyOcc,
        revparDiff: otbRevpar - lyRevpar,
      },
    }
  }

  return { rows, summary: { monthly: summaryMonthly }, monthKeys }
}
