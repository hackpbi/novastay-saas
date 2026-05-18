interface DaumPostcodeData {
  zonecode:       string   // 우편번호
  address:        string   // 기본 주소 (도로명)
  roadAddress:    string   // 도로명 주소
  jibunAddress:   string   // 지번 주소
  sido:           string   // 시/도
  sigungu:        string   // 시/군/구
  bname:          string   // 법정동/법정리
  buildingName:   string   // 건물명
  apartment:      string   // 아파트 여부
}

interface DaumPostcodeOptions {
  oncomplete: (data: DaumPostcodeData) => void
  onclose?:   (state: string) => void
  width?:     number | string
  height?:    number | string
}

interface DaumPostcode {
  new (options: DaumPostcodeOptions): { open: () => void; embed: (el: HTMLElement) => void }
}

interface Daum {
  Postcode: DaumPostcode
}

interface Window {
  daum: Daum
}
