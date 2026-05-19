import { useQuery } from '@tanstack/react-query'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { supabase } from '@/lib/supabase'

export type OtbVsActualRow = {
  business_date:   string
  act_date:        string | null
  segmentation:    string
  sorting1:        string | null
  sorting2:        string | null
  sorting3:        string | null
  otb_nights:      number
  otb_revenue:     number
  act_nights:      number
  act_revenue:     number
  var_nights_pct:  number | null
  var_revenue_pct: number | null
}

export function useOtbVsActual() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''
  const { otbDate } = useDateContext()

  const query = useQuery<OtbVsActualRow[]>({
    queryKey: ['otb_vs_actual', hotelId, otbDate],
    queryFn: async () => {
      if (!hotelId || !otbDate) return []
      try {
        console.log('otb_vs_actual 호출:', { hotelId, otbDate })
        const { data, error } = await (supabase as any)
          .rpc('get_otb_vs_actual', {
            p_hotel_id: hotelId,
            p_otb_date: otbDate,
          })
          .limit(100000)
        console.log('otb_vs_actual 결과:', data?.length, 'error:', error)
        if (error) throw error
        return data as OtbVsActualRow[]
      } catch (err) {
        console.error('otb_vs_actual 에러:', err)
        throw err
      }
    },
    enabled: !!hotelId && !!otbDate,
    staleTime: 5 * 60 * 1000,
  })

  return {
    data:    query.data ?? [],
    loading: query.isLoading,
    error:   query.error,
  }
}
