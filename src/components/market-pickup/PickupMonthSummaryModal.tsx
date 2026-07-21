'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { PickupRow } from '@/hooks/usePickupData'
import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import { buildSegTable, type SegTableRow } from '@/utils/segmentationTable'
import { inMonth } from '@/utils/pickupPageUtils'
import DatePicker from '@/components/DatePicker'

type AccStat = {
  otbNights: number; otbRevenue: number
  vsNights:  number; vsRevenue:  number
  puNights:  number; puRevenue:  number
}

// MarketPickupDayModal과 동일한 UI/로직이되, 1일치가 아닌 "해당 월 전체 합산"을 보여주고
// 일자 네비 대신 월 네비를 제공한다. 데이터는 카드가 이미 보유한 month-spanning pickupRows 재사용.
export function PickupMonthSummaryModal({
  open, onClose, year, month, schema, pickupRows, roomCount, defaultTab, otbDate, vsDate, otbDates = [], onDateChange,
}: {
  open:          boolean
  onClose:       () => void
  year:          number   // 초기 연도
  month:         number   // 초기 월 (0-based)
  schema:        MarketSchemaRow[]
  pickupRows:    PickupRow[]
  roomCount:     number
  defaultTab?:   'pickup' | 'otb'
  otbDate:       string   // 'YYYY-MM-DD'
  vsDate:        string   // 'YYYY-MM-DD'
  otbDates?:     string[]
  onDateChange?: (otbDate: string, vsDate: string) => void
}) {
  const [tab,     setTab]     = useState<'pickup' | 'otb'>(defaultTab ?? 'pickup')
  const [selMain, setSelMain] = useState<string | null>(null)
  const [selYear,  setSelYear]  = useState(year)
  const [selMonth, setSelMonth] = useState(month)   // 0-based
  const [localOtbDate, setLocalOtbDate] = useState(otbDate)
  const [localVsDate,  setLocalVsDate]  = useState(vsDate)

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  // open 시 로컬 상태 초기화
  useEffect(() => {
    if (open) {
      setLocalOtbDate(otbDate)
      setLocalVsDate(vsDate)
      setSelYear(year)
      setSelMonth(month)
      setTab(defaultTab ?? 'pickup')
      setSelMain(null)
    }
  }, [open, otbDate, vsDate, year, month, defaultTab])

  // 날짜 변경 시 페이지에 반영 (onDateChange 있을 때만)
  useEffect(() => {
    if (localOtbDate !== otbDate || localVsDate !== vsDate) {
      onDateChange?.(localOtbDate, localVsDate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOtbDate, localVsDate])

  // 선택된 세그(main/sub)의 어카운트별 "월 전체" 집계
  const accountRows = useMemo(() => {
    if (!open || !selMain) return []
    const selSchema = schema.find(s => s.id === selMain)
    if (!selSchema) return []
    const codes = selSchema.level === 'main'
      ? schema.filter(s => s.parent_id === selMain).flatMap(s => s.segmentation ?? [])
      : (selSchema.segmentation ?? [])
    const codeSet = new Set(codes)

    const map = new Map<string, AccStat>()
    for (const r of pickupRows) {
      if (!inMonth(r.business_date, selYear, selMonth + 1)) continue
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
  }, [open, selMain, schema, pickupRows, selYear, selMonth])

  if (!open) return null

  const month1 = selMonth + 1
  // day 미지정 → buildSegTable이 해당 월 전체를 합산
  const { rows, summary } = buildSegTable({ schema, pickup: pickupRows, year: selYear, month: month1, roomCount })
  const selRow = rows.find(r => r.id === selMain)

  // 월 네비 범위: OTB 날짜의 월을 최소값으로 (그 이전은 데이터 없음)
  const otbY  = Number(localOtbDate.slice(0, 4))
  const otbM0 = Number(localOtbDate.slice(5, 7)) - 1
  const atMin = !localOtbDate || selYear < otbY || (selYear === otbY && selMonth <= otbM0)
  const prevMonth = () => {
    if (atMin) return
    setSelMain(null)
    if (selMonth === 0) { setSelYear(y => y - 1); setSelMonth(11) } else setSelMonth(m => m - 1)
  }
  const nextMonth = () => {
    setSelMain(null)
    if (selMonth === 11) { setSelYear(y => y + 1); setSelMonth(0) } else setSelMonth(m => m + 1)
  }

  // ── 포맷 헬퍼 ───────────────────────────────────────────────────────────────
  const fmtPuRn  = (v: number) => v === 0 ? '—' : `${v > 0 ? '+' : ''}${Math.round(v)}`
  const fmtPuAdr = (v: number, valid: boolean) => !valid || v === 0 ? '—' : `${v > 0 ? '+' : ''}${Math.round(v / 1000)}k`
  const fmtPuRev = (v: number) => v === 0 ? '—' : `${v > 0 ? '+' : ''}${(v / 1e6).toFixed(1)}M`
  const fmtOtbRn  = (v: number) => v === 0 ? '—' : v.toLocaleString()
  const fmtOtbAdr = (v: number) => v === 0 ? '—' : `${Math.round(v / 1000)}k`
  const fmtOtbRev = (v: number) => v === 0 ? '—' : `${(v / 1e6).toFixed(1)}M`
  const puColor   = (v: number) => v > 0 ? '#00B883' : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'

  // ── c05 스키마 기반 세그 색상 (항상 다크모드) ──────────────────────────────────
  const segTextColor = (r: SegTableRow) => r.fontDarkColor ?? 'var(--color-text-primary)'
  const segBgColor   = (r: SegTableRow) =>
    r.bgDarkColor ?? (r.level === 'main' ? '#1A1F2E' : r.level === 'mid' ? '#15192A' : 'transparent')
  const numColor    = (v: number, r: SegTableRow) =>
    v > 0 ? (r.fontDarkColor ?? 'var(--color-text-primary)') : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
  const otbNumColor = (r: SegTableRow) =>
    r.otbNights > 0 ? (r.fontDarkColor ?? 'var(--color-text-primary)') : 'rgba(255,255,255,0.25)'
  const accNumColor = (v: number) =>
    v > 0 ? (selRow?.fontDarkColor ?? 'var(--color-text-primary)') : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
  const accOtbColor = (otbN: number) =>
    otbN > 0 ? (selRow?.fontDarkColor ?? 'var(--color-text-primary)') : 'rgba(255,255,255,0.25)'

  const occPuVal      = summary.puNights / (roomCount || 1) * 100
  const occPuColor    = occPuVal > 0 ? 'var(--color-text-primary)' : occPuVal < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
  const revparPuColor = summary.puRevenue > 0 ? 'var(--color-text-primary)' : summary.puRevenue < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'

  const segHeadTh: React.CSSProperties = { textAlign: 'right', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)' }
  const accHeadTh: React.CSSProperties = { textAlign: 'right', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }

  // 어카운트 — 현재 탭 기준 R/N·ADR·REV 모두 0이면 제외 + 합계
  const accVisible = accountRows.filter(a => tab === 'pickup'
    ? (a.puNights !== 0 || a.puAdr !== 0 || a.puRevenue !== 0)
    : (a.otbNights !== 0 || a.otbAdr !== 0 || a.otbRevenue !== 0))
  const accTotal = accVisible.reduce((t, a) => ({
    puNights:   t.puNights   + a.puNights,
    puRevenue:  t.puRevenue  + a.puRevenue,
    otbNights:  t.otbNights  + a.otbNights,
    otbRevenue: t.otbRevenue + a.otbRevenue,
  }), { puNights: 0, puRevenue: 0, otbNights: 0, otbRevenue: 0 })
  const accTotalOtbAdr = accTotal.otbNights > 0 ? Math.round(accTotal.otbRevenue / accTotal.otbNights) : 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#000000',
        border: '1px solid var(--color-border-default)',
        borderRadius: 16, display: 'flex', flexDirection: 'column',
        width: 'min(92vw, 860px)', maxHeight: '82vh',
        boxShadow: 'var(--shadow-card)', overflow: 'hidden',
      }}>

        {/* 헤더 — 날짜 피커 + 월 픽업 요약 */}
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
            {/* 월 픽업 요약 문구 */}
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
              {month1}월{' '}
              <span style={{ fontWeight: 600, color: puColor(summary.puNights) }}>
                {summary.puNights >= 0 ? '+' : ''}{summary.puNights}
              </span>{' '}R/N 픽업 하였습니다
            </span>
          </div>

          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', marginTop: 2 }} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {/* 탭 + 월 네비(가운데) */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex' }}>
            {(['pickup', 'otb'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setSelMain(null) }} style={{
                padding: '8px 16px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderBottom: tab === t ? '1.5px solid #00E5A0' : '1.5px solid transparent',
                color: tab === t ? '#00E5A0' : 'rgba(255,255,255,0.35)',
              }}>
                {t === 'pickup' ? 'Pickup' : 'OTB'}
              </button>
            ))}
          </div>
          {/* 월 ‹ {n월} › — 가운데 정렬 */}
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={prevMonth}
              disabled={atMin}
              style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: atMin ? 'default' : 'pointer', opacity: atMin ? 0.3 : 1, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >‹</button>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#fff', minWidth: 48, textAlign: 'center' }}>
              {selYear !== year ? `${selYear}.` : ''}{month1}월
            </h2>
            <button
              onClick={nextMonth}
              style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >›</button>
          </div>
        </div>

        {/* 본문 2컬럼 */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* 좌측 세그 계층 테이블 */}
          <div style={{ width: 380, flexShrink: 0, borderRight: '0.5px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#000000', zIndex: 1 }}>
                  <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>SEGMENT</th>
                  <th style={segHeadTh}>{tab === 'pickup' ? 'R/N' : 'OTB R/N'}</th>
                  <th style={segHeadTh}>ADR</th>
                  <th style={segHeadTh}>REV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isSub    = r.level === 'sub'
                  const isActive = selMain === r.id
                  const adrValid = r.otbNights > 0 && (r.otbNights - r.puNights) > 0
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelMain(isActive ? null : r.id)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                        background: isActive ? 'rgba(0,229,160,0.06)' : segBgColor(r),
                        borderLeft: isActive ? '2px solid #00E5A0' : '2px solid transparent',
                      }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = segBgColor(r) }}
                    >
                      <td style={{ padding: isSub ? '5px 12px 5px 24px' : '7px 12px', color: segTextColor(r), fontWeight: r.isBold ? 600 : 400 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {isSub && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>└</span>}
                          <span style={{ width: 7, height: 7, borderRadius: 2, background: r.bgDarkColor || '#888', flexShrink: 0 }} />
                          {r.name}
                        </span>
                      </td>
                      {tab === 'pickup' ? (<>
                        <td style={{ padding: '5px 12px', textAlign: 'right', color: numColor(r.puNights, r) }}>{fmtPuRn(r.puNights)}</td>
                        <td style={{ padding: '5px 12px', textAlign: 'right', color: numColor(r.puAdr, r) }}>{fmtPuAdr(r.puAdr, adrValid)}</td>
                        <td style={{ padding: '5px 12px', textAlign: 'right', color: numColor(r.puRevenue, r) }}>{fmtPuRev(r.puRevenue)}</td>
                      </>) : (<>
                        <td style={{ padding: '5px 12px', textAlign: 'right', color: otbNumColor(r) }}>{fmtOtbRn(r.otbNights)}</td>
                        <td style={{ padding: '5px 12px', textAlign: 'right', color: otbNumColor(r) }}>{fmtOtbAdr(r.otbAdr)}</td>
                        <td style={{ padding: '5px 12px', textAlign: 'right', color: otbNumColor(r) }}>{fmtOtbRev(r.otbRevenue)}</td>
                      </>)}
                    </tr>
                  )
                })}
              </tbody>
              {/* 합계 행 */}
              <tfoot>
                <tr style={{ position: 'sticky', bottom: 0, background: '#000000' }}>
                  <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}>Total</td>
                  {tab === 'pickup' ? (<>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: puColor(summary.puNights), borderTop: '1px solid rgba(0,229,160,0.5)' }}>{fmtPuRn(summary.puNights)}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(0,229,160,0.5)' }}>—</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: puColor(summary.puRevenue), borderTop: '1px solid rgba(0,229,160,0.5)' }}>{fmtPuRev(summary.puRevenue)}</td>
                  </>) : (<>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}>{fmtOtbRn(summary.totalNights)}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}>{fmtOtbAdr(summary.totalAdr)}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}>{fmtOtbRev(summary.totalRevenue)}</td>
                  </>)}
                </tr>
                {/* OCC 행 */}
                <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>OCC</td>
                  <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: tab === 'pickup' ? occPuColor : 'var(--color-text-primary)' }}>
                    {tab === 'pickup'
                      ? `${summary.puNights >= 0 ? '+' : ''}${(summary.puNights / (roomCount || 1) * 100).toFixed(1)}%`
                      : `${summary.occ.toFixed(1)}%`}
                  </td>
                </tr>
                {/* Rev.PAR 행 */}
                <tr>
                  <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Rev.PAR</td>
                  <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: tab === 'pickup' ? revparPuColor : 'var(--color-text-primary)' }}>
                    {tab === 'pickup'
                      ? `${summary.puRevenue >= 0 ? '+' : ''}${Math.round(summary.puRevenue / (roomCount || 1) / 1000)}k`
                      : `${Math.round(summary.revpar / 1000)}k`}
                  </td>
                </tr>
              </tfoot>
            </table>
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
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{selRow?.name} · Account</span>
                </div>
                {/* 어카운트 테이블 */}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {accVisible.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No data</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#000000', zIndex: 1 }}>
                          <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>ACCOUNT</th>
                          <th style={accHeadTh}>{tab === 'pickup' ? 'R/N' : 'OTB R/N'}</th>
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
                            {tab === 'pickup' ? (<>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accNumColor(a.puNights) }}>{fmtPuRn(a.puNights)}</td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accNumColor(a.puAdr) }}>{fmtPuAdr(a.puAdr, a.otbNights > 0 && a.vsNights > 0)}</td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accNumColor(a.puRevenue) }}>{fmtPuRev(a.puRevenue)}</td>
                            </>) : (<>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accOtbColor(a.otbNights) }}>{fmtOtbRn(a.otbNights)}</td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accOtbColor(a.otbNights) }}>{fmtOtbAdr(a.otbAdr)}</td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: accOtbColor(a.otbNights) }}>{fmtOtbRev(a.otbRevenue)}</td>
                            </>)}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ position: 'sticky', bottom: 0, background: '#000000' }}>
                          <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.4)' }}>Total</td>
                          {tab === 'pickup' ? (<>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: puColor(accTotal.puNights), borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtPuRn(accTotal.puNights)}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(0,229,160,0.4)' }}>—</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: puColor(accTotal.puRevenue), borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtPuRev(accTotal.puRevenue)}</td>
                          </>) : (<>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtOtbRn(accTotal.otbNights)}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtOtbAdr(accTotalOtbAdr)}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtOtbRev(accTotal.otbRevenue)}</td>
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

export default PickupMonthSummaryModal
