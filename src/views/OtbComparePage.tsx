'use client'

// 전년 OTB 비교 (/pickup/otb-compare)
// OTB 스냅샷 기준, 현재 OTB(on-the-books) vs 전년 OTB(pacing) 을 일자·세그먼트·MTD로 비교.
// 데이터: get_ly_pacing_data(동일자 v1) / get_ly_pacing_data_v2(동기간 v2) — useLyPacing 훅.
//   ※ 코드베이스 컨벤션: v1=동일자(day), v2=동기간(period) — PickupPage.tsx L76-77 동일.

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useLyPacing, type LyPacingRow } from '@/hooks/useLyPacing'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import DatePicker from '@/components/DatePicker'
import { FmtVal } from '@/utils/FmtVal'
import OtbCompareChart from '@/components/pickup/OtbCompareChart'
import {
  buildOtbCompare, buildOtbCompareAccounts, codesBySchemaId,
  otbFmt, gapColor, LY_GRAY, type OtbCompareVals,
} from '@/utils/otbCompareTable'

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']
const DIV = 'rgba(255,255,255,0.08)'

// ── 토글 스위치 (PickupChartModal 패턴) ─────────────────────────────────────────
const trackStyle = (on: boolean, onColor: string, offColor: string): React.CSSProperties => ({
  position: 'relative', display: 'inline-block', width: 36, height: 20, borderRadius: 20,
  background: on ? onColor : offColor, border: `1px solid ${on ? onColor : offColor}`,
  cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
})
const thumbStyle = (on: boolean): React.CSSProperties => ({
  position: 'absolute', width: 14, height: 14, top: 2, left: on ? 20 : 2,
  borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
})

const cardStyle: React.CSSProperties = {
  background: '#000000', border: '1px solid var(--color-border-default)', borderRadius: 12,
}

