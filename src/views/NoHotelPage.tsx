'use client'

import { useRouter } from 'next/navigation'
import { AlertTriangle, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function NoHotelPage() {
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg-primary px-4">

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-12">
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

      {/* 내용 */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center mb-2">
          <AlertTriangle size={48} className="text-status-warning" />
        </div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          소속된 호텔이 없습니다
        </h1>
        <p className="text-sm text-brand-muted max-w-sm">
          관리자에게 호텔 배정을 요청해주세요.<br />
          배정이 완료되면 다시 로그인해주세요.
        </p>
      </div>

      {/* 로그아웃 */}
      <button
        onClick={handleLogout}
        className="mt-10 flex items-center gap-2 rounded-full py-2.5 px-6 text-sm font-semibold transition-all hover:-translate-y-0.5"
        style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)', color: 'var(--color-negative)' }}
      >
        <LogOut size={15} />
        로그아웃
      </button>
    </div>
  )
}
