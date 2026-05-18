'use client'

import type { ReactNode } from 'react'

interface PageShellProps {
  title: string
  subtitle?: string
  badge?: string
  actions?: ReactNode
  children?: ReactNode
}

export default function PageShell({ title, subtitle, badge, actions, children }: PageShellProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {badge && (
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 mb-1"
              style={{
                background: 'var(--accent-badge-bg)',
                border:     '1px solid var(--accent-badge-border)',
              }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-primary">
                {badge}
              </span>
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </h1>
          {subtitle && <p className="text-sm text-brand-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

/* ── Stat card ── */
interface StatCardProps {
  label: string
  value: string
  change?: string
  positive?: boolean
  sub?: string
}

export function StatCard({ label, value, change, positive = true, sub }: StatCardProps) {
  return (
    <div
      className="rounded-xl bg-bg-surface p-5 space-y-2"
      style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      <p className="text-xs font-medium text-brand-muted uppercase tracking-wide">{label}</p>
      <p className="font-mono text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
      <div className="flex items-center gap-2">
        {change && (
          <span className={`text-xs font-medium ${positive ? 'text-status-positive' : 'text-status-negative'}`}>
            {positive ? '▲' : '▼'} {change}
          </span>
        )}
        {sub && <span className="text-xs text-brand-dimmed">{sub}</span>}
      </div>
    </div>
  )
}

/* ── Coming soon placeholder ── */
export function ComingSoon({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl bg-bg-surface min-h-[360px] gap-4"
      style={{ border: '1px dashed var(--color-border-default)' }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-accent-primary"
        style={{
          background: 'var(--accent-badge-bg)',
          border:     '1px solid var(--accent-badge-border)',
        }}
      >
        {icon}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{title}</p>
        <p className="text-xs text-brand-muted mt-1">이 기능은 곧 제공될 예정입니다</p>
      </div>
    </div>
  )
}
