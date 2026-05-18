'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHotel } from '@/contexts/HotelContext'
import LoadingScreen from '@/components/LoadingScreen'
import DataUploadContent from '@/components/DataUploadContent'

export default function UploadOnlyPage() {
  const router               = useRouter()
  const { profile, loading } = useAuth()
  const { currentHotel }     = useHotel()

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role !== 'upload') router.push('/dashboard')
  }, [profile, loading, router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return <LoadingScreen progress={50} message="로딩 중..." />
  if (!profile || profile.role !== 'upload') return null

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>

      {/* ── 헤더 ── */}
      <header className="flex items-center justify-between px-6 py-3"
        style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-secondary)' }}>
        <div className="flex items-center gap-3">
          {/* 로고 */}
          <img
            src="/zenith-logo-only.png"
            alt="Zenith Optima"
            style={{ width: 28, height: 28, objectFit: 'contain' }}
          />
          <span className="font-semibold text-sm tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            Zenith <span style={{ color: 'var(--color-accent-primary)' }}>Optima</span>
          </span>

          <span className="text-brand-dimmed mx-1">|</span>

          <span className="text-sm text-brand-muted">
            {currentHotel?.hotel_name ?? '호텔'}
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-brand-muted hover:text-status-negative transition-colors px-3 py-1.5 rounded-lg"
          style={{ border: '1px solid var(--color-border-default)' }}>
          <LogOut size={13} />
          로그아웃
        </button>
      </header>

      {/* ── 콘텐츠 ── */}
      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            데이터 업로드
          </h1>
          <p className="text-sm text-brand-muted mt-0.5">Actual 및 OTB 데이터를 업로드합니다.</p>
        </div>

        <DataUploadContent
          hotelId={currentHotel?.id ?? ''}
          showBulkUpload={false}
        />
      </main>
    </div>
  )
}
