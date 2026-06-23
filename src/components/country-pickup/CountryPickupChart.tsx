'use client'

import { getFlagEmoji, type CountryPickupRpcRow } from './types'

type Agg = { country: string; country_name_ko: string; alpha2: string; otb_nights: number; vs_nights: number }

const GRID = '80px 1fr 36px 28px'

export default function CountryPickupChart({ data }: { data: CountryPickupRpcRow[] }) {
  // country 기준 집계 (segmentation/account_name 합산)
  const aggregated = Object.values(
    data.reduce((acc, row) => {
      const key = row.country
      if (!acc[key]) acc[key] = { country: row.country, country_name_ko: row.country_name_ko, alpha2: row.alpha2, otb_nights: 0, vs_nights: 0 }
      acc[key].otb_nights += row.otb_nights ?? 0
      acc[key].vs_nights  += row.vs_nights ?? 0
      return acc
    }, {} as Record<string, Agg>),
  ).sort((a, b) => b.otb_nights - a.otb_nights)

  const totalOtbRn = aggregated.reduce((s, r) => s + r.otb_nights, 0)
  const totalPuRn  = aggregated.reduce((s, r) => s + (r.otb_nights - r.vs_nights), 0)
  const maxRn = Math.max(...aggregated.map(r => r.otb_nights), 1)

  return (
    <div style={{ background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
          국가별 실적 현황{' '}
          <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}>Country Performance · Room Nights</span>
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Pickup R/N</span>
      </div>

      {/* 본문 */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* 범례 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          {([['#00E5A0', 'OTB R/N'], ['rgba(0,229,160,0.25)', 'Pickup R/N']] as const).map(([bg, lbl]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: bg }} />{lbl}
            </div>
          ))}
        </div>

        {/* 국가 행 */}
        {aggregated.map(row => {
          const puRn = row.otb_nights - row.vs_nights
          const barPct = (row.otb_nights / maxRn) * 100
          const puColor = puRn > 0 ? '#00B883' : puRn < 0 ? '#E24B4A' : 'var(--color-text-tertiary)'
          return (
            <div key={row.country} style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 6, padding: '2px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>{getFlagEmoji(row.alpha2)}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.country_name_ko}</span>
              </div>
              <div style={{ height: 8, background: 'var(--color-bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${barPct}%`, height: '100%', background: '#00E5A0', borderRadius: 3, minWidth: 1, opacity: 0.9 }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.otb_nights.toLocaleString('ko-KR')}</div>
              <div style={{ fontSize: 10, textAlign: 'right', color: puColor, fontVariantNumeric: 'tabular-nums' }}>{puRn > 0 ? `+${puRn}` : puRn === 0 ? '0' : puRn}</div>
            </div>
          )
        })}

        {/* 구분선 + 합계 */}
        <div style={{ height: '0.5px', background: 'var(--color-border-subtle)', margin: '4px 0' }} />
        <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)' }}>합계</div>
          <div />
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{totalOtbRn.toLocaleString('ko-KR')}</div>
          <div style={{ fontSize: 10, fontWeight: 500, textAlign: 'right', color: totalPuRn >= 0 ? '#00B883' : '#E24B4A', fontVariantNumeric: 'tabular-nums' }}>{totalPuRn > 0 ? `+${totalPuRn}` : totalPuRn}</div>
        </div>
      </div>
    </div>
  )
}
