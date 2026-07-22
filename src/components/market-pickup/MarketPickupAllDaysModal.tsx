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
const printTh    = { padding: '6px 10px', textAlign: 'center' as const, fontWeight: 600, borderBottom: '1.5px solid #999', borderRight: '1px solid #ddd' }
const printSubTh = { padding: '4px 8px',  textAlign: 'right'  as const, fontWeight: 500, borderBottom: '1.5px solid #999', borderRight: '1px solid #ddd' }
const printTd    = { padding: '4px 8px',  textAlign: 'right'  as const, borderBottom: '1px solid #ccc', borderRight: '1px solid #ddd' }

type Metric = 'rn' | 'adr' | 'rev'
type Mode   = 'pickup' | 'otb'
type Agg = { otbN: number; vsN: number; otbR: number; vsR: number }

const emptyAgg = (): Agg => ({ otbN: 0, vsN: 0, otbR: 0, vsR: 0 })
function addAgg(a: Agg, b: Agg) { a.otbN += b.otbN; a.vsN += b.vsN; a.otbR += b.otbR; a.vsR += b.vsR }

// 코드 → 일별 집계 (월/년 파라미터화 — 화면 useMemo(codeDayAgg)와 동일 로직, 다월 인쇄용)
function buildCodeDayAgg(pickupRows: PickupRow[], year: number, month1: number, days: number): Map<string, Agg[]> {
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
}

