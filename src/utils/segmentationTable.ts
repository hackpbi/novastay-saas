import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { PickupRow } from '@/hooks/usePickupData'

// ─── Types ──────────────────────────────────────────────────────────────────────

export type MonthlyPickupCell = {
  pickupNights:  number    // ΔR-N  (otb - vsOtb)
  pickupAdr:     number    // ΔADR  (otbAdr - vsAdr)
  pickupRevenue: number    // ΔREV  (otbRev - vsRev)
}

export type SegTableRow = {
  id:                string
  name:              string
  level:             'main' | 'mid' | 'sub'
  isBold:            boolean
  bgDarkColor:       string | null
  bgLightColor:      string | null
  fontDarkColor:     string | null
  fontLightColor:    string | null
  indent:            number         // sub=1, main/mid=0
  segmentationCodes: string[]       // Account 필터링용
  monthlyPickup:     Record<string, MonthlyPickupCell>  // key: 'YYYY-MM'
}

export type SegTableSummary = {
  monthlyTotals: Record<string, MonthlyPickupCell & {
    occ:    number    // pickupNights / (roomCount × daysInMonth) × 100
    revpar: number    // pickupRevenue / (roomCount × daysInMonth)
  }>
  grandTotal: MonthlyPickupCell
}

// ─── Internal ──────────────────────────────────────────────────────────────────

type RawStats = {
  otbNights:  number
  otbRevenue: number
  vsNights:   number
  vsRevenue:  number
}

function emptyRaw(): RawStats {
  return { otbNights: 0, otbRevenue: 0, vsNights: 0, vsRevenue: 0 }
}

function addRaw(acc: RawStats, s: RawStats): void {
  acc.otbNights  += s.otbNights
  acc.otbRevenue += s.otbRevenue
  acc.vsNights   += s.vsNights
  acc.vsRevenue  += s.vsRevenue
}

function toCell(raw: RawStats): MonthlyPickupCell {
  const otbAdr = raw.otbNights > 0 ? raw.otbRevenue / raw.otbNights : 0
  const vsAdr  = raw.vsNights  > 0 ? raw.vsRevenue  / raw.vsNights  : 0
  return {
    pickupNights:  raw.otbNights  - raw.vsNights,
    pickupAdr:     otbAdr - vsAdr,
    pickupRevenue: raw.otbRevenue - raw.vsRevenue,
  }
}

// ─── Main function ──────────────────────────────────────────────────────────────

export function buildSegTable(args: {
  schema:    MarketSchemaRow[]
  pickup:    PickupRow[]
  roomCount: number
}): { rows: SegTableRow[]; summary: SegTableSummary; monthKeys: string[] } {
  const { schema, pickup, roomCount } = args

  // 1. monthKeys
  const monthKeys = Array.from(new Set(
    pickup.map(r => r.business_date.slice(0, 7))
  )).sort()

  // 2. (segCode × monthKey) 합산 맵
  const rawMap = new Map<string, RawStats>()
  for (const r of pickup) {
    const mk  = r.business_date.slice(0, 7)
    const key = `${r.segmentation}::${mk}`
    let s = rawMap.get(key)
    if (!s) { s = emptyRaw(); rawMap.set(key, s) }
    s.otbNights  += r.otb_nights      ?? 0
    s.otbRevenue += r.otb_revenue     ?? 0
    s.vsNights   += r.vs_otb_nights   ?? 0
    s.vsRevenue  += r.vs_otb_revenue  ?? 0
  }

  // 3. codes 배열 + monthKey → MonthlyPickupCell
  function aggregateCodes(codes: string[], mk: string): MonthlyPickupCell {
    const acc = emptyRaw()
    for (const code of codes) {
      const s = rawMap.get(`${code}::${mk}`)
      if (s) addRaw(acc, s)
    }
    return toCell(acc)
  }

  // 4. SegTableRow 생성
  function makeRow(s: MarketSchemaRow, codes: string[]): SegTableRow {
    const monthlyPickup: Record<string, MonthlyPickupCell> = {}
    for (const mk of monthKeys) {
      monthlyPickup[mk] = aggregateCodes(codes, mk)
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
      monthlyPickup,
    }
  }

  // 5. 정렬: top-level order_index순, main 다음에 자식 sub
  const topLevel = schema
    .filter(s => s.parent_id === null)
    .sort((a, b) => a.order_index - b.order_index)

  const ordered: Array<[MarketSchemaRow, string[]]> = []
  for (const top of topLevel) {
    if (top.level === 'main') {
      const children = schema
        .filter(c => c.parent_id === top.id)
        .sort((a, b) => a.order_index - b.order_index)
      const mainCodes = children.flatMap(c => c.segmentation)
      ordered.push([top, mainCodes])
      for (const child of children) {
        ordered.push([child, child.segmentation])
      }
    } else {
      ordered.push([top, top.segmentation])
    }
  }

  const rows = ordered.map(([s, codes]) => makeRow(s, codes))

  // 6. summary (HOU 제외)
  const houCodes = new Set<string>()
  for (const s of schema) {
    if (s.segmentation.includes('HOU')) {
      for (const code of s.segmentation) houCodes.add(code)
    }
  }

  const monthlyTotals: SegTableSummary['monthlyTotals'] = {}
  for (const mk of monthKeys) {
    const acc = emptyRaw()
    for (const [mapKey, s] of rawMap.entries()) {
      const sep = mapKey.indexOf('::')
      const code    = mapKey.slice(0, sep)
      const monthKey = mapKey.slice(sep + 2)
      if (monthKey !== mk || houCodes.has(code)) continue
      addRaw(acc, s)
    }
    const cell = toCell(acc)
    const [yearStr, monthStr] = mk.split('-')
    const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate()
    const denom = roomCount * daysInMonth
    monthlyTotals[mk] = {
      ...cell,
      occ:    denom > 0 ? (cell.pickupNights  / denom) * 100 : 0,
      revpar: denom > 0 ?  cell.pickupRevenue / denom        : 0,
    }
  }

  const grandTotal: MonthlyPickupCell = {
    pickupNights:  Object.values(monthlyTotals).reduce((s, m) => s + m.pickupNights,  0),
    pickupAdr:     0,
    pickupRevenue: Object.values(monthlyTotals).reduce((s, m) => s + m.pickupRevenue, 0),
  }

  return { rows, summary: { monthlyTotals, grandTotal }, monthKeys }
}
