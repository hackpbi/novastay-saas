'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { PickupRow } from '@/hooks/usePickupData'
import type { SegLeaf } from './MarketPickupMonthBlock'
import { lastDayOfMonth, inMonth, WEEKDAY_KR } from '@/utils/pickupPageUtils'
import { getDayColor, getEventBadge } from '@/utils/dateUtils'

// 이벤트 동그라미 뱃지
function EventDot({ text }: { text: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginLeft: 4,
      background: 'rgba(251,191,36,0.15)', border: '0.5px solid rgba(251,191,36,0.4)',
      color: '#FBBF24', fontSize: 9, fontWeight: 600,
    }}>{text}</span>
  )
}

type Metric = 'rn' | 'adr' | 'rev'
type Agg = { otbN: number; vsN: number; otbR: number; vsR: number }

const emptyAgg = (): Agg => ({ otbN: 0, vsN: 0, otbR: 0, vsR: 0 })
function addAgg(a: Agg, b: Agg) { a.otbN += b.otbN; a.vsN += b.vsN; a.otbR += b.otbR; a.vsR += b.vsR }

// 지표값 (null = 데이터 없음)
function metricValue(a: Agg, metric: Metric): number | null {
  switch (metric) {
    case 'rn':  return a.otbN - a.vsN
    case 'adr': return a.otbN > 0 && a.vsN > 0 ? Math.round((a.otbR / a.otbN - a.vsR / a.vsN) / 1000) : null
    case 'rev': return Math.round((a.otbR - a.vsR) / 1e6 * 10) / 10
  }
}
function fmtMetric(v: number | null, metric: Metric): string {
  if (v === null || v === 0) return '—'
  const sign = v > 0 ? '+' : ''
  return metric === 'rn' ? `${sign}${v}` : metric === 'adr' ? `${sign}${v}k` : `${sign}${v}M`
}
const cellColor = (v: number | null) => (v === null || v === 0 ? '#555' : v < 0 ? '#E24B4A' : 'var(--color-text-primary)')

