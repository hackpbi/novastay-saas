'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Download, Upload, ChevronDown, Loader2, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import MarketTable, { MarketTableColumn } from '@/components/tables/MarketTable'

// ── Types ─────────────────────────────────────────────────────────────────────

type TabType = 'monthly' | 'daily'

type MonthVal        = { rn: number; rev: number }
type BudgetMonthData = Record<string, Record<number, MonthVal>>
type BudgetDailyEdits= Record<string, Record<string, MonthVal>>   // date → seg → {rn,rev}

type BudgetMonthlyRow = {
  segmentation:   string
  sorting1:       string | null
  sorting2:       string | null
  sorting3:       string | null
  month_num:      number
  budget_nights:  number
  budget_revenue: number
}

type BudgetDailyRow = {
  business_date:  string
  segmentation:   string
  sorting1:       string | null
  sorting2:       string | null
  sorting3:       string | null
  budget_nights:  number
  budget_revenue: number
  act_nights:     number
  act_revenue:    number
  otb_nights:     number
  otb_revenue:    number
}


type DistributedRow = {
  business_date:  string
  segmentation:   string
  budget_nights:  number
  budget_revenue: number
  has_warning:    boolean
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (!n) return ''
  return n.toLocaleString('ko-KR')
}

function parseNumber(s: string): number {
  return Number(s.replace(/,/g, '')) || 0
}

function getDaysInMonth(year: number, month: number) {
  return Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => {
    const date = new Date(year, month - 1, i + 1)
    return {
      date:      date.toISOString().split('T')[0],
      dayOfWeek: ['일', '월', '화', '수', '목', '금', '토'][date.getDay()],
    }
  })
}

