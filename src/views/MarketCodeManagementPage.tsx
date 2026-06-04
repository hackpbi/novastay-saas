'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Trash2,
  Loader2, X, Save, GripVertical, Pencil, Palette, RefreshCw, Pipette,
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

function LevelBadge({ level }: { level: SchemaLevel }) {
  const { theme } = useTheme()
  const cfg = theme === 'dark' ? LEVEL_BADGE_DARK[level] : LEVEL_BADGE_LIGHT[level]
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

function ExcelColorPicker({ value, onChange, openUp }: { value: string; onChange: (v: string) => void; openUp?: boolean }) {
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
          width: 32, height: 32, flexShrink: 0, cursor: 'pointer', borderRadius: 6,
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

function SortableRow({ id, children }: {
  id: string
  children: (handleProps: React.HTMLAttributes<HTMLElement>) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <tr ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
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
    ? { cardBg: '#111827', panelBg: '#0E1117', headBg: '#0F1623', border: '#1E2535',
        borderSubtle: 'rgba(255,255,255,0.06)', textPri: '#E2E8F0', textSec: '#94A3B8',
        textMuted: '#5A6678', accent: '#00E5A0' }
    : { cardBg: '#FFFFFF', panelBg: '#FFFFFF', headBg: '#FAF8F1', border: '#E8E4D9',
        borderSubtle: '#EFEBE0', textPri: '#1A1815', textSec: '#6B6760',
        textMuted: '#A39E92', accent: '#00B883' }

  const CELL     = { borderLeft: `1px dashed ${T.border}`, width: 64, textAlign: 'center' as const }
  const CELL_DIM = { ...CELL, color: T.textMuted, fontSize: 11 }

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
    <div className="rounded-xl overflow-hidden text-sm" style={{ border: `1px solid ${T.border}` }}>
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: T.headBg, borderBottom: `1px solid ${T.border}` }}>
            <th rowSpan={2} className="px-3 py-2 text-left text-xs font-semibold"
              style={{ color: T.textPri, verticalAlign: 'middle', borderBottom: `1px solid ${T.border}` }}>
              Segmentation
            </th>
            <th colSpan={3} className="py-2 text-center text-xs font-semibold tracking-wider"
              style={{ borderLeft: `1px solid ${T.border}`, color: T.textMuted }}>
              ACTUAL
            </th>
          </tr>
          <tr style={{ background: T.headBg, borderBottom: `1px solid ${T.border}` }}>
            {['R/N', 'ADR', 'REV'].map(h => (
              <th key={h} className="py-1.5 text-center text-[10px] font-semibold"
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
                      <td style={{ ...CELL, color: mainColor, fontWeight: mainW, fontSize: 11 }}>{fRn(gm.rn)}</td>
                      <td style={{ ...CELL, color: mainColor, fontWeight: mainW, fontSize: 11 }}>{fAdr(gm.adr)}</td>
                      <td style={{ ...CELL, color: mainColor, fontWeight: mainW, fontSize: 11 }}>{fRev(gm.rev)}</td>
                    </tr>
                    {group?.children.map(child => {
                      const sm         = subMap[child.id] ?? { rn: 0, adr: 0, rev: 0 }
                      const childColor = fontColor(child, child.color ?? T.accent)
                      const childW     = getIsBold(child) ? 600 : 400
                      return (
                        <tr key={child.id} style={{ background: getBg(child), borderBottom: `1px dashed ${T.borderSubtle}` }}>
                          <td style={{ paddingLeft: 12, color: childColor, fontWeight: childW, fontSize: 12 }}>
                            <span style={{ color: T.textMuted, marginRight: 4, fontSize: 11 }}>└</span>
                            {child.name}
                          </td>
                          <td style={{ ...CELL, color: childColor, fontWeight: childW, fontSize: 11 }}>{fRn(sm.rn)}</td>
                          <td style={{ ...CELL, color: childColor, fontWeight: childW, fontSize: 11 }}>{fAdr(sm.adr)}</td>
                          <td style={{ ...CELL, color: childColor, fontWeight: childW, fontSize: 11 }}>{fRev(sm.rev)}</td>
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
                  <td style={{ ...CELL, color: midColor, fontWeight: midW, fontSize: 11 }}>{fRn(mm.rn)}</td>
                  <td style={{ ...CELL, color: midColor, fontWeight: midW, fontSize: 11 }}>{fAdr(mm.adr)}</td>
                  <td style={{ ...CELL, color: midColor, fontWeight: midW, fontSize: 11 }}>{fRev(mm.rev)}</td>
                </tr>
              )
            })
          })()}

          {/* 빈 상태 */}
          {tree.groups.length === 0 && tree.mids.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-xs" style={{ color: T.textMuted }}>
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
                  <td className={`px-3 py-2 text-sm ${totalBold}`} style={{ color: totalColor }}>Total</td>
                  <td style={{ ...CELL_DIM, color: totalColor }}>{fRn(grandRn)}</td>
                  <td style={{ ...CELL_DIM, color: totalColor }}>{fAdr(grandAdr)}</td>
                  <td style={{ ...CELL_DIM, color: totalColor }}>{fRev(grandRev)}</td>
                </tr>

                {/* Occ */}
                <tr style={{ borderTop: `1px solid ${T.border}`, background: T.cardBg }}>
                  <td className={`px-3 py-1.5 text-sm ${totalBold}`} style={{ color: totalColor, borderBottom: `1px dashed ${T.borderSubtle}` }}>
                    Occ
                  </td>
                  <td colSpan={3} style={{ ...CELL_DIM, color: totalColor, textAlign: 'center', borderLeft: `1px dashed ${T.border}`, borderBottom: `1px dashed ${T.borderSubtle}` }}>
                    {occ.toFixed(1)}%
                  </td>
                </tr>

                {/* Rev.PAR */}
                <tr style={{ background: T.cardBg }}>
                  <td className={`px-3 py-1.5 text-sm ${totalBold}`} style={{ color: totalColor }}>Rev.PAR</td>
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
  const fontColor = (item: TableSchema, fallback: string) => {
    const ov = previewOverrides[item.level]
    if (ov) return isDark ? (ov.dark ?? fallback) : (ov.light ?? fallback)
    return isDark ? (item.font_dark_color ?? fallback) : (item.font_light_color ?? fallback)
  }
  const editorBg = (level: SchemaLevel) => {
    const ov = previewOverrides[level]
    const lc = levelColors[level]
    const d  = LEVEL_DEFAULTS[level]
    const bgDark  = ov?.bgDark  ?? lc.bgDark  ?? d.bgDark
    const bgLight = ov?.bgLight ?? lc.bgLight ?? d.bgLight
    return isDark ? bgDark : bgLight
  }
  const editorBold = (item: TableSchema) => {
    const ov = previewOverrides[item.level]
    return ov ? ov.bold : item.is_bold
  }

  const [schemaModal,   setSchemaModal]   = useState<{ open: boolean; item: TableSchema | null; defaultLevel?: SchemaLevel }>({ open: false, item: null })
  const [segPickerId,   setSegPickerId]   = useState<string | null>(null)
  const [segSearch,     setSegSearch]     = useState('')
  const [selectedLevel, setSelectedLevel] = useState<SchemaLevel>('main')
  const [previewOverrides, setPreviewOverrides] = useState<Partial<Record<SchemaLevel, { bgDark: string|null; bgLight: string|null; dark: string|null; light: string|null; bold: boolean } | null>>>({})
  const segPickerRef  = useRef<HTMLDivElement>(null)

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
    await (supabase as any)
      .from('c05_market_table_schema')
      .update({ bg_dark_color: bgDark || null, bg_light_color: bgLight || null,
                font_dark_color: dark || null, font_light_color: light || null, is_bold: bold })
      .eq('hotel_id', hotelId)
      .eq('level', level)
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.marketTableSchema(hotelId) })
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
      await saveLevelColors(level, ov.bgDark ?? '', ov.bgLight ?? '', ov.dark ?? '', ov.light ?? '', ov.bold ?? false)
    }
  }

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
            기본 테이블 설정
          </h1>
          <p className="text-sm text-brand-muted mt-0.5">모든 페이지의 마켓 세그먼트 표의 순서 및 마켓코드를 관리합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6 items-stretch">

        {/* ── Left: 마켓 표 스키마 ── */}
        <div className="rounded-2xl overflow-hidden h-full" style={{ border: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3"
            style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-secondary)' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Market Segment Setup
              </h2>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.marketTableSchema(hotelId) })}
                disabled={schemaLoading}
                className="text-brand-muted hover:text-brand-text transition-colors disabled:opacity-40"
              >
                <RefreshCw size={13} className={schemaLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)' }}>
              <span className="text-xs text-brand-muted shrink-0">추가하기</span>
              <div style={{ width: 1, height: 14, background: 'var(--color-border-default)', flexShrink: 0 }} />
              <div className="flex items-center gap-1.5">
                {(['main', 'mid', 'sub'] as SchemaLevel[]).map(level => {
                  const cfg = levelBadge(level)
                  return (
                    <button key={level}
                      onClick={() => setSchemaModal({ open: true, item: null, defaultLevel: level })}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                      <Plus size={10} />{cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div>
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
                              <SortableRow id={item.id}>
                                {(handleProps) => (<>
                                  <td className="w-7 px-2 py-3 text-brand-dimmed cursor-grab"
                                    style={{ background: mainBg }} {...handleProps}>
                                    <GripVertical size={13} />
                                  </td>
                                  <td className="w-16 px-1 py-3" style={{ background: mainBg }}>
                                    <LevelBadge level="main" />
                                  </td>
                                  <td className={`px-3 py-3 text-sm ${editorBold(item) ? 'font-bold' : 'font-semibold'}`}
                                    style={{ color: fontColor(item, 'var(--color-text-primary)'), background: mainBg }}>
                                    {item.name}
                                  </td>
                                  <td className="px-2 py-3" style={{ background: mainBg }}>
                                    <SchemaActions schema={item} />
                                  </td>
                                </>)}
                              </SortableRow>

                              <SortableContext items={subIdMap[item.id] ?? []} strategy={verticalListSortingStrategy}>
                                {group.children.map(child => {
                                  const subBg = editorBg('sub')
                                  return (
                                  <React.Fragment key={child.id}>
                                    <SortableRow id={child.id}>
                                      {(handleProps) => (<>
                                        <td className="w-7 px-2 py-2.5 text-brand-dimmed cursor-grab"
                                          style={{ borderBottom: '1px solid var(--color-border-subtle)', background: subBg }} {...handleProps}>
                                          <GripVertical size={13} />
                                        </td>
                                        <td className="w-16 px-1 py-2.5"
                                          style={{ borderBottom: '1px solid var(--color-border-subtle)', background: subBg }}>
                                          <LevelBadge level="sub" />
                                        </td>
                                        <td className={`px-3 py-2.5 text-sm ${editorBold(child) ? 'font-bold' : 'font-normal'}`}
                                          style={{ paddingLeft: 28, color: fontColor(child, 'var(--color-text-secondary)'), borderBottom: '1px solid var(--color-border-subtle)', background: subBg }}>
                                          <span className="inline-flex items-center gap-0 flex-wrap">
                                            <span className="text-brand-dimmed mr-1.5 text-xs">└</span>
                                            {child.name}
                                            <InlineSegTags schema={child} />
                                          </span>
                                        </td>
                                        <td className="px-2 py-2.5"
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
                            <SortableRow id={item.id}>
                              {(handleProps) => (<>
                                <td className="w-7 px-2 py-3 text-brand-dimmed cursor-grab"
                                  style={{ borderBottom: '1px solid var(--color-border-subtle)', background: midBg }} {...handleProps}>
                                  <GripVertical size={13} />
                                </td>
                                <td className="w-16 px-1 py-3"
                                  style={{ borderBottom: '1px solid var(--color-border-subtle)', background: midBg }}>
                                  <LevelBadge level="mid" />
                                </td>
                                <td className={`px-3 py-3 text-sm ${editorBold(item) ? 'font-bold' : 'font-semibold'}`}
                                  style={{ color: fontColor(item, 'var(--color-text-primary)'), borderBottom: '1px solid var(--color-border-subtle)', background: midBg }}>
                                  <span className="inline-flex items-center flex-wrap gap-0">
                                    {item.name}
                                    <InlineSegTags schema={item} />
                                  </span>
                                </td>
                                <td className="px-2 py-3"
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

        {/* ── Right: 마켓 표 미리보기 ── */}
        <div className="rounded-2xl overflow-hidden h-full" style={{ border: '1px solid var(--color-border-default)' }}>
          {/* 헤더: 제목 + 컨트롤 */}
          <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2.5"
            style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-secondary)' }}>
            <h2 className="text-sm font-semibold shrink-0" style={{ color: 'var(--color-text-primary)' }}>
              미리보기
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* 레벨 칩 */}
              <div className="flex gap-1">
                {(['main', 'mid', 'sub'] as SchemaLevel[]).map(level => {
                  const cfg = levelBadge(level); const on = selectedLevel === level
                  return (
                    <button key={level} onClick={() => setSelectedLevel(level)}
                      className="px-2 py-0.5 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-80"
                      style={{ background: on ? cfg.bg : 'transparent', color: on ? cfg.color : 'var(--color-text-muted)', border: `1px solid ${on ? cfg.border : 'var(--color-border-default)'}` }}>
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
              {/* 구분선 */}
              <div style={{ width: 1, height: 18, background: 'var(--color-border-default)', flexShrink: 0 }} />
              {/* 라이트 */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>라이트</span>
                <ExcelColorPicker value={curVal.bgLight} onChange={v => setField('bgLight', v)} />
                <ExcelColorPicker value={curVal.light}   onChange={v => setField('light', v)} />
              </div>
              {/* 다크 */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>다크</span>
                <ExcelColorPicker value={curVal.bgDark} onChange={v => setField('bgDark', v)} />
                <ExcelColorPicker value={curVal.dark}   onChange={v => setField('dark', v)} />
              </div>
              {/* 굵게 */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>굵게</span>
                <Toggle value={curVal.bold} onChange={v => setField('bold', v)} />
              </div>
            </div>
          </div>

          {/* 표 + 저장/취소 */}
          <div className="p-4" style={{ background: 'var(--color-bg-primary)' }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <MarketPreviewTable tree={tree} isDark={false} overrides={previewOverrides} />
              </div>
              <div>
                <MarketPreviewTable tree={tree} isDark={true} overrides={previewOverrides} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleSaveColors} className="flex-1 text-sm py-2 rounded-lg font-semibold"
                style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>저장</button>
              <button onClick={handleCancelColors} className="px-6 text-sm py-2 rounded-lg"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>취소</button>
              <button onClick={handleResetLevel} className="px-4 text-sm py-2 rounded-lg"
                style={{ border: '1px dashed var(--color-border-default)', color: 'var(--color-text-muted)' }}>초기화</button>
            </div>
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
