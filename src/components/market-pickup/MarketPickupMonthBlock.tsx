'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PickupRow } from '@/hooks/usePickupData'
import { lastDayOfMonth, inMonth } from '@/utils/pickupPageUtils'
import MarketPickupAllDaysModal from './MarketPickupAllDaysModal'

export type SegLeaf  = { id: string; name: string; color: string; lightColor: string | null; codes: string[] }
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

export default function MarketPickupMonthBlock({
  year, month, monthKey, pickupRows, groups, selected, onToggleSeg, onBarClick, roomCount, allSegIds,
}: {
  year:        number
  month:       number   // 0-based
  monthKey:    string
  pickupRows:  PickupRow[]
  groups:      SegGroup[]
  selected:    Set<string>
  onToggleSeg: (segId: string) => void
  onBarClick:  (day: number) => void
  roomCount:   number
  allSegIds:   Set<string>
}) {
  const month1 = month + 1
  const days   = lastDayOfMonth(year, month1)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [allDaysOpen, setAllDaysOpen] = useState(false)

  // 세그 그룹 드롭다운 외부 클릭 시 닫힘
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-group-drop]')) setOpenGroup(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
  const totalVsRn   = useMemo(() => sumByCol('vs_otb_nights'), [pickupRows, groups, selected, year, month1])
  const totalOtbRev = useMemo(() => sumByCol('otb_revenue'),   [pickupRows, groups, selected, year, month1])
  const totalVsRev  = useMemo(() => sumByCol('vs_otb_revenue'),[pickupRows, groups, selected, year, month1])

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

  // 포맷 헬퍼
  const fmtK = (v: number) => `${Math.round(v / 1000)}k`
  const fmtM = (v: number) => `${(v / 1_000_000).toFixed(1)}M`

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
      chartRef.current = new Chart(canvasRef.current, {
        plugins: [barLabelPlugin],
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
          interaction: { mode: 'index', intersect: false },
          onClick: (_e: any, els: any[]) => { if (els.length) onBarClick(els[0].index + 1) },
          onHover: (_event: any, elements: any[]) => {
            const tip = tooltipRef.current
            if (!tip) return
            if (!elements.length) { tip.style.display = 'none'; return }

            const idx = elements[0].index
            const day = idx + 1            // 1-based
            const dayTotal = dailyTotals[idx] ?? 0

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
                    <span style="font-weight:500;font-variant-numeric:tabular-nums;color:${s.val > 0 ? '#00B883' : '#E24B4A'};">
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
                <span style="color:${dayTotal > 0 ? '#00B883' : dayTotal < 0 ? '#E24B4A' : 'rgba(255,255,255,0.3)'};">
                  ${dayTotal >= 0 ? '+' : ''}${dayTotal}
                </span>
              </div>
            `

            // 위치 계산
            tip.style.display = 'block'
            const canvas = canvasRef.current
            const chart = chartRef.current
            if (!canvas || !chart) return
            const meta = chart.getDatasetMeta(0).data[idx]
            if (!meta) return
            const canvasRect = canvas.getBoundingClientRect()
            const wrapRect = canvas.parentElement!.getBoundingClientRect()
            let x = meta.x - (wrapRect.left - canvasRect.left)
            let y = meta.y - (wrapRect.top - canvasRect.top) - 10
            const tipW = tip.offsetWidth
            const tipH = tip.offsetHeight
            if (x + tipW > wrapRect.width - 10) x = x - tipW - 10
            if (y - tipH < 0) y = y + 20
            tip.style.left = `${x}px`
            tip.style.top  = `${y - tipH}px`
          },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: tc, font: { size: 9 } } },
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
  }, [dailyTotals, days, month1, onBarClick])

  return (
    <div className="rounded-2xl overflow-visible" style={{ background: 'var(--color-bg-surface, var(--card-header-bg))', border: '1px solid var(--color-border-default)' }}>
      {/* 월 헤더 + 세그 드롭다운 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{month1}월 {year}</span>
        {/* 전체 선택 */}
        <button
          onClick={() => { allSegIds.forEach(id => { if (!selected.has(id)) onToggleSeg(id) }) }}
          style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '0.5px solid var(--color-border-tertiary)', background: 'transparent', color: 'var(--color-text-secondary)' }}
        >All</button>
        {/* 전체 해제 */}
        <button
          onClick={() => { selected.forEach(id => onToggleSeg(id)) }}
          style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '0.5px solid var(--color-border-tertiary)', background: 'transparent', color: 'var(--color-text-secondary)' }}
        >Reset</button>
        <span style={{ color: 'var(--color-border-tertiary)' }}>|</span>
        {groups.map((g, gi) => {
          const gt = groupTotal(g)
          return (
            <div key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              {gi > 0 && <span style={{ color: 'var(--color-border-tertiary)' }}>|</span>}
              <div style={{ position: 'relative' }} data-group-drop>
                <span
                  onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}
                  style={{ fontSize: 11, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                >
                  <span style={{ color: 'var(--color-text-secondary)' }}>{g.name}</span>
                  <span style={{ color: gt >= 0 ? '#00B883' : '#E24B4A' }}>{gt >= 0 ? '+' : ''}{gt}</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>실</span>
                  <span style={{ fontSize: 8, color: 'var(--color-text-secondary)', opacity: 0.7 }}>{openGroup === g.id ? '▲' : '▼'}</span>
                </span>
                {openGroup === g.id && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
                    background: '#0a0a0a', border: '0.5px solid #333', borderRadius: 8, padding: 6,
                    minWidth: 180, boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
                  }}>
                    {g.segs.map(seg => {
                      const on = selected.has(seg.id)
                      const st = segTotal(seg)
                      return (
                        <div key={seg.id}
                          onClick={() => onToggleSeg(seg.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: 'var(--color-text-primary)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{
                            width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                            border: on ? 'none' : '1.5px solid #444', background: on ? '#00E5A0' : 'transparent',
                            color: '#000', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>{on ? '✓' : ''}</span>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                          <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{seg.name}</span>
                          <span style={{ color: st >= 0 ? '#00B883' : '#E24B4A', fontVariantNumeric: 'tabular-nums' }}>{st >= 0 ? '+' : ''}{st}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <span style={{ color: 'var(--color-border-tertiary)' }}>|</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600 }}>
          {/* OCC 픽업 */}
          <span style={{ color: puOcc >= 0 ? '#00E5A0' : '#E24B4A' }}>
            {puOcc >= 0 ? '+' : ''}{puOcc.toFixed(1)}%
            <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 2 }}>
              ({total >= 0 ? '+' : ''}{total} R/N)
            </span>
          </span>
          <span style={{ color: 'var(--color-border-tertiary)' }}>·</span>
          {/* ADR 픽업 */}
          <span style={{ color: puAdr >= 0 ? '#00E5A0' : '#E24B4A' }}>
            {puAdr >= 0 ? '+' : ''}{fmtK(puAdr)}
          </span>
          <span style={{ color: 'var(--color-border-tertiary)' }}>·</span>
          {/* REV 픽업 */}
          <span style={{ color: totalPuRev >= 0 ? '#00E5A0' : '#E24B4A' }}>
            {totalPuRev >= 0 ? '+' : ''}{fmtM(totalPuRev)}
          </span>
        </span>
        <button
          onClick={() => setAllDaysOpen(true)}
          style={{
            marginLeft: 'auto', fontSize: 11, padding: '3px 10px', borderRadius: 6,
            border: '0.5px solid var(--color-border-default)', background: 'transparent',
            color: 'var(--color-text-secondary)', cursor: 'pointer',
          }}
        >
          전일자 보기
        </button>
      </div>

      {/* 차트 */}
      <div
        style={{ position: 'relative', width: '100%', height: 180, padding: '0 12px 12px' }}
        onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = 'none' }}
      >
        {/* 커스텀 HTML 툴팁 */}
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute', background: '#0a0a0a',
            border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8,
            padding: '10px 14px', pointerEvents: 'none', display: 'none',
            minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.5)', zIndex: 100,
          }}
        />
        <canvas ref={canvasRef} role="img" aria-label={`${month1}월 마켓 픽업`} />
      </div>

      <MarketPickupAllDaysModal
        open={allDaysOpen}
        onClose={() => setAllDaysOpen(false)}
        year={year}
        month={month}
        pickupRows={pickupRows}
        activeSegs={activeSegs}
      />
    </div>
  )
}
