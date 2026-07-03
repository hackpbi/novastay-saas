'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import Chart from 'chart.js/auto'
import { supabase } from '@/lib/supabase'

interface GMDailyReportModalProps {
  open:    boolean
  onClose: () => void
  hotelId: string
  otbDate: string   // 'YYYY-MM-DD'
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

// 세그 칩 — segmentation 소분류별 pu_nights (seg_name 표시, 0 제외, 절대값 내림차순)
const buildSegChips = (rows: any[]): { name: string; pu: number }[] => {
  const map: Record<string, { name: string; pu: number }> = {}
  rows.forEach((r: any) => {
    const key = r.segmentation
    if (!key) return
    if (!map[key]) map[key] = { name: r.seg_name ?? r.segmentation, pu: 0 }
    map[key].pu += r.pu_nights ?? 0
  })
  return Object.values(map).filter(({ pu }) => pu !== 0).sort((a, b) => Math.abs(b.pu) - Math.abs(a.pu))
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

export default function GMDailyReportModal({ open, onClose, hotelId, otbDate }: GMDailyReportModalProps) {
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const chartRef  = useRef<HTMLCanvasElement>(null)
  const chartInst = useRef<Chart | null>(null)

  // ── 어제 날짜(KST) + 월 분기 ──
  const yesterday   = otbDate ? getYesterday(otbDate) : ''
  const isSameMonth = otbDate.slice(0, 7) === yesterday.slice(0, 7)
  const threeMonths = getThreeMonths(otbDate || '2000-01-01')   // 당월 포함 3개월

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
    queryKey: ['gm_yesterday', hotelId, otbDate, yesterday, isSameMonth],
    queryFn: async () => {
      if (isSameMonth) {
        const { data, error } = await (supabase as any)
          .from('a02_otb_daily').select('nights, room_revenue')
          .eq('hotel_id', hotelId).eq('update_date', otbDate).eq('business_date', yesterday)
        if (error) { console.error('[GMReport] yesterday(otb) error:', error); return [] }
        return data ?? []
      }
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily').select('nights, room_revenue')
        .eq('hotel_id', hotelId).eq('business_date', yesterday)
      if (error) { console.error('[GMReport] yesterday(actual) error:', error); return [] }
      return data ?? []
    },
    enabled: open && !!hotelId && !!otbDate && roomCount > 0,
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
      p_hotel_id: hotelId, p_otb_date: otbDate, p_vs_date: yesterday, p_year: year, p_month: month, p_segmentation: null,
    })
    if (error) { console.error('[GMReport] get_account_pickup_data error:', error); return [] }
    return data ?? []
  }
  const pickupEnabled = open && !!hotelId && !!otbDate && !!yesterday
  const pickupQ0 = useQuery({ queryKey: ['gm_pickup_month', hotelId, otbDate, yesterday, threeMonths[0].year, threeMonths[0].month], queryFn: mkPickupFn(threeMonths[0].year, threeMonths[0].month), enabled: pickupEnabled, staleTime: 5 * 60 * 1000 })
  const pickupQ1 = useQuery({ queryKey: ['gm_pickup_month', hotelId, otbDate, yesterday, threeMonths[1].year, threeMonths[1].month], queryFn: mkPickupFn(threeMonths[1].year, threeMonths[1].month), enabled: pickupEnabled, staleTime: 5 * 60 * 1000 })
  const pickupQ2 = useQuery({ queryKey: ['gm_pickup_month', hotelId, otbDate, yesterday, threeMonths[2].year, threeMonths[2].month], queryFn: mkPickupFn(threeMonths[2].year, threeMonths[2].month), enabled: pickupEnabled, staleTime: 5 * 60 * 1000 })

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
            <span style={{ fontSize: 11, color: TXT3 }}>기준일 {otbDate} (어제: {yesterday})</span>
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
              const chips = buildSegChips(pm[i])
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
          <div style={sectionTitle}>Pick-up 상세</div>
          <div style={{ ...card, padding: '14px 16px' }}>
            {/* 헤더 행 */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr 1fr', alignItems: 'center', borderBottom: `0.5px solid ${BORDER}`, paddingBottom: 4 }}>
              <span style={th}>세그 / 어카운트</span>
              <span style={{ ...th, textAlign: 'right' }}>{monthLabels[0]}</span>
              <span style={{ ...th, textAlign: 'right' }}>{monthLabels[1]}</span>
              <span style={{ ...th, textAlign: 'right' }}>{monthLabels[2]}</span>
              <span style={{ ...th, textAlign: 'right', borderLeft: `1.5px solid ${C.borderStrong}`, paddingLeft: 10, fontSize: 10, color: C.textPrimary }}>합계</span>
            </div>

            {isPickupLoading ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: TXT3 }}>불러오는 중…</div>
            ) : accountRows.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: TXT3 }}>픽업 데이터 없음</div>
            ) : Object.entries(segGroups).map(([seg, allRows]) => {
              const rows = compact ? allRows.slice(0, 3) : allRows
              const hidden = compact ? allRows.slice(3) : []
              const segTot = segTotals[seg] ?? 0
              return (
                <div key={seg} style={{ marginTop: 8 }}>
                  {/* 세그 헤더 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `0.5px solid ${BORDER}`, paddingBottom: 3, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: TXT2 }}>{seg}</span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: dirColor(dir3(segTot)) }}>합계 {segTot === 0 ? '±0' : sign(segTot)}실</span>
                  </div>
                  {/* 어카운트 행 */}
                  {rows.map((a, ai) => (
                    <div key={a.account} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr 1fr', alignItems: 'center', padding: '3px 0', borderBottom: ai < rows.length - 1 || hidden.length > 0 ? `0.5px solid ${BORDER}` : 'none' }}>
                      <span style={{ fontSize: 11, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.account}</span>
                      <span style={{ fontSize: 11, textAlign: 'right', color: dirColor(dir3(a.m0)) }}>{a.m0 === 0 ? '±0' : sign(a.m0)}</span>
                      <span style={{ fontSize: 11, textAlign: 'right', color: dirColor(dir3(a.m1)) }}>{a.m1 === 0 ? '±0' : sign(a.m1)}</span>
                      <span style={{ fontSize: 11, textAlign: 'right', color: dirColor(dir3(a.m2)) }}>{a.m2 === 0 ? '±0' : sign(a.m2)}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, textAlign: 'right', borderLeft: `1.5px solid ${C.borderStrong}`, paddingLeft: 10, color: dirColor(dir3(a.total)) }}>{a.total === 0 ? '±0' : sign(a.total)}</span>
                    </div>
                  ))}
                  {hidden.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr 1fr', alignItems: 'center', padding: '3px 0' }}>
                      <span style={{ fontSize: 10, color: TXT3, fontStyle: 'italic' }}>기타 {hidden.length}개</span>
                      <span /><span /><span /><span />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── 페이지 구분선 ── */}
        <div className="gm-page-divider" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
          <div style={{ flex: 1, borderTop: `1.5px dashed ${BORDER}` }} />
          <span style={{ fontSize: 10, color: TXT3, background: C.pageBg, padding: '2px 8px', borderRadius: 10, border: `0.5px solid ${BORDER}` }}>2페이지 시작</span>
          <div style={{ flex: 1, borderTop: `1.5px dashed ${BORDER}` }} />
        </div>

        {/* ══════════ 2페이지 ══════════ */}
        <div className="gm-page-break">

          {/* 섹션 C — 이벤트 일정 */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>이벤트 일정</div>
            <div style={{ ...card, padding: '10px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr 130px 80px 80px', alignItems: 'center', borderBottom: `0.5px solid ${BORDER}`, paddingBottom: 4 }}>
                <span style={th}>일자</span>
                <span style={th}>이벤트</span>
                <span style={th}>OCC%</span>
                <span style={{ ...th, textAlign: 'right' }}>전일 픽업</span>
                <span style={{ ...th, textAlign: 'right' }}>LY OCC%</span>
              </div>
              {DUMMY_EVENTS.map((ev, i) => {
                const weekend = ev.day === '금' || ev.day === '토'
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 130px 80px 80px', alignItems: 'center', padding: '5px 0', borderBottom: i < DUMMY_EVENTS.length - 1 ? `0.5px solid ${BORDER}` : 'none' }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: weekend ? '#e24b4a' : TXT }}>{ev.date} <span style={{ fontSize: 9 }}>({ev.day})</span></span>
                    <span style={{ fontSize: 11, color: TXT }}>{ev.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 72, height: 5, borderRadius: 3, background: C.border, overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: 5, width: `${ev.occ}%`, background: ev.occColor }} />
                      </span>
                      <span style={{ fontSize: 10, color: TXT2 }}>{ev.occ}%</span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, textAlign: 'right', color: dirColor(ev.pickupDir) }}>{ev.pickup}</span>
                    <span style={{ fontSize: 11, textAlign: 'right', color: TXT2 }}>{ev.lyOcc}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 섹션 D — 월별 OTB 현황 */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>월별 OTB 현황</div>
            <div style={{ ...card, padding: '10px 14px' }}>
              {/* 2줄 헤더 */}
              <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(6, 1fr)', borderBottom: `0.5px solid ${BORDER}` }}>
                <span />
                <span style={{ ...th, fontSize: 8, gridColumn: 'span 3', textAlign: 'center', color: '#2a78d6', fontWeight: 600 }}>OTB 현황</span>
                <span style={{ ...th, fontSize: 8, gridColumn: 'span 3', textAlign: 'center', color: '#eda100', fontWeight: 600, borderLeft: `1px solid ${BORDER}` }}>Budget</span>
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
              {DUMMY_MONTHLY_OTB.map((r, i) => {
                const cell = (main: string, sub: string, dir: string, bl = false) => (
                  <span style={{ textAlign: 'right', padding: '4px 4px 4px 0', borderLeft: bl ? `1px solid ${BORDER}` : undefined }}>
                    <span style={{ display: 'block', fontSize: 10, color: TXT, fontWeight: r.isTotal ? 500 : 400 }}>{main}</span>
                    <span style={{ display: 'block', fontSize: 8, color: dirColor(dir) }}>{sub}</span>
                  </span>
                )
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px repeat(6, 1fr)', alignItems: 'center', borderTop: r.isTotal ? `0.5px solid ${BORDER}` : undefined }}>
                    <span style={{ fontSize: 10, fontWeight: r.isTotal ? 600 : 500, color: TXT, padding: '4px 6px' }}>{r.month}</span>
                    {cell(r.otbOcc, r.lyOcc, r.lyOccDir)}
                    {cell(r.otbAdr, r.lyAdr, r.lyAdrDir)}
                    {cell(r.otbRev, r.lyRev, r.lyRevDir)}
                    {cell(r.budOcc, r.budOccDiff, r.budOccDir, true)}
                    {cell(r.budAdr, r.budAdrDiff, r.budAdrDir)}
                    {cell(r.budRev, r.budRevDiff, r.budRevDir)}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 섹션 E — 어제 실적 */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>어제 실적</div>
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
            <div style={sectionTitle}>당일 OTB 현황</div>
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
