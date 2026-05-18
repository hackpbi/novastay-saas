'use client'

import AppLayout from '@/layouts/AppLayout'

export const dynamic = 'force-dynamic'

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>
}
