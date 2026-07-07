'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { PickupRow } from '@/hooks/usePickupData'
import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import { buildSegTable, type SegTableRow } from '@/utils/segmentationTable'
import { WEEKDAY_KR } from '@/utils/pickupPageUtils'
import { getDayColor } from '@/utils/dateUtils'
import { FmtVal } from '@/utils/FmtVal'
import DatePicker from '@/components/DatePicker'

// 날짜 문자열 직접 파싱 (KST 이슈 없음)
const inDay = (dateStr: string, year: number, month: number, day: number) => {
  const d = new Date(dateStr)
  return d.getFullYear() === year && d.getMonth() + 1 === month && d.getDate() === day
}

type AccStat = {
  otbNights: number; otbRevenue: number
  vsNights:  number; vsRevenue:  number
  puNights:  number; puRevenue:  number
}

export default function MarketPickupDayModal({
  open, onClose, year, month, day, schema, pickupRows, roomCount, defaultTab, otbDate, vsDate, otbDates = [], onDateChange,
}: {
  open:          boolean
  onClose:       () => void
  year:          number
  month:         number   // 0-based
  day:           number   // 1-based
  schema:        MarketSchemaRow[]
  pickupRows:    PickupRow[]
  roomCount:     number
  defaultTab?:   'pickup' | 'otb'
  otbDate:       string   // 'YYYY-MM-DD'
  vsDate:        string   // 'YYYY-MM-DD'
  otbDates?:     string[]
  onDateChange?: (otbDate: string, vsDate: string) => void
}) {
  const [selType, setSelType] = useState<'pickup' | 'otb'>('pickup')
  const [selMain, setSelMain] = useState<string | null>(null)
  const [localOtbDate, setLocalOtbDate] = useState(otbDate)
  const [localVsDate,  setLocalVsDate]  = useState(vsDate)
  const [localDay,     setLocalDay]     = useState(day)

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // open 시 로컬 상태(날짜·일자·탭·선택) 초기화
  useEffect(() => {
    if (open) {
      setLocalOtbDate(otbDate)
      setLocalVsDate(vsDate)
      setLocalDay(day)
      setSelType('pickup')
      setSelMain(null)
    }
  }, [open, otbDate, vsDate, day, defaultTab])

  // 날짜 변경 시 페이지에 반영 (onDateChange 있을 때만)
  useEffect(() => {
    if (localOtbDate !== otbDate || localVsDate !== vsDate) {
      onDateChange?.(localOtbDate, localVsDate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOtbDate, localVsDate])

  // 선택된 세그(main/sub)의 어카운트별 집계 — 훅은 early-return 위에서 호출
  const accountRows = useMemo(() => {
    if (!open || !selMain) return []
    const selSchema = schema.find(s => s.id === selMain)
    if (!selSchema) return []
    // main 클릭 → 자식 sub들의 segmentation 코드 / sub 클릭 → 자신의 코드
    const codes = selSchema.level === 'main'
      ? schema.filter(s => s.parent_id === selMain).flatMap(s => s.segmentation ?? [])
      : (selSchema.segmentation ?? [])
    const codeSet = new Set(codes)

    const map = new Map<string, AccStat>()
    for (const r of pickupRows) {
      if (!inDay(r.business_date, year, month + 1, localDay)) continue
      if (!codeSet.has(r.segmentation)) continue
      const acc = r.account_name || '(미지정)'
      if (!map.has(acc)) map.set(acc, { otbNights: 0, otbRevenue: 0, vsNights: 0, vsRevenue: 0, puNights: 0, puRevenue: 0 })
      const a = map.get(acc)!
      a.otbNights  += r.otb_nights     ?? 0
      a.otbRevenue += r.otb_revenue    ?? 0
      a.vsNights   += r.vs_otb_nights  ?? 0
      a.vsRevenue  += r.vs_otb_revenue ?? 0
      a.puNights   += r.pu_nights      ?? 0
      a.puRevenue  += r.pu_revenue     ?? 0
    }

    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        ...v,
        puAdr: v.otbNights > 0 && v.vsNights > 0
          ? Math.round(v.otbRevenue / v.otbNights) - Math.round(v.vsRevenue / v.vsNights)
          : 0,
        otbAdr: v.otbNights > 0 ? Math.round(v.otbRevenue / v.otbNights) : 0,
      }))
      .filter(a => a.otbNights > 0 || a.puNights !== 0)
      .sort((a, b) => Math.abs(b.puNights) - Math.abs(a.puNights))
  }, [open, selMain, schema, pickupRows, year, month, localDay])

  if (!open) return null

  const { rows, summary } = buildSegTable({ schema, pickup: pickupRows, year, month: month + 1, roomCount, day: localDay })
  const selRow = rows.find(r => r.id === selMain)

  const localDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(localDay).padStart(2, '0')}`
  // OTB ~ vs 일수 차 (픽업 요약 문구용)
  const diffDays = (() => {
    if (!localOtbDate || !localVsDate) return 1
    const o = new Date(localOtbDate).getTime(), v = new Date(localVsDate).getTime()
    if (Number.isNaN(o) || Number.isNaN(v)) return 1
    const d = Math.round((o - v) / 86400000)
    return d > 0 ? d : 1
  })()

  // ── 포맷 헬퍼 ───────────────────────────────────────────────────────────────
  const fmtPuRn  = (v: number) => v === 0 ? '—' : `${v > 0 ? '+' : ''}${Math.round(v)}`
  const fmtPuAdr = (v: number, valid: boolean) => !valid || v === 0 ? '—' : `${v > 0 ? '+' : ''}${Math.round(v / 1000)}k`
  const fmtPuRev = (v: number) => v === 0 ? '—' : `${v > 0 ? '+' : ''}${(v / 1e6).toFixed(1)}M`
  const fmtOtbRn  = (v: number) => v === 0 ? '—' : v.toLocaleString()
  const fmtOtbAdr = (v: number) => v === 0 ? '—' : `${Math.round(v / 1000)}k`
  const fmtOtbRev = (v: number) => v === 0 ? '—' : `${(v / 1e6).toFixed(1)}M`
  const puColor   = (v: number) => v > 0 ? '#00B883' : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'

  // ── c05 스키마 기반 세그 색상 (이 모달은 항상 다크모드) ──────────────────────────
  const segTextColor = (r: SegTableRow) => r.fontDarkColor ?? 'var(--color-text-primary)'
  const segBgColor   = (r: SegTableRow) =>
    r.bgDarkColor ?? (r.level === 'main' ? '#1A1F2E' : r.level === 'mid' ? '#15192A' : 'transparent')
  // 세그 숫자: 양수 → 세그 폰트색 / 음수 → 빨강 / 0 → 흐림
  const numColor    = (v: number, r: SegTableRow) =>
    v > 0 ? (r.fontDarkColor ?? 'var(--color-text-primary)') : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
  const otbNumColor = (r: SegTableRow) =>
    r.otbNights > 0 ? (r.fontDarkColor ?? 'var(--color-text-primary)') : 'rgba(255,255,255,0.25)'
  // 어카운트 숫자: 선택 세그(selRow)의 폰트색 기준
  const accNumColor = (v: number) =>
    v > 0 ? (selRow?.fontDarkColor ?? 'var(--color-text-primary)') : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
  const accOtbColor = (otbN: number) =>
    otbN > 0 ? (selRow?.fontDarkColor ?? 'var(--color-text-primary)') : 'rgba(255,255,255,0.25)'

  // OCC / Rev.PAR 픽업 색상 (양수=흰색 / 음수=빨강 / 0=흐림)
  const occPuVal      = summary.puNights / (roomCount || 1) * 100
  const occPuColor    = occPuVal > 0 ? 'var(--color-text-primary)' : occPuVal < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
  const revparPuColor = summary.puRevenue > 0 ? 'var(--color-text-primary)' : summary.puRevenue < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'

  const segHeadTh: React.CSSProperties = { textAlign: 'right', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)' }
  const accHeadTh: React.CSSProperties = { textAlign: 'right', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }

  // 어카운트 — 현재 탭 기준 R/N·ADR·REV 모두 0이면 제외 + 합계
  const accVisible = accountRows.filter(a => selType === 'pickup'
    ? (a.puNights !== 0 || a.puAdr !== 0 || a.puRevenue !== 0)
    : (a.otbNights !== 0 || a.otbAdr !== 0 || a.otbRevenue !== 0))
  const accTotal = accVisible.reduce((t, a) => ({
    puNights:   t.puNights   + a.puNights,
    puRevenue:  t.puRevenue  + a.puRevenue,
    otbNights:  t.otbNights  + a.otbNights,
    otbRevenue: t.otbRevenue + a.otbRevenue,
  }), { puNights: 0, puRevenue: 0, otbNights: 0, otbRevenue: 0 })
  const accTotalOtbAdr = accTotal.otbNights > 0 ? Math.round(accTotal.otbRevenue / accTotal.otbNights) : 0

  // 통합 세그 테이블 렌더 — SEGMENT 1컬럼 + OTB(R/N·ADR·REV) + Pick-up(R/N·ADR·REV)
  const DIV = '#1e1e1e'   // OTB / Pick-up 세로 구분선
  const stickyTop0 = { position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 2 } as React.CSSProperties
  const stickyTop24 = { position: 'sticky', top: 24, background: '#0a0a0a', zIndex: 2 } as React.CSSProperties
  const renderUnifiedTable = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        {/* 그룹 헤더 */}
        <tr>
          <th style={{ ...stickyTop0, textAlign: 'left', padding: '6px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>SEGMENT</th>
          <th colSpan={3} style={{ ...stickyTop0, textAlign: 'center', padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#5B8DEF', letterSpacing: '0.07em', background: '#0f0f0f', borderLeft: `1px solid ${DIV}`, borderBottom: '2px solid #5B8DEF' }}>OTB</th>
          <th colSpan={3} style={{ ...stickyTop0, textAlign: 'center', padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#00E5A0', letterSpacing: '0.07em', background: '#0f0f0f', borderLeft: `1px solid ${DIV}`, borderBottom: '2px solid #00E5A0' }}>PICK-UP</th>
        </tr>
        {/* 서브 헤더 */}
        <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
          <th style={{ ...stickyTop24, padding: '4px 12px 6px' }} />
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => (
            <th key={`otb-${h}`} style={{ ...segHeadTh, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>
          ))}
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => (
            <th key={`pu-${h}`} style={{ ...segHeadTh, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const isSub     = r.level === 'sub'   // mid는 main과 동일 처리(들여쓰기 X)
          const adrValid  = r.otbNights > 0 && (r.otbNights - r.puNights) > 0
          const otbActive = selMain === r.id && selType === 'otb'
          const puActive  = selMain === r.id && selType === 'pickup'
          const selOtb = () => { if (otbActive) { setSelMain(null) } else { setSelMain(r.id); setSelType('otb') } }
          const selPu  = () => { if (puActive)  { setSelMain(null) } else { setSelMain(r.id); setSelType('pickup') } }
          return (
            <tr key={r.id} style={{ background: selMain === r.id ? 'rgba(0,229,160,0.06)' : segBgColor(r), borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: isSub ? '5px 12px 5px 24px' : '7px 12px', color: segTextColor(r), fontWeight: r.isBold ? 600 : 400 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {isSub && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>└</span>}
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: r.bgDarkColor || '#888', flexShrink: 0 }} />
                  {r.name}
                </span>
              </td>
              {/* OTB */}
              <td onClick={selOtb} style={{ padding: '5px 12px', textAlign: 'right', color: otbNumColor(r), cursor: 'pointer', borderLeft: `1px solid ${otbActive ? '#00E5A0' : DIV}` }}>{fmtOtbRn(r.otbNights)}</td>
              <td onClick={selOtb} style={{ padding: '5px 12px', textAlign: 'right', color: otbNumColor(r), cursor: 'pointer' }}><FmtVal val={fmtOtbAdr(r.otbAdr)} numSize={11} /></td>
              <td onClick={selOtb} style={{ padding: '5px 12px', textAlign: 'right', color: otbNumColor(r), cursor: 'pointer' }}><FmtVal val={fmtOtbRev(r.otbRevenue)} numSize={11} /></td>
              {/* Pick-up */}
              <td onClick={selPu} style={{ padding: '5px 12px', textAlign: 'right', color: numColor(r.puNights, r), cursor: 'pointer', borderLeft: `1px solid ${puActive ? '#00E5A0' : DIV}` }}>{fmtPuRn(r.puNights)}</td>
              <td onClick={selPu} style={{ padding: '5px 12px', textAlign: 'right', color: numColor(r.puAdr, r), cursor: 'pointer' }}><FmtVal val={fmtPuAdr(r.puAdr, adrValid)} numSize={11} /></td>
              <td onClick={selPu} style={{ padding: '5px 12px', textAlign: 'right', color: numColor(r.puRevenue, r), cursor: 'pointer' }}><FmtVal val={fmtPuRev(r.puRevenue)} numSize={11} /></td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        {/* Total 행 */}
        <tr style={{ position: 'sticky', bottom: 0, background: '#0a0a0a' }}>
          <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}>Total</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtOtbRn(summary.totalNights)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbAdr(summary.totalAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbRev(summary.totalRevenue)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: puColor(summary.puNights), borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtPuRn(summary.puNights)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(0,229,160,0.5)' }}>—</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: puColor(summary.puRevenue), borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtPuRev(summary.puRevenue)} numSize={11} /></td>
        </tr>
        {/* OCC 행 */}
        <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>OCC</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}>{summary.occ.toFixed(1)}%</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: occPuColor, borderLeft: `1px solid ${DIV}` }}>{summary.puNights >= 0 ? '+' : ''}{(summary.puNights / (roomCount || 1) * 100).toFixed(1)}%</td>
        </tr>
        {/* Rev.PAR 행 */}
        <tr>
          <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Rev.PAR</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${Math.round(summary.revpar / 1000)}k`} /></td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: revparPuColor, borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${summary.puRevenue >= 0 ? '+' : ''}${Math.round(summary.puRevenue / (roomCount || 1) / 1000)}k`} /></td>
        </tr>
      </tfoot>
    </table>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#0a0a0a',
        border: '1px solid var(--color-border-default)',
        borderRadius: 16, display: 'flex', flexDirection: 'column',
        width: 'min(96vw, 1040px)', maxHeight: '82vh',
        boxShadow: 'var(--shadow-card)', overflow: 'hidden',
      }}>

        {/* 헤더 — 날짜 피커 + 픽업 요약 */}
        <div style={{ padding: '13px 18px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <DatePicker
              label="OTB"
              value={localOtbDate}
              onChange={setLocalOtbDate}
              availableDates={otbDates}
              accent bare plain fontPx={11}
            />
            <DatePicker
              label="vs"
              value={localVsDate}
              onChange={setLocalVsDate}
              availableDates={otbDates.filter(d => d < localOtbDate)}
              accent bare plain fontPx={11}
            />
            {/* 픽업 요약 문구 */}
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
              {diffDays}일 간{' '}
              <span style={{ fontWeight: 600, color: puColor(summary.puNights) }}>
                {summary.puNights >= 0 ? '+' : ''}{summary.puNights}
              </span>{' '}객실 픽업 하였습니다
            </span>
          </div>

          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', marginTop: 2 }} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {/* 일자 네비(가운데) */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 39, borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          {/* 일자 ‹ {날짜} › — 가운데 정렬 */}
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setLocalDay(d => Math.max(1, d - 1))}
              style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >‹</button>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: getDayColor(localDateStr) }}>
              {month + 1}/{localDay} ({WEEKDAY_KR[new Date(year, month, localDay).getDay()]})
            </h2>
            <button
              onClick={() => setLocalDay(d => Math.min(new Date(year, month + 1, 0).getDate(), d + 1))}
              style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >›</button>
          </div>
        </div>

        {/* 본문 — 통합 세그 테이블 · 어카운트 */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* 좌측: 통합 세그 테이블 (SEGMENT · OTB · Pick-up) */}
          <div style={{ width: 560, flexShrink: 0, borderRight: '0.5px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
            {renderUnifiedTable()}
          </div>

          {/* 우측 어카운트 패널 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!selMain ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 28, opacity: 0.2 }}>👆</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Select a segment</span>
              </div>
            ) : (
              <>
                {/* 어카운트 헤더 */}
                <div style={{ padding: '10px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: selRow?.bgDarkColor || '#888', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{selRow?.name} · {selType === 'otb' ? 'OTB Account' : 'Pickup Account'}</span>
                </div>
                {/* 어카운트 테이블 */}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {accVisible.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No data</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1 }}>
                          <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>ACCOUNT</th>
                          <th style={accHeadTh}>{selType === 'pickup' ? 'R/N' : 'OTB R/N'}</th>
                          <th style={accHeadTh}>ADR</th>
                          <th style={accHeadTh}>REV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accVisible.map(a => (
                          <tr key={a.name} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                          >
                            <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,0.75)' }}>{a.name}</td>
                            {selType === 'pickup' ? (<>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accNumColor(a.puNights) }}>{fmtPuRn(a.puNights)}</td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accNumColor(a.puAdr) }}><FmtVal val={fmtPuAdr(a.puAdr, a.otbNights > 0 && a.vsNights > 0)} numSize={11} /></td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accNumColor(a.puRevenue) }}><FmtVal val={fmtPuRev(a.puRevenue)} numSize={11} /></td>
                            </>) : (<>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accOtbColor(a.otbNights) }}>{fmtOtbRn(a.otbNights)}</td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accOtbColor(a.otbNights) }}><FmtVal val={fmtOtbAdr(a.otbAdr)} numSize={11} /></td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accOtbColor(a.otbNights) }}><FmtVal val={fmtOtbRev(a.otbRevenue)} numSize={11} /></td>
                            </>)}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ position: 'sticky', bottom: 0, background: '#0a0a0a' }}>
                          <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.4)' }}>Total</td>
                          {selType === 'pickup' ? (<>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: puColor(accTotal.puNights), borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtPuRn(accTotal.puNights)}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(0,229,160,0.4)' }}>—</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: puColor(accTotal.puRevenue), borderTop: '1px solid rgba(0,229,160,0.4)' }}><FmtVal val={fmtPuRev(accTotal.puRevenue)} numSize={11} /></td>
                          </>) : (<>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtOtbRn(accTotal.otbNights)}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.4)' }}><FmtVal val={fmtOtbAdr(accTotalOtbAdr)} numSize={11} /></td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.4)' }}><FmtVal val={fmtOtbRev(accTotal.otbRevenue)} numSize={11} /></td>
                          </>)}
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
