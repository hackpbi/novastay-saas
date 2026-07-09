import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

// 지원 언어 (확장 가능) — 필요 시 union에 추가
export type AppLang = 'ko' | 'en' | 'ja' | 'zh'

const LANG_KEY = 'novastay_lang'

/**
 * 현재 언어 상태 + 변경 헬퍼.
 * - toggleLanguage: ko ↔ en 토글
 * - changeLanguage(lang): 특정 언어로 변경 + localStorage('novastay_lang') 저장
 * - 초기 로드 시 localStorage에서 언어 복원 (i18n LanguageDetector가 처리)
 */
export function useLanguage() {
  const { i18n } = useTranslation()
  const [lang, setLang] = useState<AppLang>((i18n.language as AppLang) || 'ko')

  useEffect(() => {
    const onChanged = (l: string) => setLang(l as AppLang)
    i18n.on('languageChanged', onChanged)
    return () => { i18n.off('languageChanged', onChanged) }
  }, [i18n])

  const changeLanguage = useCallback((next: string) => {
    void i18n.changeLanguage(next)
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(LANG_KEY, next) } catch { /* 저장 실패 무시 */ }
    }
  }, [i18n])

  const toggleLanguage = useCallback(() => {
    changeLanguage(i18n.language === 'ko' ? 'en' : 'ko')
  }, [i18n, changeLanguage])

  return { lang, changeLanguage, toggleLanguage }
}
