// Pick-up 페이지 전용 유틸 (기존 pickupFormatters.tsx 미수정 — 별도 파일)
// 날짜는 KST 기준: business_date는 'YYYY-MM-DD' 문자열이며
// new Date('YYYY-MM-DD').getFullYear/getMonth/getDate 는 KST(UTC+9)에서 같은 날짜를 돌려준다.

export const MINT = '#00B883'
export const RED  = '#E24B4A'

// 일자별 차트/스파크라인 데이터
export type PickupDaily = {
  day:       number
  dateStr:   string
  dow:       number   // 0=일 ~ 6=토
  isWeekend: boolean
  otbOcc:    number   // OTB OCC%
  puNights:  number   // 픽업 RN
  lyOcc:     number   // 전년 동일자 OCC%
  diffPp:    number   // OTB - LY (%p)
}

export const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토']

// 월 마지막 날 (month1: 1-based)
export const lastDayOfMonth = (year: number, month1: number) => new Date(year, month1, 0).getDate()

// 포매터
export const fmtK   = (v: number) => `${Math.round(v / 1000)}k`
export const fmtM   = (v: number) => `${(v / 1_000_000).toFixed(1)}M`
export const fmtRev = fmtM
export const fmtSign = (v: number) => `${v >= 0 ? '+' : ''}${v}`

// KST 날짜 문자열 (UTC 함수 금지)
export const toKST = (date: Date) => date.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })

// 달성률(OTB ÷ 목표 × 100) 색상
export const achColor = (ach: number) => (ach >= 100 ? MINT : RED)

export function dateParts(dateStr: string) {
  const d = new Date(dateStr)
  return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate(), dow: d.getDay() }
}

// dateStr이 (year, month1) 월에 속하는지 (KST)
export function inMonth(dateStr: string, year: number, month1: number) {
  const d = new Date(dateStr)
  return d.getFullYear() === year && d.getMonth() + 1 === month1
}
