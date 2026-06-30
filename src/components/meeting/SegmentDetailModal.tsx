'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  getDummySegmentTable,
  monthKeyLabel,
  type DummySegmentRow,
} from './dummyMeetingData'

interface SegmentDetailModalProps {
  open:     boolean
  onClose:  () => void
  hotelId:  string
  monthKey: string   // 'YYYY-MM'
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

type Cell = { rn: number; adr: number; rev: number }
type GapBase    = 'otb' | 'fcst'
type GapCompare = 'budget' | 'ly'
type LyMode     = 'match' | 'date'

// ── 포맷 ─────────────────────────────────────────────────────────────────────────
const fmtRn  = (v: number) => (v === 0 ? '-' : v.toLocaleString('ko-KR'))
const fmtAdr = (v: number) => (v === 0 ? '-' : `${Math.round(v / 1000)}K`)
const fmtRev = (v: number) => (v === 0 ? '-' : `${(v / 1_000_000).toFixed(1)}M`)
const fmtGapRn  = (v: number) => (v === 0 ? '-' : `${v > 0 ? '+' : ''}${v.toLocaleString('ko-KR')}`)
const fmtGapAdr = (v: number) => (v === 0 ? '-' : `${v > 0 ? '+' : ''}${Math.round(v / 1000)}K`)
const fmtGapRev = (v: number) => (v === 0 ? '-' : `${v > 0 ? '+' : ''}${(v / 1_000_000).toFixed(1)}M`)
const gapColor  = (v: number) => (v > 0 ? MINT : v < 0 ? RED : TXT3)

const th: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
  color: TXT3, padding: '6px 10px', background: '#131313', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, textAlign: 'right',
}
const td: React.CSSProperties = {
  fontSize: 11, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap',
  borderBottom: BORDER_SUBTLE,
}

