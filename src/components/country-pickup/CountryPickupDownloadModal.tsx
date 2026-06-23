'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, X, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { CountryPickupRpcRow } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function CountryPickupDownloadModal({ data, currentMonth, currentYear, onClose }: {
  data:         CountryPickupRpcRow[]
  currentMonth: number   // 1-based
  currentYear:  number
  onClose:      () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const segOptions = useMemo(() => ['All', ...Array.from(new Set(data.map(r => r.sorting2).filter(Boolean)))], [data])
  const accountOptions = useMemo(() => ['All', ...Array.from(new Set(data.map(r => r.account_name).filter(Boolean))).sort()], [data])

  const [selectedMonths, setSelectedMonths] = useState<number[]>([currentMonth])
  const [selectedSeg, setSelectedSeg] = useState<string>('All')
  const [selectedAcc, setSelectedAcc] = useState<string>('All')

  const toggleMonth = (m: number) => {
    setSelectedMonths(prev => (prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]))
  }

  const handleDownload = () => {
    const filtered = data.filter(row => {
      const segOk = selectedSeg === 'All' || row.sorting2 === selectedSeg
      const accOk = selectedAcc === 'All' || row.account_name === selectedAcc
      return segOk && accOk
    })

    const aggregated = Object.values(
      filtered.reduce((acc, row) => {
        const key = row.country
        if (!acc[key]) acc[key] = {
          Country: row.country_name_en || row.country_name_ko,
          _otbRn: 0, _vsRn: 0, _otbRev: 0, _vsRev: 0, _lyRn: 0, _lyRev: 0,
        }
        acc[key]._otbRn  += row.otb_nights ?? 0
        acc[key]._vsRn   += row.vs_nights ?? 0
        acc[key]._otbRev += row.otb_revenue ?? 0
        acc[key]._vsRev  += row.vs_revenue ?? 0
        acc[key]._lyRn   += row.ly_nights ?? 0
        acc[key]._lyRev  += row.ly_revenue ?? 0
        return acc
      }, {} as Record<string, any>),
    ).map((row: any) => {
      const otbAdr = row._otbRn > 0 ? Math.round(row._otbRev / row._otbRn) : 0
      const vsAdr  = row._vsRn  > 0 ? Math.round(row._vsRev  / row._vsRn)  : 0
      const lyAdr  = row._lyRn  > 0 ? Math.round(row._lyRev  / row._lyRn)  : 0
      return {
        Country: row.Country,
        'OTB R/N': row._otbRn,
        'OTB ADR': otbAdr,
        'OTB REV': row._otbRev,
        'Pickup R/N': row._otbRn - row._vsRn,
        'Pickup ADR': otbAdr - vsAdr,
        'Pickup REV': row._otbRev - row._vsRev,
        'vs LY R/N': row._otbRn - row._lyRn,
        'vs LY ADR': otbAdr - lyAdr,
        'vs LY REV': row._otbRev - row._lyRev,
        'LY R/N': row._lyRn,
        'LY ADR': lyAdr,
        'LY REV': row._lyRev,
      }
    }).sort((a: any, b: any) => b['OTB R/N'] - a['OTB R/N'])

    const ws = XLSX.utils.json_to_sheet(aggregated)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Country Pickup')
    const monthStr = [...selectedMonths].sort((a, b) => a - b).map(m => String(m).padStart(2, '0')).join('-')
    XLSX.writeFile(wb, `Country_Pickup_${currentYear}_${monthStr}.xlsx`)
    onClose()
  }

  const chip = (on: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
    border: `0.5px solid ${on ? '#00E5A0' : 'rgba(255,255,255,0.1)'}`,
    background: on ? 'rgba(0,229,160,0.07)' : 'transparent',
    color: on ? '#00E5A0' : 'rgba(255,255,255,0.4)',
  })
  const sectionLbl: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', marginBottom: 6 }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#111418', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, width: 420, maxWidth: '92vw', overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ padding: '14px 18px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: '#fff' }}>
            <FileSpreadsheet size={16} color="#00E5A0" />
            Export to Excel
          </div>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: '50%', border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={13} />
          </button>
        </div>

        {/* 바디 */}
        <div style={{ padding: 18 }}>
          {/* 월 선택 */}
          <div style={{ marginBottom: 16 }}>
            <div style={sectionLbl}>MONTH <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400 }}>· multiple</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 4 }}>
              {MONTHS.map((label, i) => {
                const m = i + 1
                const on = selectedMonths.includes(m)
                return <div key={m} onClick={() => toggleMonth(m)} style={{ ...chip(on), textAlign: 'center', padding: '4px 0' }}>{label}</div>
              })}
            </div>
          </div>

          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

          {/* 세그먼트 */}
          <div style={{ marginBottom: 14 }}>
            <div style={sectionLbl}>SEGMENT</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {segOptions.map(seg => (
                <div key={seg} onClick={() => setSelectedSeg(seg)} style={chip(selectedSeg === seg)}>{seg === 'All' ? 'All' : seg.toUpperCase()}</div>
              ))}
            </div>
          </div>

          {/* 어카운트 */}
          <div>
            <div style={sectionLbl}>ACCOUNT</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxHeight: 100, overflowY: 'auto' }}>
              {accountOptions.map(acc => (
                <div key={acc} onClick={() => setSelectedAcc(acc)} style={chip(selectedAcc === acc)}>{acc}</div>
              ))}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div style={{ padding: '12px 18px', borderTop: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '6px 16px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleDownload}
            disabled={selectedMonths.length === 0}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none',
              background: selectedMonths.length === 0 ? 'rgba(0,229,160,0.3)' : '#00E5A0',
              color: '#0a0a0a', fontSize: 12, fontWeight: 500, cursor: selectedMonths.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <Download size={13} />
            Download Excel
          </button>
        </div>
      </div>
    </div>
  )
}
