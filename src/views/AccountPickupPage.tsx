'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart2, ChevronDown, Coins, FileSpreadsheet, TrendingUp, Users } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { supabase } from '@/lib/supabase'
import { useAccountPickupData, type AccountRow } from '@/hooks/useAccountPickupData'
import { type SegmentOption } from '@/components/country-pickup/types'
import AccountPickupDownloadModal from '@/components/account-pickup/AccountPickupDownloadModal'

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
  segmentation: string
  otbRn:  number
  lyRn:   number
  otbRev: number
  lyRev:  number
  puRn:   number   // 미래월=픽업 R/N, 과거월=gap R/N
  puRev:  number   // 미래월=픽업 REV, 과거월=gap REV
  vsRn:   number   // 미래월=vs(어제 OTB) R/N — PU ADR 계산용 (과거월=0)
  vsRev:  number
}

function normalize(rows: AccountRow[], isPastMonth: boolean): NormRow[] {
  return rows.map(r => {
    if (isPastMonth) {
      const a = r as any
      return {
        account_name: a.account_name, seg_name: a.seg_name, segmentation: a.segmentation,
        otbRn: a.act_nights ?? 0, lyRn: a.ly_nights ?? 0,
        otbRev: a.act_revenue ?? 0, lyRev: a.ly_revenue ?? 0,
        puRn: a.gap_nights ?? 0, puRev: a.gap_revenue ?? 0,
        vsRn: 0, vsRev: 0,   // 과거월은 vs(픽업) 없음
      }
    }
    const a = r as any
    return {
      account_name: a.account_name, seg_name: a.seg_name, segmentation: a.segmentation,
      // LY 표시는 항상 ly_nights/ly_revenue (vs_*는 픽업 계산 전용)
      otbRn: a.otb_nights ?? 0, lyRn: a.ly_nights ?? 0,
      otbRev: a.otb_revenue ?? 0, lyRev: a.ly_revenue ?? 0,
      puRn: a.pu_nights ?? 0, puRev: a.pu_revenue ?? 0,
      vsRn: a.vs_nights ?? 0, vsRev: a.vs_revenue ?? 0,
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
// ─── 세그먼트 드롭다운 (FIT/GRP) — 다중선택 · CountryPickupPage와 동일 ─────────────
function SegDropdown({ label, segs, selected, activeSegs, onApply }: {
  label: string; segs: { code: string; name: string }[]; selected: Set<string>; activeSegs: Set<string>
  onApply: (segs: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  // 드롭다운 열릴 때 현재 선택값(해당 그룹분)으로 temp 초기화
  useEffect(() => {
    if (open) setTempSelected(new Set(segs.filter(s => selected.has(s.code)).map(s => s.code)))
  }, [open])   // eslint-disable-line react-hooks/exhaustive-deps
  const toggleTemp = (code: string) => setTempSelected(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n })
  const hasSel = segs.some(s => selected.has(s.code))
  const allSel = segs.length > 0 && segs.every(s => selected.has(s.code))

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 3,
          border: hasSel ? (allSel ? '0.5px solid #00E5A0' : '0.5px solid #60A5FA') : '0.5px solid var(--color-border-default)',
          background: hasSel ? (allSel ? 'rgba(0,229,160,0.08)' : 'rgba(96,165,250,0.08)') : 'transparent',
          color: hasSel ? (allSel ? '#00B883' : '#60A5FA') : 'var(--color-text-secondary)',
        }}
      >
        {label} <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200, background: '#0a0a0a', border: '0.5px solid #333', borderRadius: 8, width: 'max-content', minWidth: 200, maxWidth: 360, whiteSpace: 'nowrap', boxShadow: '0 6px 20px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: 6 }}>
          {segs.length === 0 ? (
            <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--color-text-secondary)' }}>없음</div>
          ) : segs.map(s => {
            const on = tempSelected.has(s.code)
            const isActive = activeSegs.has(s.code)
            return (
              <div key={s.code} onClick={() => isActive && toggleTemp(s.code)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 5, cursor: isActive ? 'pointer' : 'not-allowed', opacity: isActive ? 1 : 0.4, fontSize: 11, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}
                onMouseEnter={e => { if (isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, border: on ? 'none' : '1.5px solid #444', background: on ? '#00E5A0' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#000' }}>{on ? '✓' : ''}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, width: '100%' }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{s.name}{!isActive ? ' · no data' : ''}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{s.code}</span>
                </div>
              </div>
            )
          })}
          </div>
          {/* Reset / All / Done */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: '0.5px solid #333', background: '#0a0a0a' }}>
            <button onClick={() => setTempSelected(new Set())} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '0.5px solid #333', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Reset</button>
            <button onClick={() => setTempSelected(new Set(segs.filter(s => activeSegs.has(s.code)).map(s => s.code)))} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '0.5px solid #333', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>All</button>
            <button onClick={() => { onApply([...tempSelected]); setOpen(false) }} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', background: '#00E5A0', color: '#0a0a0a', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── KPI 카드 배경 (canvas 글로우+파티클 / SVG 파도 / 상승 바차트) — 데코, zIndex -1 ──
function KpiCardBg({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement> }) {
  return (
    <>
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: -1 }} />
      {/* 파도 곡선 */}
      <svg viewBox="0 0 220 100" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 0, right: 0, width: 220, height: 100, opacity: 0.35, pointerEvents: 'none', zIndex: -1 }}>
        <path d="M0,58 Q55,40 110,54 T220,48" fill="none" stroke="#4488cc" strokeWidth={2} />
        <path d="M0,70 Q55,54 110,66 T220,62" fill="none" stroke="#3366aa" strokeWidth={1.4} />
        <path d="M0,82 Q55,68 110,78 T220,76" fill="none" stroke="#2255aa" strokeWidth={1} />
      </svg>
      {/* 상승 바 차트 */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', alignItems: 'flex-end', gap: 3, opacity: 0.5, pointerEvents: 'none', zIndex: -1 }}>
        {[18, 24, 20, 32, 28, 38, 44, 52, 48, 60].map((h, i) => (
          <div key={i} style={{ width: 6, height: h, background: 'linear-gradient(to top, #1a4a8a, #3a7bd5)', borderRadius: '2px 2px 0 0' }} />
        ))}
      </div>
    </>
  )
}

// ─── 페이지 ──────────────────────────────────────────────────────────────────────
export default function AccountPickupPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate, vsOtbDate } = useDateContext()

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

  const [segFilter] = useState<string | null>(null)  // RPC는 항상 NULL — 필터는 클라이언트(seg_name)
  const [selectedSegs, setSelectedSegs] = useState<Set<string>>(new Set())  // 선택된 seg_name 집합
  const [showing, setShowing] = useState(15)
  const [sortBy, setSortBy] = useState<'otb' | 'yoy'>('otb')   // 테이블 정렬 기준
  const [showDownloadModal, setShowDownloadModal] = useState(false)

  // SegDropdown Done(onApply) — 해당 그룹(picked)만 selectedSegs에 반영 (다른 그룹 보존)
  const applySegGroup = (groupCodes: string[], picked: string[]) => {
    setSelectedSegs(prev => {
      const next = new Set(prev)
      groupCodes.forEach(c => next.delete(c))
      picked.forEach(c => next.add(c))
      return next
    })
    setShowing(15)
  }
  const handleSelectAll = () => { setSelectedSegs(new Set()); setShowing(15) }

  // ─── 세그먼트 전체 목록 (c05_market_table_schema, order_index ASC) — CountryPickupPage와 동일 ───
  const [segmentOptions, setSegmentOptions] = useState<SegmentOption[]>([])
  useEffect(() => {
    if (!hotelId) return
    ;(supabase as any)
      .from('c05_market_table_schema')
      .select('segmentation, name, sorting2, order_index')
      .eq('hotel_id', hotelId)
      .not('segmentation', 'eq', '{}')   // 빈 배열(상위 그룹 row) 제외
      .order('order_index', { ascending: true })
      .then(({ data: schemaData }: any) => {
        if (!schemaData) return
        const options: SegmentOption[] = []
        schemaData.forEach((row: any) => {
          let segs: string[] = []
          try {
            segs = Array.isArray(row.segmentation) ? row.segmentation : JSON.parse(row.segmentation ?? '[]')
          } catch { segs = [] }
          const s2 = String(row.sorting2 ?? '').toLowerCase()
          const norm = s2.includes('fit')
            ? 'fit'
            : (s2.includes('grp') || s2.includes('group'))
            ? 'group'
            : s2
          segs.forEach(seg => {
            if (seg) options.push({ code: seg, name: row.name ?? seg, sorting2: norm, orderIndex: row.order_index ?? 999 })
          })
        })
        options.sort((a, b) => a.orderIndex - b.orderIndex)
        setSegmentOptions(options)
      })
  }, [hotelId])

  const { data: rawRows = [], isLoading } = useAccountPickupData({
    hotelId, otbDate, vsDate, year: curYear, month: curMonth, segFilter, isPastMonth,
  })

  // 월 변경 시 표시 개수 + 세그 선택 리셋
  useEffect(() => { setShowing(15); setSelectedSegs(new Set()) }, [curYear, curMonth, isPastMonth])

  const allRows = useMemo(() => normalize(rawRows, isPastMonth), [rawRows, isPastMonth])

  // 데이터 보유 segmentation 코드 (드롭다운 활성/비활성 판단)
  const activeSegs = useMemo(() => new Set(allRows.map(r => r.segmentation).filter(Boolean)), [allRows])
  // FIT/GRP 항목은 c05 order_index ASC 순서 (segmentOptions는 이미 정렬됨)
  const fitSegs = useMemo(() => segmentOptions.filter(s => s.sorting2 === 'fit'), [segmentOptions])
  const grpSegs = useMemo(() => segmentOptions.filter(s => s.sorting2 === 'group'), [segmentOptions])

  // 세그 필터(선택된 segmentation 코드) 적용 후 정렬 (sortBy: OTB R/N 또는 YoY%)
  const rows = useMemo(() => {
    const f = selectedSegs.size === 0 ? allRows : allRows.filter(r => selectedSegs.has(r.segmentation))
    return [...f].sort((a, b) => {
      if (sortBy === 'otb') return b.otbRn - a.otbRn
      // YoY% 내림차순 (LY 없는 항목은 맨 뒤)
      const aYoy = a.lyRn > 0 ? (a.otbRn - a.lyRn) / a.lyRn * 100 : null
      const bYoy = b.lyRn > 0 ? (b.otbRn - b.lyRn) / b.lyRn * 100 : null
      if (aYoy === null && bYoy === null) return 0
      if (aYoy === null) return 1
      if (bYoy === null) return -1
      return bYoy - aYoy
    })
  }, [allRows, selectedSegs, sortBy])

  // 정렬 기준 변경 시 표시 개수 리셋
  useEffect(() => { setShowing(15) }, [sortBy])

  // ── KPI 카드 배경 애니메이션 (canvas: 우하단 글로우 + 파티클 28개) ──────────────
  const bg1Ref = useRef<HTMLCanvasElement>(null)
  const bg2Ref = useRef<HTMLCanvasElement>(null)
  const bg3Ref = useRef<HTMLCanvasElement>(null)
  const bg4Ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvases = [bg1Ref.current, bg2Ref.current, bg3Ref.current, bg4Ref.current].filter(Boolean) as HTMLCanvasElement[]
    if (!canvases.length) return
    const states = canvases.map(cv => {
      const ctx = cv.getContext('2d')!
      cv.width = cv.clientWidth || 200; cv.height = cv.clientHeight || 90
      const particles = Array.from({ length: 28 }, () => ({
        x: Math.random() * cv.width, y: Math.random() * cv.height,
        r: 0.3 + Math.random() * 1.5,
        vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,   // ±0.3px/frame
        a: 0.15 + Math.random() * 0.45,
      }))
      return { cv, ctx, particles }
    })
    let raf = 0
    const draw = () => {
      for (const { cv, ctx, particles } of states) {
        if (cv.clientWidth && cv.width !== cv.clientWidth) cv.width = cv.clientWidth
        if (cv.clientHeight && cv.height !== cv.clientHeight) cv.height = cv.clientHeight
        ctx.clearRect(0, 0, cv.width, cv.height)
        // A) 우하단 파란 글로우
        const gx = cv.width * 0.85, gy = cv.height * 0.85
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 120)
        grad.addColorStop(0, 'rgba(30,80,180,0.25)')
        grad.addColorStop(1, 'rgba(30,80,180,0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, cv.width, cv.height)
        // B) 파티클
        for (const p of particles) {
          p.x += p.vx; p.y += p.vy
          if (p.x < 0) p.x = cv.width; else if (p.x > cv.width) p.x = 0
          if (p.y < 0) p.y = cv.height; else if (p.y > cv.height) p.y = 0
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(100,160,255,${p.a})`
          ctx.fill()
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  // YoY 바 정규화 — LY 있는 항목 중 최대 절대 YoY값 기준
  const maxYoy = useMemo(() => Math.max(
    ...rows.filter(r => r.lyRn > 0).map(r => Math.abs((r.otbRn - r.lyRn) / r.lyRn * 100)),
    1,
  ), [rows])

  // YoY% 바 셀 — 중앙선 고정, 양수=오른쪽 바+숫자 / 음수=왼쪽 숫자+바 (고정폭 52px)
  const yoyCell = (yoy: number | null) => {
    const pct = yoy !== null ? Math.min(Math.abs(yoy) / maxYoy * 50, 50) : 0
    const numStyle = (color: string): React.CSSProperties => ({
      width: 52, fontSize: 11, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
      flexShrink: 0, whiteSpace: 'nowrap', color,
    })
    const barArea = (
      <div style={{ flex: 1, position: 'relative', height: 14 }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: 14, background: 'rgba(255,255,255,0.15)' }} />
        {yoy !== null && yoy > 0 && (
          <div style={{ position: 'absolute', top: 3, left: '50%', width: `${pct}%`, height: 8, borderRadius: 1, background: 'rgba(0,180,130,0.7)' }} />
        )}
        {yoy !== null && yoy < 0 && (
          <div style={{ position: 'absolute', top: 3, right: '50%', width: `${pct}%`, height: 8, borderRadius: 1, background: 'rgba(226,75,74,0.7)' }} />
        )}
      </div>
    )
    const label = yoy === null ? '—' : yoy === 0 ? '0.0%' : `${yoy > 0 ? '+' : ''}${yoy.toFixed(1)}%`
    return (
      <div style={{ display: 'flex', alignItems: 'center', ...divYoy }}>
        {/* 왼쪽 숫자 — 음수일 때만 표시 */}
        <div style={{ ...numStyle(yoy !== null && yoy < 0 ? '#E24B4A' : 'transparent'), textAlign: 'right', paddingRight: 4 }}>
          {yoy !== null && yoy < 0 ? label : ''}
        </div>
        {barArea}
        {/* 오른쪽 숫자 — 양수/null일 때 표시 */}
        <div style={{ ...numStyle(yoy === null ? 'rgba(255,255,255,0.22)' : yoy > 0 ? '#00B883' : 'transparent'), textAlign: 'left', paddingLeft: 4 }}>
          {yoy === null ? '—' : yoy >= 0 ? label : ''}
        </div>
      </div>
    )
  }

  // ─── 합산 ──────────────────────────────────────────────────────────────────────
  const totalOtbRn  = rows.reduce((s, r) => s + r.otbRn, 0)
  const totalLyRn   = rows.reduce((s, r) => s + r.lyRn, 0)
  const totalOtbRev = rows.reduce((s, r) => s + r.otbRev, 0)
  const totalLyRev  = rows.reduce((s, r) => s + r.lyRev, 0)
  const totalPuRn   = rows.reduce((s, r) => s + r.puRn, 0)
  const totalPuRev  = rows.reduce((s, r) => s + r.puRev, 0)
  const totalVsRn   = rows.reduce((s, r) => s + r.vsRn, 0)
  const totalVsRev  = rows.reduce((s, r) => s + r.vsRev, 0)

  const totalOtbAdr = totalOtbRn > 0 ? Math.round(totalOtbRev / totalOtbRn) : 0
  const totalLyAdr  = totalLyRn  > 0 ? Math.round(totalLyRev  / totalLyRn)  : 0
  const totalVsAdr  = totalVsRn  > 0 ? Math.round(totalVsRev  / totalVsRn)  : 0
  const totalPuAdr  = totalOtbAdr - totalVsAdr   // 픽업 ADR 증감 (합계)

  const activeAccounts = rows.filter(r => r.otbRn > 0).length
  const yoyRnPct  = totalLyRn  > 0 ? (totalOtbRn  - totalLyRn)  / totalLyRn  * 100 : null
  const yoyRevPct = totalLyRev > 0 ? (totalOtbRev - totalLyRev) / totalLyRev * 100 : null
  const yoyAdrPct = totalLyAdr > 0 ? (totalOtbAdr - totalLyAdr) / totalLyAdr * 100 : null

  const visible = rows.slice(0, showing)
  const remaining = Math.max(0, rows.length - showing)
  const totalCount = rows.length   // 세그 필터링 후 전체 어카운트 수 (showing 적용 전)

  // ─── 스타일 ──────────────────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10,
    padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
    position: 'relative', overflow: 'hidden', isolation: 'isolate',   // 배경 데코(zIndex -1) 클리핑
  }
  const cardLabel: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }
  const cardBig: React.CSSProperties = { fontSize: 24, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1 }
  const cardUnit: React.CSSProperties = { fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 400, marginLeft: 3 }
  const cardSub: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 'auto' }
  const dash = isLoading ? '—' : null

  // 그리드 컬럼 정의 (14컬럼)
  // 미래월(OTB): ACCT | YoY바 | OTB(3) | PICKUP(3) | LY(3) | GAP(3)
  // 과거월(ACT): ACCT | Actual(3) | Same date vs LY(3) | LY Actual(3)
  const GRID = isPastMonth
    ? 'minmax(176px,1fr) 150px 80px 72px 80px 80px 72px 80px 80px 72px 80px'
    : 'minmax(176px,1fr) 150px 70px 64px 68px 57px 57px 68px 64px 57px 68px 57px 57px 68px'

  // 헤더 셀
  const h1: React.CSSProperties = { fontSize: 9, fontWeight: 500, letterSpacing: '0.04em', textAlign: 'center', padding: '4px 0 2px' }
  const h2: React.CSSProperties = { fontSize: 9, fontWeight: 500, textAlign: 'right', padding: '2px 8px 5px' }
  const td: React.CSSProperties = { fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)' }}>Account Pick-up</div>
        <button
          onClick={() => setShowDownloadModal(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6,
            border: '0.5px solid rgba(0,229,160,0.4)', background: 'rgba(0,229,160,0.06)',
            color: '#00E5A0', fontSize: 11, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <FileSpreadsheet size={14} />
          Export to Excel
        </button>
      </div>

      {/* 월 네비 + 세그먼트 필터 (한 행) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {/* 좌: 월 네비 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={handlePrevMonth} aria-label="이전 달" style={{ width: 24, height: 24, borderRadius: '50%', border: '0.5px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 68, textAlign: 'center' }}>{curYear}년 {curMonth}월</span>
          <button onClick={handleNextMonth} aria-label="다음 달" style={{ width: 24, height: 24, borderRadius: '50%', border: '0.5px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>
        {/* 우: 세그먼트 필터 — 전체 + FIT/GRP 드롭다운 (CountryPickupPage와 동일) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>세그먼트</span>
          <button onClick={handleSelectAll} style={{
            fontSize: 11, fontWeight: 500, padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
            border: selectedSegs.size === 0 ? '0.5px solid #00E5A0' : '0.5px solid var(--color-border-default)',
            background: selectedSegs.size === 0 ? 'rgba(0,229,160,0.08)' : 'transparent',
            color: selectedSegs.size === 0 ? '#00B883' : 'var(--color-text-secondary)',
          }}>전체</button>
          <SegDropdown
            label="FIT"
            segs={fitSegs.map(s => ({ code: s.code, name: s.name }))}
            selected={selectedSegs}
            activeSegs={activeSegs}
            onApply={picked => applySegGroup(fitSegs.map(f => f.code), picked)}
          />
          <SegDropdown
            label="GRP"
            segs={grpSegs.map(s => ({ code: s.code, name: s.name }))}
            selected={selectedSegs}
            activeSegs={activeSegs}
            onApply={picked => applySegGroup(grpSegs.map(g => g.code), picked)}
          />
        </div>
      </div>

      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
        {/* 1 — Active Accounts */}
        <div style={cardStyle}>
          <KpiCardBg canvasRef={bg1Ref} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <span style={cardLabel}>Active Accounts</span>
            <Users size={20} style={{ opacity: 0.3, color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          </div>
          <div style={cardBig}>{dash ?? activeAccounts}<span style={cardUnit}>accounts</span></div>
          <div style={cardSub}>{isPastMonth ? 'Actual 기준' : 'OTB 기준'}</div>
        </div>
        {/* 2 — OTB R/N */}
        <div style={cardStyle}>
          <KpiCardBg canvasRef={bg2Ref} />
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
          <KpiCardBg canvasRef={bg3Ref} />
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
          <KpiCardBg canvasRef={bg4Ref} />
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

      {/* 메인 테이블 */}
      {isLoading ? (
        <div className="animate-pulse" style={{ height: 360, background: 'var(--color-bg-tertiary)', borderRadius: 10 }} />
      ) : rows.length === 0 ? (
        <div style={{ background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10, padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
          해당 조건의 어카운트별 픽업 데이터가 없습니다.
        </div>
      ) : (
        <>
        {/* Detailed Data Analysis 바 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px',
          background: 'rgba(255,255,255,0.02)',
          border: '0.5px solid rgba(255,255,255,0.07)',
          borderBottom: '0.5px solid rgba(255,255,255,0.06)',
          borderRadius: '8px 8px 0 0',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>
            Detailed Data Analysis
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>
              총 {totalCount}개 어카운트
            </span>
            <button
              onClick={() => setSortBy('otb')}
              style={{
                fontSize: 10, cursor: 'pointer', padding: '2px 8px', borderRadius: 4,
                border: `0.5px solid ${sortBy === 'otb' ? 'rgba(0,229,160,0.2)' : 'transparent'}`,
                background: 'none',
                color: sortBy === 'otb' ? '#00E5A0' : 'rgba(255,255,255,0.28)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              {isPastMonth ? 'ACT' : 'OTB'} R/N ↓
            </button>
            <button
              onClick={() => setSortBy('yoy')}
              style={{
                fontSize: 10, cursor: 'pointer', padding: '2px 8px', borderRadius: 4,
                border: `0.5px solid ${sortBy === 'yoy' ? 'rgba(0,229,160,0.2)' : 'transparent'}`,
                background: 'none',
                color: sortBy === 'yoy' ? '#00E5A0' : 'rgba(255,255,255,0.28)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              YoY% ↓
            </button>
          </div>
        </div>

        {/* 테이블 카드 — 상단 라운드/테두리 제거(위 바와 연결) */}
        <div style={{ background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <div style={{ width: isPastMonth ? 'fit-content' : '100%', minWidth: isPastMonth ? '100%' : undefined }}>
              {isPastMonth ? (
                <>
                  {/* 1단 그룹 헤더 — YoY% / Actual / Same date vs LY / LY Actual */}
                  <div style={{ display: 'grid', gridTemplateColumns: GRID }}>
                    <div />
                    <div style={{ ...h1, ...divYoy, textAlign: 'left', color: 'rgba(255,180,50,0.5)', letterSpacing: '0.06em', borderBottom: '0.5px solid rgba(255,180,50,0.15)', paddingBottom: 3 }}>YoY%</div>
                    <div style={{ ...h1, ...divOtb, gridColumn: 'span 3', color: 'rgba(0,229,160,0.55)', borderBottom: '0.5px solid rgba(0,229,160,0.15)', paddingBottom: 3 }}>ACTUAL</div>
                    <div style={{ ...h1, ...divGap, gridColumn: 'span 3', color: 'rgba(255,180,50,0.7)',  borderBottom: '0.5px solid rgba(255,180,50,0.2)', paddingBottom: 3, whiteSpace: 'nowrap' }}>Same date vs LY</div>
                    <div style={{ ...h1, ...divLy,  gridColumn: 'span 3', color: 'rgba(255,255,255,0.3)', borderBottom: '0.5px solid rgba(255,255,255,0.1)', paddingBottom: 3, whiteSpace: 'nowrap' }}>LY ACTUAL</div>
                  </div>
                  {/* 2단 컬럼 헤더 */}
                  <div style={{ display: 'grid', gridTemplateColumns: GRID, borderBottom: '0.5px solid var(--color-border-subtle)' }}>
                    <div style={{ ...h2, textAlign: 'left', color: 'var(--color-text-tertiary)' }}>ACCOUNT</div>
                    <div style={{ ...h2, ...divYoy, textAlign: 'right', color: 'rgba(255,180,50,0.45)' }}>vs LY</div>
                    <div style={{ ...h2, ...divOtb, color: 'rgba(0,229,160,0.55)' }}>R/N</div>
                    <div style={{ ...h2, color: 'rgba(0,229,160,0.55)' }}>ADR</div>
                    <div style={{ ...h2, color: 'rgba(0,229,160,0.55)' }}>REV</div>
                    <div style={{ ...h2, ...divGap, color: 'rgba(255,180,50,0.7)' }}>R/N</div>
                    <div style={{ ...h2, color: 'rgba(255,180,50,0.7)' }}>ADR</div>
                    <div style={{ ...h2, color: 'rgba(255,180,50,0.7)' }}>REV</div>
                    <div style={{ ...h2, ...divLy, color: 'rgba(255,255,255,0.3)' }}>R/N</div>
                    <div style={{ ...h2, color: 'rgba(255,255,255,0.3)' }}>ADR</div>
                    <div style={{ ...h2, color: 'rgba(255,255,255,0.3)' }}>REV</div>
                  </div>
                </>
              ) : (
                <>
                  {/* 1단 그룹 헤더 */}
                  <div style={{ display: 'grid', gridTemplateColumns: GRID }}>
                    <div />
                    <div style={{ ...h1, ...divYoy, textAlign: 'left', color: 'rgba(255,180,50,0.5)', letterSpacing: '0.06em', borderBottom: '0.5px solid rgba(255,180,50,0.15)', paddingBottom: 3 }}>YoY%</div>
                    <div style={{ ...h1, ...divOtb, gridColumn: 'span 3', color: 'rgba(0,229,160,0.55)', borderBottom: '0.5px solid rgba(0,229,160,0.15)', paddingBottom: 3 }}>OTB</div>
                    <div style={{ ...h1, ...divPu,  gridColumn: 'span 3', color: 'rgba(0,229,160,0.9)',  borderBottom: '0.5px solid rgba(0,229,160,0.35)', paddingBottom: 3 }}>PICKUP</div>
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
                </>
              )}

              {/* 행 */}
              {visible.map((r, i) => {
                const otbAdr = r.otbRn > 0 ? Math.round(r.otbRev / r.otbRn) : 0
                const lyAdr  = r.lyRn  > 0 ? Math.round(r.lyRev  / r.lyRn)  : 0
                const vsAdr  = r.vsRn > 0 ? Math.round(r.vsRev / r.vsRn) : 0
                const puAdr  = otbAdr - vsAdr   // 픽업 ADR 증감 (OTB − 어제 OTB)
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
                    {isPastMonth ? (
                      <>
                        {/* YoY% 양방향 바 (act vs ly) */}
                        {yoyCell(yoy)}
                        {/* Actual R/N / ADR / REV */}
                        <div style={{ ...td, ...divOtb, color: '#fff' }}>{r.otbRn.toLocaleString('ko-KR')}</div>
                        <div style={td}>{fmtAdr(otbAdr)}</div>
                        <div style={td}>{fmtRev(r.otbRev)}</div>
                        {/* Same date vs LY (gap) R/N / ADR / REV */}
                        <div style={{ ...td, ...divGap, color: puColor(gapRn) }}>{sRn(gapRn)}</div>
                        <div style={{ ...td, color: puColor(gapAdr) }}>{sAdr(gapAdr)}</div>
                        <div style={{ ...td, color: puColor(gapRev) }}>{sRev(gapRev)}</div>
                        {/* LY Actual R/N / ADR / REV */}
                        <div style={{ ...td, ...divLy, color: 'rgba(255,255,255,0.55)' }}>{r.lyRn > 0 ? r.lyRn.toLocaleString('ko-KR') : '—'}</div>
                        <div style={{ ...td, color: 'rgba(255,255,255,0.55)' }}>{r.lyRn > 0 ? fmtAdr(lyAdr) : '—'}</div>
                        <div style={{ ...td, color: 'rgba(255,255,255,0.55)' }}>{r.lyRev > 0 ? fmtRev(r.lyRev) : '—'}</div>
                      </>
                    ) : (
                      <>
                        {/* YoY% 양방향 바 */}
                        {yoyCell(yoy)}
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
                      </>
                    )}
                  </div>
                )
              })}

              {/* Total 행 */}
              <div style={{ display: 'grid', gridTemplateColumns: GRID, height: 32, borderTop: '0.5px solid rgba(0,229,160,0.15)', background: 'rgba(0,229,160,0.03)' }}>
                <div style={{ ...td, justifyContent: 'flex-start', textAlign: 'left', fontWeight: 500, color: '#00E5A0' }}>Total</div>
                {isPastMonth ? (
                  <>
                    {/* YoY% */}
                    {yoyCell(yoyRnPct)}
                    {/* Actual */}
                    <div style={{ ...td, ...divOtb, color: '#fff', fontWeight: 500 }}>{totalOtbRn.toLocaleString('ko-KR')}</div>
                    <div style={{ ...td, fontWeight: 500 }}>{fmtAdr(totalOtbAdr)}</div>
                    <div style={{ ...td, fontWeight: 500 }}>{fmtRev(totalOtbRev)}</div>
                    {/* Same date vs LY (gap) */}
                    <div style={{ ...td, ...divGap, color: puColor(totalOtbRn - totalLyRn), fontWeight: 500 }}>{sRn(totalOtbRn - totalLyRn)}</div>
                    <div style={{ ...td, color: puColor(totalOtbAdr - totalLyAdr), fontWeight: 500 }}>{sAdr(totalOtbAdr - totalLyAdr)}</div>
                    <div style={{ ...td, color: puColor(totalOtbRev - totalLyRev), fontWeight: 500 }}>{sRev(totalOtbRev - totalLyRev)}</div>
                    {/* LY Actual */}
                    <div style={{ ...td, ...divLy, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{totalLyRn > 0 ? totalLyRn.toLocaleString('ko-KR') : '—'}</div>
                    <div style={{ ...td, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{totalLyRn > 0 ? fmtAdr(totalLyAdr) : '—'}</div>
                    <div style={{ ...td, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{totalLyRev > 0 ? fmtRev(totalLyRev) : '—'}</div>
                  </>
                ) : (
                  <>
                    {yoyCell(yoyRnPct)}
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
                  </>
                )}
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
              {sortBy === 'yoy' ? 'YoY%' : `${isPastMonth ? 'ACT' : 'OTB'} R/N`} 기준 정렬
            </div>
          </div>
        </div>
        </>
      )}

      {showDownloadModal && (
        <AccountPickupDownloadModal
          data={rawRows}
          segmentOptions={segmentOptions}
          currentMonth={curMonth}
          currentYear={curYear}
          otbDate={otbDate}
          vsDate={vsDate}
          hotelId={hotelId}
          onClose={() => setShowDownloadModal(false)}
        />
      )}
    </div>
  )
}
