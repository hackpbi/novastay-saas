'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Trash2, Save, Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHotel } from '@/contexts/HotelContext'

// ── Types ─────────────────────────────────────────────────────────────────────

// c07_occ_tier_bar / c08_dday_decay 은 아직 코드베이스에 타입이 없어 로컬 셰이프로 관리.
// _key 는 React key 용 클라이언트 전용 필드 (저장 시 제거).
type TierRow  = { _key: string; id?: string; tier_name: string; occ_min: any; occ_max: any; base_bar: any }
type DecayRow = { _key: string; id?: string; tier_name: string; dday_min: any; dday_max: any; up_factor: any; down_factor: any; strategy: string }

// ── Style helpers (기존 CodeManagementPage 패턴과 동일) ──────────────────────────

const cellCls   = 'w-full rounded-md bg-bg-tertiary text-sm px-2.5 py-2 focus:outline-none transition-all'
const cellStyle = { color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' } as const

const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.border    = '1px solid var(--color-accent-primary)'
  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
}
const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.border    = '1px solid var(--color-border-default)'
  e.currentTarget.style.boxShadow = 'none'
}

const numOrNull = (v: any) => (v === '' || v === null || v === undefined ? null : Number(v))

// ── Reusable pieces ─────────────────────────────────────────────────────────────

function SectionCard({ title, desc, children, footer }: {
  title:   string
  desc:    React.ReactNode
  children: React.ReactNode
  footer?:  React.ReactNode
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}>
      <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
        <p className="text-xs text-brand-muted mt-0.5">{desc}</p>
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer && (
        <div className="flex items-center justify-end gap-2 px-6 py-4"
          style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          {footer}
        </div>
      )}
    </div>
  )
}

function CellInput({ value, onChange, type = 'text', placeholder, step, min, max }: {
  value:    any
  onChange: (v: string) => void
  type?:    'text' | 'number'
  placeholder?: string
  step?: string
  min?:  string
  max?:  string
}) {
  return (
    <input
      type={type}
      value={value ?? ''}
      placeholder={placeholder}
      step={step}
      min={min}
      max={max}
      onChange={e => onChange(e.target.value)}
      className={cellCls}
      style={cellStyle}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  )
}

// 숫자만 추출 후 천단위 콤마 포맷
function formatNumber(val: string): string {
  const num = val.replace(/[^0-9]/g, '')
  return num ? Number(num).toLocaleString() : ''
}

function AddRowButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
      style={{ border: '1px dashed var(--color-border-accent)', color: 'var(--color-accent-primary)' }}>
      <Plus size={14} />{label}
    </button>
  )
}

function DeleteRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="p-1.5 rounded-lg text-brand-dimmed transition-all"
      style={{ border: '1px solid transparent' }}
      onMouseEnter={e => {
        e.currentTarget.style.border     = '1px solid var(--negative-border)'
        e.currentTarget.style.background = 'var(--negative-bg)'
        e.currentTarget.style.color      = '#FC8181'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.border     = '1px solid transparent'
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color      = ''
      }}>
      <Trash2 size={13} />
    </button>
  )
}

function SaveButton({ onClick, saving, disabled }: { onClick: () => void; saving: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={saving || disabled}
      className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all"
      style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}저장
    </button>
  )
}

