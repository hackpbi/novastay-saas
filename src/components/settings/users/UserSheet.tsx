'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, User, Shield, Activity, Loader2, ChevronDown, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { ProfileWithHotels, Hotel, SaasMenu, UserRole, PermissionLevel } from '@/types/supabase'
import { UserRoleBadge, StatusBadge } from './UserRoleBadge'
import MenuPermissions, { type MenuPermissionRow } from './MenuPermissions'
import { useAuth } from '@/contexts/AuthContext'

// ── Profile edit schema ───────────────────────────────────────────────────────

const profileSchema = z.object({
  name:      z.string().min(1, '이름을 입력해주세요'),
  role:      z.enum(['super_admin', 'admin', 'manager', 'staff', 'read_only', 'upload'] as const),
  is_active: z.boolean(),
})

type ProfileForm = z.infer<typeof profileSchema>

const ROLE_OPTIONS: UserRole[] = ['super_admin', 'admin', 'manager', 'staff', 'read_only']

const inputClass =
  'w-full bg-ns-sidebar border border-ns-border rounded-lg px-3.5 py-2.5 text-[13px] text-ns-text placeholder:text-ns-text-placeholder focus:outline-none focus:border-ns-accent focus:ring-2 focus:ring-[#00E5A0]/10 transition-colors duration-150'

// ── Component ─────────────────────────────────────────────────────────────────

interface UserSheetProps {
  profile:     ProfileWithHotels
  hotels:      Hotel[]
  menus:       SaasMenu[]
  permissions: MenuPermissionRow[]
  defaultMenuId: string
  onClose:     () => void
  onSaved:     () => void
}

type Tab = 'profile' | 'permissions' | 'activity'

