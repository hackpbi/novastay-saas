// 당일 픽업 데이터 훅 (get_today_pickup_status / get_today_pickup_slots / get_today_pickup_data)
// 새벽 baseline(a02_otb_daily) 대비 시간별 스냅샷(a02b_otb_today)의 당일 픽업.
//
// updateDate 기본값 = KST 오늘. 투숙월 네비게이션은 client-side로 처리하므로
// updateDate 자체는 (스냅샷 기준일) 고정이다.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// get_today_pickup_data 반환행 (세그먼트×어카운트 단위)
export type TodayPickupRow = {
  business_date: string
  segmentation:  string
  sorting1:      string | null
  sorting2:      string | null
  sorting3:      string | null
  account_no:    string | null
  account_name:  string | null
  base_nights:   number
  base_revenue:  number
  cur_nights:    number
  cur_revenue:   number
  pu_nights:     number
  pu_revenue:    number
}

// get_today_pickup_slots 반환행
export type TodayPickupSlot = {
  slot:     string   // timestamptz 원본 (select value)
  slot_kst: string   // KST 표시 문자열
  rows_cnt: number
  nights:   number
  revenue:  number
}

// get_today_pickup_status 반환 (jsonb 단일 객체)
export type TodayPickupStatus = {
  has_baseline: boolean
  has_today:    boolean
  snapshot_at:  string | null
  base_rows:    number
  today_rows:   number
}

// KST 오늘 (YYYY-MM-DD)
function kstToday(): string {
  return new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
}

export function useTodayPickupStatus({
  hotelId,
  updateDate,
}: {
  hotelId:     string | undefined
  updateDate?: string
}) {
  const d = updateDate ?? kstToday()
  return useQuery<TodayPickupStatus | null>({
    queryKey: ['today-pickup-status', hotelId, d],
    enabled:  !!hotelId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_today_pickup_status', {
        p_hotel_id:    hotelId,
        p_update_date: d,
      })
      if (error) throw error
      return (data ?? null) as TodayPickupStatus | null
    },
  })
}

export function useTodayPickupSlots({
  hotelId,
  updateDate,
}: {
  hotelId:     string | undefined
  updateDate?: string
}) {
  const d = updateDate ?? kstToday()
  return useQuery<TodayPickupSlot[]>({
    queryKey: ['today-pickup-slots', hotelId, d],
    enabled:  !!hotelId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_today_pickup_slots', {
        p_hotel_id:    hotelId,
        p_update_date: d,
      })
      if (error) throw error
      return (data ?? []).map((r: any): TodayPickupSlot => ({
        slot:     r.slot,
        slot_kst: r.slot_kst,
        rows_cnt: Number(r.rows_cnt),
        nights:   Number(r.nights),
        revenue:  Number(r.revenue),
      }))
    },
  })
}

export function useTodayPickupData({
  hotelId,
  updateDate,
  fromSlot,
  toSlot,
}: {
  hotelId:     string | undefined
  updateDate?: string
  fromSlot:    string | null
  toSlot:      string | null
}) {
  const d = updateDate ?? kstToday()
  return useQuery<TodayPickupRow[]>({
    queryKey: ['today-pickup-data', hotelId, d, fromSlot, toSlot],
    enabled:  !!hotelId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_today_pickup_data', {
        p_hotel_id:    hotelId,
        p_update_date: d,
        p_from_slot:   fromSlot ?? null,
        p_to_slot:     toSlot   ?? null,
      })
      if (error) throw error
      return (data ?? []).map((r: any): TodayPickupRow => ({
        business_date: r.business_date,
        segmentation:  r.segmentation,
        sorting1:      r.sorting1,
        sorting2:      r.sorting2,
        sorting3:      r.sorting3,
        account_no:    r.account_no,
        account_name:  r.account_name,
        base_nights:   Number(r.base_nights),
        base_revenue:  Number(r.base_revenue),
        cur_nights:    Number(r.cur_nights),
        cur_revenue:   Number(r.cur_revenue),
        pu_nights:     Number(r.pu_nights),
        pu_revenue:    Number(r.pu_revenue),
      }))
    },
  })
}
