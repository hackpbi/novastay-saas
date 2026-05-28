'use client'

import {
  createContext, useContext, useEffect,
  useState, useCallback, type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CurrentHotel = {
  id:          string
  hotel_name:  string
  slug:        string
  role:        string
  city:        string | null
  star_rating: number | null
  logo_url:    string | null
}

type HotelContextValue = {
  currentHotel: CurrentHotel | null
  hotels:       CurrentHotel[]
  loading:      boolean
  switchHotel:  (hotelId: string) => void
  loadHotels:   (profileId: string) => Promise<void>
}

// ── Context ───────────────────────────────────────────────────────────────────

const HotelContext = createContext<HotelContextValue>({
  currentHotel: null,
  hotels:       [],
  loading:      true,
  switchHotel:  () => {},
  loadHotels:   async () => {},
})

// ── Provider ──────────────────────────────────────────────────────────────────

export function HotelProvider({ children }: { children: ReactNode }) {
  const { profile, loading: authLoading } = useAuth()

  const [currentHotel, setCurrentHotel] = useState<CurrentHotel | null>(null)
  const [hotels,       setHotels]       = useState<CurrentHotel[]>([])
  const [loading,      setLoading]      = useState(true)

  const loadAllHotels = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await (supabase as any)
        .from('m02_hotels')
        .select(`
          id, hotel_name, slug, is_active,
          m03_hotel_details (city, star_rating, logo_url)
        `)
        .order('hotel_name')

      const hotelList: CurrentHotel[] = (data ?? []).map((h: any) => ({
        id:          h.id,
        hotel_name:  h.hotel_name,
        slug:        h.slug,
        role:        'admin',
        city:        h.m03_hotel_details?.city       ?? null,
        star_rating: h.m03_hotel_details?.star_rating ?? null,
        logo_url:    h.m03_hotel_details?.logo_url    ?? null,
      }))

      setHotels(hotelList)

      if (typeof window !== 'undefined') {
        const savedId = localStorage.getItem('currentHotelId')
        const saved   = hotelList.find(h => h.id === savedId)
        setCurrentHotel(saved ?? hotelList[0] ?? null)
      } else {
        setCurrentHotel(hotelList[0] ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHotels = useCallback(async (profileId: string) => {
    setLoading(true)
    try {
      const { data } = await (supabase as any)
        .from('m10_profile_hotels')
        .select(`
          role,
          m02_hotels (
            id, hotel_name, slug, is_active,
            m03_hotel_details (city, star_rating, logo_url)
          )
        `)
        .eq('profile_id', profileId)
        .eq('is_active', true)

      const hotelList: CurrentHotel[] = (data ?? [])
        .filter((h: any) => h.m02_hotels?.is_active)
        .map((h: any) => ({
          id:          h.m02_hotels.id,
          hotel_name:  h.m02_hotels.hotel_name,
          slug:        h.m02_hotels.slug,
          role:        h.role,
          city:        h.m02_hotels.m03_hotel_details?.city ?? null,
          star_rating: h.m02_hotels.m03_hotel_details?.star_rating ?? null,
          logo_url:    h.m02_hotels.m03_hotel_details?.logo_url ?? null,
        }))

      setHotels(hotelList)

      // localStorage에서 마지막 선택 호텔 복원 (SSR guard)
      if (typeof window !== 'undefined') {
        const savedId = localStorage.getItem('currentHotelId')
        const saved   = hotelList.find(h => h.id === savedId)
        setCurrentHotel(saved ?? hotelList[0] ?? null)
      } else {
        setCurrentHotel(hotelList[0] ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && profile) {
      const role = (profile as any).role as string
      // super_admin / admin 은 호텔 컨텍스트 불필요
      if (role === 'super_admin' || role === 'admin') {
        loadAllHotels()
        return
      }
      loadHotels(profile.id)
    }
    if (!authLoading && !profile) {
      setLoading(false)
    }
  }, [authLoading, profile, loadAllHotels, loadHotels])

  function switchHotel(hotelId: string) {
    const hotel = hotels.find(h => h.id === hotelId)
    if (hotel) {
      setCurrentHotel(hotel)
      if (typeof window !== 'undefined') {
        localStorage.setItem('currentHotelId', hotelId)
      }
    }
  }

  return (
    <HotelContext.Provider value={{ currentHotel, hotels, loading, switchHotel, loadHotels }}>
      {children}
    </HotelContext.Provider>
  )
}

export const useHotel = () => useContext(HotelContext)
