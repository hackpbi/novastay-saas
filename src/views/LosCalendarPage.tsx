'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema } from '@/hooks/useMarketSchema'

// ─── 타입 ────────────────────────────────────────────────────────────────────────
type DateSum = { business_date: string; occ: number; adr: number | null; room_nights: number; arrivals: number; avg_los: number | null; max_los: number | null }
type DateBkt = { business_date: string; bucket_no: number; bucket_min: number; bucket_max: number | null; resv: number; room_nights: number; adr: number | null }
type BucketDef = { no: number; min: number; max: number | null }

// ─── 상수 (KST — getUTC 금지) ──────────────────────────────────────────────────────
const MINT = '#00E5A0'
const RED  = '#E24B4A'
const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']   // 일요일 시작 · index 5·6 = 금·토
const BAR_COLORS = ['#00E5A0', '#1D9E75', '#0F6E56', '#5B8DEF']   // 1박 / 2박 / 3박 / 4+
// MLOS 검토 대상 판정 — 상수로 분리
const ALERT_OCC = 85      // OCC 이상
const ALERT_LOS = 1.5     // 평균 LOS 미만
// 데이터 로드 전 4행을 항상 유지하기 위한 기본 버킷 (bounds [1,2,3] → 1박/2박/3박/4+)
const DEFAULT_DEFS: BucketDef[] = [{ no: 1, min: 1, max: 1 }, { no: 2, min: 2, max: 2 }, { no: 3, min: 3, max: 3 }, { no: 4, min: 4, max: null }]

// 단가 — 천원 단위 반올림, 콤마·단위 없음
const fmtAdr = (v: number | null) => (v == null || v === 0) ? '-' : String(Math.round(v / 1000))
const defLabel = (d: BucketDef) => d.max === null ? `${d.min}+` : `${d.min}박`
// 문자열 'null' · 'NULL' · 'undefined' · 빈 문자열 · 공백만 있는 값을 모두 제거 (뷰의 NULLIF 방어와 동일 기준)
const normEvent = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '' || s === '-') return null
  const low = s.toLowerCase()
  if (low === 'null' || low === 'undefined') return null
  return s
}

