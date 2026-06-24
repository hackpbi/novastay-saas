'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDateContext } from '@/contexts/DateContext'
import type { PickupRow } from '@/hooks/usePickupData'
import type { SegLeaf } from './MarketPickupMonthBlock'
import { lastDayOfMonth, inMonth, WEEKDAY_KR } from '@/utils/pickupPageUtils'
import { getDayColor, getEventBadge } from '@/utils/dateUtils'

// 라이트 모드 미리보기(인쇄) 테이블 셀 스타일
const printTh    = { padding: '6px 10px', textAlign: 'center' as const, fontSize: 11, fontWeight: 600, border: '1px solid #e5e7eb' }
const printSubTh = { padding: '4px 8px',  textAlign: 'right'  as const, fontSize: 10, fontWeight: 500, border: '1px solid #e5e7eb' }
const printTd    = { padding: '4px 8px',  textAlign: 'right'  as const, fontSize: 11, border: '1px solid #f3f4f6' }

// 이벤트 동그라미 뱃지 (민트)
function EventDot({ text }: { text: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(0,229,160,0.12)', border: '1px solid #00E5A0',
      color: '#00E5A0', fontSize: 9, fontWeight: 600, lineHeight: 1,
    }}>{text.slice(0, 2)}</span>
  )
}

type Metric = 'rn' | 'adr' | 'rev'
type Mode   = 'pickup' | 'otb'
type Agg = { otbN: number; vsN: number; otbR: number; vsR: number }

const emptyAgg = (): Agg => ({ otbN: 0, vsN: 0, otbR: 0, vsR: 0 })
function addAgg(a: Agg, b: Agg) { a.otbN += b.otbN; a.vsN += b.vsN; a.otbR += b.otbR; a.vsR += b.vsR }

