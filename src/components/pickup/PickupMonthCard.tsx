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
import { PickupMonthSummaryModal } from '@/components/market-pickup/PickupMonthSummaryModal'
import { useMarketSchema } from '@/hooks/useMarketSchema'
import { useDateContext } from '@/contexts/DateContext'
import { lastDayOfMonth, inMonth, type PickupDaily } from '@/utils/pickupPageUtils'

const SPARK_MINT    = 'rgba(0,229,160,0.28)'
const SPARK_MINT_WK = 'rgba(0,229,160,0.65)'
const BLUE          = '#60A5FA'

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

// ─── KPI 섹션(OCC/ADR/REV) 스타일 + 전년대비/FIT·GRP 헬퍼 ───────────────────────
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const kpiSection: React.CSSProperties = { padding: '10px 16px', borderTop: '1px solid #1a1a1a', cursor: 'pointer' }
const kpiLabel: React.CSSProperties = { fontSize: 11, color: '#555', marginBottom: 4 }
const kpiRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const kpiValRow: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8 }
const kpiVs: React.CSSProperties = { fontSize: 12, color: '#444' }
const kpiBig = (color: string): React.CSSProperties => ({ fontSize: 28, fontWeight: 500, color, lineHeight: 1 })

function YoyBig({ v, unit }: { v: number | null; unit: string }) {
  if (v == null) return <span style={{ fontSize: 18, fontWeight: 500, color: '#555' }}>—</span>
  const pos = v >= 0
  return <span style={{ fontSize: 18, fontWeight: 500, color: pos ? '#00E5A0' : '#E24B4A' }}>{pos ? '▲' : '▼'} {Math.abs(v)}{unit}</span>
}
function FitGrpLine({ fitPct, grpPct }: { fitPct?: number | null; grpPct?: number | null }) {
  if (fitPct == null && grpPct == null) return null
  const seg = (label: string, v: number | null | undefined) =>
    v == null
      ? <>{label} <span style={{ color: '#555' }}>—</span></>
      : <>{label} <span style={{ color: v >= 0 ? '#00E5A0' : '#E24B4A' }}>{v >= 0 ? '▲' : '▼'}{Math.abs(Math.round(v))}%</span></>
  return <div style={{ fontSize: 10, color: '#555' }}>{seg('FIT', fitPct)}<span style={{ margin: '0 4px' }}>·</span>{seg('GRP', grpPct)}</div>
}

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
const HOLI_GRAY: React.CSSProperties = { color: '#555' }
const DOW_KR = ['일', '월', '화', '수', '목', '금', '토']

