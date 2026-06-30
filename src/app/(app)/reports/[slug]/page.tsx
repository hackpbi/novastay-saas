'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { FileBarChart, ChevronLeft } from 'lucide-react'
import PageShell, { ComingSoon } from '@/components/PageShell'
import { getReportCatalog } from '@/lib/reports/reportCatalog'

export default function ReportDetailPage() {
  const params = useParams()
  const slug = String(params?.slug ?? '')
  const report = getReportCatalog().find(r => r.slug === slug)

  return (
    <PageShell
      title={report?.name ?? '리포트'}
      subtitle={report?.desc ?? '요청한 리포트를 찾을 수 없습니다'}
      badge="준비 중"
      actions={
        <Link
          href="/reports"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13,
            padding: '6px 12px', borderRadius: 8, textDecoration: 'none',
            border: '1px solid var(--color-border-default)', background: 'var(--color-bg-surface)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <ChevronLeft size={15} /> 목록
        </Link>
      }
    >
      <ComingSoon icon={<FileBarChart size={22} />} title="상세 리포트 준비 중" />
    </PageShell>
  )
}
