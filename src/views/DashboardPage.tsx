'use client'

import { useState, useEffect, useMemo } from 'react'
import { ArrowUp, ArrowDown, AlignJustify, User, ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usePickupData } from '@/hooks/usePickupData'
import { useOtbData } from '@/hooks/useOtbData'
import { useLyPacing, type LyPacingMode } from '@/hooks/useLyPacing'
import SegmentationModal          from '@/components/dashboard/SegmentationModal'
import AccountModal               from '@/components/dashboard/AccountModal'
import MonthlyPickupSegModal      from '@/components/dashboard/MonthlyPickupSegModal'
import MonthlyPickupSegTotalModal from '@/components/dashboard/MonthlyPickupSegTotalModal'
import MonthlyPickupAccountModal  from '@/components/dashboard/MonthlyPickupAccountModal'
import MonthlyPickupAccountTotalModal from '@/components/dashboard/MonthlyPickupAccountTotalModal'
import LyComparisonSegModal       from '@/components/dashboard/LyComparisonSegModal'
import LyComparisonAccountModal   from '@/components/dashboard/LyComparisonAccountModal'
import { useHotel } from '@/contexts/HotelContext'
import { useDateContext } from '@/contexts/DateContext'
import { useFcstDateContext } from '@/contexts/FcstDateContext'
import { useLatestConfirmedBudgetDate } from '@/hooks/useLatestConfirmedBudgetDate'
import ForecastBudgetModal from '@/components/dashboard/ForecastBudgetModal'
import ActualBudgetModal from '@/components/dashboard/ActualBudgetModal'
import GMDailyReportModal from '@/components/dashboard/GMDailyReportModal'
import { useForecastMonthly, type ForecastMonthlyRow } from '@/hooks/useForecastMonthly'
import { useBudgetMonthly, type BudgetMonthlyRow } from '@/hooks/useBudgetMonthly'
import { supabase } from '@/lib/supabase'

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
  year:  number
  month: number
  occ: MetricData
  adr: MetricData
  rev: MetricData
  forecast?: { occ: number | null; adr: number | null; revenue: number | null }
  budget?:   { occ: number | null; adr: number | null; revenue: number | null }
  pu: number
  rmAction: string | null
}

