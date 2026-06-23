'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { PickupRow } from '@/hooks/usePickupData'
import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import { buildSegTable, type SegTableRow } from '@/utils/segmentationTable'
import { WEEKDAY_KR } from '@/utils/pickupPageUtils'
import { getDayColor } from '@/utils/dateUtils'

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
  open, onClose, year, month, day, schema, pickupRows, roomCount, defaultTab, otbDate, vsDate, onDateChange,
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
  onDateChange?: (otbDate: string, vsDate: string) => void
}) {
  const [tab,     setTab]     = useState<'pickup' | 'otb'>(defaultTab ?? 'pickup')
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
      setTab(defaultTab ?? 'pickup')
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

  const dow     = new Date(year, month, localDay).getDay()
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(localDay).padStart(2, '0')}`

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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#0a0a0a',
        border: '1px solid var(--color-border-default)',
        borderRadius: 16, display: 'flex', flexDirection: 'column',
        width: 'min(92vw, 860px)', maxHeight: '82vh',
        boxShadow: 'var(--shadow-card)', overflow: 'hidden',
      }}>

        {/* 헤더 */}
        <div style={{ padding: '13px 18px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* 제목 */}
            <h2 style={{ fontSize: 13, fontWeight: 500, color: getDayColor(dateStr) }}>
              {month + 1}/{localDay} ({WEEKDAY_KR[dow]}) · Pickup by Segment
            </h2>

            {/* 날짜 피커 행 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {/* OTB Date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#00E5A0', fontWeight: 500 }}>OTB</span>
                <input
                  type="date"
                  value={localOtbDate}
                  onChange={e => setLocalOtbDate(e.target.value)}
                  style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, border: '0.5px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-primary)', cursor: 'pointer' }}
                />
              </div>

              {/* vs Date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>vs</span>
                <input
                  type="date"
                  value={localVsDate}
                  onChange={e => setLocalVsDate(e.target.value)}
                  style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, border: '0.5px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-primary)', cursor: 'pointer' }}
                />
              </div>

              {/* 일자 변경 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => setLocalDay(d => Math.max(1, d - 1))}
                  style={{ width: 22, height: 22, borderRadius: 4, border: '0.5px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12 }}
                >‹</button>
                <span style={{ fontSize: 11, color: 'var(--color-text-primary)', minWidth: 20, textAlign: 'center' }}>{localDay}</span>
                <button
                  onClick={() => setLocalDay(d => Math.min(new Date(year, month + 1, 0).getDate(), d + 1))}
                  style={{ width: 22, height: 22, borderRadius: 4, border: '0.5px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12 }}
                >›</button>
              </div>
            </div>
          </div>

          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', marginTop: 2 }} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
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

        {/* 본문 2컬럼 */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* 좌측 세그 계층 테이블 */}
          <div style={{ width: 380, flexShrink: 0, borderRight: '0.5px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1 }}>
                  <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>SEGMENT</th>
                  <th style={segHeadTh}>{tab === 'pickup' ? 'R/N' : 'OTB R/N'}</th>
                  <th style={segHeadTh}>ADR</th>
                  <th style={segHeadTh}>REV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isSub    = r.level === 'sub'   // mid는 main과 동일 처리(들여쓰기 X)
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
                <tr style={{ position: 'sticky', bottom: 0, background: '#0a0a0a' }}>
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
                  {accountRows.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No data</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1 }}>
                          <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>ACCOUNT</th>
                          <th style={accHeadTh}>{tab === 'pickup' ? 'R/N' : 'OTB R/N'}</th>
                          <th style={accHeadTh}>ADR</th>
                          <th style={accHeadTh}>REV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accountRows.map(a => (
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
