'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Calculator, ChevronDown, ChevronRight } from 'lucide-react'

// ⚠️ a02_otb_daily 스키마 미확인 — 객실타입별 예약/잔여는 임시로 no_rooms 비율 분배.
//    스키마 확정 시 booked/per-type avail 소스를 교체.
interface RoomTypeLite {
  room_type_code:        string
  room_type_description?: string | null
  no_rooms?:             number | null
  surcharge?:            number | null
}

interface AdrSimulatorModalProps {
  isOpen:       boolean
  onClose:      () => void
  date:         string
  onDateChange: (d: string) => void
  totalRooms:   number
  roomTypes:    RoomTypeLite[]
  baseBarRate:  number   // BASE new_rate (원) — 해당 날짜
  booked:       number   // 임시: 해당 날짜 총 예약 객실수
}

const MINT = '#00E5A0'
const RED  = '#f87171'
const kFmt = (v: number) => `${Math.round(v / 1000).toLocaleString('ko-KR')}K`

export default function AdrSimulatorModal({
  isOpen, onClose, date, onDateChange, totalRooms, roomTypes, baseBarRate, booked,
}: AdrSimulatorModalProps) {
  const [barK,      setBarK]      = useState(Math.round(baseBarRate / 1000))
  const [sellPct,   setSellPct]   = useState(70)
  const [otaPct,    setOtaPct]    = useState(60)
  const [otaFeePct, setOtaFeePct] = useState(15)
  const [showDetail, setShowDetail] = useState(false)

  // 날짜(=baseBarRate) 변경 시 BAR 입력 동기화
  useEffect(() => { setBarK(Math.round(baseBarRate / 1000)) }, [baseBarRate])

  // ESC + scroll lock
  useEffect(() => {
    if (!isOpen) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [isOpen, onClose])

  const calc = useMemo(() => {
    const TOTAL = totalRooms
    const avail = Math.max(0, TOTAL - booked)
    const curOcc = TOTAL > 0 ? Math.round((booked / TOTAL) * 100) : 0
    const curAdr = baseBarRate
    const newBar = barK * 1000
    const otaFee = otaFeePct / 100
    const dirPct = 100 - otaPct

    const sellRooms = Math.round(avail * (sellPct / 100))
    const simTotalRn = booked + sellRooms
    const simOcc = TOTAL > 0 ? Math.round((simTotalRn / TOTAL) * 100) : 0

    const totalNo = roomTypes.reduce((s, rt) => s + (rt.no_rooms ?? 0), 0)
    const detail = roomTypes.map(rt => {
      const share = totalNo > 0 ? (rt.no_rooms ?? 0) / totalNo : (roomTypes.length ? 1 / roomTypes.length : 0)
      const rtAvail = Math.round(avail * share)
      const rtSell  = Math.round(rtAvail * (sellPct / 100))
      const sc      = rt.surcharge ?? 0
      const curFull = baseBarRate + sc
      const newFull = newBar + sc
      const otaRate = Math.round(newFull * (1 - otaFee))
      const avgRate = newFull * (1 - otaFee) * (otaPct / 100) + newFull * (dirPct / 100)
      return { rt, rtAvail, rtSell, curFull, newFull, otaRate, dirRate: newFull, rev: avgRate * rtSell }
    })

    const newAvailRev = detail.reduce((s, d) => s + d.rev, 0)
    const curRev = curAdr * booked
    const simRev = curRev + newAvailRev
    const simAdr = simTotalRn > 0 ? Math.round(simRev / simTotalRn) : 0

    return {
      avail, curOcc, curAdr, simOcc, simTotalRn, sellRooms, curRev, simRev, simAdr, detail,
      gapOcc: simOcc - curOcc,
      gapRn:  simTotalRn - booked,
      gapAdr: simAdr - curAdr,
      gapRev: simRev - curRev,
    }
  }, [totalRooms, booked, baseBarRate, barK, sellPct, otaPct, otaFeePct, roomTypes])

  if (!isOpen) return null

  const panel: React.CSSProperties = { background: '#111', border: '1px solid #2a2a2a' }
  const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }
  const stat = (label: string, value: string) => (
    <div className="flex-1 rounded-lg px-3 py-2.5" style={{ background: '#0a0a0a', border: '1px solid #222' }}>
      <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono, monospace)' }}>{value}</div>
    </div>
  )
  const gapColor = (v: number) => (v >= 0 ? MINT : RED)
  const gapArrow = (v: number) => (v >= 0 ? '▲' : '▼')

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div className="relative rounded-2xl overflow-hidden flex flex-col w-[94vw] max-w-2xl" style={{ ...panel, maxHeight: '90vh', boxShadow: 'var(--shadow-card)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid #2a2a2a' }}>
          <div className="flex items-center gap-2">
            <Calculator size={16} style={{ color: MINT }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>예상 ADR 시뮬레이터</h2>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date" value={date} onChange={e => onDateChange(e.target.value)}
              className="rounded-md px-2 py-1 text-xs outline-none"
              style={{ background: '#0a0a0a', border: '1px solid #2a2a2a', color: 'var(--color-text-primary)', colorScheme: 'dark' }}
            />
            <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 현재 OTB 현황 */}
          <div>
            <div style={sectionLabel}>현재 OTB 현황</div>
            <div className="flex gap-2">
              {stat('총 객실', `${totalRooms}`)}
              {stat('예약', `${booked}`)}
              {stat('잔여', `${calc.avail}`)}
              {stat('현재 OCC', `${calc.curOcc}%`)}
            </div>
          </div>

          {/* 시뮬레이션 설정 */}
          <div>
            <div style={sectionLabel}>시뮬레이션 설정</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>판매 요금(BAR)</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{Math.round(baseBarRate / 1000)}K →</span>
                  <input type="number" value={barK} onChange={e => setBarK(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 rounded-md px-2 py-1 text-sm text-right outline-none"
                    style={{ background: '#0a0a0a', border: `1px solid ${MINT}`, color: MINT }} />
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>천원</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>잔여 객실 판매율</span>
                  <span className="text-xs font-mono" style={{ color: MINT }}>{sellPct}% ({calc.sellRooms}실)</span>
                </div>
                <input type="range" min={0} max={100} value={sellPct} onChange={e => setSellPct(Number(e.target.value))}
                  className="w-full" style={{ accentColor: MINT }} />
              </div>
            </div>
          </div>

          {/* 채널 비중 */}
          <div>
            <div className="flex items-center justify-between" style={sectionLabel}>
              <span>채널 비중</span><span>합계 100%</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>OTA <span style={{ color: MINT }}>{otaPct}%</span></span>
                  <span>다이렉트 <span style={{ color: MINT }}>{100 - otaPct}%</span></span>
                </div>
                <input type="range" min={0} max={100} value={otaPct} onChange={e => setOtaPct(Number(e.target.value))}
                  className="w-full" style={{ accentColor: MINT }} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>OTA 수수료율</span>
                  <span className="text-xs font-mono" style={{ color: MINT }}>{otaFeePct}%</span>
                </div>
                <input type="range" min={0} max={40} value={otaFeePct} onChange={e => setOtaFeePct(Number(e.target.value))}
                  className="w-full" style={{ accentColor: MINT }} />
              </div>
            </div>
          </div>

          {/* 결과 */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#0d1a13', border: '1px solid #1d3a2c' }}>
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--color-text-secondary)', fontSize: 10 }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }} />
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>OCC</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>R/N</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>ADR</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>REV</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr style={{ borderTop: '1px solid #1d3a2c' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>현재</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--color-text-primary)' }}>{calc.curOcc}%</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--color-text-primary)' }}>{booked}실</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--color-text-primary)' }}>{kFmt(calc.curAdr)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--color-text-primary)' }}>{kFmt(calc.curRev)}</td>
                </tr>
                <tr style={{ borderTop: '1px solid #1d3a2c', background: 'rgba(0,229,160,0.06)' }}>
                  <td style={{ padding: '8px 12px', color: MINT, fontWeight: 600 }}>시뮬</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: MINT, fontWeight: 600 }}>{calc.simOcc}%</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: MINT, fontWeight: 600 }}>{calc.simTotalRn}실</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: MINT, fontWeight: 600 }}>{kFmt(calc.simAdr)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: MINT, fontWeight: 600 }}>{kFmt(calc.simRev)}</td>
                </tr>
                <tr style={{ borderTop: '1px solid #1d3a2c' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>GAP</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: gapColor(calc.gapOcc) }}>{gapArrow(calc.gapOcc)} {Math.abs(calc.gapOcc)}%</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: gapColor(calc.gapRn) }}>{gapArrow(calc.gapRn)} {Math.abs(calc.gapRn)}실</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: gapColor(calc.gapAdr) }}>{gapArrow(calc.gapAdr)} {kFmt(Math.abs(calc.gapAdr))}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: gapColor(calc.gapRev) }}>{gapArrow(calc.gapRev)} {kFmt(Math.abs(calc.gapRev))}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 객실타입별 상세 토글 */}
          <div>
            <button onClick={() => setShowDetail(v => !v)} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {showDetail ? <ChevronDown size={14} /> : <ChevronRight size={14} />} 객실타입별 요금 상세 보기
            </button>
            {showDetail && (
              <div className="mt-2 rounded-lg overflow-x-auto" style={{ border: '1px solid #2a2a2a' }}>
                <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ color: 'var(--color-text-secondary)', fontSize: 10, background: '#0a0a0a' }}>
                      {['객실타입', '잔여', '예상판매', '현재BAR', '판매요금', 'OTA요금', '다이렉트'].map((h, i) => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {calc.detail.map(d => (
                      <tr key={d.rt.room_type_code} style={{ borderTop: '1px solid #1f1f1f' }}>
                        <td style={{ padding: '7px 10px', color: 'var(--color-text-primary)', fontFamily: 'inherit' }}>{d.rt.room_type_code}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{d.rtAvail}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: MINT }}>{d.rtSell}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{kFmt(d.curFull)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-primary)' }}>{kFmt(d.newFull)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{kFmt(d.otaRate)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{kFmt(d.dirRate)}</td>
                      </tr>
                    ))}
                    {calc.detail.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: 12, textAlign: 'center', color: 'var(--color-text-secondary)' }}>객실타입 데이터가 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p style={{ fontSize: 10, color: 'var(--color-text-secondary)', opacity: 0.7 }}>
            ※ 객실타입별 예약/잔여는 임시(no_rooms 비율 분배)입니다. a02_otb_daily 스키마 확정 후 실데이터로 교체됩니다.
          </p>
        </div>
      </div>
    </div>
  )
}
