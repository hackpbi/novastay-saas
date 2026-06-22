import type { DemandDayData } from './types'

const HOLIDAYS: Record<string, string> = {
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-09-24': '추석연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석연휴',
  '2026-10-03': '개천절',
  '2026-10-09': '한글날',
  '2026-12-25': '크리스마스',
}

// ── 시드 기반 재현가능 PRNG (Math.random 미사용 → 재렌더 시 값 고정) ──────────────
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function generateMockDemandData(
  year: number,
  month: number,       // 0-indexed
  otbDate: Date,       // OTB date picker 기준일
): DemandDayData[] {
  const days = new Date(year, month + 1, 0).getDate()
  const out: DemandDayData[] = []

  for (let day = 1; day <= days; day++) {
    const date = new Date(year, month, day)
    const businessDate = ymd(date)
    const dow = date.getDay()
    const holidayName = HOLIDAYS[businessDate] ?? null

    const rng = mulberry32(hashStr(businessDate))
    const rand = (min: number, max: number) => min + rng() * (max - min)

    // 기본 OCC
    let occ = rand(42, 72)
    // 요일 가산/감산
    if (dow === 5 || dow === 6) occ += rand(12, 18)   // 금/토
    if (dow === 1) occ -= rand(10, 15)                // 월
    // 공휴일 가산
    if (holidayName) occ += rand(25, 30)
    // OTB 기준일에 가까운 stay date일수록 픽업이 더 쌓여 OCC↑
    const daysFromOtb = (date.getTime() - otbDate.getTime()) / 86400000
    if (daysFromOtb >= 0 && daysFromOtb <= 30) occ += rand(0, 8) * (1 - daysFromOtb / 30)

    const otbOcc = clamp(Math.round(occ), 0, 100)
    const pkOcc  = clamp(Math.round(otbOcc - rand(8, 15)), 0, 100)   // D-30: 픽업 전이라 낮음
    const lyOcc  = clamp(Math.round(otbOcc + rand(-15, 15)), 0, 100) // 전년동기 ±

    const otbAdr = Math.round(rand(180, 250)) * 1000
    const lyAdr  = Math.round(otbAdr / 1000 + rand(-20, 20)) * 1000

    out.push({ businessDate, otbOcc, pkOcc, lyOcc, otbAdr, lyAdr, isHoliday: !!holidayName, holidayName })
  }

  return out
}
