'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Save, Trash2, Loader2, RefreshCw,
  GripVertical, ChevronRight, LayoutGrid,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import IconPicker, { renderIcon } from '@/components/IconPicker'

// ── Types ─────────────────────────────────────────────────────────────────────

type MenuType = 'main' | 'sub' | 'setting'

type SaasMenu = {
  id:         string
  key:        string
  name:       string
  icon:       string | null
  path:       string | null
  menu_type:  MenuType
  parent_id:  string | null
  sort_order: number
  is_active:  boolean
  created_at: string
  children?:  SaasMenu[]
}

type FormData = {
  name:      string
  icon:      string
  path:      string
  menu_type: MenuType
  parent_id: string
  sort_order: number
  is_active: boolean
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const inputCls   = 'w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 focus:outline-none transition-all'
const inputStyle = { color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }
const onFocus    = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.border    = '1px solid var(--color-accent-primary)'
  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
}
const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.border    = '1px solid var(--color-border-default)'
  e.currentTarget.style.boxShadow = 'none'
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-brand-muted mb-1.5">
        {label}
        {hint && <span className="ml-2 text-brand-dimmed font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

// ── Type Badge ────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<MenuType, string> = {
  main:    'bg-[rgba(0,229,160,0.10)] text-accent-primary',
  sub:     'bg-[rgba(74,158,255,0.10)] text-status-info',
  setting: 'bg-[rgba(159,122,234,0.10)] text-ns-purple',
}

