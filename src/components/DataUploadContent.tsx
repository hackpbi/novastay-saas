'use client'

import React, { useState, useCallback } from 'react'
import {
  Upload, CalendarDays, CheckCircle, AlertCircle, XCircle,
  Loader2, X, FileSpreadsheet,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { FormDatePicker } from '@/components/DatePicker'
import { QUERY_KEYS } from '@/lib/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

type TabType = 'otb' | 'actual'

type UploadResult = {
  type:          'success' | 'partial' | 'error'
  successCount?: number
  totalCount?:   number
  errors:        string[]
}

type FileEntry = { id: string; file: File }

type FileResult = {
  fileName: string
  result:   UploadResult
}

export type DataUploadContentProps = {
  hotelId:         string
  showBulkUpload?: boolean
  onBulkOpen?:     () => void
}

// ── 날짜 변환 ──────────────────────────────────────────────────────────────────

function toDateString(val: any): string | null {
  if (!val) return null
  if (typeof val === 'string') return val.slice(0, 10) || null
  if (typeof val === 'number') {
    const utcMs = (val - 25569) * 86400 * 1000
    const d = new Date(utcMs)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (val instanceof Date) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`
  }
  return null
}

function toDateTimeString(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'string') return val
  return null
}

// ── 컬럼 매핑 ─────────────────────────────────────────────────────────────────

const COLUMN_MAP: Record<string, string> = {
  '상태': 'status', '예약번호': 'id', '판매일자': 'business_date',
  '입실일자': 'arrival_date', '퇴실일자': 'departure_date', '박수': 'nts',
  '객실타입': 'room_type_code', '객실수': 'nights', '객실료': 'room_revenue',
  '요금타입': 'rate_type', '시장': 'market_type', '예약경로': 'source_type',
  '국적': 'country', 'Package': 'package', '회사명': 'company',
  '거래처 번호': 'account_no', '거래처명': 'account_name', 'OTA Rsvn No': 'ota_rsvn_no',
  '단체 ID': 'group_id', '성인': 'adult', '소인': 'child', '서비스료': 'service_rate',
  '생성일자': 'create_date_time', '예약자': 'created_by', '취소일자': 'cancel_date',
  '기준일': 'update_date',
}

function transformRow(row: Record<string, any>, hotelId: string) {
  return {
    id:               Number(row['id']),
    hotel_id:         hotelId,
    rsvn_no:          row['id'] != null ? String(row['id']) : null,
    business_date:    toDateString(row['business_date']),
    status:           row['status']         ?? null,
    arrival_date:     toDateString(row['arrival_date']),
    departure_date:   toDateString(row['departure_date']),
    nts:              row['nts']            ? Number(row['nts']) : null,
    room_type_code:   row['room_type_code'] ?? null,
    nights:           row['nights']         ? Number(row['nights']) : null,
    room_revenue:     row['room_revenue']   ? Number(String(row['room_revenue']).replace(/,/g, '')) : null,
    rate_type:        row['rate_type']      ?? null,
    market_type:      row['market_type']    ?? null,
    source_type:      row['source_type']    ?? null,
    country:          row['country']        ?? null,
    package:          row['package']        ?? null,
    company:          row['company']        ?? null,
    account_no:       row['account_no']     ? String(row['account_no']) : null,
    account_name:     row['account_name']   ?? null,
    ota_rsvn_no:      row['ota_rsvn_no']    ? String(row['ota_rsvn_no']) : null,
    group_id:         row['group_id']       ? String(row['group_id']) : null,
    adult:            row['adult']          ? Number(row['adult']) : null,
    child:            row['child']          ? Number(row['child']) : null,
    service_rate:     row['service_rate']   ? Number(String(row['service_rate']).replace(/,/g, '')) : null,
    create_date_time: toDateTimeString(row['create_date_time']),
    created_by:       row['created_by']     ?? null,
    cancel_date:      toDateString(row['cancel_date']),
    update_date:      toDateString(row['update_date']),
  }
}

function parseExcelFile(file: File): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data     = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })
        const sheet    = workbook.Sheets[workbook.SheetNames[0]]
        const allRows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][]
        if (allRows.length === 0) { resolve([]); return }
        let headerRowIdx = 0, maxMatches = 0
        for (let i = 0; i < Math.min(6, allRows.length); i++) {
          const matches = (allRows[i] as any[]).filter(c => !!COLUMN_MAP[String(c ?? '').trim()]).length
          if (matches > maxMatches) { maxMatches = matches; headerRowIdx = i }
        }
        if (maxMatches === 0) { reject(new Error('파일 컬럼을 인식할 수 없습니다.')); return }
        const headers    = allRows[headerRowIdx] as any[]
        const filteredRows = allRows.slice(headerRowIdx + 1).filter(row => {
          const first = row[0]
          return first !== '총합계' && first !== null && first !== undefined && String(first).trim() !== ''
        })
        resolve(filteredRows.map(row => {
          const obj: Record<string, any> = {}
          headers.forEach((h: any, i: number) => {
            const dbCol = COLUMN_MAP[String(h ?? '').trim()]
            if (dbCol) obj[dbCol] = row[i] ?? null
          })
          return obj
        }))
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsArrayBuffer(file)
  })
}

// ── DropZone ──────────────────────────────────────────────────────────────────

function DropZone({ onFiles, disabled }: { onFiles: (f: File[]) => void; disabled?: boolean }) {
  const [drag, setDrag] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!disabled) setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault(); setDrag(false)
        const files = Array.from(e.dataTransfer.files).filter(f => /\.(xlsx|xls)$/i.test(f.name))
        if (files.length && !disabled) onFiles(files)
      }}
      onClick={() => { if (!disabled) document.getElementById('du-file-input')?.click() }}
      className="flex flex-col items-center justify-center rounded-xl cursor-pointer transition-all min-h-[140px] gap-3"
      style={{
        border:     `2px dashed ${drag ? 'var(--color-accent-primary)' : 'var(--color-border-default)'}`,
        background: drag ? 'var(--accent-badge-bg)' : 'var(--color-bg-tertiary)',
        opacity:    disabled ? 0.5 : 1,
        cursor:     disabled ? 'not-allowed' : 'pointer',
      }}>
      <Upload size={22} style={{ color: drag ? 'var(--color-accent-primary)' : 'var(--color-text-muted)' }} />
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          파일을 드래그하거나 클릭해서 선택
        </p>
        <p className="text-xs text-brand-muted mt-0.5">.xlsx / .xls 파일 지원</p>
      </div>
      <input id="du-file-input" type="file" accept=".xlsx,.xls" multiple hidden
        onChange={e => {
          const files = Array.from(e.target.files ?? []).filter(f => /\.(xlsx|xls)$/i.test(f.name))
          if (files.length && !disabled) onFiles(files)
          e.target.value = ''
        }} />
    </div>
  )
}

// ── FileResultRow ─────────────────────────────────────────────────────────────

function FileResultRow({ fileName, result, isProcessing, isPending }: {
  fileName:     string
  result?:      UploadResult
  isProcessing: boolean
  isPending:    boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hasErrors = (result?.errors.length ?? 0) > 0
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)' }}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <FileSpreadsheet size={14} style={{ color: '#21A366', flexShrink: 0 }} />
        <span className="flex-1 text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{fileName}</span>
        {isProcessing && <div className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" style={{ color: 'var(--color-accent-primary)' }} /><span className="text-xs text-brand-muted">처리 중...</span></div>}
        {isPending && <span className="text-xs text-brand-muted">대기 중</span>}
        {result?.type === 'success' && <div className="flex items-center gap-1.5"><CheckCircle size={14} style={{ color: 'var(--color-positive)' }} /><span className="text-xs font-medium" style={{ color: 'var(--color-positive)' }}>{result.totalCount?.toLocaleString()}건 완료</span></div>}
        {result?.type === 'partial' && <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1.5"><AlertCircle size={14} style={{ color: '#F6AD55' }} /><span className="text-xs font-medium" style={{ color: '#F6AD55' }}>{result.successCount?.toLocaleString()}건 성공 / {((result.totalCount ?? 0) - (result.successCount ?? 0)).toLocaleString()}건 실패</span></button>}
        {result?.type === 'error' && <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1.5"><XCircle size={14} style={{ color: '#FC8181' }} /><span className="text-xs font-medium" style={{ color: '#FC8181' }}>실패</span></button>}
      </div>
      {expanded && hasErrors && (
        <div className="px-3 py-2 space-y-0.5" style={{ background: 'rgba(252,129,129,0.06)', borderTop: '1px solid var(--color-border-default)' }}>
          {result!.errors.slice(0, 10).map((err, i) => <p key={i} className="text-xs" style={{ color: '#FC8181' }}>{err}</p>)}
          {result!.errors.length > 10 && <p className="text-xs text-brand-muted">외 {result!.errors.length - 10}건...</p>}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DataUploadContent({ hotelId, showBulkUpload = false, onBulkOpen }: DataUploadContentProps) {
  const queryClient = useQueryClient()

  const [activeTab,           setActiveTab]           = useState<TabType>('otb')
  const [otbDate,             setOtbDate]             = useState<string>(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })
  const [queuedFiles,         setQueuedFiles]         = useState<FileEntry[]>([])
  const [uploadingFiles,      setUploadingFiles]      = useState<FileEntry[]>([])
  const [fileResults,         setFileResults]         = useState<FileResult[]>([])
  const [uploading,           setUploading]           = useState(false)
  const [currentFileIdx,      setCurrentFileIdx]      = useState(0)
  const [currentFileProgress, setCurrentFileProgress] = useState(0)

  const { data: otbDates = [] } = useQuery<string[]>({
    queryKey: QUERY_KEYS.otbDates(hotelId),
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('r02_otb').select('update_date').eq('hotel_id', hotelId).order('update_date', { ascending: false })
      if (error) throw error
      return [...new Set(data?.map((d: any) => d.update_date) ?? [])] as string[]
    },
    enabled:   !!hotelId,
    staleTime: 5 * 60 * 1000,
  })

  const invalidateOtb = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.otbDates(hotelId) })
  }, [queryClient, hotelId])

  const addFiles  = (files: File[]) =>
    setQueuedFiles(prev => [...prev, ...files.map(f => ({ id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`, file: f }))])
  const removeFile = (id: string) => setQueuedFiles(prev => prev.filter(e => e.id !== id))

  const switchTab = (t: TabType) => {
    if (uploading) return
    setActiveTab(t); setQueuedFiles([]); setFileResults([]); setUploadingFiles([])
  }

  const handleUploadAll = useCallback(async () => {
    if (!hotelId || queuedFiles.length === 0 || uploading) return
    const filesToProcess = [...queuedFiles]
    setQueuedFiles([]); setUploadingFiles(filesToProcess); setFileResults([])
    setUploading(true); setCurrentFileIdx(0); setCurrentFileProgress(0)
    const tab = activeTab, date = otbDate
    let otbUploaded = false

    for (let idx = 0; idx < filesToProcess.length; idx++) {
      setCurrentFileIdx(idx); setCurrentFileProgress(0)
      const { file } = filesToProcess[idx]
      try {
        const rows = await parseExcelFile(file)
        if (rows.length === 0) {
          setFileResults(prev => [...prev, { fileName: file.name, result: { type: 'error', errors: ['데이터가 없습니다.'] } }])
          continue
        }
        const insertData = rows.map(row => ({
          ...transformRow(row, hotelId),
          ...(tab === 'otb' ? { update_date: date } : {}),
        }))
        const validErrs: string[] = []
        insertData.forEach((row, i) => {
          if (!row.id || isNaN(row.id)) validErrs.push(`${i + 1}행: id 누락`)
          if (!row.business_date)       validErrs.push(`${i + 1}행: 판매일자 누락`)
        })
        if (validErrs.length > 0) {
          setFileResults(prev => [...prev, { fileName: file.name, result: { type: 'error', errors: validErrs } }])
          continue
        }
        const CHUNK = 1000; let success = 0; const errs: string[] = []
        if (tab === 'actual') {
          const businessDates = [...new Set(insertData.map((r: any) => r.business_date).filter(Boolean))] as string[]
          const { error: delError } = await (supabase as any).rpc('r01_delete_actual', { p_hotel_id: hotelId, p_dates: businessDates })
          if (delError) throw delError
          for (let i = 0; i < insertData.length; i += CHUNK) {
            const chunk = insertData.slice(i, i + CHUNK)
            setCurrentFileProgress(Math.round((i / insertData.length) * 100))
            const { data, error } = await (supabase as any).rpc('r01_insert_actual', { p_hotel_id: hotelId, p_rows: chunk })
            if (error || !data?.success) errs.push(`${i + 1}~${i + chunk.length}행: ${error?.message ?? data?.error}`)
            else success += data.count
          }
        } else {
          const { error: delError } = await (supabase as any).rpc('r02_delete_otb', { p_hotel_id: hotelId, p_update_date: date })
          if (delError) throw delError
          for (let i = 0; i < insertData.length; i += CHUNK) {
            const chunk = insertData.slice(i, i + CHUNK)
            setCurrentFileProgress(Math.round((i / insertData.length) * 100))
            const { data, error } = await (supabase as any).rpc('r02_insert_otb', { p_hotel_id: hotelId, p_update_date: date, p_rows: chunk })
            if (error || !data?.success) errs.push(`${i + 1}~${i + chunk.length}행: ${error?.message ?? data?.error}`)
            else success += data.count
          }
        }
        setCurrentFileProgress(100)
        setFileResults(prev => [...prev, {
          fileName: file.name,
          result: { type: errs.length > 0 ? (success > 0 ? 'partial' : 'error') : 'success', successCount: success, totalCount: insertData.length, errors: errs },
        }])
        if (tab === 'otb') otbUploaded = true
      } catch (e: any) {
        setFileResults(prev => [...prev, { fileName: file.name, result: { type: 'error', errors: [e.message ?? '알 수 없는 오류'] } }])
      }
    }
    if (otbUploaded) invalidateOtb()
    setUploading(false)
  }, [hotelId, activeTab, otbDate, queuedFiles, uploading, invalidateOtb])

  const totalFiles      = uploadingFiles.length
  const overallProgress = totalFiles > 0
    ? Math.round((currentFileIdx / totalFiles) * 100 + currentFileProgress / totalFiles)
    : 0

  return (
    <div className="space-y-5">
      {/* 탭 */}
      <div className="flex gap-1 p-1 rounded-xl"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)' }}>
        {(['otb', 'actual'] as TabType[]).map(t => (
          <button key={t} onClick={() => switchTab(t)} disabled={uploading}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: activeTab === t ? 'var(--color-bg-elevated)' : 'transparent',
              color:      activeTab === t ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              boxShadow:  activeTab === t ? 'var(--shadow-card)' : 'none',
            }}>
            {t === 'otb' ? 'OTB' : 'Actual'}
          </button>
        ))}
      </div>

      {/* 콘텐츠 카드 */}
      <div className="rounded-2xl p-6 space-y-5"
        style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}>

        {/* OTB 기준일 */}
        {activeTab === 'otb' && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl space-y-2"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)' }}>
              <div className="flex items-center gap-2">
                <CalendarDays size={14} style={{ color: 'var(--color-accent-primary)', flexShrink: 0 }} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>OTB 기준일</span>
                <span className="text-xs text-brand-muted ml-1">기본: 오늘 날짜</span>
              </div>
              <FormDatePicker value={otbDate} onChange={setOtbDate} placeholder="날짜 선택" />
            </div>
            {otbDates.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-brand-muted">최근 업로드:</span>
                {otbDates.slice(0, 5).map(date => (
                  <button key={date} onClick={() => setOtbDate(date)}
                    className="text-xs px-2.5 py-1 rounded transition-colors"
                    style={{
                      background: otbDate === date ? 'var(--accent-badge-bg)' : 'var(--color-bg-tertiary)',
                      color:      otbDate === date ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                      border:     `1px solid ${otbDate === date ? 'var(--color-accent-primary)' : 'var(--color-border-default)'}`,
                    }}>
                    {date}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 드롭존 */}
        <DropZone onFiles={addFiles} disabled={uploading} />

        {/* 파일 대기 목록 */}
        {queuedFiles.length > 0 && !uploading && (
          <div className="space-y-2">
            <p className="text-xs text-brand-muted px-0.5">선택된 파일 ({queuedFiles.length}개)</p>
            <div className="space-y-1.5">
              {queuedFiles.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)' }}>
                  <FileSpreadsheet size={15} style={{ color: '#21A366', flexShrink: 0 }} />
                  <span className="flex-1 text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{entry.file.name}</span>
                  <button onClick={() => removeFile(entry.id)} className="text-brand-muted hover:text-brand-text transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={handleUploadAll}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:-translate-y-px"
              style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
              업로드 시작 ({queuedFiles.length}개 파일)
            </button>
          </div>
        )}

        {/* 진행상황 */}
        {uploading && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 size={13} className="animate-spin shrink-0" style={{ color: 'var(--color-accent-primary)' }} />
              <span className="text-sm text-brand-muted">파일 {currentFileIdx + 1}/{totalFiles} 처리 중...</span>
              <span className="text-xs text-brand-muted ml-auto">{overallProgress}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${overallProgress}%`, background: 'var(--gradient-cta)' }} />
            </div>
          </div>
        )}

        {/* 파일별 결과 */}
        {(uploading || fileResults.length > 0) && uploadingFiles.length > 0 && (
          <div className="space-y-1.5">
            {uploadingFiles.map((entry, idx) => (
              <FileResultRow key={entry.id} fileName={entry.file.name}
                result={fileResults[idx]?.result}
                isProcessing={uploading && idx === currentFileIdx}
                isPending={uploading && idx > currentFileIdx} />
            ))}
          </div>
        )}
      </div>

      {/* 대용량 업로드 버튼 */}
      {showBulkUpload && onBulkOpen && (
        <button onClick={onBulkOpen}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px"
          style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
          <Upload size={14} />대용량 업로드
        </button>
      )}
    </div>
  )
}
