'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SlidersHorizontal, ChevronDown, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { PickupRow } from '@/hooks/usePickupData'
import { lastDayOfMonth, inMonth } from '@/utils/pickupPageUtils'
import MarketPickupAllDaysModal from '@/components/market-pickup/MarketPickupAllDaysModal'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export type SegLeaf  = { id: string; name: string; color: string; lightColor: string | null; fontDarkColor: string | null; isBold: boolean; codes: string[] }
export type SegGroup = { id: string; name: string; segs: SegLeaf[] }

// 막대 위/안 R/N 숫자 라벨 (per-instance 인라인 플러그인 → 전역 중복 등록 없음)
const barLabelPlugin = {
  id: 'barLabel',
  afterDatasetsDraw(chart: any) {
    const { ctx, data } = chart
    const meta = chart.getDatasetMeta(0)
    meta.data.forEach((bar: any, i: number) => {
      const val = data.datasets[0].data[i] as number
      if (!val) return
      const x = bar.x, y = bar.y
      const barH = Math.abs(bar.base - bar.y)
      ctx.save()
      ctx.font = '500 9px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      if (barH >= 14) {
        ctx.fillStyle = '#0a0a0a'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${val > 0 ? '+' : ''}${val}`, x, (y + bar.base) / 2)
      } else {
        ctx.fillStyle = val < 0 ? '#E24B4A' : '#888888'
        ctx.textBaseline = val >= 0 ? 'bottom' : 'top'
        ctx.fillText(`${val > 0 ? '+' : ''}${val}`, x, val >= 0 ? y - 2 : bar.base + 2)
      }
      ctx.restore()
    })
  },
}

// 어카운트별 픽업 요약 (RevenueMeetingPage에서 이식) — pu_nights/pu_revenue 집계, 상위 8개
function getAccountSummary(segCodes: string[], rows: PickupRow[], year: number, month: number) {
  const map = new Map<string, { rn: number; rev: number }>()
  for (const r of rows) {
    const d = new Date(r.business_date)
    if (d.getFullYear() !== year || d.getMonth() !== month) continue
    if (!segCodes.includes(r.segmentation)) continue
    const acct = r.account_name || '기타'
    const cur = map.get(acct) ?? { rn: 0, rev: 0 }
    map.set(acct, {
      rn:  cur.rn  + (r.pu_nights ?? 0),
      rev: cur.rev + (r.pu_revenue ?? 0),
    })
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, rn: v.rn, adr: v.rn > 0 ? Math.round(v.rev / v.rn) : 0 }))
    .filter(a => a.rn !== 0)
    .sort((a, b) => Math.abs(b.rn) - Math.abs(a.rn))
    .slice(0, 8)
}

export default function MeetingPickupBlock({
  year, month, monthKey, pickupRows, groups, selected, onToggleSeg, onBarClick, roomCount, allSegIds, isDayModalOpen, onSummaryChange,
}: {
  year:           number
  month:          number   // 0-based
  monthKey:       string
  pickupRows:     PickupRow[]
  groups:         SegGroup[]
  selected:       Set<string>
  onToggleSeg:    (segId: string) => void
  onBarClick:     (day: number, defaultTab: 'pickup' | 'otb') => void
  roomCount:      number
  allSegIds:      Set<string>
  isDayModalOpen?: boolean
  onSummaryChange?: (summary: {
    pickedSegs: { id: string; name: string; color: string; total: number }[]
    puOcc:      number
    puAdr:      number
    totalPuRev: number
    total:      number
  }) => void
}) {
  const month1 = month + 1
  const days   = lastDayOfMonth(year, month1)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  const tooltipId = `market-pickup-tooltip-${monthKey}`   // 카드별 고유 (body append)
  const [panelOpen, setPanelOpen] = useState(false)
  const [allDaysOpen, setAllDaysOpen] = useState(false)
  const [hoveredSeg, setHoveredSeg] = useState<{ segId: string; x: number; y: number } | null>(null)

  // 세그먼트 패널 외부 클릭 시 닫힘
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-seg-panel]')) setPanelOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Day 모달 열리면 차트 툴팁 숨김 (모달 위로 겹쳐 보이는 문제 방지)
  useEffect(() => {
    if (isDayModalOpen) { const el = document.getElementById(tooltipId); if (el) el.style.opacity = '0' }
  }, [isDayModalOpen, tooltipId])

  // 언마운트 시 툴팁 DOM 제거 (메모리 누수 방지)
  useEffect(() => () => { document.getElementById(tooltipId)?.remove() }, [tooltipId])

  // Picked up 칩 hover 툴팁 — 어카운트별 픽업 (body append, RevenueMeetingPage에서 이식)
  useEffect(() => {
    if (!hoveredSeg) return
    const seg = groups.flatMap(g => g.segs).find(s => s.id === hoveredSeg.segId)
    if (!seg) return
    const accounts = getAccountSummary(seg.codes, pickupRows, year, month)
    if (accounts.length === 0) return

    const div = document.createElement('div')
    div.style.cssText = `position:fixed; top:${hoveredSeg.y}px; left:${hoveredSeg.x}px; z-index:9999; background:#000000; border:0.5px solid rgba(255,255,255,0.1); border-radius:8px; padding:10px 14px; min-width:220px; box-shadow:0 4px 16px rgba(0,0,0,0.5); pointer-events:none; font-family:inherit;`

    const header = document.createElement('div')
    header.style.cssText = 'font-size:11px; color:#555; margin-bottom:8px; border-bottom:0.5px solid #1e1e1e; padding-bottom:6px;'
    header.textContent = `${seg.name} — 어카운트별 픽업`
    div.appendChild(header)

    accounts.forEach(a => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:16px; padding:3px 0; font-size:11px;'
      row.innerHTML =
        `<span style="color:#888; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${a.name}</span>` +
        `<span style="color:${a.rn >= 0 ? '#00E5A0' : '#E24B4A'}; font-weight:500; min-width:40px; text-align:right;">${a.rn > 0 ? '+' : ''}${a.rn}</span>` +
        `<span style="color:#555; min-width:50px; text-align:right;">${Math.round(a.adr / 1000)}k</span>`
      div.appendChild(row)
    })

    document.body.appendChild(div)
    return () => { document.body.removeChild(div) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredSeg])

  const activeSegs = useMemo(
    () => groups.flatMap(g => g.segs).filter(s => selected.has(s.id)),
    [groups, selected],
  )

  // ── 코드별 월 합계 / 일별 픽업 R/N (pu_nights) ────────────────────────────────
  const { codeMonthTotal, codeDay } = useMemo(() => {
    const codeMonthTotal = new Map<string, number>()
    const codeDay = new Map<string, number[]>()
    for (const r of pickupRows) {
      if (!inMonth(r.business_date, year, month1)) continue
      const code = r.segmentation
      const d = new Date(r.business_date).getDate()
      codeMonthTotal.set(code, (codeMonthTotal.get(code) ?? 0) + (r.pu_nights ?? 0))
      let arr = codeDay.get(code)
      if (!arr) { arr = new Array(days).fill(0); codeDay.set(code, arr) }
      arr[d - 1] += r.pu_nights ?? 0
    }
    return { codeMonthTotal, codeDay }
  }, [pickupRows, year, month1, days])

  const segTotal   = (seg: SegLeaf) => seg.codes.reduce((s, c) => s + (codeMonthTotal.get(c) ?? 0), 0)
  const groupTotal = (g: SegGroup) => g.segs.filter(s => selected.has(s.id)).reduce((s, seg) => s + segTotal(seg), 0)
  const total      = groups.reduce((s, g) => s + groupTotal(g), 0)

  // Picked up 칩: 선택된 세그 중 픽업이 0이 아닌 소분류
  const pickedSegs = groups.flatMap(g => g.segs).filter(s => selected.has(s.id) && segTotal(s) !== 0)

  // 카드 상태색 — 픽업 총 R/N 부호 (KPI 카드와 동일 컨셉: 민트/레드)
  const STATUS = total >= 0 ? '#00E5A0' : '#E24B4A'

  // 선택 세그 기준 컬럼 합산 헬퍼 (코드 → 값 Map 빌드 후 그룹/세그 합)
  const sumByCol = (col: keyof PickupRow) => {
    const map = new Map<string, number>()
    for (const r of pickupRows) {
      if (!inMonth(r.business_date, year, month1)) continue
      map.set(r.segmentation, (map.get(r.segmentation) ?? 0) + ((r[col] as number) ?? 0))
    }
    return groups.reduce((s, g) =>
      s + g.segs.filter(seg => selected.has(seg.id))
        .reduce((s2, seg) => s2 + seg.codes.reduce((s3, c) => s3 + (map.get(c) ?? 0), 0), 0)
    , 0)
  }

  // 총 픽업 REV / OTB·vs R/N·REV (선택 세그 기준)
  const totalPuRev  = useMemo(() => sumByCol('pu_revenue'),    [pickupRows, groups, selected, year, month1])
  const totalOtbRn  = useMemo(() => sumByCol('otb_nights'),    [pickupRows, groups, selected, year, month1])
  const totalVsRn   = useMemo(() => sumByCol('vs_nights'), [pickupRows, groups, selected, year, month1])
  const totalOtbRev = useMemo(() => sumByCol('otb_revenue'),   [pickupRows, groups, selected, year, month1])
  const totalVsRev  = useMemo(() => sumByCol('vs_revenue'),[pickupRows, groups, selected, year, month1])

  // OCC 픽업
  const daysInMonth = new Date(year, month1, 0).getDate()
  const totalAvail  = roomCount * daysInMonth
  const otbOcc      = totalAvail > 0 ? (totalOtbRn / totalAvail) * 100 : 0
  const vsOcc       = totalAvail > 0 ? (totalVsRn  / totalAvail) * 100 : 0
  const puOcc       = Math.round((otbOcc - vsOcc) * 10) / 10

  // ADR 픽업
  const otbAdr = totalOtbRn > 0 ? Math.round(totalOtbRev / totalOtbRn) : 0
  const vsAdr  = totalVsRn  > 0 ? Math.round(totalVsRev  / totalVsRn)  : 0
  const puAdr  = otbAdr - vsAdr

  // 요약(Picked up 칩 + KPI)을 부모로 전달 — 값이 실제로 바뀔 때만 호출(무한 루프 방지)
  const summaryKey = `${pickedSegs.map(s => `${s.id}:${segTotal(s)}`).join('|')}#${puOcc}#${puAdr}#${totalPuRev}#${total}`
  useEffect(() => {
    onSummaryChange?.({
      pickedSegs: pickedSegs.map(s => ({ id: s.id, name: s.name, color: s.color, total: segTotal(s) })),
      puOcc,
      puAdr,
      totalPuRev,
      total,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey])

  // 선택 세그 → 일별 합산
  const dailyTotals = useMemo(() => {
    const arr = new Array(days).fill(0)
    for (const g of groups) {
      for (const seg of g.segs) {
        if (!selected.has(seg.id)) continue
        for (const code of seg.codes) {
          const day = codeDay.get(code)
          if (!day) continue
          for (let i = 0; i < days; i++) arr[i] += day[i]
        }
      }
    }
    return arr.map(v => Math.round(v))
  }, [groups, selected, codeDay, days])

  // 세그별 일별 픽업 Map: segId → (day → pu_nights) — 커스텀 툴팁용
  const segDayMap = useMemo(() => {
    const map = new Map<string, Map<number, number>>()
    for (const r of pickupRows) {
      if (!inMonth(r.business_date, year, month1)) continue
      const d = new Date(r.business_date).getDate()
      groups.forEach(g => {
        g.segs.forEach(seg => {
          if (!selected.has(seg.id)) return
          if (!seg.codes.includes(r.segmentation)) return
          if (!map.has(seg.id)) map.set(seg.id, new Map())
          const dayMap = map.get(seg.id)!
          dayMap.set(d, (dayMap.get(d) ?? 0) + (r.pu_nights ?? 0))
        })
      })
    }
    return map
  }, [pickupRows, groups, selected, year, month1])

  // ── 이벤트 (c06_calendar) — x축 아래 도트 표시용 ──────────────────────────────
  const { data: calEvents = [] } = useQuery<{ date: string; event: string }[]>({
    queryKey: ['market-pickup-events', year, month1],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const lastDay = lastDayOfMonth(year, month1)
      const start = `${year}-${String(month1).padStart(2, '0')}-01`
      const end   = `${year}-${String(month1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const { data, error } = await (supabase as any)
        .from('c06_calendar').select('date, event')
        .gte('date', start).lte('date', end)
        .not('event', 'is', null).neq('event', '')
      if (error) throw error
      return (data ?? []) as { date: string; event: string }[]
    },
  })
  const eventMap = useMemo(() => {
    const m: Record<number, string> = {}
    for (const r of calEvents) {
      if (!r.event || r.event.trim() === '' || r.event === 'null') continue
      m[new Date(r.date).getDate()] = r.event
    }
    return m
  }, [calEvents])

  // ── 차트 ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (cancelled || !canvasRef.current) return
      chartRef.current?.destroy()
      const labels = Array.from({ length: days }, (_, i) => i + 1)
      const gc = 'rgba(255,255,255,0.05)', tc = '#717171'

      const hasEvents = Object.keys(eventMap).length > 0

      // 이벤트 도트 (요일 아래, 민트 원 + 2글자)
      const eventDots = {
        id: 'eventDots',
        afterDraw(chart: any) {
          const { ctx } = chart
          const meta = chart.getDatasetMeta(0)
          const bottom = chart.scales.x.bottom
          for (const [day, label] of Object.entries(eventMap)) {
            const i = Number(day) - 1
            if (!meta.data[i]) continue
            const xPos = meta.data[i].x
            const yc = bottom + 14   // 요일(둘째 줄) 바로 아래
            ctx.save()
            ctx.beginPath(); ctx.arc(xPos, yc, 9, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(0,229,160,0.12)'; ctx.fill()
            ctx.strokeStyle = '#00E5A0'; ctx.lineWidth = 1; ctx.stroke()
            const match = String(label).match(/\(([^)]+)\)/)
            const text = (match ? match[1] : String(label)).slice(0, 2)
            ctx.fillStyle = '#00E5A0'; ctx.font = '9px sans-serif'
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText(text, xPos, yc)
            ctx.restore()
          }
        },
      }

      chartRef.current = new Chart(canvasRef.current, {
        plugins: [barLabelPlugin, eventDots],
        data: {
          labels,
          datasets: [{
            type: 'bar',
            label: '픽업 R/N',
            data: dailyTotals,
            backgroundColor: dailyTotals.map((v: number) => (v >= 0 ? 'rgba(0,229,160,0.55)' : 'rgba(226,75,74,0.55)')),
            borderColor:     dailyTotals.map((v: number) => (v >= 0 ? 'rgba(0,229,160,0.8)' : 'rgba(226,75,74,0.8)')),
            borderWidth: 1,
            borderRadius: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          layout: { padding: { bottom: hasEvents ? 28 : 0 } },   // 이벤트 도트 공간 (오늘 마커는 라벨 영역 내부)
          interaction: { mode: 'index', intersect: false },
          onClick: (_event: any, elements: any[]) => {
            if (!elements.length) return
            const idx = elements[0].index
            onBarClick(idx + 1, (dailyTotals[idx] ?? 0) === 0 ? 'otb' : 'pickup')
          },
          onHover: (event: any, elements: any[]) => {
            const hoverCanvas = event.native?.target as HTMLCanvasElement | undefined
            if (hoverCanvas) hoverCanvas.style.cursor = elements.length ? 'pointer' : 'default'
            let tip = document.getElementById(tooltipId) as HTMLDivElement | null
            if (!tip) {
              tip = document.createElement('div')
              tip.id = tooltipId
              tip.style.cssText = 'position:fixed;background:#000000;border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 14px;pointer-events:none;font-size:12px;min-width:180px;box-shadow:0 4px 16px rgba(0,0,0,0.5);z-index:99999;opacity:0;transition:opacity 0.1s;'
              document.body.appendChild(tip)
            }
            if (!elements.length) { tip.style.opacity = '0'; return }

            const idx = elements[0].index
            const day = idx + 1            // 1-based
            const dayTotal = dailyTotals[idx] ?? 0
            if (dayTotal === 0) { tip.style.opacity = '0'; return }   // 픽업 0이면 툴팁 숨김

            // 요일 (month는 0-based)
            const DOW = ['일', '월', '화', '수', '목', '금', '토']
            const dow = DOW[new Date(year, month, day).getDay()]

            // 세그별 픽업 (0 제외)
            const segRows = groups.flatMap(g => g.segs)
              .filter(seg => selected.has(seg.id))
              .map(seg => ({ name: seg.name, color: seg.color, val: segDayMap.get(seg.id)?.get(day) ?? 0 }))
              .filter(s => s.val !== 0)

            const rowsHtml = segRows.length > 0
              ? segRows.map(s => `
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:3px 0;font-size:11px;">
                    <span style="color:rgba(255,255,255,0.6);display:flex;align-items:center;gap:5px;">
                      <span style="width:7px;height:7px;border-radius:2px;background:${s.color};flex-shrink:0;display:inline-block;"></span>
                      ${s.name}
                    </span>
                    <span style="font-weight:500;font-variant-numeric:tabular-nums;color:${s.val < 0 ? '#E24B4A' : 'rgba(255,255,255,0.6)'};">
                      ${s.val > 0 ? '+' : ''}${s.val}
                    </span>
                  </div>
                `).join('')
              : ''

            tip.innerHTML = `
              <div style="font-size:12px;font-weight:500;color:#fff;margin-bottom:8px;border-bottom:0.5px solid rgba(255,255,255,0.08);padding-bottom:6px;">
                ${month1}월 ${day}일 (${dow})
              </div>
              ${rowsHtml}
              <div style="height:0.5px;background:rgba(255,255,255,0.08);margin:5px 0;"></div>
              <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;">
                <span style="color:rgba(255,255,255,0.5);">Total</span>
                <span style="color:${dayTotal < 0 ? '#E24B4A' : '#00E5A0'};">
                  ${dayTotal >= 0 ? '+' : ''}${dayTotal}
                </span>
              </div>
            `

            // 위치 — 마우스 커서 우측, 커서 세로 중앙 (fixed). 화면 밖이면 반전
            const ev = event.native as MouseEvent | undefined
            const meta = chartRef.current?.getDatasetMeta(0).data[idx]
            const rect = canvasRef.current?.getBoundingClientRect()
            const mouseX = ev ? ev.clientX : (rect && meta ? rect.left + meta.x : 0)
            const mouseY = ev ? ev.clientY : (rect && meta ? rect.top + meta.y : 0)
            const tipW = tip.offsetWidth || 180
            const tipH = tip.offsetHeight || 100
            let finalX = mouseX + 12                                                    // 커서 우측 12px
            let finalY = mouseY - tipH / 2                                              // 커서 세로 중앙
            if (finalX + tipW > window.innerWidth - 16) finalX = mouseX - tipW - 12     // 우측 벗어남 → 좌측
            if (finalY < 8) finalY = 8                                                  // 상단 클램프
            if (finalY + tipH > window.innerHeight - 8) finalY = window.innerHeight - tipH - 8  // 하단 클램프
            tip.style.left = `${finalX}px`
            tip.style.top  = `${finalY}px`
            tip.style.opacity = '1'
          },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
          scales: {
            x: {
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: {
                font: { size: 10 },
                color: (ctx: any) => {
                  const dd = new Date(year, month, ctx.index + 1)
                  const tdy = new Date()
                  if (tdy.getFullYear() === year && tdy.getMonth() === month && tdy.getDate() === ctx.index + 1) return '#5B8DEF'
                  const dow = dd.getDay()
                  return dow === 5 || dow === 6 ? '#E24B4A' : '#888'
                },
                callback: (_v: any, index: number) => {
                  const dow = new Date(year, month, index + 1).getDay()
                  return [String(index + 1), DAY_NAMES[dow]]
                },
              },
            },
            y: {
              position: 'left', grid: { color: gc },
              ticks: {
                color: tc, font: { size: 10 }, precision: 0,
                callback: (v: any) => (Number.isInteger(v) ? `${v >= 0 ? '+' : ''}${v}` : null),
              },
            },
          },
        },
      })
    })()
    return () => { cancelled = true; chartRef.current?.destroy(); chartRef.current = null }
  }, [dailyTotals, days, month1, onBarClick, eventMap, year, month])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 섹션 제목 — 카드 밖 왼쪽 상단 */}
      <div style={{ fontSize: 13, fontWeight: 500, color: '#888', marginBottom: 10, letterSpacing: '0.02em', flexShrink: 0 }}>
        Daily Pick-up Status
      </div>

      {/* 픽업 차트 카드 */}
      <div className="rounded-2xl overflow-visible" style={{ position: 'relative', background: 'var(--color-bg-surface, var(--card-header-bg))', border: '1px solid var(--color-border-default)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* 배경 효과 레이어 — 좌측 상태 스트립 + 상단 라디얼 글로우 (라운드 클립, 드롭다운은 미포함) */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 16, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${STATUS}, ${STATUS}26)` }} />
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(130% 65% at 50% 0%, ${STATUS}17, transparent 62%)` }} />
      </div>

      {/* 월 헤더 — 월 라벨 + Segment 패널 */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 8px', flexWrap: 'wrap', flexShrink: 0 }}>
        {/* 월 라벨 + 맥박 도트 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{MONTH_NAMES[month]}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{year}</span>
          </div>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS, animation: 'kpiPulse 2s ease-in-out infinite' }} />
        </div>

        {/* Segment 패널 */}
        <div style={{ position: 'relative' }} data-seg-panel>
          <button
            onClick={() => setPanelOpen(p => !p)}
            style={{ background: 'transparent', border: '1px solid var(--color-border-default)', borderRadius: 8, color: 'var(--color-text-secondary)', fontSize: 11, padding: '4px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <SlidersHorizontal size={13} />
            Segment
            {selected.size > 0 && (
              <span style={{ background: 'rgba(0,229,160,0.18)', color: '#00E5A0', borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 600 }}>{selected.size} selected</span>
            )}
            <ChevronDown size={11} style={{ transform: panelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {panelOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
              background: '#000000', border: '0.5px solid #333', borderRadius: 10, padding: 10,
              minWidth: 240, maxHeight: 340, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
            }}>
              {groups.map(g => (
                <div key={g.id} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', padding: '2px 8px', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 }}>{g.name}</div>
                  {g.segs.map(seg => {
                    const on = selected.has(seg.id)
                    const st = segTotal(seg)
                    return (
                      <div key={seg.id}
                        onClick={() => onToggleSeg(seg.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 5, cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{
                          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                          border: on ? 'none' : '1.5px solid #444', background: on ? '#00E5A0' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{on && <Check size={10} color="#0a0a0a" strokeWidth={3} />}</span>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, whiteSpace: 'nowrap', fontSize: 12, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{seg.name}</span>
                        <span style={{ fontSize: 12, color: st > 0 ? '#00E5A0' : st < 0 ? '#E24B4A' : '#444', minWidth: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {st !== 0 ? `${st > 0 ? '+' : ''}${st}` : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div style={{ borderTop: '0.5px solid #333', marginTop: 8, paddingTop: 8, display: 'flex', gap: 6 }}>
                <button onClick={() => { allSegIds.forEach(id => { if (!selected.has(id)) onToggleSeg(id) }) }}
                  style={{ flex: 1, background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', borderRadius: 6, color: '#00E5A0', fontSize: 11, padding: '4px 0', cursor: 'pointer' }}>All</button>
                <button onClick={() => { selected.forEach(id => onToggleSeg(id)) }}
                  style={{ flex: 1, background: 'transparent', border: '0.5px solid #333', borderRadius: 6, color: 'var(--color-text-secondary)', fontSize: 11, padding: '4px 0', cursor: 'pointer' }}>Reset</button>
              </div>
            </div>
          )}
        </div>

        {/* Picked up 요약 (칩 + KPI) — 헤더 우측 (날짜 바에서 이동) */}
        {pickedSegs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
            <span style={{ fontSize: 10, color: '#555' }}>Picked up</span>
            {pickedSegs.map(seg => {
              const st = segTotal(seg)
              const pos = st > 0
              return (
                <span key={seg.id}
                  onMouseEnter={e => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setHoveredSeg({ segId: seg.id, x: rect.left, y: rect.bottom + 6 })
                  }}
                  onMouseLeave={() => setHoveredSeg(null)}
                  style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                  border: `1px solid ${pos ? 'rgba(0,229,160,0.3)' : 'rgba(226,75,74,0.3)'}`,
                  color: pos ? '#00E5A0' : '#E24B4A', cursor: 'default',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: seg.color }} />
                  {seg.name} {pos ? `+${st}` : st}
                </span>
              )
            })}
            <div style={{ width: 1, height: 16, background: '#2a2a2a' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: puOcc >= 0 ? '#00E5A0' : '#E24B4A' }}>
              {puOcc >= 0 ? '+' : ''}{puOcc.toFixed(1)}%
              <span style={{ fontWeight: 400, color: '#555', marginLeft: 2 }}>
                ({total >= 0 ? '+' : ''}{total} R/N)
              </span>
            </span>
            <span style={{ color: '#333' }}>·</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: puAdr >= 0 ? '#00E5A0' : '#E24B4A' }}>
              {puAdr >= 0 ? '+' : ''}{Math.round(puAdr / 1000)}k
            </span>
            <span style={{ color: '#333' }}>·</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: totalPuRev >= 0 ? '#00E5A0' : '#E24B4A' }}>
              {totalPuRev >= 0 ? '+' : ''}{(totalPuRev / 1_000_000).toFixed(1)}M
            </span>
          </div>
        )}

      </div>

      {/* 차트 */}
      <div
        style={{ position: 'relative', zIndex: 1, width: '100%', flex: 1, minHeight: 0, padding: '0 12px 12px' }}
        onMouseLeave={() => { const el = document.getElementById(tooltipId); if (el) el.style.opacity = '0' }}
      >
        <canvas ref={canvasRef} role="img" aria-label={`${month1}월 마켓 픽업`} />
      </div>

      <MarketPickupAllDaysModal
        open={allDaysOpen}
        onClose={() => setAllDaysOpen(false)}
        year={year}
        month={month}
        pickupRows={pickupRows}
        activeSegs={activeSegs}
        roomCount={roomCount}
      />
      </div>
    </div>
  )
}
