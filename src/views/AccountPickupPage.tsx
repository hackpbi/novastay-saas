'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart2, Coins, TrendingUp, Users } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import DatePicker from '@/components/DatePicker'
import { useAccountPickupData, type AccountRow } from '@/hooks/useAccountPickupData'

// ─── 포매터 ──────────────────────────────────────────────────────────────────────
const fmtAdr = (v: number) => `${Math.round(v / 1000)}k`
const fmtRev = (v: number) =>
  v >= 100_000_000 ? `${Math.round(v / 1_000_000)}M` : `${(v / 1_000_000).toFixed(1)}M`

// 색상
const MINT   = '#00B883'
const RED    = '#E24B4A'
const NEU    = 'rgba(255,255,255,0.22)'
const puColor = (v: number) => (v > 0 ? MINT : v < 0 ? RED : NEU)

// 부호 포매터
const sPct = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`)
const sRn  = (v: number) => (v === 0 ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('ko-KR')}`)
const sAdr = (v: number) => (v === 0 ? '—' : `${v > 0 ? '+' : ''}${fmtAdr(v)}`)
const sRev = (v: number) => (v === 0 ? '—' : `${v > 0 ? '+' : ''}${fmtRev(v)}`)

// ─── 행 정규화 (과거월/미래월 공통 형태로) ───────────────────────────────────────
type NormRow = {
  account_name: string
  seg_name:     string
  otbRn:  number
  lyRn:   number
  otbRev: number
  lyRev:  number
  puRn:   number   // 미래월=픽업 R/N, 과거월=gap R/N
  puRev:  number   // 미래월=픽업 REV, 과거월=gap REV
}

function normalize(rows: AccountRow[], isPastMonth: boolean): NormRow[] {
  return rows.map(r => {
    if (isPastMonth) {
      const a = r as any
      return {
        account_name: a.account_name, seg_name: a.seg_name,
        otbRn: a.act_nights ?? 0, lyRn: a.ly_nights ?? 0,
        otbRev: a.act_revenue ?? 0, lyRev: a.ly_revenue ?? 0,
        puRn: a.gap_nights ?? 0, puRev: a.gap_revenue ?? 0,
      }
    }
    const a = r as any
    return {
      account_name: a.account_name, seg_name: a.seg_name,
      // LY 표시는 항상 ly_nights/ly_revenue (vs_*는 픽업 계산 전용)
      otbRn: a.otb_nights ?? 0, lyRn: a.ly_nights ?? 0,
      otbRev: a.otb_revenue ?? 0, lyRev: a.ly_revenue ?? 0,
      puRn: a.pu_nights ?? 0, puRev: a.pu_revenue ?? 0,
    }
  })
}

// ─── 그룹 세로 구분선 (box-shadow inset — 끊김 없음) ─────────────────────────────
const divYoy: React.CSSProperties = { boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.08)', paddingLeft: 8 }
const divOtb: React.CSSProperties = { boxShadow: 'inset 1px 0 0 rgba(0,229,160,0.2)',    paddingLeft: 8 }
const divPu:  React.CSSProperties = { boxShadow: 'inset 1px 0 0 rgba(0,229,160,0.35)',   paddingLeft: 8 }
const divLy:  React.CSSProperties = { boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.1)',  paddingLeft: 8 }
const divGap: React.CSSProperties = { boxShadow: 'inset 1px 0 0 rgba(255,180,50,0.2)',   paddingLeft: 8 }

// ─── YoY% 양방향 바 셀 ───────────────────────────────────────────────────────────
function YoyCell({ yoy, maxYoy }: { yoy: number | null; maxYoy: number }) {
  const pct = yoy !== null ? Math.min(Math.abs(yoy) / maxYoy * 50, 50) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 4, ...divYoy }}>
      {/* 바 영역 */}
      <div style={{ flex: 1, position: 'relative', height: 14, display: 'flex', alignItems: 'center' }}>
        {/* 중앙 기준선 */}
        <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: 14, background: 'rgba(255,255,255,0.12)' }} />
        {/* 양수 바 (우측) */}
        {yoy !== null && yoy > 0 && (
          <div style={{ position: 'absolute', top: 3, left: '50%', width: `${pct}%`, height: 8, borderRadius: 1, background: 'rgba(0,180,130,0.65)' }} />
        )}
        {/* 음수 바 (좌측) */}
        {yoy !== null && yoy < 0 && (
          <div style={{ position: 'absolute', top: 3, right: '50%', width: `${pct}%`, height: 8, borderRadius: 1, background: 'rgba(226,75,74,0.65)' }} />
        )}
      </div>
      {/* 숫자 */}
      <span style={{
        fontSize: 10, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap', minWidth: 44, textAlign: 'right',
        color: yoy === null ? 'rgba(255,255,255,0.22)' : yoy > 0 ? '#00B883' : yoy < 0 ? '#E24B4A' : 'rgba(255,255,255,0.22)',
      }}>
        {yoy === null ? '—' : yoy === 0 ? '0.0%' : `${yoy > 0 ? '+' : ''}${yoy.toFixed(1)}%`}
      </span>
    </div>
  )
}

