import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useForecastDates(hotelId: string | undefined) {
  return useQuery({
    queryKey: ['forecast_dates', hotelId],
    enabled: !!hotelId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_forecast_dates', {
        p_hotel_id: hotelId!,
      })
      if (error) throw error
      return (data ?? []).map((r: any) => r.forecast_date as string)
    },
    staleTime: 5 * 60 * 1000,
  })
}
