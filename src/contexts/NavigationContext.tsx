'use client'

import { createContext, useContext } from 'react'

interface NavigationContextValue {
  isNavigating:  boolean
  startLoading:  () => void
}

export const NavigationContext = createContext<NavigationContextValue>({
  isNavigating: false,
  startLoading: () => {},
})

export function useNavigating()    { return useContext(NavigationContext).isNavigating }
export function useStartLoading()  { return useContext(NavigationContext).startLoading }
