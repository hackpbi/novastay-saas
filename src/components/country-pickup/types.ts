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
  ly_nights:       number
  ly_revenue:      number
}

// alpha2 소문자 → flag-icons 클래스명 (예: 'KR' → 'fi fi-kr')
export const getFlagClass = (alpha2: string): string => {
  if (!alpha2) return ''
  return `fi fi-${alpha2.toLowerCase()}`
}
