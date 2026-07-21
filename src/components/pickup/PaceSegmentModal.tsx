'use client'

// Pace Segment Modal — 월간 페이스 차트 막대 클릭 시, 해당 update_date 스냅샷의
// 세그먼트별 현재/전년 OTB·GAP + account 드릴. get_monthly_pace_segment RPC (클릭 시점 fetch).
// 테이블/색상 구조는 OtbComparePage 세그먼트 비교 테이블과 동일.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { FmtVal } from '@/utils/FmtVal'
import {
  buildOtbCompare, buildOtbCompareAccounts, codesBySchemaId,
  otbFmt, gapColor, LY_GRAY, type OtbCompareVals,
} from '@/utils/otbCompareTable'

const DIV = 'rgba(255,255,255,0.08)'

// ── 세그먼트 비교 테이블 (OtbComparePage 동일 구조) ─────────────────────────────
function SegCompareTable({
  data, roomCount, days, isPeriod, selectedId, selectedSource, onSelect,
}: {
  data:            { rows: ReturnType<typeof buildOtbCompare>['rows']; total: OtbCompareVals }
  roomCount:       number
  days:            number
  isPeriod:        boolean
  selectedId?:     string | null
  selectedSource?: 'otb' | 'ly' | 'gap' | null
  onSelect?:       (id: string, source: 'otb' | 'ly' | 'gap') => void
}) {
  const { rows, total } = data
  const lyColor = isPeriod ? '#a78bfa' : '#F59E0B'
  const occDenom = (roomCount || 1) * (days || 1)
  const firstMainId = rows.find(r => r.level === 'main')?.id
  const stickyTop0:  React.CSSProperties = { position: 'sticky', top: 0,  zIndex: 2, background: '#0f0f0f' }
  const stickyTop24: React.CSSProperties = { position: 'sticky', top: 24, zIndex: 2, background: '#0f0f0f' }
  const grpTh = (color: string): React.CSSProperties => ({
    ...stickyTop0, textAlign: 'center', padding: '6px 12px', fontSize: 10, fontWeight: 700,
    color, letterSpacing: '0.07em', borderLeft: `1px solid ${DIV}`, borderBottom: `2px solid ${color}`,
  })
  const subTh: React.CSSProperties = {
    ...stickyTop24, textAlign: 'right', padding: '4px 12px 6px', fontSize: 10, fontWeight: 500,
    color: 'rgba(255,255,255,0.3)',
  }
  const segText = (r: (typeof rows)[number]) => r.fontDarkColor ?? 'var(--color-text-primary)'
  const segBg   = (r: (typeof rows)[number]) =>
    r.bgDarkColor ?? (r.level === 'main' ? '#1A1F2E' : r.level === 'mid' ? '#15192A' : 'transparent')
  const cCol = (r: (typeof rows)[number]) => (r.otbN > 0 ? segText(r) : 'rgba(255,255,255,0.25)')
  const clickable = !!onSelect
  const cell = (id: string, src: 'otb' | 'ly' | 'gap', color: string, node: React.ReactNode, leftBorder?: boolean, active?: boolean, bold?: boolean): React.ReactNode => (
    <td
      onClick={clickable ? () => onSelect!(id, src) : undefined}
      style={{
        padding: '5px 12px', textAlign: 'right', color,
        cursor: clickable ? 'pointer' : 'default', fontWeight: bold ? 500 : 400,
        borderLeft: leftBorder ? `2px solid ${active ? '#00E5A0' : 'transparent'}` : undefined,
      }}
    >{node}</td>
  )

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr>
          <th style={{ ...stickyTop0, textAlign: 'left', padding: '6px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>SEGMENT</th>
          <th colSpan={3} style={grpTh('#5B8DEF')}>현재 OTB</th>
          <th colSpan={3} style={grpTh(lyColor)}>전년 OTB</th>
          <th colSpan={3} style={grpTh('#F59E0B')}>GAP</th>
        </tr>
        <tr style={{ borderBottom: `0.5px solid ${DIV}` }}>
          <th style={{ ...stickyTop24, padding: '4px 12px 6px' }} />
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => <th key={`c-${h}`} style={{ ...subTh, borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>)}
          {(['R/N', 'ADR', 'REV'] as const).map((h, i) => <th key={`l-${h}`} style={{ ...subTh, borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>)}
          {(['ΔR/N', 'ΔADR', 'ΔREV'] as const).map((h, i) => <th key={`g-${h}`} style={{ ...subTh, borderLeft: i === 0 ? `1px solid ${DIV}` : undefined }}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const isSub  = r.level === 'sub'
          const active = selectedId === r.id
          return (
            <tr key={r.id}
              onMouseEnter={clickable && !active ? (e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' } : undefined}
              onMouseLeave={clickable && !active ? (e) => { e.currentTarget.style.background = segBg(r) } : undefined}
              style={{
                background: active ? 'rgba(0,229,160,0.06)' : segBg(r),
                borderTop: (r.level === 'main' && r.id !== firstMainId) ? '1px solid #1f1f1f' : undefined,
                borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                cursor: clickable ? 'pointer' : 'default',
              }}>
              <td style={{ padding: isSub ? '5px 12px 5px 24px' : '7px 12px', color: segText(r), fontWeight: r.isBold ? 600 : 400 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {isSub && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>└</span>}
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: r.bgDarkColor || '#888', flexShrink: 0 }} />
                  {r.name}
                </span>
              </td>
              {cell(r.id, 'otb', cCol(r), otbFmt.rn(r.otbN), true, active && selectedSource === 'otb')}
              {cell(r.id, 'otb', cCol(r), <FmtVal val={otbFmt.adr(r.otbAdr)} numSize={11} />)}
              {cell(r.id, 'otb', cCol(r), <FmtVal val={otbFmt.rev(r.otbR)} numSize={11} />)}
              {cell(r.id, 'ly', LY_GRAY, otbFmt.rn(r.lyN), true, active && selectedSource === 'ly')}
              {cell(r.id, 'ly', LY_GRAY, <FmtVal val={otbFmt.adr(r.lyAdr)} numSize={11} />)}
              {cell(r.id, 'ly', LY_GRAY, <FmtVal val={otbFmt.rev(r.lyR)} numSize={11} />)}
              {cell(r.id, 'gap', gapColor(r.gapN), otbFmt.gapRn(r.gapN), true, active && selectedSource === 'gap', true)}
              {cell(r.id, 'gap', gapColor(r.gapAdr), <FmtVal val={otbFmt.gapAdr(r.gapAdr)} numSize={11} />, false, false, true)}
              {cell(r.id, 'gap', gapColor(r.gapR), <FmtVal val={otbFmt.gapRev(r.gapR)} numSize={11} />, false, false, true)}
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr style={{ position: 'sticky', bottom: 0, background: '#000000' }}>
          <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}>Total</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{otbFmt.rn(total.otbN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={otbFmt.adr(total.otbAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={otbFmt.rev(total.otbR)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: LY_GRAY, borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{otbFmt.rn(total.lyN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: LY_GRAY, borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={otbFmt.adr(total.lyAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: LY_GRAY, borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={otbFmt.rev(total.lyR)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(total.gapN), borderTop: '1px solid rgba(0,229,160,0.5)', borderLeft: `1px solid ${DIV}` }}>{otbFmt.gapRn(total.gapN)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(total.gapAdr), borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={otbFmt.gapAdr(total.gapAdr)} numSize={11} /></td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: gapColor(total.gapR), borderTop: '1px solid rgba(0,229,160,0.5)' }}><FmtVal val={otbFmt.gapRev(total.gapR)} numSize={11} /></td>
        </tr>
        <tr style={{ borderTop: `0.5px solid rgba(255,255,255,0.06)` }}>
          <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>OCC</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}>{(total.otbN / occDenom * 100).toFixed(1)}%</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: LY_GRAY, borderLeft: `1px solid ${DIV}` }}>{(total.lyN / occDenom * 100).toFixed(1)}%</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: gapColor(total.gapN), borderLeft: `1px solid ${DIV}` }}>{total.gapN >= 0 ? '+' : ''}{(total.gapN / occDenom * 100).toFixed(1)}%p</td>
        </tr>
        <tr>
          <td style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Rev.PAR</td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${Math.round(total.otbR / occDenom / 1000)}k`} /></td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: LY_GRAY, borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${Math.round(total.lyR / occDenom / 1000)}k`} /></td>
          <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: gapColor(total.gapR), borderLeft: `1px solid ${DIV}` }}><FmtVal numSize={11} val={`${total.gapR >= 0 ? '+' : ''}${Math.round(total.gapR / occDenom / 1000)}k`} /></td>
        </tr>
      </tfoot>
    </table>
  )
}

// ── account 패널 (OtbComparePage 동일 구조) ────────────────────────────────────
function AccountPanel({
  segName, segColor, source, accounts, rangeLabel,
}: {
  segName:    string
  segColor:   string | null
  source:     'otb' | 'ly' | 'gap'
  accounts:   ReturnType<typeof buildOtbCompareAccounts>
  rangeLabel: string
}) {
  const isGap = source === 'gap'
  const title = source === 'otb' ? '현재 OTB' : source === 'ly' ? '전년 OTB' : 'GAP (증감)'
  const heads = isGap ? ['ΔR/N', 'ΔADR', 'ΔREV'] : ['R/N', 'ADR', 'REV']
  const rowN   = (a: (typeof accounts)[number]) => (source === 'otb' ? a.otbN   : source === 'ly' ? a.lyN   : a.gapN)
  const rowAdr = (a: (typeof accounts)[number]) => (source === 'otb' ? a.otbAdr : source === 'ly' ? a.lyAdr : a.gapAdr)
  const rowR   = (a: (typeof accounts)[number]) => (source === 'otb' ? a.otbR   : source === 'ly' ? a.lyR   : a.gapR)
  const valColor = (v: number) => (isGap ? gapColor(v) : source === 'ly' ? LY_GRAY : (v !== 0 ? '#fff' : 'rgba(255,255,255,0.25)'))
  const fmtN = (v: number) => (isGap ? otbFmt.gapRn(v)  : otbFmt.rn(v))
  const fmtA = (v: number) => (isGap ? otbFmt.gapAdr(v) : otbFmt.adr(v))
  const fmtR = (v: number) => (isGap ? otbFmt.gapRev(v) : otbFmt.rev(v))
  const sorted = [...accounts].sort((a, b) => Math.abs(rowN(b)) - Math.abs(rowN(a)))
  const tN = accounts.reduce((s, a) => s + rowN(a), 0)
  const tR = accounts.reduce((s, a) => s + rowR(a), 0)
  const accHeadTh: React.CSSProperties = { textAlign: 'right', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }

  return (
    <>
      <div style={{ padding: '10px 14px', borderBottom: `0.5px solid ${DIV}`, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: segColor || '#888', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{segName} · {title} · {rangeLabel}</span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sorted.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No data</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `0.5px solid ${DIV}`, position: 'sticky', top: 0, background: '#000000', zIndex: 1 }}>
                <th style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>ACCOUNT</th>
                {heads.map(h => <th key={h} style={accHeadTh}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {sorted.map(a => (
                <tr key={a.name} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                  <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,0.75)' }}>{a.name}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: valColor(rowN(a)) }}>{fmtN(rowN(a))}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: valColor(rowAdr(a)) }}><FmtVal val={fmtA(rowAdr(a))} numSize={11} /></td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: valColor(rowR(a)) }}><FmtVal val={fmtR(rowR(a))} numSize={11} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ position: 'sticky', bottom: 0, background: '#000000' }}>
                <td style={{ padding: '7px 12px', fontWeight: 600, color: '#fff', borderTop: '1px solid rgba(0,229,160,0.4)' }}>Total</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: valColor(tN), borderTop: '1px solid rgba(0,229,160,0.4)' }}>{fmtN(tN)}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(0,229,160,0.4)' }}>—</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: valColor(tR), borderTop: '1px solid rgba(0,229,160,0.4)' }}><FmtVal val={fmtR(tR)} numSize={11} /></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  )
}

// ── Modal ───────────────────────────────────────────────────────────────────────
interface PaceSegmentModalProps {
  open:       boolean
  onClose:    () => void
  updateDate: string
  hotelId:    string
  year:       number
  month:      number   // 1-based
  lyMode:     'period' | 'day'
}

export function PaceSegmentModal({ open, onClose, updateDate, hotelId, year, month, lyMode }: PaceSegmentModalProps) {
  const { data: schema = [] } = useMarketSchema()
  const isPeriod = lyMode === 'period'
  const daysInMonth = new Date(year, month, 0).getDate()

  const { data: hotelDetail } = useQuery({
    queryKey: ['m03_hotel_details', hotelId],
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

  // 세그먼트+account 데이터 — 클릭 시점에만 fetch
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['pace-segment', hotelId, year, month, updateDate, lyMode],
    enabled: open && !!hotelId && !!updateDate,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_monthly_pace_segment', {
        p_hotel_id:    hotelId,
        p_year:        year,
        p_month:       month,
        p_update_date: updateDate,
        p_ly_mode:     lyMode,
      })
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  const data    = useMemo(() => buildOtbCompare(schema, rows), [schema, rows])
  const codeMap = useMemo(() => codesBySchemaId(schema), [schema])

  const [selSeg, setSelSeg] = useState<{ id: string; source: 'otb' | 'ly' | 'gap' } | null>(null)
  useEffect(() => { setSelSeg(null) }, [updateDate, lyMode])
  const selSegRow = selSeg ? (data.rows.find(r => r.id === selSeg.id) ?? null) : null
  const accounts = useMemo(
    () => (selSeg ? buildOtbCompareAccounts(codeMap[selSeg.id] ?? [], rows) : []),
    [selSeg, codeMap, rows],
  )

  // ESC + scroll lock
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: 'min(1200px, 95vw)', maxHeight: '86vh', background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{month}월 페이스 — {updateDate} 기준</span>
          <button onClick={onClose} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: 2, display: 'inline-flex' }}>
            <X size={20} />
          </button>
        </div>

        {/* 본문 — 좌: 세그먼트 테이블 / 우: account */}
        <div style={{ display: 'flex', gap: 16, minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, maxHeight: '64vh', overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#555' }}>로딩 중…</div>
            ) : data.rows.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#555' }}>No data</div>
            ) : (
              <SegCompareTable
                data={data} roomCount={roomCount} days={daysInMonth} isPeriod={isPeriod}
                selectedId={selSeg?.id ?? null} selectedSource={selSeg?.source ?? null}
                onSelect={(id, source) => setSelSeg(prev => (prev?.id === id && prev.source === source ? null : { id, source }))}
              />
            )}
          </div>
          <div style={{ width: 240, flexShrink: 0, borderLeft: `1px solid ${DIV}`, display: 'flex', flexDirection: 'column', maxHeight: '64vh' }}>
            {selSeg && selSegRow ? (
              <AccountPanel segName={selSegRow.name} segColor={selSegRow.bgDarkColor} source={selSeg.source} accounts={accounts} rangeLabel={updateDate} />
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 200 }}>
                <span style={{ fontSize: 28, opacity: 0.2 }}>👆</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Select a segment</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
