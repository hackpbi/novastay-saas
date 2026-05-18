'use client'

import { TrendingUp } from 'lucide-react'
import PageShell, { ComingSoon } from '@/components/PageShell'

export default function ForecastPage() {
  return (
    <PageShell
      title="수요 예측"
      subtitle="AI 기반 점유율 및 RevPAR 예측 데이터를 확인합니다"
      badge="수익 관리"
    >
      <ComingSoon icon={<TrendingUp size={22} />} title="수요 예측" />
    </PageShell>
  )
}