// 지표값 (null = 데이터 없음). pickup → 전일 대비 차이 / otb → 절대 OTB 값
function metricValue(a: Agg, metric: Metric, mode: Mode): number | null {
  if (mode === 'otb') {
    switch (metric) {
      case 'rn':  return a.otbN
      case 'adr': return a.otbN > 0 ? Math.round(a.otbR / a.otbN / 1000) : null
      case 'rev': return Math.round(a.otbR / 1e6 * 10) / 10
    }
  }
  switch (metric) {
    case 'rn':  return a.otbN - a.vsN
    case 'adr': return a.otbN > 0 && a.vsN > 0 ? Math.round((a.otbR / a.otbN - a.vsR / a.vsN) / 1000) : null
    case 'rev': return Math.round((a.otbR - a.vsR) / 1e6 * 10) / 10
  }
}
function fmtMetric(v: number | null, metric: Metric, mode: Mode): string {
  if (v === null || v === 0) return '—'
  const sign = mode === 'pickup' && v > 0 ? '+' : ''
  return metric === 'rn' ? `${sign}${v}` : metric === 'adr' ? `${sign}${v}k` : `${sign}${v}M`
}
// OCC% — avail = roomCount × 일수
function occValue(a: Agg, avail: number, mode: Mode): number | null {
  if (avail <= 0) return null
  const nights = mode === 'otb' ? a.otbN : a.otbN - a.vsN
  return Math.round(nights / avail * 100)
}
function fmtOcc(v: number | null, mode: Mode): string {
  if (v === null || v === 0) return '—'
  const sign = mode === 'pickup' && v > 0 ? '+' : ''
  return `${sign}${v}%`
}
export default function MarketPickupAllDaysModal({
  open, onClose, year, month, pickupRows, activeSegs, roomCount,
}: {
  open:       boolean
  onClose:    () => void
  year:       number
  month:      number   // 0-based
  pickupRows: PickupRow[]
  activeSegs: SegLeaf[]
  roomCount:  number
}) {
  const { otbDate, vsOtbDate } = useDateContext()
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false)
  // Pick-up(전일 대비) / OTB(절대값) 보기 모드
  const [viewMode, setViewMode] = useState<Mode>('pickup')
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

  // 표시 날짜 = 해당 월 1일 ~ 말일 전체 (픽업 없는 날도 — 로 표시)
  const allDays = useMemo(() => Array.from({ length: days }, (_, i) => i), [days])

  if (!open) return null

  // 라이트 셀 색상
  const lc = (v: number | null) =>
    viewMode === 'otb' ? '#374151' : (v == null || v === 0 ? '#9ca3af' : v < 0 ? '#dc2626' : '#059669')

  return (
    <>
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
            {/* Pick-up / OTB 보기 토글 */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['pickup', 'otb'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${viewMode === mode ? '#00E5A0' : '#2a2a2a'}`,
                    background: viewMode === mode ? '#00E5A0' : 'transparent',
                    color: viewMode === mode ? '#0a0a0a' : '#555',
                    fontWeight: viewMode === mode ? 600 : 400,
                  }}
                >
                  {mode === 'pickup' ? 'Pick-up' : 'OTB'}
                </button>
              ))}
            </div>
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
            <button
              onClick={() => setPrintPreviewOpen(true)}
              style={{
                background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 6,
                color: '#888', fontSize: 11, padding: '3px 10px', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              <Printer size={13} /> Print
            </button>
            <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 테이블 */}
        <div style={{ overflow: 'auto', flex: 1, minHeight: 0, fontSize: 10 }}>
          {activeSegs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 12 }}>선택된 세그먼트가 없습니다.</div>
          ) : (
            <table style={{ borderCollapse: 'collapse', fontSize: 10, tableLayout: 'auto' }}>
              <thead>
                {/* 1행: 합계(날짜 오른쪽) + 세그먼트명 (colspan 병합) */}
                <tr style={{ position: 'sticky', top: 0, zIndex: 3, background: '#0a0a0a' }}>
                  <th rowSpan={2} style={{ height: 24, boxSizing: 'border-box', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 500, padding: '4px 6px', borderBottom: '0.5px solid #333', whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 4, background: '#0a0a0a' }}>날짜</th>
                  <th colSpan={4} style={{ height: 24, boxSizing: 'border-box', textAlign: 'center', color: '#00E5A0', fontWeight: 600, padding: '4px 6px', borderBottom: '0.5px solid #333', borderLeft: '0.5px solid #333', borderRight: '1px solid rgba(0,229,160,0.25)' }}>합계</th>
                  {activeSegs.map(s => (
                    <th key={s.id} colSpan={METS.length} style={{ height: 24, boxSizing: 'border-box', textAlign: 'center', background: s.color || '#1a1a1a', color: s.fontDarkColor || '#fff', fontWeight: s.isBold ? 600 : 500, padding: '4px 6px', borderBottom: '0.5px solid #333', borderLeft: '0.5px solid #333', whiteSpace: 'nowrap' }}>{s.name}</th>
                  ))}
                </tr>
                {/* 2행: 합계 OCC/R/N/ADR/REV + 세그먼트 R/N·ADR·REV */}
                <tr style={{ position: 'sticky', top: 24, zIndex: 3, background: '#0a0a0a' }}>
                  {(['OCC', 'R/N', 'ADR', 'REV'] as const).map((c, ci) => (
                    <th key={`th-${c}`} style={{ textAlign: 'right', color: '#666', fontWeight: 400, padding: '3px 6px', borderBottom: '0.5px solid #333', ...(ci === 0 ? { borderLeft: '0.5px solid #333' } : {}), ...(ci === 3 ? { borderRight: '1px solid rgba(0,229,160,0.25)' } : {}) }}>{c}</th>
                  ))}
                  {activeSegs.map(s => METS.map((m, mi) => (
                    <th key={`${s.id}-${m}`} style={{ textAlign: 'right', color: '#666', fontWeight: 400, padding: '3px 6px', borderBottom: '0.5px solid #333', ...(mi === 0 ? { borderLeft: '0.5px solid #333' } : {}) }}>{metLabel[m]}</th>
                  )))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {allDays.map(i => {
                  const dow = new Date(year, month, i + 1).getDay()
                  const dateStr = `${year}-${String(month1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
                  const badge = eventMap[dateStr]
                  const totalAgg = sumAggs(activeSegs.map(s => segDayAgg(s, i)))
                  const occ = occValue(totalAgg, roomCount, viewMode)
                  return (
                    <tr key={i} style={{ borderTop: '0.5px solid #1f1f1f' }}>
                      <td style={{ padding: '3px 6px', whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1, background: '#0a0a0a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: getDayColor(dateStr) }}>{month1}/{i + 1} {WEEKDAY_KR[dow]}</span>
                          {badge && <EventDot text={badge} />}
                        </div>
                      </td>
                      {/* 합계 — OCC / R/N / ADR / REV (회색 일반체) */}
                      <td style={{ padding: '3px 5px', textAlign: 'right', color: '#888', fontWeight: 400, borderLeft: '0.5px solid #1f1f1f' }}>{fmtOcc(occ, viewMode)}</td>
                      {(['rn', 'adr', 'rev'] as Metric[]).map((m, mi) => {
                        const v = metricValue(totalAgg, m, viewMode)
                        return <td key={`tot-${m}`} style={{ padding: '3px 5px', textAlign: 'right', color: '#888', fontWeight: 400, ...(mi === 2 ? { borderRight: '1px solid rgba(0,229,160,0.25)' } : {}) }}>{fmtMetric(v, m, viewMode)}</td>
                      })}
                      {/* 세그먼트별 (회색 일반체) */}
                      {activeSegs.map(s => {
                        const agg = segDayAgg(s, i)
                        return METS.map((m, mi) => {
                          const v = metricValue(agg, m, viewMode)
                          return <td key={`${s.id}-${m}`} style={{ padding: '3px 5px', textAlign: 'right', color: '#888', fontWeight: 400, ...(mi === 0 ? { borderLeft: '0.5px solid #1f1f1f' } : {}) }}>{fmtMetric(v, m, viewMode)}</td>
                        })
                      })}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ position: 'sticky', bottom: 0, background: '#0a0a0a' }}>
                  <td style={{ padding: '4px 6px', fontWeight: 600, color: 'var(--color-text-primary)', borderTop: '0.5px solid #333', position: 'sticky', left: 0, zIndex: 1, background: '#0a0a0a' }}>합 계</td>
                  {(() => {
                    const grand = sumAggs(activeSegs.flatMap(s => Array.from({ length: days }, (_, i) => segDayAgg(s, i))))
                    const occ = occValue(grand, roomCount * days, viewMode)
                    return (
                      <>
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 400, color: '#aaa', borderTop: '0.5px solid #333', borderLeft: '0.5px solid #333' }}>{fmtOcc(occ, viewMode)}</td>
                        {(['rn', 'adr', 'rev'] as Metric[]).map((m, mi) => (
                          <td key={`grand-${m}`} style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 400, color: '#aaa', borderTop: '0.5px solid #333', ...(mi === 2 ? { borderRight: '1px solid rgba(0,229,160,0.25)' } : {}) }}>{fmtMetric(metricValue(grand, m, viewMode), m, viewMode)}</td>
                        ))}
                      </>
                    )
                  })()}
                  {activeSegs.map(s => {
                    const monthAgg = sumAggs(Array.from({ length: days }, (_, i) => segDayAgg(s, i)))
                    return METS.map((m, mi) => {
                      const v = metricValue(monthAgg, m, viewMode)
                      return <td key={`${s.id}-${m}`} style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 400, color: '#aaa', borderTop: '0.5px solid #333', ...(mi === 0 ? { borderLeft: '0.5px solid #333' } : {}) }}>{fmtMetric(v, m, viewMode)}</td>
                    })
                  })}
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>

    {/* ── Print 미리보기 (라이트 모드) ── */}
    {printPreviewOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <style>{`@media print { body * { visibility: hidden !important; } #print-content, #print-content * { visibility: visible !important; } #print-content { position: absolute; left: 0; top: 0; width: 100%; } @page { size: landscape; margin: 10mm; } }`}</style>
          <div style={{ background: '#fff', borderRadius: 12, width: '90vw', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* 미리보기 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>Print Preview — {month1}월 픽업 전일자</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => window.print()} style={{ background: '#00E5A0', border: 'none', borderRadius: 6, color: '#0a0a0a', fontSize: 12, fontWeight: 600, padding: '6px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Printer size={13} /> Print
                </button>
                <button onClick={() => setPrintPreviewOpen(false)} style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 6, color: '#666', fontSize: 12, padding: '6px 12px', cursor: 'pointer' }}>닫기</button>
              </div>
            </div>
            {/* 미리보기 본문 */}
            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              <div id="print-content">
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 4 }}>{year}년 {month1}월 픽업 전일자 {viewMode === 'otb' ? '(OTB)' : '(Pick-up)'}</h2>
                <p style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>OTB {otbDate} vs {vsOtbDate}</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ ...printTh, background: '#f9fafb', color: '#374151' }}>날짜</th>
                      <th colSpan={4} style={{ ...printTh, background: '#ecfdf5', color: '#065f46' }}>합계</th>
                      {activeSegs.map(s => (
                        <th key={s.id} colSpan={METS.length} style={{ ...printTh, background: s.lightColor ?? '#f9fafb', color: '#374151' }}>{s.name}</th>
                      ))}
                    </tr>
                    <tr>
                      {(['OCC', 'R/N', 'ADR', 'REV'] as const).map(c => <th key={c} style={{ ...printSubTh, background: '#f9fafb', color: '#6b7280' }}>{c}</th>)}
                      {activeSegs.map(s => METS.map(m => <th key={`${s.id}-${m}`} style={{ ...printSubTh, background: '#f9fafb', color: '#6b7280' }}>{metLabel[m]}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {allDays.map(i => {
                      const dow = new Date(year, month, i + 1).getDay()
                      const dateStr = `${year}-${String(month1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
                      const isFriSat = dow === 5 || dow === 6
                      const totalAgg = sumAggs(activeSegs.map(s => segDayAgg(s, i)))
                      const occ = occValue(totalAgg, roomCount, viewMode)
                      return (
                        <tr key={i}>
                          <td style={{ ...printTd, textAlign: 'left', whiteSpace: 'nowrap', color: isFriSat ? '#dc2626' : '#374151' }}>
                            {month1}/{i + 1} {WEEKDAY_KR[dow]}{eventMap[dateStr] ? ` (${eventMap[dateStr].slice(0, 2)})` : ''}
                          </td>
                          <td style={{ ...printTd, color: lc(occ) }}>{fmtOcc(occ, viewMode)}</td>
                          {(['rn', 'adr', 'rev'] as Metric[]).map(m => { const v = metricValue(totalAgg, m, viewMode); return <td key={m} style={{ ...printTd, color: lc(v) }}>{fmtMetric(v, m, viewMode)}</td> })}
                          {activeSegs.map(s => { const agg = segDayAgg(s, i); return METS.map(m => { const v = metricValue(agg, m, viewMode); return <td key={`${s.id}-${m}`} style={{ ...printTd, color: lc(v) }}>{fmtMetric(v, m, viewMode)}</td> }) })}
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ ...printTd, textAlign: 'left', fontWeight: 700, color: '#111', background: '#f9fafb' }}>합 계</td>
                      {(() => {
                        const grand = sumAggs(activeSegs.flatMap(s => Array.from({ length: days }, (_, i) => segDayAgg(s, i))))
                        const occ = occValue(grand, roomCount * days, viewMode)
                        return (
                          <>
                            <td style={{ ...printTd, fontWeight: 700, color: lc(occ), background: '#f9fafb' }}>{fmtOcc(occ, viewMode)}</td>
                            {(['rn', 'adr', 'rev'] as Metric[]).map(m => <td key={m} style={{ ...printTd, fontWeight: 700, color: lc(metricValue(grand, m, viewMode)), background: '#f9fafb' }}>{fmtMetric(metricValue(grand, m, viewMode), m, viewMode)}</td>)}
                          </>
                        )
                      })()}
                      {activeSegs.map(s => { const monthAgg = sumAggs(Array.from({ length: days }, (_, i) => segDayAgg(s, i))); return METS.map(m => <td key={`${s.id}-${m}`} style={{ ...printTd, fontWeight: 700, color: lc(metricValue(monthAgg, m, viewMode)), background: '#f9fafb' }}>{fmtMetric(metricValue(monthAgg, m, viewMode), m, viewMode)}</td>) })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