interface MonthYoyStats {
  varNightsPct:  number | null
  varRevenuePct: number | null
  varAdr:        number
  byGroup: { group: string; varPct: number | null }[]
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MONTHS: MonthData[] = [
  {
    year: 2025, month: 4,
    occ: { current: 60.2, unit: '%', yoy: -4.6, yoyUnit: '%', fit: -1,  grp: -29 },
    adr: { current: 129,  unit: 'k', yoy: -1,   yoyUnit: 'k', fit:  0,  grp:  -9 },
    rev: { current: 167.4,unit: 'M', yoy: -13.6,yoyUnit: 'M', fit: -1,  grp: -35 },
    forecast: { occ: 63.3, adr: 125_000, revenue: 171_000_000 },
    pu: 6, rmAction: null,
  },
  {
    year: 2025, month: 5,
    occ: { current: 34.3, unit: '%', yoy: -3.4, yoyUnit: '%', fit:  27, grp: -57 },
    adr: { current: 152,  unit: 'k', yoy:  3,   yoyUnit: 'k', fit:  -6, grp:  -6 },
    rev: { current: 116.7,unit: 'M', yoy: -9.6, yoyUnit: 'M', fit:  20, grp: -59 },
    forecast: { occ: 61.6, adr: 132_000, revenue: 181_700_000 },
    pu: 3, rmAction: null,
  },
  {
    year: 2025, month: 6,
    occ: { current: 18.8, unit: '%', yoy:  8.7, yoyUnit: '%', fit:  96, grp:  77 },
    adr: { current: 119,  unit: 'k', yoy: -15,  yoyUnit: 'k', fit:  -1, grp: -23 },
    rev: { current: 48.5, unit: 'M', yoy:  19.0,yoyUnit: 'M', fit:  94, grp:  37 },
    forecast: { occ: 60.3, adr: 118_000, revenue: 153_200_000 },
    pu: 7, rmAction: null,
  },
  {
    year: 2025, month: 7,
    occ: { current: 12.1, unit: '%', yoy:  15.3,yoyUnit: '%', fit:  42, grp: -12 },
    adr: { current: 145,  unit: 'k', yoy:  8,   yoyUnit: 'k', fit:   5, grp: -15 },
    rev: { current: 31.2, unit: 'M', yoy:  24.5,yoyUnit: 'M', fit:  38, grp: -18 },
    forecast: { occ: 72.1, adr: 148_000, revenue: 189_300_000 },
    pu: 12, rmAction: '성수기 요금 전략을 검토하세요.',
  },
  {
    year: 2025, month: 8,
    occ: { current: 8.4,  unit: '%', yoy:  22.1,yoyUnit: '%', fit:  67, grp:  31 },
    adr: { current: 168,  unit: 'k', yoy:  12,  yoyUnit: 'k', fit:   8, grp:  -7 },
    rev: { current: 22.8, unit: 'M', yoy:  31.2,yoyUnit: 'M', fit:  71, grp:  -9 },
    forecast: { occ: 78.5, adr: 172_000, revenue: 241_600_000 },
    pu: 18, rmAction: null,
  },
  {
    year: 2025, month: 9,
    occ: { current: 4.2,  unit: '%', yoy:  -2.8,yoyUnit: '%', fit:  15, grp: -44 },
    adr: { current: 135,  unit: 'k', yoy:  -5,  yoyUnit: 'k', fit:  -3, grp: -18 },
    rev: { current: 8.9,  unit: 'M', yoy:  -4.1,yoyUnit: 'M', fit:  22, grp: -51 },
    forecast: { occ: 65.8, adr: 142_000, revenue: 177_400_000 },
    pu: 24, rmAction: null,
  },
]

interface MonthStats {
  occ:       number
  adr:       number
  rev:       number
  otbNights: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}k`
  return n.toLocaleString('ko-KR')
}

function formatPu(n: number, type: 'nights' | 'currency'): string {
  const sign = n >= 0 ? '+' : ''
  if (type === 'currency') {
    if (Math.abs(n) >= 1_000_000) return `${sign}${(n / 1_000_000).toFixed(1)}M`
    if (Math.abs(n) >= 1_000)     return `${sign}${(n / 1_000).toFixed(0)}k`
    return `${sign}${n.toLocaleString('ko-KR')}`
  }
  return `${sign}${n.toLocaleString('ko-KR')}`
}

// 숫자 부분과 단위를 분리 (1.5배 강조용)
function formatPuParts(n: number, type: 'nights' | 'currency'): { num: string; unit: string } {
  const sign = n >= 0 ? '+' : ''
  if (type === 'nights') return { num: `${sign}${n.toLocaleString('ko-KR')}`, unit: '실' }
  if (Math.abs(n) >= 1_000_000) return { num: `${sign}${(n / 1_000_000).toFixed(1)}`, unit: 'M' }
  if (Math.abs(n) >= 1_000)     return { num: `${sign}${(n / 1_000).toFixed(0)}`,     unit: 'k' }
  return { num: `${sign}${n.toLocaleString('ko-KR')}`, unit: '' }
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function ChangeTag({ value, unit, onClick }: { value: number; unit: string; onClick?: () => void }) {
  const pos = value >= 0
  const inner = (
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
  if (!onClick) return inner
  return (
    <button
      onClick={onClick}
      title="전년 동기간 비교 보기"
      style={{ background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer', borderRadius: 4, transition: 'background 0.15s', display: 'inline-flex' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {inner}
    </button>
  )
}

function SubMetric({ label, value }: { label: string; value: number }) {
  const pos = value >= 0
  return (
    <span className="text-[10px] whitespace-nowrap" style={{ opacity: 0.65 }}>
      <span className="text-brand-dimmed">{label} </span>
      <span className={pos ? 'text-status-positive' : 'text-status-negative'}>
        {pos ? '▲' : '▼'}{Math.abs(value)}%
      </span>
    </span>
  )
}

function MetricRow({ label, value, metric, subValue, tooltip, yoyOverride, yoyLoading, onLyClick, modeLabelNode }: {
  label:          string
  value:          string
  metric:         MetricData
  subValue?:      string
  tooltip?:       string
  yoyOverride?:   { value: number | null; unit: string; fitPct?: number | null; grpPct?: number | null; showFitGrp?: boolean }
  yoyLoading?:    boolean
  onLyClick?:     () => void
  modeLabelNode?: React.ReactNode
}) {
  return (
    <div
      className="flex items-center justify-between py-3 last:border-0"
      style={{ borderBottom: '1px solid var(--divider-color)' }}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold text-brand-dimmed tracking-widest w-8 shrink-0">
          {label}
        </span>
        <div className="flex flex-col" title={tooltip}>
          <span
            className="font-mono font-bold leading-none"
            style={{ fontSize: 26, color: 'var(--color-text-primary)', cursor: tooltip ? 'help' : 'default' }}
          >
            {value}
          </span>
          {subValue && (
            <span className="text-[10px] text-brand-dimmed mt-0.5">{subValue}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-y-0.5 shrink-0 ml-2">
        {modeLabelNode}
        {yoyLoading ? (
          <span className="text-[11px] text-brand-dimmed">-</span>
        ) : yoyOverride ? (
          <>
            {yoyOverride.value !== null
              ? <ChangeTag value={yoyOverride.value} unit={yoyOverride.unit} onClick={onLyClick} />
              : <span className="text-[11px] text-brand-dimmed">-</span>
            }
            {yoyOverride.showFitGrp && (
              <div className="flex items-center gap-2 justify-end">
                <SubMetric label="FIT" value={Math.round(yoyOverride.fitPct ?? 0)} />
                <SubMetric label="GRP" value={Math.round(yoyOverride.grpPct ?? 0)} />
              </div>
            )}
          </>
        ) : (
          <>
            <ChangeTag value={metric.yoy} unit={metric.yoyUnit} onClick={onLyClick} />
            <div className="flex items-center gap-2 justify-end">
              <SubMetric label="FIT" value={metric.fit} />
              <SubMetric label="GRP" value={metric.grp} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Month Card ─────────────────────────────────────────────────────────────────

// ─── Forecasting helpers ───────────────────────────────────────────────────────

function fmtFcOcc(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${n.toFixed(1)}%`
}
function fmtFcAdr(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${Math.round(n / 1000)}k`
}
function fmtFcRevenue(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${(n / 1_000_000).toFixed(1)}M`
}
function fmtFcPct(n: number | null): string {
  if (n == null) return '-'
  return `${n.toFixed(1)}%`
}
function getAchievementColor(pct: number | null): string {
  if (pct === null) return 'var(--brand-dimmed)'
  if (pct >= 100) return 'var(--color-positive)'
  if (pct >= 95)  return '#ffc857'
  return 'var(--color-negative)'
}

