// ── NovaStay 다국어(i18n) — react-i18next + Supabase(c18_translations) + localStorage 캐싱 ──
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { supabase } from '@/lib/supabase'

const CACHE_KEY   = 'novastay_i18n_cache'
const LANG_KEY    = 'novastay_lang'
const FALLBACK_LNG = 'ko'
const DEFAULT_NS   = 'translation'

// c18_translations 행: namespace + lang + key + value (+ updated_at)
type TransRow = { namespace: string; lang: string; key: string; value: string | null; updated_at?: string | null }
// lang → namespace → key → value
type Bundles = Record<string, Record<string, Record<string, string>>>
interface CacheShape { data: Bundles; cachedAt: string }

const isBrowser = typeof window !== 'undefined'

// ── 행 → 번들 그룹핑 + 최신 updated_at 추출 ──
function groupRows(rows: TransRow[]): { bundles: Bundles; latest: string } {
  const bundles: Bundles = {}
  let latest = ''
  for (const r of rows) {
    if (!r || !r.lang || !r.namespace || !r.key) continue
    const byLang = (bundles[r.lang] ??= {})
    const byNs   = (byLang[r.namespace] ??= {})
    byNs[r.key] = r.value ?? ''
    if (r.updated_at && r.updated_at > latest) latest = r.updated_at
  }
  return { bundles, latest }
}

// ── 번들을 i18next에 등록 (deep merge + overwrite) ──
function registerBundles(bundles: Bundles): void {
  for (const lang of Object.keys(bundles)) {
    for (const ns of Object.keys(bundles[lang])) {
      i18n.addResourceBundle(lang, ns, bundles[lang][ns], true, true)
    }
  }
}

// ── localStorage 캐시 read/write ──
function readCache(): CacheShape | null {
  if (!isBrowser) return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as CacheShape) : null
  } catch {
    return null
  }
}
function writeCache(cache: CacheShape): void {
  if (!isBrowser) return
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* 저장 실패(용량 등)는 무시 — 캐시 없이 동작 */
  }
}

// ── DB 전체 fetch ──
async function fetchAll(): Promise<{ bundles: Bundles; latest: string }> {
  const { data, error } = await (supabase as any)
    .from('c18_translations')
    .select('namespace, lang, key, value, updated_at')
  if (error) throw error
  return groupRows((data ?? []) as TransRow[])
}

// ── DB 최신 updated_at 1건 조회 (백그라운드 최신성 체크) ──
async function fetchLatestUpdatedAt(): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from('c18_translations')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error || !data) return null
  const row = Array.isArray(data) ? data[0] : data
  return (row?.updated_at as string | undefined) ?? null
}

// ── 초기 언어: localStorage('novastay_lang') → 폴백(ko) ──
const initialLng =
  (isBrowser && window.localStorage.getItem(LANG_KEY)) || FALLBACK_LNG

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: initialLng,
    fallbackLng: FALLBACK_LNG,
    defaultNS: DEFAULT_NS,
    resources: {},
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANG_KEY,
      caches: ['localStorage'],
    },
    react: { useSuspense: false },
  })

// ── 캐시 즉시 사용 → 백그라운드 최신성 확인 후 갱신 ──
async function loadTranslations(): Promise<void> {
  const cache = readCache()

  // 1) 캐시 있으면 즉시 등록해 바로 사용
  if (cache?.data) registerBundles(cache.data)

  try {
    if (cache?.cachedAt) {
      // 2) 백그라운드: DB 최신 updated_at이 캐시보다 최신이면 전체 재fetch
      const latest = await fetchLatestUpdatedAt()
      if (latest && latest > cache.cachedAt) {
        const { bundles, latest: newLatest } = await fetchAll()
        registerBundles(bundles)
        writeCache({ data: bundles, cachedAt: newLatest || latest })
      }
    } else {
      // 3) 캐시 없음: 전체 fetch 후 캐시 저장
      const { bundles, latest } = await fetchAll()
      registerBundles(bundles)
      writeCache({ data: bundles, cachedAt: latest || new Date().toISOString() })
    }
  } catch (err) {
    // 네트워크/DB 실패 시 캐시(있으면)로 동작
    // eslint-disable-next-line no-console
    console.warn('[i18n] 번역 로드 실패 — 캐시로 동작:', err)
  }
}

if (isBrowser) void loadTranslations()

export default i18n
