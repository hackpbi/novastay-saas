'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, ChevronDown, X, Save, Tag, Loader2, Send,
  CheckSquare, Square, TrendingUp, TrendingDown,
  Minus, Activity, Trash2, FileSpreadsheet,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { FormDatePicker } from '@/components/DatePicker'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import PageShell from '@/components/PageShell'
import SegmentationModal from '@/components/dashboard/SegmentationModal'
import { PromoCalendarView } from '@/components/rate-strategy/PromoCalendarView'
import { RateCalendarView }  from '@/components/rate-strategy/RateCalendarView'

// ── Types ─────────────────────────────────────────────────────────────────────

type StrategyStatus = 'draft' | 'active' | 'inactive'
type DiscountType   = 'pct' | 'amount' | 'fixed' | 'addon'
type ChangeMode     = '%' | '+-' | 'direct'
type PickupView     = 'total' | 'fit' | 'fit_grp'
type RateTab        = 'list' | 'promo-cal' | 'rate-cal'

interface Strategy {
  id:          string
  hotel_id:    string
  name:        string
  description: string | null
  sale_start:  string | null
  sale_end:    string | null
  stay_start:  string
  stay_end:    string
  status:      StrategyStatus
  created_by:  string | null
  updated_by:  string | null
  created_at:  string
  updated_at:  string
}

interface RateDetail {
  id:             string
  hotel_id:       string
  strategy_id:    string
  room_type_code: string
  date_type:      string
  stay_date:      string
  stay_start:     string | null
  stay_end:       string | null
  rack_rate:      number | null
  new_rate:       number | null
  diff:           number | null
  diff_pct:       number | null
  memo:           string | null
}

interface Promotion {
  id:             string
  hotel_id:       string
  strategy_id:    string
  name:           string
  room_type_code: string | null
  discount_type:  DiscountType
  discount_value: number
  stay_start:     string | null
  stay_end:       string | null
  status:         string
}

interface RoomType {
  room_type_code:        string
  room_type_description: string
  no_rooms:              number | null
  surcharge:             number | null
}

interface OtbRow {
  business_date: string
  room_type_code: string
  nights:        number
  status?:       string | null
}

interface CalendarEvent {
  date:       string
  event:      string | null
  is_holiday: boolean
}

interface RateHistory {
  stay_date:      string
  room_type_code: string
  rack_rate:      number
  uploaded_at:    string
}

interface RatePackage {
  id:          string
  hotel_id:    string
  strategy_id: string
  name:        string
  description: string | null
  add_on_rate: number
  status:      string
  sort_order:  number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('ko-KR')

const fmtShort = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n)

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  let y = sy, m = sm, d = sd
  while (true) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    dates.push(dateStr)
    if (y === ey && m === em && d === ed) break
    const next = new Date(y, m - 1, d + 1)  // 로컬 시간 기준 다음날
    y = next.getFullYear()
    m = next.getMonth() + 1
    d = next.getDate()
  }
  return dates
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const getDow = (d: string) => DAY_LABELS[new Date(d + 'T00:00:00').getDay()]
const getDayNum = (d: string) => new Date(d + 'T00:00:00').getDay()
const isWeekend = (d: string) => { const w = getDayNum(d); return w === 5 || w === 6 }

function endOfMonthStr(dateStr: string): string {
  const [year, month] = dateStr.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}
const getKSTEndOfMonth = endOfMonthStr

