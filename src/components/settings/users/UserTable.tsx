'use client'

import { Search, Filter, ChevronDown } from 'lucide-react'
import type { ProfileWithHotels, UserRole, Hotel } from '@/types/supabase'
import { UserRoleBadge, StatusBadge } from './UserRoleBadge'

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

interface Filters {
  search:   string
  role:     UserRole | ''
  isActive: '' | 'true' | 'false'
  hotelId:  string
}

interface UserTableProps {
  profiles:  ProfileWithHotels[]
  hotels:    Hotel[]
  filters:   Filters
  onFilters: (f: Filters) => void
  onRowClick:(profile: ProfileWithHotels) => void
}

const ROLE_OPTIONS: { value: UserRole | ''; label: string }[] = [
  { value: '',            label: '모든 역할' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin',       label: 'Admin' },
  { value: 'manager',     label: 'Manager' },
  { value: 'staff',       label: 'Staff' },
  { value: 'read_only',   label: 'Read Only' },
]

const inputClass =
  'bg-ns-sidebar border border-ns-border rounded-lg px-3 py-2 text-[13px] text-ns-text placeholder:text-ns-text-placeholder focus:outline-none focus:border-ns-accent focus:ring-2 focus:ring-[#00E5A0]/10 transition-colors'

const selectClass =
  'bg-ns-sidebar border border-ns-border rounded-lg pl-3 pr-8 py-2 text-[13px] text-ns-text focus:outline-none focus:border-ns-accent focus:ring-2 focus:ring-[#00E5A0]/10 transition-colors appearance-none cursor-pointer'

export default function UserTable({ profiles, hotels, filters, onFilters, onRowClick }: UserTableProps) {
  const set = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    onFilters({ ...filters, [key]: val })

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ns-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="이름, 이메일 검색..."
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            className={`${inputClass} pl-9 w-full`}
          />
        </div>

        <div className="relative">
          <select
            value={filters.role}
            onChange={e => set('role', e.target.value as UserRole | '')}
            className={selectClass}
          >
            {ROLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ns-text-muted pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={filters.isActive}
            onChange={e => set('isActive', e.target.value as Filters['isActive'])}
            className={selectClass}
          >
            <option value="">모든 상태</option>
            <option value="true">활성</option>
            <option value="false">비활성</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ns-text-muted pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={filters.hotelId}
            onChange={e => set('hotelId', e.target.value)}
            className={selectClass}
          >
            <option value="">모든 호텔</option>
            {hotels.map(h => (
              <option key={h.id} value={h.id}>{h.hotel_name}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ns-text-muted pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-ns-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ns-border bg-ns-sidebar">
              <th className="px-4 py-3 text-left text-[11px] font-medium text-ns-text-muted uppercase tracking-wider">이름 / 이메일</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-ns-text-muted uppercase tracking-wider">역할</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-ns-text-muted uppercase tracking-wider">소속 호텔</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-ns-text-muted uppercase tracking-wider">상태</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-ns-text-muted uppercase tracking-wider">마지막 로그인</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ns-border">
            {profiles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[13px] text-ns-text-muted">
                  조건에 맞는 유저가 없습니다.
                </td>
              </tr>
            ) : (
              profiles.map(p => (
                <tr
                  key={p.id}
                  onClick={() => onRowClick(p)}
                  className="bg-ns-card hover:bg-ns-sidebar transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3.5">
                    <div>
                      <p className="text-[13px] font-medium text-ns-text">{p.name}</p>
                      <p className="text-[12px] text-ns-text-muted mt-0.5">{p.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <UserRoleBadge role={p.role} />
                  </td>
                  <td className="px-4 py-3.5">
                    {(p as any).m10_profile_hotels?.length > 0 ? (
                      <span className="text-[13px] text-ns-text">{(p as any).m10_profile_hotels.length}개 호텔</span>
                    ) : (
                      <span className="text-[13px] text-ns-text-muted">운영자</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge active={p.is_active} />
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-ns-text-muted">
                    {formatDate(p.last_login_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
