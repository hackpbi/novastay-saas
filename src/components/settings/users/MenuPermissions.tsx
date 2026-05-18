'use client'

import type { SaasMenu, PermissionLevel } from '@/types/supabase'

export interface MenuPermissionRow {
  menu_id:    string
  permission: PermissionLevel
}

interface MenuPermissionsProps {
  menus:       SaasMenu[]
  permissions: MenuPermissionRow[]
  onChange:    (menuId: string, permission: PermissionLevel) => void
  defaultMenuId?:    string
  onDefaultChange?:  (menuId: string) => void
  showDefault?: boolean
}

const LEVELS: PermissionLevel[] = ['none', 'read', 'write', 'full']

const LEVEL_COLOR: Record<PermissionLevel, string> = {
  none:  'text-ns-text-muted',
  read:  'text-ns-info',
  write: 'text-ns-warning',
  full:  'text-ns-accent',
}

export default function MenuPermissions({
  menus,
  permissions,
  onChange,
  defaultMenuId,
  onDefaultChange,
  showDefault = false,
}: MenuPermissionsProps) {
  const getPermission = (menuId: string): PermissionLevel =>
    permissions.find(p => p.menu_id === menuId)?.permission ?? 'none'

  const accessibleMenus = menus.filter(m => getPermission(m.id) !== 'none')

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto] gap-2 pb-2 border-b border-ns-border">
        <span className="text-[11px] font-medium text-ns-text-muted uppercase tracking-wider">메뉴</span>
        <div className="flex gap-6 pr-1">
          {LEVELS.map(l => (
            <span key={l} className={`text-[11px] font-medium uppercase tracking-wider w-10 text-center ${LEVEL_COLOR[l]}`}>
              {l}
            </span>
          ))}
          {showDefault && <span className="text-[11px] font-medium text-ns-text-muted uppercase tracking-wider w-14 text-center">기본</span>}
        </div>
      </div>

      {menus.map(menu => {
        const current = getPermission(menu.id)
        const isDefault = defaultMenuId === menu.id
        const canBeDefault = showDefault && current !== 'none'

        return (
          <div
            key={menu.id}
            className="grid grid-cols-[1fr_auto] gap-2 items-center py-2 px-2 rounded-lg hover:bg-ns-sidebar transition-colors"
          >
            <span className="text-[13px] text-ns-text">{menu.name}</span>
            <div className="flex gap-6 pr-1">
              {LEVELS.map(level => (
                <label key={level} className="flex justify-center w-10 cursor-pointer">
                  <input
                    type="radio"
                    name={`perm-${menu.id}`}
                    value={level}
                    checked={current === level}
                    onChange={() => onChange(menu.id, level)}
                    className="sr-only"
                  />
                  <span
                    onClick={() => onChange(menu.id, level)}
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${
                      current === level
                        ? `border-current ${LEVEL_COLOR[level]}`
                        : 'border-ns-border hover:border-ns-text-muted'
                    }`}
                  >
                    {current === level && (
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        level === 'none'  ? 'bg-ns-text-muted' :
                        level === 'read'  ? 'bg-ns-info' :
                        level === 'write' ? 'bg-ns-warning' :
                        'bg-ns-accent'
                      }`} />
                    )}
                  </span>
                </label>
              ))}
              {showDefault && (
                <label className="flex justify-center w-14 cursor-pointer">
                  <input
                    type="radio"
                    name="default-page"
                    value={menu.id}
                    checked={isDefault}
                    disabled={!canBeDefault}
                    onChange={() => onDefaultChange?.(menu.id)}
                    className="sr-only"
                  />
                  <span
                    onClick={() => canBeDefault && onDefaultChange?.(menu.id)}
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                      !canBeDefault
                        ? 'border-ns-border opacity-30 cursor-not-allowed'
                        : isDefault
                        ? 'border-ns-accent bg-ns-accent cursor-pointer'
                        : 'border-ns-border hover:border-ns-accent cursor-pointer'
                    }`}
                  >
                    {isDefault && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                </label>
              )}
            </div>
          </div>
        )
      })}

      {showDefault && accessibleMenus.length === 0 && (
        <p className="text-[12px] text-ns-text-muted text-center py-4">
          read 이상 권한이 있는 메뉴가 기본 페이지로 설정 가능합니다.
        </p>
      )}
    </div>
  )
}
