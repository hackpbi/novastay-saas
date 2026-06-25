import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type ActualMonthlyRow = {
  year:           number
  month_num:      number
  segmentation:   string
  sorting1:       string | null
  sorting2:       string | null
  sorting3:       string | null
  account_name:   string | null
  actual_nights:  number
  actual_revenue: number
}

export function useActualMonthly(args: {
  hotelId:  string | undefined
  fromYear: number
  toYear:   number
}) {
  return useQuery({
    queryKey: ['actual-monthly', args.hotelId, args.fromYear, args.toYear],
    enabled: !!args.hotelId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_actual_monthly', {
        p_hotel_id:  args.hotelId,
        p_from_year: args.fromYear,
        p_to_year:   args.toYear,
      })
      if (error) throw error
      return (data ?? []).map((r: any): ActualMonthlyRow => ({
        year:           Number(r.year),
        month_num:      Number(r.month_num),
        segmentation:   r.segmentation,
        sorting1:       r.sorting1,
        sorting2:       r.sorting2,
        sorting3:       r.sorting3,
        account_name:   r.account_name,
        actual_nights:  Number(r.actual_nights),
        actual_revenue: Number(r.actual_revenue),
      }))
    },
    staleTime: 60 * 1000,
  })
}
