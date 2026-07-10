'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { useLyPacing } from '@/hooks/useLyPacing'
import { buildSegTable, type SegTableRow } from '@/utils/segmentationTable'
import type { PickupRow } from '@/hooks/usePickupData'
import type { SegGroup } from './MeetingPickupBlock'
import { monthKeyLabel } from './dummyMeetingData'
import { FmtVal } from '@/utils/FmtVal'

interface SegmentYoyModalProps {
  open:       boolean
  onClose:    () => void
  hotelId:    string
  monthKey:   string        // 'YYYY-MM'
  pickupRows: PickupRow[]    // 현재 OTB (월 전체, account_name 포함)
  roomCount:  number
  groups:     SegGroup[]
}

// ── 포맷/색상 헬퍼 (MarketPickupDayModal 전년 비교 탭과 동일) ──────────────────────
const fmtOtbRn  = (v: number) => v === 0 ? '—' : v.toLocaleString()
const fmtOtbAdr = (v: number) => v === 0 ? '—' : `${Math.round(v / 1000)}k`
const fmtOtbRev = (v: number) => v === 0 ? '—' : `${(v / 1e6).toFixed(1)}M`
const gapColor   = (v: number) => v > 0 ? '#00E5A0' : v < 0 ? '#E24B4A' : 'rgba(255,255,255,0.25)'
const fmtGapRn   = (v: number) => v === 0 ? '—' : `${v > 0 ? '+' : ''}${v}`
const fmtGapAdrK = (v: number) => Math.abs(v) < 500 ? '—' : `${v > 0 ? '+' : ''}${Math.round(v / 1000)}k`
const fmtGapRevM = (v: number) => Math.abs(v) < 50000 ? '—' : `${v > 0 ? '+' : ''}${(v / 1e6).toFixed(1)}M`
const lyGray = 'rgba(255,255,255,0.45)'

const segTextColor = (r: SegTableRow) => r.fontDarkColor ?? 'var(--color-text-primary)'
const segBgColor   = (r: SegTableRow) =>
  r.bgDarkColor ?? (r.level === 'main' ? '#1A1F2E' : r.level === 'mid' ? '#15192A' : 'transparent')

const DIV = '#1e1e1e'
const stickyTop0  = { position: 'sticky', top: 0,  background: '#0a0a0a', zIndex: 2 } as React.CSSProperties
const stickyTop24 = { position: 'sticky', top: 24, background: '#0a0a0a', zIndex: 2 } as React.CSSProperties
const segHeadTh: React.CSSProperties = { textAlign: 'right', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)' }
const accHeadTh: React.CSSProperties = { textAlign: 'right', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }

