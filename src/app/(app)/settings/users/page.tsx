'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Users, Building2, UserX, Plus, RefreshCw, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type {
  ProfileWithHotels, Hotel, SaasMenu, UserRole,
} from '@/types/supabase'
import type { MenuPermissionRow } from '@/components/settings/users/MenuPermissions'
import UserTable   from '@/components/settings/users/UserTable'
import UserAddModal from '@/components/settings/users/UserAddModal'
import UserSheet    from '@/components/settings/users/UserSheet'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Filters {
  search:   string
  role:     UserRole | ''
  isActive: '' | 'true' | 'false'
  hotelId:  string
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className="bg-ns-card border border-ns-border rounded-xl p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-[22px] font-semibold text-ns-text leading-none">{value}</p>
        <p className="text-[12px] text-ns-text-muted mt-1">{label}</p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [profiles,  setProfiles]  = useState<ProfileWithHotels[]>([])
  const [hotels,    setHotels]    = useState<Hotel[]>([])
  const [menus,     setMenus]     = useState<SaasMenu[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [showAdd,   setShowAdd]   = useState(false)
  const [selected,  setSelected]  = useState<ProfileWithHotels | null>(null)
  const [sheetPerms,       setSheetPerms]       = useState<MenuPermissionRow[]>([])
  const [sheetDefaultMenu, setSheetDefaultMenu] = useState('')
  const [filters, setFilters] = useState<Filters>({ search: '', role: '', isActive: '', hotelId: '' })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [profilesRes, hotelsRes, menusRes] = await Promise.all([
      (supabase as any)
        .from('m01_profiles')
        .select('id, auth_user_id, email, name, role, is_active, last_login_at, created_at, updated_at, m10_profile_hotels(hotel_id, role, is_active)')
        .order('created_at', { ascending: false }),
      (supabase as any)
        .from('m02_hotels')
        .select('id, hotel_name, slug, plan, is_active')
        .eq('is_active', true)
        .order('hotel_name'),
      (supabase as any)
        .from('m06_saas_menus')
        .select('id, key, name, icon, path, menu_type, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order'),
    ])

    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (hotelsRes.error)   { setError(hotelsRes.error.message);   setLoading(false); return }
    if (menusRes.error)    { setError(menusRes.error.message);    setLoading(false); return }

    setProfiles((profilesRes.data ?? []) as ProfileWithHotels[])
    setHotels(hotelsRes.data ?? [])
    setMenus(menusRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Filter profiles
  const filtered = useMemo(() => {
    return profiles.filter(p => {
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q)) return false
      }
      if (filters.role     && p.role       !== filters.role)                   return false
      if (filters.isActive && String(p.is_active) !== filters.isActive)        return false
      if (filters.hotelId  && !p.m10_profile_hotels?.some((ph: any) => ph.hotel_id === filters.hotelId)) return false
      return true
    })
  }, [profiles, filters])

  // Stats
  const stats = useMemo(() => ({
    total:    profiles.length,
    operator: profiles.filter(p => ['super_admin', 'admin'].includes(p.role)).length,
    hotel:    profiles.filter(p => ['manager', 'staff', 'read_only'].includes(p.role)).length,
    inactive: profiles.filter(p => !p.is_active).length,
  }), [profiles])

  // Load permissions for selected user
  const handleRowClick = async (p: ProfileWithHotels) => {
    setSelected(p)

    const [permsRes, defRes] = await Promise.all([
      (supabase as any)
        .from('m08_user_menu_permissions')
        .select('menu_id, permission')
        .eq('user_id', p.id),
      (supabase as any)
        .from('m09_user_default_page')
        .select('menu_id')
        .eq('user_id', p.id)
        .maybeSingle(),
    ])

    setSheetPerms(
      (permsRes.data ?? []).map((r: any) => ({
        menu_id:    r.menu_id,
        permission: r.permission as MenuPermissionRow['permission'],
      }))
    )
    setSheetDefaultMenu(defRes.data?.menu_id ?? '')
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-ns-text tracking-tight">유저 관리</h1>
          <p className="text-[13px] text-ns-text-muted mt-1">시스템 사용자 계정 및 권한을 관리합니다.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-1.5 bg-transparent border border-ns-border text-ns-text-muted hover:text-ns-text-secondary hover:border-[#2D3748] text-[13px] px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            새로고침
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-ns-accent hover:bg-ns-accent-hover text-black font-semibold text-[13px] px-5 py-2 rounded-lg transition-all hover:-translate-y-px shadow-[0_0_20px_rgba(0,212,138,0.2)]"
          >
            <Plus size={15} />
            유저 추가
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users size={18} className="text-ns-accent" />}
          label="전체 유저"
          value={stats.total}
          color="bg-ns-accent-surface border border-ns-accent-border"
        />
        <StatCard
          icon={<Shield size={18} className="text-ns-purple" />}
          label="운영자"
          value={stats.operator}
          color="bg-[#130E29] border border-[#1E1040]"
        />
        <StatCard
          icon={<Building2 size={18} className="text-ns-info" />}
          label="호텔 직원"
          value={stats.hotel}
          color="bg-[#0D1929] border border-[#0D2540]"
        />
        <StatCard
          icon={<UserX size={18} className="text-ns-text-muted" />}
          label="비활성"
          value={stats.inactive}
          color="bg-ns-sidebar border border-ns-border"
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-[#1F0A0A] border border-[#3D1010] text-[13px] text-ns-negative">
          데이터를 불러오는 중 오류가 발생했습니다: {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-ns-card border border-ns-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-[18px] border-b border-ns-border">
          <div className="w-8 h-8 rounded-lg bg-ns-accent-surface border border-ns-accent-border flex items-center justify-center">
            <Users size={15} className="text-ns-accent" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-ns-text">유저 목록</p>
            <p className="text-[12px] text-ns-text-muted">
              {loading ? '불러오는 중...' : `전체 ${profiles.length}명 / 검색결과 ${filtered.length}명`}
            </p>
          </div>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <RefreshCw size={18} className="animate-spin text-ns-text-muted" />
              <span className="text-[13px] text-ns-text-muted">불러오는 중...</span>
            </div>
          ) : (
            <UserTable
              profiles={filtered}
              hotels={hotels}
              filters={filters}
              onFilters={setFilters}
              onRowClick={handleRowClick}
            />
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <UserAddModal
          hotels={hotels}
          menus={menus}
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); fetchAll() }}
        />
      )}

      {/* Detail Sheet */}
      {selected && (
        <UserSheet
          profile={selected}
          hotels={hotels}
          menus={menus}
          permissions={sheetPerms}
          defaultMenuId={sheetDefaultMenu}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); fetchAll() }}
        />
      )}
    </div>
  )
}

