import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useLatestConfirmedBudgetDate(hotelId: string | undefined) {
  return useQuery({
    queryKey: ['latest_confirmed_budget_date', hotelId],
    enabled: !!hotelId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a04_budget_mtd')
        .select('update_date')
        .eq('hotel_id', hotelId!)
        .eq('confirmed', true)
        .order('update_date', { ascending: false })
        .limit(1)
      if (error) throw error
      return (data?.[0]?.update_date ?? null) as string | null
    },
    staleTime: 5 * 60 * 1000,
  })
}
