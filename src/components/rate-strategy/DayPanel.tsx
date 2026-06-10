'use client'

import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { FormDatePicker } from '@/components/DatePicker'
import { BarRateAddModal } from './BarRateAddModal'
import { CustomRateModal } from './CustomRateModal'

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
  hotelId:           string
  year:              number
  month:             number
  roomTypes:         { room_type_code: string; room_type_description: string }[]
  selectedDates:     string[]
  onSave:            () => void
  onResetDates:      () => void
  isSaving:          boolean
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
  onToggleAddPromo, onPromoFormChange, onDeletePromo,
  hotelId, year, month, roomTypes,
  selectedDates, onSave, onResetDates, isSaving,
}: DayPanelProps) {
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
  const [selectedRoomTypes,   setSelectedRoomTypes]   = useState<string[]>([])
  const [rtDropOpen,          setRtDropOpen]          = useState(false)
  const [pendingDeleteIds,    setPendingDeleteIds]    = useState<string[]>([])
  const [isChipExpanded,      setIsChipExpanded]      = useState(false)
  const [dragOverFavorite,    setDragOverFavorite]    = useState(false)
  const [draggingId,          setDraggingId]          = useState<string | null>(null)
  const [dragOverAll,         setDragOverAll]         = useState(false)
  const favoriteAreaRef = useRef<HTMLDivElement>(null)
  const allAreaRef      = useRef<HTMLDivElement>(null)

  const [y, , d] = day.split('-').map(Number)
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, month - 1, d).getDay()]

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

  const handleChipClick = (rate: number) => {
    if (deleteMode) return
    onSelectBar(selectedBar === rate ? null : rate)
  }

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    if (deleteMode) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraggingId(id)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId) return
    const favRect = favoriteAreaRef.current?.getBoundingClientRect()
    const allRect = allAreaRef.current?.getBoundingClientRect()
    if (favRect) {
      setDragOverFavorite(
        e.clientX >= favRect.left && e.clientX <= favRect.right &&
        e.clientY >= favRect.top  && e.clientY <= favRect.bottom
      )
    }
    if (allRect) {
      setDragOverAll(
        e.clientX >= allRect.left && e.clientX <= allRect.right &&
        e.clientY >= allRect.top  && e.clientY <= allRect.bottom
      )
    }
  }

  const handlePointerUp = async (e: React.PointerEvent) => {
    if (!draggingId) return
    const row = (barRateRows as BarRateRow[]).find(r => r.id === draggingId)

    if (dragOverFavorite && row && !row.is_favorite) {
      await (supabase as any)
        .from('s05_bar_rate_list')
        .update({ is_favorite: true })
        .eq('id', draggingId)
      queryClient.invalidateQueries({ queryKey: ['s05_bar_rate_list', hotelId] })
    } else if (dragOverAll && row && row.is_favorite) {
      await (supabase as any)
        .from('s05_bar_rate_list')
        .update({ is_favorite: false })
        .eq('id', draggingId)
      queryClient.invalidateQueries({ queryKey: ['s05_bar_rate_list', hotelId] })
    }

    setDraggingId(null)
    setDragOverFavorite(false)
    setDragOverAll(false)
  }

  const canSave      = selectedDates.length > 0 && selectedBar !== null && !isSaving
  const isCustomRate = baseRateType === 'custom'

  const favoriteRows = (barRateRows as BarRateRow[]).filter(r => r.is_favorite)
  const allRows      = barRateRows as BarRateRow[]

  const renderChip = (r: BarRateRow) => {
    const isSelected = !deleteMode && selectedBar === r.rate
    const isPending  = pendingDeleteIds.includes(r.id)
    const isDragging = draggingId === r.id
    return (
      <div
        key={r.id}
        onPointerDown={e => handlePointerDown(e, r.id)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
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
          transition:  'all 0.1s',
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

      {/* 헤더 */}
      <div style={{
        padding:      '12px 14px',
        borderBottom: '0.5px solid var(--color-border-default)',
        background:   'var(--color-bg-secondary)',
        flexShrink:   0,
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {month}월 {d}일 {dow}요일
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2 }}>
          OCC 58% · ADR 148K
        </div>
      </div>

      {/* 바디 (스크롤) */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

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
              borderRadius: 6,
              border:       dragOverAll && !!draggingId
                ? '0.5px dashed rgba(0,229,160,0.3)'
                : 'none',
              transition:   'border 0.15s',
            }}
          >
            <div style={{ maxHeight: isChipExpanded ? 'none' : 52, overflow: 'hidden' }}>
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
          <div style={{
            fontSize:      10,
            fontWeight:    500,
            color:         'var(--color-text-secondary)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom:  8,
          }}>
            프로모션
          </div>

          {monthPromos.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', padding: '4px 0' }}>
              등록된 프로모션이 없습니다
            </div>
          )}

          {monthPromos.map(p => {
            const isApplied = p.dates.includes(day)
            return (
              <div key={p.id} style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                padding:        '7px 8px',
                borderRadius:   6,
                border:         isApplied
                  ? `1px solid ${p.color}66`
                  : '0.5px solid var(--color-border-default)',
                background:     isApplied ? `${p.color}11` : 'var(--color-bg-tertiary)',
                marginBottom:   4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)' }}>{p.name}</span>
                      {isApplied && (
                        <span style={{
                          fontSize: 9, padding: '1px 5px', borderRadius: 20,
                          background: `${p.color}22`, color: p.color,
                        }}>적용중</span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-secondary)', marginTop: 1 }}>
                      {p.disc} · {p.rooms} · {p.dateRange}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onDeletePromo(p.id)}
                  style={{
                    fontSize: 14, color: '#E24B4A', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0, marginLeft: 4,
                  }}
                >×</button>
              </div>
            )
          })}

          <button
            onClick={onToggleAddPromo}
            style={{
              width: '100%', fontSize: 11, padding: '6px', borderRadius: 6,
              border: '0.5px solid var(--color-border-default)', background: 'transparent',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              marginTop: monthPromos.length > 0 ? 4 : 0,
            }}
          >
            + 프로모션 추가
          </button>
        </div>

        </>}{/* /!showAddPromo */}

        {/* 프로모션 추가 폼 */}
        {showAddPromo && (
          <div style={{ padding: '10px 14px' }}>

            {/* 돌아가기 버튼 */}
            <button
              onClick={() => { setSelectedRoomTypes([]); setRtDropOpen(false); onToggleAddPromo() }}
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
              프로모션 추가
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
                  <button onClick={() => { setSelectedRoomTypes([]); setRtDropOpen(false); onToggleAddPromo() }} style={{ flex: 1, fontSize: 11, padding: '6px', borderRadius: 6, border: '0.5px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                    취소
                  </button>
                  <button
                    onClick={() => {
                      if (baseRateType === 'custom') {
                        setShowCustomRateModal(true)
                      } else {
                        onToggleAddPromo()
                      }
                    }}
                    style={{ flex: 2, fontSize: 11, padding: '6px', borderRadius: 6, border: 'none', background: '#00E5A0', color: '#04342C', fontWeight: 500, cursor: 'pointer' }}>
                    + 추가
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
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            {selectedDates.length > 0 && selectedBar !== null
              ? `${selectedDates.length}일 · ${Math.round(selectedBar / 1000)}K 적용 예정`
              : '날짜와 요금을 선택하세요'
            }
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onResetDates}
              disabled={selectedDates.length === 0 && selectedBar === null}
              style={{
                flex:         1,
                fontSize:     11,
                padding:      '6px',
                borderRadius: 6,
                border:       '0.5px solid var(--color-border-default)',
                background:   'transparent',
                color:        'var(--color-text-secondary)',
                cursor:       (selectedDates.length === 0 && selectedBar === null) ? 'default' : 'pointer',
                opacity:      (selectedDates.length === 0 && selectedBar === null) ? 0.4 : 1,
              }}
            >
              초기화
            </button>
            <button
              onClick={onSave}
              disabled={!canSave}
              style={{
                flex:         2,
                fontSize:     11,
                padding:      '6px',
                borderRadius: 6,
                border:       'none',
                background:   canSave ? '#00E5A0' : 'rgba(0,229,160,0.2)',
                color:        canSave ? '#04342C' : 'rgba(0,229,160,0.5)',
                fontWeight:   500,
                cursor:       canSave ? 'pointer' : 'default',
              }}
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
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
    {showCustomRateModal && (
      <CustomRateModal
        promoForm={promoForm}
        hotelId={hotelId}
        year={year}
        month={month}
        selectedRoomTypes={selectedRoomTypes}
        onClose={() => setShowCustomRateModal(false)}
        onSaved={() => {
          setShowCustomRateModal(false)
          setSelectedRoomTypes([])
          setRtDropOpen(false)
          onToggleAddPromo()
        }}
      />
    )}
    </>
  )
}
