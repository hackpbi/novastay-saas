import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { PickupRow } from '@/hooks/usePickupData'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AccountRow = {
  company:       string
  segmentation:  string        // c05 name (표시명)
  parentName:    string | null
  schemaSortKey: number
  otbNights:     number
  otbAdr:        number
  otbRevenue:    number
  puNights:      number
  puAdr:         number
  puRevenue:     number
}

export type AccountGroup = {
  key:              string
  parentName:       string | null
  segmentationName: string
  schemaSortKey:    number
  isHou:            boolean
  rows:             AccountRow[]
  totals: {
    otbNights:  number
    otbAdr:     number
    otbRevenue: number
    puNights:   number
    puAdr:      number
    puRevenue:  number
  }
}

export type AccountTableSummary = {
  totalNights:  number
  totalAdr:     number
  totalRevenue: number
  puNights:     number
  puAdr:        number
  puRevenue:    number
  occ:          number
  revpar:       number
  accountCount: number
  groupCount:   number
}

// ─── Internal accumulator ───────────────────────────────────────────────────────

type RawStats = {
  otbNights:  number
  otbRevenue: number
  vsNights:   number
  vsRevenue:  number
}

function emptyRaw(): RawStats {
  return { otbNights: 0, otbRevenue: 0, vsNights: 0, vsRevenue: 0 }
}

type CodeMeta = {
  parentName:       string | null
  segmentationName: string
  schemaSortKey:    number
  isHou:            boolean
}

function groupKey(parentName: string | null, segName: string): string {
  return parentName ? `${parentName}-${segName}` : segName
}

function calcTotals(rows: AccountRow[]): AccountGroup['totals'] {
  let otbNights = 0, otbRevenue = 0, vsNights = 0, vsRevenue = 0
  for (const r of rows) {
    otbNights  += r.otbNights
    otbRevenue += r.otbRevenue
    vsNights   += r.otbNights - r.puNights   // vsNights = otb - pu
    vsRevenue  += r.otbRevenue - r.puRevenue
  }
  const otbAdr = otbNights > 0 ? otbRevenue / otbNights : 0
  const vsAdr  = vsNights  > 0 ? vsRevenue  / vsNights  : 0
  return {
    otbNights,
    otbAdr,
    otbRevenue,
    puNights:  otbNights - vsNights,
    puAdr:     otbAdr - vsAdr,
    puRevenue: otbRevenue - vsRevenue,
  }
}

// ─── Main function ──────────────────────────────────────────────────────────────

