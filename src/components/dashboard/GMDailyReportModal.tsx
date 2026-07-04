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

interface GMDailyReportModalProps {
  open:    boolean
  onClose: () => void
  hotelId: string
  otbDate: string   // 'YYYY-MM-DD'
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

const DUMMY_YESTERDAY = [
  { label: 'OCC%', value: '82.3%', ly: 'LY +2.8%p', lyDir: 'up' },
  { label: 'R/N',  value: '59실',   ly: 'LY +2실',   lyDir: 'up' },
  { label: 'ADR (천원)',  value: '178', ly: 'LY +6.1%', lyDir: 'up' },
  { label: 'REV (백만)',  value: '10.5',  ly: 'LY -1.3%',  lyDir: 'dn' },
  { label: 'RevPAR (천원)', value: '147', ly: 'LY +9.2%', lyDir: 'up' },
]

const DUMMY_TODAY_OTB = [
  { label: '현재 OCC%', value: '74.6%', sub: '잔여 18실', subDir: 'neu' },
  { label: '예상 ADR',  value: '165', sub: 'LY +4.3%', subDir: 'up' },
  { label: '전일 대비 Pick-up', value: '+7실', sub: '총 +7실', subDir: 'up' },
]

const DUMMY_CHART = {
  labels: ['7/1 화', '7/2 수', '7/3 목', '7/4 금', '7/5 토', '7/6 일', '7/7 월'],
  otb:  [74.6, 68.2, 71.5, 88.4, 92.1, 89.7, 65.3],
  fcst: [78.0, 73.5, 76.2, 91.0, 94.5, 91.2, 68.0],
}

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

const isWeekendLabel = (l: string) => /금|토/.test(l)

// 'YYYY-MM-DD' → 하루 전 'YYYY-MM-DD' (KST 로컬)
const getYesterday = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// LY 대비 배지 포맷
type LyBadge = { text: string; dir: 'up' | 'dn' | 'neu' }
const fmtLyOcc = (diff: number | null): LyBadge => {
  if (diff === null) return { text: '-', dir: 'neu' }
  return { text: `LY ${diff > 0 ? '+' : ''}${diff}%p`, dir: diff > 0 ? 'up' : diff < 0 ? 'dn' : 'neu' }
}
const fmtLyNum = (diff: number | null, unit: string): LyBadge => {
  if (diff === null) return { text: '-', dir: 'neu' }
  return { text: `LY ${diff > 0 ? '+' : ''}${diff.toLocaleString()}${unit}`, dir: diff > 0 ? 'up' : diff < 0 ? 'dn' : 'neu' }
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
  const otbAdr = otbRn > 0 ? Math.round(otbRev / otbRn / 1000) : 0
  const vsAdr  = vsRn  > 0 ? Math.round(vsRev  / vsRn  / 1000) : 0
  const segMap: Record<string, number> = {}
  rows.forEach((r: any) => { const seg = segLabel(r); segMap[seg] = (segMap[seg] ?? 0) + (r.pu_nights ?? 0) })
  return { puOcc: Math.round((otbOcc - vsOcc) * 10) / 10, puRn, puAdr: otbAdr - vsAdr, puRevM: Math.round(puRev / 1000000), segMap }
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

const renderEventCard = (ev: EventGroup) => {
  const evTh: React.CSSProperties = { fontSize: 9, color: C.textMuted, fontWeight: 500, padding: '0 4px 5px 0', borderBottom: `0.5px solid ${C.border}` }
  return (
    <div key={ev.name} style={{ background: C.cardBg, borderRadius: 8, padding: '10px 14px', breakInside: 'avoid', marginBottom: 8 }}>
      {/* 헤더 — 이벤트명 + 공휴일 배지 */}
      <div style={{ marginBottom: 8, paddingBottom: 6, borderBottom: `0.5px solid ${C.border}` }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: C.textPrimary }}>{ev.name}</span>
        {ev.isHoliday && <span style={{ fontSize: 8, background: '#faeeda', color: '#854f0b', padding: '1px 4px', borderRadius: 3, marginLeft: 3, fontWeight: 500 }}>공휴일</span>}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '42px' }} />
          <col style={{ width: 'auto' }} />
          <col style={{ width: '34px' }} />
          <col style={{ width: '34px' }} />
          <col style={{ width: '36px' }} />
          <col style={{ width: '36px' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...evTh, textAlign: 'left' }}>일자</th>
            <th style={{ ...evTh, textAlign: 'left' }}>OCC%</th>
            <th style={{ ...evTh, textAlign: 'right' }}>ADR</th>
            <th style={{ ...evTh, textAlign: 'right' }}>BAR</th>
            <th style={{ ...evTh, textAlign: 'right' }}>픽업</th>
            <th style={{ ...evTh, textAlign: 'right', paddingRight: 0 }}>LY OCC</th>
          </tr>
        </thead>
        <tbody>
          {ev.dates.map((d, i) => (
            <tr key={d.date} style={{ borderBottom: i < ev.dates.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
              <td style={{ padding: '4px 4px 4px 0' }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: C.textPrimary }}>{mmdd(d.date)}</span>
                <span style={{ fontSize: 8, marginLeft: 2, color: isFriSat(d.day) ? '#e24b4a' : C.textMuted }}>{d.day}</span>
              </td>
              <td style={{ padding: '4px 4px 4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ width: `${Math.min(d.otbOcc ?? 0, 100)}%`, height: '100%', background: d.occColor, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 500, color: d.occColor }}>{d.otbOcc !== null ? `${d.otbOcc}%` : '-'}</span>
                </div>
              </td>
              <td style={{ padding: '4px 4px 4px 0', textAlign: 'right' }}>
                <span style={{ fontSize: 10, color: C.textSecondary }}>{d.adr !== null ? `${Math.round(d.adr / 1000)}k` : '-'}</span>
              </td>
              <td style={{ padding: '4px 4px 4px 0', textAlign: 'right' }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: C.textPrimary }}>{d.barRate !== null ? `${Math.round(d.barRate / 1000)}k` : '-'}</span>
              </td>
              <td style={{ padding: '4px 4px 4px 0', textAlign: 'right' }}>
                <span style={{ fontSize: 10, fontWeight: 500, color: puColor(d.puNights) }}>{puText(d.puNights)}</span>
              </td>
              <td style={{ padding: '4px 0', textAlign: 'right' }}>
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
  return (
    <div style={{ padding: '5px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: dirColor(dir) }}>{value}</div>
    </div>
  )
}

const TXT = C.textPrimary
const TXT2 = C.textSecondary
const TXT3 = C.textMuted
const BORDER = C.border
const BG_ELEV = C.cardBg

export default function GMDailyReportModal({ open, onClose, hotelId, otbDate, lyData: lyPacingData, lyLoading, forecastRows, budgetRows }: GMDailyReportModalProps) {
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const chartRef  = useRef<HTMLCanvasElement>(null)
  const chartInst = useRef<Chart | null>(null)

  // ── 기준일/vs 로컬 관리 (모달 내부 DatePicker로 독립 변경) ──
  const [localOtbDate, setLocalOtbDate] = useState(otbDate)
  const [localVsDate, setLocalVsDate]   = useState(() => (otbDate ? getYesterday(otbDate) : ''))
  useEffect(() => {
    if (open) {
      setLocalOtbDate(otbDate)
      setLocalVsDate(otbDate ? getYesterday(otbDate) : '')
    }
  }, [open, otbDate])

  // ── 어제 날짜(KST) + 월 분기 ──
  const yesterday   = localOtbDate ? getYesterday(localOtbDate) : ''
  const isSameMonth = localOtbDate.slice(0, 7) === yesterday.slice(0, 7)
  const threeMonths = getThreeMonths(localOtbDate || '2000-01-01')   // 당월 포함 3개월

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
  const lyDate: string | null = calendarData?.yoy_match ?? null

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
    const adr    = hasCur ? (c.rn > 0 ? Math.round(c.rev / c.rn / 1000) : 0) : null
    const rev    = hasCur ? Math.round(c.rev / 1000000) : null
    const revpar = hasCur ? Math.round((c.rev / roomCount) / 1000) : null
    // LY (없으면 전부 null → 배지 미표시)
    const hasLy = Array.isArray(lyData) && lyData.length > 0 && roomCount > 0
    const l = sum(lyData)
    const lyOcc    = hasLy ? Math.round((l.rn / roomCount) * 1000) / 10 : null
    const lyAdr    = hasLy && l.rn > 0 ? Math.round(l.rev / l.rn / 1000) : null
    const lyRevM   = hasLy && l.rev > 0 ? Math.round(l.rev / 1000000) : null
    const lyRevpar = hasLy ? Math.round((l.rev / roomCount) / 1000) : null
    // 대비
    const diffOcc    = (lyOcc !== null && occ !== null)       ? Math.round((occ - lyOcc) * 10) / 10 : null
    const diffAdr    = (lyAdr !== null && adr !== null)       ? adr - lyAdr : null
    const diffRev    = (lyRevM !== null && rev !== null)      ? rev - lyRevM : null
    const diffRevpar = (lyRevpar !== null && revpar !== null) ? revpar - lyRevpar : null
    return { occ, rn, adr, rev, revpar, diffOcc, diffAdr, diffRev, diffRevpar }
  }, [yesterdayData, lyData, roomCount])

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
        @page { size: A4 portrait; margin: 12mm 14mm; }
        body > *:not(#gm-report-print-root) { display: none !important; }
        #gm-report-print-root { position: static !important; background: none !important; overflow: visible !important; display: block !important; padding: 0 !important; }
        #gm-report-print-root .gm-a4 { width: 100% !important; max-width: none !important; box-shadow: none !important; border-radius: 0 !important; }
        .gm-a4 { background: #ffffff !important; color: #000000 !important; }
        .gm-a4 * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .gm-no-print { display: none !important; }
        .gm-page-break { break-before: page; }
        .gm-page-divider { display: none !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `
    document.head.appendChild(style)
    return () => { document.getElementById('gm-report-print')?.remove() }
  }, [])

  // ── 섹션 C — 이벤트 일정 DB 연결 (localOtbDate ~ 3개월 후 말일) ──
  const periodEnd = (() => {
    const [py, pm] = (localOtbDate || '2000-01-01').split('-').map(Number)
    const end = new Date(py, pm - 1 + 3, 0)   // 당월 포함 3개월 후 말일
    return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
  })()

  // 이벤트 캘린더 (c06_calendar) — 괄호( )를 포함한 event만 유효 이벤트로 사용
  const { data: calendarEvents } = useQuery({
    queryKey: ['gm_events_calendar', localOtbDate, periodEnd],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c06_calendar').select('date, day, event, is_holiday, yoy_match')
        .gte('date', localOtbDate).lte('date', periodEnd)
        .not('event', 'is', null).order('date', { ascending: true })
      if (error) { console.error('[GMReport] c06_calendar events error:', error); return [] }
      // 괄호 안 텍스트가 실제 이벤트명 → 괄호 없는 값(null/빈값/텍스트 "null"/광복절 등)은 제외
      return (data ?? []).filter((r: any) => r.event && r.event.includes('(') && r.event.includes(')'))
    },
    enabled: open && !!localOtbDate,
    staleTime: 60 * 60 * 1000,
  })
  const eventDates: string[]   = (calendarEvents ?? []).map((r: any) => r.date)
  const lyEventDates: string[] = (calendarEvents ?? []).map((r: any) => r.yoy_match).filter(Boolean)

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
      const hasLy  = !!ev.yoy_match && lyMap[ev.yoy_match] != null
      const otbOcc = otb && roomCount > 0 ? Math.round((otbRn / roomCount) * 1000) / 10 : null
      const lyOcc  = hasLy && roomCount > 0 ? Math.round(((lyMap[ev.yoy_match] ?? 0) / roomCount) * 1000) / 10 : null
      const adr    = otbRn > 0 ? Math.round(otbRev / otbRn) : null           // raw won (렌더에서 /1000 → k)
      const barRate = barMap[ev.date] ?? null
      const puNights = otb ? otbRn - vsRn : null                             // 전일픽업 = OTB - vs OTB
      g.dates.push({ date: ev.date, day: ev.day, otbOcc, occColor: eventOccColor(otbOcc, lyOcc), adr, barRate, puNights, lyOcc })
    })
    map.forEach(g => g.dates.sort((a, b) => a.date.localeCompare(b.date)))
    return Array.from(map.values())
  }, [calendarEvents, eventOtbData, eventVsData, eventLyData, eventBarData, roomCount])

  // ── 섹션 D — 월별 OTB 현황 (DashboardPage lyData 재활용, 당월 포함 3개월) ──
  const monthlyKpi = useMemo(() => {
    if (!lyPacingData || lyPacingData.length === 0) return []
    return threeMonths.map(({ year, month }) => {
      const daysInMonth = new Date(year, month, 0).getDate()
      const totalAvail  = roomCount * daysInMonth
      const occ  = (rn: number) => (totalAvail > 0 ? Math.round((rn / totalAvail) * 1000) / 10 : 0)
      const adr  = (rn: number, rev: number) => (rn > 0 ? Math.round(rev / rn / 1000) : 0)   // 천원(k)
      const revM = (rev: number) => Math.round(rev / 1000000)                                 // 백만(m)

      const monthRows = lyPacingData.filter((r) => {
        const [y, m] = r.business_date.split('-').map(Number)
        return y === year && m === month
      })
      const otbRn  = monthRows.reduce((s, r) => s + (r.otb_nights  ?? 0), 0)
      const otbRev = monthRows.reduce((s, r) => s + (r.otb_revenue ?? 0), 0)
      const lyRn   = monthRows.reduce((s, r) => s + (r.ly_nights   ?? 0), 0)
      const lyRev  = monthRows.reduce((s, r) => s + (r.ly_revenue  ?? 0), 0)
      const otbOcc = occ(otbRn), otbAdr = adr(otbRn, otbRev), otbRevM = revM(otbRev)
      const lyOcc  = occ(lyRn),  lyAdr  = adr(lyRn, lyRev),   lyRevM  = revM(lyRev)

      // Forecast (forecastRows, month_num 필터)
      const fcRows = (forecastRows ?? []).filter(r => r.month_num === month)
      const fcRn   = fcRows.reduce((s, r) => s + (r.forecast_nights  ?? 0), 0)
      const fcRev  = fcRows.reduce((s, r) => s + (r.forecast_revenue ?? 0), 0)
      const fcOcc  = occ(fcRn), fcAdr = adr(fcRn, fcRev), fcRevM = revM(fcRev)

      // Budget (budgetRows, month_num 필터)
      const budRows = (budgetRows ?? []).filter(r => r.month_num === month)
      const budRn   = budRows.reduce((s, r) => s + (r.budget_nights  ?? 0), 0)
      const budRev  = budRows.reduce((s, r) => s + (r.budget_revenue ?? 0), 0)
      const budOcc  = occ(budRn), budAdr = adr(budRn, budRev), budRevM = revM(budRev)

      return {
        month,
        otbOcc, otbAdr, otbRevM,
        diffLyOcc:  Math.round((otbOcc - lyOcc) * 10) / 10, diffLyAdr:  otbAdr - lyAdr, diffLyRevM:  otbRevM - lyRevM,
        fcOcc, fcAdr, fcRevM,
        diffBudOcc: Math.round((fcOcc - budOcc) * 10) / 10, diffBudAdr: fcAdr - budAdr, diffBudRevM: fcRevM - budRevM,
      }
    })
  }, [lyPacingData, forecastRows, budgetRows, threeMonths, roomCount])

  // 차트 생성/파괴
  useEffect(() => {
    if (!open || !chartRef.current) return
    const bg = DUMMY_CHART.labels.map(l => (isWeekendLabel(l) ? '#3987e5' : '#2a78d6'))
    chartInst.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: DUMMY_CHART.labels,
        datasets: [
          { type: 'bar', label: 'OTB OCC%', data: DUMMY_CHART.otb, backgroundColor: bg, borderRadius: 2, order: 2 },
          { type: 'line', label: 'FCST OCC%', data: DUMMY_CHART.fcst, borderColor: '#1d9e75', borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, tension: 0.3, order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%`, font: { size: 9 }, color: C.textMuted }, grid: { color: C.border } },
          x: { ticks: { font: { size: 9 }, color: (c: any) => (isWeekendLabel(DUMMY_CHART.labels[c.index] ?? '') ? '#e24b4a' : C.textMuted) }, grid: { display: false } },
        },
      },
    })
    return () => { chartInst.current?.destroy(); chartInst.current = null }
  }, [open])

