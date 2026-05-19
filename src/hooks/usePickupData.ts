import { useQuery } from '@tanstack/react-query'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { supabase } from '@/lib/supabase'

export type PickupRow = {
  business_date:   string
  room_type_code:  string
  segmentation:    string
  sorting1:        string | null
  sorting2:        string | null
  sorting3:        string | null
  otb_nights:      number
  otb_revenue:     number
  vs_otb_nights:   number
  vs_otb_revenue:  number
  min_nights:      number
  min_revenue:     number
  pu_nights:       number
  pu_revenue:      number
  pu_min_nights:   number
  pu_min_revenue:  number
}

export function usePickupData() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  const { otbDate, vsOtbDate, otbDates } = useDateContext()

  const minDate = otbDates[otbDates.length - 1] ?? ''

  const query = useQuery<PickupRow[]>({
    queryKey: ['pickup_data', hotelId, otbDate, vsOtbDate, minDate],
    queryFn: async () => {
      if (!hotelId || !otbDate || !vsOtbDate || !minDate) return []

      const { data, error } = await (supabase as any)
        .rpc('get_pickup_data', {
          p_hotel_id:    hotelId,
          p_otb_date:    otbDate,
          p_vs_otb_date: vsOtbDate,
          p_min_date:    minDate,
        })

      if (error) throw error
      return data as PickupRow[]
    },
    enabled: !!hotelId && !!otbDate && !!vsOtbDate && !!minDate,
    staleTime: 5 * 60 * 1000,
  })

  return {
    data:      query.data ?? [],
    loading:   query.isLoading,
    error:     query.error,
    refetch:   query.refetch,
    otbDate,
    vsOtbDate,
    minDate,
  }
}
