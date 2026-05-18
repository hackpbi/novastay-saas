'use client'

import {
  LayoutGrid,
  Tags,
  Users,
  Layers,
  CreditCard,
  Bell,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useEffect, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useHotel } from '@/contexts/HotelContext'
import { supabase } from '@/lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────────

type SetupStatus = 'complete' | 'in-progress' | 'not-started'

interface SetupItem {
  icon:        ReactNode
  title:       string
  description: string
  status:      SetupStatus
  href?:       string
}

// ─── Data ──────────────────────────────────────────────────────────────────────

const BASE_SETUP_ITEMS: SetupItem[] = [
  {
    icon:        <LayoutGrid size={22} />,
    title:       'Hotel & User Configuration',
    description: '호텔 기본 정보 및 유저를 설정합니다.',
    status:      'complete',
  },
  {
    icon:        <Tags size={22} />,
    title:       'Market_Code Table Setup',
    description: '마켓코드별 실적 테이블을 설정합니다.',
    status:      'in-progress',
    href:        '/settings/market-codes',
  },
  {
    icon:        <Layers size={22} />,
    title:       'Integrated Calendar',
    description: '동기대비 일자 조정을 합니다.',
    status:      'not-started',
    href:        '/settings/calendar',
  },
  {
    icon:        <CreditCard size={22} />,
    title:       'Billing & Plan',
    description: '구독, 청구서, 결제 수단을 관리합니다.',
    status:      'not-started',
  },
  {
    icon:        <Bell size={22} />,
    title:       'Notifications',
    description: '알림, 이메일 템플릿, SMS 설정을 구성합니다.',
    status:      'not-started',
  },
]

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SetupStatus, { label: string; color: string; dot: string }> = {
  'complete':    { label: 'Complete',    color: 'var(--color-positive)',      dot: 'var(--color-positive)'      },
  'in-progress': { label: 'In Progress', color: 'var(--color-warning)',       dot: 'var(--color-warning)'       },
  'not-started': { label: 'Not Started', color: 'var(--color-text-tertiary)', dot: 'var(--color-text-tertiary)' },
}

// ─── Loading Overlay ───────────────────────────────────────────────────────────

function NavigatingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'var(--color-bg-primary)' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-accent-primary)' }} />
        </div>
        <p className="text-sm text-brand-muted">페이지 이동 중...</p>
      </div>
    </div>
  )
}

// ─── Setup Card ────────────────────────────────────────────────────────────────

function SetupCard({ item, onNavigate }: { item: SetupItem; onNavigate: (href: string) => void }) {
  const { label, color, dot } = STATUS_CONFIG[item.status]
  const isActive = item.status === 'in-progress'

  return (
    <div
      className="flex flex-col rounded-2xl p-6 transition-all duration-200 cursor-pointer hover:-translate-y-0.5"
      style={{
        background: 'var(--color-bg-surface)',
        border:     isActive ? '1px solid var(--color-border-accent)' : '1px solid var(--color-border-default)',
        boxShadow:  isActive ? 'var(--shadow-accent-glow)'            : 'var(--shadow-card)',
      }}
    >
      <div className="flex items-start justify-between mb-5">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
          {item.icon}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
          <span className="text-xs font-medium" style={{ color }}>{label}</span>
        </div>
      </div>

      <h3 className="text-lg font-bold mb-2 tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
        {item.title}
      </h3>
      <p className="text-sm text-brand-muted leading-relaxed flex-1">{item.description}</p>

      <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
        <button
          onClick={() => item.href && onNavigate(item.href)}
          className="flex items-center gap-1.5 text-sm font-semibold transition-all duration-150 hover:gap-2.5 group"
          style={{ color: 'var(--color-accent-primary)' }}>
          더보기
          <ArrowRight size={14} className="transition-transform duration-150 group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Code Update Card (동적 상태) ───────────────────────────────────────────────

function CodeUpdateCard({ onNavigate }: { onNavigate: (href: string) => void }) {
  const { currentHotel } = useHotel()
  const [isConfigured, setIsConfigured] = useState(false)

  useEffect(() => {
    if (!currentHotel) return
    ;(supabase as any)
      .from('c01_room_types')
      .select('id', { count: 'exact', head: true })
      .eq('hotel_id', currentHotel.id)
      .then(({ count }: { count: number | null }) => setIsConfigured((count ?? 0) > 0))
  }, [currentHotel])

  const dotColor = isConfigured ? '#00D48A' : '#4A5568'
  const label    = isConfigured ? 'Configured' : 'Not Started'

  return (
    <div
      onClick={() => onNavigate('/settings/codes')}
      className="flex flex-col rounded-2xl p-6 transition-all duration-200 cursor-pointer hover:-translate-y-0.5"
      style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      onMouseEnter={e => (e.currentTarget.style.border = '1px solid var(--color-accent-primary)')}
      onMouseLeave={e => (e.currentTarget.style.border = '1px solid var(--color-border-default)')}
    >
      <div className="flex items-start justify-between mb-5">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
          <Users size={22} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
          <span className="text-xs font-medium" style={{ color: dotColor }}>{label}</span>
        </div>
      </div>

      <h3 className="text-lg font-bold mb-2 tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
        Code Update
      </h3>
      <p className="text-sm text-brand-muted leading-relaxed flex-1">호텔 코드 수정 및 설정 합니다.</p>

      <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
        <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--color-accent-primary)' }}>
          더보기
          <ArrowRight size={14} />
        </span>
      </div>
    </div>
  )
}

// ─── Settings Page ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router         = useRouter()
  const { profile }    = useAuth()
  const { currentHotel } = useHotel()
  const [navigating, setNavigating] = useState(false)

  const isSuperAdmin = profile?.role === 'super_admin' || profile?.role === 'admin'
  const hotelHref    = isSuperAdmin ? '/hotels' : `/hotels/${currentHotel?.id ?? ''}`

  const SETUP_ITEMS: SetupItem[] = BASE_SETUP_ITEMS.map(item =>
    item.title === 'Hotel & User Configuration' ? { ...item, href: hotelHref } : item
  )

  const handleNavigate = (href: string) => {
    setNavigating(true)
    router.push(href)
  }

  const completedCount  = SETUP_ITEMS.filter(i => i.status === 'complete').length
  const totalCount      = SETUP_ITEMS.length + 1
  const progressPercent = Math.round((completedCount / totalCount) * 100)

  return (
    <>
      {navigating && <NavigatingOverlay />}

      <div className="space-y-8 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              Setup
            </h1>
            <p className="text-sm text-brand-muted mt-1">Configure your NovaStay workspace</p>
          </div>

          <div className="flex items-center gap-4 rounded-xl px-5 py-3"
            style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
            <div className="text-right">
              <p className="text-xs text-brand-muted">전체 진행률</p>
              <p className="text-lg font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>
                {completedCount} / {totalCount}
              </p>
            </div>
            <div className="w-24">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-brand-muted">{progressPercent}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-elevated)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${progressPercent}%`, background: 'var(--gradient-cta)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Setup grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {SETUP_ITEMS.slice(0, 2).map(item => (
            <SetupCard key={item.title} item={item} onNavigate={handleNavigate} />
          ))}
          <CodeUpdateCard onNavigate={handleNavigate} />
          {SETUP_ITEMS.slice(2).map(item => (
            <SetupCard key={item.title} item={item} onNavigate={handleNavigate} />
          ))}
        </div>
      </div>
    </>
  )
}
