'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import {
  Building2, Plus, RefreshCw, Search, ChevronRight,
  CheckCircle, Clock, AlertCircle, XCircle,
  Star, BedDouble, Trash2, Loader2, LayoutGrid, X, Save,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled'
type PlanType           = 'standard' | 'enterprise'

type Hotel = {
  id:                  string
  hotel_name:          string
  slug:                string
  plan:                PlanType
  is_active:           boolean
  subscription_status: SubscriptionStatus
  trial_ends_at:       string | null
  created_at:          string
  m03_hotel_details:   {
    city:        string | null
    country:     string | null
    star_rating: number | null
    room_count:  number | null
    logo_url:    string | null
  } | null
}

// ── Badge configs ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SubscriptionStatus, {
  label: string
  icon:  React.ReactNode
  cls:   string
}> = {
  active:   { label: '운영 중',  icon: <CheckCircle  size={11} />, cls: 'bg-[rgba(0,229,160,0.10)] text-accent-primary border border-[rgba(0,229,160,0.20)]' },
  trial:    { label: '트라이얼', icon: <Clock        size={11} />, cls: 'bg-[rgba(245,166,35,0.10)] text-status-warning  border border-[rgba(245,166,35,0.20)]' },
  past_due: { label: '연체',    icon: <AlertCircle  size={11} />, cls: 'bg-[rgba(255,100,0,0.10)]  text-[#FF6400]       border border-[rgba(255,100,0,0.20)]'  },
  canceled: { label: '해지',    icon: <XCircle      size={11} />, cls: 'bg-[rgba(255,77,77,0.10)]  text-status-negative border border-[rgba(255,77,77,0.20)]'  },
}

const PLAN_CONFIG: Record<PlanType, { label: string; cls: string }> = {
  standard:   { label: 'Standard',   cls: 'bg-[rgba(74,158,255,0.10)] text-status-info   border border-[rgba(74,158,255,0.20)]' },
  enterprise: { label: 'Enterprise', cls: 'bg-[rgba(159,122,234,0.10)] text-ns-purple    border border-[rgba(159,122,234,0.20)]' },
}

// ── Types (메뉴) ──────────────────────────────────────────────────────────────

interface SaasMenu {
  id:         string
  key:        string
  name:       string
  icon:       string | null
  sort_order: number | null
  menu_type:  'main' | 'sub' | 'setting'
  parent_id:  string | null
}

interface HotelMenuPermission {
  menu_id:    string
  is_enabled: boolean
}

