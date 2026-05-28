import { supabase } from '@/lib/supabase'
import type { ForecastRpcRow, ForecastDayData } from './types'

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

function formatDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return `${month}/${day} (${DAY_KO[date.getDay()]})`
}

export async function fetchBaselineForecast(
  hotelId:   string,
  startDate: string,
  endDate:   string,
  today?:    string,
  loadDate?: string | null,
): Promise<ForecastRpcRow[]> {
  const { data, error } = await (supabase as any)
    .rpc('calculate_baseline_forecast_v7', {
      p_hotel_id:   hotelId,
      p_start_date: startDate,
      p_end_date:   endDate,
      ...(today    ? { p_today:     today    } : {}),
      ...(loadDate ? { p_load_date: loadDate } : {}),
    })
    .limit(100000)
  if (error) throw new Error(error.message)
  return (data ?? []) as ForecastRpcRow[]
}

export function transformRpcToTableData(rows: ForecastRpcRow[]): ForecastDayData[] {
  const dateMap = new Map<string, ForecastDayData>()

  for (const row of rows) {
    if (!dateMap.has(row.business_date)) {
      dateMap.set(row.business_date, {
        business_date: row.business_date,
        day_label:     formatDayLabel(row.business_date),
        is_actual_day: true,
        has_capped:    false,
        values:        {},
      })
    }
    const day = dateMap.get(row.business_date)!
    if (!row.is_actual) day.is_actual_day = false
    if (row.capped)     day.has_capped = true
    day.values[row.segmentation] = {
      rn:        row.forecast_rn,
      adr:       row.forecast_adr ?? 0,
      rev:       row.forecast_revenue,
      otb_rn:    row.current_otb_rn,
      otb_adr:   row.current_otb_rn > 0 ? row.current_otb_revenue / row.current_otb_rn : 0,
      otb_rev:   row.current_otb_revenue,
      is_actual: row.is_actual,
      capped:    row.capped,
    }
  }

  return Array.from(dateMap.values()).sort((a, b) =>
    a.business_date.localeCompare(b.business_date),
  )
}
