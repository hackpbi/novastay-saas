import { useQuery } from '@tanstack/react-query'
import { useHotel } from '@/contexts/HotelContext'
import { supabase } from '@/lib/supabase'

export type MarketSchemaRow = {
  id:               string
  hotel_id:         string
  name:             string
  level:            'main' | 'mid' | 'sub'
  parent_id:        string | null
  order_index:      number
  color:            string | null
  is_bold:          boolean
  font_light_color: string | null
  font_dark_color:  string | null
  segmentation:     string[]
  is_active:        boolean
}

export function useMarketSchema() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  const query = useQuery<MarketSchemaRow[]>({
    queryKey: ['market_schema', hotelId],
    queryFn: async () => {
      if (!hotelId) return []
      const { data, error } = await (supabase as any)
        .from('c05_market_table_schema')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
        .order('order_index', { ascending: true })
      if (error) throw error
      return data as MarketSchemaRow[]
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
  })

  return {
    data:    query.data ?? [],
    loading: query.isLoading,
    error:   query.error,
  }
}
