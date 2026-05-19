'use client'

import { createContext, useContext } from 'react'

type DateContextType = {
  otbDate:      string
  vsOtbDate:    string
  otbDates:     string[]
  setOtbDate:   (date: string) => void
  setVsOtbDate: (date: string) => void
}

export const DateContext = createContext<DateContextType | null>(null)

export function useDateContext() {
  const ctx = useContext(DateContext)
  if (!ctx) throw new Error('useDateContext must be used within AppLayout')
  return ctx
}
