'use client'

import { ThemeProvider } from '@/contexts/ThemeContext'
import { AuthProvider }  from '@/contexts/AuthContext'
import { HotelProvider } from '@/contexts/HotelContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10 * 60 * 1000, retry: 1 },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <HotelProvider>
            {children}
          </HotelProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
