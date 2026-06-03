import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useLatestConfirmedBudgetDate(hotelId: string | undefined) {
  return useQuery({
    queryKey: ['latest_confirmed_budget_date', hotelId],
    enabled: !!hotelId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_latest_confirmed_budget_date', {
        p_hotel_id: hotelId!,
      })
      if (error) throw error
      return data as string | null
    },
    staleTime: 5 * 60 * 1000,
  })
}
