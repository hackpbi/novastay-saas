'use client'

import { Telescope } from 'lucide-react'
import PageShell, { ComingSoon } from '@/components/PageShell'

export default function CompetitorsPage() {
  return (
    <PageShell
      title="경쟁사 분석"
      subtitle="인근 경쟁 숙박 시설의 요금 동향과 점유율을 실시간으로 모니터링합니다"
      badge="유통 채널"
    >
      <ComingSoon icon={<Telescope size={22} />} title="경쟁사 분석" />
    </PageShell>
  )
}
