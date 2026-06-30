'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Search, Star, FileBarChart,
  TrendingUp, ClipboardList, List, Target, Scale, Calendar,
  PieChart, Share2, Users, Tag, LineChart, BarChart2, DollarSign, FileText,
  type LucideIcon,
} from 'lucide-react'
import PageShell from '@/components/PageShell'
import {
  getReportCatalog,
  REPORT_CATEGORIES,
  CATEGORY_META,
  type ReportCatalogItem,
} from '@/lib/reports/reportCatalog'

const MINT = '#00E5A0'

// 카탈로그 icon 문자열 → lucide 컴포넌트
const ICON_MAP: Record<string, LucideIcon> = {
  'trending-up': TrendingUp,
  clipboard:     ClipboardList,
  list:          List,
  target:        Target,
  scale:         Scale,
  calendar:      Calendar,
  pie:           PieChart,
  share:         Share2,
  users:         Users,
  tag:           Tag,
  chart:         LineChart,
  bar:           BarChart2,
  dollar:        DollarSign,
  file:          FileText,
}

export default function ReportsPage() {
  const reports = useMemo(() => getReportCatalog(), [])
  const [query, setQuery]       = useState('')
  const [category, setCategory] = useState<'all' | ReportCatalogItem['category']>('all')
  const [favOnly, setFavOnly]   = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return reports.filter(r => {
      if (favOnly && !r.fav) return false
      if (category !== 'all' && r.category !== category) return false
      if (q && !(`${r.name} ${r.desc}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [reports, query, category, favOnly])

  return (
    <PageShell
      title="리포트"
      subtitle="RMS 리포트를 검색하고 즐겨찾기로 빠르게 찾아갑니다"
      badge="운영"
    >
      {/* ── 검색 + 즐겨찾기 토글 ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }}
          />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="리포트 이름, 설명으로 검색"
            style={{
              width: '100%', height: 40, padding: '0 12px 0 34px', fontSize: 13,
              borderRadius: 10, outline: 'none',
              background: 'var(--color-bg-surface)',
              border: `1px solid ${query ? 'rgba(0,229,160,0.4)' : 'var(--color-border-default)'}`,
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
        <button
          onClick={() => setFavOnly(v => !v)}
          title="즐겨찾기만 보기"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 14px',
            borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            border: `1px solid ${favOnly ? 'rgba(0,229,160,0.4)' : 'var(--color-border-default)'}`,
            background: favOnly ? 'rgba(0,229,160,0.1)' : 'var(--color-bg-surface)',
            color: favOnly ? MINT : 'var(--color-text-secondary)',
          }}
        >
          <Star size={15} fill={favOnly ? MINT : 'none'} />
          즐겨찾기
        </button>
      </div>

      {/* ── 카테고리 칩 ── */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {REPORT_CATEGORIES.map(c => {
          const active = category === c.key
          return (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                border: `1px solid ${active ? 'rgba(0,229,160,0.5)' : 'var(--color-border-default)'}`,
                background: active ? 'rgba(0,229,160,0.12)' : 'transparent',
                color: active ? MINT : 'var(--color-text-secondary)',
              }}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {/* ── 결과 카운트 ── */}
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        {filtered.length}개 리포트
      </div>

      {/* ── 카드 그리드 / 빈 상태 ── */}
      {filtered.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 10, minHeight: 280, borderRadius: 16,
          border: '1px dashed var(--color-border-default)', background: 'var(--color-bg-surface)',
        }}>
          <FileBarChart size={26} style={{ color: 'var(--color-text-tertiary)' }} />
          <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            조건에 맞는 리포트가 없습니다
          </span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map(r => (
            <ReportCard key={r.id} item={r} />
          ))}
        </div>
      )}
    </PageShell>
  )
}

function ReportCard({ item }: { item: ReportCatalogItem }) {
  const meta = CATEGORY_META[item.category]
  const Icon = ICON_MAP[item.icon] ?? FileBarChart

  return (
    <Link
      href={`/reports/${item.slug}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 12,
        background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)',
        textDecoration: 'none', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,229,160,0.45)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-default)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${meta.color}1f`, color: meta.color,
        }}>
          <Icon size={18} />
        </div>
        {item.fav && <Star size={15} fill="#FBBF24" color="#FBBF24" />}
      </div>

      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>
        {item.name}
      </div>

      <p style={{
        fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {item.desc}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
          color: meta.color, background: `${meta.color}1a`,
        }}>
          {meta.label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          업데이트 {item.updatedLabel}
        </span>
      </div>
    </Link>
  )
}
