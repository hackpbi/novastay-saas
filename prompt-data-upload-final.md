아래 조건에 맞게 데이터 업로드 페이지를 구현해줘.
일반 업로드 (Actual/OTB) + super_admin 전용 대용량 업로드 포함.

---

## 기존 코드 정보
- (supabase as any) 캐스팅 사용
- TanStack Query 적용 중
- useAuth() → profile.role
- useHotel() → currentHotel.id
- 기존 CSS 변수 + Tailwind 사용
- xlsx 라이브러리 설치되어 있음

---

## DB 스키마

### r01_actual
```sql
hotel_id         uuid NOT NULL FK → m02_hotels
rsvn_no          text NOT NULL
business_date    date NOT NULL
status           text
arrival_date     date
departure_date   date
nts              integer
room_type_code   text
nights           integer
room_revenue     integer
rate_type        text
market_type      text
source_type      text
country          text
package          text
company          text
account_no       text
account_name     text
ota_rsvn_no      text
group_id         text
adult            integer
child            integer
service_rate     integer
create_date_time timestamptz
created_by       text
cancel_date      date
PRIMARY KEY (hotel_id, rsvn_no, business_date)
```

### r02_otb
```sql
-- r01_actual과 동일 + update_date 추가
hotel_id         uuid NOT NULL FK → m02_hotels
rsvn_no          text NOT NULL
business_date    date NOT NULL
update_date      date NOT NULL    ← OTB 기준일
-- 나머지 r01_actual과 동일
PRIMARY KEY (hotel_id, rsvn_no, business_date, update_date)
```

---

## 엑셀 파일 구조

```
행 0 (1행): "일자별 객실 실적 조회"  ← 삭제
행 1 (2행): "프로퍼티 : ..."         ← 삭제
행 2 (3행): 컬럼명 (헤더)            ← 사용
행 3~N-1:   실제 데이터
행 N (마지막): "총합계"              ← 삭제
```

## 엑셀 컬럼 → DB 컬럼 매핑

```ts
const COLUMN_MAP: Record<string, string> = {
  '상태':         'status',
  '예약번호':     'rsvn_no',
  '판매일자':     'business_date',
  '입실일자':     'arrival_date',
  '퇴실일자':     'departure_date',
  '박수':         'nts',
  '객실타입':     'room_type_code',
  '객실수':       'nights',
  '객실료':       'room_revenue',
  '요금타입':     'rate_type',
  '시장':         'market_type',
  '예약경로':     'source_type',
  '국적':         'country',
  'Package':      'package',
  '회사명':       'company',
  '거래처 번호':  'account_no',
  '거래처명':     'account_name',
  'OTA Rsvn No':  'ota_rsvn_no',
  '단체 ID':      'group_id',
  '성인':         'adult',
  '소인':         'child',
  '서비스료':     'service_rate',
  '생성일자':     'create_date_time',
  '예약자':       'created_by',
  '취소일자':     'cancel_date',
}
```

## 엑셀 파싱 공통 함수

```ts
function parseExcelFile(file: File): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data     = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })
        const sheet    = workbook.Sheets[workbook.SheetNames[0]]

        // header: 3행(index 2)을 컬럼명으로 사용
        // range: 3행부터 읽기
        const allRows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,    // 배열로 읽기
          defval: null,
        }) as any[][]

        // 1,2행 삭제 → 3행이 헤더
        const headers = allRows[2] as string[]

        // 데이터 행 (3행 이후)
        const dataRows = allRows.slice(3)

        // 마지막 행 "총합계" 삭제
        const filteredRows = dataRows.filter(row => {
          const firstCell = row[0]
          return firstCell !== '총합계' &&
                 firstCell !== null &&
                 firstCell !== undefined &&
                 String(firstCell).trim() !== ''
        })

        // 컬럼명 매핑
        const mappedRows = filteredRows.map(row => {
          const obj: Record<string, any> = {}
          headers.forEach((header, i) => {
            const dbCol = COLUMN_MAP[header]
            if (dbCol) obj[dbCol] = row[i] ?? null
          })
          return obj
        })

        resolve(mappedRows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsArrayBuffer(file)
  })
}
```

## 날짜 변환 함수

```ts
// 엑셀 날짜가 숫자로 올 수 있음 (cellDates: true로 방지하지만 혹시 모를 경우)
function toDateString(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  if (typeof val === 'number') {
    // 엑셀 시리얼 날짜 변환
    const date = new Date((val - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
  if (typeof val === 'string') return val.split(' ')[0]
  return null
}

function toDateTimeString(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'string') return val
  return null
}
```

