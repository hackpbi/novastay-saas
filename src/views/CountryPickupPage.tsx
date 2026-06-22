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
import { enrichCountryRow, type CountryPickupRpcRow } from '@/components/country-pickup/types'

type SegLeaf = { code: string; name: string; color: string | null }
type SegGroup = { id: string; label: string; segs: SegLeaf[] }

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
          {accounts.map(a => {
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

  // 3개월 탭
  const now = new Date()
  const [monthIdx, setMonthIdx] = useState(0)
  const months = useMemo(
    () => [0, 1, 2].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    }),
    [now.getFullYear(), now.getMonth()],
  )
  const sel = months[monthIdx]

  // 다중선택 state
  const [selectedSegs, setSelectedSegs] = useState<Set<string>>(new Set())
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  const isAllSelected = selectedSegs.size === 0

  const handleSelectAll = () => { setSelectedSegs(new Set()); setSelectedAccounts(new Set()) }
  // 대분류 토글: 해당 그룹의 모든 하위 코드를 한 번에 on/off
  const handleToggleGroup = (codes: string[]) => {
    setSelectedSegs(prev => {
      const next = new Set(prev)
      const allOn = codes.length > 0 && codes.every(c => next.has(c))
      if (allOn) codes.forEach(c => next.delete(c))
      else codes.forEach(c => next.add(c))
      return next
    })
    setSelectedAccounts(new Set())   // 세그 변경 시 어카운트 초기화
  }
  const handleToggleAccount = (acc: string) => {
    setSelectedAccounts(prev => { const next = new Set(prev); next.has(acc) ? next.delete(acc) : next.add(acc); return next })
  }
  const handleSelectAllAccounts = () => setSelectedAccounts(new Set())

  // 세그먼트 그룹 (c05_market_table_schema main 노드별 하위 코드)
  const { data: segGroups = [] } = useQuery<SegGroup[]>({
    queryKey: ['country-seg-groups', hotelId],
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('c05_market_table_schema')
        .select('id, name, parent_id, order_index, bg_dark_color, segmentation')
        .eq('hotel_id', hotelId).eq('is_active', true)
        .order('order_index', { ascending: true })
      const rows = (data ?? []) as any[]
      const byId = new Map(rows.map(r => [r.id, r]))
      const rootOf = (r: any) => { let cur = r; while (cur.parent_id && byId.get(cur.parent_id)) cur = byId.get(cur.parent_id); return cur }
      const groups = new Map<string, SegGroup & { order: number }>()
      const seen = new Map<string, Set<string>>()
      for (const r of rows) {
        const root = rootOf(r)
        let g = groups.get(root.id)
        if (!g) { g = { id: root.id, label: root.name, order: root.order_index, segs: [] }; groups.set(root.id, g); seen.set(root.id, new Set()) }
        const codes = seen.get(root.id)!
        for (const code of (r.segmentation ?? []) as string[]) {
          if (!code || codes.has(code)) continue
          codes.add(code)
          g.segs.push({ code, name: code, color: r.bg_dark_color ?? null })
        }
      }
      return [...groups.values()].filter(g => g.segs.length > 0).sort((a, b) => a.order - b.order)
    },
  })

  // 어카운트 목록 (선택 세그 기준)
  const { data: accountList = [] } = useQuery<string[]>({
    queryKey: ['country-account-list', hotelId, [...selectedSegs].sort()],
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      let q = (supabase as any)
        .from('a02_otb_daily').select('account_name').eq('hotel_id', hotelId)
        .not('account_name', 'is', null).neq('account_name', '').limit(100000)
      if (selectedSegs.size) q = q.in('segmentation', [...selectedSegs])
      const { data } = await q
      return [...new Set((data ?? []).map((r: any) => r.account_name as string))].filter(Boolean).sort() as string[]
    },
  })

  // 국가별 픽업 — 다중 세그 × 다중 어카운트 조합 병렬 RPC → country 합산
  const { data: countryRows = [], isLoading } = useQuery<CountryPickupRpcRow[]>({
    queryKey: ['country-pickup', hotelId, otbDate, vsDate, sel.year, sel.month, [...selectedSegs].sort(), [...selectedAccounts].sort()],
    enabled: !!hotelId && !!otbDate && !!vsDate,
    queryFn: async () => {
      if (!otbDate || !vsDate) return []
      const segParams: (string | null)[] = selectedSegs.size ? [...selectedSegs] : [null]
      const accParams: (string | null)[] = selectedAccounts.size ? [...selectedAccounts] : [null]
      const combos: { s: string | null; a: string | null }[] = []
      for (const s of segParams) for (const a of accParams) combos.push({ s, a })

      const results = await Promise.all(combos.map(({ s, a }) =>
        (supabase as any).rpc('get_country_pickup_data', {
          p_hotel_id:     hotelId,
          p_otb_date:     otbDate,
          p_vs_date:      vsDate,
          p_year:         sel.year,
          p_month:        sel.month + 1,
          p_segmentation: s,
          p_account_name: a,
        }).then((r: any) => (r.data ?? []) as CountryPickupRpcRow[]),
      ))

      const map = new Map<string, CountryPickupRpcRow>()
      for (const r of results.flat()) {
        const cur = map.get(r.country) ?? { country: r.country, otb_nights: 0, vs_nights: 0, otb_revenue: 0, vs_revenue: 0 }
        cur.otb_nights += r.otb_nights ?? 0
        cur.vs_nights += r.vs_nights ?? 0
        cur.otb_revenue += r.otb_revenue ?? 0
        cur.vs_revenue += r.vs_revenue ?? 0
        map.set(r.country, cur)
      }
      return [...map.values()]
    },
  })

  const data = useMemo(
    () => countryRows.map(enrichCountryRow).sort((a, b) => b.otbRn - a.otbRn),
    [countryRows],
  )

  const kpi = useMemo(() => {
    const t = data.reduce((a, r) => { a.otbRn += r.otbRn; a.vsRn += r.vsRn; a.otbRev += r.otbRev; a.vsRev += r.vsRev; return a }, { otbRn: 0, vsRn: 0, otbRev: 0, vsRev: 0 })
    const otbAdr = t.otbRn > 0 ? Math.round(t.otbRev / t.otbRn / 1000) : 0
    const puAdr  = t.otbRn > 0 && t.vsRn > 0 ? Math.round(t.otbRev / t.otbRn / 1000 - t.vsRev / t.vsRn / 1000) : 0
    return { countries: data.length, otbRn: t.otbRn, puRn: t.otbRn - t.vsRn, otbAdr, puAdr, otbRev: t.otbRev, puRev: t.otbRev - t.vsRev }
  }, [data])

  const puColor = (v: number) => (v < 0 ? '#E24B4A' : 'var(--color-text-primary)')

  const tabBtn = (active: boolean): React.CSSProperties => ({
    fontSize: 12, padding: '5px 16px', borderRadius: 20, cursor: 'pointer',
    border: active ? 'none' : '0.5px solid var(--color-border-default)',
    background: active ? '#00E5A0' : 'transparent',
    color: active ? '#0a0a0a' : 'var(--color-text-secondary)', fontWeight: active ? 500 : 400,
  })

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

      {/* 탭 + 필터 한 줄 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        {/* 좌: 월 탭 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {months.map((m, i) => (
            <button key={`${m.year}-${m.month}`} onClick={() => setMonthIdx(i)} style={tabBtn(i === monthIdx)}>{m.month + 1}월</button>
          ))}
        </div>

        {/* 우: 세그먼트 + 어카운트 필터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>세그먼트</span>
          <button onClick={handleSelectAll} style={{
            fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
            border: isAllSelected ? '0.5px solid #00E5A0' : '0.5px solid var(--color-border-default)',
            background: isAllSelected ? 'rgba(0,229,160,0.08)' : 'transparent',
            color: isAllSelected ? '#00B883' : 'var(--color-text-secondary)',
          }}>전체</button>
          {segGroups.map(g => {
            const codes = g.segs.map(s => s.code)
            const allSel = codes.length > 0 && codes.every(c => selectedSegs.has(c))
            const someSel = codes.some(c => selectedSegs.has(c))
            return (
              <button key={g.id} onClick={() => handleToggleGroup(codes)} style={{
                fontSize: 11, fontWeight: 500, padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                border: allSel ? '0.5px solid #00E5A0' : someSel ? '0.5px solid #60A5FA' : '0.5px solid var(--color-border-default)',
                background: allSel ? 'rgba(0,229,160,0.08)' : someSel ? 'rgba(96,165,250,0.08)' : 'transparent',
                color: allSel ? '#00B883' : someSel ? '#60A5FA' : 'var(--color-text-secondary)',
              }}>{g.label}</button>
            )
          })}
          <span style={{ color: 'var(--color-border-default)', padding: '0 2px' }}>|</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>어카운트</span>
          <AccDropdown accounts={accountList} selected={selectedAccounts} onToggle={handleToggleAccount} onSelectAll={handleSelectAllAccounts} />
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
