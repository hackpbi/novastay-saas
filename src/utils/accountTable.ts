import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { PickupRow } from '@/hooks/usePickupData'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AccountRow = {
  account_name:    string
  otbNights:  number
  otbAdr:     number
  otbRevenue: number
  puNights:   number
  puAdr:      number
  puRevenue:  number
}

export type AccountGroup = {
  key:              string        // parentName ? `${parentName}-${segName}` : segName
  parentName:       string | null
  segmentationName: string
  schemaSortKey:    number
  isHou:            boolean
  bgDarkColor:      string | null
  bgLightColor:     string | null
  fontDarkColor:    string | null
  fontLightColor:   string | null
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

// ─── Internal types ─────────────────────────────────────────────────────────────

type RawStats = {
  otbNights:  number
  otbRevenue: number
  vsNights:   number
  vsRevenue:  number
}

type CodeMeta = {
  parentName:       string | null
  segmentationName: string
  schemaSortKey:    number
  isHou:            boolean
  bgDarkColor:      string | null
  bgLightColor:     string | null
  fontDarkColor:    string | null
  fontLightColor:   string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function calcTotals(rows: AccountRow[]): AccountGroup['totals'] {
  let otbNights = 0, otbRevenue = 0, vsNights = 0, vsRevenue = 0
  for (const r of rows) {
    otbNights  += r.otbNights
    otbRevenue += r.otbRevenue
    vsNights   += r.otbNights  - r.puNights   // vsNights  = otb - pu
    vsRevenue  += r.otbRevenue - r.puRevenue
  }
  const otbAdr = otbNights > 0 ? otbRevenue / otbNights : 0
  const vsAdr  = vsNights  > 0 ? vsRevenue  / vsNights  : 0
  return {
    otbNights,
    otbRevenue,
    otbAdr,
    puNights:  otbNights  - vsNights,
    puRevenue: otbRevenue - vsRevenue,
    puAdr:     otbAdr - vsAdr,
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

  // ── 2. segmentation 코드 → CodeMeta 매핑 ────────────────────────────────────
  const mainOrderMap = new Map<string, number>()
  for (const s of schema) {
    if (s.level === 'main') mainOrderMap.set(s.id, s.order_index)
  }

  const codeMeta = new Map<string, CodeMeta>()
  for (const s of schema) {
    if (s.level === 'main') continue

    let parentName: string | null = null
    let schemaSortKey: number

    if (s.level === 'sub' && s.parent_id !== null) {
      const parent = schema.find(p => p.id === s.parent_id)
      parentName    = parent?.name ?? null
      schemaSortKey = (mainOrderMap.get(s.parent_id) ?? 0) * 100 + (s.order_index || 0)
    } else {
      schemaSortKey = s.order_index
    }

    const isHou = s.segmentation.includes('HOU')
    for (const code of s.segmentation) {
      codeMeta.set(code, {
        parentName,
        segmentationName: s.name,
        schemaSortKey,
        isHou,
        bgDarkColor:   s.bg_dark_color  ?? null,
        bgLightColor:  s.bg_light_color ?? null,
        fontDarkColor: s.font_dark_color  ?? null,
        fontLightColor:s.font_light_color ?? null,
      })
    }
  }

  // ── 3. (segmentation × account_name) 합산 맵 ─────────────────────────────────────
  const rawMap = new Map<string, RawStats>()
  for (const r of monthPickup) {
    const key = `${r.segmentation}::${r.account_name}`
    let s = rawMap.get(key)
    if (!s) { s = { otbNights: 0, otbRevenue: 0, vsNights: 0, vsRevenue: 0 }; rawMap.set(key, s) }
    s.otbNights  += r.otb_nights    ?? 0
    s.otbRevenue += r.otb_revenue   ?? 0
    s.vsNights   += r.vs_nights  ?? 0
    s.vsRevenue  += r.vs_revenue ?? 0
  }

  // ── 4. AccountRow 변환 + 그룹 분배 ──────────────────────────────────────────
  const groupMap = new Map<string, AccountGroup>()

  for (const [rawKey, st] of rawMap.entries()) {
    if (st.otbNights === 0 && st.vsNights === 0) continue

    const sep     = rawKey.indexOf('::')
    const segCode = rawKey.slice(0, sep)
    const account_name = rawKey.slice(sep + 2)

    const meta: CodeMeta = codeMeta.get(segCode) ?? {
      parentName:       null,
      segmentationName: `(미정의) ${segCode}`,
      schemaSortKey:    99999,
      isHou:            false,
      bgDarkColor:      null,
      bgLightColor:     null,
      fontDarkColor:    null,
      fontLightColor:   null,
    }

    const otbAdr = st.otbNights > 0 ? st.otbRevenue / st.otbNights : 0
    const vsAdr  = st.vsNights  > 0 ? st.vsRevenue  / st.vsNights  : 0

    const row: AccountRow = {
      account_name,
      otbNights:  st.otbNights,
      otbAdr,
      otbRevenue: st.otbRevenue,
      puNights:   st.otbNights  - st.vsNights,
      puAdr:      otbAdr - vsAdr,
      puRevenue:  st.otbRevenue - st.vsRevenue,
    }

    const gKey = meta.parentName
      ? `${meta.parentName}-${meta.segmentationName}`
      : meta.segmentationName

    let g = groupMap.get(gKey)
    if (!g) {
      g = {
        key:              gKey,
        parentName:       meta.parentName,
        segmentationName: meta.segmentationName,
        schemaSortKey:    meta.schemaSortKey,
        isHou:            meta.isHou,
        bgDarkColor:      meta.bgDarkColor,
        bgLightColor:     meta.bgLightColor,
        fontDarkColor:    meta.fontDarkColor,
        fontLightColor:   meta.fontLightColor,
        rows:             [],
        totals:           { otbNights: 0, otbAdr: 0, otbRevenue: 0, puNights: 0, puAdr: 0, puRevenue: 0 },
      }
      groupMap.set(gKey, g)
    }
    g.rows.push(row)
  }

  // ── 5. 그룹 내 rows 정렬: otbNights 내림차순, 동률이면 otbRevenue 내림차순 ──
  for (const g of groupMap.values()) {
    g.rows.sort((a, b) =>
      b.otbNights !== a.otbNights
        ? b.otbNights  - a.otbNights
        : b.otbRevenue - a.otbRevenue,
    )
  }

  // ── 6. 각 그룹 totals 계산 (가중평균 ADR) ────────────────────────────────────
  for (const g of groupMap.values()) {
    g.totals = calcTotals(g.rows)
  }

  // ── 7. groups 배열: schemaSortKey ASC, 동률이면 segmentationName 가나다 ──────
  const groups = [...groupMap.values()].sort((a, b) =>
    a.schemaSortKey !== b.schemaSortKey
      ? a.schemaSortKey - b.schemaSortKey
      : a.segmentationName.localeCompare(b.segmentationName, 'ko'),
  )

  // ── 8. summary (HOU 그룹 제외) ───────────────────────────────────────────────
  let totalNights = 0, totalRevenue = 0, vsNightsSum = 0, vsRevenueSum = 0
  let accountCount = 0

  for (const g of groups) {
    accountCount += g.rows.length
    if (g.isHou) continue
    for (const r of g.rows) {
      totalNights  += r.otbNights
      totalRevenue += r.otbRevenue
      vsNightsSum  += r.otbNights  - r.puNights
      vsRevenueSum += r.otbRevenue - r.puRevenue
    }
  }

  const totalAdr = totalNights  > 0 ? totalRevenue  / totalNights  : 0
  const vsAdr    = vsNightsSum  > 0 ? vsRevenueSum  / vsNightsSum  : 0
  const daysInMonth = new Date(year, month, 0).getDate()
  const denom       = roomCount * daysInMonth

  const summary: AccountTableSummary = {
    totalNights,
    totalAdr,
    totalRevenue,
    puNights:     totalNights  - vsNightsSum,
    puAdr:        totalAdr - vsAdr,
    puRevenue:    totalRevenue - vsRevenueSum,
    occ:    denom > 0 ? (totalNights  / denom) * 100 : 0,
    revpar: denom > 0 ?  totalRevenue / denom         : 0,
    accountCount,
    groupCount: groups.length,
  }

  return { groups, summary }
}
