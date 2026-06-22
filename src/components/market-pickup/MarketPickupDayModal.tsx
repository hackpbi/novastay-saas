'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { PickupRow } from '@/hooks/usePickupData'
import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import { buildSegTable } from '@/utils/segmentationTable'
import { WEEKDAY_KR } from '@/utils/pickupPageUtils'
import { getDayColor } from '@/utils/dateUtils'
import MarketPickupSegDetailModal from './MarketPickupSegDetailModal'

const valColor = (v: number) => (v < 0 ? '#E24B4A' : v > 0 ? 'var(--color-text-primary)' : '#555')

export default function MarketPickupDayModal({
  open, onClose, year, month, day, schema, pickupRows, roomCount,
}: {
  open:       boolean
  onClose:    () => void
  year:       number
  month:      number   // 0-based
  day:        number   // 1-based
  schema:     MarketSchemaRow[]
  pickupRows: PickupRow[]
  roomCount:  number
}) {
  const [detail, setDetail] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  if (!open) return null

  const { rows, summary } = buildSegTable({ schema, pickup: pickupRows, year, month: month + 1, roomCount, day })
  const mainRows = rows.filter(r => r.level === 'main' && (r.otbNights > 0 || r.puNights !== 0))
  const dow = new Date(year, month, day).getDay()
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const th: React.CSSProperties = { color: 'var(--color-text-secondary)', fontWeight: 500, padding: '5px 8px' }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-xl"
        style={{ background: '#0a0a0a', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            <span style={{ color: getDayColor(dateStr) }}>{month + 1}월 {day}일 ({WEEKDAY_KR[dow]})</span> 세그먼트별 픽업
          </h2>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-3" style={{ maxHeight: '64vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid #333' }}>
                <th style={{ ...th, textAlign: 'left' }}>세그먼트</th>
                <th style={{ ...th, textAlign: 'right' }}>픽업 R/N</th>
                <th style={{ ...th, textAlign: 'right' }}>픽업 ADR</th>
                <th style={{ ...th, textAlign: 'right' }}>픽업 REV</th>
                <th style={{ width: 1 }} />
              </tr>
            </thead>
            <tbody className="font-mono">
              {mainRows.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '12px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>픽업 데이터 없음</td></tr>
              ) : mainRows.map(r => {
                const vsN = r.otbNights - r.puNights
                const adrK = Math.round(r.puAdr / 1000)
                const adrValid = r.otbNights > 0 && vsN > 0 && adrK !== 0
                const revM = r.puRevenue / 1e6
                return (
                  <tr key={r.id} style={{ borderTop: '0.5px solid #1f1f1f' }}>
                    <td style={{ padding: '5px 8px', color: '#e5e5e5' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: r.bgDarkColor || '#888', flexShrink: 0 }} />
                        {r.name}
                      </span>
                    </td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: valColor(r.puNights) }}>{r.puNights !== 0 ? `${r.puNights > 0 ? '+' : ''}${Math.round(r.puNights)}` : '—'}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: adrValid ? valColor(adrK) : '#555' }}>{adrValid ? `${adrK > 0 ? '+' : ''}${adrK}k` : '—'}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: valColor(r.puRevenue) }}>{r.puRevenue !== 0 ? `${revM > 0 ? '+' : ''}${revM.toFixed(1)}M` : '—'}</td>
                    <td style={{ padding: '5px 0 5px 8px', textAlign: 'right' }}>
                      <button
                        onClick={() => setDetail({ id: r.id, name: r.name })}
                        style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, border: '0.5px solid var(--color-border-default)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        상세
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '0.5px solid #333' }}>
                <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--color-text-primary)' }}>합계</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: summary.puNights >= 0 ? '#00E5A0' : '#E24B4A' }}>{summary.puNights >= 0 ? '+' : ''}{Math.round(summary.puNights)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#555' }}>—</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: summary.puRevenue >= 0 ? '#00E5A0' : '#E24B4A' }}>{summary.puRevenue >= 0 ? '+' : ''}{(summary.puRevenue / 1e6).toFixed(1)}M</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <MarketPickupSegDetailModal
        open={!!detail}
        onClose={() => setDetail(null)}
        date={dateStr}
        mainId={detail?.id ?? ''}
        mainName={detail?.name ?? ''}
        schema={schema}
        pickupRows={pickupRows}
        roomCount={roomCount}
      />
    </div>
  )
}
