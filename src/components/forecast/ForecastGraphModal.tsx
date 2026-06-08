'use client'

import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { ForecastDayData, ForecastSchema, CalendarMap } from '@/lib/forecast/types'
import { type EditedValues, makeEditKey } from '@/lib/forecast/save'
import { useDateContext } from '@/contexts/DateContext'

type Metric = 'occ' | 'adr' | 'rev'

// ── CustomXTick ───────────────────────────────────────────────────────────────

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function hasEvent(event: unknown): boolean {
  if (event == null) return false
  const s = String(event).trim()
  return s !== '' && s !== 'null'
}

function isHoliday(is_holiday: unknown): boolean {
  if (is_holiday === true) return true
  if (typeof is_holiday === 'string') return is_holiday.trim() !== '' && is_holiday !== 'N'
  return false
}

function isRedDay(fullDate: string, cal: { is_holiday: unknown; event: unknown } | undefined): boolean {
  const dow = new Date(fullDate + 'T12:00:00').getDay()
  if (dow === 5 || dow === 6) return true
  if (!cal) return false
  if (hasEvent(cal.event)) return true
  if (isHoliday(cal.is_holiday)) return true
  return false
}

type TickDisplay = { char: string; color: string; bg: string; fontWeight: number }

function getTickDisplay(
  fullDate: string,
  cal: { is_holiday: unknown; event: unknown } | undefined,
  today: string,
): TickDisplay {
  if (fullDate === today) {
    return { char: '오', color: '#1E90FF', bg: 'rgba(30,144,255,0.15)', fontWeight: 700 }
  }
  if (cal && hasEvent(cal.event)) {
    return { char: String(cal.event).trim().charAt(0), color: '#E24B4A', bg: 'rgba(226,75,74,0.15)', fontWeight: 500 }
  }
  const dow = new Date(fullDate + 'T12:00:00').getDay()
  const red = dow === 5 || dow === 6 || isHoliday(cal?.is_holiday)
  return {
    char: DOW_LABELS[dow],
    color: red ? '#E24B4A' : '#888',
    bg: red ? 'rgba(226,75,74,0.15)' : 'rgba(136,136,136,0.10)',
    fontWeight: 400,
  }
}

function CustomXTick({ x, y, payload, calendar, year, month, today }: {
  x?: number
  y?: number
  payload?: { value: string }
  calendar: CalendarMap
  year: number
  month: number
  today: string
}) {
  if (!payload || x === undefined || y === undefined) return null
  const [mStr, dStr] = payload.value.split('/')
  const fullDate = `${year}-${String(parseInt(mStr)).padStart(2, '0')}-${String(parseInt(dStr)).padStart(2, '0')}`
  const cal = calendar.get(fullDate)
  const { char, color, bg, fontWeight } = getTickDisplay(fullDate, cal, today)

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={12} textAnchor="middle" fontSize={10} fill={color} fontWeight={fontWeight}>
        {payload.value}
      </text>
      <g transform="translate(0,26)">
        <circle cx={0} cy={0} r={8} fill={bg} />
        <text x={0} y={3.5} textAnchor="middle" fontSize={9} fill={color} fontWeight={500}>
          {char}
        </text>
      </g>
    </g>
  )
}

function fmtValue(v: number, metric: Metric): string {
  if (metric === 'occ') return `${v.toFixed(1)}%`
  if (metric === 'adr') return `${Math.round(v / 1000)}K`
  return `${(v / 1_000_000).toFixed(2)}M`
}

function fmtYAxis(v: number, metric: Metric): string {
  if (metric === 'occ') return `${v.toFixed(0)}%`
  if (metric === 'adr') return `${Math.round(v / 1000)}K`
  return `${(v / 1_000_000).toFixed(1)}M`
}

