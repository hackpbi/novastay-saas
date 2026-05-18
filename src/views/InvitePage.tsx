'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function InvitePage() {
  const router = useRouter()
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [showCf,    setShowCf]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [checking,   setChecking]   = useState(true)
  const [userName,   setUserName]   = useState('')

  useEffect(() => {
    const hash = window.location.hash

    if (hash && hash.includes('access_token')) {
      // URL 해시에서 토큰 직접 파싱 → 세션 설정
      const params       = new URLSearchParams(hash.substring(1))
      const accessToken  = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ data }) => {
            if (data.session) {
              setHasSession(true)
              setUserName(data.session.user.user_metadata?.name ?? '')
            }
            setChecking(false)
          })
          .catch(() => setChecking(false))
      } else {
        setChecking(false)
      }
    } else {
      // 해시 없음 → 기존 세션 확인
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setHasSession(true)
          setUserName(session.user.user_metadata?.name ?? '')
        }
        setChecking(false)
      })
    }
  }, [])

  const inputStyle = {
    color:      'var(--color-text-primary)',
    border:     '1px solid var(--color-border-default)',
    caretColor: 'var(--color-accent-primary)',
  }
  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.border    = '1px solid var(--color-accent-primary)'
    e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.border    = '1px solid var(--color-border-default)'
    e.currentTarget.style.boxShadow = 'none'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return }
    if (password !== confirm) { setError('비밀번호가 일치하지 않습니다.'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) { setError(error.message); return }

    setSuccess(true)
    setTimeout(() => router.push('/dashboard'), 2500)
  }

  const EyeIcon = ({ open }: { open: boolean }) => open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-[380px] animate-slide-up">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
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

        {/* Title */}
        <div className="text-center mb-7">
          <h2 className="text-2xl font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            {checking ? '초대 확인 중...' : hasSession ? `환영합니다${userName ? ', ' + userName : ''}!` : '초대 링크 오류'}
          </h2>
          <p className="text-sm text-brand-muted">
            {checking ? '' : hasSession ? 'NovaStay 비밀번호를 설정해주세요.' : '링크가 만료되었거나 이미 사용된 링크입니다.'}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-bg-secondary p-8"
          style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>

          {checking ? (
            <div className="flex items-center justify-center py-8 gap-2 text-brand-muted">
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
              </svg>
              <span className="text-sm">초대 링크 확인 중...</span>
            </div>
          ) : !hasSession ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
                style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="var(--color-negative)" strokeWidth="2" />
                  <path d="M12 8v4M12 16h.01" stroke="var(--color-negative)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm text-brand-muted">관리자에게 새 초대 링크를 요청해주세요.</p>
              <button onClick={() => router.push('/login')}
                className="text-sm font-medium transition-colors"
                style={{ color: 'var(--color-accent-primary)' }}>
                로그인 페이지로 이동
              </button>
            </div>
          ) : success ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
                style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="var(--color-accent-primary)" strokeWidth="2" />
                  <path d="M9 12l2 2 4-4" stroke="var(--color-accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                비밀번호 설정 완료!
              </p>
              <p className="text-xs text-brand-muted">잠시 후 대시보드로 이동합니다...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2.5 rounded-lg px-4 py-3"
                  style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
                  <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="var(--color-negative)" strokeWidth="2" />
                    <path d="M12 8v4M12 16h.01" stroke="var(--color-negative)" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p className="text-sm text-status-negative">{error}</p>
                </div>
              )}

              {/* 비밀번호 */}
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1.5">비밀번호 설정</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="8자 이상 입력"
                    required
                    className="w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 pr-10 focus:outline-none transition-all"
                    style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-subtle hover:text-brand-muted transition-colors">
                    <EyeIcon open={showPw} />
                  </button>
                </div>
                {password && (
                  <div className="mt-1.5 flex gap-1 items-center">
                    {[1,2,3].map(i => (
                      <div key={i} className="h-1 flex-1 rounded-full transition-colors"
                        style={{ background: password.length >= i * 4 ? i === 1 ? 'var(--color-negative)' : i === 2 ? 'var(--color-warning)' : 'var(--color-accent-primary)' : 'var(--color-border-default)' }} />
                    ))}
                    <span className="text-[10px] text-brand-dimmed ml-1">
                      {password.length < 4 ? '약함' : password.length < 8 ? '보통' : '강함'}
                    </span>
                  </div>
                )}
              </div>

              {/* 확인 */}
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1.5">비밀번호 확인</label>
                <div className="relative">
                  <input
                    type={showCf ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="비밀번호 재입력"
                    required
                    className="w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 pr-10 focus:outline-none transition-all"
                    style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                  />
                  <button type="button" onClick={() => setShowCf(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-subtle hover:text-brand-muted transition-colors">
                    <EyeIcon open={showCf} />
                  </button>
                </div>
                {confirm && (
                  <p className={`mt-1 text-[11px] ${password === confirm ? 'text-status-positive' : 'text-status-negative'}`}>
                    {password === confirm ? '✓ 비밀번호가 일치합니다.' : '비밀번호가 일치하지 않습니다.'}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5"
                style={{ background: 'var(--gradient-cta)', boxShadow: loading ? 'none' : 'var(--accent-btn-glow)', color: '#0A0A0A' }}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2 justify-center">
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                    </svg>
                    설정 중...
                  </span>
                ) : '시작하기'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
