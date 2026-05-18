'use client'

import { BarChart2 } from 'lucide-react'
import PageShell, { ComingSoon } from '@/components/PageShell'

export default function AnalyticsPage() {
  return (
    <PageShell
      title="수익 분석"
      subtitle="채널·기간·객실 유형별 상세 수익 분석 리포트를 제공합니다"
      badge="수익 관리"
    >
      <ComingSoon icon={<BarChart2 size={22} />} title="수익 분석" />
    </PageShell>
  )
}
