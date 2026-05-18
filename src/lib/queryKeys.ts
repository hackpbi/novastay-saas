export const QUERY_KEYS = {
  roomTypes:               (hotelId: string) => ['c01_room_types',               hotelId] as const,
  roomNos:                 (hotelId: string) => ['c02_room_nos',                  hotelId] as const,
  marketCodes:             (hotelId: string) => ['c03_market_codes',              hotelId] as const,
  marketCodesSegmentation: (hotelId: string) => ['c03_market_codes_segmentation', hotelId] as const,
  marketTableSchema:       (hotelId: string) => ['c05_market_table_schema',       hotelId] as const,
  reservationStatuses:     (hotelId: string) => ['c04_reservation_statuses',      hotelId] as const,
  actual:                  (hotelId: string, params?: any) => ['r01_actual',    hotelId, params],
  otb:                     (hotelId: string, params?: any) => ['r02_otb',       hotelId, params],
  otbDates:                (hotelId: string)               => ['r02_otb_dates', hotelId],
} as const
