'use client'

import { ChartPie } from 'lucide-react'
import { fmtK, fmtM } from '@/utils/pickupPageUtils'
import { getFlagClass, type CountryPickupRpcRow } from './types'

type Agg = {
  country: string; country_name_ko: string; country_name_en: string; alpha2: string
  otb_nights: number; vs_nights: number; otb_revenue: number; vs_revenue: number; ly_nights: number; ly_revenue: number
}

const puColor = (v: number) => (v > 0 ? '#00B883' : v < 0 ? '#E24B4A' : 'var(--color-text-tertiary)')
const fmtPu   = (v: number) => (v === 0 ? '—' : v > 0 ? `+${v}` : `${v}`)
const fmtPuK  = (v: number) => (v === 0 ? '—' : `${v > 0 ? '+' : ''}${fmtK(v)}`)
const fmtPuM  = (v: number) => (v === 0 ? '—' : `${v > 0 ? '+' : ''}${fmtM(v)}`)

export default function CountryPickupTable({ data, isPastMonth, lyData, lyMode, onToggleLyMode, onOpenDistribution }: {
  data: CountryPickupRpcRow[]
  isPastMonth: boolean
  lyData?: CountryPickupRpcRow[] | null
  lyMode: 'date' | 'match'
  onToggleLyMode: () => void
  onOpenDistribution: () => void
}) {
  const aggregated: Agg[] = Object.values(
    data.reduce((acc, row) => {
      const key = row.country
      if (!acc[key]) acc[key] = {
        country: row.country, country_name_ko: row.country_name_ko, country_name_en: row.country_name_en, alpha2: row.alpha2,
        otb_nights: 0, vs_nights: 0, otb_revenue: 0, vs_revenue: 0, ly_nights: 0, ly_revenue: 0,
      }
      if (isPastMonth) {
        // 이전월 Actual — nights/room_revenue 컬럼 (LY는 lyData에서 별도 병합)
        acc[key].otb_nights  += row.nights       ?? 0
        acc[key].otb_revenue += row.room_revenue ?? 0
      } else {
        acc[key].otb_nights  += row.otb_nights ?? 0
        acc[key].vs_nights   += row.vs_nights ?? 0
        acc[key].otb_revenue += row.otb_revenue ?? 0
        acc[key].vs_revenue  += row.vs_revenue ?? 0
        acc[key].ly_nights   += row.ly_nights ?? 0
        acc[key].ly_revenue  += row.ly_revenue ?? 0
      }
      return acc
    }, {} as Record<string, Agg>),
  ).sort((a, b) => b.otb_nights - a.otb_nights)

  // 이전월: 전년도 Actual(lyData)을 country 기준으로 병합 → vs LY / LY Actual 컬럼
  if (isPastMonth && lyData) {
    const lyMap = lyData.reduce((m, r) => {
      const k = r.country
      if (!m[k]) m[k] = { nights: 0, revenue: 0 }
      m[k].nights  += r.nights       ?? 0
      m[k].revenue += r.room_revenue ?? 0
      return m
    }, {} as Record<string, { nights: number; revenue: number }>)
    for (const a of aggregated) {
      const ly = lyMap[a.country]
      if (ly) { a.ly_nights = ly.nights; a.ly_revenue = ly.revenue }
    }
  }

  const totalOtbRn  = aggregated.reduce((s, r) => s + r.otb_nights, 0)
  const totalPuRn   = aggregated.reduce((s, r) => s + (r.otb_nights - r.vs_nights), 0)
  const totalOtbRev = aggregated.reduce((s, r) => s + r.otb_revenue, 0)
  const totalPuRev  = aggregated.reduce((s, r) => s + (r.otb_revenue - r.vs_revenue), 0)
  const totalLyRn   = aggregated.reduce((s, r) => s + r.ly_nights, 0)
  const totalLyRev  = aggregated.reduce((s, r) => s + r.ly_revenue, 0)
  const totalOtbAdr = totalOtbRn > 0 ? Math.round(totalOtbRev / totalOtbRn) : 0
  const totalLyAdr  = totalLyRn  > 0 ? Math.round(totalLyRev  / totalLyRn)  : 0

  // ── YoY% (현재 OTB/Actual R/N vs LY Actual R/N) — 이전월 포함 ───────────────────
  const rowYoy = (otbN: number, lyN: number): number | null =>
    lyN > 0 ? ((otbN - lyN) / lyN) * 100 : null
  const MAX_ABS = Math.max(
    ...aggregated.map(r => { const y = rowYoy(r.otb_nights, r.ly_nights); return y === null ? 0 : Math.abs(y) }),
    1,
  )
  const totalYoy = rowYoy(totalOtbRn, totalLyRn)

  // YoY% 셀 (양방향 바 + 숫자). tdExtra로 Total 행 테두리 등 주입
  const yoyCell = (yoyPct: number | null, tdExtra?: React.CSSProperties) => {
    if (yoyPct === null) {
      return <td style={{ ...tdBase, width: 130, textAlign: 'center', color: 'rgba(255,255,255,0.2)', ...tdExtra }}>—</td>
    }
    const isPos = yoyPct >= 0
    const barW = Math.min(Math.abs(yoyPct) / MAX_ABS * 50, 50)
    return (
      <td style={{ ...tdBase, position: 'relative', padding: '4px 8px', width: 130, ...tdExtra }}>
        <div style={{ position: 'relative', height: 16, display: 'flex', alignItems: 'center' }}>
          {/* 중앙 기준선 */}
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 0.5, background: 'rgba(255,255,255,0.15)' }} />
          {/* 바 — 양수: 중앙→오른쪽(mint), 음수: 중앙→왼쪽(red) */}
          <div style={{
            position: 'absolute', height: 6, borderRadius: 2, top: '50%', transform: 'translateY(-50%)',
            background: isPos ? '#00E5A0' : '#E24B4A',
            ...(isPos ? { left: '50%', width: `${barW}%` } : { right: '50%', width: `${barW}%` }),
          }} />
          {/* 숫자 — 바 끝 바깥 */}
          <span style={{
            position: 'absolute', fontSize: 10, fontWeight: 500, top: '50%', transform: 'translateY(-50%)',
            whiteSpace: 'nowrap', color: isPos ? '#00B883' : '#E24B4A',
            ...(isPos ? { left: `calc(50% + ${barW}% + 2px)` } : { right: `calc(50% + ${barW}% + 2px)` }),
          }}>
            {isPos ? '+' : ''}{yoyPct.toFixed(1)}%
          </span>
        </div>
      </td>
    )
  }

  const tdBase: React.CSSProperties = {
    padding: '6px 8px', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
    borderBottom: '0.5px solid var(--color-border-subtle)', color: 'var(--color-text-primary)', whiteSpace: 'nowrap',
  }
  const sepStyle: React.CSSProperties = { width: 1, padding: 0, background: 'rgba(0,229,160,0.25)' }
  const grpTh = (color: string): React.CSSProperties => ({ textAlign: 'center', padding: '5px 8px 2px', fontSize: 9, fontWeight: 500, letterSpacing: '0.05em', color })
  const colTh = (color: string): React.CSSProperties => ({ textAlign: 'right', padding: '2px 8px 6px', fontSize: 9, fontWeight: 500, color, borderBottom: '0.5px solid var(--color-border-subtle)' })

  return (
    <div style={{ background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
      {/* 패널 헤더 */}
      <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Detailed Data Analysis</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>vs LY: {lyMode === 'date' ? 'Same date' : 'Same period'}</span>
          <button
            onClick={onOpenDistribution}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6,
              border: '0.5px solid var(--color-border-subtle)',
              background: 'transparent', color: 'var(--color-text-secondary)',
              fontSize: 11, cursor: 'pointer',
            }}
          >
            <ChartPie size={13} />
            Distribution
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', minWidth: 910 }}>
          <thead>
            {/* 컬럼 그룹 헤더 */}
            <tr>
              <th style={{ width: 210, textAlign: 'left', padding: '5px 8px 2px', fontSize: 9, fontWeight: 500, color: 'var(--color-text-tertiary)' }} />
              <th style={{ width: 130 }} />
              <th colSpan={3} style={grpTh('var(--color-text-tertiary)')}>{isPastMonth ? 'Actual' : 'Current OTB'}</th>
              {!isPastMonth && (
                <>
                  <th style={sepStyle} />
                  <th colSpan={3} style={grpTh('rgba(0,229,160,0.7)')}>Pickup</th>
                </>
              )}
              <th style={sepStyle} />
              <th colSpan={3} onClick={onToggleLyMode} style={{ ...grpTh('rgba(255,180,50,0.9)'), cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                {lyMode === 'date' ? 'Same date vs LY ⇅' : 'Same period vs LY ⇅'}
              </th>
              <th style={sepStyle} />
              <th colSpan={3} style={{ ...grpTh('rgba(255,255,255,0.35)'), whiteSpace: 'nowrap' }}>LY Actual</th>
            </tr>
            {/* 컬럼 헤더 */}
            <tr>
              <th style={{ textAlign: 'left', padding: '2px 8px 6px', fontSize: 9, fontWeight: 500, color: 'var(--color-text-tertiary)', borderBottom: '0.5px solid var(--color-border-subtle)' }}>Country</th>
              <th style={{ ...colTh('rgba(255,180,50,0.6)'), width: 130, textAlign: 'center' }}>YoY%</th>
              {['R/N', 'ADR', 'REV'].map(h => <th key={h} style={colTh('var(--color-text-tertiary)')}>{h}</th>)}
              {!isPastMonth && (
                <>
                  <th style={{ ...sepStyle, borderBottom: '0.5px solid var(--color-border-subtle)' }} />
                  {['R/N', 'ADR', 'REV'].map(h => <th key={'pu-' + h} style={colTh('rgba(0,229,160,0.6)')}>{h}</th>)}
                </>
              )}
              <th style={{ ...sepStyle, borderBottom: '0.5px solid var(--color-border-subtle)' }} />
              {['R/N', 'ADR', 'REV'].map(h => <th key={'ly-' + h} style={colTh('rgba(255,180,50,0.6)')}>{h}</th>)}
              <th style={{ ...sepStyle, borderBottom: '0.5px solid var(--color-border-subtle)' }} />
              {['R/N', 'ADR', 'REV'].map(h => <th key={'lya-' + h} style={colTh('rgba(255,255,255,0.3)')}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {aggregated.map(row => {
              const puRn  = row.otb_nights - row.vs_nights
              const puRev = row.otb_revenue - row.vs_revenue
              const otbAdr = row.otb_nights > 0 ? Math.round(row.otb_revenue / row.otb_nights) : 0
              const vsAdr  = row.vs_nights  > 0 ? Math.round(row.vs_revenue  / row.vs_nights)  : 0
              const lyAdr  = row.ly_nights  > 0 ? Math.round(row.ly_revenue  / row.ly_nights)  : 0
              const puAdr  = otbAdr - vsAdr
              const lyRn   = row.otb_nights - row.ly_nights
              const lyRevDiff = row.otb_revenue - row.ly_revenue
              const lyAdrDiff = otbAdr - lyAdr
              return (
                <tr key={row.country}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...tdBase, textAlign: 'left', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      {row.alpha2
                        ? <span className={getFlagClass(row.alpha2)} style={{ fontSize: 13, width: 16, flexShrink: 0 }} />
                        : <span style={{ fontSize: 13, flexShrink: 0 }}>🌐</span>}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{row.country_name_en || row.country_name_ko}</span>
                    </div>
                  </td>
                  {/* YoY% */}
                  {yoyCell(rowYoy(row.otb_nights, row.ly_nights))}
                  {/* OTB (이전월이면 Actual) */}
                  <td style={tdBase}>{row.otb_nights.toLocaleString('ko-KR')}</td>
                  <td style={tdBase}>{fmtK(otbAdr)}</td>
                  <td style={tdBase}>{fmtM(row.otb_revenue)}</td>
                  {!isPastMonth && (
                    <>
                      <td style={sepStyle} />
                      {/* Pickup */}
                      <td style={{ ...tdBase, color: puColor(puRn) }}>{fmtPu(puRn)}</td>
                      <td style={{ ...tdBase, color: puColor(puAdr) }}>{fmtPuK(puAdr)}</td>
                      <td style={{ ...tdBase, color: puColor(puRev) }}>{fmtPuM(puRev)}</td>
                    </>
                  )}
                  <td style={sepStyle} />
                  {/* vs LY */}
                  <td style={{ ...tdBase, color: puColor(lyRn) }}>{fmtPu(lyRn)}</td>
                  <td style={{ ...tdBase, color: puColor(lyAdrDiff) }}>{fmtPuK(lyAdrDiff)}</td>
                  <td style={{ ...tdBase, color: puColor(lyRevDiff) }}>{fmtPuM(lyRevDiff)}</td>
                  <td style={sepStyle} />
                  {/* LY Actual */}
                  <td style={{ ...tdBase, color: 'var(--color-text-secondary)' }}>{row.ly_nights > 0 ? row.ly_nights.toLocaleString('ko-KR') : '—'}</td>
                  <td style={{ ...tdBase, color: 'var(--color-text-secondary)' }}>{row.ly_nights > 0 ? fmtK(lyAdr) : '—'}</td>
                  <td style={{ ...tdBase, color: 'var(--color-text-secondary)' }}>{row.ly_revenue > 0 ? fmtM(row.ly_revenue) : '—'}</td>
                </tr>
              )
            })}
            {/* 합계 행 */}
            <tr>
              <td style={{ ...tdBase, textAlign: 'left', fontWeight: 500, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>Total</td>
              {yoyCell(totalYoy, { borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' })}
              <td style={{ ...tdBase, fontWeight: 500, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>{totalOtbRn.toLocaleString('ko-KR')}</td>
              <td style={{ ...tdBase, fontWeight: 500, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>{fmtK(totalOtbAdr)}</td>
              <td style={{ ...tdBase, fontWeight: 500, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>{fmtM(totalOtbRev)}</td>
              {!isPastMonth && (
                <>
                  <td style={{ ...sepStyle, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }} />
                  <td style={{ ...tdBase, fontWeight: 500, color: puColor(totalPuRn), borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>{fmtPu(totalPuRn)}</td>
                  <td style={{ ...tdBase, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none', color: 'var(--color-text-tertiary)' }}>—</td>
                  <td style={{ ...tdBase, fontWeight: 500, color: puColor(totalPuRev), borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>{fmtPuM(totalPuRev)}</td>
                </>
              )}
              <td style={{ ...sepStyle, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }} />
              <td style={{ ...tdBase, fontWeight: 500, color: puColor(totalOtbRn - totalLyRn), borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>{fmtPu(totalOtbRn - totalLyRn)}</td>
              <td style={{ ...tdBase, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none', color: 'var(--color-text-tertiary)' }}>—</td>
              <td style={{ ...tdBase, fontWeight: 500, color: puColor(totalOtbRev - totalLyRev), borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>{fmtPuM(totalOtbRev - totalLyRev)}</td>
              <td style={{ ...sepStyle, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }} />
              {/* LY Actual */}
              <td style={{ ...tdBase, fontWeight: 500, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none', color: 'var(--color-text-secondary)' }}>{totalLyRn > 0 ? totalLyRn.toLocaleString('ko-KR') : '—'}</td>
              <td style={{ ...tdBase, fontWeight: 500, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none', color: 'var(--color-text-secondary)' }}>{totalLyRn > 0 ? fmtK(totalLyAdr) : '—'}</td>
              <td style={{ ...tdBase, fontWeight: 500, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none', color: 'var(--color-text-secondary)' }}>{totalLyRev > 0 ? fmtM(totalLyRev) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
