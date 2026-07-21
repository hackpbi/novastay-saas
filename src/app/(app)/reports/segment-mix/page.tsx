'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Calendar, Download } from 'lucide-react'
import { useHotel } from '@/contexts/HotelContext'
import { supabase } from '@/lib/supabase'
import { fetchForecastSchema } from '@/lib/forecast/schema'

// ── 팔레트 (다크 고정) ──────────────────────────────────────────────────────
const MINT = '#00E5A0'
const BLUE = '#5B8DEF'
const NEG  = '#E24B4A'
const BG_PAGE  = '#000000'
const BG_CARD  = '#141414'
const BG_L0    = '#1c1c1c'
const BORDER   = 'rgba(255,255,255,0.1)'

// RPC 반환 행 (get_segment_*_annual)
interface SegAnnualRow {
  month:       number
  market_code: string
  rn:          number
  adr:         number
  rev:         number
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

// ── 포맷 (0/없음 → '–') ──────────────────────────────────────────────────────
const fmtRN     = (v: number) => (v ? String(Math.round(v)) : '–')
const fmtADR    = (v: number) => (v ? `${Math.round(v / 1000)}k` : '–')
const fmtREV    = (v: number) => (v ? `${(v / 1_000_000).toFixed(1)}M` : '–')
const fmtOCC    = (v: number) => (v ? `${v.toFixed(1)}%` : '–')
const fmtRevPAR = (v: number) => (v ? `${Math.round(v / 1000)}k` : '–')

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate()

export default function SegmentMixPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  const [otbDate, setOtbDate] = useState(() => new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' }))
  const year     = Number(otbDate.slice(0, 4))
  const otbMonth = Number(otbDate.slice(5, 7))   // 1~12 (문자열 파싱 — KST 안전)

  const [tab, setTab]         = useState<'segment' | 'account'>('segment')
  const [compare, setCompare] = useState<'none' | 'budget' | 'ly'>('none')

  // ── c05 세그먼트 트리 + roomCount (기존 로직 재사용) ──
  const { data: schema } = useQuery({
    queryKey: ['segMixSchema', hotelId],
    queryFn:  () => fetchForecastSchema(hotelId),
    enabled:  !!hotelId,
  })

  // ── Actual (1 ~ otbMonth-1) ──
  const { data: actualData } = useQuery({
    queryKey: ['segmentActual', hotelId, year],
    queryFn:  async () => {
      const { data, error } = await (supabase as any).rpc('get_segment_actual_annual', {
        p_hotel_id: hotelId, p_year: year,
      })
      if (error) throw error
      return (data ?? []) as SegAnnualRow[]
    },
    enabled: !!hotelId,
  })

  // ── OTB (otbMonth ~ 12) ──
  const { data: otbData } = useQuery({
    queryKey: ['segmentOTB', hotelId, year, otbDate],
    queryFn:  async () => {
      const { data, error } = await (supabase as any).rpc('get_segment_otb_annual', {
        p_hotel_id: hotelId, p_year: year, p_update_date: otbDate,
      })
      if (error) throw error
      return (data ?? []) as SegAnnualRow[]
    },
    enabled: !!hotelId,
  })

  // ── Budget (비교) ──
  const { data: budgetData } = useQuery({
    queryKey: ['segmentBudget', hotelId, year],
    queryFn:  async () => {
      const { data, error } = await (supabase as any).rpc('get_segment_budget_annual', {
        p_hotel_id: hotelId, p_year: year,
      })
      if (error) throw error
      return (data ?? []) as SegAnnualRow[]
    },
    enabled: !!hotelId && compare === 'budget',
  })

  // ── LY (비교) — 동일 Actual RPC를 전년도로 호출 (yoy_match는 RPC 내부 처리) ──
  const { data: lyData } = useQuery({
    queryKey: ['segmentLY', hotelId, year - 1],
    queryFn:  async () => {
      const { data, error } = await (supabase as any).rpc('get_segment_actual_annual', {
        p_hotel_id: hotelId, p_year: year - 1,
      })
      if (error) throw error
      return (data ?? []) as SegAnnualRow[]
    },
    enabled: !!hotelId && compare === 'ly',
  })

  // ── 현재 데이터 맵 (`code:month` → {rn, rev}) — Actual(과거) + OTB(당월~미래) 병합 ──
  const dataMap = useMemo(() => {
    const m = new Map<string, { rn: number; rev: number }>()
    const add = (rows: SegAnnualRow[] | undefined, keep: (mo: number) => boolean) => {
      for (const r of rows ?? []) {
        if (!keep(r.month)) continue
        const k   = `${r.market_code}:${r.month}`
        const cur = m.get(k) ?? { rn: 0, rev: 0 }
        cur.rn  += r.rn  ?? 0
        cur.rev += r.rev ?? 0
        m.set(k, cur)
      }
    }
    add(actualData, mo => mo < otbMonth)
    add(otbData,    mo => mo >= otbMonth)
    return m
  }, [actualData, otbData, otbMonth])

  // ── 비교 데이터 맵 (`code:month` → rn) ──
  const cmpMap = useMemo(() => {
    const src = compare === 'budget' ? budgetData : compare === 'ly' ? lyData : undefined
    if (!src) return null
    const m = new Map<string, number>()
    for (const r of src) {
      const k = `${r.market_code}:${r.month}`
      m.set(k, (m.get(k) ?? 0) + (r.rn ?? 0))
    }
    return m
  }, [compare, budgetData, lyData])

  // ── 렌더 행 (schema 트리 순서: level0 부모 → level1 자식) ──
  const rows = useMemo(() => {
    const out: { key: string; name: string; level: 0 | 1; codes: string[] }[] = []
    for (const node of schema?.nodes ?? []) {
      out.push({ key: node.id, name: node.name, level: 0, codes: node.segmentationCodes })
      for (const child of node.children) {
        out.push({ key: child.id, name: child.name, level: 1, codes: child.segmentationCodes })
      }
    }
    return out
  }, [schema])

  // House Use 제외한 합계 대상 코드
  const totalCodes = useMemo(
    () => (schema?.nodes ?? []).filter(n => n.name !== 'House Use').flatMap(n => n.segmentationCodes),
    [schema],
  )

  const roomCount  = schema?.roomCount ?? 0
  const daysInYear = MONTHS.reduce((s, mo) => s + daysInMonth(year, mo), 0)

  // ── 집계 헬퍼 ──
  const sumRN  = (codes: string[], mo: number) => codes.reduce((s, c) => s + (dataMap.get(`${c}:${mo}`)?.rn  ?? 0), 0)
  const sumREV = (codes: string[], mo: number) => codes.reduce((s, c) => s + (dataMap.get(`${c}:${mo}`)?.rev ?? 0), 0)
  const cmpRN  = (codes: string[], mo: number) => (cmpMap ? codes.reduce((s, c) => s + (cmpMap.get(`${c}:${mo}`) ?? 0), 0) : 0)
  const annualRN    = (codes: string[]) => MONTHS.reduce((s, mo) => s + sumRN(codes, mo), 0)
  const annualREV   = (codes: string[]) => MONTHS.reduce((s, mo) => s + sumREV(codes, mo), 0)
  const annualCmpRN = (codes: string[]) => MONTHS.reduce((s, mo) => s + cmpRN(codes, mo), 0)

  // ── 컬러 톤 ──
  const ACTUAL_TONE = { p: 'rgba(255,255,255,0.92)', s: 'rgba(255,255,255,0.6)',  m: 'rgba(255,255,255,0.4)' }
  const BLUE_TONE   = { p: BLUE,                      s: 'rgba(91,141,239,0.75)',  m: 'rgba(91,141,239,0.55)' }
  const FUTURE_TONE = { p: 'rgba(255,255,255,0.38)',  s: 'rgba(255,255,255,0.22)', m: 'rgba(255,255,255,0.14)' }
  const MINT_TONE   = { p: MINT,                      s: 'rgba(0,229,160,0.7)',    m: 'rgba(0,229,160,0.5)' }
  const monthTone = (mo: number) => (mo < otbMonth ? ACTUAL_TONE : mo === otbMonth ? BLUE_TONE : FUTURE_TONE)

  const dividerAfter = (mo: number) => mo === otbMonth - 1   // Actual↔OTB 경계 (otbMonth-1 컬럼 우측)
  const MINT_BORDER = `1px solid rgba(0,229,160,0.4)`
  const SEP_BORDER  = `0.5px solid rgba(255,255,255,0.12)`
  const stickyLeft: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 2 }
  const showDiff = compare !== 'none' && cmpMap != null