  if (!open) return null

  // 섹션 E — 어제 실적 카드 (로딩='…', 없음='-') · LY 배지는 이번 작업 제외
  const yv = (v: number | null, suffix = '') => (yesterdayLoading ? '…' : v !== null ? `${v.toLocaleString()}${suffix}` : '-')
  const yesterdayCards: { label: string; value: string; ly: LyBadge | null }[] = [
    { label: 'OCC%',          value: yesterdayLoading ? '…' : (yesterdayKpi.occ !== null ? `${yesterdayKpi.occ}%` : '-'), ly: fmtLyOcc(yesterdayKpi.diffOcc) },
    { label: 'R/N',           value: yv(yesterdayKpi.rn, '실'), ly: null },
    { label: 'ADR (천원)',    value: yv(yesterdayKpi.adr),      ly: fmtLyNum(yesterdayKpi.diffAdr, '천원') },
    { label: 'REV (백만)',    value: yv(yesterdayKpi.rev),      ly: fmtLyNum(yesterdayKpi.diffRev, '백만') },
    { label: 'RevPAR (천원)', value: yv(yesterdayKpi.revpar),   ly: fmtLyNum(yesterdayKpi.diffRevpar, '천원') },
  ]

  // 섹션 A/B — 3개월 Pick-up 파생값
  const pm: any[][] = [pickupQ0.data ?? [], pickupQ1.data ?? [], pickupQ2.data ?? []]
  const isPickupLoading = pickupQ0.isLoading || pickupQ1.isLoading || pickupQ2.isLoading
  const summaries = [
    calcMonthSummary(pm[0], roomCount, threeMonths[0].year, threeMonths[0].month),
    calcMonthSummary(pm[1], roomCount, threeMonths[1].year, threeMonths[1].month),
    calcMonthSummary(pm[2], roomCount, threeMonths[2].year, threeMonths[2].month),
  ]
  const totalPuRn   = summaries.reduce((s, m) => s + m.puRn, 0)
  const totalPuRevM = summaries.reduce((s, m) => s + m.puRevM, 0)
  const avgPuAdr    = summaries[0].puAdr
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

