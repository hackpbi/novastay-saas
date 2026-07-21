'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, X, Download, ChevronDown } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import type { SegmentOption } from '@/components/country-pickup/types'
import type { AccountRow } from '@/hooks/useAccountPickupData'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface YearMonth {
  key:   string   // '2026-06'
  year:  number
  month: number
  label: string   // 'Jun 2026'
}

// sorting2 정규화 (fit / group)
const norm2 = (s: any): string => {
  const x = String(s ?? '').toLowerCase()
  return x.includes('fit') ? 'fit' : (x.includes('grp') || x.includes('group')) ? 'group' : x
}
const adrOf = (rev: number, n: number) => (n > 0 ? Math.round(rev / n) : 0)
const yoyOf = (cur: number, ly: number): number | '' => (ly > 0 ? Math.round((cur - ly) / ly * 1000) / 10 : '')

export default function AccountPickupDownloadModal({ data, segmentOptions, currentMonth, currentYear, otbDate, vsDate, hotelId, onClose }: {
  data:           AccountRow[]
  segmentOptions: SegmentOption[]
  currentMonth:   number   // 1-based
  currentYear:    number
  otbDate:        string   // OTB date picker 기준일
  vsDate:         string   // vs(어제 OTB) 기준일
  hotelId?:       string
  onClose:        () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // 월 드롭다운 외부 클릭 시 닫힘
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-month-drop]')) setMonthDropOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 세그 드롭다운 외부 클릭 시 닫힘
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-seg-drop]')) setOpenDropdown(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1]
  const [pickerYear,  setPickerYear]  = useState<number>(currentYear)
  const [pickerMonths, setPickerMonths] = useState<number[]>([currentMonth])
  const [monthDropOpen, setMonthDropOpen] = useState(false)
  const [selectedYMs, setSelectedYMs] = useState<YearMonth[]>([])
  const [fitSelected, setFitSelected] = useState<Set<string>>(new Set())   // 빈 Set = FIT 전체
  const [grpSelected, setGrpSelected] = useState<Set<string>>(new Set())   // 빈 Set = GRP 전체
  const [openDropdown, setOpenDropdown] = useState<'fit' | 'group' | null>(null)
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [accExpanded, setAccExpanded] = useState(false)

  // 현재 data에 존재하는 세그먼트 (활성 여부 판단)
  const activeSegs = useMemo(() => new Set(data.map(r => (r as any).segmentation).filter(Boolean)), [data])

  // FIT/GRP 선택 기준 세그 매칭 (빈 Set = 해당 타입 전체 포함)
  const segPass = (sorting2: any, segmentation: string) => {
    const g = norm2(sorting2)
    const fitOk = g !== 'fit'   || fitSelected.size === 0 || fitSelected.has(segmentation)
    const grpOk = g !== 'group' || grpSelected.size === 0 || grpSelected.has(segmentation)
    return fitOk && grpOk
  }

  // 선택 세그 기준 어카운트 목록
  const accountList = useMemo(() => {
    const filtered = (data as any[]).filter(r => segPass(r.sorting2, r.segmentation))
    return Array.from(new Set(filtered.map(r => r.account_name).filter(Boolean))).sort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, fitSelected, grpSelected])

  // 현재 열린 드롭다운의 선택 Set / setter
  const curSet = openDropdown === 'fit' ? fitSelected : grpSelected
  const toggleSeg = (g: string, code: string) => {
    const setter = g === 'fit' ? setFitSelected : setGrpSelected
    setter(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n })
    setSelectedAccounts([])
  }
  const resetGroup = (g: string) => { (g === 'fit' ? setFitSelected : setGrpSelected)(new Set()); setSelectedAccounts([]) }
  const allGroup = (g: string) => {
    (g === 'fit' ? setFitSelected : setGrpSelected)(new Set(segmentOptions.filter(s => s.sorting2 === g && activeSegs.has(s.code)).map(s => s.code)))
    setSelectedAccounts([])
  }
  const handleAll = () => { setFitSelected(new Set()); setGrpSelected(new Set()); setSelectedAccounts([]); setOpenDropdown(null) }

  const togglePickerMonth = (m: number) => {
    setPickerMonths(prev => (prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]))
  }
  const handleAddYM = () => {
    pickerMonths.forEach(m => {
      const key = `${pickerYear}-${String(m).padStart(2, '0')}`
      setSelectedYMs(prev => {
        if (prev.find(s => s.key === key)) return prev
        return [...prev, { key, year: pickerYear, month: m, label: `${MONTHS[m - 1]} ${pickerYear}` }]
          .sort((a, b) => a.key.localeCompare(b.key))
      })
    })
    setPickerMonths([])
    setMonthDropOpen(false)
  }
  const removeYM = (key: string) => setSelectedYMs(prev => prev.filter(s => s.key !== key))
  const toggleAccount = (acc: string) => {
    setSelectedAccounts(prev => (prev.includes(acc) ? prev.filter(x => x !== acc) : [...prev, acc]))
  }

  const matchesFilter = (row: any) => {
    const accOk = selectedAccounts.length === 0 || selectedAccounts.includes(row.account_name)
    return segPass(row.sorting2, row.segmentation) && accOk
  }

  // 미래/현재월 — get_account_pickup_data (OTB / PU / LY / GAP)
  const fetchOtbRows = async (year: number, month: number) => {
    const { data: d, error } = await (supabase as any).rpc('get_account_pickup_data', {
      p_hotel_id:     hotelId,
      p_otb_date:     otbDate,
      p_vs_date:      vsDate,
      p_year:         year,
      p_month:        month,
      p_segmentation: null,
    })
    if (error || !d) return []
    return (d as any[]).filter(matchesFilter).map(r => {
      const otbN = r.otb_nights ?? 0, otbRev = r.otb_revenue ?? 0, otbAdr = adrOf(otbRev, otbN)
      const vsN  = r.vs_nights ?? 0,  vsRev  = r.vs_revenue ?? 0,  vsAdr  = adrOf(vsRev, vsN)
      const lyN  = r.ly_nights ?? 0,  lyRev  = r.ly_revenue ?? 0,  lyAdr  = adrOf(lyRev, lyN)
      const puN  = r.pu_nights ?? 0,  puRev  = r.pu_revenue ?? 0
      return {
        'Year': year, 'Month': month, 'Account': r.account_name || '(미지정)',
        'OTB R/N': otbN, 'OTB ADR': otbAdr, 'OTB REV': otbRev,
        'PU R/N': puN, 'PU ADR': otbAdr - vsAdr, 'PU REV': puRev,
        'LY R/N': lyN, 'LY ADR': lyAdr, 'LY REV': lyRev,
        'GAP R/N': otbN - lyN, 'GAP ADR': otbAdr - lyAdr, 'GAP REV': otbRev - lyRev,
        'YoY%': yoyOf(otbN, lyN),
      }
    })
  }

  // 과거월 — get_account_actual_data (ACT / GAP / LY)
  const fetchActualRows = async (year: number, month: number) => {
    const { data: d, error } = await (supabase as any).rpc('get_account_actual_data', {
      p_hotel_id:     hotelId,
      p_year:         year,
      p_month:        month,
      p_segmentation: null,
    })
    if (error || !d) return []
    return (d as any[]).filter(matchesFilter).map(r => {
      const actN = r.act_nights ?? 0, actRev = r.act_revenue ?? 0, actAdr = adrOf(actRev, actN)
      const lyN  = r.ly_nights ?? 0,  lyRev  = r.ly_revenue ?? 0,  lyAdr  = adrOf(lyRev, lyN)
      const gapN = r.gap_nights ?? 0, gapRev = r.gap_revenue ?? 0
      return {
        'Year': year, 'Month': month, 'Account': r.account_name || '(미지정)',
        'ACT R/N': actN, 'ACT ADR': actAdr, 'ACT REV': actRev,
        'GAP R/N': gapN, 'GAP ADR': actAdr - lyAdr, 'GAP REV': gapRev,
        'LY R/N': lyN, 'LY ADR': lyAdr, 'LY REV': lyRev,
        'YoY%': yoyOf(actN, lyN),
      }
    })
  }

  const handleDownload = async () => {
    if (selectedYMs.length === 0) return

    const otbBase  = new Date(otbDate)
    const otbMonth = otbBase.getMonth() + 1
    const otbYear  = otbBase.getFullYear()

    const allRows: any[] = []
    for (const ym of selectedYMs) {
      const { year, month } = ym
      const isPast = year < otbYear || (year === otbYear && month < otbMonth)
      allRows.push(...(isPast ? await fetchActualRows(year, month) : await fetchOtbRows(year, month)))
    }

    allRows.sort((a, b) =>
      a.Year - b.Year || a.Month - b.Month || String(a.Account).localeCompare(String(b.Account))
    )

    const ws = XLSX.utils.json_to_sheet(allRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Account Pickup')
    const ymStr = selectedYMs.map(ym => ym.key).join('_')
    XLSX.writeFile(wb, `Account_Pickup_${ymStr}.xlsx`)
    onClose()
  }

  const sectionLbl: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em', marginBottom: 8 }
  const groupBtn = (on: boolean): React.CSSProperties => ({
    padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 500, cursor: 'pointer',
    border: on ? '1px solid #00E5A0' : '0.5px solid rgba(255,255,255,0.1)',
    background: on ? 'rgba(0,229,160,0.07)' : 'transparent',
    color: on ? '#00E5A0' : 'rgba(255,255,255,0.4)',
  })
  const actionRow: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '8px 6px 4px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }
  const actBtn: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)' }
  const doneBtn: React.CSSProperties = { padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: 'none', background: '#00E5A0', color: '#0a0a0a' }
  const collapsedBar: React.CSSProperties = { marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', background: '#000000', cursor: 'pointer', fontSize: 11, color: '#fff' }

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
      <div style={{ background: '#000000', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, width: 420, maxWidth: '92vw', overflow: 'hidden' }}>
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <select
                value={pickerYear}
                onChange={e => { setPickerYear(Number(e.target.value)); setPickerMonths([]) }}
                style={{ width: 100, padding: '6px 10px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', background: '#000000', color: '#fff', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
              >
                {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>

              <div style={{ position: 'relative', flex: 1 }} data-month-drop>
                <button
                  onClick={() => setMonthDropOpen(o => !o)}
                  style={{
                    width: '100%', padding: '6px 10px', borderRadius: 6, textAlign: 'left',
                    border: `0.5px solid ${monthDropOpen ? '#00E5A0' : 'rgba(255,255,255,0.1)'}`,
                    background: '#000000',
                    color: pickerMonths.length > 0 ? '#00E5A0' : 'rgba(255,255,255,0.4)',
                    fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pickerMonths.length === 0
                      ? 'Select months'
                      : [...pickerMonths].sort((a, b) => a - b).map(m => MONTHS[m - 1]).join(', ')}
                  </span>
                  <span style={{ fontSize: 10, opacity: 0.6, flexShrink: 0, marginLeft: 6 }}>▾</span>
                </button>

                {monthDropOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                    background: '#000000', border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.1)', background: '#141414' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => setPickerMonths([])} style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Reset</button>
                        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>|</span>
                        <button onClick={() => setPickerMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])} style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>All</button>
                      </div>
                      <span style={{ fontSize: 10, color: pickerMonths.length > 0 ? '#00E5A0' : 'rgba(255,255,255,0.4)' }}>
                        {pickerMonths.length > 0 ? `${pickerMonths.length} selected` : 'None'}
                      </span>
                    </div>
                    <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                      {MONTHS.map((lbl, i) => {
                        const m = i + 1
                        const checked = pickerMonths.includes(m)
                        return (
                          <label key={m}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <input type="checkbox" checked={checked} onChange={() => togglePickerMonth(m)} style={{ accentColor: '#00E5A0', width: 14, height: 14, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: checked ? '#fff' : 'rgba(255,255,255,0.5)', flex: 1 }}>{lbl}</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{pickerYear}</span>
                          </label>
                        )
                      })}
                    </div>
                    <div style={{ padding: '8px 10px', borderTop: '0.5px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'flex-end', background: '#141414' }}>
                      <button onClick={() => setMonthDropOpen(false)} style={{ padding: '5px 16px', borderRadius: 6, border: 'none', background: '#00E5A0', color: '#0a0a0a', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>Done</button>
                    </div>
                  </div>
                )}
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

            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
              {selectedYMs.length > 0
                ? `${selectedYMs.length} month${selectedYMs.length > 1 ? 's' : ''} selected`
                : 'Select year and month(s), then click Add ✓'}
            </div>
          </div>

          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

          {/* 세그먼트 — All / FIT / GROUP + 하위 세그 체크박스 */}
          <div style={{ marginBottom: 14 }} data-seg-drop>
            <div style={sectionLbl}>SEGMENT</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={handleAll} style={groupBtn(fitSelected.size === 0 && grpSelected.size === 0)}>All</button>
              {(['fit', 'group'] as const).map(g => {
                const on = (g === 'fit' ? fitSelected : grpSelected).size > 0
                const hasData = segmentOptions.filter(s => s.sorting2 === g).some(s => activeSegs.has(s.code))
                return (
                  <button
                    key={g}
                    onClick={() => setOpenDropdown(d => (d === g ? null : g))}
                    style={{ ...groupBtn(on), cursor: hasData ? 'pointer' : 'not-allowed', opacity: hasData ? 1 : 0.4 }}
                  >{g === 'fit' ? 'FIT' : 'GROUP'}{(g === 'fit' ? fitSelected : grpSelected).size > 0 ? ` (${(g === 'fit' ? fitSelected : grpSelected).size})` : ''}</button>
                )
              })}
            </div>
            {openDropdown !== null && (
              <div style={{ marginTop: 8, width: 'max-content', minWidth: 200, maxWidth: 360, whiteSpace: 'nowrap', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.1)', background: '#000000' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => resetGroup(openDropdown)} style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Reset</button>
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>|</span>
                    <button
                      onClick={() => allGroup(openDropdown)}
                      style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >All</button>
                  </div>
                  <span style={{ fontSize: 10, color: curSet.size > 0 ? '#00E5A0' : 'rgba(255,255,255,0.4)' }}>
                    {curSet.size > 0 ? `${curSet.size} selected` : 'All'}
                  </span>
                </div>
                <div style={{ maxHeight: 160, overflowY: 'auto', padding: '4px 0' }}>
                  {segmentOptions.filter(s => s.sorting2 === openDropdown).map(seg => {
                    const isActive = activeSegs.has(seg.code)
                    const isChecked = curSet.has(seg.code)
                    return (
                      <label key={seg.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', cursor: isActive ? 'pointer' : 'not-allowed', opacity: isActive ? 1 : 0.4 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!isActive}
                          onChange={() => { if (isActive) toggleSeg(openDropdown, seg.code) }}
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
                {/* 하단 Reset | All | Done */}
                <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: '0.5px solid rgba(255,255,255,0.08)' }}>
                  <button onClick={() => resetGroup(openDropdown)} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer' }}>Reset</button>
                  <button onClick={() => allGroup(openDropdown)} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer' }}>All</button>
                  <button onClick={() => setOpenDropdown(null)} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', background: '#00E5A0', color: '#000', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>Done</button>
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
