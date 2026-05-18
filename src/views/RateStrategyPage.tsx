'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, ChevronDown, LayoutList, LayoutGrid, X, Save,
  Tag, Loader2, AlertCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHotel } from '@/contexts/HotelContext'
import PageShell from '@/components/PageShell'

// ── Types ─────────────────────────────────────────────────────────────────────

type StrategyStatus = 'draft' | 'active' | 'inactive'
type DiscountType   = 'pct' | 'amount' | 'fixed'
type DateType       = 'single' | 'range'

interface Strategy {
  id:          string
  hotel_id:    string
  name:        string
  description: string | null
  sale_start:  string
  sale_end:    string
  stay_start:  string
  stay_end:    string
  status:      StrategyStatus
  created_by:  string
  updated_by:  string
  created_at:  string
  updated_at:  string
}

interface RateDetail {
  id:             string
  hotel_id:       string
  strategy_id:    string
  room_type_code: string
  date_type:      DateType
  stay_date:      string | null
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
  description:    string | null
  room_type_code: string | null
  discount_type:  DiscountType
  discount_value: number
  sale_start:     string | null
  sale_end:       string | null
  stay_start:     string
  stay_end:       string
  min_stay:       number | null
  max_stay:       number | null
  status:         string
}

interface RoomType {
  room_type_code:        string
  room_type_description: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(n: number | null | undefined): string {
  if (n == null) return ''
  return n.toLocaleString('ko-KR')
}

function parseNumber(s: string): number {
  return Number(s.replace(/,/g, '')) || 0
}

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur  = new Date(start)
  const last = new Date(end)
  while (cur <= last) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function getDayOfWeek(dateStr: string): string {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return days[new Date(dateStr).getDay()]
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr).getDay()
  return day === 0 || day === 6
}

function calcPromoRate(newRate: number, promo: Promotion): number {
  if (promo.discount_type === 'pct')    return Math.round(newRate * (1 - promo.discount_value / 100))
  if (promo.discount_type === 'amount') return newRate - promo.discount_value
  if (promo.discount_type === 'fixed')  return promo.discount_value
  return newRate
}

function todayStr(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// ── DiffBadge ─────────────────────────────────────────────────────────────────

function DiffBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-brand-muted text-[11px]">—</span>
  return (
    <span style={{ color: pct >= 0 ? '#00A86B' : '#E53E3E', fontSize: 11 }}>
      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StrategyStatus }) {
  const map: Record<StrategyStatus, { label: string; color: string; bg: string }> = {
    active:   { label: '활성',  color: '#00A86B', bg: 'rgba(0,168,107,0.12)' },
    draft:    { label: '초안',  color: '#F6AD55', bg: 'rgba(246,173,85,0.12)' },
    inactive: { label: '비활성', color: 'var(--color-text-muted)', bg: 'var(--color-bg-tertiary)' },
  }
  const s = map[status]
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  )
}

// ── Strategy Create Modal ─────────────────────────────────────────────────────

interface StrategyModalProps {
  hotelId:  string
  profileId: string
  onClose:  () => void
  onCreated: (s: Strategy) => void
}