// ─── 페이지 ──────────────────────────────────────────────────────────────────────
export default function AccountPickupPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()

  // vs 날짜 — 없으면 OTB 전일 (KST-safe)
  const vsDate = useMemo(() => {
    if (vsOtbDate) return vsOtbDate
    if (!otbDate) return ''
    const d = new Date(otbDate + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [vsOtbDate, otbDate])

  // 월 네비게이션 (1-based)
  const now = new Date()
  const otbBase = otbDate ? new Date(otbDate + 'T00:00:00') : now
  const [curYear, setCurYear]   = useState(otbBase.getFullYear())
  const [curMonth, setCurMonth] = useState(otbBase.getMonth() + 1)   // 1-based
  useEffect(() => {
    const b = otbDate ? new Date(otbDate + 'T00:00:00') : new Date()
    setCurYear(b.getFullYear()); setCurMonth(b.getMonth() + 1)
  }, [otbDate])

  const handlePrevMonth = () => {
    if (curMonth === 1) { setCurYear(y => y - 1); setCurMonth(12) }
    else setCurMonth(m => m - 1)
  }
  const handleNextMonth = () => {
    if (curMonth === 12) { setCurYear(y => y + 1); setCurMonth(1) }
    else setCurMonth(m => m + 1)
  }

  // isPastMonth — otbDate(최신 update_date) 기준
  const otbYear  = otbBase.getFullYear()
  const otbMonth = otbBase.getMonth() + 1
  const isPastMonth = curYear < otbYear || (curYear === otbYear && curMonth < otbMonth)

  const [segFilter] = useState<string | null>(null)  // null | 'fit' | 'group' (현재 UI 토글 없음)
  const [activeSeg, setActiveSeg] = useState('전체')
  const [showing, setShowing] = useState(15)

  const { data: rawRows = [], isLoading } = useAccountPickupData({
    hotelId, otbDate, vsDate, year: curYear, month: curMonth, segFilter, isPastMonth,
  })

  // 월 변경 시 표시 개수 리셋
  useEffect(() => { setShowing(15); setActiveSeg('전체') }, [curYear, curMonth, isPastMonth])

  const allRows = useMemo(() => normalize(rawRows, isPastMonth), [rawRows, isPastMonth])

  // 세그 탭 (seg_name 기준)
  const segNames = useMemo(
    () => ['전체', ...Array.from(new Set(allRows.map(r => r.seg_name).filter(Boolean)))],
    [allRows],
  )

  // 세그 필터 적용 후 정렬 (OTB R/N 내림차순)
  const rows = useMemo(() => {
    const f = activeSeg === '전체' ? allRows : allRows.filter(r => r.seg_name === activeSeg)
    return [...f].sort((a, b) => b.otbRn - a.otbRn)
  }, [allRows, activeSeg])

  // YoY 바 정규화 — LY 있는 항목 중 최대 절대 YoY값 기준
  const maxYoy = useMemo(() => Math.max(
    ...rows.filter(r => r.lyRn > 0).map(r => Math.abs((r.otbRn - r.lyRn) / r.lyRn * 100)),
    1,
  ), [rows])

  // ─── 합산 ──────────────────────────────────────────────────────────────────────
  const totalOtbRn  = rows.reduce((s, r) => s + r.otbRn, 0)
  const totalLyRn   = rows.reduce((s, r) => s + r.lyRn, 0)
  const totalOtbRev = rows.reduce((s, r) => s + r.otbRev, 0)
  const totalLyRev  = rows.reduce((s, r) => s + r.lyRev, 0)
  const totalPuRn   = rows.reduce((s, r) => s + r.puRn, 0)
  const totalPuRev  = rows.reduce((s, r) => s + r.puRev, 0)

  const totalOtbAdr = totalOtbRn > 0 ? Math.round(totalOtbRev / totalOtbRn) : 0
  const totalLyAdr  = totalLyRn  > 0 ? Math.round(totalLyRev  / totalLyRn)  : 0
  const totalPuAdr  = totalOtbAdr - totalLyAdr

  const activeAccounts = rows.filter(r => r.otbRn > 0).length
  const yoyRnPct  = totalLyRn  > 0 ? (totalOtbRn  - totalLyRn)  / totalLyRn  * 100 : null
  const yoyRevPct = totalLyRev > 0 ? (totalOtbRev - totalLyRev) / totalLyRev * 100 : null
  const yoyAdrPct = totalLyAdr > 0 ? (totalOtbAdr - totalLyAdr) / totalLyAdr * 100 : null

  const visible = rows.slice(0, showing)
  const remaining = Math.max(0, rows.length - showing)

  // ─── 스타일 ──────────────────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10,
    padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
  }
  const cardLabel: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }
  const cardBig: React.CSSProperties = { fontSize: 24, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1 }
  const cardUnit: React.CSSProperties = { fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 400, marginLeft: 3 }
  const cardSub: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 'auto' }
  const dash = isLoading ? '—' : null

  // 그리드 컬럼 정의 (14컬럼)
  // ACCT(1fr) | YoY바 | OTB R/N | OTB ADR | OTB REV | PU R/N | PU ADR | PU REV | LY R/N | LY ADR | LY REV | GAP R/N | GAP ADR | GAP REV
  const GRID = 'minmax(176px,1fr) 150px 70px 64px 68px 57px 57px 68px 64px 57px 68px 57px 57px 68px'

  // 헤더 셀
  const h1: React.CSSProperties = { fontSize: 9, fontWeight: 500, letterSpacing: '0.04em', textAlign: 'center', padding: '4px 0 2px' }
  const h2: React.CSSProperties = { fontSize: 9, fontWeight: 500, textAlign: 'right', padding: '2px 8px 5px' }
  const td: React.CSSProperties = { fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)' }}>Account Pick-up</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex' }}>
            <DatePicker label={isPastMonth ? 'ACT' : 'OTB'} value={otbDate} onChange={setOtbDate} availableDates={otbDates ?? []} accent bare fontPx={11} plain />
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>vs</span>
          <span style={{ display: 'inline-flex' }}>
            <DatePicker label="LY" value={vsOtbDate} onChange={setVsOtbDate} availableDates={(otbDates ?? []).filter(d => d < otbDate)} accent bare fontPx={11} plain />
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            · Account-level {isPastMonth ? 'Actual vs LY' : 'OTB vs LY'}
          </span>
        </div>
      </div>

      {/* 월 네비 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={handlePrevMonth} aria-label="이전 달" style={{ width: 24, height: 24, borderRadius: '50%', border: '0.5px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 68, textAlign: 'center' }}>{curYear}년 {curMonth}월</span>
        <button onClick={handleNextMonth} aria-label="다음 달" style={{ width: 24, height: 24, borderRadius: '50%', border: '0.5px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
      </div>

      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
        {/* 1 — Active Accounts */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <span style={cardLabel}>Active Accounts</span>
            <Users size={20} style={{ opacity: 0.3, color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          </div>
          <div style={cardBig}>{dash ?? activeAccounts}<span style={cardUnit}>accounts</span></div>
          <div style={cardSub}>{isPastMonth ? 'Actual 기준' : 'OTB 기준'}</div>
        </div>
        {/* 2 — OTB R/N */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <span style={cardLabel}>{isPastMonth ? 'ACT' : 'OTB'} R/N</span>
            <BarChart2 size={20} style={{ opacity: 0.3, color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          </div>
          <div style={cardBig}>{dash ?? totalOtbRn.toLocaleString('ko-KR')}<span style={cardUnit}>R/N</span></div>
          <div style={cardSub}>
            {totalPuRn !== 0 && <span style={{ color: puColor(totalPuRn) }}>{sRn(totalPuRn)} {isPastMonth ? 'GAP' : 'PU'}</span>}
            {totalPuRn !== 0 && yoyRnPct !== null && <span> · </span>}
            {yoyRnPct !== null && <span style={{ color: puColor(yoyRnPct) }}>{sPct(yoyRnPct)} yoy</span>}
          </div>
        </div>
        {/* 3 — OTB ADR */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <span style={cardLabel}>{isPastMonth ? 'ACT' : 'OTB'} ADR</span>
            <Coins size={20} style={{ opacity: 0.3, color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          </div>
          <div style={cardBig}>{dash ?? fmtAdr(totalOtbAdr)}<span style={cardUnit}>KRW</span></div>
          <div style={cardSub}>
            {yoyAdrPct !== null ? <span style={{ color: puColor(yoyAdrPct) }}>{sPct(yoyAdrPct)} yoy</span> : '—'}
          </div>
        </div>
        {/* 4 — OTB Revenue */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <span style={cardLabel}>{isPastMonth ? 'ACT' : 'OTB'} Revenue</span>
            <TrendingUp size={20} style={{ opacity: 0.3, color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          </div>
          <div style={cardBig}>{dash ?? fmtRev(totalOtbRev)}<span style={cardUnit}>KRW</span></div>
          <div style={cardSub}>
            {totalPuRev !== 0 && <span style={{ color: puColor(totalPuRev) }}>{totalPuRev > 0 ? '+' : ''}{fmtRev(totalPuRev)} {isPastMonth ? 'GAP' : 'PU'}</span>}
            {totalPuRev !== 0 && yoyRevPct !== null && <span> · </span>}
            {yoyRevPct !== null && <span style={{ color: puColor(yoyRevPct) }}>{sPct(yoyRevPct)} yoy</span>}
          </div>
        </div>
      </div>

      {/* 세그 탭 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {segNames.map(seg => {
          const on = activeSeg === seg
          return (
            <button key={seg} onClick={() => { setActiveSeg(seg); setShowing(15) }}
              style={{
                fontSize: 11, fontWeight: 500, padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                border: on ? '0.5px solid #00E5A0' : '0.5px solid var(--color-border-default)',
                background: on ? 'rgba(0,229,160,0.08)' : 'transparent',
                color: on ? '#00B883' : 'var(--color-text-secondary)',
              }}>
              {seg}
            </button>
          )
        })}
      </div>

      {/* 메인 테이블 */}
      {isLoading ? (
        <div className="animate-pulse" style={{ height: 360, background: 'var(--color-bg-tertiary)', borderRadius: 10 }} />
      ) : rows.length === 0 ? (
        <div style={{ background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10, padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
          해당 조건의 어카운트별 픽업 데이터가 없습니다.
        </div>
      ) : (
        <div style={{ background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ width: '100%' }}>
              {/* 1단 그룹 헤더 */}
              <div style={{ display: 'grid', gridTemplateColumns: GRID }}>
                <div />
                <div style={{ ...h1, ...divYoy, textAlign: 'left', color: 'rgba(255,180,50,0.5)', letterSpacing: '0.06em', borderBottom: '0.5px solid rgba(255,180,50,0.15)', paddingBottom: 3 }}>YoY%</div>
                <div style={{ ...h1, ...divOtb, gridColumn: 'span 3', color: 'rgba(0,229,160,0.55)', borderBottom: '0.5px solid rgba(0,229,160,0.15)', paddingBottom: 3 }}>{isPastMonth ? 'ACTUAL' : 'OTB'}</div>
                <div style={{ ...h1, ...divPu,  gridColumn: 'span 3', color: 'rgba(0,229,160,0.9)',  borderBottom: '0.5px solid rgba(0,229,160,0.35)', paddingBottom: 3 }}>{isPastMonth ? 'GAP(PU)' : 'PICKUP'}</div>
                <div style={{ ...h1, ...divLy,  gridColumn: 'span 3', color: 'rgba(255,255,255,0.3)', borderBottom: '0.5px solid rgba(255,255,255,0.1)', paddingBottom: 3 }}>LY</div>
                <div style={{ ...h1, ...divGap, gridColumn: 'span 3', color: 'rgba(255,180,50,0.7)',  borderBottom: '0.5px solid rgba(255,180,50,0.2)', paddingBottom: 3 }}>GAP</div>
              </div>
              {/* 2단 컬럼 헤더 */}
              <div style={{ display: 'grid', gridTemplateColumns: GRID, borderBottom: '0.5px solid var(--color-border-subtle)' }}>
                <div style={{ ...h2, textAlign: 'left', color: 'var(--color-text-tertiary)' }}>ACCOUNT</div>
                <div style={{ ...h2, ...divYoy, textAlign: 'right', color: 'rgba(255,180,50,0.45)' }}>vs LY</div>
                <div style={{ ...h2, ...divOtb, color: 'rgba(0,229,160,0.55)' }}>R/N</div>
                <div style={{ ...h2, color: 'rgba(0,229,160,0.55)' }}>ADR</div>
                <div style={{ ...h2, color: 'rgba(0,229,160,0.55)' }}>REV</div>
                <div style={{ ...h2, ...divPu, color: 'rgba(0,229,160,0.6)' }}>R/N</div>
                <div style={{ ...h2, color: 'rgba(0,229,160,0.6)' }}>ADR</div>
                <div style={{ ...h2, color: 'rgba(0,229,160,0.6)' }}>REV</div>
                <div style={{ ...h2, ...divLy, color: 'rgba(255,255,255,0.3)' }}>R/N</div>
                <div style={{ ...h2, color: 'rgba(255,255,255,0.3)' }}>ADR</div>
                <div style={{ ...h2, color: 'rgba(255,255,255,0.3)' }}>REV</div>
                <div style={{ ...h2, ...divGap, color: 'rgba(255,180,50,0.7)' }}>R/N</div>
                <div style={{ ...h2, color: 'rgba(255,180,50,0.7)' }}>ADR</div>
                <div style={{ ...h2, color: 'rgba(255,180,50,0.7)' }}>REV</div>
              </div>

              {/* 행 */}
              {visible.map((r, i) => {
                const otbAdr = r.otbRn > 0 ? Math.round(r.otbRev / r.otbRn) : 0
                const lyAdr  = r.lyRn  > 0 ? Math.round(r.lyRev  / r.lyRn)  : 0
                const puAdr  = otbAdr - lyAdr
                const gapRn  = r.otbRn - r.lyRn
                const gapAdr = otbAdr - lyAdr
                const gapRev = r.otbRev - r.lyRev
                const yoy    = r.lyRn > 0 ? (r.otbRn - r.lyRn) / r.lyRn * 100 : null
                return (
                  <div key={r.account_name + i}
                    style={{ display: 'grid', gridTemplateColumns: GRID, height: 30, borderBottom: '0.5px solid var(--color-border-subtle)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {/* ACCOUNT — 말줄임 + 브라우저 기본 title 툴팁 */}
                    <div style={{ ...td, justifyContent: 'flex-start', textAlign: 'left', fontWeight: 500, color: '#fff', overflow: 'hidden', minWidth: 0, cursor: 'default' }}>
                      <span title={r.account_name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{r.account_name}</span>
                    </div>
                    {/* YoY% 양방향 바 */}
                    <YoyCell yoy={yoy} maxYoy={maxYoy} />
                    {/* OTB R/N (숫자만) / ADR / REV */}
                    <div style={{ ...td, ...divOtb, color: '#fff' }}>{r.otbRn.toLocaleString('ko-KR')}</div>
                    <div style={td}>{fmtAdr(otbAdr)}</div>
                    <div style={td}>{fmtRev(r.otbRev)}</div>
                    {/* PICKUP R/N / ADR / REV */}
                    <div style={{ ...td, ...divPu, color: r.puRn > 0 ? '#00E5A0' : puColor(r.puRn), fontWeight: r.puRn > 0 ? 500 : 400 }}>{sRn(r.puRn)}</div>
                    <div style={{ ...td, color: puColor(puAdr) }}>{sAdr(puAdr)}</div>
                    <div style={{ ...td, color: puColor(r.puRev) }}>{sRev(r.puRev)}</div>
                    {/* LY R/N / ADR / REV */}
                    <div style={{ ...td, ...divLy, color: 'rgba(255,255,255,0.55)' }}>{r.lyRn > 0 ? r.lyRn.toLocaleString('ko-KR') : '—'}</div>
                    <div style={{ ...td, color: 'rgba(255,255,255,0.55)' }}>{r.lyRn > 0 ? fmtAdr(lyAdr) : '—'}</div>
                    <div style={{ ...td, color: 'rgba(255,255,255,0.55)' }}>{r.lyRev > 0 ? fmtRev(r.lyRev) : '—'}</div>
                    {/* GAP R/N / ADR / REV */}
                    <div style={{ ...td, ...divGap, color: puColor(gapRn) }}>{sRn(gapRn)}</div>
                    <div style={{ ...td, color: puColor(gapAdr) }}>{sAdr(gapAdr)}</div>
                    <div style={{ ...td, color: puColor(gapRev) }}>{sRev(gapRev)}</div>
                  </div>
                )
              })}

              {/* Total 행 */}
              <div style={{ display: 'grid', gridTemplateColumns: GRID, height: 32, borderTop: '0.5px solid rgba(0,229,160,0.15)', background: 'rgba(0,229,160,0.03)' }}>
                <div style={{ ...td, justifyContent: 'flex-start', textAlign: 'left', fontWeight: 500, color: '#00E5A0' }}>Total</div>
                <div style={{ ...td, ...divYoy, color: puColor(yoyRnPct ?? 0), fontWeight: 500 }}>{sPct(yoyRnPct)}</div>
                {/* OTB */}
                <div style={{ ...td, ...divOtb, color: '#fff', fontWeight: 500 }}>{totalOtbRn.toLocaleString('ko-KR')}</div>
                <div style={{ ...td, fontWeight: 500 }}>{fmtAdr(totalOtbAdr)}</div>
                <div style={{ ...td, fontWeight: 500 }}>{fmtRev(totalOtbRev)}</div>
                {/* PICKUP */}
                <div style={{ ...td, ...divPu, color: totalPuRn > 0 ? '#00E5A0' : puColor(totalPuRn), fontWeight: 500 }}>{sRn(totalPuRn)}</div>
                <div style={{ ...td, color: puColor(totalPuAdr), fontWeight: 500 }}>{sAdr(totalPuAdr)}</div>
                <div style={{ ...td, color: puColor(totalPuRev), fontWeight: 500 }}>{sRev(totalPuRev)}</div>
                {/* LY */}
                <div style={{ ...td, ...divLy, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{totalLyRn > 0 ? totalLyRn.toLocaleString('ko-KR') : '—'}</div>
                <div style={{ ...td, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{totalLyRn > 0 ? fmtAdr(totalLyAdr) : '—'}</div>
                <div style={{ ...td, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{totalLyRev > 0 ? fmtRev(totalLyRev) : '—'}</div>
                {/* GAP */}
                <div style={{ ...td, ...divGap, color: puColor(totalOtbRn - totalLyRn), fontWeight: 500 }}>{sRn(totalOtbRn - totalLyRn)}</div>
                <div style={{ ...td, color: puColor(totalOtbAdr - totalLyAdr), fontWeight: 500 }}>{sAdr(totalOtbAdr - totalLyAdr)}</div>
                <div style={{ ...td, color: puColor(totalOtbRev - totalLyRev), fontWeight: 500 }}>{sRev(totalOtbRev - totalLyRev)}</div>
              </div>
            </div>
          </div>

          {/* 더보기 */}
          {remaining > 0 && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '11px 14px' }}>
              {/* 가로선 */}
              <div style={{ position: 'absolute', left: 14, right: 14, top: '50%', height: '0.5px', background: 'rgba(255,255,255,0.08)' }} />
              {/* 버튼 */}
              <button
                onClick={() => setShowing(s => s + 10)}
                style={{
                  position: 'relative', zIndex: 1,
                  background: '#111418',
                  border: '0.5px solid rgba(255,255,255,0.12)',
                  borderRadius: 20, color: 'rgba(255,255,255,0.4)',
                  fontSize: 11, padding: '4px 14px', cursor: 'pointer',
                }}
              >
                더보기 ({remaining})
              </button>
            </div>
          )}

          {/* 범례 — YoY 바 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px', borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>
              <div style={{ width: 16, height: 7, borderRadius: 1, background: 'rgba(0,180,130,0.65)' }} />
              YoY+ (성장)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>
              <div style={{ width: 16, height: 7, borderRadius: 1, background: 'rgba(226,75,74,0.65)' }} />
              YoY− (역성장)
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>
              {isPastMonth ? 'ACT' : 'OTB'} R/N 기준 정렬
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