const DAY_COLOR: Record<string, string> = { 토: '#4A9EFF', 일: '#FC8181' }

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}`
  return n.toLocaleString('ko-KR')
}

// ── Input Cell ────────────────────────────────────────────────────────────────

function InputCell({
  value, onChange, onBlur, unit = 1,
}: {
  value:    number
  onChange: (v: number) => void
  onBlur:   () => void
  unit?:    number
}) {
  const fmt = (v: number) => !v ? '' : unit > 1 ? (v / unit).toFixed(1) : formatNumber(v)
  const [local, setLocal] = useState(fmt(value))
  useEffect(() => { setLocal(fmt(value)) }, [value, unit])

  return (
    <input
      type="text"
      value={local}
      onChange={e => { setLocal(e.target.value); onChange(parseNumber(e.target.value) * unit) }}
      onBlur={onBlur}
      className="w-full px-1 py-0.5 text-right text-xs rounded focus:outline-none focus:ring-1"
      style={{
        background:  'transparent',
        border:      '1px solid transparent',
        color:       'inherit',
        '--tw-ring-color': 'var(--color-border-default)',
      } as React.CSSProperties}
    />
  )
}

// ── 안정적인 빈 배열 상수 (컴포넌트 외부) ─────────────────────────────────────
// useQuery data가 undefined일 때 = [] 디폴트는 매 렌더마다 새 참조 생성 → useEffect 루프
// 컴포넌트 외부 상수로 고정하면 참조가 항상 동일 → 루프 방지
const EMPTY_MONTHLY_ROWS: BudgetMonthlyRow[] = []
const EMPTY_DAILY_ROWS:   BudgetDailyRow[]   = []

// ── Main Component ────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const queryClient      = useQueryClient()
  const { profile }      = useAuth()
  const { currentHotel } = useHotel()
  const { otbDate }      = useDateContext()
  const hotelId          = currentHotel?.id ?? ''

  const [selectedYear,    setSelectedYear]    = useState(new Date().getFullYear())
  const [selectedMonth,   setSelectedMonth]   = useState(new Date().getMonth() + 1)
  const [activeTab,       setActiveTab]       = useState<TabType>('monthly')
  const [budgetDate,      setBudgetDate]      = useState<string>('')
  const [budgetData,      setBudgetData]      = useState<BudgetMonthData>({})
  const [dailyEdits,      setDailyEdits]      = useState<BudgetDailyEdits>({})
  const [saving,          setSaving]          = useState(false)
  const [importing,       setImporting]       = useState(false)
  const [saveError,       setSaveError]       = useState<string | null>(null)
  const [initConfirm,     setInitConfirm]     = useState(false)
  const [uploadedBudget,  setUploadedBudget]  = useState<Record<string, Record<number, MonthVal>> | null>(null)
  const [distributedData, setDistributedData] = useState<DistributedRow[]>([])
  const [warnings,        setWarnings]        = useState<string[]>([])
  const [showDistributed, setShowDistributed] = useState(false)
  const [isDistributing,  setIsDistributing]  = useState(false)
  const [isSaving,        setIsSaving]        = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i)

  // ── Budget 기준일 목록 (get_budget_dates) ────────────────────────────────────
  const { data: budgetDates = [] } = useQuery<string[]>({
    queryKey: ['budget_dates', hotelId],
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_budget_dates', { p_hotel_id: hotelId })
      if (error) throw error
      return (data ?? []) as string[]
    },
    enabled:   !!hotelId,
    staleTime: 5 * 60 * 1000,
  })

  // 가장 최근 날짜 자동 선택 — budgetDate를 deps에서 제거해 무한 루프 방지
  useEffect(() => {
    if (budgetDates.length > 0) {
      setBudgetDate(prev => prev || budgetDates[0])
    }
  }, [budgetDates])

  // ── 0. 객실수 + 세그먼트 스키마 조회 ─────────────────────────────────────────
  const { data: hotelDetail } = useQuery<{ room_count: number }>({
    queryKey: ['m03_hotel_details', hotelId],
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('m03_hotel_details')
        .select('room_count')
        .eq('hotel_id', hotelId)
        .single()
      if (error) throw error
      return data
    },
    enabled:   !!hotelId,
    staleTime: 10 * 60 * 1000,
  })
  const roomCount = hotelDetail?.room_count ?? 0

  const { data: schemaRows = [] } = useQuery<{ segmentation: string[] | null; order_index: number }[]>({
    queryKey: ['c05_market_table_schema', hotelId],
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('c05_market_table_schema')
        .select('segmentation, order_index')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
        .order('order_index')
      if (error) throw error
      return data ?? []
    },
    enabled:   !!hotelId,
    staleTime: 10 * 60 * 1000,
  })

  const schemaSegs = useMemo(() => {
    const seen = new Set<string>()
    const segs: string[] = []
    schemaRows.forEach(row => {
      (row.segmentation ?? []).forEach((s: string) => { if (!seen.has(s)) { seen.add(s); segs.push(s) } })
    })
    return segs
  }, [schemaRows])


  // ── 1. 월별 조회 (get_budget_monthly) ─────────────────────────────────────────
  const { data: budgetMonthlyRows = EMPTY_MONTHLY_ROWS, isLoading: monthlyLoading } = useQuery<BudgetMonthlyRow[]>({
    queryKey: ['budget_monthly', hotelId, selectedYear, budgetDate],
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_budget_monthly', {
          p_hotel_id:    hotelId,
          p_year:        selectedYear,
          p_update_date: budgetDate || undefined,
        })
      if (error) throw error
      return data ?? []
    },
    enabled:   !!hotelId,
    staleTime: 5 * 60 * 1000,
  })

  // 월별 RPC 결과 → 로컬 편집 상태 초기화
  useEffect(() => {
    const result: BudgetMonthData = {}
    budgetMonthlyRows.forEach(row => {
      if (!result[row.segmentation]) result[row.segmentation] = {}
      result[row.segmentation][row.month_num] = {
        rn:  row.budget_nights  ?? 0,
        rev: row.budget_revenue ?? 0,
      }
    })
    setBudgetData(result)
  }, [budgetMonthlyRows])

  // ── 2. 일별 조회 (get_budget_daily) ───────────────────────────────────────────
  const { data: budgetDailyRows = EMPTY_DAILY_ROWS, isLoading: dailyLoading } = useQuery<BudgetDailyRow[]>({
    queryKey: ['budget_daily', hotelId, selectedYear, selectedMonth, otbDate],
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_budget_daily', {
          p_hotel_id: hotelId,
          p_year:     selectedYear,
          p_month:    selectedMonth,
          p_otb_date: otbDate,
        })
        .limit(100000)
      if (error) throw error
      return data ?? []
    },
    enabled:   !!hotelId && !!otbDate && activeTab === 'daily',
    staleTime: 5 * 60 * 1000,
  })

  // 일별 RPC 결과 → 로컬 편집 상태 초기화
  useEffect(() => {
    const edits: BudgetDailyEdits = {}
    budgetDailyRows.forEach(row => {
      if (!edits[row.business_date]) edits[row.business_date] = {}
      edits[row.business_date][row.segmentation] = {
        rn:  row.budget_nights  ?? 0,
        rev: row.budget_revenue ?? 0,
      }
    })
    setDailyEdits(edits)
  }, [budgetDailyRows])

  // ── 3. 전년 실적 불러오기 ────────────────────────────────────────────────────
  // init_budget_from_actual RPC 내부 중복 upsert 오류 회피:
  // 클라이언트에서 calendar + actual 직접 조회 후 중복 제거 → upsert_budget 호출
  const handleInitFromActual = async () => {
    if (!hotelId || !profile?.id) return
    setImporting(true)
    setSaveError(null)
    try {
      // 1. 해당 연도 calendar에서 yoy_match 날짜 조회 (컬럼명: date)
      const { data: calRows, error: calErr } = await (supabase as any)
        .from('c06_calendar')
        .select('date, yoy_match')
        .gte('date', `${selectedYear}-01-01`)
        .lte('date', `${selectedYear}-12-31`)
      if (calErr) throw calErr

      const validCal: { date: string; yoy_match: string }[] =
        (calRows ?? []).filter((r: any) => r.yoy_match)

      const yoyDates = [...new Set(validCal.map((r: any) => r.yoy_match))]

      // 2. 전년 실적 조회
      const { data: actRows, error: actErr } = await (supabase as any)
        .from('a01_actual_daily')
        .select('business_date, segmentation, nights, room_revenue')
        .eq('hotel_id', hotelId)
        .in('business_date', yoyDates)
      if (actErr) throw actErr

      // 3. yoy_match → actual 매핑
      const actMap: Record<string, Record<string, { rn: number; rev: number }>> = {}
      ;(actRows ?? []).forEach((r: any) => {
        if (!actMap[r.business_date]) actMap[r.business_date] = {}
        actMap[r.business_date][r.segmentation] = {
          rn:  r.nights       ?? 0,
          rev: r.room_revenue ?? 0,
        }
      })

      // 4. 행 생성 — Map으로 중복 제거 (동일 date+seg 는 마지막 값 유지)
      const rowMap = new Map<string, any>()
      validCal.forEach(cal => {
        const yoyData = actMap[cal.yoy_match] ?? {}
        Object.entries(yoyData).forEach(([seg, val]) => {
          const key = `${cal.date}__${seg}`
          rowMap.set(key, {
            business_date:  cal.date,
            segmentation:   seg,
            sorting1:       null,
            sorting2:       null,
            sorting3:       null,
            budget_nights:  val.rn,
            budget_revenue: val.rev,
          })
        })
      })

      const rows = Array.from(rowMap.values())
      if (rows.length === 0) {
        setSaveError('불러올 전년 실적 데이터가 없습니다.')
        return
      }

      // 5. upsert_budget RPC 호출 (청크 500)
      const CHUNK = 500
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await (supabase as any)
          .rpc('upsert_budget', {
            p_hotel_id:    hotelId,
            p_profile_id:  profile.id,
            p_update_date: budgetDate || new Date().toISOString().split('T')[0],
            p_rows:        rows.slice(i, i + CHUNK),
          })
        if (error) throw error
      }

      queryClient.invalidateQueries({ queryKey: ['budget_monthly', hotelId, selectedYear] })
      queryClient.invalidateQueries({ queryKey: ['budget_daily',   hotelId, selectedYear] })
      setSaveError(null)
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setImporting(false)
      setInitConfirm(false)
    }
  }

  // ── 4. 월별 저장 — onBlur (upsert_budget) ─────────────────────────────────────
  const saveBudgetMonthly = useCallback(async (segmentation: string, month: number) => {
    if (!hotelId || !profile?.id) return
    const rn  = budgetData[segmentation]?.[month]?.rn  ?? 0
    const rev = budgetData[segmentation]?.[month]?.rev ?? 0
    const daysInMonth = new Date(selectedYear, month, 0).getDate()
    const dailyRn     = Math.round(rn  / daysInMonth)
    const dailyRev    = Math.round(rev / daysInMonth)

    const rows = Array.from({ length: daysInMonth }, (_, i) => ({
      business_date:  `${selectedYear}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
      segmentation,
      sorting1:       null,
      sorting2:       null,
      sorting3:       null,
      budget_nights:  dailyRn,
      budget_revenue: dailyRev,
    }))

    try {
      const { data, error } = await (supabase as any)
        .rpc('upsert_budget', {
          p_hotel_id:    hotelId,
          p_profile_id:  profile.id,
          p_update_date: budgetDate || new Date().toISOString().split('T')[0],
          p_rows:        rows,
        })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['budget_monthly', hotelId, selectedYear] })
    } catch (err: any) {
      console.error('월별 저장 오류:', err.message)
    }
  }, [hotelId, profile?.id, budgetData, selectedYear, queryClient, budgetDate])

  // ── 5. 일별 저장 — onBlur (upsert_budget) ─────────────────────────────────────
  const saveBudgetDaily = useCallback(async (businessDate: string, segmentation: string) => {
    if (!hotelId || !profile?.id) return
    const rn  = dailyEdits[businessDate]?.[segmentation]?.rn  ?? 0
    const rev = dailyEdits[businessDate]?.[segmentation]?.rev ?? 0

    try {
      const { data, error } = await (supabase as any)
        .rpc('upsert_budget', {
          p_hotel_id:    hotelId,
          p_profile_id:  profile.id,
          p_update_date: budgetDate || new Date().toISOString().split('T')[0],
          p_rows: [{
            business_date:  businessDate,
            segmentation,
            sorting1:       null,
            sorting2:       null,
            sorting3:       null,
            budget_nights:  rn,
            budget_revenue: rev,
          }],
        })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['budget_daily', hotelId, selectedYear, selectedMonth, otbDate] })
    } catch (err: any) {
      console.error('일별 저장 오류:', err.message)
    }
  }, [hotelId, profile?.id, dailyEdits, selectedYear, selectedMonth, otbDate, queryClient, budgetDate])

  // ── 6. 전체 저장 (upsert_budget) ──────────────────────────────────────────────
  const saveAll = async () => {
    if (!hotelId || !profile?.id) return
    setSaving(true)
    setSaveError(null)
    try {
      const rows: any[] = []
      Object.entries(budgetData).forEach(([seg, months]) => {
        Object.entries(months).forEach(([mStr, val]) => {
          const month = Number(mStr)
          const days  = new Date(selectedYear, month, 0).getDate()
          Array.from({ length: days }, (_, i) => {
            rows.push({
              business_date:  `${selectedYear}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
              segmentation:   seg,
              sorting1:       null,
              sorting2:       null,
              sorting3:       null,
              budget_nights:  Math.round(val.rn  / days),
              budget_revenue: Math.round(val.rev / days),
            })
          })
        })
      })

      if (rows.length > 0) {
        const { error } = await (supabase as any)
          .rpc('upsert_budget', {
            p_hotel_id:    hotelId,
            p_profile_id:  profile.id,
            p_update_date: budgetDate || new Date().toISOString().split('T')[0],
            p_rows:        rows,
          })
        if (error) throw error
        queryClient.invalidateQueries({ queryKey: ['budget_monthly', hotelId, selectedYear] })
        queryClient.invalidateQueries({ queryKey: ['budget_daily',   hotelId, selectedYear] })
      }
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Step1. 엑셀 양식 다운로드 ────────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    const wb = XLSX.utils.book_new()
    const ws: any = {}
    const segs = schemaSegs.length > 0 ? schemaSegs : allSegs

    // 헤더 행1: Segmentation | 1월(3칸) ... 12월(3칸) | 합계(3칸)
    ws['A1'] = { v: 'Segmentation' }
    months.forEach((m, i) => {
      ws[`${XLSX.utils.encode_col(1 + i * 3)}1`] = { v: `${m}월` }
    })
    ws[`${XLSX.utils.encode_col(37)}1`] = { v: '합계' }

    // 헤더 행2: R/N | ADR | REV 반복
    months.forEach((_, i) => {
      const base = 1 + i * 3
      ws[`${XLSX.utils.encode_col(base)}2`]     = { v: 'R/N' }
      ws[`${XLSX.utils.encode_col(base + 1)}2`] = { v: 'ADR' }
      ws[`${XLSX.utils.encode_col(base + 2)}2`] = { v: 'REV' }
    })
    ws[`${XLSX.utils.encode_col(37)}2`] = { v: 'R/N' }
    ws[`${XLSX.utils.encode_col(38)}2`] = { v: 'ADR' }
    ws[`${XLSX.utils.encode_col(39)}2`] = { v: 'REV' }

    // 세그먼트 행
    segs.forEach((seg, rowIdx) => {
      ws[`A${rowIdx + 3}`] = { v: seg }
    })

    // 병합
    ws['!merges'] = [
      ...months.map((_, i) => ({
        s: { r: 0, c: 1 + i * 3 },
        e: { r: 0, c: 3 + i * 3 },
      })),
      { s: { r: 0, c: 37 }, e: { r: 0, c: 39 } },
    ]
    ws['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: segs.length + 1, c: 39 },
    })

    XLSX.utils.book_append_sheet(wb, ws, 'Budget')
    XLSX.writeFile(wb, `Budget_양식_${selectedYear}.xlsx`)
  }

  // ── Step2. 엑셀 업로드 파싱 ──────────────────────────────────────────────────
  const handleUploadBudget = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: 0 }) as any[][]

    const parsed: Record<string, Record<number, MonthVal>> = {}
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i]
      const seg = String(row[0] ?? '').trim()
      if (!seg) continue
      parsed[seg] = {}
      for (let m = 1; m <= 12; m++) {
        const base = 1 + (m - 1) * 3
        parsed[seg][m] = {
          rn:  Number(row[base]     ?? 0),
          rev: Number(row[base + 2] ?? 0),
        }
      }
    }

    setUploadedBudget(parsed)
    setShowDistributed(false)
    setDistributedData([])
    setWarnings([])
    await distributeBudget(parsed)
  }

  // ── Step3. 전년 비율 배분 계산 ────────────────────────────────────────────────
  const distributeBudget = async (budgetInput: Record<string, Record<number, MonthVal>>) => {
    setIsDistributing(true)
    try {
      // 전년 일별 실적 조회
      const { data: actRows, error: actErr } = await (supabase as any)
        .from('a01_actual_daily')
        .select('business_date, segmentation, nights, room_revenue')
        .eq('hotel_id', hotelId)
        .gte('business_date', `${selectedYear - 1}-01-01`)
        .lte('business_date', `${selectedYear - 1}-12-31`)
      if (actErr) throw actErr

      // 해당 연도 calendar yoy_match 조회 (컬럼명: date)
      const { data: calRows, error: calErr } = await (supabase as any)
        .from('c06_calendar')
        .select('date, yoy_match')
        .gte('date', `${selectedYear}-01-01`)
        .lte('date', `${selectedYear}-12-31`)
      if (calErr) throw calErr

      // 전년 월별 합계
      const actMonthly: Record<string, Record<number, MonthVal>> = {}
      ;(actRows ?? []).forEach((r: any) => {
        const month = new Date(r.business_date).getMonth() + 1
        if (!actMonthly[r.segmentation]) actMonthly[r.segmentation] = {}
        if (!actMonthly[r.segmentation][month]) actMonthly[r.segmentation][month] = { rn: 0, rev: 0 }
        actMonthly[r.segmentation][month].rn  += r.nights       ?? 0
        actMonthly[r.segmentation][month].rev += r.room_revenue ?? 0
      })

      // 전년 일별 맵 (yoy_match 날짜 기준)
      const actDaily: Record<string, Record<string, MonthVal>> = {}
      ;(actRows ?? []).forEach((r: any) => {
        if (!actDaily[r.segmentation]) actDaily[r.segmentation] = {}
        actDaily[r.segmentation][r.business_date] = {
          rn:  r.nights       ?? 0,
          rev: r.room_revenue ?? 0,
        }
      })

      // 일별 배분
      const distributed: DistributedRow[] = []
      const newWarnings: string[] = []
      const rowMap = new Map<string, DistributedRow>()

      ;(calRows ?? []).forEach((cal: any) => {
        const date  = cal.date
        const yoy   = cal.yoy_match
        const month = new Date(date).getMonth() + 1

        Object.entries(budgetInput).forEach(([seg, mMap]) => {
          const monthBudget = mMap[month] ?? { rn: 0, rev: 0 }
          if (monthBudget.rn === 0 && monthBudget.rev === 0) return

          const monthActual = actMonthly[seg]?.[month] ?? { rn: 0, rev: 0 }
          const dayActual   = yoy ? (actDaily[seg]?.[yoy] ?? null) : null

          let dailyRn: number
          let dailyRev: number
          let hasWarning = false

          if (!dayActual || monthActual.rn === 0) {
            // 전년 실적 없음 → 균등 배분
            const daysInMonth = new Date(selectedYear, month, 0).getDate()
            dailyRn  = Math.round(monthBudget.rn  / daysInMonth)
            dailyRev = Math.round(monthBudget.rev / daysInMonth)
            hasWarning = true
            const wMsg = `${date} ${seg}: 전년 실적 없음 → 균등 배분`
            if (!newWarnings.includes(wMsg)) newWarnings.push(wMsg)
          } else {
            const rnRatio  = dayActual.rn  / monthActual.rn
            const revRatio = monthActual.rev > 0 ? dayActual.rev / monthActual.rev : rnRatio
            dailyRn  = Math.round(monthBudget.rn  * rnRatio)
            dailyRev = Math.round(monthBudget.rev * revRatio)
          }

          // room_count 초과 방지
          if (roomCount > 0 && dailyRn > roomCount) {
            newWarnings.push(`${date} ${seg}: R/N ${dailyRn}실 → room_count(${roomCount}) 초과로 조정`)
            dailyRn = roomCount
          }

          // 중복 제거
          const key = `${date}__${seg}`
          rowMap.set(key, { business_date: date, segmentation: seg, budget_nights: dailyRn, budget_revenue: dailyRev, has_warning: hasWarning })
        })
      })

      setDistributedData(Array.from(rowMap.values()))
      setWarnings(newWarnings)
      setShowDistributed(true)
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setIsDistributing(false)
    }
  }

  // ── Step5. 최종 저장 ──────────────────────────────────────────────────────────
  const handleSaveBudget = async () => {
    if (!profile?.id) return
    setIsSaving(true)
    try {
      const rows = distributedData.map(d => ({
        business_date:  d.business_date,
        segmentation:   d.segmentation,
        sorting1:       null,
        sorting2:       null,
        sorting3:       null,
        budget_nights:  d.budget_nights,
        budget_revenue: d.budget_revenue,
      }))
      const CHUNK = 1000
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await (supabase as any)
          .rpc('upsert_budget', {
            p_hotel_id:    hotelId,
            p_profile_id:  profile.id,
            p_update_date: budgetDate || new Date().toISOString().split('T')[0],
            p_rows:        rows.slice(i, i + CHUNK),
          })
        if (error) throw error
      }
      setShowDistributed(false)
      setUploadedBudget(null)
      setSaveError(null)
      queryClient.invalidateQueries({ queryKey: ['budget_monthly', hotelId, selectedYear] })
      queryClient.invalidateQueries({ queryKey: ['budget_daily',   hotelId, selectedYear] })
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  // ── 미리보기 월별 집계 ────────────────────────────────────────────────────────
  const previewMonthlyData = useMemo(() => {
    const result: Record<string, Record<string, number>> = {}
    distributedData.forEach(row => {
      const month = new Date(row.business_date).getMonth() + 1
      if (!result[row.segmentation]) result[row.segmentation] = {}
      result[row.segmentation][`rn_${month}`]  = (result[row.segmentation][`rn_${month}`]  ?? 0) + row.budget_nights
      result[row.segmentation][`rev_${month}`] = (result[row.segmentation][`rev_${month}`] ?? 0) + row.budget_revenue
    })
    const mArr = Array.from({ length: 12 }, (_, i) => i + 1)
    Object.keys(result).forEach(seg => {
      const tRn  = mArr.reduce((s, m) => s + (result[seg][`rn_${m}`]  ?? 0), 0)
      const tRev = mArr.reduce((s, m) => s + (result[seg][`rev_${m}`] ?? 0), 0)
      result[seg]['total_rn']  = tRn
      result[seg]['total_rev'] = tRev
    })
    return result
  }, [distributedData])

  // ── 로컬 편집 핸들러 ──────────────────────────────────────────────────────────
  const handleBudgetChange = useCallback((seg: string, month: number, field: 'rn' | 'rev', val: number) => {
    setBudgetData(prev => ({
      ...prev,
      [seg]: {
        ...prev[seg],
        [month]: {
          rn:  field === 'rn'  ? val : (prev[seg]?.[month]?.rn  ?? 0),
          rev: field === 'rev' ? val : (prev[seg]?.[month]?.rev ?? 0),
        },
      },
    }))
  }, [])

  const handleDailyChange = useCallback((date: string, seg: string, field: 'rn' | 'rev', val: number) => {
    setDailyEdits(prev => ({
      ...prev,
      [date]: {
        ...prev[date],
        [seg]: {
          rn:  field === 'rn'  ? val : (prev[date]?.[seg]?.rn  ?? 0),
          rev: field === 'rev' ? val : (prev[date]?.[seg]?.rev ?? 0),
        },
      },
    }))
  }, [])


  // ── 월별 컬럼 정의 ────────────────────────────────────────────────────────────
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  const monthlyColumns = useMemo((): MarketTableColumn[] => [
    { key: 'total_rn',  label: 'R/N', group: '합계', type: 'number'   as const },
    { key: 'total_adr', label: 'ADR', group: '합계', type: 'adr'      as const },
    { key: 'total_rev', label: 'REV', group: '합계', type: 'currency' as const },
    ...months.flatMap(m => [
      {
        key:   `m${m}_rn`,
        label: 'R/N',
        group: `${m}월`,
        render: (_: any, row: any) => {
          const seg = row.segmentation as string
          if (!seg) return null
          return (
            <InputCell
              value={budgetData[seg]?.[m]?.rn ?? 0}
              onChange={v => handleBudgetChange(seg, m, 'rn', v)}
              onBlur={() => saveBudgetMonthly(seg, m)}
            />
          )
        },
      },
      { key: `m${m}_adr`, label: 'ADR', group: `${m}월`, type: 'adr'      as const },
      {
        key:   `m${m}_rev`,
        label: 'REV',
        group: `${m}월`,
        type:  'currency' as const,
        render: (_: any, row: any) => {
          const seg = row.segmentation as string
          if (!seg) return null
          return (
            <InputCell
              value={budgetData[seg]?.[m]?.rev ?? 0}
              onChange={v => handleBudgetChange(seg, m, 'rev', v)}
              onBlur={() => saveBudgetMonthly(seg, m)}
              unit={1_000_000}
            />
          )
        },
      },
    ] as MarketTableColumn[]),
  ], [budgetData, handleBudgetChange, saveBudgetMonthly])

  // ── 월별 테이블 데이터 ────────────────────────────────────────────────────────
  const monthlyTableData = useMemo((): Record<string, Record<string, any>> => {
    const result: Record<string, Record<string, any>> = {}
    budgetMonthlyRows.forEach(row => {
      if (!result[row.segmentation]) result[row.segmentation] = { __seg: row.segmentation }
      result[row.segmentation][`m${row.month_num}_rn`]  = row.budget_nights
      result[row.segmentation][`m${row.month_num}_rev`] = row.budget_revenue
      result[row.segmentation][`m${row.month_num}_adr`] =
        row.budget_nights > 0 ? Math.round(row.budget_revenue / row.budget_nights) : 0
    })
    Object.keys(result).forEach(seg => {
      const totalRn  = months.reduce((s, m) => s + (result[seg][`m${m}_rn`]  ?? 0), 0)
      const totalRev = months.reduce((s, m) => s + (result[seg][`m${m}_rev`] ?? 0), 0)
      result[seg]['total_rn']  = totalRn
      result[seg]['total_rev'] = totalRev
      result[seg]['total_adr'] = totalRn > 0 ? Math.round(totalRev / totalRn) : 0
    })
    return result
  }, [budgetMonthlyRows])

  // 월별 테이블 표시 순서 — 대분류 헤더 + 소분류 seg 행

  // ── 일별 파생 데이터 ──────────────────────────────────────────────────────────
  const dayList = useMemo(() => getDaysInMonth(selectedYear, selectedMonth), [selectedYear, selectedMonth])

  const allSegs = useMemo(() => {
    const segs = new Set<string>()
    budgetMonthlyRows.forEach(r => segs.add(r.segmentation))
    return Array.from(segs).sort()
  }, [budgetMonthlyRows])

  // business_date+seg → BudgetDailyRow 맵
  const dailyRowMap = useMemo(() => {
    const map: Record<string, Record<string, BudgetDailyRow>> = {}
    budgetDailyRows.forEach(row => {
      if (!map[row.business_date]) map[row.business_date] = {}
      map[row.business_date][row.segmentation] = row
    })
    return map
  }, [budgetDailyRows])


  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── 전년 실적 불러오기 확인 모달 — 메인 div 밖에 렌더링 ── */}
      {initConfirm && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setInitConfirm(false)} />
          <div className="relative rounded-2xl p-6 w-full max-w-sm space-y-4"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              전년 실적으로 초기화
            </p>
            <p className="text-sm text-brand-muted">
              {selectedYear}년 예산을 전년 실적으로 초기화할까요?<br />기존 데이터가 덮어씌워집니다.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setInitConfirm(false)}
                className="flex-1 py-2 rounded-lg text-sm hover:opacity-80 transition-all"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                취소
              </button>
              <button onClick={handleInitFromActual} disabled={importing}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-50"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
                {importing ? <Loader2 size={13} className="animate-spin" /> : null}
                확인
              </button>
            </div>
          </div>
        </div>
      )}

    <div className="space-y-5 animate-fade-in">

      {/* ── 에러 배너 ── */}
      {saveError && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl text-sm"
          style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)', color: 'var(--color-text-primary)' }}>
          <span style={{ color: '#FC8181' }}>{saveError}</span>
          <button onClick={() => setSaveError(null)} className="text-brand-muted hover:text-brand-text ml-4 shrink-0">✕</button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Budget
          </h1>
          <p className="text-sm text-brand-muted mt-0.5">
            OTB 기준: {otbDate} · {currentHotel?.hotel_name}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="appearance-none pl-3 pr-7 py-1.5 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
            >
              {years.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-brand-muted" />
          </div>

          {/* Budget 기준일 선택 — 항상 표시 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-brand-muted shrink-0">기준일</span>
            {budgetDates.length > 0 ? (
              <div className="relative">
                <select
                  value={budgetDate}
                  onChange={e => setBudgetDate(e.target.value)}
                  className="appearance-none pl-3 pr-7 py-1.5 text-sm rounded-lg focus:outline-none"
                  style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
                >
                  {budgetDates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-brand-muted" />
              </div>
            ) : (
              <input
                type="date"
                value={budgetDate}
                onChange={e => setBudgetDate(e.target.value)}
                className="py-1.5 px-3 text-sm rounded-lg focus:outline-none"
                style={{
                  background: 'var(--color-bg-secondary)',
                  border:     '1px solid var(--color-border-default)',
                  color:      'var(--color-text-primary)',
                  colorScheme: 'dark',
                }}
              />
            )}
          </div>

          {/* 양식 다운로드 */}
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-80"
            style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
          >
            <Download size={13} />
            양식 다운로드
          </button>

          {/* 엑셀 업로드 */}
          <input
            type="file"
            accept=".xlsx,.xls"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleUploadBudget}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isDistributing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
            style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
          >
            {isDistributing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            업로드
          </button>

          <button
            onClick={() => setInitConfirm(true)}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
            style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
          >
            {importing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            전년 실적 불러오기
          </button>

          <button
            onClick={saveAll}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-50"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            저장
          </button>
        </div>
      </div>

      {/* ── 탭 ── */}
      <div className="flex gap-1 p-1 rounded-xl w-fit"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)' }}>
        {(['monthly', 'daily'] as TabType[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: activeTab === tab ? 'var(--gradient-cta)' : 'transparent',
              color:      activeTab === tab ? '#0A0A0A' : 'var(--color-text-muted)',
            }}>
            {tab === 'monthly' ? '월별' : '일별'}
          </button>
        ))}
      </div>

      {/* ── 월별 탭 ── */}
      {activeTab === 'monthly' && (
        <div className="space-y-4">
          <MarketTable
            hotelId={hotelId}
            year={selectedYear}
            month={selectedMonth}
            columns={monthlyColumns}
            data={monthlyTableData}
            loading={monthlyLoading}
            stickyFirstGroup
            opaqueBg
          />


          {/* ── Step4. 미리보기 ── */}
          {showDistributed && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  업로드 미리보기
                  <span className="ml-2 text-xs font-normal text-brand-muted">
                    ({distributedData.length}건 · 전년 비율 배분)
                  </span>
                </h3>
              </div>

              {/* 경고 */}
              {warnings.length > 0 && (
                <div className="p-3 rounded-lg"
                  style={{ background: 'rgba(246,173,85,0.08)', border: '1px solid rgba(246,173,85,0.3)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertTriangle size={13} style={{ color: '#C17B00' }} />
                    <span className="text-xs font-medium" style={{ color: '#C17B00' }}>
                      {warnings.length}건 경고 (해당 날짜는 균등 배분 적용)
                    </span>
                  </div>
                  <div className="text-xs text-brand-muted max-h-20 overflow-y-auto space-y-0.5">
                    {warnings.slice(0, 20).map((w, i) => <div key={i}>{w}</div>)}
                    {warnings.length > 20 && <div>외 {warnings.length - 20}건...</div>}
                  </div>
                </div>
              )}

              {/* 미리보기 테이블 */}
              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--color-border-default)' }}>
                <table className="border-collapse" style={{ fontSize: 12, tableLayout: 'fixed', fontVariantNumeric: 'tabular-nums' }}>
                  <colgroup>
                    <col style={{ width: 140 }} />
                    {Array.from({ length: 13 * 3 }, (_, i) => {
                      const pos = i % 3
                      return <col key={i} style={{ width: pos === 0 ? 68 : pos === 1 ? 64 : 76 }} />
                    })}
                  </colgroup>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
                      <th className="px-3 py-2 text-left text-xs font-medium text-brand-muted" rowSpan={2}>
                        Segmentation
                      </th>
                      {months.map(m => (
                        <th key={m} colSpan={3}
                          className="px-2 py-2 text-center text-xs font-semibold"
                          style={{ borderLeft: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                          {m}월
                        </th>
                      ))}
                      <th colSpan={3}
                        className="px-2 py-2 text-center text-xs font-semibold"
                        style={{ borderLeft: '1px solid var(--color-border-default)', color: 'var(--color-accent-primary)' }}>
                        합계
                      </th>
                    </tr>
                    <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
                      {Array.from({ length: 13 }, (_, i) => (
                        <React.Fragment key={i}>
                          <th className="px-1 py-1.5 text-center text-[10px] text-brand-muted whitespace-nowrap"
                            style={{ borderLeft: '1px solid var(--color-border-default)' }}>R/N</th>
                          <th className="px-1 py-1.5 text-center text-[10px] text-brand-muted whitespace-nowrap"
                            style={{ borderLeft: '1px solid var(--color-border-subtle)' }}>ADR</th>
                          <th className="px-1 py-1.5 text-center text-[10px] text-brand-muted whitespace-nowrap"
                            style={{ borderLeft: '1px solid var(--color-border-subtle)' }}>REV</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(previewMonthlyData).map(([seg, data]) => (
                      <tr key={seg} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <td className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {seg}
                        </td>
                        {Array.from({ length: 13 }, (_, i) => {
                          const isTotal = i === 12
                          const rn  = isTotal ? (data['total_rn']  ?? 0) : (data[`rn_${i + 1}`]  ?? 0)
                          const rev = isTotal ? (data['total_rev'] ?? 0) : (data[`rev_${i + 1}`] ?? 0)
                          const adr = rn > 0 ? Math.round(rev / rn) : 0
                          const over = roomCount > 0 && rn > roomCount
                          return (
                            <React.Fragment key={i}>
                              <td className="px-1 py-1.5 text-right text-xs"
                                style={{ color: over ? '#FC8181' : 'var(--color-text-primary)', borderLeft: '1px solid var(--color-border-default)' }}>
                                {rn ? rn.toLocaleString('ko-KR') : '-'}
                              </td>
                              <td className="px-1 py-1.5 text-right text-xs text-brand-muted"
                                style={{ borderLeft: '1px solid var(--color-border-subtle)' }}>
                                {adr ? formatCurrency(adr) : '-'}
                              </td>
                              <td className="px-1 py-1.5 text-right text-xs"
                                style={{ color: 'var(--color-accent-primary)', borderLeft: '1px solid var(--color-border-subtle)' }}>
                                {rev ? formatCurrency(rev) : '-'}
                              </td>
                            </React.Fragment>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 저장 버튼 */}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => { setShowDistributed(false); setUploadedBudget(null) }}
                  className="px-4 py-2 rounded-full text-sm transition-all hover:opacity-80"
                  style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                >
                  취소
                </button>
                <button
                  onClick={handleSaveBudget}
                  disabled={isSaving || distributedData.length === 0}
                  className="flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-50"
                  style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}
                >
                  {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {isSaving ? '저장 중...' : `${distributedData.length.toLocaleString()}건 저장`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 일별 탭 ── */}
      {activeTab === 'daily' && (
        <div className="space-y-4">
          {/* 월 선택 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-brand-muted">월 선택</span>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="appearance-none pl-3 pr-7 py-1.5 text-sm rounded-lg focus:outline-none"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-brand-muted" />
            </div>
          </div>

          {/* 일별 테이블 */}
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--color-border-default)' }}>
            <table className="w-full border-collapse" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
                  <th className="px-3 py-2 text-left text-xs font-medium text-brand-muted sticky left-0"
                    style={{ minWidth: 84, background: 'var(--color-bg-tertiary)' }}>날짜</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-brand-muted"
                    style={{ minWidth: 36, borderLeft: '1px solid var(--color-border-subtle)' }}>요일</th>
                  {allSegs.map(seg => (
                    <th key={seg} colSpan={9}
                      className="px-2 py-2 text-center text-xs font-semibold"
                      style={{ borderLeft: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                      {seg}
                    </th>
                  ))}
                </tr>
                <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
                  <th className="sticky left-0" style={{ background: 'var(--color-bg-tertiary)' }} />
                  <th />
                  {allSegs.map(seg => (
                    <React.Fragment key={seg}>
                      {/* Budget */}
                      <th className="px-2 py-1 text-center text-[10px] font-semibold"
                        style={{ borderLeft: '1px solid var(--color-border-default)', color: 'var(--color-accent-primary)', minWidth: 180 }}
                        colSpan={3}>
                        Budget
                      </th>
                      {/* 전년 */}
                      <th className="px-2 py-1 text-center text-[10px] font-semibold"
                        style={{ borderLeft: '1px solid var(--color-border-default)', color: '#4A9EFF', minWidth: 180 }}
                        colSpan={3}>
                        전년 실적
                      </th>
                      {/* OTB */}
                      <th className="px-2 py-1 text-center text-[10px] font-semibold"
                        style={{ borderLeft: '1px solid var(--color-border-default)', color: '#A78BFA', minWidth: 180 }}
                        colSpan={3}>
                        OTB
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
                <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
                  <th className="sticky left-0" style={{ background: 'var(--color-bg-tertiary)' }} />
                  <th />
                  {allSegs.map(seg => (
                    <React.Fragment key={seg}>
                      {['Budget', '전년', 'OTB'].map((group, gi) => (
                        <React.Fragment key={group}>
                          <th className="px-1 py-1 text-right text-[10px] text-brand-muted"
                            style={{ borderLeft: gi === 0 ? '1px solid var(--color-border-default)' : '1px solid var(--color-border-default)', minWidth: 56 }}>R/N</th>
                          <th className="px-1 py-1 text-right text-[10px] text-brand-muted"
                            style={{ borderLeft: '1px solid var(--color-border-subtle)', minWidth: 56 }}>ADR</th>
                          <th className="px-1 py-1 text-right text-[10px] text-brand-muted"
                            style={{ borderLeft: '1px solid var(--color-border-subtle)', minWidth: 68 }}>REV</th>
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailyLoading ? (
                  <tr>
                    <td colSpan={2 + allSegs.length * 9} className="px-4 py-10 text-center text-sm text-brand-muted">
                      <Loader2 size={16} className="animate-spin inline mr-2" />불러오는 중...
                    </td>
                  </tr>
                ) : (
                  dayList.map(({ date, dayOfWeek }, rowIdx) => (
                    <tr key={date}
                      style={{ borderBottom: '1px solid var(--color-border-subtle)', background: rowIdx % 2 === 0 ? 'transparent' : 'var(--color-bg-secondary)' }}>
                      <td className="px-3 py-1.5 text-xs font-medium sticky left-0"
                        style={{ color: DAY_COLOR[dayOfWeek] ?? 'var(--color-text-primary)', background: rowIdx % 2 === 0 ? 'var(--color-bg-primary)' : 'var(--color-bg-secondary)' }}>
                        {date}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-center"
                        style={{ color: DAY_COLOR[dayOfWeek] ?? 'var(--color-text-muted)', borderLeft: '1px solid var(--color-border-subtle)' }}>
                        {dayOfWeek}
                      </td>
                      {allSegs.map(seg => {
                        const dbRow  = dailyRowMap[date]?.[seg]
                        const budRn  = dailyEdits[date]?.[seg]?.rn  ?? dbRow?.budget_nights  ?? 0
                        const budRev = dailyEdits[date]?.[seg]?.rev ?? dbRow?.budget_revenue ?? 0
                        const budAdr = budRn > 0 ? Math.round(budRev / budRn) : 0
                        const actRn  = dbRow?.act_nights   ?? 0
                        const actRev = dbRow?.act_revenue  ?? 0
                        const actAdr = actRn > 0 ? Math.round(actRev / actRn) : 0
                        const otbRn  = dbRow?.otb_nights   ?? 0
                        const otbRev = dbRow?.otb_revenue  ?? 0
                        const otbAdr = otbRn > 0 ? Math.round(otbRev / otbRn) : 0

                        return (
                          <React.Fragment key={seg}>
                            {/* Budget */}
                            <td className="px-1 py-1" style={{ borderLeft: '1px solid var(--color-border-default)' }}>
                              <InputCell value={budRn} onChange={n => handleDailyChange(date, seg, 'rn', n)} onBlur={() => saveBudgetDaily(date, seg)} />
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: 'var(--color-text-muted)', borderLeft: '1px solid var(--color-border-subtle)' }}>
                              {budAdr ? budAdr.toLocaleString('ko-KR') : '-'}
                            </td>
                            <td className="px-1 py-1" style={{ borderLeft: '1px solid var(--color-border-subtle)', color: 'var(--color-accent-primary)' }}>
                              <InputCell value={budRev} onChange={n => handleDailyChange(date, seg, 'rev', n)} onBlur={() => saveBudgetDaily(date, seg)} />
                            </td>
                            {/* 전년 */}
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: '#4A9EFF', borderLeft: '1px solid var(--color-border-default)' }}>
                              {actRn ? actRn.toLocaleString('ko-KR') : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: '#4A9EFF', borderLeft: '1px solid var(--color-border-subtle)' }}>
                              {actAdr ? actAdr.toLocaleString('ko-KR') : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: '#4A9EFF', borderLeft: '1px solid var(--color-border-subtle)' }}>
                              {actRev ? actRev.toLocaleString('ko-KR') : '-'}
                            </td>
                            {/* OTB */}
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: '#A78BFA', borderLeft: '1px solid var(--color-border-default)' }}>
                              {otbRn ? otbRn.toLocaleString('ko-KR') : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: '#A78BFA', borderLeft: '1px solid var(--color-border-subtle)' }}>
                              {otbAdr ? otbAdr.toLocaleString('ko-KR') : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs"
                              style={{ color: '#A78BFA', borderLeft: '1px solid var(--color-border-subtle)' }}>
                              {otbRev ? otbRev.toLocaleString('ko-KR') : '-'}
                            </td>
                          </React.Fragment>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
