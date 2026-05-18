'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, ChevronRight, User, Shield, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Hotel, SaasMenu, UserRole, PermissionLevel } from '@/types/supabase'
import MenuPermissions, { type MenuPermissionRow } from './MenuPermissions'

// ── Schema ────────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  name:     z.string().min(1, '이름을 입력해주세요'),
  email:    z.string().email('올바른 이메일 형식을 입력해주세요'),
  role:     z.enum(['super_admin', 'admin', 'manager', 'staff', 'read_only'] as const),
  hotel_id: z.string().nullable(),
}).refine(
  data => {
    const needsHotel = ['manager', 'staff', 'read_only'].includes(data.role)
    return !needsHotel || (data.hotel_id !== null && data.hotel_id !== '')
  },
  { message: '소속 호텔을 선택해주세요', path: ['hotel_id'] }
)

type Step1Data = z.infer<typeof step1Schema>

const ROLE_OPTIONS: { value: UserRole; label: string; desc: string }[] = [
  { value: 'super_admin', label: 'Super Admin', desc: '모든 권한 (운영자)' },
  { value: 'admin',       label: 'Admin',       desc: '관리자 (운영자)' },
  { value: 'manager',     label: 'Manager',     desc: '호텔 매니저' },
  { value: 'staff',       label: 'Staff',       desc: '호텔 직원' },
  { value: 'read_only',   label: 'Read Only',   desc: '읽기 전용' },
]

const inputClass =
  'w-full bg-ns-sidebar border border-ns-border rounded-lg px-3.5 py-2.5 text-[13px] text-ns-text placeholder:text-ns-text-placeholder focus:outline-none focus:border-ns-accent focus:ring-2 focus:ring-[#00E5A0]/10 transition-colors duration-150'

// ── Component ─────────────────────────────────────────────────────────────────

interface UserAddModalProps {
  hotels: Hotel[]
  menus:  SaasMenu[]
  onClose:   () => void
  onSuccess: () => void
}

