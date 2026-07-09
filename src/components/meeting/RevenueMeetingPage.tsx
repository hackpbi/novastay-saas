'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PickupRow } from '@/hooks/usePickupData'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { useBudgetMonthly, type BudgetMonthlyRow } from '@/hooks/useBudgetMonthly'
import { useForecastMonthly, type ForecastMonthlyRow } from '@/hooks/useForecastMonthly'
import { useLatestConfirmedBudgetDate } from '@/hooks/useLatestConfirmedBudgetDate'
import { useFcstDateContext } from '@/contexts/FcstDateContext'
import DatePicker from '@/components/DatePicker'
import { FmtVal } from '@/utils/FmtVal'
import SegmentDetailModal from './SegmentDetailModal'
import MeetingPickupBlock, { type SegGroup } from '@/components/meeting/MeetingPickupBlock'
import MarketPickupDayModal from '@/components/market-pickup/MarketPickupDayModal'
import {
  getDummySectionExtras,
  monthKeyLabel,
} from './dummyMeetingData'

interface RevenueMeetingPageProps {
  hotelId: string
}

// c11_meeting_directives 로우
type Directive = {
  id:         string
  hotel_id:   string
  month_key:  string
  content:    string
  assignee:   string | null
  date:       string   // 'YYYY-MM-DD'
  status:     '진행중' | '연장' | '보류' | '완료'
  created_at: string
}

const DIRECTIVE_STATUS = ['진행중', '연장', '보류', '완료'] as const
type DirectiveStatus = typeof DIRECTIVE_STATUS[number]

const DIRECTIVE_STATUS_COLOR: Record<DirectiveStatus, string> = {
  '진행중': '#5B8DEF',
  '연장':   '#F5A623',
  '보류':   '#888888',
  '완료':   '#00E5A0',
}

// ── 디자인 토큰 ──────────────────────────────────────────────────────────────────
const BG     = '#0a0a0a'
const CARD   = '#141414'
const MINT   = '#00E5A0'
const RED    = '#E24B4A'
const BLUE   = '#5B8DEF'
const TXT3   = '#888'

// KST 기준 dateStr('YYYY-MM-DD')에서 days일 전 'YYYY-MM-DD'
function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - days)
  return d.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
}

// 향후 4개월(당월 + 3) monthKey 생성
function buildMonthKeys(): string[] {
  const now = new Date()
  const keys: string[] = []
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

// 증감 포맷 (단위별)
const signNum = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('ko-KR')}`
const signK   = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v / 1000)}K`
const signM   = (v: number) => `${v > 0 ? '+' : ''}${(v / 1_000_000).toFixed(1)}M`
const signPct = (v: number) => `${v > 0 ? '+' : ''}${v}%p`
const dColor  = (v: number) => (v > 0 ? MINT : v < 0 ? RED : TXT3)
const fmtAdr  = (v: number) => `${Math.round(v / 1000)}K`
const fmtRevM = (v: number) => `${(v / 1_000_000).toFixed(0)}M`

// KPI 프로그레스 바 — OTB가 목표(Budget/LY) 대비 몇 % 달성인지 (최대 100)
function barPct(otbVal: number, refVal: number): number {
  if (refVal <= 0) return 0
  return Math.min(Math.round((otbVal / refVal) * 100), 100)
}

// ── KPI 카드 (OTB 값 + FCST 박스 + vs Budget/LY 프로그레스 바) ─────────────────────
function KpiCard({
  label, mainVal, fcstVal, fcstVsBudStr, fcstVsBudPos,
  budStr, lyStr, vsBudDiffStr, vsBudBarPct, vsBudPos,
  vsLyDiffStr, vsLyBarPct, vsLyPos,
}: {
  label:         string
  mainVal:       string
  fcstVal:       string
  fcstVsBudStr:  string
  fcstVsBudPos:  boolean
  budStr:        string
  lyStr:         string
  vsBudDiffStr:  string
  vsBudBarPct:   number
  vsBudPos:      boolean
  vsLyDiffStr:   string
  vsLyBarPct:    number
  vsLyPos:       boolean
}) {
  return (
    <div style={{ background: CARD, borderRadius: 10, padding: 14, border: '1px solid #1e1e1e' }}>
      {/* 상단: OTB 값 + FCST 박스 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>{label}</div>
          <div style={{ fontWeight: 500 }}><FmtVal val={mainVal} numSize={22} /></div>
        </div>
        <div style={{ background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 7, padding: '6px 10px', minWidth: 82, textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>FCST</div>
          <div style={{ fontWeight: 500, color: '#F5A623', marginBottom: 2 }}><FmtVal val={fcstVal} numSize={14} /></div>
          <div style={{ color: fcstVsBudPos ? MINT : RED }}><FmtVal val={fcstVsBudStr} numSize={10} /></div>
        </div>
      </div>

      {/* 구분선 */}
      <div style={{ height: 1, background: '#1e1e1e', marginBottom: 9 }} />

      {/* vs Budget */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#555' }}>Budget</span>
          <span style={{ color: '#888', fontWeight: 500 }}><FmtVal val={budStr} numSize={10} /></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 5, background: '#222', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${vsBudBarPct}%`, background: vsBudPos ? MINT : RED, borderRadius: 3 }} />
          </div>
          <span style={{ fontWeight: 600, color: vsBudPos ? MINT : RED, whiteSpace: 'nowrap', minWidth: 42, textAlign: 'right' }}><FmtVal val={vsBudDiffStr} numSize={10} /></span>
        </div>
      </div>

      {/* vs LY (전년 마감) */}
      <div>
        <div style={{ fontSize: 10, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#555' }}>LY</span>
          <span style={{ color: '#888', fontWeight: 500 }}><FmtVal val={lyStr} numSize={10} /></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 5, background: '#222', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${vsLyBarPct}%`, background: vsLyPos ? MINT : RED, borderRadius: 3 }} />
          </div>
          <span style={{ fontWeight: 600, color: vsLyPos ? MINT : RED, whiteSpace: 'nowrap', minWidth: 42, textAlign: 'right' }}><FmtVal val={vsLyDiffStr} numSize={10} /></span>
        </div>
      </div>
    </div>
  )
}

