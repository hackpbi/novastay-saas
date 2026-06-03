import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { LyPacingRow }    from '@/hooks/useLyPacing'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type LyComparisonCell = {
  nights:  number
  adr:     number   // 가중평균: revenue / nights
  revenue: number
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
  otb:  LyComparisonCell
  ly:   LyComparisonCell
  gap:  { nights: number; revenue: number }
}

export type LyComparisonSegSummary = {
  otb:  LyComparisonCell & { occ: number; revpar: number }
  ly:   LyComparisonCell & { occ: number; revpar: number }
  gap:  { nights: number; revenue: number; occDiff: number; revparDiff: number }
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

function toCell(nights: number, revenue: number): LyComparisonCell {
  return {
    nights,
    adr:     nights > 0 ? revenue / nights : 0,
    revenue,
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function buildLyComparisonSegTable(args: {
  schema:    MarketSchemaRow[]
  lyPacing:  LyPacingRow[]
  roomCount: number
}): {
  rows:    LyComparisonSegRow[]
  summary: LyComparisonSegSummary
} {
  const { schema, lyPacing, roomCount } = args

  // Step A: segCode 단위 raw 누적 (business_date / account_name 무관)
  const rawMap = new Map<string, RawStats>()
  for (const r of lyPacing) {
    const code = r.segmentation
    let s = rawMap.get(code)
    if (!s) { s = emptyRaw(); rawMap.set(code, s) }
    s.otbNights  += r.otb_nights  ?? 0
    s.otbRevenue += r.otb_revenue ?? 0
    s.lyNights   += r.ly_nights   ?? 0
    s.lyRevenue  += r.ly_revenue  ?? 0
  }

  // Step B: codes 집합의 raw 합산 헬퍼
  function aggregateCodes(codes: string[]): RawStats {
    const acc = emptyRaw()
    for (const code of codes) {
      const s = rawMap.get(code)
      if (s) {
        acc.otbNights  += s.otbNights
        acc.otbRevenue += s.otbRevenue
        acc.lyNights   += s.lyNights
        acc.lyRevenue  += s.lyRevenue
      }
    }
    return acc
  }

  // Step C: HOU 코드 식별
  const houCodes = new Set<string>()
  for (const s of schema) {
    if (s.segmentation.includes('HOU')) {
      for (const code of s.segmentation) houCodes.add(code)
    }
  }

  // Step D: rows 생성 헬퍼
  function makeRow(s: MarketSchemaRow, codes: string[]): LyComparisonSegRow {
    const raw = aggregateCodes(codes)
    const otb = toCell(raw.otbNights, raw.otbRevenue)
    const ly  = toCell(raw.lyNights,  raw.lyRevenue)
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
      otb,
      ly,
      gap: { nights: otb.nights - ly.nights, revenue: otb.revenue - ly.revenue },
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
      // mid
      rows.push(makeRow(top, top.segmentation))
    }
  }

  // Step F: summary (HOU 제외) — leaf (mid/sub) rows のみ合算 (main は二重カウント防止)
  const nonHouLeafRows = rows.filter(row =>
    row.level !== 'main' &&
    !row.segmentationCodes.some(c => houCodes.has(c))
  )
  const sumRaw = emptyRaw()
  for (const row of nonHouLeafRows) {
    sumRaw.otbNights  += row.otb.nights
    sumRaw.otbRevenue += row.otb.revenue
    sumRaw.lyNights   += row.ly.nights
    sumRaw.lyRevenue  += row.ly.revenue
  }

  // OCC / RevPAR 분모: lyPacing의 unique business_date 수
  const totalDays = new Set(lyPacing.map(r => r.business_date)).size
  const denom = roomCount * totalDays

  const sumOtb = toCell(sumRaw.otbNights, sumRaw.otbRevenue)
  const sumLy  = toCell(sumRaw.lyNights,  sumRaw.lyRevenue)
  const otbOcc    = denom > 0 ? (sumOtb.nights / denom) * 100 : 0
  const otbRevpar = denom > 0 ?  sumOtb.revenue / denom        : 0
  const lyOcc     = denom > 0 ? (sumLy.nights  / denom) * 100 : 0
  const lyRevpar  = denom > 0 ?  sumLy.revenue / denom         : 0

  const summary: LyComparisonSegSummary = {
    otb: { ...sumOtb, occ: otbOcc, revpar: otbRevpar },
    ly:  { ...sumLy,  occ: lyOcc,  revpar: lyRevpar  },
    gap: {
      nights:     sumOtb.nights  - sumLy.nights,
      revenue:    sumOtb.revenue - sumLy.revenue,
      occDiff:    otbOcc - lyOcc,
      revparDiff: otbRevpar - lyRevpar,
    },
  }

  return { rows, summary }
}