  // 3줄(+선택 차이) 데이터 셀
  const StatCell = (p: {
    rn: number; adr: number; rev: number; tone: { p: string; s: string; m: string }
    bold: boolean; diff?: number | null; borderRight?: string
  }) => (
    <td style={{
      padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top',
      borderRight: p.borderRight, borderBottom: '0.5px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.3 }}>
        <span style={{ fontSize: 11, fontWeight: p.bold ? 500 : 400, color: p.tone.p }}>{fmtRN(p.rn)}</span>
        {p.diff != null && (
          <span style={{ fontSize: 9, color: p.diff >= 0 ? MINT : NEG }}>
            {p.diff >= 0 ? '+' : ''}{Math.round(p.diff)}
          </span>
        )}
        <span style={{ fontSize: 10, color: p.tone.s }}>{fmtADR(p.adr)}</span>
        <span style={{ fontSize: 10, color: p.tone.m }}>{fmtREV(p.rev)}</span>
      </div>
    </td>
  )

  return (
    <div style={{ background: BG_PAGE, minHeight: '100vh', color: 'rgba(255,255,255,0.92)' }}>
      {/* ── 페이지 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `0.5px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/reports" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>
            <ArrowLeft size={14} />
            리포트 목록
          </Link>
          <span style={{ color: BORDER, fontSize: 12 }}>|</span>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#fff' }}>세그먼트 믹스</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: '4px 10px', fontSize: 12 }}>
            <Calendar size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>OTB 기준</span>
            <input type="date" value={otbDate} onChange={e => setOtbDate(e.target.value)}
              style={{ background: 'transparent', border: 'none', fontSize: 12, color: BLUE, fontWeight: 500, cursor: 'pointer', outline: 'none' }} />
          </div>
          <button
            title="준비 중"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 11px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: `0.5px solid ${BORDER}`, color: 'rgba(255,255,255,0.7)' }}>
            <Download size={13} />
            Excel
          </button>
        </div>
      </div>

      {/* ── 비교 필터 바 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: `0.5px solid ${BORDER}` }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>비교</span>
        {([['none', '없음'], ['budget', 'vs Budget'], ['ly', 'vs Last Year']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setCompare(key)}
            style={{
              padding: '3px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 11, fontWeight: 500,
              border: `1px solid ${compare === key ? 'rgba(0,229,160,0.5)' : 'rgba(255,255,255,0.12)'}`,
              background: compare === key ? 'rgba(0,229,160,0.12)' : 'transparent',
              color:      compare === key ? MINT : 'rgba(255,255,255,0.5)',
            }}>
            {label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, fontSize: 10 }}>
          <Legend color={ACTUAL_TONE.p} label="Actual" />
          <Legend color={BLUE} label="OTB 현재월" />
          <Legend color={FUTURE_TONE.p} label="OTB 미래" />
        </div>
      </div>

      {/* ── 테이블 카드 ── */}
      <div style={{ margin: '16px 20px', background: BG_CARD, border: `0.5px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        {tab === 'account' ? (
          <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
            Account 탭 — 준비 중
          </div>
        ) : !schema ? (
          <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
            불러오는 중…
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 900, width: '100%' }}>
              <thead>
                {/* 1행 — 월 헤더 */}
                <tr>
                  <th style={{ ...stickyLeft, zIndex: 4, textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', background: BG_L0, minWidth: 150, borderBottom: `0.5px solid ${BORDER}` }}>
                    SEGMENTATION
                  </th>
                  <th style={{ textAlign: 'right', padding: '8px 8px', fontSize: 11, fontWeight: 600, color: MINT, background: BG_CARD, minWidth: 60, borderRight: MINT_BORDER, borderBottom: `0.5px solid ${BORDER}` }}>
                    합계
                  </th>
                  {MONTHS.map(mo => (
                    <th key={mo} style={{
                      textAlign: 'right', padding: '8px 8px', fontSize: 11, fontWeight: 500, minWidth: 58,
                      color: monthTone(mo).p, background: BG_CARD,
                      borderRight: dividerAfter(mo) ? SEP_BORDER : undefined,
                      borderBottom: `0.5px solid ${BORDER}`,
                    }}>
                      {mo}월
                    </th>
                  ))}
                </tr>
                {/* 2행 — 서브헤더 (R/N · ADR · REV) */}
                <tr>
                  <th style={{ ...stickyLeft, zIndex: 4, background: BG_L0, borderBottom: '0.5px solid rgba(255,255,255,0.08)' }} />
                  {[{ k: 'sum', br: MINT_BORDER }, ...MONTHS.map(mo => ({ k: `m${mo}`, br: dividerAfter(mo) ? SEP_BORDER : undefined }))].map(col => (
                    <th key={col.k} style={{ padding: '2px 8px', background: BG_CARD, borderRight: col.br, borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25, fontSize: 9, color: 'rgba(255,255,255,0.32)', fontWeight: 400 }}>
                        <span>R/N</span><span>ADR</span><span>REV</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map(row => {
                  const bold = row.level === 0
                  const aRN = annualRN(row.codes), aREV = annualREV(row.codes)
                  const aADR = aRN > 0 ? aREV / aRN : 0
                  const aDiff = showDiff && bold ? aRN - annualCmpRN(row.codes) : null
                  return (
                    <tr key={row.key} style={{ background: bold ? 'rgba(255,255,255,0.025)' : 'transparent' }}>
                      <td style={{
                        ...stickyLeft,
                        padding: bold ? '5px 12px' : '5px 12px 5px 20px',
                        fontSize: bold ? 12 : 11, fontWeight: bold ? 500 : 400,
                        color: bold ? '#fff' : 'rgba(255,255,255,0.6)',
                        background: bold ? BG_L0 : BG_CARD,
                        whiteSpace: 'nowrap', borderBottom: '0.5px solid rgba(255,255,255,0.05)',
                      }}>
                        {bold ? row.name : `└ ${row.name}`}
                      </td>
                      <StatCell rn={aRN} adr={aADR} rev={aREV} tone={MINT_TONE} bold={bold} diff={aDiff} borderRight={MINT_BORDER} />
                      {MONTHS.map(mo => {
                        const rn = sumRN(row.codes, mo), rev = sumREV(row.codes, mo)
                        const adr = rn > 0 ? rev / rn : 0
                        const diff = showDiff && bold ? rn - cmpRN(row.codes, mo) : null
                        return (
                          <StatCell key={mo} rn={rn} adr={adr} rev={rev} tone={monthTone(mo)} bold={bold}
                            diff={diff} borderRight={dividerAfter(mo) ? SEP_BORDER : undefined} />
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>

              <tfoot>
                {/* 합계 (HOU 제외) */}
                {(() => {
                  const aRN = annualRN(totalCodes), aREV = annualREV(totalCodes)
                  const aADR = aRN > 0 ? aREV / aRN : 0
                  return (
                    <tr style={{ background: 'rgba(0,229,160,0.04)' }}>
                      <td style={{ ...stickyLeft, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: MINT, background: '#132019', whiteSpace: 'nowrap', borderTop: '1px solid rgba(0,229,160,0.4)' }}>
                        합계 (HOU 제외)
                      </td>
                      <td style={cellSum(MINT_BORDER)}>
                        <FootStat rn={aRN} adr={aADR} rev={aREV} tone={MINT_TONE} />
                      </td>
                      {MONTHS.map(mo => {
                        const rn = sumRN(totalCodes, mo), rev = sumREV(totalCodes, mo)
                        const adr = rn > 0 ? rev / rn : 0
                        return (
                          <td key={mo} style={cellSum(dividerAfter(mo) ? SEP_BORDER : undefined)}>
                            <FootStat rn={rn} adr={adr} rev={rev} tone={mo === otbMonth ? BLUE_TONE : MINT_TONE} />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })()}

                {/* OCC */}
                {(() => {
                  const aOcc = roomCount > 0 ? (annualRN(totalCodes) / (roomCount * daysInYear)) * 100 : 0
                  return (
                    <tr>
                      <td style={{ ...stickyLeft, padding: '5px 12px', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)', background: BG_CARD, whiteSpace: 'nowrap' }}>OCC</td>
                      <td style={{ ...cellPlain(MINT_BORDER), fontSize: 11, fontWeight: 600, color: MINT }}>{fmtOCC(aOcc)}</td>
                      {MONTHS.map(mo => {
                        const occ = roomCount > 0 ? (sumRN(totalCodes, mo) / (roomCount * daysInMonth(year, mo))) * 100 : 0
                        return (
                          <td key={mo} style={{ ...cellPlain(dividerAfter(mo) ? SEP_BORDER : undefined), fontSize: 11, color: monthTone(mo).p }}>{fmtOCC(occ)}</td>
                        )
                      })}
                    </tr>
                  )
                })()}

                {/* RevPAR */}
                {(() => {
                  const aRevpar = roomCount > 0 ? annualREV(totalCodes) / (roomCount * daysInYear) : 0
                  return (
                    <tr>
                      <td style={{ ...stickyLeft, padding: '5px 12px 8px', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)', background: BG_CARD, whiteSpace: 'nowrap' }}>RevPAR</td>
                      <td style={{ ...cellPlain(MINT_BORDER), fontSize: 11, fontWeight: 600, color: MINT }}>{fmtRevPAR(aRevpar)}</td>
                      {MONTHS.map(mo => {
                        const revpar = roomCount > 0 ? sumREV(totalCodes, mo) / (roomCount * daysInMonth(year, mo)) : 0
                        return (
                          <td key={mo} style={{ ...cellPlain(dividerAfter(mo) ? SEP_BORDER : undefined), fontSize: 11, color: monthTone(mo).p }}>{fmtRevPAR(revpar)}</td>
                        )
                      })}
                    </tr>
                  )
                })()}
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── 푸터 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: `0.5px solid ${BORDER}`, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
        <span>{[currentHotel?.hotel_name, roomCount ? `${roomCount}실` : null, `${year}년`].filter(Boolean).join(' · ')}</span>
        <span>업데이트 오늘</span>
      </div>
    </div>
  )
}

// ── 하위 표현 컴포넌트 ──
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.5)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

function FootStat({ rn, adr, rev, tone }: { rn: number; adr: number; rev: number; tone: { p: string; s: string; m: string } }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.3 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: tone.p }}>{fmtRN(rn)}</span>
      <span style={{ fontSize: 10, color: tone.s }}>{fmtADR(adr)}</span>
      <span style={{ fontSize: 10, color: tone.m }}>{fmtREV(rev)}</span>
    </div>
  )
}

// 합계 행 — mint 상단 구분선 (배경은 <tr>에서 처리)
const cellSum = (borderRight?: string): React.CSSProperties => ({
  padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top',
  borderRight, borderTop: '1px solid rgba(0,229,160,0.4)',
})
// OCC / RevPAR 행 — 일반 셀
const cellPlain = (borderRight?: string): React.CSSProperties => ({
  padding: '5px 8px', textAlign: 'right', whiteSpace: 'nowrap',
  borderRight, borderBottom: '0.5px solid rgba(255,255,255,0.05)',
})
