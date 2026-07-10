'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { buildSegTable, type SegTableRow } from '@/utils/segmentationTable'
import { FmtVal } from '@/utils/FmtVal'

interface PacingDeltaModalProps {
  open:         boolean
  onClose:      () => void
  hotelId:      string
  stayDate:     string   // 'YYYY-MM-DD'
  snapshot:     string   // 현재 스냅샷 update_date
  prevSnapshot: string   // 전날 스냅샷 update_date
  roomCount:    number
}

type DeltaRow = {
  segmentation: string
  account_name: string | null
  prev_nights:  number
  cur_nights:   number
  delta_nights: number
  prev_revenue: number
  cur_revenue:  number
  delta_revenue: number
}

// ── 포맷/색상 헬퍼 (SegmentYoyModal과 동일) ──────────────────────────────────────
const fmtOtbRn  = (v: number) => v === 0 ? '—' : v.toLocaleString()
const fmtOtbAdr = (v: number) => v === 0 ? '—' : `${Math.round(v / 1000)}k`
const fmtOtbRev = (v: number) => v === 0 ? '—' : `${(v / 1e6).toFixed(1)}M`
const gapColor   = (v: number) => v > 0 ? '#00E5A0' : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
const fmtGapRn   = (v: number) => v === 0 ? '—' : `${v > 0 ? '+' : ''}${v}`
const fmtGapAdrK = (v: number) => Math.abs(v) < 500 ? '—' : `${v > 0 ? '+' : ''}${Math.round(v / 1000)}k`
const fmtGapRevM = (v: number) => Math.abs(v) < 50000 ? '—' : `${v > 0 ? '+' : ''}${(v / 1e6).toFixed(1)}M`
const prevGray = 'rgba(255,255,255,0.45)'

const segTextColor = (r: SegTableRow) => r.fontDarkColor ?? 'var(--color-text-primary)'
const segBgColor   = (r: SegTableRow) =>
  r.bgDarkColor ?? (r.level === 'main' ? '#1A1F2E' : r.level === 'mid' ? '#15192A' : 'transparent')

const DIV = '#1e1e1e'
const stickyTop0  = { position: 'sticky', top: 0,  background: '#0a0a0a', zIndex: 2 } as React.CSSProperties
const stickyTop24 = { position: 'sticky', top: 24, background: '#0a0a0a', zIndex: 2 } as React.CSSProperties
const segHeadTh: React.CSSProperties = { textAlign: 'right', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)' }
const accHeadTh: React.CSSProperties = { textAlign: 'right', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }

const shortDate = (s: string) => {
  const d = new Date(s)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function PacingDeltaModal({ open, onClose, hotelId, stayDate, snapshot, prevSnapshot, roomCount }: PacingDeltaModalProps) {
  const [selMain, setSelMain]     = useState<string | null>(null)
  const [fontScale, setFontScale] = useState(1)   // 모달 열 때마다 1.0

  const decFont = () => setFontScale(s => Math.max(0.7, Math.round((s - 0.1) * 10) / 10))
  const incFont = () => setFontScale(s => Math.min(1.5, Math.round((s + 0.1) * 10) / 10))

  const [year, month0] = stayDate.split('-').map(Number)   // month0: 1-based

  const { data: schema = [] } = useMarketSchema()

  // 표 본문 폰트 배율 파생본
  const numSizeS = 11 * fontScale
  const segHeadThS = useMemo(() => ({ ...segHeadTh, fontSize: 10 * fontScale }), [fontScale])
  const accHeadThS = useMemo(() => ({ ...accHeadTh, fontSize: 10 * fontScale }), [fontScale])

  // 세그 트리 (해당 일자 — 값은 delta로 덮어쓰므로 pickup 없이 트리 구조만 사용)
  const rows = useMemo(
    () => buildSegTable({ schema, pickup: [], year, month: month0, roomCount, day: Number(stayDate.split('-')[2]) }).rows,
    [schema, year, month0, roomCount, stayDate],
  )

  // 스키마 id별 세그 코드 (main=자식 코드 합집합 / sub=자기 코드)
  const codesBySchemaId = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const s of schema) {
      m[s.id] = s.level === 'main'
        ? schema.filter(c => c.parent_id === s.id).flatMap(c => c.segmentation ?? [])
        : (s.segmentation ?? [])
    }
    return m
  }, [schema])

  // ── 증감(delta) 데이터 — get_pacing_delta ──────────────────────────────────────
  const { data: deltaRows = [] } = useQuery({
    queryKey: ['pacing-delta', hotelId, stayDate, snapshot, prevSnapshot],
    enabled: open && !!hotelId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_pacing_delta', {
        p_hotel_id: hotelId, p_stay_date: stayDate,
        p_snapshot: snapshot, p_prev_snapshot: prevSnapshot,
      })
      if (error) throw error
      return (data ?? []) as DeltaRow[]
    },
  })

  // 코드별 delta 집계
  const byCode = useMemo(() => {
    const m: Record<string, { prevN: number; prevR: number; curN: number; curR: number }> = {}
    for (const r of deltaRows) {
      const c = m[r.segmentation] ?? (m[r.segmentation] = { prevN: 0, prevR: 0, curN: 0, curR: 0 })
      c.prevN += r.prev_nights ?? 0; c.prevR += r.prev_revenue ?? 0
      c.curN  += r.cur_nights  ?? 0; c.curR  += r.cur_revenue  ?? 0
    }
    return m
  }, [deltaRows])

  // 선택 세그 어카운트별 delta — 우측 패널 (감소 먼저)
  const acctRows = useMemo(() => {
    if (!selMain) return []
    const codes = new Set(codesBySchemaId[selMain] ?? [])
    const m = new Map<string, { prevN: number; prevR: number; curN: number; curR: number }>()
    for (const r of deltaRows) {
      if (!codes.has(r.segmentation)) continue
      const acc = r.account_name || '(미지정)'
      const a = m.get(acc) ?? { prevN: 0, prevR: 0, curN: 0, curR: 0 }
      a.prevN += r.prev_nights ?? 0; a.prevR += r.prev_revenue ?? 0
      a.curN  += r.cur_nights  ?? 0; a.curR  += r.cur_revenue  ?? 0
      m.set(acc, a)
    }
    return Array.from(m.entries()).map(([account, a]) => {
      const prevAdr = a.prevN > 0 ? Math.round(a.prevR / a.prevN) : 0
      const curAdr  = a.curN  > 0 ? Math.round(a.curR  / a.curN)  : 0
      return {
        account,
        prevN: a.prevN, curN: a.curN, gapN: a.curN - a.prevN,
        prevR: a.prevR, curR: a.curR, gapR: a.curR - a.prevR,
        prevAdr, curAdr, gapAdr: curAdr - prevAdr,
      }
    })
      .filter(a => a.gapN !== 0 || a.gapR !== 0)
      .sort((a, b) => a.gapN - b.gapN)   // 감소(음수) 먼저
  }, [selMain, deltaRows, codesBySchemaId])

  useEffect(() => {
    if (!open) return
    setSelMain(null)
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  if (!open) return null

  const selRow = rows.find(r => r.id === selMain)

  // 행(세그)별 delta 값 — 전날 / 현재 / Δ
  const deltaForRow = (rowId: string) => {
    const codes = codesBySchemaId[rowId] ?? []
    let prevN = 0, prevR = 0, curN = 0, curR = 0
    for (const code of codes) {
      const c = byCode[code]
      if (c) { prevN += c.prevN; prevR += c.prevR; curN += c.curN; curR += c.curR }
    }
    const prevAdr = prevN > 0 ? Math.round(prevR / prevN) : 0
    const curAdr  = curN  > 0 ? Math.round(curR  / curN)  : 0
    return {
      prevN, prevAdr, prevR, curN, curAdr, curR,
      gapN: curN - prevN, gapAdr: curAdr - prevAdr, gapR: curR - prevR,
    }
  }

  const total = rows.filter(r => r.level === 'main').reduce((t, r) => {
    const v = deltaForRow(r.id)
    return { prevN: t.prevN + v.prevN, prevR: t.prevR + v.prevR, curN: t.curN + v.curN, curR: t.curR + v.curR }
  }, { prevN: 0, prevR: 0, curN: 0, curR: 0 })
  const totPrevAdr = total.prevN > 0 ? Math.round(total.prevR / total.prevN) : 0
  const totCurAdr  = total.curN  > 0 ? Math.round(total.curR  / total.curN)  : 0
  const gapTotN    = total.curN - total.prevN
  const gapTotAdr  = totCurAdr - totPrevAdr
  const gapTotR    = total.curR - total.prevR
  const prevOcc = total.prevN / (roomCount || 1) * 100
  const curOcc  = total.curN  / (roomCount || 1) * 100

  const selectSeg = (id: string) => setSelMain(prev => prev === id ? null : id)

  const grpTh = (color: string): React.CSSProperties => ({ ...stickyTop0, textAlign: 'center', padding: '6px 12px', fontSize: 10 * fontScale, fontWeight: 700, color, letterSpacing: '0.07em', background: '#0f0f0f', borderLeft: `1px solid ${DIV}`, borderBottom: `2px solid ${color}` })

  const renderTable = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 * fontScale }}>
      <thead>
        <tr>
          <th style={{ ...stickyTop0, textAlign: 'left', padding: '6px 12px', fontSize: 10 * fontScale, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>SEGMENT</th>
          <th colSpan={3} style={grpTh('#5B8DEF')}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span>전날</span>
              <span style={{ fontSize: 9 * fontScale, fontWeight: 400, color: 'rgba(255,255,255,0.4)', letterSpacing: 0 }}>{shortDate(prevSnapshot)}</span>
            </div>
          </th>
          <th colSpan={3} style={grpTh('#a78bfa')}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span>현재</span>
              <span style={{ fontSize: 9 * fontScale, fontWeight: 400, color: 'rgba(255,255,255,0.4)', letterSpacing: 0 }}>{shortDate(snapshot)}</span>
            </div>
          </th>
          <th colSpan={3} style={grpTh('#F59E0B')}>Δ</th>
        </tr>
        <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
          <th style={{ ...stickyTop24, padding: '4px 12px 6px' }} />
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => (<th key={`p-${h}`} style={{ ...segHeadThS, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>))}
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => (<th key={`c-${h}`} style={{ ...segHeadThS, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>))}
          {(['ΔR/N', 'ΔADR', 'ΔREV'] as const).map((h, i) => (<th key={`g-${h}`} style={{ ...segHeadThS, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const isSub = r.level === 'sub'
          const v = deltaForRow(r.id)
          const active = selMain === r.id
          const cColor = v.curN > 0 ? segTextColor(r) : 'rgba(255,255,255,0.25)'
          return (
            <tr key={r.id} onClick={() => selectSeg(r.id)} style={{ cursor: 'pointer', background: active ? 'rgba(0,229,160,0.06)' : segBgColor(r), borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: isSub ? '5px 12px 5px 24px' : '7px 12px', color: segTextColor(r), fontWeight: r.isBold ? 600 : 400, boxShadow: active ? 'inset 3px 0 0 #00E5A0' : undefined }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {isSub && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 * fontScale }}>└</span>}
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: r.bgDarkColor || '#888', flexShrink: 0 }} />
                  {r.name}
                </span>
              </td>
              {/* 전날 */}
              <td style={{ padding: '5px 12px', textAlign: 'right', color: prevGray, borderLeft: `1px solid ${DIV}` }}>{fmtOtbRn(v.prevN)}</td>
              <td style={{ padding: '5px 12px', textAlign: 'right', color: prevGray }}><FmtVal val={fmtOtbAdr(v.prevAdr)} numSize={numSizeS} /></td>
              <td style={{ padding: '5px 12px', textAlign: 'right', color: prevGray }}><FmtVal val={fmtOtbRev(v.prevR)} numSize={numSizeS} /></td>
              {/* 현재 */}
              <td style={{ padding: '5px 12px', textAlign: 'right', color: cColor, borderLeft: `1px solid ${DIV}` }}>{fmtOtbRn(v.curN)}</td>
              <td style={{ padding: '5px 12px', textAlign: 'right', color: cColor }}><FmtVal val={fmtOtbAdr(v.curAdr)} numSize={numSizeS} /></td>
              <td style={{ padding: '5px 12px', textAlign: 'right', color: cColor }}><FmtVal val={fmtOtbRev(v.curR)} numSize={numSizeS} /></td>
              {/* Δ */}
              <td style={{ padding: '5px 12px', textAlign: 'right', color: gapColor(v.gapN), borderLeft: `1px solid ${DIV}`, fontWeight: 500 }}>{fmtGapRn(v.gapN)}</td>
              <td style={{ padding: '5px 12px', textAlign: 'right', color: gapColor(v.gapAdr) }}><FmtVal val={fmtGapAdrK(v.gapAdr)} numSize={numSizeS} /></td>
              <td style={{ padding: '5px 12px', textAlign: 'right', color: gapColor(v.gapR) }}><FmtVal val={fmtGapRevM(v.gapR)} numSize={numSizeS} /></td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr style={{ position: 'sticky', bottom: 0, background: '#0a0a0a' }}>
          <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}>Total</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: prevGray, borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtOtbRn(total.prevN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: prevGray, borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbAdr(totPrevAdr)} numSize={numSizeS} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: prevGray, borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbRev(total.prevR)} numSize={numSizeS} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtOtbRn(total.curN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbAdr(totCurAdr)} numSize={numSizeS} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbRev(total.curR)} numSize={numSizeS} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(gapTotN), borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtGapRn(gapTotN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(gapTotAdr), borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtGapAdrK(gapTotAdr)} numSize={numSizeS} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(gapTotR), borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtGapRevM(gapTotR)} numSize={numSizeS} /></td>
        </tr>
        <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          <td style={{ padding: '6px 12px', fontSize: 11 * fontScale, color: 'rgba(255,255,255,0.4)' }}>OCC</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11 * fontScale, fontWeight: 500, color: prevGray, borderLeft: `1px solid ${DIV}` }}>{prevOcc.toFixed(1)}%</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11 * fontScale, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}>{curOcc.toFixed(1)}%</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11 * fontScale, fontWeight: 500, color: gapColor(gapTotN), borderLeft: `1px solid ${DIV}` }}>{gapTotN >= 0 ? '+' : ''}{(curOcc - prevOcc).toFixed(1)}%p</td>
        </tr>
        <tr>
          <td style={{ padding: '6px 12px', fontSize: 11 * fontScale, color: 'rgba(255,255,255,0.4)' }}>Rev.PAR</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11 * fontScale, fontWeight: 500, color: prevGray, borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={numSizeS} val={`${Math.round(total.prevR / (roomCount || 1) / 1000)}k`} /></td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11 * fontScale, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={numSizeS} val={`${Math.round(total.curR / (roomCount || 1) / 1000)}k`} /></td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11 * fontScale, fontWeight: 500, color: gapColor(gapTotR), borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={numSizeS} val={`${gapTotR >= 0 ? '+' : ''}${Math.round(gapTotR / (roomCount || 1) / 1000)}k`} /></td>
        </tr>
      </tfoot>
    </table>
  )

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100010, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 1400, maxWidth: '95vw', height: 'auto', maxHeight: '90vh', background: '#0a0a0a', borderRadius: 12, border: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{stayDate} · 점유율 증감 분석</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{shortDate(snapshot)} vs {shortDate(prevSnapshot)} (전날)</span>
            </div>
            {/* 순증감 요약 */}
            <div style={{ display: 'flex', gap: 12, paddingLeft: 12, borderLeft: '1px solid #1a1a1a' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>순증감 R/N</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: gapColor(gapTotN) }}>{fmtGapRn(gapTotN)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>매출</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: gapColor(gapTotR) }}>{fmtGapRevM(gapTotR)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>점유율</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: gapColor(gapTotN) }}>{prevOcc.toFixed(1)}→{curOcc.toFixed(1)}%</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 표 폰트 배율 A- / A+ */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <button onClick={decFont} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, width: 26, height: 26, borderRadius: 6,
                border: '1px solid #2a2a2a', background: 'transparent', color: '#888',
                cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
              }}>A-</button>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', minWidth: 30, textAlign: 'center', fontFamily: 'monospace' }}>
                {Math.round(fontScale * 100)}%
              </span>
              <button onClick={incFont} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, width: 26, height: 26, borderRadius: 6,
                border: '1px solid #2a2a2a', background: 'transparent', color: '#888',
                cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
              }}>A+</button>
            </div>
            <button onClick={onClose} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 14px',
              borderRadius: 8, border: 'none', background: '#141414', color: '#ccc', cursor: 'pointer',
            }}>
              <X size={16} /> 닫기
            </button>
          </div>
        </div>

        {/* 본문 — 세그 증감 테이블 · 어카운트 */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* 좌측: 세그 증감 테이블 */}
          <div style={{ width: 900, flexShrink: 0, borderRight: '0.5px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
            {renderTable()}
          </div>

          {/* 우측 어카운트 패널 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!selMain ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 28, opacity: 0.2 }}>👆</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Select a segment</span>
              </div>
            ) : (
              <>
                <div style={{ padding: '10px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: selRow?.bgDarkColor || '#888', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{selRow?.name} · 증감 (Δ)</span>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {acctRows.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No data</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 * fontScale }}>
                      <thead>
                        <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1 }}>
                          <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10 * fontScale, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>ACCOUNT</th>
                          {(['ΔR/N', 'ΔADR', 'ΔREV'] as const).map(h => <th key={h} style={accHeadThS}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {acctRows.map(a => (
                          <tr key={a.account} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                          >
                            <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,0.75)' }}>{a.account}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', color: gapColor(a.gapN) }}>{fmtGapRn(a.gapN)}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', color: gapColor(a.gapAdr) }}><FmtVal val={fmtGapAdrK(a.gapAdr)} numSize={numSizeS} /></td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', color: gapColor(a.gapR) }}><FmtVal val={fmtGapRevM(a.gapR)} numSize={numSizeS} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
