import * as XLSX from 'xlsx'

// ── 날짜 변환 ──────────────────────────────────────────────────────────────────

export function toDateString(val: any): string | null {
  if (!val) return null
  if (typeof val === 'string') {
    const s = val.slice(0, 10)
    // 유효한 YYYY-MM-DD 형식 + 월(01-12)·일(01-31) 범위 검증
    // (PMS export가 빈 날짜를 "0-00-01" 같은 제로-날짜 문자열로 내보내는
    // 경우를 걸러내기 위함 — 이런 값은 DB insert 시 22008 에러 유발)
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null
    const [, y, mo, d] = m
    const mm = Number(mo), dd = Number(d)
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
    return s
  }
  if (typeof val === 'number') {
    const utcMs = (val - 25569) * 86400 * 1000
    const d = new Date(utcMs)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (val instanceof Date) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`
  }
  return null
}

export function toDateTimeString(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'string') return val
  return null
}

// ── 컬럼 매핑 ─────────────────────────────────────────────────────────────────

export const COLUMN_MAP: Record<string, string> = {
  '상태': 'status', '예약번호': 'id', '판매일자': 'business_date',
  '입실일자': 'arrival_date', '퇴실일자': 'departure_date', '박수': 'nts',
  '객실타입': 'room_type_code', '객실수': 'nights', '객실료': 'room_revenue',
  '요금타입': 'rate_type', '시장': 'market_type', '예약경로': 'source_type',
  '국적': 'country', 'Package': 'package', '회사명': 'company',
  '거래처 번호': 'account_no', '거래처명': 'account_name', 'OTA Rsvn No': 'ota_rsvn_no',
  '단체 ID': 'group_id', '성인': 'adult', '소인': 'child', '서비스료': 'service_rate',
  '생성일자': 'create_date_time', '예약자': 'created_by', '취소일자': 'cancel_date',
  '기준일': 'update_date',
}

export function transformRow(row: Record<string, any>, hotelId: string) {
  return {
    id:               Number(row['id']),
    hotel_id:         hotelId,
    rsvn_no:          row['id'] != null ? String(row['id']) : null,
    business_date:    toDateString(row['business_date']),
    status:           row['status']         ?? null,
    arrival_date:     toDateString(row['arrival_date']),
    departure_date:   toDateString(row['departure_date']),
    nts:              row['nts']            ? Number(row['nts']) : null,
    room_type_code:   row['room_type_code'] ?? null,
    nights:           row['nights']         ? Number(row['nights']) : null,
    room_revenue:     row['room_revenue']   ? Number(String(row['room_revenue']).replace(/,/g, '')) : null,
    rate_type:        row['rate_type']      ?? null,
    market_type:      row['market_type']    ?? null,
    source_type:      row['source_type']    ?? null,
    country:          row['country']        ?? null,
    package:          row['package']        ?? null,
    company:          row['company']        ?? null,
    account_no:       row['account_no']     ? String(row['account_no']) : null,
    account_name:     row['account_name']   ?? null,
    ota_rsvn_no:      row['ota_rsvn_no']    ? String(row['ota_rsvn_no']) : null,
    group_id:         row['group_id']       ? String(row['group_id']) : null,
    adult:            row['adult']          ? Number(row['adult']) : null,
    child:            row['child']          ? Number(row['child']) : null,
    service_rate:     row['service_rate']   ? Number(String(row['service_rate']).replace(/,/g, '')) : null,
    create_date_time: toDateTimeString(row['create_date_time']),
    created_by:       row['created_by']     ?? null,
    cancel_date:      toDateString(row['cancel_date']),
    update_date:      toDateString(row['update_date']),
  }
}

export function parseExcelFile(file: File): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data     = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })
        const sheet    = workbook.Sheets[workbook.SheetNames[0]]
        const allRows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][]
        if (allRows.length === 0) { resolve([]); return }
        let headerRowIdx = 0, maxMatches = 0
        for (let i = 0; i < Math.min(6, allRows.length); i++) {
          const matches = (allRows[i] as any[]).filter(c => !!COLUMN_MAP[String(c ?? '').trim()]).length
          if (matches > maxMatches) { maxMatches = matches; headerRowIdx = i }
        }
        if (maxMatches === 0) { reject(new Error('파일 컬럼을 인식할 수 없습니다.')); return }
        const headers    = allRows[headerRowIdx] as any[]
        const filteredRows = allRows.slice(headerRowIdx + 1).filter(row => {
          const first = row[0]
          return first !== '총합계' && first !== null && first !== undefined && String(first).trim() !== ''
        })
        resolve(filteredRows.map(row => {
          const obj: Record<string, any> = {}
          headers.forEach((h: any, i: number) => {
            const dbCol = COLUMN_MAP[String(h ?? '').trim()]
            if (dbCol) obj[dbCol] = row[i] ?? null
          })
          return obj
        }))
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsArrayBuffer(file)
  })
}
