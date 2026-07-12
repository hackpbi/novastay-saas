'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useDateContext } from '@/contexts/DateContext'
import { useMarketSchema } from '@/hooks/useMarketSchema'

const DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface PickupRequiredModalProps {
  open:      boolean
  onClose:   () => void
  hotelId:   string
  monthKey:  string      // 'YYYY-MM'
  fcstDate:  string      // 'YYYY-MM-DD' — FCST 기준일 (글로벌 picker)
  roomCount: number
}

type RowData = { day: number; dow: number; otb: number; fcst: number; need: number; pct: number }

const pad = (n: number) => String(n).padStart(2, '0')

export default function PickupRequiredModal({ open, onClose, hotelId, monthKey, fcstDate, roomCount }: PickupRequiredModalProps) {
  const { otbDate } = useDateContext()            // 일별 OTB 스냅샷 기준일
  const { data: schema } = useMarketSchema()      // 세그 컬러용

  const [ym, setYm] = useState(monthKey)          // 내부 월 상태 (‹ › 네비)
  const [rows, setRows] = useState<RowData[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (open) setYm(monthKey) }, [open, monthKey])

  const [y, m] = ym.split('-').map(Number)        // m: 1-based
  const monthLabel = `${MON_EN[m - 1]} ${y}`
  const shiftMonth = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1)        // KST 로컬
    setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }

  // ── 데이터 로딩 — 기존 RPC 재사용 (get_ly_pacing_data: OTB / get_forecast_daily: FCST) ──
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      if (!hotelId || !fcstDate) { if (!cancelled) { setRows([]); setLoading(false) }; return }

      const lastDay = new Date(y, m, 0).getDate()
      const start = `${y}-${pad(m)}-01`
      const end   = `${y}-${pad(m)}-${pad(lastDay)}`

      // FCST 일별 (get_forecast_daily → forecast_nights)
      const { data: fcstRows } = await (supabase as any).rpc('get_forecast_daily', {
        p_hotel_id:    hotelId,
        p_start_date:  start,
        p_end_date:    end,
        p_update_date: fcstDate,
      })
      // OTB 일별 (get_ly_pacing_data → otb_nights)
      const { data: otbRows } = await (supabase as any).rpc('get_ly_pacing_data', {
        p_hotel_id:  hotelId,
        p_otb_date:  otbDate,
      }).limit(100000)
      if (cancelled) return

      const fcstByDay: Record<number, number> = {}
      for (const r of (fcstRows ?? []) as { business_date: string; forecast_nights: number }[]) {
        const d = new Date(r.business_date)
        if (d.getFullYear() !== y || d.getMonth() !== m - 1) continue
        fcstByDay[d.getDate()] = (fcstByDay[d.getDate()] ?? 0) + Number(r.forecast_nights ?? 0)
      }
      const otbByDay: Record<number, number> = {}
      for (const r of (otbRows ?? []) as { business_date: string; otb_nights: number }[]) {
        const d = new Date(r.business_date)
        if (d.getFullYear() !== y || d.getMonth() !== m - 1) continue
        otbByDay[d.getDate()] = (otbByDay[d.getDate()] ?? 0) + Number(r.otb_nights ?? 0)
      }

      // FCST가 있는 날짜만 (vs FCST 개념) — 오름차순
      const out: RowData[] = []
      for (let day = 1; day <= lastDay; day++) {
        if (!(day in fcstByDay)) continue
        const fcst = Math.round(fcstByDay[day] ?? 0)
        const otb  = Math.round(otbByDay[day] ?? 0)
        const dow  = new Date(y, m - 1, day).getDay()
        const need = fcst - otb
        const pct  = fcst > 0 ? Math.round((otb / fcst) * 100) : 100
        out.push({ day, dow, otb, fcst, need, pct })
      }
      setRows(out)
      setLoading(false)
    }
    fetchData()
    return () => { cancelled = true }
  }, [open, hotelId, ym, otbDate, fcstDate])

  // ESC + scroll lock
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  if (!open) return null

  // ── 집계 ─────────────────────────────────────────────────────────────────────
  const totalNeed = rows.filter(r => r.need > 0).reduce((s, r) => s + r.need, 0)
  const totalFcst = rows.reduce((s, r) => s + r.fcst, 0)
  const totalOtb  = rows.reduce((s, r) => s + r.otb, 0)
  const filledPct = totalFcst > 0 ? Math.round((totalOtb / totalFcst) * 100) : 100

  const today = new Date()
  const todayKST = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
  const remainDays = rows.filter(r => (y * 10000 + m * 100 + r.day) >= todayKST).length
  const avgPerDay = remainDays > 0 ? Math.round(totalNeed / remainDays) : 0

  const urgent = rows.filter(r => r.need > 0).sort((a, b) => a.pct - b.pct).slice(0, 3)

  // 우측 세그 패널 (더미 비율 — 이후 실데이터 연동)
  const topSegs = (schema ?? []).filter(s => s.parent_id === null && s.level === 'main')
  const segNeed = topSegs.map(s => ({
    name:  s.name,
    color: s.bg_dark_color ?? s.color ?? '#ccc',
    need:  topSegs.length > 0 ? Math.round(totalNeed / topSegs.length) : 0,
  }))

  const navBtn: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent',
    color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, transition: 'color .15s, background .15s',
  }
  const navIn  = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }
  const navOut = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.color = '#666'; e.currentTarget.style.background = 'transparent' }

  // KPI 카드
  const KpiCard = ({ grad, bd, glow, iconBg, iconColor, icon, label, value, valColor, unit, sub, bar }: {
    grad: string; bd: string; glow: string; iconBg: string; iconColor: string; icon: string
    label: string; value: string; valColor: string; unit?: string; sub: string; bar?: number
  }) => (
    <div style={{ flex: 1, background: grad, border: bd, borderRadius: 10, padding: 16, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -15, right: -15, width: 70, height: 70, background: glow, pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, marginBottom: 10 }}>{icon}</div>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 600, fontFamily: 'ui-monospace, monospace', color: valColor, lineHeight: 1 }}>
          {value}{unit && <span style={{ fontSize: 14, color: '#555', marginLeft: 2 }}>{unit}</span>}
        </div>
        <div style={{ fontSize: 10, color: '#555', marginTop: 6 }}>{sub}</div>
        {bar != null && (
          <div style={{ height: 3, background: 'rgba(245,166,35,0.15)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(bar, 100)}%`, background: 'linear-gradient(90deg, #F5A623, #ffcc66)', borderRadius: 2 }} />
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 760, maxWidth: '94vw', maxHeight: '88vh', background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* 헤더 */}
        <div style={{ padding: '14px 18px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button style={navBtn} onMouseEnter={navIn} onMouseLeave={navOut} onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>
                <span style={{ color: '#00E5A0' }}>{monthLabel}</span> · Pick-up Required
              </span>
              <button style={navBtn} onMouseEnter={navIn} onMouseLeave={navOut} onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
          </div>
          <div style={{ fontSize: 12, color: '#777', marginTop: 6 }}>
            Shows how many more rooms need to be sold to meet FCST · FCST {fcstDate || '-'} basis
          </div>
        </div>

        {/* 본문 2열 */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          {/* 좌측 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            {/* KPI 3카드 */}
            <div style={{ display: 'flex', gap: 10, padding: '14px 16px 4px', flexShrink: 0 }}>
              <KpiCard
                grad="linear-gradient(135deg, #0d1f18 0%, #111c16 60%, #0a1510 100%)"
                bd="0.5px solid rgba(0,229,160,0.2)"
                glow="radial-gradient(circle, rgba(0,229,160,0.12) 0%, transparent 70%)"
                iconBg="rgba(0,229,160,0.12)" iconColor="#00E5A0" icon="🏨"
                label="Rooms Still Needed" value={totalNeed.toLocaleString()} valColor="#00E5A0" unit="rms"
                sub={`${monthLabel} total · remaining vs FCST`}
              />
              <KpiCard
                grad="linear-gradient(135deg, #1a1608 0%, #1c1a0e 60%, #141208 100%)"
                bd="0.5px solid rgba(245,166,35,0.2)"
                glow="radial-gradient(circle, rgba(245,166,35,0.12) 0%, transparent 70%)"
                iconBg="rgba(245,166,35,0.12)" iconColor="#F5A623" icon="📈"
                label="Fill Rate So Far" value={`${filledPct}%`} valColor="#F5A623"
                sub={`${Math.round(totalOtb).toLocaleString()} sold of ${Math.round(totalFcst).toLocaleString()} FCST`}
                bar={filledPct}
              />
              <KpiCard
                grad="linear-gradient(135deg, #0d1420 0%, #111826 60%, #0a1020 100%)"
                bd="0.5px solid rgba(91,141,239,0.2)"
                glow="radial-gradient(circle, rgba(91,141,239,0.12) 0%, transparent 70%)"
                iconBg="rgba(91,141,239,0.12)" iconColor="#5B8DEF" icon="📅"
                label="Avg Daily Need" value={`${avgPerDay}`} valColor="#5B8DEF" unit="rms/day"
                sub={`based on ${remainDays} days remaining`}
              />
            </div>

            {/* Most Urgent Dates */}
            {urgent.length > 0 && (
              <div style={{ padding: '10px 16px 4px', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ color: '#E24B4A' }}>⚠</span>
                  <span style={{ color: '#ccc' }}>Most Urgent Dates</span>
                  <span>— rooms still largely unfilled</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {urgent.map((r, i) => (
                    <div key={r.day} style={{ background: 'linear-gradient(135deg, #1a1010 0%, #150d0d 100%)', border: '0.5px solid rgba(226,75,74,0.2)', borderRadius: 8, padding: '11px 13px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: -20, right: -20, width: 70, height: 70, background: 'radial-gradient(circle, rgba(226,75,74,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
                      <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 9, fontWeight: 700, color: '#E24B4A', opacity: 0.5, fontFamily: 'monospace' }}>#{i + 1}</span>
                      <div style={{ position: 'relative' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{MON_EN[m - 1]} {r.day} <span style={{ color: '#666', fontWeight: 400 }}>({DAY_EN[r.dow]})</span></div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#E24B4A', fontFamily: 'ui-monospace, monospace', margin: '3px 0 2px' }}>+{r.need} rms</div>
                        <div style={{ fontSize: 10, color: '#666' }}>{r.pct}% filled · {r.otb}/{r.fcst} rms</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 날짜별 리스트 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 14px', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0 6px', fontSize: 10, color: '#666', borderBottom: '0.5px solid rgba(255,255,255,0.06)', marginBottom: 4 }}>
                <span style={{ width: 72, flexShrink: 0 }}>Date</span>
                <span style={{ flex: 1 }}>Fill Progress (OTB / FCST)</span>
                <span style={{ width: 80, textAlign: 'right', flexShrink: 0 }}>Still Needed</span>
              </div>
              {loading ? (
                <div style={{ fontSize: 12, color: '#666', textAlign: 'center', padding: '28px 0' }}>Loading...</div>
              ) : rows.length === 0 ? (
                <div style={{ fontSize: 12, color: '#666', textAlign: 'center', padding: '28px 0' }}>No forecast data available for this month.</div>
              ) : rows.map(r => {
                const dayOfWeek = DAY_EN[r.dow]
                const pct = r.pct
                const barColor = pct >= 100 ? '#00E5A0' : pct >= 80 ? '#4caf82' : pct >= 60 ? '#F5A623' : '#E24B4A'
                const needColor = r.need > 0 ? (pct < 60 ? '#E24B4A' : pct < 80 ? '#F5A623' : '#8a8f98') : '#4a4a4a'
                const wc = dayOfWeek === 'Sat' ? '#5B8DEF' : dayOfWeek === 'Sun' ? '#E24B4A' : '#ccc'
                return (
                  <div key={r.day} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ width: 72, fontSize: 12, color: wc, flexShrink: 0 }}>
                      {MON_EN[m - 1]} {r.day} <span style={{ color: '#666', fontSize: 11 }}>({dayOfWeek})</span>
                    </span>
                    <div style={{ flex: 1, height: 16, background: '#20242a', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: barColor, opacity: 0.75, borderRadius: 4 }} />
                      <span style={{ position: 'absolute', left: 7, top: 0, bottom: 0, display: 'flex', alignItems: 'center', fontSize: 10, color: 'rgba(255,255,255,0.9)', fontFamily: 'ui-monospace, monospace' }}>
                        {r.otb} / {r.fcst} rms
                      </span>
                    </div>
                    <span style={{ width: 80, textAlign: 'right', fontSize: 12, fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: needColor, flexShrink: 0 }}>
                      {r.need > 0 ? `+${r.need} rms` : 'Done ✓'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 우측 — Segment Remaining */}
          <div style={{ width: 160, flexShrink: 0, borderLeft: '0.5px solid rgba(255,255,255,0.07)', padding: '14px 12px', overflowY: 'auto' }}>
            <div style={{ fontSize: 9, color: '#666', letterSpacing: '.08em', marginBottom: 8 }}>SEGMENT REMAINING</div>
            {segNeed.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: 11, color: s.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: s.need > 0 ? '#E24B4A' : '#4a4a4a', flexShrink: 0, marginLeft: 6 }}>
                  {s.need > 0 ? `+${s.need}` : '✓'}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '0.5px solid rgba(255,255,255,0.07)', marginTop: 6, paddingTop: 6 }}>
              <span style={{ fontSize: 11, color: '#888' }}>Total</span>
              <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: '#00E5A0' }}>+{totalNeed.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
