'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useHotel, type CurrentHotel } from '@/contexts/HotelContext'

export default function SelectHotelPage() {
  const router = useRouter()
  const { hotels, loading, switchHotel } = useHotel()

  useEffect(() => {
    if (loading) return
    if (hotels.length === 0) { router.replace('/no-hotel'); return }
    if (hotels.length === 1) { switchHotel(hotels[0].id); router.replace('/dashboard') }
  }, [hotels, loading, switchHotel, router])

  function handleSelect(hotel: CurrentHotel) {
    switchHotel(hotel.id)
    router.push('/dashboard')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="w-9 h-9 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--color-accent-primary)', borderTopColor: 'transparent' }} />
          <p className="text-sm text-brand-muted">호텔 목록을 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg-primary px-4 py-12">

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-10">
        <div className="w-9 h-9 rounded-lg bg-gradient-cta flex items-center justify-center shadow-accent-glow">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 22V12h6v10" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="font-semibold text-xl tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          Nova<span className="text-gradient-accent">Stay</span>
        </span>
      </div>

      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          접속할 호텔을 선택하세요
        </h1>
        <p className="text-sm text-brand-muted">소속된 호텔 중 하나를 선택하여 시작하세요.</p>
      </div>

      {/* Hotel cards */}
      <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-4">
        {hotels.map(hotel => (
          <button
            key={hotel.id}
            onClick={() => handleSelect(hotel)}
            className="text-left cursor-pointer rounded-xl p-5 transition-all duration-200 hover:-translate-y-1 focus:outline-none"
            style={{
              background: 'var(--color-bg-secondary)',
              border:     '1px solid var(--color-border-default)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.border    = '1px solid var(--color-accent-primary)'
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.border    = '1px solid var(--color-border-default)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            {/* 아이콘 */}
            <div className="w-12 h-12 rounded-xl mb-4 flex items-center justify-center"
              style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
              {hotel.logo_url ? (
                <img src={hotel.logo_url} alt={hotel.hotel_name} className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <Building2 size={24} className="text-accent-primary" />
              )}
            </div>

            {/* 호텔명 */}
            <p className="font-semibold text-base mb-1" style={{ color: 'var(--color-text-primary)' }}>
              {hotel.hotel_name}
            </p>

            {/* 도시 + 별점 */}
            <p className="text-sm text-brand-muted mb-3">
              {[hotel.city, hotel.star_rating ? `★${hotel.star_rating}` : null]
                .filter(Boolean).join(' · ') || '위치 정보 없음'}
            </p>

            {/* 역할 배지 */}
            <span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize"
              style={{ background: 'var(--accent-badge-bg)', color: 'var(--color-accent-primary)', border: '1px solid var(--accent-badge-border)' }}>
              {hotel.role.replace('_', ' ')}
            </span>
          </button>
        ))}
      </div>

      {/* 로그아웃 */}
      <button
        onClick={handleLogout}
        className="mt-10 flex items-center gap-1.5 text-sm text-brand-muted hover:text-status-negative transition-colors"
      >
        <LogOut size={14} />
        로그아웃
      </button>
    </div>
  )
}
