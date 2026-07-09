'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import type { PickupRow } from '@/hooks/usePickupData'
import { monthKeyLabel } from './dummyMeetingData'
import { FmtVal } from '@/utils/FmtVal'

interface AccountComparisonModalProps {
  open:       boolean
  onClose:    () => void
  hotelId:    string
  monthKey:   string        // 'YYYY-MM'
  pickupRows: PickupRow[]    // account_name 포함
  roomCount:  number
}

// ── 디자인 토큰 (SegmentDetailModal과 동일) ──────────────────────────────────────
const BG       = '#0a0a0a'
const CARD     = '#141414'
const MINT     = '#00E5A0'
const RED      = '#E24B4A'
const TXT3     = '#888'
const GROUP_SHADOW = 'inset 1px 0 0 rgba(0,229,160,0.3)'
const BORDER_SUBTLE = '0.5px solid rgba(255,255,255,0.06)'

type LyMode = 'match' | 'date'
type Cell = { rn: number; adr: number; rev: number }
type SegOpt = { id: string; name: string; indent: boolean; codes: string[] }
type SortKey = 'otb' | 'ly' | 'gap' | null

// ── 포맷 / 색상 (SegmentDetailModal 재사용) ──────────────────────────────────────
const fmtRn  = (v: number) => (v === 0 ? '-' : v.toLocaleString('ko-KR'))
const fmtAdr = (v: number) => (v === 0 ? '-' : `${Math.round(v / 1000)}K`)
const fmtRev = (v: number) => (v === 0 ? '-' : `${(v / 1_000_000).toFixed(1)}M`)
const sign   = (v: number) => (v > 0 ? '+' : '')
const gapColor = (v: number) => (v > 0 ? MINT : v < 0 ? RED : TXT3)

const th: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
  color: TXT3, padding: '8px 4px', background: '#131313', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, textAlign: 'right', zIndex: 1,
}
const td: React.CSSProperties = {
  fontSize: 11, padding: '8px 4px', textAlign: 'right', whiteSpace: 'nowrap',
  borderBottom: BORDER_SUBTLE,
}

const HALF = 64  // YoY% 바 반쪽 최대 px