  const doPrintAll = () => { setCompact(false); setPrintModalOpen(false); setTimeout(() => window.print(), 50) }
  const doPrintCompact = () => { setCompact(true); setPrintModalOpen(false); setTimeout(() => window.print(), 50) }

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
    <div id="gm-report-print-root" style={overlay} onClick={onClose}>
      <div className="gm-a4" style={a4} onClick={e => e.stopPropagation()}>

        {/* ── 헤더 ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: TXT }}>GM Daily Report</span>
            <div data-theme="light" style={{ colorScheme: 'light', display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12 }} onClick={e => e.stopPropagation()}>
              <span style={{ color: TXT2 }}>기준일</span>
              <DatePicker label="" value={localOtbDate} onChange={setLocalOtbDate} bare plain fontPx={12} dateColor={TXT} underlineColor="transparent" />
              <span style={{ color: C.borderStrong, fontSize: 10 }}>|</span>
              <span style={{ color: TXT3 }}>vs</span>
              <DatePicker label="" value={localVsDate} onChange={setLocalVsDate} bare plain fontPx={12} dateColor={TXT} underlineColor="transparent" />
            </div>
          </div>
          <div className="gm-no-print" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setPrintModalOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 11px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TXT, cursor: 'pointer' }}>
              🖨️ 출력
            </button>
            <button onClick={onClose} aria-label="닫기"
              style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TXT2, cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        </div>

        {/* ══════════ 1페이지 ══════════ */}

