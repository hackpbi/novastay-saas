// Country Pick-up 표시용 타입 + 국가코드(ISO3) → 한글명 매핑

// 차트/테이블이 사용하는 표시용 행
export type CountryRow = {
  code:    string
  name:    string
  otbRn:   number
  vsRn:    number
  otbRev:  number
  vsRev:   number
  puRn:    number
  puAdr:   number | null   // k 단위
  otbAdr:  number          // k 단위
}

// country별 집계 단위 (enrich 입력)
export type CountryAgg = {
  country:     string   // ISO 3자리 (KOR, USA, CHN ...)
  otb_nights:  number
  vs_nights:   number
  otb_revenue: number
  vs_revenue:  number
}

// get_country_pickup_data RPC 원본 반환행 (세그먼트 단위, segmentation/sorting2/account_name 포함)
export type CountryPickupRpcRow = CountryAgg & {
  segmentation: string
  sorting2:     string
  account_name: string
}

export const COUNTRY_NAMES: Record<string, string> = {
  KOR: '대한민국', OTH: '기타', USA: '미국', CHN: '중국',
  DEU: '독일', HKG: '홍콩', SGP: '싱가포르', IDN: '인도네시아',
  JPN: '일본', AUS: '호주', GBR: '영국', IRL: '아일랜드',
  IND: '인도', TWN: '대만', FRA: '프랑스', ITA: '이탈리아',
  NLD: '네덜란드', BGD: '방글라데시', THA: '태국', AUT: '오스트리아',
  ISR: '이스라엘', CAN: '캐나다',
}

// 집계행 → 표시용 행 변환
export function enrichCountryRow(r: CountryAgg): CountryRow {
  const otbAdr = r.otb_nights > 0 ? Math.round(r.otb_revenue / r.otb_nights / 1000) : 0
  return {
    code: r.country,
    name: COUNTRY_NAMES[r.country] || r.country,
    otbRn: r.otb_nights,
    vsRn: r.vs_nights,
    otbRev: r.otb_revenue,
    vsRev: r.vs_revenue,
    puRn: r.otb_nights - r.vs_nights,
    puAdr: r.otb_nights > 0 && r.vs_nights > 0
      ? Math.round(r.otb_revenue / r.otb_nights / 1000 - r.vs_revenue / r.vs_nights / 1000)
      : null,
    otbAdr,
  }
}
