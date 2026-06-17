'use client'

import { useEffect, useMemo, useRef } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { useForecastMonthly } from '@/hooks/useForecastMonthly'
import { useBudgetMonthly } from '@/hooks/useBudgetMonthly'
import type { PickupRow } from '@/hooks/usePickupData'
import type { LyPacingRow } from '@/hooks/useLyPacing'
import { lastDayOfMonth, inMonth, fmtK, fmtM, type PickupDaily } from '@/utils/pickupPageUtils'

const SPARK_MINT    = 'rgba(0,229,160,0.28)'
const SPARK_MINT_WK = 'rgba(0,229,160,0.65)'
const BLUE          = '#60A5FA'
const COL_BT        = '0.5px solid var(--color-border-tertiary)'

// ─── Forecasting 헬퍼 (MonthCard 동일 스타일 복제) ──────────────────────────────
function fmtFcOcc(n: number | null): string { return n == null ? '-' : `${n.toFixed(1)}%` }
function fmtFcAdr(n: number | null): string { return n == null ? '-' : `${Math.round(n / 1000)}k` }
function fmtFcRevenue(n: number | null): string { return n == null ? '-' : `${(n / 1_000_000).toFixed(1)}M` }
function fmtFcPct(n: number | null): string { return n == null ? '-' : `${n.toFixed(1)}%` }
function getAchievementColor(pct: number | null): string {
  if (pct === null) return 'var(--brand-dimmed)'
  if (pct >= 100) return 'var(--color-positive)'
  if (pct >= 95)  return '#ffc857'
  return 'var(--color-negative)'
}

const rowStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr',
  alignItems: 'flex-start', padding: '12px 16px', borderBottom: COL_BT, gap: 8,
}
const puLabel: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }
const otbLabel: React.CSSProperties = { fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 4 }
const otbBig: React.CSSProperties = { fontSize: 22, fontWeight: 500, color: '#00E5A0', lineHeight: 1.1 }
const sub: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-secondary)' }

