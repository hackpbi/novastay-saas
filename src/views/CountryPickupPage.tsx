'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import DatePicker from '@/components/DatePicker'
import { fmtM } from '@/utils/pickupPageUtils'
import CountryPickupChart from '@/components/country-pickup/CountryPickupChart'
import CountryPickupTable from '@/components/country-pickup/CountryPickupTable'
import { enrichCountryRow, type CountryAgg, type CountryPickupRpcRow } from '@/components/country-pickup/types'

// ─── 세그먼트 드롭다운 (FIT/GRP) — 다중선택 ────────────────────────────────────────
function SegDropdown({ label, segs, selected, onToggle }: {
  label: string; segs: { code: string; name: string }[]; selected: Set<string>; onToggle: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const hasSel = segs.some(s => selected.has(s.code))
  const allSel = segs.length > 0 && segs.every(s => selected.has(s.code))

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 3,
          border: hasSel ? (allSel ? '0.5px solid #00E5A0' : '0.5px solid #60A5FA') : '0.5px solid var(--color-border-default)',
          background: hasSel ? (allSel ? 'rgba(0,229,160,0.08)' : 'rgba(96,165,250,0.08)') : 'transparent',
          color: hasSel ? (allSel ? '#00B883' : '#60A5FA') : 'var(--color-text-secondary)',
        }}
      >
        {label} <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200, background: '#0a0a0a', border: '0.5px solid #333', borderRadius: 8, padding: 6, minWidth: 160, boxShadow: '0 6px 20px rgba(0,0,0,0.5)', maxHeight: 300, overflowY: 'auto' }}>
          {segs.length === 0 ? (
            <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--color-text-secondary)' }}>없음</div>
          ) : segs.map(s => {
            const on = selected.has(s.code)
            return (
              <div key={s.code} onClick={() => onToggle(s.code)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, border: on ? 'none' : '1.5px solid #444', background: on ? '#00E5A0' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#000' }}>{on ? '✓' : ''}</span>
                {s.name}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 어카운트 드롭다운 — 다중선택 ──────────────────────────────────────────────────
function AccDropdown({ accounts, selected, onToggle, onSelectAll }: {
  accounts: string[]; selected: Set<string>; onToggle: (a: string) => void; onSelectAll: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const hasSel = selected.size > 0
  const accLabel = selected.size === 0 ? '전체' : selected.size === 1 ? [...selected][0] : `${selected.size}개 선택`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 3, maxWidth: 200,
          border: hasSel ? '0.5px solid #60A5FA' : '0.5px solid var(--color-border-default)',
          background: hasSel ? 'rgba(96,165,250,0.08)' : 'transparent',
          color: hasSel ? '#60A5FA' : 'var(--color-text-secondary)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{accLabel}</span> <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200, background: '#0a0a0a', border: '0.5px solid #333', borderRadius: 8, padding: 6, minWidth: 180, boxShadow: '0 6px 20px rgba(0,0,0,0.5)', maxHeight: 320, overflowY: 'auto' }}>
          <div onClick={onSelectAll} style={{ padding: '5px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: selected.size === 0 ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)', background: selected.size === 0 ? 'var(--accent-badge-bg)' : 'transparent' }}>전체</div>
          {accounts.length === 0 ? (
            <div style={{ padding: '5px 8px', fontSize: 11, color: 'var(--color-text-secondary)' }}>없음</div>
          ) : accounts.map(a => {
            const on = selected.has(a)
            return (
              <div key={a} onClick={() => onToggle(a)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, border: on ? 'none' : '1.5px solid #444', background: on ? '#00E5A0' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#000' }}>{on ? '✓' : ''}</span>
                {a}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function CountryPickupPage() {
  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id
  const { otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate } = useDateContext()

  // vs 날짜 — 없으면 OTB 전일 (KST-safe)
  const vsDate = useMemo(() => {
    if (vsOtbDate) return vsOtbDate
    if (!otbDate) return ''
    const d = new Date(otbDate + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [vsOtbDate, otbDate])

  // 월 네비게이션 — 화살표(이전/다음 달). selectedYear/selectedMonth(0-based)는 RPC에서 사용
  const now = new Date()
  const otbBase = otbDate ? new Date(otbDate + 'T00:00:00') : now
  const [selectedYear, setSelectedYear]   = useState(otbBase.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(otbBase.getMonth())   // 0-based
  useEffect(() => {
    const b = otbDate ? new Date(otbDate + 'T00:00:00') : new Date()
    setSelectedYear(b.getFullYear()); setSelectedMonth(b.getMonth())
  }, [otbDate])
  const handlePrevMonth = () => {
    if (selectedMonth === 0) { setSelectedYear(y => y - 1); setSelectedMonth(11) }
    else setSelectedMonth(m => m - 1)
  }
  const handleNextMonth = () => {
    if (selectedMonth === 11) { setSelectedYear(y => y + 1); setSelectedMonth(0) }
    else setSelectedMonth(m => m + 1)
  }

  // 세그먼트 / 어카운트 선택 (빈 Set = 전체)
  const [selectedSegs, setSelectedSegs] = useState<Set<string>>(new Set())
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  const handleToggleSeg = (seg: string) => {
    setSelectedSegs(prev => { const next = new Set(prev); next.has(seg) ? next.delete(seg) : next.add(seg); return next })
    setSelectedAccounts(new Set())   // 세그 변경 시 어카운트 초기화
  }
  const handleToggleAccount = (acc: string) => {
    setSelectedAccounts(prev => { const next = new Set(prev); next.has(acc) ? next.delete(acc) : next.add(acc); return next })
  }
  const handleSelectAll = () => { setSelectedSegs(new Set()); setSelectedAccounts(new Set()) }

  // 국가별 픽업 — 전체 1회 호출 (p_segmentation=NULL), 클라이언트에서 필터/합산
  const { data: rpcRows = [], isLoading } = useQuery<CountryPickupRpcRow[]>({
    queryKey: ['country-pickup', hotelId, otbDate, vsDate, selectedYear, selectedMonth],
    enabled: !!hotelId && !!otbDate && !!vsDate,
    queryFn: async () => {
      if (!otbDate || !vsDate) return []
      const { data, error } = await (supabase as any).rpc('get_country_pickup_data', {
        p_hotel_id:     hotelId,
        p_otb_date:     otbDate,
        p_vs_date:      vsDate,
        p_year:         selectedYear,
        p_month:        selectedMonth + 1,
        p_segmentation: null,
        p_account_name: null,
      })
      if (error) throw error
      return (data ?? []) as CountryPickupRpcRow[]
    },
  })

  // FIT/GRP 세그먼트 목록 (RPC 결과의 sorting2 기준)
  const isFit = (v: any) => String(v ?? '').toLowerCase().includes('fit')
  const isGrp = (v: any) => { const s = String(v ?? '').toLowerCase(); return s.includes('grp') || s.includes('group') }
  const fitSegs = useMemo(() => [...new Set(rpcRows.filter(r => isFit(r.sorting2)).map(r => r.segmentation))].filter(Boolean).sort(), [rpcRows])
  const grpSegs = useMemo(() => [...new Set(rpcRows.filter(r => isGrp(r.sorting2)).map(r => r.segmentation))].filter(Boolean).sort(), [rpcRows])

  // 어카운트 목록 (선택 세그 기준 distinct account_name)
  const accountList = useMemo(() => {
    const base = selectedSegs.size === 0 ? rpcRows : rpcRows.filter(r => selectedSegs.has(r.segmentation))
    return [...new Set(base.map(r => r.account_name))].filter(Boolean).sort()
  }, [rpcRows, selectedSegs])

  // 클라이언트 필터(세그+어카운트) + country별 합산
  const aggregated = useMemo<CountryAgg[]>(() => {
    let filtered = selectedSegs.size === 0 ? rpcRows : rpcRows.filter(r => selectedSegs.has(r.segmentation))
    if (selectedAccounts.size > 0) filtered = filtered.filter(r => selectedAccounts.has(r.account_name))
    const map = new Map<string, CountryAgg>()
    for (const r of filtered) {
      const cur = map.get(r.country) ?? { country: r.country, otb_nights: 0, vs_nights: 0, otb_revenue: 0, vs_revenue: 0 }
      cur.otb_nights  += r.otb_nights ?? 0
      cur.vs_nights   += r.vs_nights ?? 0
      cur.otb_revenue += r.otb_revenue ?? 0
      cur.vs_revenue  += r.vs_revenue ?? 0
      map.set(r.country, cur)
    }
    return [...map.values()].sort((a, b) => b.otb_nights - a.otb_nights)
  }, [rpcRows, selectedSegs, selectedAccounts])

  const data = useMemo(() => aggregated.map(enrichCountryRow), [aggregated])

  const kpi = useMemo(() => {
    const t = data.reduce((a, r) => { a.otbRn += r.otbRn; a.vsRn += r.vsRn; a.otbRev += r.otbRev; a.vsRev += r.vsRev; return a }, { otbRn: 0, vsRn: 0, otbRev: 0, vsRev: 0 })
    const otbAdr = t.otbRn > 0 ? Math.round(t.otbRev / t.otbRn / 1000) : 0
    const puAdr  = t.otbRn > 0 && t.vsRn > 0 ? Math.round(t.otbRev / t.otbRn / 1000 - t.vsRev / t.vsRn / 1000) : 0
    return { countries: data.length, otbRn: t.otbRn, puRn: t.otbRn - t.vsRn, otbAdr, puAdr, otbRev: t.otbRev, puRev: t.otbRev - t.vsRev }
  }, [data])

  const puColor = (v: number) => (v < 0 ? '#E24B4A' : 'var(--color-text-primary)')

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>Country Pick-up</h1>
      <p className="text-[13px] mb-4" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
        <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
          <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} availableDates={otbDates ?? []} accent bare fontPx={13} plain />
        </span>{' '}
        <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
          <DatePicker label="vs" value={vsOtbDate} onChange={setVsOtbDate} availableDates={(otbDates ?? []).filter(d => d < otbDate)} accent bare fontPx={13} plain />
        </span>{' '}기준 국가별 OTB·픽업
      </p>

      {/* 월 네비 + 세그먼트 필터 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        {/* 좌: 화살표 + 년월 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handlePrevMonth} aria-label="이전 달" style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', border: '0.5px solid var(--color-border-tertiary)', background: 'transparent',
            color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14,
          }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 80, textAlign: 'center' }}>
            {selectedYear}년 {selectedMonth + 1}월
          </span>
          <button onClick={handleNextMonth} aria-label="다음 달" style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', border: '0.5px solid var(--color-border-tertiary)', background: 'transparent',
            color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14,
          }}>›</button>
        </div>

        {/* 우: 세그먼트 (전체 / FIT / GRP) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>세그먼트</span>
          <button onClick={handleSelectAll} style={{
            fontSize: 11, fontWeight: 500, padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
            border: selectedSegs.size === 0 ? '0.5px solid #00E5A0' : '0.5px solid var(--color-border-default)',
            background: selectedSegs.size === 0 ? 'rgba(0,229,160,0.08)' : 'transparent',
            color: selectedSegs.size === 0 ? '#00B883' : 'var(--color-text-secondary)',
          }}>전체</button>
          <SegDropdown label="FIT" segs={fitSegs.map(s => ({ code: s, name: s }))} selected={selectedSegs} onToggle={handleToggleSeg} />
          <SegDropdown label="GRP" segs={grpSegs.map(s => ({ code: s, name: s }))} selected={selectedSegs} onToggle={handleToggleSeg} />
          <span style={{ color: 'var(--color-border-default)', padding: '0 2px' }}>|</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>어카운트</span>
          <AccDropdown accounts={accountList} selected={selectedAccounts} onToggle={handleToggleAccount} onSelectAll={() => setSelectedAccounts(new Set())} />
        </div>
      </div>

      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: '국가 수', main: `${kpi.countries}개국`, sub: null as string | null, subV: 0, subT: '' },
          { label: 'OTB R/N', main: kpi.otbRn.toLocaleString('ko-KR'), sub: '픽업', subV: kpi.puRn, subT: `${kpi.puRn > 0 ? '+' : ''}${kpi.puRn}` },
          { label: 'OTB ADR', main: `${kpi.otbAdr}k`, sub: '픽업', subV: kpi.puAdr, subT: `${kpi.puAdr > 0 ? '+' : ''}${kpi.puAdr}k` },
          { label: 'OTB REV', main: fmtM(kpi.otbRev), sub: '픽업', subV: kpi.puRev, subT: `${kpi.puRev > 0 ? '+' : ''}${fmtM(kpi.puRev)}` },
        ].map((c, i) => (
          <div key={i} className="rounded-xl p-3.5" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1 }}>{isLoading ? '—' : c.main}</div>
            {c.sub && (
              <div style={{ fontSize: 11, marginTop: 6, color: 'var(--color-text-secondary)' }}>
                {c.sub} <span style={{ fontWeight: 500, color: puColor(c.subV) }}>{isLoading ? '—' : c.subT}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 메인: 좌 차트 / 우 테이블 */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="animate-pulse rounded-xl" style={{ height: 360, background: 'var(--color-bg-tertiary)' }} />
          <div className="animate-pulse rounded-xl" style={{ height: 360, background: 'var(--color-bg-tertiary)' }} />
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 13 }}>
          해당 조건의 국가별 픽업 데이터가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 12 }}>국가별 OTB R/N · 픽업</div>
            <CountryPickupChart data={data} />
          </div>
          <div className="rounded-xl p-2" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
            <CountryPickupTable data={data} />
          </div>
        </div>
      )}
    </div>
  )
}
