import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type BudgetMonthlyRow = {
  segmentation:   string
  sorting1:       string | null
  sorting2:       string | null
  sorting3:       string | null
  month_num:      number
  budget_nights:  number
  budget_revenue: number
}

export function useBudgetMonthly(args: {
  hotelId:    string | undefined
  year:       number
  updateDate: string | null
}) {
  return useQuery({
    queryKey: ['budget_monthly', args.hotelId, args.year, args.updateDate],
    enabled: !!args.hotelId && !!args.updateDate,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_budget_monthly', {
        p_hotel_id:    args.hotelId!,
        p_year:        args.year,
        p_update_date: args.updateDate!,
      })
      if (error) throw error
      return (data ?? []).map((r: any): BudgetMonthlyRow => ({
        segmentation:   r.segmentation,
        sorting1:       r.sorting1,
        sorting2:       r.sorting2,
        sorting3:       r.sorting3,
        month_num:      r.month_num,
        budget_nights:  Number(r.budget_nights),
        budget_revenue: Number(r.budget_revenue),
      }))
    },
    staleTime: 60 * 1000,
  })
}
