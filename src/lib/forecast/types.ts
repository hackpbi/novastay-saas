// ─── C05 DB row ────────────────────────────────────────────────────────────────
export type C05Row = {
  id: string
  name: string
  level: 'main' | 'mid' | 'sub'
  parent_id: string | null
  segmentation: string[]
  order_index: number
  is_bold: boolean
}

// ─── Tree node (built from C05) ────────────────────────────────────────────────
export type SchemaNode = {
  id: string
  name: string
  level: 'main' | 'mid' | 'sub'
  isBold: boolean
  orderIndex: number
  segmentationCodes: string[]  // leaf codes (own or aggregated from children)
  children: SchemaNode[]
}

// ─── Column rendering units ────────────────────────────────────────────────────
export type SubColumn = {
  id: string
  label: string         // '(합산)', child name, '' for mid/total
  segCodes: string[]    // codes to aggregate for this column
  isSummary: boolean    // true for (합산) and Total
}

export type ColumnGroup = {
  id: string
  parentLabel: string
  parentIsBold: boolean
  parentRowSpan: 1 | 2  // 1=main (has children), 2=mid/total (no children)
  parentColSpan: number
  subCols: SubColumn[]
}

// ─── Aggregated schema (fetch result) ─────────────────────────────────────────
export type ForecastSchema = {
  hotelId:               string
  roomCount:             number
  nodes:                 SchemaNode[]   // tree (top-level only, children nested)
  allSegmentationCodes:  string[]       // all leaf codes for Total calculation
}

// ─── Forecast data ──────────────────────────────────────────────────────────────
export type SegmentValue = {
  rn: number
  adr: number   // 원 단위 (DB 기준)
  rev: number   // 원 단위 (DB 기준)
}

export type DailyForecast = {
  business_date: string                    // '2026-05-01'
  day_label: string                        // '5/1 (금)'
  values: Record<string, SegmentValue>     // keyed by segmentation CODE (COR, CNC, ...)
}

// ─── Baseline RPC types ────────────────────────────────────────────────────────
export type ForecastRpcRow = {
  business_date:           string
  segmentation:            string
  forecast_rn:             number
  forecast_adr:            number | null
  forecast_revenue:        number
  current_otb_rn:          number
  current_otb_revenue:     number
  ly_remaining_pickup_rn:  number | null
  ly_remaining_pickup_rev: number | null
  ly_match_date:           string | null
  ly_otb_snapshot_date:    string | null
  capped:                  boolean
  is_actual:               boolean
}

export type ForecastSegValue = {
  rn:        number
  adr:       number
  rev:       number
  otb_rn:    number
  otb_rev:   number
  is_actual: boolean
  capped:    boolean
}

export type ForecastDayData = {
  business_date: string
  day_label:     string
  is_actual_day: boolean
  has_capped:    boolean   // any segment capped on this day
  values:        Record<string, ForecastSegValue>
}

// ─── Calendar (c06_calendar) ───────────────────────────────────────────────────
export type CalendarDay = {
  date:       string        // 'YYYY-MM-DD'
  day:        string        // '월', '화', ...
  rev_dow:    string        // RM용 요일 그룹
  event:      string | null // 이벤트명 (없으면 null)
  is_holiday: boolean
}

export type CalendarMap = Map<string, CalendarDay>
