import type { CSSProperties } from 'react'

export function generateCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay    = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const days: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  return days
}

export function isFriOrSat(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month - 1, day).getDay()
  return dow === 5 || dow === 6
}

export function getDow(year: number, month: number, day: number): string {
  return ['일','월','화','수','목','금','토'][new Date(year, month - 1, day).getDay()]
}

export function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

export function dayCellStyle(
  year:   number,
  month:  number,
  day:    number,
  extra?: CSSProperties,
): CSSProperties {
  return {
    border:       '0.5px solid var(--color-border-tertiary)',
    borderRadius: 'var(--border-radius-md)',
    padding:      '5px',
    minHeight:    70,
    cursor:       'pointer',
    position:     'relative',
    background:   isFriOrSat(year, month, day) ? 'rgba(0,229,160,0.04)' : undefined,
    transition:   'border-color 0.1s',
    ...extra,
  }
}

export const DOW_LABELS = ['일','월','화','수','목','금','토'] as const
