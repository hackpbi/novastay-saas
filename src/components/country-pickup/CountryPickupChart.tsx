'use client'

import type { CountryRow } from './types'

// 상위 10개 + 나머지 "기타" 합산
function withOthers(data: CountryRow[]): CountryRow[] {
  if (data.length <= 11) return data
  const top = data.slice(0, 10)
  const rest = data.slice(10)
  const agg = rest.reduce((a, r) => {
    a.otbRn += r.otbRn; a.vsRn += r.vsRn; a.otbRev += r.otbRev; a.vsRev += r.vsRev
    return a
  }, { otbRn: 0, vsRn: 0, otbRev: 0, vsRev: 0 })
  top.push({
    code: 'ETC', name: '기타', ...agg,
    puRn: agg.otbRn - agg.vsRn,
    puAdr: null,
    otbAdr: agg.otbRn > 0 ? Math.round(agg.otbRev / agg.otbRn / 1000) : 0,
  })
  return top
}

export default function CountryPickupChart({ data }: { data: CountryRow[] }) {
  const rows = withOthers(data)
  const max = Math.max(1, ...rows.map(r => r.otbRn))
  const pct = (n: number) => `${Math.min(100, (Math.abs(n) / max) * 100)}%`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(r => (
        <div key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 60, flexShrink: 0, fontSize: 11, color: 'var(--color-text-secondary)', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
          <div style={{ flex: 1, position: 'relative', height: 16, borderRadius: 3, background: 'rgba(255,255,255,0.04)' }}>
            {/* OTB R/N (민트) */}
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: pct(r.otbRn), borderRadius: 3, background: 'rgba(0,229,160,0.45)' }} />
            {/* 픽업 R/N 오버레이 (파랑 / 음수 빨강) */}
            <div style={{ position: 'absolute', left: 0, bottom: 0, height: 5, width: pct(r.puRn), borderRadius: 2, background: r.puRn >= 0 ? '#60A5FA' : '#E24B4A' }} />
          </div>
          <span style={{ width: 96, flexShrink: 0, fontSize: 11, textAlign: 'right', color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {r.otbRn.toLocaleString('ko-KR')}
            <span style={{ marginLeft: 6, color: r.puRn < 0 ? '#E24B4A' : '#60A5FA' }}>{r.puRn > 0 ? '+' : ''}{r.puRn}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
