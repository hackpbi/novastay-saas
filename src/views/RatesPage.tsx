'use client'

import { Tag } from 'lucide-react'
import PageShell, { ComingSoon } from '@/components/PageShell'

export default function RatesPage() {
  return (
    <PageShell
      title="요금 관리"
      subtitle="객실 유형별 요금 전략을 설정하고 자동 조정 규칙을 관리합니다"
      badge="요금 관리"
    >
      <ComingSoon icon={<Tag size={22} />} title="요금 관리" />
    </PageShell>
  )
}
