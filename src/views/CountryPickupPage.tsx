'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, BarChart2, Coins, TrendingUp, FileSpreadsheet } from 'lucide-react'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import DatePicker from '@/components/DatePicker'
import { fmtK, fmtM } from '@/utils/pickupPageUtils'
import CountryPickupTable from '@/components/country-pickup/CountryPickupTable'
import CountryPickupDownloadModal from '@/components/country-pickup/CountryPickupDownloadModal'
import CountryDistributionModal from '@/components/country-pickup/CountryDistributionModal'
import { type CountryPickupRpcRow, type SegmentOption } from '@/components/country-pickup/types'

// ─── 세그먼트 드롭다운 (FIT/GRP) — 다중선택 ────────────────────────────────────────
function SegDropdown({ label, segs, selected, activeSegs, onApply }: {
  label: string; segs: { code: string; name: string }[]; selected: Set<string>; activeSegs: Set<string>
  onApply: (segs: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  // 드롭다운 열릴 때 현재 선택값(해당 그룹분)으로 temp 초기화
  useEffect(() => {
    if (open) setTempSelected(new Set(segs.filter(s => selected.has(s.code)).map(s => s.code)))
  }, [open])   // eslint-disable-line react-hooks/exhaustive-deps
  const toggleTemp = (code: string) => setTempSelected(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n })
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
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200, background: '#0a0a0a', border: '0.5px solid #333', borderRadius: 8, width: 'max-content', minWidth: 200, maxWidth: 360, whiteSpace: 'nowrap', boxShadow: '0 6px 20px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: 6 }}>
          {segs.length === 0 ? (
            <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--color-text-secondary)' }}>없음</div>
          ) : segs.map(s => {
            const on = tempSelected.has(s.code)
            const isActive = activeSegs.has(s.code)
            return (
              <div key={s.code} onClick={() => isActive && toggleTemp(s.code)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 5, cursor: isActive ? 'pointer' : 'not-allowed', opacity: isActive ? 1 : 0.4, fontSize: 11, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}
                onMouseEnter={e => { if (isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, border: on ? 'none' : '1.5px solid #444', background: on ? '#00E5A0' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#000' }}>{on ? '✓' : ''}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, width: '100%' }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{s.name}{!isActive ? ' · no data' : ''}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{s.code}</span>
                </div>
              </div>
            )
          })}
          </div>
          {/* Reset / All / Done */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: '0.5px solid #333', background: '#0a0a0a' }}>
            <button onClick={() => setTempSelected(new Set())} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '0.5px solid #333', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Reset</button>
            <button onClick={() => setTempSelected(new Set(segs.filter(s => activeSegs.has(s.code)).map(s => s.code)))} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '0.5px solid #333', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>All</button>
            <button onClick={() => { onApply([...tempSelected]); setOpen(false) }} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', background: '#00E5A0', color: '#0a0a0a', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 어카운트 드롭다운 — 다중선택 ──────────────────────────────────────────────────
function AccDropdown({ accounts, selected, onApply }: {
  accounts: string[]; selected: Set<string>; onApply: (accs: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  // 드롭다운 열릴 때 현재 선택값으로 temp 초기화
  useEffect(() => {
    if (open) setTempSelected(new Set(selected))
  }, [open])   // eslint-disable-line react-hooks/exhaustive-deps
  const toggleTemp = (a: string) => setTempSelected(prev => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n })
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
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200, background: '#0a0a0a', border: '0.5px solid #333', borderRadius: 8, minWidth: 180, boxShadow: '0 6px 20px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: 6 }}>
          <div onClick={() => setTempSelected(new Set())} style={{ padding: '5px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: tempSelected.size === 0 ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)', background: tempSelected.size === 0 ? 'var(--accent-badge-bg)' : 'transparent' }}>전체</div>
          {accounts.length === 0 ? (
            <div style={{ padding: '5px 8px', fontSize: 11, color: 'var(--color-text-secondary)' }}>없음</div>
          ) : accounts.map(a => {
            const on = tempSelected.has(a)
            return (
              <div key={a} onClick={() => toggleTemp(a)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, border: on ? 'none' : '1.5px solid #444', background: on ? '#00E5A0' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#000' }}>{on ? '✓' : ''}</span>
                {a}
              </div>
            )
          })}
          </div>
          {/* Reset / All / Done */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: '0.5px solid #333', background: '#0a0a0a' }}>
            <button onClick={() => setTempSelected(new Set())} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '0.5px solid #333', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>Reset</button>
            <button onClick={() => setTempSelected(new Set(accounts))} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '0.5px solid #333', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 11, cursor: 'pointer' }}>All</button>
            <button onClick={() => { onApply([...tempSelected]); setOpen(false) }} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', background: '#00E5A0', color: '#0a0a0a', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 세계지도 매핑 (alpha-3 → ISO numeric / 대표 좌표) ──────────────────────────────
const ALPHA3_TO_NUMERIC: Record<string, string> = {
  KOR:'410', CHN:'156', JPN:'392', USA:'840',
  GBR:'826', DEU:'276', AUS:'036', HKG:'344',
  SGP:'702', ISR:'376', NZL:'554', FRA:'250',
  CAN:'124', ITA:'380', ESP:'724', NLD:'528',
  CHE:'756', ARE:'784', MYS:'458', IDN:'360',
  IRL:'372', AUT:'040', BEL:'056', ARG:'032',
  BGD:'050', CZE:'203', EGY:'818', KAZ:'398',
  MCO:'492', MLT:'470', MNG:'496', THA:'764',
  VNM:'704', PHL:'608', RUS:'643', SAU:'682',
  QAT:'634', TUR:'792', MEX:'484', BRA:'076',
}

const COUNTRY_COORDS: Record<string, [number, number]> = {
  KOR:[127.7,35.9], CHN:[104.1,35.8], JPN:[138.2,36.2],
  USA:[-95.7,37.1], GBR:[-3.4,55.3],  DEU:[10.4,51.1],
  AUS:[133.7,-25.2],SGP:[103.8,1.3],  ISR:[34.8,31.0],
  NZL:[172.5,-40.9],HKG:[114.1,22.3],
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

  // OTB 기준월보다 이전 월이면 Actual 데이터(get_country_actual_data) 사용 (KST)
  const otbYear  = otbBase.getFullYear()
  const otbMonth = otbBase.getMonth() + 1   // 1-based
  const isPastMonth = selectedYear < otbYear || (selectedYear === otbYear && (selectedMonth + 1) < otbMonth)

  // 세그먼트 / 어카운트 선택 (빈 Set = 전체)
  const [selectedSegs, setSelectedSegs] = useState<Set<string>>(new Set())
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  // SegDropdown Done(onApply) — 해당 그룹(picked)만 selectedSegs에 반영 (다른 그룹 보존)
  const applySegGroup = (groupCodes: string[], picked: string[]) => {
    setSelectedSegs(prev => {
      const next = new Set(prev)
      groupCodes.forEach(c => next.delete(c))
      picked.forEach(c => next.add(c))
      return next
    })
    setSelectedAccounts(new Set())   // 세그 변경 시 어카운트 초기화
  }
  const handleSelectAll = () => { setSelectedSegs(new Set()); setSelectedAccounts(new Set()) }

  // vs LY 모드 (date=동일자 / match=동기간)
  const [lyMode, setLyMode] = useState<'date' | 'match'>('date')
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [showDistModal, setShowDistModal] = useState(false)

  // 국가별 픽업 — 전체 1회 호출 (p_segmentation=NULL), 클라이언트에서 필터/합산
  const { data: rpcRows = [], isLoading } = useQuery<CountryPickupRpcRow[]>({
    queryKey: ['country-pickup', hotelId, otbDate, vsDate, selectedYear, selectedMonth, lyMode, isPastMonth],
    enabled: !!hotelId && !!otbDate && !!vsDate,
    queryFn: async () => {
      if (!otbDate || !vsDate) return []
      if (isPastMonth) {
        // 이전월 → a01_actual_daily
        const { data, error } = await (supabase as any).rpc('get_country_actual_data', {
          p_hotel_id:     hotelId,
          p_year:         selectedYear,
          p_month:        selectedMonth + 1,
          p_segmentation: null,
          p_account_name: null,
        })
        if (error) throw error
        return (data ?? []) as CountryPickupRpcRow[]
      }
      // 현재월 이후 → a02_otb_daily
      const { data, error } = await (supabase as any).rpc('get_country_pickup_data', {
        p_hotel_id:     hotelId,
        p_otb_date:     otbDate,
        p_vs_date:      vsDate,
        p_year:         selectedYear,
        p_month:        selectedMonth + 1,
        p_segmentation: null,
        p_account_name: null,
        p_ly_mode:      lyMode,
      })
      if (error) throw error
      return (data ?? []) as CountryPickupRpcRow[]
    },
  })

  // 이전월일 때만 전년도 Actual 별도 조회 (vs LY / LY Actual 컬럼용)
  const { data: lyData } = useQuery<CountryPickupRpcRow[] | null>({
    queryKey: ['country_ly', hotelId, selectedYear, selectedMonth, isPastMonth],
    enabled: !!hotelId && isPastMonth,
    queryFn: async () => {
      if (!isPastMonth) return null
      const { data, error } = await (supabase as any).rpc('get_country_actual_data', {
        p_hotel_id:     hotelId,
        p_year:         selectedYear - 1,   // 전년도
        p_month:        selectedMonth + 1,
        p_segmentation: null,
        p_account_name: null,
      })
      if (error) throw error
      return (data ?? []) as CountryPickupRpcRow[]
    },
  })

  // ─── 세그먼트 전체 목록 (c05_market_table_schema) ────────────────────────────────
  const [segmentOptions, setSegmentOptions] = useState<SegmentOption[]>([])
  useEffect(() => {
    if (!hotelId) return
    ;(supabase as any)
      .from('c05_market_table_schema')
      .select('segmentation, name, sorting2, order_index')
      .eq('hotel_id', hotelId)
      .not('segmentation', 'eq', '{}')   // 빈 배열(상위 그룹 row) 제외
      .order('order_index', { ascending: true })
      .then(({ data: schemaData }: any) => {
        if (!schemaData) return
        const options: SegmentOption[] = []
        schemaData.forEach((row: any) => {
          let segs: string[] = []
          try {
            segs = Array.isArray(row.segmentation) ? row.segmentation : JSON.parse(row.segmentation ?? '[]')
          } catch { segs = [] }
          const s2 = String(row.sorting2 ?? '').toLowerCase()
          const norm = s2.includes('fit')
            ? 'fit'
            : (s2.includes('grp') || s2.includes('group'))
            ? 'group'
            : s2
          segs.forEach(seg => {
            if (seg) options.push({ code: seg, name: row.name ?? seg, sorting2: norm, orderIndex: row.order_index ?? 999 })
          })
        })
        options.sort((a, b) => a.orderIndex - b.orderIndex)
        setSegmentOptions(options)
      })
  }, [hotelId])

  // ─── Active Countries 세계지도 (D3 + topojson) ──────────────────────────────────
  const mapCardRef    = useRef<HTMLDivElement>(null)
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const pulseLayerRef = useRef<HTMLDivElement>(null)

  const activeNums = useMemo(() => {
    const set = new Set<string>()
    rpcRows.forEach(r => {
      const num = ALPHA3_TO_NUMERIC[r.country]
      if (num) set.add(num)
    })
    return set
  }, [rpcRows])

  useEffect(() => {
    const card   = mapCardRef.current
    const canvas = canvasRef.current
    const layer  = pulseLayerRef.current
    if (!card || !canvas || !layer) return

    const W = card.offsetWidth
    const H = card.offsetHeight
    canvas.width  = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    layer.innerHTML = ''

    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then((world: any) => {
        const countries = topojson.feature(world, world.objects.countries) as any
        const proj = d3.geoNaturalEarth1()
          .scale(W / 5.6)
          .translate([W * 0.5, H * 0.54])
        const path = d3.geoPath().projection(proj).context(ctx)

        // 전체 국가
        ctx.beginPath()
        countries.features.forEach((f: any) => path(f))
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fill()

        // 활성 국가 민트
        countries.features.forEach((f: any) => {
          const id = String(f.id).padStart(3, '0')
          if (activeNums.has(id)) {
            ctx.beginPath(); path(f)
            ctx.fillStyle = 'rgba(0,229,160,0.35)'
            ctx.fill()
          }
        })

        // 국경선
        ctx.beginPath()
        path(topojson.mesh(world, world.objects.countries, (a: any, b: any) => a !== b))
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.lineWidth   = 0.4
        ctx.stroke()

        // 펄스 점 (동일 국가 중복 방지)
        const seen = new Set<string>()
        rpcRows.forEach((row, i) => {
          if (seen.has(row.country)) return
          seen.add(row.country)
          const coords = COUNTRY_COORDS[row.country]
          if (!coords) return
          const [px, py] = proj(coords) ?? [0, 0]
          const isKor = row.country === 'KOR'
          const size  = isKor ? 7 : 4

          const dot = document.createElement('div')
          dot.style.cssText = `
            position:absolute;left:${px - size/2}px;top:${py - size/2}px;
            width:${size}px;height:${size}px;border-radius:50%;
            background:#00E5A0;box-shadow:0 0 ${isKor ? 10 : 5}px #00E5A0;
            z-index:3;animation:dp 2s ease-in-out ${i * 0.18}s infinite alternate;
          `
          layer.appendChild(dot)

          if (isKor) {
            const ripple = document.createElement('div')
            ripple.style.cssText = `
              position:absolute;left:${px - 14}px;top:${py - 14}px;
              width:28px;height:28px;border-radius:50%;
              border:1.5px solid rgba(0,229,160,0.4);
              z-index:2;animation:rp 2s ease-out infinite;
            `
            layer.appendChild(ripple)
          }
        })
      })
      .catch(console.error)
  }, [activeNums, rpcRows])

  // FIT/GRP 세그먼트 목록 — c05 스키마(segmentOptions) 기준, 활성 여부는 rpcRows 기준
  const activeSegs = useMemo(() => new Set(rpcRows.map(r => r.segmentation).filter(Boolean)), [rpcRows])
  const fitSegs = useMemo(() => segmentOptions.filter(s => s.sorting2 === 'fit'), [segmentOptions])
  const grpSegs = useMemo(() => segmentOptions.filter(s => s.sorting2 === 'group'), [segmentOptions])

  // 어카운트 목록 (선택 세그 기준 distinct account_name)
  const accountList = useMemo(() => {
    const base = selectedSegs.size === 0 ? rpcRows : rpcRows.filter(r => selectedSegs.has(r.segmentation))
    return [...new Set(base.map(r => r.account_name))].filter(Boolean).sort()
  }, [rpcRows, selectedSegs])

  // 클라이언트 필터(세그+어카운트) — 세그 단위 행 (차트/테이블에서 country 집계)
  const filtered = useMemo(() => {
    let f = selectedSegs.size === 0 ? rpcRows : rpcRows.filter(r => selectedSegs.has(r.segmentation))
    if (selectedAccounts.size > 0) f = f.filter(r => selectedAccounts.has(r.account_name))
    return f
  }, [rpcRows, selectedSegs, selectedAccounts])

  // 전년도 Actual — 현재 뷰와 동일한 세그/어카운트 필터 적용 (이전월에만)
  const lyFiltered = useMemo(() => {
    if (!isPastMonth || !lyData) return null
    let f = selectedSegs.size === 0 ? lyData : lyData.filter(r => selectedSegs.has(r.segmentation))
    if (selectedAccounts.size > 0) f = f.filter(r => selectedAccounts.has(r.account_name))
    return f
  }, [lyData, isPastMonth, selectedSegs, selectedAccounts])

  // KPI — filtered 전체 합산 (ADR은 WON, 표시 시 fmtK)
  const kpi = useMemo(() => {
    let otbRn = 0, vsRn = 0, otbRev = 0, vsRev = 0
    const countries = new Set<string>()
    for (const r of filtered) {
      if (isPastMonth) {
        otbRn += r.nights ?? 0; otbRev += r.room_revenue ?? 0   // 이전월: nights/room_revenue
      } else {
        otbRn += r.otb_nights ?? 0; vsRn += r.vs_nights ?? 0
        otbRev += r.otb_revenue ?? 0; vsRev += r.vs_revenue ?? 0
      }
      countries.add(r.country)
    }
    const totalOtbAdr = otbRn > 0 ? Math.round(otbRev / otbRn) : 0
    const totalVsAdr  = vsRn  > 0 ? Math.round(vsRev / vsRn)  : 0
    return {
      countryCount: countries.size,
      totalOtbRn: otbRn,
      puRn: isPastMonth ? 0 : otbRn - vsRn,
      totalOtbAdr,
      puAdr: isPastMonth ? 0 : totalOtbAdr - totalVsAdr,
      totalOtbRev: otbRev,
      puRev: isPastMonth ? 0 : otbRev - vsRev,
    }
  }, [filtered, isPastMonth])

  const cardStyle: React.CSSProperties = {
    background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10,
    padding: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
  }
  const cardBig: React.CSSProperties = { fontSize: 24, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1 }
  const cardUnit: React.CSSProperties = { fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 400, marginLeft: 3 }
  const dash = isLoading ? '—' : null
  const puAdr = kpi.puAdr

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--color-text-primary)' }}>Country Pick-up</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex' }}>
              <DatePicker label="OTB" value={otbDate} onChange={setOtbDate} availableDates={otbDates ?? []} accent bare fontPx={11} plain />
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>vs</span>
            <span style={{ display: 'inline-flex' }}>
              <DatePicker label="vs" value={vsOtbDate} onChange={setVsOtbDate} availableDates={(otbDates ?? []).filter(d => d < otbDate)} accent bare fontPx={11} plain />
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>· 기준 국가별 OTB 픽업</span>
          </div>
        </div>
      </div>

      {/* 월 네비 + 필터 (한 행) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {/* 좌: 월 네비 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={handlePrevMonth} aria-label="이전 달" style={{ width: 24, height: 24, borderRadius: '50%', border: '0.5px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', minWidth: 68, textAlign: 'center' }}>{selectedYear}년 {selectedMonth + 1}월</span>
          <button onClick={handleNextMonth} aria-label="다음 달" style={{ width: 24, height: 24, borderRadius: '50%', border: '0.5px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>

        {/* 우: 필터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>세그먼트</span>
          <button onClick={handleSelectAll} style={{
            fontSize: 11, fontWeight: 500, padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
            border: selectedSegs.size === 0 ? '0.5px solid #00E5A0' : '0.5px solid var(--color-border-default)',
            background: selectedSegs.size === 0 ? 'rgba(0,229,160,0.08)' : 'transparent',
            color: selectedSegs.size === 0 ? '#00B883' : 'var(--color-text-secondary)',
          }}>전체</button>
          <SegDropdown
            label="FIT"
            segs={fitSegs.map(s => ({ code: s.code, name: s.name }))}
            selected={selectedSegs}
            activeSegs={activeSegs}
            onApply={picked => applySegGroup(fitSegs.map(f => f.code), picked)}
          />
          <SegDropdown
            label="GRP"
            segs={grpSegs.map(s => ({ code: s.code, name: s.name }))}
            selected={selectedSegs}
            activeSegs={activeSegs}
            onApply={picked => applySegGroup(grpSegs.map(g => g.code), picked)}
          />
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>어카운트</span>
          <AccDropdown accounts={accountList} selected={selectedAccounts} onApply={accs => setSelectedAccounts(new Set(accs))} />
          <div style={{ width: 1, height: 13, background: 'var(--color-border-subtle)' }} />
          <button
            onClick={() => setShowDownloadModal(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6,
              border: '0.5px solid rgba(0,229,160,0.4)', background: 'rgba(0,229,160,0.06)',
              color: '#00E5A0', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}
          >
            <FileSpreadsheet size={14} />
            Download
          </button>
        </div>
      </div>

      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
        {/* 1 — 국가 수 (세계지도 배경) */}
        <div
          ref={mapCardRef}
          style={{
            background: '#0d1117',
            border: '0.5px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 0, opacity: 0.9 }} />
          <div ref={pulseLayerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }} />
          <div style={{ fontSize: 10, lineHeight: 1.4, color: 'rgba(255,255,255,0.9)', position: 'relative', zIndex: 1, textShadow: '0 0 8px rgba(0,0,0,1), 0 0 16px rgba(0,0,0,1)' }}>Active Countries</div>
          <div style={{ fontSize: 28.8, fontWeight: 500, color: '#fff', lineHeight: 1, position: 'relative', zIndex: 1, textShadow: '0 0 8px rgba(0,0,0,1), 0 0 16px rgba(0,0,0,1)' }}>
            {dash ?? kpi.countryCount}
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 400, marginLeft: 3 }}>countries</span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', position: 'relative', zIndex: 1, marginTop: 'auto', textShadow: '0 0 8px rgba(0,0,0,1), 0 0 16px rgba(0,0,0,1)' }}>Based on filters</div>
        </div>
        {/* 2 — OTB R/N */}
        <div style={cardStyle}>
          <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Room Nights</span>
              <BarChart2 size={20} style={{ opacity: 0.3, color: 'var(--color-text-secondary)', flexShrink: 0 }} />
            </div>
            <div style={cardBig}>{dash ?? kpi.totalOtbRn.toLocaleString('ko-KR')}</div>
          </div>
          <div style={{ height: '0.5px', background: 'var(--color-border-subtle)' }} />
          <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Pickup</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: kpi.puRn > 0 ? '#00B883' : kpi.puRn < 0 ? '#E24B4A' : 'var(--color-text-tertiary)' }}>
              {kpi.puRn > 0 ? `+${kpi.puRn.toLocaleString()} R/N` : kpi.puRn < 0 ? `${kpi.puRn.toLocaleString()} R/N` : '—'}
            </span>
          </div>
        </div>
        {/* 3 — OTB ADR */}
        <div style={cardStyle}>
          <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Average Daily Rate</span>
              <Coins size={20} style={{ opacity: 0.3, color: 'var(--color-text-secondary)', flexShrink: 0 }} />
            </div>
            <div style={cardBig}>{dash ?? fmtK(kpi.totalOtbAdr)}<span style={cardUnit}>KRW</span></div>
          </div>
          <div style={{ height: '0.5px', background: 'var(--color-border-subtle)' }} />
          <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Change</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: puAdr > 0 ? '#00B883' : puAdr < 0 ? '#E24B4A' : 'var(--color-text-tertiary)' }}>
              {puAdr === 0 ? '—' : puAdr > 0 ? `+${fmtK(puAdr)}` : fmtK(puAdr)}
            </span>
          </div>
        </div>
        {/* 4 — OTB REV */}
        <div style={cardStyle}>
          <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Revenue</span>
              <TrendingUp size={20} style={{ opacity: 0.3, color: 'var(--color-text-secondary)', flexShrink: 0 }} />
            </div>
            <div style={cardBig}>{dash ?? fmtM(kpi.totalOtbRev)}<span style={cardUnit}>KRW</span></div>
          </div>
          <div style={{ height: '0.5px', background: 'var(--color-border-subtle)' }} />
          <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Pickup</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: kpi.puRev > 0 ? '#00B883' : kpi.puRev < 0 ? '#E24B4A' : 'var(--color-text-tertiary)' }}>
              {kpi.puRev > 0 ? `+${fmtM(kpi.puRev)}` : kpi.puRev < 0 ? fmtM(kpi.puRev) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 본문: 테이블 단독 풀사이즈 */}
      {isLoading ? (
        <div className="animate-pulse" style={{ height: 360, background: 'var(--color-bg-tertiary)', borderRadius: 10 }} />
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--color-bg-secondary)', border: '0.5px solid var(--color-border-subtle)', borderRadius: 10, padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
          해당 조건의 국가별 픽업 데이터가 없습니다.
        </div>
      ) : (
        <CountryPickupTable data={filtered} isPastMonth={isPastMonth} lyData={lyFiltered} lyMode={lyMode} onToggleLyMode={() => setLyMode(m => (m === 'date' ? 'match' : 'date'))} onOpenDistribution={() => setShowDistModal(true)} />
      )}

      {showDownloadModal && (
        <CountryPickupDownloadModal
          data={rpcRows}
          segmentOptions={segmentOptions}
          currentMonth={selectedMonth + 1}
          currentYear={selectedYear}
          otbDate={otbDate}
          hotelId={hotelId}
          onClose={() => setShowDownloadModal(false)}
        />
      )}

      {showDistModal && (
        <CountryDistributionModal
          data={rpcRows}
          segmentOptions={segmentOptions}
          onClose={() => setShowDistModal(false)}
        />
      )}
    </div>
  )
}
