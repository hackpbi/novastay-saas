'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as LucideIcons from 'lucide-react'
import {
  LayoutDashboard, Tag, TrendingUp, BarChart2,
  Globe, Telescope, CalendarDays, FileBarChart,
  Settings, ChevronLeft, ChevronRight, Bell,
  Sun, Moon, Users, Calendar, DoorOpen, Building2,
  CreditCard, MapPin, Star, FileText, ChevronDown,
  List, PieChart, Hotel, ClipboardList, BookOpen, Upload,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useHotel } from '@/contexts/HotelContext'

// ── Types ─────────────────────────────────────────────────────────────────────

type SaasMenu = {
  id:         string
  key:        string
  name:       string
  icon:       string | null
  path:       string | null
  menu_type:  'main' | 'sub' | 'setting'
  parent_id:  string | null
  sort_order: number
  is_active:  boolean
}

type NavItem = SaasMenu & { children: SaasMenu[] }

// ── 아이콘 매핑 ───────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  'layout-dashboard': LayoutDashboard,
  'calendar':         Calendar,
  'calendars':        CalendarDays,
  'calendar-days':    CalendarDays,
  'door':             DoorOpen,
  'users':            Users,
  'users-group':      Users,
  'trending-up':      TrendingUp,
  'chart-bar':        BarChart2,
  'settings':         Settings,
  'tag':              Tag,
  'globe':            Globe,
  'telescope':        Telescope,
  'file-bar-chart':   FileBarChart,
  'bell':             Bell,
  'building':         Building2,
  'credit-card':      CreditCard,
  'map-pin':          MapPin,
  'star':             Star,
  'file-text':        FileText,
  'list':             List,
  'pie-chart':        PieChart,
  'hotel':            Hotel,
  'clipboard-list':   ClipboardList,
  'book-open':        BookOpen,
}

function getIcon(iconKey: string | null): React.ElementType {
  if (!iconKey) return LayoutDashboard
  if (ICON_MAP[iconKey]) return ICON_MAP[iconKey]
  const comp = (LucideIcons as Record<string, any>)[iconKey]
  if (comp) return comp
  return LayoutDashboard
}

// ── buildNavTree ──────────────────────────────────────────────────────────────

function buildNavTree(menus: SaasMenu[]): NavItem[] {
  const parents = menus
    .filter(m => !m.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order)

  return parents.map(parent => ({
    ...parent,
    children: menus
      .filter(m => m.parent_id === parent.id)
      .sort((a, b) => a.sort_order - b.sort_order),
  }))
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean
  onToggle:  () => void
}

// ── 하단 고정 NavItem (서브메뉴 없는 단순 링크) ───────────────────────────────

function SimpleNavItem({
  path, label, iconKey, collapsed, badge,
}: {
  path: string; label: string; iconKey: string | null
  collapsed: boolean; badge?: boolean
}) {
  const pathname = usePathname()
  const isActive = pathname === path
  const Icon     = getIcon(iconKey)

  return (
    <Link
      href={path}
      title={collapsed ? label : undefined}
      className={[
        'relative flex items-center gap-2.5 mx-2 px-2.5 py-2 rounded-lg text-sm transition-all duration-150 group',
        isActive
          ? 'bg-[var(--accent-badge-bg)] text-accent-primary'
          : 'text-brand-muted hover:bg-[var(--overlay-hover)] hover:text-brand-text',
      ].join(' ')}
    >
      {isActive && (
        <span className="absolute left-0 inset-y-1.5 w-0.5 rounded-full bg-accent-primary" />
      )}
      <span className="relative shrink-0">
        <Icon size={16} className={`transition-colors duration-150 ${
          isActive ? 'text-accent-primary' : 'text-brand-subtle group-hover:text-brand-text'
        }`} />
        {badge && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-status-negative" />
        )}
      </span>
      {!collapsed && <span className="truncate font-medium">{label}</span>}
    </Link>
  )
}


// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname                                = usePathname()
  const router                                  = useRouter()
  const { theme, toggle }                       = useTheme()
  const { user, profile }                       = useAuth()
  const { currentHotel, hotels, switchHotel }   = useHotel()
  const isDark                                  = theme === 'dark'

  const displayName  = profile?.name ?? user?.email?.split('@')[0] ?? '관리자'
  const displayEmail = user?.email ?? 'admin@novastay.io'
  const avatarChar   = displayName.charAt(0).toUpperCase()

  // 서버/클라이언트 hydration 불일치 방지 — 마운트 후에만 테마 아이콘 렌더링
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // 메뉴 상태
  const [navItems,     setNavItems]     = useState<NavItem[]>([])
  const [menuLoading,  setMenuLoading]  = useState(true)

  // 호텔 드롭다운
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 플라이아웃
  const [flyoutMenu, setFlyoutMenu] = useState<NavItem | null>(null)
  const [flyoutPos,  setFlyoutPos]  = useState({ top: 0 })
  const flyoutRef   = useRef<HTMLDivElement>(null)
  const flyoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // 메뉴 로딩
  const loadMenus = useCallback(async () => {
    if (!profile) return
    setMenuLoading(true)
    const role = (profile as any).role as string

    try {
      if (role === 'super_admin' || role === 'admin') {
        const { data } = await (supabase as any)
          .from('m06_saas_menus')
          .select('*')
          .eq('is_active', true)
          .order('sort_order')
        setNavItems(buildNavTree(data ?? []))
      } else {
        const hotelId = currentHotel?.id
        if (!hotelId) { setNavItems([]); return }

        const [hotelMenusRes, userPermsRes] = await Promise.all([
          (supabase as any)
            .from('m07_hotel_menu_permissions')
            .select('menu_id, is_enabled')
            .eq('hotel_id', hotelId),
          (supabase as any)
            .from('m08_user_menu_permissions')
            .select('menu_id, permission')
            .eq('user_id', profile.id)
            .eq('hotel_id', hotelId),
        ])

        const hotelRows = hotelMenusRes.data ?? []
        const userRows  = userPermsRes.data  ?? []

        // m07 설정이 있으면 is_enabled=true 만 필터, 없으면 전체 허용
        const hotelEnabledIds: string[] | null =
          hotelRows.length > 0
            ? hotelRows.filter((r: any) => r.is_enabled).map((r: any) => r.menu_id)
            : null  // null = 호텔 레벨 제한 없음

        // m08 설정이 있으면 none 제외, 없으면 전체 허용
        const userPermittedIds: string[] | null =
          userRows.length > 0
            ? userRows.filter((r: any) => r.permission !== 'none').map((r: any) => r.menu_id)
            : null  // null = 유저 레벨 제한 없음

        // 양쪽 모두 null → 전체 메뉴
        // 한쪽만 null → 나머지 기준
        // 양쪽 모두 있음 → 교집합
        let visibleIds: string[] | null = null

        if (hotelEnabledIds !== null && userPermittedIds !== null) {
          visibleIds = hotelEnabledIds.filter(id => userPermittedIds.includes(id))
          if (visibleIds.length === 0) { setNavItems([]); return }
        } else if (hotelEnabledIds !== null) {
          visibleIds = hotelEnabledIds
          if (visibleIds.length === 0) { setNavItems([]); return }
        } else if (userPermittedIds !== null) {
          visibleIds = userPermittedIds
          if (visibleIds.length === 0) { setNavItems([]); return }
        }
        // visibleIds === null → 전체 조회

        let query = (supabase as any)
          .from('m06_saas_menus')
          .select('*')
          .eq('is_active', true)
          .order('sort_order')

        if (visibleIds !== null) {
          query = query.in('id', visibleIds)
        }

        const { data: menus } = await query
        setNavItems(buildNavTree(menus ?? []))
      }
    } finally {
      setMenuLoading(false)
    }
  }, [profile, currentHotel])

  useEffect(() => {
    if (profile) loadMenus()
    else setMenuLoading(false)
  }, [profile, currentHotel, loadMenus])

  // 플라이아웃 핸들러
  function openFlyout(item: NavItem, e: React.MouseEvent) {
    if (item.children.length === 0) return
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current)
    const rect = e.currentTarget.getBoundingClientRect()
    setFlyoutMenu(item)
    setFlyoutPos({ top: rect.top })
  }

  function scheduleFlyoutClose() {
    flyoutTimer.current = setTimeout(() => {
      if (!flyoutRef.current?.matches(':hover')) {
        setFlyoutMenu(null)
      }
    }, 120)
  }

  function cancelFlyoutClose() {
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // 그룹 분리 (main vs setting)
  const mainItems    = navItems.filter(m => m.menu_type !== 'setting')
  const settingItems = navItems.filter(m => m.menu_type === 'setting')

  return (
    <>
      <aside
        className="relative flex flex-col h-screen bg-bg-secondary shrink-0 transition-[width] duration-250 ease-in-out"
        style={{ width: collapsed ? 64 : 240, borderRight: '1px solid var(--color-border-default)' }}
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/zenith-logo-only.png"
              alt="Zenith Optima"
              className="shrink-0 object-contain"
              style={{ width: 28, height: 28 }}
            />
            {!collapsed && (
              <span className="font-semibold text-base tracking-tight truncate" style={{ color: 'var(--color-text-primary)' }}>
                Zenith <span style={{ color: 'var(--color-accent-primary)' }}>Optima</span>
              </span>
            )}
          </div>
        </div>

        {/* ── 호텔 드롭다운 ── */}
        {profile && !['super_admin', 'admin'].includes((profile as any).role) && currentHotel && (
          <div ref={dropdownRef} className="relative mx-2 mt-1 mb-0.5 pb-1"
            style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
            <button
              onClick={() => hotels.length > 1 && setDropdownOpen(v => !v)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all duration-150 mb-0.5"
              style={{
                border: dropdownOpen ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-default)',
                cursor: hotels.length > 1 ? 'pointer' : 'default',
              }}
              onMouseEnter={e => { if (hotels.length > 1) e.currentTarget.style.background = 'var(--overlay-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <div className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center"
                style={{ background: 'var(--accent-badge-bg)' }}>
                <Building2 size={13} className="text-accent-primary" />
              </div>
              {!collapsed && (
                <>
                  <span className="flex-1 text-left truncate text-sm font-medium"
                    style={{ color: 'var(--color-text-primary)' }}>
                    {currentHotel.hotel_name}
                  </span>
                  {hotels.length > 1 && (
                    <ChevronDown size={13} className="text-brand-muted transition-transform duration-200 shrink-0"
                      style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none' }} />
                  )}
                </>
              )}
            </button>
            {dropdownOpen && !collapsed && hotels.length > 1 && (
              <div className="absolute top-full left-0 right-0 mt-0.5 rounded-lg overflow-hidden z-50 py-1"
                style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>
                {hotels.map(hotel => (
                  <button key={hotel.id}
                    onClick={() => { switchHotel(hotel.id); setDropdownOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-all"
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${hotel.id === currentHotel.id ? 'bg-accent-primary' : 'opacity-0'}`} />
                    <span className="flex-1 text-left truncate"
                      style={{ color: hotel.id === currentHotel.id ? 'var(--color-accent-primary)' : 'var(--color-text-primary)' }}>
                      {hotel.hotel_name}
                    </span>
                    <span className="text-xs text-brand-dimmed shrink-0 capitalize">{hotel.role.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Collapse toggle */}
        <button onClick={onToggle}
          className="absolute -right-3 top-[52px] z-10 w-6 h-6 rounded-full bg-bg-elevated flex items-center justify-center text-brand-muted hover:text-accent-primary hover:border-accent-primary transition-all duration-200"
          style={{ border: '1px solid var(--color-border-default)' }}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5">
          {menuLoading ? (
            <div className="px-2 space-y-1 py-1">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-9 rounded-lg mx-0 animate-pulse" style={{ background: 'var(--overlay-hover)' }} />
              ))}
            </div>
          ) : navItems.length === 0 ? (
            !collapsed && <p className="px-4 py-4 text-xs text-brand-dimmed">접근 가능한 메뉴가 없습니다.</p>
          ) : (
            <>
              {/* Main 메뉴 */}
              {mainItems.length > 0 && (
                <div className="mb-1">
                  {!collapsed ? (
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-dimmed select-none">
                      메인
                    </p>
                  ) : (
                    <div className="mx-3 my-2 h-px" style={{ background: 'var(--color-border-subtle)' }} />
                  )}
                  {mainItems.map(item => {
                    const Icon       = getIcon(item.icon)
                    const hasChildren = item.children.length > 0
                    const isActive   = pathname === item.path ||
                      item.children.some(c => pathname === c.path)

                    if (hasChildren) {
                      return (
                        <div
                          key={item.id}
                          title={collapsed ? item.name : undefined}
                          onMouseEnter={e => openFlyout(item, e)}
                          onMouseLeave={scheduleFlyoutClose}
                          className={[
                            'relative flex items-center gap-2.5 mx-2 px-2.5 py-2 rounded-lg',
                            'text-sm transition-all duration-150 group cursor-pointer select-none',
                            isActive
                              ? 'bg-[var(--accent-badge-bg)] text-accent-primary'
                              : 'text-brand-muted hover:bg-[var(--overlay-hover)] hover:text-brand-text',
                          ].join(' ')}
                        >
                          {isActive && (
                            <span className="absolute left-0 inset-y-1.5 w-0.5 rounded-full bg-accent-primary" />
                          )}
                          <Icon size={16} className={`shrink-0 transition-colors duration-150 ${
                            isActive ? 'text-accent-primary' : 'text-brand-subtle group-hover:text-brand-text'
                          }`} />
                          {!collapsed && (
                            <>
                              <span className="flex-1 truncate font-medium">{item.name}</span>
                              <ChevronRight size={12} className="text-brand-dimmed shrink-0" />
                            </>
                          )}
                        </div>
                      )
                    }

                    return (
                      <Link
                        key={item.id}
                        href={item.path ?? '/'}
                        title={collapsed ? item.name : undefined}
                        className={[
                          'relative flex items-center gap-2.5 mx-2 px-2.5 py-2 rounded-lg',
                          'text-sm transition-all duration-150 group',
                          isActive
                            ? 'bg-[var(--accent-badge-bg)] text-accent-primary'
                            : 'text-brand-muted hover:bg-[var(--overlay-hover)] hover:text-brand-text',
                        ].join(' ')}
                      >
                        {isActive && (
                          <span className="absolute left-0 inset-y-1.5 w-0.5 rounded-full bg-accent-primary" />
                        )}
                        <Icon size={16} className={`shrink-0 transition-colors duration-150 ${
                          isActive ? 'text-accent-primary' : 'text-brand-subtle group-hover:text-brand-text'
                        }`} />
                        {!collapsed && <span className="truncate font-medium">{item.name}</span>}
                      </Link>
                    )
                  })}
                </div>
              )}

              {/* Setting 메뉴 */}
              {settingItems.length > 0 && (
                <div className="mb-1">
                  {!collapsed ? (
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-dimmed select-none">
                      설정
                    </p>
                  ) : (
                    <div className="mx-3 my-2 h-px" style={{ background: 'var(--color-border-subtle)' }} />
                  )}
                  {settingItems.map(item => {
                    const Icon      = getIcon(item.icon)
                    const isActive  = pathname === item.path
                    return (
                      <Link key={item.id} href={item.path ?? '/'}
                        title={collapsed ? item.name : undefined}
                        className={[
                          'relative flex items-center gap-2.5 mx-2 px-2.5 py-2 rounded-lg',
                          'text-sm transition-all duration-150 group',
                          isActive
                            ? 'bg-[var(--accent-badge-bg)] text-accent-primary'
                            : 'text-brand-muted hover:bg-[var(--overlay-hover)] hover:text-brand-text',
                        ].join(' ')}>
                        {isActive && <span className="absolute left-0 inset-y-1.5 w-0.5 rounded-full bg-accent-primary" />}
                        <Icon size={16} className={`shrink-0 transition-colors duration-150 ${
                          isActive ? 'text-accent-primary' : 'text-brand-subtle group-hover:text-brand-text'
                        }`} />
                        {!collapsed && <span className="truncate font-medium">{item.name}</span>}
                      </Link>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </nav>

        {/* Bottom (고정) */}
        <div className="shrink-0 py-2 space-y-0.5" style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <SimpleNavItem path="/notifications" label="알림"  iconKey="Bell"     collapsed={collapsed} badge />
          <SimpleNavItem path="/settings"      label="설정"  iconKey="Settings" collapsed={collapsed} />

          {/* Theme toggle + Upload */}
          {collapsed ? (
            <div className="flex flex-col items-center gap-1.5 mx-2 mb-1">
              <button onClick={toggle} title={mounted ? (isDark ? '라이트 모드' : '다크 모드') : '테마 전환'}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--overlay-hover)]"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                {mounted ? (isDark ? <Moon size={15} /> : <Sun size={15} />) : <Sun size={15} />}
              </button>
              <button onClick={() => router.push('/data/upload')} title="데이터 업로드"
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--overlay-hover)]"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                <Upload size={15} />
              </button>
            </div>
          ) : (
            <div className="flex gap-2 mx-2 mb-1">
              <button onClick={toggle}
                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs transition-all hover:bg-[var(--overlay-hover)]"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                {mounted
                  ? (isDark ? <><Moon size={13} />라이트모드</> : <><Sun size={13} />다크모드</>)
                  : <><Sun size={13} />다크모드</>}
              </button>
              <button onClick={() => router.push('/data/upload')}
                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs transition-all hover:bg-[var(--overlay-hover)]"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                <Upload size={13} />업로드
              </button>
            </div>
          )}

          {/* User profile */}
          <div className="mx-2 mt-1">
            <div className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-bg-tertiary ${collapsed ? 'justify-center' : ''}`}
              style={{ border: '1px solid var(--color-border-default)' }}>
              <div className="w-7 h-7 rounded-full bg-gradient-cta flex items-center justify-center text-xs font-bold shrink-0" style={{ color: '#0A0A0A' }}>
                {avatarChar}
              </div>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{displayName}</p>
                    <p className="text-[10px] text-brand-dimmed truncate">{displayEmail}</p>
                  </div>
                  <button onClick={handleLogout} className="shrink-0 text-brand-subtle hover:text-status-negative transition-colors duration-150" aria-label="로그아웃">
                    <LucideIcons.LogOut size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ── 플라이아웃 패널 (position: fixed) ── */}
      {flyoutMenu && flyoutMenu.children.length > 0 && (
        <div
          ref={flyoutRef}
          className="fixed z-50 py-1.5 rounded-xl min-w-[180px] animate-fade-in"
          style={{
            top:        flyoutPos.top,
            left:       collapsed ? 64 + 8 : 240 + 8,
            background: 'var(--color-bg-elevated)',
            border:     '1px solid var(--color-border-default)',
            boxShadow:  'var(--shadow-elevated)',
          }}
          onMouseEnter={cancelFlyoutClose}
          onMouseLeave={() => setFlyoutMenu(null)}
        >
          {/* 헤더 */}
          <div className="px-3 pb-1.5 mb-1" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-brand-dimmed">
              {flyoutMenu.name}
            </p>
          </div>

          {/* 서브메뉴 */}
          {flyoutMenu.children.map(child => {
            const ChildIcon   = getIcon(child.icon)
            const isChildActive = pathname === child.path
            return (
              <Link
                key={child.id}
                href={child.path ?? '/'}
                onClick={() => setFlyoutMenu(null)}
                className={[
                  'flex items-center gap-2.5 mx-1.5 px-2.5 py-2 rounded-lg',
                  'text-sm transition-all duration-150 group',
                  isChildActive
                    ? 'bg-[var(--accent-badge-bg)] text-accent-primary'
                    : 'text-brand-muted hover:bg-[var(--overlay-hover)] hover:text-brand-text',
                ].join(' ')}
              >
                <ChildIcon size={15} className={`shrink-0 transition-colors duration-150 ${
                  isChildActive ? 'text-accent-primary' : 'text-brand-subtle group-hover:text-brand-text'
                }`} />
                <span className="truncate font-medium">{child.name}</span>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