export default function UserAddModal({ hotels, menus, onClose, onSuccess }: UserAddModalProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null)
  const [permissions, setPermissions] = useState<MenuPermissionRow[]>(
    menus.map(m => ({ menu_id: m.id, permission: 'none' as PermissionLevel }))
  )
  const [defaultMenuId, setDefaultMenuId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: { role: 'staff', hotel_id: null },
  })

  const selectedRole = watch('role')
  const needsHotel = ['manager', 'staff', 'read_only'].includes(selectedRole)

  const onStep1Submit = (data: Step1Data) => {
    setStep1Data(data)
    setStep(2)
  }

  const handlePermChange = (menuId: string, permission: PermissionLevel) => {
    setPermissions(prev =>
      prev.map(p => p.menu_id === menuId ? { ...p, permission } : p)
    )
    if (permission === 'none' && defaultMenuId === menuId) {
      setDefaultMenuId('')
    }
  }

  const handleSave = async () => {
    if (!step1Data) return
    setSaving(true)
    setError(null)

    try {
      // 1. Auth 초대
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: step1Data.email, name: step1Data.name, role: step1Data.role }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '초대 메일 발송 실패')

      const authUserId: string = json.user_id

      // 2. m01_profiles upsert (트리거가 이미 생성했을 수 있음)
      const { error: profileErr } = await (supabase as any)
        .from('m01_profiles')
        .upsert({
          auth_user_id: authUserId,
          email:        step1Data.email,
          name:         step1Data.name,
          role:         step1Data.role,
          is_active:    true,
        }, { onConflict: 'auth_user_id' })

      if (profileErr) throw new Error(profileErr.message)

      const { data: profile } = await (supabase as any)
        .from('m01_profiles')
        .select('id')
        .eq('auth_user_id', authUserId)
        .single()

      const userId = profile?.id
      if (!userId) throw new Error('프로필 조회 실패')

      // 3. m08_user_menu_permissions upsert
      const permRows = permissions.filter(p => p.permission !== 'none')
      if (permRows.length > 0) {
        const { error: permErr } = await (supabase as any)
          .from('m08_user_menu_permissions')
          .upsert(
            permRows.map(p => ({ user_id: userId, menu_id: p.menu_id, permission: p.permission })),
            { onConflict: 'user_id,menu_id' }
          )
        if (permErr) throw new Error(permErr.message)
      }

      // 4. m09_user_default_page upsert
      if (defaultMenuId) {
        const { error: defErr } = await (supabase as any)
          .from('m09_user_default_page')
          .upsert({ user_id: userId, menu_id: defaultMenuId }, { onConflict: 'user_id' })
        if (defErr) throw new Error(defErr.message)
      }

      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-ns-bg border border-ns-border rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ns-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-ns-accent-surface border border-ns-accent-border flex items-center justify-center">
              <User size={15} className="text-ns-accent" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-ns-text">유저 추가</h2>
              <p className="text-[12px] text-ns-text-muted">
                {step === 1 ? '기본 정보 입력' : '메뉴 권한 설정'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-ns-text-muted hover:text-ns-text transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-ns-border">
          {[{ n: 1, label: '기본 정보' }, { n: 2, label: '메뉴 권한' }].map(s => (
            <button
              key={s.n}
              onClick={() => step1Data && setStep(s.n as 1 | 2)}
              className={`flex-1 py-3 text-[12px] font-medium flex items-center justify-center gap-2 transition-colors ${
                step === s.n
                  ? 'text-ns-accent border-b-2 border-ns-accent'
                  : step1Data || s.n === 1
                  ? 'text-ns-text-muted hover:text-ns-text-secondary'
                  : 'text-ns-text-placeholder cursor-not-allowed'
              }`}
              disabled={s.n === 2 && !step1Data}
            >
              <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-semibold ${
                step === s.n ? 'bg-ns-accent text-black' : 'bg-ns-sidebar text-ns-text-muted'
              }`}>
                {s.n}
              </span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {step === 1 ? (
            <form id="step1-form" onSubmit={handleSubmit(onStep1Submit)} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-ns-text-secondary mb-1.5">이름 *</label>
                <input {...register('name')} placeholder="홍길동" className={inputClass} />
                {errors.name && <p className="mt-1 text-[11px] text-ns-negative">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ns-text-secondary mb-1.5">이메일 *</label>
                <input {...register('email')} type="email" placeholder="user@example.com" className={inputClass} />
                {errors.email && <p className="mt-1 text-[11px] text-ns-negative">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ns-text-secondary mb-2">역할 *</label>
                <Controller
                  control={control}
                  name="role"
                  render={({ field }) => (
                    <div className="grid grid-cols-1 gap-2">
                      {ROLE_OPTIONS.map(opt => (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            field.value === opt.value
                              ? 'border-ns-accent bg-ns-accent-surface'
                              : 'border-ns-border hover:border-ns-text-muted bg-ns-sidebar'
                          }`}
                        >
                          <input
                            type="radio"
                            value={opt.value}
                            checked={field.value === opt.value}
                            onChange={() => field.onChange(opt.value)}
                            className="sr-only"
                          />
                          <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            field.value === opt.value ? 'border-ns-accent' : 'border-ns-border'
                          }`}>
                            {field.value === opt.value && <span className="w-2 h-2 rounded-full bg-ns-accent" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-ns-text">{opt.label}</p>
                            <p className="text-[11px] text-ns-text-muted">{opt.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                />
              </div>

              {needsHotel && (
                <div>
                  <label className="block text-[12px] font-medium text-ns-text-secondary mb-1.5">소속 호텔 *</label>
                  <div className="relative">
                    <select {...register('hotel_id')} className={`${inputClass} appearance-none pr-8`}>
                      <option value="">호텔을 선택해주세요</option>
                      {hotels.map(h => (
                        <option key={h.id} value={h.id}>{h.hotel_name}</option>
                      ))}
                    </select>
                    <ChevronRight size={13} className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-ns-text-muted pointer-events-none" />
                  </div>
                  {errors.hotel_id && <p className="mt-1 text-[11px] text-ns-negative">{errors.hotel_id.message}</p>}
                </div>
              )}
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-[12px] text-ns-text-muted">
                <span className="text-ns-text font-medium">{step1Data?.name}</span> 님에게 부여할 메뉴 접근 권한을 설정하세요.
              </p>
              <MenuPermissions
                menus={menus}
                permissions={permissions}
                onChange={handlePermChange}
                defaultMenuId={defaultMenuId}
                onDefaultChange={setDefaultMenuId}
                showDefault
              />
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-[#1F0A0A] border border-[#3D1010] text-[13px] text-ns-negative">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-ns-border bg-ns-sidebar">
          <button
            type="button"
            onClick={step === 1 ? onClose : () => setStep(1)}
            className="flex items-center gap-1.5 bg-transparent border border-ns-border text-ns-text-muted hover:text-ns-text-secondary hover:border-[#2D3748] text-[13px] px-4 py-2 rounded-lg transition-colors"
          >
            {step === 1 ? '취소' : '이전'}
          </button>
          {step === 1 ? (
            <button
              type="submit"
              form="step1-form"
              className="flex items-center gap-1.5 bg-ns-accent hover:bg-ns-accent-hover text-black font-semibold text-[13px] px-5 py-2 rounded-lg transition-all hover:-translate-y-px shadow-[0_0_20px_rgba(0,212,138,0.2)]"
            >
              다음
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-ns-accent hover:bg-ns-accent-hover disabled:opacity-60 disabled:cursor-not-allowed text-black font-semibold text-[13px] px-5 py-2 rounded-lg transition-all hover:-translate-y-px shadow-[0_0_20px_rgba(0,212,138,0.2)]"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              초대 발송
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
