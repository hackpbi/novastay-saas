'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Upload, Download, Trash2,
  Search, RefreshCw, Loader2, X, Save,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'

// ── Types ─────────────────────────────────────────────────────────────────────

type TableKey =
  | 'c01_room_types'
  | 'c02_room_nos'
  | 'c03_market_codes'
  | 'c04_reservation_statuses'

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { key: TableKey; label: string }[] = [
  { key: 'c01_room_types',           label: '객실 타입' },
  { key: 'c02_room_nos',             label: '객실 번호' },
  { key: 'c03_market_codes',         label: '마켓 코드' },
  { key: 'c04_reservation_statuses', label: '예약 상태' },
]

const REQUIRED: Record<TableKey, string[]> = {
  c01_room_types:           ['room_type_code'],
  c02_room_nos:             ['room_no'],
  c03_market_codes:         ['market_code', 'segmentation'],
  c04_reservation_statuses: ['rsvn_status_code'],
}

const CONFLICT: Record<TableKey, string> = {
  c01_room_types:           'hotel_id,room_type_code',
  c02_room_nos:             'hotel_id,room_no',
  c03_market_codes:         'hotel_id,market_code',
  c04_reservation_statuses: 'hotel_id,rsvn_status_code',
}

const PRIMARY: Record<TableKey, string> = {
  c01_room_types:           'room_type_code',
  c02_room_nos:             'room_no',
  c03_market_codes:         'market_code',
  c04_reservation_statuses: 'rsvn_status_code',
}

const DEFAULT_FORM: Record<TableKey, Record<string, any>> = {
  c01_room_types: {
    room_type_code: '', room_type_description: '', no_rooms: '',
    surcharge: '', level: '', pax: '', reclean: '', clean: '', is_active: true,
  },
  c02_room_nos: {
    room_no: '', room_type_code: '', building: '', floor: '', is_active: true,
  },
  c03_market_codes: {
    market_code: '', segmentation: '', market_code_description: '',
    sorting1: '', sorting2: '', sorting3: '', sorting4: '', sorting5: '', is_active: true,
  },
  c04_reservation_statuses: {
    rsvn_status_code: '', rsvn_status_description: '', color: '#00D48A',
    sorting1: '', sorting2: '', sorting3: '', sorting4: '', sorting5: '', sorting6: '', is_active: true,
  },
}

const TEMPLATES: Record<TableKey, { filename: string; headers: string[]; sample: (string | number)[][] }> = {
  c01_room_types: {
    filename: 'room_types_template.xlsx',
    headers:  ['room_type_code', 'room_type_description', 'no_rooms', 'surcharge', 'level', 'pax', 'reclean', 'clean'],
    sample:   [['DLX', 'Deluxe Room', 50, 0, 'Deluxe', 2, 30, 20]],
  },
  c02_room_nos: {
    filename: 'room_nos_template.xlsx',
    headers:  ['room_no', 'room_type_code', 'building', 'floor'],
    sample:   [['101', 'DLX', '본관', 1]],
  },
  c03_market_codes: {
    filename: 'market_codes_template.xlsx',
    headers:  ['market_code', 'segmentation', 'market_code_description', 'sorting1', 'sorting2', 'sorting3', 'sorting4', 'sorting5'],
    sample:   [['FIT', 'Transient', 'Free Individual Traveler', '', '', '', '', '']],
  },
  c04_reservation_statuses: {
    filename: 'reservation_statuses_template.xlsx',
    headers:  ['rsvn_status_code', 'rsvn_status_description', 'color', 'sorting1', 'sorting2', 'sorting3', 'sorting4', 'sorting5', 'sorting6'],
    sample:   [['RES', 'Reserved', '#00D48A', '', '', '', '', '', '']],
  },
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const inputCls   = 'w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 focus:outline-none transition-all'
const inputStyle = { color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }

const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.border    = '1px solid var(--color-accent-primary)'
  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
}
const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.border    = '1px solid var(--color-border-default)'
  e.currentTarget.style.boxShadow = 'none'
}

