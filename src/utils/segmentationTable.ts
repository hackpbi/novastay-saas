import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { PickupRow } from '@/hooks/usePickupData'

export type SegTableRow = {
  id:             string
  name:           string
  level:          'main' | 'mid' | 'sub'
  isBold:         boolean
  color:          string | null   // deprecated
  bgDarkColor:    string | null
  bgLightColor:   string | null
  fontLightColor: string | null
  fontDarkColor:  string | null
  indent:         number       // sub=1, main/mid=0
  otbNights:      number
  otbAdr:         number
  otbRevenue:     number
  puNights:       number
  puAdr:          number       // otbAdr - vsOtbAdr
  puRevenue:      number
}

export type SegTableSummary = {
  totalNights:  number
  totalAdr:     number
  totalRevenue: number
  puNights:     number
  puAdr:        number
  puRevenue:    number
  occ:          number
  revpar:       number
}

type CodeStats = {
  otbNights:  number
  otbRevenue: number
  vsNights:   number
  vsRevenue:  number
  puNights:   number
  puRevenue:  number
}

function emptyStats(): CodeStats {
  return { otbNights: 0, otbRevenue: 0, vsNights: 0, vsRevenue: 0, puNights: 0, puRevenue: 0 }
}

function addStats(acc: CodeStats, s: CodeStats): void {
  acc.otbNights  += s.otbNights
  acc.otbRevenue += s.otbRevenue
  acc.vsNights   += s.vsNights
  acc.vsRevenue  += s.vsRevenue
  acc.puNights   += s.puNights
  acc.puRevenue  += s.puRevenue
}

export function buildSegTable(args: {
  schema:    MarketSchemaRow[]
  pickup:    PickupRow[]
  year:      number
  month:     number
  roomCount: number
}): { rows: SegTableRow[]; summary: SegTableSummary } {
  const { schema, pickup, year, month, roomCount } = args

  // ── 1. 해당 월 픽업 데이터 필터 ──────────────────────────────────────────────
  const monthPickup = pickup.filter(r => {
    const d = new Date(r.business_date)
    return d.getFullYear() === year && d.getMonth() + 1 === month
  })

  // ── 2. segmentation 코드별 합산 맵 ──────────────────────────────────────────
  const segMap = new Map<string, CodeStats>()
  for (const r of monthPickup) {
    const code = r.segmentation
    if (!segMap.has(code)) segMap.set(code, emptyStats())
    const s = segMap.get(code)!
    s.otbNights  += r.otb_nights    ?? 0
    s.otbRevenue += r.otb_revenue   ?? 0
    s.vsNights   += r.vs_otb_nights  ?? 0
    s.vsRevenue  += r.vs_otb_revenue ?? 0
    s.puNights   += r.pu_nights     ?? 0
    s.puRevenue  += r.pu_revenue    ?? 0
  }

  // ── 3. schema 행별 집계 ──────────────────────────────────────────────────────
  // 코드 배열 → segMap 합산
  function aggregateCodes(codes: string[]): CodeStats {
    const acc = emptyStats()
    for (const code of codes) {
      const s = segMap.get(code)
      if (s) addStats(acc, s)
    }
    return acc
  }

  const rowStatsMap = new Map<string, CodeStats>()

  // mid/sub: 자체 segmentation 코드에서 집계
  for (const s of schema) {
    if (s.level !== 'main') {
      rowStatsMap.set(s.id, aggregateCodes(s.segmentation))
    }
  }

  // main: 모든 sub 자식들의 segmentation 코드 합산 (raw 집계)
  for (const s of schema) {
    if (s.level === 'main') {
      const childCodes = schema
        .filter(c => c.parent_id === s.id)
        .flatMap(c => c.segmentation)
      rowStatsMap.set(s.id, aggregateCodes(childCodes))
    }
  }

  // ── 4. SegTableRow 생성 함수 ─────────────────────────────────────────────────
  function makeRow(s: MarketSchemaRow): SegTableRow {
    const st    = rowStatsMap.get(s.id) ?? emptyStats()
    const otbAdr = st.otbNights > 0 ? Math.round(st.otbRevenue / st.otbNights) : 0
    const vsAdr  = st.vsNights  > 0 ? Math.round(st.vsRevenue  / st.vsNights)  : 0
    return {
      id:             s.id,
      name:           s.name,
      level:          s.level,
      isBold:         s.is_bold,
      color:          s.color,
      bgDarkColor:    s.bg_dark_color,
      bgLightColor:   s.bg_light_color,
      fontLightColor: s.font_light_color,
      fontDarkColor:  s.font_dark_color,
      indent:         s.level === 'sub' ? 1 : 0,
      otbNights:      st.otbNights,
      otbAdr,
      otbRevenue:     st.otbRevenue,
      puNights:       st.puNights,
      puAdr:          otbAdr - vsAdr,
      puRevenue:      st.puRevenue,
    }
  }

  // ── 5. 정렬: 상위(parent_id=null) order_index순, main 뒤에 자식 sub 붙임 ──
  const topLevel = schema
    .filter(s => s.parent_id === null)
    .sort((a, b) => a.order_index - b.order_index)

  const ordered: MarketSchemaRow[] = []
  for (const top of topLevel) {
    ordered.push(top)
    if (top.level === 'main') {
      const children = schema
        .filter(c => c.parent_id === top.id)
        .sort((a, b) => a.order_index - b.order_index)
      ordered.push(...children)
    }
  }

  const rows = ordered.map(makeRow)

  // ── 6. summary (HOU 제외) ────────────────────────────────────────────────────
  // HOU 관련 코드 식별: schema.segmentation에 'HOU' 포함된 행의 모든 코드
  const houCodes = new Set<string>()
  for (const s of schema) {
    if (s.segmentation.includes('HOU')) {
      for (const code of s.segmentation) houCodes.add(code)
    }
  }

  const totals = emptyStats()
  for (const [code, st] of segMap.entries()) {
    if (!houCodes.has(code)) addStats(totals, st)
  }

  const totalAdr = totals.otbNights > 0 ? Math.round(totals.otbRevenue / totals.otbNights) : 0
  const vsAdr    = totals.vsNights  > 0 ? Math.round(totals.vsRevenue  / totals.vsNights)  : 0
  const daysInMonth = new Date(year, month, 0).getDate()
  const denominator = roomCount * daysInMonth

  const summary: SegTableSummary = {
    totalNights:  totals.otbNights,
    totalAdr,
    totalRevenue: totals.otbRevenue,
    puNights:     totals.puNights,
    puAdr:        totalAdr - vsAdr,
    puRevenue:    totals.puRevenue,
    occ:    denominator > 0 ? (totals.otbNights / denominator) * 100 : 0,
    revpar: denominator > 0 ? totals.otbRevenue / denominator        : 0,
  }

  return { rows, summary }
}
