'use client'

import React, { useState, useRef, useCallback } from 'react'
import {
  Upload, CalendarDays, CheckCircle, AlertCircle, XCircle,
  Loader2, X, FileSpreadsheet, Download,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHotel } from '@/contexts/HotelContext'
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

// ── 엑셀 컬럼 → DB 컬럼 매핑 ─────────────────────────────────────────────────

const COLUMN_MAP: Record<string, string> = {
  '상태':        'status',
  '예약번호':    'id',       // PK 컬럼, rsvn_no에도 동일값 문자열로 복사
  '판매일자':    'business_date',
  '입실일자':    'arrival_date',
  '퇴실일자':    'departure_date',
  '박수':        'nts',
  '객실타입':    'room_type_code',
  '객실수':      'nights',
  '객실료':      'room_revenue',
  '요금타입':    'rate_type',
  '시장':        'market_type',
  '예약경로':    'source_type',
  '국적':        'country',
  'Package':     'package',
  '회사명':      'company',
  '거래처 번호': 'account_no',
  '거래처명':    'account_name',
  'OTA Rsvn No': 'ota_rsvn_no',
  '단체 ID':     'group_id',
  '성인':        'adult',
  '소인':        'child',
  '서비스료':    'service_rate',
  '생성일자':    'create_date_time',
  '예약자':      'created_by',
  '취소일자':    'cancel_date',
  '기준일':      'update_date',  // OTB 대용량 전용
}

// ── 날짜 변환 ──────────────────────────────────────────────────────────────────

