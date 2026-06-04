'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, ChevronDown, X, Save, Tag, Loader2, Send,
  CheckSquare, Square, TrendingUp, TrendingDown,
  Minus, Activity,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHotel } from '@/contexts/HotelContext'
import PageShell from '@/components/PageShell'

// ── Types ─────────────────────────────────────────────────────────────────────

type StrategyStatus = 'draft' | 'active' | 'inactive'
type DiscountType   = 'pct' | 'amount' | 'fixed'
type ChangeMode     = '%' | '+-' | 'direct'

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
  stay_date:      string
  rate_code:      string
  rack_rate:      number | null
  new_rate:       number | null
  change_mode:    ChangeMode | null
  change_value:   number | null
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
}

interface OtbRow {
  business_date: string
  room_type_code: string
  nights:        number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('ko-KR')

const fmtShort = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n)

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const getDow = (d: string) => DAY_LABELS[new Date(d + 'T00:00:00').getDay()]
const isWeekend = (d: string) => { const w = new Date(d + 'T00:00:00').getDay(); return w === 0 || w === 6 }

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

// ── StrategyModal ──────────────────────────────────────────────────────────────

function StrategyModal({ hotelId, profileId, onClose, onCreated }: {
  hotelId: string; profileId: string
  onClose: () => void; onCreated: (s: Strategy) => void
}) {
  const [form, setForm] = useState({
    name: '', description: '',
    sale_start: '', sale_end: '',
    stay_start: '', stay_end: '',
    status: 'draft' as StrategyStatus,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm outline-none'
  const inputStyle = { background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }

  async function submit() {
    if (!form.name || !form.stay_start || !form.stay_end) { setErr('전략 이름과 투숙기간은 필수입니다.'); return }
    setSaving(true); setErr(null)
    try {
      const { data, error } = await (supabase as any)
        .from('s01_rate_strategy')
        .insert({ ...form, hotel_id: hotelId, created_by: profileId, updated_by: profileId })
        .select().single()
      if (error) throw error
      onCreated(data)
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
        <div className="px-6 py-4 space-y-3 overflow-y-auto max-h-[70vh]">
          {err && <p className="text-xs text-status-negative px-3 py-2 rounded-lg" style={{ background: 'var(--negative-bg)' }}>{err}</p>}
          <div><label className="text-xs text-brand-muted mb-1 block">전략 이름 *</label>
            <input className={inputCls} style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="예: 여름 성수기 전략" /></div>
          <div><label className="text-xs text-brand-muted mb-1 block">설명</label>
            <textarea className={inputCls} style={inputStyle} rows={2} value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-brand-muted mb-1 block">투숙 시작 *</label>
              <input type="date" className={inputCls} style={inputStyle} value={form.stay_start} onChange={e => set('stay_start', e.target.value)} /></div>
            <div><label className="text-xs text-brand-muted mb-1 block">투숙 종료 *</label>
              <input type="date" className={inputCls} style={inputStyle} value={form.stay_end} onChange={e => set('stay_end', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-brand-muted mb-1 block">판매 시작</label>
              <input type="date" className={inputCls} style={inputStyle} value={form.sale_start} onChange={e => set('sale_start', e.target.value)} /></div>
            <div><label className="text-xs text-brand-muted mb-1 block">판매 종료</label>
              <input type="date" className={inputCls} style={inputStyle} value={form.sale_end} onChange={e => set('sale_end', e.target.value)} /></div>
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
    name: '', room_type_code: '',
    discount_type: 'pct' as DiscountType, discount_value: '',
    stay_start: '', stay_end: '', status: 'active',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm outline-none'
  const inputStyle = { background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }

  async function submit() {
    if (!form.name || !form.discount_value) { setErr('이름과 할인값은 필수입니다.'); return }
    setSaving(true); setErr(null)
    try {
      const { error } = await (supabase as any)
        .from('s03_rate_promotion')
        .insert({
          hotel_id: hotelId, strategy_id: strategyId,
          name: form.name,
          room_type_code: form.room_type_code || null,
          discount_type: form.discount_type,
          discount_value: Number(form.discount_value),
          stay_start: form.stay_start || null,
          stay_end: form.stay_end || null,
          status: form.status,
        })
      if (error) throw error
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
        <div className="px-6 py-4 space-y-3">
          {err && <p className="text-xs text-status-negative px-3 py-2 rounded-lg" style={{ background: 'var(--negative-bg)' }}>{err}</p>}
          <div><label className="text-xs text-brand-muted mb-1 block">프로모션 이름 *</label>
            <input className={inputCls} style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div>
            <label className="text-xs text-brand-muted mb-1 block">객실 타입 (비어있으면 전체)</label>
            <select className={inputCls} style={inputStyle} value={form.room_type_code} onChange={e => set('room_type_code', e.target.value)}>
              <option value="">전체</option>
              {roomTypes.map(rt => <option key={rt.room_type_code} value={rt.room_type_code}>{rt.room_type_code}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-brand-muted mb-1 block">할인 유형</label>
              <select className={inputCls} style={inputStyle} value={form.discount_type} onChange={e => set('discount_type', e.target.value)}>
                <option value="pct">% 할인</option>
                <option value="amount">금액 할인</option>
                <option value="fixed">고정 요금</option>
              </select></div>
            <div><label className="text-xs text-brand-muted mb-1 block">할인 값 *</label>
              <input type="number" className={inputCls} style={inputStyle} value={form.discount_value} onChange={e => set('discount_value', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-brand-muted mb-1 block">투숙 시작</label>
              <input type="date" className={inputCls} style={inputStyle} value={form.stay_start} onChange={e => set('stay_start', e.target.value)} /></div>
            <div><label className="text-xs text-brand-muted mb-1 block">투숙 종료</label>
              <input type="date" className={inputCls} style={inputStyle} value={form.stay_end} onChange={e => set('stay_end', e.target.value)} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <button onClick={onClose} className="px-4 py-2 text-xs text-brand-muted">취소</button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Tag size={12} />}추가
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RateStrategyPage() {
  const { profile }      = useAuth()
  const { currentHotel } = useHotel()
  const queryClient      = useQueryClient()
  const hotelId          = currentHotel?.id ?? ''
  const profileId        = profile?.id ?? ''

  // ── Filter State ───────────────────────────────────────────────────────────
  const [otbDate,         setOtbDate]         = useState('')
  const [stayStart,       setStayStart]       = useState('')
  const [stayEnd,         setStayEnd]         = useState('')
  const [selRoomType,     setSelRoomType]     = useState('')
  const [strategyId,      setStrategyId]      = useState('')
  const [showAllTypes,    setShowAllTypes]    = useState(false)

  // ── UI State ───────────────────────────────────────────────────────────────
  const [showStratModal,  setShowStratModal]  = useState(false)
  const [showPromoModal,  setShowPromoModal]  = useState(false)
  const [selectedDates,   setSelectedDates]   = useState<string[]>([])
  const [bulkValue,       setBulkValue]       = useState('')
  const [editCell,        setEditCell]        = useState<{ date: string; rateCode: string; rt: string } | null>(null)
  const [editVal,         setEditVal]         = useState('')
  const [lastRpaTime,     setLastRpaTime]     = useState<string | null>(null)
  const [rpaSending,      setRpaSending]      = useState(false)

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

  const { data: roomTypes = [] } = useQuery<RoomType[]>({
    queryKey: ['c01_room_types', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c01_room_types')
        .select('room_type_code, room_type_description, no_rooms')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
        .order('room_type_code')
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

  // OTB data for OCC
  const stayStartEff = stayStart || currentStrategy?.stay_start || ''
  const stayEndEff   = stayEnd   || currentStrategy?.stay_end   || ''

  const { data: otbRows = [] } = useQuery<OtbRow[]>({
    queryKey: ['r02_otb', hotelId, otbDate, stayStartEff, stayEndEff],
    queryFn: async () => {
      if (!otbDate || !stayStartEff || !stayEndEff) return []
      const { data, error } = await (supabase as any)
        .from('r02_otb')
        .select('business_date, room_type_code, nights')
        .eq('hotel_id', hotelId)
        .eq('update_date', otbDate)
        .gte('business_date', stayStartEff)
        .lte('business_date', stayEndEff)
      if (error) throw error
      return data
    },
    enabled: !!hotelId && !!otbDate && !!stayStartEff && !!stayEndEff,
    staleTime: 5 * 60 * 1000,
  })

  // ── Derived Data ────────────────────────────────────────────────────────────

  const dates = stayStartEff && stayEndEff ? getDateRange(stayStartEff, stayEndEff) : []
  const displayRTs = showAllTypes ? roomTypes : roomTypes.filter(rt => rt.room_type_code === selRoomType)

  // OCC map: date → occ%
  const occMap = useMemo(() => {
    const map: Record<string, number> = {}
    if (!roomCount) return map
    const nightsMap: Record<string, number> = {}
    for (const r of otbRows) {
      nightsMap[r.business_date] = (nightsMap[r.business_date] ?? 0) + r.nights
    }
    for (const [d, nights] of Object.entries(nightsMap)) {
      map[d] = (nights / roomCount) * 100
    }
    return map
  }, [otbRows, roomCount])

  // rate lookup
  const rateMap = useMemo(() => {
    const map: Record<string, RateDetail> = {}
    for (const r of rateDetails) {
      map[`${r.stay_date}__${r.room_type_code}__${r.rate_code}`] = r
    }
    return map
  }, [rateDetails])

  const getRate = (date: string, rt: string, code: string) =>
    rateMap[`${date}__${rt}__${code}`]

  // summary stats
  const { up, down, flat, avgPct } = useMemo(() => {
    let up = 0, down = 0, flat = 0, sumPct = 0, cnt = 0
    for (const r of rateDetails) {
      if (r.rate_code !== 'change') continue
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

  const avgAdr = useMemo(() => {
    let nights = 0, rev = 0
    for (const r of otbRows) {
      nights += r.nights
      // rev not available in simplified query — skip ADR
    }
    return nights > 0 ? null : null // placeholder
  }, [otbRows])

  // ── Save Rate Cell ──────────────────────────────────────────────────────────

  const saveRateCell = useCallback(async (
    date: string, rt: string, rateCode: string,
    mode: ChangeMode, val: string,
    rackRate: number | null
  ) => {
    const numVal = parseFloat(val.replace(/,/g, ''))
    if (isNaN(numVal) || !effectiveStratId) return
    const newRate = rackRate != null ? calcNewRate(rackRate, mode, numVal) : (mode === 'direct' ? numVal : null)
    await (supabase as any)
      .from('s02_rate_detail')
      .upsert({
        hotel_id: hotelId, strategy_id: effectiveStratId,
        room_type_code: rt, stay_date: date, rate_code: rateCode,
        rack_rate: rackRate, new_rate: newRate,
        change_mode: mode, change_value: numVal,
      }, { onConflict: 'strategy_id,room_type_code,stay_date,rate_code' })
    queryClient.invalidateQueries({ queryKey: ['s02_rate_detail', hotelId, effectiveStratId] })
  }, [hotelId, effectiveStratId, queryClient])

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
        return { hotel_id: hotelId, strategy_id: effectiveStratId, room_type_code: rt.room_type_code, stay_date: date, rate_code: 'change', rack_rate: rack, new_rate: newRate, change_mode: mode, change_value: numVal }
      }).filter(Boolean)
    )
    if (ops.length > 0) {
      await (supabase as any).from('s02_rate_detail').upsert(ops, { onConflict: 'strategy_id,room_type_code,stay_date,rate_code' })
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

  return (
    <PageShell
      title="Rate Strategy"
      subtitle={`${currentHotel?.hotel_name ?? ''} · OTB 기준: ${otbDate || '—'}`}
      badge="수익 관리"
      actions={
        <div className="flex items-center gap-2">
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
      }
    >
      {/* ── 필터 바 ── */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)' }}>
        {/* OTB 기준일 */}
        <div className="space-y-1 min-w-[140px]">
          <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">OTB 기준일</label>
          <div className="relative">
            <select className="w-full rounded-lg px-3 py-2 text-sm pr-7 outline-none appearance-none" style={filterStyle}
              value={otbDate} onChange={e => setOtbDate(e.target.value)}>
              {otbDates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
          </div>
        </div>
        {/* 투숙기간 */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">투숙기간</label>
          <div className="flex items-center gap-1.5">
            <input type="date" className="rounded-lg px-3 py-2 text-sm outline-none" style={filterStyle}
              value={stayStart} onChange={e => setStayStart(e.target.value)} />
            <span className="text-brand-muted text-xs">~</span>
            <input type="date" className="rounded-lg px-3 py-2 text-sm outline-none" style={filterStyle}
              value={stayEnd} onChange={e => setStayEnd(e.target.value)} />
          </div>
        </div>
        {/* 객실타입 */}
        <div className="space-y-1 min-w-[160px]">
          <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">객실타입</label>
          <div className="relative">
            <select className="w-full rounded-lg px-3 py-2 text-sm pr-7 outline-none appearance-none" style={filterStyle}
              value={selRoomType} onChange={e => setSelRoomType(e.target.value)}>
              {roomTypes.map(rt => <option key={rt.room_type_code} value={rt.room_type_code}>{rt.room_type_code}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
          </div>
        </div>
        {/* 전략 선택 */}
        {strategies.length > 0 && (
          <div className="space-y-1 min-w-[200px]">
            <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">전략</label>
            <div className="relative">
              <select className="w-full rounded-lg px-3 py-2 text-sm pr-7 outline-none appearance-none" style={filterStyle}
                value={strategyId} onChange={e => setStrategyId(e.target.value)}>
                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
            </div>
          </div>
        )}
        {/* 전체 타입 토글 */}
        <button onClick={() => setShowAllTypes(v => !v)}
          className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: showAllTypes ? 'var(--accent-badge-bg)' : 'var(--color-bg-tertiary)',
            border: showAllTypes ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-default)',
            color: showAllTypes ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
          }}>
          전체 타입
        </button>
        {/* 프로모션 추가 */}
        {effectiveStratId && (
          <button onClick={() => setShowPromoModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
            style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', background: 'var(--color-bg-secondary)' }}>
            <Tag size={12} />프로모션
          </button>
        )}
      </div>

      {/* ── 일괄 입력 바 ── */}
      {selectedDates.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
          style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)' }}>
          <CheckSquare size={14} style={{ color: 'var(--color-accent-primary)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--color-accent-primary)' }}>
            {selectedDates.length}일 선택됨
          </span>
          <span className="text-xs text-brand-muted">일괄 입력</span>
          <input className="rounded-lg px-2 py-1 text-xs w-24 outline-none" style={filterStyle}
            value={bulkValue} onChange={e => setBulkValue(e.target.value)}
            placeholder={`값 (${colMode['change']})`} />
          <button onClick={applyBulk}
            className="px-3 py-1 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>적용</button>
          <button onClick={() => setSelectedDates([])} className="text-brand-muted hover:text-brand-text">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── 메인 레이아웃 (테이블 + 사이드패널) ── */}
      <div className="flex gap-4 items-start">

        {/* ── 테이블 영역 ── */}
        <div className="flex-1 min-w-0 rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}>

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
                      OCC
                    </th>
                    {/* 기존 요금 */}
                    {displayRTs.map(rt => (
                      <th key={`${rt.room_type_code}-rack`}
                        className="px-3 py-2.5 text-right font-semibold text-brand-muted uppercase tracking-wide whitespace-nowrap"
                        style={{ borderRight: '1px solid var(--color-border-default)' }}>
                        {showAllTypes ? `${rt.room_type_code} 기존` : '기존 요금'}
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
                    {/* 메모 */}
                    <th className="px-3 py-2.5 text-left font-semibold text-brand-muted uppercase tracking-wide"
                      style={{ borderLeft: DIVIDER }}>메모</th>
                  </tr>
                </thead>
                <tbody>
                  {dates.map(date => {
                    const weekend = isWeekend(date)
                    const occ = occMap[date] ?? null
                    const isSelected = selectedDates.includes(date)

                    return (
                      <tr key={date}
                        style={{
                          background: isSelected
                            ? 'rgba(0,229,160,0.06)'
                            : weekend ? 'rgba(0,229,160,0.03)' : 'transparent',
                          borderBottom: '1px solid var(--color-border-default)',
                        }}>
                        {/* 체크박스 */}
                        <td className="px-2 py-2 sticky left-0 z-10"
                          style={{ background: isSelected ? 'rgba(0,229,160,0.06)' : weekend ? 'rgba(0,229,160,0.03)' : 'var(--color-bg-surface)', borderRight: DIVIDER }}>
                          <input type="checkbox" checked={isSelected}
                            onChange={e => setSelectedDates(prev =>
                              e.target.checked ? [...prev, date] : prev.filter(d => d !== date)
                            )} className="cursor-pointer" />
                        </td>
                        {/* 날짜 */}
                        <td className="px-3 py-2 whitespace-nowrap sticky left-8 z-10"
                          style={{ background: isSelected ? 'rgba(0,229,160,0.06)' : weekend ? 'rgba(0,229,160,0.03)' : 'var(--color-bg-surface)', borderRight: DIVIDER }}>
                          <span className="font-semibold font-mono" style={{ color: 'var(--color-text-primary)' }}>
                            {date.slice(5)}
                          </span>
                          <span className="ml-1.5 text-[11px]"
                            style={{ color: weekend ? 'var(--color-accent-primary)' : 'var(--color-text-muted)' }}>
                            {getDow(date)}
                          </span>
                        </td>
                        {/* OCC */}
                        <td className="px-3 py-2" style={{ borderRight: DIVIDER }}>
                          <OccBar pct={occ} />
                        </td>
                        {/* 기존 요금 */}
                        {displayRTs.map(rt => {
                          const base = getRate(date, rt.room_type_code, 'base')
                          return (
                            <td key={`${rt.room_type_code}-rack`}
                              className="px-3 py-2 text-right font-mono"
                              style={{ color: 'var(--color-text-muted)', borderRight: '1px solid var(--color-border-default)' }}>
                              {fmt(base?.rack_rate)}
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
                                      setEditVal(newR != null ? String(detail?.change_value ?? newR) : '')
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

      {/* ── 모달 ── */}
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
    </PageShell>
  )
}