function getKSTDateString(): string {
  const now  = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  const kst   = new Date(utcMs + 9 * 60 * 60000)
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}-${String(kst.getDate()).padStart(2, '0')}`
}

function calcNewRate(rack: number, mode: ChangeMode, val: number): number {
  if (mode === '%')      return Math.round(rack * (1 + val / 100))
  if (mode === '+-')     return rack + val
  if (mode === 'direct') return val
  return rack
}

function rgb2hex(r: number, g: number, b: number) {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function pctColor(pct: number | null) {
  if (pct == null || Math.abs(pct) < 0.01) return 'var(--color-text-muted)'
  return pct > 0 ? '#00B883' : '#E24B4A'
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StrategyStatus }) {
  const m = {
    active:   { label: '활성',  color: '#00A86B', bg: 'rgba(0,168,107,0.12)' },
    draft:    { label: '초안',  color: '#F6AD55', bg: 'rgba(246,173,85,0.12)' },
    inactive: { label: '비활성', color: '#888',    bg: 'var(--color-bg-tertiary)' },
  }[status]
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color: m.color, background: m.bg }}>{m.label}</span>
  )
}

function ModeToggle({ modes, value, onChange }: {
  modes: ChangeMode[]
  value: ChangeMode
  onChange: (m: ChangeMode) => void
}) {
  return (
    <div className="flex gap-0.5 mt-0.5">
      {modes.map(m => (
        <button key={m} onClick={() => onChange(m)}
          className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
          style={{
            background: value === m ? 'var(--color-accent-primary)' : 'var(--color-bg-tertiary)',
            color:      value === m ? '#0A0A0A' : 'var(--color-text-muted)',
            border:     '1px solid var(--color-border-default)',
          }}>
          {m}
        </button>
      ))}
    </div>
  )
}

function OccBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-brand-muted">—</span>
  const w = Math.min(100, Math.max(0, pct))
  const color = pct >= 80 ? '#00B883' : pct >= 60 ? '#F6AD55' : '#E24B4A'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-tertiary)' }}>
        <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <span className="text-xs font-mono" style={{ color }}>{pct.toFixed(0)}%</span>
    </div>
  )
}

// ── PackageItem ────────────────────────────────────────────────────────────────

interface PackageItem {
  id:   string
  name: string
  rate: number | null
}

// ── StrategyModal ──────────────────────────────────────────────────────────────

function StrategyModal({ hotelId, profileId, onClose, onCreated }: {
  hotelId: string; profileId: string
  onClose: () => void; onCreated: (s: Strategy) => void
}) {
  const [form, setForm] = useState({
    name: '', description: '',
    sale_start: '', sale_end: '',
    stay_start: '', stay_end: '',
  })
  const [stayUnlimited, setStayUnlimited] = useState(false)
  const [saleUnlimited, setSaleUnlimited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm outline-none'
  const inputStyle = { background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }

  async function submit() {
    if (!form.name.trim()) { setErr('전략 이름은 필수입니다.'); return }
    if (!stayUnlimited) {
      if (!form.stay_start) { setErr('투숙 시작일은 필수입니다.'); return }
      if (!form.stay_end)   { setErr('투숙 종료일은 필수입니다.'); return }
      if (form.stay_end < form.stay_start) { setErr('투숙 종료일은 시작일 이후여야 합니다.'); return }
    }
    if (!saleUnlimited && form.sale_start && form.sale_end && form.sale_end < form.sale_start) {
      setErr('판매 종료일은 판매 시작일 이후여야 합니다.'); return
    }
    setSaving(true); setErr(null)
    try {
      const { data: strategy, error } = await (supabase as any)
        .from('s01_rate_strategy')
        .insert({
          hotel_id:    hotelId,
          name:        form.name.trim(),
          description: form.description || null,
          stay_start:  stayUnlimited ? null : form.stay_start,
          stay_end:    stayUnlimited ? null : form.stay_end,
          sale_start:  saleUnlimited ? null : (form.sale_start || null),
          sale_end:    saleUnlimited ? null : (form.sale_end   || null),
          status:      'draft',
          created_by:  profileId,
          updated_by:  profileId,
        })
        .select().single()
      if (error) throw error
      onCreated(strategy)
    } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>전략 생성</p>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto max-h-[75vh]">
          {err && <p className="text-xs text-status-negative px-3 py-2 rounded-lg" style={{ background: 'var(--negative-bg)' }}>{err}</p>}
          <div>
            <label className="text-xs text-brand-muted mb-1 block">전략 이름 *</label>
            <input className={inputCls} style={inputStyle} value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="예: 여름 성수기 전략" />
          </div>
          <div>
            <label className="text-xs text-brand-muted mb-1 block">설명</label>
            <textarea className={inputCls} style={inputStyle} rows={2}
              value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          {/* 투숙 기간 */}
          <div>
            <div className="grid grid-cols-2 gap-2" style={{ opacity: stayUnlimited ? 0.4 : 1, pointerEvents: stayUnlimited ? 'none' : undefined }}>
              <div>
                <label className="text-xs text-brand-muted mb-1 block">투숙 시작{!stayUnlimited && ' *'}</label>
                <FormDatePicker value={form.stay_start} onChange={v => set('stay_start', v)} placeholder="날짜 선택" />
              </div>
              <div>
                <label className="text-xs text-brand-muted mb-1 block">투숙 종료{!stayUnlimited && ' *'}</label>
                <FormDatePicker value={form.stay_end} onChange={v => set('stay_end', v)} placeholder="날짜 선택" />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6, cursor: 'pointer', color: stayUnlimited ? '#00E5A0' : 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={stayUnlimited} style={{ accentColor: '#00E5A0', cursor: 'pointer' }}
                onChange={e => { setStayUnlimited(e.target.checked); if (e.target.checked) { set('stay_start', ''); set('stay_end', '') } }} />
              기간제한 없음
            </label>
          </div>
          {/* 판매 기간 */}
          <div>
            <div className="grid grid-cols-2 gap-2" style={{ opacity: saleUnlimited ? 0.4 : 1, pointerEvents: saleUnlimited ? 'none' : undefined }}>
              <div>
                <label className="text-xs text-brand-muted mb-1 block">판매 시작</label>
                <FormDatePicker value={form.sale_start} onChange={v => set('sale_start', v)} placeholder="날짜 선택" />
              </div>
              <div>
                <label className="text-xs text-brand-muted mb-1 block">판매 종료</label>
                <FormDatePicker value={form.sale_end} onChange={v => set('sale_end', v)} placeholder="날짜 선택" />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6, cursor: 'pointer', color: saleUnlimited ? '#00E5A0' : 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={saleUnlimited} style={{ accentColor: '#00E5A0', cursor: 'pointer' }}
                onChange={e => { setSaleUnlimited(e.target.checked); if (e.target.checked) { set('sale_start', ''); set('sale_end', '') } }} />
              기간제한 없음
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <button onClick={onClose} className="px-4 py-2 text-xs text-brand-muted">취소</button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}생성
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PromotionModal ─────────────────────────────────────────────────────────────

function PromotionModal({ hotelId, strategyId, profileId, roomTypes, onClose, onCreated }: {
  hotelId: string; strategyId: string; profileId: string
  roomTypes: RoomType[]; onClose: () => void; onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '', description: '',
    discount_type: 'pct' as DiscountType, discount_value: '',
    stay_start: '', stay_end: '',
    sale_start: '', sale_end: '',
    status: 'active',
  })
  const [roomTypeCodes,  setRoomTypeCodes]  = useState<string[]>([])
  const [rtOpen,         setRtOpen]         = useState(false)
  const [minStay,        setMinStay]        = useState<number | null>(null)
  const [maxStay,        setMaxStay]        = useState<number | null>(null)
  const [stayUnlimited,  setStayUnlimited]  = useState(false)
  const [saleUnlimited,  setSaleUnlimited]  = useState(false)
  const [packages,       setPackages]       = useState<PackageItem[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const addPkg    = () => setPackages(prev => [...prev, { id: crypto.randomUUID(), name: '', rate: null }])
  const removePkg = (id: string) => setPackages(prev => prev.filter(p => p.id !== id))
  const updatePkg = (id: string, key: keyof PackageItem, value: any) =>
    setPackages(prev => prev.map(p => p.id === id ? { ...p, [key]: value } : p))
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm outline-none'
  const inputStyle = { background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }

  async function submit() {
    if (!form.name.trim()) { setErr('프로모션 이름은 필수입니다.'); return }
    if (!form.discount_value || Number(form.discount_value) < 0) { setErr('할인값은 0 이상 숫자여야 합니다.'); return }
    if (minStay !== null && maxStay !== null && maxStay < minStay) { setErr('최대 연박은 최소 연박 이상이어야 합니다.'); return }
    if (!stayUnlimited && form.stay_start && form.stay_end && form.stay_end < form.stay_start) { setErr('투숙 종료일은 시작일 이후여야 합니다.'); return }
    setSaving(true); setErr(null)
    try {
      const { data: promo, error } = await (supabase as any)
        .from('s03_rate_promotion')
        .insert({
          hotel_id:        hotelId,
          strategy_id:     strategyId,
          name:            form.name.trim(),
          description:     form.description || null,
          room_type_codes: roomTypeCodes.length === 0 ? null : roomTypeCodes,
          min_stay:        minStay,
          max_stay:        maxStay,
          discount_type:   form.discount_type,
          discount_value:  Number(form.discount_value),
          stay_start:      stayUnlimited ? null : (form.stay_start || null),
          stay_end:        stayUnlimited ? null : (form.stay_end   || null),
          sale_start:      saleUnlimited ? null : (form.sale_start || null),
          sale_end:        saleUnlimited ? null : (form.sale_end   || null),
          status:          form.status,
        })
        .select('id').single()
      if (error) throw error

      // 패키지 insert (할인 방식 무관)
      const validPkgs = packages.filter(p => p.name.trim())
      if (validPkgs.length > 0) {
        const { error: pkgErr } = await (supabase as any)
          .from('s04_rate_package')
          .insert(validPkgs.map((p, i) => ({
            hotel_id:    hotelId,
            strategy_id: strategyId,
            name:        p.name.trim(),
            add_on_rate: p.rate ?? 0,
            sort_order:  i,
            status:      'active',
          })))
        if (pkgErr) throw pkgErr
      }
      onCreated()
    } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>프로모션 추가</p>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto max-h-[75vh]">
          {err && <p className="text-xs text-status-negative px-3 py-2 rounded-lg" style={{ background: 'var(--negative-bg)' }}>{err}</p>}

          {/* 이름 / 설명 */}
          <div>
            <label className="text-xs text-brand-muted mb-1 block">프로모션 이름 *</label>
            <input className={inputCls} style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-brand-muted mb-1 block">설명</label>
            <textarea className={inputCls} style={inputStyle} rows={2}
              value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          {/* 객실 타입 다중 선택 */}
          <div>
            <label className="text-xs text-brand-muted mb-1 block">객실 타입</label>
            {!rtOpen ? (
              <div onClick={() => setRtOpen(true)} style={{
                border: '0.5px solid var(--color-border-default)', borderRadius: 6, padding: '6px 10px',
                minHeight: 32, cursor: 'pointer', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4,
                background: 'var(--color-bg-tertiary)',
              }}>
                {roomTypeCodes.length === 0
                  ? <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>전체 객실</span>
                  : roomTypeCodes.map(code => (
                      <span key={code} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,229,160,0.12)', color: '#00E5A0' }}>{code}</span>
                    ))
                }
              </div>
            ) : (
              <div tabIndex={-1} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setRtOpen(false) }}
                style={{ border: '0.5px solid var(--color-border-default)', borderRadius: 6, background: 'var(--color-bg-elevated)', outline: 'none' }}>
                <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {(() => {
                    const isAll = roomTypes.length > 0 && roomTypeCodes.length === roomTypes.length
                    return (
                      <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer"
                        style={{ borderBottom: '0.5px solid var(--color-border-default)', background: 'transparent', fontSize: 12, color: isAll ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <input type="checkbox" checked={isAll} style={{ accentColor: 'var(--color-accent-primary)', cursor: 'pointer' }}
                          onChange={() => setRoomTypeCodes(isAll ? [] : roomTypes.map(rt => rt.room_type_code))} />
                        전체
                      </label>
                    )
                  })()}
                  {roomTypes.map((rt, rtIdx) => {
                    const checked = roomTypeCodes.includes(rt.room_type_code)
                    return (
                      <label key={rt.room_type_code} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer"
                        style={{ borderBottom: rtIdx < roomTypes.length - 1 ? '0.5px solid var(--color-border-default)' : undefined, background: 'transparent', fontSize: 12, color: checked ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <input type="checkbox" checked={checked} style={{ accentColor: 'var(--color-accent-primary)', cursor: 'pointer' }}
                          onChange={() => setRoomTypeCodes(prev => checked ? prev.filter(c => c !== rt.room_type_code) : [...prev, rt.room_type_code])} />
                        {rt.room_type_code}
                      </label>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '5px 8px', borderTop: '0.5px solid var(--color-border-default)' }}>
                  <button onMouseDown={e => e.preventDefault()} onClick={() => setRtOpen(false)}
                    style={{ fontSize: 11, padding: '3px 12px', borderRadius: 4, background: 'var(--gradient-cta)', color: '#0A0A0A', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                    완료
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 최소/최대 연박 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-brand-muted mb-1 block">최소 연박</label>
              <input type="number" min={1} className={inputCls} style={inputStyle}
                value={minStay ?? ''} onChange={e => setMinStay(e.target.value ? Number(e.target.value) : null)} placeholder="예: 1" />
            </div>
            <div>
              <label className="text-xs text-brand-muted mb-1 block">최대 연박</label>
              <input type="number" min={1} className={inputCls} style={inputStyle}
                value={maxStay ?? ''} onChange={e => setMaxStay(e.target.value ? Number(e.target.value) : null)} placeholder="예: 7" />
            </div>
          </div>

          {/* 할인 방식 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-brand-muted mb-1 block">할인 방식 *</label>
              <select className={inputCls} style={inputStyle} value={form.discount_type} onChange={e => set('discount_type', e.target.value)}>
                <option value="pct">% 할인 (정률)</option>
                <option value="amount">금액 할인 (정액)</option>
                <option value="fixed">고정 요금</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-brand-muted mb-1 block">
                {form.discount_type === 'pct' ? '할인율 (%) *' : '할인값 *'}
              </label>
              <input type="number" className={inputCls} style={inputStyle}
                value={form.discount_value} onChange={e => set('discount_value', e.target.value)}
                placeholder={form.discount_type === 'pct' ? '예: 10' : '예: 50000'} />
            </div>
          </div>

          {/* 패키지 섹션 (항상 표시) */}
          <div style={{ borderTop: '0.5px solid var(--color-border-default)', paddingTop: 12 }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>패키지 (선택)</span>
              <button onClick={addPkg}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <Plus size={11} /> 패키지 추가
              </button>
            </div>
            <div className="space-y-2">
              {packages.map((pkg, idx) => (
                <div key={pkg.id} className="p-3 rounded-xl space-y-2"
                  style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>패키지 {idx + 1}</span>
                    <button onClick={() => removePkg(pkg.id)} className="p-1 rounded"
                      style={{ color: '#E24B4A', background: 'transparent' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(226,75,74,0.1)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] text-brand-muted mb-0.5 block">패키지명 *</label>
                    <input className="w-full rounded-lg outline-none"
                      style={{ ...inputStyle, fontSize: 12, padding: '6px 10px' }}
                      value={pkg.name} onChange={e => updatePkg(pkg.id, 'name', e.target.value)}
                      placeholder="예: 조식포함" />
                  </div>
                  <div>
                    <label className="text-[11px] text-brand-muted mb-0.5 block">금액 (원)</label>
                    <input type="number" min={0} className="w-full rounded-lg outline-none"
                      style={{ ...inputStyle, fontSize: 12, padding: '6px 10px' }}
                      value={pkg.rate ?? ''} onChange={e => updatePkg(pkg.id, 'rate', e.target.value ? Number(e.target.value) : null)}
                      placeholder="예: 30000" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 투숙 기간 */}
          <div>
            <div className="grid grid-cols-2 gap-2" style={{ opacity: stayUnlimited ? 0.4 : 1, pointerEvents: stayUnlimited ? 'none' : undefined }}>
              <div>
                <label className="text-xs text-brand-muted mb-1 block">투숙 시작</label>
                <FormDatePicker value={form.stay_start} onChange={v => set('stay_start', v)} placeholder="날짜 선택" />
              </div>
              <div>
                <label className="text-xs text-brand-muted mb-1 block">투숙 종료</label>
                <FormDatePicker value={form.stay_end} onChange={v => set('stay_end', v)} placeholder="날짜 선택" />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6, cursor: 'pointer', color: stayUnlimited ? '#00E5A0' : 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={stayUnlimited} style={{ accentColor: '#00E5A0', cursor: 'pointer' }}
                onChange={e => { setStayUnlimited(e.target.checked); if (e.target.checked) { set('stay_start', ''); set('stay_end', '') } }} />
              기간제한 없음
            </label>
          </div>

          {/* 판매 기간 */}
          <div>
            <div className="grid grid-cols-2 gap-2" style={{ opacity: saleUnlimited ? 0.4 : 1, pointerEvents: saleUnlimited ? 'none' : undefined }}>
              <div>
                <label className="text-xs text-brand-muted mb-1 block">판매 시작</label>
                <FormDatePicker value={form.sale_start} onChange={v => set('sale_start', v)} placeholder="날짜 선택" />
              </div>
              <div>
                <label className="text-xs text-brand-muted mb-1 block">판매 종료</label>
                <FormDatePicker value={form.sale_end} onChange={v => set('sale_end', v)} placeholder="날짜 선택" />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6, cursor: 'pointer', color: saleUnlimited ? '#00E5A0' : 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={saleUnlimited} style={{ accentColor: '#00E5A0', cursor: 'pointer' }}
                onChange={e => { setSaleUnlimited(e.target.checked); if (e.target.checked) { set('sale_start', ''); set('sale_end', '') } }} />
              기간제한 없음
            </label>
          </div>

        </div>
        <div className="flex items-center justify-between gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--color-border-default)' }}>
          {/* 상태 토글 */}
          <div style={{ display: 'inline-flex', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', border: '0.5px solid var(--color-border-secondary)' }}>
            {(['active', 'inactive'] as const).map(s => (
              <button key={s} onClick={() => set('status', s)}
                style={{
                  padding: '5px 16px', fontSize: 12, fontWeight: form.status === s ? 500 : 400,
                  background: form.status === s ? '#00E5A0' : 'transparent',
                  color: form.status === s ? '#04342C' : 'var(--color-text-secondary)',
                  border: 'none', cursor: 'pointer',
                  borderLeft: s === 'inactive' ? '0.5px solid var(--color-border-secondary)' : 'none',
                }}>
                {s === 'active' ? '활성' : '비활성'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs text-brand-muted">취소</button>
            <button onClick={submit} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Tag size={12} />}추가
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RateStrategyPage() {
  const { profile }      = useAuth()
  const { currentHotel } = useHotel()
  const { vsOtbDate }    = useDateContext()
  const queryClient      = useQueryClient()
  const hotelId          = currentHotel?.id ?? ''
  const profileId        = profile?.id ?? ''

  // ── Filter State ───────────────────────────────────────────────────────────
  const todayKST = getKSTDateString()
  const [otbDate,         setOtbDate]         = useState('')
  const [stayStart,       setStayStart]       = useState('')
  const [stayEnd,         setStayEnd]         = useState('')
  const [viewYear,        setViewYear]        = useState(Number(todayKST.slice(0, 4)))
  const [viewMonth,       setViewMonth]       = useState(Number(todayKST.slice(5, 7)))
  const [selRoomType,     setSelRoomType]     = useState('')
  const [strategyId,      setStrategyId]      = useState('')
  const [showAllTypes,    setShowAllTypes]    = useState(false)

  // ── UI State ───────────────────────────────────────────────────────────────
  const [showStratModal,  setShowStratModal]  = useState(false)
  const [showPromoModal,  setShowPromoModal]  = useState(false)
  const [selectedDates,   setSelectedDates]   = useState<string[]>([])
  const [bulkValue,       setBulkValue]       = useState('')
  const [bulkBaseValue,   setBulkBaseValue]   = useState('')
  const [uploadStatus,    setUploadStatus]    = useState<'idle' | 'parsing' | 'uploading' | 'done' | 'error'>('idle')
  const [uploadMsg,       setUploadMsg]       = useState<string | null>(null)
  const [uploadErrors,    setUploadErrors]    = useState<string[]>([])
  const [showErrorModal,  setShowErrorModal]  = useState(false)
  const [pendingRows,     setPendingRows]     = useState<{date: string; barRate: number}[]>([])
  const [editCell,        setEditCell]        = useState<{ date: string; rateCode: string; rt: string } | null>(null)
  const [editVal,         setEditVal]         = useState('')
  const [baseEditCell,    setBaseEditCell]    = useState<{ date: string; rt: string } | null>(null)
  const [baseEditVal,     setBaseEditVal]     = useState('')
  const [baseFlash,       setBaseFlash]       = useState<Record<string, 'saving' | 'success' | 'error'>>({})
  const [lastRpaTime,     setLastRpaTime]     = useState<string | null>(null)
  const [rpaSending,      setRpaSending]      = useState(false)
  const [segModalDate,    setSegModalDate]    = useState<string | null>(null)
  const [pickupView,      setPickupView]      = useState<PickupView>('fit')
  const [activeTab,       setActiveTab]       = useState<RateTab>('list')
  const [previewBuffer,   setPreviewBuffer]   = useState<Record<string, Record<string, number>>>({})
  const isPreviewMode = Object.keys(previewBuffer).length > 0

  // col mode: change / 2night / 3night / promoId
  const [colMode, setColMode] = useState<Record<string, ChangeMode>>({
    change: '%', '2night': '%', '3night': '%',
  })

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: otbDates = [] } = useQuery<string[]>({
    queryKey: ['r02_otb_dates', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_otb_dates', { p_hotel_id: hotelId })
      if (error) throw error
      return (data ?? []) as string[]
    },
    enabled: !!hotelId, staleTime: 5 * 60 * 1000,
  })

  useEffect(() => { if (otbDates.length > 0 && !otbDate) setOtbDate(otbDates[0]) }, [otbDates, otbDate])

  // OTB 기준일 확정 시 투숙기간 + viewYear/viewMonth 자동 설정
  useEffect(() => {
    if (otbDate) {
      setViewYear(Number(otbDate.slice(0, 4)))
      setViewMonth(Number(otbDate.slice(5, 7)))
      if (!stayStart) {
        setStayStart(otbDate)
        setStayEnd(endOfMonthStr(otbDate))
      }
    }
  }, [otbDate])

  const { data: roomTypes = [] } = useQuery<RoomType[]>({
    queryKey: ['c01_room_types', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c01_room_types')
        .select('room_type_code, room_type_description, no_rooms, surcharge')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
        .order('surcharge', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!hotelId, staleTime: 10 * 60 * 1000,
  })

  useEffect(() => { if (roomTypes.length > 0 && !selRoomType) setSelRoomType(roomTypes[0].room_type_code) }, [roomTypes, selRoomType])

  const { data: hotelDetail } = useQuery<{ room_count: number }>({
    queryKey: ['m03_hotel_details', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('m03_hotel_details').select('room_count').eq('hotel_id', hotelId).single()
      if (error) throw error
      return data
    },
    enabled: !!hotelId, staleTime: 10 * 60 * 1000,
  })
  const roomCount = hotelDetail?.room_count ?? 0

  const { data: strategies = [] } = useQuery<Strategy[]>({
    queryKey: ['s01_rate_strategy', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s01_rate_strategy').select('*').eq('hotel_id', hotelId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!hotelId, staleTime: 2 * 60 * 1000,
  })

  const currentStrategy = strategies.find(s => s.id === strategyId) ?? strategies[0] ?? null
  const effectiveStratId = currentStrategy?.id ?? ''
  useEffect(() => { if (strategies.length > 0 && !strategyId) setStrategyId(strategies[0].id) }, [strategies, strategyId])

  // 전략/월 변경 시 미리보기 버퍼 초기화 (데이터 혼선 방지)
  useEffect(() => { setPreviewBuffer({}) }, [effectiveStratId, viewYear, viewMonth])

  const { data: rateDetails = [], isLoading: ratesLoading } = useQuery<RateDetail[]>({
    queryKey: ['s02_rate_detail', hotelId, effectiveStratId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s02_rate_detail').select('*')
        .eq('hotel_id', hotelId).eq('strategy_id', effectiveStratId)
      if (error) throw error
      return data
    },
    enabled: !!effectiveStratId, staleTime: 60 * 1000,
  })

  const { data: promotions = [] } = useQuery<Promotion[]>({
    queryKey: ['s03_rate_promotion', hotelId, effectiveStratId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s03_rate_promotion').select('*')
        .eq('hotel_id', hotelId).eq('strategy_id', effectiveStratId).eq('status', 'active')
      if (error) throw error
      return data
    },
    enabled: !!effectiveStratId, staleTime: 60 * 1000,
  })

  const { data: ratePackages = [] } = useQuery<RatePackage[]>({
    queryKey: ['s04_rate_package', effectiveStratId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s04_rate_package').select('*')
        .eq('strategy_id', effectiveStratId).eq('status', 'active')
        .order('sort_order')
      if (error) throw error
      return data
    },
    enabled: !!effectiveStratId, staleTime: 60 * 1000,
  })

  // 테이블 표시 날짜 범위 (투숙기간 설정 시 우선, 없으면 viewYear/viewMonth 기준)
  const padM = String(viewMonth).padStart(2, '0')
  const tableStart = stayStart || `${viewYear}-${padM}-01`
  const tableEnd   = stayEnd   || getKSTEndOfMonth(`${viewYear}-${padM}-01`)

  // OCC + 픽업 데이터 (get_pickup_data RPC)
  // vsOtbDate 없으면 otbDate 를 fallback으로 사용 → pu_nights=0, otb_nights만 유효
  const minOtbDate = otbDates[otbDates.length - 1] ?? ''
  const { data: pickupRows = [] } = useQuery<{ business_date: string; otb_nights: number; pu_nights: number }[]>({
    queryKey: ['rate_strategy_pickup', hotelId, otbDate, vsOtbDate, tableStart, tableEnd],
    queryFn: async () => {
      if (!hotelId || !otbDate || !minOtbDate) return []
      const { data, error } = await (supabase as any)
        .rpc('get_pickup_data', {
          p_hotel_id:    hotelId,
          p_otb_date:    otbDate,
          p_vs_otb_date: vsOtbDate || otbDate,  // fallback: vs=base → pu_nights=0
          p_min_date:    minOtbDate,
        })
      if (error) throw error
      return (data ?? []).filter((r: any) =>
        !tableStart || !tableEnd || (r.business_date >= tableStart && r.business_date <= tableEnd)
      )
    },
    enabled: !!hotelId && !!otbDate && !!minOtbDate,
    staleTime: 5 * 60 * 1000,
  })

  // occMap: business_date → 합산 otb_nights / roomCount * 100
  const pickupOccMap = useMemo(() => {
    const nightsMap: Record<string, number> = {}
    for (const r of pickupRows) {
      nightsMap[r.business_date] = (nightsMap[r.business_date] ?? 0) + (r.otb_nights ?? 0)
    }
    return nightsMap
  }, [pickupRows])

  // pickupMap: business_date → 합산 pu_nights
  const pickupMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of pickupRows) {
      map[r.business_date] = (map[r.business_date] ?? 0) + ((r as any).pu_nights ?? 0)
    }
    return map
  }, [pickupRows])

  // segPickupMap: business_date → { fit: number; grp: number }
  // sorting2 실제값: 'fit', 'group'
  const segPickupMap = useMemo(() => {
    const map: Record<string, { fit: number; grp: number }> = {}
    for (const r of pickupRows as any[]) {
      const d   = r.business_date
      const seg = r.sorting2 as string | null
      const pu  = r.pu_nights ?? 0
      if (!map[d]) map[d] = { fit: 0, grp: 0 }
      if (seg === 'fit')   map[d].fit += pu
      if (seg === 'group') map[d].grp += pu
    }
    return map
  }, [pickupRows])

  const maxPickup = useMemo(() => {
    return Math.max(
      ...Object.values(segPickupMap).flatMap(v => [Math.abs(v.fit), Math.abs(v.grp)]),
      1,
    )
  }, [segPickupMap])

  // BAR Rate 업로드 이력 날짜 목록 (최근 4회)
  const { data: uploadDates = [] } = useQuery<string[]>({
    queryKey: ['bar-upload-dates', effectiveStratId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s02_rate_detail_history')
        .select('uploaded_at')
        .eq('strategy_id', effectiveStratId)
        .eq('date_type', 'base')
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      const distinct = [...new Set<string>((data ?? []).map((r: any) => r.uploaded_at as string))]
      return distinct.slice(0, 4)
    },
    enabled: !!effectiveStratId,
    staleTime: 60 * 1000,
  })

  // BAR Rate 이력 데이터 (stay_date × room_type_code × uploaded_at)
  const { data: historyRows = [] } = useQuery<RateHistory[]>({
    queryKey: ['bar-history', effectiveStratId, tableStart, tableEnd, uploadDates],
    queryFn: async () => {
      if (!uploadDates.length || !tableStart || !tableEnd) return []
      const { data, error } = await (supabase as any)
        .from('s02_rate_detail_history')
        .select('stay_date, room_type_code, rack_rate, uploaded_at')
        .eq('strategy_id', effectiveStratId)
        .eq('date_type', 'base')
        .gte('stay_date', tableStart)
        .lte('stay_date', tableEnd)
        .in('uploaded_at', uploadDates)
      if (error) throw error
      return data ?? []
    },
    enabled: !!effectiveStratId && uploadDates.length > 0 && !!tableStart && !!tableEnd,
    staleTime: 60 * 1000,
  })

  // 공휴일/이벤트
  const stayStartEff0 = tableStart
  const stayEndEff0   = tableEnd

  const { data: calendarEvents = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['c06_calendar', stayStartEff0, stayEndEff0],
    queryFn: async () => {
      if (!stayStartEff0 || !stayEndEff0) return []
      const { data, error } = await (supabase as any)
        .from('c06_calendar')
        .select('date, event, is_holiday')
        .gte('date', stayStartEff0)
        .lte('date', stayEndEff0)
        .not('event', 'is', null)
      if (error) throw error
      return data ?? []
    },
    enabled: !!stayStartEff0 && !!stayEndEff0,
    staleTime: 60 * 60 * 1000,
  })

  const stayStartEff = tableStart
  const stayEndEff   = tableEnd

  // ── Derived Data ────────────────────────────────────────────────────────────

  const dates = stayStartEff && stayEndEff ? getDateRange(stayStartEff, stayEndEff) : []
  const displayRTs = showAllTypes ? roomTypes : roomTypes.filter(rt => rt.room_type_code === selRoomType)

  // OCC map: date → occ% (get_pickup_data의 otb_nights 기반)
  const occMap = useMemo(() => {
    const map: Record<string, number> = {}
    if (!roomCount) return map
    for (const [d, nights] of Object.entries(pickupOccMap)) {
      map[d] = (nights / roomCount) * 100
    }
    return map
  }, [pickupOccMap, roomCount])

  // event map: date → CalendarEvent[] (event 빈값/null문자열 제외)
  const eventMap = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const ev of calendarEvents) {
      if (!ev.event || ev.event.trim() === '' || ev.event.toLowerCase() === 'null') continue
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    }
    return map
  }, [calendarEvents])

  // history map: `${stay_date}__${room_type_code}` → uploaded_at → rack_rate
  const historyMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const r of historyRows) {
      const k = `${r.stay_date}__${r.room_type_code}`
      if (!map[k]) map[k] = {}
      map[k][r.uploaded_at] = r.rack_rate
    }
    return map
  }, [historyRows])

  // D-3/D-2/D-1 날짜 목록 (uploadDates[1..3], 오래된 순)
  const histDates = useMemo(() => uploadDates.slice(1).slice(-3).reverse(), [uploadDates])

  // rate lookup
  const rateMap = useMemo(() => {
    const map: Record<string, RateDetail> = {}
    for (const r of rateDetails) {
      map[`${r.stay_date}__${r.room_type_code}__${r.date_type}`] = r
    }
    return map
  }, [rateDetails])

  const getRate = (date: string, rt: string, code: string) =>
    rateMap[`${date}__${rt}__${code}`]

  // summary stats
  const { up, down, flat, avgPct } = useMemo(() => {
    let up = 0, down = 0, flat = 0, sumPct = 0, cnt = 0
    for (const r of rateDetails) {
      if (r.date_type !== 'change') continue
      const rack = r.rack_rate ?? 0
      const newR = r.new_rate ?? 0
      if (!rack) { flat++; continue }
      const pct = (newR - rack) / rack * 100
      if (Math.abs(pct) < 0.01) flat++
      else if (pct > 0) up++
      else down++
      sumPct += pct; cnt++
    }
    return { up, down, flat, avgPct: cnt > 0 ? sumPct / cnt : 0 }
  }, [rateDetails])

  const avgOcc = useMemo(() => {
    const vals = Object.values(occMap)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }, [occMap])

  const avgAdr = null

  // ── Save Rate Cell ──────────────────────────────────────────────────────────

  const saveRateCell = useCallback(async (
    date: string, rt: string, dateType: string,
    mode: ChangeMode, val: string,
    rackRate: number | null
  ) => {
    const numVal = parseFloat(val.replace(/,/g, ''))
    if (isNaN(numVal) || !effectiveStratId) return
    const newRate = rackRate != null ? calcNewRate(rackRate, mode, numVal) : (mode === 'direct' ? numVal : null)
    const diff    = newRate != null && rackRate != null ? newRate - rackRate : null
    const diffPct = rackRate && diff != null ? (diff / rackRate) * 100 : null
    await (supabase as any)
      .from('s02_rate_detail')
      .upsert({
        hotel_id: hotelId, strategy_id: effectiveStratId,
        room_type_code: rt, stay_date: date, date_type: dateType,
        stay_start: null, stay_end: null,
        rack_rate: rackRate, new_rate: newRate,
        diff, diff_pct: diffPct,
      }, { onConflict: 'strategy_id,room_type_code,stay_date,date_type' })
    queryClient.invalidateQueries({ queryKey: ['s02_rate_detail', hotelId, effectiveStratId] })
  }, [hotelId, effectiveStratId, queryClient])

  // ── Month Navigation ───────────────────────────────────────────────────────

  const calcMonthRange = useCallback((year: number, month: number) => {
    const kst = getKSTDateString()
    const todayYear  = Number(kst.slice(0, 4))
    const todayMonth = Number(kst.slice(5, 7))
    const padM2 = String(month).padStart(2, '0')
    const isCurrent = year === todayYear && month === todayMonth
    const start = isCurrent ? otbDate : `${year}-${padM2}-01`
    const end   = getKSTEndOfMonth(`${year}-${padM2}-01`)
    return { start, end }
  }, [otbDate])

  const prevMonth = useCallback(() => {
    let y = viewYear, m = viewMonth - 1
    if (m === 0) { y -= 1; m = 12 }
    const { start, end } = calcMonthRange(y, m)
    setViewYear(y); setViewMonth(m)
    setStayStart(start); setStayEnd(end)
  }, [viewYear, viewMonth, calcMonthRange])

  const nextMonth = useCallback(() => {
    let y = viewYear, m = viewMonth + 1
    if (m === 13) { y += 1; m = 1 }
    const { start, end } = calcMonthRange(y, m)
    setViewYear(y); setViewMonth(m)
    setStayStart(start); setStayEnd(end)
  }, [viewYear, viewMonth, calcMonthRange])

  const handleStayStartChange = useCallback((v: string) => {
    setStayStart(v)
    if (v) {
      setViewYear(Number(v.slice(0, 4)))
      setViewMonth(Number(v.slice(5, 7)))
    }
  }, [])

  // ── Save Base Rate (BAR Rate) ────────────────────────────────────────────────

  const saveBaseRate = useCallback(async (
    date: string, rt: string, val: string,
    onSaving: () => void, onDone: (ok: boolean) => void
  ) => {
    const numVal = parseFloat(val.replace(/,/g, ''))
    if (isNaN(numVal) || !effectiveStratId) { onDone(false); return }
    const rackRate = Math.round(numVal) * 1000
    onSaving()
    try {
      await (supabase as any)
        .from('s02_rate_detail')
        .upsert({
          hotel_id: hotelId, strategy_id: effectiveStratId,
          room_type_code: rt, stay_date: date, date_type: 'base',
          stay_start: null, stay_end: null,
          rack_rate: rackRate, new_rate: rackRate,
        }, { onConflict: 'strategy_id,room_type_code,stay_date,date_type' })

      // 동일 날짜 change 행 있으면 rack_rate 업데이트 후 재계산
      const changeRow = getRate(date, rt, 'change')
      if (changeRow) {
        const existingDiffPct = changeRow.diff_pct ?? 0
        const newChangeRate = Math.round(rackRate * (1 + existingDiffPct / 100))
        await (supabase as any)
          .from('s02_rate_detail')
          .upsert({
            hotel_id: hotelId, strategy_id: effectiveStratId,
            room_type_code: rt, stay_date: date, date_type: 'change',
            stay_start: null, stay_end: null,
            rack_rate: rackRate, new_rate: newChangeRate,
          }, { onConflict: 'strategy_id,room_type_code,stay_date,date_type' })
      }
      queryClient.invalidateQueries({ queryKey: ['s02_rate_detail', hotelId, effectiveStratId] })
      onDone(true)
    } catch { onDone(false) }
  }, [hotelId, effectiveStratId, queryClient, getRate])

  // ── Bulk Apply Base Rate ───────────────────────────────────────────────────

  const applyBulkBase = useCallback(async () => {
    if (!bulkBaseValue || !selectedDates.length) return
    const numVal = parseFloat(bulkBaseValue.replace(/,/g, ''))
    if (isNaN(numVal)) return
    const rackRate = Math.round(numVal) * 1000
    const rtList = showAllTypes ? roomTypes : roomTypes.filter(rt => rt.room_type_code === selRoomType)
    const baseOps = selectedDates.flatMap(date =>
      rtList.map(rt => ({
        hotel_id: hotelId, strategy_id: effectiveStratId,
        room_type_code: rt.room_type_code, stay_date: date, date_type: 'base',
        stay_start: null, stay_end: null,
        rack_rate: rackRate, new_rate: rackRate,
      }))
    )
    const changeOps = selectedDates.flatMap(date =>
      rtList.flatMap(rt => {
        const changeRow = getRate(date, rt.room_type_code, 'change')
        if (!changeRow) return []
        const existingDiffPct = changeRow.diff_pct ?? 0
        const newChangeRate = Math.round(rackRate * (1 + existingDiffPct / 100))
        return [{
          hotel_id: hotelId, strategy_id: effectiveStratId,
          room_type_code: rt.room_type_code, stay_date: date, date_type: 'change',
          stay_start: null, stay_end: null,
          rack_rate: rackRate, new_rate: newChangeRate,
        }]
      })
    )
    if (baseOps.length > 0) {
      await (supabase as any).from('s02_rate_detail').upsert(baseOps, { onConflict: 'strategy_id,room_type_code,stay_date,date_type' })
    }
    if (changeOps.length > 0) {
      await (supabase as any).from('s02_rate_detail').upsert(changeOps, { onConflict: 'strategy_id,room_type_code,stay_date,date_type' })
    }
    queryClient.invalidateQueries({ queryKey: ['s02_rate_detail', hotelId, effectiveStratId] })
    setSelectedDates([]); setBulkBaseValue('')
  }, [bulkBaseValue, selectedDates, showAllTypes, roomTypes, selRoomType, hotelId, effectiveStratId, queryClient, getRate])

  // ── Excel Upload ───────────────────────────────────────────────────────────

  const parseExcel = (file: File): Promise<{ rows: {date: string; barRate: number}[]; errors: string[] }> =>
    new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = e => {
        const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[]
        const rows: {date: string; barRate: number}[] = []
        const errors: string[] = []

        const parseDate = (val: any): string => {
          if (val instanceof Date) {
            return val.toLocaleDateString('sv') // 'sv' 로케일 = YYYY-MM-DD, 로컬(KST) 기준
          }
          if (typeof val === 'number') {
            const info = XLSX.SSF.parse_date_code(val)
            return `${info.y}-${String(info.m).padStart(2, '0')}-${String(info.d).padStart(2, '0')}`
          }
          return String(val).replace(/\//g, '-').slice(0, 10)
        }

        console.log('[parseExcel] raw rows (첫 3행):', raw.slice(1, 4).map(r => ({ col0: r[0], col0Type: typeof r[0], col0IsDate: r[0] instanceof Date })))

        raw.slice(1).forEach((row, i) => {
          const lineNum = i + 2
          if (!row[0] && !row[1]) return
          const dateStr = parseDate(row[0])
          if (!dateStr) { errors.push(`${lineNum}행: 날짜 형식 오류 (${row[0]})`); return }
          const raw1 = Number(row[1])
          if (isNaN(raw1) || raw1 <= 0) { errors.push(`${lineNum}행: BAR Rate 값 오류 (${row[1]})`); return }
          const barRate = raw1 < 1000 ? raw1 * 1000 : raw1
          rows.push({ date: dateStr, barRate })
        })
        console.log('[parseExcel] parsed dates (첫 5개):', rows.slice(0, 5).map(r => r.date))
        resolve({ rows, errors })
      }
      reader.readAsBinaryString(file)
    })

  const runUpload = useCallback(async (rows: {date: string; barRate: number}[]) => {
    console.log('[runUpload] start — strategy_id:', effectiveStratId, 'hotel_id:', hotelId, 'rows:', rows.length)
    if (!effectiveStratId || !hotelId) {
      console.warn('[runUpload] 중단: effectiveStratId 또는 hotelId 없음')
      return
    }
    setUploadStatus('uploading')
    try {
      const buffer: Record<string, Record<string, number>> = {}
      for (const { date, barRate } of rows) {
        buffer[date] = {}
        for (const rt of roomTypes) {
          buffer[date][rt.room_type_code] = Math.round(barRate + (rt.surcharge ?? 0))
        }
      }
      console.log('[runUpload] previewBuffer 생성 완료 —', Object.keys(buffer).length, '일치, 샘플:', Object.entries(buffer)[0])
      setPreviewBuffer(buffer)
      setUploadStatus('done')
      setUploadMsg(`${rows.length}일치 미리보기 준비됨. 저장 버튼을 클릭하세요.`)
      setTimeout(() => { setUploadStatus('idle'); setUploadMsg(null) }, 3500)
    } catch (e: any) {
      console.error('[runUpload] 오류:', e)
      setUploadStatus('error')
      setUploadMsg(e.message ?? '업로드 실패')
    }
  }, [effectiveStratId, hotelId, roomTypes])

  const handleSavePreview = useCallback(async () => {
    console.log('[handleSavePreview] start — strategy_id:', effectiveStratId, 'hotel_id:', hotelId, 'isPreviewMode:', isPreviewMode, 'previewBuffer 날짜 수:', Object.keys(previewBuffer).length)
    if (!effectiveStratId || !hotelId || !isPreviewMode) {
      console.warn('[handleSavePreview] 중단: 조건 미충족')
      return
    }
    setUploadStatus('uploading')
    try {
      const BATCH = 100
      const savedDateCount = Object.keys(previewBuffer).length
      const payloads = Object.entries(previewBuffer).flatMap(([date, roomRates]) =>
        Object.entries(roomRates).map(([room_type_code, rack_rate]) => ({
          hotel_id:       hotelId,
          strategy_id:    effectiveStratId,
          room_type_code,
          date_type:      'base',
          stay_date:      date,
          stay_start:     null,
          stay_end:       null,
          rack_rate,
          new_rate:       rack_rate,
        }))
      )
      console.log('[handleSavePreview] upsert payloads 총', payloads.length, '건, 샘플:', payloads[0])
      for (let i = 0; i < payloads.length; i += BATCH) {
        setUploadMsg(`저장 중... (${Math.min(i + BATCH, payloads.length)}/${payloads.length}건)`)
        const { error } = await (supabase as any)
          .from('s02_rate_detail')
          .upsert(payloads.slice(i, i + BATCH), { onConflict: 'strategy_id,room_type_code,stay_date,date_type' })
        if (error) {
          console.error('[handleSavePreview] upsert 에러:', error)
          throw error
        }
      }
      console.log('[handleSavePreview] s02_rate_detail upsert 완료')
      queryClient.invalidateQueries({ queryKey: ['s02_rate_detail', hotelId, effectiveStratId] })

      if (otbDate) {
        const histPayloads = payloads.map(p => ({
          hotel_id:       p.hotel_id,
          strategy_id:    p.strategy_id,
          room_type_code: p.room_type_code,
          stay_date:      p.stay_date,
          date_type:      p.date_type,
          rack_rate:      p.rack_rate,
          uploaded_at:    otbDate,
        }))
        for (let i = 0; i < histPayloads.length; i += BATCH) {
          const { error: histErr } = await (supabase as any)
            .from('s02_rate_detail_history')
            .insert(histPayloads.slice(i, i + BATCH))
          if (histErr) console.warn('[handleSavePreview] history insert 에러 (무시):', histErr)
        }
        queryClient.invalidateQueries({ queryKey: ['bar-upload-dates', effectiveStratId] })
        queryClient.invalidateQueries({ queryKey: ['bar-history', effectiveStratId] })
      }

      setPreviewBuffer({})
      setUploadStatus('done')
      setUploadMsg(`${savedDateCount}일 × ${roomTypes.length}개 객실타입 요금이 저장되었습니다`)
      setTimeout(() => { setUploadStatus('idle'); setUploadMsg(null) }, 3500)
    } catch (e: any) {
      console.error('[handleSavePreview] 오류:', e)
      setUploadStatus('error')
      setUploadMsg(e.message ?? '저장 실패')
    }
  }, [effectiveStratId, hotelId, previewBuffer, isPreviewMode, roomTypes, queryClient, otbDate])

  const handleFileChange = useCallback(async (file: File) => {
    if (!file) return
    setUploadStatus('parsing')
    const { rows, errors } = await parseExcel(file)
    if (errors.length > 0) {
      setUploadErrors(errors)
      setPendingRows(rows)
      setShowErrorModal(true)
      setUploadStatus('idle')
    } else {
      await runUpload(rows)
    }
  }, [runUpload])

  const downloadTemplate = useCallback(() => {
    const dateRange = stayStartEff && stayEndEff ? getDateRange(stayStartEff, stayEndEff) : []
    const ws = XLSX.utils.aoa_to_sheet([
      ['날짜', 'BAR Rate'],
      ...dateRange.map(d => [d, '']),
    ])
    ws['!cols'] = [{ wch: 14 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'BAR Rate')
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    XLSX.writeFile(wb, `BAR_Rate_템플릿_${today}.xlsx`)
  }, [stayStartEff, stayEndEff])

  // ── Bulk Apply ─────────────────────────────────────────────────────────────

  const applyBulk = useCallback(async () => {
    if (!bulkValue || !selectedDates.length) return
    const mode = colMode['change']
    const rtList = showAllTypes ? roomTypes : roomTypes.filter(rt => rt.room_type_code === selRoomType)
    const ops = selectedDates.flatMap(date =>
      rtList.map(rt => {
        const base = getRate(date, rt.room_type_code, 'base')
        const rack = base?.rack_rate ?? null
        const numVal = parseFloat(bulkValue)
        if (isNaN(numVal)) return null
        const newRate = rack != null ? calcNewRate(rack, mode, numVal) : (mode === 'direct' ? numVal : null)
        const diff    = newRate != null && rack != null ? newRate - rack : null
        const diffPct = rack && diff != null ? (diff / rack) * 100 : null
        return { hotel_id: hotelId, strategy_id: effectiveStratId, room_type_code: rt.room_type_code, stay_date: date, date_type: 'change', stay_start: null, stay_end: null, rack_rate: rack, new_rate: newRate, diff, diff_pct: diffPct }
      }).filter(Boolean)
    )
    if (ops.length > 0) {
      await (supabase as any).from('s02_rate_detail').upsert(ops, { onConflict: 'strategy_id,room_type_code,stay_date,date_type' })
      queryClient.invalidateQueries({ queryKey: ['s02_rate_detail', hotelId, effectiveStratId] })
    }
    setSelectedDates([]); setBulkValue('')
  }, [bulkValue, selectedDates, colMode, showAllTypes, roomTypes, selRoomType, hotelId, effectiveStratId, queryClient, getRate])

  // ── RPA Send ───────────────────────────────────────────────────────────────

  const handleRpaSend = async () => {
    setRpaSending(true)
    try {
      const webhookUrl = process.env.NEXT_PUBLIC_RPA_WEBHOOK_URL
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hotel_id: hotelId, strategy_id: effectiveStratId, rates: rateDetails }),
        })
      }
      setLastRpaTime(new Date().toLocaleString('ko-KR'))
    } catch { /* ignore */ } finally { setRpaSending(false) }
  }

  // ── Column definitions ─────────────────────────────────────────────────────

  const extraCols: Array<{ key: string; label: string; modes: ChangeMode[] }> = [
    { key: 'change',  label: '변경 요금', modes: ['%', '+-', 'direct'] },
    { key: '2night',  label: '2연박',     modes: ['%', '+-'] },
    { key: '3night',  label: '3연박',     modes: ['%', '+-'] },
    ...promotions.map(p => ({ key: `promo_${p.id}`, label: p.name, modes: ['%', '+-'] as ChangeMode[] })),
  ]

  const filterStyle = {
    background: 'var(--color-bg-tertiary)',
    border: '1px solid var(--color-border-default)',
    color: 'var(--color-text-primary)',
  }

  const DIVIDER = '1.5px solid var(--color-border-default)'

  // ── Render ─────────────────────────────────────────────────────────────────

  const filterDivider = (
    <div style={{ width: 1, height: 32, background: 'var(--color-border-default)', flexShrink: 0, alignSelf: 'flex-end', marginBottom: 1 }} />
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        {/* 좌측: 타이틀 + 월 네비 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            Rate Strategy
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={prevMonth}
              className="flex items-center justify-center rounded transition-colors"
              style={{ width: 24, height: 24, background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
              <ChevronDown size={12} style={{ transform: 'rotate(90deg)' }} />
            </button>
            <span style={{ fontSize: 12, fontWeight: 500, minWidth: 72, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              {viewYear}년 {viewMonth}월
            </span>
            <button onClick={nextMonth}
              className="flex items-center justify-center rounded transition-colors"
              style={{ width: 24, height: 24, background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
              <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} />
            </button>
          </div>
        </div>

        {/* 우측: 액션 버튼 */}
        <div className="flex items-end gap-2">
          {/* BAR 엑셀 그룹 */}
          {effectiveStratId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 9, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <FileSpreadsheet size={10} />
                BAR 엑셀
              </span>
              <div style={{ display: 'inline-flex' }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600, padding: '8px 14px',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  borderRadius: '8px 0 0 8px',
                  border: '1px solid var(--color-border-default)', borderRight: 'none',
                  color: 'var(--color-text-primary)', background: 'var(--color-bg-secondary)',
                }}>
                  {uploadStatus === 'uploading' || uploadStatus === 'parsing'
                    ? <Loader2 size={13} className="animate-spin" />
                    : null}
                  업로드
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(f); e.target.value = '' }} />
                </label>
                <button onClick={downloadTemplate}
                  style={{
                    display: 'flex', alignItems: 'center',
                    fontSize: 12, fontWeight: 600, padding: '8px 14px',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    borderRadius: '0 8px 8px 0',
                    border: '1px solid var(--color-border-default)',
                    borderLeft: '0.5px solid var(--color-border-secondary)',
                    color: 'var(--color-text-primary)', background: 'var(--color-bg-secondary)',
                  }}>
                  양식
                </button>
              </div>
            </div>
          )}
          <button onClick={() => setShowStratModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
            <Plus size={13} />전략 생성
          </button>
          {effectiveStratId && (
            <button onClick={handleRpaSend} disabled={rpaSending}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', background: 'var(--color-bg-secondary)' }}>
              {rpaSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              RPA 전송
            </button>
          )}
        </div>
      </div>

      {/* ── 탭 바 ── */}
      <div style={{ display: 'flex', gap: 4 }}>
        {([
          { id: 'list',      label: '일자별'       },
          { id: 'promo-cal', label: '프로모션 달력' },
          { id: 'rate-cal',  label: '요금 달력'    },
        ] as { id: RateTab; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              fontSize:     12,
              fontWeight:   activeTab === tab.id ? 600 : 400,
              padding:      '5px 14px',
              borderRadius: 8,
              border:       activeTab === tab.id
                ? '1.5px solid #00E5A0'
                : '1px solid var(--color-border-default)',
              background:   activeTab === tab.id
                ? 'rgba(0,229,160,0.08)'
                : 'var(--color-bg-secondary)',
              color:        activeTab === tab.id
                ? '#00E5A0'
                : 'var(--color-text-secondary)',
              cursor:       'pointer',
              transition:   'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 일자별 탭 (list) ── */}
      <div style={{ display: activeTab === 'list' ? undefined : 'none' }} className="space-y-6">

      {/* ── 필터 바 (1줄) ── */}
      <div className="flex items-end flex-wrap gap-2 px-4 py-3 rounded-xl"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)' }}>

        {/* OTB 기준일 */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">OTB 기준일</label>
          <div className="relative">
            <select className="rounded-lg px-3 py-1.5 text-sm pr-7 outline-none appearance-none" style={{ ...filterStyle, minWidth: 130 }}
              value={otbDate} onChange={e => setOtbDate(e.target.value)}>
              {otbDates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
          </div>
        </div>


        {filterDivider}

        {/* 투숙기간 */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">투숙기간</label>
          <div className="flex items-center gap-1.5">
            <div onClick={e => e.stopPropagation()}>
              <FormDatePicker value={stayStart} onChange={handleStayStartChange} placeholder="시작일" />
            </div>
            <span className="text-brand-muted text-xs">~</span>
            <div onClick={e => e.stopPropagation()}>
              <FormDatePicker value={stayEnd} onChange={setStayEnd} placeholder="종료일" />
            </div>
          </div>
        </div>

        {filterDivider}

        {/* 객실타입 */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">객실타입</label>
          <div className="relative">
            <select className="rounded-lg px-3 py-1.5 text-sm pr-7 outline-none appearance-none" style={{ ...filterStyle, minWidth: 100 }}
              value={selRoomType} onChange={e => setSelRoomType(e.target.value)}>
              {roomTypes.map(rt => <option key={rt.room_type_code} value={rt.room_type_code}>{rt.room_type_code}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
          </div>
        </div>

        {strategies.length > 0 && filterDivider}

        {/* 전략 선택 */}
        {strategies.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">전략</label>
            <div className="relative">
              <select className="rounded-lg px-3 py-1.5 text-sm pr-7 outline-none appearance-none" style={{ ...filterStyle, minWidth: 180 }}
                value={strategyId} onChange={e => setStrategyId(e.target.value)}>
                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
            </div>
          </div>
        )}

        {/* 스페이서 */}
        <div style={{ flex: 1 }} />

        {/* 우측 액션 버튼 */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowAllTypes(v => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: showAllTypes ? 'var(--accent-badge-bg)' : 'var(--color-bg-tertiary)',
              border: showAllTypes ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-default)',
              color: showAllTypes ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
            }}>
            전체 타입
          </button>
          {effectiveStratId && (
            <button onClick={() => setShowPromoModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', background: 'var(--color-bg-secondary)' }}>
              <Tag size={11} />프로모션
            </button>
          )}
        </div>
      </div>

      {/* 업로드 상태 메시지 */}
      {uploadMsg && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs"
          style={{
            background: uploadStatus === 'error' ? 'rgba(226,75,74,0.08)' : 'rgba(0,229,160,0.06)',
            border: `1px solid ${uploadStatus === 'error' ? 'rgba(226,75,74,0.3)' : 'rgba(0,229,160,0.2)'}`,
            color: uploadStatus === 'error' ? '#E24B4A' : 'var(--color-accent-primary)',
          }}>
          {(uploadStatus === 'uploading' || uploadStatus === 'parsing') && <Loader2 size={12} className="animate-spin" />}
          {uploadMsg}
        </div>
      )}

      {/* ── 일괄 입력 바 ── */}
      {selectedDates.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl"
          style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)' }}>
          <CheckSquare size={14} style={{ color: 'var(--color-accent-primary)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--color-accent-primary)' }}>
            {selectedDates.length}일 선택됨
          </span>
          {/* BAR Rate 일괄 */}
          <span className="text-xs text-brand-muted">BAR Rate</span>
          <input className="rounded-lg px-2 py-1 text-xs w-20 outline-none" style={filterStyle}
            value={bulkBaseValue} onChange={e => setBulkBaseValue(e.target.value)}
            placeholder="천원 단위" />
          <button onClick={applyBulkBase}
            className="px-3 py-1 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}>적용</button>
          <div className="w-px h-4" style={{ background: 'var(--color-border-default)' }} />
          {/* 변경요금 일괄 */}
          <span className="text-xs text-brand-muted">변경요금</span>
          <input className="rounded-lg px-2 py-1 text-xs w-24 outline-none" style={filterStyle}
            value={bulkValue} onChange={e => setBulkValue(e.target.value)}
            placeholder={`값 (${colMode['change']})`} />
          <button onClick={applyBulk}
            className="px-3 py-1 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>적용</button>
          <button onClick={() => setSelectedDates([])} className="text-brand-muted hover:text-brand-text ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── 메인 레이아웃 (테이블 + 사이드패널) ── */}
      <div className="flex gap-4 items-start">

        {/* ── 테이블 영역 ── */}
        <div className="flex-1 min-w-0 rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}>

          {isPreviewMode && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 16px',
              background: 'rgba(245,184,0,0.08)',
              borderBottom: '0.5px solid rgba(245,184,0,0.2)',
            }}>
              <span style={{ fontSize: 12, color: '#F5B800' }}>
                ⚠ <strong>{Object.keys(previewBuffer).length}일</strong>치 BAR Rate 미리보기 중 — 저장 버튼을 클릭해야 적용됩니다
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setPreviewBuffer({})}
                  style={{
                    fontSize: 12, padding: '5px 12px',
                    borderRadius: 'var(--border-radius-md)',
                    border: '0.5px solid var(--color-border-secondary)',
                    background: 'transparent', color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}>
                  취소
                </button>
                <button
                  onClick={handleSavePreview}
                  disabled={uploadStatus === 'uploading'}
                  style={{
                    fontSize: 12, padding: '5px 12px',
                    borderRadius: 'var(--border-radius-md)',
                    border: 'none',
                    background: '#F5B800', color: '#1a1a1a',
                    fontWeight: 600, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    opacity: uploadStatus === 'uploading' ? 0.6 : 1,
                  }}>
                  {uploadStatus === 'uploading' ? <Loader2 size={12} className="animate-spin" /> : null}
                  저장
                </button>
              </div>
            </div>
          )}

          {!effectiveStratId ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-brand-muted">전략을 먼저 생성하세요</p>
              <button onClick={() => setShowStratModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
                <Plus size={13} />전략 생성
              </button>
            </div>
          ) : dates.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-brand-muted">투숙기간을 설정하면 요금 테이블이 표시됩니다</p>
            </div>
          ) : ratesLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-brand-muted">
              <Loader2 size={18} className="animate-spin" /><span className="text-sm">불러오는 중...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
                    {/* 체크박스 */}
                    <th className="px-2 py-2.5 sticky left-0 z-10"
                      style={{ background: 'var(--color-bg-tertiary)', borderRight: DIVIDER }}>
                      <input type="checkbox"
                        checked={selectedDates.length === dates.length}
                        onChange={e => setSelectedDates(e.target.checked ? [...dates] : [])}
                        className="cursor-pointer" />
                    </th>
                    {/* 날짜 */}
                    <th className="px-3 py-2.5 text-left font-semibold text-brand-muted uppercase tracking-wide sticky left-8 z-10"
                      style={{ background: 'var(--color-bg-tertiary)', borderRight: DIVIDER }}>
                      날짜
                    </th>
                    {/* OCC */}
                    <th className="px-3 py-2.5 text-left font-semibold text-brand-muted uppercase tracking-wide"
                      style={{ borderRight: DIVIDER }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 500 }}>OCC</span>
                          {vsOtbDate && (
                            <span style={{ fontSize: 9, color: 'var(--color-text-secondary)', marginLeft: 4, fontWeight: 400 }}>vs {vsOtbDate}</span>
                          )}
                        </div>
                        {vsOtbDate && (() => {
                          const btnBase: React.CSSProperties = {
                            fontSize: 11, padding: '4px 10px 4px 0',
                            borderRadius: 6, border: 'none',
                            cursor: 'pointer', background: 'transparent',
                            color: 'var(--color-text-secondary)',
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            whiteSpace: 'nowrap',
                          }
                          const btnActive: React.CSSProperties = {
                            ...btnBase,
                            background: 'rgba(255,255,255,0.06)',
                            color: 'var(--color-text-primary)',
                          }
                          const FlagBar = ({ color }: { color: string }) => (
                            <div style={{ width: 2, height: 13, borderRadius: 1, background: color, flexShrink: 0 }} />
                          )
                          return (
                            <div style={{ display: 'flex', gap: 2 }}>
                              {([
                                ['total', '합계', pickupView === 'total' ? 'var(--color-text-secondary)' : 'var(--color-border-secondary)'],
                                ['fit',   'FIT',  '#00B883'],
                                ['fit_grp', 'F+G', '#185FA5'],
                              ] as [PickupView, string, string][]).map(([mode, label, flagColor]) => (
                                <button key={mode}
                                  onClick={() => setPickupView(mode)}
                                  style={pickupView === mode ? btnActive : btnBase}
                                  onMouseEnter={e => { if (pickupView !== mode) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                                  onMouseLeave={e => { if (pickupView !== mode) e.currentTarget.style.background = 'transparent' }}>
                                  <FlagBar color={flagColor} />
                                  {label}
                                </button>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                    </th>
                    {/* D-N 이력 컬럼 헤더 */}
                    {histDates.length > 0 && displayRTs.map(rt =>
                      histDates.map((ud, i) => (
                        <th key={`${rt.room_type_code}-hist-${ud}`}
                          className="px-2 py-2.5 text-right font-semibold uppercase tracking-wide whitespace-nowrap"
                          style={{ borderLeft: '0.5px solid var(--color-border-default)', color: 'var(--color-text-muted)', opacity: 0.6, fontSize: 10 }}>
                          <div>{showAllTypes ? `${rt.room_type_code} ` : ''}D-{histDates.length - i}</div>
                          <div style={{ fontSize: 9, fontWeight: 400 }}>{ud}</div>
                        </th>
                      ))
                    )}
                    {/* BAR Rate (현재, 편집 가능) */}
                    {displayRTs.map(rt => (
                      <th key={`${rt.room_type_code}-rack`}
                        className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide whitespace-nowrap"
                        style={{
                          borderLeft: histDates.length > 0 ? '1.5px solid #00E5A0' : '1px solid var(--color-border-default)',
                          borderRight: '1px solid var(--color-border-default)',
                          background: histDates.length > 0 ? 'rgba(0,229,160,0.06)' : undefined,
                          color: '#00B883',
                        }}>
                        <div>{showAllTypes ? `${rt.room_type_code} BAR` : 'BAR Rate'}</div>
                        {uploadDates[0] && <div style={{ fontSize: 9, fontWeight: 400, color: 'rgba(0,184,131,0.7)' }}>{uploadDates[0]} 현재</div>}
                      </th>
                    ))}
                    {/* 요금 컬럼 그룹 */}
                    {extraCols.map(col => (
                      displayRTs.map(rt => (
                        <th key={`${rt.room_type_code}-${col.key}`}
                          className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide whitespace-nowrap"
                          style={{ borderLeft: DIVIDER, color: col.key === 'change' ? 'var(--color-accent-primary)' : 'var(--color-text-muted)' }}>
                          <div>{showAllTypes ? `${rt.room_type_code} ${col.label}` : col.label}</div>
                          <ModeToggle
                            modes={col.modes}
                            value={colMode[col.key] ?? col.modes[0]}
                            onChange={m => setColMode(prev => ({ ...prev, [col.key]: m }))}
                          />
                        </th>
                      ))
                    ))}
                    {/* 패키지 컬럼 그룹 */}
                    {ratePackages.length > 0 && ratePackages.map(pkg => (
                      displayRTs.map(rt => (
                        <th key={`pkg_${pkg.id}_${rt.room_type_code}`}
                          className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide whitespace-nowrap"
                          style={{ borderLeft: '1.5px solid var(--color-border-secondary)', color: 'var(--color-text-muted)' }}>
                          <div className="text-[10px] text-brand-muted mb-0.5">패키지</div>
                          <div>{showAllTypes ? `${rt.room_type_code} ${pkg.name}` : pkg.name}</div>
                        </th>
                      ))
                    ))}
                    {/* 메모 */}
                    <th className="px-3 py-2.5 text-left font-semibold text-brand-muted uppercase tracking-wide"
                      style={{ borderLeft: DIVIDER }}>메모</th>
                  </tr>
                </thead>
                <tbody>
                  {dates.map(date => {
                    const weekend     = isWeekend(date)
                    const occ         = occMap[date] ?? null
                    const isSelected  = selectedDates.includes(date)
                    const dow         = getDayNum(date)
                    const isFri       = dow === 5
                    const isSat       = dow === 6
                    const namedEvents = (eventMap[date] ?? []).filter(ev => ev.event && ev.event.trim() !== '' && ev.event.toLowerCase() !== 'null')
                    const visibleEvts = namedEvents.slice(0, 2)
                    const extraEvts   = namedEvents.length - visibleEvts.length
                    const hasEvent    = namedEvents.length > 0
                    const rowBg       = isSelected ? 'rgba(0,229,160,0.06)' : (weekend || hasEvent) ? 'rgba(0,229,160,0.04)' : 'var(--color-bg-surface)'

                    return (
                      <tr key={date}
                        style={{
                          background: isSelected
                            ? 'rgba(0,229,160,0.06)'
                            : (weekend || hasEvent) ? 'rgba(0,229,160,0.04)' : 'transparent',
                          borderBottom: '1px solid var(--color-border-default)',
                        }}>
                        {/* 체크박스 */}
                        <td className="px-2 py-2 sticky left-0 z-10"
                          style={{ background: rowBg, borderRight: DIVIDER }}>
                          <input type="checkbox" checked={isSelected}
                            onChange={e => setSelectedDates(prev =>
                              e.target.checked ? [...prev, date] : prev.filter(d => d !== date)
                            )} className="cursor-pointer" />
                        </td>
                        {/* 날짜 */}
                        <td className="px-3 py-2 whitespace-nowrap sticky left-8 z-10"
                          style={{ background: rowBg, borderRight: DIVIDER, minWidth: 100 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            {/* 왼쪽: 날짜 + 요일 + 금토 점 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                {date.slice(5)}
                              </span>
                              <span style={{ fontSize: 10, color: (isFri || isSat) ? '#00B883' : 'var(--color-text-secondary)' }}>
                                {getDow(date)}
                              </span>
                              {(isFri || isSat) && (
                                <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#00E5A0', display: 'inline-block', flexShrink: 0 }} />
                              )}
                            </div>
                            {/* 오른쪽: 이벤트 뱃지 */}
                            {visibleEvts.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                {visibleEvts.map((ev, i) => (
                                  <span key={i} title={ev.event!}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                      fontSize: 9, fontWeight: 600,
                                      background: ev.is_holiday ? 'rgba(232,75,74,0.15)' : 'rgba(24,95,165,0.15)',
                                      color:      ev.is_holiday ? '#E24B4A' : '#185FA5',
                                    }}>
                                    {ev.event!.slice(0, 2)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        {/* OCC */}
                        {(() => {
                          const barW      = occ != null ? Math.min(100, Math.max(0, occ)) : 0
                          const barColor  = occ != null
                            ? occ >= 80 ? '#00B883' : occ >= 60 ? '#F6AD55' : '#E24B4A'
                            : 'var(--color-bg-tertiary)'
                          const seg       = vsOtbDate ? segPickupMap[date] : null
                          const fitPu     = seg?.fit ?? 0
                          const grpPu     = seg?.grp ?? 0
                          const totalPu   = fitPu + grpPu
                          const barW2     = (val: number) => `${Math.min((Math.abs(val) / maxPickup) * 40, 40)}px`
                          return (
                            <td className="px-3 py-2"
                              onClick={vsOtbDate ? () => setSegModalDate(date) : undefined}
                              style={{ borderRight: DIVIDER, cursor: vsOtbDate ? 'pointer' : 'default', minWidth: 130 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                {/* 왼쪽: OCC 바 + % */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <div style={{ width: `${barW * 0.48}px`, height: 4, borderRadius: 2, background: barColor, flexShrink: 0 }} />
                                  <span style={{ fontSize: 12, fontWeight: 500, color: occ != null ? barColor : 'var(--color-text-muted)' }}>
                                    {occ != null ? `${occ.toFixed(0)}%` : '—'}
                                  </span>
                                </div>
                                {/* 오른쪽: 픽업 (vsOtbDate 있을 때만) */}
                                {vsOtbDate && (
                                  <div style={{ flexShrink: 0 }}>
                                    {/* 합계 */}
                                    {pickupView === 'total' && (
                                      <span style={{
                                        fontSize: 11, fontWeight: 600, minWidth: 28, textAlign: 'right', display: 'block',
                                        color: totalPu > 0 ? '#00B883' : totalPu < 0 ? '#E24B4A' : 'var(--color-text-secondary)',
                                      }}>
                                        {totalPu > 0 ? '+' : totalPu < 0 ? '▼' : '—'}
                                        {totalPu !== 0 ? Math.abs(totalPu) : ''}
                                      </span>
                                    )}
                                    {/* FIT만 */}
                                    {pickupView === 'fit' && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                        {fitPu !== 0 ? (
                                          <>
                                            <div style={{ height: 3, borderRadius: 2, width: barW2(fitPu), background: fitPu > 0 ? '#00B883' : '#E24B4A' }} />
                                            <span style={{ fontSize: 10, fontWeight: 500, minWidth: 20, textAlign: 'right', color: fitPu > 0 ? '#00B883' : '#E24B4A' }}>
                                              {fitPu < 0 ? '▼' : ''}{Math.abs(fitPu)}
                                            </span>
                                          </>
                                        ) : (
                                          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>—</span>
                                        )}
                                      </div>
                                    )}
                                    {/* FIT + GRP */}
                                    {pickupView === 'fit_grp' && (
                                      fitPu === 0 && grpPu === 0 ? (
                                        <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>—</span>
                                      ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                          {fitPu !== 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                                              <span style={{ fontSize: 9, color: 'var(--color-text-secondary)', width: 10, textAlign: 'right' }}>F</span>
                                              <div style={{ height: 3, borderRadius: 2, width: barW2(fitPu), background: fitPu > 0 ? '#00B883' : '#E24B4A' }} />
                                              <span style={{ fontSize: 10, fontWeight: 500, minWidth: 20, textAlign: 'right', color: fitPu > 0 ? '#00B883' : '#E24B4A' }}>
                                                {fitPu < 0 ? '▼' : ''}{Math.abs(fitPu)}
                                              </span>
                                            </div>
                                          )}
                                          {grpPu !== 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                                              <span style={{ fontSize: 9, color: 'var(--color-text-secondary)', width: 10, textAlign: 'right' }}>G</span>
                                              <div style={{ height: 3, borderRadius: 2, width: barW2(grpPu), background: grpPu > 0 ? '#00B883' : '#E24B4A' }} />
                                              <span style={{ fontSize: 10, fontWeight: 500, minWidth: 20, textAlign: 'right', color: grpPu > 0 ? '#00B883' : '#E24B4A' }}>
                                                {grpPu < 0 ? '▼' : ''}{Math.abs(grpPu)}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          )
                        })()}
                        {/* D-N 이력 셀 (읽기 전용) */}
                        {histDates.length > 0 && displayRTs.map(rt =>
                          histDates.map((ud, i) => {
                            const hk      = `${date}__${rt.room_type_code}`
                            const prevRate = historyMap[hk]?.[ud]
                            const curRate  = historyMap[hk]?.[uploadDates[0]]
                            const diffPct  = prevRate && curRate
                              ? ((curRate - prevRate) / prevRate * 100)
                              : null
                            return (
                              <td key={`${rt.room_type_code}-hist-${ud}`}
                                className="px-2 py-1.5 text-right font-mono"
                                style={{ borderLeft: '0.5px solid var(--color-border-default)', fontSize: 11 }}>
                                <div style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                                  {prevRate != null ? Math.round(prevRate / 1000) : <span style={{ opacity: 0.35 }}>—</span>}
                                </div>
                                {diffPct != null && (
                                  <div style={{ fontSize: 9, color: diffPct > 0 ? '#00B883' : diffPct < 0 ? '#E24B4A' : 'var(--color-text-muted)' }}>
                                    {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                                  </div>
                                )}
                              </td>
                            )
                          })
                        )}
                        {/* BAR Rate (현재, 편집 가능) */}
                        {displayRTs.map(rt => {
                          const base        = getRate(date, rt.room_type_code, 'base')
                          const cellKey     = `${date}__${rt.room_type_code}`
                          const flash       = baseFlash[cellKey]
                          const previewRate = previewBuffer[date]?.[rt.room_type_code]
                          const isPreview   = previewRate !== undefined
                          const displayVal  = isPreview
                            ? String(Math.round(previewRate / 1000))
                            : base?.rack_rate != null ? String(Math.round(base.rack_rate / 1000)) : ''
                          return (
                            <td key={`${rt.room_type_code}-rack`}
                              className="px-3 py-2 text-right font-mono"
                              style={{
                                borderLeft: histDates.length > 0 ? '1.5px solid #00E5A0' : undefined,
                                borderRight: '1px solid var(--color-border-default)',
                                background: isPreview
                                  ? 'rgba(255,200,0,0.08)'
                                  : histDates.length > 0 ? 'rgba(0,229,160,0.03)' : undefined,
                                opacity: flash === 'saving' ? 0.5 : 1,
                                outline: flash === 'success' ? '1.5px solid #00E5A0' : flash === 'error' ? '1.5px solid #E24B4A' : 'none',
                                transition: 'outline 0.3s',
                              }}>
                              <input
                                key={`${cellKey}-${isPreview ? `prev-${previewRate}` : base?.rack_rate ?? 'empty'}`}
                                defaultValue={displayVal}
                                className="w-full text-right font-mono"
                                style={{
                                  border: 'none', background: 'transparent',
                                  color: isPreview ? '#F5B800' : '#00E5A0',
                                  fontWeight: 600, fontSize: 12,
                                  padding: 0, outline: 'none', boxShadow: 'none',
                                }}
                                placeholder="—"
                                onBlur={e => {
                                  const val = e.target.value.trim()
                                  const cur = base?.rack_rate != null ? String(Math.round(base.rack_rate / 1000)) : ''
                                  if (!val || val === cur) return
                                  saveBaseRate(date, rt.room_type_code, val,
                                    () => setBaseFlash(p => ({ ...p, [cellKey]: 'saving' })),
                                    ok => {
                                      setBaseFlash(p => ({ ...p, [cellKey]: ok ? 'success' : 'error' }))
                                      setTimeout(() => setBaseFlash(p => { const n = { ...p }; delete n[cellKey]; return n }), 900)
                                    }
                                  )
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                  if (e.key === 'Escape') {
                                    const t = e.target as HTMLInputElement
                                    t.value = base?.rack_rate != null ? String(Math.round(base.rack_rate / 1000)) : ''
                                    t.blur()
                                  }
                                }}
                              />
                            </td>
                          )
                        })}
                        {/* 요금 컬럼 데이터 */}
                        {extraCols.map(col =>
                          displayRTs.map(rt => {
                            const mode = colMode[col.key] ?? col.modes[0]
                            const base = getRate(date, rt.room_type_code, 'base')
                            const detail = getRate(date, rt.room_type_code, col.key)
                            const rack = base?.rack_rate ?? detail?.rack_rate ?? null
                            const newR = detail?.new_rate ?? null
                            const pct = rack && newR ? ((newR - rack) / rack * 100) : null
                            const isEditing = editCell?.date === date && editCell?.rateCode === col.key && editCell?.rt === rt.room_type_code

                            return (
                              <td key={`${rt.room_type_code}-${col.key}`}
                                className="px-3 py-2 text-right"
                                style={{ borderLeft: DIVIDER }}>
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    className="w-20 text-right rounded px-1.5 py-0.5 outline-none font-mono text-xs"
                                    style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-accent-primary)', color: 'var(--color-text-primary)' }}
                                    value={editVal}
                                    onChange={e => setEditVal(e.target.value)}
                                    onBlur={async () => {
                                      await saveRateCell(date, rt.room_type_code, col.key, mode, editVal, rack)
                                      setEditCell(null)
                                    }}
                                    onKeyDown={async e => {
                                      if (e.key === 'Enter') {
                                        await saveRateCell(date, rt.room_type_code, col.key, mode, editVal, rack)
                                        setEditCell(null)
                                      }
                                      if (e.key === 'Escape') setEditCell(null)
                                    }}
                                  />
                                ) : (
                                  <div className="cursor-pointer hover:opacity-80"
                                    onClick={() => {
                                      setEditCell({ date, rateCode: col.key, rt: rt.room_type_code })
                                      setEditVal(newR != null ? String(newR) : '')
                                    }}>
                                    {newR != null ? (
                                      <>
                                        <div className="font-mono font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                          {fmt(newR)}
                                        </div>
                                        <div className="text-[10px]" style={{ color: pctColor(pct) }}>
                                          {pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : ''}
                                        </div>
                                      </>
                                    ) : (
                                      <span className="text-brand-muted opacity-40">—</span>
                                    )}
                                  </div>
                                )}
                              </td>
                            )
                          })
                        )}
                        {/* 패키지 셀 (읽기 전용) */}
                        {ratePackages.length > 0 && ratePackages.map(pkg =>
                          displayRTs.map(rt => {
                            const detail = getRate(date, rt.room_type_code, 'change')
                            const newR = detail?.new_rate ?? null
                            const total = newR != null ? newR + pkg.add_on_rate : null
                            return (
                              <td key={`pkg_${pkg.id}_${rt.room_type_code}`}
                                className="px-3 py-2 text-right"
                                style={{ borderLeft: '1.5px solid var(--color-border-secondary)' }}>
                                {total != null ? (
                                  <>
                                    <div className="font-mono font-medium text-xs" style={{ color: 'var(--color-text-primary)' }}>
                                      {Math.round(total / 1000)}
                                    </div>
                                    <div className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                                      +{Math.round(pkg.add_on_rate / 1000)}
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-brand-muted opacity-40">—</span>
                                )}
                              </td>
                            )
                          })
                        )}
                        {/* 메모 */}
                        <td className="px-3 py-2 text-brand-muted" style={{ borderLeft: DIVIDER }}>
                          {displayRTs[0] && getRate(date, displayRTs[0].room_type_code, 'change')?.memo}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── OTB 사이드 패널 ── */}
        {effectiveStratId && (
          <div className="w-52 shrink-0 rounded-xl p-4 space-y-4"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}>

            <div>
              <p className="text-[10px] font-semibold text-brand-muted uppercase tracking-widest mb-2.5">OTB 참고</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-brand-muted">평균 OCC</span>
                  <span className="text-xs font-semibold font-mono" style={{ color: 'var(--color-text-primary)' }}>
                    {avgOcc != null ? `${avgOcc.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-brand-muted">기간</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                    {dates.length}일
                  </span>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: 12 }}>
              <p className="text-[10px] font-semibold text-brand-muted uppercase tracking-widest mb-2.5">요금 변경 요약</p>
              <div className="space-y-1.5">
                {[
                  { label: '인상 일수', val: `${up}일`, icon: <TrendingUp size={11} />, color: '#00B883' },
                  { label: '인하 일수', val: `${down}일`, icon: <TrendingDown size={11} />, color: '#E24B4A' },
                  { label: '변동 없음', val: `${flat}일`, icon: <Minus size={11} />, color: 'var(--color-text-muted)' },
                  { label: '평균 변동률', val: `${avgPct >= 0 ? '+' : ''}${avgPct.toFixed(1)}%`, icon: <Activity size={11} />, color: pctColor(avgPct) },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-brand-muted">
                      <span style={{ color: item.color }}>{item.icon}</span>
                      {item.label}
                    </div>
                    <span className="text-xs font-semibold font-mono" style={{ color: item.color }}>
                      {item.val}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {currentStrategy && (
              <div style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: 12 }}>
                <StatusBadge status={currentStrategy.status} />
                <p className="text-[10px] text-brand-muted mt-1.5">
                  {currentStrategy.name}
                </p>
              </div>
            )}

            {ratePackages.length > 0 && (
              <div style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: 12 }}>
                <p className="text-[10px] font-semibold text-brand-muted uppercase tracking-widest mb-2.5">패키지</p>
                <div className="space-y-1.5">
                  {ratePackages.map(pkg => (
                    <div key={pkg.id} className="flex items-center justify-between">
                      <span className="text-xs text-brand-muted truncate max-w-[110px]">{pkg.name}</span>
                      <span className="text-xs font-semibold font-mono" style={{ color: 'var(--color-accent-primary)' }}>
                        +{pkg.add_on_rate.toLocaleString('ko-KR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2" style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: 12 }}>
              <button onClick={handleRpaSend} disabled={rpaSending}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
                {rpaSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                RPA 전송
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── RPA 상태 바 ── */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-xl text-xs"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)' }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: '#00B883', boxShadow: '0 0 6px #00B883' }} />
          <span style={{ color: 'var(--color-text-muted)' }}>
            RPA 연결됨
            {lastRpaTime && ` · 마지막 전송: ${lastRpaTime}`}
          </span>
        </div>
        <span style={{ color: 'var(--color-text-muted)' }}>전송 시 PMS 자동 반영</span>
      </div>

      </div>{/* /list tab */}

      {/* ── 프로모션 달력 탭 ── */}
      {activeTab === 'promo-cal' && <PromoCalendarView />}

      {/* ── 요금 달력 탭 ── */}
      {activeTab === 'rate-cal' && <RateCalendarView />}

      {/* ── 모달 ── */}
      {/* 업로드 오류 모달 */}
      {showErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowErrorModal(false)} />
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>업로드 오류 확인</p>
              <button onClick={() => setShowErrorModal(false)} className="text-brand-muted hover:text-brand-text"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-2 max-h-60 overflow-y-auto">
              {uploadErrors.map((e, i) => (
                <p key={i} className="text-xs" style={{ color: '#F6AD55' }}>⚠ {e}</p>
              ))}
              {pendingRows.length > 0 && (
                <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                  유효한 {pendingRows.length}행은 업로드 가능합니다.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--color-border-default)' }}>
              <button onClick={() => setShowErrorModal(false)} className="px-4 py-1.5 text-xs text-brand-muted">취소</button>
              {pendingRows.length > 0 && (
                <button
                  onClick={() => { setShowErrorModal(false); runUpload(pendingRows) }}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
                  무시하고 업로드
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Segmentation 모달 (OCC 픽업 클릭) */}
      {segModalDate && (() => {
        const y = Number(segModalDate.slice(0, 4))
        const m = Number(segModalDate.slice(5, 7))
        const d = Number(segModalDate.slice(8, 10))
        return (
          <SegmentationModal
            open={true}
            onClose={() => setSegModalDate(null)}
            year={y}
            month={m}
            day={d}
            roomCount={roomCount}
          />
        )
      })()}

      {showStratModal && (
        <StrategyModal hotelId={hotelId} profileId={profileId}
          onClose={() => setShowStratModal(false)}
          onCreated={s => {
            setShowStratModal(false)
            setStrategyId(s.id)
            setStayStart(s.stay_start)
            setStayEnd(s.stay_end)
            queryClient.invalidateQueries({ queryKey: ['s01_rate_strategy', hotelId] })
          }} />
      )}
      {showPromoModal && (
        <PromotionModal hotelId={hotelId} strategyId={effectiveStratId}
          profileId={profileId} roomTypes={roomTypes}
          onClose={() => setShowPromoModal(false)}
          onCreated={() => {
            setShowPromoModal(false)
            queryClient.invalidateQueries({ queryKey: ['s03_rate_promotion', hotelId, effectiveStratId] })
          }} />
      )}
    </div>
  )
}