export default function UserSheet({
  profile,
  hotels,
  menus,
  permissions: initialPerms,
  defaultMenuId: initialDefault,
  onClose,
  onSaved,
}: UserSheetProps) {
  const { profile: currentUser } = useAuth()
  const [tab, setTab] = useState<Tab>('profile')
  const [permissions, setPermissions] = useState<MenuPermissionRow[]>(
    menus.map(m => ({
      menu_id:    m.id,
      permission: initialPerms.find(p => p.menu_id === m.id)?.permission ?? 'none',
    }))
  )
  const [defaultMenuId, setDefaultMenuId] = useState(initialDefault)
  const [savingProfile,  setSavingProfile]  = useState(false)
  const [savingPerms,    setSavingPerms]    = useState(false)
  const [profileError,   setProfileError]   = useState<string | null>(null)
  const [permsError,     setPermsError]     = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name:      profile.name,
      role:      profile.role,
      is_active: profile.is_active,
    },
  })

  const handleProfileSave = async (data: ProfileForm) => {
    setSavingProfile(true)
    setProfileError(null)
    const { error } = await (supabase as any)
      .from('m01_profiles')
      .update({
        name:       data.name,
        role:       data.role,
        is_active:  data.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)

    setSavingProfile(false)
    if (error) { setProfileError(error.message); return }
    onSaved()
  }

  const handlePermsSave = async () => {
    setSavingPerms(true)
    setPermsError(null)

    const allRows = permissions.map(p => ({
      user_id:    profile.id,
      menu_id:    p.menu_id,
      permission: p.permission,
      updated_by: currentUser?.id ?? null,
    }))

    const { error: permErr } = await (supabase as any)
      .from('m08_user_menu_permissions')
      .upsert(allRows, { onConflict: 'user_id,menu_id' })

    if (permErr) { setPermsError(permErr.message); setSavingPerms(false); return }

    if (defaultMenuId) {
      const { error: defErr } = await (supabase as any)
        .from('m09_user_default_page')
        .upsert({ user_id: profile.id, menu_id: defaultMenuId }, { onConflict: 'user_id' })
      if (defErr) { setPermsError(defErr.message); setSavingPerms(false); return }
    }

    setSavingPerms(false)
    onSaved()
  }

  const handlePermChange = (menuId: string, permission: PermissionLevel) => {
    setPermissions(prev => prev.map(p => p.menu_id === menuId ? { ...p, permission } : p))
    if (permission === 'none' && defaultMenuId === menuId) setDefaultMenuId('')
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'profile',     label: '프로필',    icon: <User size={14} /> },
    { key: 'permissions', label: '메뉴 권한',  icon: <Shield size={14} /> },
    { key: 'activity',    label: '활동 로그',  icon: <Activity size={14} /> },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-ns-bg border-l border-ns-border flex flex-col shadow-[−20px_0_60px_rgba(0,0,0,0.4)] animate-slide-in-right" style={{ height: '100dvh' }}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-ns-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ns-accent-surface border border-ns-accent-border flex items-center justify-center shrink-0">
              <span className="text-[15px] font-semibold text-ns-accent">
                {profile.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-ns-text">{profile.name}</h2>
                <UserRoleBadge role={profile.role} />
              </div>
              <p className="text-[12px] text-ns-text-muted mt-0.5">{profile.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ns-text-muted hover:text-ns-text transition-colors mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ns-border shrink-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                tab === t.key
                  ? 'text-ns-accent border-b-2 border-ns-accent'
                  : 'text-ns-text-muted hover:text-ns-text-secondary'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Tab 1: Profile ── */}
          {tab === 'profile' && (
            <form id="profile-form" onSubmit={handleSubmit(handleProfileSave)} className="space-y-5">
              <div>
                <label className="block text-[12px] font-medium text-ns-text-secondary mb-1.5">이름</label>
                <input {...register('name')} className={inputClass} />
                {errors.name && <p className="mt-1 text-[11px] text-ns-negative">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ns-text-secondary mb-1.5">이메일</label>
                <input value={profile.email} disabled className={`${inputClass} opacity-50 cursor-not-allowed`} />
                <p className="mt-1 text-[11px] text-ns-text-muted">이메일은 변경할 수 없습니다.</p>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ns-text-secondary mb-1.5">역할</label>
                <div className="relative">
                  <select {...register('role')} className={`${inputClass} appearance-none pr-8`}>
                    {ROLE_OPTIONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-ns-text-muted pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ns-text-secondary mb-2">계정 상태</label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" {...register('is_active')} className="sr-only" />
                  <div
                    onClick={() => {
                      const el = document.querySelector<HTMLInputElement>('input[name="is_active"]')
                      if (el) el.click()
                    }}
                    className={`w-10 h-5 rounded-full relative transition-colors ${
                      watch('is_active') ? 'bg-ns-accent' : 'bg-ns-border'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      watch('is_active') ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </div>
                  <span className="text-[13px] text-ns-text">
                    {watch('is_active') ? '활성' : '비활성'}
                  </span>
                </label>
              </div>

              {profileError && (
                <div className="p-3 rounded-lg bg-[#1F0A0A] border border-[#3D1010] text-[13px] text-ns-negative">
                  {profileError}
                </div>
              )}
            </form>
          )}

          {/* ── Tab 2: Permissions ── */}
          {tab === 'permissions' && (
            <div className="space-y-4">
              <p className="text-[12px] text-ns-text-muted">
                각 메뉴에 대한 접근 권한을 설정합니다.
              </p>
              <MenuPermissions
                menus={menus}
                permissions={permissions}
                onChange={handlePermChange}
                defaultMenuId={defaultMenuId}
                onDefaultChange={setDefaultMenuId}
                showDefault
              />
              {permsError && (
                <div className="p-3 rounded-lg bg-[#1F0A0A] border border-[#3D1010] text-[13px] text-ns-negative">
                  {permsError}
                </div>
              )}
            </div>
          )}

          {/* ── Tab 3: Activity ── */}
          {tab === 'activity' && (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Activity size={32} className="text-ns-text-muted opacity-40" />
              <p className="text-[13px] text-ns-text-muted">활동 로그는 추후 구현 예정입니다.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-ns-border bg-ns-sidebar flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] text-ns-text-muted">
            <StatusBadge active={profile.is_active} />
          </div>
          {tab === 'profile' && (
            <button
              type="submit"
              form="profile-form"
              disabled={savingProfile || !isDirty}
              className="flex items-center gap-1.5 bg-ns-accent hover:bg-ns-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-[13px] px-5 py-2 rounded-lg transition-all hover:-translate-y-px shadow-[0_0_20px_rgba(0,212,138,0.2)]"
            >
              {savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              저장
            </button>
          )}
          {tab === 'permissions' && (
            <button
              type="button"
              onClick={handlePermsSave}
              disabled={savingPerms}
              className="flex items-center gap-1.5 bg-ns-accent hover:bg-ns-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-[13px] px-5 py-2 rounded-lg transition-all hover:-translate-y-px shadow-[0_0_20px_rgba(0,212,138,0.2)]"
            >
              {savingPerms ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              권한 저장
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
