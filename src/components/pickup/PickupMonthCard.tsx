'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useForecastMonthly } from '@/hooks/useForecastMonthly'
import { useBudgetMonthly } from '@/hooks/useBudgetMonthly'
import type { PickupRow } from '@/hooks/usePickupData'
import type { LyPacingRow } from '@/hooks/useLyPacing'
import LyComparisonSegModal from '@/components/dashboard/LyComparisonSegModal'
import LyComparisonAccountModal from '@/components/dashboard/LyComparisonAccountModal'
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

// 전년비 뱃지 (대시보드 ChangeTag 복제)
function ChangeTag({ value, unit, onClick }: { value: number; unit: string; onClick?: () => void }) {
  const pos = value >= 0
  const inner = (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[12px] font-semibold leading-none ${pos ? 'text-status-positive' : 'text-status-negative'}`}
      style={{ background: pos ? 'var(--accent-badge-bg)' : 'var(--negative-bg)', border: `1px solid ${pos ? 'var(--accent-badge-border)' : 'var(--negative-border)'}` }}
    >
      {pos ? '▲' : '▼'}&nbsp;{Math.abs(value)}{unit}
    </span>
  )
  if (!onClick) return inner
  return (
    <button
      onClick={onClick} title="전년 비교 보기"
      style={{ background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer', borderRadius: 4, transition: 'background 0.15s', display: 'inline-flex' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-elevated)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {inner}
    </button>
  )
}

// 전년 동일자 영역 (세로: 라벨 / 뱃지 / FIT·GRP 항상 표시)
function LyCell({ modeNode, varValue, unit, fitPct, grpPct, tooltip, onOpen }: {
  modeNode: React.ReactNode; varValue: number | null; unit: string; fitPct?: number | null; grpPct?: number | null
  tooltip: boolean; onOpen: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, cursor: 'pointer', position: 'relative', flexShrink: 0 }}
      onClick={onOpen}>
      {modeNode}
      {varValue !== null
        ? <ChangeTag value={varValue} unit={unit} />
        : <span className="text-[11px] text-brand-dimmed">-</span>}
      {tooltip && fitPct != null && grpPct != null && (
        <div style={{ display: 'flex', gap: 6, fontSize: 10 }}>
          <span style={{ color: fitPct >= 0 ? '#00B883' : '#E24B4A' }}>FIT {fitPct >= 0 ? '▲' : '▼'}{Math.abs(Math.round(fitPct))}%</span>
          <span style={{ color: grpPct >= 0 ? '#00B883' : '#E24B4A' }}>GRP {grpPct >= 0 ? '▲' : '▼'}{Math.abs(Math.round(grpPct))}%</span>
        </div>
      )}
    </div>
  )
}

const rowStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: COL_BT }
const rowFlex: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }
const bigLabel: React.CSSProperties = { fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1, marginBottom: 4 }
const rnMuted: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-secondary)' }
const rnStrike: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-secondary)' }
const vsGroup: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 }
const vsStrike: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }
const arrowStyle: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-secondary)' }
const otbVal: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#00E5A0' }

// ─── PickupMonthCard ─────────────────────────────────────────────────────────────
export default function PickupMonthCard({
  year, month, hotelId, roomCount, fcstDate, budgetDate,
  pickupRows, lyDjRows, lyDgRows, onExpand,
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

    // 전년비 통계 (대시보드 getMonthLyStats 복제) — v1=동일자 / v2=동기간
    const lyStatsFor = (rows: LyPacingRow[]) => {
      const md = rows.filter(x => inMonth(x.business_date, year, month1) && x.segmentation !== 'HOU')
      const oN = md.reduce((s, r) => s + (r.otb_nights ?? 0), 0)
      const lN = md.reduce((s, r) => s + (r.ly_nights ?? 0), 0)
      const oR = md.reduce((s, r) => s + (r.otb_revenue ?? 0), 0)
      const lR = md.reduce((s, r) => s + (r.ly_revenue ?? 0), 0)
      const grpVar = (g: string) => {
        const gd = md.filter(r => r.sorting2 === g)
        const goN = gd.reduce((s, r) => s + (r.otb_nights ?? 0), 0)
        const glN = gd.reduce((s, r) => s + (r.ly_nights ?? 0), 0)
        return glN > 0 ? ((goN - glN) / glN) * 100 : null
      }
      return {
        varNightsPct:  lN > 0 ? ((oN - lN) / lN) * 100 : null,
        varRevenuePct: lR > 0 ? ((oR - lR) / lR) * 100 : null,
        varAdr:        (oN > 0 ? oR / oN : 0) - (lN > 0 ? lR / lN : 0),
        fitPct:        grpVar('fit'),
        grpPct:        grpVar('group'),
      }
    }

    return {
      hasData: pm.length > 0,
      otbN, otbOcc: occ(otbN), otbAdr: adr(otbR, otbN), otbRev: otbR,
      vsN, vsOcc: occ(vsN), vsRev: vsR, vsAdr: adr(vsR, vsN),
      puN, puR, puOccPp: occ(puN),
      lyV1: lyStatsFor(lyDjRows), lyV2: lyStatsFor(lyDgRows),
      lyDj: aggLy(lyDjRows),
      fcst: sumMonthly(forecastRows, 'forecast_nights', 'forecast_revenue'),
      bud:  sumMonthly(budgetRows, 'budget_nights', 'budget_revenue'),
      daily,
    }
  }, [pickupRows, lyDjRows, lyDgRows, forecastRows, budgetRows, roomCount, year, month, month1])

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

  // ── 전년 동일자 모달/토글 ──────────────────────────────────────────────────────
  const [lyMode, setLyMode] = useState<'v1' | 'v2'>('v1')
  const [lySegOpen, setLySegOpen] = useState(false)
  const [lyAcc, setLyAcc] = useState<{ open: boolean; filterSegCodes?: string[]; filterLabel?: string }>({ open: false })
  const monthKey = `${year}-${String(month1).padStart(2, '0')}`
  const ly = lyMode === 'v1' ? m.lyV1 : m.lyV2
  const modeToggle = (
    <span
      onClick={e => { e.stopPropagation(); setLyMode(p => (p === 'v1' ? 'v2' : 'v1')) }}
      className="text-[9px] cursor-pointer"
      style={{ color: 'rgba(255,255,255,0.4)', borderBottom: '1px dashed rgba(255,255,255,0.3)' }}
    >
      {lyMode === 'v1' ? '전년 동일자 ⇅' : '전년 동기간 ⇅'}
    </span>
  )
  const modeStatic = (
    <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
      {lyMode === 'v1' ? '전년 동일자' : '전년 동기간'}
    </span>
  )

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

      {/* ── Pick-up 요약 (강조: 민트 배경 + 좌측 3px 라인) ── */}
      <div style={{ padding: '12px 14px', borderBottom: COL_BT, background: 'rgba(0,229,160,0.07)', borderLeft: '3px solid #00E5A0' }}>
        <div style={{ fontSize: 10, fontWeight: 500, color: '#00B883', marginBottom: 6, textAlign: 'center' }}>Pick-up</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 22, fontWeight: 500, color: m.puOccPp >= 0 ? '#00B883' : '#E24B4A' }}>
            {m.puOccPp >= 0 ? '+' : ''}{m.puOccPp.toFixed(1)}%{m.puOccPp >= 0 ? '↑' : '↓'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-border-default)' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>ADR</span>
            <span style={{ fontSize: 15, fontWeight: 500, color: adrDelta >= 0 ? '#00B883' : '#E24B4A' }}>
              {adrDelta >= 0 ? '+' : ''}{Math.round(adrDelta / 1000)}k
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-border-default)' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>REV</span>
            <span style={{ fontSize: 15, fontWeight: 500, color: m.puR >= 0 ? '#00B883' : '#E24B4A' }}>
              {m.puR >= 0 ? '+' : ''}{fmtM(m.puR)}
            </span>
          </div>
        </div>
      </div>

      {/* ── OCC 행 ── */}
      <div style={rowStyle}>
        <div style={rowFlex}>
          <div>
            <div style={bigLabel}>OCC</div>
            <div style={vsGroup}>
              {m.vsN > 0 && <span style={vsStrike}>{m.vsOcc.toFixed(1)}%</span>}
              {m.vsN > 0 && <span style={arrowStyle}>→</span>}
              <span style={otbVal}>{m.otbOcc.toFixed(1)}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              {m.vsN > 0 && <span style={rnStrike}>{m.vsN.toLocaleString('ko-KR')} R/N</span>}
              {m.vsN > 0 && <span style={rnMuted}>→</span>}
              <span style={rnMuted}>{m.otbN.toLocaleString('ko-KR')} R/N</span>
            </div>
          </div>
          <LyCell modeNode={modeToggle} varValue={ly.varNightsPct != null ? Math.round(ly.varNightsPct * 10) / 10 : null} unit="%" tooltip fitPct={ly.fitPct} grpPct={ly.grpPct}
            onOpen={() => setLySegOpen(true)} />
        </div>
      </div>

      {/* ── ADR 행 ── */}
      <div style={rowStyle}>
        <div style={rowFlex}>
          <div>
            <div style={bigLabel}>ADR</div>
            <div style={vsGroup}>
              {m.vsAdr > 0 && <span style={vsStrike}>{fmtK(m.vsAdr)}</span>}
              {m.vsAdr > 0 && <span style={arrowStyle}>→</span>}
              <span style={otbVal}>{fmtK(m.otbAdr)}</span>
            </div>
          </div>
          <LyCell modeNode={modeStatic} varValue={ly.varAdr != null ? Math.round(ly.varAdr / 1000) : null} unit="k" tooltip={false}
            onOpen={() => setLySegOpen(true)} />
        </div>
      </div>

      {/* ── REV 행 ── */}
      <div style={rowStyle}>
        <div style={rowFlex}>
          <div>
            <div style={bigLabel}>REV</div>
            <div style={vsGroup}>
              {m.vsRev > 0 && <span style={vsStrike}>{fmtM(m.vsRev)}</span>}
              {m.vsRev > 0 && <span style={arrowStyle}>→</span>}
              <span style={otbVal}>{fmtM(m.otbRev)}</span>
            </div>
          </div>
          <LyCell modeNode={modeStatic} varValue={ly.varRevenuePct != null ? Math.round(ly.varRevenuePct * 10) / 10 : null} unit="%" tooltip fitPct={ly.fitPct} grpPct={ly.grpPct}
            onOpen={() => setLySegOpen(true)} />
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

      {/* ── 전년 동일자 모달 (대시보드 그대로 재사용) ── */}
      <LyComparisonSegModal
        open={lySegOpen}
        onClose={() => setLySegOpen(false)}
        roomCount={roomCount}
        initialMonthKey={monthKey}
        onAccountDrillDown={(segCodes, _mk, label) => {
          setLySegOpen(false)
          setLyAcc({ open: true, filterSegCodes: segCodes, filterLabel: label })
        }}
      />
      <LyComparisonAccountModal
        open={lyAcc.open}
        onClose={() => setLyAcc({ open: false })}
        roomCount={roomCount}
        initialMonthKey={monthKey}
        initialFilterSegCodes={lyAcc.filterSegCodes}
        initialFilterLabel={lyAcc.filterLabel}
        onBackToSeg={lyAcc.filterSegCodes ? () => { setLyAcc({ open: false }); setLySegOpen(true) } : undefined}
      />
    </div>
  )
}