// ─── 페이지 ─────────────────────────────────────────────────────────────────────
export default function LosCalendarPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate } = useDateContext()
  const { data: schema = [] } = useMarketSchema()

  // 기본값 = KST 당월 (selMonth 는 0-based)
  const kst = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })  // 'YYYY-MM-DD'
  const [selYear, setSelYear]   = useState(Number(kst.slice(0, 4)))
  const [selMonth, setSelMonth] = useState(Number(kst.slice(5, 7)) - 1)
  const prevMonth = () => { if (selMonth === 0) { setSelYear(y => y - 1); setSelMonth(11) } else setSelMonth(m => m - 1) }
  const nextMonth = () => { if (selMonth === 11) { setSelYear(y => y + 1); setSelMonth(0) } else setSelMonth(m => m + 1) }

  const m1 = selMonth + 1
  const fromDate = `${selYear}-${pad(m1)}-01`
  const daysInMonth = new Date(selYear, m1, 0).getDate()
  const toDate = `${selYear}-${pad(m1)}-${pad(daysInMonth)}`

  // ─── 세그먼트 필터 (LosPage 필터 패턴 복제) ─────────────────────────────────────────
  const [applied, setApplied] = useState<string[]>([])
  const [draft, setDraft] = useState<string[]>([])
  const [segFilterOpen, setSegFilterOpen] = useState(false)
  const segTree = useMemo(() => {
    const tops = schema.filter(s => s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
    const groups: { key: string; name: string; codes: string[]; children: { name: string; codes: string[] }[] }[] = []
    const allCodes: string[] = []
    for (const top of tops) {
      if (top.segmentation.includes('HOU')) continue
      if (top.level === 'main') {
        const kids = schema.filter(c => c.parent_id === top.id && !c.segmentation.includes('HOU')).sort((a, b) => a.order_index - b.order_index)
        const children = kids.map(k => ({ name: k.name, codes: k.segmentation }))
        const codes = kids.flatMap(k => k.segmentation)
        groups.push({ key: top.id, name: top.name, codes, children })
        allCodes.push(...codes)
      } else {
        groups.push({ key: top.id, name: top.name, codes: top.segmentation, children: [] })
        allCodes.push(...top.segmentation)
      }
    }
    return { groups, allCodes }
  }, [schema])
  const segSeeded = useRef(false)
  useEffect(() => { segSeeded.current = false }, [hotelId])
  useEffect(() => {
    if (segSeeded.current || segTree.allCodes.length === 0) return
    setApplied(segTree.allCodes); setDraft(segTree.allCodes); segSeeded.current = true
  }, [segTree])
  useEffect(() => {
    if (!segFilterOpen) return
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.los-date-seg-filter-wrap')) setSegFilterOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [segFilterOpen])
  const toggleCodes = (codes: string[]) => setDraft(prev =>
    codes.every(c => prev.includes(c)) ? prev.filter(c => !codes.includes(c)) : [...new Set([...prev, ...codes])])

  const segSize = segFilterOpen ? draft.length : applied.length
  const segAllBtn = segSize === 0 || segSize === segTree.allCodes.length
  // OCC·ADR(투숙일)은 세그먼트를 타지 않고 RPC가 항상 전체로 반환 — 프론트 재계산 금지.
  // avg_los·박수별 건수(도착일)만 세그먼트 반영 (RPC 내부 처리).
  const p_segments = applied.length === 0 || applied.length === segTree.allCodes.length ? null : applied
  const segKey = applied.slice().sort().join(',')

  // ─── RPC 2종 + 이벤트 ─────────────────────────────────────────────────────────────
  const { data: sumRows = [], isLoading: sumLoading } = useQuery<DateSum[]>({
    queryKey: ['los-date-summary', hotelId, otbDate, fromDate, toDate, segKey],
    enabled: !!hotelId && !!otbDate,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_los_date_summary', {
        p_hotel_id: hotelId, p_update_date: otbDate, p_from: fromDate, p_to: toDate, p_segments,
      })
      if (error) throw error
      return ((data ?? []) as any[]).map(r => ({
        business_date: String(r.business_date),
        occ: Number(r.occ) || 0,
        adr: r.adr == null ? null : Number(r.adr),
        room_nights: Number(r.room_nights) || 0,
        arrivals: Number(r.arrivals) || 0,
        avg_los: r.avg_los == null ? null : Number(r.avg_los),
        max_los: r.max_los == null ? null : Number(r.max_los),
      })) as DateSum[]
    },
  })
  const { data: bktRows = [], isLoading: bktLoading } = useQuery<DateBkt[]>({
    queryKey: ['los-date-buckets', hotelId, otbDate, fromDate, toDate, segKey],
    enabled: !!hotelId && !!otbDate,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_los_date_buckets', {
        p_hotel_id: hotelId, p_update_date: otbDate, p_from: fromDate, p_to: toDate, p_bucket_bounds: [1, 2, 3], p_segments,
      })
      if (error) throw error
      return ((data ?? []) as any[]).map(r => ({
        business_date: String(r.business_date),
        bucket_no: Number(r.bucket_no) || 0,
        bucket_min: Number(r.bucket_min) || 0,
        bucket_max: r.bucket_max == null ? null : Number(r.bucket_max),
        resv: Number(r.resv) || 0, room_nights: Number(r.room_nights) || 0,
        adr: r.adr == null ? null : Number(r.adr),
      })) as DateBkt[]
    },
  })
  const { data: events = [] } = useQuery<{ date: string; event: string }[]>({
    queryKey: ['los-date-events', fromDate, toDate],
    enabled: !!fromDate,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('c06_calendar').select('date, event')
        .gte('date', fromDate).lte('date', toDate).not('event', 'is', null)
      return (data ?? []) as { date: string; event: string }[]
    },
  })
  const isLoading = sumLoading || bktLoading

  // ─── 맵 구성 ───────────────────────────────────────────────────────────────────
  const sumByDate = useMemo(() => {
    const m: Record<string, DateSum> = {}
    for (const r of sumRows) m[r.business_date] = r
    return m
  }, [sumRows])
  const bktByDate = useMemo(() => {
    const m: Record<string, Record<number, DateBkt>> = {}
    for (const r of bktRows) (m[r.business_date] ??= {})[r.bucket_no] = r
    return m
  }, [bktRows])
  const bucketDefs = useMemo<BucketDef[]>(() => {
    const byNo: Record<number, { min: number; max: number | null }> = {}
    for (const r of bktRows) if (!(r.bucket_no in byNo)) byNo[r.bucket_no] = { min: r.bucket_min, max: r.bucket_max }
    const defs = Object.keys(byNo).map(Number).sort((a, b) => a - b).map(no => ({ no, min: byNo[no].min, max: byNo[no].max }))
    return defs.length ? defs : DEFAULT_DEFS
  }, [bktRows])
  const eventsByDate = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const e of events) (m[e.date] ??= []).push(e.event)
    return m
  }, [events])

  // ─── 달력 셀 ───────────────────────────────────────────────────────────────────
  const renderCell = (day: number) => {
    const dateStr = `${selYear}-${pad(m1)}-${pad(day)}`
    const dow = new Date(selYear, selMonth, day).getDay()   // 0 일 … 6 토
    const isFriSat = dow === 5 || dow === 6
    const sum = sumByDate[dateStr]
    const occ = sum ? Math.round(sum.occ) : 0
    const avgLos = sum?.avg_los ?? null
    const isAlert = occ >= ALERT_OCC && avgLos != null && avgLos < ALERT_LOS

    const rows = bucketDefs.map((def, i) => {
      const b = bktByDate[dateStr]?.[def.no]
      return { def, i, resv: b?.resv ?? 0, adr: b?.adr ?? null }
    })
    const maxCnt = Math.max(...rows.map(r => r.resv), 1)
    const maxResv = Math.max(...rows.map(r => r.resv))
    const evList = (eventsByDate[dateStr] ?? []).map(normEvent).filter((v): v is string => v !== null)
    const evt = evList[0] ?? null
    const allEvents = evList.join(' · ')

    return (
      <div key={day} style={{ borderRadius: 12, overflow: 'hidden', background: '#121212' }}>
        {/* ① 상단 강조선 */}
        <div style={{ height: 2, background: isAlert ? MINT : '#1f1f1f' }} />
        {/* ② 헤더 */}
        <div style={{ padding: '8px 10px', background: isAlert ? '#16211e' : '#171717', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: isFriSat ? RED : '#c8c8c8', flexShrink: 0 }}>{day}</span>
            {evt && (
              <span title={allEvents} style={{ fontSize: 11, color: '#C99A3E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{evt}</span>
            )}
          </div>
          <span style={{ whiteSpace: 'nowrap', flexShrink: 0, fontSize: 11 }}>
            <span style={{ color: '#5f5f5f' }}>OCC </span>
            <span style={{ color: occ >= 90 ? MINT : '#8f8f8f' }}>{occ}%</span>
          </span>
        </div>
        {/* ③ 본문 */}
        <div style={{ padding: '8px 10px 8px' }}>
          {/* 항목 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#5f5f5f', borderBottom: '1px solid #1c1c1c', paddingBottom: 4, marginBottom: 4 }}>
            <span style={{ width: 18, flexShrink: 0 }} />
            <span style={{ width: 14, flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>건수</span>
            <span style={{ flex: 1 }} />
            <span style={{ width: 28, flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>단가</span>
          </div>
          {/* 박수 4행 */}
          {rows.map(({ def, i, resv, adr }) => {
            const pct = resv > 0 ? Math.max((resv / maxCnt) * 100, 4) : 0
            const cntColor = resv === 0 ? '#3f3f3f' : (resv === maxResv && maxResv > 0) ? '#fff' : '#d8d8d8'
            const adrEmpty = adr == null || adr === 0
            return (
              <div key={def.no} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, marginBottom: i === rows.length - 1 ? 7 : 4 }}>
                <span style={{ color: '#5f5f5f', width: 18, flexShrink: 0 }}>{defLabel(def)}</span>
                <span style={{ color: cntColor, width: 14, flexShrink: 0, textAlign: 'right' }}>{resv > 0 ? resv : '-'}</span>
                <span style={{ flex: 1, height: 4, background: '#1c1c1c', borderRadius: 2, overflow: 'hidden' }}>
                  {resv > 0 && <span style={{ display: 'block', width: `${pct}%`, height: 4, background: BAR_COLORS[Math.min(i, BAR_COLORS.length - 1)], borderRadius: 2 }} />}
                </span>
                <span style={{ color: adrEmpty ? '#3f3f3f' : '#7a7a7a', width: 28, flexShrink: 0, textAlign: 'right' }}>{fmtAdr(adr)}</span>
              </div>
            )
          })}
          {/* 하단 요약 */}
          <div style={{ paddingTop: 6, borderTop: '1px solid #1c1c1c', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span>
              <span style={{ color: '#5f5f5f' }}>평균 </span>
              <span style={{ color: (avgLos != null && avgLos < ALERT_LOS) ? RED : '#c8c8c8' }}>{avgLos != null ? `${avgLos.toFixed(1)}박` : '-'}</span>
            </span>
            <span>
              <span style={{ color: '#5f5f5f' }}>ADR </span>
              <span style={{ color: '#c8c8c8' }}>{fmtAdr(sum?.adr ?? null)}</span>
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ─── 그리드 구성 (일요일 시작) ─────────────────────────────────────────────────────
  const leading = new Date(selYear, selMonth, 1).getDay()   // 0=일 … 6=토
  const total = leading + daysInMonth
  const trailing = (7 - (total % 7)) % 7

  const chk = (state: 'checked' | 'unchecked' | 'inter') => (
    <span style={{
      width: 14, height: 14, borderRadius: 4, flexShrink: 0, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: `1px solid ${state === 'unchecked' ? '#3a3a3a' : '#00E5A0'}`, background: state === 'checked' ? '#00E5A0' : 'transparent',
    }}>
      {state === 'checked' && <span style={{ color: '#0a0a0a', fontSize: 9, lineHeight: 1 }}>✓</span>}
      {state === 'inter' && <span style={{ width: 6, height: 2, background: '#00E5A0' }} />}
    </span>
  )

  return (
    <div>
      {/* 페이지 헤더 — 월 네비 (LosPage 헤더 패턴) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={prevMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 26, color: MINT, lineHeight: 1 }}>‹</span><span style={{ fontSize: 9, color: MINT }}>이전</span>
          </button>
          <span style={{ fontSize: 19, fontWeight: 500, color: '#e8e8e8', letterSpacing: '0.04em' }}>
            LOS Calendar <span style={{ color: MINT }}>{selYear}년 {m1}월</span>
          </span>
          <button onClick={nextMonth} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontSize: 26, color: MINT, lineHeight: 1 }}>›</span><span style={{ fontSize: 9, color: MINT }}>다음</span>
          </button>
        </div>
        <span style={{ fontSize: 11, color: '#5f5f5f' }}>도착일 기준 · HOU 제외</span>
      </div>

      {/* 상단 — 제목 + 설명 + 세그먼트 필터 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, color: '#fff', fontWeight: 500 }}>박수별 도착일 분포 <span style={{ fontSize: 11, color: MINT, marginLeft: 4 }}>{selYear}년 {m1}월</span></div>
          <div style={{ fontSize: 11, color: '#6b6b6b', marginTop: 3 }}>해당 날짜에 체크인하는 예약을 숙박일수로 나눈 것</div>
          <div style={{ fontSize: 11, color: '#6b6b6b', marginTop: 1 }}>건수는 예약 단위 · 단가 단위 천원 · OCC와 하단 ADR은 전체 기준</div>
        </div>
        <div className="los-date-seg-filter-wrap" style={{ position: 'relative', flexShrink: 0 }}>
          <div onClick={() => { if (!segFilterOpen) setDraft(applied); setSegFilterOpen(o => !o) }} style={{ cursor: 'pointer', position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '7px 13px', borderRadius: 8, border: `0.5px solid rgba(255,255,255,${segFilterOpen ? 0.24 : 0.13})`, background: segFilterOpen ? 'rgba(255,255,255,0.05)' : 'transparent', color: segAllBtn ? '#8f8f8f' : '#dcdcdc', transition: 'all .15s' }}>
            <svg viewBox="0 0 12 12" width={12} height={12} style={{ opacity: segAllBtn ? 0.45 : 0.85 }}><path d="M1 2h10L7 6.6V11L5 9.8V6.6L1 2z" fill="currentColor" /></svg>
            <span>세그먼트</span>
            <span style={{ color: segAllBtn ? '#5a5a5a' : '#00E5A0' }}>{segAllBtn ? '전체' : `${segSize}개`}</span>
            <span style={{ fontSize: 9 }}>{segFilterOpen ? '▴' : '▾'}</span>
            {!segAllBtn && <span style={{ position: 'absolute', top: -3, right: -3, width: 7, height: 7, borderRadius: '50%', background: '#00E5A0', boxShadow: '0 0 0 2px #0a0a0a' }} />}
          </div>
          {segFilterOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 252, zIndex: 20, background: '#101410', border: '0.5px solid rgba(0,229,160,0.26)', borderRadius: 9, overflow: 'hidden', boxShadow: '0 10px 28px rgba(0,0,0,0.8)' }}>
              <div style={{ fontSize: 10, color: '#565656', padding: '8px 12px 4px' }}>{draft.length} / {segTree.allCodes.length} 선택</div>
              <div style={{ maxHeight: 250, overflowY: 'auto', paddingBottom: 6 }}>
                {segTree.groups.map(g => {
                  const isLeaf = g.children.length === 0
                  const childSel = g.children.filter(c => c.codes.every(cc => draft.includes(cc))).length
                  const gState: 'checked' | 'unchecked' | 'inter' = isLeaf
                    ? (g.codes.every(c => draft.includes(c)) ? 'checked' : 'unchecked')
                    : (childSel === g.children.length ? 'checked' : childSel === 0 ? 'unchecked' : 'inter')
                  return (
                    <div key={g.key}>
                      <div onClick={() => toggleCodes(g.codes)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 12px 4px 12px' }}>
                        {chk(gState)}<span style={{ fontSize: 12.5, color: '#EAFFF7', fontWeight: 500 }}>{g.name}</span>
                      </div>
                      {g.children.map(c => (
                        <div key={c.name} onClick={() => toggleCodes(c.codes)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 12px 4px 26px' }}>
                          {chk(c.codes.every(cc => draft.includes(cc)) ? 'checked' : 'unchecked')}<span style={{ fontSize: 12, color: '#b0b0b0' }}>{c.name}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: '0.5px solid rgba(255,255,255,0.1)', background: '#0c110c' }}>
                <span onClick={() => setDraft([])} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, padding: '6px 0', borderRadius: 6, cursor: 'pointer', border: '0.5px solid rgba(255,255,255,0.14)', color: '#a8a8a8' }}>초기화</span>
                <span onClick={() => setDraft(segTree.allCodes)} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, padding: '6px 0', borderRadius: 6, cursor: 'pointer', border: '0.5px solid rgba(255,255,255,0.14)', color: '#a8a8a8' }}>전체</span>
                <span onClick={() => { setApplied(draft); setSegFilterOpen(false) }} style={{ flex: 1.2, textAlign: 'center', fontSize: 11.5, padding: '6px 0', borderRadius: 6, cursor: 'pointer', background: '#00E5A0', color: '#08150f', fontWeight: 500 }}>완료</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {isLoading && sumRows.length === 0 ? (
        <div className="animate-pulse" style={{ height: 420, background: 'var(--color-bg-tertiary)', borderRadius: 12 }} />
      ) : (
        <div>
          {/* 요일 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 5, marginBottom: 5 }}>
            {WEEKDAYS.map((w, i) => (
              <div key={w} style={{ textAlign: 'center', fontSize: 11, color: (i === 5 || i === 6) ? '#8a5a58' : '#5f5f5f' }}>{w}</div>
            ))}
          </div>
          {/* 달력 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 5 }}>
            {Array.from({ length: leading }).map((_, i) => <div key={`l${i}`} style={{ background: '#0f0f0f', borderRadius: 12 }} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => renderCell(i + 1))}
            {Array.from({ length: trailing }).map((_, i) => <div key={`t${i}`} style={{ background: '#0f0f0f', borderRadius: 12 }} />)}
          </div>
        </div>
      )}
    </div>
  )
}