function StrategyModal({ hotelId, profileId, onClose, onCreated }: StrategyModalProps) {
  const [form, setForm] = useState({
    name:        '',
    description: '',
    sale_start:  '',
    sale_end:    '',
    stay_start:  '',
    stay_end:    '',
    status:      'draft' as StrategyStatus,
  })
  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState<string | null>(null)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit() {
    if (!form.name || !form.sale_start || !form.sale_end || !form.stay_start || !form.stay_end) {
      setError('필수 항목을 모두 입력하세요.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { data, error: e } = await (supabase as any)
        .from('s01_rate_strategy')
        .insert({ ...form, hotel_id: hotelId, created_by: profileId, updated_by: profileId })
        .select()
        .single()
      if (e) throw e
      onCreated(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors'
  const inputStyle = {
    background: 'var(--color-bg-tertiary)',
    border:     '1px solid var(--color-border-default)',
    color:      'var(--color-text-primary)',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl flex flex-col"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>전략 생성</p>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(229,62,62,0.08)', color: '#E53E3E' }}>
              <AlertCircle size={13} />
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-brand-muted">전략명 *</label>
            <input className={inputCls} style={inputStyle} value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="예: 여름 성수기 전략" />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-brand-muted">설명</label>
            <textarea className={inputCls} style={{ ...inputStyle, resize: 'none' }} rows={2}
              value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="전략 설명 (선택)" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-brand-muted">판매 시작일 *</label>
              <input type="date" className={inputCls} style={inputStyle}
                value={form.sale_start} onChange={e => set('sale_start', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-brand-muted">판매 종료일 *</label>
              <input type="date" className={inputCls} style={inputStyle}
                value={form.sale_end} onChange={e => set('sale_end', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-brand-muted">투숙 시작일 *</label>
              <input type="date" className={inputCls} style={inputStyle}
                value={form.stay_start} onChange={e => set('stay_start', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-brand-muted">투숙 종료일 *</label>
              <input type="date" className={inputCls} style={inputStyle}
                value={form.stay_end} onChange={e => set('stay_end', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-brand-muted">상태</label>
            <select className={inputCls} style={inputStyle}
              value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="draft">초안 (draft)</option>
              <option value="active">활성 (active)</option>
              <option value="inactive">비활성 (inactive)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4"
          style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs text-brand-muted hover:text-brand-text transition-colors">
            취소
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            생성
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Promotion Modal ───────────────────────────────────────────────────────────

interface PromotionModalProps {
  hotelId:    string
  strategyId: string
  profileId:  string
  roomTypes:  RoomType[]
  onClose:    () => void
  onCreated:  () => void
}

function PromotionModal({ hotelId, strategyId, profileId, roomTypes, onClose, onCreated }: PromotionModalProps) {
  const [form, setForm] = useState({
    name:           '',
    description:    '',
    room_type_code: '' as string | null,
    discount_type:  'pct' as DiscountType,
    discount_value: '',
    sale_start:     '',
    sale_end:       '',
    stay_start:     '',
    stay_end:       '',
    min_stay:       '',
    max_stay:       '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit() {
    if (!form.name || !form.discount_value || !form.stay_start || !form.stay_end) {
      setError('필수 항목을 모두 입력하세요.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { error: e } = await (supabase as any)
        .from('s03_rate_promotion')
        .insert({
          hotel_id:       hotelId,
          strategy_id:    strategyId,
          name:           form.name,
          description:    form.description || null,
          room_type_code: form.room_type_code || null,
          discount_type:  form.discount_type,
          discount_value: parseNumber(form.discount_value),
          sale_start:     form.sale_start || null,
          sale_end:       form.sale_end   || null,
          stay_start:     form.stay_start,
          stay_end:       form.stay_end,
          min_stay:       form.min_stay ? Number(form.min_stay) : null,
          max_stay:       form.max_stay ? Number(form.max_stay) : null,
          status:         'active',
          created_by:     profileId,
          updated_by:     profileId,
        })
      if (e) throw e
      onCreated()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls   = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors'
  const inputStyle = {
    background: 'var(--color-bg-tertiary)',
    border:     '1px solid var(--color-border-default)',
    color:      'var(--color-text-primary)',
  }

  const discountLabel: Record<DiscountType, string> = {
    pct:    '정률 (%)',
    amount: '정액 (원)',
    fixed:  '고정 요금',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl flex flex-col max-h-[90vh] overflow-hidden"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>프로모션 추가</p>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(229,62,62,0.08)', color: '#E53E3E' }}>
              <AlertCircle size={13} />{error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-brand-muted">프로모션명 *</label>
            <input className={inputCls} style={inputStyle} value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="예: 조기 예약 할인" />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-brand-muted">객실타입 (미선택 시 전체 적용)</label>
            <select className={inputCls} style={inputStyle}
              value={form.room_type_code ?? ''} onChange={e => set('room_type_code', e.target.value)}>
              <option value="">전체</option>
              {roomTypes.map(rt => (
                <option key={rt.room_type_code} value={rt.room_type_code}>
                  {rt.room_type_code} - {rt.room_type_description}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-brand-muted">할인 방식 *</label>
              <select className={inputCls} style={inputStyle}
                value={form.discount_type} onChange={e => set('discount_type', e.target.value)}>
                {(Object.keys(discountLabel) as DiscountType[]).map(k => (
                  <option key={k} value={k}>{discountLabel[k]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-brand-muted">할인값 *</label>
              <input className={inputCls} style={inputStyle}
                value={form.discount_value} onChange={e => set('discount_value', e.target.value)}
                placeholder={form.discount_type === 'pct' ? '10' : '10000'} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-brand-muted">판매 시작일</label>
              <input type="date" className={inputCls} style={inputStyle}
                value={form.sale_start} onChange={e => set('sale_start', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-brand-muted">판매 종료일</label>
              <input type="date" className={inputCls} style={inputStyle}
                value={form.sale_end} onChange={e => set('sale_end', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-brand-muted">투숙 시작일 *</label>
              <input type="date" className={inputCls} style={inputStyle}
                value={form.stay_start} onChange={e => set('stay_start', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-brand-muted">투숙 종료일 *</label>
              <input type="date" className={inputCls} style={inputStyle}
                value={form.stay_end} onChange={e => set('stay_end', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-brand-muted">최소 투숙</label>
              <input type="number" className={inputCls} style={inputStyle}
                value={form.min_stay} onChange={e => set('min_stay', e.target.value)} placeholder="1" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-brand-muted">최대 투숙</label>
              <input type="number" className={inputCls} style={inputStyle}
                value={form.max_stay} onChange={e => set('max_stay', e.target.value)} placeholder="30" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs text-brand-muted hover:text-brand-text transition-colors">
            취소
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            추가
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

  // ── State ──────────────────────────────────────────────────────────────────

  const [otbDate,           setOtbDate]           = useState<string>('')
  const [stayStart,         setStayStart]         = useState<string>('')
  const [stayEnd,           setStayEnd]           = useState<string>('')
  const [saleStart,         setSaleStart]         = useState<string>('')
  const [saleEnd,           setSaleEnd]           = useState<string>('')
  const [selectedRoomType,  setSelectedRoomType]  = useState<string>('')
  const [strategyId,        setStrategyId]        = useState<string>('')
  const [showAllTypes,      setShowAllTypes]       = useState(false)
  const [showStrategyModal, setShowStrategyModal] = useState(false)
  const [showPromoModal,    setShowPromoModal]    = useState(false)

  // 편집 중인 new_rate 셀 값 (key: `${date}__${roomType}`)
  const [editingRates, setEditingRates] = useState<Record<string, string>>({})

  // ── OTB 날짜 목록 ──────────────────────────────────────────────────────────

  const { data: otbDates = [] } = useQuery<string[]>({
    queryKey: ['r02_otb_dates', hotelId],
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('r02_otb')
        .select('update_date')
        .eq('hotel_id', hotelId)
        .order('update_date', { ascending: false })
      if (error) throw error
      return [...new Set(data?.map((d: any) => d.update_date) ?? [])] as string[]
    },
    enabled:   !!hotelId,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (otbDates.length > 0 && !otbDate) setOtbDate(otbDates[0])
  }, [otbDates, otbDate])

  // ── 객실 타입 ──────────────────────────────────────────────────────────────

  const { data: roomTypes = [] } = useQuery<RoomType[]>({
    queryKey: ['c01_room_types', hotelId],
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('c01_room_types')
        .select('room_type_code, room_type_description')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
        .order('room_type_code')
      if (error) throw error
      return data
    },
    enabled:   !!hotelId,
    staleTime: 10 * 60 * 1000,
  })

  useEffect(() => {
    if (roomTypes.length > 0 && !selectedRoomType) setSelectedRoomType(roomTypes[0].room_type_code)
  }, [roomTypes, selectedRoomType])

  // ── 전략 목록 ──────────────────────────────────────────────────────────────

  const { data: strategies = [] } = useQuery<Strategy[]>({
    queryKey: ['s01_rate_strategy', hotelId],
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('s01_rate_strategy')
        .select('*')
        .eq('hotel_id', hotelId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled:   !!hotelId,
    staleTime: 2 * 60 * 1000,
  })

  const currentStrategy = strategies.find(s => s.id === strategyId) ?? strategies[0] ?? null

  useEffect(() => {
    if (strategies.length > 0 && !strategyId) setStrategyId(strategies[0].id)
  }, [strategies, strategyId])

  // ── 요금 상세 ──────────────────────────────────────────────────────────────

  const effectiveStrategyId = currentStrategy?.id ?? ''

  const { data: rateDetails = [], isLoading: ratesLoading } = useQuery<RateDetail[]>({
    queryKey: ['s02_rate_detail', hotelId, effectiveStrategyId],
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('s02_rate_detail')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('strategy_id', effectiveStrategyId)
      if (error) throw error
      return data
    },
    enabled:   !!effectiveStrategyId,
    staleTime: 60 * 1000,
  })

  // ── 프로모션 ───────────────────────────────────────────────────────────────

  const { data: promotions = [] } = useQuery<Promotion[]>({
    queryKey: ['s03_rate_promotion', hotelId, effectiveStrategyId],
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('s03_rate_promotion')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('strategy_id', effectiveStrategyId)
        .eq('status', 'active')
      if (error) throw error
      return data
    },
    enabled:   !!effectiveStrategyId,
    staleTime: 60 * 1000,
  })

  // ── 요금 조회/편집 헬퍼 ───────────────────────────────────────────────────

  function getRateDetail(date: string, roomType: string): RateDetail | undefined {
    return rateDetails.find(r => r.stay_date === date && r.room_type_code === roomType)
  }

  function getPromoRate(date: string, roomType: string, newRate: number): number | null {
    const promo = promotions.find(p =>
      (p.room_type_code === null || p.room_type_code === roomType) &&
      p.stay_start <= date && date <= p.stay_end
    )
    if (!promo) return null
    return calcPromoRate(newRate, promo)
  }

  function getEditKey(date: string, roomType: string) {
    return `${date}__${roomType}`
  }

  function getDisplayRate(date: string, roomType: string): string {
    const key    = getEditKey(date, roomType)
    if (editingRates[key] !== undefined) return editingRates[key]
    const detail = getRateDetail(date, roomType)
    return detail?.new_rate != null ? formatNumber(detail.new_rate) : ''
  }

  // ── 요금 저장 ──────────────────────────────────────────────────────────────

  const saveRate = useCallback(async (date: string, roomType: string, rackRate: number | null, newRateStr: string) => {
    const newRate = parseNumber(newRateStr)
    if (!newRate || !effectiveStrategyId) return
    await (supabase as any)
      .from('s02_rate_detail')
      .upsert({
        hotel_id:       hotelId,
        strategy_id:    effectiveStrategyId,
        room_type_code: roomType,
        date_type:      'single' as DateType,
        stay_date:      date,
        rack_rate:      rackRate,
        new_rate:       newRate,
      }, { onConflict: 'strategy_id,room_type_code,stay_date' })
    queryClient.invalidateQueries({ queryKey: ['s02_rate_detail', hotelId, effectiveStrategyId] })
  }, [hotelId, effectiveStrategyId, queryClient])

  // ── 날짜 목록 ──────────────────────────────────────────────────────────────

  const strategy = currentStrategy
  const stayStartEff = stayStart || strategy?.stay_start || ''
  const stayEndEff   = stayEnd   || strategy?.stay_end   || ''
  const dates = stayStartEff && stayEndEff ? getDateRange(stayStartEff, stayEndEff) : []

  // ── 표시 대상 객실타입 ─────────────────────────────────────────────────────

  const displayRoomTypes = showAllTypes ? roomTypes : roomTypes.filter(rt => rt.room_type_code === selectedRoomType)

  // ── Input style ────────────────────────────────────────────────────────────

  const filterInputStyle = {
    background: 'var(--color-bg-tertiary)',
    border:     '1px solid var(--color-border-default)',
    color:      'var(--color-text-primary)',
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageShell
      title="Rate Strategy"
      subtitle={`OTB 기준: ${otbDate || '—'} · ${currentHotel?.hotel_name ?? ''}`}
      badge="수익 관리"
      actions={
        <button
          onClick={() => setShowStrategyModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
          <Plus size={13} />
          전략 생성
        </button>
      }
    >
      {/* ── 필터 바 ── */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)' }}>

        {/* OTB 기준일 */}
        <div className="space-y-1 min-w-[140px]">
          <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">OTB 기준일</label>
          <div className="relative">
            <select
              className="w-full rounded-lg px-3 py-2 text-sm pr-7 outline-none appearance-none"
              style={filterInputStyle}
              value={otbDate}
              onChange={e => setOtbDate(e.target.value)}>
              {otbDates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
          </div>
        </div>

        {/* 투숙기간 */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">투숙기간</label>
          <div className="flex items-center gap-1.5">
            <input type="date" className="rounded-lg px-3 py-2 text-sm outline-none"
              style={filterInputStyle} value={stayStart} onChange={e => setStayStart(e.target.value)} />
            <span className="text-brand-muted text-xs">~</span>
            <input type="date" className="rounded-lg px-3 py-2 text-sm outline-none"
              style={filterInputStyle} value={stayEnd} onChange={e => setStayEnd(e.target.value)} />
          </div>
        </div>

        {/* 판매기간 */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">판매기간</label>
          <div className="flex items-center gap-1.5">
            <input type="date" className="rounded-lg px-3 py-2 text-sm outline-none"
              style={filterInputStyle} value={saleStart} onChange={e => setSaleStart(e.target.value)} />
            <span className="text-brand-muted text-xs">~</span>
            <input type="date" className="rounded-lg px-3 py-2 text-sm outline-none"
              style={filterInputStyle} value={saleEnd} onChange={e => setSaleEnd(e.target.value)} />
          </div>
        </div>

        {/* 객실타입 */}
        <div className="space-y-1 min-w-[160px]">
          <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">객실타입</label>
          <div className="relative">
            <select
              className="w-full rounded-lg px-3 py-2 text-sm pr-7 outline-none appearance-none"
              style={filterInputStyle}
              value={selectedRoomType}
              onChange={e => setSelectedRoomType(e.target.value)}>
              {roomTypes.map(rt => (
                <option key={rt.room_type_code} value={rt.room_type_code}>
                  {rt.room_type_code} - {rt.room_type_description}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
          </div>
        </div>

        {/* 전략 선택 */}
        {strategies.length > 0 && (
          <div className="space-y-1 min-w-[200px]">
            <label className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">전략</label>
            <div className="relative">
              <select
                className="w-full rounded-lg px-3 py-2 text-sm pr-7 outline-none appearance-none"
                style={filterInputStyle}
                value={strategyId}
                onChange={e => setStrategyId(e.target.value)}>
                {strategies.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* ── KPI 카드 ── */}
      {currentStrategy && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '전략 상태',  value: <StatusBadge status={currentStrategy.status} /> },
            { label: '판매기간',   value: `${currentStrategy.sale_start} ~ ${currentStrategy.sale_end}` },
            { label: '투숙기간',   value: `${currentStrategy.stay_start} ~ ${currentStrategy.stay_end}` },
            { label: '최종 저장',  value: new Date(currentStrategy.updated_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) },
          ].map(card => (
            <div key={card.label} className="rounded-xl p-4 space-y-1.5"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}>
              <p className="text-[11px] font-medium text-brand-muted uppercase tracking-wide">{card.label}</p>
              <div className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── 툴바 ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* 보기 전환 */}
        <div className="flex rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--color-border-default)' }}>
          <button
            onClick={() => setShowAllTypes(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${!showAllTypes ? 'text-black font-medium' : 'text-brand-muted'}`}
            style={{ background: !showAllTypes ? 'var(--gradient-cta)' : 'transparent' }}>
            <LayoutList size={13} />
            기본 보기
          </button>
          <button
            onClick={() => setShowAllTypes(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${showAllTypes ? 'text-black font-medium' : 'text-brand-muted'}`}
            style={{ background: showAllTypes ? 'var(--gradient-cta)' : 'transparent' }}>
            <LayoutGrid size={13} />
            변경 요금 보기
          </button>
        </div>

        {/* 프로모션 추가 */}
        {effectiveStrategyId && (
          <button
            onClick={() => setShowPromoModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', background: 'var(--color-bg-secondary)' }}>
            <Tag size={13} />
            프로모션 추가
          </button>
        )}
      </div>

      {/* ── 메인 테이블 ── */}
      <div className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}>

        {!effectiveStrategyId ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Plus size={28} className="text-brand-muted opacity-40" />
            <p className="text-sm text-brand-muted">전략을 먼저 생성하세요</p>
            <button onClick={() => setShowStrategyModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold mt-1"
              style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
              <Plus size={13} />전략 생성
            </button>
          </div>
        ) : dates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-brand-muted">투숙기간을 설정하면 요금 입력 테이블이 표시됩니다</p>
          </div>
        ) : ratesLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-brand-muted">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">불러오는 중...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: 'var(--color-bg-tertiary)' }}>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-brand-muted uppercase tracking-wide whitespace-nowrap"
                    style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                    날짜
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-brand-muted uppercase tracking-wide"
                    style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                    요일
                  </th>
                  {displayRoomTypes.map(rt => (
                    showAllTypes ? (
                      <>
                        <th key={`${rt.room_type_code}-rack`}
                          className="px-3 py-2.5 text-right text-[11px] font-semibold text-brand-muted uppercase tracking-wide whitespace-nowrap"
                          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                          {rt.room_type_code} 기존
                        </th>
                        <th key={`${rt.room_type_code}-new`}
                          className="px-3 py-2.5 text-right text-[11px] font-semibold text-brand-muted uppercase tracking-wide whitespace-nowrap"
                          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                          {rt.room_type_code} 새요금
                        </th>
                      </>
                    ) : (
                      <>
                        <th key="rack" className="px-3 py-2.5 text-right text-[11px] font-semibold text-brand-muted uppercase tracking-wide whitespace-nowrap"
                          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                          기존 요금
                        </th>
                        <th key="new" className="px-3 py-2.5 text-right text-[11px] font-semibold text-brand-muted uppercase tracking-wide whitespace-nowrap"
                          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                          새 요금
                        </th>
                        <th key="diff" className="px-3 py-2.5 text-right text-[11px] font-semibold text-brand-muted uppercase tracking-wide"
                          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                          변동%
                        </th>
                        <th key="promo" className="px-3 py-2.5 text-right text-[11px] font-semibold text-brand-muted uppercase tracking-wide"
                          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                          프로모션
                        </th>
                      </>
                    )
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map((date, idx) => {
                  const weekend = isWeekend(date)
                  return (
                    <tr key={date}
                      style={{
                        background:  weekend ? 'rgba(246,173,85,0.04)' : 'transparent',
                        borderBottom: '1px solid var(--color-border-default)',
                      }}>
                      <td className="px-4 py-2 text-xs font-mono whitespace-nowrap"
                        style={{ color: 'var(--color-text-primary)' }}>
                        {date}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium"
                        style={{ color: weekend ? '#F6AD55' : 'var(--color-text-muted)' }}>
                        {getDayOfWeek(date)}
                      </td>

                      {displayRoomTypes.map(rt => {
                        const detail   = getRateDetail(date, rt.room_type_code)
                        const key      = getEditKey(date, rt.room_type_code)
                        const dispRate = getDisplayRate(date, rt.room_type_code)
                        const newRate  = detail?.new_rate ?? 0
                        const promoRate = newRate ? getPromoRate(date, rt.room_type_code, newRate) : null

                        if (showAllTypes) {
                          return (
                            <>
                              <td key={`${rt.room_type_code}-rack`} className="px-3 py-2 text-xs text-right text-brand-muted font-mono">
                                {formatNumber(detail?.rack_rate ?? null)}
                              </td>
                              <td key={`${rt.room_type_code}-new`} className="px-3 py-2 text-right">
                                <input
                                  className="w-24 rounded px-2 py-1 text-xs text-right font-mono outline-none"
                                  style={{
                                    background: 'var(--color-bg-tertiary)',
                                    border:     '1px solid transparent',
                                    color:      'var(--color-text-primary)',
                                  }}
                                  value={dispRate}
                                  onChange={e => setEditingRates(r => ({ ...r, [key]: e.target.value }))}
                                  onBlur={() => {
                                    if (editingRates[key] !== undefined) {
                                      saveRate(date, rt.room_type_code, detail?.rack_rate ?? null, editingRates[key])
                                      setEditingRates(r => { const n = { ...r }; delete n[key]; return n })
                                    }
                                  }}
                                  placeholder="—"
                                />
                              </td>
                            </>
                          )
                        }

                        return (
                          <>
                            <td key="rack" className="px-3 py-2 text-xs text-right text-brand-muted font-mono">
                              {formatNumber(detail?.rack_rate ?? null)}
                            </td>
                            <td key="new" className="px-3 py-2 text-right">
                              <input
                                className="w-28 rounded px-2 py-1 text-xs text-right font-mono outline-none transition-colors"
                                style={{
                                  background: 'var(--color-bg-tertiary)',
                                  border:     '1px solid transparent',
                                  color:      'var(--color-text-primary)',
                                }}
                                value={dispRate}
                                onChange={e => setEditingRates(r => ({ ...r, [key]: e.target.value }))}
                                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-accent-primary)'}
                                onBlur={e => {
                                  e.currentTarget.style.borderColor = 'transparent'
                                  if (editingRates[key] !== undefined) {
                                    saveRate(date, rt.room_type_code, detail?.rack_rate ?? null, editingRates[key])
                                    setEditingRates(r => { const n = { ...r }; delete n[key]; return n })
                                  }
                                }}
                                placeholder="—"
                              />
                            </td>
                            <td key="diff" className="px-3 py-2 text-right">
                              <DiffBadge pct={detail?.diff_pct ?? null} />
                            </td>
                            <td key="promo" className="px-3 py-2 text-right font-mono text-xs"
                              style={{ color: promoRate ? 'var(--color-accent-primary)' : 'var(--color-text-muted)' }}>
                              {promoRate ? formatNumber(promoRate) : '—'}
                            </td>
                          </>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 모달 ── */}
      {showStrategyModal && (
        <StrategyModal
          hotelId={hotelId}
          profileId={profileId}
          onClose={() => setShowStrategyModal(false)}
          onCreated={s => {
            setShowStrategyModal(false)
            setStrategyId(s.id)
            setStayStart(s.stay_start)
            setStayEnd(s.stay_end)
            queryClient.invalidateQueries({ queryKey: ['s01_rate_strategy', hotelId] })
          }}
        />
      )}

      {showPromoModal && (
        <PromotionModal
          hotelId={hotelId}
          strategyId={effectiveStrategyId}
          profileId={profileId}
          roomTypes={roomTypes}
          onClose={() => setShowPromoModal(false)}
          onCreated={() => {
            setShowPromoModal(false)
            queryClient.invalidateQueries({ queryKey: ['s03_rate_promotion', hotelId, effectiveStrategyId] })
          }}
        />
      )}
    </PageShell>
  )
}