// 지표값 (null = 데이터 없음). pickup → 전일 대비 차이 / otb → 절대 OTB 값
function metricValue(a: Agg, metric: Metric, mode: Mode): number | null {
  if (mode === 'otb') {
    switch (metric) {
      case 'rn':  return a.otbN
      case 'adr': return a.otbN > 0 ? Math.round(a.otbR / a.otbN / 1000) : null
      case 'rev': return Math.round(a.otbR / 1e6)
    }
  }
  switch (metric) {
    case 'rn':  return a.otbN - a.vsN
    case 'adr': return a.otbN > 0 && a.vsN > 0 ? Math.round((a.otbR / a.otbN - a.vsR / a.vsN) / 1000) : null
    case 'rev': return Math.round((a.otbR - a.vsR) / 1e6)
  }
}
// 양수: 부호 없이 숫자만 / 음수: △ + 절대값
function fmtMetric(v: number | null, _metric: Metric, _mode: Mode): string {
  if (v === null || v === 0) return ''
  return v < 0 ? `△${Math.abs(v)}` : `${v}`
}
// OCC% — avail = roomCount × 일수
function occValue(a: Agg, avail: number, mode: Mode): number | null {
  if (avail <= 0) return null
  const nights = mode === 'otb' ? a.otbN : a.otbN - a.vsN
  return Math.round(nights / avail * 100)
}
function fmtOcc(v: number | null, _mode: Mode): string {
  if (v === null || v === 0) return ''
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

  // ── 출력 옵션 모달 ──────────────────────────────────────────────
  const otbMonthList = useMemo(() => {
    const base = new Date(otbDate)
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
      return { year: d.getFullYear(), month: d.getMonth() + 1 }
    })
  }, [otbDate])
  const [printOptionsOpen, setPrintOptionsOpen] = useState(false)
  const [selectedPrintMonths, setSelectedPrintMonths] = useState<{ year: number; month: number }[]>(otbMonthList.slice(0, 3))
  const [printOtbOn, setPrintOtbOn] = useState(true)
  const [printPickupOn, setPrintPickupOn] = useState(true)
  const [printDocOpen, setPrintDocOpen] = useState(false)   // 다월 인쇄 전용 컨테이너 마운트
  const toggleMonth = (year: number, month: number) => {
    setSelectedPrintMonths(prev => {
      const exists = prev.some(m => m.year === year && m.month === month)
      return exists ? prev.filter(m => !(m.year === year && m.month === month)) : [...prev, { year, month }]
    })
  }
  const handleConfirmPrint = () => {
    setPrintOptionsOpen(false)
    setPrintDocOpen(true)   // 선택 월×타입 표를 #multi-print-root에 렌더
    setTimeout(() => window.print(), 150)   // 렌더 완료 대기 후 인쇄
  }

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // 인쇄 종료 후 다월 렌더 컨테이너 정리(unmount)
  useEffect(() => {
    const after = () => setPrintDocOpen(false)
    window.addEventListener('afterprint', after)
    return () => window.removeEventListener('afterprint', after)
  }, [])

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

  // 인쇄 전용 — 선택된 여러 월을 포괄하는 이벤트 조회 (화면용 eventMap과 별도, 화면 로직 영향 없음)
  const { data: multiMonthEvents = {} } = useQuery<Record<string, string>>({
    queryKey: ['calendar-events-multi', selectedPrintMonths.map(m => `${m.year}-${m.month}`).sort().join(',')],
    enabled: printDocOpen && selectedPrintMonths.length > 0,
    queryFn: async () => {
      const sorted = [...selectedPrintMonths].sort((a, b) => a.year - b.year || a.month - b.month)
      const first = sorted[0], last = sorted[sorted.length - 1]
      const start = `${first.year}-${String(first.month).padStart(2, '0')}-01`
      const lastDay = lastDayOfMonth(last.year, last.month)
      const end   = `${last.year}-${String(last.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
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

  // ── (년, 월, 타입, 이벤트맵) 파라미터화 월별 표 렌더 — 화면·인쇄 공용 ──
  const renderMonthTable = (tYear: number, tMonth1: number, tMode: Mode, tEventMap: Record<string, string>, forPrint = false) => {
    const tMonth0 = tMonth1 - 1
    const tDays = lastDayOfMonth(tYear, tMonth1)
    const tCda = buildCodeDayAgg(pickupRows, tYear, tMonth1, tDays)
    const tSegAgg = (seg: SegLeaf, dayIdx: number): Agg => {
      const acc = emptyAgg()
      for (const code of seg.codes) { const arr = tCda.get(code); if (arr) addAgg(acc, arr[dayIdx]) }
      return acc
    }
    const tAllDays = Array.from({ length: tDays }, (_, i) => i)
    // 수정 6: 전체 데이터 컬럼 수 기반 동적 폰트 (합계 4열 + Σ(METS × (1+자식수)))
    const totalDataCols = 4 + parentGroups.reduce((s, g) => s + METS.length * (1 + g.children.length), 0)
    const dataFontSize = forPrint
      ? Math.max(7, Math.min(9, 200 / totalDataCols))   // 인쇄 전용 — 7~9px
      : Math.max(11, Math.min(14, 320 / totalDataCols)) // 화면 — 기존 그대로
    // 수정 1/5: 부모 컬럼 배경 (일반 #f5fbf8 / 주말·이벤트 #f7f2f0)
    const pBg = (red: boolean) => (red ? '#f7f2f0' : '#f5fbf8')
    const groupL = { borderLeft: '1.5px solid #888' }   // 수정 2: 그룹 시작 좌측선
    return (
      <div key={`${tYear}-${tMonth1}-${tMode}`} className="print-page" style={{ background: '#fff' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 4 }}>{tYear}년 {tMonth1}월 픽업 전일자 {tMode === 'otb' ? '(OTB)' : '(Pick-up)'}</h2>
        <p style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>OTB {otbDate} vs {vsOtbDate}</p>
        <div style={{ textAlign: 'right', fontSize: 11, color: '#666', marginBottom: 4 }}>[단위 : 실, 천원, 백만원]</div>
        <table style={{ flex: 1, width: '100%', borderCollapse: 'collapse', fontSize: dataFontSize, tableLayout: 'fixed' }}>
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
              <th colSpan={4} style={{ ...printTh, ...groupL, background: pBg(false), color: '#007a55', fontWeight: 700 }}>합계</th>
              {parentGroups.map(g => (
                <Fragment key={g.id}>
                  <th colSpan={METS.length} style={{ ...printTh, ...groupL, background: pBg(false), color: '#007a55', fontWeight: 700 }}>{g.name}</th>
                  {g.children.map(s => (
                    <th key={s.id} colSpan={METS.length} style={{ ...printTh, background: s.lightColor ?? '#f9fafb', color: '#374151', fontWeight: s.isBold ? 600 : 500 }}>{s.name}</th>
                  ))}
                </Fragment>
              ))}
            </tr>
            <tr>
              {(['OCC', 'R/N', 'ADR', 'REV'] as const).map((c, ci) => <th key={c} style={{ ...printSubTh, ...(ci === 0 ? groupL : {}), background: pBg(false), color: '#6b7280' }}>{c}</th>)}
              {parentGroups.map(g => (
                <Fragment key={g.id}>
                  {METS.map((m, mi) => <th key={`p-${g.id}-${m}`} style={{ ...printSubTh, ...(mi === 0 ? groupL : {}), background: pBg(false), color: '#6b7280' }}>{metLabel[m]}</th>)}
                  {g.children.map(s => METS.map(m => <th key={`${s.id}-${m}`} style={{ ...printSubTh, background: '#f9fafb', color: '#6b7280' }}>{metLabel[m]}</th>))}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {tAllDays.map(i => {
              const dow = new Date(tYear, tMonth0, i + 1).getDay()
              const dateStr = `${tYear}-${String(tMonth1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
              const isFriSat = dow === 5 || dow === 6
              const isRed = isFriSat || !!tEventMap[dateStr]
              const cellColor = isRed ? '#E24B4A' : '#000000'
              const childBg = isRed ? '#fcf3f3' : undefined
              const totalAgg = sumAggs(activeSegs.map(s => tSegAgg(s, i)))
              const occ = occValue(totalAgg, roomCount, tMode)
              return (
                <tr key={i}>
                  <td style={{ ...printTd, textAlign: 'left', whiteSpace: 'nowrap', color: cellColor, background: childBg }}>
                    {tMonth1}/{i + 1} {WEEKDAY_KR[dow]}{tEventMap[dateStr] ? ` (${tEventMap[dateStr].slice(0, 2)})` : ''}
                  </td>
                  <td style={{ ...printTd, ...groupL, color: cellColor, fontWeight: 700, background: pBg(isRed) }}>{fmtOcc(occ, tMode)}</td>
                  {(['rn', 'adr', 'rev'] as Metric[]).map(m => { const v = metricValue(totalAgg, m, tMode); return <td key={m} style={{ ...printTd, color: cellColor, fontWeight: 700, background: pBg(isRed) }}>{fmtMetric(v, m, tMode)}</td> })}
                  {parentGroups.map(g => {
                    const pAgg = sumAggs(g.children.map(c => tSegAgg(c, i)))
                    return (
                      <Fragment key={g.id}>
                        {METS.map((m, mi) => { const v = metricValue(pAgg, m, tMode); return <td key={`p-${g.id}-${m}`} style={{ ...printTd, ...(mi === 0 ? groupL : {}), color: cellColor, background: pBg(isRed) }}>{fmtMetric(v, m, tMode)}</td> })}
                        {g.children.map(s => { const agg = tSegAgg(s, i); return METS.map(m => { const v = metricValue(agg, m, tMode); return <td key={`${s.id}-${m}`} style={{ ...printTd, color: cellColor, background: childBg }}>{fmtMetric(v, m, tMode)}</td> }) })}
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
                const grand = sumAggs(activeSegs.flatMap(s => Array.from({ length: tDays }, (_, i) => tSegAgg(s, i))))
                const occ = occValue(grand, roomCount * tDays, tMode)
                return (
                  <>
                    <td style={{ ...printTd, ...groupL, fontWeight: 700, color: '#000000', background: pBg(false) }}>{fmtOcc(occ, tMode)}</td>
                    {(['rn', 'adr', 'rev'] as Metric[]).map(m => <td key={m} style={{ ...printTd, fontWeight: 700, color: '#000000', background: pBg(false) }}>{fmtMetric(metricValue(grand, m, tMode), m, tMode)}</td>)}
                  </>
                )
              })()}
              {parentGroups.map(g => {
                const pMonthAgg = sumAggs(g.children.flatMap(c => Array.from({ length: tDays }, (_, i) => tSegAgg(c, i))))
                return (
                  <Fragment key={g.id}>
                    {METS.map((m, mi) => <td key={`p-${g.id}-${m}`} style={{ ...printTd, ...(mi === 0 ? groupL : {}), fontWeight: 700, color: '#000000', background: pBg(false) }}>{fmtMetric(metricValue(pMonthAgg, m, tMode), m, tMode)}</td>)}
                    {g.children.map(s => { const monthAgg = sumAggs(Array.from({ length: tDays }, (_, i) => tSegAgg(s, i))); return METS.map(m => <td key={`${s.id}-${m}`} style={{ ...printTd, fontWeight: 700, color: '#000000', background: '#f9fafb' }}>{fmtMetric(metricValue(monthAgg, m, tMode), m, tMode)}</td>) })}
                  </Fragment>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  if (!open) return null

  return createPortal(
    <>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`#multi-print-root { position: absolute; left: -100000px; top: 0; } @media print { body * { visibility: hidden !important; } #multi-print-root, #multi-print-root * { visibility: visible !important; } #multi-print-root { left: 0 !important; top: 0 !important; } #multi-print-root * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } #multi-print-root .print-page { width: 297mm; height: 210mm; padding: 5mm; box-sizing: border-box; display: flex; flex-direction: column; page-break-after: always; } #multi-print-root .print-page:last-child { page-break-after: auto; } #multi-print-root .print-page table { flex: 1; } #multi-print-root th, #multi-print-root td { padding: 1px 2px !important; } @page { size: A4 landscape; margin: 0; } }`}</style>
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
            <button onClick={() => setPrintOptionsOpen(true)} style={{ background: '#1d9e75', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Printer size={13} /> Print
            </button>
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 6, color: '#666', fontSize: 12, padding: '6px 12px', cursor: 'pointer' }}>닫기</button>
          </div>
        </div>
        {/* 본문 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
          <div id="print-content" style={{ background: '#fff' }}>
            {renderMonthTable(year, month1, viewMode, eventMap)}
          </div>
        </div>
      </div>
    </div>
    {printOptionsOpen && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 340, borderRadius: 16, padding: 20, background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderLeft: '3px solid #00A876', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#000', marginBottom: 4 }}>출력 옵션</div>
          <div style={{ fontSize: 11, color: '#777', marginBottom: 16 }}>OTB {otbDate} 기준 6개월</div>

          <div style={{ fontSize: 10, color: '#00A876', letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>월 선택 (기본 3개월)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
            {otbMonthList.map(({ year, month }) => {
              const isOn = selectedPrintMonths.some(m => m.year === year && m.month === month)
              return (
                <div
                  key={`${year}-${month}`}
                  onClick={() => toggleMonth(year, month)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    border: isOn ? '1px solid #00A876' : '1px solid rgba(0,0,0,0.12)',
                    color: isOn ? '#007a55' : '#888',
                    background: isOn ? 'rgba(0,168,118,0.1)' : 'transparent',
                    fontWeight: isOn ? 600 : 400,
                  }}
                >
                  {String(month).padStart(2, '0')}월
                </div>
              )
            })}
          </div>

          <div style={{ fontSize: 10, color: '#00A876', letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>타입 선택</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#f5f5f4', borderRadius: 12, padding: 12, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#333', fontWeight: 500 }}>OTB</span>
              <div onClick={() => setPrintOtbOn(v => !v)} style={{ width: 34, height: 19, borderRadius: 10, position: 'relative', cursor: 'pointer', background: printOtbOn ? '#00A876' : '#ddd' }}>
                <div style={{ width: 15, height: 15, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: printOtbOn ? 17 : 2, transition: 'left 0.15s' }} />
              </div>
            </div>
            <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#333', fontWeight: 500 }}>Pick-up</span>
              <div onClick={() => setPrintPickupOn(v => !v)} style={{ width: 34, height: 19, borderRadius: 10, position: 'relative', cursor: 'pointer', background: printPickupOn ? '#00A876' : '#ddd' }}>
                <div style={{ width: 15, height: 15, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: printPickupOn ? 17 : 2, transition: 'left 0.15s' }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPrintOptionsOpen(false)} style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 10, fontSize: 13, fontWeight: 500, border: '1px solid rgba(0,0,0,0.1)', background: 'transparent', color: '#666', cursor: 'pointer' }}>취소</button>
            <button onClick={handleConfirmPrint} style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#00A876', color: '#fff', border: 'none', cursor: 'pointer' }}>확인</button>
          </div>
        </div>
      </div>
    )}
    {printDocOpen && (
      <div id="multi-print-root">
        {selectedPrintMonths.flatMap(({ year, month }) => [
          ...(printOtbOn ? [{ y: year, m: month, mode: 'otb' as Mode }] : []),
          ...(printPickupOn ? [{ y: year, m: month, mode: 'pickup' as Mode }] : []),
        ]).map(({ y, m, mode }) => renderMonthTable(y, m, mode, multiMonthEvents, true))}
      </div>
    )}
    </>,
    document.body
  )
}
