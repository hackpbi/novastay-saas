'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import Chart from 'chart.js/auto'
import { supabase } from '@/lib/supabase'
import DatePicker from '@/components/DatePicker'
import type { LyPacingRow } from '@/hooks/useLyPacing'
import type { ForecastMonthlyRow } from '@/hooks/useForecastMonthly'
import type { BudgetMonthlyRow } from '@/hooks/useBudgetMonthly'
import { FmtVal } from '@/utils/FmtVal'

interface GMDailyReportModalProps {
  open:    boolean
  onClose: () => void
  hotelId: string
  otbDate: string   // 'YYYY-MM-DD'
  otbDates?: string[]   // get_otb_dates RPC 결과, update_date 목록 (DatePicker availableDates)
  lyData?:    LyPacingRow[]   // DashboardPage useLyPacing 결과 재활용 (섹션 D)
  lyLoading?: boolean
  forecastRows?: ForecastMonthlyRow[]   // DashboardPage useForecastMonthly 결과 재활용 (섹션 D)
  budgetRows?:   BudgetMonthlyRow[]     // DashboardPage useBudgetMonthly 결과 재활용 (섹션 D)
}

// 다크/라이트 무관 — 리포트는 항상 라이트 고정 색상
const C = {
  pageBg:       '#ffffff',
  cardBg:       '#f5f5f3',
  border:       '#e1e0d9',
  borderStrong: '#c8c7c0',
  textPrimary:  '#0b0b0b',
  textSecondary:'#4a4a48',
  textMuted:    '#898781',
  overlay:      'rgba(0,0,0,0.75)',
  mint:         '#1d9e75',
  mintBadgeBg:  '#e1f5ee',
  mintBadgeFg:  '#0f6e56',
  red:          '#a32d2d',
  redBadgeBg:   '#fcebeb',
  redBadgeFg:   '#a32d2d',
  blue:         '#2a78d6',
  blueFriSat:   '#3987e5',
  amber:        '#eda100',
  gray:         '#888780',
} as const

// ── 더미 데이터 ────────────────────────────────────────────────────────────────
const DUMMY_3M_PICKUP = [
  {
    month: '7월', label: '7월 (이번 달)',
    occ: '+1.8%p', rn: '+7실', adr: '+2천원', rev: '+82백만',
    occDir: 'up', rnDir: 'up', adrDir: 'up', revDir: 'up',
    segs: [{ name: 'FIT', val: '+5', dir: 'up' }, { name: '법인', val: '+2', dir: 'up' }, { name: 'GRP', val: '±0', dir: 'neu' }],
  },
  {
    month: '8월', label: '8월',
    occ: '+0.6%p', rn: '+3실', adr: '+2천원', rev: '+38백만',
    occDir: 'up', rnDir: 'up', adrDir: 'up', revDir: 'up',
    segs: [{ name: 'FIT', val: '+3', dir: 'up' }, { name: '법인', val: '±0', dir: 'neu' }, { name: 'GRP', val: '±0', dir: 'neu' }],
  },
  {
    month: '9월', label: '9월',
    occ: '-0.4%p', rn: '-2실', adr: '±0', rev: '-30백만',
    occDir: 'dn', rnDir: 'dn', adrDir: 'neu', revDir: 'dn',
    segs: [{ name: 'FIT', val: '±0', dir: 'neu' }, { name: '법인', val: '±0', dir: 'neu' }, { name: 'GRP', val: '-2', dir: 'dn' }],
  },
]

interface AcctRow { name: string; bar: number; barNeg?: boolean; m7: string; m8: string; m9: string; sum: string; sumDir: string }
interface SegBlock { seg: string; total: string; totalDir: string; accounts: AcctRow[] }
const DUMMY_ACCOUNTS: SegBlock[] = [
  {
    seg: 'FIT', total: '+8실', totalDir: 'up',
    accounts: [
      { name: '하나투어', bar: 75, m7: '+3', m8: '+2', m9: '±0', sum: '+5', sumDir: 'up' },
      { name: '모두투어', bar: 30, m7: '+1', m8: '+1', m9: '±0', sum: '+2', sumDir: 'up' },
      { name: '롯데관광', bar: 20, m7: '+1', m8: '±0', m9: '±0', sum: '+1', sumDir: 'up' },
      { name: '인터파크', bar: 15, m7: '±0', m8: '+1', m9: '±0', sum: '+1', sumDir: 'up' },
      { name: '온라인투어', bar: 15, barNeg: true, m7: '±0', m8: '±0', m9: '-1', sum: '-1', sumDir: 'dn' },
    ],
  },
  {
    seg: '법인', total: '+2실', totalDir: 'up',
    accounts: [
      { name: '삼성전자', bar: 60, m7: '+2', m8: '+1', m9: '±0', sum: '+3', sumDir: 'up' },
      { name: '현대건설', bar: 20, m7: '+1', m8: '±0', m9: '±0', sum: '+1', sumDir: 'up' },
      { name: 'LG전자', bar: 15, barNeg: true, m7: '±0', m8: '±0', m9: '-1', sum: '-1', sumDir: 'dn' },
      { name: 'SK하이닉스', bar: 15, barNeg: true, m7: '-1', m8: '±0', m9: '±0', sum: '-1', sumDir: 'dn' },
    ],
  },
  {
    seg: 'GRP', total: '-2실', totalDir: 'dn',
    accounts: [
      { name: '현대자동차', bar: 45, barNeg: true, m7: '±0', m8: '±0', m9: '-2', sum: '-2', sumDir: 'dn' },
    ],
  },
  {
    seg: 'OTA', total: '+3실', totalDir: 'up',
    accounts: [
      { name: '야놀자', bar: 50, m7: '+2', m8: '±0', m9: '+1', sum: '+3', sumDir: 'up' },
      { name: '여기어때', bar: 15, barNeg: true, m7: '-1', m8: '±0', m9: '±0', sum: '-1', sumDir: 'dn' },
    ],
  },
]

const DUMMY_EVENTS = [
  { date: '7/4', day: '금', name: '지역 문화축제', occ: 88.4, occColor: '#2a78d6', pickup: '+12실', pickupDir: 'up', lyOcc: '82.1%' },
  { date: '7/5', day: '토', name: '지역 문화축제 2일차', occ: 92.1, occColor: '#2a78d6', pickup: '+8실', pickupDir: 'up', lyOcc: '88.3%' },
  { date: '8/15', day: '금', name: '광복절', occ: 71.2, occColor: '#eda100', pickup: '+1실', pickupDir: 'neu', lyOcc: '89.4%' },
  { date: '9/6', day: '토', name: '추석 연휴', occ: 42.1, occColor: '#888780', pickup: '-5실', pickupDir: 'dn', lyOcc: '38.2%' },
  { date: '9/20', day: '토', name: '마라톤 대회', occ: 55.3, occColor: '#e24b4a', pickup: '±0실', pickupDir: 'neu', lyOcc: '91.2%' },
]

interface MonthOtb {
  month: string; isTotal?: boolean
  otbOcc: string; otbAdr: string; otbRev: string
  lyOcc: string; lyAdr: string; lyRev: string; lyOccDir: string; lyAdrDir: string; lyRevDir: string
  budOcc: string; budAdr: string; budRev: string
  budOccDiff: string; budAdrDiff: string; budRevDiff: string; budOccDir: string; budAdrDir: string; budRevDir: string
}
const DUMMY_MONTHLY_OTB: MonthOtb[] = [
  {
    month: '7월',
    otbOcc: '74.6%', otbAdr: '165', otbRev: '276',
    lyOcc: 'LY +2.8%p', lyAdr: 'LY +6.1%', lyRev: 'LY +4.3%', lyOccDir: 'up', lyAdrDir: 'up', lyRevDir: 'up',
    budOcc: '70.5%', budAdr: '160', budRev: '255',
    budOccDiff: '대비 +4.1%p', budAdrDiff: '대비 +3.2%', budRevDiff: '대비 +8.2%', budOccDir: 'up', budAdrDir: 'up', budRevDir: 'up',
  },
  {
    month: '8월',
    otbOcc: '61.2%', otbAdr: '158', otbRev: '217',
    lyOcc: 'LY +1.2%p', lyAdr: 'LY +3.4%', lyRev: 'LY +2.1%', lyOccDir: 'up', lyAdrDir: 'up', lyRevDir: 'up',
    budOcc: '59.4%', budAdr: '162', budRev: '212',
    budOccDiff: '대비 +1.8%p', budAdrDiff: '대비 -1.2%', budRevDiff: '대비 +2.4%', budOccDir: 'up', budAdrDir: 'dn', budRevDir: 'up',
  },
  {
    month: '9월',
    otbOcc: '48.3%', otbAdr: '152', otbRev: '165',
    lyOcc: 'LY -0.5%p', lyAdr: 'LY ±0%', lyRev: 'LY -1.8%', lyOccDir: 'dn', lyAdrDir: 'neu', lyRevDir: 'dn',
    budOcc: '51.5%', budAdr: '155', budRev: '175',
    budOccDiff: '대비 -3.2%p', budAdrDiff: '대비 -2.1%', budRevDiff: '대비 -5.4%', budOccDir: 'dn', budAdrDir: 'dn', budRevDir: 'dn',
  },
  {
    month: '합계', isTotal: true,
    otbOcc: '61.4%', otbAdr: '159', otbRev: '658',
    lyOcc: 'LY +1.2%p', lyAdr: 'LY +3.2%', lyRev: 'LY +1.9%', lyOccDir: 'up', lyAdrDir: 'up', lyRevDir: 'up',
    budOcc: '60.5%', budAdr: '159', budRev: '642',
    budOccDiff: '대비 +0.9%p', budAdrDiff: '대비 ±0%', budRevDiff: '대비 +1.7%', budOccDir: 'up', budAdrDir: 'neu', budRevDir: 'up',
  },
]


// ── 색상 헬퍼 ──────────────────────────────────────────────────────────────────
const dirColor = (dir: string) => {
  if (dir === 'up') return C.mint
  if (dir === 'dn') return C.red
  return C.textMuted
}
const badgeStyle = (dir: string): React.CSSProperties => {
  if (dir === 'up') return { background: C.mintBadgeBg, color: C.mintBadgeFg, fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 500, whiteSpace: 'nowrap' }
  if (dir === 'dn') return { background: C.redBadgeBg, color: C.redBadgeFg, fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 500, whiteSpace: 'nowrap' }
  return { background: C.cardBg, color: C.textSecondary, fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 500, whiteSpace: 'nowrap', border: `0.5px solid ${C.border}` }
}
// 어카운트 행 월별(볼드 없음) / 합계열·합계행(볼드) 색상
const accColor = (n: number): React.CSSProperties => ({ color: n > 0 ? C.textPrimary : n < 0 ? C.red : C.textMuted, fontWeight: 400 })
const sumColor = (n: number): React.CSSProperties => ({ color: n > 0 ? C.mint : n < 0 ? C.red : C.textMuted, fontWeight: 500 })


// 'YYYY-MM-DD' → 하루 전 'YYYY-MM-DD' (KST 로컬)
const getYesterday = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// 'YYYY-MM-DD' → 정확히 1년 전 같은 날짜 (전년동일자용, yoy_match 미사용)
const oneYearBefore = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y - 1, m - 1, d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// otbDates 목록 중 기준일 바로 이전(update_date) 날짜
function getPrevOtbDate(otbDates: string[], currentOtbDate: string): string {
  const sorted = [...otbDates].sort()   // 오름차순
  const idx = sorted.indexOf(currentOtbDate)
  if (idx > 0) return sorted[idx - 1]
  const prev = sorted.filter(d => d < currentOtbDate)
  return prev.length > 0 ? prev[prev.length - 1] : ''
}

// LY 대비 배지 포맷
type LyBadge = { text: string; dir: 'up' | 'dn' | 'neu' }
const fmtLyOcc = (diff: number | null): LyBadge => {
  if (diff === null) return { text: '-', dir: 'neu' }
  return { text: `전년비 ${diff > 0 ? '+' : ''}${diff}%p`, dir: diff > 0 ? 'up' : diff < 0 ? 'dn' : 'neu' }
}
const fmtLyNum = (diff: number | null, unit: string): LyBadge => {
  if (diff === null) return { text: '-', dir: 'neu' }
  return { text: `전년비 ${diff > 0 ? '+' : ''}${diff.toLocaleString()}${unit}`, dir: diff > 0 ? 'up' : diff < 0 ? 'dn' : 'neu' }
}

