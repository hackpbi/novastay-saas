import { supabase } from '@/lib/supabase'
import type { CalendarDay, CalendarMap } from './types'

export async function fetchCalendarRange(
  startDate: string,
  endDate:   string,
): Promise<CalendarDay[]> {
  const { data, error } = await (supabase as any)
    .from('c06_calendar')
    .select('date, day, rev_dow, event, is_holiday')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error) throw error
  return (data ?? []) as CalendarDay[]
}

export function calendarToMap(days: CalendarDay[]): CalendarMap {
  const map = new Map<string, CalendarDay>()
  for (const day of days) {
    map.set(day.date, day)
  }
  return map
}