## 데이터 변환 함수

```ts
function transformRow(row: Record<string, any>, hotelId: string) {
  return {
    hotel_id:         hotelId,
    rsvn_no:          String(row['rsvn_no'] ?? ''),
    business_date:    toDateString(row['business_date']),
    status:           row['status']        ?? null,
    arrival_date:     toDateString(row['arrival_date']),
    departure_date:   toDateString(row['departure_date']),
    nts:              row['nts']           ? Number(row['nts'])           : null,
    room_type_code:   row['room_type_code'] ?? null,
    nights:           row['nights']        ? Number(row['nights'])        : null,
    room_revenue:     row['room_revenue']  ? Number(String(row['room_revenue']).replace(/,/g, '')) : null,
    rate_type:        row['rate_type']     ?? null,
    market_type:      row['market_type']   ?? null,
    source_type:      row['source_type']   ?? null,
    country:          row['country']       ?? null,
    package:          row['package']       ?? null,
    company:          row['company']       ?? null,
    account_no:       row['account_no']    ? String(row['account_no'])    : null,
    account_name:     row['account_name']  ?? null,
    ota_rsvn_no:      row['ota_rsvn_no']   ? String(row['ota_rsvn_no'])   : null,
    group_id:         row['group_id']      ? String(row['group_id'])      : null,
    adult:            row['adult']         ? Number(row['adult'])         : null,
    child:            row['child']         ? Number(row['child'])         : null,
    service_rate:     row['service_rate']  ? Number(String(row['service_rate']).replace(/,/g, '')) : null,
    create_date_time: toDateTimeString(row['create_date_time']),
    created_by:       row['created_by']    ?? null,
    cancel_date:      toDateString(row['cancel_date']),
  }
}
```

---

## 페이지 구성

파일: `src/pages/DataUploadPage.tsx`
라우터 경로: `/data/upload`

### 헤더
```
┌──────────────────────────────────────────────┐
│ 데이터 업로드           [⬆ 대용량 업로드]    │ ← super_admin만 표시
│ Actual 및 OTB 데이터를 업로드합니다.          │
└──────────────────────────────────────────────┘
```

### 대용량 버튼 (super_admin만)
```tsx
{profile?.role === 'super_admin' && (
  <button
    onClick={() => setShowBulkModal(true)}
    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm
               transition-all hover:-translate-y-px"
    style={{ background: 'var(--gradient-cta)', color: '#0A0A0A',
             boxShadow: 'var(--accent-btn-glow)', fontWeight: 600 }}>
    <Upload size={14} />
    대용량 업로드
  </button>
)}
```

### 탭 2개 (일반 업로드)
```
[Actual] [OTB]
```

---

## Part 1. 일반 업로드

### OTB Date Picker
```ts
const [otbDate, setOtbDate] = useState<string>(
  new Date().toISOString().split('T')[0]  // 기본: 오늘 날짜
)

// r02_otb에서 기존 update_date 목록 조회
const { data: otbDates = [] } = useQuery({
  queryKey: ['r02_otb_dates', hotelId],
  queryFn: async () => {
    const { data, error } = await (supabase as any)
      .from('r02_otb')
      .select('update_date')
      .eq('hotel_id', hotelId)
      .order('update_date', { ascending: false })
    if (error) throw error
    return [...new Set(data?.map((d: any) => d.update_date) ?? [])] as string[]
  },
  enabled: !!hotelId,
  staleTime: 5 * 60 * 1000,
})
```

