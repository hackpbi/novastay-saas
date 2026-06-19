'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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

// ─── 이벤트 (c06_calendar) ──────────────────────────────────────────────────────
type CalendarRow = { date: string; event: string; is_holiday: boolean }
type EventGroup = { name: string; parenText: string; isHoliday: boolean; days: CalendarRow[] }
type DayAgg = Record<string, { otbN: number; vsN: number; otbR: number; vsR: number }>

// 괄호 () 안 텍스트 추출 (없으면 null)
function extractParenText(event: string): string | null {
  const m = event.match(/\(([^)]+)\)/)
  return m ? m[1].trim() : null
}

// 연속 날짜를 하나의 이벤트 그룹으로 묶기 (괄호 텍스트 있는 행만 대상)
function groupConsecutiveEvents(rows: CalendarRow[]): EventGroup[] {
  if (!rows.length) return []
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const groups: EventGroup[] = []
  let cur: EventGroup | null = null
  for (const row of sorted) {
    const paren = extractParenText(row.event)!
    const baseName = row.event.replace(/\s*\([^)]*\)/, '').trim() || paren
    if (!cur) {
      cur = { name: baseName, parenText: paren, isHoliday: row.is_holiday, days: [row] }
    } else {
      const prev = new Date(cur.days[cur.days.length - 1].date)
      const curr = new Date(row.date)
      const diff = (curr.getTime() - prev.getTime()) / 86400000
      if (diff <= 1) cur.days.push(row)
      else { groups.push(cur); cur = { name: baseName, parenText: paren, isHoliday: row.is_holiday, days: [row] } }
    }
  }
  if (cur) groups.push(cur)
  return groups
}

const HOLI_POS: React.CSSProperties = { color: '#00B883', fontWeight: 500 }
const HOLI_NEG: React.CSSProperties = { color: '#E24B4A', fontWeight: 500 }
const HOLI_GRAY: React.CSSProperties = { color: 'var(--color-text-secondary)' }
const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']

