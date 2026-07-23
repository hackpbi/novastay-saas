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
      const { data, error } = await (supabase as any)
        .from('a04_budget_mtd')
        .select('year, month, segmentation, budget_nights, budget_revenue')
        .eq('hotel_id', args.hotelId!)
        .eq('update_date', args.updateDate!)
        .eq('confirmed', true)
      if (error) throw error
      return (data ?? [])
        .filter((r: any) => r.year === args.year)
        .map((r: any): BudgetMonthlyRow => ({
          segmentation:   r.segmentation,
          sorting1:       r.sorting1 ?? null,
          sorting2:       r.sorting2 ?? null,
          sorting3:       r.sorting3 ?? null,
          month_num:      Number(r.month),
          budget_nights:  Number(r.budget_nights),
          budget_revenue: Number(r.budget_revenue),
        }))
    },
    staleTime: 60 * 1000,
  })
}
