'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isDevMode } from '../lib/supabase'
import type { Profile } from '../types/supabase'

interface AuthContextValue {
  user:    User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  isDevMode: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user:      null,
  session:   null,
  profile:   null,
  loading:   true,
  isDevMode: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // 프로필 조회
  async function fetchProfile(userId: string) {
    const { data } = await (supabase as any)
      .from('m01_profiles')
      .select('*')
      .eq('auth_user_id', userId)
      .single()
    if (data) setProfile(data as Profile)
  }

  useEffect(() => {
    // 초기 세션 복원
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) fetchProfile(session.user.id)
      setLoading(false)
    })

    // 세션 변경 구독 (로그인 / 로그아웃 / 토큰 갱신)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (session?.user) fetchProfile(session.user.id)
        else setProfile(null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user:      session?.user ?? null,
        session,
        profile,
        loading,
        isDevMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
