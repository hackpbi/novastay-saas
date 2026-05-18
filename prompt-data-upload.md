아래 조건에 맞게 Actual 및 OTB 파일 업로드 페이지를 구현해줘.

---

## 기존 코드 정보
- (supabase as any) 캐스팅 사용
- TanStack Query 적용 중
- useHotel() → currentHotel.id
- 기존 CSS 변수 + Tailwind 사용
- xlsx 라이브러리 설치되어 있음

---

## DB 스키마

### r01_actual
```sql
id               bigint
hotel_id         uuid NOT NULL FK → m02_hotels
status           text
rsvn_no          text
business_date    date
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
insert_date      date
created_by       text
cancel_date      date
create_date_time timestamptz
PRIMARY KEY (hotel_id, id)
```

### r02_otb
```sql
-- r01_actual과 동일 + update_date 추가
id               bigint
hotel_id         uuid NOT NULL FK → m02_hotels
update_date      date NOT NULL    ← OTB 기준일 (Date Picker로 입력)
-- 나머지 컬럼 r01_actual과 동일
PRIMARY KEY (hotel_id, id, update_date)
```

---

## 페이지 구성

파일: `src/pages/DataUploadPage.tsx`
라우터 경로: `/data/upload`

### 헤더
```
제목: "데이터 업로드"
설명: "Actual 및 OTB 데이터를 업로드합니다."
```

### 탭 2개
```
Actual | OTB
```

---

## 공통 업로드 UI 구성

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   [OTB만] OTB Date:  [날짜 선택 Date Picker]        │
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │                                             │   │
│   │     📁 엑셀 파일을 드래그하거나             │   │
│   │        클릭하여 업로드하세요                │   │
│   │                                             │   │
│   │     지원 형식: .xlsx, .xls                  │   │
│   └─────────────────────────────────────────────┘   │
│                                                     │
│   [엑셀 양식 다운로드]                              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Actual 탭

### 업로드 처리
```ts
async function handleActualUpload(file: File) {
  setUploading(true)
  setUploadResult(null)

  try {
    // 1. 엑셀 파싱
    const reader = new FileReader()
    reader.onload = async (e) => {
      const data     = new Uint8Array(e.target?.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet    = workbook.Sheets[workbook.SheetNames[0]]
      const rows     = XLSX.utils.sheet_to_json(sheet) as Record<string, any>[]

      // 2. 유효성 검사
      const errors: string[] = []
      rows.forEach((row, i) => {
        if (!row['id'])            errors.push(`${i + 2}행: id 누락`)
        if (!row['business_date']) errors.push(`${i + 2}행: business_date 누락`)
      })

      if (errors.length > 0) {
        setUploadResult({ type: 'error', errors })
        setUploading(false)
        return
      }

      // 3. 데이터 변환
      const insertData = rows.map(row => ({
        id:               Number(row['id']),
        hotel_id:         currentHotel.id,
        status:           row['status']           ?? null,
        rsvn_no:          row['rsvn_no']          ?? null,
        business_date:    row['business_date']    ?? null,
        arrival_date:     row['arrival_date']     ?? null,
        departure_date:   row['departure_date']   ?? null,
        nts:              row['nts']       ? Number(row['nts'])       : null,
        room_type_code:   row['room_type_code']   ?? null,
        nights:           row['nights']   ? Number(row['nights'])    : null,
        room_revenue:     row['room_revenue'] ? Number(row['room_revenue']) : null,
        rate_type:        row['rate_type']        ?? null,
        market_type:      row['market_type']      ?? null,
        source_type:      row['source_type']      ?? null,
        country:          row['country']          ?? null,
        package:          row['package']          ?? null,
        company:          row['company']          ?? null,
        account_no:       row['account_no']       ?? null,
        account_name:     row['account_name']     ?? null,
        ota_rsvn_no:      row['ota_rsvn_no']      ?? null,
        group_id:         row['group_id']         ?? null,
        adult:            row['adult']    ? Number(row['adult'])     : null,
        child:            row['child']    ? Number(row['child'])     : null,
        service_rate:     row['service_rate'] ? Number(row['service_rate']) : null,
        insert_date:      row['insert_date']      ?? null,
        created_by:       row['created_by']       ?? null,
        cancel_date:      row['cancel_date']      ?? null,
      }))

      // 4. upsert (hotel_id + id 기준)
      const CHUNK_SIZE = 1000
      let successCount = 0
      const uploadErrors: string[] = []

      for (let i = 0; i < insertData.length; i += CHUNK_SIZE) {
        const chunk = insertData.slice(i, i + CHUNK_SIZE)
        const { error } = await (supabase as any)
          .from('r01_actual')
          .upsert(chunk, { onConflict: 'hotel_id,id' })

        if (error) {
          uploadErrors.push(`${i + 1}~${i + chunk.length}행 오류: ${error.message}`)
        } else {
          successCount += chunk.length
        }
      }

      setUploadResult({
        type:         uploadErrors.length > 0 ? 'partial' : 'success',
        successCount,
        totalCount:   insertData.length,
        errors:       uploadErrors
      })
    }
    reader.readAsArrayBuffer(file)

  } finally {
    setUploading(false)
  }
}
```

