'use client'

import { useState } from 'react'
import { ArrowUp, AlignJustify, User, ChevronLeft, ChevronRight, ArrowLeftRight } from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MetricData {
  current: number
  unit: string
  yoy: number
  yoyUnit: string
  fit: number
  grp: number
}

interface MonthData {
  month: number
  occ: MetricData
  adr: MetricData
  rev: MetricData
  forecast: { occ: number; adr: number; adrUnit: string; rev: number; revUnit: string }
  goal: { pct: number; target: number; targetUnit: string; otb: number; fc: number }
  pu: number
  rmAction: string | null
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MONTHS: MonthData[] = [
  {
    month: 4,
    occ: { current: 60.2, unit: '%', yoy: -4.6, yoyUnit: '%', fit: -1,  grp: -29 },
    adr: { current: 129,  unit: 'k', yoy: -1,   yoyUnit: 'k', fit:  0,  grp:  -9 },
    rev: { current: 167.4,unit: 'M', yoy: -13.6,yoyUnit: 'M', fit: -1,  grp: -35 },
    forecast: { occ: 63.3, adr: 125, adrUnit: 'k', rev: 171,   revUnit: 'M' },
    goal: { pct: 71, target: 197, targetUnit: 'M', otb: 60, fc: 63 },
    pu: 6, rmAction: null,
  },
  {
    month: 5,
    occ: { current: 34.3, unit: '%', yoy: -3.4, yoyUnit: '%', fit:  27, grp: -57 },
    adr: { current: 152,  unit: 'k', yoy:  3,   yoyUnit: 'k', fit:  -6, grp:  -6 },
    rev: { current: 116.7,unit: 'M', yoy: -9.6, yoyUnit: 'M', fit:  20, grp: -59 },
    forecast: { occ: 61.6, adr: 132, adrUnit: 'k', rev: 181.7, revUnit: 'M' },
    goal: { pct: 80, target: 272, targetUnit: 'M', otb: 34, fc: 62 },
    pu: 3, rmAction: null,
  },
  {
    month: 6,
    occ: { current: 18.8, unit: '%', yoy:  8.7, yoyUnit: '%', fit:  96, grp:  77 },
    adr: { current: 119,  unit: 'k', yoy: -15,  yoyUnit: 'k', fit:  -1, grp: -23 },
    rev: { current: 48.5, unit: 'M', yoy:  19.0,yoyUnit: 'M', fit:  94, grp:  37 },
    forecast: { occ: 60.3, adr: 118, adrUnit: 'k', rev: 153.2, revUnit: 'M' },
    goal: { pct: 88, target: 227, targetUnit: 'M', otb: 19, fc: 60 },
    pu: 7, rmAction: null,
  },
  {
    month: 7,
    occ: { current: 12.1, unit: '%', yoy:  15.3,yoyUnit: '%', fit:  42, grp: -12 },
    adr: { current: 145,  unit: 'k', yoy:  8,   yoyUnit: 'k', fit:   5, grp: -15 },
    rev: { current: 31.2, unit: 'M', yoy:  24.5,yoyUnit: 'M', fit:  38, grp: -18 },
    forecast: { occ: 72.1, adr: 148, adrUnit: 'k', rev: 189.3, revUnit: 'M' },
    goal: { pct: 43, target: 312, targetUnit: 'M', otb: 12, fc: 72 },
    pu: 12, rmAction: '성수기 요금 전략을 검토하세요.',
  },
  {
    month: 8,
    occ: { current: 8.4,  unit: '%', yoy:  22.1,yoyUnit: '%', fit:  67, grp:  31 },
    adr: { current: 168,  unit: 'k', yoy:  12,  yoyUnit: 'k', fit:   8, grp:  -7 },
    rev: { current: 22.8, unit: 'M', yoy:  31.2,yoyUnit: 'M', fit:  71, grp:  -9 },
    forecast: { occ: 78.5, adr: 172, adrUnit: 'k', rev: 241.6, revUnit: 'M' },
    goal: { pct: 31, target: 398, targetUnit: 'M', otb: 8,  fc: 79 },
    pu: 18, rmAction: null,
  },
  {
    month: 9,
    occ: { current: 4.2,  unit: '%', yoy:  -2.8,yoyUnit: '%', fit:  15, grp: -44 },
    adr: { current: 135,  unit: 'k', yoy:  -5,  yoyUnit: 'k', fit:  -3, grp: -18 },
    rev: { current: 8.9,  unit: 'M', yoy:  -4.1,yoyUnit: 'M', fit:  22, grp: -51 },
    forecast: { occ: 65.8, adr: 142, adrUnit: 'k', rev: 177.4, revUnit: 'M' },
    goal: { pct: 18, target: 356, targetUnit: 'M', otb: 4,  fc: 66 },
    pu: 24, rmAction: null,
  },
]

// ─── Sub-components ─────────────────────────────────────────────────────────────

function ChangeTag({ value, unit }: { value: number; unit: string }) {
  const pos = value >= 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[12px] font-semibold leading-none ${
        pos ? 'text-status-positive' : 'text-status-negative'
      }`}
      style={{
        background: pos ? 'var(--accent-badge-bg)' : 'var(--negative-bg)',
        border:     `1px solid ${pos ? 'var(--accent-badge-border)' : 'var(--negative-border)'}`,
      }}
    >
      {pos ? '▲' : '▼'}&nbsp;{Math.abs(value)}{unit}
    </span>
  )
}

function SubMetric({ label, value }: { label: string; value: number }) {
  const pos = value >= 0
  return (
    <span className="text-[11px] whitespace-nowrap">
      <span className="text-brand-dimmed">{label} </span>
      <span className={pos ? 'text-status-positive' : 'text-status-negative'}>
        {pos ? '▲' : '▼'}{Math.abs(value)}%
      </span>
    </span>
  )
}

function MetricRow({ label, value, metric }: { label: string; value: string; metric: MetricData }) {
  return (
    <div
      className="flex items-center justify-between py-3 last:border-0"
      style={{ borderBottom: '1px solid var(--divider-color)' }}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold text-brand-dimmed tracking-widest w-8 shrink-0">
          {label}
        </span>
        <span
          className="font-mono font-bold leading-none"
          style={{ fontSize: 26, color: 'var(--color-text-primary)' }}
        >
          {value}
        </span>
      </div>
      <div className="text-right space-y-1 shrink-0 ml-2">
        <p className="text-[10px] text-brand-dimmed">동기간대비</p>
        <ChangeTag value={metric.yoy} unit={metric.yoyUnit} />
        <div className="flex items-center gap-2 justify-end">
          <SubMetric label="FIT" value={metric.fit} />
          <SubMetric label="GRP" value={metric.grp} />
        </div>
      </div>
    </div>
  )
}

// ─── Month Card ─────────────────────────────────────────────────────────────────

function MonthCard({ data }: { data: MonthData }) {
  const { month, occ, adr, rev, forecast, goal, pu, rmAction } = data

  const otbBarPct  = Math.min((goal.otb / goal.pct) * 100, 100)
  const fcBarExtra = Math.max(0, Math.min(((goal.fc - goal.otb) / goal.pct) * 100, 100 - otbBarPct))

  return (
    <div
      className="flex flex-col rounded-2xl bg-bg-surface overflow-hidden"
      style={{ border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      {/* ── Month header ── */}
      <div
        className="relative px-5 pt-5 pb-2 overflow-hidden"
        style={{ background: 'var(--card-header-bg)' }}
      >
        <div
          className="pointer-events-none absolute -top-6 -left-6 w-28 h-28 rounded-full opacity-20"
          style={{ background: `radial-gradient(circle, var(--card-header-glow-color) 0%, transparent 70%)` }}
        />
        <div className="relative flex items-end gap-1.5">
          <span className="font-bold leading-none" style={{ fontSize: 54, color: 'var(--color-text-primary)' }}>
            {month}
          </span>
          <span className="text-lg font-medium text-brand-muted mb-1.5">월</span>
          <span className="text-xs font-medium text-brand-dimmed mb-2 ml-0.5">2025</span>
        </div>
      </div>

      {/* ── OCC / ADR / REV ── */}
      <div className="px-5 pb-1">
        <MetricRow label="OCC" value={`${occ.current}%`}            metric={occ} />
        <MetricRow label="ADR" value={`${adr.current}${adr.unit}`}  metric={adr} />
        <MetricRow label="REV" value={`${rev.current}${rev.unit}`}  metric={rev} />
      </div>

      {/* ── Forecasting ── */}
      <div
        className="mx-4 mt-2 rounded-xl p-3.5"
        style={{
          background: 'var(--forecast-bg)',
          border:     '1px solid var(--forecast-border)',
        }}
      >
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[10px] font-bold text-accent-primary tracking-[0.12em] uppercase">
            Forecasting
          </span>
          <div className="flex-1 h-px" style={{ background: 'var(--forecast-line)' }} />
        </div>
        <div className="grid grid-cols-3 gap-1 text-center">
          {[
            { label: 'OCC', value: `${forecast.occ}%` },
            { label: 'ADR', value: `${forecast.adr}${forecast.adrUnit}` },
            { label: 'REV', value: `${forecast.rev}${forecast.revUnit}` },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[9px] text-brand-muted mb-0.5 uppercase tracking-wider">{label}</p>
              <p className="font-mono text-sm font-semibold text-accent-primary">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Goal ── */}
      <div className="px-5 py-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-brand-dimmed tracking-widest uppercase">Goal</span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {goal.pct}%
            </span>
            <span className="text-[10px] text-brand-dimmed">/ 목표 {goal.target}{goal.targetUnit}</span>
          </div>
        </div>

        <div className="h-2 rounded-full bg-bg-elevated overflow-hidden">
          <div className="h-full flex">
            <div
              className="h-full rounded-l-full transition-all duration-700"
              style={{ width: `${otbBarPct}%`, background: 'var(--color-info)' }}
            />
            <div
              className="h-full transition-all duration-700"
              style={{
                width:        `${fcBarExtra}%`,
                background:   'var(--color-accent-primary)',
                borderRadius: fcBarExtra > 0 ? '0 2px 2px 0' : 0,
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[10px] text-brand-muted">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-info)' }} />
              OTB {goal.otb}%
            </span>
            <span className="flex items-center gap-1 text-[10px] text-brand-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-primary shrink-0" />
              FC {goal.fc}%
            </span>
          </div>
          <span className="text-[10px] text-brand-dimmed">목표 {goal.target}{goal.targetUnit}</span>
        </div>
      </div>

      {/* ── Action buttons ── */}
      {/* group: P/U 호버 시 보조 버튼 슬라이드인 */}
      <div className="px-4 pb-4 flex items-center group">
        {/* 메인 버튼 — 카드 전체 너비 */}
        <button
          className="flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[12px] font-bold transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
          style={{
            background: 'var(--gradient-cta)',
            boxShadow:  'var(--accent-btn-glow)',
            color:      '#0A0A0A',
          }}
        >
          <ArrowUp size={12} />
          P/U +{pu} rooms
        </button>

        {/* 보조 버튼 컨테이너 — 호버 전 숨김, 호버 시 슬라이드인 */}
        <div className="flex items-center gap-2 overflow-hidden max-w-0 opacity-0 group-hover:max-w-[260px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-out">
          <button
            className="flex items-center gap-1 px-3 py-2.5 rounded-full text-brand-muted text-[11px] font-medium whitespace-nowrap hover:text-brand-text transition-colors duration-150"
            style={{ border: '1px solid var(--ghost-btn-border)' }}
          >
            <AlignJustify size={11} />
            Seg
          </button>
          <button
            className="flex items-center gap-1 px-3 py-2.5 rounded-full text-brand-muted text-[11px] font-medium whitespace-nowrap hover:text-brand-text transition-colors duration-150"
            style={{ border: '1px solid var(--ghost-btn-border)' }}
          >
            <User size={11} />
            Account
          </button>
          <button
            className="flex items-center gap-1 px-3 py-2.5 rounded-full text-brand-muted text-[11px] font-medium whitespace-nowrap hover:text-brand-text transition-colors duration-150"
            style={{ border: '1px solid var(--ghost-btn-border)' }}
          >
            <ArrowLeftRight size={11} />
            vs LY
          </button>
        </div>
      </div>

      {/* ── RM Action ── */}
      <div
        className="bg-bg-secondary px-4 py-3 flex items-center gap-2.5"
        style={{ borderTop: '1px solid var(--divider-color)' }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ background: 'var(--rm-icon-bg)', border: '1px solid var(--rm-icon-border)' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              stroke="var(--rm-icon-stroke)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-accent-primary leading-none mb-0.5">RM 액션</p>
          <p className="text-[10px] text-brand-dimmed truncate">
            {rmAction ?? 'RM 액션 데이터가 준비되지 않았습니다.'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard Page ─────────────────────────────────────────────────────────────

const PAGE_SIZE   = 3
const TOTAL_PAGES = Math.ceil(MONTHS.length / PAGE_SIZE)

export default function DashboardPage() {
  const [page, setPage] = useState(0)

  const visibleMonths = MONTHS.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const startMonth    = visibleMonths[0]?.month ?? 1
  const endMonth      = visibleMonths[visibleMonths.length - 1]?.month ?? PAGE_SIZE

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          대시보드
        </h1>
        <p className="text-sm text-brand-muted mt-0.5">
          오늘 <span className="font-mono text-brand-subtle">(2026-04-23)</span> 기준 1일간&nbsp;&nbsp;
          총 <span className="font-semibold text-status-positive">+18실</span>,&nbsp;
          ADR <span className="font-semibold text-status-positive">+192k</span>,&nbsp;
          REV <span className="font-semibold text-status-positive">+3.5M</span> 픽업 되었습니다.
        </p>
      </div>



      {/* ── Month range navigator ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {startMonth}월 &mdash; {endMonth}월
          </span>
          <span className="text-xs text-brand-dimmed font-mono">2025년</span>
          <div className="flex items-center gap-1">
            {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className="rounded-full transition-all duration-200"
                style={{
                  width:      i === page ? 20 : 6,
                  height:     6,
                  background: i === page
                    ? 'var(--color-accent-primary)'
                    : 'var(--dot-inactive)',
                }}
                aria-label={`${i * PAGE_SIZE + 1}~${(i + 1) * PAGE_SIZE}월 보기`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            <ChevronLeft size={13} />
            이전
          </button>
          <button
            onClick={() => setPage(p => Math.min(TOTAL_PAGES - 1, p + 1))}
            disabled={page === TOTAL_PAGES - 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            style={{ border: '1px solid var(--control-border)' }}
          >
            다음
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* ── Month cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleMonths.map(m => (
          <MonthCard key={m.month} data={m} />
        ))}
      </div>
    </div>
  )
}
