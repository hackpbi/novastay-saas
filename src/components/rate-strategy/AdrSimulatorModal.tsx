'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, PanelRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useTheme } from '@/contexts/ThemeContext'

interface RoomTypeLite {
  room_type_code:        string
  room_type_description?: string | null
  no_rooms?:             number | null
  surcharge?:            number | null
}

// get_adr_simulator_data RPC 반환
interface AdrSimRoom {
  room_type_code: string
  room_type_name: string
  surcharge:      number
  total_rooms:    number
  booked:         number
  avail:          number
}
// get_adr_simulator_data RPC forecast 필드 (null이면 Forecast 미설정)
interface AdrSimForecast {
  update_date: string
  rn:          number
  adr:         number   // 원 단위
  revenue:     number   // 원 단위
}
interface AdrSimData {
  total_rooms:   number
  base_bar_rate: number
  otb_date:      string
  rooms:         AdrSimRoom[]
  forecast?:     AdrSimForecast | null
}

// 내부 정규화 Forecast (occ는 rn/total로 계산)
interface Fcst { occ: number; rn: number; adr: number; rev: number }

interface AdrSimulatorModalProps {
  isOpen:         boolean
  onClose:        () => void
  date:           string
  onDateChange:   (d: string) => void
  totalRooms:     number
  roomTypes:      RoomTypeLite[]
  baseBarRate:    number   // BASE new_rate (원) — 해당 날짜
  booked:         number   // 임시: 해당 날짜 총 예약 객실수
  fcstUpdateDate?: string | null   // FCST picker 날짜 (YYYY-MM-DD)
}

// ── NovaStay 테마 (src/index.css CSS 변수 — 라이트/다크 자동 대응) ──
const MINT     = 'var(--color-accent-primary)'
const RED      = 'var(--color-negative)'
const PURPLE   = 'var(--color-ns-purple)'
const WARN     = 'var(--color-warning)'
const POS      = 'var(--color-positive)'
const TXT      = 'var(--color-text-primary)'
const TXT2     = 'var(--color-text-secondary)'
const TXT3     = 'var(--color-text-muted)'
const BG_BODY  = 'var(--color-bg-secondary)'
const BG_CARD  = 'var(--color-bg-tertiary)'
const BG_INPUT = 'var(--color-bg-elevated)'
const BORDER   = 'var(--color-border-default)'
const BORDER_ACCENT = 'var(--color-border-accent)'
const DANGER_BG  = 'var(--negative-bg)'
const DANGER_BD  = 'var(--negative-border)'
const SUCCESS_BG = 'var(--accent-badge-bg)'
const SUCCESS_BD = 'var(--accent-badge-border)'

const kFmt = (v: number) => `${Math.round(v / 1000).toLocaleString('ko-KR')}K`

