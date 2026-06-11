'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Trash2,
  Loader2, X, Save, GripVertical, Pencil, Palette, RefreshCw, Pipette,
  ChevronDown, ChevronLeft,
} from 'lucide-react'
import { HexColorPicker } from 'react-colorful'
import {
  DndContext, type DragEndEvent, PointerSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHotel } from '@/contexts/HotelContext'
import { useTheme } from '@/contexts/ThemeContext'
import { QUERY_KEYS } from '@/lib/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

type SchemaLevel = 'main' | 'mid' | 'sub'

type TableSchema = {
  id:              string
  hotel_id:        string
  name:            string
  level:           SchemaLevel
  parent_id:       string | null
  segmentation:    string[]
  order_index:     number
  color:            string | null
  bg_dark_color:    string | null
  bg_light_color:   string | null
  font_dark_color:  string | null
  font_light_color:string | null
  is_bold:         boolean
  sorting1:        string | null
  sorting2:        string | null
  sorting3:        string | null
  sorting4:        string | null
  sorting5:        string | null
  is_active:       boolean
  created_at:      string
  updated_at:      string
}

type SchemaGroup = { parent: TableSchema; children: TableSchema[] }
type SchemaTree  = { groups: SchemaGroup[]; mids: TableSchema[] }

// ── buildTree ─────────────────────────────────────────────────────────────────

function buildTree(data: TableSchema[]): SchemaTree {
  const mains = data.filter(s => s.level === 'main').sort((a, b) => a.order_index - b.order_index)
  const mids  = data.filter(s => s.level === 'mid').sort((a, b) => a.order_index - b.order_index)
  const subs  = data.filter(s => s.level === 'sub')
  return {
    groups: mains.map(main => ({
      parent:   main,
      children: subs
        .filter(s => s.parent_id === main.id)
        .sort((a, b) => a.order_index - b.order_index),
    })),
    mids,
  }
}

// ── Level badge config ────────────────────────────────────────────────────────

type BadgeCfg = { label: string; bg: string; color: string; border: string }
const LEVEL_BADGE_DARK: Record<SchemaLevel, BadgeCfg> = {
  main: { label: '대분류', bg: '#0D1929', color: '#0E9FE5', border: '#0D2540' },
  mid:  { label: '중분류', bg: '#130E29', color: '#9F7AEA', border: '#1E1040' },
  sub:  { label: '소분류', bg: '#111827', color: '#A0AEC0', border: '#1E2535' },
}
const LEVEL_BADGE_LIGHT: Record<SchemaLevel, BadgeCfg> = {
  main: { label: '대분류', bg: '#EBF5FF', color: '#1A6FB5', border: '#BEE3F8' },
  mid:  { label: '중분류', bg: '#F3EEFF', color: '#6B46C1', border: '#D6BCFA' },
  sub:  { label: '소분류', bg: '#F1F3F5', color: '#4A5568', border: '#CBD5E0' },
}
// 우측 미리보기 리스트 전용 라이트 배지
const PREVIEW_BADGE_LIGHT: Record<SchemaLevel, { label: string; color: string; bg: string }> = {
  main: { label: '대분류', color: '#2563EB', bg: 'rgba(37,99,235,0.10)' },
  mid:  { label: '중분류', color: '#7C3AED', bg: 'rgba(124,58,237,0.10)' },
  sub:  { label: '소분류', color: '#64748B', bg: 'rgba(100,116,139,0.10)' },
}
// 분류별 글자색 단일 출처 — "추가하기" 드롭다운과 "색상" 버튼의 분류 선택 리스트가 공유
const LEVEL_LABEL_COLOR: Record<SchemaLevel, string> = { main: '#6BA6E8', mid: '#9D95E8', sub: '#6BA6E8' }

