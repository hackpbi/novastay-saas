import { supabase } from '@/lib/supabase'

export interface SyncHolidaysRequest {
  startYear: number
  endYear:   number
}

export interface SyncHolidaysResponse {
  ok:               boolean
  year_range:       string
  total_rows:       number
  holidays_found:   number
  upserted:         number
  failed_api_calls: string[]
}

export interface EdgeFunctionError {
  error:   string
  detail?: string
}

export async function invokeSyncHolidays(
  params: SyncHolidaysRequest,
): Promise<SyncHolidaysResponse> {
  const { data, error } = await supabase.functions.invoke<
    SyncHolidaysResponse | EdgeFunctionError
  >('sync-holidays', { body: params })

  if (error) throw new Error(`Edge Function 호출 실패: ${error.message}`)

  if (data && 'error' in data) {
    throw new Error(data.detail ? `${data.error} (${data.detail})` : data.error)
  }

  if (!data) throw new Error('Edge Function이 빈 응답을 반환했습니다')

  return data as SyncHolidaysResponse
}
