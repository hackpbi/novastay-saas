'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useForecastMonthly } from '@/hooks/useForecastMonthly'
import { useBudgetMonthly } from '@/hooks/useBudgetMonthly'
import { useFcstDateContext } from '@/contexts/FcstDateContext'
import { useLatestConfirmedBudgetDate } from '@/hooks/useLatestConfirmedBudgetDate'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import type { PickupRow } from '@/hooks/usePickupData'
import type { SegGroup } from './MeetingPickupBlock'
import { monthKeyLabel } from './dummyMeetingData'
import { FmtVal } from '@/utils/FmtVal'
import AccountComparisonModal from './AccountComparisonModal'
import SegmentYoyModal from './SegmentYoyModal'
import DatePicker from '@/components/DatePicker'

interface SegmentDetailModalProps {
  open:       boolean
  onClose:    () => void
  hotelId:    string
  monthKey:   string   // 'YYYY-MM'
  pickupRows: PickupRow[]
  roomCount:  number
  groups:     SegGroup[]
}

// ── 디자인 토큰 ──────────────────────────────────────────────────────────────────
const BG       = '#0a0a0a'
const CARD     = '#141414'
const BOLD_BG  = '#0f1d18'
const MINT     = '#00E5A0'
const RED      = '#E24B4A'
const TXT3     = '#888'
const GROUP_SHADOW = 'inset 1px 0 0 rgba(0,229,160,0.3)'
const BORDER_SUBTLE = '0.5px solid rgba(255,255,255,0.06)'

// 그룹 교차 배경/색상 (OTB·FCST·BUDGET·LY·GAP) — FCST/LY만 은은한 하이라이트
const GROUP_BG = { otb: 'transparent', fcst: 'rgba(255,255,255,0.02)', budget: 'transparent', ly: 'rgba(255,255,255,0.02)', gap: 'transparent' } as const
// sticky 헤더/서브헤더는 반투명이면 스크롤 내용이 비치므로 불투명 합성색(#131313 + 2% white ≈ #181818) 사용
const GROUP_BG_HEADER = { otb: '#161a1f', fcst: '#1b2026', budget: '#161a1f', ly: '#1b2026', gap: '#161a1f' } as const
const GROUP_COLOR = { otb: '#5B8DEF', fcst: '#F5A623', budget: '#aaaaaa', ly: '#B57EDC', gap: MINT } as const

type Cell = { rn: number; adr: number; rev: number }
type SegRow = {
  id: string
  name: string
  isBold: boolean
  indent: boolean
  codes: string[]
  bgColor: string | null      // bg_dark_color (null이면 기본값 사용)
  fontColor: string | null    // font_dark_color (null이면 기본값 사용)
}
type CodeMap = Map<string, { rn: number; rev: number }>
type GapBase    = 'otb' | 'fcst'
type GapCompare = 'budget' | 'ly'
type LyMode     = 'match' | 'date'

// ── 회의록(c12_meeting_notes) / 지시사항(c11_meeting_directives) ─────────────────
type MeetingNote = {
  id:           string
  hotel_id:     string
  month_key:    string
  title:        string | null
  content:      string
  meeting_date: string | null   // 'YYYY-MM-DD'
  author:       string | null
  created_at:   string
  updated_at:   string
}
type Directive = {
  id: string; hotel_id: string; month_key: string; content: string
  assignee: string | null; date: string
  status: '진행중' | '연장' | '보류' | '완료'; created_at: string
}
const DIRECTIVE_STATUS = ['진행중', '연장', '보류', '완료'] as const
const DIRECTIVE_STATUS_COLOR: Record<string, string> = {
  '진행중': '#5B8DEF', '연장': '#F5A623', '보류': '#888888', '완료': '#00E5A0',
}
const todayKST = () => new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })

// ── 포맷 ─────────────────────────────────────────────────────────────────────────
const fmtRn  = (v: number) => (v === 0 ? '-' : v.toLocaleString('ko-KR'))
const fmtAdr = (v: number) => (v === 0 ? '-' : `${Math.round(v / 1000)}K`)
const fmtRev = (v: number) => (v === 0 ? '-' : `${(v / 1_000_000).toFixed(1)}M`)
const fmtGapRn  = (v: number) => (v === 0 ? '-' : `${v > 0 ? '+' : ''}${v.toLocaleString('ko-KR')}`)
const fmtGapAdr = (v: number) => (v === 0 ? '-' : `${v > 0 ? '+' : ''}${Math.round(v / 1000)}K`)
const fmtGapRev = (v: number) => (v === 0 ? '-' : `${v > 0 ? '+' : ''}${(v / 1_000_000).toFixed(1)}M`)
const gapColor  = (v: number) => (v > 0 ? MINT : v < 0 ? RED : TXT3)

// 세그먼트 코드 목록으로 각 데이터소스에서 합산
function aggByCodes(codes: string[], map: CodeMap): Cell {
  let rn = 0, rev = 0
  for (const c of codes) { const v = map.get(c); if (v) { rn += v.rn; rev += v.rev } }
  return { rn, adr: rn > 0 ? Math.round(rev / rn) : 0, rev }
}

const th: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
  color: TXT3, padding: '8px 4px', background: '#161a1f', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, textAlign: 'right', zIndex: 1,
}
const td: React.CSSProperties = {
  fontSize: 11, padding: '8px 4px', textAlign: 'right', whiteSpace: 'nowrap',
  borderBottom: BORDER_SUBTLE,
}

