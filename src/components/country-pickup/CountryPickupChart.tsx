'use client'

import type { CountryRow } from './types'

// 국가코드(ISO3) → 국기 이모지
export const COUNTRY_FLAGS: Record<string, string> = {
  KOR: '🇰🇷', USA: '🇺🇸', CHN: '🇨🇳', SGP: '🇸🇬', DEU: '🇩🇪', ISR: '🇮🇱',
  JPN: '🇯🇵', GBR: '🇬🇧', AUS: '🇦🇺', HKG: '🇭🇰', IDN: '🇮🇩', IRL: '🇮🇪',
  IND: '🇮🇳', TWN: '🇹🇼', FRA: '🇫🇷', ITA: '🇮🇹', NLD: '🇳🇱', BGD: '🇧🇩',
  THA: '🇹🇭', AUT: '🇦🇹', CAN: '🇨🇦', OTH: '🌐', ETC: '🌐',
}

// 상위 10개 + 나머지 "기타" 합산
function withOthers(data: CountryRow[]): CountryRow[] {
  if (data.length <= 11) return data
  const top = data.slice(0, 10)
  const rest = data.slice(10)
  const agg = rest.reduce((a, r) => {
    a.otbRn += r.otbRn; a.vsRn += r.vsRn; a.otbRev += r.otbRev; a.vsRev += r.vsRev
    return a
  }, { otbRn: 0, vsRn: 0, otbRev: 0, vsRev: 0 })
  top.push({ code: 'ETC', name: '기타', ...agg, puRn: agg.otbRn - agg.vsRn, puAdr: null, otbAdr: agg.otbRn > 0 ? Math.round(agg.otbRev / agg.otbRn / 1000) : 0 })
  return top
}

const GRID = '80px 1fr 36px 28px'

export default function CountryPickupChart({ data }: { data: CountryRow[] }) {
  const rows = withOthers(data)
  const maxOtbRn = Math.max(1, ...rows.map(r => r.otbRn))
  const totalOtbRn = rows.reduce((s, r) => s + r.otbRn, 0)
  const totalPuRn  = rows.reduce((s, r) => s + r.puRn, 0)

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: '#00E5A0' }} />OTB R/N
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(0,229,160,0.25)' }} />Pickup R/N
          </div>
        </div>

        {/* 국가 행 */}
        {rows.map(row => {
          const barPct = (row.otbRn / maxOtbRn) * 100
          const puColor = row.puRn > 0 ? '#00B883' : row.puRn < 0 ? '#E24B4A' : 'var(--color-text-tertiary)'
          return (
            <div key={row.code} style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 6, padding: '2px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ fontSize: 13 }}>{COUNTRY_FLAGS[row.code] ?? '🌐'}</span>
                {row.name}
              </div>
              <div style={{ height: 8, background: 'var(--color-bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${barPct}%`, height: '100%', background: '#00E5A0', borderRadius: 3, minWidth: 1, opacity: 0.9 }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.otbRn.toLocaleString('ko-KR')}</div>
              <div style={{ fontSize: 10, textAlign: 'right', color: puColor, fontVariantNumeric: 'tabular-nums' }}>{row.puRn > 0 ? `+${row.puRn}` : row.puRn === 0 ? '0' : row.puRn}</div>
            </div>
          )
        })}

        {/* 구분선 + 합계 */}
        <div style={{ height: '0.5px', background: 'var(--color-border-subtle)', margin: '4px 0' }} />
        <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)' }}>합계</div>
          <div />
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{totalOtbRn.toLocaleString('ko-KR')}</div>
          <div style={{ fontSize: 10, fontWeight: 500, textAlign: 'right', color: totalPuRn < 0 ? '#E24B4A' : '#00B883', fontVariantNumeric: 'tabular-nums' }}>{totalPuRn > 0 ? '+' : ''}{totalPuRn}</div>
        </div>
      </div>
    </div>
  )
}
