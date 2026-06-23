'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, X, Download, ChevronDown } from 'lucide-react'
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

  const [selectedMonths, setSelectedMonths] = useState<number[]>([currentMonth])
  const [selectedSeg, setSelectedSeg] = useState<string>('All')
  const [selectedAcc, setSelectedAcc] = useState<string>('All')
  const [accOpen, setAccOpen] = useState(false)

  // 어카운트 목록 — 선택 세그먼트 기준 필터
  const accountOptions = useMemo(() => {
    const filtered = selectedSeg === 'All' ? data : data.filter(r => r.sorting2 === selectedSeg)
    return ['All', ...Array.from(new Set(filtered.map(r => r.account_name).filter(Boolean))).sort()]
  }, [data, selectedSeg])

  const toggleMonth = (m: number) => {
    setSelectedMonths(prev => (prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]))
  }
  const handleSegChange = (seg: string) => {
    setSelectedSeg(seg)
    setSelectedAcc('All')   // 세그먼트 변경 시 어카운트 초기화
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
  // 페이지 상단 필터와 동일한 pill 스타일
  const pill = (on: boolean): React.CSSProperties => ({
    padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 500, cursor: 'pointer',
    border: on ? '1px solid #00E5A0' : '0.5px solid rgba(255,255,255,0.1)',
    background: on ? 'rgba(0,229,160,0.07)' : 'transparent',
    color: on ? '#00E5A0' : 'rgba(255,255,255,0.4)',
  })

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

          {/* 세그먼트 — 페이지 필터와 동일한 pill */}
          <div style={{ marginBottom: 14 }}>
            <div style={sectionLbl}>SEGMENT</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => handleSegChange('All')} style={pill(selectedSeg === 'All')}>전체</button>
              {segOptions.filter(s => s !== 'All').map(seg => (
                <button key={seg} onClick={() => handleSegChange(seg)} style={pill(selectedSeg === seg)}>{seg.toUpperCase()}</button>
              ))}
            </div>
          </div>

          {/* 어카운트 — 페이지 필터와 동일한 드롭다운 */}
          <div>
            <div style={sectionLbl}>ACCOUNT</div>
            <button
              onClick={() => setAccOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, width: '100%',
                padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 11,
                border: `0.5px solid ${selectedAcc !== 'All' ? '#00E5A0' : 'rgba(255,255,255,0.1)'}`,
                background: selectedAcc !== 'All' ? 'rgba(0,229,160,0.07)' : 'transparent',
                color: selectedAcc !== 'All' ? '#00E5A0' : 'rgba(255,255,255,0.4)',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedAcc === 'All' ? '전체' : selectedAcc}</span>
              <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.6 }} />
            </button>
            {accOpen && (
              <div style={{ marginTop: 6, border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, maxHeight: 150, overflowY: 'auto', background: '#0d1014' }}>
                {accountOptions.map(acc => {
                  const on = selectedAcc === acc
                  return (
                    <div key={acc} onClick={() => { setSelectedAcc(acc); setAccOpen(false) }}
                      style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', color: on ? '#00E5A0' : 'rgba(255,255,255,0.55)', background: on ? 'rgba(0,229,160,0.07)' : 'transparent' }}
                      onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                      onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                      {acc === 'All' ? '전체' : acc}
                    </div>
                  )
                })}
              </div>
            )}
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