function TypeBadge({ type }: { type: MenuType }) {
  return (
    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${TYPE_COLOR[type]}`}>
      {type}
    </span>
  )
}

// ── Sortable Menu Item ────────────────────────────────────────────────────────

function SortableMenuItem({
  menu, selected, onSelect, depth, isDropTarget,
}: {
  menu: SaasMenu; selected: SaasMenu | null; onSelect: (m: SaasMenu) => void; depth: number; isDropTarget?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: menu.id,
  })

  const style: React.CSSProperties = {
    transform:   CSS.Transform.toString(transform),
    transition,
    opacity:     isDragging ? 0.4 : 1,
    paddingLeft: depth * 20,
  }

  const isSelected = selected?.id === menu.id

  // 드래그 중 이 상위 메뉴로 드롭 예정이면 강조 (parent_id 변경 미리보기)
  const rowBorder = isDropTarget
    ? '2px dashed var(--color-accent-primary)'
    : isSelected
      ? '1px solid var(--color-accent-primary)'
      : '1px solid transparent'
  const rowBg = isDropTarget
    ? 'rgba(0, 201, 167, 0.08)'
    : isSelected
      ? 'var(--accent-badge-bg)'
      : 'transparent'

  return (
    <div ref={setNodeRef} style={style}>
      <div
        onClick={() => onSelect(menu)}
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
        style={{ background: rowBg, border: rowBorder }}
        onMouseEnter={e => { if (!isSelected && !isDropTarget) e.currentTarget.style.background = 'var(--color-bg-secondary)' }}
        onMouseLeave={e => { if (!isSelected && !isDropTarget) e.currentTarget.style.background = 'transparent' }}
      >
        <button
          {...attributes}
          {...listeners}
          className="text-brand-dimmed hover:text-brand-muted transition-colors cursor-grab active:cursor-grabbing shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical size={13} />
        </button>

        <TypeBadge type={menu.menu_type} />

        {menu.icon && (
          <span className="shrink-0" style={{ color: isSelected ? 'var(--color-accent-primary)' : 'var(--color-text-muted)' }}>
            {renderIcon(menu.icon, 14)}
          </span>
        )}

        <span className="flex-1 text-sm truncate" style={{ color: isSelected ? 'var(--color-accent-primary)' : 'var(--color-text-primary)' }}>
          {menu.name}
        </span>

        {!menu.is_active && (
          <span className="text-[10px] text-brand-dimmed shrink-0">비활성</span>
        )}

        <ChevronRight size={12} className={`shrink-0 transition-colors ${isSelected ? 'text-accent-primary' : 'text-brand-dimmed'}`} />
      </div>
    </div>
  )
}

// ── Drag Overlay Preview ──────────────────────────────────────────────────────

function MenuItemPreview({ menu }: { menu: SaasMenu }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
      style={{
        background:  'var(--color-bg-secondary)',
        border:      '1px solid var(--color-accent-primary)',
        boxShadow:   'var(--shadow-elevated)',
        cursor:      'grabbing',
      }}
    >
      <GripVertical size={13} className="text-brand-muted shrink-0" />
      <TypeBadge type={menu.menu_type} />
      {menu.icon && (
        <span className="shrink-0" style={{ color: 'var(--color-accent-primary)' }}>
          {renderIcon(menu.icon, 14)}
        </span>
      )}
      <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{menu.name}</span>
    </div>
  )
}

// ── Build tree ────────────────────────────────────────────────────────────────

function buildTree(menus: SaasMenu[]): SaasMenu[] {
  const map = new Map<string, SaasMenu>()
  const roots: SaasMenu[] = []

  menus.forEach(m => map.set(m.id, { ...m, children: [] }))
  menus.forEach(m => {
    const node = map.get(m.id)!
    if (m.parent_id && map.has(m.parent_id)) {
      map.get(m.parent_id)!.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

// DFS 순서로 id 목록 추출 (SortableContext items 순서를 시각적 렌더 순서와 일치시키기 위함)
function flattenTreeIds(nodes: SaasMenu[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    ids.push(node.id)
    if (node.children?.length) ids.push(...flattenTreeIds(node.children))
  }
  return ids
}

// ── Page ──────────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormData = {
  name: '', icon: '', path: '', menu_type: 'main',
  parent_id: '', sort_order: 1, is_active: true,
}

export default function MenuSettingsPage() {
  const router       = useRouter()
  const { profile, loading: authLoading } = useAuth()

  const [menus,    setMenus]    = useState<SaasMenu[]>([])
  const [tree,     setTree]     = useState<SaasMenu[]>([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState<SaasMenu | null>(null)
  const [isNew,    setIsNew]    = useState(false)
  const [form,     setForm]     = useState<FormData>(EMPTY_FORM)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // ── DnD 상태 ──
  const [activeId,          setActiveId]          = useState<string | null>(null)
  const [dragOverParentId,  setDragOverParentId]  = useState<string | null>(null)
  const [dndToast,          setDndToast]          = useState<string | null>(null)

  function showToast(msg: string) {
    setDndToast(msg)
    setTimeout(() => setDndToast(null), 1800)
  }

  // super_admin 전용
  useEffect(() => {
    if (authLoading) return
    if (profile && profile.role !== 'super_admin') router.replace('/dashboard')
  }, [profile, authLoading, router])

  const fetchMenus = useCallback(async () => {
    setLoading(true)
    const { data } = await (supabase as any)
      .from('m06_saas_menus')
      .select('*')
      .order('sort_order', { ascending: true })
    const list = data ?? []
    setMenus(list)
    setTree(buildTree(list))
    setLoading(false)
  }, [])

  useEffect(() => { fetchMenus() }, [fetchMenus])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const activeMenu = activeId ? menus.find(m => m.id === activeId) ?? null : null

  // 드래그 시작 — 오버레이 미리보기용
  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  // 드래그 중 — 하위 메뉴를 다른 상위 메뉴로 옮길 때 대상 상위 강조
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) { setDragOverParentId(null); return }

    const am = menus.find(m => m.id === active.id)
    const om = menus.find(m => m.id === over.id)
    if (!am || !om || !am.parent_id) { setDragOverParentId(null); return }

    // 대상 상위 메뉴 id (상위 위 → 그 상위, 하위 위 → 그 하위의 상위)
    const targetParentId = om.parent_id ? om.parent_id : om.id
    setDragOverParentId(targetParentId !== am.parent_id ? targetParentId : null)
  }

  // DnD 완료 — 상위 블록 이동 / 하위 순서 변경 / 하위 parent_id 변경
  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    setDragOverParentId(null)

    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId   = String(over.id)
    const sorted   = [...menus].sort((a, b) => a.sort_order - b.sort_order)

    const activeMenu = sorted.find(m => m.id === activeId)
    const overMenu   = sorted.find(m => m.id === overId)
    if (!activeMenu || !overMenu) return

    // 상위 메뉴 + 각 상위의 하위 목록으로 구성
    const parents = sorted.filter(m => !m.parent_id)
    const childrenByParent = new Map<string, SaasMenu[]>()
    parents.forEach(p => childrenByParent.set(p.id, sorted.filter(m => m.parent_id === p.id)))

    let reparentedId: string | null = null

    if (!activeMenu.parent_id) {
      // ── 상위 메뉴 이동: 하위를 블록으로 데리고 이동, 항상 최상위 유지 ──
      // (children이 있는 메뉴는 여기서만 처리되므로 parent_id로 절대 바뀌지 않음)
      const oldIdx = parents.findIndex(p => p.id === activeId)
      const newIdx = overMenu.parent_id
        ? parents.findIndex(p => p.id === overMenu.parent_id)
        : parents.findIndex(p => p.id === overId)
      if (oldIdx === -1 || newIdx === -1) return
      const reordered = arrayMove(parents, oldIdx, newIdx)
      parents.splice(0, parents.length, ...reordered)
    } else {
      // ── 하위 메뉴 이동 ──
      const targetParentId = overMenu.parent_id ? overMenu.parent_id : overMenu.id

      if (targetParentId === activeMenu.parent_id) {
        // 같은 상위 메뉴 내 순서 변경
        const sibs   = childrenByParent.get(targetParentId) ?? []
        const oldIdx = sibs.findIndex(m => m.id === activeId)
        const newIdx = overMenu.parent_id
          ? sibs.findIndex(m => m.id === overId)
          : sibs.length - 1 // 자기 상위 헤더에 드롭 → 맨 뒤로
        if (oldIdx !== -1 && newIdx !== -1) {
          childrenByParent.set(targetParentId, arrayMove(sibs, oldIdx, newIdx))
        }
      } else {
        // 다른 상위 메뉴로 이동 → parent_id 변경
        const oldSibs = (childrenByParent.get(activeMenu.parent_id) ?? []).filter(m => m.id !== activeId)
        childrenByParent.set(activeMenu.parent_id, oldSibs)

        const newSibs   = [...(childrenByParent.get(targetParentId) ?? [])]
        const insertIdx = overMenu.parent_id
          ? Math.max(0, newSibs.findIndex(m => m.id === overId))
          : newSibs.length // 상위 헤더에 드롭 → 맨 뒤
        newSibs.splice(insertIdx, 0, { ...activeMenu, parent_id: targetParentId })
        childrenByParent.set(targetParentId, newSibs)
        reparentedId = activeId
      }
    }

    // 트리 순서(상위 → 하위)로 평탄화하여 sort_order 재부여
    const rebuilt: SaasMenu[] = []
    parents.forEach(p => {
      rebuilt.push(p)
      ;(childrenByParent.get(p.id) ?? []).forEach(c => rebuilt.push(c))
    })
    const updated = rebuilt.map((m, i) => ({ ...m, sort_order: i + 1 }))

    // 낙관적 반영
    setMenus(updated)
    setTree(buildTree(updated))

    try {
      for (let i = 0; i < updated.length; i++) {
        const patch: Record<string, unknown> = { sort_order: i + 1 }
        if (updated[i].id === reparentedId) patch.parent_id = updated[i].parent_id
        const { error } = await (supabase as any)
          .from('m06_saas_menus')
          .update(patch)
          .eq('id', updated[i].id)
        if (error) throw error
      }
      await fetchMenus()
      if (reparentedId) showToast('상위 메뉴로 이동됐습니다.')
    } catch (e) {
      console.error('메뉴 순서 저장 실패:', e)
      showToast('메뉴 순서 저장에 실패했습니다.')
      await fetchMenus() // 원복
    }
  }

  // 메뉴 선택
  function handleSelect(menu: SaasMenu) {
    setSelected(menu)
    setIsNew(false)
    setError(null)
    setSuccess(false)
    setShowDeleteConfirm(false)
    setForm({
      name:       menu.name,
      icon:       menu.icon ?? '',
      path:       menu.path ?? '',
      menu_type:  menu.menu_type,
      parent_id:  menu.parent_id ?? '',
      sort_order: menu.sort_order,
      is_active:  menu.is_active,
    })
  }

  // 신규 추가 모드
  function handleNewMenu() {
    setSelected(null)
    setIsNew(true)
    setError(null)
    setSuccess(false)
    setShowDeleteConfirm(false)
    setForm(EMPTY_FORM)
  }

  // 저장
  const handleSave = async () => {
    if (!form.name.trim()) { setError('메뉴명을 입력해주세요.'); return }

    setSaving(true)
    setError(null)

    if (isNew) {
      // key 자동 생성 (name → kebab-case)
      const key = form.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const { error } = await (supabase as any)
        .from('m06_saas_menus')
        .insert({
          key,
          name:       form.name.trim(),
          icon:       form.icon || null,
          path:       form.path || null,
          menu_type:  form.menu_type,
          parent_id:  form.parent_id || null,
          sort_order: form.sort_order,
          is_active:  form.is_active,
        })
      if (error) { setError(error.message); setSaving(false); return }
    } else if (selected) {
      const { error } = await (supabase as any)
        .from('m06_saas_menus')
        .update({
          name:       form.name.trim(),
          icon:       form.icon || null,
          path:       form.path || null,
          menu_type:  form.menu_type,
          parent_id:  form.parent_id || null,
          sort_order: form.sort_order,
          is_active:  form.is_active,
        })
        .eq('id', selected.id)
      if (error) { setError(error.message); setSaving(false); return }
    }

    setSaving(false)
    setSuccess(true)
    await fetchMenus()
    setTimeout(() => setSuccess(false), 2000)
    if (isNew) { setIsNew(false) }
  }

  // 삭제
  const handleDelete = async () => {
    if (!selected) return
    const hasChildren = menus.some(m => m.parent_id === selected.id)
    if (hasChildren) { setError('하위 메뉴가 있으면 삭제할 수 없습니다.'); return }

    setDeleting(true)
    const { error } = await (supabase as any)
      .from('m06_saas_menus')
      .delete()
      .eq('id', selected.id)
    setDeleting(false)
    if (error) { setError(error.message); return }
    setSelected(null)
    setShowDeleteConfirm(false)
    await fetchMenus()
  }

  const topMenus = menus.filter(m => !m.parent_id)

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/hotels')}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-brand-muted hover:text-brand-text transition-colors"
            style={{ border: '1px solid var(--color-border-default)' }}
          >
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              메뉴 관리
            </h1>
            <p className="text-sm text-brand-muted mt-0.5">NovaStay SaaS의 전체 메뉴를 관리합니다.</p>
          </div>
        </div>
        <button
          onClick={handleNewMenu}
          className="flex items-center gap-1.5 rounded-full py-2 px-4 text-sm font-semibold hover:-translate-y-0.5 transition-all shrink-0"
          style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}
        >
          <Plus size={14} />
          메뉴 추가
        </button>
      </div>

      {/* ── 2컬럼 레이아웃 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">

        {/* ── 좌측: 메뉴 목록 ── */}
        <div className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--color-border-default)' }}>
          {/* 목록 헤더 */}
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-secondary)' }}>
            <div className="flex items-center gap-2">
              <LayoutGrid size={14} className="text-accent-primary" />
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                메뉴 목록
              </span>
              <span className="text-xs text-brand-dimmed">({menus.length})</span>
            </div>
            <button onClick={fetchMenus} disabled={loading}
              className="text-brand-muted hover:text-brand-text transition-colors">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="p-3" style={{ background: 'var(--color-bg-primary)' }}>
            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-brand-muted">
                <RefreshCw size={14} className="animate-spin" />
                <span className="text-sm">불러오는 중...</span>
              </div>
            ) : menus.length === 0 ? (
              <div className="text-center py-12">
                <LayoutGrid size={28} className="mx-auto text-brand-dimmed opacity-40 mb-3" />
                <p className="text-sm text-brand-muted">등록된 메뉴가 없습니다.</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={[...menus].sort((a, b) => a.sort_order - b.sort_order).map(m => m.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-0.5">
                    {[...menus].sort((a, b) => a.sort_order - b.sort_order).map(menu => (
                      <SortableMenuItem
                        key={menu.id}
                        menu={menu}
                        selected={selected}
                        onSelect={handleSelect}
                        depth={menu.parent_id ? 1 : 0}
                        isDropTarget={dragOverParentId === menu.id}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeMenu ? <MenuItemPreview menu={activeMenu} /> : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>

        {/* ── 우측: 편집 폼 ── */}
        {(selected || isNew) ? (
          <div className="rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--color-border-default)' }}>
            {/* 편집 헤더 */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-secondary)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {isNew ? '메뉴 추가' : '메뉴 편집'}
              </h3>
              {!isNew && selected && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 rounded-lg py-1.5 px-3 text-xs transition-all"
                  style={{ color: '#FC8181', border: '1px solid #3D1A1A', background: '#1A0D0D' }}
                >
                  <Trash2 size={12} />삭제
                </button>
              )}
            </div>

            <div className="p-6 space-y-4" style={{ background: 'var(--color-bg-primary)' }}>
              {/* key (읽기 전용, 편집 모드에서만) */}
              {!isNew && selected && (
                <Field label="키" hint="(코드에서 참조하므로 변경 불가)">
                  <input value={selected.key} disabled
                    className={`${inputCls} opacity-50 cursor-not-allowed`} style={inputStyle} />
                </Field>
              )}

              <Field label="메뉴명 *">
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="대시보드" className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="아이콘">
                  <IconPicker
                    value={form.icon}
                    onChange={v => setForm(p => ({ ...p, icon: v }))}
                  />
                </Field>
                <Field label="경로">
                  <input value={form.path} onChange={e => setForm(p => ({ ...p, path: e.target.value }))}
                    placeholder="/dashboard" className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="메뉴 타입">
                  <select value={form.menu_type} onChange={e => setForm(p => ({ ...p, menu_type: e.target.value as MenuType }))}
                    className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                    <option value="main">Main</option>
                    <option value="sub">Sub</option>
                    <option value="setting">Setting</option>
                  </select>
                </Field>
                <Field label="정렬 순서">
                  <input type="number" min={1} value={form.sort_order}
                    onChange={e => setForm(p => ({ ...p, sort_order: Number(e.target.value) }))}
                    className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </Field>
              </div>

              <Field label="상위 메뉴">
                <select value={form.parent_id} onChange={e => setForm(p => ({ ...p, parent_id: e.target.value }))}
                  className={inputCls} style={inputStyle} onFocus={onFocus} onBlur={onBlur}>
                  <option value="">없음 (최상위 메뉴)</option>
                  {topMenus
                    .filter(m => m.id !== selected?.id)
                    .map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                </select>
              </Field>

              <Field label="활성 여부">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                    className="relative rounded-full transition-colors cursor-pointer"
                    style={{ width: 40, height: 20, background: form.is_active ? 'var(--color-accent-primary)' : 'var(--color-border-default)' }}
                  >
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                      style={{ transform: form.is_active ? 'translateX(21px)' : 'translateX(2px)' }} />
                  </div>
                  <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {form.is_active ? '활성' : '비활성'}
                  </span>
                </label>
              </Field>

              {error && (
                <div className="px-3 py-2.5 rounded-lg text-sm text-status-negative"
                  style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
                  {error}
                </div>
              )}
              {success && (
                <div className="px-3 py-2.5 rounded-lg text-sm text-accent-primary"
                  style={{ background: 'var(--accent-badge-bg)', border: '1px solid var(--accent-badge-border)' }}>
                  저장됐습니다.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-full py-2 px-5 text-sm font-semibold hover:-translate-y-0.5 disabled:opacity-60 transition-all"
                  style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  저장
                </button>
                <button
                  onClick={() => { setSelected(null); setIsNew(false); setError(null) }}
                  className="rounded-lg py-2 px-4 text-sm hover:opacity-80 transition-all"
                  style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl min-h-[300px] gap-3"
            style={{ border: '1px dashed var(--color-border-default)' }}>
            <LayoutGrid size={32} className="text-brand-dimmed opacity-30" />
            <p className="text-sm text-brand-muted">좌측에서 메뉴를 선택하거나</p>
            <button onClick={handleNewMenu}
              className="flex items-center gap-1.5 rounded-full py-1.5 px-4 text-xs font-semibold transition-all hover:-translate-y-px"
              style={{ background: 'var(--gradient-cta)', color: '#0A0A0A' }}>
              <Plus size={12} />메뉴 추가
            </button>
          </div>
        )}
      </div>

      {/* ── 삭제 확인 모달 ── */}
      {showDeleteConfirm && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
            <div className="px-6 pt-6 pb-5 text-center">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
                <Trash2 size={20} className="text-status-negative" />
              </div>
              <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                메뉴를 삭제할까요?
              </h3>
              <p className="text-sm text-brand-muted">
                <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{selected.name}</span>
                {' '}메뉴가 삭제됩니다.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-brand-muted hover:text-brand-text transition-colors"
                style={{ border: '1px solid var(--color-border-default)' }}
              >취소</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold text-status-negative disabled:opacity-60"
                style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DnD 토스트 ── */}
      <div
        className="fixed left-1/2 bottom-8 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg text-sm font-medium"
        style={{
          background:    'var(--color-bg-secondary)',
          border:        '1px solid var(--color-accent-primary)',
          color:         'var(--color-text-primary)',
          boxShadow:     'var(--shadow-elevated)',
          pointerEvents: 'none',
          opacity:       dndToast ? 1 : 0,
          transition:    'opacity 0.25s',
        }}
      >
        {dndToast ?? ''}
      </div>
    </div>
  )
}
