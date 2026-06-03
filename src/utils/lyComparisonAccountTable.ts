import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { LyPacingRow }    from '@/hooks/useLyPacing'
import type { LyComparisonCell } from './lyComparisonSegTable'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type LyComparisonAccountRow = {
  account_name: string
  otb:  LyComparisonCell
  ly:   LyComparisonCell
  gap:  { nights: number; revenue: number }
}

export type LyComparisonAccountGroup = {
  key:              string
  parentName:       string | null
  segmentationName: string
  schemaSortKey:    number
  isHou:            boolean
  rows:             LyComparisonAccountRow[]
  groupTotal: {
    otb:  LyComparisonCell
    ly:   LyComparisonCell
    gap:  { nights: number; revenue: number }
  }
}

export type LyComparisonAccountSummary = {
  otb:  LyComparisonCell & { occ: number; revpar: number }
  ly:   LyComparisonCell & { occ: number; revpar: number }
  gap:  { nights: number; revenue: number; occDiff: number; revparDiff: number }
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

function toCell(nights: number, revenue: number): LyComparisonCell {
  return {
    nights,
    adr:     nights > 0 ? revenue / nights : 0,
    revenue,
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
  groups:  LyComparisonAccountGroup[]
  summary: LyComparisonAccountSummary
} {
  const { schema, lyPacing, roomCount } = args

  // Step A: codeMeta (accountTable.ts 동일 패턴)
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

  // Step B: (segCode × account_name) raw 누적
  const rawMap = new Map<string, RawStats>()
  for (const r of lyPacing) {
    const acct = r.account_name ?? '(미지정)'
    const key  = `${r.segmentation}::${acct}`
    let s = rawMap.get(key)
    if (!s) { s = emptyRaw(); rawMap.set(key, s) }
    s.otbNights  += r.otb_nights  ?? 0
    s.otbRevenue += r.otb_revenue ?? 0
    s.lyNights   += r.ly_nights   ?? 0
    s.lyRevenue  += r.ly_revenue  ?? 0
  }

  // Step C: groupMap 구성
  const groupMap = new Map<string, LyComparisonAccountGroup>()

  for (const [rawKey, st] of rawMap.entries()) {
    if (st.otbNights === 0 && st.lyNights === 0) continue

    const sep     = rawKey.indexOf('::')
    const segCode = rawKey.slice(0, sep)
    const acctName = rawKey.slice(sep + 2)

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
        groupTotal: {
          otb: toCell(0, 0),
          ly:  toCell(0, 0),
          gap: { nights: 0, revenue: 0 },
        },
      }
      groupMap.set(gKey, g)
    }

    const otb = toCell(st.otbNights, st.otbRevenue)
    const ly  = toCell(st.lyNights,  st.lyRevenue)
    g.rows.push({
      account_name: acctName,
      otb,
      ly,
      gap: { nights: otb.nights - ly.nights, revenue: otb.revenue - ly.revenue },
    })
  }

  // Step D: 각 그룹 rows 정렬 + groupTotal 계산
  for (const g of groupMap.values()) {
    // rows 정렬: 현재 OTB nights 내림차순
    g.rows.sort((a, b) => b.otb.nights - a.otb.nights)

    // groupTotal: raw 합산 후 가중평균 ADR
    const gOtbN = g.rows.reduce((s, r) => s + r.otb.nights,  0)
    const gOtbR = g.rows.reduce((s, r) => s + r.otb.revenue, 0)
    const gLyN  = g.rows.reduce((s, r) => s + r.ly.nights,   0)
    const gLyR  = g.rows.reduce((s, r) => s + r.ly.revenue,  0)
    const gOtb  = toCell(gOtbN, gOtbR)
    const gLy   = toCell(gLyN,  gLyR)
    g.groupTotal = {
      otb: gOtb,
      ly:  gLy,
      gap: { nights: gOtb.nights - gLy.nights, revenue: gOtb.revenue - gLy.revenue },
    }
  }

  // Step E: groups 정렬
  const groups = [...groupMap.values()].sort((a, b) =>
    a.schemaSortKey !== b.schemaSortKey
      ? a.schemaSortKey - b.schemaSortKey
      : a.segmentationName.localeCompare(b.segmentationName, 'ko')
  )

  // Step F: summary (HOU 제외)
  let accountCount = 0
  const sumRaw = emptyRaw()

  for (const g of groups) {
    accountCount += g.rows.length
    if (g.isHou) continue
    sumRaw.otbNights  += g.groupTotal.otb.nights
    sumRaw.otbRevenue += g.groupTotal.otb.revenue
    sumRaw.lyNights   += g.groupTotal.ly.nights
    sumRaw.lyRevenue  += g.groupTotal.ly.revenue
  }

  const totalDays = new Set(lyPacing.map(r => r.business_date)).size
  const denom     = roomCount * totalDays

  const sumOtb = toCell(sumRaw.otbNights, sumRaw.otbRevenue)
  const sumLy  = toCell(sumRaw.lyNights,  sumRaw.lyRevenue)
  const otbOcc    = denom > 0 ? (sumOtb.nights / denom) * 100 : 0
  const otbRevpar = denom > 0 ?  sumOtb.revenue / denom        : 0
  const lyOcc     = denom > 0 ? (sumLy.nights  / denom) * 100 : 0
  const lyRevpar  = denom > 0 ?  sumLy.revenue / denom         : 0

  const summary: LyComparisonAccountSummary = {
    otb: { ...sumOtb, occ: otbOcc, revpar: otbRevpar },
    ly:  { ...sumLy,  occ: lyOcc,  revpar: lyRevpar  },
    gap: {
      nights:     sumOtb.nights  - sumLy.nights,
      revenue:    sumOtb.revenue - sumLy.revenue,
      occDiff:    otbOcc - lyOcc,
      revparDiff: otbRevpar - lyRevpar,
    },
    accountCount,
    groupCount: groups.length,
  }

  return { groups, summary }
}
