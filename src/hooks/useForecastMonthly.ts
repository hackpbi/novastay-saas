import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type ForecastMonthlyRow = {
  segmentation:     string
  month_num:        number
  forecast_nights:  number
  forecast_revenue: number
  forecast_adr:     number
}

export function useForecastMonthly(args: {
  hotelId:    string | undefined
  year:       number
  updateDate: string | null
}) {
  return useQuery({
    queryKey: ['forecast_monthly', args.hotelId, args.year, args.updateDate],
    enabled: !!args.hotelId && !!args.updateDate,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_forecast_monthly', {
        p_hotel_id:    args.hotelId!,
        p_year:        args.year,
        p_update_date: args.updateDate!,
      })
      if (error) throw error
      return (data ?? []).map((r: any): ForecastMonthlyRow => ({
        segmentation:     r.segmentation,
        month_num:        r.month_num,
        forecast_nights:  Number(r.forecast_nights),
        forecast_revenue: Number(r.forecast_revenue),
        forecast_adr:     Number(r.forecast_adr),
      }))
    },
    staleTime: 60 * 1000,
  })
}
