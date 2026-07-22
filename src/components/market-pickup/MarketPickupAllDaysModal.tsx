'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import type { PickupRow } from '@/hooks/usePickupData'
import type { SegLeaf } from './MarketPickupMonthBlock'
import { lastDayOfMonth, inMonth, WEEKDAY_KR } from '@/utils/pickupPageUtils'
import { getEventBadge } from '@/utils/dateUtils'

// 라이트 모드 미리보기(인쇄) 테이블 셀 스타일
const printTh    = { padding: '6px 10px', textAlign: 'center' as const, fontSize: 11, fontWeight: 600, border: '1px solid #e5e7eb' }
const printSubTh = { padding: '4px 8px',  textAlign: 'right'  as const, fontSize: 10, fontWeight: 500, border: '1px solid #e5e7eb' }
const printTd    = { padding: '4px 8px',  textAlign: 'right'  as const, fontSize: 11, border: '1px solid #f3f4f6' }

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
// 양수: 부호 없이 숫자만 / 음수: △ + 절대값
function fmtMetric(v: number | null, _metric: Metric, _mode: Mode): string {
  if (v === null || v === 0) return '—'
  return v < 0 ? `△${Math.abs(v)}` : `${v}`
}
// OCC% — avail = roomCount × 일수
function occValue(a: Agg, avail: number, mode: Mode): number | null {
  if (avail <= 0) return null
  const nights = mode === 'otb' ? a.otbN : a.otbN - a.vsN
  return Math.round(nights / avail * 100)
}
function fmtOcc(v: number | null, _mode: Mode): string {
  if (v === null || v === 0) return '—'
  return v < 0 ? `△${Math.abs(v)}%` : `${v}%`
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
  const { data: schema = [] } = useMarketSchema()
  // 상위 그룹(main) 재구성 — 모달 prop(activeSegs)엔 부모 정보가 없어 스키마를 직접 조회해 parent_id로 묶음
  const parentGroups = useMemo(() => {
    const parentIdOf = new Map<string, string | null>()
    for (const s of schema) parentIdOf.set(s.id, s.parent_id)
    const mains = schema.filter(s => s.level === 'main' && s.parent_id === null)
    return mains
      .map(main => ({ id: main.id, name: main.name, children: activeSegs.filter(s => parentIdOf.get(s.id) === main.id) }))
      .filter(g => g.children.length > 0)
  }, [schema, activeSegs])
  // Pick-up(전일 대비) / OTB(절대값) 보기 모드
  const [viewMode, setViewMode] = useState<Mode>('pickup')
  // 누적 토글: 0=R/N, 1=R/N+ADR, 2=R/N+ADR+REV
  const [metricLevel, setMetricLevel] = useState<0 | 1 | 2>(2)
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
      a.vsN  += r.vs_nights ?? 0
      a.otbR += r.otb_revenue ?? 0
      a.vsR  += r.vs_revenue ?? 0
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

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@media print { body * { visibility: hidden !important; } #print-content, #print-content * { visibility: visible !important; } #print-content { position: absolute; left: 0; top: 0; } #print-content th, #print-content td { font-size: 7px !important; padding: 1px 2px !important; } @page { size: A4 landscape; margin: 0; } }`}</style>
      <div data-theme="light" style={{ colorScheme: 'light', background: '#fff', width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 헤더 — 제목 + Pick-up/OTB 토글 + R/N/ADR/REV 토글 + Print + 닫기 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{month1}월 픽업 전일자</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Pick-up / OTB 보기 토글 */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['pickup', 'otb'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${viewMode === mode ? '#1d9e75' : '#e1e0d9'}`,
                    background: viewMode === mode ? '#1d9e75' : 'transparent',
                    color: viewMode === mode ? '#ffffff' : '#898781',
                    fontWeight: viewMode === mode ? 600 : 400,
                  }}
                >
                  {mode === 'pickup' ? 'Pick-up' : 'OTB'}
                </button>
              ))}
            </div>
            {/* R/N · ADR · REV 누적 토글 */}
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
            <button onClick={() => window.print()} style={{ background: '#1d9e75', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Printer size={13} /> Print
            </button>
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 6, color: '#666', fontSize: 12, padding: '6px 12px', cursor: 'pointer' }}>닫기</button>
          </div>
        </div>
        {/* 본문 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <div id="print-content" style={{ width: '297mm', height: '210mm', padding: '5mm', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: '#fff' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 4 }}>{year}년 {month1}월 픽업 전일자 {viewMode === 'otb' ? '(OTB)' : '(Pick-up)'}</h2>
            <p style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>OTB {otbDate} vs {vsOtbDate}</p>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#666', marginBottom: 4 }}>[단위 : 실, 천원, 백만원]</div>
            <table style={{ flex: 1, width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 90 }} />
                {(['OCC', 'R/N', 'ADR', 'REV'] as const).map(c => <col key={`sumcol-${c}`} />)}
                {parentGroups.map(g => (
                  <Fragment key={g.id}>
                    {METS.map(m => <col key={`pcol-${g.id}-${m}`} />)}
                    {g.children.map(s => METS.map(m => <col key={`ccol-${s.id}-${m}`} />))}
                  </Fragment>
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...printTh, background: '#f9fafb', color: '#374151' }}>날짜</th>
                  <th colSpan={4} style={{ ...printTh, background: '#ecfdf5', color: '#065f46' }}>합계</th>
                  {parentGroups.map(g => (
                    <Fragment key={g.id}>
                      <th colSpan={METS.length} style={{ ...printTh, background: '#ecfdf5', color: '#065f46' }}>{g.name}</th>
                      {g.children.map(s => (
                        <th key={s.id} colSpan={METS.length} style={{ ...printTh, background: s.lightColor ?? '#f9fafb', color: '#374151' }}>{s.name}</th>
                      ))}
                    </Fragment>
                  ))}
                </tr>
                <tr>
                  {(['OCC', 'R/N', 'ADR', 'REV'] as const).map(c => <th key={c} style={{ ...printSubTh, background: '#f9fafb', color: '#6b7280' }}>{c}</th>)}
                  {parentGroups.map(g => (
                    <Fragment key={g.id}>
                      {METS.map(m => <th key={`p-${g.id}-${m}`} style={{ ...printSubTh, background: '#f9fafb', color: '#6b7280' }}>{metLabel[m]}</th>)}
                      {g.children.map(s => METS.map(m => <th key={`${s.id}-${m}`} style={{ ...printSubTh, background: '#f9fafb', color: '#6b7280' }}>{metLabel[m]}</th>))}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allDays.map(i => {
                  const dow = new Date(year, month, i + 1).getDay()
                  const dateStr = `${year}-${String(month1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
                  const isFriSat = dow === 5 || dow === 6
                  const isRed = isFriSat || !!eventMap[dateStr]
                  const cellColor = isRed ? '#E24B4A' : '#000000'
                  const totalAgg = sumAggs(activeSegs.map(s => segDayAgg(s, i)))
                  const occ = occValue(totalAgg, roomCount, viewMode)
                  return (
                    <tr key={i} style={{ background: isRed ? 'rgba(226,75,74,0.06)' : undefined }}>
                      <td style={{ ...printTd, textAlign: 'left', whiteSpace: 'nowrap', color: cellColor }}>
                        {month1}/{i + 1} {WEEKDAY_KR[dow]}{eventMap[dateStr] ? ` (${eventMap[dateStr].slice(0, 2)})` : ''}
                      </td>
                      <td style={{ ...printTd, color: cellColor }}>{fmtOcc(occ, viewMode)}</td>
                      {(['rn', 'adr', 'rev'] as Metric[]).map(m => { const v = metricValue(totalAgg, m, viewMode); return <td key={m} style={{ ...printTd, color: cellColor }}>{fmtMetric(v, m, viewMode)}</td> })}
                      {parentGroups.map(g => {
                        const pAgg = sumAggs(g.children.map(c => segDayAgg(c, i)))
                        return (
                          <Fragment key={g.id}>
                            {METS.map(m => { const v = metricValue(pAgg, m, viewMode); return <td key={`p-${g.id}-${m}`} style={{ ...printTd, color: cellColor }}>{fmtMetric(v, m, viewMode)}</td> })}
                            {g.children.map(s => { const agg = segDayAgg(s, i); return METS.map(m => { const v = metricValue(agg, m, viewMode); return <td key={`${s.id}-${m}`} style={{ ...printTd, color: cellColor }}>{fmtMetric(v, m, viewMode)}</td> }) })}
                          </Fragment>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...printTd, textAlign: 'left', fontWeight: 700, color: '#000000', background: '#f9fafb' }}>합 계</td>
                  {(() => {
                    const grand = sumAggs(activeSegs.flatMap(s => Array.from({ length: days }, (_, i) => segDayAgg(s, i))))
                    const occ = occValue(grand, roomCount * days, viewMode)
                    return (
                      <>
                        <td style={{ ...printTd, fontWeight: 700, color: '#000000', background: '#f9fafb' }}>{fmtOcc(occ, viewMode)}</td>
                        {(['rn', 'adr', 'rev'] as Metric[]).map(m => <td key={m} style={{ ...printTd, fontWeight: 700, color: '#000000', background: '#f9fafb' }}>{fmtMetric(metricValue(grand, m, viewMode), m, viewMode)}</td>)}
                      </>
                    )
                  })()}
                  {parentGroups.map(g => {
                    const pMonthAgg = sumAggs(g.children.flatMap(c => Array.from({ length: days }, (_, i) => segDayAgg(c, i))))
                    return (
                      <Fragment key={g.id}>
                        {METS.map(m => <td key={`p-${g.id}-${m}`} style={{ ...printTd, fontWeight: 700, color: '#000000', background: '#f9fafb' }}>{fmtMetric(metricValue(pMonthAgg, m, viewMode), m, viewMode)}</td>)}
                        {g.children.map(s => { const monthAgg = sumAggs(Array.from({ length: days }, (_, i) => segDayAgg(s, i))); return METS.map(m => <td key={`${s.id}-${m}`} style={{ ...printTd, fontWeight: 700, color: '#000000', background: '#f9fafb' }}>{fmtMetric(metricValue(monthAgg, m, viewMode), m, viewMode)}</td>) })}
                      </Fragment>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