export function buildAccountTable(args: {
  schema:    MarketSchemaRow[]
  pickup:    PickupRow[]
  year:      number
  month:     number
  roomCount: number
}): { groups: AccountGroup[]; summary: AccountTableSummary } {
  const { schema, pickup, year, month, roomCount } = args

  // ── 1. 해당 월 픽업 데이터 필터 ──────────────────────────────────────────────
  const monthPickup = pickup.filter(r => {
    const d = new Date(r.business_date)
    return d.getFullYear() === year && d.getMonth() + 1 === month
  })

  // ── 2. (segmentation × company) 합산 맵 ─────────────────────────────────────
  const rawMap = new Map<string, RawStats>()
  for (const r of monthPickup) {
    const key = `${r.segmentation}::${r.company}`
    if (!rawMap.has(key)) rawMap.set(key, emptyRaw())
    const s = rawMap.get(key)!
    s.otbNights  += r.otb_nights    ?? 0
    s.otbRevenue += r.otb_revenue   ?? 0
    s.vsNights   += r.vs_otb_nights  ?? 0
    s.vsRevenue  += r.vs_otb_revenue ?? 0
  }

  // ── 3. segmentation 코드 → CodeMeta 매핑 ────────────────────────────────────
  // main 행: id → order_index (자식 sub의 schemaSortKey 계산에 사용)
  const mainOrderMap = new Map<string, number>()
  for (const s of schema) {
    if (s.level === 'main') mainOrderMap.set(s.id, s.order_index)
  }

  const codeMeta = new Map<string, CodeMeta>()

  for (const s of schema) {
    if (s.level === 'main') continue   // main은 표시 단위 아님

    for (const code of s.segmentation) {
      let parentName: string | null = null
      let schemaSortKey: number

      if (s.level === 'sub' && s.parent_id !== null) {
        const parent = schema.find(p => p.id === s.parent_id)
        parentName    = parent?.name ?? null
        const parentOrder = mainOrderMap.get(s.parent_id) ?? 0
        schemaSortKey = parentOrder * 100 + s.order_index
      } else {
        // mid
        schemaSortKey = s.order_index
      }

      const isHou = s.segmentation.includes('HOU')

      codeMeta.set(code, {
        parentName,
        segmentationName: s.name,
        schemaSortKey,
        isHou,
      })
    }
  }

  // ── 4. (segCode, company) → AccountRow, 그룹으로 묶기 ──────────────────────
  const groupMap = new Map<string, AccountGroup>()

  for (const [rawKey, stats] of rawMap.entries()) {
    // 표시 기준: otbNights > 0 OR vsNights > 0
    if (stats.otbNights === 0 && stats.vsNights === 0) continue

    const sepIdx  = rawKey.indexOf('::')
    const segCode = rawKey.slice(0, sepIdx)
    const company = rawKey.slice(sepIdx + 2)

    const meta: CodeMeta = codeMeta.get(segCode) ?? {
      parentName:       null,
      segmentationName: `(미정의) ${segCode}`,
      schemaSortKey:    99999,
      isHou:            false,
    }

    const otbAdr = stats.otbNights > 0 ? stats.otbRevenue / stats.otbNights : 0
    const vsAdr  = stats.vsNights  > 0 ? stats.vsRevenue  / stats.vsNights  : 0

    const row: AccountRow = {
      company,
      segmentation:  meta.segmentationName,
      parentName:    meta.parentName,
      schemaSortKey: meta.schemaSortKey,
      otbNights:     stats.otbNights,
      otbAdr,
      otbRevenue:    stats.otbRevenue,
      puNights:      stats.otbNights - stats.vsNights,
      puAdr:         otbAdr - vsAdr,
      puRevenue:     stats.otbRevenue - stats.vsRevenue,
    }

    const gKey = groupKey(meta.parentName, meta.segmentationName)
    if (!groupMap.has(gKey)) {
      groupMap.set(gKey, {
        key:              gKey,
        parentName:       meta.parentName,
        segmentationName: meta.segmentationName,
        schemaSortKey:    meta.schemaSortKey,
        isHou:            meta.isHou,
        rows:             [],
        totals:           { otbNights: 0, otbAdr: 0, otbRevenue: 0, puNights: 0, puAdr: 0, puRevenue: 0 },
      })
    }
    groupMap.get(gKey)!.rows.push(row)
  }

  // ── 5. 그룹 내 rows 정렬: otbNights 내림차순, 동률이면 otbRevenue 내림차순 ──
  for (const g of groupMap.values()) {
    g.rows.sort((a, b) =>
      b.otbNights !== a.otbNights
        ? b.otbNights - a.otbNights
        : b.otbRevenue - a.otbRevenue,
    )
  }

  // ── 6. 각 그룹 totals 계산 ──────────────────────────────────────────────────
  for (const g of groupMap.values()) {
    g.totals = calcTotals(g.rows)
  }

  // ── 7. groups 배열 정렬: schemaSortKey ASC, 동률이면 segmentationName 가나다 ─
  const groups = [...groupMap.values()].sort((a, b) =>
    a.schemaSortKey !== b.schemaSortKey
      ? a.schemaSortKey - b.schemaSortKey
      : a.segmentationName.localeCompare(b.segmentationName, 'ko'),
  )

  // ── 8. summary (HOU 그룹 제외) ───────────────────────────────────────────────
  let totalNights = 0, totalRevenue = 0
  let vsNightsTotal = 0, vsRevenueTotal = 0
  let accountCount = 0

  for (const g of groups) {
    accountCount += g.rows.length
    if (g.isHou) continue
    for (const r of g.rows) {
      totalNights   += r.otbNights
      totalRevenue  += r.otbRevenue
      vsNightsTotal += r.otbNights - r.puNights
      vsRevenueTotal += r.otbRevenue - r.puRevenue
    }
  }

  const totalAdr = totalNights  > 0 ? totalRevenue  / totalNights  : 0
  const vsAdr    = vsNightsTotal > 0 ? vsRevenueTotal / vsNightsTotal : 0
  const daysInMonth = new Date(year, month, 0).getDate()
  const denominator = roomCount * daysInMonth

  const summary: AccountTableSummary = {
    totalNights,
    totalAdr,
    totalRevenue,
    puNights:     totalNights  - vsNightsTotal,
    puAdr:        totalAdr - vsAdr,
    puRevenue:    totalRevenue - vsRevenueTotal,
    occ:    denominator > 0 ? (totalNights  / denominator) * 100 : 0,
    revpar: denominator > 0 ? totalRevenue / denominator          : 0,
    accountCount,
    groupCount: groups.length,
  }

  return { groups, summary }
}