```tsx
{/* OTB Date Picker UI */}
<div className="flex items-center gap-3 mb-5 p-4 rounded-xl"
  style={{ background: 'var(--color-bg-secondary)',
           border: '1px solid var(--color-border-default)' }}>
  <CalendarDays size={16} className="text-accent-primary" />
  <span className="text-sm font-medium"
    style={{ color: 'var(--color-text-primary)' }}>
    OTB 기준일
  </span>
  <input type="date" value={otbDate}
    onChange={e => setOtbDate(e.target.value)}
    list="otb-dates-list"
    className="rounded-md px-3 py-1.5 text-sm focus:outline-none"
    style={{ background: 'var(--color-bg-tertiary)',
             border: '1px solid var(--color-border-default)',
             color: 'var(--color-text-primary)' }}
    onFocus={e => {
      e.currentTarget.style.border    = '1px solid var(--color-accent-primary)'
      e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
    }}
    onBlur={e => {
      e.currentTarget.style.border    = '1px solid var(--color-border-default)'
      e.currentTarget.style.boxShadow = 'none'
    }} />
  <datalist id="otb-dates-list">
    {otbDates.map(date => <option key={date} value={date} />)}
  </datalist>
  <span className="text-xs text-brand-muted">기본: 오늘 날짜</span>
</div>

{/* 최근 업로드 날짜 배지 (최근 5개) */}
{otbDates.length > 0 && (
  <div className="flex flex-wrap gap-1.5 mb-4">
    <span className="text-xs text-brand-muted self-center">최근 업로드:</span>
    {otbDates.slice(0, 5).map(date => (
      <button key={date} onClick={() => setOtbDate(date)}
        className="text-xs px-2.5 py-1 rounded transition-colors"
        style={{
          background: otbDate === date ? 'var(--accent-badge-bg)' : 'var(--color-bg-tertiary)',
          color:      otbDate === date ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
          border:     `1px solid ${otbDate === date ? 'var(--color-accent-primary)' : 'var(--color-border-default)'}`,
        }}>
        {date}
      </button>
    ))}
  </div>
)}
```

### 드래그 앤 드롭 업로드 UI
```tsx
<div
  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
  onDragLeave={() => setIsDragging(false)}
  onDrop={e => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files[0]) }}
  onClick={() => fileInputRef.current?.click()}
  className="flex flex-col items-center justify-center rounded-xl
             cursor-pointer transition-all duration-200 min-h-[200px] gap-4"
  style={{
    border:     `2px dashed ${isDragging ? 'var(--color-accent-primary)' : 'var(--color-border-default)'}`,
    background: isDragging ? 'var(--accent-badge-bg)' : 'var(--color-bg-secondary)',
  }}>
  <div className="w-14 h-14 rounded-xl flex items-center justify-center"
    style={{ background: isDragging ? 'rgba(0,212,138,0.2)' : 'var(--color-bg-tertiary)' }}>
    <Upload size={24} className={isDragging ? 'text-accent-primary' : 'text-brand-muted'} />
  </div>
  <div className="text-center">
    <p className="text-sm font-medium mb-1"
      style={{ color: isDragging ? 'var(--color-accent-primary)' : 'var(--color-text-primary)' }}>
      {isDragging ? '파일을 놓으세요' : '엑셀 파일을 드래그하거나 클릭하여 업로드'}
    </p>
    <p className="text-xs text-brand-muted">지원 형식: .xlsx, .xls</p>
  </div>
  <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
    className="hidden"
    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
</div>
```

### 일반 업로드 처리
```ts
async function handleUpload(file: File) {
  setUploading(true)
  setUploadProgress(0)
  setUploadResult(null)

  try {
    // 1. 엑셀 파싱 (1,2행 제거 + 마지막 총합계 행 제거)
    const rows = await parseExcelFile(file)

    if (rows.length === 0) {
      setUploadResult({ type: 'error', errors: ['데이터가 없습니다'] })
      return
    }

    // 2. 데이터 변환
    const insertData = rows.map(row => ({
      ...transformRow(row, currentHotel.id),
      ...(activeTab === 'otb' ? { update_date: otbDate } : {})
    }))

    // 3. 유효성 검사
    const errors: string[] = []
    insertData.forEach((row, i) => {
      if (!row.rsvn_no)       errors.push(`${i + 1}행: 예약번호 누락`)
      if (!row.business_date) errors.push(`${i + 1}행: 판매일자 누락`)
    })
    if (errors.length > 0) {
      setUploadResult({ type: 'error', errors })
      return
    }

    // 4. upsert (1000건 청크)
    const table    = activeTab === 'actual' ? 'r01_actual' : 'r02_otb'
    const conflict = activeTab === 'actual'
      ? 'hotel_id,rsvn_no,business_date'
      : 'hotel_id,rsvn_no,business_date,update_date'

    const CHUNK = 1000
    let success = 0
    const uploadErrors: string[] = []

    for (let i = 0; i < insertData.length; i += CHUNK) {
      const chunk = insertData.slice(i, i + CHUNK)
      setUploadProgress(Math.round((i / insertData.length) * 100))

      const { error } = await (supabase as any)
        .from(table)
        .upsert(chunk, { onConflict: conflict })

      if (error) uploadErrors.push(`${i + 1}~${i + chunk.length}행: ${error.message}`)
      else success += chunk.length
    }

    setUploadProgress(100)
    setUploadResult({
      type:         uploadErrors.length > 0 ? 'partial' : 'success',
      successCount: success,
      totalCount:   insertData.length,
      errors:       uploadErrors
    })

    // 캐시 무효화
    if (activeTab === 'otb') {
      queryClient.invalidateQueries({ queryKey: ['r02_otb_dates', hotelId] })
    }

  } finally {
    setUploading(false)
  }
}
```

