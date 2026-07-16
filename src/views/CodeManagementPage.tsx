'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Upload, Download, Trash2,
  Search, RefreshCw, Loader2, X, Save, AlertTriangle,
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

// 탭별 검색 드롭다운 대상 컬럼
const SEARCH_COLUMNS: Record<TableKey, string[]> = {
  c01_room_types:           ['room_type_code', 'room_type_description'],
  c02_room_nos:             ['room_no', 'room_type_code'],
  c03_market_codes:         ['market_code', 'segmentation', 'market_code_description'],
  c04_reservation_statuses: ['rsvn_status_code', 'rsvn_status_description'],
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

function PackageBadge({ v }: { v: boolean }) {
  return v ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)', color: 'var(--color-accent-primary)' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" />패키지
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-brand-dimmed"
      style={{ border: '1px solid var(--color-border-default)' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-brand-dimmed" />미사용
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
    { key: 'use_package', label: '패키지', render: row => <PackageBadge v={row.use_package} /> },
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

// ── 유사 어카운트 이름 비교 (외부 라이브러리 없이 직접 구현) ──────────────────────
function normAccName(s: any): string {
  return String(s ?? '')
    .replace(/\s+/g, '')                        // 공백 제거
    .replace(/㈜/g, '')                         // ㈜
    .replace(/\(\s*주\s*\)|\(\s*구\s*\)/g, '')   // (주) (구)
    .replace(/[()\-·.,'"]/g, '')                // 특수문자
    .toLowerCase()
}
function levDist(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, (_, i) => i)
  for (let j = 1; j <= n; j++) {
    let prev = dp[0]
    dp[0] = j
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i]
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[m]
}
function isSimilarName(na: string, nb: string): boolean {
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const maxLen = Math.max(na.length, nb.length)
  return levDist(na, nb) <= maxLen * 0.2
}

// ── 어카운트 관리 탭 (c10_account_aliases) — 인라인 편집 ──────────────────────────

function AccountAliasTab({ hotelId }: { hotelId: string }) {
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)   // 검색 드롭다운
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())   // 멀티 선택 → 해당 항목만 표시
  const searchBoxRef = useRef<HTMLDivElement | null>(null)
  const [editId,  setEditId]  = useState<string | null>(null)   // '__new__' = 추가 행
  const [buf,     setBuf]     = useState<{ account_no: string; original_name: string; display_name: string }>(
    { account_no: '', original_name: '', display_name: '' }
  )
  const rowRef    = useRef<HTMLTableRowElement | null>(null)
  const savingRef = useRef(false)
  // 미등록 어카운트 감지
  const [unregLoading, setUnregLoading] = useState(false)
  const [unregRows,    setUnregRows]    = useState<any[]>([])
  const [unregOpen,    setUnregOpen]    = useState(false)
  const [toast,        setToast]        = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 유사 어카운트 찾기
  const [simLoading, setSimLoading] = useState(false)
  const [simPairs,   setSimPairs]   = useState<{ a: any; b: any }[]>([])
  const [simOpen,    setSimOpen]    = useState(false)
  // 검색 실행 여부 (초기 진입 시 빈 테이블)
  const [searched, setSearched] = useState(false)
  // 일괄 저장: 기존 행 인라인 편집 변경분 누적 (id → 필드)
  const [edited, setEdited] = useState<Record<string, { account_no: string; original_name: string; display_name: string }>>({})
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  // 정렬 (기본: PMS 원본명 오름차순)
  const [sortKey, setSortKey] = useState<'account_no' | 'original_name' | 'display_name' | 'is_active'>('original_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  // 셀 인라인 편집 (contenteditable — 가로폭 유지)
  const [cellEdit,   setCellEdit]   = useState<{ id: string; field: 'account_no' | 'original_name' | 'display_name' } | null>(null)
  const cellRef     = useRef<HTMLSpanElement | null>(null)
  const cellInitRef = useRef<string>('')

  const fetchRows = useCallback(async () => {
    if (!hotelId) return
    setLoading(true)
    const { data } = await (supabase as any)
      .from('c10_account_aliases')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('original_name', { ascending: true })
    setRows(data ?? [])
    setEdited({})            // 새 조회 시 미저장 변경분 초기화
    setSelectedIds(new Set()) // 선택 필터 초기화 → 전체 목록
    setDropdownOpen(false)
    setSearched(true)
    setLoading(false)
  }, [hotelId])

  // ⚠️ 자동 fetch 제거 — "검색" 버튼 클릭 시에만 조회

  // 편집 변경분 반영된 표시용 행
  const merged = rows.map(r => (edited[r.id] ? { ...r, ...edited[r.id], __dirty: true } : r))

  // 테이블: 선택 항목들만 표시 (없으면 전체)
  const filtered = selectedIds.size > 0 ? merged.filter(r => selectedIds.has(r.id)) : merged
  const toggleSuggestion = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // 검색 드롭다운 제안 (original_name / display_name / account_no 포함, 대소문자 무시, 최대 10건)
  const suggestions = searchQ
    ? merged.filter(r => {
        const q = searchQ.toLowerCase()
        return (r.original_name ?? '').toLowerCase().includes(q)
          || (r.display_name ?? '').toLowerCase().includes(q)
          || String(r.account_no ?? '').toLowerCase().includes(q)
      }).slice(0, 10)
    : []

  const sorted = [...filtered].sort((a, b) => {
    const cmp = sortKey === 'is_active'
      ? (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0)
      : String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), 'ko')
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortIcon = (key: typeof sortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  function startAdd() {
    setEditId('__new__')
    setBuf({ account_no: '', original_name: '', display_name: '' })
  }
  function cancelEdit() {
    savingRef.current = false
    setEditId(null)
  }
  async function saveEdit() {
    if (savingRef.current || editId == null) return
    // original_name / display_name 필수 — 없으면 저장 불가 (편집 종료)
    if (!buf.original_name.trim() || !buf.display_name.trim()) { cancelEdit(); return }
    savingRef.current = true
    try {
      if (editId === '__new__') {
        // 신규는 즉시 INSERT (일괄 저장 대상은 기존 행 UPDATE)
        const { data } = await (supabase as any).from('c10_account_aliases').insert({
          hotel_id:      hotelId,
          account_no:    buf.account_no.trim() || null,
          original_name: buf.original_name.trim(),
          display_name:  buf.display_name.trim(),
          is_active:     true,
        }).select().single()
        if (data) setRows(prev => [data, ...prev])   // 재조회 없이 로컬 반영 (미저장 편집 보존)
        setSearched(true)
        // 방금 등록한 항목을 미등록 배너에서 제거
        setUnregRows(prev => prev.filter(u => String(u.account_no ?? '') !== buf.account_no.trim()))
      } else {
        // 기존 행: 변경분 누적 (즉시 저장 X → "저장" 버튼으로 일괄 UPDATE)
        const id = editId
        const next = { account_no: buf.account_no.trim(), original_name: buf.original_name.trim(), display_name: buf.display_name.trim() }
        setEdited(prev => ({ ...prev, [id]: next }))
      }
    } finally {
      setEditId(null)
      savingRef.current = false
    }
  }
  async function toggleActive(r: any) {
    // 즉시 UPDATE + 로컬 반영 (재조회 X → 미저장 편집 보존)
    await (supabase as any).from('c10_account_aliases').update({ is_active: !r.is_active }).eq('id', r.id)
    setRows(prev => prev.map(x => (x.id === r.id ? { ...x, is_active: !r.is_active } : x)))
  }
  async function del(id: string) {
    await (supabase as any).from('c10_account_aliases').delete().eq('id', id)
    setRows(prev => prev.filter(x => x.id !== id))
    setEdited(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  // 일괄 저장 (누적된 기존 행 변경분 UPDATE)
  const editedIds = Object.keys(edited)
  async function saveAll() {
    if (editedIds.length === 0 || saving) return
    setSaving(true)
    try {
      for (const id of editedIds) {
        const e = edited[id]
        await (supabase as any).from('c10_account_aliases').update({
          account_no:    e.account_no.trim() || null,
          original_name: e.original_name.trim(),
          display_name:  e.display_name.trim(),
        }).eq('id', id)
      }
    } finally {
      setShowSaveConfirm(false)
      setSaving(false)
      fetchRows()   // 저장 후 변경 내역 초기화 + 새로고침
    }
  }

  // ── 셀 contenteditable 편집 ──
  function startCellEdit(id: string, field: 'account_no' | 'original_name' | 'display_name', val: string) {
    if (cellEdit?.id === id && cellEdit?.field === field) return
    cellInitRef.current = val ?? ''
    setCellEdit({ id, field })
  }
  function revertCellEdit() { setCellEdit(null) }
  function saveCellEdit() {
    if (!cellEdit || !cellRef.current) return
    const val = (cellRef.current.textContent ?? '').trim()
    const { id, field } = cellEdit
    // 필수(원본명/표시명) 비면 저장 불가 → 되돌림
    if ((field === 'original_name' || field === 'display_name') && !val) { setCellEdit(null); return }
    const row = merged.find(x => x.id === id)
    if (row) {
      const base: Record<string, string> = {
        account_no:    row.account_no ?? '',
        original_name: row.original_name ?? '',
        display_name:  row.display_name ?? '',
      }
      base[field] = val
      setEdited(prev => ({ ...prev, [id]: base as { account_no: string; original_name: string; display_name: string } }))
    }
    setCellEdit(null)
  }
  function handleCellKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); saveCellEdit() }
    if (e.key === 'Escape') { e.preventDefault(); revertCellEdit() }
  }

  // 셀 렌더 (편집 중이면 contenteditable + ✓/↩, 아니면 텍스트)
  const renderCell = (r: any, field: 'account_no' | 'original_name' | 'display_name') => {
    const editing = cellEdit?.id === r.id && cellEdit?.field === field
    if (!editing) return <span>{r[field] ?? '-'}</span>
    const btn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }
    return (
      <span className="inline-flex items-center gap-2">
        <span
          ref={cellRef}
          contentEditable
          suppressContentEditableWarning
          onKeyDown={handleCellKeyDown}
          onClick={e => e.stopPropagation()}
          style={{ borderBottom: '1.5px solid #00E5A0', outline: 'none', minWidth: 20, display: 'inline-block', color: 'var(--color-text-primary)' }}
        />
        <button title="저장"      onMouseDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); saveCellEdit() }}   style={{ ...btn, color: '#00E5A0' }}>✓</button>
        <button title="되돌리기"  onMouseDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); revertCellEdit() }} style={{ ...btn, color: 'var(--color-text-muted)' }}>↩</button>
      </span>
    )
  }

  // 토스트 (경량, 2.5초 자동 소멸)
  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // 검색 드롭다운 — input 바깥 클릭 시 닫힘
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // 셀 편집 진입 시 텍스트 세팅 + 포커스 + 커서 끝으로
  useEffect(() => {
    if (cellEdit && cellRef.current) {
      cellRef.current.textContent = cellInitRef.current
      cellRef.current.focus()
      const range = document.createRange()
      range.selectNodeContents(cellRef.current); range.collapse(false)
      const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range)
    }
  }, [cellEdit])

  // 미등록 어카운트 확인 (get_unregistered_accounts RPC)
  async function checkUnregistered() {
    if (!hotelId || unregLoading) return
    setUnregLoading(true)
    try {
      const { data } = await (supabase as any).rpc('get_unregistered_accounts', { p_hotel_id: hotelId })
      const list = (data ?? []) as any[]
      setUnregRows(list)
      if (list.length === 0) { setUnregOpen(false); showToast('미등록 어카운트 없음') }
      else setUnregOpen(true)
    } finally {
      setUnregLoading(false)
    }
  }

  // 미등록 항목 → 메인 목록 최상단 인라인 편집 행(값 자동 채움)
  function addFromUnreg(u: any) {
    setEditId('__new__')
    setBuf({
      account_no:    u.account_no != null ? String(u.account_no) : '',
      original_name: u.account_name ?? '',
      display_name:  u.account_name ?? '',
    })
  }

  // 유사 어카운트 쌍 찾기 (로드된 목록 대상, 전처리 후 비교)
  function findSimilar() {
    if (simLoading) return
    setSimLoading(true)
    setTimeout(() => {
      const norms = rows.map(r => ({ r, n: normAccName(r.original_name) }))
      const pairs: { a: any; b: any }[] = []
      for (let i = 0; i < norms.length; i++) {
        for (let j = i + 1; j < norms.length; j++) {
          if (isSimilarName(norms[i].n, norms[j].n)) pairs.push({ a: norms[i].r, b: norms[j].r })
        }
      }
      setSimPairs(pairs)
      setSimOpen(pairs.length > 0)
      if (pairs.length === 0) showToast('유사 어카운트 없음')
      setSimLoading(false)
    }, 0)
  }

  // 두 항목 display_name 을 원본명A 기준으로 통일 → 일괄 저장 state 누적 (즉시 저장 X)
  function unifyPair(a: any, b: any) {
    const target = a.original_name ?? ''
    setEdited(prev => {
      const next = { ...prev }
      for (const row of [a, b]) {
        const cur = merged.find(x => x.id === row.id) ?? row
        next[row.id] = {
          account_no:    cur.account_no ?? '',
          original_name: cur.original_name ?? '',
          display_name:  target,
        }
      }
      return next
    })
  }

  // 행 바깥으로 포커스 이동 시 저장 (같은 행 내 셀 이동은 유지)
  function handleRowBlur() {
    setTimeout(() => {
      if (rowRef.current && !rowRef.current.contains(document.activeElement)) saveEdit()
    }, 0)
  }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); saveEdit() }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
  }

  const editInput = (field: 'account_no' | 'original_name' | 'display_name', placeholder: string, focus?: boolean) => (
    <input
      autoFocus={focus}
      value={buf[field]}
      placeholder={placeholder}
      onChange={e => setBuf(prev => ({ ...prev, [field]: e.target.value }))}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      onBlur={e => { onBlur(e); handleRowBlur() }}
      onClick={e => e.stopPropagation()}
      className={inputCls}
      style={inputStyle}
    />
  )

  const editRowEl = (key: string) => (
    <tr key={key} ref={rowRef} style={{ borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-secondary)' }}>
      <td className="px-4 py-2">{editInput('account_no', '(선택)')}</td>
      <td className="px-4 py-2">{editInput('original_name', 'PMS 원본명', true)}</td>
      <td className="px-4 py-2">{editInput('display_name', '표시명')}</td>
      <td className="px-4 py-3" />
      <td className="px-4 py-3" />
    </tr>
  )

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative" ref={searchBoxRef}>
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
            <input
              value={searchQ}
              onChange={e => { const v = e.target.value; setSearchQ(v); setDropdownOpen(v.length > 0); if (v === '') setSelectedIds(new Set()) }}
              onFocus={e => { onFocus(e); if (searchQ) setDropdownOpen(true) }}
              onBlur={e => { onBlur(e); if (selectedIds.size > 0) e.currentTarget.style.border = '1px solid #00E5A0' }}
              placeholder="어카운트 검색..."
              className={`${inputCls} pl-9 w-56`}
              style={{ ...inputStyle, ...(selectedIds.size > 0 ? { border: '1px solid #00E5A0' } : {}) }}
            />
            {dropdownOpen && suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 9999, minWidth: 280, background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow-elevated)' }}>
                {suggestions.map(s => {
                  const on = selectedIds.has(s.id)
                  return (
                    <div key={s.id}
                      onClick={() => toggleSuggestion(s.id)}
                      className="px-3 py-2 cursor-pointer text-sm flex items-center gap-2"
                      style={{ color: '#ddd', whiteSpace: 'nowrap', background: on ? 'rgba(0,229,160,0.1)' : 'transparent' }}
                      onMouseEnter={e => { if (!on) e.currentTarget.style.background = '#252525' }}
                      onMouseLeave={e => { e.currentTarget.style.background = on ? 'rgba(0,229,160,0.1)' : 'transparent' }}>
                      <input type="checkbox" readOnly checked={on} className="rounded pointer-events-none" style={{ accentColor: '#00E5A0' }} />
                      <span style={{ color: '#888', minWidth: 70, fontSize: 12 }}>{s.account_no ?? '-'}</span>
                      <span>{s.original_name ?? '-'}</span>
                      <span style={{ color: '#666' }}>·</span>
                      <span style={{ color: '#00E5A0' }}>{s.display_name ?? '-'}</span>
                    </div>
                  )
                })}
                <div onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-2 text-xs cursor-pointer text-center"
                  style={{ color: '#888', borderTop: '1px solid #333' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#252525')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  선택 초기화
                </div>
              </div>
            )}
          </div>
          {selectedIds.size > 0 && (
            <span className="text-xs font-medium whitespace-nowrap" style={{ color: '#00E5A0' }}>{selectedIds.size}건 선택</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={fetchRows} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border hover:opacity-80 transition-opacity disabled:opacity-50"
            style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            검색
          </button>
          <button onClick={checkUnregistered} disabled={unregLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border hover:opacity-80 transition-opacity disabled:opacity-50"
            style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
            {unregLoading ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
            미등록 확인
          </button>
          <button onClick={findSimilar} disabled={simLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border hover:opacity-80 transition-opacity disabled:opacity-50"
            style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
            {simLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            유사 찾기
          </button>
          <button onClick={() => setShowSaveConfirm(true)} disabled={editedIds.length === 0}
            className="flex items-center gap-1.5 rounded-full py-2 px-4 text-sm font-semibold transition-all"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)', opacity: editedIds.length === 0 ? 0.4 : 1, cursor: editedIds.length === 0 ? 'default' : 'pointer' }}>
            <Save size={13} />저장{editedIds.length > 0 ? ` (${editedIds.length})` : ''}
          </button>
          <button onClick={startAdd}
            className="flex items-center gap-1.5 rounded-full py-2 px-4 text-sm font-semibold hover:-translate-y-0.5 transition-all"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
            <Plus size={13} />추가
          </button>
        </div>
      </div>

      {/* 미등록 어카운트 배너 */}
      {unregRows.length > 0 && (
        <div style={{ borderRadius: 12, border: '1px solid rgba(245,158,11,0.3)', overflow: 'hidden' }}>
          <div onClick={() => setUnregOpen(o => !o)}
            className="flex items-center justify-between px-4 py-3 cursor-pointer"
            style={{ background: 'rgba(245,158,11,0.10)' }}>
            <span className="text-sm font-medium" style={{ color: '#F59E0B' }}>⚠️ 미등록 어카운트 {unregRows.length}건</span>
            <span style={{ color: '#F59E0B', fontSize: 12 }}>{unregOpen ? '접기 ▲' : '펼치기 ▼'}</span>
          </div>
          {unregOpen && (
            <div style={{ borderTop: '1px solid rgba(245,158,11,0.2)', background: 'var(--color-bg-surface)' }}>
              {unregRows.map((u, i) => (
                <div key={`${u.account_no ?? ''}-${i}`}
                  className="flex items-center justify-between px-4 py-2"
                  style={{ borderBottom: i < unregRows.length - 1 ? '1px solid var(--color-border-subtle)' : 'none' }}>
                  <div className="flex items-center gap-3 text-sm">
                    <span style={{ color: 'var(--color-text-muted)', minWidth: 90 }}>{u.account_no ?? '-'}</span>
                    <span style={{ color: 'var(--color-text-primary)' }}>{u.account_name ?? '-'}</span>
                  </div>
                  <button onClick={() => addFromUnreg(u)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border hover:opacity-80 transition-opacity"
                    style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#F59E0B' }}>
                    <Plus size={12} />추가
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 유사 어카운트 배너 */}
      {simPairs.length > 0 && (
        <div style={{ borderRadius: 12, border: '1px solid rgba(245,158,11,0.3)', overflow: 'hidden' }}>
          <div onClick={() => setSimOpen(o => !o)}
            className="flex items-center justify-between px-4 py-3 cursor-pointer"
            style={{ background: 'rgba(245,158,11,0.10)' }}>
            <span className="text-sm font-medium" style={{ color: '#F59E0B' }}>🔍 유사 어카운트 {simPairs.length}쌍 발견</span>
            <span style={{ color: '#F59E0B', fontSize: 12 }}>{simOpen ? '접기 ▲' : '펼치기 ▼'}</span>
          </div>
          {simOpen && (
            <div style={{ borderTop: '1px solid rgba(245,158,11,0.2)', background: 'var(--color-bg-surface)' }}>
              {simPairs.map((p, i) => (
                <div key={`${p.a.id}-${p.b.id}-${i}`}
                  className="flex items-center justify-between px-4 py-2"
                  style={{ borderBottom: i < simPairs.length - 1 ? '1px solid var(--color-border-subtle)' : 'none' }}>
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    <span>{p.a.original_name ?? '-'}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>↔</span>
                    <span>{p.b.original_name ?? '-'}</span>
                  </div>
                  <button onClick={() => unifyPair(p.a, p.b)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border hover:opacity-80 transition-opacity"
                    style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#F59E0B' }}>
                    display_name 통일
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border-default)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
              {([
                { key: 'account_no',    label: 'Account No' },
                { key: 'original_name', label: 'PMS 원본명' },
                { key: 'display_name',  label: '표시명' },
                { key: 'is_active',     label: '활성' },
              ] as { key: typeof sortKey; label: string }[]).map(h => (
                <th key={h.key} onClick={() => toggleSort(h.key)}
                  className="px-4 py-3 text-left text-[11px] font-semibold text-brand-muted uppercase tracking-wider cursor-pointer select-none">
                  {h.label}{sortIcon(h.key)}
                </th>
              ))}
              <th className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody>
            {editId === '__new__' && editRowEl('__new__')}
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center">
                <div className="flex items-center justify-center gap-2 text-brand-muted">
                  <RefreshCw size={14} className="animate-spin" /><span className="text-sm">불러오는 중...</span>
                </div>
              </td></tr>
            ) : (!searched && editId !== '__new__') ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center">
                <p className="text-sm text-brand-muted">검색 버튼을 눌러 어카운트를 조회하세요.</p>
              </td></tr>
            ) : (sorted.length === 0 && editId !== '__new__') ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center">
                <p className="text-sm text-brand-muted">데이터가 없습니다. 추가 버튼을 눌러 시작하세요.</p>
              </td></tr>
            ) : sorted.map(r => {
              const baseBg = r.__dirty ? 'rgba(0,229,160,0.08)' : 'var(--color-bg-surface)'   // 변경 저장된 행 민트
              return (
                <tr key={r.id}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid var(--color-border-subtle)', background: baseBg }}
                  onMouseEnter={e => { if (!r.__dirty) e.currentTarget.style.background = 'var(--color-bg-secondary)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = baseBg }}>
                  <td className="px-4 py-3 cursor-text" style={{ color: 'var(--color-text-primary)' }}
                    onClick={() => startCellEdit(r.id, 'account_no', r.account_no ?? '')}>{renderCell(r, 'account_no')}</td>
                  <td className="px-4 py-3 cursor-text" style={{ color: 'var(--color-text-primary)' }}
                    onClick={() => startCellEdit(r.id, 'original_name', r.original_name ?? '')}>{renderCell(r, 'original_name')}</td>
                  <td className="px-4 py-3 cursor-text" style={{ color: 'var(--color-text-primary)' }}
                    onClick={() => startCellEdit(r.id, 'display_name', r.display_name ?? '')}>{renderCell(r, 'display_name')}</td>
                  <td className="px-4 py-3">
                    <span onClick={() => toggleActive(r)} className="inline-flex cursor-pointer"><ActiveBadge v={r.is_active} /></span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => del(r.id)}
                      className="p-1.5 rounded-lg text-brand-dimmed transition-all"
                      style={{ border: '1px solid transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.border = '1px solid var(--negative-border)'; e.currentTarget.style.background = 'var(--negative-bg)'; e.currentTarget.style.color = '#FC8181' }}
                      onMouseLeave={e => { e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '' }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 저장 확인 모달 (변경 내역 일괄 UPDATE) */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { if (!saving) setShowSaveConfirm(false) }} />
          <div className="relative w-full max-w-md rounded-2xl bg-bg-secondary overflow-hidden max-h-[80vh] flex flex-col"
            style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
            <div className="px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>변경 내역 저장 ({editedIds.length}건)</p>
            </div>
            <div className="overflow-y-auto px-6 py-4 space-y-2">
              {editedIds.map(id => {
                const e = edited[id]
                return (
                  <div key={id} className="text-sm flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                    <span style={{ color: 'var(--color-text-muted)', minWidth: 80 }}>{e.account_no || '-'}</span>
                    <span>{e.original_name}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                    <span style={{ color: 'var(--color-accent-primary)' }}>{e.display_name}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--color-border-default)' }}>
              <button onClick={() => setShowSaveConfirm(false)} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm text-brand-muted hover:text-brand-text transition-colors disabled:opacity-60"
                style={{ border: '1px solid var(--color-border-default)' }}>취소</button>
              <button onClick={saveAll} disabled={saving}
                className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 transition-all"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', borderRadius: 10,
          padding: '10px 16px', fontSize: 13, color: 'var(--color-text-primary)', boxShadow: 'var(--shadow-elevated)',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CodeManagementPage() {
  const router = useRouter()
  const { currentHotel } = useHotel()
  const [activeTab,     setActiveTab]     = useState<TableKey>('c01_room_types')
  const [view,          setView]          = useState<'code' | 'account'>('code')   // 어카운트 관리 탭 분기
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
  // 검색 버튼 / 드롭다운 (멀티 선택)
  const [searched,     setSearched]     = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const searchBoxRef = useRef<HTMLDivElement | null>(null)

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
    setSelectedIds(new Set())
    setDropdownOpen(false)
    setSearched(true)
    setLoading(false)
  }, [activeTab, currentHotel])

  // 탭 변경 시 초기화 (자동 fetch 제거 — "검색" 버튼 클릭 시에만 조회)
  useEffect(() => {
    setSelected(new Set())
    setSearchQ('')
    setUploadErrors([])
    setUploadSuccess(null)
    setRows([])
    setSelectedIds(new Set())
    setDropdownOpen(false)
    setSearched(false)
  }, [activeTab, currentHotel])

  // 검색 드롭다운 — input 바깥 클릭 시 닫힘
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

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

  // 테이블: 선택 항목들만 표시 (없으면 전체)
  const filteredRows = selectedIds.size > 0 ? rows.filter(row => selectedIds.has(row.id)) : rows
  const toggleSuggestion = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // 검색 드롭다운 제안 (탭별 컬럼, 대소문자 무시, 최대 10건)
  const suggestions = searchQ
    ? rows.filter(row => {
        const q = searchQ.toLowerCase()
        return SEARCH_COLUMNS[activeTab].some(c => String(row[c] ?? '').toLowerCase().includes(q))
      }).slice(0, 10)
    : []

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

  // use_package badge 즉시 토글 (마켓 코드 탭)
  async function togglePackage(row: any) {
    await (supabase as any).from(activeTab).update({ use_package: !row.use_package }).eq('id', row.id)
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
        {[...TABS, { key: 'c10_account_aliases' as const, label: '어카운트 관리' }].map(tab => {
          const isAccount = tab.key === 'c10_account_aliases'
          const isActive  = isAccount ? view === 'account' : (view === 'code' && activeTab === tab.key)
          return (
            <button key={tab.key}
              onClick={() => { if (isAccount) setView('account'); else { setView('code'); setActiveTab(tab.key as TableKey) } }}
              className="px-5 py-3 text-sm font-medium transition-colors"
              style={
                isActive
                  ? { color: 'var(--color-accent-primary)', borderBottom: '2px solid var(--color-accent-primary)', marginBottom: -1 }
                  : { color: 'var(--color-text-muted)',    borderBottom: '2px solid transparent',                marginBottom: -1 }
              }>
              {tab.label}
            </button>
          )
        })}
      </div>

      {view === 'account' ? (
        <AccountAliasTab hotelId={currentHotel?.id ?? ''} />
      ) : (
      <>
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
        <div className="flex items-center gap-2">
          <div className="relative" ref={searchBoxRef}>
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
            <input
              value={searchQ}
              onChange={e => { const v = e.target.value; setSearchQ(v); setDropdownOpen(v.length > 0); if (v === '') setSelectedIds(new Set()) }}
              onFocus={e => { onFocus(e); if (searchQ) setDropdownOpen(true) }}
              onBlur={e => { onBlur(e); if (selectedIds.size > 0) e.currentTarget.style.border = '1px solid #00E5A0' }}
              placeholder="코드 검색..."
              className={`${inputCls} pl-9 w-56`}
              style={{ ...inputStyle, ...(selectedIds.size > 0 ? { border: '1px solid #00E5A0' } : {}) }}
            />
            {dropdownOpen && suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 9999, minWidth: 280, background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow-elevated)' }}>
                {suggestions.map(s => {
                  const on = selectedIds.has(s.id)
                  return (
                    <div key={s.id}
                      onClick={() => toggleSuggestion(s.id)}
                      className="px-3 py-2 cursor-pointer text-sm flex items-center gap-2"
                      style={{ color: '#ddd', whiteSpace: 'nowrap', background: on ? 'rgba(0,229,160,0.1)' : 'transparent' }}
                      onMouseEnter={e => { if (!on) e.currentTarget.style.background = '#252525' }}
                      onMouseLeave={e => { e.currentTarget.style.background = on ? 'rgba(0,229,160,0.1)' : 'transparent' }}>
                      <input type="checkbox" readOnly checked={on} className="rounded pointer-events-none" style={{ accentColor: '#00E5A0' }} />
                      {SEARCH_COLUMNS[activeTab].map((c, i) => (
                        <span key={c} style={i === 0 ? { color: '#fff', minWidth: 70 } : { color: '#888' }}>{String(s[c] ?? '-')}</span>
                      ))}
                    </div>
                  )
                })}
                <div onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-2 text-xs cursor-pointer text-center"
                  style={{ color: '#888', borderTop: '1px solid #333' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#252525')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  선택 초기화
                </div>
              </div>
            )}
          </div>
          {selectedIds.size > 0 && (
            <span className="text-xs font-medium whitespace-nowrap" style={{ color: '#00E5A0' }}>{selectedIds.size}건 선택</span>
          )}
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
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border hover:opacity-80 transition-opacity disabled:opacity-50"
            style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            검색
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
            ) : !searched ? (
              <tr><td colSpan={cols.length + 2} className="px-4 py-12 text-center">
                <p className="text-sm text-brand-muted">검색 버튼을 눌러 조회하세요.</p>
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
                {cols.map(c => {
                  const isPkg = c.key === 'use_package'
                  return (
                    <td key={c.key}
                      className={`px-4 py-3${isPkg ? ' cursor-pointer' : ''}`}
                      style={{ color: 'var(--color-text-primary)' }}
                      onClick={isPkg ? (e) => { e.stopPropagation(); togglePackage(row) } : undefined}>
                      {c.render ? c.render(row) : (row[c.key] ?? '-')}
                    </td>
                  )
                })}
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
      </>
      )}

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
