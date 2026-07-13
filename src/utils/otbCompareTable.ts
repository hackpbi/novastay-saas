// 전년 OTB 비교 (/pickup/otb-compare) 전용 집계 유틸
// get_ly_pacing_data(_v2) 행(LyPacingRow)에서 세그먼트 계층별
// 현재 OTB / 전년 OTB / GAP 를 산출한다. (MarketPickupDayModal 전년비교 탭과 동일 로직)

import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import type { LyPacingRow } from '@/hooks/useLyPacing'

export type OtbCompareVals = {
  otbN: number; otbAdr: number; otbR: number
  lyN:  number; lyAdr:  number; lyR:  number
  gapN: number; gapAdr: number; gapR: number
}

export type OtbCompareSegRow = OtbCompareVals & {
  id:            string
  name:          string
  level:         'main' | 'mid' | 'sub'
  isBold:        boolean
  bgDarkColor:   string | null
  fontDarkColor: string | null
}

export type OtbCompareAccRow = OtbCompareVals & { name: string }

// 스키마 id별 코드 (main=자식 코드 합집합 / mid·sub=자기 코드) — 모달 codesBySchemaId 동일
export function codesBySchemaId(schema: MarketSchemaRow[]): Record<string, string[]> {
  const m: Record<string, string[]> = {}
  for (const s of schema) {
    m[s.id] = s.level === 'main'
      ? schema.filter(c => c.parent_id === s.id).flatMap(c => c.segmentation ?? [])
      : (s.segmentation ?? [])
  }
  return m
}

// 스키마 정렬: 상위(parent_id=null) order_index순, main 뒤에 자식 sub 붙임 — buildSegTable 동일
export function orderedSchema(schema: MarketSchemaRow[]): MarketSchemaRow[] {
  const top = schema.filter(s => s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
  const out: MarketSchemaRow[] = []
  for (const t of top) {
    out.push(t)
    if (t.level === 'main') {
      out.push(...schema.filter(c => c.parent_id === t.id).sort((a, b) => a.order_index - b.order_index))
    }
  }
  return out
}

// 표 Total 과 동일한 코드 집합 — main 세그먼트들의 자식 코드 합집합.
// 차트 OCC 를 표 Total(main 계층 합) 과 일치시키기 위해 사용.
export function mainSegCodes(schema: MarketSchemaRow[]): Set<string> {
  const codes = codesBySchemaId(schema)
  const set = new Set<string>()
  for (const s of schema) {
    if (s.level === 'main') for (const c of (codes[s.id] ?? [])) set.add(c)
  }
  return set
}

const vals = (otbN: number, otbR: number, lyN: number, lyR: number): OtbCompareVals => {
  const otbAdr = otbN > 0 ? Math.round(otbR / otbN) : 0
  const lyAdr  = lyN  > 0 ? Math.round(lyR  / lyN)  : 0
  return { otbN, otbAdr, otbR, lyN, lyAdr, lyR, gapN: otbN - lyN, gapAdr: otbAdr - lyAdr, gapR: otbR - lyR }
}

// lyRows(이미 날짜 필터됨) → 세그먼트 계층별 현재 OTB / 전년 OTB / GAP + Total(main 합)
export function buildOtbCompare(
  schema: MarketSchemaRow[],
  lyRows: LyPacingRow[],
): { rows: OtbCompareSegRow[]; total: OtbCompareVals } {
  const codes = codesBySchemaId(schema)

  // 코드별 현재 OTB / 전년 OTB 집계
  const byCode: Record<string, { otbN: number; otbR: number; lyN: number; lyR: number }> = {}
  for (const r of lyRows) {
    const c = byCode[r.segmentation] ?? (byCode[r.segmentation] = { otbN: 0, otbR: 0, lyN: 0, lyR: 0 })
    c.otbN += r.otb_nights ?? 0; c.otbR += r.otb_revenue ?? 0
    c.lyN  += r.ly_nights  ?? 0; c.lyR  += r.ly_revenue  ?? 0
  }

  const forId = (id: string) => {
    let otbN = 0, otbR = 0, lyN = 0, lyR = 0
    for (const code of (codes[id] ?? [])) {
      const c = byCode[code]
      if (c) { otbN += c.otbN; otbR += c.otbR; lyN += c.lyN; lyR += c.lyR }
    }
    return vals(otbN, otbR, lyN, lyR)
  }

  const rows: OtbCompareSegRow[] = orderedSchema(schema).map(s => ({
    id:            s.id,
    name:          s.name,
    level:         s.level,
    isBold:        s.is_bold,
    bgDarkColor:   s.bg_dark_color,
    fontDarkColor: s.font_dark_color,
    ...forId(s.id),
  }))

  // Total — main 행만 합산 (모달 lyTotal 동일)
  const t = rows.filter(r => r.level === 'main').reduce(
    (a, r) => ({ otbN: a.otbN + r.otbN, otbR: a.otbR + r.otbR, lyN: a.lyN + r.lyN, lyR: a.lyR + r.lyR }),
    { otbN: 0, otbR: 0, lyN: 0, lyR: 0 },
  )
  return { rows, total: vals(t.otbN, t.otbR, t.lyN, t.lyR) }
}

// 선택 세그먼트(코드 집합) → account 단위 현재 OTB / 전년 OTB / GAP
export function buildOtbCompareAccounts(codeList: string[], lyRows: LyPacingRow[]): OtbCompareAccRow[] {
  const set = new Set(codeList)
  const byAcc: Record<string, { otbN: number; otbR: number; lyN: number; lyR: number }> = {}
  for (const r of lyRows) {
    if (!set.has(r.segmentation)) continue
    const name = r.account_name || '(미지정)'
    const a = byAcc[name] ?? (byAcc[name] = { otbN: 0, otbR: 0, lyN: 0, lyR: 0 })
    a.otbN += r.otb_nights ?? 0; a.otbR += r.otb_revenue ?? 0
    a.lyN  += r.ly_nights  ?? 0; a.lyR  += r.ly_revenue  ?? 0
  }
  return Object.entries(byAcc).map(([name, a]) => ({ name, ...vals(a.otbN, a.otbR, a.lyN, a.lyR) }))
}

// ── 포맷터 (MarketPickupDayModal 전년비교 탭 동일) ──────────────────────────────
export const otbFmt = {
  rn:  (v: number) => (v === 0 ? '—' : v.toLocaleString()),
  adr: (v: number) => (v === 0 ? '—' : `${Math.round(v / 1000)}k`),
  rev: (v: number) => (v === 0 ? '—' : `${(v / 1e6).toFixed(1)}M`),
  gapRn:  (v: number) => (v === 0 ? '—' : `${v > 0 ? '+' : ''}${v}`),
  gapAdr: (v: number) => (Math.abs(v) < 500   ? '—' : `${v > 0 ? '+' : ''}${Math.round(v / 1000)}k`),
  gapRev: (v: number) => (Math.abs(v) < 50000 ? '—' : `${v > 0 ? '+' : ''}${(v / 1e6).toFixed(1)}M`),
}

// GAP 색: 양수 mint / 음수 red / 0 흐림
export const gapColor = (v: number) => (v > 0 ? '#00E5A0' : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)')
export const LY_GRAY  = 'rgba(255,255,255,0.45)'
