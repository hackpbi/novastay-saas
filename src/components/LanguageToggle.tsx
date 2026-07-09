'use client'

import { useLanguage } from '@/hooks/useLanguage'

export default function LanguageToggle() {
  const { lang, toggleLanguage } = useLanguage()
  const label = lang?.startsWith('ko') ? 'KO' : 'EN'

  return (
    <button
      onClick={toggleLanguage}
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: '#00E5A0',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {label}
    </button>
  )
}
