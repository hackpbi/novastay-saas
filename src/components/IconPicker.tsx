'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import * as LucideIcons from 'lucide-react'
import { Search, X, ChevronDown } from 'lucide-react'

// ── 사용 가능한 아이콘 목록 ────────────────────────────────────────────────────

const ICON_NAMES = [
  // 네비게이션 / 레이아웃
  'LayoutDashboard','LayoutGrid','Menu','Home','Sidebar','PanelLeft','Grid','List',
  'Table','Columns','Rows','AlignJustify','SlidersHorizontal','Sliders',
  // 호텔 / 숙박
  'Building','Building2','Hotel','BedDouble','BedSingle','Bath','Key','DoorOpen',
  'DoorClosed','Sofa','Tv','Wifi','Coffee','Utensils','UtensilsCrossed','ChefHat',
  // 사람 / 팀
  'User','Users','UserCheck','UserPlus','UserMinus','UserX','UserCog',
  'Contact','Briefcase','Badge','Crown','Shield','ShieldCheck',
  // 예약 / 일정
  'Calendar','CalendarDays','CalendarCheck','CalendarClock','CalendarPlus',
  'Clock','Timer','AlarmClock','Watch',
  // 수익 / 재무
  'DollarSign','CreditCard','Wallet','Receipt','Banknote','Coins',
  'TrendingUp','TrendingDown','BarChart','BarChart2','BarChart3','BarChart4',
  'LineChart','PieChart','Activity','Percent',
  // 채널 / 연결
  'Globe','Link','Link2','Plug','Plug2','Cable','Rss','Radio',
  'Smartphone','Monitor','Laptop','Tablet',
  // 보고서 / 문서
  'FileText','File','Files','FilePlus','FileCheck','FileBarChart',
  'ClipboardList','Clipboard','ClipboardCheck','BookOpen','Book','Notebook',
  // 알림 / 커뮤니케이션
  'Bell','BellRing','BellDot','Mail','MailOpen','MessageSquare','MessageCircle',
  'Send','Megaphone','Volume2','VolumeX',
  // 설정 / 관리
  'Settings','Settings2','Cog','Wrench','Tool','Hammer','Sliders',
  'Lock','LockOpen','Key','KeyRound','Fingerprint',
  // 검색 / 필터
  'Search','Filter','SortAsc','SortDesc','ArrowUpDown','Funnel',
  // 플러스 / 편집
  'Plus','PlusCircle','Minus','MinusCircle','Edit','Edit2','Edit3','Pen','Pencil',
  'Trash','Trash2','Delete','RefreshCw','RefreshCcw','RotateCcw',
  // 화살표 / 방향
  'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','ArrowUpRight',
  'ChevronLeft','ChevronRight','ChevronUp','ChevronDown',
  'ChevronsLeft','ChevronsRight','ChevronsUp','ChevronsDown',
  // 상태 / 피드백
  'Check','CheckCircle','CheckCircle2','XCircle','AlertCircle','AlertTriangle',
  'Info','HelpCircle','Loader','Loader2','RefreshCw','Zap',
  // 별점 / 즐겨찾기
  'Star','StarHalf','Heart','Bookmark','BookmarkPlus','ThumbsUp','ThumbsDown',
  // 기타 유용한 아이콘
  'Map','MapPin','Navigation','Compass','Globe2',
  'Tag','Tags','Hash','AtSign','Layers','Package',
  'Image','ImagePlus','Camera','QrCode','Barcode',
  'Sun','Moon','Cloud','Umbrella','Wind',
  'Power','PowerOff','Plug','Battery','BatteryCharging',
] as const

type IconName = typeof ICON_NAMES[number]

// ── Icon Renderer ─────────────────────────────────────────────────────────────

export function renderIcon(name: string | null, size = 16, className = '') {
  if (!name) return null
  const Comp = (LucideIcons as Record<string, any>)[name]
  if (!Comp) return null
  return <Comp size={size} className={className} />
}

// ── Icon Picker ───────────────────────────────────────────────────────────────

interface IconPickerProps {
  value:    string
  onChange: (name: string) => void
}

export default function IconPicker({ value, onChange }: IconPickerProps) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return ICON_NAMES
    const q = search.toLowerCase()
    return ICON_NAMES.filter(n => n.toLowerCase().includes(q))
  }, [search])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const SelectedIcon = value ? (LucideIcons as Record<string, any>)[value] : null

  return (
    <div ref={containerRef} className="relative">
      {/* 트리거 버튼 (인풋 스타일) */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 flex items-center gap-2 text-left transition-all focus:outline-none"
        style={{
          color:  'var(--color-text-primary)',
          border: open
            ? '1px solid var(--color-accent-primary)'
            : '1px solid var(--color-border-default)',
          boxShadow: open ? '0 0 0 3px var(--color-accent-dim)' : 'none',
        }}
      >
        <span className="w-5 h-5 flex items-center justify-center shrink-0 text-accent-primary">
          {SelectedIcon
            ? <SelectedIcon size={16} />
            : <span className="text-brand-dimmed text-xs">-</span>
          }
        </span>
        <span className="flex-1 truncate" style={{ color: value ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
          {value || '아이콘 선택'}
        </span>
        {value && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange('') }}
            className="text-brand-dimmed hover:text-brand-muted transition-colors shrink-0"
          >
            <X size={13} />
          </button>
        )}
        <ChevronDown size={13} className="text-brand-muted shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {/* 피커 드롭다운 */}
      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden animate-fade-in"
          style={{
            width:      '100%',
            minWidth:   280,
            background: 'var(--popup-bg)',
            border:     '1px solid var(--popup-border)',
            boxShadow:  'var(--shadow-elevated)',
          }}
        >
          {/* 상단 라인 */}
          <div className="h-0.5" style={{ background: 'var(--popup-top-accent)' }} />

          {/* 검색 */}
          <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--divider-color)' }}>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="아이콘 검색..."
                className="w-full rounded-md bg-bg-tertiary text-xs pl-8 pr-3 py-2 focus:outline-none transition-all"
                style={{
                  color:  'var(--color-text-primary)',
                  border: '1px solid var(--color-border-default)',
                }}
                onFocus={e => { e.currentTarget.style.border = '1px solid var(--color-accent-primary)' }}
                onBlur={e => { e.currentTarget.style.border = '1px solid var(--color-border-default)' }}
              />
            </div>
          </div>

          {/* 아이콘 그리드 */}
          <div className="overflow-y-auto p-2" style={{ maxHeight: 240 }}>
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-brand-muted py-6">검색 결과가 없습니다.</p>
            ) : (
              <div className="grid grid-cols-7 gap-0.5">
                {filtered.map(name => {
                  const Icon = (LucideIcons as Record<string, any>)[name]
                  if (!Icon) return null
                  const isSelected = value === name
                  return (
                    <button
                      key={name}
                      type="button"
                      title={name}
                      onClick={() => { onChange(name); setOpen(false) }}
                      className="flex items-center justify-center w-9 h-9 rounded-lg transition-all"
                      style={{
                        background: isSelected ? 'var(--color-accent-primary)' : 'transparent',
                        color:      isSelected ? '#0A0A0A' : 'var(--color-text-secondary)',
                      }}
                      onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = 'var(--overlay-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)' } }}
                      onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' } }}
                    >
                      <Icon size={16} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 하단 */}
          <div className="flex items-center justify-between px-3 py-2"
            style={{ borderTop: '1px solid var(--divider-color)', background: 'var(--popup-footer-bg)' }}>
            <span className="text-[10px] text-brand-dimmed">
              {filtered.length}개 아이콘
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-brand-dimmed hover:text-brand-muted transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
