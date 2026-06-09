'use client'

import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  generateCalendarDays, isFriOrSat, getDow, toDateStr, dayCellStyle, DOW_LABELS,
} from './BaseCalendar'

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_PROMOS: Record<string, { name: string; color: string }[]> = {
  '2026-06-05': [{ name: '얼리버드', color: '#00B883' }],
  '2026-06-06': [{ name: '얼리버드', color: '#00B883' }, { name: '주중특가', color: '#BA7517' }],
  '2026-06-07': [{ name: '주중특가', color: '#BA7517' }],
  '2026-06-08': [{ name: '주중특가', color: '#BA7517' }],
  '2026-06-12': [{ name: '얼리버드', color: '#00B883' }, { name: '2연박', color: '#534AB7' }, { name: '조식포함', color: '#E24B4A' }],
  '2026-06-13': [{ name: '얼리버드', color: '#00B883' }, { name: '2연박', color: '#534AB7' }],
}

const MOCK_PROMO_DETAIL = [
  {
    id: '1', name: '얼리버드', type: '정률 -10%', rooms: '전 객실',
    rooms_detail: [
      { type: 'DFT', bar: 100, disc: '-10%', final: 90  },
      { type: 'SDB', bar: 150, disc: '-10%', final: 135 },
      { type: 'SUT', bar: 200, disc: '-10%', final: 180 },
    ],
  },
  {
    id: '2', name: '주중특가', type: '정률 -8%', rooms: 'DFT, SDB',
    rooms_detail: [
      { type: 'DFT', bar: 100, disc: '-8%', final: 92  },
      { type: 'SDB', bar: 150, disc: '-8%', final: 138 },
    ],
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function PromoCalendarView() {
  const [year,        setYear]        = useState(() => new Date().getFullYear())
  const [month,       setMonth]       = useState(() => new Date().getMonth() + 1)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  useEffect(() => {
    if (!selectedDay) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedDay(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedDay])

  const days               = generateCalendarDays(year, month)
  const selectedDateStr    = selectedDay ? toDateStr(year, month, selectedDay) : null
  const selectedDayPromos  = selectedDateStr ? (MOCK_PROMOS[selectedDateStr] ?? []) : []

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
          {year}년 {month}월 · 프로모션 달력
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

      {/* 달력 */}
      <div style={{ padding: '10px 14px' }}>
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
            if (!day) return <div key={`empty-${i}`} style={{ minHeight: 70 }} />
            const dateStr    = toDateStr(year, month, day)
            const promos     = MOCK_PROMOS[dateStr] ?? []
            const isWeekend  = isFriOrSat(year, month, day)

            return (
              <div
                key={day}
                onClick={() => setSelectedDay(day)}
                style={dayCellStyle(year, month, day, { minHeight: 70 })}
              >
                <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 4, color: isWeekend ? '#00B883' : undefined }}>
                  {day}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  {promos.slice(0, 2).map(p => (
                    <div key={p.name} style={{
                      fontSize:     10,
                      padding:      '2px 8px',
                      borderRadius: 20,
                      background:   `${p.color}22`,
                      color:        p.color,
                      whiteSpace:   'nowrap',
                    }}>
                      {p.name}
                    </div>
                  ))}
                  {promos.length > 2 && (
                    <div style={{ fontSize: 9, color: 'var(--color-text-secondary)', padding: '1px 3px' }}>
                      +{promos.length - 2}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 날짜 클릭 모달 */}
      {selectedDay && (
        <div
          onClick={() => setSelectedDay(null)}
          style={{
            position:       'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background:     'rgba(0,0,0,0.5)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            zIndex:         200,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:   'var(--color-bg-elevated)',
              border:       '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--border-radius-lg)',
              width:        440,
              maxHeight:    '80vh',
              overflowY:    'auto',
            }}
          >
            {/* 모달 헤더 */}
            <div style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '14px 16px',
              borderBottom:   '0.5px solid var(--color-border-tertiary)',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  {year}년 {month}월 {selectedDay}일
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {getDow(year, month, selectedDay)}요일 · 프로모션 {selectedDayPromos.length}개
                </div>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                style={{
                  width: 26, height: 26,
                  borderRadius: 'var(--border-radius-md)',
                  border:       '0.5px solid var(--color-border-tertiary)',
                  background:   'transparent',
                  cursor:       'pointer',
                  color:        'var(--color-text-secondary)',
                  fontSize:     14,
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>

            {/* 프로모션 카드 목록 */}
            {MOCK_PROMO_DETAIL.map(promo => (
              <div key={promo.id} style={{
                margin:       '10px 14px',
                border:       '0.5px solid var(--color-border-tertiary)',
                borderRadius: 'var(--border-radius-md)',
                overflow:     'hidden',
              }}>
                {/* 카드 헤더 */}
                <div style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  padding:        '8px 12px',
                  background:     'var(--color-bg-tertiary)',
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {promo.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 1 }}>
                      {promo.type} · {promo.rooms}
                    </div>
                  </div>
                  <button style={{
                    fontSize:     11,
                    color:        '#E24B4A',
                    background:   'none',
                    border:       'none',
                    cursor:       'pointer',
                    padding:      '2px 6px',
                    borderRadius: 4,
                  }}>
                    삭제
                  </button>
                </div>

                {/* 객실타입별 금액 테이블 */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                      {['객실타입', 'BAR Rate', '할인', '적용 요금'].map((h, i) => (
                        <th key={h} style={{
                          fontSize:   10,
                          color:      'var(--color-text-secondary)',
                          padding:    '5px 12px',
                          textAlign:  i === 0 ? 'left' : 'right',
                          fontWeight: 400,
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {promo.rooms_detail.map((r, i) => (
                      <tr key={r.type} style={{
                        borderBottom: i < promo.rooms_detail.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                      }}>
                        <td style={{ fontSize: 11, padding: '6px 12px', color: 'var(--color-text-primary)' }}>{r.type}</td>
                        <td style={{ fontSize: 11, padding: '6px 12px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{r.bar}K</td>
                        <td style={{ fontSize: 11, padding: '6px 12px', textAlign: 'right', color: '#00B883' }}>{r.disc}</td>
                        <td style={{ fontSize: 11, padding: '6px 12px', textAlign: 'right', fontWeight: 500, color: 'var(--color-text-primary)' }}>{r.final}K</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* 모달 푸터 */}
            <div style={{
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'center',
              padding:        '10px 14px',
              borderTop:      '0.5px solid var(--color-border-tertiary)',
            }}>
              <button style={{
                fontSize:     11,
                padding:      '5px 11px',
                borderRadius: 'var(--border-radius-md)',
                border:       '0.5px solid var(--color-border-tertiary)',
                background:   'transparent',
                color:        'var(--color-text-primary)',
                cursor:       'pointer',
                display:      'inline-flex',
                alignItems:   'center',
                gap:          4,
              }}>
                + 프로모션 추가
              </button>
              <button
                onClick={() => setSelectedDay(null)}
                style={{
                  fontSize:     11,
                  padding:      '5px 14px',
                  borderRadius: 'var(--border-radius-md)',
                  border:       'none',
                  background:   '#00E5A0',
                  color:        '#04342C',
                  fontWeight:   500,
                  cursor:       'pointer',
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
