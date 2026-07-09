'use client'

import { useEffect, useMemo, useState } from 'react'
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

export default function AccountComparisonModal({ open, onClose, hotelId, monthKey, pickupRows }: AccountComparisonModalProps) {
  const [lyMode,    setLyMode]    = useState<LyMode>('match')
  const [segFilter, setSegFilter] = useState<string>('ALL')

  const [year, month] = monthKey.split('-').map(Number)

  const { data: schema = [] } = useMarketSchema()

  // pickupRows에 실제 존재하는 세그 코드만 + schema name 매핑
  const segOptions = useMemo(() => {
    const codes = new Set(pickupRows.map(r => r.segmentation).filter(Boolean))
    return schema
      .filter(s => s.segmentation?.some((c: string) => codes.has(c)))
      .map(s => ({ code: s.segmentation?.[0] ?? '', name: s.name, codes: s.segmentation ?? [] }))
  }, [pickupRows, schema])

  // ── OTB 집계 (pickupRows → account_name 단위) ──────────────────────────────────
  const otbByAccount = useMemo(() => {
    const map = new Map<string, { rn: number; rev: number }>()
    for (const r of pickupRows) {
      const d = new Date(r.business_date)
      if (d.getFullYear() !== year || d.getMonth() !== month - 1) continue
      if (segFilter !== 'ALL') {
        const opt = segOptions.find(o => o.code === segFilter)
        if (!opt || !opt.codes.includes(r.segmentation)) continue
      }
      const acc = r.account_name || '(미지정)'
      const cur = map.get(acc) ?? { rn: 0, rev: 0 }
      map.set(acc, { rn: cur.rn + (r.otb_nights ?? 0), rev: cur.rev + (r.otb_revenue ?? 0) })
    }
    return map
  }, [pickupRows, year, month, segFilter, segOptions])

  // ── LY 조회 (a01_actual_daily 직접 — lyRows 패턴 + account_name) ───────────────
  const { data: lyRows = [] } = useQuery({
    queryKey: ['acct-cmp-ly', hotelId, monthKey, lyMode, segFilter],
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
      if (segFilter !== 'ALL') {
        const opt = segOptions.find(o => o.code === segFilter)
        if (!opt || !opt.codes.includes(r.segmentation)) continue
      }
      const acc = r.account_name || '(미지정)'
      const cur = map.get(acc) ?? { rn: 0, rev: 0 }
      map.set(acc, { rn: cur.rn + (r.nights ?? 0), rev: cur.rev + (r.room_revenue ?? 0) })
    }
    return map
  }, [lyRows, segFilter, segOptions])

  // ── 행 조립 (OTB ∪ LY 어카운트, OTB R/N desc 정렬) ─────────────────────────────
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
    })).sort((a, b) => b.otb.rn - a.otb.rn)
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

  // YoY% (OTB R/N 기준)
  const yoyOf = (otbRn: number, lyRn: number) => ((otbRn - lyRn) / (lyRn || 1)) * 100
  const maxAbsYoy = useMemo(() => {
    let m = 0
    for (const r of rows) m = Math.max(m, Math.abs(yoyOf(r.otb.rn, r.ly.rn)))
    return m || 1
  }, [rows])
  const totalYoy = yoyOf(totals.otb.rn, totals.ly.rn)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  if (!open) return null

  const lyLabel = lyMode === 'match' ? '전년동기간' : '전년동일자'

  // YoY% 양방향 바 (중앙 기준선, 양수 오른쪽 mint / 음수 왼쪽 red)
  const yoyBar = (v: number) => {
    const pct = Math.min(Math.abs(v) / maxAbsYoy, 1) * 50   // 반쪽 폭(%)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
        <div style={{ position: 'relative', width: 90, height: 10, flexShrink: 0 }}>
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.15)' }} />
          {v >= 0 ? (
            <div style={{ position: 'absolute', left: '50%', top: 2, bottom: 2, width: `${pct}%`, background: MINT, borderRadius: 2, opacity: 0.85 }} />
          ) : (
            <div style={{ position: 'absolute', right: '50%', top: 2, bottom: 2, width: `${pct}%`, background: RED, borderRadius: 2, opacity: 0.85 }} />
          )}
        </div>
        <span className="font-mono" style={{ fontSize: 11, minWidth: 48, textAlign: 'right', color: gapColor(v) }}>
          {v === 0 ? '-' : `${sign(v)}${v.toFixed(1)}%`}
        </span>
      </div>
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

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '95%', maxWidth: 1600, height: '100vh', background: BG, borderRadius: 10, border: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
            <select
              value={segFilter}
              onChange={e => setSegFilter(e.target.value)}
              style={{
                fontSize: 12, padding: '5px 8px', borderRadius: 6, background: CARD,
                border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="ALL" style={{ background: CARD }}>전체 (All)</option>
              {segOptions.map((o, i) => (
                <option key={`${o.code}-${i}`} value={o.code} style={{ background: CARD }}>{o.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 11 }}>
            <span style={{ color: TXT3 }}>어카운트 <b style={{ color: '#fff', fontWeight: 600 }}>{rows.length.toLocaleString('ko-KR')}</b></span>
            <span style={{ color: TXT3 }}>OTB R/N <b style={{ color: '#fff', fontWeight: 600 }}>{totals.otb.rn.toLocaleString('ko-KR')}</b></span>
            <span style={{ color: TXT3 }}>LY R/N <b style={{ color: '#fff', fontWeight: 600 }}>{totals.ly.rn.toLocaleString('ko-KR')}</b></span>
            <span style={{ color: TXT3 }}>YoY <b style={{ color: gapColor(totalYoy), fontWeight: 700 }}>{sign(totalYoy)}{totalYoy.toFixed(1)}%</b></span>
          </div>
        </div>

        {/* 테이블 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 32px' }}>
          <table style={{ minWidth: 980, borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...th, padding: '8px 8px', textAlign: 'left', position: 'sticky', left: 0, width: 180, minWidth: 180, zIndex: 2 }}>ACCOUNT</th>
                <th rowSpan={2} style={{ ...th, textAlign: 'center', minWidth: 150 }}>YoY %</th>
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
                {['OTB', 'LY', 'GAP'].map(g => (
                  ['R/N', 'ADR', 'REV'].map((s, si) => (
                    <th key={`${g}-${s}`} style={{ ...th, width: 80, minWidth: 80, ...(si === 0 ? { boxShadow: GROUP_SHADOW } : {}) }}>{s}</th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const yoy = yoyOf(r.otb.rn, r.ly.rn)
                return (
                  <tr key={r.account}>
                    <td style={{ ...td, padding: '8px 8px', textAlign: 'left', position: 'sticky', left: 0, background: BG, color: '#fff', minWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{r.account}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{yoyBar(yoy)}</td>
                    {groupCells(r.otb)}
                    {groupCells(r.ly)}
                    {gapCells(r.otb, r.ly)}
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ ...td, textAlign: 'center', color: TXT3, padding: '24px 8px' }}>데이터 없음</td>
                </tr>
              )}
              {/* 합계 */}
              <tr style={{ background: '#111' }}>
                <td style={{ ...td, padding: '8px 8px', textAlign: 'left', position: 'sticky', left: 0, background: '#111', fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.1)' }}>합계</td>
                <td style={{ ...td, textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.1)' }}>{yoyBar(totalYoy)}</td>
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