export default function MarketPickupAllDaysModal({
  open, onClose, year, month, pickupRows, activeSegs,
}: {
  open:       boolean
  onClose:    () => void
  year:       number
  month:      number   // 0-based
  pickupRows: PickupRow[]
  activeSegs: SegLeaf[]
}) {
  // 누적 토글: 0=R/N, 1=R/N+ADR, 2=R/N+ADR+REV
  const [metricLevel, setMetricLevel] = useState<0 | 1 | 2>(1)
  const handleMetricClick = (clicked: 'adr' | 'rev') => {
    if (clicked === 'adr') setMetricLevel(prev => (prev >= 1 ? 0 : 1))
    else setMetricLevel(prev => (prev >= 2 ? 1 : 2))
  }
  const METS: Metric[] = metricLevel === 0 ? ['rn'] : metricLevel === 1 ? ['rn', 'adr'] : ['rn', 'adr', 'rev']
  const metLabel: Record<Metric, string> = { rn: 'R/N', adr: 'ADR', rev: 'REV' }

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  const month1 = month + 1
  const days   = lastDayOfMonth(year, month1)

  // c06_calendar 이벤트 (날짜10 → 뱃지 2글자)
  const { data: eventMap = {} } = useQuery<Record<string, string>>({
    queryKey: ['calendar-events', year, month1],
    enabled: open,
    queryFn: async () => {
      const start = `${year}-${String(month1).padStart(2, '0')}-01`
      const end   = `${year}-${String(month1).padStart(2, '0')}-${String(days).padStart(2, '0')}`
      const { data } = await (supabase as any)
        .from('c06_calendar').select('date, event')
        .gte('date', start).lte('date', end).not('event', 'is', null)
      const map: Record<string, string> = {}
      for (const r of (data ?? [])) {
        const b = getEventBadge(r.event)
        if (b) map[String(r.date).slice(0, 10)] = b
      }
      return map
    },
    staleTime: 10 * 60 * 1000,
  })

  // 코드 → 일별 집계 (한 번만)
  const codeDayAgg = useMemo(() => {
    const map = new Map<string, Agg[]>()
    for (const r of pickupRows) {
      if (!inMonth(r.business_date, year, month1)) continue
      const code = r.segmentation
      const d = new Date(r.business_date).getDate()
      let arr = map.get(code)
      if (!arr) { arr = Array.from({ length: days }, emptyAgg); map.set(code, arr) }
      const a = arr[d - 1]
      a.otbN += r.otb_nights ?? 0
      a.vsN  += r.vs_otb_nights ?? 0
      a.otbR += r.otb_revenue ?? 0
      a.vsR  += r.vs_otb_revenue ?? 0
    }
    return map
  }, [pickupRows, year, month1, days])

  const segDayAgg = (seg: SegLeaf, dayIdx: number): Agg => {
    const acc = emptyAgg()
    for (const code of seg.codes) {
      const arr = codeDayAgg.get(code)
      if (arr) addAgg(acc, arr[dayIdx])
    }
    return acc
  }
  const sumAggs = (aggs: Agg[]): Agg => { const acc = emptyAgg(); for (const a of aggs) addAgg(acc, a); return acc }

  // 표시 날짜 = R/N 합계(전 활성 세그)가 0이 아닌 날
  const visibleDays = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < days; i++) {
      const totalAgg = sumAggs(activeSegs.map(s => segDayAgg(s, i)))
      if ((totalAgg.otbN - totalAgg.vsN) !== 0) out.push(i)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegs, codeDayAgg, days])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="relative rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)', width: '95vw', height: '90vh', maxWidth: '95vw', maxHeight: '90vh' }}
      >
        {/* 헤더 — 제목 + 지표 토글 + 닫기 */}
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{month1}월 픽업 전일자</h2>
          <div className="flex items-center gap-3">
            <div style={{ display: 'flex', gap: 3 }}>
              <button
                onClick={() => setMetricLevel(0)}
                style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 6,
                  border: '0.5px solid var(--color-border-default)',
                  background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
                  fontWeight: 500, cursor: 'pointer',
                }}
              >
                R/N
              </button>
              {(['adr', 'rev'] as const).map(m => {
                const active = m === 'adr' ? metricLevel >= 1 : metricLevel >= 2
                return (
                  <button
                    key={m}
                    onClick={() => handleMetricClick(m)}
                    style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 6,
                      border: '0.5px solid var(--color-border-default)',
                      background: active ? 'var(--color-bg-elevated)' : 'transparent',
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      cursor: 'pointer', fontWeight: active ? 500 : 400,
                    }}
                  >
                    {m.toUpperCase()}
                  </button>
                )
              })}
            </div>
            <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 테이블 */}
        <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
          {activeSegs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 12 }}>선택된 세그먼트가 없습니다.</div>
          ) : visibleDays.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 12 }}>픽업 데이터가 없습니다.</div>
          ) : (
            <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
              <thead>
                {/* 1행: 세그먼트명 (colspan 병합) */}
                <tr style={{ position: 'sticky', top: 0, zIndex: 3, background: '#0a0a0a' }}>
                  <th rowSpan={2} style={{ height: 28, boxSizing: 'border-box', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 500, padding: '6px 10px', borderBottom: '0.5px solid #333', whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 4, background: '#0a0a0a' }}>날짜</th>
                  {activeSegs.map(s => (
                    <th key={s.id} colSpan={METS.length} style={{ height: 28, boxSizing: 'border-box', textAlign: 'center', color: s.lightColor || s.color || 'var(--color-text-primary)', fontWeight: 500, padding: '6px 8px', borderBottom: '0.5px solid #333', borderLeft: '0.5px solid #333', whiteSpace: 'nowrap' }}>{s.name}</th>
                  ))}
                  <th colSpan={METS.length} style={{ height: 28, boxSizing: 'border-box', textAlign: 'center', color: '#00E5A0', fontWeight: 500, padding: '6px 8px', borderBottom: '0.5px solid #333', borderLeft: '0.5px solid #333' }}>합계</th>
                </tr>
                {/* 2행: R/N · ADR · REV */}
                <tr style={{ position: 'sticky', top: 28, zIndex: 3, background: '#0a0a0a' }}>
                  {activeSegs.map(s => METS.map((m, mi) => (
                    <th key={`${s.id}-${m}`} style={{ textAlign: 'right', color: '#666', fontWeight: 400, padding: '4px 8px', borderBottom: '0.5px solid #333', ...(mi === 0 ? { borderLeft: '0.5px solid #333' } : {}) }}>{metLabel[m]}</th>
                  )))}
                  {METS.map((m, mi) => (
                    <th key={`tot-${m}`} style={{ textAlign: 'right', color: '#666', fontWeight: 400, padding: '4px 8px', borderBottom: '0.5px solid #333', ...(mi === 0 ? { borderLeft: '0.5px solid #333' } : {}) }}>{metLabel[m]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {visibleDays.map(i => {
                  const dow = new Date(year, month, i + 1).getDay()
                  const dateStr = `${year}-${String(month1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
                  const badge = eventMap[dateStr]
                  const totalAgg = sumAggs(activeSegs.map(s => segDayAgg(s, i)))
                  return (
                    <tr key={i} style={{ borderTop: '0.5px solid #1f1f1f' }}>
                      <td style={{ padding: '5px 10px', color: getDayColor(dateStr), whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1, background: '#0a0a0a' }}>
                        {month1}/{i + 1} {WEEKDAY_KR[dow]}
                        {badge && <EventDot text={badge} />}
                      </td>
                      {activeSegs.map(s => {
                        const agg = segDayAgg(s, i)
                        return METS.map((m, mi) => {
                          const v = metricValue(agg, m)
                          return <td key={`${s.id}-${m}`} style={{ padding: '5px 8px', textAlign: 'right', color: cellColor(v), ...(mi === 0 ? { borderLeft: '0.5px solid #1f1f1f' } : {}) }}>{fmtMetric(v, m)}</td>
                        })
                      })}
                      {METS.map((m, mi) => {
                        const v = metricValue(totalAgg, m)
                        return <td key={`tot-${m}`} style={{ padding: '5px 8px', textAlign: 'right', color: cellColor(v), fontWeight: 600, ...(mi === 0 ? { borderLeft: '0.5px solid #1f1f1f' } : {}) }}>{fmtMetric(v, m)}</td>
                      })}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ position: 'sticky', bottom: 0, background: '#0a0a0a' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--color-text-primary)', borderTop: '0.5px solid #333', position: 'sticky', left: 0, zIndex: 1, background: '#0a0a0a' }}>합 계</td>
                  {activeSegs.map(s => {
                    const monthAgg = sumAggs(Array.from({ length: days }, (_, i) => segDayAgg(s, i)))
                    return METS.map((m, mi) => {
                      const v = metricValue(monthAgg, m)
                      return <td key={`${s.id}-${m}`} style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600, color: cellColor(v), borderTop: '0.5px solid #333', ...(mi === 0 ? { borderLeft: '0.5px solid #333' } : {}) }}>{fmtMetric(v, m)}</td>
                    })
                  })}
                  {(() => {
                    const grand = sumAggs(activeSegs.flatMap(s => Array.from({ length: days }, (_, i) => segDayAgg(s, i))))
                    return METS.map((m, mi) => (
                      <td key={`grand-${m}`} style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600, color: '#00E5A0', borderTop: '0.5px solid #333', ...(mi === 0 ? { borderLeft: '0.5px solid #333' } : {}) }}>{fmtMetric(metricValue(grand, m), m)}</td>
                    ))
                  })()}
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
