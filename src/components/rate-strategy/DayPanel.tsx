'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, RotateCcw, Save, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toLocalYMD } from '@/utils/dateLocal'
import { FormDatePicker } from '@/components/DatePicker'
import { BarRateAddModal } from './BarRateAddModal'
import { CustomRateModal } from './CustomRateModal'
import * as XLSX from 'xlsx'

function ExcelIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 전체 배경 */}
      <rect width="24" height="24" rx="3" fill="#1E6E42" />
      {/* 왼쪽 X 영역 */}
      <rect x="1" y="1" width="12" height="22" rx="2" fill="#217346" />
      {/* X 글자 */}
      <path d="M3 5.5L6.5 11.5L3 17.5H5.2L7.5 13.2L9.8 17.5H12L8.5 11.5L12 5.5H9.8L7.5 9.8L5.2 5.5H3Z" fill="white" />
      {/* 오른쪽 그리드 영역 */}
      <rect x="13" y="4" width="9" height="16" rx="1" fill="white" fillOpacity="0.15" />
      <rect x="13" y="4" width="9" height="16" rx="1" stroke="white" strokeWidth="0.6" strokeOpacity="0.6" />
      {/* 가로 선 */}
      <line x1="13" y1="8.5"  x2="22" y2="8.5"  stroke="white" strokeWidth="0.5" strokeOpacity="0.7" />
      <line x1="13" y1="12"   x2="22" y2="12"    stroke="white" strokeWidth="0.5" strokeOpacity="0.7" />
      <line x1="13" y1="15.5" x2="22" y2="15.5"  stroke="white" strokeWidth="0.5" strokeOpacity="0.7" />
      {/* 세로 선 */}
      <line x1="17" y1="4"    x2="17" y2="20"    stroke="white" strokeWidth="0.5" strokeOpacity="0.7" />
    </svg>
  )
}

// 프로모션 색상 (ID 기반 고정) — RateCalendarView 와 동일
const PROMO_COLORS = [
  '#00B883', '#534AB7', '#BA7517', '#E24B4A',
  '#185FA5', '#0F6E56', '#993556', '#638522',
]
function promoColorById(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return PROMO_COLORS[Math.abs(hash) % PROMO_COLORS.length]
}
// 할인 표기 (discount_type/value 기반)
function fmtDisc(dt: string, dv: number): string {
  return dt === 'pct'    ? `-${dv}%`
       : dt === 'amount' ? `-${Math.round(dv / 1000)}K`
       : dt === 'addon'  ? `+${Math.round(dv / 1000)}K`
       : `${Math.round(dv / 1000)}K`
}