export default function AdrSimulatorModal({
  isOpen, onClose, date, onDateChange, totalRooms, baseBarRate, booked, fcstUpdateDate,
}: AdrSimulatorModalProps) {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { theme } = useTheme()
  const isLight = theme === 'light'
  // warning 계열은 테마 대응 CSS 변수가 없어 JS 분기 (배너 한정)
  const WARN_BG = isLight ? '#fffbe6' : '#2a1f0a'
  const WARN_BD = isLight ? '#ffe58f' : '#F59E0B40'

  const [barK,      setBarK]      = useState(Math.round(baseBarRate / 1000))
  const [otaPct,    setOtaPct]    = useState(60)
  const [otaFeePct, setOtaFeePct] = useState(15)
  const [showDetail, setShowDetail] = useState(false)

  // get_adr_simulator_data — simDate(date)/FCST date 변경 시 재호출
  const { data: sim } = useQuery({
    queryKey: ['adr_simulator', hotelId, date, fcstUpdateDate],
    enabled: isOpen && !!hotelId && !!date,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_adr_simulator_data', {
        p_hotel_id:  hotelId,
        p_date:      date,
        p_fcst_date: fcstUpdateDate ?? null,
      })
      if (error) throw error
      // RPC가 RETURNS TABLE/SETOF면 배열로 옴 → 첫 행 언랩 (객체면 그대로)
      const raw = data
      const sim = Array.isArray(raw) ? raw[0] : raw
      return (sim ?? null) as AdrSimData | null
    },
  })

  // RPC 우선, 미로딩/없음 시 prop 폴백
  const effTotal  = sim?.total_rooms   ?? totalRooms
  const effBase   = sim?.base_bar_rate ?? baseBarRate
  const effRooms  = sim?.rooms ?? []
  const effBooked = effRooms.length ? effRooms.reduce((s, r) => s + (r.booked ?? 0), 0) : booked

  // Forecast 정규화 — RPC forecast(rn/adr/revenue) → Fcst(occ는 rn/total로 계산). null이면 미설정
  const fcstRaw = sim?.forecast ?? null
  const fcst: Fcst | null = fcstRaw ? {
    rn:  fcstRaw.rn,
    adr: fcstRaw.adr,
    rev: fcstRaw.revenue,
    occ: effTotal > 0 ? Math.round((fcstRaw.rn / effTotal) * 100) : 0,
  } : null

  // 현재 BAR(effBase) 변경 시 BAR 입력 동기화 — 0이면 현재 입력값 유지
  useEffect(() => { if (effBase > 0) setBarK(Math.round(effBase / 1000)) }, [effBase])

  // ESC + scroll lock
  useEffect(() => {
    if (!isOpen) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [isOpen, onClose])

  const calc = useMemo(() => {
    const TOTAL = effTotal
    const avail = Math.max(0, TOTAL - effBooked)
    const curOcc = TOTAL > 0 ? Math.round((effBooked / TOTAL) * 100) : 0
    const curAdr = effBase
    const newBar = barK * 1000
    const otaFee = otaFeePct / 100
    const dirPct = 100 - otaPct

    // 판매 가정: Forecast 있으면 목표 R/N까지, 없으면 잔여 전량 판매
    const sellRooms  = fcst ? Math.min(avail, Math.max(0, fcst.rn - effBooked)) : avail
    const sellRatio  = avail > 0 ? sellRooms / avail : 0
    const simTotalRn = effBooked + sellRooms
    const simOcc = TOTAL > 0 ? Math.round((simTotalRn / TOTAL) * 100) : 0

    // 객실타입별 — RPC rooms의 avail/surcharge 사용 (잔여 0 타입은 제외)
    const detail = effRooms.filter(r => (r.avail ?? 0) > 0).map(room => {
      const rtAvail = room.avail ?? 0
      const rtSell  = Math.round(rtAvail * sellRatio)
      const sc      = room.surcharge ?? 0
      const curFull = effBase + sc
      const newFull = newBar + sc
      const otaRate = Math.round(newFull * (1 - otaFee))
      const avgRate = newFull * (1 - otaFee) * (otaPct / 100) + newFull * (dirPct / 100)
      return { room, rtAvail, rtSell, curFull, newFull, otaRate, dirRate: newFull, rev: avgRate * rtSell }
    })

    const newAvailRev = detail.reduce((s, d) => s + d.rev, 0)
    const curRev = curAdr * effBooked
    const simRev = curRev + newAvailRev
    const simAdr = simTotalRn > 0 ? Math.round(simRev / simTotalRn) : 0

    return {
      avail, curOcc, curAdr, simOcc, simTotalRn, sellRooms, curRev, simRev, simAdr, detail,
      gapOcc: simOcc - curOcc,
      gapRn:  simTotalRn - effBooked,
      gapAdr: simAdr - curAdr,
      gapRev: simRev - curRev,
    }
  }, [effTotal, effBooked, effBase, effRooms, barK, otaPct, otaFeePct, fcst])

  // Forecast 파생값 (표시용)
  const ach = fcst ? {
    OCC: fcst.occ > 0 ? Math.round((calc.simOcc / fcst.occ) * 100) : 0,
    ADR: fcst.adr > 0 ? Math.round((calc.simAdr / fcst.adr) * 100) : 0,
    REV: fcst.rev > 0 ? Math.round((calc.simRev / fcst.rev) * 100) : 0,
  } : null
  const feasible = fcst ? (calc.simRev >= fcst.rev && calc.simAdr >= fcst.adr) : false
  const revGap   = fcst ? Math.max(0, Math.round((fcst.rev - calc.simRev) / 1000)) : 0
  const needRn   = fcst ? Math.max(0, fcst.rn - effBooked) : 0

  if (!isOpen) return null

  // 날짜 ±1 (KST 기준)
  const changeDate = (delta: number) => {
    if (!date) return
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    onDateChange(d.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' }))
  }
  // 'YYYY-MM-DD' → 'MM/DD (요일)'
  const formatDate = (s: string) => {
    if (!s) return '—'
    const d = new Date(s + 'T00:00:00')
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`
  }
  const gapArrow = (v: number) => (v >= 0 ? '▲' : '▼')
  const gapColor = (v: number) => (v >= 0 ? MINT : RED)

  const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: TXT3, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }
  const navBtn: React.CSSProperties = { background: BG_CARD, border: `0.5px solid ${BORDER}`, borderRadius: 6, color: TXT2, width: 24, height: 24, cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }
  const chanBox: React.CSSProperties = { flex: 1, background: BG_CARD, border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px' }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <style>{`@keyframes slideInRight { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }`}</style>
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose} />
      {/* 래퍼 — 좌측 시뮬레이터 + 우측 객실타입 패널 */}
      <div className="relative rounded-2xl overflow-hidden flex flex-row w-full" style={{ maxWidth: showDetail ? 840 : 540, transition: 'max-width 0.15s ease', border: `0.5px solid ${BORDER}`, maxHeight: '90vh', boxShadow: 'var(--shadow-elevated)' }}>
        {/* 좌측: 시뮬레이터 콘텐츠 */}
        <div className="flex flex-col" style={{ flex: '0 0 auto', width: 540, background: BG_BODY, maxHeight: '90vh' }}>
        {/* Header */}
        <div className="shrink-0" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 12px', borderBottom: `0.5px solid ${BORDER}` }}>
          {/* 좌측: 타이틀 */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: TXT }}>ADR 시뮬레이터</div>
            <div style={{ fontSize: 11, color: TXT3, marginTop: 2 }}>{fcst ? '현재 BAR로 Forecast 달성 가능 여부 확인' : 'BAR·채널 조정 시 ADR·REV 예측'}</div>
          </div>
          {/* 우측: 날짜 네비 | 잔여 | 닫기 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => changeDate(-1)} aria-label="이전 날짜" style={navBtn}>‹</button>
              <span style={{ fontSize: 12, color: TXT, minWidth: 82, textAlign: 'center' }}>{formatDate(date)}</span>
              <button onClick={() => changeDate(+1)} aria-label="다음 날짜" style={navBtn}>›</button>
            </div>
            <div style={{ width: 1, height: 24, background: BORDER }} />
            <div style={{ background: DANGER_BG, border: `0.5px solid ${DANGER_BD}`, borderRadius: 8, padding: '4px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: RED }}>잔여</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: RED, lineHeight: 1.1 }}>{calc.avail}<span style={{ fontSize: 11, fontWeight: 400 }}>실</span></div>
            </div>
            <button
              onClick={() => setShowDetail(prev => !prev)}
              title={showDetail ? '상세 닫기' : '객실타입 상세 보기'}
              aria-label={showDetail ? '상세 닫기' : '객실타입 상세 보기'}
              style={{
                background: showDetail ? 'var(--accent-badge-bg)' : BG_INPUT,
                border: `0.5px solid ${showDetail ? BORDER_ACCENT : BORDER}`,
                borderRadius: 6, color: showDetail ? MINT : TXT3,
                width: 28, height: 28, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <PanelRight size={15} />
            </button>
            <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기"><X size={20} /></button>
          </div>
        </div>

        {/* 핵심 질문 배너 — 항상 표시 (Forecast 미설정 시 안내 문구) */}
        <div style={{ padding: '10px 16px', background: WARN_BG, borderBottom: `0.5px solid ${WARN_BD}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {fcst ? (
              <>
                <span style={{ fontSize: 12, color: WARN }}>
                  현재 BAR <strong>{Math.round(baseBarRate / 1000)}K</strong>로 Forecast 달성 가능?
                </span>
                {feasible
                  ? <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap', background: SUCCESS_BG, color: POS, border: `0.5px solid ${SUCCESS_BD}` }}>✓ 달성 가능</span>
                  : <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap', background: DANGER_BG, color: RED, border: `0.5px solid ${DANGER_BD}` }}>▼ {revGap.toLocaleString()}K 부족</span>}
              </>
            ) : (
              <span style={{ fontSize: 12, color: WARN }}>
                Forecast 미설정 — 현재 BAR <strong>{Math.round(baseBarRate / 1000)}K</strong> 조정 시 OTB 대비 예측
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 시뮬레이션 설정 */}
          <div>
            <div className="space-y-3">
              {/* BAR 조정 */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs" style={{ color: TXT2 }}>판매 BAR 조정</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: TXT2 }}>{Math.round(effBase / 1000)}K →</span>
                  <input type="number" value={barK} onChange={e => setBarK(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 px-2 py-1 text-sm text-right outline-none"
                    style={{ background: BG_INPUT, border: `0.5px solid ${BORDER_ACCENT}`, borderRadius: 6, color: MINT }} />
                  <span className="text-xs" style={{ color: TXT2 }}>천원</span>
                </div>
              </div>

              {/* 채널 슬라이더 3개 가로 배치 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={chanBox}>
                  <div style={{ fontSize: 10, color: TXT3, marginBottom: 5 }}>OTA 비중</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="range" min={0} max={100} step={1} value={otaPct} onChange={e => setOtaPct(Number(e.target.value))}
                      style={{ flex: 1, accentColor: MINT, cursor: 'pointer' }} />
                    <span style={{ fontSize: 12, color: TXT, minWidth: 28, textAlign: 'right' }}>{otaPct}%</span>
                  </div>
                </div>
                <div style={chanBox}>
                  <div style={{ fontSize: 10, color: TXT3, marginBottom: 5 }}>다이렉트</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="range" min={0} max={100} step={1} value={100 - otaPct} disabled
                      style={{ flex: 1, accentColor: MINT, opacity: 0.5, cursor: 'not-allowed' }} />
                    <span style={{ fontSize: 12, color: TXT, minWidth: 28, textAlign: 'right' }}>{100 - otaPct}%</span>
                  </div>
                </div>
                <div style={chanBox}>
                  <div style={{ fontSize: 10, color: TXT3, marginBottom: 5 }}>OTA 수수료</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="range" min={0} max={40} step={1} value={otaFeePct} onChange={e => setOtaFeePct(Number(e.target.value))}
                      style={{ flex: 1, accentColor: MINT, cursor: 'pointer' }} />
                    <span style={{ fontSize: 12, color: TXT, minWidth: 28, textAlign: 'right' }}>{otaFeePct}%</span>
                  </div>
                </div>
              </div>

              {/* 안내 텍스트 */}
              <div style={{ fontSize: 11, color: TXT3 }}>
                {fcst
                  ? `잔여 ${calc.avail}실 중 ${needRn}실 더 팔아야 Forecast OCC 도달`
                  : `잔여 ${calc.avail}실을 이 요금으로 판매 시 예측`}
              </div>
            </div>
          </div>

          {/* 결과 테이블 — OTB / [Forecast] / 시뮬 / [vs Forecast | vs OTB] */}
          <div className="overflow-hidden" style={{ background: BG_CARD, border: `0.5px solid ${BORDER}`, borderRadius: 8 }}>
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: TXT3, fontSize: 10 }}>
                  <th style={{ textAlign: 'left', padding: '8px 14px' }} />
                  <th style={{ textAlign: 'right', padding: '8px 14px' }}>OCC</th>
                  <th style={{ textAlign: 'right', padding: '8px 14px' }}>R/N</th>
                  <th style={{ textAlign: 'right', padding: '8px 14px' }}>ADR</th>
                  <th style={{ textAlign: 'right', padding: '8px 14px' }}>REV</th>
                </tr>
              </thead>
              <tbody>
                {/* OTB */}
                <tr style={{ borderTop: `0.5px solid ${BORDER}` }}>
                  <td style={{ padding: '8px 14px', color: TXT2 }}>OTB</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: TXT }}>{calc.curOcc}%</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: TXT }}>{effBooked}실</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: TXT }}>{kFmt(calc.curAdr)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: TXT }}>{kFmt(calc.curRev)}</td>
                </tr>
                {/* Forecast */}
                {fcst && (
                  <tr style={{ borderTop: `0.5px solid ${BORDER}` }}>
                    <td style={{ padding: '8px 14px', color: PURPLE }}>Forecast</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: PURPLE }}>{fcst.occ}%</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: PURPLE }}>{fcst.rn}실</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: PURPLE }}>{kFmt(fcst.adr)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: PURPLE }}>{kFmt(fcst.rev)}</td>
                  </tr>
                )}
                {/* 시뮬 */}
                <tr style={{ borderTop: `0.5px solid ${BORDER}`, background: SUCCESS_BG }}>
                  <td style={{ padding: '8px 14px', color: MINT, fontWeight: 500, fontSize: 14 }}>시뮬</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: MINT, fontWeight: 500, fontSize: 14 }}>{calc.simOcc}%</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: MINT, fontWeight: 500, fontSize: 14 }}>{calc.simTotalRn}실</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: MINT, fontWeight: 500, fontSize: 14 }}>{kFmt(calc.simAdr)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: MINT, fontWeight: 500, fontSize: 14 }}>{kFmt(calc.simRev)}</td>
                </tr>
                {/* vs Forecast (있을 때) / vs OTB (없을 때) */}
                {fcst ? (
                  <tr style={{ borderTop: `0.5px solid ${BORDER}`, fontSize: 11 }}>
                    <td style={{ padding: '7px 14px', color: TXT3 }}>vs Forecast</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', color: gapColor(calc.simOcc - fcst.occ) }}>{gapArrow(calc.simOcc - fcst.occ)} {Math.abs(calc.simOcc - fcst.occ)}%</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', color: gapColor(calc.simTotalRn - fcst.rn) }}>{gapArrow(calc.simTotalRn - fcst.rn)} {Math.abs(calc.simTotalRn - fcst.rn)}실</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', color: gapColor(calc.simAdr - fcst.adr) }}>{gapArrow(calc.simAdr - fcst.adr)} {kFmt(Math.abs(calc.simAdr - fcst.adr))}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', color: gapColor(calc.simRev - fcst.rev) }}>{gapArrow(calc.simRev - fcst.rev)} {kFmt(Math.abs(calc.simRev - fcst.rev))}</td>
                  </tr>
                ) : (
                  <tr style={{ borderTop: `0.5px solid ${BORDER}`, fontSize: 11 }}>
                    <td style={{ padding: '7px 14px', color: TXT3 }}>vs OTB</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', color: gapColor(calc.gapOcc) }}>{gapArrow(calc.gapOcc)} {Math.abs(calc.gapOcc)}%</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', color: gapColor(calc.gapRn) }}>{gapArrow(calc.gapRn)} {Math.abs(calc.gapRn)}실</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', color: gapColor(calc.gapAdr) }}>{gapArrow(calc.gapAdr)} {kFmt(Math.abs(calc.gapAdr))}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', color: gapColor(calc.gapRev) }}>{gapArrow(calc.gapRev)} {kFmt(Math.abs(calc.gapRev))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 달성률 바 3개 — Forecast 있을 때만 */}
          {fcst && ach && (
            <div style={{ display: 'flex', gap: 8 }}>
              {(['OCC', 'ADR', 'REV'] as const).map(label => {
                const pct = ach[label]
                const c  = pct >= 100 ? POS : pct >= 80 ? WARN : RED
                return (
                  <div key={label} style={{ flex: 1, background: BG_CARD, border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 10, color: TXT3 }}>{label}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: c }}>{Math.min(pct, 999)}%</span>
                    </div>
                    <div style={{ height: 3, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: 3, borderRadius: 2, width: `${Math.min(pct, 100)}%`, background: c, transition: 'width 0.2s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>
        </div>

        {/* 우측: 객실타입 상세 패널 */}
        {showDetail && (
          <div style={{ width: 300, flex: '0 0 auto', borderLeft: `0.5px solid ${BORDER}`, background: BG_BODY, padding: '14px 16px', overflowY: 'auto', maxHeight: '90vh', animation: 'slideInRight 0.15s ease' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: TXT2, marginBottom: 10 }}>객실타입별 요금 상세</div>
            <div className="rounded-lg overflow-x-auto" style={{ border: `0.5px solid ${BORDER}` }}>
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ color: TXT3, fontSize: 10, background: BG_CARD }}>
                    {['객실타입', '잔여', '예상판매', '현재BAR', '판매요금', 'OTA요금', '다이렉트'].map((h, i) => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calc.detail.map(d => (
                    <tr key={d.room.room_type_code} style={{ borderTop: `0.5px solid ${BORDER}` }}>
                      <td style={{ padding: '7px 10px', color: TXT }}>{d.room.room_type_name || d.room.room_type_code}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: TXT2 }}>{d.rtAvail}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: MINT }}>{d.rtSell}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: TXT3 }}>{kFmt(d.curFull)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: TXT }}>{kFmt(d.newFull)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: TXT3 }}>{kFmt(d.otaRate)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: TXT3 }}>{kFmt(d.dirRate)}</td>
                    </tr>
                  ))}
                  {calc.detail.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 12, textAlign: 'center', color: TXT3 }}>객실타입 데이터가 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