---

## Part 2. 대용량 업로드 모달 (super_admin 전용)

### 모달 구성
```
┌─────────────────────────────────────────────┐
│ 대용량 업로드                          [X]  │
│ super_admin 전용 — Next.js API Route 처리   │
├─────────────────────────────────────────────┤
│ [Actual 대용량]  [OTB 대용량]               │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  📁 대용량 엑셀 파일 드래그/클릭    │    │
│  │  10만 건 이상 지원                  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  진행상황: ████████░░ 80% (8만 / 10만건)    │
└─────────────────────────────────────────────┘

* OTB 대용량: update_date가 파일 안에 포함
  → Date Picker 없음
```

### 대용량 업로드 처리
```ts
async function handleBulkUpload(file: File, type: 'actual' | 'otb') {
  setBulkUploading(true)
  setBulkProgress(0)
  setBulkResult(null)

  try {
    // 1. 엑셀 파싱 (동일한 parseExcelFile 사용)
    const rows = await parseExcelFile(file)

    if (rows.length === 0) {
      setBulkResult({ type: 'error', errors: ['데이터가 없습니다'] })
      return
    }

    const totalRows = rows.length
    const CHUNK     = 10000  // 1만 건씩 API Route로 전송
    let success     = 0
    const errors: string[] = []

    // 2. 1만 건씩 API Route로 전송
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      setBulkProgress(Math.round((i / totalRows) * 100))

      const res = await fetch('/api/data/bulk-upload', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type,
          hotel_id: currentHotel.id,
          rows:     chunk,
          // OTB: update_date는 파일 안에 포함 → 별도 전달 없음
        })
      })

      const result = await res.json()
      if (result.error) errors.push(`${i + 1}~${i + chunk.length}행: ${result.error}`)
      else success += result.count
    }

    setBulkProgress(100)
    setBulkResult({
      type:         errors.length > 0 ? 'partial' : 'success',
      successCount: success,
      totalCount:   totalRows,
      errors,
    })

    if (type === 'otb') {
      queryClient.invalidateQueries({ queryKey: ['r02_otb_dates', hotelId] })
    }

  } finally {
    setBulkUploading(false)
  }
}
```

### API Route
파일: `app/api/data/bulk-upload/route.ts`

