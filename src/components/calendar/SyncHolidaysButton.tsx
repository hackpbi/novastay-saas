'use client'

import { useState } from 'react'
import { RefreshCw, X, CheckCircle2, AlertCircle, CalendarDays } from 'lucide-react'
import { useSyncHolidays } from '@/hooks/useSyncHolidays'

const CURRENT_YEAR = new Date().getFullYear()

const inputStyle = {
  color:      'var(--color-text-primary)',
  background: 'var(--color-bg-elevated)',
  border:     '1px solid var(--color-border-default)',
}

export function SyncHolidaysButton() {
  const [open,      setOpen]      = useState(false)
  const [startYear, setStartYear] = useState(CURRENT_YEAR - 2)
  const [endYear,   setEndYear]   = useState(CURRENT_YEAR + 2)

  const sync = useSyncHolidays()

  const isValid =
    startYear >= 2000 &&
    endYear   <= 2050 &&
    startYear <= endYear &&
    endYear - startYear <= 10

  const handleClose = () => {
    if (sync.isPending) return
    setOpen(false)
    setTimeout(() => sync.reset(), 200)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:-translate-y-0.5"
        style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', boxShadow: 'var(--shadow-card)' }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent-primary)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-default)')}
      >
        <CalendarDays size={15} style={{ color: 'var(--color-accent-primary)' }} />
        공휴일 동기화
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-elevated)' }}>

            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--color-border-default)' }}>
              <div className="flex items-center gap-2">
                <CalendarDays size={16} style={{ color: 'var(--color-accent-primary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  공휴일 동기화
                </span>
              </div>
              <button onClick={handleClose} disabled={sync.isPending}
                className="text-brand-muted hover:text-brand-text transition-colors disabled:opacity-30">
                <X size={18} />
              </button>
            </div>

            {/* 본문 */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-brand-muted">
                공공데이터포털(한국천문연구원) API에서 공휴일을 가져와{' '}
                <code className="px-1.5 py-0.5 rounded text-xs"
                  style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-accent-primary)' }}>
                  c07_public_calendar
                </code>
                를 갱신합니다.
              </p>

              {/* 년도 입력 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-brand-muted mb-1.5">시작 년도</label>
                  <input
                    type="number" value={startYear} min={2000} max={2050}
                    onChange={e => setStartYear(Number(e.target.value))}
                    disabled={sync.isPending}
                    className="w-full rounded-lg text-sm px-3 py-2 focus:outline-none disabled:opacity-50"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-muted mb-1.5">종료 년도</label>
                  <input
                    type="number" value={endYear} min={2000} max={2050}
                    onChange={e => setEndYear(Number(e.target.value))}
                    disabled={sync.isPending}
                    className="w-full rounded-lg text-sm px-3 py-2 focus:outline-none disabled:opacity-50"
                    style={inputStyle}
                  />
                </div>
              </div>

              {!isValid && (
                <div className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)', color: '#FBB040' }}>
                  년도 범위를 확인하세요 (2000~2050, 시작 ≤ 종료, 최대 10년)
                </div>
              )}

              {/* 성공 결과 */}
              {sync.isSuccess && (
                <div className="p-4 rounded-xl"
                  style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 size={15} style={{ color: 'var(--color-accent-primary)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-accent-primary)' }}>
                      동기화 완료
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pl-1">
                    {[
                      ['기간',    sync.data.year_range],
                      ['총 행 수', `${sync.data.total_rows.toLocaleString()}건`],
                      ['공휴일',  `${sync.data.holidays_found}건`],
                      ['DB 저장', `${sync.data.upserted.toLocaleString()}건`],
                    ].map(([k, v]) => (
                      <>
                        <dt key={`k-${k}`} className="text-brand-muted">{k}</dt>
                        <dd key={`v-${k}`} style={{ color: 'var(--color-text-primary)' }}>{v}</dd>
                      </>
                    ))}
                  </dl>
                  {sync.data.failed_api_calls.length > 0 && (
                    <p className="mt-2 text-xs" style={{ color: '#FBB040' }}>
                      ⚠ 실패한 API 호출: {sync.data.failed_api_calls.length}건
                    </p>
                  )}
                </div>
              )}

              {/* 에러 */}
              {sync.isError && (
                <div className="p-3 rounded-lg flex items-start gap-2"
                  style={{ background: 'var(--negative-bg)', border: '1px solid var(--negative-border)' }}>
                  <AlertCircle size={14} className="text-status-negative mt-0.5 shrink-0" />
                  <p className="text-xs text-status-negative">{sync.error.message}</p>
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="flex items-center justify-end gap-2 px-6 py-4"
              style={{ borderTop: '1px solid var(--color-border-default)' }}>
              <button onClick={handleClose} disabled={sync.isPending}
                className="px-4 py-2 rounded-lg text-sm hover:opacity-80 transition-all disabled:opacity-30"
                style={{ border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}>
                {sync.isSuccess ? '닫기' : '취소'}
              </button>
              {!sync.isSuccess && (
                <button
                  onClick={() => isValid && sync.mutate({ startYear, endYear })}
                  disabled={!isValid || sync.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:-translate-y-px disabled:opacity-50"
                  style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}
                >
                  <RefreshCw size={13} className={sync.isPending ? 'animate-spin' : ''} />
                  {sync.isPending ? '동기화 중...' : '실행'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