// 추가하기 / 색상 버튼 공통 분류 선택 리스트(대/중/소) — 카드 폭 꽉 채움 + 전체폭 구분선
function LevelPickerList({ onPick }: { onPick: (level: SchemaLevel) => void }) {
  return (
    <>
      {(['main', 'mid', 'sub'] as SchemaLevel[]).map((level, i) => (
        <button key={level} onClick={() => onPick(level)}
          className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-left transition-colors whitespace-nowrap"
          style={{ color: LEVEL_LABEL_COLOR[level], borderTop: i === 0 ? undefined : '1px solid var(--color-border-default)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <Plus size={11} />{LEVEL_BADGE_DARK[level].label}
        </button>
      ))}
    </>
  )
}

// 좌측 에디터 ↔ 우측 미리보기 행 높이 정렬용 단일 출처(공유 상수).
// 우측 미리보기 행이 실제로 쓰는 높이를 기준값으로 삼고, 좌측 에디터 행도 같은 값을
// height(고정) + boxSizing:border-box 로 맞춘다. 에디터 행은 세로 패딩을 제거해
// 내용(액션버튼 h-6 = 24px, 배지, 코드칩)이 ROW_H 안에서 수직 중앙(table-cell)으로 들어간다.
const ROW_H = 46
// 패널 헤더 높이: 에디터 헤더(px-4 py-3 + 추가툴바 py-1.5 / 버튼 h-6)의 실제 높이 기준.
const HEADER_H   = 64
// 색상 편집 패널의 각 행(브레드크럼/바탕색/투명도/글자색/굵게) 공통 고정 높이.
const PANEL_ROW_H = 40

// ── Style helpers ─────────────────────────────────────────────────────────────

const inputCls   = 'w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 focus:outline-none transition-all'
const inputStyle = { color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }

// ── Default colors for reset ───────────────────────────────────────────────────
const DEFAULT_BG_DARK    = '#1A1F2E'
const DEFAULT_BG_LIGHT   = '#EEF3EE'
const DEFAULT_FONT_DARK  = '#FFFFFF'
const DEFAULT_FONT_LIGHT = '#111111'

const LEVEL_DEFAULTS: Record<SchemaLevel, { bgDark: string; bgLight: string; dark: string; light: string; bold: boolean }> = {
  main: { bgDark: '#1A1F2E', bgLight: '#EEF3EE', dark: '#FFFFFF', light: '#111111', bold: true  },
  mid:  { bgDark: '#15192A', bgLight: '#F4F2EA', dark: '#E2E8F0', light: '#1A1815', bold: true  },
  sub:  { bgDark: '#0E1117', bgLight: '#FFFFFF', dark: '#94A3B8', light: '#6B6760', bold: false },
}

// ── Excel color palette ────────────────────────────────────────────────────────
const THEME_ROWS: string[] = [
  '#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#FFC000', '#70AD47', '#FF0000', '#00B0F0',
  '#F2F2F2', '#808080', '#CFCECE', '#D6DCE4', '#D9E2F3', '#FCE4D6', '#FFF2CC', '#E2EFDA', '#FFCCCC', '#DEEBF7',
  '#D9D9D9', '#595959', '#AFABAB', '#ACB9CA', '#B4C7E7', '#F8CBAD', '#FFE699', '#C6E0B4', '#FF9999', '#BDD7EE',
  '#BFBFBF', '#404040', '#767171', '#8496B0', '#9DC3E6', '#F4B183', '#FFD966', '#A9D18E', '#FF6666', '#9EC6F0',
  '#808080', '#262626', '#3A3838', '#597082', '#2E75B6', '#C55A11', '#BF8F00', '#538135', '#CC0000', '#0070C0',
  '#595959', '#0D0D0D', '#171616', '#213243', '#1F4E79', '#833C00', '#7F5F00', '#375623', '#990000', '#003A78',
]
const STANDARD_COLORS: string[] = [
  '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050',
  '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0',
]

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

function LevelBadge({ level, dark }: { level: SchemaLevel; dark?: boolean }) {
  const { theme } = useTheme()
  const cfg = (dark || theme === 'dark') ? LEVEL_BADGE_DARK[level] : LEVEL_BADGE_LIGHT[level]
  return (
    <span className="text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  )
}

// ── Excel Color Picker ────────────────────────────────────────────────────────

// SVG 스포이드 커서 (URL 인코딩)
const DROPPER_CURSOR = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>`
) + '") 2 18, crosshair'

function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return null
  return '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('')
}

// ── 바탕색 투명도(Opacity) ──────────────────────────────────────────────────────
// 저장값(#RRGGBBAA / #RRGGBB / rgba()) → 6자리 베이스 + 투명도(0~100) 분해
function splitBgAlpha(value: string | null | undefined): { base: string; opacity: number } {
  const v = (value ?? '').trim()
  if (!v) return { base: '', opacity: 100 }
  const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
  if (m) {
    const a = m[4] !== undefined ? Number(m[4]) : 1
    const base = '#' + [m[1], m[2], m[3]].map(n => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('').toUpperCase()
    return { base, opacity: Math.round(Math.max(0, Math.min(1, a)) * 100) }
  }
  if (/^#[0-9a-fA-F]{8}$/.test(v)) {
    const alpha = parseInt(v.slice(7, 9), 16)
    return { base: v.slice(0, 7).toUpperCase(), opacity: Math.round(alpha / 255 * 100) }
  }
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return { base: v.toUpperCase(), opacity: 100 }  // 레거시 6자리 = 100%
  return { base: v, opacity: 100 }
}
// 6자리 베이스 + 투명도(0~100) → 8자리 hex(#RRGGBBAA). 베이스 없음('')이면 채우기 없음 유지
function joinBgAlpha(base: string, opacity: number): string {
  if (!base) return ''
  const m = base.match(/^#([0-9a-fA-F]{6})$/)
  if (!m) return base
  const alpha = Math.round(Math.max(0, Math.min(100, Math.round(opacity))) / 100 * 255)
  return `#${m[1].toUpperCase()}${alpha.toString(16).padStart(2, '0').toUpperCase()}`
}
// 투명도 미리보기용 체커보드
const CHECKER_BG = 'repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%) 50% / 8px 8px'

function ExcelColorPicker({ value, onChange, openUp, size = 32 }: { value: string; onChange: (v: string) => void; openUp?: boolean; size?: number }) {
  const [open,       setOpen]       = useState(false)
  const [pos,        setPos]        = useState({ top: 0, left: 0 })
  const [showCustom, setShowCustom] = useState(false)
  const btnRef   = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (!document.body.contains(t)) return
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // unmount cleanup
  useEffect(() => () => { cleanupRef.current?.() }, [])

  const apply = (color: string) => { onChange(color); setOpen(false) }

  const startEyedrop = () => {
    setOpen(false)
    document.body.style.cursor = DROPPER_CURSOR

    const onClick = (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation()
      let el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      let hex: string | null = null
      while (el && !hex) {
        const bg = getComputedStyle(el).backgroundColor
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
          hex = rgbToHex(bg)
        }
        el = el.parentElement
      }
      if (hex) onChange(hex)
      cleanup()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cleanup()
    }

    const cleanup = () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.cursor = ''
      cleanupRef.current = null
    }

    cleanupRef.current = cleanup
    document.addEventListener('click',   onClick,   { capture: true, once: true })
    document.addEventListener('keydown', onKeyDown, { capture: true })
  }

  const handleOpen = () => {
    if (!btnRef.current) { setOpen(o => !o); return }
    const r  = btnRef.current.getBoundingClientRect()
    const pw = 220
    const ph = showCustom ? 550 : 350
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = Math.max(8, Math.min(r.left, vw - pw - 8))
    const top  = (openUp || r.bottom + ph + 6 > vh) ? r.top - ph - 6 : r.bottom + 6
    setPos({ top, left })
    setOpen(o => !o)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{
          width: size, height: size, flexShrink: 0, cursor: 'pointer', borderRadius: 6,
          background: value || 'transparent',
          border: '1px solid var(--color-border-default)',
        }}
      />
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999,
            padding: 12, borderRadius: 12, minWidth: 200,
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-default)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 5 }}>테마 색</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 16px)', gap: 2 }}>
            {THEME_ROWS.map((color, i) => (
              <button key={i} title={color} onClick={() => apply(color)}
                style={{
                  width: 16, height: 16, background: color, borderRadius: 1, cursor: 'pointer',
                  border: value.toLowerCase() === color.toLowerCase()
                    ? '2px solid var(--color-accent-primary)'
                    : '1px solid rgba(0,0,0,0.18)',
                }} />
            ))}
          </div>

          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', marginTop: 8, marginBottom: 5 }}>표준 색</p>
          <div style={{ display: 'flex', gap: 2 }}>
            {STANDARD_COLORS.map((color, i) => (
              <button key={i} title={color} onClick={() => apply(color)}
                style={{
                  width: 16, height: 16, background: color, borderRadius: 1, cursor: 'pointer',
                  border: value.toLowerCase() === color.toLowerCase()
                    ? '2px solid var(--color-accent-primary)'
                    : '1px solid rgba(0,0,0,0.18)',
                }} />
            ))}
          </div>

          <button onClick={() => apply('')}
            className="w-full mt-2 text-left transition-colors"
            style={{ fontSize: 11, padding: '5px 6px', borderRadius: 4, color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-default)', background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            채우기 없음(N)
          </button>

          {/* 다른 색: 자체 스펙트럼 패널 토글 */}
          <button onClick={() => setShowCustom(v => !v)}
            className="w-full mt-1 text-left transition-colors"
            style={{ fontSize: 11, padding: '5px 6px', borderRadius: 4, color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-default)', background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            다른 색(M)...
          </button>

          {showCustom && (
            <div style={{ marginTop: 8 }}>
              <style>{`.react-colorful { width: 100% !important; height: 150px !important; border-radius: 6px !important; } .react-colorful__pointer { width: 20px !important; height: 20px !important; }`}</style>
              <HexColorPicker color={value || '#000000'} onChange={v => onChange(v)} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <button
                  onClick={startEyedrop}
                  aria-label="스포이드"
                  style={{
                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                    border: '1px solid var(--color-border-default)',
                    background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <Pipette size={14} />
                </button>
                <input
                  type="text"
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  style={{
                    flex: 1, fontSize: 12, padding: '6px 8px', borderRadius: 6,
                    background: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border-default)',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// ── SortableRow ───────────────────────────────────────────────────────────────

function SortableRow({ id, children, style }: {
  id: string
  children: (handleProps: React.HTMLAttributes<HTMLElement>) => React.ReactNode
  style?: React.CSSProperties
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <tr ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, ...style }}>
      {children({ ...attributes, ...listeners })}
    </tr>
  )
}

// ── Preview dummy metrics ─────────────────────────────────────────────────────

function pvHash(s: string, salt: number): number {
  let h = salt
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
function pvSub(id: string) {
  const rn  = 30 + pvHash(id, 1) % 170
  const adr = 150000 + pvHash(id, 2) % 150000
  return { rn, adr, rev: rn * adr }
}
function pvMid(id: string) {
  const rn  = 10 + pvHash(id, 3) % 90
  const adr = 80000 + pvHash(id, 4) % 120000
  return { rn, adr, rev: rn * adr }
}
function fRn(n: number)  { return Math.round(n).toLocaleString('ko-KR') }
function fAdr(n: number) { return Math.round(n / 1000).toLocaleString('ko-KR') }
function fRev(n: number) { return (n / 1_000_000).toFixed(1) }

// ── Market Preview Table ──────────────────────────────────────────────────────

function MarketPreviewTable({ tree, isDark, overrides = {} }: { tree: SchemaTree; isDark: boolean; overrides?: Partial<Record<SchemaLevel, { bgDark: string|null; bgLight: string|null; dark: string|null; light: string|null; bold: boolean } | null>> }) {
  const T = isDark
    ? { cardBg: '#0E1117', panelBg: '#0E1117', headBg: '#0B0E14', border: '#1E2535',
        borderSubtle: 'rgba(255,255,255,0.06)', textPri: '#E2E8F0', textSec: '#94A3B8',
        textMuted: '#5A6678', accent: '#00E5A0' }
    : { cardBg: '#FFFFFF', panelBg: '#FFFFFF', headBg: '#FAF8F1', border: '#E8E4D9',
        borderSubtle: '#EFEBE0', textPri: '#1A1815', textSec: '#6B6760',
        textMuted: '#A39E92', accent: '#00B883' }

  const CELL     = { borderLeft: `1px dashed ${T.border}`, width: 64, textAlign: 'center' as const }
  const CELL_DIM = { ...CELL, color: T.textMuted, fontSize: 10 }

  const fontColor = (item: TableSchema, fallback: string) => {
    const ov = overrides[item.level]
    if (ov) return isDark ? (ov.dark ?? fallback) : (ov.light ?? fallback)
    return isDark ? (item.font_dark_color ?? fallback) : (item.font_light_color ?? fallback)
  }
  const getBg = (item: TableSchema) => {
    const ov = overrides[item.level]
    if (ov) return (isDark ? ov.bgDark : ov.bgLight) ?? T.cardBg
    const c = isDark ? (item.bg_dark_color ?? item.color)
                     : (item.bg_light_color ?? item.color)
    return c ?? T.cardBg
  }
  const getIsBold = (item: TableSchema) => {
    const ov = overrides[item.level]
    return ov ? ov.bold : item.is_bold
  }

  // 더미 데이터 사전 계산
  const subMap: Record<string, { rn: number; adr: number; rev: number }> = {}
  tree.groups.forEach(g => g.children.forEach(c => { subMap[c.id] = pvSub(c.id) }))

  const midMap: Record<string, { rn: number; adr: number; rev: number }> = {}
  tree.mids.forEach(m => { midMap[m.id] = pvMid(m.id) })

  const groupMap: Record<string, { rn: number; adr: number; rev: number }> = {}
  tree.groups.forEach(g => {
    const rn  = g.children.reduce((s, c) => s + (subMap[c.id]?.rn  ?? 0), 0)
    const rev = g.children.reduce((s, c) => s + (subMap[c.id]?.rev ?? 0), 0)
    groupMap[g.parent.id] = { rn, adr: rn > 0 ? rev / rn : 0, rev }
  })

  const allVals  = [...Object.values(groupMap), ...Object.values(midMap)]
  const grandRn  = allVals.reduce((s, m) => s + m.rn,  0)
  const grandRev = allVals.reduce((s, m) => s + m.rev, 0)
  const grandAdr = grandRn > 0 ? grandRev / grandRn : 0
  const occ      = grandRn > 0 ? (grandRn / (100 * 30) * 100) : 0
  const revpar   = Math.round(grandRev / (100 * 30))

  return (
    <div className="rounded-xl overflow-hidden text-sm" style={{ border: `1px solid ${T.border}`, fontSize: '0.9em' }}>
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: T.headBg, borderBottom: `1px solid ${T.border}` }}>
            <th rowSpan={2} className="px-3 py-2 text-left text-[11px] font-semibold"
              style={{ color: T.textPri, verticalAlign: 'middle', borderBottom: `1px solid ${T.border}` }}>
              Segmentation
            </th>
            <th colSpan={3} className="py-2 text-center text-[11px] font-semibold tracking-wider"
              style={{ borderLeft: `1px solid ${T.border}`, color: T.textMuted }}>
              ACTUAL
            </th>
          </tr>
          <tr style={{ background: T.headBg, borderBottom: `1px solid ${T.border}` }}>
            {['R/N', 'ADR', 'REV'].map(h => (
              <th key={h} className="py-1.5 text-center text-[9px] font-semibold"
                style={{ ...CELL, color: T.textMuted }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            const topLevel = [
              ...tree.groups.map(g => g.parent),
              ...tree.mids,
            ].sort((a, b) => a.order_index - b.order_index)

            return topLevel.map(item => {
              if (item.level === 'main') {
                const group     = tree.groups.find(g => g.parent.id === item.id)
                const gm        = groupMap[item.id] ?? { rn: 0, adr: 0, rev: 0 }
                const mainColor = fontColor(item, T.textPri)
                const mainW     = getIsBold(item) ? 700 : 600
                return (
                  <React.Fragment key={item.id}>
                    <tr style={{ background: getBg(item), borderTop: `1px solid ${T.border}` }}>
                      <td className="px-3 py-2"
                        style={{ color: mainColor, fontWeight: mainW }}>
                        {item.name}
                      </td>
                      <td style={{ ...CELL, color: mainColor, fontWeight: mainW, fontSize: 10 }}>{fRn(gm.rn)}</td>
                      <td style={{ ...CELL, color: mainColor, fontWeight: mainW, fontSize: 10 }}>{fAdr(gm.adr)}</td>
                      <td style={{ ...CELL, color: mainColor, fontWeight: mainW, fontSize: 10 }}>{fRev(gm.rev)}</td>
                    </tr>
                    {group?.children.map(child => {
                      const sm         = subMap[child.id] ?? { rn: 0, adr: 0, rev: 0 }
                      const childColor = fontColor(child, child.color ?? T.accent)
                      const childW     = getIsBold(child) ? 600 : 400
                      return (
                        <tr key={child.id} style={{ background: getBg(child), borderBottom: `1px dashed ${T.borderSubtle}` }}>
                          <td style={{ paddingLeft: 12, color: childColor, fontWeight: childW, fontSize: 11 }}>
                            <span style={{ color: T.textMuted, marginRight: 4, fontSize: 10 }}>└</span>
                            {child.name}
                          </td>
                          <td style={{ ...CELL, color: childColor, fontWeight: childW, fontSize: 10 }}>{fRn(sm.rn)}</td>
                          <td style={{ ...CELL, color: childColor, fontWeight: childW, fontSize: 10 }}>{fAdr(sm.adr)}</td>
                          <td style={{ ...CELL, color: childColor, fontWeight: childW, fontSize: 10 }}>{fRev(sm.rev)}</td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              }
              // 중분류
              const mm       = midMap[item.id] ?? { rn: 0, adr: 0, rev: 0 }
              const midColor = fontColor(item, T.textPri)
              const midW     = getIsBold(item) ? 600 : 400
              return (
                <tr key={item.id} style={{ background: getBg(item), borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
                  <td className="px-3 py-2"
                    style={{ color: midColor, fontWeight: midW }}>
                    {item.name}
                  </td>
                  <td style={{ ...CELL, color: midColor, fontWeight: midW, fontSize: 10 }}>{fRn(mm.rn)}</td>
                  <td style={{ ...CELL, color: midColor, fontWeight: midW, fontSize: 10 }}>{fAdr(mm.adr)}</td>
                  <td style={{ ...CELL, color: midColor, fontWeight: midW, fontSize: 10 }}>{fRev(mm.rev)}</td>
                </tr>
              )
            })
          })()}

          {/* 빈 상태 */}
          {tree.groups.length === 0 && tree.mids.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-[11px]" style={{ color: T.textMuted }}>
                좌측에서 스키마를 추가하면 여기에 표시됩니다
              </td>
            </tr>
          )}

          {/* ── Total / Occ / Rev.PAR ── */}
          {(tree.groups.length > 0 || tree.mids.length > 0) && (() => {
            const mainItem   = tree.groups[0]?.parent
            const totalColor = mainItem ? fontColor(mainItem, T.accent) : T.accent
            const totalBold  = mainItem?.is_bold ? 'font-bold' : 'font-semibold'
            return (
              <>
                {/* Total */}
                <tr style={{ borderTop: `2px solid ${T.border}`, background: T.headBg }}>
                  <td className={`px-3 py-2 text-[13px] ${totalBold}`} style={{ color: totalColor }}>Total</td>
                  <td style={{ ...CELL_DIM, color: totalColor }}>{fRn(grandRn)}</td>
                  <td style={{ ...CELL_DIM, color: totalColor }}>{fAdr(grandAdr)}</td>
                  <td style={{ ...CELL_DIM, color: totalColor }}>{fRev(grandRev)}</td>
                </tr>

                {/* Occ */}
                <tr style={{ borderTop: `1px solid ${T.border}`, background: T.cardBg }}>
                  <td className={`px-3 py-1.5 text-[13px] ${totalBold}`} style={{ color: totalColor, borderBottom: `1px dashed ${T.borderSubtle}` }}>
                    Occ
                  </td>
                  <td colSpan={3} style={{ ...CELL_DIM, color: totalColor, textAlign: 'center', borderLeft: `1px dashed ${T.border}`, borderBottom: `1px dashed ${T.borderSubtle}` }}>
                    {occ.toFixed(1)}%
                  </td>
                </tr>

                {/* Rev.PAR */}
                <tr style={{ background: T.cardBg }}>
                  <td className={`px-3 py-1.5 text-[13px] ${totalBold}`} style={{ color: totalColor }}>Rev.PAR</td>
                  <td colSpan={3} style={{ ...CELL_DIM, color: totalColor, textAlign: 'center', borderLeft: `1px dashed ${T.border}` }}>{fRev(revpar)}</td>
                </tr>
              </>
            )
          })()}
        </tbody>
      </table>
    </div>
  )
}

// ── Schema Modal (추가/수정) ───────────────────────────────────────────────────

function SchemaModal({ hotelId, schemas, segmentationList, editItem, defaultLevel, onClose, onSaved }: {
  hotelId:          string
  schemas:          TableSchema[]
  segmentationList: { segmentation: string; market_code_description: string | null }[]
  editItem:         TableSchema | null
  defaultLevel?:    SchemaLevel
  onClose:          () => void
  onSaved:          () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name:         editItem?.name         ?? '',
    level:        (editItem?.level ?? defaultLevel ?? 'main') as SchemaLevel,
    parent_id:    editItem?.parent_id    ?? '',
    order_index:  editItem?.order_index  ?? 0,
    color:        editItem?.color        ?? '',
    is_bold:      editItem?.is_bold      ?? false,
    sorting1:     editItem?.sorting1     ?? '',
    sorting2:     editItem?.sorting2     ?? '',
    sorting3:     editItem?.sorting3     ?? '',
    sorting4:     editItem?.sorting4     ?? '',
    sorting5:     editItem?.sorting5     ?? '',
    is_active:    editItem?.is_active    ?? true,
    segmentation: editItem?.segmentation ?? [] as string[],
  })
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [showSort,    setShowSort]    = useState(
    !!(editItem?.sorting1 || editItem?.sorting2 || editItem?.sorting3 || editItem?.sorting4 || editItem?.sorting5)
  )
  const [pickerOpen,  setPickerOpen]  = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  const setF = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }))
  const mainSchemas = schemas.filter(s => s.level === 'main')

  // picker 외부 클릭 시 닫기
  useEffect(() => {
    if (!pickerOpen) return
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false); setPickerSearch('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickerOpen])

  const addSeg = (seg: string) => {
    setForm(prev => ({ ...prev, segmentation: [...prev.segmentation, seg] }))
    setPickerOpen(false); setPickerSearch('')
  }
  const removeSeg = (seg: string) => {
    setForm(prev => ({ ...prev, segmentation: prev.segmentation.filter(s => s !== seg) }))
  }

  // 다른 스키마 항목에서 이미 사용 중인 segmentation (현재 수정 대상 제외)
  const otherUsedSegs = new Set(
    schemas
      .filter(s => s.id !== editItem?.id)
      .flatMap(s => s.segmentation ?? [])
  )

  // 사용 가능한 전체 목록 (이미 사용된 것 제외)
  const availableList = segmentationList.filter(
    s => !form.segmentation.includes(s.segmentation) && !otherUsedSegs.has(s.segmentation)
  )
  const allCodesUsed = segmentationList.length > 0 && availableList.length === 0

  const filteredList = availableList.filter(
    s => s.segmentation.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  const handleSave = async () => {
    if (!form.name.trim()) { setError('이름은 필수입니다.'); return }
    setSaving(true); setError(null)
    const data = {
      hotel_id:    hotelId,
      name:        form.name.trim(),
      level:       form.level,
      parent_id:   form.level === 'sub' && form.parent_id ? form.parent_id : null,
      order_index: Number(form.order_index) || 0,
      color:       form.color || null,
      is_bold:     form.is_bold,
      sorting1:    form.sorting1 || null,
      sorting2:    form.sorting2 || null,
      sorting3:    form.sorting3 || null,
      sorting4:    form.sorting4 || null,
      sorting5:    form.sorting5 || null,
      is_active:   form.is_active,
      segmentation: form.level !== 'main' ? form.segmentation : [],
    }
    try {
      if (editItem) {
        const { error: e } = await (supabase as any)
          .from('c05_market_table_schema').update(data).eq('id', editItem.id)
        if (e) throw e
      } else {
        const { error: e } = await (supabase as any)
          .from('c05_market_table_schema').insert(data)
        if (e) throw e
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.marketTableSchema(hotelId) })
      onSaved()
    } catch (e: any) {
      setError(e.message ?? '오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-bg-secondary overflow-hidden max-h-[90vh] flex flex-col"
        style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>

        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {editItem ? '스키마 수정' : '스키마 추가'}
          </p>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text transition-colors"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg text-xs text-status-negative"
              style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
              {error}
            </div>
          )}
          <Field label="이름" required>
            <input value={form.name} onChange={e => setF('name', e.target.value)}
              className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="레벨" required>
              <select value={form.level} onChange={e => setF('level', e.target.value as SchemaLevel)}
                className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                <option value="main">대분류</option>
                <option value="mid">중분류</option>
                <option value="sub">소분류</option>
              </select>
            </Field>
            <Field label="표시 순서">
              <input type="number" value={form.order_index} onChange={e => setF('order_index', e.target.value)}
                className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
            </Field>
          </div>
          {form.level === 'sub' && (
            <Field label="상위 대분류">
              <select value={form.parent_id ?? ''} onChange={e => setF('parent_id', e.target.value)}
                className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                <option value="">선택 안 함</option>
                {mainSchemas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="색상">
            <div className="flex items-center gap-2">
              <input type="color" value={form.color || '#1A1F2E'} onChange={e => setF('color', e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer p-0.5"
                style={{ border: '1px solid var(--color-border-default)', background: 'transparent' }} />
              <input value={form.color} onChange={e => setF('color', e.target.value)}
                placeholder="#1A1F2E" className={`${inputCls} flex-1`} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
            </div>
          </Field>
          <div className="flex items-center gap-3">
            <Toggle value={form.is_bold} onChange={v => setF('is_bold', v)} />
            <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>굵게 표시</span>
          </div>
          <button onClick={() => setShowSort(v => !v)}
            className="text-xs text-brand-muted hover:text-brand-text transition-colors">
            {showSort ? '▲' : '▼'} 추가 분류(sorting1~5)
          </button>
          {showSort && (
            <div className="grid grid-cols-2 gap-3">
              {[1,2,3,4,5].map(n => (
                <Field key={n} label={`분류${n}`}>
                  <input value={(form as any)[`sorting${n}`] ?? ''} onChange={e => setF(`sorting${n}`, e.target.value)}
                    className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </Field>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Toggle value={form.is_active} onChange={v => setF('is_active', v)} />
            <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {form.is_active ? '활성' : '비활성'}
            </span>
          </div>
          {/* Segmentation — 중분류/소분류만 */}
          {form.level !== 'main' && (
            <Field label="Segmentation 연결">
              <div ref={pickerRef} className="relative">
                {/* 입력창 스타일 컨테이너 */}
                <div
                  className="rounded-md bg-bg-tertiary flex flex-wrap items-center gap-1.5 px-3 py-2 min-h-[42px] cursor-text transition-all"
                  style={{ border: pickerOpen ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-default)',
                           boxShadow: pickerOpen ? '0 0 0 3px var(--color-accent-dim)' : 'none' }}
                  onClick={() => setPickerOpen(true)}>
                  {form.segmentation.map(seg => (
                    <span key={seg}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
                      style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                      {seg}
                      <button
                        onClick={e => { e.stopPropagation(); removeSeg(seg) }}
                        className="text-brand-dimmed hover:text-[#FC8181] transition-colors leading-none">
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder={form.segmentation.length === 0 ? '검색 후 선택...' : ''}
                    value={pickerSearch}
                    onChange={e => { setPickerSearch(e.target.value); setPickerOpen(true) }}
                    onFocus={() => setPickerOpen(true)}
                    className="flex-1 min-w-[80px] bg-transparent text-sm focus:outline-none"
                    style={{ color: 'var(--color-text-primary)' }}
                  />
                </div>

                {/* 드롭다운 목록 */}
                {pickerOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-full rounded-lg overflow-hidden"
                    style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredList.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-center"
                          style={{ color: allCodesUsed ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
                          {allCodesUsed
                            ? '다른 코드를 삭제하고 적용하세요'
                            : pickerSearch ? '검색 결과 없음' : '추가할 항목 없음'}
                        </p>
                      ) : filteredList.map(s => (
                        <button key={s.segmentation}
                          onClick={() => addSeg(s.segmentation)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                          style={{ color: 'var(--color-text-primary)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span className="font-medium">{s.segmentation}</span>
                          {s.market_code_description && (
                            <span className="text-brand-dimmed ml-auto text-[10px] truncate max-w-[120px]">
                              {s.market_code_description}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Field>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-brand-muted hover:text-brand-text transition-colors"
            style={{ border: '1px solid var(--color-border-default)' }}>취소</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 transition-all"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}저장
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MarketCodeManagementPage() {
  const router       = useRouter()
  const { currentHotel } = useHotel()
  const queryClient  = useQueryClient()
  const hotelId      = currentHotel?.id ?? ''
  const { theme }    = useTheme()
  const isDark       = theme === 'dark'
  const levelBadge   = (level: SchemaLevel) => isDark ? LEVEL_BADGE_DARK[level] : LEVEL_BADGE_LIGHT[level]
  // 좌측 에디터는 앱 테마와 무관하게 항상 다크 고정 → 항상 다크(dark) 색을 반환
  const fontColor = (item: TableSchema, fallback: string) => {
    const ov = previewOverrides[item.level]
    if (ov) return ov.dark ?? fallback
    return item.font_dark_color ?? fallback
  }
  const editorBg = (level: SchemaLevel) => {
    const ov = previewOverrides[level]
    const lc = levelColors[level]
    const d  = LEVEL_DEFAULTS[level]
    return ov?.bgDark ?? lc.bgDark ?? d.bgDark
  }
  const editorBold = (item: TableSchema) => {
    const ov = previewOverrides[item.level]
    return ov ? ov.bold : item.is_bold
  }
  // 우측 미리보기(라이트 리스트) 전용 — 항상 라이트 값 사용
  const previewLightBg   = (level: SchemaLevel) => previewOverrides[level]?.bgLight ?? levelColors[level].bgLight ?? LEVEL_DEFAULTS[level].bgLight
  const previewLightFont = (level: SchemaLevel) => previewOverrides[level]?.light  ?? levelColors[level].light  ?? LEVEL_DEFAULTS[level].light
  const previewLightBold = (level: SchemaLevel) => previewOverrides[level]?.bold   ?? levelColors[level].bold   ?? LEVEL_DEFAULTS[level].bold

  const [schemaModal,   setSchemaModal]   = useState<{ open: boolean; item: TableSchema | null; defaultLevel?: SchemaLevel }>({ open: false, item: null })
  const [segPickerId,   setSegPickerId]   = useState<string | null>(null)
  const [segSearch,     setSegSearch]     = useState('')
  const [selectedLevel, setSelectedLevel] = useState<SchemaLevel>('main')
  const [previewOverrides, setPreviewOverrides] = useState<Partial<Record<SchemaLevel, { bgDark: string|null; bgLight: string|null; dark: string|null; light: string|null; bold: boolean } | null>>>({})
  const segPickerRef  = useRef<HTMLDivElement>(null)
  // [A] 추가하기 드롭다운 / [B] 색상 드롭다운(패널=모드)
  const [addOpen,    setAddOpen]    = useState(false)
  const [colorPanel, setColorPanel] = useState<'dark' | 'light' | null>(null)  // 열린 색상 패널 = 편집 모드
  const [colorStep,  setColorStep]  = useState<1 | 2>(1)                        // 1: 분류 선택, 2: 색 편집
  const addMenuRef    = useRef<HTMLDivElement>(null)
  const darkColorRef  = useRef<HTMLDivElement>(null)
  const lightColorRef = useRef<HTMLDivElement>(null)

  // segmentation picker 외부 클릭 시 닫기
  useEffect(() => {
    if (!segPickerId) return
    function onDown(e: MouseEvent) {
      if (segPickerRef.current && !segPickerRef.current.contains(e.target as Node)) {
        setSegPickerId(null)
        setSegSearch('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [segPickerId])

  // [A] 추가하기 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!addOpen) return
    function onDown(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setAddOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [addOpen])

  // [B] 색상 드롭다운 외부 클릭 닫기 (열린 패널의 ref 기준)
  // (ExcelColorPicker 의 fixed 색 패널은 DOM 상 해당 ref 내부라 contains 로 보존됨)
  useEffect(() => {
    if (!colorPanel) return
    const ref = colorPanel === 'dark' ? darkColorRef : lightColorRef
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setColorPanel(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [colorPanel])

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: schemas = [], isLoading: schemaLoading } = useQuery({
    queryKey: QUERY_KEYS.marketTableSchema(hotelId),
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('c05_market_table_schema')
        .select('*')
        .eq('hotel_id', hotelId)
        .order('order_index')
      if (error) throw error
      return (data as any[]).map(r => ({
        ...r,
        segmentation: r.segmentation ?? [],
      })) as TableSchema[]
    },
    enabled:        !!hotelId,
    staleTime:      0,
    refetchOnMount: true,
  })

  const { data: segmentationList = [] } = useQuery({
    queryKey: QUERY_KEYS.marketCodesSegmentation(hotelId),
    queryFn:  async () => {
      const { data, error } = await (supabase as any)
        .from('c03_market_codes')
        .select('segmentation, market_code_description')
        .eq('hotel_id', hotelId)
        .eq('is_active', true)
        .order('segmentation')
      if (error) throw error
      const unique = Array.from(
        new Map(
          (data as any[])
            .filter(d => d.segmentation)
            .map(d => [d.segmentation, d])
        ).values()
      )
      return unique as { segmentation: string; market_code_description: string | null }[]
    },
    enabled:        !!hotelId,
    staleTime:      0,
    refetchOnMount: true,
  })

  const tree = useMemo(() => buildTree(schemas), [schemas])

  // 레벨별 현재 색상 (첫 번째 항목 기준 — 레벨 내 전체 일괄 적용이므로 동일)
  const levelColors = useMemo(() => {
    const result: Record<SchemaLevel, { bgDark: string|null; bgLight: string|null; dark: string|null; light: string|null; bold: boolean }> = {
      main: { bgDark: null, bgLight: null, dark: null, light: null, bold: false },
      mid:  { bgDark: null, bgLight: null, dark: null, light: null, bold: false },
      sub:  { bgDark: null, bgLight: null, dark: null, light: null, bold: false },
    }
    for (const level of ['main','mid','sub'] as SchemaLevel[]) {
      const first = schemas.find(s => s.level === level)
      if (first) result[level] = {
        bgDark:  first.bg_dark_color  ?? first.color ?? null,
        bgLight: first.bg_light_color ?? first.color ?? null,
        dark:    first.font_dark_color  ?? null,
        light:   first.font_light_color ?? null,
        bold:    first.is_bold ?? false,
      }
    }
    return result
  }, [schemas])

  // ── [진단] 대분류(main) 다크 바탕색 추적 — editorBg('main') 가 실제로 반환하는 값 ──
  useEffect(() => {
    console.log('[bgDark diag] main', {
      'editorBg(main)':      editorBg('main'),
      'override.bgDark':     previewOverrides.main?.bgDark,
      'levelColors.bgDark':  levelColors.main?.bgDark,
      'DEFAULT.bgDark':      LEVEL_DEFAULTS.main.bgDark,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOverrides, levelColors])

  // ── toggleBold (optimistic) ────────────────────────────────────────────────

  const toggleBold = useMutation({
    mutationFn: async (schema: TableSchema) => {
      const { error } = await (supabase as any)
        .from('c05_market_table_schema')
        .update({ is_bold: !schema.is_bold })
        .eq('id', schema.id)
      if (error) throw error
    },
    onMutate: async (schema) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.marketTableSchema(hotelId) })
      const prev = queryClient.getQueryData(QUERY_KEYS.marketTableSchema(hotelId))
      queryClient.setQueryData(QUERY_KEYS.marketTableSchema(hotelId), (old: TableSchema[] = []) =>
        old.map(s => s.id === schema.id ? { ...s, is_bold: !s.is_bold } : s)
      )
      return { prev }
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEYS.marketTableSchema(hotelId), ctx.prev)
    },
  })

  // ── Level colors bulk save (배경 + 폰트 다크/라이트) ──────────────────────────

  const saveLevelColors = async (level: SchemaLevel, bgDark: string, bgLight: string, dark: string, light: string, bold: boolean) => {
    const { error } = await (supabase as any)
      .from('c05_market_table_schema')
      .update({ bg_dark_color: bgDark || null, bg_light_color: bgLight || null,
                font_dark_color: dark || null, font_light_color: light || null, is_bold: bold })
      .eq('hotel_id', hotelId)
      .eq('level', level)
    // 저장 실패 시(예: 컬럼 길이 초과로 8자리 hex 거부) override 를 지우지 않는다.
    // → 사용자가 고른 색을 화면에 유지하고 원인을 콘솔로 노출.
    if (error) {
      console.error('[saveLevelColors] 저장 실패', { level, bgDark, bgLight, error })
      throw error
    }
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.marketTableSchema(hotelId) })
    setPreviewOverrides(prev => ({ ...prev, [level]: null }))
  }

  // ── Segmentation add / remove (optimistic) ─────────────────────────────────

  const handleAddSegmentation = async (schemaId: string, seg: string) => {
    const schema = schemas.find(s => s.id === schemaId)
    if (!schema) return
    const newList = [...(schema.segmentation ?? []), seg]
    queryClient.setQueryData(QUERY_KEYS.marketTableSchema(hotelId), (old: TableSchema[] = []) =>
      old.map(s => s.id === schemaId ? { ...s, segmentation: newList } : s)
    )
    await (supabase as any)
      .from('c05_market_table_schema')
      .update({ segmentation: newList })
      .eq('id', schemaId)
    setSegPickerId(null); setSegSearch('')
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.marketTableSchema(hotelId) })
  }

  const handleRemoveSegmentation = async (schemaId: string, seg: string) => {
    const schema = schemas.find(s => s.id === schemaId)
    if (!schema) return
    const newList = (schema.segmentation ?? []).filter(s => s !== seg)
    queryClient.setQueryData(QUERY_KEYS.marketTableSchema(hotelId), (old: TableSchema[] = []) =>
      old.map(s => s.id === schemaId ? { ...s, segmentation: newList } : s)
    )
    await (supabase as any)
      .from('c05_market_table_schema')
      .update({ segmentation: newList })
      .eq('id', schemaId)
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.marketTableSchema(hotelId) })
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (schema: TableSchema) => {
    if (!confirm(`"${schema.name}" 항목을 삭제할까요?`)) return
    await (supabase as any).from('c05_market_table_schema').delete().eq('id', schema.id)
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.marketTableSchema(hotelId) })
  }

  // ── DnD ───────────────────────────────────────────────────────────────────

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeItem = schemas.find(s => s.id === active.id)
    const overItem   = schemas.find(s => s.id === over.id)
    if (!activeItem || !overItem) return
    // 소분류는 같은 부모 내에서만 이동, 대/중분류는 top-level(parent_id=null) 내에서 자유롭게 이동
    if (activeItem.parent_id !== overItem.parent_id) return

    const siblings = schemas
      .filter(s => s.parent_id === activeItem.parent_id)
      .sort((a, b) => a.order_index - b.order_index)
    const reordered = arrayMove(
      siblings,
      siblings.findIndex(s => s.id === active.id),
      siblings.findIndex(s => s.id === over.id),
    )
    for (const [index, item] of reordered.entries()) {
      await (supabase as any)
        .from('c05_market_table_schema')
        .update({ order_index: index })
        .eq('id', item.id)
    }
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.marketTableSchema(hotelId) })
  }

  // ── Inline actions ─────────────────────────────────────────────────────────

  const SchemaActions = ({ schema }: { schema: TableSchema }) => (
    <div className="flex items-center gap-1 justify-end relative">
      {/* Edit */}
      <button onClick={e => { e.stopPropagation(); setSchemaModal({ open: true, item: schema }) }}
        className="w-6 h-6 rounded flex items-center justify-center transition-colors"
        style={{ color: '#4A5568', border: '1px solid var(--color-border-default)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <Pencil size={11} />
      </button>

      {/* Delete */}
      <button onClick={e => { e.stopPropagation(); handleDelete(schema) }}
        className="w-6 h-6 rounded flex items-center justify-center transition-colors"
        style={{ color: '#4A5568', border: '1px solid var(--color-border-default)' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1A0D0D'; e.currentTarget.style.color = '#FC8181' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4A5568' }}>
        <Trash2 size={11} />
      </button>
    </div>
  )

  // ── Inline segmentation tags + picker ────────────────────────────────────────

  // 전체 스키마에서 사용 중인 segmentation 집합
  const allUsedSegmentations = new Set(
    schemas.flatMap(s => s.segmentation ?? [])
  )

  const InlineSegTags = ({ schema }: { schema: TableSchema }) => {
    if (schema.level === 'main') return null
    const isOpen = segPickerId === schema.id
    const filtered = segmentationList.filter(
      s => !allUsedSegmentations.has(s.segmentation) &&
           s.segmentation.toLowerCase().includes(segSearch.toLowerCase())
    )
    return (
      <span className="inline-flex flex-wrap items-center gap-1 ml-2">
        {(schema.segmentation ?? []).map(seg => (
          <span key={seg}
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
            {seg}
            <button
              onClick={e => { e.stopPropagation(); handleRemoveSegmentation(schema.id, seg) }}
              className="text-brand-dimmed hover:text-[#FC8181] transition-colors leading-none ml-0.5">
              ×
            </button>
          </span>
        ))}

        <div ref={isOpen ? segPickerRef : undefined} className="relative inline-block">
          <button
            onClick={e => { e.stopPropagation(); setSegPickerId(isOpen ? null : schema.id); setSegSearch('') }}
            className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
            style={{ border: '1px dashed var(--color-border-default)', color: 'var(--color-text-muted)' }}>
            + 추가
          </button>

          {isOpen && (
            <div className="absolute left-0 top-6 z-50 rounded-lg overflow-hidden"
              style={{ minWidth: 200, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
              <div className="p-2">
                <input autoFocus type="text" placeholder="검색..." value={segSearch}
                  onChange={e => setSegSearch(e.target.value)}
                  className="w-full text-xs px-2 py-1.5 rounded focus:outline-none"
                  style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }} />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-brand-dimmed">항목 없음</p>
                ) : filtered.map(s => (
                  <button key={s.segmentation}
                    onClick={e => { e.stopPropagation(); handleAddSegmentation(schema.id, s.segmentation) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                    style={{ color: 'var(--color-text-primary)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span>{s.segmentation}</span>
                    {s.market_code_description && (
                      <span className="text-brand-dimmed ml-auto text-[10px] truncate max-w-[80px]">
                        {s.market_code_description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </span>
    )
  }

  // 대분류 + 중분류를 order_index 순으로 합친 top-level 리스트
  const topLevelItems = [
    ...tree.groups.map(g => g.parent),
    ...tree.mids,
  ].sort((a, b) => a.order_index - b.order_index)
  const topLevelIds = topLevelItems.map(s => s.id)

  const subIdMap = tree.groups.reduce((acc, g) => {
    acc[g.parent.id] = g.children.map(c => c.id)
    return acc
  }, {} as Record<string, string[]>)

  const lc    = levelColors[selectedLevel]
  const ovSel = previewOverrides[selectedLevel]
  const curVal = {
    bgDark:  ovSel?.bgDark  ?? lc.bgDark  ?? LEVEL_DEFAULTS[selectedLevel].bgDark,
    bgLight: ovSel?.bgLight ?? lc.bgLight ?? LEVEL_DEFAULTS[selectedLevel].bgLight,
    dark:    ovSel?.dark    ?? lc.dark    ?? LEVEL_DEFAULTS[selectedLevel].dark,
    light:   ovSel?.light   ?? lc.light   ?? LEVEL_DEFAULTS[selectedLevel].light,
    bold:    ovSel?.bold    ?? lc.bold    ?? LEVEL_DEFAULTS[selectedLevel].bold,
  }
  const setField = (field: 'bgDark' | 'bgLight' | 'dark' | 'light' | 'bold', v: any) =>
    setPreviewOverrides(prev => {
      const d    = LEVEL_DEFAULTS[selectedLevel]
      const l    = levelColors[selectedLevel]
      const base = prev[selectedLevel] ?? {
        bgDark:  l.bgDark  ?? d.bgDark,
        bgLight: l.bgLight ?? d.bgLight,
        dark:    l.dark    ?? d.dark,
        light:   l.light   ?? d.light,
        bold:    l.bold    ?? d.bold,
      }
      return { ...prev, [selectedLevel]: { ...base, [field]: v } }
    })
  const handleResetLevel  = () =>
    setPreviewOverrides(prev => ({ ...prev, [selectedLevel]: { ...LEVEL_DEFAULTS[selectedLevel] } }))
  const handleCancelColors = () => setPreviewOverrides({})
  const handleSaveColors  = async () => {
    for (const level of ['main', 'mid', 'sub'] as SchemaLevel[]) {
      const ov = previewOverrides[level]; if (!ov) continue
      try {
        await saveLevelColors(level, ov.bgDark ?? '', ov.bgLight ?? '', ov.dark ?? '', ov.light ?? '', ov.bold ?? false)
      } catch {
        // saveLevelColors 가 콘솔에 원인 로깅 + override 유지. 다음 레벨 계속 진행.
      }
    }
  }

  // [B]/[3] 색상 드롭다운 — 패널이 모드를 결정(mode). 분류 선택(①) → ExcelColorPicker 색 편집(②)
  const renderColorMenu = (mode: 'dark' | 'light') => {
    const BADGE = mode === 'dark' ? LEVEL_BADGE_DARK : LEVEL_BADGE_LIGHT
    const bgField   = mode === 'dark' ? 'bgDark' : 'bgLight'
    const fontField = mode === 'dark' ? 'dark'   : 'light'
    const bgVal     = mode === 'dark' ? curVal.bgDark : curVal.bgLight
    const fontVal   = mode === 'dark' ? curVal.dark   : curVal.light
    // 바탕색만 투명도 분리 — 베이스(6자리)는 ExcelColorPicker, 알파는 슬라이더
    const { base: bgBase, opacity: bgOpacity } = splitBgAlpha(bgVal)
    // 행 사이 구분선 — 다크 패널 #1E2535 / 라이트 패널은 헤더 톤(#E8E4D9)
    const rowBorder = mode === 'dark' ? '1px solid #1E2535' : '1px solid #E8E4D9'
    const rowStyle  = { height: PANEL_ROW_H, boxSizing: 'border-box' as const }
    return (
      <div className="absolute right-0 mt-1 z-50 rounded-xl overflow-hidden"
        style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
        {colorStep === 1 ? (
          <LevelPickerList onPick={(level) => { setSelectedLevel(level); setColorStep(2) }} />
        ) : (
          <div className="flex flex-col" style={{ minWidth: 210 }}>
            {/* ‹ 뒤로 + 브레드크럼 (헤더) — 아래 구분선으로 본문과 분리 */}
            <div className="flex items-center gap-2 px-3"
              style={{ ...rowStyle, borderBottom: rowBorder }}>
              <button onClick={() => setColorStep(1)} aria-label="뒤로"
                className="flex items-center justify-center rounded transition-opacity hover:opacity-70"
                style={{ width: 20, height: 20, flexShrink: 0, color: 'var(--color-text-muted)', border: '1px solid var(--color-border-default)' }}>
                <ChevronLeft size={13} />
              </button>
              <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {BADGE[selectedLevel].label}
                <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>›</span>
                {mode === 'dark' ? '다크' : '라이트'}
              </span>
            </div>
            {/* 바탕색 (베이스 6자리) */}
            <div className="flex items-center justify-between gap-3 px-3"
              style={{ ...rowStyle, borderBottom: rowBorder }}>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>바탕색</span>
              <ExcelColorPicker value={bgBase} onChange={v => setField(bgField, joinBgAlpha(v, bgOpacity))} size={22} />
            </div>
            {/* 투명도 (바탕색에만 적용) */}
            <div className="flex items-center justify-between gap-3 px-3"
              style={{ ...rowStyle, borderBottom: rowBorder }}>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>투명도</span>
              <div className="flex items-center gap-2">
                {/* 체커보드 위 합성색 미리보기 */}
                <span style={{ position: 'relative', width: 22, height: 22, borderRadius: 4, flexShrink: 0, border: '1px solid var(--color-border-default)', background: CHECKER_BG }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 3, background: joinBgAlpha(bgBase, bgOpacity) || 'transparent' }} />
                </span>
                <input type="range" min={0} max={100} value={bgOpacity}
                  onChange={e => setField(bgField, joinBgAlpha(bgBase, Number(e.target.value)))}
                  disabled={!bgBase}
                  style={{ width: 72, accentColor: 'var(--color-accent-primary)', opacity: bgBase ? 1 : 0.4 }} />
                <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-secondary)', minWidth: 30, textAlign: 'right' }}>{bgOpacity}%</span>
              </div>
            </div>
            {/* 글자색 */}
            <div className="flex items-center justify-between gap-3 px-3"
              style={{ ...rowStyle, borderBottom: rowBorder }}>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>글자색</span>
              <ExcelColorPicker value={fontVal} onChange={v => setField(fontField, v)} size={22} />
            </div>
            {/* 굵게 (레벨당 하나, 모드 무관) — 마지막 행, 구분선 없음 */}
            <div className="flex items-center justify-between gap-3 px-3" style={rowStyle}>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>굵게</span>
              <Toggle value={curVal.bold} onChange={v => setField('bold', v)} />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/settings')}
            className="p-2 rounded-lg text-brand-muted hover:text-brand-text transition-colors"
            style={{ border: '1px solid var(--color-border-default)' }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              기본 테이블 설정
            </h1>
          </div>
        </div>
        {/* 저장 / 취소 / 초기화 — 헤더 우측 */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleSaveColors} className="text-xs font-semibold py-1.5 px-5 rounded-lg"
            style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>저장</button>
          <button onClick={handleCancelColors} className="text-xs py-1.5 px-4 rounded-lg"
            style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>취소</button>
          <button onClick={handleResetLevel} className="text-xs py-1.5 px-4 rounded-lg"
            style={{ border: '1px dashed var(--color-border-default)', color: 'var(--color-text-muted)' }}>초기화</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── Left: 마켓 표 스키마 (앱 테마와 무관하게 항상 다크 고정) ── */}
        <div data-theme="dark" className="rounded-2xl overflow-hidden flex flex-col" style={{ border: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center justify-between flex-wrap gap-2 px-4 shrink-0"
            style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-secondary)', height: HEADER_H, boxSizing: 'border-box' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Dark Mode
              </h2>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.marketTableSchema(hotelId) })}
                disabled={schemaLoading}
                className="text-brand-muted hover:text-brand-text transition-colors disabled:opacity-40"
              >
                <RefreshCw size={13} className={schemaLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            {/* [A] 추가하기 + [1] 색상(다크 모드 편집) — 우측 그룹 */}
            <div className="flex items-center gap-2 shrink-0">
            <div ref={addMenuRef} className="relative">
              <button onClick={() => setAddOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}>
                <Plus size={12} />추가하기
                <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: addOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {addOpen && (
                <div className="absolute right-0 mt-1 z-50 rounded-lg overflow-hidden"
                  style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
                  <LevelPickerList onPick={(level) => { setSchemaModal({ open: true, item: null, defaultLevel: level }); setAddOpen(false) }} />
                </div>
              )}
            </div>
            {/* [1] 색상 버튼 — 항상 다크 모드 색 편집 */}
            <div ref={darkColorRef} className="relative">
              <button onClick={() => { setColorPanel(p => p === 'dark' ? null : 'dark'); setColorStep(1) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}>
                <Palette size={12} />색상
                <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: colorPanel === 'dark' ? 'rotate(180deg)' : 'none' }} />
              </button>
              {colorPanel === 'dark' && renderColorMenu('dark')}
            </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {schemaLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-brand-muted">
                <Loader2 size={14} className="animate-spin" /><span className="text-sm">불러오는 중...</span>
              </div>
            ) : schemas.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-brand-muted">스키마가 없습니다</p>
                <p className="text-xs text-brand-dimmed mt-1">위 버튼으로 항목을 추가하세요</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <table className="w-full">
                  <tbody>
                    {/* 대분류 + 중분류 통합 top-level SortableContext */}
                    <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
                      {topLevelItems.map(item => {
                        if (item.level === 'main') {
                          const group = tree.groups.find(g => g.parent.id === item.id)
                          if (!group) return null
                          const mainBg = editorBg('main')
                          return (
                            <React.Fragment key={item.id}>
                              <SortableRow id={item.id} style={{ height: ROW_H, boxSizing: 'border-box' }}>
                                {(handleProps) => (<>
                                  <td className="w-7 px-2 text-brand-dimmed cursor-grab"
                                    style={{ background: mainBg }} {...handleProps}>
                                    <GripVertical size={13} />
                                  </td>
                                  <td className="w-16 px-1" style={{ background: mainBg }}>
                                    <LevelBadge level="main" dark />
                                  </td>
                                  <td className={`px-3 text-sm ${editorBold(item) ? 'font-bold' : 'font-semibold'}`}
                                    style={{ color: fontColor(item, 'var(--color-text-primary)'), background: mainBg }}>
                                    {item.name}
                                  </td>
                                  <td className="px-2" style={{ background: mainBg }}>
                                    <SchemaActions schema={item} />
                                  </td>
                                </>)}
                              </SortableRow>

                              <SortableContext items={subIdMap[item.id] ?? []} strategy={verticalListSortingStrategy}>
                                {group.children.map(child => {
                                  const subBg = editorBg('sub')
                                  return (
                                  <React.Fragment key={child.id}>
                                    <SortableRow id={child.id} style={{ height: ROW_H, boxSizing: 'border-box' }}>
                                      {(handleProps) => (<>
                                        <td className="w-7 px-2 text-brand-dimmed cursor-grab"
                                          style={{ borderBottom: '1px solid var(--color-border-subtle)', background: subBg }} {...handleProps}>
                                          <GripVertical size={13} />
                                        </td>
                                        <td className="w-16 px-1"
                                          style={{ borderBottom: '1px solid var(--color-border-subtle)', background: subBg }}>
                                          <LevelBadge level="sub" dark />
                                        </td>
                                        <td className={`px-3 text-sm ${editorBold(child) ? 'font-bold' : 'font-normal'}`}
                                          style={{ paddingLeft: 28, color: fontColor(child, 'var(--color-text-secondary)'), borderBottom: '1px solid var(--color-border-subtle)', background: subBg }}>
                                          <span className="inline-flex items-center gap-0 flex-wrap">
                                            <span className="text-brand-dimmed mr-1.5 text-xs">└</span>
                                            {child.name}
                                            <InlineSegTags schema={child} />
                                          </span>
                                        </td>
                                        <td className="px-2"
                                          style={{ borderBottom: '1px solid var(--color-border-subtle)', background: subBg }}>
                                          <SchemaActions schema={child} />
                                        </td>
                                      </>)}
                                    </SortableRow>
                                  </React.Fragment>
                                  )
                                })}
                              </SortableContext>
                            </React.Fragment>
                          )
                        }

                        // 중분류
                        const midBg = editorBg('mid')
                        return (
                          <React.Fragment key={item.id}>
                            <SortableRow id={item.id} style={{ height: ROW_H, boxSizing: 'border-box' }}>
                              {(handleProps) => (<>
                                <td className="w-7 px-2 text-brand-dimmed cursor-grab"
                                  style={{ borderBottom: '1px solid var(--color-border-subtle)', background: midBg }} {...handleProps}>
                                  <GripVertical size={13} />
                                </td>
                                <td className="w-16 px-1"
                                  style={{ borderBottom: '1px solid var(--color-border-subtle)', background: midBg }}>
                                  <LevelBadge level="mid" dark />
                                </td>
                                <td className={`px-3 text-sm ${editorBold(item) ? 'font-bold' : 'font-semibold'}`}
                                  style={{ color: fontColor(item, 'var(--color-text-primary)'), borderBottom: '1px solid var(--color-border-subtle)', background: midBg }}>
                                  <span className="inline-flex items-center flex-wrap gap-0">
                                    {item.name}
                                    <InlineSegTags schema={item} />
                                  </span>
                                </td>
                                <td className="px-2"
                                  style={{ borderBottom: '1px solid var(--color-border-subtle)', background: midBg }}>
                                  <SchemaActions schema={item} />
                                </td>
                              </>)}
                            </SortableRow>
                          </React.Fragment>
                        )
                      })}
                    </SortableContext>
                  </tbody>
                </table>
              </DndContext>
            )}
          </div>
        </div>

        {/* ── Right: 마켓 표 미리보기 (앱 테마와 무관하게 항상 라이트 고정) ── */}
        <div data-theme="light" className="rounded-2xl overflow-hidden flex flex-col" style={{ border: '1px solid #E8E4D9' }}>
          {/* 헤더: 제목 + 색상변경 버튼 — 라이트 고정(본문 흰 리스트와 어울리는 따뜻한 톤) */}
          <div className="flex items-center justify-between flex-wrap gap-2 px-4 shrink-0"
            style={{ borderBottom: '1px solid #E8E4D9', background: '#FAF8F1', height: HEADER_H, boxSizing: 'border-box' }}>
            <h2 className="text-sm font-semibold shrink-0" style={{ color: '#1A1815' }}>
              Light Mode
            </h2>
            {/* [1] 색상변경 버튼 — 항상 라이트 모드 색 편집 */}
            <div ref={lightColorRef} className="relative shrink-0">
              <button onClick={() => { setColorPanel(p => p === 'light' ? null : 'light'); setColorStep(1) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}>
                <Palette size={12} />색상변경
                <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: colorPanel === 'light' ? 'rotate(180deg)' : 'none' }} />
              </button>
              {colorPanel === 'light' && renderColorMenu('light')}
            </div>
          </div>

          {/* 미리보기 리스트 — 패널 가장자리까지 꽉 차는 흰 풀폭 영역 */}
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ background: '#FFFFFF' }}>
              {topLevelItems.length === 0 ? (
                <div className="px-3 py-8 text-center text-[11px]" style={{ color: '#A39E92' }}>
                  좌측에서 스키마를 추가하면 여기에 표시됩니다
                </div>
              ) : topLevelItems.map(item => {
                if (item.level === 'main') {
                  const group = tree.groups.find(g => g.parent.id === item.id)
                  const badge = PREVIEW_BADGE_LIGHT.main
                  const subBadge = PREVIEW_BADGE_LIGHT.sub
                  return (
                    <React.Fragment key={item.id}>
                      <div className="flex items-center gap-2 px-3"
                        style={{ background: previewLightBg('main'), borderBottom: '1px solid #EFEBE0', height: ROW_H, boxSizing: 'border-box' }}>
                        <span className="text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap"
                          style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                        <span className="text-sm" style={{ color: previewLightFont('main'), fontWeight: previewLightBold('main') ? 700 : 600 }}>
                          {item.name}
                        </span>
                      </div>
                      {group?.children.map(child => (
                        <div key={child.id} className="flex items-center gap-2 px-3"
                          style={{ background: previewLightBg('sub'), borderBottom: '1px solid #EFEBE0', height: ROW_H, boxSizing: 'border-box' }}>
                          <span className="text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap"
                            style={{ background: subBadge.bg, color: subBadge.color }}>{subBadge.label}</span>
                          <span className="text-sm inline-flex items-center"
                            style={{ color: previewLightFont('sub'), fontWeight: previewLightBold('sub') ? 600 : 400 }}>
                            <span style={{ color: '#A39E92', marginRight: 6 }}>└</span>{child.name}
                          </span>
                        </div>
                      ))}
                    </React.Fragment>
                  )
                }
                // 중분류
                const midBadge = PREVIEW_BADGE_LIGHT.mid
                return (
                  <div key={item.id} className="flex items-center gap-2 px-3"
                    style={{ background: previewLightBg('mid'), borderBottom: '1px solid #EFEBE0', height: ROW_H, boxSizing: 'border-box' }}>
                    <span className="text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap"
                      style={{ background: midBadge.bg, color: midBadge.color }}>{midBadge.label}</span>
                    <span className="text-sm" style={{ color: previewLightFont('mid'), fontWeight: previewLightBold('mid') ? 700 : 600 }}>
                      {item.name}
                    </span>
                  </div>
                )
              })}
          </div>
        </div>

      </div>

      {schemaModal.open && (
        <SchemaModal
          hotelId={hotelId}
          schemas={schemas}
          segmentationList={segmentationList}
          editItem={schemaModal.item}
          defaultLevel={schemaModal.defaultLevel}
          onClose={() => setSchemaModal({ open: false, item: null })}
          onSaved={() => setSchemaModal({ open: false, item: null })}
        />
      )}
    </div>
  )
}
