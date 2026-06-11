'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토'] as const

function getDateRange(start: string, end: string): string[] {
  if (!start || !end || end < start) return []
  const dates: string[] = []
  let cur = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (cur <= last) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }
  return dates
}

interface RoomType {
  room_type_code:        string
  room_type_description: string
  surcharge:             number | null
}

interface RoomRate {
  room_type_code: string
  rate:           number | null  // 천원 단위
}

interface DayRate {
  date:      string
  dow:       string
  isWeekend: boolean
  roomRates: RoomRate[]
}

interface Props {
  hotelId:           string
  promotionId:       string
  promotionName:     string
  stayStart:         string
  stayEnd:           string
  year:              number
  month:             number
  selectedRoomTypes: string[]
  barRateMap?:       Record<number, { base_rate: number }>
  onClose:           () => void
  onSaved:           () => void
}

export function CustomRateModal({ hotelId, promotionId, promotionName, stayStart, stayEnd, selectedRoomTypes, onClose, onSaved }: Props) {

  const dates = useMemo(() => getDateRange(stayStart, stayEnd), [stayStart, stayEnd])

  const [dayRates,     setDayRates]     = useState<DayRate[]>([])
  const [bulkDows,     setBulkDows]     = useState<number[]>([])
  const [bulkRate,     setBulkRate]     = useState<string>('')
  const [filterStart,  setFilterStart]  = useState<string>(stayStart)
  const [filterEnd,    setFilterEnd]    = useState<string>(stayEnd)
  const [focusedCell,  setFocusedCell]  = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [err,          setErr]          = useState<string | null>(null)

  const { data: roomTypes = [] } = useQuery<RoomType[]>({
    queryKey: ['c01_room_types', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c01_room_types')
        .select('room_type_code, room_type_description, surcharge')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
        .order('surcharge', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId,
  })

  const { data: baseRates = [] } = useQuery<{ stay_date: string; new_rate: number }[]>({
    queryKey: ['base-rates-custom', hotelId, stayStart, stayEnd],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s02_rate_detail')
        .select('stay_date, new_rate')
        .eq('hotel_id', hotelId)
        .eq('room_type_code', 'BASE')
        .eq('date_type', 'single')
        .gte('stay_date', stayStart)
        .lte('stay_date', stayEnd)
      if (error) throw error
      return data ?? []
    },
    enabled: !!hotelId && !!stayStart && !!stayEnd,
  })

  const visibleRoomTypes = useMemo(() => {
    if (selectedRoomTypes.length === 0) return roomTypes
    return roomTypes.filter(rt => selectedRoomTypes.includes(rt.room_type_code))
  }, [roomTypes, selectedRoomTypes])

  const baseRoomType = useMemo(() => {
    if (visibleRoomTypes.length === 0) return null
    return [...visibleRoomTypes].sort((a, b) => {
      const sa = a.surcharge ?? -Infinity
      const sb = b.surcharge ?? -Infinity
      return sa - sb
    })[0]
  }, [visibleRoomTypes])

  const baseRateMap = useMemo(() =>
    Object.fromEntries(baseRates.map(r => [r.stay_date, r.new_rate]))
  , [baseRates])

  // dates 또는 visibleRoomTypes 변경 시 dayRates 초기화 (기존 입력값 보존)
  useEffect(() => {
    setDayRates(prev => {
      const prevRates: Record<string, Record<string, number | null>> = {}
      for (const dr of prev) {
        prevRates[dr.date] = Object.fromEntries(dr.roomRates.map(rr => [rr.room_type_code, rr.rate]))
      }
      return dates.map(date => {
        const dow = new Date(date + 'T00:00:00').getDay()
        return {
          date,
          dow:       DOW_KR[dow],
          isWeekend: [0, 5, 6].includes(dow),
          roomRates: visibleRoomTypes.map(rt => ({
            room_type_code: rt.room_type_code,
            rate: prevRates[date]?.[rt.room_type_code] ?? null,
          })),
        }
      })
    })
  }, [dates, visibleRoomTypes])

  const filteredDayRates = useMemo(() =>
    dayRates.filter(dr => {
      if (filterStart && dr.date < filterStart) return false
      if (filterEnd   && dr.date > filterEnd)   return false
      return true
    })
  , [dayRates, filterStart, filterEnd])

  const handleAutoFill = () => {
    const baseSurcharge = baseRoomType?.surcharge ?? 0
    setDayRates(prev => prev.map(dr => ({
      ...dr,
      roomRates: dr.roomRates.map(rr => {
        const base = baseRateMap[dr.date]
        const rt   = visibleRoomTypes.find(r => r.room_type_code === rr.room_type_code)
        if (base == null || !rt) return rr
        const diff = (rt.surcharge ?? 0) - baseSurcharge
        return { ...rr, rate: Math.round((base + diff) / 1000) }
      }),
    })))
  }

  const handleBulkApply = () => {
    const baseRateVal = parseFloat(bulkRate) * 1000
    if (isNaN(baseRateVal) || bulkDows.length === 0 || !baseRoomType) return
    const baseSurcharge = baseRoomType.surcharge ?? 0
    const targetDates   = new Set(filteredDayRates.map(dr => dr.date))

    setDayRates(prev => prev.map(dr => {
      if (!targetDates.has(dr.date)) return dr
      const dow = new Date(dr.date + 'T00:00:00').getDay()
      if (!bulkDows.includes(dow)) return dr
      return {
        ...dr,
        roomRates: dr.roomRates.map(rr => {
          const rt = visibleRoomTypes.find(r => r.room_type_code === rr.room_type_code)
          if (!rt) return rr
          const diff = (rt.surcharge ?? 0) - baseSurcharge
          return { ...rr, rate: Math.round((baseRateVal + diff) / 1000) }
        }),
      }
    }))
  }

  const handleSave = async () => {
    setSaving(true); setErr(null)
    try {
      const rows: {
        hotel_id:       string
        promotion_id:   string
        stay_date:      string
        room_type_code: string
        rate:           number
      }[] = []
      for (const dr of dayRates) {
        for (const rr of dr.roomRates) {
          if (rr.rate == null) continue
          rows.push({
            hotel_id:       hotelId,
            promotion_id:   promotionId,
            stay_date:      dr.date,
            room_type_code: rr.room_type_code,
            rate:           rr.rate * 1000,
          })
        }
      }
      if (rows.length === 0) {
        onSaved()
        onClose()
        return
      }
      const { error } = await (supabase as any)
        .from('s06_rate_custom')
        .upsert(rows, {
          onConflict: 'promotion_id,stay_date,room_type_code',
          ignoreDuplicates: false,
        })
      if (error) throw error
      onSaved()
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const rateInputStyle: React.CSSProperties = {
    width:        52,
    fontSize:     12,
    fontWeight:   500,
    textAlign:    'right',
    background:   'transparent',
    border:       'none',
    borderBottom: '1px solid transparent',
    color:        'var(--color-text-primary)',
    outline:      'none',
    padding:      '2px 0',
    cursor:       'text',
  }

  const canBulk = bulkDows.length > 0 && !!bulkRate

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{
        position:      'relative',
        width:         '100%',
        maxWidth:      580,
        maxHeight:     '80vh',
        display:       'flex',
        flexDirection: 'column',
        borderRadius:  16,
        overflow:      'hidden',
        background:    'var(--color-bg-secondary)',
        border:        '1px solid var(--color-border-default)',
        boxShadow:     'var(--shadow-elevated)',
      }}>

        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '0.5px solid var(--color-border-default)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            요금 설정 — {promotionName || '(이름 없음)'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleAutoFill}
              style={{
                fontSize: 11, padding: '5px 12px', borderRadius: 6,
                border: '0.5px solid var(--color-border-default)',
                background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer',
              }}
            >
              Surcharge 자동적용
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', lineHeight: 1 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 컨텐츠 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <style>{`
            .no-spinner::-webkit-outer-spin-button,
            .no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            .no-spinner[type=number] { -moz-appearance: textfield; }
          `}</style>

          {dates.length === 0 ? (
            <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>
              투숙기간을 설정해야 요금을 입력할 수 있습니다
            </div>
          ) : (
            <>
              {/* 날짜 필터 + 일괄 적용 바 */}
              <div style={{
                display:      'flex',
                alignItems:   'center',
                gap:          8,
                padding:      '8px 12px',
                background:   'rgba(0,229,160,0.04)',
                borderBottom: '0.5px solid var(--color-border-default)',
                flexWrap:     'wrap',
              }}>
                {/* 날짜 범위 필터 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>기간</span>
                  <input
                    type="date"
                    value={filterStart}
                    min={stayStart}
                    max={stayEnd}
                    onChange={e => setFilterStart(e.target.value)}
                    style={{
                      fontSize: 11, padding: '3px 6px', borderRadius: 4,
                      border: '0.5px solid var(--color-border-default)',
                      background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>~</span>
                  <input
                    type="date"
                    value={filterEnd}
                    min={stayStart}
                    max={stayEnd}
                    onChange={e => setFilterEnd(e.target.value)}
                    style={{
                      fontSize: 11, padding: '3px 6px', borderRadius: 4,
                      border: '0.5px solid var(--color-border-default)',
                      background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', outline: 'none',
                    }}
                  />
                  {(filterStart !== stayStart || filterEnd !== stayEnd) && (
                    <button
                      onClick={() => { setFilterStart(stayStart); setFilterEnd(stayEnd) }}
                      style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 4,
                        border: '0.5px solid var(--color-border-default)',
                        background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer',
                      }}
                    >
                      전체
                    </button>
                  )}
                </div>

                {/* 구분선 */}
                <div style={{ width: 1, height: 20, background: 'var(--color-border-default)', flexShrink: 0 }} />

                {/* 요일 체크박스 */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {(['일','월','화','수','목','금','토'] as const).map((label, dow) => {
                    const checked = bulkDows.includes(dow)
                    return (
                      <label
                        key={dow}
                        style={{
                          display:      'flex',
                          alignItems:   'center',
                          fontSize:     11,
                          padding:      '2px 6px',
                          borderRadius: 4,
                          cursor:       'pointer',
                          border:       checked
                            ? '0.5px solid #00E5A0'
                            : '0.5px solid var(--color-border-default)',
                          background:   checked ? 'rgba(0,229,160,0.1)' : 'var(--color-bg-tertiary)',
                          color:        checked
                            ? '#00E5A0'
                            : (dow === 0 || dow === 6) ? '#00E5A0' : 'var(--color-text-secondary)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setBulkDows(prev =>
                              checked ? prev.filter(d => d !== dow) : [...prev, dow]
                            )
                          }
                          style={{ display: 'none' }}
                        />
                        {label}
                      </label>
                    )
                  })}
                </div>

                {/* 구분선 */}
                <div style={{ width: 1, height: 20, background: 'var(--color-border-default)', flexShrink: 0 }} />

                {/* 기준 요금 입력 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    {baseRoomType?.room_type_code ?? '기준'} 요금
                  </span>
                  <input
                    type="number"
                    className="no-spinner"
                    value={bulkRate}
                    onChange={e => setBulkRate(e.target.value)}
                    placeholder="예: 150"
                    style={{
                      width: 64, fontSize: 11, padding: '3px 6px', borderRadius: 4,
                      border: '0.5px solid var(--color-border-default)',
                      background: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)',
                      outline: 'none', textAlign: 'right',
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>K</span>
                </div>

                {/* 적용 버튼 */}
                <button
                  onClick={handleBulkApply}
                  disabled={!canBulk}
                  style={{
                    fontSize:     11,
                    padding:      '4px 12px',
                    borderRadius: 4,
                    border:       'none',
                    background:   canBulk ? '#00E5A0' : 'rgba(0,229,160,0.2)',
                    color:        canBulk ? '#04342C' : 'rgba(0,229,160,0.4)',
                    fontWeight:   500,
                    cursor:       canBulk ? 'pointer' : 'default',
                    flexShrink:   0,
                  }}
                >
                  적용
                </button>
              </div>

              {/* 요금 테이블 */}
              <div style={{ padding: '0 18px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{
                        padding: '8px 6px', textAlign: 'left', fontWeight: 500,
                        color: 'var(--color-text-secondary)', fontSize: 10,
                        borderBottom: '0.5px solid var(--color-border-default)',
                        position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', zIndex: 1,
                      }}>날짜</th>
                      <th style={{
                        padding: '8px 6px', textAlign: 'center', fontWeight: 500,
                        color: 'var(--color-text-secondary)', fontSize: 10,
                        borderBottom: '0.5px solid var(--color-border-default)',
                        position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', zIndex: 1,
                      }}>요일</th>
                      {visibleRoomTypes.map(rt => (
                        <th key={rt.room_type_code} style={{
                          padding: '8px 6px', textAlign: 'right', fontWeight: 500,
                          color: 'var(--color-text-secondary)', fontSize: 10, whiteSpace: 'nowrap',
                          borderBottom: '0.5px solid var(--color-border-default)',
                          position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', zIndex: 1,
                        }}>
                          {rt.room_type_code}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDayRates.map(dr => (
                      <tr key={dr.date} style={{ borderBottom: '0.5px solid var(--color-border-default)' }}>
                        <td style={{ padding: '6px 6px', color: dr.isWeekend ? '#00e5a0' : 'var(--color-text-primary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {dr.date.slice(5)}
                        </td>
                        <td style={{ padding: '6px 6px', textAlign: 'center', color: dr.isWeekend ? '#00e5a0' : 'var(--color-text-secondary)' }}>
                          {dr.dow}
                        </td>
                        {dr.roomRates.map(rr => {
                          const cellKey = `${dr.date}_${rr.room_type_code}`
                          const rateColor = rr.rate == null
                            ? 'var(--color-text-tertiary)'
                            : rr.rate >= 200 ? '#E24B4A'
                            : rr.rate >= 150 ? '#BA7517'
                            : rr.rate >= 100 ? '#00B883'
                            : 'var(--color-text-primary)'
                          return (
                            <td key={rr.room_type_code} style={{ padding: '4px 6px', textAlign: 'right' }}>
                              <input
                                type="number"
                                className="no-spinner"
                                value={rr.rate ?? ''}
                                placeholder="—"
                                onFocus={() => setFocusedCell(cellKey)}
                                onBlur={() => setFocusedCell(null)}
                                onChange={e => {
                                  const val = e.target.value === '' ? null : Number(e.target.value)
                                  setDayRates(prev => prev.map(d =>
                                    d.date !== dr.date ? d : {
                                      ...d,
                                      roomRates: d.roomRates.map(r =>
                                        r.room_type_code !== rr.room_type_code ? r : { ...r, rate: val }
                                      ),
                                    }
                                  ))
                                }}
                                style={{
                                  ...rateInputStyle,
                                  borderBottom: focusedCell === cellKey
                                    ? '1px solid #00E5A0'
                                    : '1px solid transparent',
                                  color: rateColor,
                                }}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* 푸터 */}
        <div style={{
          flexShrink: 0, borderTop: '0.5px solid var(--color-border-default)',
          padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
        }}>
          {err && <span style={{ fontSize: 11, color: '#E24B4A', marginRight: 'auto' }}>{err}</span>}
          <button
            onClick={onClose}
            style={{
              fontSize: 12, padding: '6px 16px', borderRadius: 6,
              border: '0.5px solid var(--color-border-default)',
              background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              fontSize: 12, padding: '6px 20px', borderRadius: 6,
              border: 'none', background: '#00E5A0', color: '#04342C',
              fontWeight: 500, cursor: saving ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5, opacity: saving ? 0.7 : 1,
            }}
          >
            {saving && <Loader2 size={11} className="animate-spin" />}
            확정
          </button>
        </div>
      </div>
    </div>
  )
}
