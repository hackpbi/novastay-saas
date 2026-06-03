import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { LyPacingRow }    from '@/hooks/useLyPacing'
import type { LyComparisonCell, LyComparisonMonthly } from './lyComparisonSegTable'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type LyComparisonAccountRow = {
  account_name: string
  monthly:      Record<string, LyComparisonMonthly>
}

export type LyComparisonAccountGroup = {
  key:              string
  parentName:       string | null
  segmentationName: string
  schemaSortKey:    number
  isHou:            boolean
  rows:             LyComparisonAccountRow[]
  monthlyTotals:    Record<string, LyComparisonMonthly>
}

export type LyComparisonAccountSummary = {
  monthly: Record<string, {
    otb:  LyComparisonCell & { occ: number; revpar: number }
    ly:   LyComparisonCell & { occ: number; revpar: number }
    gap:  { nights: number; adr: number; revenue: number; occDiff: number; revparDiff: number }
  }>
  accountCount: number
  groupCount:   number
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
    otb, ly,
    gap: { nights: otb.nights - ly.nights, adr: otb.adr - ly.adr, revenue: otb.revenue - ly.revenue },
  }
}

function zeroMonthly(): LyComparisonMonthly {
  return {
    otb: { nights: 0, adr: 0, revenue: 0 },
    ly:  { nights: 0, adr: 0, revenue: 0 },
    gap: { nights: 0, adr: 0, revenue: 0 },
  }
}

