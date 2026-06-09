import { useQuery } from '@tanstack/react-query'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { supabase } from '@/lib/supabase'

export type LyPacingRow = {
  business_date:        string
  segmentation:         string
  account_name:         string | null
  sorting1:             string | null
  sorting2:             string | null
  sorting3:             string | null
  otb_nights:           number
  otb_revenue:          number
  ly_nights:            number
  ly_revenue:           number
  ly_diff_nights:       number
  ly_diff_revenue:      number
  ly_match_update_date: string | null
}

export type LyPacingMode = 'v1' | 'v2'

export function useLyPacing(mode: LyPacingMode = 'v1') {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''
  const { otbDate } = useDateContext()

  const rpcName = mode === 'v2' ? 'get_ly_pacing_data_v2' : 'get_ly_pacing_data'

  const query = useQuery<LyPacingRow[]>({
    queryKey: ['ly_pacing', hotelId, otbDate, mode],
    queryFn: async () => {
      if (!hotelId || !otbDate) return []
      const { data, error } = await (supabase as any)
        .rpc(rpcName, {
          p_hotel_id: hotelId,
          p_otb_date: otbDate,
        })
        .limit(100000)
      if (error) throw error
      return (data ?? []).map((r: any): LyPacingRow => ({
        business_date:        r.business_date,
        segmentation:         r.segmentation,
        account_name:         r.account_name,
        sorting1:             r.sorting1,
        sorting2:             r.sorting2,
        sorting3:             r.sorting3,
        otb_nights:           Number(r.otb_nights),
        otb_revenue:          Number(r.otb_revenue),
        ly_nights:            Number(r.ly_nights),
        ly_revenue:           Number(r.ly_revenue),
        ly_diff_nights:       Number(r.ly_diff_nights),
        ly_diff_revenue:      Number(r.ly_diff_revenue),
        ly_match_update_date: r.ly_match_update_date,
      }))
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
