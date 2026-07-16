'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'

export default function LanguageToggle() {
  const { lang, toggleLanguage } = useLanguage()
  // 언어값은 클라이언트(localStorage/i18n)에서만 결정 → 마운트 후에만 라벨 렌더 (SSR 하이드레이션 불일치 방지)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const label = mounted ? (lang?.startsWith('ko') ? 'KO' : 'EN') : ''

  return (
    <button
      onClick={toggleLanguage}
      suppressHydrationWarning
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: '#00E5A0',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        minWidth: 18,   // 라벨 로드 전 폭 유지 (레이아웃 점프 방지)
      }}
    >
      {label}
    </button>
  )
}
