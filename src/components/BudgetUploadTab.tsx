'use client'

import React, { useState, useRef, useMemo } from 'react'
import { Download, Upload, AlertTriangle, Loader2, Save, CalendarDays } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { FormDatePicker } from '@/components/DatePicker'

// ── Types ─────────────────────────────────────────────────────────────────────

type MonthVal = { rn: number; rev: number }

type DailyBudgetRow = {
  business_date:  string
  segmentation:   string
  budget_nights:  number
  budget_revenue: number
  has_warning:    boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`
  return n.toLocaleString('ko-KR')
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BudgetUploadTab({ hotelId }: { hotelId: string }) {
  const queryClient  = useQueryClient()
  const { profile }  = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [updateDate,      setUpdateDate]      = useState(todayStr)
  const [uploadedBudget,  setUploadedBudget]  = useState<Record<string, Record<number, MonthVal>> | null>(null)
  const [distributedData, setDistributedData] = useState<DailyBudgetRow[]>([])
  const [warnings,        setWarnings]        = useState<string[]>([])
  const [isDistributing,  setIsDistributing]  = useState(false)
  const [isSaving,        setIsSaving]        = useState(false)
  const [showPreview,     setShowPreview]      = useState(false)

  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  // ── c05_market_table_schema ───────────────────────────────────────────────
  const { data: schemaRows = [] } = useQuery<{ segmentation: string[] | null }[]>({
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
      (row.segmentation ?? []).forEach(s => { if (!seen.has(s)) { seen.add(s); segs.push(s) } })
    })
    return segs
  }, [schemaRows])

  // ── m03_hotel_details (room_count) ────────────────────────────────────────
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

  // ── 양식 다운로드 ─────────────────────────────────────────────────────────
  const handleDownloadTemplate = () => {
    const segs    = schemaSegs.length > 0 ? schemaSegs : []
    const header1 = ['Segmentation', ...months.flatMap(m => [`${m}월`, '', '']), '합계', '', '']
    const header2 = ['', ...months.flatMap(_ => ['R/N', 'ADR', 'REV']), 'R/N', 'ADR', 'REV']
    const dataRows = segs.map(seg => [seg, ...Array(39).fill('')])

    const ws = XLSX.utils.aoa_to_sheet([header1, header2, ...dataRows])
    ws['!merges'] = [
      ...months.map((_, i) => ({ s: { r: 0, c: 1 + i * 3 }, e: { r: 0, c: 3 + i * 3 } })),
      { s: { r: 0, c: 37 }, e: { r: 0, c: 39 } },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Budget')
    XLSX.writeFile(wb, `Budget_양식_${updateDate}.xlsx`)
  }

  // ── 파일 선택 → 파싱 ─────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    const buffer = await file.arrayBuffer()
    const wb     = XLSX.read(buffer, { type: 'array' })
    const ws     = wb.Sheets[wb.SheetNames[0]]
    const rows   = XLSX.utils.sheet_to_json(ws, { header: 1, defval: 0 }) as any[][]

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
    setShowPreview(false)
    await distributeBudget(parsed)
  }

  // ── 전년 비율 배분 ────────────────────────────────────────────────────────
  const distributeBudget = async (budgetInput: Record<string, Record<number, MonthVal>>) => {
    setIsDistributing(true)
    try {
      const year = new Date(updateDate).getFullYear()

      const { data: actRows, error: actErr } = await (supabase as any)
        .from('a01_actual_daily')
        .select('business_date, segmentation, nights, room_revenue')
        .eq('hotel_id', hotelId)
        .gte('business_date', `${year - 1}-01-01`)
        .lte('business_date', `${year - 1}-12-31`)
      if (actErr) throw actErr

      const { data: calRows, error: calErr } = await (supabase as any)
        .from('c06_calendar')
        .select('date, yoy_match')
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`)
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

      // 전년 일별 맵
      const actDaily: Record<string, Record<string, MonthVal>> = {}
      ;(actRows ?? []).forEach((r: any) => {
        if (!actDaily[r.segmentation]) actDaily[r.segmentation] = {}
        actDaily[r.segmentation][r.business_date] = {
          rn:  r.nights       ?? 0,
          rev: r.room_revenue ?? 0,
        }
      })

      const rowMap      = new Map<string, DailyBudgetRow>()
      const newWarnings: string[] = []

      ;(calRows ?? []).forEach((cal: any) => {
        const date  = cal.date as string
        const yoy   = cal.yoy_match as string | null
        const month = new Date(date).getMonth() + 1

        Object.entries(budgetInput).forEach(([seg, mMap]) => {
          const monthBudget = mMap[month] ?? { rn: 0, rev: 0 }
          if (monthBudget.rn === 0 && monthBudget.rev === 0) return

          const monthActual = actMonthly[seg]?.[month] ?? { rn: 0, rev: 0 }
          const dayActual   = yoy ? (actDaily[seg]?.[yoy] ?? null) : null

          let dailyRn:  number
          let dailyRev: number
          let hasWarning = false

          if (!dayActual || monthActual.rn === 0) {
            const daysInMonth = new Date(year, month, 0).getDate()
            dailyRn    = Math.round(monthBudget.rn  / daysInMonth)
            dailyRev   = Math.round(monthBudget.rev / daysInMonth)
            hasWarning = true
            const wMsg = `${date} [${seg}]: 전년 실적 없음 → 균등 배분`
            if (!newWarnings.includes(wMsg)) newWarnings.push(wMsg)
          } else {
            const rnRatio  = dayActual.rn  / monthActual.rn
            const revRatio = monthActual.rev > 0 ? dayActual.rev / monthActual.rev : rnRatio
            dailyRn  = Math.round(monthBudget.rn  * rnRatio)
            dailyRev = Math.round(monthBudget.rev * revRatio)
          }

          if (roomCount > 0 && dailyRn > roomCount) {
            newWarnings.push(`${date} [${seg}]: R/N ${dailyRn}실 → room_count(${roomCount}) 초과 조정`)
            dailyRn = roomCount
          }

          rowMap.set(`${date}__${seg}`, {
            business_date:  date,
            segmentation:   seg,
            budget_nights:  dailyRn,
            budget_revenue: dailyRev,
            has_warning:    hasWarning,
          })
        })
      })

      setDistributedData(Array.from(rowMap.values()))
      setWarnings(newWarnings)
      setShowPreview(true)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsDistributing(false)
    }
  }

  // ── 미리보기 월별 집계 ────────────────────────────────────────────────────
  const previewMonthlyData = useMemo(() => {
    const mArr   = Array.from({ length: 12 }, (_, i) => i + 1)
    const result: Record<string, Record<string, number>> = {}
    distributedData.forEach(row => {
      const m = new Date(row.business_date).getMonth() + 1
      if (!result[row.segmentation]) result[row.segmentation] = {}
      result[row.segmentation][`rn_${m}`]  = (result[row.segmentation][`rn_${m}`]  ?? 0) + row.budget_nights
      result[row.segmentation][`rev_${m}`] = (result[row.segmentation][`rev_${m}`] ?? 0) + row.budget_revenue
    })
    Object.keys(result).forEach(seg => {
      result[seg]['total_rn']  = mArr.reduce((s, m) => s + (result[seg][`rn_${m}`]  ?? 0), 0)
      result[seg]['total_rev'] = mArr.reduce((s, m) => s + (result[seg][`rev_${m}`] ?? 0), 0)
    })
    return result
  }, [distributedData])

  // ── 저장 ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
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
            p_update_date: updateDate,
            p_rows:        rows.slice(i, i + CHUNK),
          })
        if (error) throw error
      }
      alert(`${rows.length}건 저장 완료!`)
      setShowPreview(false)
      setUploadedBudget(null)
      queryClient.invalidateQueries({ queryKey: ['budget_monthly', hotelId] })
      queryClient.invalidateQueries({ queryKey: ['budget_dates',   hotelId] })
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* 저장 기준일 */}
      <div className="p-4 rounded-xl space-y-2"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)' }}>
        <div className="flex items-center gap-2">
          <CalendarDays size={14} style={{ color: 'var(--color-accent-primary)', flexShrink: 0 }} />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>저장 기준일</span>
          <span className="text-xs text-brand-muted ml-1">기본: 오늘 날짜</span>
        </div>
        <FormDatePicker value={updateDate} onChange={setUpdateDate} placeholder="날짜 선택" />
      </div>

      {/* 버튼 행 */}
      <div className="flex gap-2">
        <button
          onClick={handleDownloadTemplate}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
          style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
        >
          <Download size={13} />양식 다운로드
        </button>

        <input type="file" accept=".xlsx,.xls" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isDistributing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
          style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
        >
          {isDistributing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {isDistributing ? '배분 계산 중...' : '파일 선택'}
        </button>
      </div>

      {/* 미리보기 */}
      {showPreview && (
        <div className="space-y-4">

          {/* 경고 */}
          {warnings.length > 0 && (
            <div className="p-3 rounded-lg space-y-1.5"
              style={{ background: 'rgba(246,173,85,0.08)', border: '1px solid rgba(246,173,85,0.3)' }}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={13} style={{ color: '#C17B00' }} />
                <span className="text-xs font-medium" style={{ color: '#C17B00' }}>
                  {warnings.length}건 경고 (균등배분 적용)
                </span>
              </div>
              <div className="text-xs text-brand-muted max-h-20 overflow-y-auto space-y-0.5">
                {warnings.slice(0, 15).map((w, i) => (
                  <div key={i} style={{ color: w.includes('초과') ? '#FC8181' : undefined }}>{w}</div>
                ))}
                {warnings.length > 15 && <div>외 {warnings.length - 15}건...</div>}
              </div>
            </div>
          )}

          {/* 테이블 */}
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--color-border-default)' }}>
            <table className="w-full border-collapse" style={{ fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
                  <th className="px-3 py-2 text-left text-xs font-medium text-brand-muted" rowSpan={2}
                    style={{ minWidth: 120 }}>
                    Segmentation
                  </th>
                  {months.map(m => (
                    <th key={m} colSpan={3} className="px-2 py-1.5 text-center text-xs font-semibold"
                      style={{ borderLeft: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                      {m}월
                    </th>
                  ))}
                  <th colSpan={3} className="px-2 py-1.5 text-center text-xs font-semibold"
                    style={{ borderLeft: '1px solid var(--color-border-default)', color: 'var(--color-accent-primary)' }}>
                    합계
                  </th>
                </tr>
                <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
                  {Array.from({ length: 13 }, (_, i) => (
                    <React.Fragment key={i}>
                      <th className="px-1 py-1 text-right text-[10px] text-brand-muted"
                        style={{ borderLeft: '1px solid var(--color-border-default)', minWidth: 42 }}>R/N</th>
                      <th className="px-1 py-1 text-right text-[10px] text-brand-muted"
                        style={{ borderLeft: '1px solid var(--color-border-subtle)', minWidth: 42 }}>ADR</th>
                      <th className="px-1 py-1 text-right text-[10px] text-brand-muted"
                        style={{ borderLeft: '1px solid var(--color-border-subtle)', minWidth: 50 }}>REV</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(previewMonthlyData).map(([seg, data]) => (
                  <tr key={seg} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td className="px-3 py-1.5 text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {seg}
                    </td>
                    {Array.from({ length: 13 }, (_, i) => {
                      const isTotal = i === 12
                      const rn  = isTotal ? (data['total_rn']  ?? 0) : (data[`rn_${i + 1}`]  ?? 0)
                      const rev = isTotal ? (data['total_rev'] ?? 0) : (data[`rev_${i + 1}`] ?? 0)
                      const adr = rn > 0 ? Math.round(rev / rn) : 0
                      return (
                        <React.Fragment key={i}>
                          <td className="px-1 py-1.5 text-right text-xs"
                            style={{ color: 'var(--color-text-primary)', borderLeft: '1px solid var(--color-border-default)' }}>
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

          {/* 저장/취소 */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-brand-muted">
              기준일: <span style={{ color: 'var(--color-text-primary)' }}>{updateDate}</span>
              &nbsp;·&nbsp;{distributedData.length.toLocaleString()}건
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowPreview(false); setUploadedBudget(null) }}
                className="px-4 py-2 rounded-full text-sm transition-all hover:opacity-80"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || distributedData.length === 0}
                className="flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-50"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {isSaving ? '저장 중...' : `${distributedData.length.toLocaleString()}건 저장`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
