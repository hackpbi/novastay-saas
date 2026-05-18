'use client'

import { Bell } from 'lucide-react'
import PageShell, { ComingSoon } from '@/components/PageShell'

export default function NotificationsPage() {
  return (
    <PageShell
      title="알림"
      subtitle="요금 변경, 수요 급증, 채널 오류 등의 실시간 알림을 확인합니다"
    >
      <ComingSoon icon={<Bell size={22} />} title="알림" />
    </PageShell>
  )
}
