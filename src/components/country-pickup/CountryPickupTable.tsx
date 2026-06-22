'use client'

import type { CountryRow } from './types'
import { fmtM } from '@/utils/pickupPageUtils'

const valColor = (v: number) => (v < 0 ? '#E24B4A' : v > 0 ? 'var(--color-text-primary)' : '#555')

export default function CountryPickupTable({ data }: { data: CountryRow[] }) {
  const tot = data.reduce((a, r) => {
    a.otbRn += r.otbRn; a.vsRn += r.vsRn; a.otbRev += r.otbRev; a.vsRev += r.vsRev
    return a
  }, { otbRn: 0, vsRn: 0, otbRev: 0, vsRev: 0 })
  const totPuRn  = tot.otbRn - tot.vsRn
  const totPuRev = tot.otbRev - tot.vsRev
  const totOtbAdr = tot.otbRn > 0 ? Math.round(tot.otbRev / tot.otbRn / 1000) : 0

  const th: React.CSSProperties = { color: 'var(--color-text-secondary)', fontWeight: 500, padding: '6px 8px', position: 'sticky', top: 0, background: '#0a0a0a' }
  const td: React.CSSProperties = { padding: '5px 8px', textAlign: 'right', color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ overflow: 'auto', maxHeight: 460 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }} className="font-mono">
        <thead>
          <tr style={{ borderBottom: '0.5px solid #333' }}>
            <th style={{ ...th, textAlign: 'left' }}>국가</th>
            <th style={{ ...th, textAlign: 'right' }}>OTB R/N</th>
            <th style={{ ...th, textAlign: 'right' }}>OTB ADR</th>
            <th style={{ ...th, textAlign: 'right' }}>OTB REV</th>
            <th style={{ ...th, textAlign: 'right', borderLeft: '0.5px solid #333' }}>픽업 R/N</th>
            <th style={{ ...th, textAlign: 'right' }}>픽업 ADR</th>
            <th style={{ ...th, textAlign: 'right' }}>픽업 REV</th>
          </tr>
        </thead>
        <tbody>
          {data.map(r => {
            const puRev = r.otbRev - r.vsRev
            return (
              <tr key={r.code} style={{ borderTop: '0.5px solid #1f1f1f' }}>
                <td style={{ padding: '5px 8px', color: '#e5e5e5', whiteSpace: 'nowrap' }}>{r.name}</td>
                <td style={td}>{r.otbRn.toLocaleString('ko-KR')}</td>
                <td style={td}>{r.otbAdr}k</td>
                <td style={td}>{fmtM(r.otbRev)}</td>
                <td style={{ ...td, borderLeft: '0.5px solid #1f1f1f', color: valColor(r.puRn) }}>{r.puRn !== 0 ? `${r.puRn > 0 ? '+' : ''}${r.puRn}` : '—'}</td>
                <td style={{ ...td, color: r.puAdr == null ? '#555' : valColor(r.puAdr) }}>{r.puAdr != null && r.puAdr !== 0 ? `${r.puAdr > 0 ? '+' : ''}${r.puAdr}k` : '—'}</td>
                <td style={{ ...td, color: valColor(puRev) }}>{puRev !== 0 ? `${puRev > 0 ? '+' : ''}${fmtM(puRev)}` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ position: 'sticky', bottom: 0, background: '#0a0a0a', borderTop: '0.5px solid #333' }}>
            <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--color-text-primary)' }}>합계</td>
            <td style={{ ...td, fontWeight: 600 }}>{tot.otbRn.toLocaleString('ko-KR')}</td>
            <td style={{ ...td, fontWeight: 600 }}>{totOtbAdr}k</td>
            <td style={{ ...td, fontWeight: 600 }}>{fmtM(tot.otbRev)}</td>
            <td style={{ ...td, fontWeight: 600, borderLeft: '0.5px solid #333', color: totPuRn < 0 ? '#E24B4A' : '#00E5A0' }}>{totPuRn > 0 ? '+' : ''}{totPuRn}</td>
            <td style={{ ...td, fontWeight: 600, color: '#555' }}>—</td>
            <td style={{ ...td, fontWeight: 600, color: totPuRev < 0 ? '#E24B4A' : '#00E5A0' }}>{totPuRev > 0 ? '+' : ''}{fmtM(totPuRev)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
