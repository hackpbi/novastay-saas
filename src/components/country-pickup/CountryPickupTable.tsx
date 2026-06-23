'use client'

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

export default function CountryPickupTable({ data, lyMode, onToggleLyMode }: {
  data: CountryPickupRpcRow[]
  lyMode: 'date' | 'match'
  onToggleLyMode: () => void
}) {
  const aggregated: Agg[] = Object.values(
    data.reduce((acc, row) => {
      const key = row.country
      if (!acc[key]) acc[key] = {
        country: row.country, country_name_ko: row.country_name_ko, country_name_en: row.country_name_en, alpha2: row.alpha2,
        otb_nights: 0, vs_nights: 0, otb_revenue: 0, vs_revenue: 0, ly_nights: 0, ly_revenue: 0,
      }
      acc[key].otb_nights  += row.otb_nights ?? 0
      acc[key].vs_nights   += row.vs_nights ?? 0
      acc[key].otb_revenue += row.otb_revenue ?? 0
      acc[key].vs_revenue  += row.vs_revenue ?? 0
      acc[key].ly_nights   += row.ly_nights ?? 0
      acc[key].ly_revenue  += row.ly_revenue ?? 0
      return acc
    }, {} as Record<string, Agg>),
  ).sort((a, b) => b.otb_nights - a.otb_nights)

  const totalOtbRn  = aggregated.reduce((s, r) => s + r.otb_nights, 0)
  const totalPuRn   = aggregated.reduce((s, r) => s + (r.otb_nights - r.vs_nights), 0)
  const totalOtbRev = aggregated.reduce((s, r) => s + r.otb_revenue, 0)
  const totalPuRev  = aggregated.reduce((s, r) => s + (r.otb_revenue - r.vs_revenue), 0)
  const totalLyRn   = aggregated.reduce((s, r) => s + r.ly_nights, 0)
  const totalLyRev  = aggregated.reduce((s, r) => s + r.ly_revenue, 0)
  const totalOtbAdr = totalOtbRn > 0 ? Math.round(totalOtbRev / totalOtbRn) : 0
  const totalLyAdr  = totalLyRn  > 0 ? Math.round(totalLyRev  / totalLyRn)  : 0

  const tdBase: React.CSSProperties = {
    padding: '6px 8px', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
    borderBottom: '0.5px solid var(--color-border-subtle)', color: 'var(--color-text-primary)', whiteSpace: 'nowrap',
  }
  const sepStyle: React.CSSProperties = { width: 1, padding: 0, background: 'var(--color-border-subtle)' }
  const grpTh = (color: string): React.CSSProperties => ({ textAlign: 'center', padding: '5px 8px 2px', fontSize: 9, fontWeight: 500, letterSpacing: '0.05em', color })
  const colTh = (color: string): React.CSSProperties => ({ textAlign: 'right', padding: '2px 8px 6px', fontSize: 9, fontWeight: 500, color, borderBottom: '0.5px solid var(--color-border-subtle)' })

  return (
    <div style={{ background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
      {/* 패널 헤더 */}
      <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Detailed Data Analysis</span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>vs LY: {lyMode === 'date' ? 'Same date' : 'Same period'}</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 780 }}>
          <thead>
            {/* 컬럼 그룹 헤더 */}
            <tr>
              <th style={{ width: 130, textAlign: 'left', padding: '5px 8px 2px', fontSize: 9, fontWeight: 500, color: 'var(--color-text-tertiary)' }} />
              <th colSpan={3} style={grpTh('var(--color-text-tertiary)')}>Current OTB</th>
              <th style={sepStyle} />
              <th colSpan={3} style={grpTh('rgba(0,229,160,0.7)')}>Pickup</th>
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
              {['R/N', 'ADR', 'REV'].map(h => <th key={h} style={colTh('var(--color-text-tertiary)')}>{h}</th>)}
              <th style={{ ...sepStyle, borderBottom: '0.5px solid var(--color-border-subtle)' }} />
              {['R/N', 'ADR', 'REV'].map(h => <th key={'pu-' + h} style={colTh('rgba(0,229,160,0.6)')}>{h}</th>)}
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
                  {/* OTB */}
                  <td style={tdBase}>{row.otb_nights.toLocaleString('ko-KR')}</td>
                  <td style={tdBase}>{fmtK(otbAdr)}</td>
                  <td style={tdBase}>{fmtM(row.otb_revenue)}</td>
                  <td style={sepStyle} />
                  {/* Pickup */}
                  <td style={{ ...tdBase, color: puColor(puRn) }}>{fmtPu(puRn)}</td>
                  <td style={{ ...tdBase, color: puColor(puAdr) }}>{fmtPuK(puAdr)}</td>
                  <td style={{ ...tdBase, color: puColor(puRev) }}>{fmtPuM(puRev)}</td>
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
            <tr style={{ borderTop: '0.5px solid rgba(0,229,160,0.2)' }}>
              <td style={{ ...tdBase, textAlign: 'left', fontWeight: 500, borderBottom: 'none' }}>Total</td>
              <td style={{ ...tdBase, fontWeight: 500, borderBottom: 'none' }}>{totalOtbRn.toLocaleString('ko-KR')}</td>
              <td style={{ ...tdBase, fontWeight: 500, borderBottom: 'none' }}>{fmtK(totalOtbAdr)}</td>
              <td style={{ ...tdBase, fontWeight: 500, borderBottom: 'none' }}>{fmtM(totalOtbRev)}</td>
              <td style={{ ...sepStyle, borderBottom: 'none' }} />
              <td style={{ ...tdBase, fontWeight: 500, color: puColor(totalPuRn), borderBottom: 'none' }}>{fmtPu(totalPuRn)}</td>
              <td style={{ ...tdBase, borderBottom: 'none', color: 'var(--color-text-tertiary)' }}>—</td>
              <td style={{ ...tdBase, fontWeight: 500, color: puColor(totalPuRev), borderBottom: 'none' }}>{fmtPuM(totalPuRev)}</td>
              <td style={{ ...sepStyle, borderBottom: 'none' }} />
              <td style={{ ...tdBase, fontWeight: 500, color: puColor(totalOtbRn - totalLyRn), borderBottom: 'none' }}>{fmtPu(totalOtbRn - totalLyRn)}</td>
              <td style={{ ...tdBase, borderBottom: 'none', color: 'var(--color-text-tertiary)' }}>—</td>
              <td style={{ ...tdBase, fontWeight: 500, color: puColor(totalOtbRev - totalLyRev), borderBottom: 'none' }}>{fmtPuM(totalOtbRev - totalLyRev)}</td>
              <td style={{ ...sepStyle, borderBottom: 'none' }} />
              {/* LY Actual */}
              <td style={{ ...tdBase, fontWeight: 500, borderBottom: 'none', color: 'var(--color-text-secondary)' }}>{totalLyRn > 0 ? totalLyRn.toLocaleString('ko-KR') : '—'}</td>
              <td style={{ ...tdBase, fontWeight: 500, borderBottom: 'none', color: 'var(--color-text-secondary)' }}>{totalLyRn > 0 ? fmtK(totalLyAdr) : '—'}</td>
              <td style={{ ...tdBase, fontWeight: 500, borderBottom: 'none', color: 'var(--color-text-secondary)' }}>{totalLyRev > 0 ? fmtM(totalLyRev) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
