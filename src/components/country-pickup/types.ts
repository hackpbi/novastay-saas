// Country Pick-up 타입 + 국기 이모지 헬퍼

// get_country_pickup_data RPC 원본 반환행 (세그먼트 단위)
export type CountryPickupRpcRow = {
  country:         string   // ISO alpha-3 (KOR, CHN ...)
  country_name_ko: string   // 대한민국, 중국 ...
  country_name_en: string   // Korea (the Republic of) ...
  alpha2:          string   // KR, CN ... → 국기 이모지 생성용
  segmentation:    string
  sorting2:        string
  account_name:    string
  otb_nights:      number
  vs_nights:       number
  otb_revenue:     number
  vs_revenue:      number
}

// 국기 이모지 — alpha2 코드 → regional indicator (KST/날짜 무관, 순수 변환)
export const getFlagEmoji = (alpha2: string): string => {
  if (!alpha2) return '🌐'
  return alpha2.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397))
}
