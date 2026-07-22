import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { PickupRow }       from '@/hooks/usePickupData'
import type { MonthlyPickupCell } from './monthlyPickupSegTable'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MonthlyPickupAccountRow = {
  account_name:  string
  monthlyPickup: Record<string, MonthlyPickupCell>
  totalPickup:   MonthlyPickupCell
}

export type MonthlyPickupAccountGroup = {
  key:              string
  parentName:       string | null
  segmentationName: string
  schemaSortKey:    number
  isHou:            boolean
  rows:             MonthlyPickupAccountRow[]
  monthlyTotals:    Record<string, MonthlyPickupCell>
  totalPickup:      MonthlyPickupCell
}

export type MonthlyPickupAccountSummary = {
  monthlyTotals: Record<string, MonthlyPickupCell & {
    occ:    number
    revpar: number
  }>
  grandTotal:   MonthlyPickupCell & { occ: number; revpar: number }
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
    s.vsNights   += r.vs_nights  ?? 0
    s.vsRevenue  += r.vs_revenue ?? 0
  }

  // Step D: groupMap 구성
  const groupMap = new Map<string, MonthlyPickupAccountGroup>()

  for (const [rawKey, st] of rawMap.entries()) {
    const parts      = rawKey.split('::')
    const segCode    = parts[0]
    const acctName   = parts[1]
    const mk         = parts[2]

    // 픽업이 0이어도 OTB(또는 기준) 데이터가 있으면 표시 — 완전히 빈 row만 제외
    if (st.otbNights === 0 && st.otbRevenue === 0 && st.vsNights === 0 && st.vsRevenue === 0) continue

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
        totalPickup:      zeroCell(),
      }
      groupMap.set(gKey, g)
    }

    // account row 찾기 또는 생성
    let acctRow = g.rows.find(r => r.account_name === acctName)
    if (!acctRow) {
      const mp: Record<string, MonthlyPickupCell> = {}
      for (const m of monthKeys) mp[m] = zeroCell()
      acctRow = { account_name: acctName, monthlyPickup: mp, totalPickup: zeroCell() }
      g.rows.push(acctRow)
    }

    acctRow.monthlyPickup[mk] = toCell(st)
  }

  // Step E-pre: (acctName) 전체 월 raw 누적 맵 — totalPickup 가중평균 ADR용
  const acctTotalRaw = new Map<string, RawStats>()
  for (const [rawKey, st] of rawMap.entries()) {
    const parts    = rawKey.split('::')
    const acctName = parts[1]
    let a = acctTotalRaw.get(acctName)
    if (!a) { a = emptyRaw(); acctTotalRaw.set(acctName, a) }
    a.otbNights  += st.otbNights;  a.otbRevenue += st.otbRevenue
    a.vsNights   += st.vsNights;   a.vsRevenue  += st.vsRevenue
  }

  // Step E: group monthlyTotals / totalPickup 계산 + rows 정렬
  for (const g of groupMap.values()) {
    // row totalPickup: 해당 그룹(세그먼트)의 monthlyPickup 월별 합계 (세그 스코프 유지)
    for (const row of g.rows) {
      const nights  = Object.values(row.monthlyPickup).reduce((s, c) => s + (c?.pickupNights  ?? 0), 0)
      const revenue = Object.values(row.monthlyPickup).reduce((s, c) => s + (c?.pickupRevenue ?? 0), 0)
      const adr     = nights > 0 ? revenue / nights : 0
      row.totalPickup = { pickupNights: nights, pickupAdr: adr, pickupRevenue: revenue }
    }

    // rows 정렬: totalPickup.pickupNights 절대값 내림차순
    g.rows.sort((a, b) => Math.abs(b.totalPickup.pickupNights) - Math.abs(a.totalPickup.pickupNights))

    // group monthlyTotals
    for (const mk of monthKeys) {
      let nights = 0, revenue = 0
      for (const row of g.rows) {
        const cell = row.monthlyPickup[mk] ?? zeroCell()
        nights  += cell.pickupNights
        revenue += cell.pickupRevenue
      }
      g.monthlyTotals[mk] = { pickupNights: nights, pickupAdr: 0, pickupRevenue: revenue }
    }

    // group totalPickup: rows totalPickup raw 누적 (acctTotalRaw 재사용)
    const gRaw = emptyRaw()
    for (const row of g.rows) {
      const raw = acctTotalRaw.get(row.account_name) ?? emptyRaw()
      gRaw.otbNights  += raw.otbNights;  gRaw.otbRevenue += raw.otbRevenue
      gRaw.vsNights   += raw.vsNights;   gRaw.vsRevenue  += raw.vsRevenue
    }
    g.totalPickup = toCell(gRaw)
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

  const grandRaw = emptyRaw()

  for (const g of groups) {
    accountCount += g.rows.length
    if (g.isHou) continue
    for (const mk of monthKeys) {
      const cell = g.monthlyTotals[mk] ?? zeroCell()
      summaryTotals[mk].pickupNights  += cell.pickupNights
      summaryTotals[mk].pickupRevenue += cell.pickupRevenue
    }
    // grandTotal raw 누적
    const raw = acctTotalRaw  // reuse per-account map
    for (const row of g.rows) {
      const r = raw.get(row.account_name) ?? emptyRaw()
      grandRaw.otbNights  += r.otbNights;  grandRaw.otbRevenue += r.otbRevenue
      grandRaw.vsNights   += r.vsNights;   grandRaw.vsRevenue  += r.vsRevenue
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

  let totalDays = 0
  for (const mk of monthKeys) {
    const [y, m] = mk.split('-').map(Number)
    totalDays += new Date(y, m, 0).getDate()
  }
  const grandDenom = roomCount * totalDays
  const grandCell  = toCell(grandRaw)
  const grandTotal = {
    ...grandCell,
    occ:    grandDenom > 0 ? (grandCell.pickupNights  / grandDenom) * 100 : 0,
    revpar: grandDenom > 0 ?  grandCell.pickupRevenue / grandDenom         : 0,
  }

  return {
    groups,
    summary: {
      monthlyTotals: summaryTotals,
      grandTotal,
      accountCount,
      groupCount: groups.length,
    },
    monthKeys,
  }
}