// 부모 → 자식 순서로 재정렬 (sort_order flat 정렬 시 서브메뉴 위치 오류 방지)
function buildOrderedMenus(menus: SaasMenu[]): SaasMenu[] {
  const parents  = menus
    .filter(m => !m.parent_id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const result: SaasMenu[] = []
  parents.forEach(parent => {
    result.push(parent)
    menus
      .filter(m => m.parent_id === parent.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .forEach(child => result.push(child))
  })
  return result
}

// ── 메뉴 슬라이드오버 ──────────────────────────────────────────────────────────

function MenuSheet({ hotel, onClose }: { hotel: Hotel; onClose: () => void }) {
  const [menus,   setMenus]   = useState<SaasMenu[]>([])
  const [perms,   setPerms]   = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [menusRes, permsRes] = await Promise.all([
        (supabase as any)
          .from('m06_saas_menus')
          .select('id, key, name, icon, sort_order, menu_type, parent_id')
          .eq('is_active', true)
          .order('sort_order'),
        (supabase as any)
          .from('m07_hotel_menu_permissions')
          .select('menu_id, is_enabled')
          .eq('hotel_id', hotel.id),
      ])
      setMenus(buildOrderedMenus(menusRes.data ?? []))

      const map: Record<string, boolean> = {}
      ;(permsRes.data ?? []).forEach((p: HotelMenuPermission) => {
        map[p.menu_id] = p.is_enabled
      })
      // 권한 없는 메뉴는 기본 ON
      ;(menusRes.data ?? []).forEach((m: SaasMenu) => {
        if (!(m.id in map)) map[m.id] = true
      })
      setPerms(map)
      setLoading(false)
    }
    load()
  }, [hotel.id])

  const toggle = (menuId: string) =>
    setPerms(prev => ({ ...prev, [menuId]: !prev[menuId] }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const rows = menus.map(m => ({
      hotel_id:   hotel.id,
      menu_id:    m.id,
      is_enabled: perms[m.id] ?? true,
    }))
    const { error } = await (supabase as any)
      .from('m07_hotel_menu_permissions')
      .upsert(rows, { onConflict: 'hotel_id,menu_id' })
    setSaving(false)
    if (error) { setError(error.message); return }
    setSuccess(true)
    setTimeout(() => { setSuccess(false); onClose() }, 1200)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[400px] z-50 flex flex-col bg-bg-secondary"
        style={{ border: '1px solid var(--color-border-default)', borderRight: 'none', boxShadow: '-8px 0 32px rgba(0,0,0,0.4)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-accent-primary"
              style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
              <LayoutGrid size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                메뉴 설정
              </p>
              <p className="text-xs text-brand-muted mt-0.5">{hotel.hotel_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-brand-muted">
              <RefreshCw size={15} className="animate-spin" />
              <span className="text-sm">불러오는 중...</span>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-brand-muted mb-4">
                이 호텔에서 사용할 메뉴를 ON/OFF로 설정합니다.
              </p>
              {menus.map((menu, idx) => {
                const isMain = menu.menu_type === 'main' || !menu.parent_id
                const isSub  = menu.menu_type === 'sub'  ||  !!menu.parent_id
                // main 메뉴 위에 구분선 (첫 번째 제외)
                const prevMenu = menus[idx - 1]
                const showDivider = isMain && idx > 0 && (prevMenu?.menu_type === 'sub' || !!prevMenu?.parent_id)

                return (
                  <div key={menu.id}>
                    {showDivider && (
                      <div className="my-2" style={{ borderTop: '1px solid var(--color-border-subtle)' }} />
                    )}
                    <div
                      className="flex items-center justify-between rounded-lg hover:bg-bg-tertiary transition-colors"
                      style={{ paddingLeft: isSub ? 28 : 12, paddingRight: 12, paddingTop: 10, paddingBottom: 10 }}>
                      <div className="flex items-center gap-2 min-w-0">
                        {isSub && (
                          <span className="w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-border-default)' }} />
                        )}
                        <span
                          className={isSub ? 'text-xs' : 'text-sm font-medium'}
                          style={{ color: isSub ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>
                          {menu.name}
                        </span>
                        {isMain && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border-subtle)' }}>
                            main
                          </span>
                        )}
                      </div>
                      <div
                        onClick={() => toggle(menu.id)}
                        className="relative rounded-full overflow-hidden transition-colors cursor-pointer shrink-0"
                        style={{
                          width:      40,
                          height:     20,
                          background: perms[menu.id]
                            ? 'var(--color-accent-primary)'
                            : 'var(--color-border-default)',
                        }}
                      >
                        <span
                          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                          style={{ transform: perms[menu.id] ? 'translateX(22px)' : 'translateX(2px)' }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {error && (
            <div className="mt-4 px-3 py-2 rounded-lg text-xs text-status-negative"
              style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 px-3 py-2 rounded-lg text-xs text-accent-primary"
              style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
              저장됐습니다.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 flex justify-end"
          style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 transition-all"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            저장
          </button>
        </div>
      </div>
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function HotelAvatar({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  if (logoUrl) {
    return <img src={logoUrl} alt={name} className="w-9 h-9 rounded-lg object-cover" />
  }
  return (
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-accent-primary font-bold text-sm"
      style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}
    >
      {name.charAt(0)}
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-bg-secondary px-5 py-4 flex items-center gap-4"
      style={{ border: '1px solid var(--color-border-default)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
        <p className="text-xs text-brand-muted mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HotelsPage() {
  const router  = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const [hotels,       setHotels]       = useState<Hotel[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [search,       setSearch]       = useState('')
  const [statusF,      setStatusF]      = useState<SubscriptionStatus | ''>('')
  const [planF,        setPlanF]        = useState<PlanType | ''>('')
  const [deleteTarget, setDeleteTarget] = useState<Hotel | null>(null)
  const [deleting,     setDeleting]     = useState(false)
  const [deleteError,  setDeleteError]  = useState<string | null>(null)
  const [menuTarget,   setMenuTarget]   = useState<Hotel | null>(null)

  const fetchHotels = async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await (supabase as any)
      .from('m02_hotels')
      .select(`
        id, hotel_name, slug, plan, is_active,
        subscription_status, trial_ends_at, created_at,
        m03_hotel_details ( city, country, star_rating, room_count, logo_url )
      `)
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setHotels(data ?? [])
    setLoading(false)
  }

  // super_admin 전용 — 다른 역할은 대시보드로
  useEffect(() => {
    if (authLoading) return
    if (profile && profile.role !== 'super_admin') {
      router.replace('/dashboard')
    }
  }, [profile, authLoading, router])

  useEffect(() => { fetchHotels() }, [])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    const { error } = await (supabase as any)
      .from('m02_hotels')
      .delete()
      .eq('id', deleteTarget.id)
    if (error) { setDeleteError(error.message); setDeleting(false); return }
    setDeleteTarget(null)
    fetchHotels()
  }

  const filtered = useMemo(() => hotels.filter(h => {
    const q = search.toLowerCase()
    if (q && !h.hotel_name.toLowerCase().includes(q) &&
             !h.slug.toLowerCase().includes(q) &&
             !(h.m03_hotel_details?.city ?? '').toLowerCase().includes(q)) return false
    if (statusF && h.subscription_status !== statusF) return false
    if (planF   && h.plan !== planF) return false
    return true
  }), [hotels, search, statusF, planF])

  const stats = {
    total:    hotels.length,
    active:   hotels.filter(h => h.subscription_status === 'active').length,
    trial:    hotels.filter(h => h.subscription_status === 'trial').length,
    inactive: hotels.filter(h => !h.is_active).length,
  }

  const inputStyle = {
    color:  'var(--color-text-primary)',
    border: '1px solid var(--color-border-default)',
  }
  const inputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.border    = '1px solid var(--color-accent-primary)'
    e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
  }
  const inputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.border    = '1px solid var(--color-border-default)'
    e.currentTarget.style.boxShadow = 'none'
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            호텔 관리
          </h1>
          <p className="text-sm text-brand-muted mt-1">NovaStay에 등록된 호텔을 관리합니다.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchHotels}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-brand-muted transition-all hover:text-brand-text"
            style={{ border: '1px solid var(--color-border-default)' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            새로고침
          </button>
          <button
            onClick={() => router.push('/settings/menus')}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-brand-muted transition-all hover:text-brand-text"
            style={{ border: '1px solid var(--color-border-default)' }}
          >
            <LayoutGrid size={14} />
            메뉴 설정
          </button>
          <button
            onClick={() => router.push('/hotels/new')}
            className="flex items-center gap-1.5 rounded-full py-2 px-4 text-sm font-semibold hover:-translate-y-0.5 transition-all"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}
          >
            <Plus size={15} />
            호텔 등록
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Building2 size={18} className="text-accent-primary" />} label="전체 호텔"  value={stats.total}    />
        <StatCard icon={<CheckCircle size={18} className="text-accent-primary" />} label="운영 중"   value={stats.active}   />
        <StatCard icon={<Clock size={18} className="text-status-warning" />}      label="트라이얼"  value={stats.trial}    />
        <StatCard icon={<XCircle size={18} className="text-status-negative" />}   label="비활성"    value={stats.inactive} />
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
          <input
            type="text"
            placeholder="호텔명, 슬러그, 도시 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-md bg-bg-tertiary text-sm pl-9 pr-3.5 py-2.5 focus:outline-none transition-all"
            style={inputStyle}
            onFocus={inputFocus}
            onBlur={inputBlur}
          />
        </div>
        <select
          value={statusF}
          onChange={e => setStatusF(e.target.value as SubscriptionStatus | '')}
          className="rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 focus:outline-none transition-all"
          style={inputStyle}
          onFocus={inputFocus}
          onBlur={inputBlur}
        >
          <option value="">모든 상태</option>
          <option value="active">운영 중</option>
          <option value="trial">트라이얼</option>
          <option value="past_due">연체</option>
          <option value="canceled">해지</option>
        </select>
        <select
          value={planF}
          onChange={e => setPlanF(e.target.value as PlanType | '')}
          className="rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 focus:outline-none transition-all"
          style={inputStyle}
          onFocus={inputFocus}
          onBlur={inputBlur}
        >
          <option value="">모든 플랜</option>
          <option value="standard">Standard</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <span className="text-xs text-brand-muted ml-auto shrink-0">
          {filtered.length} / {hotels.length}건
        </span>
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border-default)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-secondary)' }}>
              {['호텔', '플랜', '상태', '객실 수', '등록일', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-brand-muted uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-brand-muted">
                    <RefreshCw size={16} className="animate-spin" />
                    <span className="text-sm">불러오는 중...</span>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <p className="text-sm text-status-negative">{error}</p>
                  <button onClick={fetchHotels} className="mt-2 text-xs text-brand-muted underline">
                    다시 시도
                  </button>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <Building2 size={32} className="mx-auto text-brand-dimmed opacity-40 mb-3" />
                  <p className="text-sm text-brand-muted">등록된 호텔이 없습니다.</p>
                </td>
              </tr>
            ) : (
              filtered.map(hotel => {
                const detail = hotel.m03_hotel_details
                const status = STATUS_CONFIG[hotel.subscription_status]
                const plan   = PLAN_CONFIG[hotel.plan]
                return (
                  <tr
                    key={hotel.id}
                    onClick={() => router.push(`/hotels/${hotel.id}`)}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg-surface)')}
                  >
                    {/* 호텔 */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <HotelAvatar name={hotel.hotel_name} logoUrl={detail?.logo_url} />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                            {hotel.hotel_name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-brand-muted font-mono">{hotel.slug}</span>
                            {detail?.city && (
                              <span className="text-[11px] text-brand-dimmed">· {detail.city}</span>
                            )}
                            {detail?.star_rating && (
                              <span className="flex items-center gap-0.5 text-[11px] text-status-warning">
                                <Star size={10} className="fill-current" />
                                {detail.star_rating}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* 플랜 */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${plan.cls}`}>
                        {plan.label}
                      </span>
                    </td>
                    {/* 상태 */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${status.cls}`}>
                        {status.icon}
                        {status.label}
                      </span>
                    </td>
                    {/* 객실 수 */}
                    <td className="px-4 py-3.5">
                      {detail?.room_count ? (
                        <span className="flex items-center gap-1 text-sm text-brand-muted">
                          <BedDouble size={13} />
                          {detail.room_count}실
                        </span>
                      ) : (
                        <span className="text-sm text-brand-dimmed">-</span>
                      )}
                    </td>
                    {/* 등록일 */}
                    <td className="px-4 py-3.5 text-sm text-brand-muted">
                      {formatDate(hotel.created_at)}
                    </td>
                    {/* 액션 */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); setMenuTarget(hotel) }}
                          className="p-1.5 rounded-lg text-brand-dimmed hover:text-accent-primary transition-colors"
                          style={{ border: '1px solid transparent' }}
                          onMouseEnter={e => { e.currentTarget.style.border = '1px solid var(--accent-badge-border)'; e.currentTarget.style.background = 'var(--accent-badge-bg)' }}
                          onMouseLeave={e => { e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.background = 'transparent' }}
                        >
                          <LayoutGrid size={14} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteTarget(hotel); setDeleteError(null) }}
                          className="p-1.5 rounded-lg text-brand-dimmed hover:text-status-negative transition-colors"
                          style={{ border: '1px solid transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.border = '1px solid var(--negative-border)', e.currentTarget.style.background = 'var(--negative-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.border = '1px solid transparent', e.currentTarget.style.background = 'transparent')}
                        >
                          <Trash2 size={14} />
                        </button>
                        <ChevronRight size={16} className="text-brand-dimmed" />
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── 메뉴 설정 슬라이드오버 ── */}
      {menuTarget && (
        <MenuSheet hotel={menuTarget} onClose={() => setMenuTarget(null)} />
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setDeleteTarget(null); setDeleteError(null) }} />
          <div className="relative w-full max-w-sm rounded-2xl bg-bg-secondary overflow-hidden"
            style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
            <div className="px-6 pt-6 pb-5 text-center">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
                <Trash2 size={20} className="text-status-negative" />
              </div>
              <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                호텔을 삭제할까요?
              </h3>
              <p className="text-sm text-brand-muted">
                <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {deleteTarget.hotel_name}
                </span>
                {' '}및 관련 데이터가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
              {deleteError && <p className="mt-3 text-xs text-status-negative">{deleteError}</p>}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(null) }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-brand-muted hover:text-brand-text transition-colors"
                style={{ border: '1px solid var(--color-border-default)' }}
              >취소</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold text-status-negative disabled:opacity-60"
                style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
