'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useHotel } from '@/contexts/HotelContext'
import {
  ArrowLeft, Save, Loader2, Building2,
  MapPin, Phone, Mail, Globe, Star, BedDouble, RefreshCw, Users, Trash2, Search, Eye, EyeOff,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import HotelUserTab from '@/components/hotels/HotelUserTab'
import { FormDatePicker } from '@/components/DatePicker'

// ── Types ─────────────────────────────────────────────────────────────────────

type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled'
type PlanType           = 'standard' | 'enterprise'

interface HotelBase {
  id:                   string
  hotel_name:           string
  slug:                 string
  plan:                 PlanType
  is_active:            boolean
  subscription_status:  SubscriptionStatus
  trial_ends_at:        string | null
  subscribed_at:        string | null
  subscription_ends_at: string | null
  created_at:           string
}

interface HotelDetail {
  id:           string
  hotel_id:     string
  address:      string | null
  city:         string | null
  country:      string | null
  timezone:     string | null
  phone:        string | null
  email:        string | null
  website:      string | null
  star_rating:  number | null
  room_count:   number | null
  branch_name:  string | null
  logo_url:     string | null
  upload_email: string | null
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 focus:outline-none transition-all'
const inputStyle = { color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }

function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.border    = '1px solid var(--color-accent-primary)'
  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
}
function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.border    = '1px solid var(--color-border-default)'
  e.currentTarget.style.boxShadow = 'none'
}

// ── Section Card ──────────────────────────────────────────────────────────────

