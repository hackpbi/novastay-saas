import { useQuery } from '@tanstack/react-query'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { supabase } from '@/lib/supabase'

export type LyPacingRow = {
  business_date:   string
  segmentation:    string
  sorting1:        string | null
  sorting2:        string | null
  sorting3:        string | null
  otb_nights:      number
  otb_revenue:     number
  ly_nights:       number
  ly_revenue:      number
  ly_diff_nights:  number
  ly_diff_revenue: number
}

export function useLyPacing() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''
  const { otbDate } = useDateContext()

  const query = useQuery<LyPacingRow[]>({
    queryKey: ['ly_pacing', hotelId, otbDate],
    queryFn: async () => {
      if (!hotelId || !otbDate) return []
      const { data, error } = await (supabase as any)
        .rpc('get_ly_pacing_data', {
          p_hotel_id: hotelId,
          p_otb_date: otbDate,
        })
        .limit(100000)
      if (error) throw error
      return data as LyPacingRow[]
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