---

## OTB 탭

### OTB Date Picker
```tsx
// 기본값: 오늘 날짜 (항상 값이 있으므로 업로드 버튼 항상 활성화)
const [otbDate, setOtbDate] = useState<string>(
  new Date().toISOString().split('T')[0]
)

// 탭 상단에 표시
<div className="flex items-center gap-3 mb-5 p-4 rounded-xl"
  style={{ background: 'var(--color-bg-secondary)',
           border: '1px solid var(--color-border-default)' }}>
  <CalendarDays size={16} className="text-accent-primary" />
  <span className="text-sm font-medium"
    style={{ color: 'var(--color-text-primary)' }}>
    OTB 기준일
  </span>
  <input
    type="date"
    value={otbDate}
    onChange={e => setOtbDate(e.target.value)}
    className="rounded-md px-3 py-1.5 text-sm focus:outline-none"
    style={{
      background: 'var(--color-bg-tertiary)',
      border:     '1px solid var(--color-border-default)',
      color:      'var(--color-text-primary)',
    }}
    onFocus={e => {
      e.currentTarget.style.border    = '1px solid var(--color-accent-primary)'
      e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
    }}
    onBlur={e => {
      e.currentTarget.style.border    = '1px solid var(--color-border-default)'
      e.currentTarget.style.boxShadow = 'none'
    }}
  />
  <span className="text-xs text-brand-muted">
    업로드할 OTB 스냅샷 날짜 (기본: 오늘)
  </span>
</div>
```

### OTB 업로드 처리 (update_date 추가)
```ts
async function handleOtbUpload(file: File) {
  // otbDate는 기본값이 오늘 날짜라 항상 존재
  // 업로드 버튼 비활성화 조건 없음 → 항상 활성화

  // Actual과 동일한 파싱 로직 + update_date 추가
  const insertData = rows.map(row => ({
    ...parseRow(row),
    hotel_id:    currentHotel.id,
    update_date: otbDate,   // ← Date Picker 값 (기본: 오늘)
  }))

  // upsert (hotel_id + id + update_date 기준)
  const { error } = await (supabase as any)
    .from('r02_otb')
    .upsert(chunk, { onConflict: 'hotel_id,id,update_date' })
}
```

---

## 드래그 앤 드롭 업로드 UI

```tsx
const [isDragging, setIsDragging] = useState(false)

function handleDragOver(e: React.DragEvent) {
  e.preventDefault()
  setIsDragging(true)
}

function handleDragLeave() {
  setIsDragging(false)
}

function handleDrop(e: React.DragEvent) {
  e.preventDefault()
  setIsDragging(false)
  const file = e.dataTransfer.files[0]
  if (file) handleUpload(file)
}

<div
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
  onClick={() => fileInputRef.current?.click()}
  className="relative flex flex-col items-center justify-center
             rounded-xl cursor-pointer transition-all duration-200
             min-h-[200px] gap-4"
  style={{
    border:     `2px dashed ${isDragging
      ? 'var(--color-accent-primary)'
      : 'var(--color-border-default)'}`,
    background: isDragging
      ? 'var(--accent-badge-bg)'
      : 'var(--color-bg-secondary)',
  }}
>
  <div className="w-14 h-14 rounded-xl flex items-center justify-center"
    style={{ background: isDragging
      ? 'rgba(0,212,138,0.2)'
      : 'var(--color-bg-tertiary)' }}>
    <Upload size={24} className={isDragging
      ? 'text-accent-primary'
      : 'text-brand-muted'} />
  </div>

  <div className="text-center">
    <p className="text-sm font-medium mb-1"
      style={{ color: isDragging
        ? 'var(--color-accent-primary)'
        : 'var(--color-text-primary)' }}>
      {isDragging
        ? '파일을 놓으세요'
        : '엑셀 파일을 드래그하거나 클릭하여 업로드'}
    </p>
    <p className="text-xs text-brand-muted">
      지원 형식: .xlsx, .xls
    </p>
  </div>

  <input
    ref={fileInputRef}
    type="file"
    accept=".xlsx,.xls"
    className="hidden"
    onChange={e => {
      const file = e.target.files?.[0]
      if (file) handleUpload(file)
    }}
  />
</div>
```

---

## 업로드 결과 표시