// 헤더 우측 액션 버튼 (UI only — 추후 기능 연결)
const btnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
  borderRadius: 6, border: '1px solid #2a2a2a', background: 'transparent',
  color: '#888', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
  transition: 'all 0.15s',
}
const hoverIn = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.borderColor = '#00E5A0'
  e.currentTarget.style.color = '#00E5A0'
  e.currentTarget.style.background = 'rgba(0,229,160,0.08)'
}
const hoverOut = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.borderColor = '#2a2a2a'
  e.currentTarget.style.color = '#888'
  e.currentTarget.style.background = 'transparent'
}

export default function SegmentDetailModal({ open, onClose, hotelId, monthKey, pickupRows, roomCount, groups }: SegmentDetailModalProps) {
  const [lyMode,    setLyMode]    = useState<LyMode>('match')
  const [gapBase,   setGapBase]   = useState<GapBase>('otb')
  const [gapCompare, setGapCompare] = useState<GapCompare>('budget')
  const gapBaseRef = useRef<HTMLSpanElement>(null)
  const gapCmpRef  = useRef<HTMLSpanElement>(null)
  const [gapBasePos, setGapBasePos] = useState<{ x: number; y: number } | null>(null)
  const [gapCmpPos,  setGapCmpPos]  = useState<{ x: number; y: number } | null>(null)
  const [acctOpen, setAcctOpen] = useState(false)
  const [yoyOpen, setYoyOpen] = useState(false)
  const [fontScale, setFontScale] = useState(1)   // 모달 열 때마다 1.0

  const decFont = () => setFontScale(s => Math.max(0.7, Math.round((s - 0.1) * 10) / 10))
  const incFont = () => setFontScale(s => Math.min(1.5, Math.round((s + 0.1) * 10) / 10))

  // ── 회의록(c12_meeting_notes) ───────────────────────────────────────────────────
  const [noteFrom, setNoteFrom] = useState(`${monthKey}-01`)
  const [noteTo,   setNoteTo]   = useState(`${monthKey}-31`)
  const [selNoteId, setSelNoteId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDate,  setEditDate]  = useState(todayKST())
  const [editBody,  setEditBody]  = useState('')

  const { data: notes = [], refetch: refetchNotes } = useQuery<MeetingNote[]>({
    queryKey: ['seg-meeting-notes', hotelId, noteFrom, noteTo],
    enabled: !!hotelId && open,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('c12_meeting_notes')
        .select('*')
        .eq('hotel_id', hotelId)
        .gte('meeting_date', noteFrom)
        .lte('meeting_date', noteTo)
        .order('meeting_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as MeetingNote[]
    },
  })
  const loadNote = (n: MeetingNote) => {
    setSelNoteId(n.id)
    setEditTitle(n.title ?? '')
    setEditDate(n.meeting_date ?? todayKST())
    setEditBody(n.content ?? '')
  }
  const newNote = () => { setSelNoteId(null); setEditTitle(''); setEditDate(todayKST()); setEditBody('') }
  const saveNote = async () => {
    if (selNoteId) {
      const { error } = await (supabase as any).from('c12_meeting_notes')
        .update({ title: editTitle.trim() || null, content: editBody, meeting_date: editDate })
        .eq('id', selNoteId)
      if (error) { console.error(error); return }
    } else {
      const { data, error } = await (supabase as any).from('c12_meeting_notes')
        .insert({ hotel_id: hotelId, month_key: monthKey, title: editTitle.trim() || null, content: editBody, meeting_date: editDate })
        .select().single()
      if (error) { console.error(error); return }
      if (data) setSelNoteId(data.id)
    }
    refetchNotes()
  }
  const deleteNote = async () => {
    if (!selNoteId) return
    const { error } = await (supabase as any).from('c12_meeting_notes').delete().eq('id', selNoteId)
    if (error) { console.error(error); return }
    newNote(); refetchNotes()
  }

  // ── 지시사항(c11_meeting_directives) — RevenueMeetingPage와 동일 queryKey(캐시 공유) ──
  const [inlineOpen,     setInlineOpen]     = useState(false)
  const [inlineContent,  setInlineContent]  = useState('')
  const [inlineDate,     setInlineDate]     = useState(todayKST())
  const [inlineAssignee, setInlineAssignee] = useState('')

  const { data: directives = [], refetch: refetchDirectives } = useQuery<Directive[]>({
    queryKey: ['meeting-directives', hotelId, monthKey],
    enabled: !!hotelId && !!monthKey && open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('c11_meeting_directives')
        .select('*').eq('hotel_id', hotelId).eq('month_key', monthKey)
        .order('date', { ascending: false }).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Directive[]
    },
  })
  const addDirective = async (content: string, date: string, assignee: string) => {
    if (!content.trim()) return
    const { error } = await (supabase as any).from('c11_meeting_directives')
      .insert({ hotel_id: hotelId, month_key: monthKey, content: content.trim(), date, assignee: assignee.trim() || null })
    if (error) { console.error('[addDirective] error:', error); return }
    refetchDirectives()
  }
  const deleteDirective = async (id: string) => {
    const { error } = await (supabase as any).from('c11_meeting_directives').delete().eq('id', id)
    if (error) { console.error(error); return }
    refetchDirectives()
  }
  const updateDirectiveStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).from('c11_meeting_directives').update({ status }).eq('id', id)
    if (error) { console.error('[updateDirectiveStatus] error:', error); return }
    refetchDirectives()
  }

  const handleGapBaseClick = () => {
    if (gapBasePos) { setGapBasePos(null); return }
    setGapCmpPos(null)
    const rect = gapBaseRef.current?.getBoundingClientRect()
    if (rect) setGapBasePos({ x: rect.left, y: rect.bottom + 4 })
  }

  const handleGapCmpClick = () => {
    if (gapCmpPos) { setGapCmpPos(null); return }
    setGapBasePos(null)
    const rect = gapCmpRef.current?.getBoundingClientRect()
    if (rect) setGapCmpPos({ x: rect.left, y: rect.bottom + 4 })
  }

  // GAP 드롭다운 외부 클릭 시 닫힘
  useEffect(() => {
    if (!gapBasePos && !gapCmpPos) return

    const handleClick = () => {
      setGapBasePos(null)
      setGapCmpPos(null)
    }

    // 다음 틱에 등록 (현재 클릭 이벤트 무시)
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [gapBasePos, gapCmpPos])

  const [year, month] = monthKey.split('-').map(Number)   // month: 1-based

  // 세그먼트 스키마 (자식 없는 단독 main = Comp/House Use 포함) — groups는 자식 있는 main만이라 직접 조회
  const { data: schema = [] } = useMarketSchema()

  // FCST / BUDGET (기존 훅 재사용) — 세그먼트별 월 데이터
  const { fcstDate } = useFcstDateContext()
  const { data: budgetDate = null } = useLatestConfirmedBudgetDate(hotelId || undefined)
  const { data: fcstRows = [] }   = useForecastMonthly({ hotelId, year, updateDate: fcstDate })
  const { data: budgetRows = [] } = useBudgetMonthly({ hotelId, year, updateDate: budgetDate })

  // LY (a01_actual_daily) — lyMode: date=전년동일자(-1년) / match=전년동기간(c06 yoy_match)
  const { data: lyRows = [] } = useQuery({
    queryKey: ['seg-detail-ly', hotelId, monthKey, lyMode],
    enabled: !!hotelId && !!monthKey && open,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      if (lyMode === 'date') {
        const lyYear = year - 1
        const start = `${lyYear}-${String(month).padStart(2, '0')}-01`
        const end   = `${lyYear}-${String(month).padStart(2, '0')}-31`
        const { data, error } = await (supabase as any)
          .from('a01_actual_daily')
          .select('segmentation, nights, room_revenue')
          .eq('hotel_id', hotelId)
          .gte('business_date', start).lte('business_date', end)
        if (error) throw error
        return (data ?? []) as any[]
      }
      // match: c06_calendar.yoy_match → a01_actual_daily
      const calStart = `${year}-${String(month).padStart(2, '0')}-01`
      const calEnd   = `${year}-${String(month).padStart(2, '0')}-31`
      const { data: calRows, error: calErr } = await (supabase as any)
        .from('c06_calendar')
        .select('date, yoy_match')
        .gte('date', calStart).lte('date', calEnd)
      if (calErr) throw calErr
      const lyDates = (calRows ?? []).map((r: any) => r.yoy_match).filter(Boolean) as string[]
      if (lyDates.length === 0) return [] as any[]
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily')
        .select('segmentation, nights, room_revenue')
        .eq('hotel_id', hotelId)
        .in('business_date', lyDates)
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  // ── 세그먼트 코드별 집계 Map ─────────────────────────────────────────────────────
  const otbByCode = useMemo<CodeMap>(() => {
    const map: CodeMap = new Map()
    for (const r of pickupRows) {
      const d = new Date(r.business_date)
      if (d.getFullYear() !== year || d.getMonth() !== month - 1) continue
      const cur = map.get(r.segmentation) ?? { rn: 0, rev: 0 }
      map.set(r.segmentation, { rn: cur.rn + (r.otb_nights ?? 0), rev: cur.rev + (r.otb_revenue ?? 0) })
    }
    return map
  }, [pickupRows, year, month])

  const fcstByCode = useMemo<CodeMap>(() => {
    const map: CodeMap = new Map()
    for (const r of fcstRows) {
      if (Number(r.month_num) !== month) continue
      const cur = map.get(r.segmentation) ?? { rn: 0, rev: 0 }
      map.set(r.segmentation, { rn: cur.rn + (r.forecast_nights ?? 0), rev: cur.rev + (r.forecast_revenue ?? 0) })
    }
    return map
  }, [fcstRows, month])

  const budgetByCode = useMemo<CodeMap>(() => {
    const map: CodeMap = new Map()
    for (const r of budgetRows) {
      if (Number(r.month_num) !== month) continue
      const cur = map.get(r.segmentation) ?? { rn: 0, rev: 0 }
      map.set(r.segmentation, { rn: cur.rn + (r.budget_nights ?? 0), rev: cur.rev + (r.budget_revenue ?? 0) })
    }
    return map
  }, [budgetRows, month])

  const lyByCode = useMemo<CodeMap>(() => {
    const map: CodeMap = new Map()
    for (const r of lyRows as any[]) {
      const cur = map.get(r.segmentation) ?? { rn: 0, rev: 0 }
      map.set(r.segmentation, { rn: cur.rn + (r.nights ?? 0), rev: cur.rev + (r.room_revenue ?? 0) })
    }
    return map
  }, [lyRows])

  // ── 세그먼트 트리 → 평탄화 (부모 bold + 자식 indent) ──
  // parent_id === null 최상위 노드 전체(level 무관)를 순회 — Comp/House Use 등 main이 아닌 독립 노드도 포함
  // (ActualBudgetDetailModal의 orderedSchema 컨벤션과 동일)
  const rows = useMemo<SegRow[]>(() => {
    const topLevel = schema.filter(s => s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
    const out: SegRow[] = []
    for (const top of topLevel) {
      const children = top.level === 'main'
        ? schema.filter(c => c.parent_id === top.id).sort((a, b) => a.order_index - b.order_index)
        : []
      if (children.length > 0) {
        out.push({
          id: top.id, name: top.name, isBold: true, indent: false,
          codes: children.flatMap(c => c.segmentation ?? []),
          bgColor: top.bg_dark_color ?? null,
          fontColor: top.font_dark_color ?? null,
        })
        for (const c of children) out.push({
          id: c.id, name: c.name, isBold: false, indent: true,
          codes: c.segmentation ?? [],
          bgColor: null,       // 자식 행은 배경색 없음
          fontColor: null,     // 자식 행은 폰트색 기본값 사용
        })
      } else {
        out.push({
          id: top.id, name: top.name, isBold: true, indent: false,
          codes: top.segmentation ?? [],
          bgColor: top.bg_dark_color ?? null,
          fontColor: top.font_dark_color ?? null,
        })
      }
    }
    return out
  }, [schema])

  // 표 본문 폰트 배율 적용본 (모듈스코프 td/th 상수에 fontScale 곱)
  const tdS = useMemo(() => ({ ...td, fontSize: 11 * fontScale, padding: `${Math.round(8 * fontScale)}px 4px` }), [fontScale])
  const thS = useMemo(() => ({ ...th, fontSize: 10 * fontScale, padding: `${Math.round(8 * fontScale)}px 4px` }), [fontScale])
  const numSizeS = 11 * fontScale

  // body scroll lock + ESC
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  if (!open) return null

  const daysInMonth = new Date(year, month, 0).getDate()
  const avail = roomCount * daysInMonth

  const otbOf    = (r: SegRow): Cell => aggByCodes(r.codes, otbByCode)
  const fcstOf   = (r: SegRow): Cell => aggByCodes(r.codes, fcstByCode)
  const budgetOf = (r: SegRow): Cell => aggByCodes(r.codes, budgetByCode)
  const lyOf     = (r: SegRow): Cell => aggByCodes(r.codes, lyByCode)
  const baseOf   = (r: SegRow): Cell => (gapBase === 'otb' ? otbOf(r) : fcstOf(r))
  const compOf   = (r: SegRow): Cell => (gapCompare === 'budget' ? budgetOf(r) : lyOf(r))


  // 합계 (HOU 제외) — 부모(자식 합산) 행 제외, HOU 세그 제외, leaf(sub)만 합산
  const isParent = (i: number) => rows[i].isBold && !!rows[i + 1]?.indent
  const isHou = (r: SegRow) => r.codes.includes('HOU')
  const sumGroup = (pick: (r: SegRow) => Cell): Cell => {
    let rn = 0, rev = 0
    rows.forEach((r, i) => { if (!isParent(i) && !isHou(r)) { const c = pick(r); rn += c.rn; rev += c.rev } })
    return { rn, rev, adr: rn > 0 ? Math.round(rev / rn) : 0 }
  }
  const totOtb    = sumGroup(otbOf)
  const totFcst   = sumGroup(fcstOf)
  const totBudget = sumGroup(budgetOf)
  const totLy     = sumGroup(lyOf)
  const totBase   = gapBase === 'otb' ? totOtb : totFcst
  const totComp   = gapCompare === 'budget' ? totBudget : totLy
  const occOf    = (rn: number) => (avail > 0 ? ((rn / avail) * 100).toFixed(1) : '0') + '%'
  const revparOf = (rev: number) => (avail > 0 ? Math.round(rev / avail).toLocaleString('ko-KR') : '—')

  // 그룹 cells 렌더 (R/N, ADR, REV) — 첫 셀에 그룹 구분선
  const groupCells = (c: Cell, color?: string, bold?: boolean, bg?: string) => (
    <>
      <td style={{ ...tdS, boxShadow: GROUP_SHADOW, color, fontWeight: bold ? 600 : 400, background: bg }} className="font-mono">{fmtRn(c.rn)}</td>
      <td style={{ ...tdS, color, fontWeight: bold ? 600 : 400, background: bg }} className="font-mono"><FmtVal val={fmtAdr(c.adr)} numSize={numSizeS} /></td>
      <td style={{ ...tdS, color, fontWeight: bold ? 600 : 400, background: bg }} className="font-mono"><FmtVal val={fmtRev(c.rev)} numSize={numSizeS} /></td>
    </>
  )
  const gapCells = (b: Cell, cmp: Cell, bold?: boolean, bg?: string) => {
    const gRn = b.rn - cmp.rn, gAdr = b.adr - cmp.adr, gRev = b.rev - cmp.rev
    return (
      <>
        <td style={{ ...tdS, boxShadow: GROUP_SHADOW, color: gapColor(gRn), fontWeight: bold ? 600 : 500, background: bg }} className="font-mono">{fmtGapRn(gRn)}</td>
        <td style={{ ...tdS, color: gapColor(gAdr), fontWeight: bold ? 600 : 500, background: bg }} className="font-mono"><FmtVal val={fmtGapAdr(gAdr)} numSize={numSizeS} /></td>
        <td style={{ ...tdS, color: gapColor(gRev), fontWeight: bold ? 600 : 500, background: bg }} className="font-mono"><FmtVal val={fmtGapRev(gRev)} numSize={numSizeS} /></td>
      </>
    )
  }

  const Pill = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} style={{
      fontSize: 11, padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
      background: active ? MINT : 'transparent', color: active ? '#0a2018' : TXT3, fontWeight: active ? 600 : 400,
    }}>{children}</button>
  )
  const groupTh = (label: string, sub?: string, bg: string = '#161a1f', color: string = '#fff') => (
    <th colSpan={3} style={{ ...thS, textAlign: 'center', boxShadow: GROUP_SHADOW, color, background: bg, borderBottom: `2px solid ${color}` }}>
      {label}{sub && <span style={{ color: TXT3, fontWeight: 400 }}> · {sub}</span>}
    </th>
  )

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '95%', maxWidth: 1600, height: '100vh', background: BG, borderRadius: 10, border: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', borderBottom: BORDER_SUBTLE, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>세그먼트 상세 — {monthKeyLabel(monthKey)}</div>
        </div>
        {/* 기존 닫기 버튼 */}
        <button onClick={onClose} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 14px',
          borderRadius: 8, border: 'none', background: CARD, color: '#ccc', cursor: 'pointer',
        }}>
          <X size={16} /> 닫기
        </button>
      </div>

      {/* 표 상단 우측 액션 버튼 그룹 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, padding: '8px 24px 0', flexShrink: 0 }}>
        {/* 표 폰트 배율 A- / A+ */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 6 }}>
          <button onClick={decFont} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, width: 26, height: 26, borderRadius: 6,
            border: '1px solid #2a2a2a', background: 'transparent', color: '#888',
            cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
          }}>A-</button>
          <span style={{ fontSize: 10, color: TXT3, minWidth: 30, textAlign: 'center', fontFamily: 'monospace' }}>
            {Math.round(fontScale * 100)}%
          </span>
          <button onClick={incFont} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, width: 26, height: 26, borderRadius: 6,
            border: '1px solid #2a2a2a', background: 'transparent', color: '#888',
            cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
          }}>A+</button>
        </div>
        {/* YoY (전년 비교) */}
        <button onClick={() => setYoyOpen(true)} style={btnStyle} onMouseEnter={e => hoverIn(e)} onMouseLeave={e => hoverOut(e)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 13, height: 13 }}>
            <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
          </svg>
          YoY
        </button>
        {/* Accounts */}
        <button onClick={() => setAcctOpen(true)} style={btnStyle} onMouseEnter={e => hoverIn(e)} onMouseLeave={e => hoverOut(e)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 13, height: 13 }}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Accounts
        </button>

        {/* Daily Status */}
        <button onClick={() => {}} style={btnStyle} onMouseEnter={e => hoverIn(e)} onMouseLeave={e => hoverOut(e)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 13, height: 13 }}>
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          Daily
        </button>

        {/* BAR Rate */}
        <button onClick={() => {}} style={btnStyle} onMouseEnter={e => hoverIn(e)} onMouseLeave={e => hoverOut(e)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 13, height: 13 }}>
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          BAR Rate
        </button>

        {/* PU Required */}
        <button onClick={() => {}} style={btnStyle} onMouseEnter={e => hoverIn(e)} onMouseLeave={e => hoverOut(e)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 13, height: 13 }}>
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          PU Required
        </button>
      </div>

      {/* 테이블 */}
      <div style={{ flex: 1, minHeight: 0, padding: '8px 20px 10px' }}>
        <div style={{ height: '100%', overflow: 'auto', background: '#111418', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
        <table style={{ minWidth: 980, borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...thS, padding: `${Math.round(8 * fontScale)}px 8px`, textAlign: 'left', position: 'sticky', left: 0, width: 170, minWidth: 170, zIndex: 2 }}>SEGMENTATION</th>
              {groupTh('OTB', undefined, GROUP_BG_HEADER.otb, GROUP_COLOR.otb)}
              {groupTh('FCST', undefined, GROUP_BG_HEADER.fcst, GROUP_COLOR.fcst)}
              {groupTh('BUDGET', undefined, GROUP_BG_HEADER.budget, GROUP_COLOR.budget)}
              <th colSpan={3} style={{ ...thS, textAlign: 'center', boxShadow: GROUP_SHADOW, color: GROUP_COLOR.ly, background: GROUP_BG_HEADER.ly, borderBottom: `2px solid ${GROUP_COLOR.ly}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ color: GROUP_COLOR.ly }}>LY</span>
                  <span style={{ color: '#2a2a2a' }}>·</span>
                  <span
                    onClick={() => setLyMode('match')}
                    style={{
                      cursor: 'pointer',
                      color: lyMode === 'match' ? '#00E5A0' : '#444',
                      fontWeight: lyMode === 'match' ? 600 : 400,
                      borderBottom: lyMode === 'match' ? '1px solid #00E5A0' : '1px solid transparent',
                      paddingBottom: 1,
                      fontSize: 10,
                    }}
                  >
                    YoY Match
                  </span>
                  <span style={{ color: '#333' }}>/</span>
                  <span
                    onClick={() => setLyMode('date')}
                    style={{
                      cursor: 'pointer',
                      color: lyMode === 'date' ? '#00E5A0' : '#444',
                      fontWeight: lyMode === 'date' ? 600 : 400,
                      borderBottom: lyMode === 'date' ? '1px solid #00E5A0' : '1px solid transparent',
                      paddingBottom: 1,
                      fontSize: 10,
                    }}
                  >
                    Same Date
                  </span>
                </div>
              </th>
              <th colSpan={3} style={{ ...thS, textAlign: 'center', boxShadow: GROUP_SHADOW, color: GROUP_COLOR.gap, minWidth: 240, borderBottom: `2px solid ${GROUP_COLOR.gap}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ color: GROUP_COLOR.gap }}>GAP</span>
                  <span style={{ color: '#2a2a2a' }}>·</span>

                  {/* 기준 — OTB/FCST */}
                  <span
                    ref={gapBaseRef}
                    onClick={handleGapBaseClick}
                    style={{
                      cursor: 'pointer', color: '#ccc', fontWeight: 500, fontSize: 10,
                      borderBottom: '1px solid #555', paddingBottom: 1,
                    }}
                  >
                    {gapBase.toUpperCase()} ▾
                  </span>

                  <span style={{ color: '#555', fontSize: 9 }}>vs</span>

                  {/* 비교대상 — BUDGET/LY */}
                  <span
                    ref={gapCmpRef}
                    onClick={handleGapCmpClick}
                    style={{
                      cursor: 'pointer', color: '#ccc', fontWeight: 500, fontSize: 10,
                      borderBottom: '1px solid #555', paddingBottom: 1,
                    }}
                  >
                    {gapCompare.toUpperCase()} ▾
                  </span>
                </div>

                {/* GAP 기준 드롭다운 — body 포탈 */}
                {gapBasePos && createPortal(
                    <div
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      style={{
                      position: 'fixed', top: gapBasePos.y, left: gapBasePos.x, zIndex: 99999,
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6,
                      overflow: 'hidden', minWidth: 80, boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    }}>
                      {(['otb', 'fcst'] as const).map(v => (
                        <div
                          key={v}
                          onClick={() => { setGapBase(v); setGapBasePos(null) }}
                          style={{
                            padding: '7px 12px', fontSize: 12, cursor: 'pointer',
                            color: gapBase === v ? '#00E5A0' : '#ccc',
                            background: gapBase === v ? 'rgba(0,229,160,0.08)' : 'transparent',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.background = gapBase === v ? 'rgba(0,229,160,0.08)' : 'transparent')}
                        >
                          {v.toUpperCase()}
                        </div>
                      ))}
                    </div>,
                  document.body
                )}

                {/* GAP 비교대상 드롭다운 — body 포탈 */}
                {gapCmpPos && createPortal(
                    <div
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      style={{
                      position: 'fixed', top: gapCmpPos.y, left: gapCmpPos.x, zIndex: 99999,
                      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6,
                      overflow: 'hidden', minWidth: 90, boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    }}>
                      {(['budget', 'ly'] as const).map(v => (
                        <div
                          key={v}
                          onClick={() => { setGapCompare(v); setGapCmpPos(null) }}
                          style={{
                            padding: '7px 12px', fontSize: 12, cursor: 'pointer',
                            color: gapCompare === v ? '#00E5A0' : '#ccc',
                            background: gapCompare === v ? 'rgba(0,229,160,0.08)' : 'transparent',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.background = gapCompare === v ? 'rgba(0,229,160,0.08)' : 'transparent')}
                        >
                          {v.toUpperCase()}
                        </div>
                      ))}
                    </div>,
                  document.body
                )}
              </th>
            </tr>
            <tr>
              {['OTB', 'FCST', 'BUDGET', 'LY', 'GAP'].map(g => (
                ['R/N', 'ADR', 'REV'].map((s, si) => (
                  <th key={`${g}-${s}`} style={{ ...thS, width: 80, minWidth: 80, background: GROUP_BG_HEADER[g.toLowerCase() as keyof typeof GROUP_BG_HEADER], ...(si === 0 ? { boxShadow: GROUP_SHADOW } : {}) }}>{s}</th>
                ))
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // 배경: schema bg_dark_color 우선, 없으면 isBold → BOLD_BG, 자식 → 'transparent'
              const rowBg = r.bgColor ?? (r.isBold ? BOLD_BG : 'transparent')
              // 이름 색: schema font_dark_color 우선, 없으면 indent → '#999', bold → '#fff'
              const nameColor = r.fontColor ?? (r.indent ? '#999' : '#fff')
              // 숫자 셀 색: 부모(bold)는 schema 색상(없으면 흰색), 자식은 회색(#888)
              const numColor = r.isBold ? (r.fontColor ?? '#fff') : '#888'
              // 숫자 셀 배경: schema bg_dark_color 우선, 없으면 bold → BOLD_BG, 자식 → undefined(투명)
              const numBg = r.bgColor ?? (r.isBold ? BOLD_BG : undefined)
              const otb = otbOf(r), fcst = fcstOf(r), budget = budgetOf(r), ly = lyOf(r)
              return (
                <tr key={r.id} style={{ background: rowBg }}>
                  <td style={{ ...tdS, padding: `${Math.round(8 * fontScale)}px 8px`, textAlign: 'left', position: 'sticky', left: 0, background: r.bgColor ?? (r.isBold ? BOLD_BG : BG), fontWeight: r.isBold ? 700 : 400, color: nameColor, minWidth: 170 }}>
                    {r.indent ? <><span style={{ color: '#555', marginRight: 4 }}>└</span>{r.name}</> : r.name}
                  </td>
                  {groupCells(otb,    numColor, r.isBold, numBg)}
                  {groupCells(fcst,   numColor, r.isBold, numBg)}
                  {groupCells(budget, numColor, r.isBold, numBg)}
                  {groupCells(ly,     numColor, r.isBold, numBg)}
                  {gapCells(baseOf(r), compOf(r), r.isBold, numBg)}
                </tr>
              )
            })}
            {/* 합계 (HOU 제외) */}
            <tr style={{ background: '#0e1216' }}>
              <td style={{ ...tdS, padding: `${Math.round(8 * fontScale)}px 8px`, textAlign: 'left', position: 'sticky', left: 0, background: '#0e1216', fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.1)' }}>합계 (HOU 제외)</td>
              {([
                { c: totOtb, g: 'otb' as const },
                { c: totFcst, g: 'fcst' as const },
                { c: totBudget, g: 'budget' as const },
                { c: totLy, g: 'ly' as const },
              ]).map(({ c, g }, i) => (
                <GroupTotal key={i} c={c} bg={GROUP_BG[g]} color={GROUP_COLOR[g]} tdStyle={tdS} numSize={numSizeS} />
              ))}
              {(() => {
                const gRn = totBase.rn - totComp.rn, gAdr = totBase.adr - totComp.adr, gRev = totBase.rev - totComp.rev
                return (
                  <>
                    <td style={{ ...tdS, boxShadow: GROUP_SHADOW, background: GROUP_BG.gap, color: gapColor(gRn), fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtGapRn(gRn)}</td>
                    <td style={{ ...tdS, background: GROUP_BG.gap, color: gapColor(gAdr), fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono"><FmtVal val={fmtGapAdr(gAdr)} numSize={numSizeS} /></td>
                    <td style={{ ...tdS, background: GROUP_BG.gap, color: gapColor(gRev), fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono"><FmtVal val={fmtGapRev(gRev)} numSize={numSizeS} /></td>
                  </>
                )
              })()}
            </tr>
            {/* OCC */}
            <tr style={{ background: '#0e1216' }}>
              <td style={{ ...tdS, padding: `${Math.round(8 * fontScale)}px 8px`, textAlign: 'left', position: 'sticky', left: 0, background: '#0e1216', fontWeight: 600, color: TXT3 }}>OCC</td>
              <td colSpan={3} style={{ ...tdS, boxShadow: GROUP_SHADOW, background: GROUP_BG.otb, textAlign: 'center', color: GROUP_COLOR.otb, fontWeight: 600 }}>{occOf(totOtb.rn)}</td>
              <td colSpan={3} style={{ ...tdS, boxShadow: GROUP_SHADOW, background: GROUP_BG.fcst, textAlign: 'center', color: GROUP_COLOR.fcst, fontWeight: 600 }}>{occOf(totFcst.rn)}</td>
              <td colSpan={3} style={{ ...tdS, boxShadow: GROUP_SHADOW, background: GROUP_BG.budget, textAlign: 'center', color: GROUP_COLOR.budget, fontWeight: 600 }}>{occOf(totBudget.rn)}</td>
              <td colSpan={3} style={{ ...tdS, boxShadow: GROUP_SHADOW, background: GROUP_BG.ly, textAlign: 'center', color: GROUP_COLOR.ly, fontWeight: 600 }}>{occOf(totLy.rn)}</td>
              <td colSpan={3} style={{ ...tdS, boxShadow: GROUP_SHADOW, background: GROUP_BG.gap, textAlign: 'center', color: '#555' }}>—</td>
            </tr>
            {/* Rev.PAR */}
            <tr style={{ background: '#0e1216' }}>
              <td style={{ ...tdS, padding: `${Math.round(8 * fontScale)}px 8px`, textAlign: 'left', position: 'sticky', left: 0, background: '#0e1216', fontWeight: 600, color: TXT3 }}>Rev.PAR</td>
              <td colSpan={3} style={{ ...tdS, boxShadow: GROUP_SHADOW, background: GROUP_BG.otb, textAlign: 'center', color: GROUP_COLOR.otb, fontWeight: 600 }}>{revparOf(totOtb.rev)}</td>
              <td colSpan={3} style={{ ...tdS, boxShadow: GROUP_SHADOW, background: GROUP_BG.fcst, textAlign: 'center', color: GROUP_COLOR.fcst, fontWeight: 600 }}>{revparOf(totFcst.rev)}</td>
              <td colSpan={3} style={{ ...tdS, boxShadow: GROUP_SHADOW, background: GROUP_BG.budget, textAlign: 'center', color: GROUP_COLOR.budget, fontWeight: 600 }}>{revparOf(totBudget.rev)}</td>
              <td colSpan={3} style={{ ...tdS, boxShadow: GROUP_SHADOW, background: GROUP_BG.ly, textAlign: 'center', color: GROUP_COLOR.ly, fontWeight: 600 }}>{revparOf(totLy.rev)}</td>
              <td colSpan={3} style={{ ...tdS, boxShadow: GROUP_SHADOW, background: GROUP_BG.gap, textAlign: 'center', color: '#555' }}>—</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      {/* 하단 패널 — 회의록 목록 · 편집 · 지시사항 */}
      <div style={{ flexShrink: 0, height: 255, display: 'flex', gap: 12, padding: '0 20px 14px' }}>

        {/* ① 회의록 목록 */}
        <div style={{ flex: 1.1, background: '#111418', border: BORDER_SUBTLE, borderRadius: 10, padding: '12px 13px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#ddd' }}>회의록 목록</span>
            <button onClick={newNote} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,229,160,0.3)', background: 'rgba(0,229,160,0.08)', color: MINT, cursor: 'pointer' }}>+ 새 회의록</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 10, color: TXT3 }}>
            <DatePicker label="시작" value={noteFrom} onChange={setNoteFrom} bare plain fontPx={10} />
            <span>~</span>
            <DatePicker label="종료" value={noteTo} onChange={setNoteTo} bare plain fontPx={10} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {notes.length === 0 ? (
              <div style={{ fontSize: 11, color: '#555', textAlign: 'center', padding: '16px 0' }}>회의록이 없습니다</div>
            ) : notes.map(n => {
              const active = selNoteId === n.id
              return (
                <div key={n.id} onClick={() => loadNote(n)} style={{
                  padding: '7px 9px', borderRadius: 7, cursor: 'pointer',
                  background: active ? 'rgba(0,229,160,0.08)' : '#0c0f13',
                  border: `1px solid ${active ? 'rgba(0,229,160,0.3)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#eee', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title || '(제목 없음)'}</div>
                  <div style={{ fontSize: 9, color: TXT3, marginTop: 2 }}>{n.meeting_date ?? '-'}{n.author ? ` · ${n.author}` : ''}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ② 회의록 편집 */}
        <div style={{ flex: 1.9, background: '#111418', border: BORDER_SUBTLE, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#ddd' }}>회의록 편집</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {selNoteId && (
                <button onClick={deleteNote} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(226,75,74,0.35)', background: 'rgba(226,75,74,0.08)', color: RED, cursor: 'pointer' }}>삭제</button>
              )}
              <button onClick={saveNote} style={{ fontSize: 10, padding: '4px 12px', borderRadius: 6, border: 'none', background: MINT, color: '#0a2018', fontWeight: 600, cursor: 'pointer' }}>저장</button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder="제목"
              style={{ flex: 1, fontSize: 12, padding: '6px 9px', borderRadius: 6, background: '#0c0f13', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', outline: 'none', fontFamily: 'inherit', minWidth: 0 }}
            />
            <div style={{ fontSize: 10, color: TXT3, flexShrink: 0 }}>
              <DatePicker label="날짜" value={editDate} onChange={setEditDate} bare plain fontPx={10} />
            </div>
          </div>
          <textarea
            value={editBody}
            onChange={e => setEditBody(e.target.value)}
            placeholder="회의 내용을 입력하세요..."
            style={{ flex: 1, fontSize: 12, lineHeight: 1.6, padding: '9px 11px', borderRadius: 8, background: '#0c0f13', border: '1px solid rgba(255,255,255,0.08)', color: '#eee', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {/* ③ 지시사항 */}
        <div style={{ flex: 1.1, background: '#111418', border: BORDER_SUBTLE, borderRadius: 10, padding: '12px 13px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#ddd' }}>지시사항</span>
            <button onClick={() => setInlineOpen(v => !v)} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,229,160,0.3)', background: 'rgba(0,229,160,0.08)', color: MINT, cursor: 'pointer' }}>{inlineOpen ? '닫기' : '+ 추가'}</button>
          </div>
          {inlineOpen && (
            <div style={{ marginBottom: 8, padding: 9, borderRadius: 8, background: '#0c0f13', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                value={inlineContent}
                onChange={e => setInlineContent(e.target.value)}
                placeholder="지시사항 내용..."
                style={{ fontSize: 11, lineHeight: 1.5, padding: '6px 8px', borderRadius: 6, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', color: '#eee', outline: 'none', resize: 'none', fontFamily: 'inherit', minHeight: 44 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 10, color: TXT3 }}>
                  <DatePicker label="날짜" value={inlineDate} onChange={setInlineDate} bare plain fontPx={10} />
                </div>
                <input
                  value={inlineAssignee}
                  onChange={e => setInlineAssignee(e.target.value)}
                  placeholder="담당자"
                  style={{ flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 6, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', outline: 'none', fontFamily: 'inherit', minWidth: 0 }}
                />
                <button
                  onClick={async () => { await addDirective(inlineContent, inlineDate, inlineAssignee); setInlineContent(''); setInlineAssignee('') }}
                  style={{ fontSize: 10, padding: '5px 12px', borderRadius: 6, border: 'none', background: MINT, color: '#0a2018', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                >저장</button>
              </div>
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {directives.length === 0 ? (
              <div style={{ fontSize: 11, color: '#555', textAlign: 'center', padding: '16px 0' }}>지시사항이 없습니다</div>
            ) : directives.map(d => {
              const col = DIRECTIVE_STATUS_COLOR[d.status] ?? '#888'
              const cycleStatus = () => {
                const idx = DIRECTIVE_STATUS.indexOf(d.status as typeof DIRECTIVE_STATUS[number])
                updateDirectiveStatus(d.id, DIRECTIVE_STATUS[(idx + 1) % DIRECTIVE_STATUS.length])
              }
              return (
                <div key={d.id} style={{ padding: '7px 9px', borderRadius: 7, background: '#0c0f13', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: '#eee', lineHeight: 1.4, wordBreak: 'break-word' }}>{d.content}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span onClick={cycleStatus} style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4, cursor: 'pointer', color: col, background: `${col}26` }}>{d.status}</span>
                      <span style={{ fontSize: 9, color: TXT3 }}>{d.date}{d.assignee ? ` · ${d.assignee}` : ''}</span>
                      <button onClick={() => deleteDirective(d.id)} style={{ marginLeft: 'auto', fontSize: 9, color: '#555', background: 'transparent', border: 'none', cursor: 'pointer' }}>×</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
      </div>
      {acctOpen && (
        <AccountComparisonModal
          open={acctOpen}
          onClose={() => setAcctOpen(false)}
          hotelId={hotelId}
          monthKey={monthKey}
          pickupRows={pickupRows}
          roomCount={roomCount}
        />
      )}
      {yoyOpen && (
        <SegmentYoyModal
          open={yoyOpen}
          onClose={() => setYoyOpen(false)}
          hotelId={hotelId}
          monthKey={monthKey}
          pickupRows={pickupRows}
          roomCount={roomCount}
          groups={groups}
        />
      )}
    </div>,
    document.body,
  )
}

// 합계 행의 그룹 셀 (R/N, ADR, REV)
function GroupTotal({ c, bg, color, tdStyle, numSize }: { c: Cell; bg: string; color: string; tdStyle: React.CSSProperties; numSize: number }) {
  return (
    <>
      <td style={{ ...tdStyle, boxShadow: GROUP_SHADOW, background: bg, fontWeight: 700, color, borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtRn(c.rn)}</td>
      <td style={{ ...tdStyle, background: bg, fontWeight: 700, color, borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono"><FmtVal val={fmtAdr(c.adr)} numSize={numSize} /></td>
      <td style={{ ...tdStyle, background: bg, fontWeight: 700, color, borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono"><FmtVal val={fmtRev(c.rev)} numSize={numSize} /></td>
    </>
  )
}
