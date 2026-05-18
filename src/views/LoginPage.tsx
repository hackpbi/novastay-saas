'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingScreen from '@/components/LoadingScreen'

type AuthMode = 'login' | 'forgot-password'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode]               = useState<AuthMode>('login')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [message, setMessage]         = useState<string | null>(null)
  const [isLoading,        setIsLoading]        = useState(false)
  const [loadingProgress,  setLoadingProgress]  = useState(0)
  const [loadingMessage,   setLoadingMessage]   = useState('')

  const ERROR_MAP: Record<string, string> = {
    'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'Email not confirmed':       '이메일 인증이 완료되지 않았습니다.',
    'Too many requests':         '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.',
    'User not found':            '존재하지 않는 계정입니다.',
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setIsLoading(true)

    try {
      // Step 1. Supabase Auth 로그인
      setLoadingProgress(20)
      setLoadingMessage('로그인 확인 중...')
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw authError

      // Step 2. m01_profiles 조회 (id + role + is_active 확인)
      setLoadingProgress(45)
      setLoadingMessage('프로필 불러오는 중...')
      const { data: profile, error: profileError } = await (supabase as any)
        .from('m01_profiles')
        .select('id, role, is_active, name')
        .eq('auth_user_id', data.user.id)
        .single()

      if (profileError) throw new Error('프로필 정보를 찾을 수 없습니다.')
      if (!profile.is_active) throw new Error('비활성화된 계정입니다. 관리자에게 문의하세요.')

      // last_login_at 업데이트
      await (supabase as any)
        .from('m01_profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', profile.id)

      // Step 3. 호텔 조회
      setLoadingProgress(70)
      setLoadingMessage('호텔 정보 확인 중...')

      // Step 4. 완료 후 리다이렉트
      if (profile.role === 'super_admin' || profile.role === 'admin') {
        setLoadingProgress(100)
        setLoadingMessage('완료!')
        await new Promise(resolve => setTimeout(resolve, 400))
        router.push('/hotels')
      } else if (profile.role === 'upload') {
        // upload 전용 → 소속 호텔 저장 후 /upload로 이동
        const { data: uploadHotel } = await (supabase as any)
          .from('m10_profile_hotels')
          .select('hotel_id')
          .eq('profile_id', profile.id)
          .eq('is_active', true)
          .limit(1)
          .single()
        if (uploadHotel && typeof window !== 'undefined') {
          localStorage.setItem('currentHotelId', uploadHotel.hotel_id)
        }
        setLoadingProgress(100)
        setLoadingMessage('완료!')
        await new Promise(resolve => setTimeout(resolve, 400))
        router.push('/upload')
      } else {
        // 소속 호텔 조회
        const { data: myHotels } = await (supabase as any)
          .from('m10_profile_hotels')
          .select('hotel_id')
          .eq('profile_id', profile.id)
          .eq('is_active', true)

        setLoadingProgress(100)
        setLoadingMessage('완료!')
        await new Promise(resolve => setTimeout(resolve, 400))

        if (!myHotels || myHotels.length === 0) {
          router.push('/no-hotel')
        } else if (myHotels.length === 1) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('currentHotelId', myHotels[0].hotel_id)
          }
          router.push('/dashboard')
        } else {
          router.push('/select-hotel')
        }
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
      setError(ERROR_MAP[msg] ?? msg)
      setIsLoading(false)
      setLoadingProgress(0)
      setLoadingMessage('')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) setError(error.message)
    else setMessage('비밀번호 재설정 링크를 이메일로 발송했습니다.')
    setLoading(false)
  }

  function resetForm() { setError(null); setMessage(null); setPassword('') }

  return (
    <div className="min-h-screen flex bg-bg-primary">
      {isLoading && <LoadingScreen progress={loadingProgress} message={loadingMessage} />}

      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-12 overflow-hidden">

        {/* Panel glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'var(--panel-glow-left)' }}
        />
        {/* Grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: 'var(--grid-pattern)',
            backgroundSize:  '48px 48px',
          }}
        />
        {/* Right edge separator */}
        <div
          className="pointer-events-none absolute right-0 inset-y-0 w-px"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--color-border-default), transparent)' }}
        />

        {/* Logo */}
        <div className="relative">
          <div className="inline-flex items-center gap-2.5">
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
        </div>

        {/* Main copy */}
        <div className="relative space-y-10">
          <div className="space-y-4">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1"
              style={{ border: '1px solid var(--accent-badge-border)', background: 'var(--accent-badge-bg)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" />
              <span className="text-xs font-medium text-accent-primary tracking-wide">Revenue Management System</span>
            </div>

            <h1 className="text-4xl font-bold leading-[1.15] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              숙박 수익을{' '}
              <span className="text-gradient-accent">최대화</span>하는
              <br />
              스마트 RMS 플랫폼
            </h1>
            <p className="text-base text-brand-muted leading-relaxed max-w-sm">
              AI 기반 요금 최적화와 실시간 시장 분석으로
              <br />
              경쟁력 있는 가격 전략을 자동으로 수립합니다.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-3">
            {[
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
                title: '실시간 수요 예측',
                desc:  '머신러닝 기반 점유율 및 RevPAR 예측',
              },
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" /><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
                title: '자동 요금 조정',
                desc:  '경쟁사 가격과 시장 상황에 따른 동적 가격 설정',
              },
              {
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
                title: '채널 통합 관리',
                desc:  'OTA·직판 채널 통합 대시보드로 수익 극대화',
              },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3.5">
                <div
                  className="mt-0.5 shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-accent-primary"
                  style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}
                >
                  {item.icon}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.title}</p>
                  <p className="text-xs text-brand-muted mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="relative">
          <div className="grid grid-cols-3 gap-4">
            {[
              { value: '32%',    label: '평균 수익 증가' },
              { value: '2,400+', label: '연동 숙박 시설' },
              { value: '99.9%',  label: '서비스 가동률' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl bg-bg-secondary px-4 py-3"
                style={{ border: '1px solid var(--color-border-default)' }}
              >
                <p className="font-mono text-lg font-semibold text-accent-primary">{stat.value}</p>
                <p className="text-xs text-brand-muted mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right login panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-12">
        {/* Panel glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'var(--panel-glow-right)' }}
        />

        {/* Mobile logo */}
        <div className="lg:hidden mb-8 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-cta flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 22V12h6v10" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-semibold text-xl tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            Nova<span className="text-gradient-accent">Stay</span>
          </span>
        </div>

        <div className="relative w-full max-w-[380px] animate-slide-up">
          {/* Heading */}
          <div className="mb-7 text-center">
            {mode === 'login' ? (
              <>
                <h2 className="text-2xl font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>다시 오셨군요</h2>
                <p className="text-sm text-brand-muted">계정에 로그인하여 계속하세요</p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>비밀번호 재설정</h2>
                <p className="text-sm text-brand-muted">가입한 이메일로 재설정 링크를 발송합니다</p>
              </>
            )}
          </div>

          {/* Card */}
          <div
            className="rounded-2xl bg-bg-secondary p-8"
            style={{
              border:     '1px solid var(--color-border-default)',
              boxShadow:  'var(--shadow-elevated)',
            }}
          >
            {/* Error alert */}
            {error && (
              <div
                className="mb-5 flex items-start gap-2.5 rounded-lg px-4 py-3"
                style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}
              >
                <svg className="mt-0.5 shrink-0 text-status-negative" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <p className="text-sm text-status-negative">{error}</p>
              </div>
            )}
            {/* Success alert */}
            {message && (
              <div
                className="mb-5 flex items-start gap-2.5 rounded-lg px-4 py-3"
                style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}
              >
                <svg className="mt-0.5 shrink-0 text-accent-primary" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-sm text-accent-primary">{message}</p>
              </div>
            )}

            <form onSubmit={mode === 'login' ? handleLogin : handleForgotPassword} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1.5" htmlFor="email">이메일</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 transition-all duration-200 focus:outline-none"
                  style={{
                    color:       'var(--color-text-primary)',
                    border:      '1px solid var(--color-border-default)',
                    caretColor:  'var(--color-accent-primary)',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.border = '1px solid var(--color-accent-primary)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.border = '1px solid var(--color-border-default)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              {/* Password */}
              {mode === 'login' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-brand-muted" htmlFor="password">비밀번호</label>
                    <button
                      type="button"
                      onClick={() => { resetForm(); setMode('forgot-password') }}
                      className="text-xs text-brand-muted hover:text-accent-primary transition-colors duration-200"
                    >
                      비밀번호를 잊으셨나요?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 pr-10 transition-all duration-200 focus:outline-none"
                      style={{
                        color:      'var(--color-text-primary)',
                        border:     '1px solid var(--color-border-default)',
                        caretColor: 'var(--color-accent-primary)',
                      }}
                      onFocus={e => {
                        e.currentTarget.style.border = '1px solid var(--color-accent-primary)'
                        e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
                      }}
                      onBlur={e => {
                        e.currentTarget.style.border = '1px solid var(--color-border-default)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-subtle hover:text-brand-muted transition-colors duration-200"
                      aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                    >
                      {showPassword ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  background: 'var(--gradient-cta)',
                  boxShadow:  loading ? 'none' : 'var(--accent-btn-glow)',
                  color:      '#0A0A0A',
                }}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2 justify-center">
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4" strokeDashoffset="10" />
                    </svg>
                    처리 중...
                  </span>
                ) : mode === 'login' ? '로그인' : '재설정 링크 발송'}
              </button>
            </form>

            {/* Footer */}
            <div className="mt-5 text-center">
              {mode === 'login' ? null : (
                <button
                  type="button"
                  onClick={() => { resetForm(); setMode('login') }}
                  className="inline-flex items-center gap-1.5 text-xs text-brand-muted hover:text-accent-primary transition-colors duration-200"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  로그인으로 돌아가기
                </button>
              )}
            </div>
          </div>

          {/* Terms */}
          <p className="mt-6 text-center text-xs text-brand-dimmed">
            로그인 시{' '}
            <a href="/terms" className="hover:text-brand-muted transition-colors duration-200 underline underline-offset-2">이용약관</a>{' '}
            및{' '}
            <a href="/privacy" className="hover:text-brand-muted transition-colors duration-200 underline underline-offset-2">개인정보처리방침</a>
            에 동의하게 됩니다
          </p>
        </div>
      </div>
    </div>
  )
}