```tsx
{uploadResult && (
  <div className="mt-4 rounded-xl p-4"
    style={{
      background: uploadResult.type === 'success'
        ? 'var(--color-bg-secondary)'
        : uploadResult.type === 'partial'
        ? '#1A1400'
        : '#1A0D0D',
      border: `1px solid ${
        uploadResult.type === 'success' ? 'var(--color-border-default)' :
        uploadResult.type === 'partial' ? '#2D2000' : '#3D1A1A'
      }`
    }}>

    {/* 성공 */}
    {uploadResult.type === 'success' && (
      <div className="flex items-center gap-2">
        <CheckCircle size={16} className="text-accent-primary" />
        <p className="text-sm font-medium text-accent-primary">
          {uploadResult.totalCount.toLocaleString()}건 업로드 완료
        </p>
      </div>
    )}

    {/* 부분 성공 */}
    {uploadResult.type === 'partial' && (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle size={16} style={{ color: '#F6AD55' }} />
          <p className="text-sm font-medium" style={{ color: '#F6AD55' }}>
            {uploadResult.successCount.toLocaleString()}건 성공 /
            {(uploadResult.totalCount - uploadResult.successCount).toLocaleString()}건 실패
          </p>
        </div>
        <div className="space-y-1">
          {uploadResult.errors.map((err, i) => (
            <p key={i} className="text-xs" style={{ color: '#F6AD55' }}>{err}</p>
          ))}
        </div>
      </div>
    )}

    {/* 오류 */}
    {uploadResult.type === 'error' && (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <XCircle size={16} style={{ color: '#FC8181' }} />
          <p className="text-sm font-medium" style={{ color: '#FC8181' }}>
            업로드 실패
          </p>
        </div>
        <div className="space-y-1">
          {uploadResult.errors.map((err, i) => (
            <p key={i} className="text-xs" style={{ color: '#FC8181' }}>{err}</p>
          ))}
        </div>
      </div>
    )}
  </div>
)}
```

---

## 업로드 진행 상태

```tsx
{uploading && (
  <div className="mt-4 flex items-center gap-3">
    <div className="w-4 h-4 border-2 border-[#00D48A]
                    border-t-transparent rounded-full animate-spin" />
    <p className="text-sm text-brand-muted">
      업로드 중... {Math.round(uploadProgress)}%
    </p>
    {/* 프로그레스 바 */}
    <div className="flex-1 h-1.5 rounded-full"
      style={{ background: 'var(--color-border-default)' }}>
      <div className="h-full rounded-full transition-all"
        style={{
          width:      `${uploadProgress}%`,
          background: 'var(--color-accent-primary)'
        }} />
    </div>
  </div>
)}
```

---

## 엑셀 양식 다운로드

```ts
function downloadTemplate(type: 'actual' | 'otb') {
  const headers = [
    'id', 'status', 'rsvn_no', 'business_date',
    'arrival_date', 'departure_date', 'nts',
    'room_type_code', 'nights', 'room_revenue',
    'rate_type', 'market_type', 'source_type',
    'country', 'package', 'company',
    'account_no', 'account_name', 'ota_rsvn_no',
    'group_id', 'adult', 'child', 'service_rate',
    'insert_date', 'created_by', 'cancel_date'
  ]

  const sample = [[
    1, 'RES', 'R001', '2025-01-01',
    '2025-01-01', '2025-01-03', 1,
    'DLX', 2, 200000,
    'RACK', 'FIT', 'Direct',
    'KR', 'N', 'Company A',
    'ACC001', 'Account Name', '',
    '', 2, 0, 20000,
    '2024-12-01', 'Admin', ''
  ]]

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, `${type}_template.xlsx`)
}
```

---

## 업로드 이력 표시 (하단)

```tsx
// 최근 업로드 이력 (로컬 상태로 관리)
const [uploadHistory, setUploadHistory] = useState<{
  type:      'actual' | 'otb'
  date:      string
  otbDate?:  string
  count:     number
  fileName:  string
  uploadedAt: string
}[]>([])

// 업로드 성공 시 이력 추가
setUploadHistory(prev => [{
  type:       activeTab,
  date:       new Date().toLocaleDateString('ko-KR'),
  otbDate:    activeTab === 'otb' ? otbDate : undefined,
  count:      uploadResult.successCount,
  fileName:   file.name,
  uploadedAt: new Date().toLocaleTimeString('ko-KR'),
}, ...prev.slice(0, 9)])  // 최근 10개만 유지
```

---

## QUERY_KEYS 업데이트
`src/lib/queryKeys.ts`

```ts
export const QUERY_KEYS = {
  // 기존...
  actual: (hotelId: string, params?: any) => ['r01_actual', hotelId, params],
  otb:    (hotelId: string, params?: any) => ['r02_otb',    hotelId, params],
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
- OTB Date Picker 기본값: 오늘 날짜 (업로드 버튼 항상 활성화)
- 대용량 파일 처리 위해 1000건씩 청크 upsert
- Actual: onConflict 'hotel_id,id'
- OTB:    onConflict 'hotel_id,id,update_date'
- 날짜 컬럼 (business_date 등) 엑셀에서 숫자로 올 수 있음
  → XLSX.utils.format_cell() 또는 날짜 변환 처리 필요
- (supabase as any) 캐스팅 패턴 유지
- TypeScript 타입 정확히 정의
- 업로드 중 다른 탭 클릭 방지 (disabled 처리)

위 조건대로 구현해줘.