// ─── Month Card ─────────────────────────────────────────────────────────────────

function MonthCard({ data, stats, loading, roomCount, yoyStats, yoyLoading, onSegClick, onAccountClick, pickupNights, onLyClick, onAchievementClick, lyMode, onLyModeToggle }: {
  data:             MonthData
  stats:            MonthStats
  loading:          boolean
  roomCount:        number
  yoyStats:         MonthYoyStats
  yoyLoading:       boolean
  onSegClick?:      (year: number, month: number) => void
  onAccountClick?:  (year: number, month: number) => void
  pickupNights:     number
  onLyClick?:              (year: number, month: number) => void
  onAchievementClick?:     (year: number, month: number) => void
  lyMode:           'v1' | 'v2'
  onLyModeToggle:   () => void
}) {
  const { year, month, occ, adr, rev, forecast, budget, pu, rmAction } = data

  const achievementOcc = forecast?.occ && budget?.occ ? (forecast.occ / budget.occ) * 100 : null
  const achievementAdr = forecast?.adr && budget?.adr ? (forecast.adr / budget.adr) * 100 : null
  const achievementRev = forecast?.revenue && budget?.revenue ? (forecast.revenue / budget.revenue) * 100 : null
  // occ, adr, rev are mock data used as fallback; stats holds live OTB values

  const occValue = loading ? '-' : roomCount === 0 ? '-' : `${stats.occ.toFixed(1)}%`
  const adrValue = loading ? '-' : formatCurrency(stats.adr)
  const revValue = loading ? '-' : formatCurrency(stats.rev)

  const fitPct = yoyStats.byGroup.find(g => g.group === 'fit')?.varPct ?? null
  const grpPct = yoyStats.byGroup.find(g => g.group === 'group')?.varPct ?? null


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
          <span className="text-xs font-medium text-brand-dimmed mb-2 ml-0.5">{year}</span>
        </div>
      </div>

      {/* ── OCC / ADR / REV ── */}
      <div className="px-5 pb-1">
        <MetricRow
          label="OCC"
          value={occValue}
          metric={occ}
          subValue={loading ? undefined : `${stats.otbNights.toLocaleString('ko-KR')} nights`}
          yoyOverride={{
            value:      yoyStats.varNightsPct !== null ? Math.round(yoyStats.varNightsPct * 10) / 10 : null,
            unit:       '%',
            fitPct,
            grpPct,
            showFitGrp: true,
          }}
          yoyLoading={yoyLoading}
          onLyClick={onLyClick ? () => onLyClick(year, month) : undefined}
          modeLabelNode={
            <span
              onClick={onLyModeToggle}
              className="text-[9px] cursor-pointer transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)', borderBottom: '1px dashed rgba(255,255,255,0.3)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.color = 'rgba(255,255,255,0.7)'; (e.currentTarget as HTMLSpanElement).style.borderBottomColor = 'rgba(255,255,255,0.5)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.color = 'rgba(255,255,255,0.4)'; (e.currentTarget as HTMLSpanElement).style.borderBottomColor = 'rgba(255,255,255,0.3)' }}
            >
              {lyMode === 'v1' ? '전년 동일자 ⇅' : '전년 동기간 ⇅'}
            </span>
          }
        />
        <MetricRow
          label="ADR"
          value={adrValue}
          metric={adr}
          tooltip={loading ? undefined : stats.adr.toLocaleString('ko-KR')}
          yoyOverride={{
            value:      Math.round(yoyStats.varAdr / 1000),
            unit:       'k',
            showFitGrp: false,
          }}
          yoyLoading={yoyLoading}
          onLyClick={onLyClick ? () => onLyClick(year, month) : undefined}
          modeLabelNode={
            <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {lyMode === 'v1' ? '전년 동일자' : '전년 동기간'}
            </span>
          }
        />
        <MetricRow
          label="REV"
          value={revValue}
          metric={rev}
          tooltip={loading ? undefined : stats.rev.toLocaleString('ko-KR')}
          yoyOverride={{
            value:      yoyStats.varRevenuePct !== null ? Math.round(yoyStats.varRevenuePct * 10) / 10 : null,
            unit:       '%',
            fitPct,
            grpPct,
            showFitGrp: true,
          }}
          yoyLoading={yoyLoading}
          onLyClick={onLyClick ? () => onLyClick(year, month) : undefined}
          modeLabelNode={
            <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {lyMode === 'v1' ? '전년 동일자' : '전년 동기간'}
            </span>
          }
        />
      </div>


      {/* ── Forecasting (FCST / BUDGET / 달성 매트릭스) ── */}
      <div className="mx-4 mt-2 rounded-xl p-3.5" style={{ background: 'var(--forecast-bg)', border: '1px solid var(--forecast-border)' }}>
        <div style={{ fontSize: 10, letterSpacing: '1.5px', fontWeight: 500, color: 'var(--color-accent-primary)', marginBottom: 10, textTransform: 'uppercase' }}>
          Forecasting
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr 1fr 1fr', gap: '8px 10px', alignItems: 'center' }}>
          {/* 헤더 */}
          <div />
          {['OCC', 'ADR', 'REV'].map(h => (
            <div key={h} style={{ fontSize: 9, color: 'var(--brand-dimmed)', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</div>
          ))}
          {/* FCST 행 */}
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--brand-dimmed)' }}>FCST</div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-accent-primary)', textAlign: 'right' }}>{fmtFcOcc(forecast?.occ)}</div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-accent-primary)', textAlign: 'right' }}>{fmtFcAdr(forecast?.adr)}</div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-accent-primary)', textAlign: 'right' }}>{fmtFcRevenue(forecast?.revenue)}</div>
          {/* BUDGET 행 */}
          <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--brand-dimmed)' }}>BUDGET</div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'right' }}>{fmtFcOcc(budget?.occ)}</div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'right' }}>{fmtFcAdr(budget?.adr)}</div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'right' }}>{fmtFcRevenue(budget?.revenue)}</div>
          {/* 달성 행 */}
          {(['달성', achievementOcc, achievementAdr, achievementRev] as const).map((val, i) => {
            const borderTop = '1px solid var(--color-border-default)'
            const pt = '7px'
            if (i === 0) return (
              <div key="달성" style={{ fontSize: 10, fontWeight: 500, color: 'var(--brand-dimmed)', borderTop, paddingTop: pt }}>달성</div>
            )
            const pct = val as number | null
            const clickable = pct !== null && !!onAchievementClick
            return (
              <button
                key={i}
                onClick={clickable ? () => onAchievementClick!(year, month) : undefined}
                disabled={!clickable}
                title={clickable ? 'FCST vs BUDGET 비교 보기' : undefined}
                className="font-mono"
                style={{
                  fontSize: 12, fontWeight: 600, textAlign: 'right',
                  color: getAchievementColor(pct),
                  borderTop, paddingTop: pt,
                  background: 'transparent', border: 'none',
                  padding: `${pt} 6px 0`, margin: 0,
                  cursor: clickable ? 'pointer' : 'default',
                  borderRadius: 4, transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'var(--color-bg-elevated)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {fmtFcPct(pct)}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Action buttons ── */}
      {/* group: P/U 호버 시 보조 버튼 슬라이드인 */}
      <div className="px-4 pb-4 flex items-center group" style={{ marginTop: 14 }}>
        {/* 메인 버튼 — 카드 전체 너비 */}
        <button
          className="flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[12px] font-bold transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
          style={{
            background: 'var(--gradient-cta)',
            boxShadow:  'var(--accent-btn-glow)',
            color:      '#0A0A0A',
          }}
        >
          {pickupNights >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          P/U {pickupNights >= 0 ? '+' : ''}{pickupNights} rooms
        </button>

        {/* 보조 버튼 컨테이너 — 호버 전 숨김, 호버 시 슬라이드인 */}
        <div className="flex items-center gap-2 overflow-hidden max-w-0 opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-out">
          <button
            onClick={() => onSegClick?.(year, month)}
            className="flex items-center gap-1 px-3 py-2.5 rounded-full text-brand-muted text-[11px] font-medium whitespace-nowrap hover:text-brand-text transition-colors duration-150"
            style={{ border: '1px solid var(--ghost-btn-border)' }}
          >
            <AlignJustify size={11} />
            Seg
          </button>
          <button
            onClick={() => onAccountClick?.(year, month)}
            className="flex items-center gap-1 px-3 py-2.5 rounded-full text-brand-muted text-[11px] font-medium whitespace-nowrap hover:text-brand-text transition-colors duration-150"
            style={{ border: '1px solid var(--ghost-btn-border)' }}
          >
            <User size={11} />
            Account
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

const PAGE_SIZE = 3

export default function DashboardPage() {
  const [page, setPage]     = useState(0)
  const [lyMode, setLyMode] = useState<LyPacingMode>('v1')
  const [segModal,     setSegModal]     = useState<{ open: boolean; year?: number; month?: number }>({ open: false })
  const [actualBudgetModal, setActualBudgetModal] = useState(false)
  const [gmReportOpen, setGmReportOpen] = useState(false)
  const [monthlyPickupSegOpen,       setMonthlyPickupSegOpen]       = useState(false)
  const [pickupViewMode,             setPickupViewMode]             = useState<'monthly' | 'total'>('total')
  const [forecastBudgetModal,        setForecastBudgetModal]        = useState<{
    open: boolean; monthKey?: string
  }>({ open: false })
  const [lyComparisonSegModal,       setLyComparisonSegModal]       = useState<{
    open: boolean; monthKey?: string
  }>({ open: false })
  const [lyComparisonAccountModal,   setLyComparisonAccountModal]   = useState<{
    open: boolean; monthKey?: string; filterSegCodes?: string[]; filterLabel?: string
  }>({ open: false })
  const [monthlyPickupAccountModal,  setMonthlyPickupAccountModal]  = useState<{
    open: boolean; filterSegCodes?: string[]; filterMonthKey?: string; filterLabel?: string; initialViewMode?: 'monthly' | 'total'
  }>({ open: false })
  const [accountModal, setAccountModal] = useState<{
    open: boolean; year?: number; month?: number
    filterSegCodes?: string[]; filterLabel?: string
  }>({ open: false })

  const { currentHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  const { vsOtbDate } = useDateContext()
  const { fcstDate, fcstDates } = useFcstDateContext()
  const { data: pickupData, loading: pickupLoading, otbDate } = usePickupData()

  const pickupDays = otbDate && vsOtbDate
    ? Math.round((new Date(otbDate).getTime() - new Date(vsOtbDate).getTime()) / 86400000)
    : 0
  const { data: otbData } = useOtbData()
  const { data: lyData, loading: lyLoading } = useLyPacing(lyMode)

  function getMonthPickup(year: number, month: number): number {
    return pickupData
      .filter(row => {
        const d = new Date(row.business_date)
        return d.getFullYear() === year
            && d.getMonth() + 1 === month
            && row.segmentation !== 'HOU'
      })
      .reduce((sum, r) => sum + (r.pu_nights ?? 0), 0)
  }

  function getMonthLyStats(year: number, month: number): MonthYoyStats {
    const monthData = lyData.filter(row => {
      const d = new Date(row.business_date)
      return d.getFullYear() === year && d.getMonth() + 1 === month && row.segmentation !== 'HOU'
    })

    const otbNights  = monthData.reduce((sum, r) => sum + (r.otb_nights  ?? 0), 0)
    const lyNights   = monthData.reduce((sum, r) => sum + (r.ly_nights   ?? 0), 0)
    const otbRevenue = monthData.reduce((sum, r) => sum + (r.otb_revenue ?? 0), 0)
    const lyRevenue  = monthData.reduce((sum, r) => sum + (r.ly_revenue  ?? 0), 0)

    const varNightsPct  = lyNights  > 0 ? (otbNights  - lyNights)  / lyNights  * 100 : null
    const varRevenuePct = lyRevenue > 0 ? (otbRevenue - lyRevenue) / lyRevenue * 100 : null

    const otbAdr = otbNights > 0 ? Math.round(otbRevenue / otbNights) : 0
    const lyAdr  = lyNights  > 0 ? Math.round(lyRevenue  / lyNights)  : 0
    const varAdr = otbAdr - lyAdr

    const byGroup = ['fit', 'group'].map(grp => {
      const grpData = monthData.filter(r => r.sorting2 === grp)
      const otbN = grpData.reduce((sum, r) => sum + (r.otb_nights ?? 0), 0)
      const lyN  = grpData.reduce((sum, r) => sum + (r.ly_nights  ?? 0), 0)
      const varPct = lyN > 0 ? (otbN - lyN) / lyN * 100 : null
      return { group: grp, varPct }
    })

    return { varNightsPct, varRevenuePct, varAdr, byGroup }
  }

  const { data: hotelDetail } = useQuery({
    queryKey: ['m03_hotel_details', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('m03_hotel_details')
        .select('room_count')
        .eq('hotel_id', hotelId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!hotelId,
    staleTime: 10 * 60 * 1000,
  })
  const roomCount = hotelDetail?.room_count ?? 0

  // ── Forecast / Budget 월별 집계 ──────────────────────────────────────────────
  const { data: budgetDate = null } = useLatestConfirmedBudgetDate(hotelId || undefined)

  // 카드가 보여주는 연도 (otbDate 기준 첫 번째 월)
  const cardYear = otbDate ? new Date(otbDate).getFullYear() : new Date().getFullYear()

  const { data: forecastRows = [] } = useForecastMonthly({
    hotelId: hotelId || undefined,
    year:    cardYear,
    updateDate: fcstDate || null,
  })

  const { data: budgetRows = [] } = useBudgetMonthly({
    hotelId: hotelId || undefined,
    year:    cardYear,
    updateDate: budgetDate,
  })

  type MonthForecast = { occ: number | null; adr: number | null; revenue: number | null }

  function aggregateByMonth(
    rows: (ForecastMonthlyRow | BudgetMonthlyRow)[],
    nightsKey: 'forecast_nights' | 'budget_nights',
    revenueKey: 'forecast_revenue' | 'budget_revenue',
    rc: number,
    yr: number,
  ): Record<number, MonthForecast> {
    const acc: Record<number, { nights: number; revenue: number }> = {}
    for (const r of rows) {
      const n = (r as any)[nightsKey] as number
      const v = (r as any)[revenueKey] as number
      if (!acc[r.month_num]) acc[r.month_num] = { nights: 0, revenue: 0 }
      acc[r.month_num].nights  += n
      acc[r.month_num].revenue += v
    }
    const result: Record<number, MonthForecast> = {}
    for (const [mStr, sum] of Object.entries(acc)) {
      const m           = Number(mStr)
      const daysInMonth = new Date(yr, m, 0).getDate()
      result[m] = {
        occ:     rc > 0 && sum.nights > 0 ? (sum.nights / (rc * daysInMonth)) * 100 : null,
        adr:     sum.nights > 0 ? sum.revenue / sum.nights : null,
        revenue: sum.revenue > 0 ? sum.revenue : null,
      }
    }
    return result
  }

  const forecastByMonth = useMemo(
    () => aggregateByMonth(forecastRows, 'forecast_nights', 'forecast_revenue', roomCount, cardYear),
    [forecastRows, roomCount, cardYear],
  )

  const budgetByMonth = useMemo(
    () => aggregateByMonth(budgetRows, 'budget_nights', 'budget_revenue', roomCount, cardYear),
    [budgetRows, roomCount, cardYear],
  )

  function getMonthStats(year: number, month: number): MonthStats {
    const monthData = otbData.filter(row => {
      const d = new Date(row.business_date)
      return d.getFullYear() === year && d.getMonth() + 1 === month
    })
    console.log(`OTB Stats ${year}-${month}:`, monthData.length,
      '첫번째:', monthData[0]?.business_date,
      'otb_nights:', monthData[0]?.otb_nights)
    const otbNights = monthData
      .filter(r => r.segmentation !== 'HOU')
      .reduce((sum, r) => sum + (r.otb_nights ?? 0), 0)
    const otbRevenue = monthData
      .reduce((sum, r) => sum + (r.otb_revenue ?? 0), 0)
    const daysInMonth = new Date(year, month, 0).getDate()
    const occ = roomCount > 0 && daysInMonth > 0
      ? (otbNights / (daysInMonth * roomCount)) * 100
      : 0
    const adr = otbNights > 0 ? Math.round(otbRevenue / otbNights) : 0
    return { occ, adr, rev: otbRevenue, otbNights }
  }

  const totalPuNights  = pickupData.reduce((sum, row) => sum + (row.pu_nights  ?? 0), 0)
  const totalPuRevenue = pickupData.reduce((sum, row) => sum + (row.pu_revenue ?? 0), 0)
  const totalPuAdr     = totalPuNights > 0 ? Math.round(totalPuRevenue / totalPuNights) : 0

  // otbDate 기준 6개월 범위 생성
  const base = otbDate ? new Date(otbDate) : new Date()
  const months: MonthData[] = Array.from({ length: 6 }, (_, i) => {
    const d    = new Date(base.getFullYear(), base.getMonth() + i, 1)
    const year = d.getFullYear()
    const mon  = d.getMonth() + 1
    const mock = MONTHS[i % MONTHS.length]
    return { ...mock, year, month: mon }
  })

  const totalPages    = Math.ceil(months.length / PAGE_SIZE)
  const visibleMonths = months.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  // otbDate 변경 시 페이지 초기화
  useEffect(() => {
    setPage(0)
  }, [otbDate])

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1" style={{ gap: 12 }}>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)', margin: 0 }}>
            대시보드
          </h1>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setActualBudgetModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '4px 12px', fontSize: 11, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#00E5A0')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)')}
            >
              Actual vs Budget vs LY
            </button>
            <button
              onClick={() => setGmReportOpen(true)}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                borderRadius: 6,
                border: '1px solid var(--color-border-default)',
                background: 'transparent',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              GM Daily Report
            </button>
          </div>
        </div>
        {pickupLoading ? (
          <div className="h-5 w-80 rounded animate-pulse" style={{ background: 'var(--color-bg-tertiary)' }} />
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            오늘 ({otbDate}) 기준{' '}
            {pickupDays > 0 ? (
              <span style={{ color: 'var(--color-accent-primary)' }}>
                <span style={{ fontSize: '1.5em', fontWeight: 700 }}>{pickupDays}</span>일간
              </span>
            ) : (
              <span style={{ color: 'var(--color-accent-primary)' }}>당일</span>
            )}
            {' '}6개월 실적은 총{' '}
            <button
              onClick={() => setMonthlyPickupSegOpen(true)}
              title="월별 픽업 추이 보기"
              style={{ color: totalPuNights >= 0 ? '#00A86B' : '#E53E3E', fontWeight: 600, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
            >
              {(() => { const { num, unit } = formatPuParts(totalPuNights, 'nights'); return <><span style={{ fontSize: '1.5em' }}>{num}</span>{unit}</> })()}
            </button>
            ,{' '}ADR{' '}
            <button
              onClick={() => setMonthlyPickupSegOpen(true)}
              title="월별 픽업 추이 보기"
              style={{ color: totalPuAdr >= 0 ? '#00A86B' : '#E53E3E', fontWeight: 600, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
            >
              {(() => { const { num, unit } = formatPuParts(totalPuAdr, 'currency'); return <><span style={{ fontSize: '1.5em' }}>{num}</span>{unit}</> })()}
            </button>
            ,{' '}REV{' '}
            <button
              onClick={() => setMonthlyPickupSegOpen(true)}
              title="월별 픽업 추이 보기"
              style={{ color: totalPuRevenue >= 0 ? '#00A86B' : '#E53E3E', fontWeight: 600, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
            >
              {(() => { const { num, unit } = formatPuParts(totalPuRevenue, 'currency'); return <><span style={{ fontSize: '1.5em' }}>{num}</span>{unit}</> })()}
            </button>
            {' '}픽업 되었습니다.
          </p>
        )}
      </div>



      {/* ── Month range navigator ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {months[0]?.month}월 &mdash; {months[months.length - 1]?.month}월
          </span>
          <span className="text-xs text-brand-dimmed font-mono">{months[0]?.year}년</span>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, i) => (
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
                aria-label={`페이지 ${i + 1}`}
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
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
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
          <MonthCard
            key={`${m.year}-${m.month}`}
            data={{ ...m, forecast: forecastByMonth[m.month], budget: budgetByMonth[m.month] }}
            stats={getMonthStats(m.year, m.month)}
            loading={pickupLoading}
            roomCount={roomCount}
            yoyStats={getMonthLyStats(m.year, m.month)}
            yoyLoading={lyLoading}
            onSegClick={(y, mo) => setSegModal({ open: true, year: y, month: mo })}
            onAccountClick={(y, mo) => setAccountModal({ open: true, year: y, month: mo })}
            onLyClick={(year, month) => {
              const monthKey = `${year}-${String(month).padStart(2, '0')}`
              setLyComparisonSegModal({ open: true, monthKey })
            }}
            onAchievementClick={(year, month) => {
              const monthKey = `${year}-${String(month).padStart(2, '0')}`
              setForecastBudgetModal({ open: true, monthKey })
            }}
            pickupNights={getMonthPickup(m.year, m.month)}
            lyMode={lyMode}
            onLyModeToggle={() => setLyMode(prev => prev === 'v1' ? 'v2' : 'v1')}
          />
        ))}
      </div>

      <ForecastBudgetModal
        open={forecastBudgetModal.open}
        onClose={() => setForecastBudgetModal({ open: false })}
        roomCount={roomCount}
        year={cardYear}
        initialMonthKey={forecastBudgetModal.monthKey}
      />

      <ActualBudgetModal
        open={actualBudgetModal}
        onClose={() => setActualBudgetModal(false)}
        hotelId={hotelId}
        roomCount={roomCount}
      />

      <LyComparisonSegModal
        open={lyComparisonSegModal.open}
        onClose={() => setLyComparisonSegModal({ open: false })}
        roomCount={roomCount}
        initialMonthKey={lyComparisonSegModal.monthKey}
        onAccountDrillDown={(segCodes, monthKey, label) => {
          setLyComparisonSegModal({ open: false })
          setLyComparisonAccountModal({ open: true, monthKey, filterSegCodes: segCodes, filterLabel: label })
        }}
      />
      <LyComparisonAccountModal
        open={lyComparisonAccountModal.open}
        onClose={() => setLyComparisonAccountModal({ open: false })}
        roomCount={roomCount}
        initialMonthKey={lyComparisonAccountModal.monthKey}
        initialFilterSegCodes={lyComparisonAccountModal.filterSegCodes}
        initialFilterLabel={lyComparisonAccountModal.filterLabel}
        onBackToSeg={
          lyComparisonAccountModal.filterSegCodes
            ? (monthKey) => {
                setLyComparisonAccountModal({ open: false })
                setLyComparisonSegModal({ open: true, monthKey })
              }
            : undefined
        }
      />

      {/* 픽업 추이 모달 — 토글(pickupViewMode)에 따라 월별/합계 전환 */}
      <MonthlyPickupSegModal
        open={monthlyPickupSegOpen && pickupViewMode === 'monthly'}
        onClose={() => setMonthlyPickupSegOpen(false)}
        roomCount={roomCount}
        onSwitchToTotal={() => setPickupViewMode('total')}
        onPickupCellClick={(segCodes, monthKey, label) => {
          setMonthlyPickupSegOpen(false)
          setMonthlyPickupAccountModal({
            open: true,
            filterSegCodes:  segCodes,
            filterMonthKey:  monthKey ?? undefined,
            filterLabel:     label,
            initialViewMode: monthKey === null ? 'total' : 'monthly',
          })
        }}
      />
      <MonthlyPickupSegTotalModal
        open={monthlyPickupSegOpen && pickupViewMode === 'total'}
        onClose={() => setMonthlyPickupSegOpen(false)}
        roomCount={roomCount}
        onSwitchToMonthly={() => setPickupViewMode('monthly')}
        onPickupCellClick={(segCodes, monthKey, label) => {
          setMonthlyPickupSegOpen(false)
          setMonthlyPickupAccountModal({
            open: true,
            filterSegCodes:  segCodes,
            filterMonthKey:  monthKey ?? undefined,
            filterLabel:     label,
            initialViewMode: monthKey === null ? 'total' : 'monthly',
          })
        }}
      />
      <MonthlyPickupAccountModal
        open={monthlyPickupAccountModal.open && pickupViewMode === 'monthly'}
        onClose={() => setMonthlyPickupAccountModal({ open: false })}
        roomCount={roomCount}
        initialFilterSegCodes={monthlyPickupAccountModal.filterSegCodes}
        initialFilterMonthKey={monthlyPickupAccountModal.filterMonthKey}
        initialFilterLabel={monthlyPickupAccountModal.filterLabel}
        initialViewMode={monthlyPickupAccountModal.initialViewMode}
        onSwitchToTotal={() => setPickupViewMode('total')}
        onBackToSeg={() => {
          setMonthlyPickupAccountModal({ open: false })
          setMonthlyPickupSegOpen(true)
        }}
      />
      <MonthlyPickupAccountTotalModal
        open={monthlyPickupAccountModal.open && pickupViewMode === 'total'}
        onClose={() => setMonthlyPickupAccountModal({ open: false })}
        roomCount={roomCount}
        initialFilterSegCodes={monthlyPickupAccountModal.filterSegCodes}
        initialFilterLabel={monthlyPickupAccountModal.filterLabel}
        onSwitchToMonthly={() => setPickupViewMode('monthly')}
        onBackToSeg={() => {
          setMonthlyPickupAccountModal({ open: false })
          setMonthlyPickupSegOpen(true)
        }}
      />

      <SegmentationModal
        open={segModal.open}
        onClose={() => setSegModal({ open: false })}
        year={segModal.year ?? 0}
        month={segModal.month ?? 0}
        roomCount={roomCount}
        onPickupCellClick={(segCodes, label, clickedYear, clickedMonth) => {
          setSegModal({ open: false })
          setAccountModal({ open: true, year: clickedYear, month: clickedMonth, filterSegCodes: segCodes, filterLabel: label })
        }}
      />
      <AccountModal
        open={accountModal.open}
        onClose={() => setAccountModal({ open: false })}
        year={accountModal.year ?? 0}
        month={accountModal.month ?? 0}
        roomCount={roomCount}
        initialFilterSegCodes={accountModal.filterSegCodes}
        initialFilterLabel={accountModal.filterLabel}
        onBackToSeg={
          accountModal.filterSegCodes
            ? (backYear, backMonth) => {
                setAccountModal({ open: false })
                setSegModal({ open: true, year: backYear, month: backMonth })
              }
            : undefined
        }
      />

      <GMDailyReportModal
        open={gmReportOpen}
        onClose={() => setGmReportOpen(false)}
        hotelId={hotelId}
        otbDate={otbDate}
      />
    </div>
  )
}
