'use client'

import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  generateCalendarDays, isFriOrSat, toDateStr, dayCellStyle, DOW_LABELS,
} from './BaseCalendar'

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_RATES: Record<string, { current: number; prev?: number }> = {
  '2026-06-05': { current: 150, prev: 100 },
  '2026-06-06': { current: 150, prev: 100 },
  '2026-06-07': { current: 100 },
  '2026-06-08': { current: 100 },
  '2026-06-11': { current: 110 },
  '2026-06-12': { current: 200, prev: 110 },
  '2026-06-13': { current: 200 },
}

const MOCK_BAR_LIST = [80, 100, 110, 120, 150, 190, 200, 230, 250, 300]

// ── Color helpers ─────────────────────────────────────────────────────────────

function getRateColor(rate: number): string {
  if (rate >= 200) return '#E24B4A'
  if (rate >= 150) return '#BA7517'
  if (rate >= 100) return '#00B883'
  return '#534AB7'
}

function getRateBg(rate: number): string {
  if (rate >= 200) return 'rgba(226,75,74,0.12)'
  if (rate >= 150) return 'rgba(186,117,23,0.12)'
  if (rate >= 100) return 'rgba(0,178,131,0.12)'
  return 'rgba(83,74,183,0.12)'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RateCalendarView() {
  const [year,         setYear]         = useState(() => new Date().getFullYear())
  const [month,        setMonth]        = useState(() => new Date().getMonth() + 1)
  const [selectedRate, setSelectedRate] = useState<number | null>(null)
  const [appliedRates, setAppliedRates] = useState<Record<string, number>>({})
  const [newRateInput, setNewRateInput] = useState('')

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedRate(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const days = generateCalendarDays(year, month)

  const applyRate = (dateStr: string) => {
    if (!selectedRate) return
    setAppliedRates(prev => ({ ...prev, [dateStr]: selectedRate }))
  }

  const getDisplayRate = (dateStr: string) => {
    if (appliedRates[dateStr] !== undefined) return { current: appliedRates[dateStr] }
    return MOCK_RATES[dateStr]
  }

  const handleAddRate = () => {
    const val = parseInt(newRateInput)
    if (!isNaN(val) && val > 0 && !MOCK_BAR_LIST.includes(val)) {
      setSelectedRate(val)
      setNewRateInput('')
    }
  }

  return (
    <div style={{
      border:       '1px solid var(--color-border-default)',
      borderRadius: 12,
      overflow:     'hidden',
      background:   'var(--color-bg-secondary)',
      boxShadow:    'var(--shadow-card)',
    }}>
      {/* 월 헤더 */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '12px 16px',
        borderBottom:   '0.5px solid var(--color-border-tertiary)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {year}년 {month}월 · 요금 달력
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={prevMonth} style={{
            width: 24, height: 24, borderRadius: 6,
            border: '1px solid var(--color-border-default)',
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}>
            <ChevronDown size={12} style={{ transform: 'rotate(90deg)' }} />
          </button>
          <button onClick={nextMonth} style={{
            width: 24, height: 24, borderRadius: 6,
            border: '1px solid var(--color-border-default)',
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}>
            <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </div>
      </div>

      {/* 달력 + 사이드 */}
      <div style={{ display: 'flex' }}>

        {/* 달력 영역 */}
        <div style={{ flex: 1, padding: '12px 16px' }}>
          {/* 요일 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
            {DOW_LABELS.map((d, i) => (
              <div key={d} style={{
                fontSize:  10,
                color:     i >= 5 ? '#00B883' : 'var(--color-text-secondary)',
                textAlign: 'center',
                padding:   '3px 0',
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
            {days.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} style={{ minHeight: 80 }} />
              const dateStr   = toDateStr(year, month, day)
              const rate      = getDisplayRate(dateStr)
              const isWeekend = isFriOrSat(year, month, day)

              return (
                <div
                  key={day}
                  onClick={() => selectedRate && applyRate(dateStr)}
                  style={dayCellStyle(year, month, day, {
                    cursor: selectedRate ? 'pointer' : 'default',
                  })}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: isWeekend ? '#00B883' : undefined }}>
                      {day}
                    </span>
                    {rate?.prev !== undefined ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 9, color: 'var(--color-text-secondary)', textDecoration: 'line-through' }}>
                          {rate.prev}
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>→</span>
                        <span style={{ fontSize: 10, fontWeight: 500, color: getRateColor(rate.current) }}>
                          {rate.current}
                        </span>
                      </div>
                    ) : rate ? (
                      <span style={{
                        fontSize:     10,
                        fontWeight:   500,
                        padding:      '1px 5px',
                        borderRadius: 3,
                        background:   getRateBg(rate.current),
                        color:        getRateColor(rate.current),
                      }}>
                        {rate.current}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>—</span>
                    )}
                  </div>

                  {/* OCC 미니바 (목업) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 'auto' }}>
                    <div style={{ height: 3, borderRadius: 1, width: 30, background: '#E24B4A' }} />
                    <span style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>49%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 우측 BAR 요금 리스트 */}
        <div style={{
          width:       140,
          borderLeft:  '0.5px solid var(--color-border-tertiary)',
          padding:     10,
          flexShrink:  0,
        }}>
          <div style={{
            fontSize:      10,
            fontWeight:    500,
            color:         'var(--color-text-secondary)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom:  6,
          }}>
            BAR 요금 <span style={{ fontWeight: 400, fontSize: 9 }}>(천원)</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 300, overflowY: 'auto' }}>
            {MOCK_BAR_LIST.map(rate => (
              <div
                key={rate}
                onClick={() => setSelectedRate(selectedRate === rate ? null : rate)}
                style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        5,
                  padding:    '5px 7px',
                  borderRadius: 'var(--border-radius-md)',
                  border:     selectedRate === rate
                    ? '1.5px solid #00E5A0'
                    : '0.5px solid var(--color-border-tertiary)',
                  background: selectedRate === rate
                    ? 'rgba(0,229,160,0.08)'
                    : 'var(--color-bg-secondary)',
                  cursor:     'pointer',
                  transition: 'all 0.1s',
                }}
              >
                <div style={{
                  width:      6,
                  height:     6,
                  borderRadius: '50%',
                  background: getRateColor(rate),
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize:   11,
                  fontWeight: 500,
                  color:      selectedRate === rate ? '#00E5A0' : 'var(--color-text-primary)',
                }}>
                  {rate}
                </span>
              </div>
            ))}
          </div>

          {/* 요금 추가 입력 */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            <input
              type="number"
              placeholder="천원"
              value={newRateInput}
              onChange={e => setNewRateInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddRate() }}
              style={{
                flex:         1,
                fontSize:     11,
                padding:      '4px 6px',
                borderRadius: 'var(--border-radius-md)',
                border:       '0.5px solid var(--color-border-tertiary)',
                background:   'var(--color-bg-secondary)',
                color:        'var(--color-text-primary)',
                minWidth:     0,
                outline:      'none',
              }}
            />
            <button
              onClick={handleAddRate}
              style={{
                fontSize:     11,
                padding:      '4px 7px',
                borderRadius: 'var(--border-radius-md)',
                border:       'none',
                background:   '#00E5A0',
                color:        '#04342C',
                cursor:       'pointer',
                fontWeight:   500,
              }}
            >
              +
            </button>
          </div>

          {/* 선택된 요금 안내 */}
          {selectedRate !== null && (
            <div style={{
              marginTop:    8,
              padding:      '6px 8px',
              borderRadius: 'var(--border-radius-md)',
              background:   'rgba(0,229,160,0.08)',
              border:       '0.5px solid rgba(0,229,160,0.3)',
            }}>
              <div style={{ fontSize: 11, color: '#00E5A0', fontWeight: 500 }}>{selectedRate} 선택됨</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2 }}>날짜 클릭으로 적용</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 1 }}>ESC로 해제</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
