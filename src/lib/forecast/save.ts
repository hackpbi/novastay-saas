import { supabase } from '@/lib/supabase'

export type EditedValues = Map<string, { rn?: number; adr?: number }>

export function makeEditKey(date: string, segCode: string): string {
  return `${date}::${segCode}`
}

export type SaveEdit = {
  business_date: string
  segmentation:  string
  rn:            number
  adr:           number
}

export type SaveResult = {
  saved_count:    number
  inserted_count: number
  updated_count:  number
}

export async function saveForecastEdits(
  hotelId:    string,
  updateDate: string,
  edits:      SaveEdit[],
): Promise<SaveResult> {
  const { data, error } = await (supabase as any).rpc('save_forecast_edits', {
    p_hotel_id:    hotelId,
    p_update_date: updateDate,
    p_edits:       edits,
  })
  if (error) throw new Error(`저장 실패: ${error.message}`)
  if (!data || data.length === 0) throw new Error('저장 결과가 비어있습니다')
  return data[0] as SaveResult
}
