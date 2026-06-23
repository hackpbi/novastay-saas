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

  const [selectedMonths, setSelectedMonths] = useState<number[]>([currentMonth])
  const [selectedGroup, setSelectedGroup] = useState<'전체' | 'fit' | 'group'>('전체')
  const [selectedSegs, setSelectedSegs] = useState<string[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])   // 다중 선택
  const [segExpanded, setSegExpanded] = useState(false)
  const [accExpanded, setAccExpanded] = useState(false)

  // sorting2 그룹 → 하위 세그먼트 목록
  const segList = useMemo(() => {
    if (selectedGroup === '전체') return []
    const filtered = data.filter(r => r.sorting2 === selectedGroup)
    return Array.from(new Set(filtered.map(r => r.segmentation).filter(Boolean))).sort()
  }, [data, selectedGroup])

  // 선택 그룹/세그 기준 어카운트 목록
  const accountList = useMemo(() => {
    let filtered = data
    if (selectedGroup !== '전체') filtered = filtered.filter(r => r.sorting2 === selectedGroup)
    if (selectedSegs.length > 0) filtered = filtered.filter(r => selectedSegs.includes(r.segmentation))
    return Array.from(new Set(filtered.map(r => r.account_name).filter(Boolean))).sort()
  }, [data, selectedGroup, selectedSegs])

  const toggleMonth = (m: number) => {
    setSelectedMonths(prev => (prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]))
  }
  const handleGroupChange = (g: '전체' | 'fit' | 'group') => {
    setSelectedGroup(g); setSelectedSegs([]); setSelectedAccounts([])
    setSegExpanded(g !== '전체'); setAccExpanded(false)
  }
  const toggleSeg = (seg: string) => {
    setSelectedSegs(prev => (prev.includes(seg) ? prev.filter(x => x !== seg) : [...prev, seg]))
    setSelectedAccounts([])
  }
  const toggleAccount = (acc: string) => {
    setSelectedAccounts(prev => (prev.includes(acc) ? prev.filter(x => x !== acc) : [...prev, acc]))
  }

  const handleDownload = () => {
    const filtered = data.filter(row => {
      const groupOk = selectedGroup === '전체' || row.sorting2 === selectedGroup
      const segOk   = selectedSegs.length === 0 || selectedSegs.includes(row.segmentation)
      const accOk   = selectedAccounts.length === 0 || selectedAccounts.includes(row.account_name)
      return groupOk && segOk && accOk
    })

    const rows = filtered.map(row => {
      const adr = (row.otb_nights ?? 0) > 0
        ? Math.round((row.otb_revenue ?? 0) / (row.otb_nights ?? 0))
        : 0
      return {
        'Year'        : currentYear,
        'Month'       : currentMonth,
        'Account'     : row.account_name  || '(미지정)',
        'Segmentation': row.segmentation  || '(미지정)',
        'R/N'         : row.otb_nights,
        'ADR'         : adr,
        'REV'         : row.otb_revenue,
      }
    }).sort((a, b) => a.Account.localeCompare(b.Account))

    const ws = XLSX.utils.json_to_sheet(rows)
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
  const sectionLbl: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', marginBottom: 8 }
  // 그룹 pill (전체/FIT/GROUP)
  const groupBtn = (on: boolean): React.CSSProperties => ({
    padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 500, cursor: 'pointer',
    border: on ? '1px solid #00E5A0' : '0.5px solid rgba(255,255,255,0.1)',
    background: on ? 'rgba(0,229,160,0.07)' : 'transparent',
    color: on ? '#00E5A0' : 'rgba(255,255,255,0.4)',
  })
  // 초기화 / 전체선택 / 완료 액션바
  const actionRow: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '8px 6px 4px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }
  const actBtn: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)' }
  const doneBtn: React.CSSProperties = { padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: 'none', background: '#00E5A0', color: '#0a0a0a' }
  const collapsedBar: React.CSSProperties = { marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', background: '#0a0a0a', cursor: 'pointer', fontSize: 11, color: '#fff' }

  // 체크박스 행 (세그/어카운트 공용)
  const checkRow = (label: string, checked: boolean, onChange: () => void) => (
    <label key={label}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', cursor: 'pointer', borderRadius: 4 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ accentColor: '#00E5A0', width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: checked ? '#fff' : 'rgba(255,255,255,0.5)' }}>{label}</span>
    </label>
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#0a0a0a', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, width: 420, maxWidth: '92vw', overflow: 'hidden' }}>
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

          {/* 세그먼트 — 그룹(전체/FIT/GROUP) + 하위 세그 다중선택 */}
          <div style={{ marginBottom: 14 }}>
            <div style={sectionLbl}>SEGMENT</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {(['전체', 'fit', 'group'] as const).map(g => (
                <button key={g} onClick={() => handleGroupChange(g)} style={groupBtn(selectedGroup === g)}>
                  {g === '전체' ? '전체' : g === 'fit' ? 'FIT' : 'GROUP'}
                </button>
              ))}
            </div>
            {selectedGroup !== '전체' && (
              segExpanded ? (
                <div style={{ marginTop: 8, borderTop: '0.5px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 0' }}>
                    {segList.length === 0
                      ? <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: '5px 4px' }}>세그먼트 없음</div>
                      : segList.map(seg => checkRow(seg, selectedSegs.includes(seg), () => toggleSeg(seg)))}
                  </div>
                  <div style={actionRow}>
                    <button onClick={() => setSelectedSegs([])} style={actBtn}>초기화</button>
                    <button onClick={() => setSelectedSegs([...segList])} style={actBtn}>전체선택</button>
                    <button onClick={() => setSegExpanded(false)} style={doneBtn}>완료</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => setSegExpanded(true)} style={collapsedBar}>
                  <span style={{ color: selectedSegs.length === 0 ? 'rgba(255,255,255,0.4)' : '#fff' }}>
                    {selectedSegs.length === 0 ? '전체 세그먼트' : `${selectedSegs.length}개 선택`}
                  </span>
                  <ChevronDown size={13} style={{ color: 'rgba(255,255,255,0.3)' }} />
                </div>
              )
            )}
          </div>

          {/* 어카운트 — 다중선택 */}
          <div>
            <div style={sectionLbl}>ACCOUNT</div>
            {accExpanded ? (
              <div style={{ border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 6 }}>
                <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px' }}>
                  {accountList.length === 0
                    ? <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: '5px 4px' }}>어카운트 없음</div>
                    : accountList.map(acc => checkRow(acc, selectedAccounts.includes(acc), () => toggleAccount(acc)))}
                </div>
                <div style={actionRow}>
                  <button onClick={() => setSelectedAccounts([])} style={actBtn}>초기화</button>
                  <button onClick={() => setSelectedAccounts([...accountList])} style={actBtn}>전체선택</button>
                  <button onClick={() => setAccExpanded(false)} style={doneBtn}>완료</button>
                </div>
              </div>
            ) : (
              <div onClick={() => setAccExpanded(true)} style={{ ...collapsedBar, marginTop: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedAccounts.length === 0 ? 'rgba(255,255,255,0.4)' : '#fff' }}>
                  {selectedAccounts.length === 0 ? '전체' : selectedAccounts.length === 1 ? selectedAccounts[0] : `${selectedAccounts.length}개 선택`}
                </span>
                <ChevronDown size={13} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
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