        {/* 섹션 A — 3개월 Pick-up */}
        <div style={{ marginBottom: 18 }}>
          <div style={sectionTitle}>3개월 Pick-up</div>
          <div style={{ borderLeft: `3px solid ${C.mint}`, background: C.cardBg, borderRadius: '0 4px 4px 0', padding: '8px 12px', fontSize: 12, color: C.textSecondary, marginBottom: 8 }}>
            {isPickupLoading ? '픽업 데이터 불러오는 중…' : (() => {
              const verb = (n: number) => (n >= 0 ? '증가' : '감소')
              const col = (n: number) => (n > 0 ? C.mint : n < 0 ? C.red : C.textMuted)
              return (
                <>어제 대비 3개월 픽업은 총{' '}
                  <strong style={{ color: col(totalPuRn), fontWeight: 500 }}>{sign(totalPuRn)}실</strong>{' '}{verb(totalPuRn)}, ADR{' '}
                  <strong style={{ color: col(avgPuAdr), fontWeight: 500 }}>{sign(avgPuAdr)}k</strong>{' '}{verb(avgPuAdr)}, 매출{' '}
                  <strong style={{ color: col(totalPuRevM), fontWeight: 500 }}>{sign(totalPuRevM)}m</strong>{' '}{verb(totalPuRevM)}하였습니다.</>
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
                    <KpiMini label="OCC" value={pv(s.puOcc, '%p')} dir={isPickupLoading ? 'neu' : dir3(s.puOcc)} />
                    <KpiMini label="ADR" value={pv(s.puAdr, 'k')}  dir={isPickupLoading ? 'neu' : dir3(s.puAdr)} />
                    <KpiMini label="REV" value={pv(s.puRevM, 'm')} dir={isPickupLoading ? 'neu' : dir3(s.puRevM)} />
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
          <div style={sectionTitle}>Pick-up 상세 (Room Nights 기준)</div>
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

        {/* ── 페이지 구분선 ── */}
        <div className="gm-page-divider" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
          <div style={{ flex: 1, borderTop: `1.5px dashed ${BORDER}` }} />
          <span style={{ fontSize: 10, color: TXT3, background: C.pageBg, padding: '2px 8px', borderRadius: 10, border: `0.5px solid ${BORDER}` }}>2페이지 시작</span>
          <div style={{ flex: 1, borderTop: `1.5px dashed ${BORDER}` }} />
        </div>

        {/* ══════════ 2페이지 ══════════ */}
        <div className="gm-page-break">

          {/* 섹션 D — 월별 OTB 현황 */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>월별 OTB 현황<span style={{ fontSize: 10, color: C.textMuted, marginLeft: 8, fontWeight: 400 }}>· LY 기준: 전년동월</span></div>
            <div style={{ ...card, padding: '10px 14px' }}>
              {/* 2줄 헤더 */}
              <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(6, 1fr)', borderBottom: `0.5px solid ${BORDER}` }}>
                <span />
                <span style={{ ...th, fontSize: 8, gridColumn: 'span 3', textAlign: 'center', color: '#2a78d6', fontWeight: 600 }}>OTB 현황</span>
                <span style={{ ...th, fontSize: 8, gridColumn: 'span 3', textAlign: 'center', color: '#1d9e75', fontWeight: 600, borderLeft: `1px solid ${BORDER}` }}>Forecast<span style={{ fontSize: 8, color: C.textMuted, fontWeight: 400, marginLeft: 3 }}>(하단: Budget 대비)</span></span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(6, 1fr)', borderBottom: `0.5px solid ${BORDER}`, paddingBottom: 3 }}>
                <span style={{ ...th, fontSize: 8 }}>구분</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>OCC%</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>ADR(천원)</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>REV(백만)</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right', borderLeft: `1px solid ${BORDER}` }}>OCC%</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>ADR(천원)</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>REV(백만)</span>
              </div>
              {lyLoading ? (
                <div style={{ padding: '10px 4px', fontSize: 10, color: TXT3, textAlign: 'center' }}>월별 데이터 불러오는 중…</div>
              ) : monthlyKpi.length === 0 ? (
                <div style={{ padding: '10px 4px', fontSize: 10, color: TXT3, textAlign: 'center' }}>-</div>
              ) : monthlyKpi.map((r, i) => {
                const signOcc = (n: number) => (n > 0 ? `+${n}%p` : n < 0 ? `${n}%p` : '±0%p')
                const cell = (main: string, sub: string, dir: string, bl = false) => (
                  <span style={{ textAlign: 'right', padding: '4px 4px 4px 0', borderLeft: bl ? `1px solid ${BORDER}` : undefined }}>
                    <span style={{ display: 'block', fontSize: 10, color: TXT, fontWeight: 400 }}>{main}</span>
                    <span style={{ display: 'block', fontSize: 8, color: dirColor(dir) }}>{sub}</span>
                  </span>
                )
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px repeat(6, 1fr)', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: TXT, padding: '4px 6px' }}>{r.month}월</span>
                    {cell(`${r.otbOcc}%`, `LY ${signOcc(r.diffLyOcc)}`, dir3(r.diffLyOcc))}
                    {cell(r.otbAdr.toLocaleString(), `LY ${sign(r.diffLyAdr)}k`, dir3(r.diffLyAdr))}
                    {cell(r.otbRevM.toLocaleString(), `LY ${sign(r.diffLyRevM)}m`, dir3(r.diffLyRevM))}
                    {cell(`${r.fcOcc}%`, `Bud ${signOcc(r.diffBudOcc)}`, dir3(r.diffBudOcc), true)}
                    {cell(r.fcAdr.toLocaleString(), `Bud ${sign(r.diffBudAdr)}k`, dir3(r.diffBudAdr))}
                    {cell(r.fcRevM.toLocaleString(), `Bud ${sign(r.diffBudRevM)}m`, dir3(r.diffBudRevM))}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 섹션 E — 어제 실적 */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ ...sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span>어제 실적</span>
              <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 400 }}>{yesterday}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {yesterdayCards.map(k => (
                <div key={k.label} style={{ ...card, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, minHeight: 14 }}>
                    <span style={{ fontSize: 10, color: TXT3 }}>{k.label}</span>
                    {k.ly && k.ly.text !== '-' && <span style={badgeStyle(k.ly.dir)}>{k.ly.text}</span>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: TXT }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 섹션 F — 당일 OTB + 차트 */}
          <div>
            <div style={{ ...sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span>당일 OTB 현황</span>
              <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 400 }}>{localOtbDate}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {DUMMY_TODAY_OTB.map(k => (
                  <div key={k.label} style={{ ...card, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: TXT3, marginBottom: 4 }}>{k.label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 18, fontWeight: 500, color: TXT }}>{k.value}</span>
                      <span style={{ fontSize: 10, color: dirColor(k.subDir) }}>{k.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ ...card, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: TXT2 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#2a78d6' }} /> OTB OCC%
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: TXT2 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#1d9e75' }} /> FCST OCC%
                  </span>
                </div>
                <div style={{ height: 150, position: 'relative' }}>
                  <canvas ref={chartRef} />
                </div>
              </div>
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
                {eventGroups.map(renderEventCard)}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── 출력 서브모달 ── */}
      {printModalOpen && (
        <div className="gm-no-print" onClick={() => setPrintModalOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 320, background: BG_ELEV, borderRadius: 12, padding: 24, border: `0.5px solid ${BORDER}` }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: TXT, marginBottom: 6 }}>어카운트 출력 방식 선택</div>
            <div style={{ fontSize: 12, color: TXT3, marginBottom: 16 }}>어카운트가 많을 경우 페이지가 늘어날 수 있습니다.</div>

            <button onClick={doPrintAll}
              style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', color: TXT, cursor: 'pointer', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>전체 출력</div>
              <div style={{ fontSize: 11, color: TXT3, marginTop: 2 }}>움직임 있는 어카운트 전체 표시 / 페이지 수 자동 증가</div>
            </button>
            <button onClick={doPrintCompact}
              style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', color: TXT, cursor: 'pointer', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>압축 출력</div>
              <div style={{ fontSize: 11, color: TXT3, marginTop: 2 }}>세그별 Top 3 + 기타 합산 / 항상 2페이지 고정</div>
            </button>
            <button onClick={() => setPrintModalOpen(false)}
              style={{ width: '100%', padding: '6px', background: 'transparent', border: 'none', color: TXT3, cursor: 'pointer', fontSize: 12 }}>취소</button>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(report, document.body)
}