export default function AccountComparisonModal({ open, onClose, hotelId, monthKey, pickupRows }: AccountComparisonModalProps) {
  const [lyMode, setLyMode] = useState<LyMode>('match')

  // 멀티 세그 선택 (tempSelected 스테이징 + Done 커밋)
  const [segOpen, setSegOpen] = useState(false)
  const [selectedSegIds, setSelectedSegIds] = useState<string[]>([])
  const [tempSegIds, setTempSegIds] = useState<string[]>([])
  const segRef = useRef<HTMLDivElement>(null)

  // 정렬
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [year, month] = monthKey.split('-').map(Number)

  const { data: schema = [] } = useMarketSchema()

  // 세그 목록 (메인 + 하위 전부, order_index 순 — SegmentDetailModal rows 패턴)
  const segOptions = useMemo<SegOpt[]>(() => {
    const topLevel = schema.filter(s => s.parent_id === null).sort((a, b) => a.order_index - b.order_index)
    const out: SegOpt[] = []
    for (const top of topLevel) {
      const children = top.level === 'main'
        ? schema.filter(c => c.parent_id === top.id).sort((a, b) => a.order_index - b.order_index)
        : []
      if (children.length > 0) {
        out.push({ id: top.id, name: top.name, indent: false, codes: children.flatMap(c => c.segmentation ?? []) })
        for (const c of children) out.push({ id: c.id, name: c.name, indent: true, codes: c.segmentation ?? [] })
      } else {
        out.push({ id: top.id, name: top.name, indent: false, codes: top.segmentation ?? [] })
      }
    }
    return out
  }, [schema])

  // 선택된 세그 코드 집합 (null = 전체)
  const selectedCodes = useMemo(() => {
    if (selectedSegIds.length === 0) return null
    const set = new Set<string>()
    for (const id of selectedSegIds) {
      const opt = segOptions.find(o => o.id === id)
      opt?.codes.forEach(c => set.add(c))
    }
    return set
  }, [selectedSegIds, segOptions])

  const openSegDropdown = () => { setTempSegIds(selectedSegIds); setSegOpen(true) }
  const toggleSeg = (id: string) =>
    setTempSegIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const onReset = () => setTempSegIds([])
  const onAll   = () => setTempSegIds(segOptions.map(o => o.id))
  const onDone  = () => { setSelectedSegIds(tempSegIds); setSegOpen(false) }

  // 바깥 클릭 닫기 (segRef.contains 방식)
  useEffect(() => {
    if (!segOpen) return
    const onDown = (e: MouseEvent) => {
      if (segRef.current && !segRef.current.contains(e.target as Node)) setSegOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [segOpen])

  const onSort = (k: 'otb' | 'ly' | 'gap') => {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setSortDir('desc') }
  }

  // ── OTB 집계 (pickupRows → account_name 단위) ──────────────────────────────────
  const otbByAccount = useMemo(() => {
    const map = new Map<string, { rn: number; rev: number }>()
    for (const r of pickupRows) {
      const d = new Date(r.business_date)
      if (d.getFullYear() !== year || d.getMonth() !== month - 1) continue
      if (selectedCodes && !selectedCodes.has(r.segmentation)) continue
      const acc = r.account_name || '(미지정)'
      const cur = map.get(acc) ?? { rn: 0, rev: 0 }
      map.set(acc, { rn: cur.rn + (r.otb_nights ?? 0), rev: cur.rev + (r.otb_revenue ?? 0) })
    }
    return map
  }, [pickupRows, year, month, selectedCodes])

  // ── LY 조회 (a01_actual_daily 직접 — account_name 포함) ────────────────────────
  const { data: lyRows = [] } = useQuery({
    queryKey: ['acct-cmp-ly', hotelId, monthKey, lyMode],
    enabled: !!hotelId && !!monthKey && open,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      if (lyMode === 'date') {
        const lyYear = year - 1
        const start = `${lyYear}-${String(month).padStart(2, '0')}-01`
        const end   = `${lyYear}-${String(month).padStart(2, '0')}-31`
        const { data, error } = await (supabase as any)
          .from('a01_actual_daily')
          .select('account_name, segmentation, nights, room_revenue')
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
        .select('account_name, segmentation, nights, room_revenue')
        .eq('hotel_id', hotelId)
        .in('business_date', lyDates)
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  const lyByAccount = useMemo(() => {
    const map = new Map<string, { rn: number; rev: number }>()
    for (const r of lyRows as any[]) {
      if (selectedCodes && !selectedCodes.has(r.segmentation)) continue
      const acc = r.account_name || '(미지정)'
      const cur = map.get(acc) ?? { rn: 0, rev: 0 }
      map.set(acc, { rn: cur.rn + (r.nights ?? 0), rev: cur.rev + (r.room_revenue ?? 0) })
    }
    return map
  }, [lyRows, selectedCodes])

  // ── 행 조립 (OTB ∪ LY 어카운트) ────────────────────────────────────────────────
  const toCell = (v?: { rn: number; rev: number }): Cell => {
    const rn = v?.rn ?? 0, rev = v?.rev ?? 0
    return { rn, rev, adr: rn > 0 ? Math.round(rev / rn) : 0 }
  }
  const rows = useMemo(() => {
    const accts = new Set<string>([...otbByAccount.keys(), ...lyByAccount.keys()])
    return Array.from(accts).map(acc => ({
      account: acc,
      otb: toCell(otbByAccount.get(acc)),
      ly:  toCell(lyByAccount.get(acc)),
    }))
  }, [otbByAccount, lyByAccount])

  // 합계
  const totals = useMemo(() => {
    const otbRn = rows.reduce((s, r) => s + r.otb.rn, 0)
    const otbRev = rows.reduce((s, r) => s + r.otb.rev, 0)
    const lyRn = rows.reduce((s, r) => s + r.ly.rn, 0)
    const lyRev = rows.reduce((s, r) => s + r.ly.rev, 0)
    return {
      otb: toCell({ rn: otbRn, rev: otbRev }),
      ly:  toCell({ rn: lyRn, rev: lyRev }),
    }
  }, [rows])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  if (!open) return null

  const lyLabel = lyMode === 'match' ? '전년동기간' : '전년동일자'

  // YoY% 계산 (신규 LY=0 → Infinity)
  const withYoy = rows.map(r => {
    const isNew = r.ly.rn === 0 && r.otb.rn > 0
    const yoy = r.ly.rn === 0 ? (r.otb.rn > 0 ? Infinity : 0) : (r.otb.rn - r.ly.rn) / r.ly.rn * 100
    return { ...r, isNew, yoy }
  })
  const finiteAbs = withYoy.filter(r => isFinite(r.yoy)).map(r => Math.abs(r.yoy))
  const maxAbs = Math.max(...finiteAbs, 1)

  // 정렬 (기본: OTB R/N desc)
  const sortedRows = (() => {
    const arr = [...withYoy]
    if (!sortKey) return arr.sort((a, b) => b.otb.rn - a.otb.rn)
    arr.sort((a, b) => {
      const av = sortKey === 'otb' ? a.otb.rn : sortKey === 'ly' ? a.ly.rn : (a.otb.rn - a.ly.rn)
      const bv = sortKey === 'otb' ? b.otb.rn : sortKey === 'ly' ? b.ly.rn : (b.otb.rn - b.ly.rn)
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return arr
  })()

  const totalIsNew = totals.ly.rn === 0 && totals.otb.rn > 0
  const totalYoy = totals.ly.rn === 0 ? 0 : (totals.otb.rn - totals.ly.rn) / totals.ly.rn * 100

  // YoY% 2컬럼 (바 + 숫자) — 양수 오른쪽 mint / 음수 왼쪽 red / 신규 NEW
  const yoyCells = (yoy: number, isNew: boolean) => {
    let barW: number, label: string, col: string
    const pos = isNew || yoy >= 0
    if (isNew) { barW = HALF; label = 'NEW'; col = MINT }
    else {
      barW = Math.min(Math.abs(yoy) / maxAbs * HALF, HALF)
      label = yoy === 0 ? '-' : `${yoy > 0 ? '+' : ''}${yoy.toFixed(1)}%`
      col = yoy > 0 ? MINT : yoy < 0 ? RED : TXT3
    }
    return (
      <>
        <td style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 140, height: 10, margin: '0 auto' }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.15)' }} />
            <div style={{
              position: 'absolute', top: 2, bottom: 2, width: barW, background: col, borderRadius: 2, opacity: 0.85,
              ...(pos ? { left: '50%' } : { right: '50%' }),
            }} />
          </div>
        </td>
        <td className="font-mono" style={{ ...td, minWidth: 56, color: col, fontWeight: isNew ? 700 : 500 }}>{label}</td>
      </>
    )
  }

  const groupCells = (c: Cell, bold?: boolean) => (
    <>
      <td style={{ ...td, boxShadow: GROUP_SHADOW, fontWeight: bold ? 700 : 400, color: bold ? '#fff' : '#ccc' }} className="font-mono">{fmtRn(c.rn)}</td>
      <td style={{ ...td, fontWeight: bold ? 700 : 400, color: bold ? '#fff' : '#ccc' }} className="font-mono"><FmtVal val={fmtAdr(c.adr)} numSize={11} /></td>
      <td style={{ ...td, fontWeight: bold ? 700 : 400, color: bold ? '#fff' : '#ccc' }} className="font-mono"><FmtVal val={fmtRev(c.rev)} numSize={11} /></td>
    </>
  )
  const gapCells = (otb: Cell, ly: Cell, bold?: boolean) => {
    const gRn = otb.rn - ly.rn, gAdr = otb.adr - ly.adr, gRev = otb.rev - ly.rev
    return (
      <>
        <td style={{ ...td, boxShadow: GROUP_SHADOW, color: gapColor(gRn), fontWeight: bold ? 700 : 500 }} className="font-mono">{gRn === 0 ? '-' : `${sign(gRn)}${gRn.toLocaleString('ko-KR')}`}</td>
        <td style={{ ...td, color: gapColor(gAdr), fontWeight: bold ? 700 : 500 }} className="font-mono"><FmtVal val={gAdr === 0 ? '-' : `${sign(gAdr)}${Math.round(gAdr / 1000)}K`} numSize={11} /></td>
        <td style={{ ...td, color: gapColor(gRev), fontWeight: bold ? 700 : 500 }} className="font-mono"><FmtVal val={gRev === 0 ? '-' : `${sign(gRev)}${(gRev / 1_000_000).toFixed(1)}M`} numSize={11} /></td>
      </>
    )
  }

  const groupTh = (label: string) => (
    <th colSpan={3} style={{ ...th, textAlign: 'center', boxShadow: GROUP_SHADOW, color: '#fff' }}>{label}</th>
  )

  // R/N 정렬 서브헤더
  const rnTh = (label: string, sk: 'otb' | 'ly' | 'gap') => {
    const active = sortKey === sk
    return (
      <th key={`${sk}-rn`} onClick={() => onSort(sk)} style={{ ...th, width: 80, minWidth: 80, boxShadow: GROUP_SHADOW, cursor: 'pointer', userSelect: 'none' }}>
        {label}{active && <span style={{ color: MINT, marginLeft: 3 }}>{sortDir === 'desc' ? '▼' : '▲'}</span>}
      </th>
    )
  }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'auto', maxWidth: '92vw', maxHeight: '88vh', background: BG, borderRadius: 12, border: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', borderBottom: BORDER_SUBTLE, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>어카운트별 실적 비교 — {monthKeyLabel(monthKey)}</div>
            <div style={{ fontSize: 11, color: TXT3, marginTop: 2 }}>OTB vs {lyLabel}</div>
          </div>
          <button onClick={onClose} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 14px',
            borderRadius: 8, border: 'none', background: CARD, color: '#ccc', cursor: 'pointer',
          }}>
            <X size={16} /> 닫기
          </button>
        </div>

        {/* 필터 바 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', gap: 16, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: TXT3 }}>세그먼트</span>
            <div ref={segRef} style={{ position: 'relative' }}>
              <button
                onClick={() => (segOpen ? setSegOpen(false) : openSegDropdown())}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px', borderRadius: 6,
                  background: CARD, border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer',
                }}
              >
                {selectedSegIds.length === 0 ? '전체 세그먼트' : `${selectedSegIds.length}개 선택`}
                <span style={{ color: TXT3, fontSize: 10 }}>▾</span>
              </button>
              {segOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50, width: 240,
                  background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.5)', overflow: 'hidden',
                }}>
                  <div style={{ maxHeight: 320, overflow: 'auto', padding: 4 }}>
                    {segOptions.map(o => {
                      const checked = tempSegIds.includes(o.id)
                      return (
                        <div
                          key={o.id}
                          onClick={() => toggleSeg(o.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                            paddingLeft: o.indent ? 22 : 8, cursor: 'pointer', borderRadius: 4,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{
                            width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                            border: `1px solid ${checked ? MINT : '#444'}`, background: checked ? MINT : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {checked && <span style={{ fontSize: 10, lineHeight: 1, color: '#0a2018' }}>✓</span>}
                          </span>
                          <span style={{ fontSize: 12, color: o.indent ? '#aaa' : '#fff' }}>
                            {o.indent && <span style={{ color: '#555', marginRight: 4 }}>└</span>}{o.name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: BORDER_SUBTLE }}>
                    <button onClick={onReset} style={{ flex: 1, fontSize: 11, padding: '6px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.15)', background: 'transparent', color: TXT3, cursor: 'pointer' }}>Reset</button>
                    <button onClick={onAll} style={{ flex: 1, fontSize: 11, padding: '6px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#ccc', cursor: 'pointer' }}>All</button>
                    <button onClick={onDone} style={{ flex: 1, fontSize: 11, padding: '6px', borderRadius: 6, border: 'none', background: MINT, color: '#0a2018', fontWeight: 600, cursor: 'pointer' }}>Done</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 11 }}>
            <span style={{ color: TXT3 }}>어카운트 <b style={{ color: '#fff', fontWeight: 600 }}>{rows.length.toLocaleString('ko-KR')}</b></span>
            <span style={{ color: TXT3 }}>OTB R/N <b style={{ color: '#fff', fontWeight: 600 }}>{totals.otb.rn.toLocaleString('ko-KR')}</b></span>
            <span style={{ color: TXT3 }}>LY R/N <b style={{ color: '#fff', fontWeight: 600 }}>{totals.ly.rn.toLocaleString('ko-KR')}</b></span>
            <span style={{ color: TXT3 }}>YoY <b style={{ color: totalIsNew ? MINT : gapColor(totalYoy), fontWeight: 700 }}>{totalIsNew ? 'NEW' : `${sign(totalYoy)}${totalYoy.toFixed(1)}%`}</b></span>
          </div>
        </div>

        {/* 테이블 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 32px' }}>
          <table style={{ minWidth: 980, borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...th, padding: '8px 8px', textAlign: 'left', position: 'sticky', left: 0, width: 180, minWidth: 180, zIndex: 2 }}>ACCOUNT</th>
                <th colSpan={2} style={{ ...th, textAlign: 'center', boxShadow: GROUP_SHADOW, color: '#fff' }}>YoY %</th>
                {groupTh('OTB')}
                <th colSpan={3} style={{ ...th, textAlign: 'center', boxShadow: GROUP_SHADOW, color: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span style={{ color: '#555' }}>LY</span>
                    <span style={{ color: '#2a2a2a' }}>·</span>
                    <span
                      onClick={() => setLyMode('match')}
                      style={{
                        cursor: 'pointer', fontSize: 10, paddingBottom: 1,
                        color: lyMode === 'match' ? MINT : '#444', fontWeight: lyMode === 'match' ? 600 : 400,
                        borderBottom: lyMode === 'match' ? `1px solid ${MINT}` : '1px solid transparent',
                      }}
                    >
                      YoY Match
                    </span>
                    <span style={{ color: '#333' }}>/</span>
                    <span
                      onClick={() => setLyMode('date')}
                      style={{
                        cursor: 'pointer', fontSize: 10, paddingBottom: 1,
                        color: lyMode === 'date' ? MINT : '#444', fontWeight: lyMode === 'date' ? 600 : 400,
                        borderBottom: lyMode === 'date' ? `1px solid ${MINT}` : '1px solid transparent',
                      }}
                    >
                      Same Date
                    </span>
                  </div>
                </th>
                {groupTh('GAP')}
              </tr>
              <tr>
                <th style={{ ...th, textAlign: 'center', minWidth: 150, boxShadow: GROUP_SHADOW }}>감소 ◄ ► 증가</th>
                <th style={{ ...th, minWidth: 56 }}>YoY</th>
                {(['OTB', 'LY', 'GAP'] as const).map(g => (
                  ['R/N', 'ADR', 'REV'].map((s) => (
                    s === 'R/N'
                      ? rnTh('R/N', g.toLowerCase() as 'otb' | 'ly' | 'gap')
                      : <th key={`${g}-${s}`} style={{ ...th, width: 80, minWidth: 80 }}>{s}</th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.account}>
                  <td style={{ ...td, padding: '8px 8px', textAlign: 'left', position: 'sticky', left: 0, background: BG, color: '#fff', minWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{r.account}</td>
                  {yoyCells(r.yoy, r.isNew)}
                  {groupCells(r.otb)}
                  {groupCells(r.ly)}
                  {gapCells(r.otb, r.ly)}
                </tr>
              ))}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ ...td, textAlign: 'center', color: TXT3, padding: '24px 8px' }}>데이터 없음</td>
                </tr>
              )}
              {/* 합계 */}
              <tr style={{ background: '#111' }}>
                <td style={{ ...td, padding: '8px 8px', textAlign: 'left', position: 'sticky', left: 0, background: '#111', fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.1)' }}>합계</td>
                {yoyCells(totalYoy, totalIsNew)}
                {groupCells(totals.otb, true)}
                {groupCells(totals.ly, true)}
                {gapCells(totals.otb, totals.ly, true)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  )
}