// 픽업 R/N 을 막대 위 숫자 + 위쪽 점선으로 그리는 커스텀 플러그인 (label==='pickup' 데이터셋만)
let circlePluginRegistered = false
const circlePlugin = {
  id: 'circleLabels',
  afterDraw(chart: any) {
    const { ctx, data, chartArea } = chart
    const barDsIdx = data.datasets.findIndex((d: any) => d.label === 'OCC%')
    const barMeta = barDsIdx >= 0 ? chart.getDatasetMeta(barDsIdx) : null

    // ── 픽업 R/N 숫자 (막대 위, 점선 없음) ───────────────────────────
    const dsIdx = data.datasets.findIndex((d: any) => d.label === 'pickup')
    if (dsIdx >= 0) {
      const ds = data.datasets[dsIdx]
      const meta = chart.getDatasetMeta(dsIdx)
      meta.data.forEach((point: any, i: number) => {
        const raw = ds.data[i]
        const val = raw && typeof raw === 'object' ? raw.y : raw
        if (val == null || val === 0) return   // 0 이면 숫자 생략
        const x = point.x
        const barTop = barMeta?.data[i]?.y ?? point.y
        ctx.save(); ctx.font = '600 10px -apple-system, sans-serif'; ctx.fillStyle = val >= 0 ? '#60A5FA' : '#E24B4A'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(`${val >= 0 ? '+' : ''}${val}`, x, barTop - 10); ctx.restore()
      })
    }

    // ── OCC% pill (x축 아래, 날짜 위) ──────────────────────────────
    if (barMeta && chartArea) {
      barMeta.data.forEach((bar: any, i: number) => {
        const occVal = data.datasets[barDsIdx].data[i]
        if (occVal == null) return
        const txt = `${occVal}%`
        const x = bar.x
        const y = chartArea.bottom + 14
        ctx.save()
        ctx.font = '600 9px -apple-system, sans-serif'
        const tw = ctx.measureText(txt).width
        const pw = tw + 10, ph = 13, pr = 5
        const px = x - pw / 2
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(px, y, pw, ph, pr)
        else ctx.rect(px, y, pw, ph)
        ctx.fillStyle = 'rgba(0,229,160,0.12)'; ctx.fill()
        ctx.strokeStyle = 'rgba(0,229,160,0.3)'; ctx.lineWidth = 0.5; ctx.stroke()
        ctx.fillStyle = '#00E5A0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(txt, x, y + ph / 2); ctx.restore()
      })
    }
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
            x:  { type: 'category', grid: { color: gc }, ticks: { color: tc, font: { size: 10 }, padding: 32 } },
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

  const th: React.CSSProperties = { textAlign: 'right', color: '#666', fontWeight: 400, padding: '0 4px 4px' }
  const td: React.CSSProperties = { textAlign: 'right', padding: 4, color: '#e5e5e5' }
  const divider: React.CSSProperties = { width: 1, padding: 0, background: '#333' }

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
          <span style={{ fontSize: 9, fontWeight: 500, color: totalPuRn > 0 ? '#00B883' : '#E24B4A', background: 'rgba(0,180,130,0.15)', padding: '1px 5px', borderRadius: 10, marginLeft: 2 }}>
            {totalPuRn > 0 ? '+' : ''}{totalPuRn}
          </span>
        )}
      </span>

      {hovered && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 500, minWidth: 280,
          background: '#000000', border: '0.5px solid #333',
          borderRadius: 8, padding: '10px 12px', boxShadow: '0 6px 20px rgba(0,0,0,0.6)', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#e5e5e5', marginBottom: 8, paddingBottom: 7, borderBottom: '0.5px solid #333' }}>
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
          <div style={{ position: 'relative', width: '100%', height: 118, marginBottom: 8 }}>
            <canvas ref={canvasRef} />
          </div>

          <div style={{ border: '0.5px solid #444', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>
                <th />
                <th colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 500, paddingBottom: 3 }}>OTB</th>
                <th style={divider} />
                <th colSpan={3} style={{ textAlign: 'center', color: '#00B883', fontWeight: 500, paddingBottom: 3 }}>픽업</th>
              </tr>
              <tr>
                <th />
                <th style={th}>OCC</th><th style={th}>ADR</th><th style={th}>REV</th>
                <th style={divider} />
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
                  <tr key={day.date} style={{ borderTop: '0.5px solid #333' }}>
                    <td style={{ color: '#999', padding: '4px 4px 4px 0', whiteSpace: 'nowrap' }}>{label}</td>
                    <td style={td}>{otbOcc}</td><td style={td}>{otbAdr}</td><td style={td}>{otbRev}</td>
                    <td style={divider} />
                    <td style={{ ...td, ...puStyle(puOcc) }}>{puOcc === null || puOcc === 0 ? '—' : `${puOcc > 0 ? '+' : ''}${puOcc.toFixed(1)}%`}</td>
                    <td style={{ ...td, ...puStyle(puAdr) }}>{puAdr === null || puAdr === 0 ? '—' : `${puAdr > 0 ? '+' : ''}${puAdr}k`}</td>
                    <td style={{ ...td, ...puStyle(puRev) }}>{puRev === null || puRev === 0 ? '—' : `${puRev > 0 ? '+' : ''}${puRev.toFixed(1)}M`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
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

  // Pick-up 박스 클릭 → 월별 픽업 요약 모달
  const { data: schema = [] } = useMarketSchema()
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()
  const [summaryModalOpen, setSummaryModalOpen] = useState(false)

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

  // ── 파생값 ───────────────────────────────────────────────────────────────────
  const adrDelta = m.otbAdr - m.vsAdr

  // 달성률 = FCST ÷ BUDGET × 100 (BUDGET 0이면 null → '-')
  const achOcc = m.bud.occ > 0 ? Math.round((m.fcst.occ / m.bud.occ) * 1000) / 10 : null
  const achAdr = m.bud.adr > 0 ? Math.round((m.fcst.adr / m.bud.adr) * 1000) / 10 : null
  const achRev = m.bud.rev > 0 ? Math.round((m.fcst.rev / m.bud.rev) * 1000) / 10 : null

  const fcCell = (color: string): React.CSSProperties => ({ fontSize: 14, fontWeight: 600, color, textAlign: 'right' })
  const borderTop = '1px solid var(--color-border-default)'

  return (
    <div className="flex flex-col rounded-2xl bg-bg-surface overflow-visible" style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}>
      {/* ── Month header (좌: 월 / 우: 공휴일 이벤트) ── */}
      <div className="relative px-5 pt-5 pb-2 rounded-t-2xl" style={{ background: 'var(--card-header-bg)' }}>
        {/* 글로우는 별도 overflow-hidden 래퍼로 헤더에 가둠 (툴팁은 헤더 밖으로 나가야 하므로 헤더 자체는 overflow visible) */}
        <div className="absolute inset-0 overflow-hidden rounded-t-2xl pointer-events-none">
          <div className="absolute -top-6 -left-6 w-28 h-28 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, var(--card-header-glow-color) 0%, transparent 70%)' }} />
        </div>
        <div className="relative flex items-end justify-between gap-2">
          <div className="flex items-end gap-1.5 shrink-0">
            <span className="font-bold leading-none" style={{ fontSize: 40, color: 'var(--color-text-primary)' }}>{MONTH_NAMES[month1 - 1]}</span>
            <span className="text-xs font-medium text-brand-dimmed mb-2 ml-1">{year}</span>
          </div>
          {/* 우: 공휴일 이벤트 뱃지 */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', flex: 1, paddingLeft: 8, paddingBottom: 2 }}>
            {eventGroups.length === 0 ? (
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', opacity: 0.4 }}>이벤트 없음</span>
            ) : (
              eventGroups.map((g, i) => <EventBadge key={i} group={g} dayAgg={m.dayAgg} totalRooms={roomCount} />)
            )}
          </div>
        </div>
      </div>

      {/* ── Pick-up 요약 (이미지2: 민트 박스) — 클릭 시 일자별 상세 모달 ── */}
      <div
        onClick={() => setSummaryModalOpen(true)}
        style={{ background: '#0a1f14', border: '1px solid rgba(0,229,160,0.15)', borderRadius: 10, padding: '14px 16px', margin: '8px 14px 10px', cursor: 'pointer' }}
      >
        <div style={{ fontSize: 11, color: '#00E5A0', textAlign: 'center', marginBottom: 8 }}>Pick-up</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr auto 1fr auto 1fr', alignItems: 'center' }}>
          {/* 픽업 % + R/N — 양수 흰색 / 음수 빨강 */}
          <div style={{ textAlign: 'center', padding: '0 8px' }}>
            <div style={{ fontSize: 32, fontWeight: 500, lineHeight: 1, color: m.puOccPp < 0 ? '#E24B4A' : '#fff' }}>
              {m.puOccPp > 0 ? '+' : ''}{m.puOccPp.toFixed(1)}%{m.puOccPp >= 0 ? '↑' : '↓'}
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
              {m.puN > 0 ? '+' : ''}{m.puN.toLocaleString('ko-KR')} R/N
            </div>
          </div>
          <div style={{ width: 1, height: 44, background: 'rgba(0,229,160,0.2)' }} />
          {/* ADR — 양수 민트 / 음수 빨강 */}
          <div style={{ textAlign: 'center', padding: '0 16px' }}>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>ADR</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: adrDelta < 0 ? '#E24B4A' : '#00E5A0' }}>
              {adrDelta > 0 ? '+' : ''}{Math.round(adrDelta / 1000)}k
            </div>
          </div>
          <div style={{ width: 1, height: 44, background: 'rgba(0,229,160,0.2)' }} />
          {/* REV — 양수 민트 / 음수 빨강 */}
          <div style={{ textAlign: 'center', padding: '0 16px' }}>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>REV</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: m.puR < 0 ? '#E24B4A' : '#00E5A0' }}>
              {m.puR > 0 ? '+' : ''}{(m.puR / 1_000_000).toFixed(1)}M
            </div>
          </div>
        </div>
      </div>

      {/* ── OCC (레이블 + LY 토글 한 줄) ── */}
      <div style={kpiSection} onClick={() => setLySegOpen(true)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#555' }}>OCC</span>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, background: '#0d0d0d', borderRadius: 8, padding: 3 }}>
            {([['Same Period LY', 'v2'], ['Same Day LY', 'v1']] as const).map(([labelTxt, mode]) => (
              <button key={mode} onClick={() => setLyMode(mode)}
                style={{
                  padding: '3px 8px', borderRadius: 6, fontSize: 10, border: 'none', cursor: 'pointer',
                  background: lyMode === mode ? '#00E5A0' : 'transparent',
                  color: lyMode === mode ? '#0a0a0a' : '#555',
                  fontWeight: lyMode === mode ? 500 : 400, transition: 'all 0.15s',
                }}>
                {labelTxt}
              </button>
            ))}
          </div>
        </div>
        <div style={kpiRow}>
          <div>
            <div style={kpiValRow}>
              <span style={kpiBig('#00E5A0')}>{m.otbOcc.toFixed(1)}%</span>
              <span style={kpiVs}>vs {m.vsOcc.toFixed(1)}%</span>
            </div>
            <div style={{ marginTop: 4 }}><FitGrpLine fitPct={ly.fitPct} grpPct={ly.grpPct} /></div>
          </div>
          <YoyBig v={ly.varNightsPct != null ? Math.round(ly.varNightsPct * 10) / 10 : null} unit="%" />
        </div>
      </div>

      {/* ── ADR ── */}
      <div style={kpiSection} onClick={() => setLySegOpen(true)}>
        <div style={kpiLabel}>ADR</div>
        <div style={kpiRow}>
          <div style={kpiValRow}>
            <span style={kpiBig('#ffffff')}>{Math.round(m.otbAdr / 1000)}k</span>
            <span style={kpiVs}>vs {Math.round(m.vsAdr / 1000)}k</span>
          </div>
          <YoyBig v={ly.varAdr != null ? Math.round(ly.varAdr / 1000) : null} unit="k" />
        </div>
      </div>

      {/* ── REV ── */}
      <div style={kpiSection} onClick={() => setLySegOpen(true)}>
        <div style={kpiLabel}>REV</div>
        <div style={kpiRow}>
          <div>
            <div style={kpiValRow}>
              <span style={kpiBig('#ffffff')}>{(m.otbRev / 1_000_000).toFixed(1)}M</span>
              <span style={kpiVs}>vs {(m.vsRev / 1_000_000).toFixed(1)}M</span>
            </div>
            <div style={{ marginTop: 4 }}><FitGrpLine fitPct={ly.fitPct} grpPct={ly.grpPct} /></div>
          </div>
          <YoyBig v={ly.varRevenuePct != null ? Math.round(ly.varRevenuePct * 10) / 10 : null} unit="%" />
        </div>
      </div>

      {/* ── Forecasting (FCST / BUDGET / Achieved = FCST÷BUDGET) ── */}
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
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--brand-dimmed)', borderTop, paddingTop: 7 }}>Achieved</div>
          <div className="font-mono" style={{ ...fcCell(getAchievementColor(achOcc)), fontSize: 12, borderTop, paddingTop: 7 }}>{fmtFcPct(achOcc)}</div>
          <div className="font-mono" style={{ ...fcCell(getAchievementColor(achAdr)), fontSize: 12, borderTop, paddingTop: 7 }}>{fmtFcPct(achAdr)}</div>
          <div className="font-mono" style={{ ...fcCell(getAchievementColor(achRev)), fontSize: 12, borderTop, paddingTop: 7 }}>{fmtFcPct(achRev)}</div>
        </div>
      </div>

      {/* ── 픽업 추이 (Pick-up 전용) ── */}
      <div style={{ padding: '8px 16px 10px', borderTop: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer' }} onClick={() => onExpand(m.daily)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Pick-up Trend</span>
          <span style={{ fontSize: 9, color: 'var(--color-text-secondary)', opacity: 0.7 }}>Expand</span>
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

      {/* ── 월별 픽업 요약 (Pick-up 박스 클릭) ── */}
      <PickupMonthSummaryModal
        open={summaryModalOpen}
        onClose={() => setSummaryModalOpen(false)}
        year={year}
        month={month}
        schema={schema}
        pickupRows={pickupRows}
        roomCount={roomCount}
        otbDate={otbDate}
        vsDate={vsOtbDate}
        otbDates={otbDates ?? []}
        onDateChange={(o, v) => { setOtbDate(o); setVsOtbDate(v) }}
      />
    </div>
  )
}
