'use client'

import { createContext, useContext } from 'react'

type FcstDateContextType = {
  fcstDate:    string
  fcstDates:   string[]
  setFcstDate: (date: string) => void
}

export const FcstDateContext = createContext<FcstDateContextType | null>(null)

export function useFcstDateContext() {
  const ctx = useContext(FcstDateContext)
  if (!ctx) throw new Error('useFcstDateContext must be used within AppLayout')
  return ctx
}