function Th({ children, w }: { children: React.ReactNode; w?: number }) {
  return (
    <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-brand-muted uppercase tracking-wider"
      style={w ? { width: w } : undefined}>
      {children}
    </th>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BarRecommendationPage() {
  const router          = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  // ── 권한 체크 (super_admin 전용) ──────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return
    if (!profile || profile.role !== 'super_admin') router.replace('/')
  }, [authLoading, profile, router])

  const isSuperAdmin = profile?.role === 'super_admin'

  // ── State ─────────────────────────────────────────────────────────────────────
  const [tiers,        setTiers]        = useState<TierRow[]>([])
  const [minBar,       setMinBar]       = useState<string>('90,000')   // 최소 금액(로컬 state, DB 미연동)
  const [decays,       setDecays]       = useState<DecayRow[]>([])
  const [loadingData,  setLoadingData]  = useState(false)
  const [savingTiers,  setSavingTiers]  = useState(false)
  const [savingDecays, setSavingDecays] = useState(false)
  const [savingParams, setSavingParams] = useState(false)
  const [toast,        setToast]        = useState<string | null>(null)

  // 기본 파라미터 — 전용 저장 테이블이 지정되지 않아 로컬 상태로만 관리.
  const [baseCoef,   setBaseCoef]   = useState('0.5')
  const [capPct,     setCapPct]     = useState('30')
  const [surgePct,   setSurgePct]   = useState('20')

  const keySeq = useRef(0)
  const nextKey = () => `row_${keySeq.current++}`

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  // ── 선택 호텔의 c07 / c08 로드 ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!hotelId) return
    setLoadingData(true)

    const [tierRes, decayRes, configRes] = await Promise.all([
      (supabase as any)
        .from('c07_occ_tier_bar')
        .select('*')
        .eq('hotel_id', hotelId)
        .order('occ_min', { ascending: false }),
      (supabase as any)
        .from('c08_dday_decay')
        .select('*')
        .eq('hotel_id', hotelId)
        .order('dday_min', { ascending: false }),
      (supabase as any)
        .from('c09_bar_recommendation_config')
        .select('default_mult, cap_pct, pickup_threshold')
        .eq('hotel_id', hotelId)
        .single(),
    ])

    setTiers((tierRes.data ?? []).map((t: any) => ({
      _key: nextKey(), id: t.id, tier_name: t.tier_name ?? '',
      occ_min: t.occ_min ?? '', occ_max: t.occ_max ?? '',
      base_bar: t.base_bar == null ? '' : Number(t.base_bar).toLocaleString(), // DB(원) 그대로 · 천단위 콤마
    })))
    setDecays((decayRes.data ?? []).map((d: any) => ({
      _key: nextKey(), id: d.id, tier_name: d.tier_name ?? '',
      dday_min: d.dday_min ?? '', dday_max: d.dday_max ?? '',
      up_factor:   d.up_rate != null ? Math.round(Number(d.up_rate) * 10000) / 100 : '',   // DB up_rate(0~1) → 화면(%)
      down_factor: d.dn_rate != null ? Math.round(Number(d.dn_rate) * 10000) / 100 : '',   // DB dn_rate(0~1) → 화면(%)
      strategy: d.strategy ?? '',
    })))

    const config = configRes.data
    if (config) {
      setBaseCoef(config.default_mult == null ? '' : String(config.default_mult))
      setCapPct(config.cap_pct == null ? '' : String(config.cap_pct))
      setSurgePct(config.pickup_threshold == null ? '' : String(config.pickup_threshold))
    }
    setLoadingData(false)
  }, [hotelId])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Row 편집 헬퍼 ─────────────────────────────────────────────────────────────
  const updTier  = (key: string, field: keyof TierRow,  value: any) =>
    setTiers(prev => prev.map(r => (r._key === key ? { ...r, [field]: value } : r)))
  const updDecay = (key: string, field: keyof DecayRow, value: any) =>
    setDecays(prev => prev.map(r => (r._key === key ? { ...r, [field]: value } : r)))

  const addTier  = () => setTiers(prev => [...prev, { _key: nextKey(), tier_name: '', occ_min: '', occ_max: '', base_bar: '' }])
  const addDecay = () => setDecays(prev => [...prev, { _key: nextKey(), tier_name: '', dday_min: '', dday_max: '', up_factor: '', down_factor: '', strategy: '' }])

  const delTier  = (key: string) => setTiers(prev => prev.filter(r => r._key !== key))
  const delDecay = (key: string) => setDecays(prev => prev.filter(r => r._key !== key))

  // ── 저장 (upsert) ─────────────────────────────────────────────────────────────
  // NOTE: onConflict 는 자연키(occ_min/occ_max · dday_min/dday_max) 기준. 구간 경계를
  //       수정하면 새 행이 생성될 수 있으므로 경계 변경 시에는 기존 행 삭제 후 추가 권장.
  async function saveTiers() {
    if (!hotelId) return
    // 최소 금액 미만 입력 차단
    const minBarNum = Number(minBar.replace(/,/g, '')) || 0
    const hasBelow = tiers.some(t =>
      t.base_bar !== '' && t.base_bar != null &&
      Number(String(t.base_bar).replace(/,/g, '')) < minBarNum
    )
    if (hasBelow) { showToast(`기준 BAR는 최소 금액(${minBar}원) 이상이어야 합니다.`); return }
    setSavingTiers(true)
    const payload = tiers.map(t => ({
      hotel_id: hotelId,
      label:    t.tier_name,
      occ_min:  numOrNull(t.occ_min),
      occ_max:  numOrNull(t.occ_max),
      base_bar: t.base_bar === '' || t.base_bar == null ? null : Number(String(t.base_bar).replace(/,/g, '')), // DB 원 단위 그대로 저장(콤마 제거)
    }))
    const { error } = await (supabase as any)
      .from('c07_occ_tier_bar')
      .upsert(payload, { onConflict: 'hotel_id,occ_min,occ_max' })
    setSavingTiers(false)
    if (error) { showToast(`저장 실패: ${error.message}`); return }
    showToast('OCC 구간이 저장되었습니다')
    fetchData()
  }

  async function saveDecays() {
    if (!hotelId) return
    setSavingDecays(true)
    const payload = decays.map(d => ({
      hotel_id: hotelId,
      dday_min: numOrNull(d.dday_min),
      dday_max: numOrNull(d.dday_max),
      up_rate:  Math.min(1, Math.max(0, Math.round((Number(d.up_factor) / 100) * 100) / 100)),   // 화면(%) → DB(0~1)
      dn_rate:  Math.min(1, Math.max(0, Math.round((Number(d.down_factor) / 100) * 100) / 100)),   // 화면(%) → DB(0~1)
      strategy: d.strategy,
    }))
    const { error } = await (supabase as any)
      .from('c08_dday_decay')
      .upsert(payload, { onConflict: 'hotel_id,dday_min,dday_max' })
    setSavingDecays(false)
    if (error) { showToast(`저장 실패: ${error.message}`); return }
    showToast('D-Day 감쇠율이 저장되었습니다')
    fetchData()
  }

  async function saveParams() {
    if (!hotelId) return
    setSavingParams(true)
    const { error } = await (supabase as any)
      .from('c09_bar_recommendation_config')
      .upsert(
        {
          hotel_id:          hotelId,
          default_mult:      numOrNull(baseCoef),
          cap_pct:           numOrNull(capPct),
          pickup_threshold:  numOrNull(surgePct),
        },
        { onConflict: 'hotel_id' }
      )
    setSavingParams(false)
    if (error) { showToast(`저장 실패: ${error.message}`); return }
    showToast('기본 파라미터가 저장되었습니다')
  }

  // ── Guard render ──────────────────────────────────────────────────────────────
  if (authLoading || !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center py-24 text-brand-muted">
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.push('/settings')}
          className="mt-1 p-2 rounded-lg text-brand-muted hover:text-brand-text transition-colors"
          style={{ border: '1px solid var(--color-border-default)' }}>
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            BAR 추천 설정
          </h1>
          <p className="text-sm text-brand-muted mt-0.5">OCC 구간별 기준 BAR · D-Day 감쇠율 관리</p>
        </div>
      </div>

      {/* 섹션 1 — OCC 구간별 기준 BAR */}
      <SectionCard
        title="OCC 구간별 기준 BAR"
        desc={
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span>OCC 점유율 구간에 따른 기준 BAR(원)을 설정합니다.</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
              이하 금액 입력 금지:
              <input
                type="text"
                value={minBar}
                onChange={e => setMinBar(formatNumber(e.target.value))}
                style={{ width: 90, textAlign: 'right', padding: '2px 6px', borderRadius: 6, border: '1px solid var(--color-border-default)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', fontSize: 12 }}
              />
              원
            </span>
          </span>
        }
        footer={<SaveButton onClick={saveTiers} saving={savingTiers} disabled={!hotelId} />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <Th>구간명</Th>
                <Th w={140}>OCC 하한(%)</Th>
                <Th w={140}>OCC 상한(%)</Th>
                <Th w={140}>기준 BAR(원)</Th>
                <Th w={48}>{''}</Th>
              </tr>
            </thead>
            <tbody>
              {tiers.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-sm text-brand-muted">
                  구간이 없습니다. 아래 버튼으로 추가하세요.
                </td></tr>
              ) : tiers.map(t => (
                <tr key={t._key}>
                  <td className="px-2 py-1.5"><CellInput value={t.tier_name} onChange={v => updTier(t._key, 'tier_name', v)} placeholder="예: 성수기" /></td>
                  <td className="px-2 py-1.5"><CellInput type="number" value={t.occ_min}  onChange={v => updTier(t._key, 'occ_min', v)} /></td>
                  <td className="px-2 py-1.5"><CellInput type="number" value={t.occ_max}  onChange={v => updTier(t._key, 'occ_max', v)} /></td>
                  <td className="px-2 py-1.5"><CellInput type="text" value={t.base_bar} onChange={v => updTier(t._key, 'base_bar', formatNumber(v))} /></td>
                  <td className="px-2 py-1.5 text-center"><DeleteRowButton onClick={() => delTier(t._key)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3"><AddRowButton onClick={addTier} label="구간 추가" /></div>
      </SectionCard>

      {/* 섹션 2 — D-Day 감쇠율 */}
      <SectionCard
        title="D-Day 감쇠율"
        desc="투숙일까지 남은 일수 구간별 인상/인하 계수와 전략을 설정합니다."
        footer={<SaveButton onClick={saveDecays} saving={savingDecays} disabled={!hotelId} />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <Th>구간명</Th>
                <Th w={120}>D-Day 하한</Th>
                <Th w={120}>D-Day 상한</Th>
                <Th w={110}>인상 계수(%)</Th>
                <Th w={110}>인하 계수(%)</Th>
                <Th>전략 설명</Th>
                <Th w={48}>{''}</Th>
              </tr>
            </thead>
            <tbody>
              {decays.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-brand-muted">
                  구간이 없습니다. 아래 버튼으로 추가하세요.
                </td></tr>
              ) : decays.map(d => (
                <tr key={d._key}>
                  <td className="px-2 py-1.5"><CellInput value={d.tier_name}   onChange={v => updDecay(d._key, 'tier_name', v)} placeholder="예: 임박" /></td>
                  <td className="px-2 py-1.5"><CellInput type="number" value={d.dday_min}    onChange={v => updDecay(d._key, 'dday_min', v)} /></td>
                  <td className="px-2 py-1.5"><CellInput type="number" value={d.dday_max}    onChange={v => updDecay(d._key, 'dday_max', v)} /></td>
                  <td className="px-2 py-1.5"><CellInput type="number" step="1" min="0" max="100" value={d.up_factor}   onChange={v => updDecay(d._key, 'up_factor', v)} /></td>
                  <td className="px-2 py-1.5"><CellInput type="number" step="1" min="0" max="100" value={d.down_factor} onChange={v => updDecay(d._key, 'down_factor', v)} /></td>
                  <td className="px-2 py-1.5"><CellInput value={d.strategy}    onChange={v => updDecay(d._key, 'strategy', v)} placeholder="전략 메모" /></td>
                  <td className="px-2 py-1.5 text-center"><DeleteRowButton onClick={() => delDecay(d._key)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3"><AddRowButton onClick={addDecay} label="구간 추가" /></div>
      </SectionCard>

      {/* 섹션 3 — 기본 파라미터 */}
      <SectionCard
        title="기본 파라미터"
        desc="BAR 추천 로직에 사용되는 기본 계수를 설정합니다."
        footer={<SaveButton onClick={saveParams} saving={savingParams} disabled={!hotelId} />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1.5">기본 계수</label>
            <CellInput type="number" value={baseCoef} onChange={setBaseCoef} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1.5">상한/하한 (%)</label>
            <CellInput type="number" value={capPct} onChange={setCapPct} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-muted mb-1.5">픽업 급증 임계값 (%)</label>
            <CellInput type="number" value={surgePct} onChange={setSurgePct} />
          </div>
        </div>
      </SectionCard>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium animate-fade-in"
          style={{
            background: 'var(--color-bg-elevated)',
            border:     '1px solid var(--color-border-accent)',
            color:      'var(--color-text-primary)',
            boxShadow:  'var(--shadow-elevated)',
          }}>
          {toast}
        </div>
      )}
    </div>
  )
}
