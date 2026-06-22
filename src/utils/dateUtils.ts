// 공통 날짜 표시 규칙 유틸
// KST: business_date 'YYYY-MM-DD' 문자열은 new Date(dateStr) 로컬 기준 동일 날짜.

export const DOW = ['일', '월', '화', '수', '목', '금', '토']

// 금(5)/토(6) 빨간색, 나머지(일 포함) 기본색
export function getDayColor(dateStr: string): string {
  const day = new Date(dateStr).getDay()
  return day === 5 || day === 6 ? '#E24B4A' : 'var(--color-text-secondary)'
}

// c06_calendar event 컬럼에서 괄호 안 텍스트 추출
export function extractParenText(event: string | null): string | null {
  if (!event) return null
  const match = event.match(/\(([^)]+)\)/)
  return match ? match[1].trim() : null
}

// 뱃지용 앞 2글자
export function getEventBadge(event: string | null): string | null {
  const paren = extractParenText(event)
  return paren ? paren.slice(0, 2) : null
}
