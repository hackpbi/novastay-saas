import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { PickupRow }       from '@/hooks/usePickupData'
import type { MonthlyPickupCell } from './monthlyPickupSegTable'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MonthlyPickupAccountRow = {
  account_name:  string
  monthlyPickup: Record<string, MonthlyPickupCell>
}

export type MonthlyPickupAccountGroup = {
  key:              string
  parentName:       string | null
  segmentationName: string
  schemaSortKey:    number
  isHou:            boolean
  rows:             MonthlyPickupAccountRow[]
  monthlyTotals:    Record<string, MonthlyPickupCell>
}

export type MonthlyPickupAccountSummary = {
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

type CodeMeta = {
  parentName:       string | null
  segmentationName: string
  schemaSortKey:    number
  isHou:            boolean
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function buildMonthlyPickupAccountTable(args: {
  schema:    MarketSchemaRow[]
  pickup:    PickupRow[]
  roomCount: number
}): {
  groups:    MonthlyPickupAccountGroup[]
  summary:   MonthlyPickupAccountSummary
  monthKeys: string[]
} {
  const { schema, pickup, roomCount } = args

  // Step A: monthKeys
  const monthKeys = Array.from(new Set(
    pickup.map(r => r.business_date.slice(0, 7))
  )).sort()

  // Step B: codeMeta (accountTable.ts 동일 패턴)
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
      codeMeta.set(code, { parentName, segmentationName: s.name, schemaSortKey, isHou })
    }
  }

  // Step C: (segCode × account_name × monthKey) raw 합산
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

  // Step D: groupMap 구성
  const groupMap = new Map<string, MonthlyPickupAccountGroup>()

  for (const [rawKey, st] of rawMap.entries()) {
    const parts      = rawKey.split('::')
    const segCode    = parts[0]
    const acctName   = parts[1]
    const mk         = parts[2]

    // 최소 하나 이상 활동 있는 row만 포함
    if (Math.abs(st.otbNights - st.vsNights) === 0 && Math.abs(st.otbRevenue - st.vsRevenue) === 0) continue

    const meta: CodeMeta = codeMeta.get(segCode) ?? {
      parentName:       null,
      segmentationName: `(미정의) ${segCode}`,
      schemaSortKey:    99999,
      isHou:            false,
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
        rows:             [],
        monthlyTotals:    {},
      }
      groupMap.set(gKey, g)
    }

    // account row 찾기 또는 생성
    let acctRow = g.rows.find(r => r.account_name === acctName)
    if (!acctRow) {
      const mp: Record<string, MonthlyPickupCell> = {}
      for (const m of monthKeys) mp[m] = zeroCell()
      acctRow = { account_name: acctName, monthlyPickup: mp }
      g.rows.push(acctRow)
    }

    acctRow.monthlyPickup[mk] = toCell(st)
  }

  // Step E: group monthlyTotals 계산 + rows 정렬
  for (const g of groupMap.values()) {
    // rows 정렬: 전체 월 pickupNights 합 내림차순
    g.rows.sort((a, b) => {
      const sumA = monthKeys.reduce((s, mk) => s + (a.monthlyPickup[mk]?.pickupNights ?? 0), 0)
      const sumB = monthKeys.reduce((s, mk) => s + (b.monthlyPickup[mk]?.pickupNights ?? 0), 0)
      return Math.abs(sumB) - Math.abs(sumA)
    })

    // group monthlyTotals
    for (const mk of monthKeys) {
      let nights = 0, revenue = 0, otbN = 0, otbR = 0, vsN = 0, vsR = 0
      for (const row of g.rows) {
        const cell = row.monthlyPickup[mk] ?? zeroCell()
        nights  += cell.pickupNights
        revenue += cell.pickupRevenue
      }
      g.monthlyTotals[mk] = { pickupNights: nights, pickupAdr: 0, pickupRevenue: revenue }
    }
  }

  // Step F: groups 정렬 (schemaSortKey → segmentationName)
  const groups = [...groupMap.values()].sort((a, b) =>
    a.schemaSortKey !== b.schemaSortKey
      ? a.schemaSortKey - b.schemaSortKey
      : a.segmentationName.localeCompare(b.segmentationName, 'ko')
  )

  // Step G: summary (HOU 제외)
  let accountCount = 0
  const summaryTotals: MonthlyPickupAccountSummary['monthlyTotals'] = {}
  for (const mk of monthKeys) {
    summaryTotals[mk] = { pickupNights: 0, pickupAdr: 0, pickupRevenue: 0, occ: 0, revpar: 0 }
  }

  for (const g of groups) {
    accountCount += g.rows.length
    if (g.isHou) continue
    for (const mk of monthKeys) {
      const cell = g.monthlyTotals[mk] ?? zeroCell()
      summaryTotals[mk].pickupNights  += cell.pickupNights
      summaryTotals[mk].pickupRevenue += cell.pickupRevenue
    }
  }

  for (const mk of monthKeys) {
    const [y, m]      = mk.split('-').map(Number)
    const daysInMonth  = new Date(y, m, 0).getDate()
    const denom        = roomCount * daysInMonth
    const tot          = summaryTotals[mk]
    tot.occ    = denom > 0 ? (tot.pickupNights  / denom) * 100 : 0
    tot.revpar = denom > 0 ?  tot.pickupRevenue / denom         : 0
  }

  return {
    groups,
    summary: {
      monthlyTotals: summaryTotals,
      accountCount,
      groupCount: groups.length,
    },
    monthKeys,
  }
}