function toDateString(val: any): string | null {
  if (!val) return null

  // 문자열
  if (typeof val === 'string') {
    const s = val.slice(0, 10)
    return s || null
  }

  // 엑셀 시리얼 숫자 → 로컬 시간 기준
  if (typeof val === 'number') {
    const utcMs = (val - 25569) * 86400 * 1000
    const d  = new Date(utcMs)
    const y  = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${mo}-${day}`
  }

  // Date 객체 (혹시 모를 경우)
  if (val instanceof Date) {
    const y  = val.getUTCFullYear()
    const mo = String(val.getUTCMonth() + 1).padStart(2, '0')
    const d  = String(val.getUTCDate()).padStart(2, '0')
    return `${y}-${mo}-${d}`
  }

  return null
}

function toDateTimeString(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'string') return val
  return null
}

// ── 엑셀 파싱 ─────────────────────────────────────────────────────────────────

function parseExcelFile(file: File): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data     = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet    = workbook.Sheets[workbook.SheetNames[0]]

        const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][]

        if (allRows.length === 0) { resolve([]); return }

        // 헤더 행 자동 감지: 처음 6행 중 COLUMN_MAP 매핑 수가 가장 많은 행
        // (PMS 파일은 3행, 일반 파일은 1행에 헤더가 있을 수 있음)
        let headerRowIdx = 0
        let maxMatches   = 0
        for (let i = 0; i < Math.min(6, allRows.length); i++) {
          const row     = allRows[i] as any[]
          const matches = row.filter(cell => !!COLUMN_MAP[String(cell ?? '').trim()]).length
          if (matches > maxMatches) { maxMatches = matches; headerRowIdx = i }
        }

        if (maxMatches === 0) {
          reject(new Error('파일 컬럼을 인식할 수 없습니다. 엑셀 파일의 컬럼명을 확인하세요.'))
          return
        }

        const headers  = allRows[headerRowIdx] as any[]
        const dataRows = allRows.slice(headerRowIdx + 1)

        const filteredRows = dataRows.filter(row => {
          const first = row[0]
          return first !== '총합계' && first !== null && first !== undefined && String(first).trim() !== ''
        })

        const mappedRows = filteredRows.map(row => {
          const obj: Record<string, any> = {}
          headers.forEach((header: any, i: number) => {
            // 앞뒤 공백 trim 후 매핑
            const dbCol = COLUMN_MAP[String(header ?? '').trim()]
            if (dbCol) obj[dbCol] = row[i] ?? null
          })
          return obj
        })

        console.log('raw business_date:', mappedRows[0]?.business_date)
        console.log('타입:', typeof mappedRows[0]?.business_date)
        console.log('instanceof Date:', mappedRows[0]?.business_date instanceof Date)

        resolve(mappedRows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsArrayBuffer(file)
  })
}

// ── 데이터 변환 ───────────────────────────────────────────────────────────────

function transformRow(row: Record<string, any>, hotelId: string) {
  return {
    id:               Number(row['id']),            // '예약번호' → 'id' (PK)
    hotel_id:         hotelId,
    rsvn_no:          row['id'] != null ? String(row['id']) : null,   // id와 동일값, 문자열
    business_date:    toDateString(row['business_date']),
    status:           row['status']         ?? null,
    arrival_date:     toDateString(row['arrival_date']),
    departure_date:   toDateString(row['departure_date']),
    nts:              row['nts']            ? Number(row['nts'])                                    : null,
    room_type_code:   row['room_type_code'] ?? null,
    nights:           row['nights']         ? Number(row['nights'])                                 : null,
    room_revenue:     row['room_revenue']   ? Number(String(row['room_revenue']).replace(/,/g, '')) : null,
    rate_type:        row['rate_type']      ?? null,
    market_type:      row['market_type']    ?? null,
    source_type:      row['source_type']    ?? null,
    country:          row['country']        ?? null,
    package:          row['package']        ?? null,
    company:          row['company']        ?? null,
    account_no:       row['account_no']     ? String(row['account_no'])                             : null,
    account_name:     row['account_name']   ?? null,
    ota_rsvn_no:      row['ota_rsvn_no']    ? String(row['ota_rsvn_no'])                            : null,
    group_id:         row['group_id']       ? String(row['group_id'])                               : null,
    adult:            row['adult']          ? Number(row['adult'])                                  : null,
    child:            row['child']          ? Number(row['child'])                                  : null,
    service_rate:     row['service_rate']   ? Number(String(row['service_rate']).replace(/,/g, '')) : null,
    create_date_time: toDateTimeString(row['create_date_time']),
    created_by:       row['created_by']     ?? null,
    cancel_date:      toDateString(row['cancel_date']),
    update_date:      toDateString(row['update_date']),
  }
}

// ── 양식 다운로드 ─────────────────────────────────────────────────────────────

const ACTUAL_HEADERS = [
  '상태','예약번호','판매일자','입실일자','퇴실일자','박수',
  '객실타입','객실수','객실료','요금타입','시장','예약경로',
  '국적','Package','회사명','거래처 번호','거래처명',
  'OTA Rsvn No','단체 ID','성인','소인','서비스료','생성일자','예약자','취소일자',
]
const OTB_HEADERS = [...ACTUAL_HEADERS, '기준일']

function downloadBulkTemplate(type: TabType) {
  const headers = type === 'otb' ? OTB_HEADERS : ACTUAL_HEADERS
  const ws = XLSX.utils.aoa_to_sheet([
    ['일자별 객실 실적 조회'],
    ['프로퍼티 : (호텔명)'],
    headers,
  ])
  // 헤더 행 높이 및 열 너비 설정
  ws['!cols'] = headers.map(() => ({ wch: 14 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, `bulk_template_${type}.xlsx`)
}

// ── 드롭존 (다중 파일) ────────────────────────────────────────────────────────

function DropZone({
  onFiles, disabled, label,
}: {
  onFiles:  (files: File[]) => void
  disabled?: boolean
  label?:    string
}) {
  const ref          = useRef<HTMLInputElement>(null)
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
      onClick={() => !disabled && ref.current?.click()}
      className="flex flex-col items-center justify-center rounded-xl cursor-pointer transition-all duration-200 min-h-[180px] gap-4"
      style={{
        border:     `2px dashed ${drag ? 'var(--color-accent-primary)' : 'var(--color-border-default)'}`,
        background: drag ? 'var(--accent-badge-bg)' : 'var(--color-bg-secondary)',
        opacity:    disabled ? 0.5 : 1,
        cursor:     disabled ? 'not-allowed' : 'pointer',
      }}>
      <div className="w-14 h-14 rounded-xl flex items-center justify-center"
        style={{ background: drag ? 'rgba(0,212,138,0.2)' : 'var(--color-bg-tertiary)' }}>
        <Upload size={24} style={{ color: drag ? 'var(--color-accent-primary)' : 'var(--color-text-muted)' }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium mb-1"
          style={{ color: drag ? 'var(--color-accent-primary)' : 'var(--color-text-primary)' }}>
          {drag ? '파일을 놓으세요' : (label ?? '엑셀 파일을 드래그하거나 클릭하여 선택')}
        </p>
        <p className="text-xs text-brand-muted">여러 파일 동시 선택 가능 · .xlsx, .xls</p>
      </div>
      <input ref={ref} type="file" accept=".xlsx,.xls" multiple className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) { onFiles(files); e.target.value = '' }
        }} />
    </div>
  )
}

// ── 파일 결과 행 ──────────────────────────────────────────────────────────────

function FileResultRow({
  fileName, result, isProcessing, isPending,
}: {
  fileName:      string
  result?:       UploadResult
  isProcessing?: boolean
  isPending?:    boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hasErrors = (result?.type === 'partial' || result?.type === 'error') && (result.errors?.length ?? 0) > 0

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--color-border-default)' }}>
      <div className="flex items-center gap-3 px-3 py-2.5"
        style={{ background: 'var(--color-bg-tertiary)' }}>
        <FileSpreadsheet size={15} style={{ color: '#21A366', flexShrink: 0 }} />
        <span className="flex-1 text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
          {fileName}
        </span>

        {isProcessing && (
          <div className="flex items-center gap-1.5">
            <Loader2 size={13} className="animate-spin" style={{ color: 'var(--color-accent-primary)' }} />
            <span className="text-xs text-brand-muted">처리 중...</span>
          </div>
        )}
        {isPending && <span className="text-xs text-brand-muted">대기 중</span>}

        {result?.type === 'success' && (
          <div className="flex items-center gap-1.5">
            <CheckCircle size={14} style={{ color: 'var(--color-positive)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--color-positive)' }}>
              {result.totalCount?.toLocaleString()}건 완료
            </span>
          </div>
        )}
        {result?.type === 'partial' && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1.5">
              <AlertCircle size={14} style={{ color: '#F6AD55' }} />
              <span className="text-xs font-medium" style={{ color: '#F6AD55' }}>
                {result.successCount?.toLocaleString()}건 성공 / {((result.totalCount ?? 0) - (result.successCount ?? 0)).toLocaleString()}건 실패
              </span>
            </button>
          </div>
        )}
        {result?.type === 'error' && (
          <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1.5">
            <XCircle size={14} style={{ color: '#FC8181' }} />
            <span className="text-xs font-medium" style={{ color: '#FC8181' }}>실패</span>
          </button>
        )}
      </div>

      {/* 에러 상세 (토글) */}
      {expanded && hasErrors && (
        <div className="px-3 py-2 space-y-0.5"
          style={{ background: result?.type === 'error' ? 'rgba(252,129,129,0.06)' : 'rgba(246,173,85,0.06)', borderTop: '1px solid var(--color-border-default)' }}>
          {result!.errors.slice(0, 10).map((err, i) => (
            <p key={i} className="text-xs" style={{ color: result?.type === 'error' ? '#FC8181' : '#F6AD55' }}>
              {err}
            </p>
          ))}
          {result!.errors.length > 10 && (
            <p className="text-xs text-brand-muted">외 {result!.errors.length - 10}건...</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── 대용량 업로드 모달 ────────────────────────────────────────────────────────

function BulkModal({
  hotelId, onClose, onInvalidate,
}: {
  hotelId:      string
  onClose:      () => void
  onInvalidate: () => void
}) {
  const [tab,                setTab]                = useState<TabType>('otb')
  const [queuedFiles,        setQueuedFiles]        = useState<FileEntry[]>([])
  const [uploadingFiles,     setUploadingFiles]     = useState<FileEntry[]>([])
  const [fileResults,        setFileResults]        = useState<FileResult[]>([])
  const [uploading,          setUploading]          = useState(false)
  const [currentFileIdx,     setCurrentFileIdx]     = useState(0)
  const [currentFileProgress, setCurrentFileProgress] = useState(0)
  const [currentProcessed,   setCurrentProcessed]  = useState(0)
  const [currentTotal,       setCurrentTotal]       = useState(0)

  const addFiles = (files: File[]) => {
    setQueuedFiles(prev => [
      ...prev,
      ...files.map(f => ({ id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`, file: f })),
    ])
  }

  const removeFile = (id: string) => setQueuedFiles(prev => prev.filter(e => e.id !== id))

  const handleBulkAll = useCallback(async () => {
    if (queuedFiles.length === 0 || uploading) return

    const filesToProcess = [...queuedFiles]
    setQueuedFiles([])
    setUploadingFiles(filesToProcess)
    setFileResults([])
    setUploading(true)
    setCurrentFileIdx(0)

    const currentTab = tab
    let otbUploaded  = false

    for (let idx = 0; idx < filesToProcess.length; idx++) {
      setCurrentFileIdx(idx)
      setCurrentFileProgress(0)
      setCurrentProcessed(0)
      setCurrentTotal(0)

      const { file } = filesToProcess[idx]

      try {
        const rows = await parseExcelFile(file)

        if (rows.length === 0) {
          setFileResults(prev => [...prev, { fileName: file.name, result: { type: 'error', errors: ['데이터가 없습니다.'] } }])
          continue
        }

        // 날짜를 포함한 모든 필드를 문자열로 변환 (update_date 포함)
        const transformedRows = rows.map(row => transformRow(row, hotelId))

        // OTB: DELETE용 기준일은 변환된 rows에서 추출 (첫 번째 유효값)
        const bulkUpdateDate = currentTab === 'otb'
          ? (transformedRows.find((r: any) => r.update_date)?.update_date ?? null)
          : null

        // Actual: 변환된 rows에서 business_date 목록 추출
        const allBusinessDates = currentTab === 'actual'
          ? [...new Set(transformedRows.map((r: any) => r.business_date).filter(Boolean))]
          : []

        const totalRows = transformedRows.length
        setCurrentTotal(totalRows)

        const CHUNK   = 3000
        let   success = 0
        const errors: string[] = []

        // null 값 제거로 payload 크기 축소
        const stripNulls = (row: Record<string, any>) =>
          Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined))

        for (let i = 0; i < transformedRows.length; i += CHUNK) {
          const chunk = transformedRows.slice(i, i + CHUNK).map(stripNulls)
          setCurrentFileProgress(Math.round((i / totalRows) * 100))

          const res = await fetch('/api/data/bulk-upload', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              type:           currentTab,
              hotel_id:       hotelId,
              update_date:    bulkUpdateDate,
              do_delete:      i === 0,
              is_last:        i + CHUNK >= transformedRows.length, // 마지막 청크 여부
              business_dates: i === 0 ? allBusinessDates : [],
              rows:           chunk,
            }),
          })
          const json = await res.json()
          if (json.error) errors.push(`${i + 1}~${i + chunk.length}행: ${json.error}`)
          else success += json.count ?? 0
          setCurrentProcessed(Math.min(i + CHUNK, totalRows))
        }

        setCurrentFileProgress(100)
        setFileResults(prev => [...prev, {
          fileName: file.name,
          result: {
            type:         errors.length > 0 ? 'partial' : 'success',
            successCount: success,
            totalCount:   totalRows,
            errors,
          },
        }])
        if (currentTab === 'otb') otbUploaded = true

      } catch (e: any) {
        setFileResults(prev => [...prev, { fileName: file.name, result: { type: 'error', errors: [e.message ?? '알 수 없는 오류'] } }])
      }
    }

    if (otbUploaded) onInvalidate()
    setUploading(false)
  }, [tab, hotelId, queuedFiles, uploading, onInvalidate])

  const totalFiles     = uploading ? uploadingFiles.length : 0
  const overallProgress = totalFiles > 0
    ? Math.round((currentFileIdx / totalFiles) * 100 + currentFileProgress / totalFiles)
    : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !uploading && onClose()} />
      <div className="relative w-full max-w-lg rounded-2xl flex flex-col max-h-[90vh] overflow-hidden"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>대용량 업로드</p>
            <p className="text-xs text-brand-muted mt-0.5">super_admin 전용 — Next.js API Route 처리</p>
          </div>
          <button onClick={() => !uploading && onClose()} disabled={uploading}
            className="text-brand-muted hover:text-brand-text transition-colors disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          {/* 탭 */}
          <div className="flex gap-1 p-1 rounded-xl"
            style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)' }}>
            {(['otb', 'actual'] as TabType[]).map(t => (
              <button key={t} onClick={() => { if (!uploading) { setTab(t); setFileResults([]) } }}
                disabled={uploading}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                style={{
                  background: tab === t ? 'var(--color-bg-elevated)' : 'transparent',
                  color:      tab === t ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  boxShadow:  tab === t ? 'var(--shadow-card)' : 'none',
                }}>
                {t === 'otb' ? 'OTB 대용량' : 'Actual 대용량'}
              </button>
            ))}
          </div>

          {tab === 'otb' && (
            <p className="text-xs text-brand-muted px-1">
              * OTB 대용량은 파일의 <span className="font-mono" style={{ color: 'var(--color-accent-primary)' }}>기준일</span> 컬럼을 update_date로 사용합니다.
            </p>
          )}

          {/* 양식 다운로드 */}
          <button
            onClick={() => downloadBulkTemplate(tab)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:-translate-y-0.5 w-full justify-center"
            style={{
              background:   'var(--color-bg-tertiary)',
              border:       '1px solid var(--color-border-default)',
              color:        'var(--color-text-secondary)',
              boxShadow:    'var(--shadow-card)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent-primary)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}>
            <FileSpreadsheet size={14} style={{ color: '#21A366' }} />
            <Download size={12} className="text-brand-muted" />
            엑셀 양식 다운로드 ({tab === 'otb' ? 'OTB' : 'Actual'})
          </button>

          {/* 드롭존 */}
          <DropZone onFiles={addFiles} disabled={uploading} label="대용량 엑셀 파일 드래그/클릭 (10만 건 이상 지원)" />

          {/* 파일 대기 목록 */}
          {queuedFiles.length > 0 && !uploading && (
            <div className="space-y-2">
              <p className="text-xs text-brand-muted px-0.5">선택된 파일 ({queuedFiles.length}개)</p>
              <div className="space-y-1.5">
                {queuedFiles.map(entry => (
                  <div key={entry.id} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                    style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)' }}>
                    <FileSpreadsheet size={15} style={{ color: '#21A366', flexShrink: 0 }} />
                    <span className="flex-1 text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {entry.file.name}
                    </span>
                    <button onClick={() => removeFile(entry.id)}
                      className="text-brand-muted hover:text-brand-text transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={handleBulkAll}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:-translate-y-px"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
                업로드 시작 ({queuedFiles.length}개 파일)
              </button>
            </div>
          )}

          {/* 전체 진행 */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 size={13} className="animate-spin shrink-0" style={{ color: 'var(--color-accent-primary)' }} />
                <span className="text-sm text-brand-muted">
                  파일 {currentFileIdx + 1}/{uploadingFiles.length} 처리 중...
                </span>
                <span className="text-xs text-brand-muted ml-auto">
                  {currentProcessed.toLocaleString()} / {currentTotal.toLocaleString()}건
                </span>
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
                <FileResultRow
                  key={entry.id}
                  fileName={entry.file.name}
                  result={fileResults[idx]?.result}
                  isProcessing={uploading && idx === currentFileIdx}
                  isPending={uploading && idx > currentFileIdx}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DataUploadPage() {
  const { profile }      = useAuth()
  const { currentHotel } = useHotel()
  const queryClient      = useQueryClient()
  const hotelId          = currentHotel?.id ?? ''
  const isSuperAdmin     = profile?.role === 'super_admin'

  const [activeTab,            setActiveTab]            = useState<TabType>('otb')
  const [otbDate,              setOtbDate]              = useState<string>(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}` })
  const [queuedFiles,          setQueuedFiles]          = useState<FileEntry[]>([])
  const [uploadingFiles,       setUploadingFiles]       = useState<FileEntry[]>([])
  const [fileResults,          setFileResults]          = useState<FileResult[]>([])
  const [uploading,            setUploading]            = useState(false)
  const [currentFileIdx,       setCurrentFileIdx]       = useState(0)
  const [currentFileProgress,  setCurrentFileProgress]  = useState(0)
  const [showBulk,             setShowBulk]             = useState(false)

  // 기존 OTB 날짜 목록
  const { data: otbDates = [] } = useQuery<string[]>({
    queryKey: QUERY_KEYS.otbDates(hotelId),
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_otb_dates', { p_hotel_id: hotelId })
      if (error) throw error
      return (data ?? []) as string[]
    },
    enabled:   !!hotelId,
    staleTime: 5 * 60 * 1000,
  })

  const invalidateOtb = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.otbDates(hotelId) })
  }, [queryClient, hotelId])

  const addFiles = (files: File[]) => {
    setQueuedFiles(prev => [
      ...prev,
      ...files.map(f => ({ id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`, file: f })),
    ])
  }

  const removeFile = (id: string) => setQueuedFiles(prev => prev.filter(e => e.id !== id))

  // ── 일반 업로드 (순차 처리) ───────────────────────────────────────────────────

  const handleUploadAll = useCallback(async () => {
    if (!hotelId || queuedFiles.length === 0 || uploading) return

    const filesToProcess = [...queuedFiles]
    setQueuedFiles([])
    setUploadingFiles(filesToProcess)
    setFileResults([])
    setUploading(true)
    setCurrentFileIdx(0)
    setCurrentFileProgress(0)

    const tab  = activeTab
    const date = otbDate

    let otbUploaded = false

    if (tab === 'actual') {
      // ── Actual: 파일별 순차 처리 ─────────────────────────────────────────

      for (let idx = 0; idx < filesToProcess.length; idx++) {
        setCurrentFileIdx(idx)
        setCurrentFileProgress(0)

        const { file } = filesToProcess[idx]

        try {
          const rows = await parseExcelFile(file)

          if (rows.length === 0) {
            setFileResults(prev => [...prev, { fileName: file.name, result: { type: 'error', errors: ['데이터가 없습니다.'] } }])
            continue
          }

          const insertData = rows.map(row => transformRow(row, hotelId))

          const validErrs: string[] = []
          insertData.forEach((row, i) => {
            if (!row.id || isNaN(row.id)) validErrs.push(`${i + 1}행: id 누락`)
            if (!row.business_date)       validErrs.push(`${i + 1}행: 판매일자 누락`)
          })
          if (validErrs.length > 0) {
            setFileResults(prev => [...prev, { fileName: file.name, result: { type: 'error', errors: validErrs } }])
            continue
          }

          const CHUNK   = 1000
          let   success = 0
          const errs: string[] = []

          const businessDates = [...new Set(
            insertData.map((r: any) => r.business_date).filter(Boolean)
          )] as string[]

          const { error: delError } = await (supabase as any).rpc('r01_delete_actual', {
            p_hotel_id: hotelId,
            p_dates:    businessDates,
          })
          if (delError) throw delError

          for (let i = 0; i < insertData.length; i += CHUNK) {
            const chunk = insertData.slice(i, i + CHUNK)
            setCurrentFileProgress(Math.round((i / insertData.length) * 100))
            const { data, error } = await (supabase as any).rpc('r01_insert_actual', {
              p_hotel_id: hotelId,
              p_rows:     chunk,
            })
            if (error || !data?.success) errs.push(`${i + 1}~${i + chunk.length}행: ${error?.message ?? data?.error}`)
            else success += data.count
          }

          try {
            await (supabase as any).rpc('a01_refresh_actual_daily', {
              p_hotel_id: hotelId,
              p_dates:    businessDates,
            })
          } catch (err) {
            console.error('Actual 집계 갱신 오류:', err)
          }

          setCurrentFileProgress(100)
          setFileResults(prev => [...prev, {
            fileName: file.name,
            result: {
              type:         errs.length > 0 ? (success > 0 ? 'partial' : 'error') : 'success',
              successCount: success,
              totalCount:   insertData.length,
              errors:       errs,
            },
          }])

        } catch (e: any) {
          setFileResults(prev => [...prev, { fileName: file.name, result: { type: 'error', errors: [e.message ?? '알 수 없는 오류'] } }])
        }
      }

    } else {
      // ── OTB: 전체 파싱 후 DELETE 1회 + INSERT 전체 ───────────────────────

      // 1단계: 모든 파일 파싱 및 데이터 수집
      const allInsertData: any[] = []

      for (let idx = 0; idx < filesToProcess.length; idx++) {
        setCurrentFileIdx(idx)
        setCurrentFileProgress(0)

        const { file } = filesToProcess[idx]

        try {
          const rows = await parseExcelFile(file)

          if (rows.length === 0) {
            setFileResults(prev => [...prev, { fileName: file.name, result: { type: 'error', errors: ['데이터가 없습니다.'] } }])
            continue
          }

          const insertData = rows.map(row => ({
            ...transformRow(row, hotelId),
            update_date: date,
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

          allInsertData.push(...insertData)
          setCurrentFileProgress(100)
          setFileResults(prev => [...prev, {
            fileName: file.name,
            result: { type: 'success', successCount: insertData.length, totalCount: insertData.length, errors: [] },
          }])

        } catch (e: any) {
          setFileResults(prev => [...prev, { fileName: file.name, result: { type: 'error', errors: [e.message ?? '알 수 없는 오류'] } }])
        }
      }

      // 2단계: DELETE 1회 + INSERT 전체 + 집계 갱신
      if (allInsertData.length > 0) {
        const CHUNK   = 1000
        let   success = 0
        const errs: string[] = []

        try {
          const { error: delError } = await (supabase as any).rpc('r02_delete_otb', {
            p_hotel_id:    hotelId,
            p_update_date: date,
          })
          if (delError) throw delError

          for (let i = 0; i < allInsertData.length; i += CHUNK) {
            const chunk = allInsertData.slice(i, i + CHUNK)
            setCurrentFileProgress(Math.round((i / allInsertData.length) * 100))
            const { data, error } = await (supabase as any).rpc('r02_insert_otb', {
              p_hotel_id:    hotelId,
              p_update_date: date,
              p_rows:        chunk,
            })
            if (error || !data?.success) errs.push(`${i + 1}~${i + chunk.length}행: ${error?.message ?? data?.error}`)
            else success += data.count
          }

          setCurrentFileProgress(100)
          otbUploaded = true

          // 집계 갱신 (한 번만)
          try {
            console.log('a02_refresh_otb_daily 호출:', { hotelId, otbDate: date })
            const { data: refreshData, error: refreshError } = await (supabase as any)
              .rpc('a02_refresh_otb_daily', { p_hotel_id: hotelId, p_update_date: date })
            console.log('a02_refresh_otb_daily 결과:', refreshData, 'error:', refreshError)
            if (refreshError) console.error('집계 갱신 오류:', refreshError)
            else console.log('집계 갱신 완료')
          } catch (e) {
            console.error('집계 갱신 예외:', e)
          }

          if (errs.length > 0) console.error('OTB INSERT 오류:', errs)

        } catch (e: any) {
          console.error('OTB DELETE/INSERT 오류:', e)
          setFileResults(prev => [...prev, {
            fileName: 'OTB 업로드',
            result: { type: 'error', errors: [e.message ?? 'DELETE/INSERT 오류'] },
          }])
        }
      }
    }

    if (otbUploaded) invalidateOtb()
    setUploading(false)
  }, [hotelId, activeTab, otbDate, queuedFiles, uploading, invalidateOtb])

  const switchTab = (t: TabType) => {
    if (uploading) return
    setActiveTab(t)
    setQueuedFiles([])
    setFileResults([])
    setUploadingFiles([])
  }

  const totalFiles      = uploadingFiles.length
  const overallProgress = totalFiles > 0
    ? Math.round((currentFileIdx / totalFiles) * 100 + currentFileProgress / totalFiles)
    : 0

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">

        {/* ── 헤더 ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              데이터 업로드
            </h1>
            <p className="text-sm text-brand-muted mt-0.5">Actual 및 OTB 데이터를 업로드합니다.</p>
          </div>
          {isSuperAdmin && (
            <button onClick={() => setShowBulk(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px shrink-0"
              style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
              <Upload size={14} />대용량 업로드
            </button>
          )}
        </div>

        {/* ── 탭 ── */}
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

        {/* ── 콘텐츠 카드 ── */}
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
                    <span className="flex-1 text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {entry.file.name}
                    </span>
                    <button onClick={() => removeFile(entry.id)}
                      className="text-brand-muted hover:text-brand-text transition-colors">
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

          {/* 전체 진행상황 */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 size={13} className="animate-spin shrink-0" style={{ color: 'var(--color-accent-primary)' }} />
                <span className="text-sm text-brand-muted">
                  파일 {currentFileIdx + 1}/{totalFiles} 처리 중...
                </span>
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
                <FileResultRow
                  key={entry.id}
                  fileName={entry.file.name}
                  result={fileResults[idx]?.result}
                  isProcessing={uploading && idx === currentFileIdx}
                  isPending={uploading && idx > currentFileIdx}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 대용량 업로드 모달 ── */}
      {showBulk && (
        <BulkModal
          hotelId={hotelId}
          onClose={() => setShowBulk(false)}
          onInvalidate={invalidateOtb}
        />
      )}
    </>
  )
}