// 픽업 R/N 을 막대 위 숫자 + 위쪽 점선으로 그리는 커스텀 플러그인 (label==='pickup' 데이터셋만)
let circlePluginRegistered = false
const circlePlugin = {
  id: 'circleLabels',
  afterDraw(chart: any) {
    const { ctx, data } = chart
    const dsIdx = data.datasets.findIndex((d: any) => d.label === 'pickup')
    if (dsIdx < 0) return
    const ds = data.datasets[dsIdx]
    const meta = chart.getDatasetMeta(dsIdx)
    const barDsIdx = data.datasets.findIndex((d: any) => d.label === 'OCC%')
    const barMeta = barDsIdx >= 0 ? chart.getDatasetMeta(barDsIdx) : null
    meta.data.forEach((point: any, i: number) => {
      const raw = ds.data[i]
      const val = raw && typeof raw === 'object' ? raw.y : raw
      if (val == null || val === 0) return   // 0 이면 숫자·점선 모두 생략
      const x = point.x
      const barTop = barMeta?.data[i]?.y ?? point.y
      // 점선 (숫자 아래 → 막대 상단 위)
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(96,165,250,0.45)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, barTop - 18); ctx.lineTo(x, barTop - 2); ctx.stroke(); ctx.restore()
      // 막대 위 숫자 (원 없이)
      ctx.save(); ctx.font = '600 10px -apple-system, sans-serif'; ctx.fillStyle = '#60A5FA'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${val >= 0 ? '+' : ''}${val}`, x, barTop - 10); ctx.restore()
    })
  },
}

// 이벤트 뱃지 + 호버 툴팁 (기간 픽업 R/N, 일자별 OTB/픽업 OCC·ADR·REV)
function EventBadge({ group, dayAgg, totalRooms }: { group: EventGroup; dayAgg: DayAgg; totalRooms: number }) {
  const [hovered, setHovered] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)

  // 호버 시 미니차트 (막대 OCC% + 픽업 R/N 동그라미)
  useEffect(() => {
    if (!hovered) return
    let cancelled = false
    ;(async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (!circlePluginRegistered) { Chart.register(circlePlugin); circlePluginRegistered = true }
      if (cancelled || !canvasRef.current) return
      chartRef.current?.destroy()
      const labels = group.days.map(day => { const dd = new Date(day.date); return `${dd.getMonth() + 1}/${dd.getDate()}` })
      const occArr = group.days.map(day => { const a = dayAgg[day.date]; return a && totalRooms ? Math.round((a.otbN / totalRooms) * 1000) / 10 : null })
      const puArr  = group.days.map(day => { const a = dayAgg[day.date]; return a ? a.otbN - a.vsN : null })
      const maxPu  = Math.max(0, ...puArr.filter((v): v is number => v != null))
      const gc = 'rgba(255,255,255,0.06)', tc = 'rgba(255,255,255,0.5)'
      chartRef.current = new Chart(canvasRef.current, {
        data: {
          labels,
          datasets: [
            { type: 'bar', label: 'OCC%', data: occArr, backgroundColor: 'rgba(0,229,160,0.38)', borderColor: 'rgba(0,229,160,0.6)', borderWidth: 1, yAxisID: 'yL', order: 2, barPercentage: labels.length === 1 ? 0.2 : 0.5 },
            { type: 'scatter', label: 'pickup', data: puArr.map((v, i) => ({ x: labels[i], y: v })), pointRadius: 0, showLine: false, yAxisID: 'yR', order: 1 } as any,
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x:  { type: 'category', grid: { color: gc }, ticks: { color: tc, font: { size: 10 } } },
            yL: { position: 'left', min: 0, max: 100, grid: { color: gc }, ticks: { color: tc, font: { size: 10 }, stepSize: 25, callback: (v: any) => v + '%' } },
            yR: { position: 'right', min: -2, max: maxPu + 8, grid: { display: false }, ticks: { display: false } },
          },
        },
      })
    })()
    return () => { cancelled = true; chartRef.current?.destroy(); chartRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered])

  const start = group.days[0].date
  const end   = group.days[group.days.length - 1].date
  const isSingle = group.days.length === 1
  const mm = new Date(start).getMonth() + 1
  const d1 = new Date(start).getDate()
  const d2 = new Date(end).getDate()
  const dateLabel = isSingle ? `${mm}/${d1}` : `${mm}/${d1}~${d2}`
  const totalPuRn = group.days.reduce((s, day) => { const a = dayAgg[day.date]; return s + (a ? a.otbN - a.vsN : 0) }, 0)

  const th: React.CSSProperties = { textAlign: 'right', color: 'var(--color-text-secondary)', fontWeight: 400, padding: '0 4px 4px' }
  const td: React.CSSProperties = { textAlign: 'right', padding: 4, color: 'var(--color-text-primary)' }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 20,
        background: 'rgba(251,191,36,0.12)', color: '#FBBF24', border: '0.5px solid rgba(251,191,36,0.25)', cursor: 'default', whiteSpace: 'nowrap',
      }}>
        🎌 {group.parenText}
        <span style={{ fontSize: 9, opacity: 0.8 }}>{dateLabel}</span>
        {totalPuRn !== 0 && (
          <span style={{ fontSize: 9, fontWeight: 500, color: '#00B883', background: 'rgba(0,180,130,0.15)', padding: '1px 5px', borderRadius: 10, marginLeft: 2 }}>
            {totalPuRn > 0 ? '+' : ''}{totalPuRn} R/N
          </span>
        )}
      </span>

      {hovered && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300, minWidth: 280,
          background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-default)',
          borderRadius: 8, padding: '10px 12px', boxShadow: '0 6px 20px rgba(0,0,0,0.35)', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8, paddingBottom: 7, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            {group.name}{!isSingle ? ' 연휴' : ''} · {dateLabel} · {group.days.length}일
          </div>

          {/* 범례 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 6, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: 'rgba(0,229,160,0.5)' }} />
              OCC%
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-text-secondary)' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#60A5FA', minWidth: 18, textAlign: 'center' }}>+N</span>
              픽업 R/N
            </span>
          </div>

          {/* 미니차트 */}
          <div style={{ position: 'relative', width: '100%', height: 96, marginBottom: 8 }}>
            <canvas ref={canvasRef} />
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>
                <th />
                <th colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 500, paddingBottom: 3, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>OTB</th>
                <th style={{ width: 8 }} />
                <th colSpan={3} style={{ textAlign: 'center', color: '#00B883', fontWeight: 500, paddingBottom: 3, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>픽업</th>
              </tr>
              <tr>
                <th />
                <th style={th}>OCC</th><th style={th}>ADR</th><th style={th}>REV</th>
                <th />
                <th style={th}>OCC</th><th style={th}>ADR</th><th style={th}>REV</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {group.days.map(day => {
                const a = dayAgg[day.date]
                const dd = new Date(day.date)
                const label = `${dd.getMonth() + 1}/${dd.getDate()} ${DOW_KR[dd.getDay()]}`
                const otbOcc = a ? `${(a.otbN / totalRooms * 100).toFixed(1)}%` : '—'
                const otbAdr = a && a.otbN > 0 ? `${Math.round(a.otbR / a.otbN / 1000)}k` : '—'
                const otbRev = a ? `${(a.otbR / 1e6).toFixed(1)}M` : '—'
                const puOcc  = a && totalRooms ? Math.round((a.otbN - a.vsN) / totalRooms * 1000) / 10 : null
                const puAdr  = a && a.otbN > 0 && a.vsN > 0 ? Math.round(a.otbR / a.otbN / 1000 - a.vsR / a.vsN / 1000) : null
                const puRev  = a ? Math.round((a.otbR - a.vsR) / 1e6 * 10) / 10 : null
                const puStyle = (v: number | null) => (v === null || v === 0 ? HOLI_GRAY : v > 0 ? HOLI_POS : HOLI_NEG)
                return (
                  <tr key={day.date} style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                    <td style={{ color: 'var(--color-text-secondary)', padding: '4px 4px 4px 0', whiteSpace: 'nowrap' }}>{label}</td>
                    <td style={td}>{otbOcc}</td><td style={td}>{otbAdr}</td><td style={td}>{otbRev}</td>
                    <td />
                    <td style={{ ...td, ...puStyle(puOcc) }}>{puOcc === null || puOcc === 0 ? '—' : `${puOcc > 0 ? '+' : ''}${puOcc.toFixed(1)}%`}</td>
                    <td style={{ ...td, ...puStyle(puAdr) }}>{puAdr === null || puAdr === 0 ? '—' : `${puAdr > 0 ? '+' : ''}${puAdr}k`}</td>
                    <td style={{ ...td, ...puStyle(puRev) }}>{puRev === null || puRev === 0 ? '—' : `${puRev > 0 ? '+' : ''}${puRev.toFixed(1)}M`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

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

  // 이벤트 (c06_calendar: date / event / is_holiday) — 괄호 텍스트 있는 행만
  const { data: calendarRows = [] } = useQuery<CalendarRow[]>({
    queryKey: ['calendar-events', year, month1],
    queryFn: async () => {
      const start = `${year}-${String(month1).padStart(2, '0')}-01`
      const end   = `${year}-${String(month1).padStart(2, '0')}-${String(lastDayOfMonth(year, month1)).padStart(2, '0')}`
      const { data, error } = await (supabase as any)
        .from('c06_calendar')
        .select('date, event, is_holiday')
        .gte('date', start).lte('date', end)
        .not('event', 'is', null).neq('event', '').order('date')
      if (error) throw error
      return (data ?? []).filter((r: any) => r.event && extractParenText(r.event))
        .map((r: any) => ({ date: r.date, event: r.event, is_holiday: !!r.is_holiday }))
    },
    staleTime: 60 * 60 * 1000,
  })
  const eventGroups = useMemo(() => groupConsecutiveEvents(calendarRows), [calendarRows])

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
    const byDate = new Map<string, { otbN: number; vsN: number; otbR: number; vsR: number; puN: number }>()
    for (const r of pm) {
      if (r.segmentation === 'HOU') continue
      const a = byDate.get(r.business_date) ?? { otbN: 0, vsN: 0, otbR: 0, vsR: 0, puN: 0 }
      a.otbN += r.otb_nights ?? 0
      a.vsN  += r.vs_otb_nights ?? 0
      a.otbR += r.otb_revenue ?? 0
      a.vsR  += r.vs_otb_revenue ?? 0
      a.puN  += r.pu_nights ?? 0
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
      const a = byDate.get(dateStr) ?? { otbN: 0, vsN: 0, otbR: 0, vsR: 0, puN: 0 }
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
      dayAgg: Object.fromEntries([...byDate].map(([k, v]) => [k, { otbN: v.otbN, vsN: v.vsN, otbR: v.otbR, vsR: v.vsR }])) as Record<string, { otbN: number; vsN: number; otbR: number; vsR: number }>,
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
      {/* ── Month header (좌: 월 / 우: 공휴일 이벤트) ── */}
      <div className="relative px-5 pt-5 pb-2" style={{ background: 'var(--card-header-bg)' }}>
        {/* 글로우는 별도 overflow-hidden 래퍼로 헤더에 가둠 (툴팁은 헤더 밖으로 나가야 하므로 헤더 자체는 overflow visible) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-6 -left-6 w-28 h-28 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, var(--card-header-glow-color) 0%, transparent 70%)' }} />
        </div>
        <div className="relative flex items-start justify-between gap-2">
          <div className="flex items-end gap-1.5 shrink-0">
            <span className="font-bold leading-none" style={{ fontSize: 54, color: 'var(--color-text-primary)' }}>{month1}</span>
            <span className="text-lg font-medium text-brand-muted mb-1.5">월</span>
            <span className="text-xs font-medium text-brand-dimmed mb-2 ml-0.5">{year}</span>
          </div>
          {/* 우: 공휴일 이벤트 뱃지 */}
          <div className="flex flex-col items-end gap-1" style={{ flex: 1, paddingLeft: 8, paddingTop: 4 }}>
            {eventGroups.length === 0 ? (
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', opacity: 0.4 }}>이벤트 없음</span>
            ) : (
              eventGroups.map((g, i) => <EventBadge key={i} group={g} dayAgg={m.dayAgg} totalRooms={roomCount} />)
            )}
          </div>
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
