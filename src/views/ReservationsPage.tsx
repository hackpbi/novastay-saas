'use client'

import { CalendarDays } from 'lucide-react'
import PageShell, { ComingSoon } from '@/components/PageShell'

export default function ReservationsPage() {
  return (
    <PageShell
      title="예약 현황"
      subtitle="전체 시설의 예약 현황과 객실 가용성을 실시간으로 확인합니다"
      badge="운영"
    >
      <ComingSoon icon={<CalendarDays size={22} />} title="예약 현황" />
    </PageShell>
  )
}