type CodeMeta = {
  parentName:       string | null
  segmentationName: string
  schemaSortKey:    number
  isHou:            boolean
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function buildLyComparisonAccountTable(args: {
  schema:    MarketSchemaRow[]
  lyPacing:  LyPacingRow[]
  roomCount: number
}): {
  groups:    LyComparisonAccountGroup[]
  summary:   LyComparisonAccountSummary
  monthKeys: string[]
} {
  const { schema, lyPacing, roomCount } = args

  // Step A: monthKeys
  const monthKeys = Array.from(new Set(
    lyPacing.map(r => r.business_date.slice(0, 7))
  )).sort()

  // Step B: codeMeta
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
  for (const r of lyPacing) {
    const acct = r.account_name ?? '(미지정)'
    const mk   = r.business_date.slice(0, 7)
    const key  = `${r.segmentation}::${acct}::${mk}`
    let s = rawMap.get(key)
    if (!s) { s = emptyRaw(); rawMap.set(key, s) }
    s.otbNights  += r.otb_nights  ?? 0
    s.otbRevenue += r.otb_revenue ?? 0
    s.lyNights   += r.ly_nights   ?? 0
    s.lyRevenue  += r.ly_revenue  ?? 0
  }

  // Step D: groupMap 구성
  const groupMap = new Map<string, LyComparisonAccountGroup>()

  // (segCode × acct) 단위 raw — monthKey 전체 누적 맵 (표시 여부 판단용)
  const acctTotalRaw = new Map<string, RawStats>()
  for (const [rawKey, st] of rawMap.entries()) {
    const parts  = rawKey.split('::')
    const seg    = parts[0]
    const acct   = parts[1]
    const acctKey = `${seg}::${acct}`
    let a = acctTotalRaw.get(acctKey)
    if (!a) { a = emptyRaw(); acctTotalRaw.set(acctKey, a) }
    a.otbNights  += st.otbNights;  a.otbRevenue += st.otbRevenue
    a.lyNights   += st.lyNights;   a.lyRevenue  += st.lyRevenue
  }

  for (const [acctKey, total] of acctTotalRaw.entries()) {
    // 최소 하나의 월에 nights > 0 이면 표시
    if (total.otbNights === 0 && total.lyNights === 0) continue

    const parts   = acctKey.split('::')
    const segCode = parts[0]
    const acctName = parts[1]

    const meta: CodeMeta = codeMeta.get(segCode) ?? {
      parentName: null, segmentationName: `(미정의) ${segCode}`, schemaSortKey: 99999, isHou: false,
    }

    const gKey = meta.parentName
      ? `${meta.parentName}-${meta.segmentationName}`
      : meta.segmentationName

    let g = groupMap.get(gKey)
    if (!g) {
      g = { key: gKey, parentName: meta.parentName, segmentationName: meta.segmentationName, schemaSortKey: meta.schemaSortKey, isHou: meta.isHou, rows: [], monthlyTotals: {} }
      for (const mk of monthKeys) g.monthlyTotals[mk] = zeroMonthly()
      groupMap.set(gKey, g)
    }

    // account row: monthly 데이터 구성
    const monthly: Record<string, LyComparisonMonthly> = {}
    for (const mk of monthKeys) {
      const raw = rawMap.get(`${segCode}::${acctName}::${mk}`)
      monthly[mk] = raw ? toMonthly(raw) : zeroMonthly()
    }
    g.rows.push({ account_name: acctName, monthly })
  }

  // Step E: rows 정렬 + monthlyTotals 계산
  for (const g of groupMap.values()) {
    // rows 정렬: 모든 월 otb.nights 합 내림차순
    g.rows.sort((a, b) => {
      const sumA = monthKeys.reduce((s, mk) => s + (a.monthly[mk]?.otb.nights ?? 0), 0)
      const sumB = monthKeys.reduce((s, mk) => s + (b.monthly[mk]?.otb.nights ?? 0), 0)
      return sumB - sumA
    })

    // monthlyTotals: 그룹 내 rows raw 누적 (가중평균 ADR)
    for (const mk of monthKeys) {
      const acc = emptyRaw()
      for (const row of g.rows) {
        const m = row.monthly[mk] ?? zeroMonthly()
        acc.otbNights  += m.otb.nights;  acc.otbRevenue += m.otb.revenue
        acc.lyNights   += m.ly.nights;   acc.lyRevenue  += m.ly.revenue
      }
      g.monthlyTotals[mk] = toMonthly(acc)
    }
  }

  // Step F: groups 정렬
  const groups = [...groupMap.values()].sort((a, b) =>
    a.schemaSortKey !== b.schemaSortKey
      ? a.schemaSortKey - b.schemaSortKey
      : a.segmentationName.localeCompare(b.segmentationName, 'ko')
  )

  // Step G: summary (HOU 제외)
  let accountCount = 0
  const summaryMonthly: LyComparisonAccountSummary['monthly'] = {}

  for (const mk of monthKeys) {
    const acc = emptyRaw()
    for (const g of groups) {
      accountCount += g.rows.length
      if (g.isHou) continue
      const m = g.monthlyTotals[mk] ?? zeroMonthly()
      acc.otbNights  += m.otb.nights;  acc.otbRevenue += m.otb.revenue
      acc.lyNights   += m.ly.nights;   acc.lyRevenue  += m.ly.revenue
    }
    accountCount = 0 // reset — will compute properly below
    const m = toMonthly(acc)
    const [y, mo]     = mk.split('-').map(Number)
    const daysInMonth  = new Date(y, mo, 0).getDate()
    const denom        = roomCount * daysInMonth
    const otbOcc    = denom > 0 ? (m.otb.nights / denom) * 100 : 0
    const otbRevpar = denom > 0 ?  m.otb.revenue / denom        : 0
    const lyOcc     = denom > 0 ? (m.ly.nights   / denom) * 100 : 0
    const lyRevpar  = denom > 0 ?  m.ly.revenue  / denom        : 0
    summaryMonthly[mk] = {
      otb: { ...m.otb, occ: otbOcc,  revpar: otbRevpar },
      ly:  { ...m.ly,  occ: lyOcc,   revpar: lyRevpar  },
      gap: { nights: m.gap.nights, adr: m.gap.adr, revenue: m.gap.revenue, occDiff: otbOcc - lyOcc, revparDiff: otbRevpar - lyRevpar },
    }
  }

  // accountCount 재계산
  for (const g of groups) accountCount += g.rows.length

  return {
    groups,
    summary: { monthly: summaryMonthly, accountCount, groupCount: groups.length },
    monthKeys,
  }
}
