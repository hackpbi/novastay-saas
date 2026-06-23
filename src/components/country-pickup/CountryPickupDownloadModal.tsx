'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, X, Download, ChevronDown } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import type { CountryPickupRpcRow, SegmentOption } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface YearMonth {
  key:   string   // '2026-06'
  year:  number
  month: number
  label: string   // 'Jun 2026'
}

export default function CountryPickupDownloadModal({ data, segmentOptions, currentMonth, currentYear, otbDate, hotelId, onClose }: {
  data:           CountryPickupRpcRow[]
  segmentOptions: SegmentOption[]
  currentMonth:   number   // 1-based
  currentYear:    number
  otbDate:        string   // OTB date picker 기준일 (예: '2026-06-23')
  hotelId?:       string
  onClose:        () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1]
  const [pickerYear,  setPickerYear]  = useState<number>(currentYear)
  const [pickerMonths, setPickerMonths] = useState<number[]>([currentMonth])   // 체크박스 임시선택
  const [selectedYMs, setSelectedYMs] = useState<YearMonth[]>([])               // 확정된 년월 태그
  const [selectedGroup, setSelectedGroup] = useState<'All' | 'fit' | 'group'>('All')
  const [selectedSegs, setSelectedSegs] = useState<string[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])   // 다중 선택
  const [accExpanded, setAccExpanded] = useState(false)

  // 현재 data에 존재하는 세그먼트 (활성 여부 판단)
  const activeSegs = useMemo(() => new Set(data.map(r => r.segmentation).filter(Boolean)), [data])

  // 선택 그룹/세그 기준 어카운트 목록
  const accountList = useMemo(() => {
    let filtered = data
    if (selectedGroup !== 'All') filtered = filtered.filter(r => r.sorting2 === selectedGroup)
    if (selectedSegs.length > 0) filtered = filtered.filter(r => selectedSegs.includes(r.segmentation))
    return Array.from(new Set(filtered.map(r => r.account_name).filter(Boolean))).sort()
  }, [data, selectedGroup, selectedSegs])

  const togglePickerMonth = (m: number) => {
    setPickerMonths(prev => (prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]))
  }
  const handleAddYM = () => {
    pickerMonths.forEach(m => {
      const key = `${pickerYear}-${String(m).padStart(2, '0')}`
      setSelectedYMs(prev => {
        if (prev.find(s => s.key === key)) return prev   // 중복 방지
        return [...prev, { key, year: pickerYear, month: m, label: `${MONTHS[m - 1]} ${pickerYear}` }]
          .sort((a, b) => a.key.localeCompare(b.key))
      })
    })
    setPickerMonths([])   // 체크박스 초기화
  }
  const removeYM = (key: string) => {
    setSelectedYMs(prev => prev.filter(s => s.key !== key))
  }
  const handleGroupChange = (g: 'All' | 'fit' | 'group') => {
    setSelectedGroup(g); setSelectedSegs([]); setSelectedAccounts([]); setAccExpanded(false)
  }
  const toggleAccount = (acc: string) => {
    setSelectedAccounts(prev => (prev.includes(acc) ? prev.filter(x => x !== acc) : [...prev, acc]))
  }

  const matchesFilter = (row: any) => {
    const groupOk = selectedGroup === 'All' || row.sorting2 === selectedGroup
    const segOk   = selectedSegs.length === 0 || selectedSegs.includes(row.segmentation)
    const accOk   = selectedAccounts.length === 0 || selectedAccounts.includes(row.account_name)
    return groupOk && segOk && accOk
  }

  // actual_daily(a01) 행 → 엑셀 행
  const mapActualRow = (row: any, year: number, month: number) => {
    const adr = row.nights > 0 ? Math.round(row.room_revenue / row.nights) : 0
    return {
      'Year'        : year,
      'Month'       : month,
      'Country'     : row.country_name_en || row.country_name_ko || row.country,
      'Account'     : row.account_name  || '(미지정)',
      'Segmentation': row.segmentation  || '(미지정)',
      'R/N'         : row.nights,
      'ADR'         : adr,
      'REV'         : row.room_revenue,
    }
  }

  // 전체 월/연 기준 actual_daily(a01) RPC 호출 + 필터 + 매핑
  const fetchActualRows = async (year: number, month: number) => {
    const { data: actualData, error } = await (supabase as any)
      .rpc('get_country_actual_data', {
        p_hotel_id     : hotelId,
        p_year         : year,
        p_month        : month,
        p_segmentation : null,
        p_account_name : null,
      })
    if (error || !actualData) return []
    return (actualData as any[]).filter(matchesFilter).map(row => mapActualRow(row, year, month))
  }

  const handleDownload = async () => {
    if (selectedYMs.length === 0) return

    // otbDate 기준 (KST — getMonth()/getFullYear() 사용)
    const otbBase  = new Date(otbDate)
    const otbMonth = otbBase.getMonth() + 1
    const otbYear  = otbBase.getFullYear()

    const allRows: any[] = []

    for (const ym of selectedYMs) {
      const { year, month } = ym
      const isPast = year < otbYear || (year === otbYear && month < otbMonth)

      // ── 당해년도 데이터 ──────────────────────────────
      if (isPast) {
        // 이전월 → a01_actual_daily
        allRows.push(...await fetchActualRows(year, month))
      } else {
        // 현재월 이후 → 기존 data (OTB)
        data.filter(matchesFilter).forEach(row => {
          const adr = row.otb_nights > 0 ? Math.round(row.otb_revenue / row.otb_nights) : 0
          allRows.push({
            'Year'        : year,
            'Month'       : month,
            'Country'     : row.country_name_en || row.country_name_ko || row.country,
            'Account'     : row.account_name  || '(미지정)',
            'Segmentation': row.segmentation  || '(미지정)',
            'R/N'         : row.otb_nights,
            'ADR'         : adr,
            'REV'         : row.otb_revenue,
          })
        })
      }

      // ── 전년도 데이터 (항상 a01_actual_daily) ────────
      allRows.push(...await fetchActualRows(year - 1, month))
    }

    // Year → Month → Country → Account 순 정렬
    allRows.sort((a, b) =>
      a.Year - b.Year ||
      a.Month - b.Month ||
      a.Country.localeCompare(b.Country) ||
      a.Account.localeCompare(b.Account)
    )

    const ws = XLSX.utils.json_to_sheet(allRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Country Pickup')
    const ymStr = selectedYMs.map(ym => ym.key).join('_')
    XLSX.writeFile(wb, `Country_Pickup_${ymStr}.xlsx`)
    onClose()
  }

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
            <div style={sectionLbl}>MONTH</div>

            {/* Year 드롭다운 + Month 체크박스 + Add */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <select
                value={pickerYear}
                onChange={e => setPickerYear(Number(e.target.value))}
                style={{ padding: '6px 10px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', background: '#0a0a0a', color: '#fff', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
              >
                {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>

              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 4 }}>
                {MONTHS.map((lbl, i) => {
                  const m = i + 1
                  const checked = pickerMonths.includes(m)
                  return (
                    <label key={m} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '4px 0', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                      border: `0.5px solid ${checked ? '#00E5A0' : 'rgba(255,255,255,0.1)'}`,
                      background: checked ? 'rgba(0,229,160,0.07)' : 'transparent',
                      color: checked ? '#00E5A0' : 'rgba(255,255,255,0.5)',
                      userSelect: 'none',
                    }}>
                      <input type="checkbox" checked={checked} onChange={() => togglePickerMonth(m)} style={{ display: 'none' }} />
                      {lbl}
                    </label>
                  )
                })}
              </div>

              <button
                onClick={handleAddYM}
                disabled={pickerMonths.length === 0}
                style={{
                  padding: '6px 12px', borderRadius: 6, flexShrink: 0, border: '0.5px solid #00E5A0',
                  background: pickerMonths.length === 0 ? 'transparent' : 'rgba(0,229,160,0.08)',
                  color: pickerMonths.length === 0 ? 'rgba(255,255,255,0.4)' : '#00E5A0',
                  fontSize: 11, fontWeight: 500, cursor: pickerMonths.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: pickerMonths.length === 0 ? 0.5 : 1,
                }}
              >Add ✓</button>
            </div>

            {/* 선택된 년월 태그 */}
            {selectedYMs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {selectedYMs.map(ym => (
                  <div key={ym.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 99, background: 'rgba(0,229,160,0.1)', border: '0.5px solid rgba(0,229,160,0.3)', fontSize: 11, color: '#00E5A0' }}>
                    {ym.label}
                    <span onClick={() => removeYM(ym.key)} style={{ cursor: 'pointer', fontSize: 12, opacity: 0.7, lineHeight: 1 }}>×</span>
                  </div>
                ))}
              </div>
            )}

            {/* 안내 텍스트 */}
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
              {selectedYMs.length > 0
                ? `${selectedYMs.length} month${selectedYMs.length > 1 ? 's' : ''} selected`
                : 'Select year and month(s), then click Add ✓'}
            </div>
          </div>

          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

          {/* 세그먼트 — c05 스키마 기반 (All / FIT / GROUP + 하위 세그 체크박스) */}
          <div style={{ marginBottom: 14 }}>
            <div style={sectionLbl}>SEGMENT</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => handleGroupChange('All')} style={groupBtn(selectedGroup === 'All')}>All</button>
              {(['fit', 'group'] as const).map(g => {
                const on = selectedGroup === g
                const hasData = segmentOptions.filter(s => s.sorting2 === g).some(s => activeSegs.has(s.code))
                return (
                  <button
                    key={g}
                    onClick={() => handleGroupChange(g)}
                    style={{ ...groupBtn(on), cursor: hasData ? 'pointer' : 'not-allowed', opacity: hasData ? 1 : 0.4 }}
                  >{g === 'fit' ? 'FIT' : 'GROUP'}</button>
                )
              })}
            </div>
            {selectedGroup !== 'All' && (
              <div style={{ marginTop: 8, width: 'max-content', minWidth: 200, maxWidth: 360, whiteSpace: 'nowrap', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
                {/* 컨트롤 (Reset / All / count) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.1)', background: '#0a0a0a' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => setSelectedSegs([])} style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Reset</button>
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>|</span>
                    <button
                      onClick={() => setSelectedSegs(segmentOptions.filter(s => s.sorting2 === selectedGroup && activeSegs.has(s.code)).map(s => s.code))}
                      style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >All</button>
                  </div>
                  <span style={{ fontSize: 10, color: selectedSegs.length > 0 ? '#00E5A0' : 'rgba(255,255,255,0.4)' }}>
                    {selectedSegs.length > 0 ? `${selectedSegs.length} selected` : 'All'}
                  </span>
                </div>
                {/* 체크박스 리스트 */}
                <div style={{ maxHeight: 160, overflowY: 'auto', padding: '4px 0' }}>
                  {segmentOptions.filter(s => s.sorting2 === selectedGroup).map(seg => {
                    const isActive = activeSegs.has(seg.code)
                    const isChecked = selectedSegs.includes(seg.code)
                    return (
                      <label key={seg.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', cursor: isActive ? 'pointer' : 'not-allowed', opacity: isActive ? 1 : 0.4 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!isActive}
                          onChange={() => {
                            if (!isActive) return
                            setSelectedSegs(prev => (prev.includes(seg.code) ? prev.filter(x => x !== seg.code) : [...prev, seg.code]))
                            setSelectedAccounts([])
                          }}
                          style={{ accentColor: '#00E5A0', width: 14, height: 14, flexShrink: 0 }}
                        />
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, width: '100%' }}>
                          <span style={{ fontSize: 11, fontWeight: 500, color: isActive ? '#fff' : 'rgba(255,255,255,0.4)' }}>{seg.name}{!isActive ? ' · no data' : ''}</span>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>{seg.code}</span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 어카운트 — 다중선택 */}
          <div>
            <div style={sectionLbl}>ACCOUNT</div>
            {accExpanded ? (
              <div style={{ border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 6 }}>
                <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px' }}>
                  {accountList.length === 0
                    ? <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: '5px 4px' }}>No accounts</div>
                    : accountList.map(acc => checkRow(acc, selectedAccounts.includes(acc), () => toggleAccount(acc)))}
                </div>
                <div style={actionRow}>
                  <button onClick={() => setSelectedAccounts([])} style={actBtn}>Reset</button>
                  <button onClick={() => setSelectedAccounts([...accountList])} style={actBtn}>Select All</button>
                  <button onClick={() => setAccExpanded(false)} style={doneBtn}>Done</button>
                </div>
              </div>
            ) : (
              <div onClick={() => setAccExpanded(true)} style={{ ...collapsedBar, marginTop: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedAccounts.length === 0 ? 'rgba(255,255,255,0.4)' : '#fff' }}>
                  {selectedAccounts.length === 0 ? 'All' : selectedAccounts.length === 1 ? selectedAccounts[0] : `${selectedAccounts.length} selected`}
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
            disabled={selectedYMs.length === 0}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none',
              background: selectedYMs.length === 0 ? 'rgba(0,229,160,0.3)' : '#00E5A0',
              color: '#0a0a0a', fontSize: 12, fontWeight: 500, cursor: selectedYMs.length === 0 ? 'not-allowed' : 'pointer',
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