// 특정 세그먼트(codes)의 어카운트별 픽업 집계 — R/N 절대값 내림차순 상위 8개
function getAccountSummary(segCodes: string[], rows: PickupRow[], year: number, month: number) {
  const map = new Map<string, { rn: number; rev: number }>()
  for (const r of rows) {
    const d = new Date(r.business_date)
    if (d.getFullYear() !== year || d.getMonth() !== month) continue
    if (!segCodes.includes(r.segmentation)) continue
    const acct = r.account_name || '기타'
    const cur = map.get(acct) ?? { rn: 0, rev: 0 }
    map.set(acct, {
      rn:  cur.rn  + (r.pu_nights ?? 0),
      rev: cur.rev + (r.pu_revenue ?? 0),
    })
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, rn: v.rn, adr: v.rn > 0 ? Math.round(v.rev / v.rn) : 0 }))
    .filter(a => a.rn !== 0)
    .sort((a, b) => Math.abs(b.rn) - Math.abs(a.rn))
    .slice(0, 8)
}

export default function RevenueMeetingPage({ hotelId }: RevenueMeetingPageProps) {
  const monthKeys = useMemo(buildMonthKeys, [])
  const [monthKey, setMonthKey] = useState(monthKeys[0])
  const [segOpen, setSegOpen]         = useState(false)
  const [dirModalOpen, setDirModalOpen] = useState(false)

  // Meeting 전용 OTB 날짜 (초기값: 오늘 KST)
  const [meetingOtbDate, setMeetingOtbDate] = useState<string>(() =>
    new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
  )
  // Meeting 전용 vs OTB 날짜 (초기값: 오늘 -7일, otbDates 로드 후 자동 리셋)
  const [meetingVsOtbDate, setMeetingVsOtbDate] = useState<string>(() =>
    subtractDays(new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' }), 7)
  )

  // MeetingPickupBlock에서 올려주는 픽업 요약(Picked up 칩 + KPI) — 날짜 바 우측 표시용
  const [pickupSummary, setPickupSummary] = useState<{
    pickedSegs: { id: string; name: string; color: string; total: number }[]
    puOcc:      number
    puAdr:      number
    totalPuRev: number
    total:      number
  } | null>(null)

  // Picked up 세그먼트 칩 hover 툴팁 (어카운트별 픽업)
  const [hoveredSeg, setHoveredSeg] = useState<{ segId: string; x: number; y: number } | null>(null)

  // 지시사항 — 인라인 추가 패널
  const [inlineOpen,     setInlineOpen]     = useState(false)
  const [inlineContent,  setInlineContent]  = useState('')
  const [inlineDate,     setInlineDate]     = useState(() =>
    new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
  )
  const [inlineAssignee, setInlineAssignee] = useState('')

  // 지시사항 — more 모달 (검색/필터)
  const [searchText, setSearchText] = useState('')
  const [searchDate, setSearchDate] = useState('')

  // 지시사항 — more 모달 추가 폼
  const [addContent,  setAddContent]  = useState('')
  const [addDate,     setAddDate]     = useState(() =>
    new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
  )
  const [addAssignee, setAddAssignee] = useState('')

  const extras  = getDummySectionExtras(monthKey)

  // ── 지시사항 (c11_meeting_directives) ─────────────────────────────────────────
  const { data: directives = [], refetch: refetchDirectives } = useQuery<Directive[]>({
    queryKey: ['meeting-directives', hotelId, monthKey],
    enabled: !!hotelId && !!monthKey,   // hotelId 빈값 시 실행 안 함 (400 방지)
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c11_meeting_directives')
        .select('*')
        .eq('hotel_id', hotelId)
        .eq('month_key', monthKey)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Directive[]
    },
  })

  async function addDirective(content: string, date: string, assignee: string) {
    if (!content.trim()) return
    const { error } = await (supabase as any)
      .from('c11_meeting_directives')
      .insert({ hotel_id: hotelId, month_key: monthKey, content: content.trim(), date, assignee: assignee.trim() || null })
    if (error) { console.error('[addDirective] error:', error); return }
    refetchDirectives()
  }

  async function deleteDirective(id: string) {
    const { error } = await (supabase as any)
      .from('c11_meeting_directives')
      .delete()
      .eq('id', id)
    if (error) { console.error(error); return }
    refetchDirectives()
  }

  async function updateDirectiveStatus(id: string, status: DirectiveStatus) {
    const { error } = await (supabase as any)
      .from('c11_meeting_directives')
      .update({ status })
      .eq('id', id)
    if (error) { console.error('[updateDirectiveStatus] error:', error); return }
    refetchDirectives()
  }

  // ── 헤더 지시사항 캐러셀 (완료 제외, 2개씩 3초 순환) ──────────────────────────────
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [showDoneDirectives, setShowDoneDirectives] = useState(false)   // more 모달: 완료 표시 토글

  const activeDirectives = useMemo(
    () => directives.filter(d => d.status !== '완료'),
    [directives],
  )

  useEffect(() => {
    if (activeDirectives.length <= 2) return
    const timer = setInterval(() => {
      setCarouselIdx(i => (i + 1) % activeDirectives.length)
    }, 3000)
    return () => clearInterval(timer)
  }, [activeDirectives.length])

  // more 모달 목록 필터 (완료 기본 숨김 + 내용/담당자 검색 + 날짜)
  const filteredDirectives = directives.filter(d => {
    if (d.status === '완료' && !showDoneDirectives) return false
    if (searchText && !d.content.toLowerCase().includes(searchText.toLowerCase()) && !(d.assignee ?? '').toLowerCase().includes(searchText.toLowerCase())) return false
    if (searchDate && d.date !== searchDate) return false
    return true
  })

  // ── Market Pick-up 임베드 (MarketPickupPage 패턴 재사용) ──────────────────────
  // 사용 가능한 OTB 스냅샷 날짜 목록 (get_otb_dates RPC — AppLayout과 동일 패턴)
  const { data: otbDates = [] } = useQuery<string[]>({
    queryKey: ['meeting-otb-dates', hotelId],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_otb_dates', { p_hotel_id: hotelId })
      if (error) throw error
      return (data ?? []) as string[]
    },
    enabled: !!hotelId,
  })

  // otbDates 로드 완료 시 초기값 1회 보정: OTB=가장 최근 스냅샷, VS=OTB-7 근접 스냅샷
  // (이후에는 사용자가 날짜 바에서 수동 변경)
  const initializedRef = useRef(false)
  useEffect(() => {
    if (otbDates.length === 0 || initializedRef.current) return
    initializedRef.current = true
    const sorted = [...otbDates].sort()
    const latestOtb = sorted[sorted.length - 1]
    setMeetingOtbDate(latestOtb)
    const target = subtractDays(latestOtb, 7)
    const prev = sorted.filter(d => d <= target)
    if (prev.length > 0) setMeetingVsOtbDate(prev[prev.length - 1])
  }, [otbDates])

  const minDate = otbDates[otbDates.length - 1] ?? ''

  const { data: pickupRows = [] } = useQuery<PickupRow[]>({
    queryKey: ['meeting_pickup_data', hotelId, meetingOtbDate, meetingVsOtbDate, minDate],
    queryFn: async () => {
      if (!hotelId || !meetingOtbDate || !meetingVsOtbDate || !minDate) return []
      const { data, error } = await (supabase as any).rpc('get_pickup_data', {
        p_hotel_id:    hotelId,
        p_otb_date:    meetingOtbDate,
        p_vs_otb_date: meetingVsOtbDate,
        p_min_date:    minDate,
      })
      if (error) throw error
      return data as PickupRow[]
    },
    enabled: !!hotelId && !!meetingOtbDate && !!meetingVsOtbDate && !!minDate,
    staleTime: 5 * 60 * 1000,
  })
  const { data: schema } = useMarketSchema()

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

  // 선택 월(monthKey 'YYYY-MM') → year / month(0-based)
  const [mpYear, mpMonth1] = monthKey.split('-').map(Number)
  const mpMonth0 = mpMonth1 - 1

  // 세그먼트 그룹 (main 노드 → 자식 세그)
  const groups: SegGroup[] = useMemo(() => {
    const mains = schema.filter(s => s.level === 'main' && s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
    return mains
      .map(main => ({
        id: main.id,
        name: main.name,
        segs: schema
          .filter(c => c.parent_id === main.id)
          .sort((a, b) => a.order_index - b.order_index)
          .map(c => ({ id: c.id, name: c.name, color: c.bg_dark_color ?? '#888888', lightColor: c.bg_light_color, fontDarkColor: c.font_dark_color, isBold: c.is_bold, codes: c.segmentation ?? [] })),
      }))
      .filter(g => g.segs.length > 0)
  }, [schema])

  const allSegIds = useMemo(() => new Set(groups.flatMap(g => g.segs.map(s => s.id))), [groups])

  // 세그먼트 선택 상태 (월별 독립, 기본 전체 선택)
  const [selectedSegs, setSelectedSegs] = useState<Record<string, Set<string>>>({})
  const resolveSelected = (mk: string) => selectedSegs[mk] ?? allSegIds
  const onToggleSeg = (mk: string, segId: string) => {
    setSelectedSegs(prev => {
      const cur = new Set(prev[mk] ?? allSegIds)
      if (cur.has(segId)) cur.delete(segId)
      else cur.add(segId)
      return { ...prev, [mk]: cur }
    })
  }

  const [dayModal, setDayModal] = useState<{ year: number; month: number; day: number; defaultTab: 'pickup' | 'otb' } | null>(null)

  // ── KPI 카드 데이터 (OTB=pickupRows / Budget·FCST=기존 RPC / LY=전년 마감 a01) ──
  const daysInMonth = new Date(mpYear, mpMonth0 + 1, 0).getDate()
  const avail = roomCount * daysInMonth

  // OTB — pickupRows 당월 합산
  const otbMonthly = useMemo(() => {
    const rows = pickupRows.filter(r => {
      const d = new Date(r.business_date)
      return d.getFullYear() === mpYear && d.getMonth() === mpMonth0
    })
    const rn  = rows.reduce((s, r) => s + (r.otb_nights ?? 0), 0)
    const rev = rows.reduce((s, r) => s + (r.otb_revenue ?? 0), 0)
    return { rn, rev, adr: rn > 0 ? Math.round(rev / rn) : 0, occ: avail > 0 ? Math.round((rn / avail) * 1000) / 10 : 0 }
  }, [pickupRows, mpYear, mpMonth0, avail])

  // Budget — get_budget_monthly (최신 확정본)
  const { data: budgetDate = null } = useLatestConfirmedBudgetDate(hotelId || undefined)
  const budgetRows = (useBudgetMonthly({ hotelId: hotelId || undefined, year: mpYear, updateDate: budgetDate }).data ?? []) as BudgetMonthlyRow[]
  const budgetAgg = useMemo(() => {
    const rows = budgetRows.filter(r => Number(r.month_num) === mpMonth1)   // month_num이 문자열로 올 수 있어 숫자 비교
    const rn  = rows.reduce((s, r) => s + (r.budget_nights ?? 0), 0)
    const rev = rows.reduce((s, r) => s + (r.budget_revenue ?? 0), 0)
    return { has: rows.length > 0, rn, rev, adr: rn > 0 ? Math.round(rev / rn) : 0, occ: avail > 0 ? Math.round((rn / avail) * 1000) / 10 : 0 }
  }, [budgetRows, mpMonth1, avail])

  // FCST — get_forecast_monthly (fcstDate 컨텍스트)
  const { fcstDate } = useFcstDateContext()
  const fcstRows = (useForecastMonthly({ hotelId: hotelId || undefined, year: mpYear, updateDate: fcstDate || null }).data ?? []) as ForecastMonthlyRow[]
  const fcstAgg = useMemo(() => {
    const rows = fcstRows.filter(r => Number(r.month_num) === mpMonth1)   // month_num이 문자열로 올 수 있어 숫자 비교
    const rn  = rows.reduce((s, r) => s + (r.forecast_nights ?? 0), 0)
    const rev = rows.reduce((s, r) => s + (r.forecast_revenue ?? 0), 0)
    return { has: rows.length > 0, rn, rev, adr: rn > 0 ? Math.round(rev / rn) : 0, occ: avail > 0 ? Math.round((rn / avail) * 1000) / 10 : 0 }
  }, [fcstRows, mpMonth1, avail])

  // LY(전년 마감) — a01_actual_daily 전년 동월
  const lyDaysInMonth = new Date(mpYear - 1, mpMonth0 + 1, 0).getDate()
  const { data: lyRows = [] } = useQuery({
    queryKey: ['meeting-kpi-ly', hotelId, mpYear, mpMonth1],
    enabled: !!hotelId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const start = `${mpYear - 1}-${String(mpMonth1).padStart(2, '0')}-01`
      const end   = `${mpYear - 1}-${String(mpMonth1).padStart(2, '0')}-${String(lyDaysInMonth).padStart(2, '0')}`
      const { data, error } = await (supabase as any).from('a01_actual_daily')
        .select('nights, room_revenue').eq('hotel_id', hotelId)
        .gte('business_date', start).lte('business_date', end)
      if (error) { console.error('[meeting-kpi-ly] error:', error); return [] }
      return (data ?? []) as { nights: number; room_revenue: number }[]
    },
  })
  const lyAgg = useMemo(() => {
    const rn  = lyRows.reduce((s, r) => s + (r.nights ?? 0), 0)
    const rev = lyRows.reduce((s, r) => s + (r.room_revenue ?? 0), 0)
    const lyAvail = roomCount * lyDaysInMonth
    return { has: lyRows.length > 0, rn, rev, adr: rn > 0 ? Math.round(rev / rn) : 0, occ: lyAvail > 0 ? Math.round((rn / lyAvail) * 1000) / 10 : 0 }
  }, [lyRows, roomCount, lyDaysInMonth])

  // ── DEBUG: KPI 최종 상태 ──
  useEffect(() => {
    if (!hotelId) return
    console.log('[KPI Final]', {
      budgetAgg,
      fcstAgg,
      lyAgg,
      otbMonthly,
      budgetRowsLen: (budgetRows ?? []).length,
      fcstRowsLen: (fcstRows ?? []).length,
      lyRowsLen: (lyRows ?? []).length,
    })
  }, [hotelId, budgetAgg, fcstAgg, lyAgg, otbMonthly])

  // ── DEBUG: OTB 픽업 데이터 ──
  useEffect(() => {
    if (!hotelId) return
    const m0 = mpMonth1 - 1
    const filtered = pickupRows.filter(r => {
      const d = new Date(r.business_date)
      return d.getFullYear() === mpYear && d.getMonth() === m0
    })
    console.log('[OTB Debug] pickupRows 전체:', pickupRows.length, '/ 해당월:', filtered.length, '/ mpYear:', mpYear, '/ mpMonth0:', m0)
  }, [hotelId, pickupRows, mpYear, mpMonth1])

  // 지표별 포맷 정의
  const kpiSgn = (v: number) => (v > 0 ? '+' : '')
  const kpiMetrics = [
    { label: 'OCC', otb: otbMonthly.occ, fcst: fcstAgg.occ, bud: budgetAgg.occ, ly: lyAgg.occ,
      fmt: (v: number) => `${v}%`,                                 fmtDiff: (v: number) => `${kpiSgn(v)}${Math.round(v * 10) / 10}%p` },
    { label: 'R·N', otb: otbMonthly.rn,  fcst: fcstAgg.rn,  bud: budgetAgg.rn,  ly: lyAgg.rn,
      fmt: (v: number) => Math.round(v).toLocaleString('ko-KR'),   fmtDiff: (v: number) => `${kpiSgn(v)}${Math.round(v).toLocaleString('ko-KR')}` },
    { label: 'ADR', otb: otbMonthly.adr, fcst: fcstAgg.adr, bud: budgetAgg.adr, ly: lyAgg.adr,
      fmt: (v: number) => `${Math.round(v / 1000)}K`,              fmtDiff: (v: number) => `${kpiSgn(v)}${Math.round(v / 1000)}K` },
    { label: 'REV', otb: otbMonthly.rev, fcst: fcstAgg.rev, bud: budgetAgg.rev, ly: lyAgg.rev,
      fmt: (v: number) => `${(v / 1_000_000).toFixed(1)}M`,        fmtDiff: (v: number) => `${kpiSgn(v)}${(v / 1_000_000).toFixed(1)}M` },
  ]

  return (
    <div style={{ minHeight: '100%', background: BG, padding: 0, color: '#fff' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>

        {/* 좌: 타이틀 + 월 네비게이터 */}
        <div>
          <div style={{ fontSize: 22, fontWeight: 500, marginBottom: 8 }}>Revenue meeting</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setMonthKey(monthKeys[Math.max(0, monthKeys.indexOf(monthKey) - 1)])}
              disabled={monthKeys.indexOf(monthKey) === 0}
              style={{
                width: 24, height: 24, borderRadius: 5, border: 'none',
                background: '#1a1a1a', color: '#888', cursor: 'pointer',
                fontSize: 14, opacity: monthKeys.indexOf(monthKey) === 0 ? 0.3 : 1,
              }}
            >‹</button>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', minWidth: 90, textAlign: 'center' }}>
              {monthKeyLabel(monthKey)}
            </div>
            <button
              onClick={() => setMonthKey(monthKeys[Math.min(monthKeys.length - 1, monthKeys.indexOf(monthKey) + 1)])}
              disabled={monthKeys.indexOf(monthKey) === monthKeys.length - 1}
              style={{
                width: 24, height: 24, borderRadius: 5, border: 'none',
                background: '#1a1a1a', color: '#888', cursor: 'pointer',
                fontSize: 14, opacity: monthKeys.indexOf(monthKey) === monthKeys.length - 1 ? 0.3 : 1,
              }}
            >›</button>
          </div>
        </div>

        {/* 헤더 우측: 지시사항 섹션 */}
        <div style={{ marginLeft: 'auto', minWidth: 280, maxWidth: 400, marginTop: 4 }}>
          <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* 좌: 라벨 */}
            <span>지시사항</span>
            {/* 우: 버튼 그룹 나란히 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => { console.log('[directive] + 추가 클릭, inlineOpen:', inlineOpen); setInlineOpen(v => !v) }}
                style={{ fontSize: 10, color: '#888', border: '1px solid #2a2a2a', background: inlineOpen ? '#1a1a1a' : 'transparent', borderRadius: 4, padding: '1px 7px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                + 추가
              </button>
              <button
                onClick={() => setDirModalOpen(true)}
                style={{ fontSize: 10, color: MINT, border: '1px solid rgba(0,229,160,0.3)', background: 'transparent', borderRadius: 4, padding: '1px 7px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                more
              </button>
            </div>
          </div>

          {/* 캐러셀 카드 — 완료 제외 항목 2개씩 순환 */}
          {activeDirectives.length === 0 ? (
            <div style={{ border: '1px solid #1e1e1e', borderRadius: 7, padding: '7px 10px', background: CARD, fontSize: 11, color: '#444' }}>
              등록된 지시사항이 없습니다
            </div>
          ) : (
            <div style={{ border: '1px solid #1e1e1e', borderRadius: 7, padding: '7px 10px', background: CARD, minHeight: 52 }}>
              {[0, 1].map(offset => {
                if (offset >= activeDirectives.length) return null   // 활성 1개면 중복 렌더 방지
                const d = activeDirectives[(carouselIdx + offset) % activeDirectives.length]
                if (!d) return null
                return (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '3px 0', fontSize: 11, color: '#ccc', overflow: 'hidden',
                    borderBottom: offset === 0 ? '1px solid #1a1a1a' : 'none',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: DIRECTIVE_STATUS_COLOR[d.status], flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{d.content}</span>
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0,
                      color: DIRECTIVE_STATUS_COLOR[d.status],
                      background: `${DIRECTIVE_STATUS_COLOR[d.status]}1a`,
                      border: `1px solid ${DIRECTIVE_STATUS_COLOR[d.status]}44`,
                    }}>
                      {d.status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* 인라인 입력창 */}
          {inlineOpen && (
            <div style={{
              marginTop: 8,
              background: '#0f1f17',
              border: '1px solid #1a3028',
              borderRadius: 8,
              padding: '10px 12px',
            }}>
              {/* 지시사항 내용 라벨 + textarea */}
              <div style={{ fontSize: 9, color: '#555', marginBottom: 4 }}>지시사항 내용</div>
              <textarea
                value={inlineContent}
                onChange={e => setInlineContent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setInlineOpen(false); setInlineContent('') }
                }}
                placeholder="회의 중 지시사항을 입력하세요..."
                rows={2}
                autoFocus
                style={{
                  width: '100%', background: '#141414',
                  border: '1px solid #2a3a2a', borderRadius: 6,
                  padding: '8px 10px', fontSize: 12, color: '#ccc',
                  resize: 'none', fontFamily: 'inherit', outline: 'none',
                  lineHeight: 1.5,
                }}
              />
              {/* 날짜 + 담당자 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                <div>
                  <div style={{ fontSize: 9, color: '#555', marginBottom: 3 }}>날짜</div>
                  <input
                    type="date"
                    value={inlineDate}
                    onChange={e => setInlineDate(e.target.value)}
                    style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 5, padding: '5px 8px', fontSize: 11, color: '#ccc', fontFamily: 'inherit', outline: 'none', width: '100%', colorScheme: 'dark' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#555', marginBottom: 3 }}>담당자</div>
                  <input
                    value={inlineAssignee}
                    onChange={e => setInlineAssignee(e.target.value)}
                    placeholder="담당자 이름"
                    style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 5, padding: '5px 8px', fontSize: 11, color: '#ccc', fontFamily: 'inherit', outline: 'none', width: '100%' }}
                  />
                </div>
              </div>
              {/* 버튼 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5, marginTop: 8 }}>
                <button
                  onClick={() => { setInlineOpen(false); setInlineContent('') }}
                  style={{ fontSize: 11, padding: '4px 12px', borderRadius: 5, border: 'none', background: '#1a1a1a', color: '#666', cursor: 'pointer', fontFamily: 'inherit' }}
                >취소</button>
                <button
                  onClick={async () => {
                    if (!inlineContent.trim()) return
                    console.log('[directive] 저장 시도:', { inlineContent, inlineDate, inlineAssignee, hotelId, monthKey })
                    await addDirective(inlineContent, inlineDate, inlineAssignee)
                    setInlineContent('')
                    setInlineAssignee('')
                    setInlineOpen(false)
                  }}
                  style={{ fontSize: 11, padding: '4px 12px', borderRadius: 5, border: 'none', background: '#00E5A0', color: '#0a0a0a', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                >저장</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 지시사항 전체 모달 */}
      {dirModalOpen && (
        <div onClick={() => setDirModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#141414', borderRadius: 10, border: '1px solid #1e1e1e', width: 520, maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}>

            {/* 헤더 */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>지시사항 전체 — {monthKeyLabel(monthKey)}</span>
              <button onClick={() => setDirModalOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            {/* 검색 필터 바 */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #1e1e1e', display: 'flex', gap: 6, flexShrink: 0 }}>
              <input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="🔍  내용 / 담당자 검색..."
                style={{ flex: 1, background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#ccc', fontFamily: 'inherit', outline: 'none' }}
              />
              <input
                type="date"
                value={searchDate}
                onChange={e => setSearchDate(e.target.value)}
                style={{ background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#ccc', fontFamily: 'inherit', outline: 'none', width: 140, colorScheme: 'dark' }}
              />
              {(searchText || searchDate) && (
                <button onClick={() => { setSearchText(''); setSearchDate('') }} style={{ fontSize: 10, color: '#555', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>초기화</button>
              )}
              <button
                onClick={() => setShowDoneDirectives(v => !v)}
                style={{
                  fontSize: 10, color: showDoneDirectives ? MINT : '#555',
                  border: `1px solid ${showDoneDirectives ? 'rgba(0,229,160,0.3)' : '#2a2a2a'}`,
                  background: 'transparent', borderRadius: 5, padding: '4px 8px',
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
              >
                {showDoneDirectives ? '완료 숨기기' : '완료 표시'}
              </button>
            </div>

            {/* 목록 */}
            <div style={{ padding: '10px 16px', overflowY: 'auto', flex: 1 }}>
              {filteredDirectives.map(d => (
                  <div key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#ccc', marginBottom: 4 }}>{d.content}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: '#555' }}>날짜 <span style={{ color: '#888' }}>{d.date}</span></span>
                        {d.assignee && <>
                          <span style={{ color: '#333' }}>·</span>
                          <span style={{ fontSize: 10, color: '#555' }}>담당 <span style={{ color: '#888' }}>{d.assignee}</span></span>
                        </>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {/* 상태 버튼 — 클릭 시 다음 상태로 순환 */}
                      <button
                        onClick={() => {
                          const cur = DIRECTIVE_STATUS.indexOf(d.status)
                          const next = DIRECTIVE_STATUS[(cur + 1) % DIRECTIVE_STATUS.length]
                          updateDirectiveStatus(d.id, next)
                        }}
                        style={{
                          fontSize: 10, padding: '2px 7px', borderRadius: 4,
                          border: `1px solid ${DIRECTIVE_STATUS_COLOR[d.status]}`,
                          color: DIRECTIVE_STATUS_COLOR[d.status],
                          background: `${DIRECTIVE_STATUS_COLOR[d.status]}1a`,
                          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}
                      >
                        {d.status}
                      </button>
                      {/* 삭제 버튼 */}
                      <button
                        onClick={() => deleteDirective(d.id)}
                        style={{ fontSize: 11, color: '#333', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 3, flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#E24B4A'; e.currentTarget.style.background = '#1a0f0f' }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#333'; e.currentTarget.style.background = 'none' }}
                      >✕</button>
                    </div>
                  </div>
                ))
              }
              {filteredDirectives.length === 0 && (
                <div style={{ fontSize: 12, color: '#444', textAlign: 'center', padding: '24px 0' }}>검색 결과가 없습니다</div>
              )}
            </div>

            {/* 추가 영역 */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid #1e1e1e', background: '#0f0f0f', borderRadius: '0 0 10px 10px', flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: '#555', marginBottom: 6 }}>새 지시사항 추가</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 110px', gap: 6, marginBottom: 6 }}>
                <input
                  value={addContent}
                  onChange={e => setAddContent(e.target.value)}
                  placeholder="지시사항 내용..."
                  style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 5, padding: '5px 8px', fontSize: 11, color: '#ccc', fontFamily: 'inherit', outline: 'none' }}
                />
                <input
                  type="date"
                  value={addDate}
                  onChange={e => setAddDate(e.target.value)}
                  style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 5, padding: '5px 8px', fontSize: 11, color: '#ccc', fontFamily: 'inherit', outline: 'none', colorScheme: 'dark' }}
                />
                <input
                  value={addAssignee}
                  onChange={e => setAddAssignee(e.target.value)}
                  placeholder="담당자"
                  style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 5, padding: '5px 8px', fontSize: 11, color: '#ccc', fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button onClick={() => { setAddContent(''); setAddAssignee('') }} style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: 'none', background: '#1e1e1e', color: '#666', cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                <button
                  onClick={() => { addDirective(addContent, addDate, addAssignee); setAddContent(''); setAddAssignee('') }}
                  style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: 'none', background: MINT, color: '#0a0a0a', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                >저장</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Meeting 전용 날짜 바 ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '8px 14px',
        background: '#0d0d0d',
        borderRadius: 8,
        marginBottom: 16,
      }}>
        {/* OTB DatePicker — 스냅샷 날짜만 선택 가능 */}
        <DatePicker
          label="OTB"
          value={meetingOtbDate}
          onChange={setMeetingOtbDate}
          accent
          bare
          availableDates={otbDates}
        />

        {/* 구분선 */}
        <div style={{ width: 1, height: 16, background: '#2a2a2a' }} />

        {/* vs OTB DatePicker — OTB 이전 스냅샷 날짜만 선택 가능 */}
        <DatePicker
          label="VS OTB"
          value={meetingVsOtbDate}
          onChange={setMeetingVsOtbDate}
          bare
          availableDates={otbDates.filter(d => d < meetingOtbDate)}
        />

      </div>

      {/* ② 월간 요약 KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {kpiMetrics.map(m => (
          <KpiCard
            key={m.label}
            label={m.label}
            mainVal={m.fmt(m.otb)}
            fcstVal={fcstAgg.has ? m.fmt(m.fcst) : '—'}
            fcstVsBudStr={fcstAgg.has && budgetAgg.has ? `vs Bud ${m.fmtDiff(m.fcst - m.bud)}` : '—'}
            fcstVsBudPos={m.fcst - m.bud >= 0}
            budStr={budgetAgg.has ? m.fmt(m.bud) : '—'}
            lyStr={lyAgg.has ? m.fmt(m.ly) : '—'}
            vsBudDiffStr={budgetAgg.has ? m.fmtDiff(m.otb - m.bud) : '—'}
            vsBudBarPct={barPct(m.otb, m.bud)}
            vsBudPos={m.otb - m.bud >= 0}
            vsLyDiffStr={lyAgg.has ? m.fmtDiff(m.otb - m.ly) : '—'}
            vsLyBarPct={barPct(m.otb, m.ly)}
            vsLyPos={m.otb - m.ly >= 0}
          />
        ))}
      </div>

      {/* ③ Market Pick-up 임베드 */}
      <div style={{ height: 440, marginBottom: 16 }}>
        <MeetingPickupBlock
          year={mpYear}
          month={mpMonth0}
          monthKey={monthKey}
          pickupRows={pickupRows}
          groups={groups}
          selected={resolveSelected(monthKey)}
          onToggleSeg={(segId) => onToggleSeg(monthKey, segId)}
          onBarClick={(day, defaultTab) => setDayModal({ year: mpYear, month: mpMonth0, day, defaultTab })}
          roomCount={roomCount}
          allSegIds={allSegIds}
          isDayModalOpen={!!dayModal}
          onSummaryChange={setPickupSummary}
        />
      </div>

      {/* ④ 2열 그리드: 픽업 / 온북 ─────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>

        {/* 일주일간의 픽업 */}
        <div style={{ background: CARD, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: TXT3, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: MINT, fontSize: 14 }}>↑</span> 일주일간의 픽업
          </div>
          {extras.pickup7.map(p => (
            <div key={p.date} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '5px 0', borderBottom: '1px solid #1e1e1e', fontSize: 12,
            }}>
              <span style={{ color: '#666' }}>{p.date}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#fff', fontWeight: 500 }}>{p.rn > 0 ? '+' : ''}{p.rn} R/N</span>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: p.rn >= 0 ? '#0f2a1e' : '#2a0f0f',
                  color: p.rn >= 0 ? MINT : RED,
                }}>
                  {p.rn > 0 ? '+' : ''}{p.rn}
                </span>
              </div>
            </div>
          ))}
          {/* 7일 합계 */}
          {(() => {
            const total = extras.pickup7.reduce((s, p) => s + p.rn, 0)
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11 }}>
                <span style={{ color: '#666' }}>7일 합계</span>
                <span style={{ color: total >= 0 ? MINT : RED, fontWeight: 500 }}>
                  {total > 0 ? '+' : ''}{total} R/N
                </span>
              </div>
            )
          })()}
        </div>

        {/* 현재 온북 (OTB) */}
        <div style={{ background: CARD, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: TXT3, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: MINT, fontSize: 14 }}>◎</span> 현재 온북 (OTB)
          </div>
          {/* 미니 KPI 3칸 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
            {[
              { label: 'OCC%', val: `${extras.otbKpi.occ}%`,     lyVal: `LY ${extras.otbKpi.lyOcc}%`,     color: BLUE },
              { label: 'ADR',  val: fmtAdr(extras.otbKpi.adr),   lyVal: `LY ${fmtAdr(extras.otbKpi.lyAdr)}`, color: '#fff' },
              { label: 'REV',  val: fmtRevM(extras.otbKpi.rev),  lyVal: `LY ${fmtRevM(extras.otbKpi.lyRev)}`, color: MINT },
            ].map(k => (
              <div key={k.label} style={{ background: '#0f0f0f', borderRadius: 6, padding: '7px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#555', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontWeight: 500, color: k.color }}><FmtVal val={k.val} numSize={14} /></div>
                <div style={{ fontSize: 9, color: '#555', marginTop: 1 }}>{k.lyVal}</div>
              </div>
            ))}
          </div>
          {/* 바차트 */}
          <div style={{ fontSize: 9, color: '#555', marginBottom: 4 }}>남은 날짜별 OTB R/N</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 55 }}>
            {extras.otbDays.map(d => {
              const ROOM_COUNT = 72
              const pct = d.rn / ROOM_COUNT
              const barH = Math.max(3, Math.round(pct * 55))
              const barColor = pct >= 0.8 ? BLUE : pct >= 0.65 ? MINT : '#2a3a2a'
              return (
                <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '100%', height: `${barH}px`, background: barColor, borderRadius: '2px 2px 0 0' }} />
                  {extras.otbDays.length <= 16 && (
                    <div style={{ fontSize: 7, color: '#444', marginTop: 1 }}>{d.day}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ⑤ 전망 (Forecast) — 전체 너비 ──────────────────────────────── */}
      <div style={{ background: CARD, borderRadius: 10, padding: 14, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: TXT3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: MINT, fontSize: 14 }}>↗</span> 전망 (Forecast vs Budget)
          </div>
          <button onClick={() => setSegOpen(true)} style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 6,
            background: '#0f2a1e', border: '1px solid #1a3a28', color: MINT, cursor: 'pointer',
          }}>
            세그먼트 상세 보기
          </button>
        </div>
        {/* 상단 KPI 4칸 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'FCST OCC',    val: `${extras.fcstKpi.fcstOcc}%`,             color: '#fff' },
            { label: 'vs BUDGET',   val: `${extras.fcstKpi.vsBudgetOccPp > 0 ? '+' : ''}${extras.fcstKpi.vsBudgetOccPp}%p`, color: dColor(extras.fcstKpi.vsBudgetOccPp) },
            { label: 'FCST REV',    val: fmtRevM(extras.fcstKpi.fcstRev),          color: '#fff' },
            { label: 'vs BUDGET',   val: `${extras.fcstKpi.vsBudgetRevPct > 0 ? '+' : ''}${extras.fcstKpi.vsBudgetRevPct}%`, color: dColor(extras.fcstKpi.vsBudgetRevPct) },
          ].map((k, i) => (
            <div key={i} style={{ background: '#0f0f0f', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#555', marginBottom: 2 }}>{k.label}</div>
              <div style={{ fontWeight: 500, color: k.color }}><FmtVal val={k.val} numSize={15} /></div>
            </div>
          ))}
        </div>
        {/* 세그먼트 행 */}
        <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>세그먼트별 FCST vs BUDGET</div>
        {extras.fcstSegs.map(s => (
          <div key={s.seg} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '5px 0', borderBottom: '1px solid #1a1a1a', fontSize: 12,
          }}>
            <span style={{ color: '#888', width: 60 }}>{s.seg}</span>
            <span style={{ fontWeight: 500 }}>{s.fcstOcc}%</span>
            <span style={{ color: '#666', fontSize: 11 }}>{s.fcstRn.toLocaleString('ko-KR')} R/N</span>
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 4,
              background: s.gapVsBudget >= 0 ? '#0f2a1e' : '#2a0f0f',
              color: s.gapVsBudget >= 0 ? MINT : RED,
            }}>
              {s.gapVsBudget > 0 ? '+' : ''}{s.gapVsBudget}%p
            </span>
          </div>
        ))}
      </div>

      {/* Market Pick-up — Day 모달 */}
      <MarketPickupDayModal
        open={!!dayModal}
        onClose={() => setDayModal(null)}
        year={dayModal?.year ?? mpYear}
        month={dayModal?.month ?? mpMonth0}
        day={dayModal?.day ?? 1}
        schema={schema}
        pickupRows={pickupRows}
        roomCount={roomCount}
        defaultTab={dayModal?.defaultTab ?? 'pickup'}
        otbDate={meetingOtbDate}
        vsDate={meetingVsOtbDate}
        otbDates={otbDates ?? []}
        onDateChange={(newOtb, newVs) => { setMeetingOtbDate(newOtb); setMeetingVsOtbDate(newVs) }}
      />

      {/* 세그먼트 상세 풀스크린 모달 */}
      <SegmentDetailModal open={segOpen} onClose={() => setSegOpen(false)} hotelId={hotelId} monthKey={monthKey} />

      {/* Picked up 칩 hover 툴팁 — 어카운트별 픽업 */}
      {hoveredSeg && (() => {
        const seg = pickupSummary?.pickedSegs.find(s => s.id === hoveredSeg.segId)
        if (!seg) return null
        const segLeaf = groups.flatMap(g => g.segs).find(s => s.id === hoveredSeg.segId)
        if (!segLeaf) return null
        const accounts = getAccountSummary(segLeaf.codes, pickupRows, mpYear, mpMonth0)
        if (accounts.length === 0) return null

        // 화면 밖으로 나가면 왼쪽으로 정렬
        const TIP_W = 240
        const left = Math.max(8, Math.min(hoveredSeg.x, window.innerWidth - TIP_W - 8))

        return (
          <div
            style={{
              position: 'fixed',
              top: hoveredSeg.y,
              left,
              zIndex: 9999,
              background: '#0a0a0a',
              border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '10px 14px',
              minWidth: 220,
              maxWidth: TIP_W,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: 11, color: '#555', marginBottom: 8, borderBottom: '0.5px solid #1e1e1e', paddingBottom: 6 }}>
              {seg.name} — 어카운트별 픽업
            </div>
            {accounts.map(a => (
              <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '3px 0', fontSize: 11 }}>
                <span style={{ color: '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <span style={{ color: a.rn >= 0 ? '#00E5A0' : '#E24B4A', fontWeight: 500, minWidth: 40, textAlign: 'right' }}>
                  {a.rn > 0 ? '+' : ''}{a.rn}
                </span>
                <span style={{ color: '#555', minWidth: 50, textAlign: 'right' }}>
                  <FmtVal val={`${Math.round(a.adr / 1000)}K`} numSize={11} />
                </span>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