// ── 3개월 Pick-up (섹션 A/B) ──
const getThreeMonths = (dateStr: string): { year: number; month: number }[] => {
  const [y, m] = dateStr.split('-').map(Number)
  return [0, 1, 2].map(i => {
    const d = new Date(y, m - 1 + i, 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
}
const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)
const dir3 = (n: number): 'up' | 'dn' | 'neu' => (n > 0 ? 'up' : n < 0 ? 'dn' : 'neu')
const segLabel = (r: any): string => (r.sorting2 === 'fit' ? 'FIT' : r.sorting2 === 'group' ? 'GRP' : r.segmentation)

interface AccountRow { seg: string; sort2: string; account: string; m0: number; m1: number; m2: number; total: number }

const calcMonthSummary = (rows: any[], roomCount: number, year: number, month: number) => {
  const sumF = (k: string) => rows.reduce((s: number, r: any) => s + (r[k] ?? 0), 0)
  const otbRn = sumF('otb_nights'), vsRn = sumF('vs_nights')
  const otbRev = sumF('otb_revenue'), vsRev = sumF('vs_revenue')
  const puRn = sumF('pu_nights'), puRev = sumF('pu_revenue')
  const avail = roomCount * new Date(year, month, 0).getDate()
  const otbOcc = avail > 0 ? Math.round((otbRn / avail) * 1000) / 10 : 0
  const vsOcc  = avail > 0 ? Math.round((vsRn  / avail) * 1000) / 10 : 0
  const otbAdrWon = otbRn > 0 ? otbRev / otbRn : 0   // raw 원
  const vsAdrWon  = vsRn  > 0 ? vsRev  / vsRn  : 0   // raw 원
  const segMap: Record<string, number> = {}
  rows.forEach((r: any) => { const seg = segLabel(r); segMap[seg] = (segMap[seg] ?? 0) + (r.pu_nights ?? 0) })
  return { puOcc: Math.round((otbOcc - vsOcc) * 10) / 10, puRn, puAdrWon: otbAdrWon - vsAdrWon, puRevWon: puRev, segMap }
}

// 세그 칩 — segmentation 소분류별 pu_nights (seg_name 표시, 0 제외, order_index 오름차순)
const buildSegChips = (rows: any[], orderMap: Record<string, number>): { seg: string; name: string; pu: number }[] => {
  const map: Record<string, { name: string; pu: number }> = {}
  rows.forEach((r: any) => {
    const key = r.segmentation
    if (!key) return
    if (!map[key]) map[key] = { name: r.seg_name ?? r.segmentation, pu: 0 }
    map[key].pu += r.pu_nights ?? 0
  })
  return Object.entries(map)
    .filter(([, v]) => v.pu !== 0)
    .sort((a, b) => (orderMap[a[0]] ?? 999) - (orderMap[b[0]] ?? 999))
    .map(([seg, { name, pu }]) => ({ seg, name, pu }))
}

const buildAccountRows = (m0: any[], m1: any[], m2: any[]): AccountRow[] => {
  const map = new Map<string, AccountRow>()
  const add = (rows: any[], key: 'm0' | 'm1' | 'm2') => {
    rows.forEach((r: any) => {
      const k = `${r.segmentation}__${r.account_name}`
      if (!map.has(k)) map.set(k, { seg: r.seg_name ?? r.segmentation, sort2: r.sorting2 ?? '', account: r.account_name, m0: 0, m1: 0, m2: 0, total: 0 })
      map.get(k)![key] += r.pu_nights ?? 0
    })
  }
  add(m0, 'm0'); add(m1, 'm1'); add(m2, 'm2')
  map.forEach(row => { row.total = row.m0 + row.m1 + row.m2 })
  const filtered = Array.from(map.values()).filter(r => r.m0 !== 0 || r.m1 !== 0 || r.m2 !== 0)
  // 세그 순서: sorting2 fit → group → 그외, 동일 그룹 내 seg_name 알파벳순, 그 다음 절대값 큰 순
  const rank = (s: string) => (s === 'fit' ? 0 : s === 'group' ? 1 : 2)
  filtered.sort((a, b) => {
    const ra = rank(a.sort2), rb = rank(b.sort2)
    if (ra !== rb) return ra - rb
    if (a.seg !== b.seg) return a.seg.localeCompare(b.seg)
    return Math.abs(b.total) - Math.abs(a.total)
  })
  return filtered
}

// ── 섹션 C — 이벤트 일정 (타입·헬퍼·카드 렌더; 데이터는 컴포넌트에서 DB fetch) ──
interface EventDate { date: string; day: string; otbOcc: number | null; occColor: string; barRate: number | null; adr: number | null; puNights: number | null; lyOcc: number | null }
interface EventGroup { name: string; isHoliday: boolean; dates: EventDate[] }

const eventOccColor = (otbOcc: number | null, lyOcc: number | null): string => {
  if (otbOcc === null) return C.textMuted
  if (lyOcc !== null && otbOcc >= lyOcc) return '#2a78d6'   // LY 이상 → 파랑
  if (otbOcc >= 80) return '#2a78d6'
  if (otbOcc >= 60) return '#eda100'
  return '#e24b4a'
}
const extractGroupName = (event: string): string => { const m = event.match(/\(([^)]+)\)/); return m ? m[1].trim() : '' }
const mmdd = (date: string): string => { const [, m, d] = date.split('-'); return `${parseInt(m)}/${parseInt(d)}` }
const isFriSat = (day: string) => day === '금' || day === '토'
const periodLabel = (dates: EventDate[]): string =>
  dates.length === 1 ? `${mmdd(dates[0].date)} ${dates[0].day}` : `${mmdd(dates[0].date)} ~ ${mmdd(dates[dates.length - 1].date)}`
const puColor = (n: number | null) => (n == null ? C.textMuted : n > 0 ? C.mint : n < 0 ? C.red : C.textMuted)
const puText = (n: number | null) => (n == null ? '-' : n > 0 ? `+${n}실` : n < 0 ? `${n}실` : '±0실')
const holidayBadge: React.CSSProperties = { fontSize: 9, background: '#faeeda', color: '#854f0b', padding: '1px 5px', borderRadius: 3, marginLeft: 4, fontWeight: 500 }

const renderEventCard = (ev: EventGroup, fmtAdr: (won: number) => string, adrUnit: '원' | '천원') => {
  const evTh: React.CSSProperties = { fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '0 4px 5px 0', borderBottom: `0.5px solid ${C.border}` }
  const moneyFs = adrUnit === '원' ? 8 : 10   // 원 단위 넘침 방지
  return (
    <div key={ev.name} style={{ background: C.cardBg, borderRadius: 8, padding: '8px 14px', breakInside: 'avoid', marginBottom: 8 }}>
      {/* 헤더 — 이벤트명 + 공휴일 배지 */}
      <div style={{ marginBottom: 4, paddingBottom: 4, borderBottom: `0.5px solid ${C.border}` }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: C.textPrimary }}>{ev.name}</span>
        {ev.isHoliday && <span style={{ fontSize: 8, background: '#faeeda', color: '#854f0b', padding: '1px 4px', borderRadius: 3, marginLeft: 3, fontWeight: 500 }}>공휴일</span>}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '42px' }} />
          <col style={{ width: '90px' }} />
          <col style={{ width: '42px' }} />
          <col style={{ width: '42px' }} />
          <col style={{ width: '44px' }} />
          <col style={{ width: '72px' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...evTh, textAlign: 'left' }}>일자</th>
            <th style={{ ...evTh, textAlign: 'left' }}>점유율</th>
            <th style={{ ...evTh, textAlign: 'right' }}>객단가</th>
            <th style={{ ...evTh, textAlign: 'right' }}>BAR</th>
            <th style={{ ...evTh, textAlign: 'right' }}>픽업</th>
            <th style={{ ...evTh, textAlign: 'right', paddingRight: 0, whiteSpace: 'nowrap' }}>전년 점유율</th>
          </tr>
        </thead>
        <tbody>
          {ev.dates.map((d, i) => (
            <tr key={d.date} style={{ borderBottom: i < ev.dates.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
              <td style={{ padding: '2px 4px 2px 0' }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: C.textPrimary }}>{mmdd(d.date)}</span>
                <span style={{ fontSize: 8, marginLeft: 2, color: isFriSat(d.day) ? '#e24b4a' : C.textMuted }}>{d.day}</span>
              </td>
              <td style={{ padding: '2px 4px 2px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ width: `${Math.min(d.otbOcc ?? 0, 100)}%`, height: '100%', background: d.occColor, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 500, color: d.occColor }}>{d.otbOcc !== null ? `${d.otbOcc}%` : '-'}</span>
                </div>
              </td>
              <td style={{ padding: '2px 4px 2px 0', textAlign: 'right' }}>
                <span style={{ fontSize: moneyFs, color: C.textSecondary, whiteSpace: 'nowrap' }}>{d.adr !== null ? <FmtVal val={fmtAdr(d.adr)} numSize={moneyFs} /> : '-'}</span>
              </td>
              <td style={{ padding: '2px 4px 2px 0', textAlign: 'right' }}>
                <span style={{ fontSize: moneyFs, fontWeight: 500, color: C.textPrimary, whiteSpace: 'nowrap' }}>{d.barRate !== null ? <FmtVal val={fmtAdr(d.barRate)} numSize={moneyFs} /> : '-'}</span>
              </td>
              <td style={{ padding: '2px 4px 2px 0', textAlign: 'right' }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: puColor(d.puNights) }}>{puText(d.puNights)}</span>
              </td>
              <td style={{ padding: '2px 0', textAlign: 'right' }}>
                <span style={{ fontSize: 10, color: C.textSecondary }}>{d.lyOcc !== null ? `${d.lyOcc}%` : '-'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 소형 표현 컴포넌트 ──────────────────────────────────────────────────────────
function KpiMini({ label, value, dir }: { label: string; value: string; dir: string }) {
  const len = (value ?? '').length
  const numSize = len > 9 ? 9 : len > 6 ? 11 : 13
  return (
    <div style={{ padding: '5px 4px', textAlign: 'center', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: numSize, fontWeight: 500, color: dirColor(dir), whiteSpace: 'nowrap' }}>
        <FmtVal val={value} numSize={numSize} />
      </div>
    </div>
  )
}

const TXT = C.textPrimary
const TXT2 = C.textSecondary
const TXT3 = C.textMuted
const BORDER = C.border
const BG_ELEV = C.cardBg

// ── 3페이지 OCC & BAR Rate 차트 (D+0 ~ D+44, 15일 × 3) ──
interface Page3Day { date: string; dateLabel: string; day: string; isFriSat: boolean; occ: number; adr: number; barRate: number | null; occColor: string }

const getPage3Days = (dateStr: string): string[][] => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const allDays = Array.from({ length: 45 }, (_, i) => {
    const dt = new Date(y, m - 1, d + i)
    return dt.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
  })
  return [allDays.slice(0, 15), allDays.slice(15, 30), allDays.slice(30, 45)]
}

// Canvas 플러그인 — OCC% 상단 라벨 + BAR Rate 칩(막대 중앙)
const makeOccBarPlugin = (fmtBar: (won: number) => string) => ({
  id: 'occBarPlugin',
  afterDatasetsDraw(chart: any) {
    const { ctx, data, scales } = chart
    const meta = chart.getDatasetMeta(0)
    const yBar = scales['yBar']
    meta.data.forEach((bar: any, i: number) => {
      const occ     = data.datasets[0].data[i]
      const barRate = data.datasets[1]?.data[i]
      if (occ === null || occ === undefined) return
      // OCC% 라벨
      ctx.save()
      ctx.font = 'bold 8px -apple-system, sans-serif'
      ctx.fillStyle = occ >= 80 ? '#1a5fa8' : occ >= 60 ? '#c87800' : '#c0392b'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(Math.round(occ) + '%', bar.x, bar.y - 2)
      ctx.restore()
      // BAR Rate 칩 — yBar 축 기준 실제 값 위치에 표시
      if (barRate && yBar) {
        const chipW = 28, chipH = 12
        const chipX = bar.x - chipW / 2
        const chipCenterY = yBar.getPixelForValue(barRate)
        const chipY = chipCenterY - chipH / 2
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.beginPath()
        ctx.roundRect(chipX, chipY, chipW, chipH, 2)
        ctx.fill()
        ctx.font = '6.5px -apple-system, sans-serif'
        ctx.fillStyle = '#4a4a48'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(fmtBar(barRate), bar.x, chipCenterY)
        ctx.restore()
      }
    })
  },
})

const createPage3Chart = (
  canvas: HTMLCanvasElement | null,
  kpiRows: Page3Day[],
  chartRef: React.MutableRefObject<Chart | null>,
  fmtBar: (won: number) => string,
) => {
  if (!canvas) return
  chartRef.current?.destroy()
  chartRef.current = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: kpiRows.map(d => d.dateLabel),   // 날짜만 (요일은 ticks.callback에서 2줄 처리)
      datasets: [
        { label: '점유율', data: kpiRows.map(d => d.occ), backgroundColor: kpiRows.map(d => d.occColor), barPercentage: 0.8, categoryPercentage: 0.9 },
        { type: 'line', label: 'BAR Rate', data: kpiRows.map(d => d.barRate) as any, yAxisID: 'yBar', borderColor: 'transparent', backgroundColor: 'transparent', pointRadius: 0, borderWidth: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index', intersect: false,
          callbacks: {
            label: (ctx: any) => {
              if (ctx.datasetIndex === 0) return ` OCC: ${ctx.raw}%`
              if (ctx.datasetIndex === 1 && ctx.raw) return ` BAR: ${fmtBar(ctx.raw)}`
              return undefined
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { align: 'center', textStrokeWidth: 0, font: { size: 8 }, maxRotation: 0, callback: (_v: any, index: number) => { const d = kpiRows[index]; return [d.dateLabel, d.day] }, color: (ctx: any) => { const dy = kpiRows[ctx.index]?.day; return (dy === '금' || dy === '토') ? '#e24b4a' : '#898781' } }, border: { display: false } },
        y: { min: 0, max: 100, position: 'left', grid: { color: '#e1e0d9', lineWidth: 0.5 }, ticks: { font: { size: 8 }, color: '#898781', stepSize: 25, callback: (v: any) => v + '%' }, border: { display: false } },
        yBar: { type: 'linear', position: 'right', min: 0, max: 500000, grid: { display: false }, ticks: { display: false }, border: { display: false } },
      },
      layout: { padding: { top: 16 } },
    },
    plugins: [makeOccBarPlugin(fmtBar)],
  })
}

export default function GMDailyReportModal({ open, onClose, hotelId, otbDate, otbDates = [], lyData: lyPacingData, lyLoading, forecastRows, budgetRows }: GMDailyReportModalProps) {
  const [compact, setCompact] = useState(false)   // false=전체, true=압축(세그별 Top3 + 기타)

  // ── 단위 설정 (대시보드 MonthCard/모달 컨벤션 동일) ──
  const [showUnitSetting, setShowUnitSetting] = useState(false)
  const [adrUnit, setAdrUnit] = useState<'원' | '천원'>('천원')
  const [revUnit, setRevUnit] = useState<'원' | '천원' | '백만원'>('백만원')
  const [lyMode, setLyMode] = useState<'match' | 'date'>('match')   // 전년대비 기준: match=전년동기간(yoy_match) / date=전년동일자(-1년)
  // 단위 설정 패널 외부 클릭 시 닫기
  useEffect(() => {
    if (!showUnitSetting) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.unit-setting-wrap')) setShowUnitSetting(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showUnitSetting])

  // ── 단위 포맷 헬퍼 (raw 원 값 → 선택 단위, 소수점 없이 콤마). 훅보다 앞에 정의(차트 useEffect에서 사용) ──
  const fmtAdr = (won: number) => (adrUnit === '원' ? Math.round(won) : Math.round(won / 1000)).toLocaleString('ko-KR')
  const fmtRev = (won: number) => (revUnit === '원' ? Math.round(won) : revUnit === '천원' ? Math.round(won / 1000) : Math.round(won / 1_000_000)).toLocaleString('ko-KR')
  const sAdr = (won: number) => (won === 0 ? '±0' : (won > 0 ? '+' : '') + fmtAdr(won))
  const sRev = (won: number) => (won === 0 ? '±0' : (won > 0 ? '+' : '') + fmtRev(won))

  // ── 기준일/vs 로컬 관리 (모달 내부 DatePicker로 독립 변경) ──
  const [localOtbDate, setLocalOtbDate] = useState(otbDate)
  const [localVsDate, setLocalVsDate]   = useState(() => getPrevOtbDate(otbDates, otbDate))
  useEffect(() => {
    if (open) {
      setLocalOtbDate(otbDate)
      setLocalVsDate(getPrevOtbDate(otbDates, otbDate))
    }
  }, [open, otbDate, otbDates])

  // ── 어제 날짜(KST) + 월 분기 ──
  const yesterday   = localOtbDate ? getYesterday(localOtbDate) : ''
  const isSameMonth = localOtbDate.slice(0, 7) === yesterday.slice(0, 7)
  const threeMonths = getThreeMonths(localOtbDate || '2000-01-01')   // 당월 포함 3개월

  // ── MTD 기간 (당월 1일 ~ 전일) ──
  const [mtdY, mtdM] = (localOtbDate || '2000-01-01').split('-').map(Number)
  const mtdStart = `${mtdY}-${String(mtdM).padStart(2, '0')}-01`
  const mtdEnd   = yesterday   // 기존 yesterday 재사용

  // room_count (m03_hotel_details)
  const { data: hotelDetail } = useQuery({
    queryKey: ['gm_m03_hotel_details', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('m03_hotel_details').select('room_count').eq('hotel_id', hotelId).single()
      if (error) throw error
      return data
    },
    enabled: open && !!hotelId,
    staleTime: 10 * 60 * 1000,
  })
  const roomCount = hotelDetail?.room_count ?? 0

  // ── MTD 실적 (a02_otb_daily: 당월 1일 ~ 전일, update_date=business_date 당일 스냅샷) ──
  const { data: mtdOtbData } = useQuery({
    queryKey: ['gm_mtd_otb', hotelId, mtdStart, mtdEnd],
    queryFn: async () => {
      if (!mtdStart || !mtdEnd || mtdStart > mtdEnd) return []
      // business_date/update_date 모두 MTD 범위로 제한 후, 프론트에서 update_date === business_date(당일 스냅샷)만 사용
      const { data, error } = await (supabase as any)
        .from('a02_otb_daily')
        .select('business_date, update_date, nights, room_revenue')
        .eq('hotel_id', hotelId)
        .gte('business_date', mtdStart)
        .lte('business_date', mtdEnd)
        .gte('update_date', mtdStart)
        .lte('update_date', mtdEnd)
      if (error) { console.error('[GMReport] mtd otb error:', error); return [] }
      return (data ?? []).filter((r: any) => r.update_date === r.business_date)
    },
    enabled: open && !!hotelId && !!mtdStart && !!mtdEnd && mtdStart <= mtdEnd,
    staleTime: 5 * 60 * 1000,
  })

  const mtdKpi = useMemo(() => {
    // ── DEBUG ──
    console.log('[GMReport MTD] mtdStart=', mtdStart, 'mtdEnd=', mtdEnd,
      'rows=', mtdOtbData?.length ?? 'undefined', 'roomCount=', roomCount, mtdOtbData)

    if (!mtdOtbData?.length) return null

    const totalRn  = mtdOtbData.reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
    const totalRev = mtdOtbData.reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0)

    // 기간 일수 × roomCount
    const [sy, sm, sd] = mtdStart.split('-').map(Number)
    const [ey, em, ed] = mtdEnd.split('-').map(Number)
    const days = Math.round((new Date(ey, em - 1, ed).getTime() - new Date(sy, sm - 1, sd).getTime()) / 86400000) + 1
    const totalAvail = days * roomCount

    const occ = totalAvail > 0 ? Math.round((totalRn / totalAvail) * 1000) / 10 : 0
    const adrWon = totalRn > 0 ? totalRev / totalRn : 0   // raw 원
    const revWon = totalRev                               // raw 원

    const periodLabel = `${sm}/${sd}~${em}/${ed}`

    // ── DEBUG ──
    console.log('[GMReport MTD] computed →', { totalRn, totalRev, days, totalAvail, occ, adrWon, revWon, periodLabel })

    return { occ, adrWon, revWon, periodLabel }
  }, [mtdOtbData, mtdStart, mtdEnd, roomCount])

  // 어제 실적 — 같은 달: a02_otb_daily(update_date=otbDate), 다른 달(매월1일): a01_actual_daily
  const { data: yesterdayData = [], isLoading: yesterdayLoading } = useQuery({
    queryKey: ['gm_yesterday', hotelId, localOtbDate, yesterday, isSameMonth],
    queryFn: async () => {
      if (isSameMonth) {
        const { data, error } = await (supabase as any)
          .from('a02_otb_daily').select('nights, room_revenue')
          .eq('hotel_id', hotelId).eq('update_date', localOtbDate).eq('business_date', yesterday)
        if (error) { console.error('[GMReport] yesterday(otb) error:', error); return [] }
        return data ?? []
      }
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily').select('nights, room_revenue')
        .eq('hotel_id', hotelId).eq('business_date', yesterday)
      if (error) { console.error('[GMReport] yesterday(actual) error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && !!localOtbDate && roomCount > 0,
    staleTime: 5 * 60 * 1000,
  })

  // LY 매핑 날짜 (c06_calendar.yoy_match)
  const { data: calendarData } = useQuery({
    queryKey: ['gm_c06_yoy', yesterday],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c06_calendar').select('yoy_match').eq('date', yesterday).single()
      if (error) throw error
      return data
    },
    enabled: open && !!yesterday,
    staleTime: 60 * 60 * 1000,
  })
  const lyDate: string | null = lyMode === 'date'
    ? (yesterday ? oneYearBefore(yesterday) : null)
    : (calendarData?.yoy_match ?? null)

  // LY 실적 (a01_actual_daily, yoy_match 날짜)
  const { data: lyData = [] } = useQuery({
    queryKey: ['gm_yesterday_ly', hotelId, lyDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily').select('nights, room_revenue')
        .eq('hotel_id', hotelId).eq('business_date', lyDate)
      if (error) { console.error('[GMReport] LY error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && !!lyDate,
    staleTime: 5 * 60 * 1000,
  })

  // 3개월 Pick-up (get_account_pickup_data × 3) — 섹션 A/B 공유. p_vs_date=어제(픽업=otb-vs)
  const mkPickupFn = (year: number, month: number) => async () => {
    const { data, error } = await (supabase as any).rpc('get_account_pickup_data', {
      p_hotel_id: hotelId, p_otb_date: localOtbDate, p_vs_date: localVsDate, p_year: year, p_month: month, p_segmentation: null,
    })
    if (error) { console.error('[GMReport] get_account_pickup_data error:', error); return [] }
    return data ?? []
  }
  const pickupEnabled = open && !!hotelId && !!localOtbDate && !!localVsDate
  const pickupQ0 = useQuery({ queryKey: ['gm_pickup_month', hotelId, localOtbDate, localVsDate, threeMonths[0].year, threeMonths[0].month], queryFn: mkPickupFn(threeMonths[0].year, threeMonths[0].month), enabled: pickupEnabled, staleTime: 5 * 60 * 1000 })
  const pickupQ1 = useQuery({ queryKey: ['gm_pickup_month', hotelId, localOtbDate, localVsDate, threeMonths[1].year, threeMonths[1].month], queryFn: mkPickupFn(threeMonths[1].year, threeMonths[1].month), enabled: pickupEnabled, staleTime: 5 * 60 * 1000 })
  const pickupQ2 = useQuery({ queryKey: ['gm_pickup_month', hotelId, localOtbDate, localVsDate, threeMonths[2].year, threeMonths[2].month], queryFn: mkPickupFn(threeMonths[2].year, threeMonths[2].month), enabled: pickupEnabled, staleTime: 5 * 60 * 1000 })

  // c05_market_table_schema — order_index (세그 정렬용). 실제 컬럼: segmentation(배열)·name·order_index
  const { data: schemaData } = useQuery({
    queryKey: ['gm_c05_schema', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c05_market_table_schema').select('segmentation, name, order_index')
        .eq('hotel_id', hotelId).order('order_index', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!hotelId,
    staleTime: 10 * 60 * 1000,
  })
  // segmentation 코드 / 세그명 → order_index (양쪽 키로 조회 가능)
  const segOrderMap = useMemo(() => {
    const map: Record<string, number> = {}
    ;(schemaData ?? []).forEach((r: any) => {
      const oi = r.order_index ?? 999
      if (r.name) map[r.name] = oi
      if (Array.isArray(r.segmentation)) r.segmentation.forEach((code: string) => { if (code) map[code] = oi })
    })
    return map
  }, [schemaData])

  const yesterdayKpi = useMemo(() => {
    const sum = (rows: any[]) => ({
      rn:  Array.isArray(rows) ? rows.reduce((s: number, r: any) => s + (r.nights ?? 0), 0) : 0,
      rev: Array.isArray(rows) ? rows.reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0) : 0,
    })
    // 당일
    const hasCur = Array.isArray(yesterdayData) && yesterdayData.length > 0 && roomCount > 0
    const c = sum(yesterdayData)
    const occ    = hasCur ? Math.round((c.rn / roomCount) * 1000) / 10 : null
    const rn     = hasCur ? c.rn : null
    const adrWon    = hasCur ? (c.rn > 0 ? c.rev / c.rn : 0) : null   // raw 원
    const revWon    = hasCur ? c.rev : null                           // raw 원
    const revparWon = hasCur ? c.rev / roomCount : null               // raw 원
    // LY (없으면 전부 null → 배지 미표시)
    const hasLy = Array.isArray(lyData) && lyData.length > 0 && roomCount > 0
    const l = sum(lyData)
    const lyOcc       = hasLy ? Math.round((l.rn / roomCount) * 1000) / 10 : null
    const lyAdrWon    = hasLy && l.rn > 0 ? l.rev / l.rn : null
    const lyRevWon    = hasLy && l.rev > 0 ? l.rev : null
    const lyRevparWon = hasLy ? l.rev / roomCount : null
    // 대비 (raw 원 차이)
    const diffOcc       = (lyOcc !== null && occ !== null)             ? Math.round((occ - lyOcc) * 10) / 10 : null
    const diffAdrWon    = (lyAdrWon !== null && adrWon !== null)       ? adrWon - lyAdrWon : null
    const diffRevWon    = (lyRevWon !== null && revWon !== null)       ? revWon - lyRevWon : null
    const diffRevparWon = (lyRevparWon !== null && revparWon !== null) ? revparWon - lyRevparWon : null
    return { occ, rn, adrWon, revWon, revparWon, diffOcc, diffAdrWon, diffRevWon, diffRevparWon }
  }, [yesterdayData, lyData, roomCount])

  // ── 컴팩트 바 — 당일 OTB/vs/LY (어제 실적은 기존 yesterdayKpi 재사용) ──
  // 당일 OTB (update_date=localOtbDate, business_date=localOtbDate)
  const { data: todayOtbData } = useQuery({
    queryKey: ['gm_today_otb', hotelId, localOtbDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a02_otb_daily').select('nights, room_revenue')
        .eq('hotel_id', hotelId).eq('update_date', localOtbDate).eq('business_date', localOtbDate)
      if (error) { console.error('[GMReport] today otb error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && !!localOtbDate,
    staleTime: 5 * 60 * 1000,
  })

  // 당일 vs OTB (update_date=localVsDate, business_date=localOtbDate)
  const { data: todayVsData } = useQuery({
    queryKey: ['gm_today_vs', hotelId, localVsDate, localOtbDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a02_otb_daily').select('nights')
        .eq('hotel_id', hotelId).eq('update_date', localVsDate).eq('business_date', localOtbDate)
      if (error) { console.error('[GMReport] today vs error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && !!localVsDate && !!localOtbDate,
    staleTime: 5 * 60 * 1000,
  })

  // 당일 yoy_match (c06_calendar, date=localOtbDate)
  const { data: todayCalendar } = useQuery({
    queryKey: ['gm_today_yoy', localOtbDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c06_calendar').select('yoy_match').eq('date', localOtbDate).single()
      if (error) { console.error('[GMReport] today yoy error:', error); return null }
      return data
    },
    enabled: open && !!localOtbDate,
    staleTime: 60 * 60 * 1000,
  })
  const todayYoyMatch: string | null = lyMode === 'date'
    ? (localOtbDate ? oneYearBefore(localOtbDate) : null)
    : (todayCalendar?.yoy_match ?? null)

  // 당일 LY (a01_actual_daily, business_date=yoy_match)
  const { data: todayLyData } = useQuery({
    queryKey: ['gm_today_ly', hotelId, todayYoyMatch],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily').select('nights, room_revenue')
        .eq('hotel_id', hotelId).eq('business_date', todayYoyMatch)
      if (error) { console.error('[GMReport] today ly error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && !!todayYoyMatch,
    staleTime: 10 * 60 * 1000,
  })

  const todayKpi = useMemo(() => {
    const otbRn  = (todayOtbData ?? []).reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
    const otbRev = (todayOtbData ?? []).reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0)
    const vsRn   = (todayVsData ?? []).reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
    const lyRn   = (todayLyData ?? []).reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
    const lyRev  = (todayLyData ?? []).reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0)

    const occ       = roomCount > 0 ? Math.round((otbRn / roomCount) * 1000) / 10 : 0
    const adrWon    = otbRn > 0 ? otbRev / otbRn : 0   // raw 원
    const revWon    = otbRev                           // raw 원
    const remaining = roomCount - otbRn
    const pu        = otbRn - vsRn

    const lyOcc    = roomCount > 0 && lyRn > 0 ? Math.round((lyRn / roomCount) * 1000) / 10 : null
    const lyAdrWon = lyRn > 0 ? lyRev / lyRn : null
    const lyRevWon = lyRev > 0 ? lyRev : null

    const diffOcc    = lyOcc !== null ? Math.round((occ - lyOcc) * 10) / 10 : null
    const diffAdrWon = lyAdrWon !== null ? adrWon - lyAdrWon : null
    const diffRevWon = lyRevWon !== null ? revWon - lyRevWon : null

    return { occ, rn: otbRn, adrWon, revWon, remaining, pu, diffOcc, diffAdrWon, diffRevWon }
  }, [todayOtbData, todayVsData, todayLyData, roomCount])

  // ── OTB 차트 (컴팩트 바 아래) ──
  // 월요일이면 직전 금요일(D-3)부터 10일, 그 외 오늘(D+0)부터 7일
  const getChartDays = (dateStr: string): string[] => {
    const [gy, gm, gd] = dateStr.split('-').map(Number)
    const dow = new Date(gy, gm - 1, gd).getDay()   // 0=일 ... 6=토
    const startOffset = dow === 1 ? -3 : 0
    const totalDays   = dow === 1 ? 10 : 7
    const start = new Date(gy, gm - 1, gd + startOffset)
    return Array.from({ length: totalDays }, (_, i) => {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      return day.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
    })
  }
  const chartDays = localOtbDate ? getChartDays(localOtbDate) : []

  // 과거 + 다른 달 날짜 = actual(a01_actual_daily) 사용, 그 외 = OTB(a02) 사용
  const [otbY, otbM] = (localOtbDate || '2000-01-01').split('-').map(Number)
  const actualDates: string[] = chartDays.filter(date => {
    const [dy, dm] = date.split('-').map(Number)
    return date < localOtbDate && (dy !== otbY || dm !== otbM)
  })

  // OTB (a02_otb_daily) — 7일 OCC/ADR
  const { data: chartOtbData } = useQuery({
    queryKey: ['gm_chart_otb', hotelId, localOtbDate, chartDays],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a02_otb_daily').select('business_date, nights, room_revenue')
        .eq('hotel_id', hotelId).eq('update_date', localOtbDate).in('business_date', chartDays)
      if (error) { console.error('[GMReport] chart otb error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && !!localOtbDate && chartDays.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // 캘린더 (c06_calendar) — 요일 + yoy_match
  const { data: chartCalData } = useQuery({
    queryKey: ['gm_chart_cal', chartDays],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c06_calendar').select('date, day, yoy_match').in('date', chartDays)
      if (error) { console.error('[GMReport] chart cal error:', error); return [] }
      return data ?? []
    },
    enabled: open && chartDays.length > 0,
    staleTime: 60 * 60 * 1000,
  })
  const chartLyDateMap: Record<string, string> = {}
  chartDays.forEach(date => {
    if (lyMode === 'date') {
      chartLyDateMap[date] = oneYearBefore(date)
    } else {
      const cal = (chartCalData ?? []).find((r: any) => r.date === date)
      if (cal?.yoy_match) chartLyDateMap[date] = cal.yoy_match
    }
  })
  const chartLyDates: string[] = Object.values(chartLyDateMap)

  // LY OCC (a01_actual_daily, yoy_match)
  const { data: chartLyData } = useQuery({
    queryKey: ['gm_chart_ly', hotelId, chartLyDates],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily').select('business_date, nights')
        .eq('hotel_id', hotelId).in('business_date', chartLyDates)
      if (error) { console.error('[GMReport] chart ly error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && chartLyDates.length > 0,
    staleTime: 10 * 60 * 1000,
  })

  // BAR Rate (s02_rate_detail) — change > single > base
  const { data: chartBarData } = useQuery({
    queryKey: ['gm_chart_bar', hotelId, chartDays],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s02_rate_detail').select('stay_date, date_type, new_rate')
        .eq('hotel_id', hotelId).in('stay_date', chartDays)
        .in('date_type', ['change', 'single', 'base'])
      if (error) { console.error('[GMReport] chart bar error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && chartDays.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Actual (a01_actual_daily) — 과거 다른 달 날짜의 실제 OCC/ADR
  const { data: chartActualData } = useQuery({
    queryKey: ['gm_chart_actual', hotelId, actualDates],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily').select('business_date, nights, room_revenue')
        .eq('hotel_id', hotelId).in('business_date', actualDates)
      if (error) { console.error('[GMReport] chart actual error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && actualDates.length > 0,
    staleTime: 10 * 60 * 1000,
  })

  const chartKpi = useMemo(() => {
    const calMap: Record<string, { day: string; yoy_match: string | null }> = {}
    ;(chartCalData ?? []).forEach((r: any) => { calMap[r.date] = { day: r.day, yoy_match: r.yoy_match } })
    const lyMap: Record<string, number> = {}
    ;(chartLyData ?? []).forEach((r: any) => { lyMap[r.business_date] = (lyMap[r.business_date] ?? 0) + (r.nights ?? 0) })
    const barPriority: Record<string, number> = { change: 3, single: 2, base: 1 }
    const barMap: Record<string, number> = {}
    const barPrio: Record<string, number> = {}
    ;(chartBarData ?? []).forEach((r: any) => {
      const p = barPriority[r.date_type] ?? 0
      if (!barMap[r.stay_date] || p > barPrio[r.stay_date]) { barMap[r.stay_date] = r.new_rate; barPrio[r.stay_date] = p }
    })
    return chartDays.map(date => {
      const [dy, dm] = date.split('-').map(Number)
      const isPast   = date < localOtbDate
      const isActual = isPast && (dy !== otbY || dm !== otbM)   // 과거 다른 달 → actual
      const srcRows  = isActual
        ? (chartActualData ?? []).filter((r: any) => r.business_date === date)
        : (chartOtbData    ?? []).filter((r: any) => r.business_date === date)
      const otbRn   = srcRows.reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
      const otbRev  = srcRows.reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0)
      const otbOcc  = roomCount > 0 ? Math.round((otbRn / roomCount) * 1000) / 10 : 0
      const adrWon  = otbRn > 0 ? otbRev / otbRn : 0   // raw 원
      const cal     = calMap[date]
      const lyKey   = chartLyDateMap[date]
      const lyRn    = lyKey ? (lyMap[lyKey] ?? 0) : 0
      const lyOcc   = roomCount > 0 && lyRn > 0 ? Math.round((lyRn / roomCount) * 1000) / 10 : null
      const barRateWon = barMap[date] ? barMap[date] : null   // raw 원
      const occColor = otbOcc >= 80 ? '#2a78d6' : otbOcc >= 60 ? '#eda100' : '#e24b4a'
      const [, mm, dd] = date.split('-')
      const dateLabel = `${parseInt(mm)}/${parseInt(dd)}`
      const day       = cal?.day ?? ''
      const isFriSat  = day === '금' || day === '토'
      const isToday   = date === localOtbDate
      return { date, dateLabel, day, isFriSat, isToday, isPast, isActual, otbOcc, adrWon, barRateWon, lyOcc, occColor }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartDays, chartOtbData, chartActualData, chartCalData, chartLyData, chartBarData, roomCount, localOtbDate, otbY, otbM, chartLyDateMap])

  // ── 3페이지 — OCC & BAR Rate 차트 (D+0 ~ D+44, 15일 × 3) ──
  const chart1Ref  = useRef<HTMLCanvasElement>(null)
  const chart2Ref  = useRef<HTMLCanvasElement>(null)
  const chart3Ref  = useRef<HTMLCanvasElement>(null)
  const chartInst1 = useRef<Chart | null>(null)
  const chartInst2 = useRef<Chart | null>(null)
  const chartInst3 = useRef<Chart | null>(null)

  const page3DayGroups = localOtbDate ? getPage3Days(localOtbDate) : [[], [], []]
  const page3AllDays   = page3DayGroups.flat()

  // OTB (a02_otb_daily)
  const { data: page3OtbData } = useQuery({
    queryKey: ['gm_page3_otb', hotelId, localOtbDate, page3AllDays],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a02_otb_daily').select('business_date, nights, room_revenue')
        .eq('hotel_id', hotelId).eq('update_date', localOtbDate).in('business_date', page3AllDays)
      if (error) { console.error('[GMReport] page3 otb error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && !!localOtbDate && page3AllDays.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // 캘린더 (c06_calendar) — 요일
  const { data: page3CalData } = useQuery({
    queryKey: ['gm_page3_cal', page3AllDays],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c06_calendar').select('date, day').in('date', page3AllDays)
      if (error) { console.error('[GMReport] page3 cal error:', error); return [] }
      return data ?? []
    },
    enabled: open && page3AllDays.length > 0,
    staleTime: 60 * 60 * 1000,
  })

  // BAR Rate (s02_rate_detail) — change > single > base
  const { data: page3BarData } = useQuery({
    queryKey: ['gm_page3_bar', hotelId, page3AllDays],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s02_rate_detail').select('stay_date, date_type, new_rate')
        .eq('hotel_id', hotelId).in('stay_date', page3AllDays)
        .in('date_type', ['change', 'single', 'base'])
      if (error) { console.error('[GMReport] page3 bar error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && page3AllDays.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  const page3Kpi = useMemo(() => {
    const calMap: Record<string, string> = {}
    ;(page3CalData ?? []).forEach((r: any) => { calMap[r.date] = r.day })
    const barPriority: Record<string, number> = { change: 3, single: 2, base: 1 }
    const barMap: Record<string, number> = {}
    const barPrio: Record<string, number> = {}
    ;(page3BarData ?? []).forEach((r: any) => {
      const p = barPriority[r.date_type] ?? 0
      if (!barMap[r.stay_date] || p > barPrio[r.stay_date]) { barMap[r.stay_date] = r.new_rate; barPrio[r.stay_date] = p }
    })
    return page3DayGroups.map(days => days.map((date): Page3Day => {
      const otbRows = (page3OtbData ?? []).filter((r: any) => r.business_date === date)
      const otbRn   = otbRows.reduce((s: number, r: any) => s + (r.nights ?? 0), 0)
      const otbRev  = otbRows.reduce((s: number, r: any) => s + (r.room_revenue ?? 0), 0)
      const occ     = roomCount > 0 ? Math.round((otbRn / roomCount) * 1000) / 10 : 0
      const adr     = otbRn > 0 ? Math.round(otbRev / otbRn / 1000) : 0
      const barRate = barMap[date] ?? null
      const day     = calMap[date] ?? ''
      const isFriSat = day === '금' || day === '토'
      const [, mm, dd] = date.split('-')
      const dateLabel = `${parseInt(mm)}/${parseInt(dd)}`
      const occColor = occ >= 80 ? '#2a78d6' : occ >= 60 ? '#eda100' : '#e24b4a'
      return { date, dateLabel, day, isFriSat, occ, adr, barRate, occColor }
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page3OtbData, page3BarData, page3CalData, roomCount, localOtbDate])

  // 3페이지 차트 생성/파괴
  useEffect(() => {
    if (!open) return
    createPage3Chart(chart1Ref.current, page3Kpi[0] ?? [], chartInst1, fmtAdr)
    createPage3Chart(chart2Ref.current, page3Kpi[1] ?? [], chartInst2, fmtAdr)
    createPage3Chart(chart3Ref.current, page3Kpi[2] ?? [], chartInst3, fmtAdr)
    return () => {
      chartInst1.current?.destroy(); chartInst1.current = null
      chartInst2.current?.destroy(); chartInst2.current = null
      chartInst3.current?.destroy(); chartInst3.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page3Kpi, adrUnit])

  // ESC + 스크롤락
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  // 인쇄 스타일 동적 주입
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'gm-report-print'
    style.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 0; }
        body > *:not(#gm-report-print-root) { display: none !important; }
        #gm-report-print-root { position: static !important; background: none !important; overflow: visible !important; display: block !important; padding: 0 !important; }
        #gm-report-print-root .gm-a4 { width: 100% !important; max-width: none !important; box-shadow: none !important; border-radius: 0 !important; }
        .gm-a4 { background: #ffffff !important; color: #000000 !important; padding: 0 14mm 12mm 14mm !important; width: 100% !important; max-width: none !important; }
        .gm-a4 * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .gm-no-print { display: none !important; }
        .gm-page-break { break-before: page; }
        .gm-page3-chart { height: 280px !important; }
        .gm-page-divider { display: none !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `
    document.head.appendChild(style)
    return () => { document.getElementById('gm-report-print')?.remove() }
  }, [])

  // ── 섹션 C — 이벤트 일정 DB 연결 (localOtbDate ~ 3개월 후 말일) ──
  const periodStart = (() => {
    const [py, pm] = (localOtbDate || '2000-01-01').split('-').map(Number)
    return `${py}-${String(pm).padStart(2, '0')}-01`   // 당월 1일
  })()
  const periodEnd = (() => {
    const [py, pm] = (localOtbDate || '2000-01-01').split('-').map(Number)
    const end = new Date(py, pm - 1 + 3, 0)   // 당월 포함 3개월 후 말일
    return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
  })()

  // 이벤트 캘린더 (c06_calendar) — 괄호( )를 포함한 event만 유효 이벤트로 사용
  const { data: calendarEvents } = useQuery({
    queryKey: ['gm_events_calendar', periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c06_calendar').select('date, day, event, is_holiday, yoy_match')
        .gte('date', periodStart).lte('date', periodEnd)
        .not('event', 'is', null).order('date', { ascending: true })
      if (error) { console.error('[GMReport] c06_calendar events error:', error); return [] }
      // 괄호 안 텍스트가 실제 이벤트명 → 괄호 없는 값(null/빈값/텍스트 "null"/광복절 등)은 제외
      return (data ?? []).filter((r: any) => r.event && r.event.includes('(') && r.event.includes(')'))
    },
    enabled: open && !!periodStart,
    staleTime: 60 * 60 * 1000,
  })
  const eventDates: string[]   = (calendarEvents ?? []).map((r: any) => r.date)
  const lyEventDates: string[] = (calendarEvents ?? []).map((r: any) =>
    lyMode === 'date' ? oneYearBefore(r.date) : r.yoy_match
  ).filter(Boolean)

  // OTB (localOtbDate 기준) — 이벤트 날짜별 OCC/ADR
  const { data: eventOtbData = [] } = useQuery({
    queryKey: ['gm_events_otb', hotelId, localOtbDate, eventDates],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a02_otb_daily').select('business_date, nights, room_revenue')
        .eq('hotel_id', hotelId).eq('update_date', localOtbDate).in('business_date', eventDates)
      if (error) { console.error('[GMReport] event otb error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && !!localOtbDate && eventDates.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // vs OTB (localVsDate 기준) — 전일픽업용
  const { data: eventVsData = [] } = useQuery({
    queryKey: ['gm_events_vs', hotelId, localVsDate, eventDates],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a02_otb_daily').select('business_date, nights')
        .eq('hotel_id', hotelId).eq('update_date', localVsDate).in('business_date', eventDates)
      if (error) { console.error('[GMReport] event vs error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && !!localVsDate && eventDates.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // LY (a01_actual_daily, yoy_match 날짜)
  const { data: eventLyData = [] } = useQuery({
    queryKey: ['gm_events_ly', hotelId, lyEventDates],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily').select('business_date, nights')
        .eq('hotel_id', hotelId).in('business_date', lyEventDates)
      if (error) { console.error('[GMReport] event ly error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && lyEventDates.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // BAR Rate (s02_rate_detail) — change > single > base 우선순위
  const { data: eventBarData = [] } = useQuery({
    queryKey: ['gm_events_bar', hotelId, eventDates],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('s02_rate_detail').select('stay_date, date_type, new_rate')
        .eq('hotel_id', hotelId).in('stay_date', eventDates)
        .in('date_type', ['change', 'single', 'base'])
      if (error) { console.error('[GMReport] event bar error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && eventDates.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // 이벤트 그룹 가공 (날짜별 집계 → 이벤트명 그룹핑)
  const eventGroups: EventGroup[] = useMemo(() => {
    if (!calendarEvents?.length) return []
    const otbMap: Record<string, { nights: number; revenue: number }> = {}
    const vsMap:  Record<string, number> = {}
    const lyMap:  Record<string, number> = {}
    const barMap: Record<string, number> = {}
    ;(eventOtbData ?? []).forEach((r: any) => {
      if (!otbMap[r.business_date]) otbMap[r.business_date] = { nights: 0, revenue: 0 }
      otbMap[r.business_date].nights  += r.nights ?? 0
      otbMap[r.business_date].revenue += r.room_revenue ?? 0
    })
    ;(eventVsData ?? []).forEach((r: any) => { vsMap[r.business_date] = (vsMap[r.business_date] ?? 0) + (r.nights ?? 0) })
    ;(eventLyData ?? []).forEach((r: any) => { lyMap[r.business_date] = (lyMap[r.business_date] ?? 0) + (r.nights ?? 0) })
    const barPriority: Record<string, number> = { change: 3, single: 2, base: 1 }
    const barRaw: Record<string, { rate: number; priority: number }> = {}
    ;(eventBarData ?? []).forEach((r: any) => {
      const p = barPriority[r.date_type] ?? 0
      if (!barRaw[r.stay_date] || p > barRaw[r.stay_date].priority) barRaw[r.stay_date] = { rate: r.new_rate, priority: p }
    })
    Object.entries(barRaw).forEach(([d, v]) => { barMap[d] = v.rate })

    const map = new Map<string, EventGroup>()
    calendarEvents.forEach((ev: any) => {
      const name = extractGroupName(ev.event)
      if (!name) return   // 괄호 안 텍스트 없으면 스킵
      if (!map.has(name)) map.set(name, { name, isHoliday: false, dates: [] })
      const g = map.get(name)!
      if (ev.is_holiday) g.isHoliday = true
      const otb    = otbMap[ev.date]
      const otbRn  = otb?.nights ?? 0
      const otbRev = otb?.revenue ?? 0
      const vsRn   = vsMap[ev.date] ?? 0
      const evLyDate = lyMode === 'date' ? oneYearBefore(ev.date) : ev.yoy_match
      const hasLy  = !!evLyDate && lyMap[evLyDate] != null
      const otbOcc = otb && roomCount > 0 ? Math.round((otbRn / roomCount) * 1000) / 10 : null
      const lyOcc  = hasLy && roomCount > 0 ? Math.round(((lyMap[evLyDate] ?? 0) / roomCount) * 1000) / 10 : null
      const adr    = otbRn > 0 ? Math.round(otbRev / otbRn) : null           // raw won (렌더에서 /1000 → k)
      const barRate = barMap[ev.date] ?? null
      const puNights = otb ? otbRn - vsRn : null                             // 전일픽업 = OTB - vs OTB
      g.dates.push({ date: ev.date, day: ev.day, otbOcc, occColor: eventOccColor(otbOcc, lyOcc), adr, barRate, puNights, lyOcc })
    })
    map.forEach(g => g.dates.sort((a, b) => a.date.localeCompare(b.date)))
    return Array.from(map.values())
  }, [calendarEvents, eventOtbData, eventVsData, eventLyData, eventBarData, roomCount, lyMode])

  // ── 섹션 D — 월별 OTB 현황 (DashboardPage lyData 재활용, 당월 포함 3개월) ──
  const monthlyKpi = useMemo(() => {
    if (!lyPacingData || lyPacingData.length === 0) return []
    return threeMonths.map(({ year, month }) => {
      const daysInMonth = new Date(year, month, 0).getDate()
      const totalAvail  = roomCount * daysInMonth
      const occ  = (rn: number) => (totalAvail > 0 ? Math.round((rn / totalAvail) * 1000) / 10 : 0)
      const adrWon = (rn: number, rev: number) => (rn > 0 ? rev / rn : 0)   // raw 원
      const revWon = (rev: number) => rev                                    // raw 원

      const monthRows = lyPacingData.filter((r) => {
        const [y, m] = r.business_date.split('-').map(Number)
        return y === year && m === month
      })
      const otbRn  = monthRows.reduce((s, r) => s + (r.otb_nights  ?? 0), 0)
      const otbRev = monthRows.reduce((s, r) => s + (r.otb_revenue ?? 0), 0)
      const lyRn   = monthRows.reduce((s, r) => s + (r.ly_nights   ?? 0), 0)
      const lyRev  = monthRows.reduce((s, r) => s + (r.ly_revenue  ?? 0), 0)
      const otbOcc = occ(otbRn), otbAdrWon = adrWon(otbRn, otbRev), otbRevWon = revWon(otbRev)
      const lyOcc  = occ(lyRn),  lyAdrWon  = adrWon(lyRn, lyRev),   lyRevWon  = revWon(lyRev)

      // Forecast (forecastRows, month_num 필터)
      const fcRows = (forecastRows ?? []).filter(r => r.month_num === month)
      const fcRn   = fcRows.reduce((s, r) => s + (r.forecast_nights  ?? 0), 0)
      const fcRev  = fcRows.reduce((s, r) => s + (r.forecast_revenue ?? 0), 0)
      const fcOcc  = occ(fcRn), fcAdrWon = adrWon(fcRn, fcRev), fcRevWon = revWon(fcRev)

      // Budget (budgetRows, month_num 필터)
      const budRows = (budgetRows ?? []).filter(r => r.month_num === month)
      const budRn   = budRows.reduce((s, r) => s + (r.budget_nights  ?? 0), 0)
      const budRev  = budRows.reduce((s, r) => s + (r.budget_revenue ?? 0), 0)
      const budOcc  = occ(budRn), budAdrWon = adrWon(budRn, budRev), budRevWon = revWon(budRev)

      return {
        month,
        otbOcc, otbAdrWon, otbRevWon,
        diffLyOcc:  Math.round((otbOcc - lyOcc) * 10) / 10, diffLyAdrWon:  otbAdrWon - lyAdrWon, diffLyRevWon:  otbRevWon - lyRevWon,
        fcOcc, fcAdrWon, fcRevWon,
        diffBudOcc: Math.round((fcOcc - budOcc) * 10) / 10, diffBudAdrWon: fcAdrWon - budAdrWon, diffBudRevWon: fcRevWon - budRevWon,
      }
    })
  }, [lyPacingData, forecastRows, budgetRows, threeMonths, roomCount])

  if (!open) return null

  // 섹션 A/B — 3개월 Pick-up 파생값
  const pm: any[][] = [pickupQ0.data ?? [], pickupQ1.data ?? [], pickupQ2.data ?? []]
  const isPickupLoading = pickupQ0.isLoading || pickupQ1.isLoading || pickupQ2.isLoading
  const summaries = [
    calcMonthSummary(pm[0], roomCount, threeMonths[0].year, threeMonths[0].month),
    calcMonthSummary(pm[1], roomCount, threeMonths[1].year, threeMonths[1].month),
    calcMonthSummary(pm[2], roomCount, threeMonths[2].year, threeMonths[2].month),
  ]
  const totalPuRn     = summaries.reduce((s, m) => s + m.puRn, 0)
  const totalPuRevWon = summaries.reduce((s, m) => s + m.puRevWon, 0)
  const avgPuAdrWon   = summaries[0].puAdrWon
  const accountRows = buildAccountRows(pm[0], pm[1], pm[2])
  const segGroups: Record<string, AccountRow[]> = {}
  for (const row of accountRows) (segGroups[row.seg] ??= []).push(row)
  const segTotals: Record<string, number> = {}
  for (const [seg, rows] of Object.entries(segGroups)) segTotals[seg] = rows.reduce((s, r) => s + r.total, 0)
  const monthLabels = threeMonths.map(t => `${t.month}월`)
  const pv = (n: number, unit: string) => (isPickupLoading ? '…' : n === 0 ? '±0' : `${sign(n)}${unit}`)

  // 섹션 B — 세그별 월/전체 합계 + order_index 정렬 후 좌우 2단 분배
  const sgn = (n: number) => (n === 0 ? '±0' : sign(n))
  const segSummaries: Record<string, { m0Total: number; m1Total: number; m2Total: number; total: number }> = {}
  for (const [seg, rowsArr] of Object.entries(segGroups)) {
    segSummaries[seg] = {
      m0Total: rowsArr.reduce((s, r) => s + r.m0, 0),
      m1Total: rowsArr.reduce((s, r) => s + r.m1, 0),
      m2Total: rowsArr.reduce((s, r) => s + r.m2, 0),
      total:   rowsArr.reduce((s, r) => s + r.total, 0),
    }
  }
  const sortedSegs = Object.keys(segGroups).sort((a, b) => (segOrderMap[a] ?? 999) - (segOrderMap[b] ?? 999))
  const mid = Math.ceil(sortedSegs.length / 2)
  const leftSegs = sortedSegs.slice(0, mid)
  const rightSegs = sortedSegs.slice(mid)

  const renderSegCard = (seg: string) => {
    const allRows = segGroups[seg] ?? []
    const rows = compact ? allRows.slice(0, 3) : allRows
    const hidden = compact ? allRows.slice(3) : []
    const sm = segSummaries[seg]
    return (
      <div key={seg} style={{ background: C.cardBg, borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ marginBottom: 6, paddingBottom: 5, borderBottom: `0.5px solid ${C.border}` }}>
          <span style={{ fontSize: 10, fontWeight: 500, color: sm.total >= 0 ? C.mint : C.red }}>{seg}</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '38%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '0 6px 5px 0', borderBottom: `0.5px solid ${C.border}` }}>어카운트</th>
              <th style={{ textAlign: 'right', fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '0 6px 5px 0', borderBottom: `0.5px solid ${C.border}` }}>{monthLabels[0]}</th>
              <th style={{ textAlign: 'right', fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '0 6px 5px 0', borderBottom: `0.5px solid ${C.border}` }}>{monthLabels[1]}</th>
              <th style={{ textAlign: 'right', fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '0 6px 5px 0', borderBottom: `0.5px solid ${C.border}` }}>{monthLabels[2]}</th>
              <th style={{ textAlign: 'right', fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '0 0 5px 8px', borderBottom: `0.5px solid ${C.border}`, borderLeft: `1.5px solid ${C.borderStrong}` }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const bb = ri < rows.length - 1 || hidden.length > 0 ? `0.5px solid ${C.border}` : 'none'
              return (
                <tr key={row.account}>
                  <td style={{ textAlign: 'left', color: C.textPrimary, padding: '4px 6px 4px 0', borderBottom: bb, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.account}</td>
                  <td style={{ ...accColor(row.m0), textAlign: 'right', padding: '4px 6px 4px 0', borderBottom: bb }}>{sgn(row.m0)}</td>
                  <td style={{ ...accColor(row.m1), textAlign: 'right', padding: '4px 6px 4px 0', borderBottom: bb }}>{sgn(row.m1)}</td>
                  <td style={{ ...accColor(row.m2), textAlign: 'right', padding: '4px 6px 4px 0', borderBottom: bb }}>{sgn(row.m2)}</td>
                  <td style={{ ...sumColor(row.total), textAlign: 'right', padding: '4px 0 4px 8px', borderLeft: `1.5px solid ${C.borderStrong}`, borderBottom: bb }}>{sgn(row.total)}</td>
                </tr>
              )
            })}
            {hidden.length > 0 && (
              <tr><td colSpan={5} style={{ fontSize: 10, color: C.textMuted, fontStyle: 'italic', padding: '4px 0' }}>기타 {hidden.length}개</td></tr>
            )}
            <tr style={{ background: '#f0efea', borderTop: '0.5px solid #c8c7c0' }}>
              <td style={{ ...sumColor(sm.total), textAlign: 'left', padding: '4px 6px 4px 8px', fontSize: 10 }}>합계</td>
              <td style={{ ...sumColor(sm.m0Total), textAlign: 'right', padding: '4px 6px 4px 0', fontSize: 10 }}>{sgn(sm.m0Total)}</td>
              <td style={{ ...sumColor(sm.m1Total), textAlign: 'right', padding: '4px 6px 4px 0', fontSize: 10 }}>{sgn(sm.m1Total)}</td>
              <td style={{ ...sumColor(sm.m2Total), textAlign: 'right', padding: '4px 6px 4px 0', fontSize: 10 }}>{sgn(sm.m2Total)}</td>
              <td style={{ ...sumColor(sm.total), textAlign: 'right', padding: '4px 0 4px 8px', fontSize: 12, borderLeft: '1.5px solid #c8c7c0' }}>{sgn(sm.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  const handlePrint = () => { setTimeout(() => window.print(), 50) }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: C.overlay, zIndex: 10000,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px 0',
  }
  const a4: React.CSSProperties = {
    width: 'min(794px, 95vw)', background: C.pageBg, borderRadius: 8,
    padding: '28px 32px', position: 'relative', flexShrink: 0,
  }
  const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: TXT, margin: '0 0 8px' }
  const card: React.CSSProperties = { background: BG_ELEV, borderRadius: 6, padding: '12px 14px' }
  const th: React.CSSProperties = { fontSize: 9, color: TXT3, fontWeight: 400, padding: '3px 6px' }

  const report = (
    <div id="gm-report-print-root" className="gm-report-modal gm-report-modal-wrapper" style={overlay} onClick={onClose}>
      <style>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .gm-report-modal {
            border: none !important;
            box-shadow: none !important;
          }
          /* 모달 컨테이너 테두리 제거 */
          [class*="modal"], [class*="Modal"] {
            border: none !important;
            box-shadow: none !important;
            outline: none !important;
          }
          /* 모달 오버레이/백드롭 숨김 */
          body > *:not(.gm-report-modal-wrapper) {
            display: none !important;
          }
          /* 모달 배경 오버레이 제거 */
          .gm-report-modal-wrapper {
            position: static !important;
            background: transparent !important;
            padding: 0 !important;
          }
          /* 인쇄 콘텐츠만 표시 */
          .gm-report-content {
            position: static !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            width: 100% !important;
            background: #fff !important;
          }
        }
      `}</style>
      <div className="gm-a4 gm-report-content" style={a4} onClick={e => e.stopPropagation()}>

        {/* ── 헤더 (1행: 아이콘 우측정렬(프린트 숨김) / 2행: 타이틀·날짜 좌 + 단위 우) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {/* 1행 — 아이콘 그룹, 우측 정렬, 프린트 시 숨김 */}
          <div className="gm-no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            {/* 보기 토글 — 전체 / 압축 (섹션 B Pick-up 상세 표시량) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <span style={{ color: C.textMuted }}>보기</span>
              <span style={{ color: C.borderStrong }}>|</span>
              <button onClick={() => setCompact(false)}
                style={{ border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: 11, borderRadius: 4,
                  color: !compact ? C.textPrimary : C.textMuted, fontWeight: !compact ? 500 : 400,
                  background: !compact ? C.cardBg : 'transparent' }}>
                전체
              </button>
              <button onClick={() => setCompact(true)}
                style={{ border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: 11, borderRadius: 4,
                  color: compact ? C.textPrimary : C.textMuted, fontWeight: compact ? 500 : 400,
                  background: compact ? C.cardBg : 'transparent' }}>
                압축
              </button>
            </div>
            {/* 단위 설정 — 기어 버튼 + 드롭다운 */}
            <div className="unit-setting-wrap" style={{ position: 'relative' }}>
              <button onClick={() => setShowUnitSetting(v => !v)} aria-label="단위 설정"
                style={{ width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${showUnitSetting ? C.mint : BORDER}`,
                  background: showUnitSetting ? C.mintBadgeBg : 'transparent',
                  color: showUnitSetting ? C.mintBadgeFg : C.textMuted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              {showUnitSetting && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: C.pageBg, border: `1px solid ${C.mint}33`, borderRadius: 8, padding: '12px 14px', width: 210, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 9999 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 10, letterSpacing: '0.04em' }}>단위 설정</div>
                  {/* ADR */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: C.textSecondary }}>객단가</span>
                    <div style={{ display: 'flex', border: `1px solid ${BORDER}`, borderRadius: 5, overflow: 'hidden' }}>
                      {(['원', '천원'] as const).map(u => (
                        <button key={u} onClick={() => setAdrUnit(u)} style={{ padding: '3px 8px', fontSize: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          background: adrUnit === u ? C.mint : 'transparent', color: adrUnit === u ? '#fff' : C.textMuted, fontWeight: adrUnit === u ? 500 : 400 }}>{u}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ height: 1, background: C.border, margin: '8px 0' }} />
                  {/* REV */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: C.textSecondary }}>매출</span>
                    <div style={{ display: 'flex', border: `1px solid ${BORDER}`, borderRadius: 5, overflow: 'hidden' }}>
                      {(['원', '천원', '백만원'] as const).map(u => (
                        <button key={u} onClick={() => setRevUnit(u)} style={{ padding: '3px 8px', fontSize: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          background: revUnit === u ? C.mint : 'transparent', color: revUnit === u ? '#fff' : C.textMuted, fontWeight: revUnit === u ? 500 : 400 }}>{u}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button onClick={handlePrint}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 11px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TXT, cursor: 'pointer' }}>
              🖨️ 출력
            </button>
            <button onClick={onClose} aria-label="닫기"
              style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TXT2, cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
          {/* 2행 — 좌: 타이틀+날짜picker / 우: 단위텍스트 (프린트 시에도 노출) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 500, color: TXT }}>데일리 리포트</span>
              <div data-theme="light" style={{ colorScheme: 'light', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }} onClick={e => e.stopPropagation()}>
                <span style={{ color: TXT2 }}>기준일</span>
                <DatePicker label="" value={localOtbDate} onChange={setLocalOtbDate} availableDates={otbDates} bare plain fontPx={12} dateColor={TXT} underlineColor="transparent" />
                <span style={{ color: C.borderStrong, fontSize: 10 }}>|</span>
                <span style={{ color: TXT3 }}>vs</span>
                <DatePicker label="" value={localVsDate} onChange={setLocalVsDate} availableDates={otbDates.filter(d => d < localOtbDate)} bare plain fontPx={12} dateColor={TXT} underlineColor="transparent" />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span
                onClick={() => setLyMode(m => (m === 'match' ? 'date' : 'match'))}
                style={{ fontSize: 11, color: C.textSecondary, letterSpacing: '0.02em', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
              >
                전년대비 : {lyMode === 'match' ? '전년동기간' : '전년동일자'} ⇄
              </span>
              <span style={{ color: C.borderStrong, fontSize: 10 }}>|</span>
              <span style={{ fontSize: 11, color: C.mint, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                단위 : 실 · {adrUnit} · {revUnit}
              </span>
            </div>
          </div>
        </div>

        {/* ══════════ 1페이지 ══════════ */}

          {/* 컴팩트 바 — 어제 실적 + 당일 OTB */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.5px 1fr', background: C.cardBg, borderRadius: 8, padding: '14px 18px', marginBottom: 14 }}>

            {/* 어제 실적 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 24 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: C.textPrimary }}>어제 실적</span>
                <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 6 }}>{yesterday}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                {[
                  { name: '점유율',   val: yesterdayKpi.occ !== null ? `${yesterdayKpi.occ}%` : '-', diff: yesterdayKpi.diffOcc, diffStr: yesterdayKpi.diffOcc !== null ? (yesterdayKpi.diffOcc > 0 ? `+${yesterdayKpi.diffOcc}%p` : yesterdayKpi.diffOcc < 0 ? `${yesterdayKpi.diffOcc}%p` : '±0%p') : '', fs: 18 },
                  { name: '객단가',    val: yesterdayKpi.adrWon    !== null ? fmtAdr(yesterdayKpi.adrWon)    : '-', diff: yesterdayKpi.diffAdrWon,    diffStr: yesterdayKpi.diffAdrWon    !== null ? sAdr(yesterdayKpi.diffAdrWon)    : '', fs: adrUnit === '원' ? 14 : 18 },
                  { name: '매출',    val: yesterdayKpi.revWon    !== null ? fmtRev(yesterdayKpi.revWon)    : '-', diff: yesterdayKpi.diffRevWon,    diffStr: yesterdayKpi.diffRevWon    !== null ? sRev(yesterdayKpi.diffRevWon)    : '', fs: revUnit === '원' ? 14 : 18 },
                  { name: 'RevPAR', val: yesterdayKpi.revparWon !== null ? fmtAdr(yesterdayKpi.revparWon) : '-', diff: yesterdayKpi.diffRevparWon, diffStr: yesterdayKpi.diffRevparWon !== null ? sAdr(yesterdayKpi.diffRevparWon) : '', fs: adrUnit === '원' ? 14 : 18 },
                ].map(({ name, val, diff, diffStr, fs }, idx, arr) => {
                  const isLast = idx === arr.length - 1
                  return (
                    <div key={name} style={isLast
                      ? { flex: 'none', marginLeft: 'auto', display: 'flex', flexDirection: 'column', maxWidth: 96, overflow: 'hidden' }
                      : { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 9, color: C.textMuted, marginBottom: 4 }}>{name}</span>
                      <div style={{ height: 22, display: 'flex', alignItems: 'flex-end', marginBottom: 4 }}>
                        <span style={{ fontSize: fs, fontWeight: 500, color: C.textPrimary, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'left' }}><FmtVal val={val} numSize={fs} /></span>
                      </div>
                      {diff !== null ? (
                        <span style={{ ...badgeStyle(diff > 0 ? 'up' : diff < 0 ? 'dn' : 'neu'), height: 18, lineHeight: '16px', whiteSpace: 'nowrap', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', textAlign: 'left', boxSizing: 'border-box' }}>전년비 {diffStr}</span>
                      ) : (
                        <div style={{ height: 18 }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 구분선 */}
            <div style={{ width: 0.5, background: C.border }} />

            {/* 당일 OTB */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 24 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: C.textPrimary }}>당일 OTB</span>
                <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 6 }}>{localOtbDate}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                {[
                  { name: '점유율', val: `${todayKpi.occ}%`, diff: todayKpi.diffOcc, diffStr: todayKpi.diffOcc !== null ? (todayKpi.diffOcc > 0 ? `+${todayKpi.diffOcc}%p` : todayKpi.diffOcc < 0 ? `${todayKpi.diffOcc}%p` : '±0%p') : '', color: C.textPrimary, fs: 18 },
                  { name: '객단가',  val: fmtAdr(todayKpi.adrWon), diff: todayKpi.diffAdrWon, diffStr: todayKpi.diffAdrWon !== null ? sAdr(todayKpi.diffAdrWon) : '', color: C.textPrimary, fs: adrUnit === '원' ? 14 : 18 },
                  { name: '매출',  val: fmtRev(todayKpi.revWon), diff: todayKpi.diffRevWon, diffStr: todayKpi.diffRevWon !== null ? sRev(todayKpi.diffRevWon) : '', color: C.textPrimary, fs: revUnit === '원' ? 14 : 18 },
                ].map(({ name, val, diff, diffStr, color, fs }) => (
                  <div key={name} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 9, color: C.textMuted, marginBottom: 4 }}>{name}</span>
                    <div style={{ height: 22, display: 'flex', alignItems: 'flex-end', marginBottom: 4 }}>
                      <span style={{ fontSize: fs, fontWeight: 500, color, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><FmtVal val={val} numSize={fs} /></span>
                    </div>
                    {diff !== null ? (
                      <span style={{ ...badgeStyle(diff > 0 ? 'up' : diff < 0 ? 'dn' : 'neu'), height: 18, lineHeight: '16px', whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>전년비 {diffStr}</span>
                    ) : (
                      <div style={{ height: 18 }} />
                    )}
                  </div>
                ))}

                {/* 전일 픽업 — 오른쪽 끝 */}
                <div style={{ flex: 'none', marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', maxWidth: 96, overflow: 'hidden' }}>
                  <span style={{ fontSize: 9, color: C.textMuted, marginBottom: 4 }}>전일 픽업</span>
                  <div style={{ height: 22, display: 'flex', alignItems: 'flex-end', marginBottom: 4 }}>
                    <span style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'right', color: todayKpi.pu > 0 ? '#1d9e75' : todayKpi.pu < 0 ? '#a32d2d' : C.textMuted }}>{todayKpi.pu > 0 ? `+${todayKpi.pu}` : todayKpi.pu < 0 ? `${todayKpi.pu}` : '±0'}</span>
                  </div>
                  <span style={{ fontSize: 9, color: todayKpi.remaining > 0 ? C.textMuted : '#a32d2d', height: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'right' }}>잔여 {todayKpi.remaining}</span>
                </div>
              </div>
            </div>

          </div>

          {/* 7일 OTB 차트 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: C.textPrimary }}>OTB 현황 (7일)</span>
              {/* MTD 실적 요약 (당월 1일 ~ 전일) */}
              {mtdKpi && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontSize: 11, borderBottom: '1px solid rgba(0,0,0,0.15)', paddingBottom: 4 }}>
                  <span style={{ color: C.textMuted, fontSize: 10 }}>{mtdKpi.periodLabel}</span>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ color: C.textMuted, fontSize: 10 }}>OCC</span>
                    <span style={{ fontWeight: 500, color: C.textPrimary }}>{mtdKpi.occ}%</span>
                    <span style={{ color: C.textMuted, fontSize: 10 }}>객단가</span>
                    <span style={{ fontWeight: 500, color: C.textPrimary }}><FmtVal val={fmtAdr(mtdKpi.adrWon)} numSize={11} /></span>
                    <span style={{ color: C.textMuted, fontSize: 10 }}>매출</span>
                    <span style={{ fontWeight: 500, color: C.textPrimary }}><FmtVal val={fmtRev(mtdKpi.revWon)} numSize={11} /></span>
                  </div>
                </div>
              )}
            </div>
            <div style={{ background: C.cardBg, borderRadius: 8, padding: '14px 16px' }}>
              {/* 막대 차트 + KPI 테이블 — 단일 table로 컬럼 공유 */}
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 9 }}>
                <colgroup>
                  <col style={{ width: 28 }} />
                  {chartDays.map((_, i) => <col key={i} />)}
                </colgroup>
                <tbody>
                  {/* 막대 차트 행 */}
                  <tr style={{ height: 120 }}>
                    <td style={{ verticalAlign: 'bottom', paddingBottom: 4 }} />
                    {chartKpi.map(d => (
                      <td key={d.date} style={{ verticalAlign: 'bottom', padding: '0 2px', height: 120 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                          <div style={{ width: '40%', height: 'calc(100% - 20px)', background: d.isToday ? '#e8eeff' : d.isPast ? '#f0efea' : C.border, borderRadius: 4, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', overflow: 'visible' }}>
                            <div style={{ width: '100%', height: `${d.otbOcc}%`, background: d.occColor, borderRadius: '4px 4px 0 0', position: 'relative' }}>
                              <span style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 8, fontWeight: 500, color: d.occColor, whiteSpace: 'nowrap' }}>{d.otbOcc}%</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 8, fontWeight: d.isToday ? 600 : 400, color: d.isToday ? '#2a78d6' : C.textPrimary, marginTop: 4, whiteSpace: 'nowrap', textAlign: 'center' }}>
                            {d.dateLabel}
                            <span style={{ fontSize: 7, marginLeft: 1, color: d.isFriSat ? '#e24b4a' : d.isToday ? '#2a78d6' : C.textMuted }}>{d.day}</span>
                          </div>
                        </div>
                      </td>
                    ))}
                  </tr>
                  {/* ADR 행 */}
                  <tr style={{ borderTop: `0.5px solid ${C.border}` }}>
                    <td style={{ fontSize: 8, color: C.textMuted, padding: '3px 2px' }}>객단가</td>
                    {chartKpi.map(d => (
                      <td key={d.date} style={{ textAlign: 'center', padding: '3px 2px', fontSize: adrUnit === '원' ? 8 : 9, whiteSpace: 'nowrap', color: C.textSecondary, fontWeight: d.isToday ? 500 : 400, background: d.isToday ? '#f0f4ff' : d.isPast ? '#fafaf8' : 'transparent', borderBottom: `0.5px solid ${C.border}` }}>{d.adrWon > 0 ? <FmtVal val={fmtAdr(d.adrWon)} numSize={adrUnit === '원' ? 8 : 9} /> : '-'}</td>
                    ))}
                  </tr>
                  {/* BAR 행 */}
                  <tr>
                    <td style={{ fontSize: 8, color: C.textMuted, padding: '3px 2px' }}>BAR</td>
                    {chartKpi.map(d => (
                      <td key={d.date} style={{ textAlign: 'center', padding: '3px 2px', fontSize: adrUnit === '원' ? 8 : 9, whiteSpace: 'nowrap', color: C.textPrimary, fontWeight: 500, background: d.isToday ? '#f0f4ff' : d.isPast ? '#fafaf8' : 'transparent', borderBottom: `0.5px solid ${C.border}` }}>{d.barRateWon !== null ? <FmtVal val={fmtAdr(d.barRateWon)} numSize={adrUnit === '원' ? 8 : 9} /> : '-'}</td>
                    ))}
                  </tr>
                  {/* LY 행 */}
                  <tr>
                    <td style={{ fontSize: 8, color: C.textMuted, padding: '3px 2px' }}>전년비</td>
                    {chartKpi.map(d => (
                      <td key={d.date} style={{ textAlign: 'center', padding: '3px 2px', fontSize: 9, color: C.textMuted, background: d.isToday ? '#f0f4ff' : d.isPast ? '#fafaf8' : 'transparent' }}>{d.lyOcc !== null ? `${d.lyOcc}%` : '-'}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 섹션 D — 월별 OTB 현황 */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>월별 현황<span style={{ fontSize: 10, color: C.textMuted, marginLeft: 8, fontWeight: 400 }}>· 전년대비 기준: 전년동월</span></div>
            <div style={{ ...card, padding: '10px 14px' }}>
              {/* 2줄 헤더 */}
              <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(6, 1fr)', borderBottom: `0.5px solid ${BORDER}` }}>
                <span />
                <span style={{ ...th, fontSize: 8, gridColumn: 'span 3', textAlign: 'center', color: '#2a78d6', fontWeight: 600 }}>OTB 현황</span>
                <span style={{ ...th, fontSize: 8, gridColumn: 'span 3', textAlign: 'center', color: '#1d9e75', fontWeight: 600, borderLeft: `1px solid ${BORDER}` }}>전망<span style={{ fontSize: 8, color: C.textMuted, fontWeight: 400, marginLeft: 3 }}>(하단: 목표 대비)</span></span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(6, 1fr)', borderBottom: `0.5px solid ${BORDER}`, paddingBottom: 3 }}>
                <span style={{ ...th, fontSize: 8 }}>구분</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>점유율</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>객단가({adrUnit})</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>매출({revUnit})</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right', borderLeft: `1px solid ${BORDER}` }}>점유율</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>객단가({adrUnit})</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>매출({revUnit})</span>
              </div>
              {lyLoading ? (
                <div style={{ padding: '10px 4px', fontSize: 10, color: TXT3, textAlign: 'center' }}>월별 데이터 불러오는 중…</div>
              ) : monthlyKpi.length === 0 ? (
                <div style={{ padding: '10px 4px', fontSize: 10, color: TXT3, textAlign: 'center' }}>-</div>
              ) : monthlyKpi.map((r, i) => {
                const signOcc = (n: number) => (n > 0 ? `+${n}%p` : n < 0 ? `${n}%p` : '±0%p')
                const monFs = (adrUnit === '원' || revUnit === '원') ? 8 : 10   // 원 단위 넘침 방지
                const cell = (main: string, sub: string, dir: string, bl = false) => (
                  <span style={{ textAlign: 'right', padding: '4px 4px 4px 0', borderLeft: bl ? `1px solid ${BORDER}` : undefined }}>
                    <span style={{ display: 'block', fontSize: monFs, color: TXT, fontWeight: 400, whiteSpace: 'nowrap' }}>{main}</span>
                    <span style={{ display: 'block', fontSize: 8, color: dirColor(dir), whiteSpace: 'nowrap' }}>{sub}</span>
                  </span>
                )
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px repeat(6, 1fr)', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: TXT, padding: '4px 6px' }}>{r.month}월</span>
                    {cell(`${r.otbOcc}%`, `전년비 ${signOcc(r.diffLyOcc)}`, dir3(r.diffLyOcc))}
                    {cell(fmtAdr(r.otbAdrWon), `전년비 ${sAdr(r.diffLyAdrWon)}`, dir3(r.diffLyAdrWon))}
                    {cell(fmtRev(r.otbRevWon), `전년비 ${sRev(r.diffLyRevWon)}`, dir3(r.diffLyRevWon))}
                    {cell(`${r.fcOcc}%`, `목표 ${signOcc(r.diffBudOcc)}`, dir3(r.diffBudOcc), true)}
                    {cell(fmtAdr(r.fcAdrWon), `목표 ${sAdr(r.diffBudAdrWon)}`, dir3(r.diffBudAdrWon))}
                    {cell(fmtRev(r.fcRevWon), `목표 ${sRev(r.diffBudRevWon)}`, dir3(r.diffBudRevWon))}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 섹션 C — 이벤트 일정 */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>이벤트 일정</div>
            {!calendarEvents ? (
              <div style={{ ...card, fontSize: 11, color: TXT3, textAlign: 'center' }}>이벤트 데이터 불러오는 중…</div>
            ) : eventGroups.length === 0 ? (
              <div style={{ ...card, fontSize: 11, color: TXT3, textAlign: 'center' }}>해당 기간 이벤트 없음</div>
            ) : (
              <div style={{ columnCount: 2, columnGap: 8 }}>
                {eventGroups.map(ev => renderEventCard(ev, fmtAdr, adrUnit))}
              </div>
            )}
          </div>

        {/* ── 페이지 구분선 ── */}
        <div className="gm-page-divider" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
          <div style={{ flex: 1, borderTop: `1.5px dashed ${BORDER}` }} />
          <span style={{ fontSize: 10, color: TXT3, background: C.pageBg, padding: '2px 8px', borderRadius: 10, border: `0.5px solid ${BORDER}` }}>2페이지 시작</span>
          <div style={{ flex: 1, borderTop: `1.5px dashed ${BORDER}` }} />
        </div>

        {/* ══════════ 2페이지 ══════════ */}
        <div className="gm-page-break">

        {/* 섹션 A — 3개월 Pick-up */}
        <div style={{ marginBottom: 18 }}>
          <div style={sectionTitle}>3개월 픽업</div>
          <div style={{ borderLeft: `3px solid ${C.mint}`, background: C.cardBg, borderRadius: '0 4px 4px 0', padding: '8px 12px', fontSize: 12, color: C.textSecondary, marginBottom: 8 }}>
            {isPickupLoading ? '픽업 데이터 불러오는 중…' : (() => {
              const verb = (n: number) => (n >= 0 ? '증가' : '감소')
              const col = (n: number) => (n > 0 ? C.mint : n < 0 ? C.red : C.textMuted)
              return (
                <>어제 대비 3개월 픽업은 총{' '}
                  <strong style={{ color: col(totalPuRn), fontWeight: 500 }}>{sign(totalPuRn)}실</strong>{' '}{verb(totalPuRn)}, 객단가{' '}
                  <strong style={{ color: col(avgPuAdrWon), fontWeight: 500 }}>{sAdr(avgPuAdrWon)}</strong>{' '}{verb(avgPuAdrWon)}, 매출{' '}
                  <strong style={{ color: col(totalPuRevWon), fontWeight: 500 }}>{sRev(totalPuRevWon)}</strong>{' '}{verb(totalPuRevWon)}하였습니다.</>
              )
            })()}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, alignItems: 'stretch' }}>
            {summaries.map((s, i) => {
              const chips = buildSegChips(pm[i], segOrderMap)
              return (
                <div key={i} style={{ ...card, display: 'flex', flexDirection: 'column' }}>
                  {/* 월 라인 — 월명(좌) + 픽업 R/N(우) */}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: TXT }}>{monthLabels[i]}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: dirColor(isPickupLoading ? 'neu' : dir3(s.puRn)) }}>{pv(s.puRn, '실')}</span>
                  </div>
                  {/* KPI 미니박스 — OCC / ADR(k) / REV(m) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', border: `0.5px solid ${BORDER}`, borderRadius: 4, marginBottom: 8 }}>
                    <KpiMini label="점유율" value={pv(s.puOcc, '%p')} dir={isPickupLoading ? 'neu' : dir3(s.puOcc)} />
                    <KpiMini label="객단가" value={isPickupLoading ? '…' : sAdr(s.puAdrWon)}  dir={isPickupLoading ? 'neu' : dir3(s.puAdrWon)} />
                    <KpiMini label="매출" value={isPickupLoading ? '…' : sRev(s.puRevWon)} dir={isPickupLoading ? 'neu' : dir3(s.puRevWon)} />
                  </div>
                  {/* 세그 칩 — 소분류(segmentation), 남은 공간 채움 */}
                  <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignContent: 'flex-start' }}>
                    {chips.map(({ name, pu }, ci) => (
                      <span key={ci} style={badgeStyle(pu > 0 ? 'up' : 'dn')}>{name} {pu > 0 ? `+${pu}` : `${pu}`}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 섹션 B — Pick-up 상세 */}
        <div>
          <div style={sectionTitle}>픽업 상세 (판매실수 기준)</div>
          {isPickupLoading ? (
            <div style={{ ...card, padding: 16, textAlign: 'center', fontSize: 11, color: TXT3 }}>불러오는 중…</div>
          ) : accountRows.length === 0 ? (
            <div style={{ ...card, padding: 16, textAlign: 'center', fontSize: 11, color: TXT3 }}>픽업 데이터 없음</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{leftSegs.map(renderSegCard)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{rightSegs.map(renderSegCard)}</div>
            </div>
          )}
        </div>

        </div>

        {/* ── 페이지 구분선 (2→3) ── */}
        <div className="gm-page-divider" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
          <div style={{ flex: 1, borderTop: `1.5px dashed ${BORDER}` }} />
          <span style={{ fontSize: 10, color: TXT3, background: C.pageBg, padding: '2px 8px', borderRadius: 10, border: `0.5px solid ${BORDER}` }}>3페이지 시작</span>
          <div style={{ flex: 1, borderTop: `1.5px dashed ${BORDER}` }} />
        </div>

        {/* ══════════ 3페이지 — OCC & BAR Rate ══════════ */}
        <div className="gm-page-break gm-page3">
          <div style={{ fontSize: 13, fontWeight: 500, color: C.textPrimary, marginBottom: 12 }}>
            점유율 및 BAR 요금
            <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 8, fontWeight: 400 }}>· {localOtbDate} ~ D+44</span>
          </div>
          {page3DayGroups.map((days, gi) => (
            <div key={gi} style={{ background: C.cardBg, borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
              {/* 범위 라벨 + 범례 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: C.textSecondary }}>
                  {days.length > 0 ? `${days[0].replace(/-/g, '/').slice(5)} ~ ${days[days.length - 1].replace(/-/g, '/').slice(5)}` : ''}
                </span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: C.textMuted }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#2a78d6' }} />점유율
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: C.textMuted }}>
                    <span style={{ fontSize: 8, background: 'rgba(255,255,255,0.8)', color: '#4a4a48', borderRadius: 3, padding: '1px 4px', border: `0.5px solid ${C.border}` }}></span>BAR Rate
                  </div>
                </div>
              </div>
              <div className="gm-page3-chart" style={{ height: 280, position: 'relative' }}>
                <canvas ref={[chart1Ref, chart2Ref, chart3Ref][gi]} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  return createPortal(report, document.body)
}
