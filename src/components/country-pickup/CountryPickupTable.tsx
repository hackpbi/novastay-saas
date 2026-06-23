'use client'

import type { CountryRow } from './types'
import { fmtM } from '@/utils/pickupPageUtils'
import { COUNTRY_FLAGS } from './CountryPickupChart'

const numCell = (color: string): React.CSSProperties => ({ padding: '6px 10px', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color })

export default function CountryPickupTable({ data }: { data: CountryRow[] }) {
  const tot = data.reduce((a, r) => {
    a.otbRn += r.otbRn; a.otbRev += r.otbRev; a.vsRev += r.vsRev; a.puRn += r.puRn
    return a
  }, { otbRn: 0, otbRev: 0, vsRev: 0, puRn: 0 })
  const totalOtbAdr = tot.otbRn > 0 ? Math.round(tot.otbRev / tot.otbRn / 1000) : 0
  const totalPuRev  = tot.otbRev - tot.vsRev

  const thOtb: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '3px 10px 6px', textAlign: 'right', borderBottom: '0.5px solid var(--color-border-subtle)' }
  const thPu: React.CSSProperties = { ...thOtb, color: 'rgba(0,229,160,0.65)' }

  return (
    <div style={{ background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-subtle)' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
          세부 데이터 분석 테이블{' '}
          <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}>Detailed Data Analysis Table</span>
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)', borderBottom: '0.5px solid var(--color-border-subtle)', width: 76 }}>국가</th>
              <th colSpan={3} style={{ textAlign: 'center', padding: '6px 10px 2px', fontSize: 9, fontWeight: 500, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em' }}>현재 OTB</th>
              <th colSpan={3} style={{ textAlign: 'center', padding: '6px 10px 2px', fontSize: 9, fontWeight: 500, color: 'rgba(0,229,160,0.7)', letterSpacing: '0.05em' }}>픽업 (Pickup)</th>
            </tr>
            <tr>
              {['R/N', 'ADR', 'REV'].map(h => <th key={h} style={thOtb}>{h}</th>)}
              {['R/N', 'ADR', 'REV'].map(h => <th key={'pu-' + h} style={thPu}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map(row => {
              const puRev = row.otbRev - row.vsRev
              const puRnColor  = row.puRn > 0 ? '#00B883' : row.puRn < 0 ? '#E24B4A' : 'var(--color-text-tertiary)'
              const puAdrColor = (row.puAdr ?? 0) > 0 ? '#00B883' : (row.puAdr ?? 0) < 0 ? '#E24B4A' : 'var(--color-text-tertiary)'
              const puRevColor = puRev > 0 ? '#00B883' : puRev < 0 ? '#E24B4A' : 'var(--color-text-tertiary)'
              return (
                <tr key={row.code} style={{ borderBottom: '0.5px solid var(--color-border-subtle)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '6px 10px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ fontSize: 13 }}>{COUNTRY_FLAGS[row.code] ?? '🌐'}</span>
                      {row.name}
                    </div>
                  </td>
                  <td style={numCell('var(--color-text-primary)')}>{row.otbRn.toLocaleString('ko-KR')}</td>
                  <td style={numCell('var(--color-text-primary)')}>{row.otbAdr}k</td>
                  <td style={numCell('var(--color-text-primary)')}>{fmtM(row.otbRev)}</td>
                  <td style={numCell(puRnColor)}>{row.puRn === 0 ? '—' : `${row.puRn > 0 ? '+' : ''}${row.puRn}`}</td>
                  <td style={numCell(puAdrColor)}>{row.puAdr == null || row.puAdr === 0 ? '—' : `${row.puAdr > 0 ? '+' : ''}${row.puAdr}k`}</td>
                  <td style={numCell(puRevColor)}>{puRev === 0 ? '—' : `${puRev > 0 ? '+' : ''}${fmtM(puRev)}`}</td>
                </tr>
              )
            })}
            {/* 합계 행 */}
            <tr style={{ borderTop: '0.5px solid rgba(0,229,160,0.25)' }}>
              <td style={{ padding: '6px 10px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)' }}>합계</td>
              <td style={{ ...numCell('var(--color-text-primary)'), fontWeight: 500 }}>{tot.otbRn.toLocaleString('ko-KR')}</td>
              <td style={{ ...numCell('var(--color-text-primary)'), fontWeight: 500 }}>{totalOtbAdr}k</td>
              <td style={{ ...numCell('var(--color-text-primary)'), fontWeight: 500 }}>{fmtM(tot.otbRev)}</td>
              <td style={{ ...numCell(tot.puRn < 0 ? '#E24B4A' : '#00B883'), fontWeight: 500 }}>{tot.puRn > 0 ? '+' : ''}{tot.puRn}</td>
              <td style={numCell('var(--color-text-tertiary)')}>—</td>
              <td style={{ ...numCell(totalPuRev < 0 ? '#E24B4A' : '#00B883'), fontWeight: 500 }}>{totalPuRev > 0 ? '+' : ''}{fmtM(totalPuRev)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