export function ForecastGraphModal({
  isOpen, onClose, data, editedValues, schema, year, month, calendar, onDateClick,
}: {
  isOpen:        boolean
  onClose:       () => void
  data:          ForecastDayData[]
  editedValues:  EditedValues
  schema:        ForecastSchema
  year:          number
  month:         number
  calendar?:     CalendarMap
  onDateClick?:  (date: string) => void
}) {
  const [metric, setMetric] = useState<Metric>('occ')
  const { otbDate: today } = useDateContext()

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const chartData = useMemo(() => {
    return data.map(day => {
      let otbRn = 0, otbRev = 0, fcRn = 0, fcRev = 0
      for (const code of schema.allSegmentationCodes) {
        const v = day.values[code]
        if (!v) continue
        otbRn  += v.otb_rn
        otbRev += v.otb_rev
        // FCST: editedValues 우선, 없으면 raw data
        const edited = editedValues.get(makeEditKey(day.business_date, code))
        const rn  = edited?.rn  ?? v.rn
        const adr = edited?.adr ?? v.adr
        fcRn  += rn
        fcRev += rn * adr
      }
      const rc = schema.roomCount
      const [, mm, dd] = day.business_date.split('-')
      return {
        date:     `${parseInt(mm)}/${parseInt(dd)}`,
        fullDate: day.business_date,
        otbOcc: rc > 0 ? (otbRn / rc) * 100 : 0,
        otbAdr: otbRn > 0 ? otbRev / otbRn : 0,
        otbRev,
        fcOcc:  rc > 0 ? (fcRn / rc) * 100 : 0,
        fcAdr:  fcRn > 0 ? fcRev / fcRn : 0,
        fcRev,
      }
    })
  }, [data, schema, editedValues])

  const points = useMemo(() =>
    chartData.map(d => ({
      date:     d.date,
      fullDate: d.fullDate,
      FCST: metric === 'occ' ? d.fcOcc  : metric === 'adr' ? d.fcAdr  : d.fcRev,
      OTB:  metric === 'occ' ? d.otbOcc : metric === 'adr' ? d.otbAdr : d.otbRev,
    })),
  [chartData, metric])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.65)' }}
        onClick={onClose}
      />

      <div
        className="relative rounded-2xl flex flex-col w-full"
        style={{
          maxWidth:   1300,
          background: 'var(--color-bg-surface)',
          border:     '1px solid var(--color-border-default)',
          boxShadow:  'var(--shadow-card)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border-default)' }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              OTB vs FCST
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {year}년 {month}월 · 일별 추이
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Metric toggle */}
            <div
              className="flex gap-1 p-1 rounded-lg"
              style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)' }}
            >
              {(['occ', 'adr', 'rev'] as Metric[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className="px-3 py-1 rounded text-xs font-semibold transition-all"
                  style={{
                    background: metric === m ? 'var(--color-accent-primary, #00E5A0)' : 'transparent',
                    color:      metric === m ? '#000' : 'var(--color-text-muted)',
                  }}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1"
              aria-label="닫기"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="px-4 pt-5 pb-4" style={{ height: 500, cursor: onDateClick ? 'pointer' : 'default' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
              onClick={(chartData: any) => {
                const label = chartData?.activeLabel
                if (!label) return
                const point = points.find(p => p.date === label)
                if (!point?.fullDate) return
                if (point.fullDate < today) return  // 과거 일자 차단
                if (onDateClick) onDateClick(point.fullDate)
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-default, #2a2a2a)" />

              {/* 빨간 일자(금/토/이벤트/공휴일) 세로 점선 */}
              {points
                .filter(p => isRedDay(p.fullDate, (calendar ?? new Map()).get(p.fullDate)))
                .map(p => (
                  <ReferenceLine
                    key={p.date}
                    x={p.date}
                    stroke="#E24B4A"
                    strokeDasharray="3 3"
                    strokeOpacity={0.35}
                  />
                ))
              }

              <XAxis
                dataKey="date"
                tick={(props: any) => (
                  <CustomXTick
                    {...props}
                    calendar={calendar ?? new Map()}
                    year={year}
                    month={month}
                    today={today}
                  />
                )}
                axisLine={{ stroke: 'var(--color-border-default, #2a2a2a)' }}
                tickLine={false}
                height={50}
                interval={0}
              />
              <YAxis
                tickFormatter={v => fmtYAxis(v as number, metric)}
                tick={{ fontSize: 11, fill: 'var(--color-text-tertiary, #666)' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={{
                  background:   'var(--color-bg-elevated, #111)',
                  border:       '1px solid var(--color-border-default, #2a2a2a)',
                  borderRadius: 8,
                  fontSize:     12,
                }}
                labelStyle={{ color: 'var(--color-text-secondary, #aaa)', marginBottom: 4 }}
                formatter={(value, name) => [fmtValue(value as number, metric), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line
                type="monotone"
                dataKey="FCST"
                stroke="var(--color-accent-primary, #00E5A0)"
                strokeWidth={2}
                dot={(dotProps: any) => {
                  const isPast = (dotProps.payload?.fullDate ?? '') < today
                  return (
                    <circle
                      key={dotProps.index}
                      cx={dotProps.cx}
                      cy={dotProps.cy}
                      r={2.5}
                      fill="#00E5A0"
                      opacity={isPast ? 0.3 : 1}
                    />
                  )
                }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="OTB"
                stroke="#777"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="flex justify-end px-6 pb-4 shrink-0">
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>ESC로 닫기</span>
        </div>
      </div>
    </div>
  )
}
