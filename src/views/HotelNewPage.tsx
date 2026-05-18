'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Loader2, Building2,
  MapPin, Phone, Mail, Globe, Star, BedDouble, Search,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanType           = 'standard' | 'enterprise'
type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled'

// ── Style helpers ─────────────────────────────────────────────────────────────

const inputCls   = 'w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 focus:outline-none transition-all'
const inputStyle = { color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }

function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.border    = '1px solid var(--color-accent-primary)'
  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
}
function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-brand-muted mb-1.5">
        {label}{required && <span className="text-status-negative ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HotelNewPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // 기본 정보
  const [hotelName, setHotelName]   = useState('')
  const [slug,      setSlug]        = useState('')
  const [plan,      setPlan]        = useState<PlanType>('standard')
  const [status,    setStatus]      = useState<SubscriptionStatus>('trial')
  const [isActive,  setIsActive]    = useState(true)

  // 위치 정보
  const [branchName, setBranchName] = useState('')
  const [address,    setAddress]    = useState('')
  const [city,       setCity]       = useState('')
  const [country,    setCountry]    = useState('KR')
  const [timezone,   setTimezone]   = useState('Asia/Seoul')

  // 연락처
  const [phone,    setPhone]   = useState('')
  const [email,    setEmail]   = useState('')
  const [website,  setWebsite] = useState('')

  // 호텔 정보
  const [starRating, setStarRating] = useState<number | ''>('')
  const [roomCount,  setRoomCount]  = useState<number | ''>('')
  const [logoUrl,    setLogoUrl]    = useState('')

  // Daum 우편번호 스크립트 로드
  useEffect(() => {
    if (document.getElementById('daum-postcode-script')) return
    const script = document.createElement('script')
    script.id    = 'daum-postcode-script'
    script.src   = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
    script.async = true
    document.head.appendChild(script)
  }, [])

  const openAddressSearch = () => {
    if (!window.daum?.Postcode) return
    new window.daum.Postcode({
      oncomplete: (data) => {
        setAddress([data.sido, data.sigungu, data.bname, data.buildingName]
          .filter(Boolean).join(' ') || data.roadAddress || data.address)
        setCity([data.sido, data.sigungu].filter(Boolean).join(' '))
        setCountry('KR')
      },
    }).open()
  }

  // slug 자동 생성
  const handleHotelNameChange = (v: string) => {
    setHotelName(v)
    if (!slug) {
      setSlug(v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
    }
  }

  const handleSave = async () => {
    if (!hotelName.trim()) { setError('호텔명을 입력해주세요.'); return }
    if (!slug.trim())      { setError('슬러그를 입력해주세요.'); return }

    setSaving(true)
    setError(null)

    // 1. m02_hotels INSERT
    const { data: hotel, error: hotelErr } = await (supabase as any)
      .from('m02_hotels')
      .insert({
        hotel_name:          hotelName.trim(),
        slug:                slug.trim(),
        plan,
        is_active:           isActive,
        subscription_status: status,
      })
      .select('id')
      .single()

    if (hotelErr) { setError(hotelErr.message); setSaving(false); return }

    // 2. m03_hotel_details INSERT
    const { error: detailErr } = await (supabase as any)
      .from('m03_hotel_details')
      .insert({
        hotel_id:    hotel.id,
        branch_name: branchName || null,
        address:     address    || null,
        city:        city       || null,
        country:     country    || null,
        timezone:    timezone   || null,
        phone:       phone      || null,
        email:       email      || null,
        website:     website    || null,
        star_rating: starRating !== '' ? starRating : null,
        room_count:  roomCount  !== '' ? roomCount  : null,
        logo_url:    logoUrl    || null,
      })

    if (detailErr) { setError(detailErr.message); setSaving(false); return }

    router.push(`/hotels/${hotel.id}`)
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
              호텔 등록
            </h1>
            <p className="text-sm text-brand-muted mt-0.5">새 호텔을 NovaStay에 등록합니다.</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          등록
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm text-status-negative"
          style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── 기본 정보 ── */}
        <SectionCard icon={<Building2 size={16} />} title="기본 정보" desc="호텔명, 플랜, 구독 상태">
          <div className="space-y-4">
            <Field label="호텔명" required>
              <input
                value={hotelName}
                onChange={e => handleHotelNameChange(e.target.value)}
                placeholder="NovaStay 강남점"
                className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}
              />
            </Field>
            <Field label="슬러그" required>
              <input
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="novastay-gangnam"
                className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}
              />
              <p className="mt-1 text-[11px] text-brand-dimmed">영문 소문자, 숫자, 하이픈만 사용 가능</p>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="플랜">
                <select value={plan} onChange={e => setPlan(e.target.value as PlanType)}
                  className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                  <option value="standard">Standard</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </Field>
              <Field label="구독 상태">
                <select value={status} onChange={e => setStatus(e.target.value as SubscriptionStatus)}
                  className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                  <option value="trial">트라이얼</option>
                  <option value="active">운영 중</option>
                  <option value="past_due">연체</option>
                  <option value="canceled">해지</option>
                </select>
              </Field>
            </div>
            <Field label="활성 여부">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setIsActive(v => !v)}
                  className="relative rounded-full transition-colors cursor-pointer"
                  style={{ width: 40, height: 20, background: isActive ? 'var(--color-accent-primary)' : 'var(--color-border-default)' }}
                >
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                    style={{ transform: isActive ? 'translateX(21px)' : 'translateX(2px)' }} />
                </div>
                <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  {isActive ? '활성' : '비활성'}
                </span>
              </label>
            </Field>
          </div>
        </SectionCard>

        {/* ── 위치 정보 ── */}
        <SectionCard icon={<MapPin size={16} />} title="위치 정보" desc="주소, 도시, 국가">
          <div className="space-y-4">
            <Field label="지점명">
              <input value={branchName} onChange={e => setBranchName(e.target.value)}
                placeholder="강남점" className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
            </Field>
            <Field label="주소">
              <div className="flex gap-2">
                <input value={address} onChange={e => setAddress(e.target.value)}
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
                <input value={city} onChange={e => setCity(e.target.value)}
                  placeholder="서울" className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </Field>
              <Field label="국가">
                <input value={country} onChange={e => setCountry(e.target.value)}
                  placeholder="KR" className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </Field>
            </div>
            <Field label="시간대">
              <select value={timezone} onChange={e => setTimezone(e.target.value)}
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
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="02-0000-0000"
                  className={`${inputCls} pl-9`} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </div>
            </Field>
            <Field label="이메일">
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="hotel@example.com"
                  className={`${inputCls} pl-9`} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </div>
            </Field>
            <Field label="웹사이트">
              <div className="relative">
                <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
                <input value={website} onChange={e => setWebsite(e.target.value)}
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
                    value={starRating}
                    onChange={e => setStarRating(e.target.value ? Number(e.target.value) : '')}
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
                    value={roomCount}
                    onChange={e => setRoomCount(e.target.value ? Number(e.target.value) : '')}
                    placeholder="0"
                    className={`${inputCls} pl-9`} style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                  />
                </div>
              </Field>
            </div>
            <Field label="로고 URL">
              <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
                placeholder="https://..." className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
            </Field>
            {logoUrl && (
              <div className="flex items-center gap-3 p-3 rounded-lg"
                style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)' }}>
                <img src={logoUrl} alt="logo preview" className="w-10 h-10 rounded-lg object-cover" />
                <p className="text-xs text-brand-muted">로고 미리보기</p>
              </div>
            )}
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
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          등록
        </button>
      </div>
    </div>
  )
}
