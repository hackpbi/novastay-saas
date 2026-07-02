'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, X, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchForecastSchema } from '@/lib/forecast/schema'

interface DailyStatusModalProps {
  hotelId:     string
  year:        number
  month:       number
  day:         number
  otbDate:     string
  isOTBMonth:  boolean   // 해당 월 전체가 OTB면 true (월 단위 구분)
  onClose:     () => void
  onDayChange: (day: number) => void
}

// a01/a02 일자 원본 행 (세그먼트×어카운트)
interface DayRow {
  segmentation: string
  account_name: string | null
  nights:       number
  room_revenue: number
}

const MINT = '#00E5A0'
const BLUE = '#5B8DEF'
const DOW  = ['일', '월', '화', '수', '목', '금', '토']

// otbDate 다음날 (KST 안전)
function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+09:00')
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
}

const fmtRN  = (v: number) => (v ? Math.round(v).toLocaleString('ko-KR') : '–')
const fmtADR = (v: number) => (v ? `${Math.round(v / 1000)}k` : '–')
const fmtREV = (v: number) => (v ? `${(v / 1_000_000).toFixed(1)}M` : '–')
const fmtOCC = (v: number) => (v ? `${v.toFixed(1)}%` : '–')
const fmtRP  = (v: number) => (v ? `${Math.round(v / 1000)}k` : '–')