// ─── PickupMonthCard ─────────────────────────────────────────────────────────────
export default function PickupMonthCard({
  year, month, hotelId, roomCount, fcstDate, budgetDate,
  pickupRows, lyDjRows, onExpand,
}: {
  year:       number
  month:      number   // 0-based
  label:      string
  hotelId?:   string
  roomCount:  number
  fcstDate:   string | null
  budgetDate: string | null
  pickupRows: PickupRow[]
  lyDjRows:   LyPacingRow[]   // 전년 동일자 (v1)
  lyDgRows:   LyPacingRow[]   // 전년 동기간 (v2) — 현재 레이아웃 미사용(인터페이스 유지)
  onExpand:   (daily: PickupDaily[]) => void
}) {
  const month1 = month + 1
  const { data: forecastRows = [] } = useForecastMonthly({ hotelId, year, updateDate: fcstDate })
  const { data: budgetRows = [] }   = useBudgetMonthly({ hotelId, year, updateDate: budgetDate })

  const m = useMemo(() => {
    const days = lastDayOfMonth(year, month1)
    const cap  = roomCount * days
    const occ = (n: number) => (cap > 0 ? (n / cap) * 100 : 0)
    const adr = (rev: number, n: number) => (n > 0 ? rev / n : 0)

    const pm = pickupRows.filter(r => inMonth(r.business_date, year, month1))
    let otbN = 0, otbR = 0, vsN = 0, vsR = 0, puN = 0, puR = 0
    for (const r of pm) {
      if (r.segmentation !== 'HOU') { otbN += r.otb_nights ?? 0; vsN += r.vs_otb_nights ?? 0; puN += r.pu_nights ?? 0 }
      otbR += r.otb_revenue ?? 0; vsR += r.vs_otb_revenue ?? 0; puR += r.pu_revenue ?? 0
    }
    const aggLy = (rows: LyPacingRow[]) => {
      let n = 0, rev = 0
      for (const r of rows.filter(x => inMonth(x.business_date, year, month1))) {
        if (r.segmentation === 'HOU') continue
        n += r.ly_nights ?? 0; rev += r.ly_revenue ?? 0
      }
      return { occ: occ(n), adr: adr(rev, n), rev, n }
    }
    const sumMonthly = (rows: any[], nk: string, rk: string) => {
      let n = 0, rev = 0
      for (const r of rows) if (r.month_num === month1) { n += r[nk] ?? 0; rev += r[rk] ?? 0 }
      return { occ: occ(n), adr: adr(rev, n), rev, has: n > 0 || rev > 0 }
    }

    // 일자별
    const byDate = new Map<string, { otbN: number; puN: number }>()
    for (const r of pm) {
      if (r.segmentation === 'HOU') continue
      const a = byDate.get(r.business_date) ?? { otbN: 0, puN: 0 }
      a.otbN += r.otb_nights ?? 0; a.puN += r.pu_nights ?? 0
      byDate.set(r.business_date, a)
    }
    const lyByDate = new Map<string, number>()
    for (const r of lyDjRows.filter(x => inMonth(x.business_date, year, month1))) {
      if (r.segmentation === 'HOU') continue
      lyByDate.set(r.business_date, (lyByDate.get(r.business_date) ?? 0) + (r.ly_nights ?? 0))
    }
    const daily: PickupDaily[] = []
    for (let day = 1; day <= days; day++) {
      const dateStr = `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dow = new Date(year, month, day).getDay()
      const a = byDate.get(dateStr) ?? { otbN: 0, puN: 0 }
      const dOcc = roomCount > 0 ? (a.otbN / roomCount) * 100 : 0
      const dLy  = roomCount > 0 ? ((lyByDate.get(dateStr) ?? 0) / roomCount) * 100 : 0
      daily.push({
        day, dateStr, dow, isWeekend: dow === 0 || dow === 6,
        otbOcc: Math.round(dOcc * 10) / 10, puNights: a.puN,
        lyOcc: Math.round(dLy * 10) / 10, diffPp: Math.round((dOcc - dLy) * 10) / 10,
      })
    }

    return {
      otbN, otbOcc: occ(otbN), otbAdr: adr(otbR, otbN), otbRev: otbR,
      puN, puR, puOccPp: occ(puN), vsAdr: adr(vsR, vsN),
      lyDj: aggLy(lyDjRows),
      fcst: sumMonthly(forecastRows, 'forecast_nights', 'forecast_revenue'),
      bud:  sumMonthly(budgetRows, 'budget_nights', 'budget_revenue'),
      daily,
    }
  }, [pickupRows, lyDjRows, forecastRows, budgetRows, roomCount, year, month, month1])

  // ── 스파크라인 (Chart.js) ──────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (cancelled || !canvasRef.current) return
      chartRef.current?.destroy()
      chartRef.current = new Chart(canvasRef.current, {
        data: {
          labels: m.daily.map(d => d.day),
          datasets: [
            { type: 'bar', data: m.daily.map(d => d.otbOcc), backgroundColor: m.daily.map(d => (d.isWeekend ? SPARK_MINT_WK : SPARK_MINT)), yAxisID: 'yL', barPercentage: 0.9, categoryPercentage: 0.9 },
            { type: 'line', data: m.daily.map(d => d.puNights), borderColor: BLUE, borderWidth: 1.5, pointRadius: 0, tension: 0.4, yAxisID: 'yR' },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, yL: { display: false, min: 0, max: 110 }, yR: { display: false } },
        },
      })
    })()
    return () => { cancelled = true; chartRef.current?.destroy(); chartRef.current = null }
  }, [m.daily])

  // ── 파생값 ───────────────────────────────────────────────────────────────────
  const adrDelta = m.otbAdr - m.vsAdr

  const achOcc = m.fcst.occ > 0 ? (m.otbOcc / m.fcst.occ) * 100 : null
  const achAdr = m.fcst.adr > 0 ? (m.otbAdr / m.fcst.adr) * 100 : null
  const achRev = m.fcst.rev > 0 ? (m.otbRev / m.fcst.rev) * 100 : null

  const fcCell = (color: string): React.CSSProperties => ({ fontSize: 14, fontWeight: 600, color, textAlign: 'right' })
  const borderTop = '1px solid var(--color-border-default)'

  return (
    <div className="flex flex-col rounded-2xl bg-bg-surface overflow-hidden" style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}>
      {/* ── Month header ── */}
      <div className="relative px-5 pt-5 pb-2 overflow-hidden" style={{ background: 'var(--card-header-bg)' }}>
        <div className="pointer-events-none absolute -top-6 -left-6 w-28 h-28 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, var(--card-header-glow-color) 0%, transparent 70%)' }} />
        <div className="relative flex items-end gap-1.5">
          <span className="font-bold leading-none" style={{ fontSize: 54, color: 'var(--color-text-primary)' }}>{month1}</span>
          <span className="text-lg font-medium text-brand-muted mb-1.5">월</span>
          <span className="text-xs font-medium text-brand-dimmed mb-2 ml-0.5">{year}</span>
        </div>
      </div>

      {/* ── OCC 행 ── */}
      <div style={rowStyle}>
        <div>
          <div style={puLabel}>Pick-Up</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 2 }}>
            {m.puOccPp >= 0 ? '+' : ''}{m.puOccPp.toFixed(1)}%
          </div>
          <div style={sub}>{m.puN.toLocaleString('ko-KR')} nights</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={otbLabel}>OCC</div>
          <div style={otbBig}>{m.otbOcc.toFixed(1)}%</div>
          <div style={{ ...sub, marginTop: 3 }}>{m.otbN.toLocaleString('ko-KR')} nights</div>
        </div>
      </div>

      {/* ── ADR 행 ── */}
      <div style={rowStyle}>
        <div>
          <div style={puLabel}>ADR</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {m.vsAdr > 0
              ? `${fmtK(m.vsAdr)} → ${fmtK(m.otbAdr)}(${adrDelta >= 0 ? '+' : ''}${Math.round(adrDelta / 1000)}K${adrDelta >= 0 ? '↑' : '↓'})`
              : `${adrDelta >= 0 ? '+' : ''}${fmtK(adrDelta)}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={otbLabel}>ADR</div>
          <div style={otbBig}>{fmtK(m.otbAdr)}</div>
        </div>
      </div>

      {/* ── REV 행 ── */}
      <div style={rowStyle}>
        <div>
          <div style={puLabel}>REV</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {m.puR === 0 ? '—' : `${m.puR >= 0 ? '+' : ''}${fmtM(m.puR)} ${m.puR >= 0 ? '↑' : '↓'}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={otbLabel}>REV</div>
          <div style={otbBig}>{fmtM(m.otbRev)}</div>
        </div>
      </div>

      {/* ── Forecasting (FCST / BUDGET / 달성=OTB÷FCST) ── */}
      <div className="mx-4 mt-2 rounded-xl p-3.5" style={{ background: 'var(--forecast-bg)', border: '1px solid var(--forecast-border)' }}>
        <div style={{ fontSize: 10, letterSpacing: '1.5px', fontWeight: 500, color: 'var(--color-accent-primary)', marginBottom: 10, textTransform: 'uppercase' }}>Forecasting</div>
        <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr 1fr 1fr', gap: '8px 10px', alignItems: 'center' }}>
          <div />
          {['OCC', 'ADR', 'REV'].map(h => (
            <div key={h} style={{ fontSize: 9, color: 'var(--brand-dimmed)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</div>
          ))}
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--brand-dimmed)' }}>FCST</div>
          <div className="font-mono" style={fcCell('var(--color-accent-primary)')}>{fmtFcOcc(m.fcst.has ? m.fcst.occ : null)}</div>
          <div className="font-mono" style={fcCell('var(--color-accent-primary)')}>{fmtFcAdr(m.fcst.has ? m.fcst.adr : null)}</div>
          <div className="font-mono" style={fcCell('var(--color-accent-primary)')}>{fmtFcRevenue(m.fcst.has ? m.fcst.rev : null)}</div>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--brand-dimmed)' }}>BUDGET</div>
          <div className="font-mono" style={fcCell('var(--color-text-secondary)')}>{fmtFcOcc(m.bud.has ? m.bud.occ : null)}</div>
          <div className="font-mono" style={fcCell('var(--color-text-secondary)')}>{fmtFcAdr(m.bud.has ? m.bud.adr : null)}</div>
          <div className="font-mono" style={fcCell('var(--color-text-secondary)')}>{fmtFcRevenue(m.bud.has ? m.bud.rev : null)}</div>
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--brand-dimmed)', borderTop, paddingTop: 7 }}>달성</div>
          <div className="font-mono" style={{ ...fcCell(getAchievementColor(achOcc)), fontSize: 12, borderTop, paddingTop: 7 }}>{fmtFcPct(achOcc)}</div>
          <div className="font-mono" style={{ ...fcCell(getAchievementColor(achAdr)), fontSize: 12, borderTop, paddingTop: 7 }}>{fmtFcPct(achAdr)}</div>
          <div className="font-mono" style={{ ...fcCell(getAchievementColor(achRev)), fontSize: 12, borderTop, paddingTop: 7 }}>{fmtFcPct(achRev)}</div>
        </div>
      </div>

      {/* ── P/U pill ── */}
      <div className="px-4 pb-4" style={{ marginTop: 14 }}>
        <button
          className="w-full flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[12px] font-bold transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
          style={{ background: 'var(--gradient-cta)', boxShadow: 'var(--accent-btn-glow)', color: '#0A0A0A' }}
        >
          {m.puN >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          P/U {m.puN >= 0 ? '+' : ''}{m.puN} rooms
        </button>
      </div>

      {/* ── RM Action ── */}
      <div className="bg-bg-secondary px-4 py-3 flex items-center gap-2.5" style={{ borderTop: '1px solid var(--divider-color)' }}>
        <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--rm-icon-bg)', border: '1px solid var(--rm-icon-border)' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="var(--rm-icon-stroke)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-accent-primary leading-none mb-0.5">RM 액션</p>
          <p className="text-[10px] text-brand-dimmed truncate">RM 액션 데이터가 준비되지 않았습니다.</p>
        </div>
      </div>

      {/* ── 픽업 추이 (Pick-up 전용) ── */}
      <div style={{ padding: '8px 16px 10px', borderTop: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }} onClick={() => onExpand(m.daily)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>픽업 추이</span>
          <span style={{ fontSize: 9, color: 'var(--color-text-secondary)', opacity: 0.7 }}>클릭해서 확대</span>
        </div>
        <div style={{ position: 'relative', width: '100%', height: 68 }}>
          <canvas ref={canvasRef} role="img" aria-label={`${month1}월 픽업 추이`} />
        </div>
      </div>
    </div>
  )
}
