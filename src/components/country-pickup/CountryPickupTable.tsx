'use client'

import { fmtK, fmtM } from '@/utils/pickupPageUtils'
import { getFlagClass, type CountryPickupRpcRow } from './types'

type Agg = { country: string; country_name_ko: string; country_name_en: string; alpha2: string; otb_nights: number; vs_nights: number; otb_revenue: number; vs_revenue: number }

const puColor = (v: number) => (v > 0 ? '#00B883' : v < 0 ? '#E24B4A' : 'var(--color-text-tertiary)')
const fmtPu  = (v: number) => (v === 0 ? '—' : v > 0 ? `+${v}` : `${v}`)
const fmtPuK = (v: number) => (v === 0 ? '—' : v > 0 ? `+${fmtK(v)}` : fmtK(v))
const fmtPuM = (v: number) => (v === 0 ? '—' : v > 0 ? `+${fmtM(v)}` : fmtM(v))

export default function CountryPickupTable({ data }: { data: CountryPickupRpcRow[] }) {
  const aggregated = Object.values(
    data.reduce((acc, row) => {
      const key = row.country
      if (!acc[key]) acc[key] = { country: row.country, country_name_ko: row.country_name_ko, country_name_en: row.country_name_en, alpha2: row.alpha2, otb_nights: 0, vs_nights: 0, otb_revenue: 0, vs_revenue: 0 }
      acc[key].otb_nights  += row.otb_nights ?? 0
      acc[key].vs_nights   += row.vs_nights ?? 0
      acc[key].otb_revenue += row.otb_revenue ?? 0
      acc[key].vs_revenue  += row.vs_revenue ?? 0
      return acc
    }, {} as Record<string, Agg>),
  ).sort((a, b) => b.otb_nights - a.otb_nights)

  const totalOtbRn  = aggregated.reduce((s, r) => s + r.otb_nights, 0)
  const totalPuRn   = aggregated.reduce((s, r) => s + (r.otb_nights - r.vs_nights), 0)
  const totalOtbRev = aggregated.reduce((s, r) => s + r.otb_revenue, 0)
  const totalPuRev  = aggregated.reduce((s, r) => s + (r.otb_revenue - r.vs_revenue), 0)
  const totalOtbAdr = totalOtbRn > 0 ? Math.round(totalOtbRev / totalOtbRn) : 0

  const tdBase: React.CSSProperties = { padding: '6px 10px', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '0.5px solid var(--color-border-subtle)' }
  const thOtb: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '3px 10px 6px', textAlign: 'right', borderBottom: '0.5px solid var(--color-border-subtle)' }
  const thPu: React.CSSProperties = { ...thOtb, color: 'rgba(0,229,160,0.65)' }

  return (
    <div style={{ background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-subtle)' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
          Detailed Data Analysis
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', borderBottom: '0.5px solid var(--color-border-subtle)', width: 110 }}>국가</th>
              <th colSpan={3} style={{ textAlign: 'center', padding: '6px 10px 2px', fontSize: 9, fontWeight: 500, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em' }}>Current OTB</th>
              <th colSpan={3} style={{ textAlign: 'center', padding: '6px 10px 2px', fontSize: 9, fontWeight: 500, color: 'rgba(0,229,160,0.7)', letterSpacing: '0.05em' }}>Pickup</th>
            </tr>
            <tr>
              {['R/N', 'ADR', 'REV'].map(h => <th key={h} style={thOtb}>{h}</th>)}
              {['R/N', 'ADR', 'REV'].map(h => <th key={'pu-' + h} style={thPu}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {aggregated.map(row => {
              const puRn  = row.otb_nights - row.vs_nights
              const puRev = row.otb_revenue - row.vs_revenue
              const otbAdr = row.otb_nights > 0 ? Math.round(row.otb_revenue / row.otb_nights) : 0
              const vsAdr  = row.vs_nights  > 0 ? Math.round(row.vs_revenue  / row.vs_nights)  : 0
              const puAdr  = otbAdr - vsAdr
              return (
                <tr key={row.country}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-primary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...tdBase, textAlign: 'left', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      {row.alpha2
                        ? <span className={getFlagClass(row.alpha2)} style={{ fontSize: 13, width: 16, flexShrink: 0 }} />
                        : <span style={{ fontSize: 13, flexShrink: 0 }}>🌐</span>}
                      <span style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{row.country_name_en || row.country_name_ko}</span>
                    </div>
                  </td>
                  <td style={{ ...tdBase, color: 'var(--color-text-primary)' }}>{row.otb_nights.toLocaleString('ko-KR')}</td>
                  <td style={{ ...tdBase, color: 'var(--color-text-primary)' }}>{fmtK(otbAdr)}</td>
                  <td style={{ ...tdBase, color: 'var(--color-text-primary)' }}>{fmtM(row.otb_revenue)}</td>
                  <td style={{ ...tdBase, color: puColor(puRn) }}>{fmtPu(puRn)}</td>
                  <td style={{ ...tdBase, color: puColor(puAdr) }}>{fmtPuK(puAdr)}</td>
                  <td style={{ ...tdBase, color: puColor(puRev) }}>{fmtPuM(puRev)}</td>
                </tr>
              )
            })}
            {/* 합계 행 */}
            <tr style={{ borderTop: '0.5px solid rgba(0,229,160,0.25)' }}>
              <td style={{ ...tdBase, textAlign: 'left', fontWeight: 500, borderBottom: 'none', color: 'var(--color-text-primary)' }}>Total</td>
              <td style={{ ...tdBase, fontWeight: 500, borderBottom: 'none', color: 'var(--color-text-primary)' }}>{totalOtbRn.toLocaleString('ko-KR')}</td>
              <td style={{ ...tdBase, fontWeight: 500, borderBottom: 'none', color: 'var(--color-text-primary)' }}>{fmtK(totalOtbAdr)}</td>
              <td style={{ ...tdBase, fontWeight: 500, borderBottom: 'none', color: 'var(--color-text-primary)' }}>{fmtM(totalOtbRev)}</td>
              <td style={{ ...tdBase, fontWeight: 500, borderBottom: 'none', color: puColor(totalPuRn) }}>{fmtPu(totalPuRn)}</td>
              <td style={{ ...tdBase, borderBottom: 'none', color: 'var(--color-text-tertiary)' }}>—</td>
              <td style={{ ...tdBase, fontWeight: 500, borderBottom: 'none', color: puColor(totalPuRev) }}>{fmtPuM(totalPuRev)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
