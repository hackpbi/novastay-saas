export type ForecastSegment = {
  id: string
  name: string
  isBold: boolean
  orderIndex: number
  // Step 3에서 children 추가 예정
}

export type SegmentValue = {
  rn: number   // Room Nights
  adr: number  // 원 단위 (DB 기준)
  rev: number  // 원 단위 (DB 기준)
}

export type DailyForecast = {
  business_date: string                    // '2026-05-01'
  day_label: string                        // '5/1 (금)'
  segments: Record<string, SegmentValue>   // { corpfit: {...}, direct: {...}, ... }
}
