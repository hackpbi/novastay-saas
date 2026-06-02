import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { PickupRow }       from '@/hooks/usePickupData'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MonthlyPickupCell = {
  pickupNights:  number
  pickupAdr:     number
  pickupRevenue: number
}

export type MonthlyPickupSegRow = {
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
  monthlyPickup:     Record<string, MonthlyPickupCell>
}

export type MonthlyPickupSegSummary = {
  monthlyTotals: Record<string, MonthlyPickupCell & {
    occ:    number
    revpar: number
  }>
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

function toCell(raw: RawStats): MonthlyPickupCell {
  const pickupNights  = raw.otbNights  - raw.vsNights
  const pickupRevenue = raw.otbRevenue - raw.vsRevenue
  const otbAdr = raw.otbNights > 0 ? raw.otbRevenue / raw.otbNights : 0
  const vsAdr  = raw.vsNights  > 0 ? raw.vsRevenue  / raw.vsNights  : 0
  return { pickupNights, pickupAdr: otbAdr - vsAdr, pickupRevenue }
}

function zeroCell(): MonthlyPickupCell {
  return { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 }
}

function addCell(a: MonthlyPickupCell, b: MonthlyPickupCell): MonthlyPickupCell {
  return {
    pickupNights:  a.pickupNights  + b.pickupNights,
    pickupAdr:     0,               // ADR은 summary 단계에서 별도 계산 불필요 (nights/rev로 유도)
    pickupRevenue: a.pickupRevenue + b.pickupRevenue,
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function buildMonthlyPickupSegTable(args: {
  schema:    MarketSchemaRow[]
  pickup:    PickupRow[]
  roomCount: number
}): {
  rows:      MonthlyPickupSegRow[]
  summary:   MonthlyPickupSegSummary
  monthKeys: string[]
} {
  const { schema, pickup, roomCount } = args

  // Step A: monthKeys
  const monthKeys = Array.from(new Set(
    pickup.map(r => r.business_date.slice(0, 7))
  )).sort()

  // Step B: (segCode × monthKey) raw 합산
  const rawMap = new Map<string, RawStats>()
  for (const r of pickup) {
    const mk  = r.business_date.slice(0, 7)
    const key = `${r.segmentation}::${mk}`
    let s = rawMap.get(key)
    if (!s) { s = emptyRaw(); rawMap.set(key, s) }
    s.otbNights  += r.otb_nights     ?? 0
    s.otbRevenue += r.otb_revenue    ?? 0
    s.vsNights   += r.vs_otb_nights  ?? 0
    s.vsRevenue  += r.vs_otb_revenue ?? 0
  }

  // Step C: schema에서 segCode별 cell 조회 헬퍼
  function getCell(codes: string[], mk: string): MonthlyPickupCell {
    const merged = emptyRaw()
    for (const code of codes) {
      const raw = rawMap.get(`${code}::${mk}`)
      if (raw) {
        merged.otbNights  += raw.otbNights
        merged.otbRevenue += raw.otbRevenue
        merged.vsNights   += raw.vsNights
        merged.vsRevenue  += raw.vsRevenue
      }
    }
    return toCell(merged)
  }

  // Step D: rows 생성
  // HOU 식별
  const houCodes = new Set<string>()
  for (const s of schema) {
    if (s.segmentation.includes('HOU')) {
      for (const code of s.segmentation) houCodes.add(code)
    }
  }

  function makeRow(s: MarketSchemaRow, codes: string[]): MonthlyPickupSegRow {
    const monthlyPickup: Record<string, MonthlyPickupCell> = {}
    for (const mk of monthKeys) {
      monthlyPickup[mk] = getCell(codes, mk)
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

  // Step E: rows 정렬 (main → 자식 sub, mid 포함 order_index 인터리빙)
  const topLevel = schema
    .filter(s => s.parent_id === null)
    .sort((a, b) => a.order_index - b.order_index)

  const rows: MonthlyPickupSegRow[] = []
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

  // Step F: summary.monthlyTotals (HOU 제외)
  const nonHouRows = rows.filter(row =>
    !row.segmentationCodes.some(c => houCodes.has(c))
  )

  const monthlyTotals: MonthlyPickupSegSummary['monthlyTotals'] = {}
  for (const mk of monthKeys) {
    let nights = 0, revenue = 0
    for (const row of nonHouRows) {
      if (row.level === 'main') continue // main은 자식 합산이므로 중복 방지
      const cell = row.monthlyPickup[mk] ?? zeroCell()
      nights  += cell.pickupNights
      revenue += cell.pickupRevenue
    }
    const [y, m]     = mk.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const denom       = roomCount * daysInMonth
    monthlyTotals[mk] = {
      pickupNights:  nights,
      pickupAdr:     0,
      pickupRevenue: revenue,
      occ:    denom > 0 ? (nights  / denom) * 100 : 0,
      revpar: denom > 0 ?  revenue / denom         : 0,
    }
  }

  return { rows, summary: { monthlyTotals }, monthKeys }
}
