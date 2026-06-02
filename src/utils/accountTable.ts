import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { PickupRow } from '@/hooks/usePickupData'
import type { MonthlyPickupCell } from './segmentationTable'

// ─── Types ──────────────────────────────────────────────────────────────────────

export type { MonthlyPickupCell }

export type AccountRow = {
  account_name:  string
  monthlyPickup: Record<string, MonthlyPickupCell>  // key: 'YYYY-MM'
}

export type AccountGroup = {
  key:               string
  parentName:        string | null
  segmentationName:  string
  schemaSortKey:     number
  isHou:             boolean
  bgDarkColor:       string | null
  bgLightColor:      string | null
  fontDarkColor:     string | null
  fontLightColor:    string | null
  rows:              AccountRow[]
  monthlyTotals:     Record<string, MonthlyPickupCell>
}

export type AccountTableSummary = {
  monthlyTotals: Record<string, MonthlyPickupCell & {
    occ:    number
    revpar: number
  }>
  accountCount: number
  groupCount:   number
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

// ─── Main function ──────────────────────────────────────────────────────────────

export function buildAccountTable(args: {
  schema:    MarketSchemaRow[]
  pickup:    PickupRow[]
  roomCount: number
}): { groups: AccountGroup[]; summary: AccountTableSummary; monthKeys: string[] } {
  const { schema, pickup, roomCount } = args

  // 1. monthKeys
  const monthKeys = Array.from(new Set(
    pickup.map(r => r.business_date.slice(0, 7))
  )).sort()

  // 2. segCode → CodeMeta 매핑
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
    for (const code of s.segmentation) {
      codeMeta.set(code, {
        parentName,
        segmentationName: s.name,
        schemaSortKey,
        isHou:        s.segmentation.includes('HOU'),
        bgDarkColor:  s.bg_dark_color  ?? null,
        bgLightColor: s.bg_light_color ?? null,
        fontDarkColor:  s.font_dark_color  ?? null,
        fontLightColor: s.font_light_color ?? null,
      })
    }
  }

  // 3. (segCode × accountName × monthKey) 합산 맵
  const rawMap = new Map<string, RawStats>()
  for (const r of pickup) {
    const mk  = r.business_date.slice(0, 7)
    const key = `${r.segmentation}::${r.account_name}::${mk}`
    let s = rawMap.get(key)
    if (!s) { s = emptyRaw(); rawMap.set(key, s) }
    s.otbNights  += r.otb_nights     ?? 0
    s.otbRevenue += r.otb_revenue    ?? 0
    s.vsNights   += r.vs_otb_nights  ?? 0
    s.vsRevenue  += r.vs_otb_revenue ?? 0
  }

  // 4. AccountRow 생성 + 그룹 분배
  // groupKey → (accountName → monthKey → RawStats)
  const groupRaw = new Map<string, Map<string, Map<string, RawStats>>>()
  const groupMeta = new Map<string, CodeMeta & { gKey: string }>()

  for (const [mapKey, s] of rawMap.entries()) {
    // key = segCode::accountName::monthKey
    const first  = mapKey.indexOf('::')
    const second = mapKey.indexOf('::', first + 2)
    const segCode    = mapKey.slice(0, first)
    const accountName = mapKey.slice(first + 2, second)
    const mk          = mapKey.slice(second + 2)

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

    const gKey = meta.parentName
      ? `${meta.parentName}-${meta.segmentationName}`
      : meta.segmentationName

    if (!groupMeta.has(gKey)) groupMeta.set(gKey, { ...meta, gKey })
    if (!groupRaw.has(gKey))  groupRaw.set(gKey, new Map())
    const byAccount = groupRaw.get(gKey)!

    if (!byAccount.has(accountName)) byAccount.set(accountName, new Map())
    const byMonth = byAccount.get(accountName)!

    let accRaw = byMonth.get(mk)
    if (!accRaw) { accRaw = emptyRaw(); byMonth.set(mk, accRaw) }
    addRaw(accRaw, s)
  }

  // 5. AccountGroup 조립
  const groups: AccountGroup[] = []
  for (const [gKey, byAccount] of groupRaw.entries()) {
    const meta = groupMeta.get(gKey)!

    const rows: AccountRow[] = []
    for (const [accountName, byMonth] of byAccount.entries()) {
      // 적어도 한 달이라도 |pickupNights| > 0인 row만 포함
      let hasActivity = false
      for (const s of byMonth.values()) {
        if (Math.abs(s.otbNights - s.vsNights) > 0) { hasActivity = true; break }
      }
      if (!hasActivity) continue

      const monthlyPickup: Record<string, MonthlyPickupCell> = {}
      for (const mk of monthKeys) {
        const s = byMonth.get(mk)
        monthlyPickup[mk] = s ? toCell(s) : { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0 }
      }
      rows.push({ account_name: accountName, monthlyPickup })
    }

    if (rows.length === 0) continue

    // 정렬: 전체 기간 pickupNights 내림차순
    rows.sort((a, b) => {
      const aN = monthKeys.reduce((s, mk) => s + (a.monthlyPickup[mk]?.pickupNights ?? 0), 0)
      const bN = monthKeys.reduce((s, mk) => s + (b.monthlyPickup[mk]?.pickupNights ?? 0), 0)
      return bN - aN
    })

    // 그룹 monthlyTotals
    const monthlyTotals: Record<string, MonthlyPickupCell> = {}
    for (const mk of monthKeys) {
      const acc = emptyRaw()
      for (const row of rows) {
        const s = (groupRaw.get(gKey)?.get(row.account_name))?.get(mk)
        if (s) addRaw(acc, s)
      }
      monthlyTotals[mk] = toCell(acc)
    }

    groups.push({
      key:               gKey,
      parentName:        meta.parentName,
      segmentationName:  meta.segmentationName,
      schemaSortKey:     meta.schemaSortKey,
      isHou:             meta.isHou,
      bgDarkColor:       meta.bgDarkColor,
      bgLightColor:      meta.bgLightColor,
      fontDarkColor:     meta.fontDarkColor,
      fontLightColor:    meta.fontLightColor,
      rows,
      monthlyTotals,
    })
  }

  // 6. groups 정렬
  groups.sort((a, b) =>
    a.schemaSortKey !== b.schemaSortKey
      ? a.schemaSortKey - b.schemaSortKey
      : a.segmentationName.localeCompare(b.segmentationName, 'ko'),
  )

  // 7. summary (HOU 제외)
  const summaryRaw = new Map<string, RawStats>()  // mk → RawStats
  for (const g of groups) {
    if (g.isHou) continue
    for (const mk of monthKeys) {
      let acc = summaryRaw.get(mk)
      if (!acc) { acc = emptyRaw(); summaryRaw.set(mk, acc) }
      for (const row of g.rows) {
        const s = (groupRaw.get(g.key)?.get(row.account_name))?.get(mk)
        if (s) addRaw(acc, s)
      }
    }
  }

  const summaryTotals: AccountTableSummary['monthlyTotals'] = {}
  for (const mk of monthKeys) {
    const acc = summaryRaw.get(mk) ?? emptyRaw()
    const cell = toCell(acc)
    const [yearStr, monthStr] = mk.split('-')
    const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate()
    const denom = roomCount * daysInMonth
    summaryTotals[mk] = {
      ...cell,
      occ:    denom > 0 ? (cell.pickupNights  / denom) * 100 : 0,
      revpar: denom > 0 ?  cell.pickupRevenue / denom        : 0,
    }
  }

  const accountCount = groups.reduce((s, g) => s + g.rows.length, 0)

  return {
    groups,
    summary: { monthlyTotals: summaryTotals, accountCount, groupCount: groups.length },
    monthKeys,
  }
}