```ts
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { type, hotel_id, rows } = await req.json()

    if (!hotel_id || !rows?.length) {
      return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })
    }

    const table    = type === 'actual' ? 'r01_actual' : 'r02_otb'
    const conflict = type === 'actual'
      ? 'hotel_id,rsvn_no,business_date'
      : 'hotel_id,rsvn_no,business_date,update_date'

    // 서버에서 데이터 변환
    const insertData = rows.map((row: any) => ({
      hotel_id,
      rsvn_no:          String(row['rsvn_no'] ?? ''),
      business_date:    row['business_date']  ?? null,
      status:           row['status']         ?? null,
      arrival_date:     row['arrival_date']   ?? null,
      departure_date:   row['departure_date'] ?? null,
      nts:              row['nts']            ? Number(row['nts'])   : null,
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
      adult:            row['adult']          ? Number(row['adult'])  : null,
      child:            row['child']          ? Number(row['child'])  : null,
      service_rate:     row['service_rate']   ? Number(String(row['service_rate']).replace(/,/g, '')) : null,
      create_date_time: row['create_date_time'] ?? null,
      created_by:       row['created_by']     ?? null,
      cancel_date:      row['cancel_date']    ?? null,
      // OTB: update_date는 파일 row에서 읽음
      ...(type === 'otb' ? { update_date: row['update_date'] ?? null } : {})
    }))

    // 500건씩 upsert (서버에서 처리)
    const CHUNK = 500
    let count   = 0

    for (let i = 0; i < insertData.length; i += CHUNK) {
      const chunk = insertData.slice(i, i + CHUNK)
      const { error } = await adminClient
        .from(table)
        .upsert(chunk, { onConflict: conflict })
      if (error) throw error
      count += chunk.length
    }

    return NextResponse.json({ success: true, count })

  } catch (err: any) {
    console.error('bulk upload error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

---

## 업로드 결과 표시

```tsx
{uploadResult && (
  <div className="mt-4 rounded-xl p-4"
    style={{
      background: uploadResult.type === 'success' ? 'var(--color-bg-secondary)'
                : uploadResult.type === 'partial'  ? '#1A1400' : '#1A0D0D',
      border: `1px solid ${
        uploadResult.type === 'success' ? 'var(--color-border-default)'
      : uploadResult.type === 'partial' ? '#2D2000' : '#3D1A1A'}`
    }}>
    {uploadResult.type === 'success' && (
      <div className="flex items-center gap-2">
        <CheckCircle size={16} className="text-accent-primary" />
        <p className="text-sm font-medium text-accent-primary">
          {uploadResult.totalCount.toLocaleString()}건 업로드 완료
        </p>
      </div>
    )}
    {uploadResult.type === 'partial' && (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle size={16} style={{ color: '#F6AD55' }} />
          <p className="text-sm font-medium" style={{ color: '#F6AD55' }}>
            {uploadResult.successCount.toLocaleString()}건 성공 /
            {' '}{(uploadResult.totalCount - uploadResult.successCount).toLocaleString()}건 실패
          </p>
        </div>
        {uploadResult.errors.map((err, i) => (
          <p key={i} className="text-xs" style={{ color: '#F6AD55' }}>{err}</p>
        ))}
      </div>
    )}
    {uploadResult.type === 'error' && (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <XCircle size={16} style={{ color: '#FC8181' }} />
          <p className="text-sm font-medium" style={{ color: '#FC8181' }}>
            업로드 실패
          </p>
        </div>
        {uploadResult.errors.map((err, i) => (
          <p key={i} className="text-xs" style={{ color: '#FC8181' }}>{err}</p>
        ))}
      </div>
    )}
  </div>
)}
```

## 진행상황 프로그레스 바

```tsx
{uploading && (
  <div className="mt-4 flex items-center gap-3">
    <div className="w-4 h-4 border-2 border-[#00D48A]
                    border-t-transparent rounded-full animate-spin" />
    <p className="text-sm text-brand-muted">{uploadProgress}%</p>
    <div className="flex-1 h-1.5 rounded-full"
      style={{ background: 'var(--color-border-default)' }}>
      <div className="h-full rounded-full transition-all duration-300"
        style={{ width: `${uploadProgress}%`,
                 background: 'var(--color-accent-primary)' }} />
    </div>
  </div>
)}
```

---

## QUERY_KEYS 업데이트
`src/lib/queryKeys.ts`

```ts
export const QUERY_KEYS = {
  // 기존...
  actual:   (hotelId: string, params?: any) => ['r01_actual',    hotelId, params],
  otb:      (hotelId: string, params?: any) => ['r02_otb',       hotelId, params],
  otbDates: (hotelId: string)               => ['r02_otb_dates', hotelId],
}
```

---

## NovaStay 디자인 시스템
```
배경:         bg-bg-primary
카드:         bg-bg-secondary
테두리:       var(--color-border-default)
브랜드 그린:  var(--color-accent-primary)
텍스트:       var(--color-text-primary)
보조텍스트:   text-brand-muted
성공:         #00D48A
경고:         #F6AD55
오류:         #FC8181
```

---

## 주의사항
- 엑셀 파일 1,2행 자동 삭제 (제목/프로퍼티 행)
- 마지막 "총합계" 행 자동 삭제
- 3행을 헤더로 사용 (한국어 컬럼명 → DB 컬럼명 매핑)
- room_revenue, service_rate: 콤마(,) 제거 후 숫자 변환
- 날짜 컬럼: Date 객체 또는 숫자 → 'YYYY-MM-DD' 변환
- create_date_time: ISO 문자열 변환
- 대용량 버튼 → profile.role === 'super_admin' 만 표시
- 일반 업로드: 1000건 청크 → 브라우저에서 직접 upsert
- 대용량 업로드: 1만 건씩 API Route → 500건 청크 → service_role upsert
- OTB 일반 업로드: update_date = Date Picker 값
- OTB 대용량 업로드: update_date = 파일 내 컬럼값 (Date Picker 없음)
- conflict: actual = 'hotel_id,rsvn_no,business_date'
            otb    = 'hotel_id,rsvn_no,business_date,update_date'
- OTB 업로드 성공 시 otbDates 캐시 invalidate
- 대용량 업로드 중 모달 닫기 방지
- (supabase as any) 캐스팅 패턴 유지
- TypeScript 타입 정확히 정의

위 조건대로 구현해줘.
