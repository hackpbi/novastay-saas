// 로컬 시간대 기준 'YYYY-MM-DD' 문자열.
// new Date(...).toISOString().slice(0,10) 은 UTC로 변환되어 KST(UTC+9)에선
// 말일/오늘이 하루 밀리는 버그가 있어, 로컬 연·월·일을 직접 조립한다.
export function toLocalYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayLocalYMD(): string {
  return toLocalYMD(new Date())
}