export default function SegmentDetailModal({ open, onClose, hotelId, monthKey }: SegmentDetailModalProps) {
  const [lyMode,    setLyMode]    = useState<LyMode>('match')
  const [gapBase,   setGapBase]   = useState<GapBase>('otb')
  const [gapCompare, setGapCompare] = useState<GapCompare>('budget')

  // body scroll lock + ESC
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  if (!open) return null

  const rows = getDummySegmentTable(monthKey)
  const lyOf   = (r: DummySegmentRow): Cell => (lyMode === 'match' ? r.lyMatch : r.lyDate)
  const baseOf = (r: DummySegmentRow): Cell => (gapBase === 'otb' ? r.otb : r.fcst)
  const compOf = (r: DummySegmentRow): Cell => (gapCompare === 'budget' ? r.budget : lyOf(r))

  const baseLabel = gapBase === 'otb' ? 'OTB' : 'FCST'
  const compLabel = gapCompare === 'budget' ? 'BUDGET' : 'LY'
  const lyColLabel = lyMode === 'match' ? '전년동기간' : '전년일자'

  // 합계 (HOU 제외) — 부모(자식 합산) 행 제외, leaf(sub) + 독립 mid만 합산
  const isParent = (i: number) => rows[i].isBold && !!rows[i + 1]?.indent
  const sumGroup = (pick: (r: DummySegmentRow) => Cell): Cell => {
    let rn = 0, rev = 0
    rows.forEach((r, i) => { if (!isParent(i)) { const c = pick(r); rn += c.rn; rev += c.rev } })
    return { rn, rev, adr: rn > 0 ? Math.round(rev / rn) : 0 }
  }
  const totOtb    = sumGroup(r => r.otb)
  const totFcst   = sumGroup(r => r.fcst)
  const totBudget = sumGroup(r => r.budget)
  const totLy     = sumGroup(lyOf)
  const totBase   = gapBase === 'otb' ? totOtb : totFcst
  const totComp   = gapCompare === 'budget' ? totBudget : totLy
  const ROOM_COUNT = 320   // 더미 OCC 산정용 가용 객실
  const occOf = (rn: number) => (ROOM_COUNT > 0 ? ((rn / ROOM_COUNT) * 100).toFixed(1) : '0') + '%'

  // 그룹 cells 렌더 (R/N, ADR, REV) — 첫 셀에 그룹 구분선
  const groupCells = (c: Cell, color?: string, bold?: boolean) => (
    <>
      <td style={{ ...td, boxShadow: GROUP_SHADOW, color, fontWeight: bold ? 600 : 400 }} className="font-mono">{fmtRn(c.rn)}</td>
      <td style={{ ...td, color, fontWeight: bold ? 600 : 400 }} className="font-mono">{fmtAdr(c.adr)}</td>
      <td style={{ ...td, color, fontWeight: bold ? 600 : 400 }} className="font-mono">{fmtRev(c.rev)}</td>
    </>
  )
  const gapCells = (b: Cell, cmp: Cell, bold?: boolean) => {
    const gRn = b.rn - cmp.rn, gAdr = b.adr - cmp.adr, gRev = b.rev - cmp.rev
    return (
      <>
        <td style={{ ...td, boxShadow: GROUP_SHADOW, color: gapColor(gRn), fontWeight: bold ? 600 : 500 }} className="font-mono">{fmtGapRn(gRn)}</td>
        <td style={{ ...td, color: gapColor(gAdr), fontWeight: bold ? 600 : 500 }} className="font-mono">{fmtGapAdr(gAdr)}</td>
        <td style={{ ...td, color: gapColor(gRev), fontWeight: bold ? 600 : 500 }} className="font-mono">{fmtGapRev(gRev)}</td>
      </>
    )
  }

  const Pill = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} style={{
      fontSize: 11, padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
      background: active ? MINT : 'transparent', color: active ? '#0a2018' : TXT3, fontWeight: active ? 600 : 400,
    }}>{children}</button>
  )
  const Select = <T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: T[] }) => (
    <select value={value} onChange={e => onChange(e.target.value as T)} style={{
      fontSize: 11, padding: '3px 6px', borderRadius: 6, background: CARD,
      border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', outline: 'none', cursor: 'pointer',
    }}>
      {options.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
    </select>
  )

  const groupTh = (label: string, sub?: string) => (
    <th colSpan={3} style={{ ...th, textAlign: 'center', boxShadow: GROUP_SHADOW, color: '#fff' }}>
      {label}{sub && <span style={{ color: TXT3, fontWeight: 400 }}> · {sub}</span>}
    </th>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: BG, overflowY: 'auto' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: BORDER_SUBTLE }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>세그먼트 상세 — {monthKeyLabel(monthKey)}</div>
          <div style={{ fontSize: 13, color: TXT3, marginTop: 2 }}>{hotelId}</div>
        </div>
        <button onClick={onClose} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '7px 14px',
          borderRadius: 8, border: 'none', background: CARD, color: '#ccc', cursor: 'pointer',
        }}>
          <X size={16} /> 닫기
        </button>
      </div>

      {/* 컨트롤 바 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: TXT3 }}>LY 기준</span>
          <div style={{ display: 'flex', background: CARD, borderRadius: 999, padding: 2 }}>
            <Pill active={lyMode === 'match'} onClick={() => setLyMode('match')}>전년동기간</Pill>
            <Pill active={lyMode === 'date'} onClick={() => setLyMode('date')}>전년일자</Pill>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: TXT3 }}>GAP</span>
          <Select value={gapBase} onChange={setGapBase} options={['otb', 'fcst']} />
          <span style={{ fontSize: 11, color: TXT3 }}>vs</span>
          <Select value={gapCompare} onChange={setGapCompare} options={['budget', 'ly']} />
        </div>
      </div>

      {/* 테이블 */}
      <div style={{ overflowX: 'auto', padding: '0 24px 32px' }}>
        <table style={{ minWidth: 980, borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, width: 170, minWidth: 170, zIndex: 2 }}>SEGMENTATION</th>
              {groupTh('OTB')}
              {groupTh('FCST')}
              {groupTh('BUDGET')}
              {groupTh('LY', lyColLabel)}
              {groupTh(`GAP`, `${baseLabel} vs ${compLabel}`)}
            </tr>
            <tr>
              {['OTB', 'FCST', 'BUDGET', 'LY', 'GAP'].map(g => (
                ['R/N', 'ADR', 'REV'].map((s, si) => (
                  <th key={`${g}-${s}`} style={{ ...th, ...(si === 0 ? { boxShadow: GROUP_SHADOW } : {}) }}>{s}</th>
                ))
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rowBg = r.isBold ? BOLD_BG : 'transparent'
              const nameColor = r.indent ? '#999' : '#fff'
              return (
                <tr key={r.id} style={{ background: rowBg }}>
                  <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: r.isBold ? BOLD_BG : BG, fontWeight: r.isBold ? 700 : 400, color: nameColor, minWidth: 170 }}>
                    {r.indent ? <><span style={{ color: '#555', marginRight: 4 }}>└</span>{r.name}</> : r.name}
                  </td>
                  {groupCells(r.otb,    undefined, r.isBold)}
                  {groupCells(r.fcst,   undefined, r.isBold)}
                  {groupCells(r.budget, undefined, r.isBold)}
                  {groupCells(lyOf(r),  undefined, r.isBold)}
                  {gapCells(baseOf(r), compOf(r), r.isBold)}
                </tr>
              )
            })}
            {/* 합계 (HOU 제외) */}
            <tr style={{ background: '#111' }}>
              <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: '#111', fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.1)' }}>합계 (HOU 제외)</td>
              {[totOtb, totFcst, totBudget, totLy].map((c, i) => (
                <GroupTotal key={i} c={c} />
              ))}
              {(() => {
                const gRn = totBase.rn - totComp.rn, gAdr = totBase.adr - totComp.adr, gRev = totBase.rev - totComp.rev
                return (
                  <>
                    <td style={{ ...td, boxShadow: GROUP_SHADOW, color: gapColor(gRn), fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtGapRn(gRn)}</td>
                    <td style={{ ...td, color: gapColor(gAdr), fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtGapAdr(gAdr)}</td>
                    <td style={{ ...td, color: gapColor(gRev), fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtGapRev(gRev)}</td>
                  </>
                )
              })()}
            </tr>
            {/* OCC */}
            <tr style={{ background: '#111' }}>
              <td style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: '#111', fontWeight: 600, color: TXT3 }}>OCC</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: MINT, fontWeight: 600 }}>{occOf(totOtb.rn)}</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: MINT, fontWeight: 600 }}>{occOf(totFcst.rn)}</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: TXT3, fontWeight: 600 }}>{occOf(totBudget.rn)}</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: TXT3, fontWeight: 600 }}>{occOf(totLy.rn)}</td>
              <td colSpan={3} style={{ ...td, boxShadow: GROUP_SHADOW, textAlign: 'center', color: TXT3 }}>—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// 합계 행의 그룹 셀 (R/N, ADR, REV)
function GroupTotal({ c }: { c: Cell }) {
  return (
    <>
      <td style={{ ...td, boxShadow: GROUP_SHADOW, fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtRn(c.rn)}</td>
      <td style={{ ...td, fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtAdr(c.adr)}</td>
      <td style={{ ...td, fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.1)' }} className="font-mono">{fmtRev(c.rev)}</td>
    </>
  )
}
