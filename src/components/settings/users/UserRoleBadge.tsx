'use client'

import type { UserRole, PermissionLevel } from '@/types/supabase'

// ── Role ─────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  manager:     'Manager',
  staff:       'Staff',
  read_only:   'Read Only',
  upload:      'Upload',
}

const ROLE_STYLE: Record<UserRole, string> = {
  super_admin: 'bg-[#130E29] text-ns-purple border border-[#1E1040]',
  admin:       'bg-ns-accent-surface text-ns-accent border border-ns-accent-border',
  manager:     'bg-[#0D1929] text-ns-info border border-[#0D2540]',
  staff:       'bg-ns-card text-ns-text-secondary border border-ns-border',
  read_only:   'bg-ns-card text-ns-text-muted border border-ns-border',
  upload:      'bg-ns-card text-ns-text-muted border border-ns-border',
}

export function UserRoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${ROLE_STYLE[role]}`}>
      {ROLE_LABEL[role]}
    </span>
  )
}

// ── Permission ────────────────────────────────────────────────────────────────

const PERM_LABEL: Record<PermissionLevel, string> = {
  none:  'None',
  read:  'Read',
  write: 'Write',
  full:  'Full',
}

const PERM_STYLE: Record<PermissionLevel, string> = {
  none:  'bg-ns-card text-ns-text-muted',
  read:  'bg-[#0D1929] text-ns-info',
  write: 'bg-[#1A1400] text-ns-warning',
  full:  'bg-ns-accent-surface text-ns-accent',
}

export function PermissionBadge({ permission }: { permission: PermissionLevel }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${PERM_STYLE[permission]}`}>
      {PERM_LABEL[permission]}
    </span>
  )
}

// ── Status Badge ──────────────────────────────────────────────────────────────

export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-ns-accent-surface text-ns-accent border border-ns-accent-border">
      <span className="w-1.5 h-1.5 rounded-full bg-ns-accent" />
      활성
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-ns-card text-ns-text-muted border border-ns-border">
      <span className="w-1.5 h-1.5 rounded-full bg-ns-text-muted" />
      비활성
    </span>
  )
}