export default function SegmentYoyModal({ open, onClose, hotelId, monthKey, pickupRows, roomCount }: SegmentYoyModalProps) {
  const [lyMode, setLyMode]           = useState<'day' | 'period'>('day')       // 전년동일자(v1) / 전년동기간(v2)
  const [lyColMode, setLyColMode]     = useState(true)                          // true=전년OTB(pacing) / false=전년마감(a01)
  const [lyAccSource, setLyAccSource] = useState<'otb' | 'ly' | 'gap'>('gap')   // 어카운트 패널 소스
  const [selMain, setSelMain]         = useState<string | null>(null)

  const [year, month0] = monthKey.split('-').map(Number)   // month0: 1-based

  const { data: schema = [] } = useMarketSchema()

  // 세그 트리 (월 전체 — buildSegTable에 day 미지정 → 월 집계, month은 1-based)
  const rows = useMemo(
    () => buildSegTable({ schema, pickup: pickupRows, year, month: month0, roomCount }).rows,
    [schema, pickupRows, year, month0, roomCount],
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

  // ── 전년(LY) 비교 — useLyPacing(v1=전년동일자 / v2=전년동기간), 해당 월 전체 필터 ──
  const { data: lyPacing } = useLyPacing(lyMode === 'day' ? 'v1' : 'v2')
  const inMonth = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.getFullYear() === year && d.getMonth() === month0 - 1
  }
  // 월 전체 코드별 현재 OTB / 작년 OTB 집계 (lyPacing 단일 소스 → GAP 일관성)
  const lyByCode = useMemo(() => {
    const m: Record<string, { otbN: number; otbR: number; lyN: number; lyR: number }> = {}
    for (const r of (lyPacing ?? [])) {
      if (!inMonth(r.business_date)) continue
      const c = m[r.segmentation] ?? (m[r.segmentation] = { otbN: 0, otbR: 0, lyN: 0, lyR: 0 })
      c.otbN += r.otb_nights ?? 0; c.otbR += r.otb_revenue ?? 0
      c.lyN  += r.ly_nights  ?? 0; c.lyR  += r.ly_revenue  ?? 0
    }
    return m
  }, [lyPacing, year, month0])

  // 전년마감(a01_actual_daily 실적) — lyColMode=false일 때만 조회 (월 범위)
  const { data: lyFinalRows = [] } = useQuery({
    queryKey: ['seg-yoy-ly-final', hotelId, year, month0, lyMode],
    enabled: open && !lyColMode && !!hotelId,
    queryFn: async () => {
      const pad = (n: number) => String(n).padStart(2, '0')
      const m = month0   // 1-based
      if (lyMode === 'period') {
        // 당월 전체 → c06_calendar.yoy_match 매핑된 전년 날짜들
        const calStart = `${year}-${pad(m)}-01`
        const calEnd   = `${year}-${pad(m)}-31`
        const { data: cal } = await (supabase as any).from('c06_calendar')
          .select('date, yoy_match').gte('date', calStart).lte('date', calEnd)
        const lyDates = (cal ?? []).map((c: any) => c.yoy_match).filter(Boolean)
        if (lyDates.length === 0) return []
        const { data } = await (supabase as any).from('a01_actual_daily')
          .select('segmentation, account_name, nights, room_revenue')
          .eq('hotel_id', hotelId).in('business_date', lyDates)
        return (data ?? []) as { segmentation: string; account_name: string | null; nights: number; room_revenue: number }[]
      }
      // day: 전년 동월 전체 (year-1, 같은 월 01~31)
      const start = `${year - 1}-${pad(m)}-01`
      const end   = `${year - 1}-${pad(m)}-31`
      const { data } = await (supabase as any).from('a01_actual_daily')
        .select('segmentation, account_name, nights, room_revenue')
        .eq('hotel_id', hotelId).gte('business_date', start).lte('business_date', end)
      return (data ?? []) as { segmentation: string; account_name: string | null; nights: number; room_revenue: number }[]
    },
  })
  // 세그 코드별 전년마감 집계 (테이블 작년 OTB 컬럼용)
  const lyFinalByCode = useMemo(() => {
    const m: Record<string, { lyN: number; lyR: number }> = {}
    for (const r of lyFinalRows) {
      const c = m[r.segmentation] ?? (m[r.segmentation] = { lyN: 0, lyR: 0 })
      c.lyN += r.nights ?? 0; c.lyR += r.room_revenue ?? 0
    }
    return m
  }, [lyFinalRows])

  // 선택 세그 어카운트별 현재 OTB / 작년 OTB / GAP — 우측 패널 (소스별 표시)
  const lyAccountRows = useMemo(() => {
    if (!open || !selMain) return []
    const codeSet = new Set(codesBySchemaId[selMain] ?? [])
    // 현재 OTB(항상 pacing)
    const otbMap = new Map<string, { otbN: number; otbR: number }>()
    for (const r of (lyPacing ?? [])) {
      if (!inMonth(r.business_date)) continue
      if (!codeSet.has(r.segmentation)) continue
      const acc = r.account_name || '(미지정)'
      const a = otbMap.get(acc) ?? { otbN: 0, otbR: 0 }
      a.otbN += r.otb_nights ?? 0; a.otbR += r.otb_revenue ?? 0
      otbMap.set(acc, a)
    }
    // 작년 OTB: lyColMode=true → pacing ly / false → 전년마감(a01)
    const lyMap = new Map<string, { lyN: number; lyR: number }>()
    if (lyColMode) {
      for (const r of (lyPacing ?? [])) {
        if (!inMonth(r.business_date)) continue
        if (!codeSet.has(r.segmentation)) continue
        const acc = r.account_name || '(미지정)'
        const a = lyMap.get(acc) ?? { lyN: 0, lyR: 0 }
        a.lyN += r.ly_nights ?? 0; a.lyR += r.ly_revenue ?? 0
        lyMap.set(acc, a)
      }
    } else {
      for (const r of lyFinalRows) {
        if (!codeSet.has(r.segmentation)) continue
        const acc = r.account_name || '(미지정)'
        const a = lyMap.get(acc) ?? { lyN: 0, lyR: 0 }
        a.lyN += r.nights ?? 0; a.lyR += r.room_revenue ?? 0
        lyMap.set(acc, a)
      }
    }
    const names = new Set<string>([...otbMap.keys(), ...lyMap.keys()])
    const list = Array.from(names).map(name => {
      const o = otbMap.get(name) ?? { otbN: 0, otbR: 0 }
      const l = lyMap.get(name) ?? { lyN: 0, lyR: 0 }
      const otbAdr = o.otbN > 0 ? Math.round(o.otbR / o.otbN) : 0
      const lyAdr  = l.lyN  > 0 ? Math.round(l.lyR  / l.lyN)  : 0
      return {
        name,
        otbN: o.otbN, otbAdr, otbR: o.otbR,
        lyN:  l.lyN,  lyAdr,  lyR:  l.lyR,
        gapN: o.otbN - l.lyN, gapAdr: otbAdr - lyAdr, gapR: o.otbR - l.lyR,
      }
    })
    const keyN = lyAccSource === 'otb' ? 'otbN' : lyAccSource === 'ly' ? 'lyN' : 'gapN'
    const keyR = lyAccSource === 'otb' ? 'otbR' : lyAccSource === 'ly' ? 'lyR' : 'gapR'
    return list
      .filter(a => a[keyN] !== 0 || a[keyR] !== 0)
      .sort((a, b) => Math.abs(b[keyN]) - Math.abs(a[keyN]))
  }, [open, selMain, codesBySchemaId, lyPacing, lyFinalRows, lyColMode, year, month0, lyAccSource])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  if (!open) return null

  const selRow = rows.find(r => r.id === selMain)

  // 행(세그)별 전년 비교 값 — 현재 OTB / 작년 OTB / GAP
  const lyForRow = (rowId: string) => {
    const codes = codesBySchemaId[rowId] ?? []
    let otbN = 0, otbR = 0, lyN = 0, lyR = 0
    for (const code of codes) {
      const c = lyByCode[code]
      if (c) { otbN += c.otbN; otbR += c.otbR }
      if (lyColMode) { if (c) { lyN += c.lyN; lyR += c.lyR } }
      else { const f = lyFinalByCode[code]; if (f) { lyN += f.lyN; lyR += f.lyR } }
    }
    const otbAdr = otbN > 0 ? Math.round(otbR / otbN) : 0
    const lyAdr  = lyN  > 0 ? Math.round(lyR  / lyN)  : 0
    return { otbN, otbAdr, otbR, lyN, lyAdr, lyR, gapN: otbN - lyN, gapAdr: otbAdr - lyAdr, gapR: otbR - lyR }
  }
  const lyTotal = rows.filter(r => r.level === 'main').reduce((t, r) => {
    const v = lyForRow(r.id)
    return { otbN: t.otbN + v.otbN, otbR: t.otbR + v.otbR, lyN: t.lyN + v.lyN, lyR: t.lyR + v.lyR }
  }, { otbN: 0, otbR: 0, lyN: 0, lyR: 0 })
  const lyTotOtbAdr = lyTotal.otbN > 0 ? Math.round(lyTotal.otbR / lyTotal.otbN) : 0
  const lyTotLyAdr  = lyTotal.lyN  > 0 ? Math.round(lyTotal.lyR  / lyTotal.lyN)  : 0
  const lyGapTotN   = lyTotal.otbN - lyTotal.lyN
  const lyGapTotAdr = lyTotOtbAdr - lyTotLyAdr
  const lyGapTotR   = lyTotal.otbR - lyTotal.lyR

  const selectLy = (id: string, src: 'otb' | 'ly' | 'gap') => {
    if (selMain === id && lyAccSource === src) setSelMain(null)
    else { setSelMain(id); setLyAccSource(src) }
  }

  const grpTh = (color: string): React.CSSProperties => ({ ...stickyTop0, textAlign: 'center', padding: '6px 12px', fontSize: 10, fontWeight: 700, color, letterSpacing: '0.07em', background: '#0f0f0f', borderLeft: `1px solid ${DIV}`, borderBottom: `2px solid ${color}` })

  const renderLyTable = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr>
          <th style={{ ...stickyTop0, textAlign: 'left', padding: '6px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>SEGMENT</th>
          <th colSpan={3} style={grpTh('#5B8DEF')}>현재 OTB</th>
          <th colSpan={3} style={grpTh(lyColMode ? '#a78bfa' : '#F59E0B')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div
                style={{
                  display: 'inline-flex', alignItems: 'center', height: 24, borderRadius: 12,
                  background: lyColMode ? '#a78bfa' : '#F59E0B', border: `1px solid ${lyColMode ? '#a78bfa' : '#F59E0B'}`,
                  cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                  padding: lyColMode ? '0 10px 0 26px' : '0 26px 0 10px', whiteSpace: 'nowrap',
                }}
                onClick={() => setLyColMode(p => !p)}
              >
                <div style={{ position: 'absolute', width: 16, height: 16, top: 3, left: lyColMode ? 5 : 'auto', right: lyColMode ? 'auto' : 5, borderRadius: '50%', background: '#fff', transition: 'all 0.2s' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.65)', position: 'relative', zIndex: 1 }}>{lyColMode ? '전년OTB' : '전년마감'}</span>
              </div>
            </div>
          </th>
          <th colSpan={3} style={grpTh('#F59E0B')}>GAP</th>
        </tr>
        <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
          <th style={{ ...stickyTop24, padding: '4px 12px 6px' }} />
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => (<th key={`c-${h}`} style={{ ...segHeadTh, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>))}
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => (<th key={`l-${h}`} style={{ ...segHeadTh, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>))}
          {(['ΔR/N', 'ΔADR', 'ΔREV'] as const).map((h, i) => (<th key={`g-${h}`} style={{ ...segHeadTh, ...stickyTop24, padding: '4px 12px 6px', borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const isSub = r.level === 'sub'
          const v = lyForRow(r.id)
          const active = selMain === r.id
          const cColor = v.otbN > 0 ? segTextColor(r) : 'rgba(255,255,255,0.25)'
          return (
            <tr key={r.id} style={{ background: active ? 'rgba(0,229,160,0.06)' : segBgColor(r), borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
              <td style={{ padding: isSub ? '5px 12px 5px 24px' : '7px 12px', color: segTextColor(r), fontWeight: r.isBold ? 600 : 400, boxShadow: active ? 'inset 3px 0 0 #00E5A0' : undefined }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {isSub && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>└</span>}
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: r.bgDarkColor || '#888', flexShrink: 0 }} />
                  {r.name}
                </span>
              </td>
              {/* 현재 OTB — 클릭 시 현재 OTB 어카운트 */}
              <td onClick={() => selectLy(r.id, 'otb')} style={{ padding: '5px 12px', textAlign: 'right', color: cColor, cursor: 'pointer', borderLeft: `1px solid ${active && lyAccSource === 'otb' ? '#00E5A0' : DIV}` }}>{fmtOtbRn(v.otbN)}</td>
              <td onClick={() => selectLy(r.id, 'otb')} style={{ padding: '5px 12px', textAlign: 'right', color: cColor, cursor: 'pointer' }}><FmtVal val={fmtOtbAdr(v.otbAdr)} numSize={11} /></td>
              <td onClick={() => selectLy(r.id, 'otb')} style={{ padding: '5px 12px', textAlign: 'right', color: cColor, cursor: 'pointer' }}><FmtVal val={fmtOtbRev(v.otbR)} numSize={11} /></td>
              {/* 작년 OTB — 클릭 시 작년 OTB 어카운트 */}
              <td onClick={() => selectLy(r.id, 'ly')} style={{ padding: '5px 12px', textAlign: 'right', color: lyGray, cursor: 'pointer', borderLeft: `1px solid ${active && lyAccSource === 'ly' ? '#00E5A0' : DIV}` }}>{fmtOtbRn(v.lyN)}</td>
              <td onClick={() => selectLy(r.id, 'ly')} style={{ padding: '5px 12px', textAlign: 'right', color: lyGray, cursor: 'pointer' }}><FmtVal val={fmtOtbAdr(v.lyAdr)} numSize={11} /></td>
              <td onClick={() => selectLy(r.id, 'ly')} style={{ padding: '5px 12px', textAlign: 'right', color: lyGray, cursor: 'pointer' }}><FmtVal val={fmtOtbRev(v.lyR)} numSize={11} /></td>
              {/* GAP — 클릭 시 GAP 어카운트 */}
              <td onClick={() => selectLy(r.id, 'gap')} style={{ padding: '5px 12px', textAlign: 'right', color: gapColor(v.gapN), cursor: 'pointer', borderLeft: `1px solid ${active && lyAccSource === 'gap' ? '#00E5A0' : DIV}`, fontWeight: 500 }}>{fmtGapRn(v.gapN)}</td>
              <td onClick={() => selectLy(r.id, 'gap')} style={{ padding: '5px 12px', textAlign: 'right', color: gapColor(v.gapAdr), cursor: 'pointer' }}><FmtVal val={fmtGapAdrK(v.gapAdr)} numSize={11} /></td>
              <td onClick={() => selectLy(r.id, 'gap')} style={{ padding: '5px 12px', textAlign: 'right', color: gapColor(v.gapR), cursor: 'pointer' }}><FmtVal val={fmtGapRevM(v.gapR)} numSize={11} /></td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr style={{ position: 'sticky', bottom: 0, background: '#0a0a0a' }}>
          <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}>Total</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtOtbRn(lyTotal.otbN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbAdr(lyTotOtbAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbRev(lyTotal.otbR)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: lyGray, borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtOtbRn(lyTotal.lyN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: lyGray, borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbAdr(lyTotLyAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: lyGray, borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtOtbRev(lyTotal.lyR)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(lyGapTotN), borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{fmtGapRn(lyGapTotN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(lyGapTotAdr), borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtGapAdrK(lyGapTotAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(lyGapTotR), borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={fmtGapRevM(lyGapTotR)} numSize={11} /></td>
        </tr>
        <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>OCC</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}>{(lyTotal.otbN / (roomCount || 1) * 100).toFixed(1)}%</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: lyGray, borderLeft: `1px solid ${DIV}` }}>{(lyTotal.lyN / (roomCount || 1) * 100).toFixed(1)}%</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: gapColor(lyGapTotN), borderLeft: `1px solid ${DIV}` }}>{lyGapTotN >= 0 ? '+' : ''}{(lyGapTotN / (roomCount || 1) * 100).toFixed(1)}%p</td>
        </tr>
        <tr>
          <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Rev.PAR</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${Math.round(lyTotal.otbR / (roomCount || 1) / 1000)}k`} /></td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: lyGray, borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${Math.round(lyTotal.lyR / (roomCount || 1) / 1000)}k`} /></td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: gapColor(lyGapTotR), borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${lyGapTotR >= 0 ? '+' : ''}${Math.round(lyGapTotR / (roomCount || 1) / 1000)}k`} /></td>
        </tr>
      </tfoot>
    </table>
  )

  const src = lyAccSource
  const accTitle = src === 'otb' ? '현재 OTB' : src === 'ly' ? (lyColMode ? '작년 OTB' : '전년마감') : 'GAP (증감)'
  const isGap = src === 'gap'
  const heads = isGap ? ['ΔR/N', 'ΔADR', 'ΔREV'] : ['R/N', 'ADR', 'REV']
  type LAcc = (typeof lyAccountRows)[number]
  const rowN   = (a: LAcc) => src === 'otb' ? a.otbN   : src === 'ly' ? a.lyN   : a.gapN
  const rowAdr = (a: LAcc) => src === 'otb' ? a.otbAdr : src === 'ly' ? a.lyAdr : a.gapAdr
  const rowR   = (a: LAcc) => src === 'otb' ? a.otbR   : src === 'ly' ? a.lyR   : a.gapR
  const valColor = (v: number) => isGap ? gapColor(v) : src === 'ly' ? lyGray : (v !== 0 ? '#fff' : 'rgba(255,255,255,0.25)')
  const fmtN = (v: number) => isGap ? fmtGapRn(v)   : fmtOtbRn(v)
  const fmtA = (v: number) => isGap ? fmtGapAdrK(v) : fmtOtbAdr(v)
  const fmtR = (v: number) => isGap ? fmtGapRevM(v) : fmtOtbRev(v)

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 1400, maxWidth: '95vw', height: '88vh', background: '#0a0a0a', borderRadius: 12, border: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>전년 비교 — {monthKeyLabel(monthKey)}</span>
            <div style={{ display: 'flex', gap: 4, paddingLeft: 10, borderLeft: '1px solid #1a1a1a' }}>
              {(['day', 'period'] as const).map(mode => (
                <button key={mode} onClick={() => setLyMode(mode)}
                  style={{ padding: '3px 10px', borderRadius: 6, fontSize: 10, border: 'none', cursor: 'pointer',
                    background: lyMode === mode ? '#1a1a1a' : 'transparent', color: lyMode === mode ? '#aaa' : '#555' }}>
                  {mode === 'day' ? 'Same Day LY' : 'Same Period LY'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 14px',
            borderRadius: 8, border: 'none', background: '#141414', color: '#ccc', cursor: 'pointer',
          }}>
            <X size={16} /> 닫기
          </button>
        </div>

        {/* 본문 — 전년 비교 테이블 · 어카운트 */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* 좌측: 전년 비교 세그 테이블 */}
          <div style={{ width: 900, flexShrink: 0, borderRight: '0.5px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
            {renderLyTable()}
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
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{selRow?.name} · {accTitle}</span>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {lyAccountRows.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No data</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1 }}>
                          <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>ACCOUNT</th>
                          {heads.map(h => <th key={h} style={accHeadTh}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {lyAccountRows.map(a => (
                          <tr key={a.name} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                          >
                            <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,0.75)' }}>{a.name}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', color: valColor(rowN(a)) }}>{fmtN(rowN(a))}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', color: valColor(rowAdr(a)) }}><FmtVal val={fmtA(rowAdr(a))} numSize={11} /></td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', color: valColor(rowR(a)) }}><FmtVal val={fmtR(rowR(a))} numSize={11} /></td>
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