function SectionCard({ icon, title, desc, children }: {
  icon: React.ReactNode; title: string; desc: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-bg-secondary overflow-hidden"
      style={{ border: '1px solid var(--color-border-default)' }}>
      <div className="flex items-center gap-3 px-6 py-4"
        style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-accent-primary"
          style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</p>
          <p className="text-xs text-brand-muted mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-brand-muted mb-1.5">{label}</label>
      {children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'info' | 'users'

export default function HotelDetailPage({ id }: { id: string }) {
  const router = useRouter()
  const { currentHotel } = useHotel()
  const mounted = useRef(false)

  // 헤더 호텔 탭 전환 시에만 이동 (초기 마운트 시에는 건너뜀)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    if (currentHotel && currentHotel.id !== id) {
      router.replace(`/hotels/${currentHotel.id}`)
    }
  }, [currentHotel?.id])

  const [activeTab,   setActiveTab]   = useState<Tab>('info')
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [success,     setSuccess]     = useState(false)
  const [showDelete,  setShowDelete]  = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [base,              setBase]              = useState<HotelBase | null>(null)
  const [detail,            setDetail]            = useState<Partial<HotelDetail>>({})
  const [uploadPassword,    setUploadPassword]    = useState('')
  const [showUploadPw,      setShowUploadPw]      = useState(false)
  const [creatingUpload,    setCreatingUpload]    = useState(false)
  const [uploadCreateMsg,   setUploadCreateMsg]   = useState<string | null>(null)

  const setB = <K extends keyof HotelBase>(k: K, v: HotelBase[K]) =>
    setBase(prev => prev ? { ...prev, [k]: v } : prev)
  const setD = <K extends keyof HotelDetail>(k: K, v: HotelDetail[K]) =>
    setDetail(prev => ({ ...prev, [k]: v }))

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      setError(null)
      setBase(null)
      setDetail({})

      const { data: h, error: e1 } = await (supabase as any)
        .from('m02_hotels')
        .select('id, hotel_name, slug, plan, is_active, subscription_status, trial_ends_at, created_at')
        .eq('id', id)
        .single()

      if (e1 || !h) { setError('호텔 정보를 찾을 수 없습니다.'); setLoading(false); return }
      setBase(h)

      const { data: d } = await (supabase as any)
        .from('m03_hotel_details')
        .select('*')
        .eq('hotel_id', id)
        .maybeSingle()

      const detailData = d ?? { hotel_id: id }
      setDetail(detailData)
      setLoading(false)
    }
    fetch()
  }, [id])

  // Daum 우편번호 스크립트 로드
  useEffect(() => {
    if (document.getElementById('daum-postcode-script')) return
    const script = document.createElement('script')
    script.id  = 'daum-postcode-script'
    script.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
    script.async = true
    document.head.appendChild(script)
  }, [])

  const openAddressSearch = () => {
    if (!window.daum?.Postcode) return
    new window.daum.Postcode({
      oncomplete: (data) => {
        setD('address', data.roadAddress || data.address)
        setD('city',    [data.sido, data.sigungu].filter(Boolean).join(' '))
        setD('country', 'KR')
      },
    }).open()
  }

  const handleSave = async () => {
    if (!base) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    // m02_hotels 업데이트
    const { error: e1 } = await (supabase as any)
      .from('m02_hotels')
      .update({
        hotel_name:           base.hotel_name,
        slug:                 base.slug,
        plan:                 base.plan,
        is_active:            base.is_active,
        subscription_status:  base.subscription_status,
        trial_ends_at:        base.trial_ends_at        ?? null,
        subscribed_at:        base.subscribed_at        ?? null,
        subscription_ends_at: base.subscription_ends_at ?? null,
        updated_at:           new Date().toISOString(),
      })
      .eq('id', id)

    if (e1) { setError(e1.message); setSaving(false); return }

    // m03_hotel_details upsert
    const { error: e2 } = await (supabase as any)
      .from('m03_hotel_details')
      .upsert({ ...detail, hotel_id: id }, { onConflict: 'hotel_id' })

    if (e2) { setError(e2.message); setSaving(false); return }

    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  const handleCreateUploadUser = async () => {
    if (!base?.slug || !uploadPassword || uploadPassword.length < 6) return
    const uploadEmail = `upload-${base.slug}@novastay.io`
    setCreatingUpload(true)
    setUploadCreateMsg(null)
    try {
      // 기존 계정 확인
      const { data: existing } = await (supabase as any)
        .from('m01_profiles')
        .select('id, is_active')
        .eq('email', uploadEmail)
        .maybeSingle()
      if (existing) {
        setUploadCreateMsg('이미 계정이 있습니다.')
        return
      }

      const res = await fetch('/api/users/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: uploadEmail, password: uploadPassword, name: `${base.hotel_name} Upload` }),
      })
      const { user_id, error: createErr } = await res.json()
      if (createErr) throw new Error(createErr)

      await new Promise(resolve => setTimeout(resolve, 1500))

      const { data: prof } = await (supabase as any)
        .from('m01_profiles')
        .select('id')
        .eq('auth_user_id', user_id)
        .single()

      if (prof) {
        await (supabase as any).from('m01_profiles').update({ role: 'upload' }).eq('id', prof.id)
        await (supabase as any).from('m10_profile_hotels').insert({
          profile_id: prof.id, hotel_id: id, role: 'upload', is_active: true,
        })
      }

      await (supabase as any)
        .from('m03_hotel_details')
        .update({ upload_email: uploadEmail })
        .eq('hotel_id', id)
      setDetail(prev => ({ ...prev, upload_email: uploadEmail }))
      setUploadPassword('')
      setUploadCreateMsg('계정이 생성됐어요!')
    } catch (e: any) {
      setUploadCreateMsg(`오류: ${e.message}`)
    } finally {
      setCreatingUpload(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    const { error } = await (supabase as any)
      .from('m02_hotels')
      .delete()
      .eq('id', id)
    if (error) { setDeleteError(error.message); setDeleting(false); return }
    router.push('/hotels')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-brand-muted">
        <RefreshCw size={18} className="animate-spin" />
        <span className="text-sm">불러오는 중...</span>
      </div>
    )
  }

  if (!base) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Building2 size={32} className="text-brand-dimmed opacity-40" />
        <p className="text-sm text-brand-muted">호텔 정보를 찾을 수 없습니다.</p>
        <button onClick={() => router.push('/hotels')}
          className="text-xs text-accent-primary underline">목록으로 돌아가기</button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/hotels')}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-brand-muted hover:text-brand-text transition-colors"
            style={{ border: '1px solid var(--color-border-default)' }}
          >
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              {base.hotel_name}
            </h1>
            <p className="text-sm text-brand-muted mt-0.5">{base.slug}</p>
          </div>
        </div>
        {activeTab === 'info' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 rounded-full py-2 px-4 text-sm font-medium transition-all hover:-translate-y-0.5 text-status-negative"
              style={{ border: '1px solid var(--negative-border)', background: 'var(--negative-bg)' }}
            >
              <Trash2 size={14} />
              삭제
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              저장
            </button>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        {[
          { key: 'info',  label: '기본 정보', icon: <Building2 size={14} /> },
          { key: 'users', label: '유저 관리',  icon: <Users size={14} /> },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as Tab)}
            className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors"
            style={activeTab === t.key
              ? { borderBottom: '2px solid var(--color-accent-primary)', color: 'var(--color-accent-primary)', marginBottom: -1 }
              : { color: 'var(--color-text-muted)' }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm text-status-negative"
          style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm text-accent-primary"
          style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
          저장됐습니다.
        </div>
      )}

      {/* ── Tab: 유저 관리 ── */}
      {activeTab === 'users' && <HotelUserTab hotelId={id} />}

      {/* ── Tab: 기본 정보 ── */}
      {activeTab === 'info' && (
      <><div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── 기본 정보 ── */}
        <SectionCard icon={<Building2 size={16} />} title="기본 정보" desc="호텔명, 플랜, 구독 상태">
          <div className="space-y-4">
            <Field label="호텔명">
              <input value={base.hotel_name} onChange={e => setB('hotel_name', e.target.value)}
                className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
            </Field>
            <Field label="슬러그">
              <input value={base.slug} onChange={e => setB('slug', e.target.value)}
                className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="플랜">
                <select value={base.plan} onChange={e => setB('plan', e.target.value as PlanType)}
                  className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                  <option value="standard">Standard</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </Field>
              <Field label="구독 상태">
                <select value={base.subscription_status}
                  onChange={e => setB('subscription_status', e.target.value as SubscriptionStatus)}
                  className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                  <option value="trial">트라이얼</option>
                  <option value="active">운영 중</option>
                  <option value="past_due">연체</option>
                  <option value="canceled">해지</option>
                </select>
              </Field>
            </div>
            {/* trial_ends_at — trial일 때만 표시 */}
            {base.subscription_status === 'trial' && (
              <Field label="트라이얼 만료일">
                <FormDatePicker
                  value={base.trial_ends_at ? base.trial_ends_at.slice(0, 10) : ''}
                  onChange={v => setB('trial_ends_at', v ? v + 'T00:00:00+00:00' : null)}
                  placeholder="만료일 선택"
                />
              </Field>
            )}

            {/* subscribed_at, subscription_ends_at — active일 때만 표시 */}
            {base.subscription_status === 'active' && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="구독 시작일">
                  <FormDatePicker
                    value={base.subscribed_at ? base.subscribed_at.slice(0, 10) : ''}
                    onChange={v => setB('subscribed_at', v ? v + 'T00:00:00+00:00' : null)}
                    placeholder="시작일 선택"
                  />
                </Field>
                <Field label="구독 만료일">
                  <FormDatePicker
                    value={base.subscription_ends_at ? base.subscription_ends_at.slice(0, 10) : ''}
                    onChange={v => setB('subscription_ends_at', v ? v + 'T00:00:00+00:00' : null)}
                    placeholder="만료일 선택"
                  />
                </Field>
              </div>
            )}

            <Field label="활성 여부">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setB('is_active', !base.is_active)}
                  className="relative rounded-full transition-colors cursor-pointer"
                  style={{ width: 40, height: 20, background: base.is_active ? 'var(--color-accent-primary)' : 'var(--color-border-default)' }}
                >
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                    style={{ transform: base.is_active ? 'translateX(21px)' : 'translateX(2px)' }} />
                </div>
                <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  {base.is_active ? '활성' : '비활성'}
                </span>
              </label>
            </Field>
          </div>
        </SectionCard>

        {/* ── 위치 정보 ── */}
        <SectionCard icon={<MapPin size={16} />} title="위치 정보" desc="주소, 도시, 국가">
          <div className="space-y-4">
            <Field label="지점명">
              <input value={detail.branch_name ?? ''} onChange={e => setD('branch_name', e.target.value)}
                placeholder="강남점" className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
            </Field>
            <Field label="주소">
              <div className="flex gap-2">
                <input value={detail.address ?? ''} onChange={e => setD('address', e.target.value)}
                  placeholder="주소 검색 버튼을 클릭하거나 직접 입력"
                  className={`${inputCls} flex-1`} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                <button
                  type="button"
                  onClick={openAddressSearch}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-md text-sm font-medium shrink-0 transition-all hover:-translate-y-px text-accent-primary"
                  style={{ border: '1px solid var(--accent-badge-border)', background: 'var(--accent-badge-bg)' }}
                >
                  <Search size={14} />
                  검색
                </button>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="도시">
                <input value={detail.city ?? ''} onChange={e => setD('city', e.target.value)}
                  placeholder="서울" className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </Field>
              <Field label="국가">
                <input value={detail.country ?? 'KR'} onChange={e => setD('country', e.target.value)}
                  placeholder="KR" className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </Field>
            </div>
            <Field label="시간대">
              <select value={detail.timezone ?? 'Asia/Seoul'} onChange={e => setD('timezone', e.target.value)}
                className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                <option value="Asia/Seoul">Asia/Seoul (KST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="UTC">UTC</option>
              </select>
            </Field>
          </div>
        </SectionCard>

        {/* ── 연락처 ── */}
        <SectionCard icon={<Phone size={16} />} title="연락처" desc="전화번호, 이메일, 웹사이트">
          <div className="space-y-4">
            <Field label="전화번호">
              <div className="relative">
                <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
                <input value={detail.phone ?? ''} onChange={e => setD('phone', e.target.value)}
                  placeholder="02-0000-0000"
                  className={`${inputCls} pl-9`} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </div>
            </Field>
            <Field label="이메일">
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
                <input value={detail.email ?? ''} onChange={e => setD('email', e.target.value)}
                  placeholder="hotel@example.com" type="email"
                  className={`${inputCls} pl-9`} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </div>
            </Field>
            <Field label="웹사이트">
              <div className="relative">
                <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
                <input value={detail.website ?? ''} onChange={e => setD('website', e.target.value)}
                  placeholder="https://www.hotel.com"
                  className={`${inputCls} pl-9`} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </div>
            </Field>
          </div>
        </SectionCard>

        {/* ── 호텔 정보 ── */}
        <SectionCard icon={<Star size={16} />} title="호텔 정보" desc="별점, 객실 수, 로고">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="별점">
                <div className="relative">
                  <Star size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-status-warning pointer-events-none" />
                  <select
                    value={detail.star_rating ?? ''}
                    onChange={e => setD('star_rating', e.target.value ? Number(e.target.value) : null)}
                    className={`${inputCls} pl-9`} style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                  >
                    <option value="">선택</option>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}성급</option>)}
                  </select>
                </div>
              </Field>
              <Field label="객실 수">
                <div className="relative">
                  <BedDouble size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
                  <input
                    type="number" min={0}
                    value={detail.room_count ?? ''}
                    onChange={e => setD('room_count', e.target.value ? Number(e.target.value) : null)}
                    placeholder="0"
                    className={`${inputCls} pl-9`} style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                  />
                </div>
              </Field>
            </div>
            <Field label="로고 URL">
              <input value={detail.logo_url ?? ''} onChange={e => setD('logo_url', e.target.value)}
                placeholder="https://..." className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
            </Field>
            {detail.logo_url && (
              <div className="flex items-center gap-3 p-3 rounded-lg"
                style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)' }}>
                <img src={detail.logo_url} alt="logo preview"
                  className="w-10 h-10 rounded-lg object-cover" />
                <p className="text-xs text-brand-muted">로고 미리보기</p>
              </div>
            )}
          {/* PAD 업로드 전용 계정 */}
          <div className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              PAD 업로드 전용 계정
            </p>

            {/* 자동 생성 이메일 (읽기 전용) */}
            <div>
              <label className="block text-xs font-medium text-brand-muted mb-1.5">이메일 (자동 생성, 변경 불가)</label>
              <input
                type="email"
                value={base?.slug ? `upload-${base.slug}@novastay.io` : '—'}
                readOnly
                className={inputCls}
                style={{ ...inputStyle, opacity: 0.6, cursor: 'default' }}
              />
            </div>

            {/* 비밀번호 입력 */}
            {!detail.upload_email && (
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1.5">비밀번호 (최소 6자)</label>
                <div className="relative">
                  <input
                    type={showUploadPw ? 'text' : 'password'}
                    value={uploadPassword}
                    onChange={e => setUploadPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                    className={`${inputCls} pr-10`}
                    style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                  />
                  <button
                    type="button"
                    onClick={() => setShowUploadPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text transition-colors">
                    {showUploadPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}

            {/* 계정 생성 버튼 / 기존 계정 표시 */}
            {detail.upload_email ? (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-positive)' }}>
                <span>✅ 계정 있음:</span>
                <span className="font-mono">{detail.upload_email}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleCreateUploadUser}
                disabled={creatingUpload || !uploadPassword || uploadPassword.length < 6}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
                {creatingUpload ? <Loader2 size={13} className="animate-spin" /> : null}
                계정 생성
              </button>
            )}

            {uploadCreateMsg && (
              <p className={`text-xs ${uploadCreateMsg.startsWith('오류') || uploadCreateMsg.includes('이미') ? 'text-status-negative' : 'text-status-positive'}`}>
                {uploadCreateMsg}
              </p>
            )}
            <p className="text-xs text-brand-dimmed">이 이메일로 로그인하면 업로드 전용 페이지만 접근 가능합니다.</p>
          </div>

          </div>
        </SectionCard>
      </div>

      {/* ── Bottom save ── */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full py-2 px-6 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          저장
        </button>
      </div>
      </>
      )}

      {/* ── 삭제 확인 모달 ── */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDelete(false)} />
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
                <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{base.hotel_name}</span>
                {' '}및 관련 데이터가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
              {deleteError && (
                <p className="mt-3 text-xs text-status-negative">{deleteError}</p>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => { setShowDelete(false); setDeleteError(null) }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-brand-muted transition-colors hover:text-brand-text"
                style={{ border: '1px solid var(--color-border-default)' }}
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold text-status-negative transition-all disabled:opacity-60"
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
