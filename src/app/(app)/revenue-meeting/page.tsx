'use client'

import { useHotel } from '@/contexts/HotelContext'
import RevenueMeetingPage from '@/components/meeting/RevenueMeetingPage'

export default function Page() {
  const { currentHotel } = useHotel()
  return <RevenueMeetingPage hotelId={currentHotel?.id ?? ''} />
}
