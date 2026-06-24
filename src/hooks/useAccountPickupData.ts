// Account Pick-up 데이터 훅
// isPastMonth=false → get_account_pickup_data (a02_otb_daily, OTB vs VS)
// isPastMonth=true  → get_account_actual_data (a01_actual_daily + yoy_match, ACT vs LY)
//
// 과거월(get_account_actual_data)은 LY(전년) 컬럼을 자체 반환하므로
// Country Pick-up처럼 별도 LY 쿼리가 필요 없다.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// 현재/미래월 — get_account_pickup_data 반환행 (세그먼트×어카운트 단위)
export type AccountPickupRow = {
  account_name: string
  segmentation: string
  seg_name:     string
  sorting2:     string   // 'fit' | 'group'
  otb_nights:   number
  otb_revenue:  number
  vs_nights:    number   // 픽업 계산용 (어제 OTB) — LY 아님
  vs_revenue:   number
  pu_nights:    number
  pu_revenue:   number
  ly_nights:    number   // 전년 동기간 actual (yoy_match 기반)
  ly_revenue:   number   // 전년 동기간 actual (yoy_match 기반)
}

// 과거월 — get_account_actual_data 반환행
export type AccountActualRow = {
  account_name: string
  segmentation: string
  seg_name:     string
  sorting2:     string
  act_nights:   number
  act_revenue:  number
  ly_nights:    number
  ly_revenue:   number
  gap_nights:   number
  gap_revenue:  number
}

export type AccountRow = AccountPickupRow | AccountActualRow

export function useAccountPickupData({
  hotelId,
  otbDate,
  vsDate,
  year,
  month,      // 1-based
  segFilter,  // null | 'fit' | 'group'
  isPastMonth,
}: {
  hotelId:     string | undefined
  otbDate:     string
  vsDate:      string
  year:        number
  month:       number
  segFilter:   string | null
  isPastMonth: boolean
}) {
  return useQuery<AccountRow[]>({
    queryKey: ['account-pickup', hotelId, otbDate, vsDate, year, month, segFilter, isPastMonth],
    enabled:  !!hotelId && !!otbDate && (isPastMonth || !!vsDate),
    queryFn: async () => {
      if (isPastMonth) {
        const { data, error } = await (supabase as any).rpc('get_account_actual_data', {
          p_hotel_id:     hotelId,
          p_year:         year,
          p_month:        month,
          p_segmentation: segFilter,
        })
        if (error) throw error
        return (data ?? []) as AccountActualRow[]
      }
      const { data, error } = await (supabase as any).rpc('get_account_pickup_data', {
        p_hotel_id:     hotelId,
        p_otb_date:     otbDate,
        p_vs_date:      vsDate,
        p_year:         year,
        p_month:        month,
        p_segmentation: segFilter,
      })
      if (error) throw error
      return (data ?? []) as AccountPickupRow[]
    },
  })
}
