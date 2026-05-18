'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  UserPlus, UserCheck, X, Save, Loader2, RefreshCw,
  Shield, Users, Mail, Trash2, Search, Building2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type Role       = 'manager' | 'staff' | 'read_only'
type Permission = 'none' | 'read' | 'write' | 'full'

interface UserRow {
  profile_hotel_id: string
  profile_id:       string
  email:            string
  name:             string
  hotel_role:       Role
  hotel_active:     boolean
  last_login_at:    string | null
  created_at:       string
}

interface Menu {
  id:   string
  key:  string
  name: string
  icon: string | null
}

interface PermRow { menu_id: string; permission: Permission }

interface FoundProfile {
  id:    string
  email: string
  name:  string
  affiliated_hotels: { hotel_id: string; hotel_name: string }[]
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const inputCls   = 'w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 focus:outline-none transition-all'
const inputStyle = { color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }
const onFocus    = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.border    = '1px solid var(--color-accent-primary)'
  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
}
const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.border    = '1px solid var(--color-border-default)'
  e.currentTarget.style.boxShadow = 'none'
}

// ── 역할 배지 ─────────────────────────────────────────────────────────────────

const ROLE_CLS: Record<Role, string> = {
  manager:   'bg-[#0D1929] text-[#0E9FE5] border border-[#0D2540]',
  staff:     'bg-[#111827] text-[#A0AEC0] border border-[#1E2535]',
  read_only: 'bg-[#111827] text-[#4A5568] border border-[#1E2535]',
}
const ROLE_LABEL: Record<Role, string> = { manager: 'Manager', staff: 'Staff', read_only: 'Read Only' }

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${ROLE_CLS[role]}`}>
      {ROLE_LABEL[role]}
    </span>
  )
}

// ── Permission ────────────────────────────────────────────────────────────────

const PERM_LEVELS: Permission[] = ['none', 'read', 'write', 'full']
const PERM_COLOR: Record<Permission, string> = {
  none:  'text-[#4A5568]',
  read:  'text-[#0E9FE5]',
  write: 'text-[#F6AD55]',
  full:  'text-[#00D48A]',
}
const PERM_DOT: Record<Permission, string> = {
  none:  'bg-[#4A5568]',
  read:  'bg-[#0E9FE5]',
  write: 'bg-[#F6AD55]',
  full:  'bg-[#00D48A]',
}

// ── 공통: 메뉴 권한 기본값 설정 ──────────────────────────────────────────────

async function initMenuPermissions(profileId: string, hotelId: string) {
  const { data: menus } = await (supabase as any)
    .from('m06_saas_menus').select('id').eq('is_active', true)
  if (!menus || menus.length === 0) return
  await (supabase as any)
    .from('m08_user_menu_permissions')
    .insert(menus.map((m: any) => ({
      user_id: profileId, hotel_id: hotelId, menu_id: m.id, permission: 'none',
    })))
}

// ── 새 유저 초대 모달 ─────────────────────────────────────────────────────────

function InviteModal({ hotelId, onClose, onSuccess }: {
  hotelId: string; onClose: () => void; onSuccess: () => void
}) {
  const [name,   setName]   = useState('')
  const [email,  setEmail]  = useState('')
  const [role,   setRole]   = useState<Role>('staff')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const handleInvite = async () => {
    if (!name.trim() || !email.trim()) { setError('이름과 이메일을 입력해주세요.'); return }
    setSaving(true); setError(null)
    try {
      // Step 1: Auth 초대
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '초대 실패')
      const authUserId: string = json.user_id

      // Step 2: 트리거 대기 후 profile 조회
      await new Promise(r => setTimeout(r, 1500))
      let profileId: string
      const { data: prof } = await (supabase as any)
        .from('m01_profiles').select('id').eq('auth_user_id', authUserId).single()
      if (!prof) {
        // 트리거 미실행 시 upsert로 보완
        const { data: upserted } = await (supabase as any)
          .from('m01_profiles')
          .upsert({ auth_user_id: authUserId, email: email.trim(), name: name.trim(), role: 'staff', is_active: true }, { onConflict: 'auth_user_id' })
          .select('id').single()
        if (!upserted) throw new Error('프로필 생성 실패')
        profileId = upserted.id
      } else {
        profileId = prof.id
      }

      // Step 3: m10_profile_hotels INSERT
      const { error: phErr } = await (supabase as any)
        .from('m10_profile_hotels')
        .insert({ profile_id: profileId, hotel_id: hotelId, role, is_active: true })
      if (phErr) throw new Error(phErr.message)

      // Step 4: 메뉴 권한 기본값
      await initMenuPermissions(profileId, hotelId)

      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-bg-secondary overflow-hidden"
        style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>

        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-accent-primary"
              style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
              <UserPlus size={15} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>새 유저 초대</p>
              <p className="text-xs text-brand-muted">초대 메일이 발송됩니다</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg text-sm text-status-negative"
              style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1.5">이름 *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="홍길동" className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1.5">이메일 *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com" className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1.5">이 호텔에서의 역할</label>
            <select value={role} onChange={e => setRole(e.target.value as Role)}
              className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="read_only">Read Only</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-brand-muted hover:text-brand-text transition-colors"
            style={{ border: '1px solid var(--color-border-default)' }}>
            취소
          </button>
          <button onClick={handleInvite} disabled={saving}
            className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 transition-all"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            초대 발송
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 기존 유저 추가 모달 ───────────────────────────────────────────────────────

function AddExistingModal({ hotelId, onClose, onSuccess }: {
  hotelId: string; onClose: () => void; onSuccess: () => void
}) {
  const [searchEmail,      setSearchEmail]      = useState('')
  const [searchResults,    setSearchResults]    = useState<FoundProfile[]>([])
  const [selectedProfile,  setSelectedProfile]  = useState<FoundProfile | null>(null)
  const [role,             setRole]             = useState<Role>('staff')
  const [searching,        setSearching]        = useState(false)
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState<string | null>(null)

  const handleSearch = async () => {
    if (!searchEmail.trim()) return
    setSearching(true); setError(null); setSelectedProfile(null)
    const { data } = await (supabase as any)
      .from('m01_profiles')
      .select(`
        id, email, name,
        m10_profile_hotels (
          hotel_id,
          m02_hotels (hotel_name)
        )
      `)
      .ilike('email', `%${searchEmail.trim()}%`)
      .limit(5)

    const results: FoundProfile[] = (data ?? []).map((p: any) => ({
      id:    p.id,
      email: p.email,
      name:  p.name,
      affiliated_hotels: (p.m10_profile_hotels ?? []).map((ph: any) => ({
        hotel_id:   ph.hotel_id,
        hotel_name: ph.m02_hotels?.hotel_name ?? '',
      })),
    }))
    setSearchResults(results)
    setSearching(false)
  }

  const handleAdd = async () => {
    if (!selectedProfile) return
    const alreadyInHotel = selectedProfile.affiliated_hotels.some(h => h.hotel_id === hotelId)
    if (alreadyInHotel) { setError('이미 이 호텔에 소속된 유저입니다.'); return }

    setSaving(true); setError(null)
    try {
      const { error: phErr } = await (supabase as any)
        .from('m10_profile_hotels')
        .insert({ profile_id: selectedProfile.id, hotel_id: hotelId, role, is_active: true })
      if (phErr) throw new Error(phErr.message)

      await initMenuPermissions(selectedProfile.id, hotelId)
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-bg-secondary overflow-hidden"
        style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>

        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-accent-primary"
              style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
              <UserCheck size={15} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>기존 유저 추가</p>
              <p className="text-xs text-brand-muted">이미 가입된 유저를 이 호텔에 연결합니다</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg text-sm text-status-negative"
              style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
              {error}
            </div>
          )}

          {/* 이메일 검색 */}
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1.5">이메일 검색</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
                <input
                  type="email"
                  value={searchEmail}
                  onChange={e => setSearchEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="user@example.com"
                  className={`${inputCls} pl-9`}
                  style={inputStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </div>
              <button onClick={handleSearch} disabled={searching || !searchEmail.trim()}
                className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                검색
              </button>
            </div>
          </div>

          {/* 검색 결과 */}
          {searchResults.length > 0 && (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border-default)' }}>
              {searchResults.map(p => {
                const alreadyIn = p.affiliated_hotels.some(h => h.hotel_id === hotelId)
                const isSelected = selectedProfile?.id === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => !alreadyIn && setSelectedProfile(p)}
                    disabled={alreadyIn}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left transition-all"
                    style={{
                      background:  isSelected ? 'var(--accent-badge-bg)' : 'transparent',
                      borderBottom:'1px solid var(--color-border-subtle)',
                      cursor:      alreadyIn ? 'not-allowed' : 'pointer',
                      opacity:     alreadyIn ? 0.5 : 1,
                    }}
                    onMouseEnter={e => { if (!alreadyIn && !isSelected) e.currentTarget.style.background = 'var(--overlay-hover)' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold text-accent-primary"
                      style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{p.name}</p>
                        {alreadyIn && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--negative-bg)', color: 'var(--color-negative)' }}>
                            이미 등록됨
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-brand-muted">{p.email}</p>
                      {p.affiliated_hotels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.affiliated_hotels.map(h => (
                            <span key={h.hotel_id} className="text-[10px] px-1.5 py-0.5 rounded text-brand-dimmed"
                              style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-subtle)' }}>
                              {h.hotel_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-accent-primary flex items-center justify-center shrink-0 mt-1">
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3L3 5L7 1" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {searchResults.length === 0 && searchEmail && !searching && (
            <p className="text-sm text-brand-muted text-center py-2">검색 결과가 없습니다.</p>
          )}

          {/* 역할 선택 */}
          {selectedProfile && (
            <div>
              <label className="block text-xs font-medium text-brand-muted mb-1.5">이 호텔에서의 역할</label>
              <select value={role} onChange={e => setRole(e.target.value as Role)}
                className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                <option value="manager">Manager</option>
                <option value="staff">Staff</option>
                <option value="read_only">Read Only</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-brand-muted hover:text-brand-text transition-colors"
            style={{ border: '1px solid var(--color-border-default)' }}>
            취소
          </button>
          <button onClick={handleAdd} disabled={!selectedProfile || saving}
            className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 transition-all"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
            이 호텔에 추가
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 슬라이드오버 ──────────────────────────────────────────────────────────────

function UserSheet({ user, hotelId, hotelName, onClose, onSaved }: {
  user: UserRow; hotelId: string; hotelName: string; onClose: () => void; onSaved: () => void
}) {
  const [sheetTab,    setSheetTab]    = useState<'profile' | 'permissions'>('profile')
  const [name,        setName]        = useState(user.name)
  const [role,        setRole]        = useState<Role>(user.hotel_role)
  const [isActive,    setIsActive]    = useState(user.hotel_active)
  const [menus,       setMenus]       = useState<Menu[]>([])
  const [perms,       setPerms]       = useState<PermRow[]>([])
  const [defaultMenu, setDefaultMenu] = useState('')
  const [allHotels,   setAllHotels]   = useState<{ hotel_id: string; hotel_name: string; role: string }[]>([])
  const [savingP,     setSavingP]     = useState(false)
  const [savingM,     setSavingM]     = useState(false)
  const [errorP,      setErrorP]      = useState<string | null>(null)
  const [errorM,      setErrorM]      = useState<string | null>(null)
  const [savedM,      setSavedM]      = useState(false)
  const [loadingPerms,setLoadingPerms]= useState(false)
  const [sendingPw,   setSendingPw]   = useState(false)
  const [pwSent,      setPwSent]      = useState(false)

  // 소속 호텔 목록 + 메뉴 권한 로드
  const loadData = useCallback(async () => {
    setLoadingPerms(true)

    const [hotelsRes, hotelMenusRes, permsRes, defRes] = await Promise.all([
      (supabase as any)
        .from('m10_profile_hotels')
        .select('hotel_id, role, m02_hotels(hotel_name)')
        .eq('profile_id', user.profile_id),
      (supabase as any)
        .from('m07_hotel_menu_permissions')
        .select('menu_id, is_enabled, m06_saas_menus(id, key, name, icon, sort_order)')
        .eq('hotel_id', hotelId)
        .eq('is_enabled', true),
      (supabase as any)
        .from('m08_user_menu_permissions')
        .select('menu_id, permission')
        .eq('user_id', user.profile_id)
        .eq('hotel_id', hotelId),
      (supabase as any)
        .from('m09_user_default_page')
        .select('menu_id')
        .eq('user_id', user.profile_id)
        .maybeSingle(),
    ])

    setAllHotels((hotelsRes.data ?? []).map((h: any) => ({
      hotel_id:   h.hotel_id,
      hotel_name: h.m02_hotels?.hotel_name ?? '',
      role:       h.role,
    })))

    // m07에서 is_enabled=true인 메뉴만 추출, sort_order 기준 정렬
    const enabledMenus: Menu[] = (hotelMenusRes.data ?? [])
      .filter((r: any) => r.m06_saas_menus)
      .map((r: any) => r.m06_saas_menus as Menu)
      .sort((a: Menu, b: Menu) => (a as any).sort_order - (b as any).sort_order)
    setMenus(enabledMenus)
    setPerms(permsRes.data ?? [])
    setDefaultMenu(defRes.data?.menu_id ?? '')
    setLoadingPerms(false)
  }, [user.profile_id, hotelId])

  useEffect(() => { loadData() }, [loadData])

  const getPerm = (menuId: string): Permission =>
    perms.find(p => p.menu_id === menuId)?.permission ?? 'none'

  const setPerm = (menuId: string, permission: Permission) => {
    setPerms(prev => {
      const exists = prev.find(p => p.menu_id === menuId)
      if (exists) return prev.map(p => p.menu_id === menuId ? { ...p, permission } : p)
      return [...prev, { menu_id: menuId, permission }]
    })
    if (permission === 'none' && defaultMenu === menuId) setDefaultMenu('')
  }

  const saveProfile = async () => {
    setSavingP(true); setErrorP(null)

    // m01_profiles: name만 수정 (role 수정 금지)
    await (supabase as any).from('m01_profiles').update({ name }).eq('id', user.profile_id)

    // m10_profile_hotels: role, is_active 수정
    const { error } = await (supabase as any)
      .from('m10_profile_hotels')
      .update({ role, is_active: isActive, updated_at: new Date().toISOString() })
      .eq('profile_id', user.profile_id)
      .eq('hotel_id', hotelId)

    setSavingP(false)
    if (error) { setErrorP(error.message); return }
    onSaved()
  }

  const savePermissions = async () => {
    setSavingM(true); setErrorM(null)

    const { error: permErr } = await (supabase as any)
      .from('m08_user_menu_permissions')
      .upsert(
        perms.map(p => ({ user_id: user.profile_id, hotel_id: hotelId, menu_id: p.menu_id, permission: p.permission })),
        { onConflict: 'user_id,hotel_id,menu_id' }
      )
    if (permErr) { setErrorM(permErr.message); setSavingM(false); return }

    if (defaultMenu) {
      await (supabase as any)
        .from('m09_user_default_page')
        .upsert({ user_id: user.profile_id, menu_id: defaultMenu }, { onConflict: 'user_id' })
    }

    setSavingM(false)
    setSavedM(true)
    setTimeout(() => setSavedM(false), 3000)
  }

  const sendPasswordEmail = async () => {
    setSendingPw(true)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${origin}/reset-password` })
    setSendingPw(false); setPwSent(true)
    setTimeout(() => setPwSent(false), 4000)
  }

  const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('ko-KR') : '-'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed right-0 top-0 w-[440px] z-50 bg-bg-secondary flex flex-col"
        style={{ height: '100dvh', border: '1px solid var(--color-border-default)', borderRight: 'none', boxShadow: '-8px 0 32px rgba(0,0,0,0.4)' }}>

        {/* Header */}
        <div className="px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm text-accent-primary"
                style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{user.name}</p>
                  <RoleBadge role={user.hotel_role} />
                </div>
                <p className="text-xs text-brand-muted mt-0.5">{user.email}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* 소속 호텔 badges */}
          {allHotels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allHotels.map(h => (
                <span key={h.hotel_id}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    background: h.hotel_id === hotelId ? 'var(--accent-badge-bg)' : 'var(--color-bg-tertiary)',
                    border:     h.hotel_id === hotelId ? '1px solid var(--accent-badge-border)' : '1px solid var(--color-border-subtle)',
                    color:      h.hotel_id === hotelId ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                  }}>
                  <Building2 size={9} />
                  {h.hotel_name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          {[
            { key: 'profile',     label: '프로필',   icon: <Shield size={13} /> },
            { key: 'permissions', label: '메뉴 권한', icon: <Users size={13} /> },
          ].map(t => (
            <button key={t.key}
              onClick={() => setSheetTab(t.key as typeof sheetTab)}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors"
              style={sheetTab === t.key
                ? { borderBottom: '2px solid var(--color-accent-primary)', color: 'var(--color-accent-primary)' }
                : { color: 'var(--color-text-muted)' }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── 프로필 탭 ── */}
          {sheetTab === 'profile' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1.5">이름</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1.5">이메일</label>
                <input value={user.email} disabled
                  className={`${inputCls} opacity-50 cursor-not-allowed`} style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1.5">
                  이 호텔에서의 역할
                  <span className="ml-1 text-brand-dimmed font-normal text-[10px]">(이 호텔에만 적용)</span>
                </label>
                <select value={role} onChange={e => setRole(e.target.value as Role)}
                  className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                  <option value="manager">Manager</option>
                  <option value="staff">Staff</option>
                  <option value="read_only">Read Only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-2">이 호텔 접근 여부</label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div onClick={() => setIsActive(v => !v)}
                    className="relative rounded-full overflow-hidden transition-colors cursor-pointer"
                    style={{ width: 40, height: 20, background: isActive ? 'var(--color-accent-primary)' : 'var(--color-border-default)' }}>
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                      style={{ transform: isActive ? 'translateX(22px)' : 'translateX(2px)' }} />
                  </div>
                  <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {isActive ? '활성' : '비활성'}
                  </span>
                </label>
                <p className="text-[11px] text-brand-dimmed mt-1">비활성화 시 이 호텔에 접근 불가. 계정은 유지됩니다.</p>
              </div>
              <div className="pt-1 text-xs text-brand-dimmed space-y-1">
                <p>마지막 로그인: {formatDate(user.last_login_at)}</p>
                <p>초대일: {formatDate(user.created_at)}</p>
              </div>
              {errorP && (
                <div className="px-3 py-2 rounded-lg text-xs text-status-negative"
                  style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
                  {errorP}
                </div>
              )}
            </div>
          )}

          {/* ── 메뉴 권한 탭 ── */}
          {sheetTab === 'permissions' && (
            <div className="space-y-2">
              {loadingPerms ? (
                <div className="flex items-center justify-center py-12 gap-2 text-brand-muted">
                  <RefreshCw size={14} className="animate-spin" /><span className="text-sm">불러오는 중...</span>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-brand-muted mb-1.5">
                      기본 페이지 <span className="text-brand-dimmed font-normal">(로그인 후 첫 화면)</span>
                    </label>
                    <select value={defaultMenu} onChange={e => setDefaultMenu(e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                      <option value="">선택 안 함</option>
                      {menus.filter(m => getPerm(m.id) !== 'none').map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2 pb-2"
                    style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                    <span className="text-[11px] font-medium text-brand-muted uppercase tracking-wider">메뉴</span>
                    <div className="flex">
                      {PERM_LEVELS.map(l => (
                        <span key={l} className={`text-[11px] font-medium uppercase tracking-wider w-12 text-center ${PERM_COLOR[l]}`}>
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>

                  {menus.map(menu => {
                    const current = getPerm(menu.id)
                    return (
                      <div key={menu.id}
                        className="grid grid-cols-[1fr_auto] gap-2 items-center py-2 px-2 rounded-lg hover:bg-bg-tertiary transition-colors">
                        <span className="text-[13px]" style={{ color: 'var(--color-text-primary)' }}>{menu.name}</span>
                        <div className="flex">
                          {PERM_LEVELS.map(level => (
                            <div key={level} className="w-12 flex items-center justify-center">
                              <button onClick={() => setPerm(menu.id, level)}
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                                  current === level
                                    ? `border-current ${PERM_COLOR[level]}`
                                    : 'border-[var(--color-border-default)] hover:border-brand-muted'
                                }`}>
                                {current === level && (
                                  <span className={`w-1.5 h-1.5 rounded-full ${PERM_DOT[level]}`} />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {errorM && (
                    <div className="px-3 py-2 rounded-lg text-xs text-status-negative"
                      style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
                      {errorM}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 flex items-center justify-between gap-3"
          style={{ borderTop: '1px solid var(--color-border-default)' }}>
          {sheetTab === 'profile' ? (
            <button onClick={sendPasswordEmail} disabled={sendingPw || pwSent}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-60"
              style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
              {sendingPw ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
              {pwSent ? '발송됨 ✓' : '비밀번호 설정 메일'}
            </button>
          ) : <span />}

          {sheetTab === 'profile' ? (
            <button onClick={saveProfile} disabled={savingP}
              className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 transition-all"
              style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
              {savingP ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}저장
            </button>
          ) : (
            <div className="flex items-center gap-3">
              {savedM && (
                <span className="text-xs font-medium" style={{ color: 'var(--color-accent-primary)' }}>
                  ✓ 저장되었습니다
                </span>
              )}
              <button onClick={savePermissions} disabled={savingM}
                className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 transition-all"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
                {savingM ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}권한 저장
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Hotel User Tab (메인) ─────────────────────────────────────────────────────

export default function HotelUserTab({ hotelId }: { hotelId: string }) {
  const [users,        setUsers]        = useState<UserRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showInvite,   setShowInvite]   = useState(false)
  const [showAddExist, setShowAddExist] = useState(false)
  const [selected,     setSelected]     = useState<UserRow | null>(null)
  const [hotelName,    setHotelName]    = useState('')
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)
  const [deleting,     setDeleting]     = useState(false)
  const [deleteError,  setDeleteError]  = useState<string | null>(null)

  useEffect(() => {
    ;(supabase as any)
      .from('m02_hotels').select('hotel_name').eq('id', hotelId).single()
      .then(({ data }: any) => { if (data) setHotelName(data.hotel_name) })
  }, [hotelId])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const { data } = await (supabase as any)
      .from('m10_profile_hotels')
      .select(`
        id, role, is_active, created_at,
        m01_profiles ( id, email, name, is_active, last_login_at )
      `)
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })

    const mapped: UserRow[] = (data ?? [])
      .filter((ph: any) => ph.m01_profiles)
      .map((ph: any) => ({
        profile_hotel_id: ph.id,
        profile_id:       ph.m01_profiles.id,
        email:            ph.m01_profiles.email,
        name:             ph.m01_profiles.name,
        hotel_role:       ph.role as Role,
        hotel_active:     ph.is_active,
        last_login_at:    ph.m01_profiles.last_login_at,
        created_at:       ph.created_at,
      }))

    setUsers(mapped)
    setLoading(false)
  }, [hotelId])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true); setDeleteError(null)
    try {
      await (supabase as any).from('m10_profile_hotels').delete().eq('id', deleteTarget.profile_hotel_id)

      const { data: others } = await (supabase as any)
        .from('m10_profile_hotels').select('id').eq('profile_id', deleteTarget.profile_id).limit(1)

      if (!others || others.length === 0) {
        const { data: prof } = await (supabase as any)
          .from('m01_profiles').select('auth_user_id').eq('id', deleteTarget.profile_id).single()
        if (prof?.auth_user_id) {
          await fetch('/api/users/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auth_user_id: prof.auth_user_id }),
          })
        }
        await (supabase as any).from('m01_profiles').delete().eq('id', deleteTarget.profile_id)
      }

      setDeleteTarget(null); fetchUsers()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      setDeleting(false)
    }
  }

  const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('ko-KR') : '-'

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-muted">이 호텔에 소속된 유저를 관리합니다.</p>
        <div className="flex items-center gap-2">
          <button onClick={fetchUsers} disabled={loading}
            className="p-2 rounded-lg text-brand-muted hover:text-brand-text transition-colors"
            style={{ border: '1px solid var(--color-border-default)' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowAddExist(true)}
            className="flex items-center gap-1.5 rounded-lg py-2 px-3 text-sm font-medium transition-colors hover:text-brand-text"
            style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
            <UserCheck size={14} />기존 유저 추가
          </button>
          <button onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 rounded-full py-2 px-4 text-sm font-semibold hover:-translate-y-0.5 transition-all"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
            <UserPlus size={14} />새 유저 초대
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border-default)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-tertiary)' }}>
              {['이름 / 이메일', '역할', '상태', '마지막 로그인', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-brand-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center">
                <div className="flex items-center justify-center gap-2 text-brand-muted">
                  <RefreshCw size={14} className="animate-spin" /><span className="text-sm">불러오는 중...</span>
                </div>
              </td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center">
                <Users size={28} className="mx-auto text-brand-dimmed opacity-40 mb-3" />
                <p className="text-sm text-brand-muted mb-4">등록된 유저가 없습니다.</p>
                <div className="flex items-center justify-center gap-2">
                  <button onClick={() => setShowAddExist(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg py-1.5 px-3 text-xs font-medium"
                    style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                    <UserCheck size={12} />기존 유저 추가
                  </button>
                  <button onClick={() => setShowInvite(true)}
                    className="inline-flex items-center gap-1.5 rounded-full py-1.5 px-4 text-xs font-semibold"
                    style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
                    <UserPlus size={12} />새 유저 초대
                  </button>
                </div>
              </td></tr>
            ) : (
              users.map(u => (
                <tr key={u.profile_hotel_id} onClick={() => setSelected(u)}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg-surface)')}>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-accent-primary text-sm font-bold"
                        style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{u.name}</p>
                        <p className="text-xs text-brand-muted">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5"><RoleBadge role={u.hotel_role} /></td>
                  <td className="px-4 py-3.5">
                    {u.hotel_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)', color: 'var(--color-accent-primary)' }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" />활성
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-brand-dimmed"
                        style={{ border: '1px solid var(--color-border-default)' }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-dimmed" />비활성
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-brand-muted">{formatDate(u.last_login_at)}</td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(u); setDeleteError(null) }}
                      className="p-1.5 rounded-lg text-brand-dimmed transition-colors"
                      style={{ border: '1px solid transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.border = '1px solid var(--negative-border)'; e.currentTarget.style.background = 'var(--negative-bg)'; e.currentTarget.style.color = 'var(--color-negative)' }}
                      onMouseLeave={e => { e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '' }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 모달 & 슬라이드오버 */}
      {showInvite && (
        <InviteModal hotelId={hotelId}
          onClose={() => setShowInvite(false)}
          onSuccess={() => { setShowInvite(false); fetchUsers() }} />
      )}
      {showAddExist && (
        <AddExistingModal hotelId={hotelId}
          onClose={() => setShowAddExist(false)}
          onSuccess={() => { setShowAddExist(false); fetchUsers() }} />
      )}
      {selected && (
        <UserSheet user={selected} hotelId={hotelId} hotelName={hotelName}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); fetchUsers() }} />
      )}

      {/* 삭제 확인 모달 */}
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
              <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>유저를 삭제할까요?</h3>
              <p className="text-sm text-brand-muted">
                <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{deleteTarget.name}</span>
                {' '}님을 이 호텔에서 제거합니다. 다른 호텔 소속이 없으면 계정도 삭제됩니다.
              </p>
              {deleteError && <p className="mt-3 text-xs text-status-negative">{deleteError}</p>}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => { setDeleteTarget(null); setDeleteError(null) }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-brand-muted hover:text-brand-text transition-colors"
                style={{ border: '1px solid var(--color-border-default)' }}>취소</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold text-status-negative disabled:opacity-60"
                style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
