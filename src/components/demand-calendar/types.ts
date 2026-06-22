export type DemandDayData = {
  businessDate: string        // 'YYYY-MM-DD'
  // 현재 OTB (OTB date picker 기준)
  otbOcc: number              // 0~100
  // 픽업기준 (OTB date -30일)
  pkOcc: number
  // 전년동기 (LY yoy_match 기준)
  lyOcc: number
  // 툴팁용 추가 정보
  otbAdr: number
  lyAdr: number
  isHoliday: boolean
  holidayName: string | null
}
