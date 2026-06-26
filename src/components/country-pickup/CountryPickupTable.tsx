'use client'

import { useState } from 'react'
import { ChartPie } from 'lucide-react'
import { fmtK, fmtM } from '@/utils/pickupPageUtils'
import { getFlagClass, type CountryPickupRpcRow } from './types'

type Agg = {
  country: string; country_name_ko: string; country_name_en: string; alpha2: string
  otb_nights: number; vs_nights: number; otb_revenue: number; vs_revenue: number; ly_nights: number; ly_revenue: number
}

type SortCol = 'pu_rn' | 'otb_rn' | 'ly_rn' | 'act_rn'

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
  const [sortCol, setSortCol] = useState<SortCol>('otb_rn')
  const [sortDir, setSortDir] = useState<-1 | 1>(-1)   // -1 내림차순, 1 오름차순
  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => (d === -1 ? 1 : -1))
    else { setSortCol(col); setSortDir(-1) }
  }

  const aggregated: Agg[] = Object.values(
    data.reduce((acc, row) => {
      const key = row.country
      if (!acc[key]) acc[key] = {
        country: row.country, country_name_ko: row.country_name_ko, country_name_en: row.country_name_en, alpha2: row.alpha2,
        otb_nights: 0, vs_nights: 0, otb_revenue: 0, vs_revenue: 0, ly_nights: 0, ly_revenue: 0,
      }
      if (isPastMonth) {
        // 이전월 Actual — otb_nights/otb_revenue로 정규화됨 (LY는 lyData에서 별도 병합)
        acc[key].otb_nights  += row.otb_nights  ?? 0
        acc[key].otb_revenue += row.otb_revenue ?? 0
      } else {
        acc[key].otb_nights  += row.otb_nights ?? 0
        acc[key].vs_nights   += row.vs_nights ?? 0
        acc[key].otb_revenue += row.otb_revenue ?? 0
        acc[key].vs_revenue  += row.vs_revenue ?? 0
        // country별 LY는 RPC가 모든 행에 동일값을 반환하므로 첫 행만 사용
        if (acc[key].ly_nights === 0 && (row.ly_nights ?? 0) > 0) {
          acc[key].ly_nights  = row.ly_nights  ?? 0
          acc[key].ly_revenue = row.ly_revenue ?? 0
        }
      }
      return acc
    }, {} as Record<string, Agg>),
  ).sort((a, b) => b.otb_nights - a.otb_nights)

  // 이전월: 전년도 Actual(lyData)을 country 기준으로 병합 → vs LY / LY Actual 컬럼
  if (isPastMonth && lyData) {
    const lyMap = lyData.reduce((m, r) => {
      const k = r.country
      // country별 ly는 모든 행에 동일한 값이 들어오므로 첫 번째 행만 사용
      if (!m[k]) {
        m[k] = {
          nights:  r.ly_nights  ?? 0,
          revenue: r.ly_revenue ?? 0,
        }
      }
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

  // R/N 컬럼 정렬
  const sorted = [...aggregated].sort((a, b) => {
    const getVal = (row: Agg): number => {
      if (sortCol === 'pu_rn')  return isPastMonth ? 0 : (row.otb_nights - row.vs_nights)
      if (sortCol === 'otb_rn') return row.otb_nights
      if (sortCol === 'ly_rn')  return row.otb_nights - row.ly_nights
      if (sortCol === 'act_rn') return row.ly_nights
      return 0
    }
    return (getVal(a) - getVal(b)) * sortDir
  })

  // ── YoY% (OTB/Actual R/N vs LY Actual R/N) — R/N 셀에 인라인 표시 ────────────────
  const calcYoy = (otb: number, ly: number): number | null =>
    ly > 0 ? ((otb - ly) / ly) * 100 : null
  // YoY%를 R/N 숫자 하단에 표시 (LY 0/null이면 — , 흐림)
  const yoyBelow = (v: number | null) => (
    <div style={{ fontSize: 9, marginTop: 1, color: v === null ? 'rgba(255,255,255,0.2)' : v >= 0 ? '#00B883' : '#E24B4A' }}>
      {v === null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%'}
    </div>
  )
  const totalYoyVal = calcYoy(totalOtbRn, totalLyRn)

  const tdBase: React.CSSProperties = {
    padding: '6px 8px', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
    borderBottom: '0.5px solid var(--color-border-subtle)', color: 'var(--color-text-primary)', whiteSpace: 'nowrap',
  }
  const sepStyle: React.CSSProperties = { width: 1, padding: 0, background: 'rgba(0,229,160,0.25)' }
  const grpTh = (color: string): React.CSSProperties => ({ textAlign: 'center', padding: '5px 8px 2px', fontSize: 9, fontWeight: 500, letterSpacing: '0.05em', color })
  const colTh = (color: string): React.CSSProperties => ({ textAlign: 'right', padding: '2px 8px 6px', fontSize: 9, fontWeight: 500, color, borderBottom: '0.5px solid var(--color-border-subtle)' })
  // 클릭 정렬 가능한 R/N 헤더 (활성 mint / 비활성 회색 + 정렬 아이콘)
  const rnHeader = (col: SortCol) => (
    <th onClick={() => handleSort(col)} style={{ ...colTh(sortCol === col ? '#00E5A0' : 'rgba(255,255,255,0.3)'), cursor: 'pointer', userSelect: 'none' }}>
      R/N {sortCol === col ? (sortDir === -1 ? '↓' : '↑') : '↕'}
    </th>
  )

  return (
    <div style={{ background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
      {/* 패널 헤더 */}
      <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Detailed Data Analysis</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', minWidth: 780 }}>
          <thead>
            {/* 컬럼 그룹 헤더 */}
            <tr>
              <th style={{ width: 320, textAlign: 'left', padding: '5px 8px 2px', fontSize: 9, fontWeight: 500, color: 'var(--color-text-tertiary)', boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.07)' }} />
              {!isPastMonth && (
                <>
                  <th colSpan={3} style={grpTh('rgba(0,229,160,0.7)')}>Pickup</th>
                  <th style={sepStyle} />
                </>
              )}
              <th colSpan={3} style={grpTh('var(--color-text-tertiary)')}>{isPastMonth ? 'Actual' : 'Current OTB'}</th>
              <th style={sepStyle} />
              <th colSpan={3} style={{ ...grpTh('rgba(255,180,50,0.9)'), whiteSpace: 'nowrap' }}>
                {lyMode === 'date' ? 'OTB vs Same Date LY' : 'OTB vs Same Period LY'}
              </th>
              <th style={sepStyle} />
              <th colSpan={3} style={{ ...grpTh('rgba(255,255,255,0.35)'), whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span>LY Actual</span>
                  <button
                    onClick={onToggleLyMode}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3, background: 'transparent',
                      border: `0.5px solid ${lyMode === 'date' ? 'rgba(0,229,160,0.4)' : 'rgba(255,255,255,0.15)'}`,
                      borderRadius: 3, padding: '1px 6px', cursor: 'pointer', fontSize: 9,
                      color: lyMode === 'date' ? '#00B883' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {lyMode === 'date' ? 'Same date' : 'Same period'} ↕
                  </button>
                </div>
              </th>
            </tr>
            {/* 컬럼 헤더 */}
            <tr>
              <th style={{ textAlign: 'left', padding: '2px 8px 6px', fontSize: 9, fontWeight: 500, color: 'var(--color-text-tertiary)', borderBottom: '0.5px solid var(--color-border-subtle)', boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.07)' }}>Country</th>
              {!isPastMonth && (
                <>
                  {rnHeader('pu_rn')}
                  {['ADR', 'REV'].map(h => <th key={'pu-' + h} style={colTh('rgba(0,229,160,0.6)')}>{h}</th>)}
                  <th style={{ ...sepStyle, borderBottom: '0.5px solid var(--color-border-subtle)' }} />
                </>
              )}
              {rnHeader('otb_rn')}
              {['ADR', 'REV'].map(h => <th key={h} style={colTh('var(--color-text-tertiary)')}>{h}</th>)}
              <th style={{ ...sepStyle, borderBottom: '0.5px solid var(--color-border-subtle)' }} />
              {rnHeader('ly_rn')}
              {['ADR', 'REV'].map(h => <th key={'ly-' + h} style={colTh('rgba(255,180,50,0.6)')}>{h}</th>)}
              <th style={{ ...sepStyle, borderBottom: '0.5px solid var(--color-border-subtle)' }} />
              {rnHeader('act_rn')}
              {['ADR', 'REV'].map(h => <th key={'lya-' + h} style={colTh('rgba(255,255,255,0.3)')}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const puRn  = row.otb_nights - row.vs_nights
              const puRev = row.otb_revenue - row.vs_revenue
              const otbAdr = row.otb_nights > 0 ? Math.round(row.otb_revenue / row.otb_nights) : 0
              const vsAdr  = row.vs_nights  > 0 ? Math.round(row.vs_revenue  / row.vs_nights)  : 0
              const lyAdr  = row.ly_nights  > 0 ? Math.round(row.ly_revenue  / row.ly_nights)  : 0
              const puAdr  = otbAdr - vsAdr
              const lyRn   = row.otb_nights - row.ly_nights
              const lyRevDiff = row.otb_revenue - row.ly_revenue
              const lyAdrDiff = otbAdr - lyAdr
              const rowYoyVal = calcYoy(row.otb_nights, row.ly_nights)
              return (
                <tr key={row.country}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...tdBase, textAlign: 'left', fontWeight: 500, boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.07)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      {row.alpha2
                        ? <span className={getFlagClass(row.alpha2)} style={{ fontSize: 13, width: 16, flexShrink: 0 }} />
                        : <span style={{ fontSize: 13, flexShrink: 0 }}>🌐</span>}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{row.country_name_en || row.country_name_ko}</span>
                    </div>
                  </td>
                  {!isPastMonth && (
                    <>
                      {/* Pickup */}
                      <td style={{ ...tdBase, color: puColor(puRn) }}>{fmtPu(puRn)}</td>
                      <td style={{ ...tdBase, color: puColor(puAdr) }}>{fmtPuK(puAdr)}</td>
                      <td style={{ ...tdBase, color: puColor(puRev) }}>{fmtPuM(puRev)}</td>
                      <td style={sepStyle} />
                    </>
                  )}
                  {/* OTB(미래월) / Actual(이전월) — 이전월은 R/N 하단에 YoY% */}
                  <td style={tdBase}>
                    {isPastMonth ? (
                      <>
                        <div>{row.otb_nights > 0 ? row.otb_nights.toLocaleString('ko-KR') : '—'}</div>
                        {yoyBelow(rowYoyVal)}
                      </>
                    ) : (
                      row.otb_nights.toLocaleString('ko-KR')
                    )}
                  </td>
                  <td style={tdBase}>{fmtK(otbAdr)}</td>
                  <td style={tdBase}>{fmtM(row.otb_revenue)}</td>
                  <td style={sepStyle} />
                  {/* OTB vs Same Date LY — R/N 하단에 YoY%(현재/미래월) */}
                  <td style={tdBase}>
                    {!isPastMonth ? (
                      <>
                        <div style={{ color: puColor(lyRn) }}>{fmtPu(lyRn)}</div>
                        {yoyBelow(rowYoyVal)}
                      </>
                    ) : (
                      <span style={{ color: puColor(lyRn) }}>{fmtPu(lyRn)}</span>
                    )}
                  </td>
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
              <td style={{ ...tdBase, textAlign: 'left', fontWeight: 500, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none', boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.07)' }}>Total</td>
              {!isPastMonth && (
                <>
                  <td style={{ ...tdBase, fontWeight: 500, color: puColor(totalPuRn), borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>{fmtPu(totalPuRn)}</td>
                  <td style={{ ...tdBase, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none', color: 'var(--color-text-tertiary)' }}>—</td>
                  <td style={{ ...tdBase, fontWeight: 500, color: puColor(totalPuRev), borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>{fmtPuM(totalPuRev)}</td>
                  <td style={{ ...sepStyle, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }} />
                </>
              )}
              <td style={{ ...tdBase, fontWeight: 500, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>
                {isPastMonth ? (
                  <>
                    <div>{totalOtbRn.toLocaleString('ko-KR')}</div>
                    {yoyBelow(totalYoyVal)}
                  </>
                ) : (
                  totalOtbRn.toLocaleString('ko-KR')
                )}
              </td>
              <td style={{ ...tdBase, fontWeight: 500, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>{fmtK(totalOtbAdr)}</td>
              <td style={{ ...tdBase, fontWeight: 500, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>{fmtM(totalOtbRev)}</td>
              <td style={{ ...sepStyle, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }} />
              <td style={{ ...tdBase, fontWeight: 500, borderTop: '0.5px solid rgba(0,229,160,0.6)', borderBottom: 'none' }}>
                {!isPastMonth ? (
                  <>
                    <div style={{ color: puColor(totalOtbRn - totalLyRn) }}>{fmtPu(totalOtbRn - totalLyRn)}</div>
                    {yoyBelow(totalYoyVal)}
                  </>
                ) : (
                  <span style={{ color: puColor(totalOtbRn - totalLyRn) }}>{fmtPu(totalOtbRn - totalLyRn)}</span>
                )}
              </td>
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