// ── Small components ──────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)}
      className="relative rounded-full overflow-hidden cursor-pointer"
      style={{ width: 40, height: 20, background: value ? 'var(--color-accent-primary)' : 'var(--color-border-default)' }}>
      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
        style={{ transform: value ? 'translateX(22px)' : 'translateX(2px)' }} />
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-brand-muted mb-1.5">
        {label}{required && <span className="ml-0.5 text-status-negative">*</span>}
      </label>
      {children}
    </div>
  )
}

function ActiveBadge({ v }: { v: boolean }) {
  return v ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)', color: 'var(--color-accent-primary)' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" />활성
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-brand-dimmed"
      style={{ border: '1px solid var(--color-border-default)' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-brand-dimmed" />비활성
    </span>
  )
}

// ── Excel template download ────────────────────────────────────────────────────

function downloadTemplate(tableKey: TableKey) {
  const t  = TEMPLATES[tableKey]
  const ws = XLSX.utils.aoa_to_sheet([t.headers, ...t.sample])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, t.filename)
}

// ── Table column configs ──────────────────────────────────────────────────────

type Col = { key: string; label: string; render?: (row: any) => React.ReactNode }

const COLUMNS: Record<TableKey, Col[]> = {
  c01_room_types: [
    { key: 'room_type_code',        label: '타입코드' },
    { key: 'room_type_description', label: '설명' },
    { key: 'no_rooms',              label: '객실수' },
    { key: 'pax',                   label: '인원' },
    { key: 'level',                 label: '등급' },
    { key: 'is_active', label: '활성', render: row => <ActiveBadge v={row.is_active} /> },
  ],
  c02_room_nos: [
    { key: 'room_no',        label: '객실번호' },
    { key: 'room_type_code', label: '타입코드' },
    { key: 'building',       label: '건물' },
    { key: 'floor',          label: '층' },
    { key: 'is_active', label: '활성', render: row => <ActiveBadge v={row.is_active} /> },
  ],
  c03_market_codes: [
    { key: 'market_code',             label: '마켓코드' },
    { key: 'segmentation',            label: '세그멘테이션' },
    { key: 'market_code_description', label: '설명' },
    { key: 'sorting1',                label: '분류1' },
    { key: 'sorting2',                label: '분류2' },
    { key: 'sorting3',                label: '분류3' },
    { key: 'sorting4',                label: '분류4' },
    { key: 'sorting5',                label: '분류5' },
    { key: 'is_active', label: '활성', render: row => <ActiveBadge v={row.is_active} /> },
  ],
  c04_reservation_statuses: [
    { key: 'rsvn_status_code',        label: '상태코드' },
    { key: 'rsvn_status_description', label: '설명' },
    {
      key: 'color', label: '색상',
      render: row => (
        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
          style={{
            background: row.color ? `${row.color}20` : 'var(--color-bg-tertiary)',
            border:     `1px solid ${row.color ?? 'var(--color-border-default)'}`,
          }}>
          <span className="w-2 h-2 rounded-full" style={{ background: row.color ?? 'var(--color-border-default)' }} />
          {row.color ?? '-'}
        </span>
      ),
    },
    { key: 'is_active', label: '활성', render: row => <ActiveBadge v={row.is_active} /> },
  ],
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CodeManagementPage() {
  const router = useRouter()
  const { currentHotel } = useHotel()
  const [activeTab,     setActiveTab]     = useState<TableKey>('c01_room_types')
  const [rows,          setRows]          = useState<any[]>([])
  const [loading,       setLoading]       = useState(false)
  const [searchQ,       setSearchQ]       = useState('')
  const [selected,      setSelected]      = useState<Set<string>>(new Set())
  const [showModal,     setShowModal]     = useState(false)
  const [editItem,      setEditItem]      = useState<any | null>(null)
  const [formData,      setFormData]      = useState<Record<string, any>>({})
  const [formError,     setFormError]     = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [deleteTarget,  setDeleteTarget]  = useState<string | null>(null)
  const [showBulkDel,   setShowBulkDel]  = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [uploadErrors,  setUploadErrors]  = useState<string[]>([])
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [uploading,     setUploading]     = useState(false)
  const [roomTypeCodes, setRoomTypeCodes] = useState<string[]>([])
  const uploadRef = useRef<HTMLInputElement>(null)

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!currentHotel) return
    setLoading(true)
    const { data } = await (supabase as any)
      .from(activeTab)
      .select('*')
      .eq('hotel_id', currentHotel.id)
      .order(PRIMARY[activeTab])
    setRows(data ?? [])
    setLoading(false)
  }, [activeTab, currentHotel])

  useEffect(() => {
    setSelected(new Set())
    setSearchQ('')
    setUploadErrors([])
    setUploadSuccess(null)
    fetchData()
  }, [fetchData])

  // c02 용 room_type_code 목록 로드
  useEffect(() => {
    if (activeTab !== 'c02_room_nos' || !currentHotel) return
    ;(supabase as any)
      .from('c01_room_types')
      .select('room_type_code')
      .eq('hotel_id', currentHotel.id)
      .eq('is_active', true)
      .order('room_type_code')
      .then(({ data }: any) =>
        setRoomTypeCodes((data ?? []).map((r: any) => r.room_type_code as string))
      )
  }, [activeTab, currentHotel])


  // ── Filtered rows ───────────────────────────────────────────────────────────

  const filteredRows = rows.filter(row => {
    if (!searchQ) return true
    const pk = PRIMARY[activeTab]
    return row[pk]?.toString().toLowerCase().includes(searchQ.toLowerCase())
  })

  // ── Modal helpers ───────────────────────────────────────────────────────────

  function openAdd() {
    setEditItem(null)
    setFormData({ ...DEFAULT_FORM[activeTab] })
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(item: any) {
    setEditItem(item)
    const def = DEFAULT_FORM[activeTab]
    const data: Record<string, any> = {}
    Object.keys(def).forEach(k => { data[k] = item[k] ?? def[k] })
    setFormData(data)
    setFormError(null)
    setShowModal(true)
  }

  const setF = (key: string, value: any) =>
    setFormData(prev => ({ ...prev, [key]: value }))

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    for (const f of REQUIRED[activeTab]) {
      if (!formData[f]?.toString().trim()) {
        setFormError(`${f} 은(는) 필수 항목입니다.`)
        return
      }
    }

    setSaving(true)
    setFormError(null)
    const data: Record<string, any> = { ...formData }

    if (activeTab === 'c01_room_types') {
      ;['no_rooms', 'surcharge', 'pax', 'reclean', 'clean'].forEach(k => {
        data[k] = data[k] !== '' && data[k] !== null ? Number(data[k]) : null
      })
    }
    if (activeTab === 'c02_room_nos') {
      data.floor = data.floor !== '' && data.floor !== null ? Number(data.floor) : null
    }
    try {
      if (editItem) {
        const { error } = await (supabase as any).from(activeTab).update(data).eq('id', editItem.id)
        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from(activeTab)
          .insert({ ...data, hotel_id: currentHotel!.id })
        if (error) throw error
      }
      setShowModal(false)
      fetchData()
    } catch (e: any) {
      setFormError(e.message ?? '오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeleting(true)
    await (supabase as any).from(activeTab).delete().eq('id', id)
    setDeleteTarget(null)
    setDeleting(false)
    fetchData()
  }

  async function handleBulkDelete() {
    setDeleting(true)
    await (supabase as any).from(activeTab).delete().in('id', Array.from(selected))
    setSelected(new Set())
    setShowBulkDel(false)
    setDeleting(false)
    fetchData()
  }

  // ── Checkbox ────────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(
      selected.size === filteredRows.length
        ? new Set()
        : new Set(filteredRows.map((r: any) => r.id))
    )
  }

  // ── Excel upload ────────────────────────────────────────────────────────────

  function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !currentHotel) return
    setUploadErrors([])
    setUploadSuccess(null)
    setUploading(true)

    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const data     = new Uint8Array(ev.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet    = workbook.Sheets[workbook.SheetNames[0]]
        const rowsData = XLSX.utils.sheet_to_json(sheet) as Record<string, any>[]

        const errors: string[] = []
        rowsData.forEach((row, i) => {
          REQUIRED[activeTab].forEach(field => {
            if (!row[field]) errors.push(`${i + 2}행: ${field} 누락`)
          })
        })

        if (errors.length > 0) { setUploadErrors(errors); return }

        const insertData = rowsData.map(row => ({
          ...row, hotel_id: currentHotel.id, is_active: true,
        }))

        const { error } = await (supabase as any)
          .from(activeTab)
          .upsert(insertData, { onConflict: CONFLICT[activeTab] })

        if (error) {
          setUploadErrors([error.message])
        } else {
          setUploadSuccess(`${rowsData.length}건 업로드 완료`)
          fetchData()
        }
      } finally {
        setUploading(false)
        if (uploadRef.current) uploadRef.current.value = ''
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const cols       = COLUMNS[activeTab]
  const allChecked = filteredRows.length > 0 && selected.size === filteredRows.length

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.push('/settings')}
          className="mt-1 p-2 rounded-lg text-brand-muted hover:text-brand-text transition-colors"
          style={{ border: '1px solid var(--color-border-default)' }}>
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            코드 관리
          </h1>
          <p className="text-sm text-brand-muted mt-0.5">호텔 코드 테이블을 관리합니다.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className="px-5 py-3 text-sm font-medium transition-colors"
            style={
              activeTab === tab.key
                ? { color: 'var(--color-accent-primary)', borderBottom: '2px solid var(--color-accent-primary)', marginBottom: -1 }
                : { color: 'var(--color-text-muted)',    borderBottom: '2px solid transparent',                marginBottom: -1 }
            }>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Upload result */}
      {uploadSuccess && (
        <div className="px-4 py-3 rounded-lg text-sm"
          style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)', color: 'var(--color-accent-primary)' }}>
          ✓ {uploadSuccess}
        </div>
      )}
      {uploadErrors.length > 0 && (
        <div className="px-4 py-3 rounded-lg space-y-1"
          style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
          <p className="text-sm font-medium text-status-negative">업로드 오류</p>
          {uploadErrors.map((err, i) => (
            <p key={i} className="text-xs text-status-negative">{err}</p>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="코드 검색..."
            className={`${inputCls} pl-9 w-56`}
            style={inputStyle}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {selected.size > 0 && (
            <button onClick={() => setShowBulkDel(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)', color: '#FC8181' }}>
              <Trash2 size={13} />선택 삭제 ({selected.size})
            </button>
          )}
          <button onClick={fetchData}
            className="p-2 rounded-lg text-brand-muted hover:text-brand-text transition-colors"
            style={{ border: '1px solid var(--color-border-default)' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => downloadTemplate(activeTab)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border hover:opacity-80 transition-opacity"
            style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
            <Download size={13} />양식 다운로드
          </button>
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border hover:opacity-80 transition-opacity cursor-pointer"
            style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            엑셀 업로드
            <input ref={uploadRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUploadChange} />
          </label>
          <button onClick={openAdd}
            className="flex items-center gap-1.5 rounded-full py-2 px-4 text-sm font-semibold hover:-translate-y-0.5 transition-all"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
            <Plus size={13} />추가
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border-default)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
              <th className="px-4 py-3 w-8">
                <input type="checkbox" checked={allChecked} onChange={toggleAll}
                  className="rounded cursor-pointer" style={{ accentColor: 'var(--color-accent-primary)' }} />
              </th>
              {cols.map(c => (
                <th key={c.key} className="px-4 py-3 text-left text-[11px] font-semibold text-brand-muted uppercase tracking-wider">
                  {c.label}
                </th>
              ))}
              <th className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={cols.length + 2} className="px-4 py-12 text-center">
                <div className="flex items-center justify-center gap-2 text-brand-muted">
                  <RefreshCw size={14} className="animate-spin" /><span className="text-sm">불러오는 중...</span>
                </div>
              </td></tr>
            ) : filteredRows.length === 0 ? (
              <tr><td colSpan={cols.length + 2} className="px-4 py-12 text-center">
                <p className="text-sm text-brand-muted">데이터가 없습니다. 추가 버튼을 눌러 시작하세요.</p>
              </td></tr>
            ) : filteredRows.map((row: any) => (
              <tr key={row.id} onClick={() => openEdit(row)}
                className="cursor-pointer transition-colors"
                style={{ borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg-surface)')}>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)}
                    className="rounded cursor-pointer" style={{ accentColor: 'var(--color-accent-primary)' }} />
                </td>
                {cols.map(c => (
                  <td key={c.key} className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>
                    {c.render ? c.render(row) : (row[c.key] ?? '-')}
                  </td>
                ))}
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setDeleteTarget(row.id)}
                    className="p-1.5 rounded-lg text-brand-dimmed transition-all"
                    style={{ border: '1px solid transparent' }}
                    onMouseEnter={e => {
                      e.currentTarget.style.border     = '1px solid var(--negative-border)'
                      e.currentTarget.style.background = 'var(--negative-bg)'
                      e.currentTarget.style.color      = '#FC8181'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.border     = '1px solid transparent'
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color      = ''
                    }}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-bg-secondary overflow-hidden max-h-[90vh] flex flex-col"
            style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>

            <div className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderBottom: '1px solid var(--color-border-default)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {editItem ? '수정' : '추가'} — {TABS.find(t => t.key === activeTab)?.label}
              </p>
              <button onClick={() => setShowModal(false)} className="text-brand-muted hover:text-brand-text transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-4">
              {formError && (
                <div className="px-3 py-2 rounded-lg text-xs text-status-negative"
                  style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
                  {formError}
                </div>
              )}

              {/* ── c01: 객실 타입 ── */}
              {activeTab === 'c01_room_types' && (<>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="타입코드" required>
                    <input value={formData.room_type_code} onChange={e => setF('room_type_code', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                  <Field label="등급">
                    <input value={formData.level ?? ''} onChange={e => setF('level', e.target.value)}
                      placeholder="DLX, SUT, STD..." className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                </div>
                <Field label="설명">
                  <input value={formData.room_type_description ?? ''} onChange={e => setF('room_type_description', e.target.value)}
                    className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </Field>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="객실수">
                    <input type="number" value={formData.no_rooms ?? ''} onChange={e => setF('no_rooms', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                  <Field label="인원(PAX)">
                    <input type="number" value={formData.pax ?? ''} onChange={e => setF('pax', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                  <Field label="추가요금">
                    <input type="number" value={formData.surcharge ?? ''} onChange={e => setF('surcharge', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Reclean">
                    <input type="number" step="0.1" value={formData.reclean ?? ''} onChange={e => setF('reclean', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                  <Field label="Clean">
                    <input type="number" step="0.1" value={formData.clean ?? ''} onChange={e => setF('clean', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                </div>
                <div className="flex items-center gap-3">
                  <Toggle value={formData.is_active} onChange={v => setF('is_active', v)} />
                  <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {formData.is_active ? '활성' : '비활성'}
                  </span>
                </div>
              </>)}

              {/* ── c02: 객실 번호 ── */}
              {activeTab === 'c02_room_nos' && (<>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="객실번호" required>
                    <input value={formData.room_no} onChange={e => setF('room_no', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                  <Field label="타입코드">
                    <select value={formData.room_type_code ?? ''} onChange={e => setF('room_type_code', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                      <option value="">선택</option>
                      {roomTypeCodes.map(code => <option key={code} value={code}>{code}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="건물">
                    <input value={formData.building ?? ''} onChange={e => setF('building', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                  <Field label="층">
                    <input type="number" value={formData.floor ?? ''} onChange={e => setF('floor', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                </div>
                <div className="flex items-center gap-3">
                  <Toggle value={formData.is_active} onChange={v => setF('is_active', v)} />
                  <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {formData.is_active ? '활성' : '비활성'}
                  </span>
                </div>
              </>)}

              {/* ── c03: 마켓 코드 ── */}
              {activeTab === 'c03_market_codes' && (<>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="마켓코드" required>
                    <input value={formData.market_code} onChange={e => setF('market_code', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                  <Field label="세그멘테이션" required>
                    <input value={formData.segmentation} onChange={e => setF('segmentation', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                </div>
                <Field label="설명">
                  <input value={formData.market_code_description ?? ''} onChange={e => setF('market_code_description', e.target.value)}
                    className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  {[1,2,3,4,5].map(n => (
                    <Field key={n} label={`분류${n}`}>
                      <input value={formData[`sorting${n}`] ?? ''} onChange={e => setF(`sorting${n}`, e.target.value)}
                        className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                    </Field>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Toggle value={formData.is_active} onChange={v => setF('is_active', v)} />
                  <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {formData.is_active ? '활성' : '비활성'}
                  </span>
                </div>
              </>)}

              {/* ── c04: 예약 상태 ── */}
              {activeTab === 'c04_reservation_statuses' && (<>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="상태코드" required>
                    <input value={formData.rsvn_status_code} onChange={e => setF('rsvn_status_code', e.target.value)}
                      className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                  <Field label="색상">
                    <div className="flex items-center gap-2">
                      <input type="color" value={formData.color ?? '#00D48A'} onChange={e => setF('color', e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer p-0.5"
                        style={{ border: '1px solid var(--color-border-default)', background: 'transparent' }} />
                      <input value={formData.color ?? ''} onChange={e => setF('color', e.target.value)}
                        placeholder="#00D48A" className={`${inputCls} flex-1`} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                    </div>
                  </Field>
                </div>
                <Field label="설명">
                  <input value={formData.rsvn_status_description ?? ''} onChange={e => setF('rsvn_status_description', e.target.value)}
                    className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  {[1,2,3,4,5,6].map(n => (
                    <Field key={n} label={`분류${n}`}>
                      <input value={formData[`sorting${n}`] ?? ''} onChange={e => setF(`sorting${n}`, e.target.value)}
                        className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                    </Field>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Toggle value={formData.is_active} onChange={v => setF('is_active', v)} />
                  <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {formData.is_active ? '활성' : '비활성'}
                  </span>
                </div>
              </>)}
            </div>

            <div className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderTop: '1px solid var(--color-border-default)' }}>
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-brand-muted hover:text-brand-text transition-colors"
                style={{ border: '1px solid var(--color-border-default)' }}>
                취소
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 transition-all"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Single delete confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-bg-secondary overflow-hidden text-center"
            style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
            <div className="px-6 pt-6 pb-5">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
                <Trash2 size={20} className="text-status-negative" />
              </div>
              <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                삭제하시겠습니까?
              </h3>
              <p className="text-sm text-brand-muted">이 항목을 삭제합니다. 복구할 수 없습니다.</p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-brand-muted hover:text-brand-text transition-colors"
                style={{ border: '1px solid var(--color-border-default)' }}>취소</button>
              <button onClick={() => handleDelete(deleteTarget)} disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)', color: '#FC8181' }}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk delete confirm ── */}
      {showBulkDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowBulkDel(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-bg-secondary overflow-hidden text-center"
            style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
            <div className="px-6 pt-6 pb-5">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
                <Trash2 size={20} className="text-status-negative" />
              </div>
              <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                {selected.size}건을 삭제하시겠습니까?
              </h3>
              <p className="text-sm text-brand-muted">선택한 항목을 모두 삭제합니다. 복구할 수 없습니다.</p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowBulkDel(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-brand-muted hover:text-brand-text transition-colors"
                style={{ border: '1px solid var(--color-border-default)' }}>취소</button>
              <button onClick={handleBulkDelete} disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)', color: '#FC8181' }}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