// ── 세그먼트 비교 테이블 (현재 OTB · 전년 OTB · GAP) ──────────────────────────────
function SegCompareTable({
  data, roomCount, days, isPeriod, selectedId, selectedSource, onSelect,
}: {
  data:           { rows: ReturnType<typeof buildOtbCompare>['rows']; total: OtbCompareVals }
  roomCount:      number
  days:           number   // OCC/Rev.PAR 분모 일수 (일자별=1 / MTD=해당 월 말일)
  isPeriod:       boolean
  selectedId?:    string | null
  selectedSource?: 'otb' | 'ly' | 'gap' | null
  onSelect?:      (id: string, source: 'otb' | 'ly' | 'gap') => void
}) {
  const { rows, total } = data
  const lyColor = isPeriod ? '#a78bfa' : '#F59E0B'
  const occDenom = (roomCount || 1) * (days || 1)   // 객실수 × 일수 = 가용 room-night
  const firstMainId = rows.find(r => r.level === 'main')?.id   // 첫 메인 행은 구분선 제외
  const stickyTop0:  React.CSSProperties = { position: 'sticky', top: 0,  zIndex: 2, background: '#0f0f0f' }
  const stickyTop24: React.CSSProperties = { position: 'sticky', top: 24, zIndex: 2, background: '#0f0f0f' }
  const grpTh = (color: string): React.CSSProperties => ({
    ...stickyTop0, textAlign: 'center', padding: '6px 12px', fontSize: 10, fontWeight: 700,
    color, letterSpacing: '0.07em', borderLeft: `1px solid ${DIV}`, borderBottom: `2px solid ${color}`,
  })
  const subTh: React.CSSProperties = {
    ...stickyTop24, textAlign: 'right', padding: '4px 12px 6px', fontSize: 10, fontWeight: 500,
    color: 'rgba(255,255,255,0.3)',
  }
  const segText = (r: (typeof rows)[number]) => r.fontDarkColor ?? 'var(--color-text-primary)'
  const segBg   = (r: (typeof rows)[number]) =>
    r.bgDarkColor ?? (r.level === 'main' ? '#1A1F2E' : r.level === 'mid' ? '#15192A' : 'transparent')
  const cCol = (r: (typeof rows)[number]) => (r.otbN > 0 ? segText(r) : 'rgba(255,255,255,0.25)')
  const clickable = !!onSelect
  const cell = (id: string, src: 'otb' | 'ly' | 'gap', color: string, node: React.ReactNode, leftBorder?: boolean, active?: boolean, bold?: boolean): React.ReactNode => (
    <td
      onClick={clickable ? () => onSelect!(id, src) : undefined}
      style={{
        padding: '5px 12px', textAlign: 'right', color,
        cursor: clickable ? 'pointer' : 'default', fontWeight: bold ? 500 : 400,
        // 선택 표시: 각 그룹 첫 컬럼(R/N)에만 초록 좌측 border (미선택 시 transparent로 자리 유지)
        borderLeft: leftBorder ? `2px solid ${active ? '#00E5A0' : 'transparent'}` : undefined,
      }}
    >{node}</td>
  )

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr>
          <th style={{ ...stickyTop0, textAlign: 'left', padding: '6px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>SEGMENT</th>
          <th colSpan={3} style={grpTh('#5B8DEF')}>현재 OTB</th>
          <th colSpan={3} style={grpTh(lyColor)}>전년 OTB</th>
          <th colSpan={3} style={grpTh('#F59E0B')}>GAP</th>
        </tr>
        <tr style={{ borderBottom: `0.5px solid ${DIV}` }}>
          <th style={{ ...stickyTop24, padding: '4px 12px 6px' }} />
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => <th key={`c-${h}`} style={{ ...subTh, borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>)}
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => <th key={`l-${h}`} style={{ ...subTh, borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>)}
          {(['ΔR/N', 'ΔADR', 'ΔREV'] as const).map((h, i) => <th key={`g-${h}`} style={{ ...subTh, borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const isSub  = r.level === 'sub'
          const active = selectedId === r.id
          return (
            <tr key={r.id}
              onMouseEnter={clickable && !active ? (e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' } : undefined}
              onMouseLeave={clickable && !active ? (e) => { e.currentTarget.style.background = segBg(r) } : undefined}
              style={{
                background: active ? 'rgba(0,229,160,0.06)' : segBg(r),
                borderTop: (r.level === 'main' && r.id !== firstMainId) ? '1px solid #1f1f1f' : undefined,
                borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                cursor: clickable ? 'pointer' : 'default',
              }}>
              <td style={{ padding: isSub ? '5px 12px 5px 24px' : '7px 12px', color: segText(r), fontWeight: r.isBold ? 600 : 400 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {isSub && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>└</span>}
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: r.bgDarkColor || '#888', flexShrink: 0 }} />
                  {r.name}
                </span>
              </td>
              {cell(r.id, 'otb', cCol(r), otbFmt.rn(r.otbN), true, active && selectedSource === 'otb')}
              {cell(r.id, 'otb', cCol(r), <FmtVal val={otbFmt.adr(r.otbAdr)} numSize={11} />)}
              {cell(r.id, 'otb', cCol(r), <FmtVal val={otbFmt.rev(r.otbR)} numSize={11} />)}
              {cell(r.id, 'ly', LY_GRAY, otbFmt.rn(r.lyN), true, active && selectedSource === 'ly')}
              {cell(r.id, 'ly', LY_GRAY, <FmtVal val={otbFmt.adr(r.lyAdr)} numSize={11} />)}
              {cell(r.id, 'ly', LY_GRAY, <FmtVal val={otbFmt.rev(r.lyR)} numSize={11} />)}
              {cell(r.id, 'gap', gapColor(r.gapN), otbFmt.gapRn(r.gapN), true, active && selectedSource === 'gap', true)}
              {cell(r.id, 'gap', gapColor(r.gapAdr), <FmtVal val={otbFmt.gapAdr(r.gapAdr)} numSize={11} />, false, false, true)}
              {cell(r.id, 'gap', gapColor(r.gapR), <FmtVal val={otbFmt.gapRev(r.gapR)} numSize={11} />, false, false, true)}
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr style={{ position: 'sticky', bottom: 0, background: '#000000' }}>
          <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}>Total</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{otbFmt.rn(total.otbN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={otbFmt.adr(total.otbAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={otbFmt.rev(total.otbR)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: LY_GRAY, borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{otbFmt.rn(total.lyN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: LY_GRAY, borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={otbFmt.adr(total.lyAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: LY_GRAY, borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={otbFmt.rev(total.lyR)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(total.gapN), borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{otbFmt.gapRn(total.gapN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(total.gapAdr), borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={otbFmt.gapAdr(total.gapAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(total.gapR), borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={otbFmt.gapRev(total.gapR)} numSize={11} /></td>
        </tr>
        <tr style={{ borderTop: `0.5px solid rgba(255,255,255,0.06)` }}>
          <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>OCC</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}>{(total.otbN / occDenom * 100).toFixed(1)}%</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: LY_GRAY, borderLeft: `1px solid ${DIV}` }}>{(total.lyN / occDenom * 100).toFixed(1)}%</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: gapColor(total.gapN), borderLeft: `1px solid ${DIV}` }}>{total.gapN >= 0 ? '+' : ''}{(total.gapN / occDenom * 100).toFixed(1)}%p</td>
        </tr>
        <tr>
          <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Rev.PAR</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${Math.round(total.otbR / occDenom / 1000)}k`} /></td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: LY_GRAY, borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${Math.round(total.lyR / occDenom / 1000)}k`} /></td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: gapColor(total.gapR), borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${total.gapR >= 0 ? '+' : ''}${Math.round(total.gapR / occDenom / 1000)}k`} /></td>
        </tr>
      </tfoot>
    </table>
  )
}

// ── account 패널 (세그먼트 클릭 시) ─────────────────────────────────────────────
function AccountPanel({
  segName, segColor, source, accounts, rangeLabel,
}: {
  segName:    string
  segColor:   string | null
  source:     'otb' | 'ly' | 'gap'
  accounts:   ReturnType<typeof buildOtbCompareAccounts>
  rangeLabel: string
}) {
  const isGap = source === 'gap'
  const title = source === 'otb' ? '현재 OTB' : source === 'ly' ? '전년 OTB' : 'GAP (증감)'
  const heads = isGap ? ['ΔR/N', 'ΔADR', 'ΔREV'] : ['R/N', 'ADR', 'REV']
  const rowN   = (a: (typeof accounts)[number]) => (source === 'otb' ? a.otbN   : source === 'ly' ? a.lyN   : a.gapN)
  const rowAdr = (a: (typeof accounts)[number]) => (source === 'otb' ? a.otbAdr : source === 'ly' ? a.lyAdr : a.gapAdr)
  const rowR   = (a: (typeof accounts)[number]) => (source === 'otb' ? a.otbR   : source === 'ly' ? a.lyR   : a.gapR)
  const valColor = (v: number) => (isGap ? gapColor(v) : source === 'ly' ? LY_GRAY : (v !== 0 ? '#fff' : 'rgba(255,255,255,0.25)'))
  const fmtN = (v: number) => (isGap ? otbFmt.gapRn(v)  : otbFmt.rn(v))
  const fmtA = (v: number) => (isGap ? otbFmt.gapAdr(v) : otbFmt.adr(v))
  const fmtR = (v: number) => (isGap ? otbFmt.gapRev(v) : otbFmt.rev(v))
  const sorted = [...accounts].sort((a, b) => Math.abs(rowN(b)) - Math.abs(rowN(a)))
  const tN = accounts.reduce((s, a) => s + rowN(a), 0)
  const tR = accounts.reduce((s, a) => s + rowR(a), 0)
  const accHeadTh: React.CSSProperties = { textAlign: 'right', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }

  return (
    <>
      <div style={{ padding: '10px 14px', borderBottom: `0.5px solid ${DIV}`, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: segColor || '#888', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{segName} · {title} · {rangeLabel}</span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sorted.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No data</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `0.5px solid ${DIV}`, position: 'sticky', top: 0, background: '#000000', zIndex: 1 }}>
                <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>ACCOUNT</th>
                {heads.map(h => <th key={h} style={accHeadTh}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {sorted.map(a => (
                <tr key={a.name} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                  <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,0.75)' }}>{a.name}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: valColor(rowN(a)) }}>{fmtN(rowN(a))}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: valColor(rowAdr(a)) }}><FmtVal val={fmtA(rowAdr(a))} numSize={11} /></td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: valColor(rowR(a)) }}><FmtVal val={fmtR(rowR(a))} numSize={11} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ position: 'sticky', bottom: 0, background: '#000000' }}>
                <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.4)' }}>Total</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: valColor(tN), borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtN(tN)}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(0,229,160,0.4)' }}>—</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: valColor(tR), borderTop: '1px solid rgba(0,229,160,0.4)' }}><FmtVal val={fmtR(tR)} numSize={11} /></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────────
export default function OtbComparePage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate, otbDates, setOtbDate } = useDateContext()
  const { data: schema = [] } = useMarketSchema()

  const [isPeriod, setIsPeriod] = useState(true)   // true=동기간(v2) / false=동일자(v1)

  // room_count
  const { data: hotelDetail } = useQuery({
    queryKey: ['m03_hotel_details', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('m03_hotel_details').select('room_count').eq('hotel_id', hotelId).single()
      if (error) throw error
      return data
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
  })
  const roomCount = hotelDetail?.room_count ?? 0

  // LY pacing — 동일자(v1)/동기간(v2) 둘 다 로드 후 토글로 선택 (PickupPage 패턴)
  const { data: lyDayRows = [] }    = useLyPacing('v1')   // 동일자
  const { data: lyPeriodRows = [] } = useLyPacing('v2')   // 동기간
  const lyRows: LyPacingRow[] = isPeriod ? lyPeriodRows : lyDayRows

  // 월 네비 — 기본 OTB 월, 최소 = OTB 월(pacing 시작)
  const otbYear  = otbDate ? parseInt(otbDate.slice(0, 4)) : new Date().getFullYear()
  const otbMonth = otbDate ? parseInt(otbDate.slice(5, 7)) - 1 : new Date().getMonth()
  const [viewYear,  setViewYear]  = useState(otbYear)
  const [viewMonth, setViewMonth] = useState(otbMonth)
  useEffect(() => { setViewYear(otbYear); setViewMonth(otbMonth) }, [otbYear, otbMonth])
  const isMinMonth = viewYear < otbYear || (viewYear === otbYear && viewMonth <= otbMonth)

  const [titleShifting, setTitleShifting] = useState(false)
  const [isAnimating,   setIsAnimating]   = useState(false)
  useEffect(() => {
    setTitleShifting(true)
    const t = setTimeout(() => setTitleShifting(false), 350)
    return () => clearTimeout(t)
  }, [viewMonth, viewYear])

  const handlePrev = () => {
    if (isMinMonth || isAnimating) return
    setIsAnimating(true)
    setTimeout(() => {
      if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1)
      setIsAnimating(false)
    }, 300)
  }
  const handleNext = () => {
    if (isAnimating) return
    setIsAnimating(true)
    setTimeout(() => {
      if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1)
      setIsAnimating(false)
    }, 300)
  }

  // 선택 일자 (차트 클릭) — 월 이동 시 초기화
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  useEffect(() => { setSelectedDate(null) }, [viewYear, viewMonth])

  // 세그먼트 패널 선택 + account 소스(일자별/MTD) — 두 테이블 공유
  const [selSeg, setSelSeg] = useState<{ id: string; source: 'otb' | 'ly' | 'gap' } | null>(null)
  const [accountSource, setAccountSource] = useState<'daily' | 'mtd'>('daily')
  useEffect(() => { setSelSeg(null) }, [isPeriod])

  // 세그먼트 비교 데이터 (선택 일자)
  const dayData = useMemo(() => {
    if (!selectedDate) return null
    return buildOtbCompare(schema, lyRows.filter(r => r.business_date === selectedDate))
  }, [schema, lyRows, selectedDate])

  // MTD 비교 데이터 (OTB 월 1일 ~ 해당 월 말일)
  const [mtdStart, mtdEnd] = useMemo(() => {
    if (!otbDate) return ['', '']
    const [y, m] = otbDate.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()   // 해당 월 말일 (KST 컨벤션)
    const p = (n: number) => String(n).padStart(2, '0')
    return [`${y}-${p(m)}-01`, `${y}-${p(m)}-${p(last)}`]
  }, [otbDate])
  const daysInMonth = mtdEnd ? Number(mtdEnd.slice(8, 10)) : 1   // MTD OCC 분모 일수
  const mtdData = useMemo(() => {
    if (!mtdStart) return null
    return buildOtbCompare(schema, lyRows.filter(r => r.business_date >= mtdStart && r.business_date <= mtdEnd))
  }, [schema, lyRows, mtdStart, mtdEnd])

  // account 패널 — 일자별(선택일) / MTD(1일~말일) 공유
  const codeMap = useMemo(() => codesBySchemaId(schema), [schema])
  const activeData = accountSource === 'daily' ? dayData : mtdData
  const selSegRow = selSeg ? ((activeData ?? mtdData ?? dayData)?.rows.find(r => r.id === selSeg.id) ?? null) : null
  const accounts = useMemo(() => {
    if (!selSeg) return []
    const codes = codeMap[selSeg.id] ?? []
    const rows = accountSource === 'daily'
      ? (selectedDate ? lyRows.filter(r => r.business_date === selectedDate) : [])
      : lyRows.filter(r => r.business_date >= mtdStart && r.business_date <= mtdEnd)
    return buildOtbCompareAccounts(codes, rows)
  }, [selSeg, accountSource, selectedDate, mtdStart, mtdEnd, codeMap, lyRows])

  const selectedLabel = selectedDate
    ? `${Number(selectedDate.slice(5, 7))}월 ${Number(selectedDate.slice(8, 10))}일 (${DOW_KR[new Date(selectedDate).getDay()]})`
    : ''

  return (
    <div>
      {/* 헤더 — 월 네비 통합 타이틀 */}
      <div className="flex items-center justify-between mb-4" style={{ gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={handlePrev}
            style={{
              overflow: 'hidden',
              maxWidth: isMinMonth ? 0 : 60,
              opacity: isMinMonth ? 0 : 1,
              transform: `translateX(${isMinMonth ? -10 : 0}px)`,
              padding: isMinMonth ? '4px 0' : '4px 10px',
              pointerEvents: isMinMonth ? 'none' : 'auto',
              transition: 'max-width 0.35s ease, opacity 0.25s ease, transform 0.35s ease, padding 0.35s ease',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 29, color: '#00E5A0', lineHeight: 1 }}>‹</span>
            <span style={{ fontSize: 11, color: 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>이전</span>
          </button>
          <span style={{
            fontSize: 24, fontWeight: 500, color: '#fff', letterSpacing: '0.04em',
            transition: 'opacity 0.2s ease, transform 0.35s ease',
            opacity: titleShifting ? 0.5 : 1,
            transform: titleShifting ? 'translateX(4px)' : 'translateX(0)',
          }}>
            전년 OTB 비교_
            <span style={{ color: '#00E5A0' }}>
              {String(viewMonth + 1).padStart(2, '0')}월{' '}
              <span style={{ fontSize: '0.7em' }}>{String(viewYear).slice(-2)}년</span>
            </span>
          </span>
          <button
            onClick={handleNext}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 10px', borderRadius: 6,
            }}
          >
            <span style={{ fontSize: 29, color: '#00E5A0', lineHeight: 1 }}>›</span>
            <span style={{ fontSize: 11, color: 'rgba(0,229,160,0.6)', letterSpacing: '0.03em' }}>다음</span>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} availableDates={otbDates ?? []} accent bare fontPx={13} plain />
          </span>
          {/* 동기간 / 동일자 토글 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1a1a1a', borderRadius: 30, padding: '4px 10px', border: '1px solid #2a2a2a' }}>
            <div style={trackStyle(isPeriod, '#a78bfa', '#F59E0B')} onClick={() => setIsPeriod(p => !p)}>
              <div style={thumbStyle(isPeriod)} />
            </div>
            <span style={{ fontSize: 11, color: isPeriod ? '#a78bfa' : '#F59E0B', transition: 'color 0.2s', minWidth: 30 }}>
              {isPeriod ? '동기간' : '동일자'}
            </span>
          </div>
        </div>
      </div>

      {/* 콘텐츠 — 월 이동 슬라이드 애니메이션 (transform idle=none: account 패널 sticky 보존) */}
      <div style={{
        transform: isAnimating ? 'translateX(-40px)' : 'none',
        opacity: isAnimating ? 0 : 1,
        transition: isAnimating ? 'none' : 'transform 0.3s ease, opacity 0.3s ease',
      }}>
      {/* 영역 1 — 일간 OTB 비교 차트 */}
      <div style={{ ...cardStyle, padding: '14px 16px 10px' }}>
        <div style={{ height: 300 }}>
          <OtbCompareChart
            key={`${viewYear}-${viewMonth}`}
            lyRows={lyRows}
            schema={schema}
            roomCount={roomCount}
            year={viewYear}
            month={viewMonth}
            otbDate={otbDate}
            isPeriod={isPeriod}
            selectedDate={selectedDate}
            onSelectDate={(d) => { setSelectedDate(d); setAccountSource('daily') }}
          />
        </div>
        {/* 범례 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 10, background: 'rgba(180,180,180,0.35)', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#888' }}>현재 OTB OCC</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 18, height: 0, borderTop: `2.5px solid ${isPeriod ? 'rgba(167,139,250,0.95)' : 'rgba(245,158,11,0.95)'}` }} />
            <span style={{ fontSize: 11, color: '#888' }}>전년 OTB OCC ({isPeriod ? '동기간' : '동일자'})</span>
          </div>
        </div>
      </div>

      {/* 영역 2 — 세그먼트 비교 (일자별/MTD 전환) + account 패널 */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, ...cardStyle, overflow: 'hidden' }}>
          {/* 헤더: 타이틀 + 일자별/MTD 전환 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${DIV}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              세그먼트 비교
              <span style={{ color: '#5B8DEF', marginLeft: 6, fontWeight: 500 }}>
                {accountSource === 'daily' ? (selectedLabel || '일자 미선택') : 'MTD'}
              </span>
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setAccountSource('daily')} disabled={!selectedDate}
                style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, border: 'none',
                  cursor: selectedDate ? 'pointer' : 'not-allowed',
                  background: accountSource === 'daily' ? '#5B8DEF' : '#1a1a1a',
                  color: accountSource === 'daily' ? '#fff' : '#555',
                  opacity: selectedDate ? 1 : 0.4, transition: 'all 0.15s' }}>
                일자별
              </button>
              <button onClick={() => setAccountSource('mtd')}
                style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, border: 'none', cursor: 'pointer',
                  background: accountSource === 'mtd' ? '#5B8DEF' : '#1a1a1a',
                  color: accountSource === 'mtd' ? '#fff' : '#555', transition: 'all 0.15s' }}>
                MTD
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {activeData ? (
              <SegCompareTable data={activeData} roomCount={roomCount}
                days={accountSource === 'daily' ? 1 : daysInMonth}
                isPeriod={isPeriod}
                selectedId={selSeg?.id ?? null}
                selectedSource={selSeg?.source ?? null}
                onSelect={(id, source) => setSelSeg(prev => (prev?.id === id && prev.source === source ? null : { id, source }))} />
            ) : (
              <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                {accountSource === 'daily' ? '차트에서 날짜를 선택하세요' : 'MTD 데이터 없음'}
              </div>
            )}
          </div>
        </div>

        {/* 우 — account 패널 (항상 표시, 미선택 시 안내) */}
        <div style={{ width: 340, flexShrink: 0, ...cardStyle, position: 'sticky', top: 16, maxHeight: 'calc(100vh - 120px)', minHeight: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selSeg && selSegRow ? (
            <AccountPanel
              segName={selSegRow.name}
              segColor={selSegRow.bgDarkColor}
              source={selSeg.source}
              accounts={accounts}
              rangeLabel={accountSource === 'daily' ? (selectedLabel || '일자 미선택') : 'MTD'}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 200 }}>
              <span style={{ fontSize: 28, opacity: 0.2 }}>👆</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Select a segment</span>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