// 프로모션 라이프사이클 상태 (KST today 기준) — 투숙·판매 기간 모두 유효해야 '적용중'
type PromoStatus = 'active' | 'ended' | 'upcoming'
function promoStatus(raw: any, today: string): PromoStatus {
  const saleStart = raw?.sale_start ?? null
  const saleEnd   = raw?.sale_end ?? null
  const stayEnd   = (!raw?.stay_end || raw.stay_end === '2000-01-01') ? null : raw.stay_end
  if (saleStart && saleStart > today) return 'upcoming'          // 판매 시작 전
  const stayValid = stayEnd === null || stayEnd >= today
  const saleValid = saleEnd === null || saleEnd >= today
  return (stayValid && saleValid) ? 'active' : 'ended'
}
const PROMO_BADGE: Record<PromoStatus, { label: string; color: string }> = {
  active:   { label: '적용중', color: '#00E5A0' },
  ended:    { label: '종료',   color: '#888' },
  upcoming: { label: '예정',   color: '#F59E0B' },
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MonthPromo {
  id:        string
  name:      string
  type:      string
  rooms:     string
  disc:      string
  color:     string
  dateRange: string
  dates:     string[]
  _raw?:     any
}

export interface PromoFormData {
  name:           string
  description:    string
  min_stay:       string
  max_stay:       string
  discount_type:  string
  discount_value: string
  stay_start:     string
  stay_end:       string
  sale_start:     string
  sale_end:       string
  status:         string
}

interface DayPanelProps {
  day:               string
  selectedBar:       number | null
  onSelectBar:       (rate: number | null) => void
  monthPromos:       MonthPromo[]
  showAddPromo:      boolean
  promoForm:         PromoFormData
  onToggleAddPromo:  () => void
  onPromoFormChange: (field: string, val: string) => void
  onDeletePromo:     (id: string) => void
  onPromoSaved:      () => void
  onExcelSaved?:     () => void
  hotelId:           string
  year:              number
  month:             number
  roomTypes:         { room_type_code: string; room_type_description: string }[]
  selectedDates:     string[]
  barRateMap:        Record<number, { base_rate: number }>
  onSave:            () => void
  onResetDates:      () => void
  isSaving:          boolean
  saveToast?:        string | null
  onPrevMonth:          () => void
  onNextMonth:          () => void
  onOpenSaleDatePicker: () => void
  saleDate:             string
  onSaleDateChange?:    (v: string) => void
}

interface ExcelPreviewRow {
  date:        string   // 'YYYY-MM-DD'
  currentRate: number | null
  newRate:     number
  isChanged:   boolean
}

// ── Internal types ────────────────────────────────────────────────────────────

interface BarRateRow {
  id:          string
  rate:        number
  sort_order:  number
  is_favorite: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DayPanel({
  day, selectedBar, onSelectBar,
  monthPromos, showAddPromo, promoForm,
  onToggleAddPromo, onPromoFormChange, onDeletePromo, onPromoSaved, onExcelSaved,
  hotelId, year, month, roomTypes, barRateMap,
  selectedDates, onSave, onResetDates, isSaving, saveToast,
  onPrevMonth, onNextMonth, onOpenSaleDatePicker, saleDate, onSaleDateChange,
}: DayPanelProps) {
  void onOpenSaleDatePicker  // (구) 원격 트리거 — 현재는 헤더 내 로컬 FormDatePicker 사용
  const saleDateLocalRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data: barRateRows = [] } = useQuery({
    queryKey: ['s05_bar_rate_list', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s05_bar_rate_list')
        .select('id, rate, sort_order, is_favorite')
        .eq('hotel_id', hotelId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId,
  })

  const barList = barRateRows.map((r: any) => r.rate as number)

  const [showAddModal,  setShowAddModal]  = useState(false)
  const [deleteMode,    setDeleteMode]    = useState(false)
  const [stayUnlimited, setStayUnlimited] = useState(false)
  const [saleUnlimited, setSaleUnlimited] = useState(false)
  const [baseRateType,        setBaseRateType]        = useState<'bar' | 'custom'>('bar')
  const [showCustomRateModal, setShowCustomRateModal] = useState(false)
  const [customRatePromoId,   setCustomRatePromoId]   = useState<string | null>(null)
  const [expandedPromos,         setExpandedPromos]         = useState<Set<string>>(new Set())
  const [promoDeleteMode,        setPromoDeleteMode]        = useState(false)
  const [selectedPromoIds,       setSelectedPromoIds]       = useState<Set<string>>(new Set())
  const [showPromoDeleteConfirm, setShowPromoDeleteConfirm] = useState(false)

  const toggleExpand = (id: string) => {
    setExpandedPromos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const [selectedRoomTypes,   setSelectedRoomTypes]   = useState<string[]>([])
  // ── 프로모션 진행중·예정 / 지난 필터 ──
  const promoToday = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })  // 'YYYY-MM-DD' KST
  const [promoFilter,    setPromoFilter]    = useState<'active' | 'past'>('active')
  const [expandedPastId, setExpandedPastId] = useState<string | null>(null)
  const PROMO_SELECT = 'id, name, discount_type, discount_value, room_type_codes, stay_start, stay_end, sale_start, sale_end, status'

  // 진행중·예정 (status='active') — 페이지 진입 시 auto_deactivate_promotions 가 만료분을 inactive 처리.
  // onPromoSaved 의 ['s03_rate_promotion', hotelId] 무효화가 prefix 매칭으로 함께 갱신
  const { data: activeRows = [] } = useQuery({
    queryKey: ['s03_rate_promotion', hotelId, 'active', promoToday],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s03_rate_promotion')
        .select(PROMO_SELECT)
        .eq('hotel_id', hotelId)
        .eq('status', 'active')
        .order('stay_start', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId,
  })

  // 지난 프로모션 (status='inactive') 최근 20개 — 자동 비활성화 + 수동 비활성화 모두 포함
  const { data: pastRows = [] } = useQuery({
    queryKey: ['s03_rate_promotion', hotelId, 'past', promoToday],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s03_rate_promotion')
        .select(PROMO_SELECT)
        .eq('hotel_id', hotelId)
        .eq('status', 'inactive')
        .order('stay_end', { ascending: false })
        .limit(20)
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId,
  })

  const activeItems = (activeRows as any[]).map(p => ({
    id: p.id, name: p.name, color: promoColorById(p.id), disc: fmtDisc(p.discount_type, p.discount_value), _raw: p,
  }))
  const pastItems = (pastRows as any[]).map(p => ({
    id: p.id, name: p.name, color: promoColorById(p.id), disc: fmtDisc(p.discount_type, p.discount_value), _raw: p,
  }))

  const [rtDropOpen,          setRtDropOpen]          = useState(false)
  const [pendingDeleteIds,    setPendingDeleteIds]    = useState<string[]>([])
  const [isChipExpanded,      setIsChipExpanded]      = useState(false)
  const [dragOverFavorite,    setDragOverFavorite]    = useState(false)
  const [draggingId,          setDraggingId]          = useState<string | null>(null)
  const [dragOverAll,            setDragOverAll]            = useState(false)
  const [pendingFavoriteChanges, setPendingFavoriteChanges] = useState<{ id: string; is_favorite: boolean }[]>([])
  const [editingPromo,  setEditingPromo]  = useState<any | null>(null)
  const [packages,      setPackages]      = useState<{ id: string; name: string; rate: number | null }[]>([])
  const [isSavingPromo,   setIsSavingPromo]   = useState(false)
  const [promoErr,        setPromoErr]        = useState<string | null>(null)
  const [excelPreview,    setExcelPreview]    = useState<ExcelPreviewRow[] | null>(null)
  const [isUploadingExcel, setIsUploadingExcel] = useState(false)
  const [excelError,      setExcelError]      = useState<string | null>(null)
  const favoriteAreaRef  = useRef<HTMLDivElement>(null)
  const allAreaRef       = useRef<HTMLDivElement>(null)
  const barRateRowsRef   = useRef<BarRateRow[]>([])
  const ghostRef         = useRef<HTMLDivElement | null>(null)
  const draggingIdRef    = useRef<string | null>(null)

  useEffect(() => {
    barRateRowsRef.current = barRateRows as BarRateRow[]
    // DB 데이터가 갱신되면 이미 반영된 pending 항목 자동 제거
    setPendingFavoriteChanges(prev => {
      if (prev.length === 0) return prev
      const rows = barRateRows as BarRateRow[]
      const stillPending = prev.filter(p => {
        const row = rows.find(r => r.id === p.id)
        return !row || row.is_favorite !== p.is_favorite
      })
      return stillPending.length !== prev.length ? stillPending : prev
    })
  }, [barRateRows])

  const handleAddRates = async (newRates: number[]) => {
    const existing = new Set(barList)
    const toInsert = newRates.filter(r => !existing.has(r))
    if (toInsert.length === 0) return

    const maxOrder = (barRateRows as BarRateRow[]).length > 0
      ? Math.max(...(barRateRows as BarRateRow[]).map(r => r.sort_order))
      : -1

    const rows = toInsert.map((rate, i) => ({
      hotel_id:    hotelId,
      rate,
      sort_order:  maxOrder + 1 + i,
      is_favorite: false,
    }))

    const { error } = await (supabase as any)
      .from('s05_bar_rate_list')
      .insert(rows)

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['s05_bar_rate_list', hotelId] })
    }
  }

  const handleRemoveBar = (rate: number) => {
    const row = barRateRows.find((r: any) => r.rate === rate)
    if (!row) return
    setPendingDeleteIds(prev => [...prev, (row as any).id])
    if (selectedBar === rate) onSelectBar(null)
  }

  const handleDeleteAll = () => {
    setPendingDeleteIds(barRateRows.map((r: any) => r.id as string))
    onSelectBar(null)
  }

  const handleDeleteConfirm = async () => {
    if (pendingDeleteIds.length > 0) {
      await (supabase as any)
        .from('s05_bar_rate_list')
        .delete()
        .in('id', pendingDeleteIds)
      queryClient.invalidateQueries({ queryKey: ['s05_bar_rate_list', hotelId] })
    }
    setPendingDeleteIds([])
    setDeleteMode(false)
  }

  const handleDeleteCancel = () => {
    setPendingDeleteIds([])
    setDeleteMode(false)
  }

  const handleFavoriteSave = async () => {
    console.log('[fav save] 클릭됨, pendingFavoriteChanges:', pendingFavoriteChanges)
    if (pendingFavoriteChanges.length === 0) return
    for (const change of pendingFavoriteChanges) {
      const { data, error } = await (supabase as any)
        .from('s05_bar_rate_list')
        .update({ is_favorite: change.is_favorite })
        .eq('id', change.id)
        .select()
      console.log('[fav save] update result — id:', change.id, '| data:', data, '| error:', error)
    }
    queryClient.invalidateQueries({ queryKey: ['s05_bar_rate_list', hotelId] })
    setPendingFavoriteChanges([])
  }

  const handleChipClick = (rate: number) => {
    if (deleteMode) return
    onSelectBar(selectedBar === rate ? null : rate)
  }

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    if (deleteMode) return
    e.preventDefault()

    const dragRow = barRateRowsRef.current.find(r => r.id === id)
    if (!dragRow) return

    draggingIdRef.current = id
    setDraggingId(id)

    // 고스트 엘리먼트 생성 — document.body에 붙여 overflow 컨테이너 영향 없음
    const ghost = document.createElement('div')
    ghost.textContent = String(Math.round(dragRow.rate / 1000))
    Object.assign(ghost.style, {
      position:      'fixed',
      left:          `${e.clientX}px`,
      top:           `${e.clientY}px`,
      transform:     'translate(-50%, -50%)',
      zIndex:        '9999',
      padding:       '3px 12px',
      borderRadius:  '20px',
      background:    'rgba(0,229,160,0.15)',
      border:        '1.5px solid #00E5A0',
      color:         '#00E5A0',
      fontSize:      '11px',
      fontWeight:    '500',
      pointerEvents: 'none',
      userSelect:    'none',
      boxShadow:     '0 2px 8px rgba(0,0,0,0.3)',
    })
    document.body.appendChild(ghost)
    ghostRef.current = ghost

    const cleanup = () => {
      window.removeEventListener('pointermove',   onMove)
      window.removeEventListener('pointerup',     onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (ghostRef.current) { ghostRef.current.remove(); ghostRef.current = null }
      draggingIdRef.current = null
      setDraggingId(null)
      setDragOverFavorite(false)
      setDragOverAll(false)
    }

    const onMove = (ev: PointerEvent) => {
      if (ghostRef.current) {
        ghostRef.current.style.left = `${ev.clientX}px`
        ghostRef.current.style.top  = `${ev.clientY}px`
      }
      const favRect = favoriteAreaRef.current?.getBoundingClientRect()
      const allRect = allAreaRef.current?.getBoundingClientRect()
      setDragOverFavorite(
        favRect
          ? ev.clientX >= favRect.left && ev.clientX <= favRect.right &&
            ev.clientY >= favRect.top  && ev.clientY <= favRect.bottom
          : false
      )
      setDragOverAll(
        allRect
          ? ev.clientX >= allRect.left && ev.clientX <= allRect.right &&
            ev.clientY >= allRect.top  && ev.clientY <= allRect.bottom
          : false
      )
    }

    const onUp = async (ev: PointerEvent) => {
      const currentId = draggingIdRef.current
      if (!currentId) { cleanup(); return }

      const rows    = barRateRowsRef.current
      const upRow   = rows.find(r => r.id === currentId)

      const favRect = favoriteAreaRef.current?.getBoundingClientRect()
      const allRect = allAreaRef.current?.getBoundingClientRect()

      const overFav = favRect
        ? ev.clientX >= favRect.left && ev.clientX <= favRect.right &&
          ev.clientY >= favRect.top  && ev.clientY <= favRect.bottom
        : false

      const overAll = allRect
        ? ev.clientX >= allRect.left && ev.clientX <= allRect.right &&
          ev.clientY >= allRect.top  && ev.clientY <= allRect.bottom
        : false

      cleanup()

      if (overFav && upRow && !upRow.is_favorite) {
        setPendingFavoriteChanges(prev => [
          ...prev.filter(p => p.id !== currentId),
          { id: currentId, is_favorite: true },
        ])
      } else if (overAll && upRow && upRow.is_favorite) {
        setPendingFavoriteChanges(prev => [
          ...prev.filter(p => p.id !== currentId),
          { id: currentId, is_favorite: false },
        ])
      }
    }

    const onCancel = () => cleanup()

    // React effect 타이밍에 의존하지 않고 즉시(동기) 등록
    window.addEventListener('pointermove',   onMove)
    window.addEventListener('pointerup',     onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  // 입력된 패키지를 s04_rate_package 에 INSERT (프로모션 저장 성공 후 호출).
  // 패키지 저장 실패가 프로모션 저장 성공을 막지 않도록 자체 try/catch.
  const insertPendingPackages = async () => {
    const validPkgs = packages.filter(p => p.name.trim())
    if (validPkgs.length === 0) return
    try {
      const { error } = await (supabase as any)
        .from('s04_rate_package')
        .insert(validPkgs.map((p, i) => ({
          hotel_id:    hotelId,
          name:        p.name.trim(),
          add_on_rate: p.rate ?? 0,
          sort_order:  i,
          status:      'active',
        })))
      if (error) throw error
      setPackages([])
    } catch (e) {
      console.error('[insertPendingPackages] 패키지 저장 실패', e)
    }
  }

  const handleEditPromo = (p: MonthPromo) => {
    console.log('[editPromo] _raw:', p._raw)
    console.log('[editPromo] min_stay:', p._raw?.min_stay, typeof p._raw?.min_stay)
    console.log('[editPromo] max_stay:', p._raw?.max_stay, typeof p._raw?.max_stay)
    const isStayUnlimited = !p._raw?.stay_start || p._raw.stay_start === '2000-01-01'
    const isSaleUnlimited = !p._raw?.sale_start

    setStayUnlimited(isStayUnlimited)
    setSaleUnlimited(isSaleUnlimited)
    setSelectedRoomTypes(p._raw?.room_type_codes ?? [])

    ;([
      ['name',           p._raw?.name           ?? ''],
      ['description',    p._raw?.description    ?? ''],
      ['min_stay',       p._raw?.min_stay       != null ? String(p._raw.min_stay) : ''],
      ['max_stay',       p._raw?.max_stay       != null ? String(p._raw.max_stay) : ''],
      ['discount_type',  p._raw?.discount_type  ?? 'pct'],
      ['discount_value', p._raw?.discount_value != null ? String(p._raw.discount_value) : ''],
      ['stay_start',     isStayUnlimited ? '' : (p._raw?.stay_start ?? '')],
      ['stay_end',       isStayUnlimited ? '' : (p._raw?.stay_end   ?? '')],
      ['sale_start',     isSaleUnlimited ? '' : (p._raw?.sale_start ?? '')],
      ['sale_end',       isSaleUnlimited ? '' : (p._raw?.sale_end   ?? '')],
      ['status',         p._raw?.status ?? 'active'],
    ] as [string, string][]).forEach(([field, val]) => onPromoFormChange(field, val))

    // s04_rate_package 에 promotion_id 연결 컬럼이 없어 해당 프로모션의 패키지를
    // 특정할 수 없으므로 pre-fill 생략(수정 모드에서도 패키지는 추가만 가능).
    setPackages([])

    setEditingPromo(p)
    setPromoErr(null)
    if (!showAddPromo) onToggleAddPromo()
  }

  const handleCancelPromo = () => {
    setEditingPromo(null)
    setSelectedRoomTypes([])
    setRtDropOpen(false)
    setPackages([])
    ;([
      ['name', ''], ['description', ''], ['min_stay', ''], ['max_stay', ''],
      ['discount_type', 'pct'], ['discount_value', ''],
      ['stay_start', ''], ['stay_end', ''],
      ['sale_start', ''], ['sale_end', ''],
      ['status', 'active'],
    ] as [string, string][]).forEach(([field, val]) => onPromoFormChange(field, val))
    if (showAddPromo) onToggleAddPromo()
  }

  // 지난 프로모션 → 새 프로모션으로 복사 (날짜는 비움, 신규 INSERT)
  const handleCopyPromo = (raw: any) => {
    setPromoFilter('active')
    setEditingPromo(null)            // INSERT 경로 보장
    setPromoErr(null)
    setStayUnlimited(false)
    setSaleUnlimited(false)
    setPackages([])
    setSelectedRoomTypes(raw.room_type_codes ?? [])
    ;([
      ['name',           `${raw.name ?? ''} (복사)`],
      ['description',    ''],
      ['min_stay',       ''],
      ['max_stay',       ''],
      ['discount_type',  raw.discount_type ?? 'pct'],
      ['discount_value', raw.discount_value != null ? String(raw.discount_value) : ''],
      ['stay_start',     ''],   // 날짜는 새로 입력
      ['stay_end',       ''],
      ['sale_start',     ''],
      ['sale_end',       ''],
      ['status',         'active'],
    ] as [string, string][]).forEach(([field, val]) => onPromoFormChange(field, val))
    if (!showAddPromo) onToggleAddPromo()
  }

  const handleSaveEditPromo = async () => {
    if (!editingPromo) return
    if (!promoForm.name.trim()) { setPromoErr('프로모션 이름은 필수입니다.'); return }
    setIsSavingPromo(true); setPromoErr(null)
    try {
      const { error } = await (supabase as any)
        .from('s03_rate_promotion')
        .update({
          name:           promoForm.name.trim(),
          description:    promoForm.description || null,
          discount_type:  promoForm.discount_type,
          discount_value: Number(promoForm.discount_value),
          min_stay:       promoForm.min_stay ? Number(promoForm.min_stay) : null,
          max_stay:       promoForm.max_stay ? Number(promoForm.max_stay) : null,
          stay_start:     promoForm.stay_start || '2000-01-01',
          stay_end:       promoForm.stay_end   || '2099-12-31',
          sale_start:     promoForm.sale_start || null,
          sale_end:       promoForm.sale_end   || null,
          status:         promoForm.status,
        })
        .eq('id', editingPromo._raw?.id)
      if (error) throw error
      await insertPendingPackages()
      onPromoSaved()
      handleCancelPromo()
    } catch (e: any) {
      setPromoErr(e.message)
    } finally {
      setIsSavingPromo(false)
    }
  }

  const handlePromoSubmit = async () => {
    if (!promoForm.name.trim()) { setPromoErr('프로모션 이름은 필수입니다.'); return }
    setIsSavingPromo(true); setPromoErr(null)
    try {
      if (baseRateType === 'custom') {
        const { data: promo, error } = await (supabase as any)
          .from('s03_rate_promotion')
          .insert({
            hotel_id:        hotelId,
            name:            promoForm.name.trim(),
            description:     promoForm.description || null,
            discount_type:   'fixed',
            discount_value:  0,
            min_stay:        promoForm.min_stay ? Number(promoForm.min_stay) : null,
            max_stay:        promoForm.max_stay ? Number(promoForm.max_stay) : null,
            stay_start:      stayUnlimited ? '2000-01-01' : (promoForm.stay_start || '2000-01-01'),
            stay_end:        stayUnlimited ? '2099-12-31' : (promoForm.stay_end   || '2099-12-31'),
            sale_start:      saleUnlimited ? null : (promoForm.sale_start || null),
            sale_end:        saleUnlimited ? null : (promoForm.sale_end   || null),
            status:          promoForm.status,
            room_type_codes: selectedRoomTypes.length > 0 ? selectedRoomTypes : null,
          })
          .select('id').single()
        if (error) throw error
        await insertPendingPackages()
        setCustomRatePromoId(promo.id)
        setShowCustomRateModal(true)
        setIsSavingPromo(false)
        return
      }
      // BAR Rate 방식
      const { error } = await (supabase as any)
        .from('s03_rate_promotion')
        .insert({
          hotel_id:        hotelId,
          name:            promoForm.name.trim(),
          description:     promoForm.description || null,
          discount_type:   promoForm.discount_type,
          discount_value:  Number(promoForm.discount_value),
          min_stay:        promoForm.min_stay ? Number(promoForm.min_stay) : null,
          max_stay:        promoForm.max_stay ? Number(promoForm.max_stay) : null,
          stay_start:      stayUnlimited ? '2000-01-01' : (promoForm.stay_start || '2000-01-01'),
          stay_end:        stayUnlimited ? '2099-12-31' : (promoForm.stay_end   || '2099-12-31'),
          sale_start:      saleUnlimited ? null : (promoForm.sale_start || null),
          sale_end:        saleUnlimited ? null : (promoForm.sale_end   || null),
          status:          promoForm.status,
          room_type_codes: selectedRoomTypes.length > 0 ? selectedRoomTypes : null,
        })
      if (error) throw error
      await insertPendingPackages()
      onPromoSaved()
      handleCancelPromo()
    } catch (e: any) {
      console.error('[handlePromoSubmit] Supabase error:', e)
      setPromoErr(`${e.message}${e.details ? ` (${e.details})` : ''}`)
    } finally {
      setIsSavingPromo(false)
    }
  }

  const handleDeletePromo = async (id: string) => {
    const { error } = await (supabase as any)
      .from('s03_rate_promotion')
      .update({ status: 'inactive' })
      .eq('id', id)
    if (!error) onPromoSaved()
  }

  const parseExcelFile = (file: File): Promise<{ date: string; newRate: number }[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target?.result, { type: 'array' })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
          if (rows.length < 2) { reject(new Error('데이터가 없습니다')); return }
          const header = rows[0].map((h: any) => String(h).trim())
          const dateIdx = header.findIndex((h: string) => h === '날짜')
          const rateIdx = header.findIndex((h: string) => h === '요금')
          if (dateIdx === -1 || rateIdx === -1) {
            reject(new Error('헤더에 "날짜", "요금" 컬럼이 필요합니다')); return
          }
          const result: { date: string; newRate: number }[] = []
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i]
            if (!row || row.length === 0) continue
            let dateVal = row[dateIdx]
            const rateVal = row[rateIdx]
            if (dateVal == null || rateVal == null) continue
            if (typeof dateVal === 'number') {
              // Excel serial date → YYYY-MM-DD
              const d = XLSX.SSF.parse_date_code(dateVal)
              dateVal = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
            } else {
              dateVal = String(dateVal).trim()
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) continue
            const newRate = Number(rateVal)
            if (isNaN(newRate) || newRate <= 0) continue
            result.push({ date: dateVal, newRate })
          }
          if (result.length === 0) { reject(new Error('유효한 데이터 행이 없습니다')); return }
          resolve(result)
        } catch (err: any) { reject(err) }
      }
      reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다'))
      reader.readAsArrayBuffer(file)
    })
  }

  const handleExcelUpload = async (file: File) => {
    setExcelError(null)
    setIsUploadingExcel(true)
    try {
      const parsed = await parseExcelFile(file)
      const dates = parsed.map(r => r.date)
      const { data: currentRatesData } = await (supabase as any)
        .from('s02_rate_detail')
        .select('stay_date, new_rate')
        .eq('hotel_id', hotelId)
        .eq('room_type_code', 'BASE')
        .eq('date_type', 'single')
        .in('stay_date', dates)
      const currentMap: Record<string, number> = {}
      if (currentRatesData) {
        for (const r of currentRatesData) currentMap[r.stay_date] = r.new_rate
      }
      const preview: ExcelPreviewRow[] = parsed.map(r => ({
        date: r.date,
        currentRate: currentMap[r.date] ?? null,
        newRate: r.newRate,
        isChanged: currentMap[r.date] !== r.newRate,
      }))
      setExcelPreview(preview)
    } catch (err: any) {
      setExcelError(err.message ?? '파일 처리 중 오류가 발생했습니다')
    } finally {
      setIsUploadingExcel(false)
    }
  }

  const handleExcelSave = async () => {
    if (!excelPreview || excelPreview.length === 0) return
    setIsUploadingExcel(true)
    setExcelError(null)
    try {
      const rows = excelPreview.map(r => ({
        hotel_id: hotelId,
        stay_date: r.date,
        room_type_code: 'BASE',
        date_type: 'single',
        new_rate: r.newRate,
      }))
      const { error } = await (supabase as any)
        .from('s02_rate_detail')
        .upsert(rows, { onConflict: 'hotel_id,room_type_code,stay_date,date_type', ignoreDuplicates: false })
      if (error) throw error
      setExcelPreview(null)
      onExcelSaved?.()
    } catch (err: any) {
      setExcelError(err.message ?? '저장 중 오류가 발생했습니다')
    } finally {
      setIsUploadingExcel(false)
    }
  }

  const handleDownloadTemplate = () => {
    const sampleRows = Array.from({ length: 5 }, (_, i) => {
      const d = i + 1
      return [`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, 150000]
    })
    const ws = XLSX.utils.aoa_to_sheet([['날짜', '요금'], ...sampleRows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '요금')
    XLSX.writeFile(wb, `rate_template_${year}${String(month).padStart(2, '0')}.xlsx`)
  }

  const canSave      = selectedDates.length > 0 && selectedBar !== null && !isSaving
  const isCustomRate = baseRateType === 'custom'

  const effectiveRows = (barRateRows as BarRateRow[]).map(r => {
    const pending = pendingFavoriteChanges.find(p => p.id === r.id)
    return pending ? { ...r, is_favorite: pending.is_favorite } : r
  })
  const favoriteRows = effectiveRows.filter(r => r.is_favorite)
  const allRows      = effectiveRows.filter(r => !r.is_favorite)

  const renderChip = (r: BarRateRow) => {
    const isSelected = !deleteMode && selectedBar === r.rate
    const isPending  = pendingDeleteIds.includes(r.id)
    const isDragging = draggingId === r.id
    return (
      <div
        key={r.id}
        onPointerDown={e => handlePointerDown(e, r.id)}
        onClick={() => !deleteMode && !isDragging && handleChipClick(r.rate)}
        style={{
          position:     'relative',
          fontSize:     11,
          padding:      '3px 10px',
          paddingRight: r.is_favorite ? 20 : 10,
          borderRadius: 20,
          border:       isSelected
            ? '1.5px solid #00E5A0'
            : r.is_favorite
              ? '0.5px solid rgba(186,117,23,0.6)'
              : '0.5px solid var(--color-border-default)',
          background:   isSelected
            ? 'rgba(0,229,160,0.1)'
            : r.is_favorite
              ? 'rgba(186,117,23,0.08)'
              : 'var(--color-bg-tertiary)',
          color:       isSelected ? '#00E5A0' : 'var(--color-text-primary)',
          cursor:      deleteMode ? 'default' : isDragging ? 'grabbing' : 'grab',
          opacity:     isPending ? 0.35 : isDragging ? 0.5 : 1,
          transition:  'opacity 0.1s',
          userSelect:  'none',
          touchAction: 'none',
        }}
      >
        <span>{Math.round(r.rate / 1000)}</span>

        {r.is_favorite && !deleteMode && (
          <span style={{
            position:   'absolute',
            top:        '50%',
            right:      5,
            transform:  'translateY(-50%)',
            fontSize:   8,
            color:      '#BA7517',
            lineHeight: 1,
          }}>★</span>
        )}

        {deleteMode && (
          <span
            onClick={e => { e.stopPropagation(); handleRemoveBar(r.rate) }}
            style={{
              position:     'absolute',
              top:          -4,
              right:        -4,
              width:        14,
              height:       14,
              borderRadius: '50%',
              background:   '#E24B4A',
              color:        '#fff',
              fontSize:     9,
              lineHeight:   '14px',
              textAlign:    'center',
              cursor:       'pointer',
            }}
          >×</span>
        )}
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    fontSize:     11,
    padding:      '5px 8px',
    borderRadius: 6,
    border:       '0.5px solid var(--color-border-default)',
    background:   'var(--color-bg-tertiary)',
    color:        'var(--color-text-primary)',
    outline:      'none',
    boxSizing:    'border-box',
  }

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* 헤더 — 월 네비 + 판매기준일 (가운데 정렬) */}
      <div style={{
        padding:        '12px 14px',
        borderBottom:   '0.5px solid var(--color-border-default)',
        background:     'var(--color-bg-secondary)',
        flexShrink:     0,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            6,
      }}>
        {/* 판매기준일 인라인 (클릭 시 바로 아래 숨긴 FormDatePicker 오픈 → 팝업이 버튼 아래에 표시) */}
        <div
          onClick={() => saleDateLocalRef.current?.querySelector('button')?.click()}
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          5,
            cursor:       'pointer',
            padding:      '2px 6px',
            borderRadius: 6,
            border:       '0.5px solid transparent',
            transition:   'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.background = 'var(--color-bg-tertiary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
        >
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>판매기준일</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {saleDate?.replace(/-/g, '. ') ?? '날짜 선택'}
          </span>
          <Pencil size={11} style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }} aria-hidden="true" />
        </div>

        {/* 숨긴 FormDatePicker — 판매기준일 바로 아래에 위치해 팝업이 편집 버튼 아래로 열림 */}
        <div ref={saleDateLocalRef} style={{ width: 0, height: 0, overflow: 'hidden' }}>
          <FormDatePicker value={saleDate} onChange={onSaleDateChange ?? (() => {})} placeholder="날짜 선택" />
        </div>
      </div>

      {/* 바디 (스크롤) */}
      <div style={{ flex: 1, overflowY: 'auto', touchAction: draggingId ? 'none' : 'auto' }}>

        {!showAddPromo && <>

        {/* BAR Rate */}
        <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-default)' }}>

          {/* BAR 섹션 헤더 */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            marginBottom:   8,
          }}>
            <span style={{
              fontSize:      10,
              fontWeight:    500,
              color:         'var(--color-text-secondary)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}>
              BAR Rate <span style={{ fontWeight: 400, fontSize: 9 }}>(단위: 원 / 표시: 천원)</span>
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {!deleteMode && (
                <button
                  onClick={() => setShowAddModal(true)}
                  style={{
                    fontSize:     10,
                    padding:      '2px 8px',
                    borderRadius: 4,
                    border:       '0.5px solid var(--color-border-default)',
                    background:   'transparent',
                    color:        'var(--color-text-secondary)',
                    cursor:       'pointer',
                    display:      'inline-flex',
                    alignItems:   'center',
                    gap:          3,
                  }}
                >
                  <Plus size={11} /> 추가
                </button>
              )}
              {!deleteMode ? (
                pendingFavoriteChanges.length > 0 ? (
                  <button
                    onClick={() => { console.log('[fav save] 버튼 onClick 실행됨'); handleFavoriteSave() }}
                    style={{
                      fontSize:     10,
                      padding:      '2px 8px',
                      borderRadius: 4,
                      border:       '0.5px solid #00E5A0',
                      background:   'rgba(0,229,160,0.1)',
                      color:        '#00E5A0',
                      cursor:       'pointer',
                      fontWeight:   500,
                    }}
                  >
                    저장
                  </button>
                ) : (
                  <button
                    onClick={() => { setDeleteMode(true); onSelectBar(null) }}
                    style={{
                      fontSize:     10,
                      padding:      '2px 8px',
                      borderRadius: 4,
                      border:       '0.5px solid var(--color-border-default)',
                      background:   'transparent',
                      color:        'var(--color-text-secondary)',
                      cursor:       'pointer',
                    }}
                  >
                    삭제
                  </button>
                )
              ) : (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={handleDeleteCancel}
                    style={{
                      fontSize:     10,
                      padding:      '2px 8px',
                      borderRadius: 4,
                      border:       '0.5px solid var(--color-border-default)',
                      background:   'transparent',
                      color:        'var(--color-text-secondary)',
                      cursor:       'pointer',
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleDeleteAll}
                    style={{
                      fontSize:     10,
                      padding:      '2px 8px',
                      borderRadius: 4,
                      border:       '0.5px solid rgba(226,75,74,0.4)',
                      background:   'rgba(226,75,74,0.08)',
                      color:        '#E24B4A',
                      cursor:       'pointer',
                    }}
                  >
                    전체
                  </button>
                  <button
                    onClick={handleDeleteConfirm}
                    style={{
                      fontSize:     10,
                      padding:      '2px 8px',
                      borderRadius: 4,
                      border:       '0.5px solid #00E5A0',
                      background:   'rgba(0,229,160,0.1)',
                      color:        '#00E5A0',
                      cursor:       'pointer',
                      fontWeight:   500,
                    }}
                  >
                    완료
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── 즐겨찾기 섹션 (드롭존) ── */}
          <div
            ref={favoriteAreaRef}
            style={{
              marginBottom: 8,
              padding:      '6px 8px',
              borderRadius: 6,
              border:       dragOverFavorite
                ? '1.5px dashed #BA7517'
                : '0.5px dashed rgba(186,117,23,0.3)',
              background:   dragOverFavorite
                ? 'rgba(186,117,23,0.08)'
                : 'transparent',
              minHeight:    36,
              transition:   'all 0.15s',
            }}
          >
            <div style={{
              fontSize:     9,
              color:        '#BA7517',
              fontWeight:   500,
              marginBottom: favoriteRows.length > 0 ? 5 : 0,
              display:      'flex',
              alignItems:   'center',
              gap:          3,
            }}>
              ★ 즐겨찾기
              {favoriteRows.length === 0 && (
                <span style={{ fontSize: 9, color: 'rgba(186,117,23,0.5)', fontWeight: 400 }}>
                  — 칩을 여기로 드래그
                </span>
              )}
            </div>
            {favoriteRows.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {favoriteRows
                  .filter(r => !pendingDeleteIds.includes(r.id))
                  .map(r => renderChip(r))}
              </div>
            )}
          </div>

          <div style={{ height: '0.5px', background: 'var(--color-border-default)', marginBottom: 8 }} />

          {/* ── 전체 목록 (접기/펼치기, 드롭존) ── */}
          <div
            ref={allAreaRef}
            style={{
              borderRadius:  6,
              border:        dragOverAll && !!draggingId
                ? '0.5px dashed rgba(0,229,160,0.3)'
                : 'none',
              transition:    'border 0.15s',
              paddingBottom: 8,
            }}
          >
            <div style={{ maxHeight: isChipExpanded ? 'none' : 52, overflow: 'hidden', paddingBottom: 6 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {allRows
                  .filter(r => !pendingDeleteIds.includes(r.id))
                  .map(r => renderChip(r))}
              </div>
            </div>
            {allRows.length > 6 && (
              <button
                onClick={() => setIsChipExpanded(p => !p)}
                style={{
                  fontSize:   10,
                  color:      '#00E5A0',
                  background: 'none',
                  border:     'none',
                  cursor:     'pointer',
                  padding:    '4px 0 0',
                  marginTop:  10,
                  display:    'block',
                }}
              >
                {isChipExpanded ? '접기 ▴' : `더보기 +${Math.max(0, allRows.length - 6)}개 ▾`}
              </button>
            )}
          </div>

          {selectedBar !== null && !deleteMode && (
            <div style={{
              marginTop: 6, fontSize: 10, color: '#00E5A0',
              padding: '4px 8px', background: 'rgba(0,229,160,0.06)', borderRadius: 4,
            }}>
              {`${Math.round(selectedBar / 1000)}K 선택됨 · 날짜를 클릭해 선택 후 저장`}
            </div>
          )}
        </div>

        {/* 프로모션 목록 — 항상 표시 */}
        <div style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: '#555', letterSpacing: '.05em', textTransform: 'uppercase' }}>
              프로모션
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {promoFilter === 'past' ? (
                <>
                  <button disabled
                    style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '0.5px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-text-secondary)', opacity: 0.4, cursor: 'not-allowed' }}
                  >추가</button>
                  <button disabled
                    style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '0.5px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-text-secondary)', opacity: 0.4, cursor: 'not-allowed' }}
                  >삭제</button>
                </>
              ) : !promoDeleteMode ? (
                <>
                  <button
                    onClick={onToggleAddPromo}
                    style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '0.5px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                  >추가</button>
                  <button
                    onClick={() => { setPromoDeleteMode(true); setSelectedPromoIds(new Set()) }}
                    style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '0.5px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                  >삭제</button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setPromoDeleteMode(false); setSelectedPromoIds(new Set()) }}
                    style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '0.5px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                  >취소</button>
                  <button
                    onClick={() => { if (selectedPromoIds.size > 0) setShowPromoDeleteConfirm(true) }}
                    disabled={selectedPromoIds.size === 0}
                    style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none',
                      cursor: selectedPromoIds.size > 0 ? 'pointer' : 'default',
                      background: selectedPromoIds.size > 0 ? 'rgba(226,75,74,0.15)' : 'var(--color-bg-tertiary)',
                      color: selectedPromoIds.size > 0 ? '#E24B4A' : '#555',
                    }}
                  >완료{selectedPromoIds.size > 0 ? ` (${selectedPromoIds.size})` : ''}</button>
                </>
              )}
            </div>
          </div>

          {/* 필터 칩 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button
              onClick={() => { setPromoFilter('active'); setPromoDeleteMode(false); setSelectedPromoIds(new Set()); setExpandedPastId(null) }}
              style={{
                fontSize: 11, padding: '2px 12px', borderRadius: 999, cursor: 'pointer',
                border: promoFilter === 'active' ? '1px solid rgba(0,229,160,0.4)' : '1px solid #3a3a3a',
                background: promoFilter === 'active' ? 'rgba(0,229,160,0.1)' : '#2a2a2a',
                color: promoFilter === 'active' ? '#00E5A0' : '#888',
              }}
            >진행중·예정</button>
            <button
              onClick={() => { setPromoFilter('past'); setPromoDeleteMode(false); setSelectedPromoIds(new Set()) }}
              style={{
                fontSize: 11, padding: '2px 12px', borderRadius: 999, cursor: 'pointer',
                border: promoFilter === 'past' ? '1px solid rgba(245,158,11,0.4)' : '1px solid #3a3a3a',
                background: promoFilter === 'past' ? 'rgba(245,158,11,0.1)' : '#2a2a2a',
                color: promoFilter === 'past' ? '#F59E0B' : '#888',
              }}
            >지난 프로모션</button>
          </div>

          {promoDeleteMode && (
            <div style={{
              fontSize:     10,
              color:        '#E24B4A',
              background:   'rgba(226,75,74,0.08)',
              border:       '0.5px solid rgba(226,75,74,0.2)',
              borderRadius: 5,
              padding:      '5px 8px',
              marginBottom: 8,
              textAlign:    'center',
            }}>
              삭제할 프로모션을 선택하세요
            </div>
          )}

          {promoFilter === 'active' ? (
          <>
          {activeItems.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', padding: '4px 0' }}>
              진행중·예정 프로모션이 없습니다
            </div>
          )}

          {activeItems.map(p => {
            const isApplied = (!p._raw.stay_start || p._raw.stay_start === '2000-01-01')
              ? true
              : (day >= p._raw.stay_start && day <= p._raw.stay_end)
            const isSelected = selectedPromoIds.has(p.id)
            return (
              <div key={p.id}
                onClick={() => {
                  if (promoDeleteMode) {
                    setSelectedPromoIds(prev => {
                      const next = new Set(prev)
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id)
                      return next
                    })
                    return
                  }
                  handleEditPromo(p as any)
                }}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  padding:        '7px 8px',
                  borderRadius:   6,
                  border:         promoDeleteMode && isSelected
                    ? '1px solid rgba(226,75,74,0.6)'
                    : isApplied ? `1px solid ${p.color}66` : '0.5px solid var(--color-border-default)',
                  background:     promoDeleteMode && isSelected
                    ? 'rgba(226,75,74,0.08)'
                    : isApplied ? `${p.color}11` : 'var(--color-bg-tertiary)',
                  marginBottom:   4,
                  cursor:         'pointer',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)' }}>{p.name}</span>
                      {(() => {
                        const badge = PROMO_BADGE[promoStatus(p._raw, promoToday)]
                        return (
                          <span style={{
                            fontSize: 9, padding: '1px 5px', borderRadius: 20,
                            background: `${badge.color}22`, color: badge.color,
                          }}>{badge.label}</span>
                        )
                      })()}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-secondary)', marginTop: 1 }}>
                      {(() => {
                        const roomCodes = p._raw?.room_type_codes ?? []
                        const isExpanded = expandedPromos.has(p.id)
                        const displayRooms = roomCodes.length === 0
                          ? '전 객실'
                          : isExpanded || roomCodes.length <= 3
                            ? roomCodes.join(', ')
                            : `${roomCodes.slice(0, 3).join(', ')} 외 ${roomCodes.length - 3}개`
                        return (
                          <>
                            {p.disc} · {displayRooms}
                            {roomCodes.length > 3 && (
                              <button
                                onClick={e => { e.stopPropagation(); toggleExpand(p.id) }}
                                style={{
                                  fontSize:   9,
                                  color:      '#00E5A0',
                                  background: 'none',
                                  border:     'none',
                                  cursor:     'pointer',
                                  marginLeft: 4,
                                  padding:    0,
                                }}
                              >
                                {isExpanded ? '접기' : '더보기'}
                              </button>
                            )}
                          </>
                        )
                      })()}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-secondary)', marginTop: 1 }}>
                      <span>투숙 </span>
                      <span style={{ color: 'var(--color-text-primary)' }}>
                        {(!p._raw?.stay_start || p._raw.stay_start === '2000-01-01')
                          ? '상시'
                          : `${p._raw.stay_start.slice(5).replace('-', '/')}~${p._raw.stay_end?.slice(5).replace('-', '/')}`
                        }
                      </span>
                      <span style={{ marginLeft: 6 }}>판매 </span>
                      <span style={{ color: 'var(--color-text-primary)' }}>
                        {!p._raw?.sale_start
                          ? '상시'
                          : `${p._raw.sale_start.slice(5).replace('-', '/')}~${p._raw.sale_end?.slice(5).replace('-', '/') ?? ''}`
                        }
                      </span>
                    </div>
                  </div>
                </div>
                {!promoDeleteMode && (
                  <button
                    onClick={e => { e.stopPropagation(); handleEditPromo(p as any) }}
                    style={{ fontSize: 13, color: '#555', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0, marginLeft: 4 }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#00E5A0')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#555')}
                  >✎</button>
                )}
              </div>
            )
          })}
          </>
          ) : (
          <>
          {pastItems.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', padding: '4px 0' }}>
              지난 프로모션이 없습니다
            </div>
          )}

          {pastItems.map(p => {
            const raw = p._raw
            const isExp = expandedPastId === p.id
            const rc: string[] = raw.room_type_codes ?? []
            const fmtRange = (s?: string | null, e?: string | null) =>
              !s ? '상시' : `${s.replace(/-/g, '.')} – ${(e ?? '').slice(5).replace('-', '.')}`
            const rows: [string, string][] = [
              ['할인율', p.disc],
              ['적용 객실', rc.length === 0 ? '전 객실' : rc.length <= 3 ? rc.join(', ') : `${rc.slice(0, 3).join(', ')} 외 ${rc.length - 3}개`],
              ['투숙 기간', (!raw.stay_start || raw.stay_start === '2000-01-01') ? '상시' : fmtRange(raw.stay_start, raw.stay_end)],
              ['판매 기간', !raw.sale_start ? '상시' : fmtRange(raw.sale_start, raw.sale_end)],
            ]
            return (
              <div key={p.id} style={{
                border: '0.5px solid var(--color-border-default)', borderRadius: 6,
                marginBottom: 4, overflow: 'hidden', opacity: 0.85,
              }}>
                <div
                  onClick={() => setExpandedPastId(isExp ? null : p.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 8px', cursor: 'pointer', background: 'var(--color-bg-tertiary)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)' }}>{p.name}</span>
                    <span style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>{p.disc}</span>
                  </div>
                  <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '8px 10px', borderTop: '0.5px solid var(--color-border-default)', fontSize: 10 }}>
                    {rows.map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: '#555' }}>{k}</span>
                        <span style={{ color: 'var(--color-text-primary)' }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        onClick={() => handleEditPromo(p as any)}
                        style={{ flex: 1, fontSize: 11, padding: '6px', borderRadius: 6, border: '0.5px solid var(--color-border-default)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                      >
                        <Pencil size={12} /> 수정
                      </button>
                      <button
                        onClick={() => handleCopyPromo(raw)}
                        style={{ flex: 1, fontSize: 11, padding: '6px', borderRadius: 6, border: 'none', background: '#00E5A0', color: '#04342C', fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                      >
                        <Copy size={12} /> 프로모션 복사
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          </>
          )}

        </div>

        </>}{/* /!showAddPromo */}

        {/* 프로모션 추가/수정 폼 */}
        {showAddPromo && (
          <div style={{ padding: '10px 14px' }}>

            {/* 돌아가기 버튼 */}
            <button
              onClick={handleCancelPromo}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          4,
                fontSize:     11,
                color:        'var(--color-text-secondary)',
                background:   'none',
                border:       'none',
                cursor:       'pointer',
                padding:      '0 0 10px 0',
                marginBottom: 2,
              }}
            >
              ← 돌아가기
            </button>

            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 10 }}>
              {editingPromo ? '프로모션 수정' : '프로모션 추가'}
            </div>

            <div style={{ padding: 10, background: 'var(--color-bg-secondary)', borderRadius: 6, border: '0.5px solid var(--color-border-default)' }}>

                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>프로모션 이름 *</label>
                  <input value={promoForm.name} onChange={e => onPromoFormChange('name', e.target.value)} placeholder="예: 주중특가" style={inputStyle} />
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>설명</label>
                  <textarea value={promoForm.description} onChange={e => onPromoFormChange('description', e.target.value)} placeholder="프로모션 설명 (선택)" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>기준 요금</label>
                  <select
                    value={baseRateType}
                    onChange={e => setBaseRateType(e.target.value as 'bar' | 'custom')}
                    style={inputStyle}
                  >
                    <option value="bar">BAR Rate</option>
                    <option value="custom">직접 입력</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>최소 연박</label>
                    <input type="number" placeholder="예: 1" value={promoForm.min_stay} onChange={e => onPromoFormChange('min_stay', e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>최대 연박</label>
                    <input type="number" placeholder="예: 7" value={promoForm.max_stay} onChange={e => onPromoFormChange('max_stay', e.target.value)} style={inputStyle} />
                  </div>
                </div>

                <div style={{
                  display:       'flex',
                  gap:           6,
                  marginBottom:  8,
                  opacity:       isCustomRate ? 0.35 : 1,
                  pointerEvents: isCustomRate ? 'none' : undefined,
                  transition:    'opacity 0.15s',
                }}>
                  <div style={{ flex: 2 }}>
                    <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>할인 방식 *</label>
                    <select
                      value={promoForm.discount_type}
                      onChange={e => onPromoFormChange('discount_type', e.target.value)}
                      style={inputStyle}
                      disabled={isCustomRate}
                    >
                      <option value="pct">% 할인 (정률)</option>
                      <option value="amount">금액 할인</option>
                      <option value="fixed">고정 금액</option>
                      <option value="addon">add-on (+)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>할인값 *</label>
                    <input
                      type="number"
                      placeholder="예: 10"
                      value={promoForm.discount_value}
                      onChange={e => onPromoFormChange('discount_value', e.target.value)}
                      style={inputStyle}
                      disabled={isCustomRate}
                    />
                  </div>
                </div>

                {isCustomRate && (
                  <div style={{
                    fontSize:     10,
                    color:        'var(--color-text-secondary)',
                    padding:      '4px 8px',
                    borderRadius: 4,
                    background:   'rgba(0,229,160,0.06)',
                    marginBottom: 8,
                  }}>
                    직접 입력 선택 시 날짜별 요금을 직접 설정합니다
                  </div>
                )}

                {/* 객실 타입 다중선택 */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>
                    객실 타입
                  </label>

                  {!rtDropOpen ? (
                    <div
                      onClick={() => setRtDropOpen(true)}
                      style={{
                        ...inputStyle,
                        minHeight:  28,
                        cursor:     'pointer',
                        display:    'flex',
                        flexWrap:   'wrap',
                        alignItems: 'center',
                        gap:        4,
                      }}
                    >
                      {selectedRoomTypes.length === 0 ? (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>전체 객실</span>
                      ) : (
                        selectedRoomTypes.map(code => (
                          <span key={code} style={{
                            fontSize:     10,
                            padding:      '1px 7px',
                            borderRadius: 4,
                            background:   'rgba(0,229,160,0.12)',
                            color:        '#00E5A0',
                          }}>
                            {code}
                          </span>
                        ))
                      )}
                    </div>
                  ) : (
                    <div
                      tabIndex={-1}
                      onBlur={e => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setRtDropOpen(false)
                      }}
                      style={{
                        border:       '0.5px solid var(--color-border-default)',
                        borderRadius: 6,
                        background:   'var(--color-bg-secondary)',
                        outline:      'none',
                      }}
                    >
                      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                        {roomTypes.map((rt, idx) => {
                          const checked = selectedRoomTypes.includes(rt.room_type_code)
                          return (
                            <label
                              key={rt.room_type_code}
                              style={{
                                display:      'flex',
                                alignItems:   'center',
                                gap:          6,
                                padding:      '5px 10px',
                                fontSize:     11,
                                cursor:       'pointer',
                                borderBottom: idx < roomTypes.length - 1
                                  ? '0.5px solid var(--color-border-default)'
                                  : 'none',
                                color: checked ? '#00E5A0' : 'var(--color-text-secondary)',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedRoomTypes(prev =>
                                    checked
                                      ? prev.filter(c => c !== rt.room_type_code)
                                      : [...prev, rt.room_type_code]
                                  )
                                }}
                                style={{ accentColor: '#00E5A0', cursor: 'pointer' }}
                              />
                              {rt.room_type_code}
                              {rt.room_type_description && (
                                <span style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>
                                  {rt.room_type_description}
                                </span>
                              )}
                            </label>
                          )
                        })}
                      </div>

                      <div style={{
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'space-between',
                        padding:        '5px 8px',
                        borderTop:      '0.5px solid var(--color-border-default)',
                        gap:            4,
                      }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => setSelectedRoomTypes(roomTypes.map(rt => rt.room_type_code))}
                            style={{
                              fontSize:     10,
                              padding:      '3px 8px',
                              borderRadius: 4,
                              background:   'transparent',
                              color:        'var(--color-text-secondary)',
                              border:       '0.5px solid var(--color-border-default)',
                              cursor:       'pointer',
                            }}
                          >
                            전체
                          </button>
                          <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => setSelectedRoomTypes([])}
                            style={{
                              fontSize:     10,
                              padding:      '3px 8px',
                              borderRadius: 4,
                              background:   'transparent',
                              color:        'var(--color-text-secondary)',
                              border:       '0.5px solid var(--color-border-default)',
                              cursor:       'pointer',
                            }}
                          >
                            선택 해제
                          </button>
                        </div>
                        <button
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => setRtDropOpen(false)}
                          style={{
                            fontSize:     11,
                            padding:      '3px 12px',
                            borderRadius: 4,
                            background:   '#00E5A0',
                            color:        '#04342C',
                            border:       'none',
                            cursor:       'pointer',
                            fontWeight:   500,
                          }}
                        >
                          완료
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: 4, opacity: stayUnlimited ? 0.4 : 1, pointerEvents: stayUnlimited ? 'none' : undefined }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>투숙 시작</label>
                    <FormDatePicker value={promoForm.stay_start} onChange={v => onPromoFormChange('stay_start', v)} placeholder="날짜 선택" style={{ fontSize: 9 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>투숙 종료</label>
                    <FormDatePicker value={promoForm.stay_end} onChange={v => onPromoFormChange('stay_end', v)} placeholder="날짜 선택" style={{ fontSize: 9 }} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--color-text-secondary)', cursor: 'pointer', marginBottom: 8 }}>
                  <input type="checkbox" checked={stayUnlimited} onChange={e => setStayUnlimited(e.target.checked)} style={{ accentColor: '#00E5A0', cursor: 'pointer' }} />
                  기간제한 없음
                </label>

                <div style={{ display: 'flex', gap: 6, marginBottom: 4, opacity: saleUnlimited ? 0.4 : 1, pointerEvents: saleUnlimited ? 'none' : undefined }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>판매 시작</label>
                    <FormDatePicker value={promoForm.sale_start} onChange={v => onPromoFormChange('sale_start', v)} placeholder="날짜 선택" style={{ fontSize: 9 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>판매 종료</label>
                    <FormDatePicker value={promoForm.sale_end} onChange={v => onPromoFormChange('sale_end', v)} placeholder="날짜 선택" style={{ fontSize: 9 }} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--color-text-secondary)', cursor: 'pointer', marginBottom: 8 }}>
                  <input type="checkbox" checked={saleUnlimited} onChange={e => setSaleUnlimited(e.target.checked)} style={{ accentColor: '#00E5A0', cursor: 'pointer' }} />
                  기간제한 없음
                </label>

                {/* 패키지 (선택) */}
                <div style={{ borderTop: '0.5px solid var(--color-border-default)', paddingTop: 10, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      패키지 (선택)
                    </span>
                    <button
                      onClick={() => setPackages(prev => [...prev, { id: crypto.randomUUID(), name: '', rate: null }])}
                      style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '0.5px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                    >
                      + 추가
                    </button>
                  </div>
                  {packages.map(pkg => (
                    <div key={pkg.id} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                      <input
                        placeholder="패키지명 (예: 조식포함)"
                        value={pkg.name}
                        onChange={e => setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, name: e.target.value } : p))}
                        style={{ ...inputStyle, flex: 2 }}
                      />
                      <input
                        type="number"
                        placeholder="금액"
                        value={pkg.rate ?? ''}
                        onChange={e => setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, rate: e.target.value ? Number(e.target.value) : null } : p))}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={() => setPackages(prev => prev.filter(p => p.id !== pkg.id))}
                        style={{ fontSize: 13, color: '#E24B4A', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                      >×</button>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {(['active', 'inactive'] as const).map(s => (
                    <button key={s} onClick={() => onPromoFormChange('status', s)} style={{
                      fontSize: 11, padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: promoForm.status === s ? '#00E5A0' : 'var(--color-bg-tertiary)',
                      color:      promoForm.status === s ? '#04342C' : 'var(--color-text-secondary)',
                      fontWeight: promoForm.status === s ? 500 : 400,
                    }}>
                      {s === 'active' ? '활성' : '비활성'}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={handleCancelPromo} style={{ flex: 1, fontSize: 11, padding: '6px', borderRadius: 6, border: '0.5px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                    취소
                  </button>
                  <button
                    onClick={() => {
                      if (editingPromo) {
                        handleSaveEditPromo()
                      } else {
                        handlePromoSubmit()
                      }
                    }}
                    style={{ flex: 2, fontSize: 11, padding: '6px', borderRadius: 6, border: 'none', background: '#00E5A0', color: '#04342C', fontWeight: 500, cursor: 'pointer' }}>
                    {editingPromo ? '저장' : '+ 추가'}
                  </button>
                </div>

              </div>
            </div>
          )}

      </div>

      {/* 저장 버튼 영역 */}
      {!showAddPromo && (
        <div style={{
          flexShrink: 0,
          borderTop:  '0.5px solid var(--color-border-default)',
          padding:    '10px 14px',
          background: 'var(--color-bg-secondary)',
        }}>
          {/* 헤더 행: 상태 텍스트 + 엑셀 아이콘 버튼 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              {excelPreview
                ? `${excelPreview.length}개 날짜 미리보기`
                : selectedDates.length > 0 && selectedBar !== null
                  ? `${selectedDates.length}일 · ${Math.round(selectedBar / 1000)}K 적용 예정`
                  : '날짜와 요금을 선택하세요'
              }
            </div>
            {!excelPreview && (
              <button
                onClick={handleDownloadTemplate}
                title="템플릿 다운로드"
                style={{
                  padding: '2px', border: 'none',
                  background: 'transparent', color: 'var(--color-text-secondary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                }}
              >
                <ExcelIcon size={13} />
              </button>
            )}
          </div>

          {/* 엑셀 오류 메시지 */}
          {excelError && (
            <div style={{
              fontSize: 11, color: '#E24B4A',
              background: 'rgba(226,75,74,0.1)',
              border: '0.5px solid rgba(226,75,74,0.3)',
              borderRadius: 6, padding: '5px 10px', marginBottom: 8,
            }}>
              {excelError}
            </div>
          )}

          {/* 저장 성공 토스트 (엑셀 미리보기 비활성 시) */}
          {!excelPreview && saveToast && (
            <div style={{
              fontSize: 11, color: '#00E5A0',
              background: 'rgba(0,229,160,0.1)',
              border: '0.5px solid rgba(0,229,160,0.3)',
              borderRadius: 6, padding: '6px 10px', marginBottom: 8, textAlign: 'center',
            }}>
              {saveToast}
            </div>
          )}

          {/* 엑셀 미리보기 테이블 */}
          {excelPreview && (
            <div style={{
              maxHeight: 160, overflowY: 'auto', marginBottom: 8,
              border: '0.5px solid var(--color-border-default)', borderRadius: 6,
            }}>
              <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-tertiary)', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500, color: 'var(--color-text-secondary)' }}>날짜</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 500, color: 'var(--color-text-secondary)' }}>현재</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 500, color: 'var(--color-text-secondary)' }}>변경</th>
                  </tr>
                </thead>
                <tbody>
                  {excelPreview.map(row => (
                    <tr key={row.date} style={{ background: row.isChanged ? 'rgba(245,184,0,0.08)' : 'transparent' }}>
                      <td style={{ padding: '3px 8px', color: 'var(--color-text-primary)' }}>{row.date}</td>
                      <td style={{ padding: '3px 8px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                        {row.currentRate != null ? `${Math.round(row.currentRate / 1000)}K` : '-'}
                      </td>
                      <td style={{
                        padding: '3px 8px', textAlign: 'right',
                        color: row.isChanged ? '#F5B800' : 'var(--color-text-primary)',
                        fontWeight: row.isChanged ? 600 : 400,
                      }}>
                        {Math.round(row.newRate / 1000)}K
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 버튼 행 */}
          <div style={{ display: 'flex', gap: 6 }}>
            {excelPreview ? (
              <>
                <button
                  onClick={() => { setExcelPreview(null); setExcelError(null) }}
                  disabled={isUploadingExcel}
                  style={{
                    flex: 1, fontSize: 11, padding: '6px', borderRadius: 6,
                    border: '0.5px solid var(--color-border-default)',
                    background: 'transparent', color: 'var(--color-text-secondary)',
                    cursor: isUploadingExcel ? 'default' : 'pointer',
                    opacity: isUploadingExcel ? 0.4 : 1,
                  }}
                >취소</button>
                <button
                  onClick={handleExcelSave}
                  disabled={isUploadingExcel || excelPreview.length === 0}
                  style={{
                    flex: 2, fontSize: 11, padding: '6px', borderRadius: 6, border: 'none',
                    background: (!isUploadingExcel && excelPreview.length > 0) ? '#00E5A0' : 'rgba(0,229,160,0.2)',
                    color: (!isUploadingExcel && excelPreview.length > 0) ? '#04342C' : 'rgba(0,229,160,0.5)',
                    fontWeight: 500,
                    cursor: (!isUploadingExcel && excelPreview.length > 0) ? 'pointer' : 'default',
                  }}
                >
                  {isUploadingExcel ? '저장 중...' : `${excelPreview.length}일 저장`}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onResetDates}
                  disabled={selectedDates.length === 0 && selectedBar === null}
                  style={{
                    flex: 1, fontSize: 11, padding: '6px', borderRadius: 6,
                    border: '0.5px solid var(--color-border-default)',
                    background: 'transparent', color: 'var(--color-text-secondary)',
                    cursor: (selectedDates.length === 0 && selectedBar === null) ? 'default' : 'pointer',
                    opacity: (selectedDates.length === 0 && selectedBar === null) ? 0.4 : 1,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}
                ><RotateCcw size={12} aria-hidden="true" />초기화</button>
                <button
                  onClick={onSave}
                  disabled={!canSave}
                  style={{
                    flex: 2, fontSize: 11, padding: '6px', borderRadius: 6, border: 'none',
                    background: canSave ? '#00E5A0' : 'rgba(0,229,160,0.2)',
                    color: canSave ? '#04342C' : 'rgba(0,229,160,0.5)',
                    fontWeight: 500,
                    cursor: canSave ? 'pointer' : 'default',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}
                >
                  <Save size={12} aria-hidden="true" />
                  {isSaving ? '저장 중...' : '저장'}
                </button>
                <label
                  title="엑셀 업로드"
                  style={{
                    fontSize: 11, padding: '6px 8px', borderRadius: 6,
                    border: '0.5px solid var(--color-border-default)',
                    background: 'transparent', color: 'var(--color-text-secondary)',
                    cursor: isUploadingExcel ? 'default' : 'pointer',
                    opacity: isUploadingExcel ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
                  }}
                >
                  <ExcelIcon size={11} />
                  {isUploadingExcel ? '…' : '업로드'}
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: 'none' }}
                    disabled={isUploadingExcel}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleExcelUpload(f)
                      e.target.value = ''
                    }}
                  />
                </label>
              </>
            )}
          </div>
        </div>
      )}
    </div>

    {showAddModal && (
      <BarRateAddModal
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddRates}
      />
    )}
    {showCustomRateModal && customRatePromoId && (
      <CustomRateModal
        hotelId={hotelId}
        promotionId={customRatePromoId}
        promotionName={promoForm.name}
        stayStart={stayUnlimited ? `${year}-${String(month).padStart(2, '0')}-01` : promoForm.stay_start}
        stayEnd={stayUnlimited ? toLocalYMD(new Date(year, month, 0)) : promoForm.stay_end}
        selectedRoomTypes={selectedRoomTypes}
        year={year}
        month={month}
        onClose={() => {
          setShowCustomRateModal(false)
          setCustomRatePromoId(null)
        }}
        onSaved={() => {
          setShowCustomRateModal(false)
          setCustomRatePromoId(null)
          onPromoSaved()
          handleCancelPromo()
        }}
      />
    )}
    {showPromoDeleteConfirm && (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
        onClick={() => setShowPromoDeleteConfirm(false)}
      >
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-default)', borderRadius: 10, padding: 20, width: 260, textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8 }}>
            프로모션 삭제
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            선택한 {selectedPromoIds.size}개 프로모션을 삭제하시겠습니까?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowPromoDeleteConfirm(false)}
              style={{ flex: 1, fontSize: 11, padding: '7px', borderRadius: 6, border: '0.5px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            >취소</button>
            <button
              onClick={async () => {
                for (const id of selectedPromoIds) {
                  await (supabase as any)
                    .from('s03_rate_promotion')
                    .update({ status: 'inactive' })
                    .eq('id', id)
                }
                onPromoSaved()
                setShowPromoDeleteConfirm(false)
                setPromoDeleteMode(false)
                setSelectedPromoIds(new Set())
              }}
              style={{ flex: 1, fontSize: 11, padding: '7px', borderRadius: 6, border: 'none', background: '#E24B4A', color: '#fff', fontWeight: 500, cursor: 'pointer' }}
            >삭제</button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