export default function DailyStatusModal({
  hotelId, year, month, day, otbDate, isOTBMonth, onClose, onDayChange,
}: DailyStatusModalProps) {
  const pad       = (n: number) => String(n).padStart(2, '0')
  const targetYMD = `${year}-${pad(month)}-${pad(day)}`
  const isOTB     = isOTBMonth   // 월 단위 구분 — 해당 월 전체가 OTB
  const lastDay   = new Date(year, month, 0).getDate()
  const dow       = new Date(year, month - 1, day).getDay()

  const [selected, setSelected] = useState<{ key: string; name: string; codes: string[] } | null>(null)

  // 세그먼트 트리 + roomCount
  const { data: schema } = useQuery({
    queryKey: ['dsm-schema', hotelId],
    queryFn:  () => fetchForecastSchema(hotelId),
    enabled:  !!hotelId,
  })

  // 해당 일자 원본 행 (Actual/OTB)
  const { data: dayRows = [] } = useQuery({
    queryKey: ['dsm-day', hotelId, targetYMD, isOTB, otbDate],
    enabled:  !!hotelId,
    queryFn:  async () => {
      if (isOTB) {
        // OTB: get_pickup_data RPC(검증됨) → 해당 일자 세그×어카운트 필터
        // otbDate 당일 stay는 update_date=otbDate 스냅샷에 없으므로 다음날 스냅샷 사용
        const effOtb = targetYMD === otbDate ? addOneDay(otbDate) : otbDate
        const { data, error } = await (supabase as any).rpc('get_pickup_data', {
          p_hotel_id: hotelId, p_otb_date: effOtb, p_vs_otb_date: otbDate, p_min_date: targetYMD,
        })
        if (error) return []
        return ((data ?? []) as any[])
          .filter(r => r.business_date === targetYMD)
          .map(r => ({ segmentation: r.segmentation, account_name: r.account_name, nights: r.otb_nights ?? 0, room_revenue: r.otb_revenue ?? 0 })) as DayRow[]
      }
      const { data, error } = await (supabase as any)
        .from('a01_actual_daily')
        .select('segmentation, account_name, nights, room_revenue')
        .eq('hotel_id', hotelId).eq('business_date', targetYMD)
      if (error) return []
      return (data ?? []) as DayRow[]
    },
  })

  // 이벤트 (c06_calendar)
  const { data: eventName } = useQuery({
    queryKey: ['dsm-event', targetYMD],
    enabled:  true,
    queryFn:  async () => {
      const { data } = await (supabase as any)
        .from('c06_calendar').select('event').eq('date', targetYMD).limit(1)
      return (data?.[0]?.event ?? null) as string | null
    },
  })

  const roomCount = schema?.roomCount ?? 0

  // 세그먼트별 집계 (code → {rn, rev})
  const bySeg = useMemo(() => {
    const m = new Map<string, { rn: number; rev: number }>()
    for (const r of dayRows) {
      const cur = m.get(r.segmentation) ?? { rn: 0, rev: 0 }
      cur.rn  += r.nights ?? 0
      cur.rev += r.room_revenue ?? 0
      m.set(r.segmentation, cur)
    }
    return m
  }, [dayRows])

  const aggr = (codes: string[]) => {
    let rn = 0, rev = 0
    for (const c of codes) { const v = bySeg.get(c); if (v) { rn += v.rn; rev += v.rev } }
    return { rn, rev, adr: rn > 0 ? rev / rn : 0 }
  }

  // 렌더 세그먼트 행 (대분류/소분류)
  const segRows = useMemo(() => {
    const out: { key: string; name: string; level: 0 | 1; codes: string[] }[] = []
    for (const node of schema?.nodes ?? []) {
      out.push({ key: node.id, name: node.name, level: 0, codes: node.segmentationCodes })
      for (const child of node.children) {
        out.push({ key: child.id, name: child.name, level: 1, codes: child.segmentationCodes })
      }
    }
    return out
  }, [schema])

  const total = useMemo(() => {
    let rn = 0, rev = 0
    for (const v of bySeg.values()) { rn += v.rn; rev += v.rev }
    return { rn, rev, adr: rn > 0 ? rev / rn : 0 }
  }, [bySeg])

  // 선택 세그의 어카운트 목록
  const accounts = useMemo(() => {
    if (!selected) return []
    const codes = new Set(selected.codes)
    const m = new Map<string, { rn: number; rev: number }>()
    for (const r of dayRows) {
      if (!codes.has(r.segmentation)) continue
      const name = r.account_name || '(미지정)'
      const cur = m.get(name) ?? { rn: 0, rev: 0 }
      cur.rn  += r.nights ?? 0
      cur.rev += r.room_revenue ?? 0
      m.set(name, cur)
    }
    return [...m.entries()]
      .map(([name, v]) => ({ name, rn: v.rn, rev: v.rev, adr: v.rn > 0 ? v.rev / v.rn : 0 }))
      .sort((a, b) => b.rn - a.rn)
  }, [selected, dayRows])
  const accTotal = accounts.reduce((s, a) => ({ rn: s.rn + a.rn, rev: s.rev + a.rev }), { rn: 0, rev: 0 })

  const toggle = (row: { key: string; name: string; codes: string[] }) =>
    setSelected(prev => (prev?.key === row.key ? null : { key: row.key, name: row.name, codes: row.codes }))

  const th: React.CSSProperties = { padding: '5px 8px', fontSize: 10, color: '#888', fontWeight: 500, textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '4px 8px', fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)' }} onClick={onClose} />

      <div style={{ position: 'relative', width: 720, maxWidth: '96vw', maxHeight: '88vh', background: '#141414', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {/* ── 헤더 ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
            {month}월 {day}일 <span style={{ color: dow === 0 || dow === 6 ? '#E24B4A' : '#888' }}>({DOW[dow]})</span>
          </span>
          <span style={badge(isOTB)}>{isOTB ? 'OTB' : 'Actual'}</span>
          {eventName && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#2a1f00', color: '#f0a500', border: '1px solid #3a2e00' }}>
              <Star size={11} /> {eventName}
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => onDayChange(day - 1)} disabled={day <= 1} style={navBtn(day <= 1)} aria-label="이전 날짜"><ChevronLeft size={16} /></button>
            <button onClick={() => onDayChange(day + 1)} disabled={day >= lastDay} style={navBtn(day >= lastDay)} aria-label="다음 날짜"><ChevronRight size={16} /></button>
            <button onClick={onClose} aria-label="닫기" style={{ ...navBtn(false), marginLeft: 4 }}><X size={16} /></button>
          </div>
        </div>

        {/* ── 본문 좌우 분할 ── */}
        <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
          {/* 좌: 세그먼트 */}
          <div style={{ width: 380, flexShrink: 0, borderRight: '0.5px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#0d0d0d', zIndex: 1 }}>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>SEGMENT</th>
                  <th style={th}>R/N</th><th style={th}>ADR</th><th style={th}>REV</th>
                </tr>
              </thead>
              <tbody>
                {segRows.map(row => {
                  const a = aggr(row.codes)
                  const sel = selected?.key === row.key
                  return (
                    <tr key={row.key} onClick={() => toggle(row)}
                      style={{ cursor: 'pointer', background: sel ? '#0d2010' : 'transparent', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: row.level === 0 ? '4px 8px' : '4px 8px 4px 22px', fontSize: row.level === 0 ? 12 : 11, fontWeight: row.level === 0 ? 500 : 400, color: sel ? MINT : row.level === 0 ? '#ccc' : '#999', whiteSpace: 'nowrap' }}>
                        {row.level === 0 ? row.name : `∟ ${row.name}`}
                      </td>
                      <td style={{ ...td, color: '#ccc' }}>{fmtRN(a.rn)}</td>
                      <td style={{ ...td, color: '#888' }}>{fmtADR(a.adr)}</td>
                      <td style={{ ...td, color: '#888' }}>{fmtREV(a.rev)}</td>
                    </tr>
                  )
                })}
                {/* Total */}
                <tr style={{ background: 'rgba(0,229,160,0.06)', borderTop: '1px solid rgba(0,229,160,0.35)' }}>
                  <td style={{ padding: '5px 8px', fontSize: 12, fontWeight: 600, color: MINT }}>Total</td>
                  <td style={{ ...td, color: MINT, fontWeight: 600 }}>{fmtRN(total.rn)}</td>
                  <td style={{ ...td, color: MINT, fontWeight: 600 }}>{fmtADR(total.adr)}</td>
                  <td style={{ ...td, color: MINT, fontWeight: 600 }}>{fmtREV(total.rev)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 8px', fontSize: 10, color: '#888' }}>OCC%</td>
                  <td colSpan={3} style={{ ...td, fontSize: 10, color: '#aaa' }}>{fmtOCC(roomCount > 0 ? (total.rn / roomCount) * 100 : 0)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 8px 8px', fontSize: 10, color: '#888' }}>RevPAR</td>
                  <td colSpan={3} style={{ ...td, fontSize: 10, color: '#aaa', paddingBottom: 8 }}>{fmtRP(roomCount > 0 ? total.rev / roomCount : 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 우: 어카운트 */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
            {!selected ? (
              <div style={{ height: '100%', minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 12 }}>
                세그먼트를 선택하세요
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#0d0d0d', zIndex: 1 }}>
                  <tr>
                    <th colSpan={4} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: MINT }}>
                      {selected.name} <span style={{ color: '#666', fontWeight: 400 }}>· {accounts.length}개 어카운트</span>
                    </th>
                  </tr>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>ACCOUNT</th>
                    <th style={th}>R/N</th><th style={th}>ADR</th><th style={th}>REV</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', fontSize: 11, color: '#555' }}>어카운트 데이터가 없습니다</td></tr>
                  ) : accounts.map(a => (
                    <tr key={a.name} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '4px 10px', fontSize: 11, color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{a.name}</td>
                      <td style={{ ...td, color: '#ccc' }}>{fmtRN(a.rn)}</td>
                      <td style={{ ...td, color: '#888' }}>{fmtADR(a.adr)}</td>
                      <td style={{ ...td, color: '#888' }}>{fmtREV(a.rev)}</td>
                    </tr>
                  ))}
                  {accounts.length > 0 && (
                    <tr style={{ background: 'rgba(0,229,160,0.06)', borderTop: '1px solid rgba(0,229,160,0.35)' }}>
                      <td style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, color: MINT }}>합계</td>
                      <td style={{ ...td, color: MINT, fontWeight: 600 }}>{fmtRN(accTotal.rn)}</td>
                      <td style={{ ...td, color: MINT, fontWeight: 600 }}>{fmtADR(accTotal.rn > 0 ? accTotal.rev / accTotal.rn : 0)}</td>
                      <td style={{ ...td, color: MINT, fontWeight: 600 }}>{fmtREV(accTotal.rev)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const badge = (otb: boolean): React.CSSProperties =>
  otb
    ? { fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#0d1a2e', color: BLUE, border: '1px solid #1e3a5a' }
    : { fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#0d2a1f', color: MINT, border: '1px solid #0d3a28' }

const navBtn = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6,
  background: 'transparent', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
  color: disabled ? '#444' : '#aaa',
})
