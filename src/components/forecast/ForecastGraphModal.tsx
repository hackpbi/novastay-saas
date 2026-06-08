'use client'

import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { ForecastDayData, ForecastSchema, CalendarMap } from '@/lib/forecast/types'

type Metric = 'occ' | 'adr' | 'rev'

// ── CustomXTick ───────────────────────────────────────────────────────────────

function isRedDay(cal: { day: string; is_holiday: boolean; event: string | null } | undefined): boolean {
  if (!cal) return false
  return cal.day === '금' || cal.day === '토' || cal.is_holiday || !!(cal.event && cal.event.trim())
}

function CustomXTick({ x, y, payload, calendar, year, month }: {
  x?: number
  y?: number
  payload?: { value: string }
  calendar: CalendarMap
  year: number
  month: number
}) {
  if (!payload || x === undefined || y === undefined) return null
  const [mStr, dStr] = payload.value.split('/')
  const fullDate = `${year}-${String(parseInt(mStr)).padStart(2, '0')}-${String(parseInt(dStr)).padStart(2, '0')}`
  const cal = calendar.get(fullDate)
  const red = isRedDay(cal)
  const eventChar = cal?.event?.trim()?.charAt(0) ?? ''

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={12} textAnchor="middle" fontSize={10} fill={red ? '#E24B4A' : '#888'}>
        {payload.value}
      </text>
      {eventChar && (
        <g transform="translate(0,26)">
          <circle cx={0} cy={0} r={8} fill="rgba(226,75,74,0.15)" />
          <text x={0} y={3.5} textAnchor="middle" fontSize={9} fill="#E24B4A" fontWeight={500}>
            {eventChar}
          </text>
        </g>
      )}
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
  isOpen, onClose, data, schema, year, month, calendar, onDateClick,
}: {
  isOpen:       boolean
  onClose:      () => void
  data:         ForecastDayData[]
  schema:       ForecastSchema
  year:         number
  month:        number
  calendar?:    CalendarMap
  onDateClick?: (date: string) => void
}) {
  const [metric, setMetric] = useState<Metric>('occ')

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
        fcRn   += v.rn
        fcRev  += v.rn * v.adr
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
  }, [data, schema])

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
                if (point?.fullDate && onDateClick) onDateClick(point.fullDate)
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-default, #2a2a2a)" />

              {/* 빨간 일자(금/토/이벤트/공휴일) 세로 점선 */}
              {points
                .filter(p => isRedDay((calendar ?? new Map()).get(p.fullDate)))
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
                dot={{ r: 2.5, fill: 'var(--color-accent-primary, #00E5A0)', strokeWidth: 0 }}
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
