'use client'

import { Globe } from 'lucide-react'
import PageShell, { ComingSoon } from '@/components/PageShell'

export default function ChannelsPage() {
  return (
    <PageShell
      title="채널 관리"
      subtitle="OTA 및 직판 채널을 통합 관리하고 배분 전략을 최적화합니다"
      badge="유통 채널"
    >
      <ComingSoon icon={<Globe size={22} />} title="채널 관리" />
    </PageShell>
  )
}
