'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import i18n from '@/i18n'

// c18_translations 행 (namespace / key / lang / value)
type Row = { namespace: string; key: string; lang: string; value: string | null }
// (namespace, key)별 ko/en 병합 엔트리
type Entry = { namespace: string; key: string; ko: string; en: string }

const I18N_CACHE_KEY = 'novastay_i18n_cache'
const MINT = '#00E5A0'

export default function TranslationsPage() {
  const { profile } = useAuth()
  const role = (profile as any)?.role as string | undefined

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [nsFilter, setNsFilter] = useState<string>('전체')
  const [search, setSearch] = useState('')
  const [untranslatedOnly, setUntranslatedOnly] = useState(false)

  // 인라인 편집 상태
  const [editKey, setEditKey] = useState<string | null>(null)   // `${ns}|||${key}`
  const [editKo, setEditKo] = useState('')
  const [editEn, setEditEn] = useState('')
  const [saving, setSaving] = useState(false)

  // 신규 키 추가 폼
  const [newNs, setNewNs] = useState('common')
  const [newKey, setNewKey] = useState('')
  const [newKo, setNewKo] = useState('')
  const [newEn, setNewEn] = useState('')

  const loadRows = useCallback(async () => {
    setLoading(true)
    const { data } = await (supabase as any)
      .from('c18_translations')
      .select('namespace, key, lang, value')
    setRows((data ?? []) as Row[])
    setLoading(false)
  }, [])

  useEffect(() => { void loadRows() }, [loadRows])

  // (namespace, key) → { ko, en } 병합
  const entries = useMemo(() => {
    const map = new Map<string, Entry>()
    for (const r of rows) {
      if (!r?.namespace || !r?.key) continue
      const k = `${r.namespace}|||${r.key}`
      const e = map.get(k) ?? { namespace: r.namespace, key: r.key, ko: '', en: '' }
      if (r.lang === 'ko') e.ko = r.value ?? ''
      else if (r.lang === 'en') e.en = r.value ?? ''
      map.set(k, e)
    }
    return Array.from(map.values()).sort((a, b) =>
      a.namespace === b.namespace ? a.key.localeCompare(b.key) : a.namespace.localeCompare(b.namespace))
  }, [rows])

  const namespaces = useMemo(
    () => Array.from(new Set(entries.map(e => e.namespace))).sort(),
    [entries])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return entries.filter(e =>
      (nsFilter === '전체' || e.namespace === nsFilter) &&
      (!s || e.key.toLowerCase().includes(s) || e.ko.toLowerCase().includes(s) || e.en.toLowerCase().includes(s)) &&
      (!untranslatedOnly || !e.en.trim()),
    )
  }, [entries, nsFilter, search, untranslatedOnly])

  // ── 저장 (upsert ko/en) + 캐시 삭제 + i18n 즉시 반영 ──
  const saveEntry = useCallback(async (namespace: string, key: string, ko: string, en: string): Promise<boolean> => {
    if (!namespace.trim() || !key.trim()) { alert('namespace와 key는 필수입니다.'); return false }
    setSaving(true)
    const now = new Date().toISOString()
    const payload = [
      { namespace: namespace.trim(), key: key.trim(), lang: 'ko', value: ko, updated_at: now },
      { namespace: namespace.trim(), key: key.trim(), lang: 'en', value: en, updated_at: now },
    ]
    const { error } = await (supabase as any)
      .from('c18_translations')
      .upsert(payload, { onConflict: 'namespace,key,lang', ignoreDuplicates: false })
    setSaving(false)
    if (error) { alert(`저장 실패: ${error.message}`); return false }

    // 캐시 삭제 → i18n 즉시 재반영
    try { localStorage.removeItem(I18N_CACHE_KEY) } catch { /* noop */ }
    i18n.addResourceBundle('ko', namespace.trim(), { [key.trim()]: ko }, true, true)
    i18n.addResourceBundle('en', namespace.trim(), { [key.trim()]: en }, true, true)
    await loadRows()
    return true
  }, [loadRows])

  const startEdit = (e: Entry) => {
    setEditKey(`${e.namespace}|||${e.key}`)
    setEditKo(e.ko)
    setEditEn(e.en)
  }

  const handleAddKey = async () => {
    const ok = await saveEntry(newNs, newKey, newKo, newEn)
    if (ok) { setNewKey(''); setNewKo(''); setNewEn('') }
  }

  // ── 접근 권한: super_admin만 ──
  if (!profile) {
    return <div style={{ padding: 40, color: '#888', background: '#000000', minHeight: '100vh' }}>로딩 중…</div>
  }
  if (role !== 'super_admin') {
    return (
      <div style={{ padding: 40, background: '#000000', minHeight: '100vh', color: '#fff' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>접근 불가</h1>
        <p style={{ fontSize: 13, color: '#888' }}>이 페이지는 super_admin 권한만 접근할 수 있습니다.</p>
      </div>
    )
  }

  // ── 공통 스타일 ──
  const inputStyle: React.CSSProperties = {
    background: '#111', border: '1px solid #2a2a2a', borderRadius: 6, color: '#fff',
    fontSize: 12, padding: '6px 8px', outline: 'none', width: '100%',
  }
  const btn = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${active ? MINT : '#333'}`,
    background: active ? 'rgba(0,229,160,0.12)' : 'transparent',
    color: active ? MINT : '#888',
  })
  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 500, color: '#666', borderBottom: '1px solid #222' }
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12, color: '#ddd', borderBottom: '1px solid #161616', verticalAlign: 'top' }
  const actionBtn: React.CSSProperties = { padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }

  return (
    <div style={{ color: '#fff' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>번역 관리</h1>
      <p style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>c18_translations · namespace / key / KO / EN</p>

      {/* 상단 컨트롤 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        {/* namespace 필터 칩 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['전체', ...namespaces].map(ns => (
            <button key={ns} onClick={() => setNsFilter(ns)} style={btn(nsFilter === ns)}>{ns}</button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 12 }} />
        {/* 검색 */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="key 또는 텍스트 검색"
          style={{ ...inputStyle, width: 220 }}
        />
        {/* 미번역 토글 */}
        <button onClick={() => setUntranslatedOnly(v => !v)} style={btn(untranslatedOnly)}>
          미번역만
        </button>
      </div>

      {/* 테이블 */}
      <div style={{ border: '1px solid #1c1c1c', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 110 }}>NS</th>
              <th style={{ ...th, width: 220 }}>KEY</th>
              <th style={th}>KO</th>
              <th style={th}>EN</th>
              <th style={{ ...th, width: 130, textAlign: 'right' }}>수정</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#666' }}>로딩 중…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#666' }}>표시할 항목이 없습니다.</td></tr>
            ) : filtered.map(e => {
              const rowKey = `${e.namespace}|||${e.key}`
              const editing = editKey === rowKey
              return (
                <tr key={rowKey} style={{ background: editing ? 'rgba(0,229,160,0.04)' : 'transparent' }}>
                  <td style={td}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#161616', border: '1px solid #262626', color: '#8fb' }}>{e.namespace}</span>
                  </td>
                  <td style={{ ...td, color: '#aaa', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{e.key}</td>
                  {editing ? (
                    <>
                      <td style={td}><input value={editKo} onChange={ev => setEditKo(ev.target.value)} style={inputStyle} /></td>
                      <td style={td}><input value={editEn} onChange={ev => setEditEn(ev.target.value)} style={inputStyle} /></td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={async () => { const ok = await saveEntry(e.namespace, e.key, editKo, editEn); if (ok) setEditKey(null) }}
                          disabled={saving}
                          style={{ ...actionBtn, background: MINT, color: '#0a0a0a', marginRight: 6, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
                        >{saving ? '저장…' : '저장'}</button>
                        <button onClick={() => setEditKey(null)} style={{ ...actionBtn, background: 'transparent', color: '#888', border: '1px solid #333' }}>취소</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={td}>{e.ko || <span style={{ color: '#555' }}>—</span>}</td>
                      <td style={td}>{e.en || <span style={{ color: '#E24B4A' }}>미번역</span>}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button onClick={() => startEdit(e)} style={{ ...actionBtn, background: '#1a1a1a', color: '#ccc', border: '1px solid #2a2a2a' }}>수정</button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 신규 키 추가 */}
      <div style={{ marginTop: 20, border: '1px solid #1c1c1c', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>키 추가</div>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 200px 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
          <input value={newNs} onChange={e => setNewNs(e.target.value)} placeholder="namespace" style={inputStyle} />
          <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="key" style={{ ...inputStyle, fontFamily: 'monospace' }} />
          <input value={newKo} onChange={e => setNewKo(e.target.value)} placeholder="KO" style={inputStyle} />
          <input value={newEn} onChange={e => setNewEn(e.target.value)} placeholder="EN" style={inputStyle} />
          <button
            onClick={handleAddKey}
            disabled={saving || !newKey.trim()}
            style={{ ...actionBtn, background: MINT, color: '#0a0a0a', padding: '6px 14px', opacity: (saving || !newKey.trim()) ? 0.5 : 1, cursor: (saving || !newKey.trim()) ? 'not-allowed' : 'pointer' }}
          >저장</button>
        </div>
        <p style={{ fontSize: 11, color: '#555', marginTop: 8 }}>저장 시 ko/en 두 행을 upsert(namespace+key+lang)하고 번역 캐시를 갱신합니다.</p>
      </div>
    </div>
  )
}
