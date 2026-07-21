'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { PickupRow } from '@/hooks/usePickupData'
import type { MarketSchemaRow } from '@/hooks/useMarketSchema'
import { buildSegTable } from '@/utils/segmentationTable'
import { WEEKDAY_KR } from '@/utils/pickupPageUtils'
import { getDayColor } from '@/utils/dateUtils'

const deltaColor = (v: number) => (v < 0 ? '#E24B4A' : v > 0 ? 'var(--color-text-primary)' : '#555')

export default function MarketPickupSegDetailModal({
  open, onClose, date, mainId, mainName, schema, pickupRows, roomCount,
}: {
  open:       boolean
  onClose:    () => void
  date:       string   // "YYYY-MM-DD"
  mainId:     string
  mainName:   string
  schema:     MarketSchemaRow[]
  pickupRows: PickupRow[]
  roomCount:  number
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open || !mainId) return null

  const year  = parseInt(date.slice(0, 4))
  const month = parseInt(date.slice(5, 7)) - 1
  const day   = parseInt(date.slice(8, 10))
  const dow   = new Date(year, month, day).getDay()

  const { rows } = buildSegTable({ schema, pickup: pickupRows, year, month: month + 1, roomCount, day })
  const mainRow  = rows.find(r => r.id === mainId)
  const childIds = new Set(schema.filter(c => c.parent_id === mainId).map(c => c.id))
  const childRows = rows.filter(r => childIds.has(r.id))
  const displayRows = mainRow ? [mainRow, ...childRows] : childRows

  // 셀 포맷터
  const otbRn  = (n: number) => n.toLocaleString('ko-KR')
  const otbAdr = (a: number) => `${Math.round(a / 1000)}k`
  const otbRev = (r: number) => `${(r / 1e6).toFixed(1)}M`
  const dRn  = (n: number) => (n !== 0 ? `${n > 0 ? '+' : ''}${Math.round(n)}` : '—')
  const dAdr = (puAdr: number, otbN: number, puN: number) => {
    const vsN = otbN - puN, k = Math.round(puAdr / 1000)
    return otbN > 0 && vsN > 0 && k !== 0 ? `${k > 0 ? '+' : ''}${k}k` : '—'
  }
  const dRev = (r: number) => (r !== 0 ? `${r > 0 ? '+' : ''}${(r / 1e6).toFixed(1)}M` : '—')

  const cap = roomCount > 0 ? roomCount : 1
  const occOtb = mainRow ? (mainRow.otbNights / cap) * 100 : 0
  const occPu  = mainRow ? (mainRow.puNights / cap) * 100 : 0
  const revparOtb = mainRow ? mainRow.otbRevenue / cap : 0
  const revparPu  = mainRow ? mainRow.puRevenue / cap : 0

  const hL: React.CSSProperties = { color: '#666', fontWeight: 400, padding: '4px 8px', textAlign: 'right' }
  const dataR: React.CSSProperties = { padding: '5px 8px', textAlign: 'right', color: '#e5e5e5' }
  const otbBorder = '0.5px solid #333'

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="relative rounded-2xl overflow-hidden flex flex-col w-[92vw] max-w-2xl"
        style={{ background: '#000000', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)', maxHeight: '86vh' }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--divider-color)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            <span style={{ color: getDayColor(date) }}>{month + 1}월 {day}일 ({WEEKDAY_KR[dow]})</span> · {mainName} 상세
          </h2>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors p-1 -mr-1" aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-3" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} className="font-mono">
            <thead>
              <tr>
                <th rowSpan={2} style={{ textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 500, padding: '5px 8px', borderBottom: '0.5px solid #333' }}>SEGMENTATION</th>
                <th colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 500, padding: '5px 8px', borderBottom: '0.5px solid #333', borderLeft: otbBorder }}>현재 OTB</th>
                <th colSpan={3} style={{ textAlign: 'center', color: '#00E5A0', fontWeight: 500, padding: '5px 8px', borderBottom: '0.5px solid #333', borderLeft: otbBorder }}>PICK-UP</th>
              </tr>
              <tr>
                <th style={{ ...hL, borderLeft: otbBorder }}>R/N</th><th style={hL}>ADR</th><th style={hL}>REV</th>
                <th style={{ ...hL, borderLeft: otbBorder }}>ΔR/N</th><th style={hL}>ΔADR</th><th style={hL}>ΔREV</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map(r => {
                const isMain = r.level === 'main'
                return (
                  <tr key={r.id} style={{ borderTop: '0.5px solid #1f1f1f', background: isMain ? 'rgba(0,229,160,0.06)' : 'transparent' }}>
                    <td style={{ padding: '5px 8px', color: isMain ? 'var(--color-text-primary)' : '#bbb', fontWeight: isMain ? 600 : 400, paddingLeft: 8 + r.indent * 14 }}>
                      {!isMain && <span style={{ color: '#555', marginRight: 4 }}>└</span>}{r.name}
                    </td>
                    <td style={{ ...dataR, borderLeft: otbBorder }}>{otbRn(r.otbNights)}</td>
                    <td style={dataR}>{otbAdr(r.otbAdr)}</td>
                    <td style={dataR}>{otbRev(r.otbRevenue)}</td>
                    <td style={{ ...dataR, borderLeft: otbBorder, color: deltaColor(r.puNights) }}>{dRn(r.puNights)}</td>
                    <td style={{ ...dataR, color: deltaColor(r.puAdr) }}>{dAdr(r.puAdr, r.otbNights, r.puNights)}</td>
                    <td style={{ ...dataR, color: deltaColor(r.puRevenue) }}>{dRev(r.puRevenue)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '0.5px solid #333' }}>
                <td style={{ padding: '6px 8px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>OCC</td>
                <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'center', color: '#e5e5e5', borderLeft: otbBorder }}>{occOtb.toFixed(1)}%</td>
                <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'center', color: deltaColor(occPu), borderLeft: otbBorder }}>{occPu !== 0 ? `${occPu > 0 ? '+' : ''}${occPu.toFixed(1)}%` : '—'}</td>
              </tr>
              <tr>
                <td style={{ padding: '6px 8px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>REVPAR</td>
                <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'center', color: '#e5e5e5', borderLeft: otbBorder }}>{Math.round(revparOtb / 1000)}k</td>
                <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'center', color: deltaColor(revparPu), borderLeft: otbBorder }}>{Math.round(revparPu / 1000) !== 0 ? `${revparPu > 0 ? '+' : ''}${Math.round(revparPu / 1000)}k` : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
