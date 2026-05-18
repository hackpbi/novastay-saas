'use client'

import { FileBarChart } from 'lucide-react'
import PageShell, { ComingSoon } from '@/components/PageShell'

export default function ReportsPage() {
  return (
    <PageShell
      title="보고서"
      subtitle="기간별 수익 보고서를 생성하고 PDF·Excel로 내보냅니다"
      badge="운영"
    >
      <ComingSoon icon={<FileBarChart size={22} />} title="보고서" />
    </PageShell>
  )
}
