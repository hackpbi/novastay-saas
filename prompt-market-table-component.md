아래 조건에 맞게 MarketTable 재사용 컴포넌트를 만들어줘.
c05_market_table_schema 기반 대/중/소분류 구조에 숫자 데이터를 표시하는 테이블.

---

## 기존 코드 정보
- (supabase as any) 캐스팅 사용
- TanStack Query 적용 중
- useHotel() → currentHotel.id
- 기존 CSS 변수 + Tailwind 사용

---

## DB 스키마

### c05_market_table_schema
```sql
id            uuid PK
hotel_id      uuid FK → m02_hotels
name          text NOT NULL       -- 표시명 (Corp. FIT, Contracted 등)
level         text                -- 'main' | 'mid' | 'sub'
parent_id     uuid FK → self
segmentation  text[]              -- 연결된 segmentation 배열 (중분류/소분류만)
order_index   integer DEFAULT 0
color         text                -- 대분류 배경색
is_bold       boolean DEFAULT false
is_active     boolean DEFAULT true
```

---

## 타입 정의

```ts
// 컬럼 정의
export type MarketTableColumn = {
  key:       string                           // 데이터 키
  label:     string                           // 헤더 표시명
  type?:     'number' | 'currency' | 'percent' | 'string'
  width?:    string
  render?:   (value: any, row: MarketTableRow) => React.ReactNode
}

// 행 데이터 (segmentation 값을 key로)
export type MarketTableData = Record<string, Record<string, any>>
// 예: { 'Contracted': { rn: 150, adr: 185000 }, 'IOTA': { rn: 120 } }

// 스키마 타입
type Schema = {
  id:           string
  hotel_id:     string
  name:         string
  level:        'main' | 'mid' | 'sub'
  parent_id:    string | null
  segmentation: string[] | null
  order_index:  number
  color:        string | null
  is_bold:      boolean
  is_active:    boolean
}

type SchemaGroup = {
  parent:   Schema
  children: Schema[]
}

type SchemaTree = {
  groups: SchemaGroup[]   // 대분류 + 소분류
  mids:   Schema[]        // 중분류
}
```

---

## 컴포넌트 파일
`src/components/tables/MarketTable.tsx`

---

## Props

```ts
export type MarketTableProps = {
  hotelId:      string
  columns:      MarketTableColumn[]
  data:         MarketTableData        // segmentation → 숫자 데이터
  groupHeader?: string                 // 컬럼 그룹 헤더 (예: "ACTUAL", "OTB")
  loading?:     boolean
  className?:   string
}
```

---

## 사용 예시

```tsx
// Actual 페이지
<MarketTable
  hotelId={currentHotel.id}
  groupHeader="ACTUAL"
  columns={[
    { key: 'rn',  label: 'R/N',  type: 'number' },
    { key: 'adr', label: 'ADR',  type: 'currency' },
    { key: 'rev', label: 'REV',  type: 'currency' },
  ]}
  data={{
    'Contracted':     { rn: 150, adr: 185000, rev: 27750000 },
    'Non Contracted': { rn: 80,  adr: 170000, rev: 13600000 },
    'IOTA':           { rn: 120, adr: 195000, rev: 23400000 },
  }}
/>

// OTB 페이지 (컬럼만 다름)
<MarketTable
  hotelId={currentHotel.id}
  groupHeader="OTB"
  columns={[
    { key: 'rn',  label: 'R/N',  type: 'number' },
    { key: 'occ', label: 'OCC',  type: 'percent' },
    { key: 'adr', label: 'ADR',  type: 'currency' },
    { key: 'rev', label: 'REV',  type: 'currency' },
  ]}
  data={otbData}
/>

// 비교 페이지 (여러 그룹)
<MarketTable
  hotelId={currentHotel.id}
  columns={[
    { key: 'ly_rn',  label: 'LY R/N',  type: 'number' },
    { key: 'ty_rn',  label: 'TY R/N',  type: 'number' },
    { key: 'var_pct',label: 'VAR%',    type: 'percent' },
  ]}
  data={yoyData}
/>
```

---

## 데이터 조회 (컴포넌트 내부)

```ts
const { data: schemas = [], isLoading: schemaLoading } = useQuery({
  queryKey: ['c05_market_table_schema', hotelId],
  queryFn: async () => {
    const { data, error } = await (supabase as any)
      .from('c05_market_table_schema')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('is_active', true)
      .order('order_index')
    if (error) throw error
    return data as Schema[]
  },
  enabled:   !!hotelId,
  staleTime: 10 * 60 * 1000,
})
```

---

## 트리 구조 변환

```ts
function buildTree(schemas: Schema[]): SchemaTree {
  const mains = schemas
    .filter(s => s.level === 'main')
    .sort((a, b) => a.order_index - b.order_index)

  const subs = schemas.filter(s => s.level === 'sub')

  const mids = schemas
    .filter(s => s.level === 'mid')
    .sort((a, b) => a.order_index - b.order_index)

  return {
    groups: mains.map(main => ({
      parent:   main,
      children: subs
        .filter(s => s.parent_id === main.id)
        .sort((a, b) => a.order_index - b.order_index)
    })),
    mids,
  }
}
```

---

## 숫자 집계 (segmentation 배열 합산)

```ts
// 대분류: 소분류들의 합계
function aggregateMain(
  group:   SchemaGroup,
  data:    MarketTableData,
  colKey:  string
): number {
  // 소분류의 segmentation 배열에서 데이터 합산
  return group.children.reduce((sum, child) => {
    const segs = child.segmentation ?? []
    const childSum = segs.reduce((s, seg) => s + (data[seg]?.[colKey] ?? 0), 0)
    return sum + childSum
  }, 0)
}

// 중분류: 본인 segmentation 배열 합산
function aggregateMid(
  mid:    Schema,
  data:   MarketTableData,
  colKey: string
): number {
  const segs = mid.segmentation ?? []
  return segs.reduce((sum, seg) => sum + (data[seg]?.[colKey] ?? 0), 0)
}

// 소분류: 본인 segmentation 배열 합산
function aggregateSub(
  sub:    Schema,
  data:   MarketTableData,
  colKey: string
): number {
  const segs = sub.segmentation ?? []
  return segs.reduce((sum, seg) => sum + (data[seg]?.[colKey] ?? 0), 0)
}

// 전체 합계
function aggregateTotal(
  tree:   SchemaTree,
  data:   MarketTableData,
  colKey: string
): number {
  const groupSum = tree.groups.reduce((sum, g) =>
    sum + aggregateMain(g, data, colKey), 0)
  const midSum = tree.mids.reduce((sum, m) =>
    sum + aggregateMid(m, data, colKey), 0)
  return groupSum + midSum
}
```

---

## 숫자 포맷

```ts
function formatValue(value: number, type?: string): string {
  if (value === 0 || value === null || value === undefined) return '-'

  switch (type) {
    case 'currency':
      return value >= 1000000
        ? `${(value / 1000000).toFixed(1)}M`
        : value.toLocaleString('ko-KR')
    case 'percent':
      return `${value.toFixed(1)}%`
    case 'number':
    default:
      return value.toLocaleString('ko-KR')
  }
}
```

---

## 테이블 렌더링

```tsx
export default function MarketTable({
  hotelId, columns, data, groupHeader, loading, className
}: MarketTableProps) {
  const tree = useMemo(() => buildTree(schemas), [schemas])

  if (schemaLoading || loading) return <LoadingSkeleton />

  return (
    <div className={`overflow-x-auto rounded-xl ${className ?? ''}`}
      style={{ border: '1px solid var(--color-border-default)' }}>
      <table className="w-full border-collapse" style={{ fontSize: 13 }}>

        {/* 헤더 */}
        <thead>
          {/* 그룹 헤더 (ACTUAL, OTB 등) */}
          {groupHeader && (
            <tr style={{ background: 'var(--color-bg-tertiary)',
                         borderBottom: '1px solid var(--color-border-default)' }}>
              <th className="px-4 py-2 text-left text-xs font-medium text-brand-muted"
                style={{ minWidth: 180 }}>
                Segmentation
              </th>
              <th colSpan={columns.length}
                className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-accent-primary)' }}>
                {groupHeader}
              </th>
            </tr>
          )}

          {/* 컬럼 헤더 */}
          <tr style={{ background: 'var(--color-bg-tertiary)',
                       borderBottom: '1px solid var(--color-border-default)' }}>
            <th className="px-4 py-2 text-left text-xs font-medium text-brand-muted"
              style={{ minWidth: 180 }}>
              {!groupHeader && 'Segmentation'}
            </th>
            {columns.map(col => (
              <th key={col.key}
                className="px-4 py-2 text-right text-xs font-medium text-brand-muted"
                style={{ width: col.width ?? 100 }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* 대분류 + 소분류 */}
          {tree.groups.map(group => (
            <React.Fragment key={group.parent.id}>

              {/* 대분류 행 */}
              <tr style={{
                background:   group.parent.color ?? 'var(--color-bg-secondary)',
                borderTop:    '1px solid var(--color-border-default)',
              }}>
                <td className="px-4 py-2.5"
                  style={{
                    fontWeight: group.parent.is_bold ? 700 : 600,
                    color:      'var(--color-text-primary)',
                  }}>
                  {group.parent.name}
                </td>
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-2.5 text-right"
                    style={{ color: 'var(--color-text-primary)' }}>
                    {col.render
                      ? col.render(aggregateMain(group, data, col.key), {})
                      : formatValue(aggregateMain(group, data, col.key), col.type)
                    }
                  </td>
                ))}
              </tr>

              {/* 소분류 행 */}
              {group.children.map((child, i) => (
                <tr key={child.id}
                  className="hover:bg-[var(--overlay-hover)] transition-colors"
                  style={{
                    borderBottom: i < group.children.length - 1
                      ? '1px solid var(--color-border-subtle)'
                      : 'none'
                  }}>
                  <td className="px-4 py-2 pl-8 text-sm"
                    style={{
                      color:      'var(--color-text-secondary)',
                      fontWeight: child.is_bold ? 600 : 400,
                    }}>
                    <span className="text-brand-dimmed mr-2" style={{ fontSize: 12 }}>└</span>
                    {child.name}
                  </td>
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-2 text-right text-sm"
                      style={{ color: 'var(--color-text-secondary)' }}>
                      {col.render
                        ? col.render(aggregateSub(child, data, col.key), {})
                        : formatValue(aggregateSub(child, data, col.key), col.type)
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </React.Fragment>
          ))}

          {/* 중분류 행 */}
          {tree.mids.map(mid => (
            <tr key={mid.id}
              className="hover:bg-[var(--overlay-hover)] transition-colors"
              style={{ borderTop: '1px solid var(--color-border-default)' }}>
              <td className="px-4 py-2.5 text-sm"
                style={{
                  color:      'var(--color-text-primary)',
                  fontWeight: mid.is_bold ? 600 : 400,
                }}>
                {mid.name}
              </td>
              {columns.map(col => (
                <td key={col.key} className="px-4 py-2.5 text-right text-sm"
                  style={{ color: 'var(--color-text-primary)' }}>
                  {col.render
                    ? col.render(aggregateMid(mid, data, col.key), {})
                    : formatValue(aggregateMid(mid, data, col.key), col.type)
                  }
                </td>
              ))}
            </tr>
          ))}

          {/* 합계 행 */}
          <tr style={{
            borderTop:  '2px solid var(--color-border-default)',
            background: 'var(--color-bg-tertiary)',
          }}>
            <td className="px-4 py-2.5 text-sm font-semibold"
              style={{ color: 'var(--color-text-primary)' }}>
              합계
            </td>
            {columns.map(col => (
              <td key={col.key} className="px-4 py-2.5 text-right text-sm font-semibold"
                style={{ color: 'var(--color-text-primary)' }}>
                {col.render
                  ? col.render(aggregateTotal(tree, data, col.key), {})
                  : formatValue(aggregateTotal(tree, data, col.key), col.type)
                }
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
```

---

## 로딩 스켈레톤

```tsx
function LoadingSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden animate-pulse"
      style={{ border: '1px solid var(--color-border-default)' }}>
      {[1,2,3,4,5,6,7,8].map(i => (
        <div key={i} className="h-10 mx-0"
          style={{
            background: i % 2 === 0
              ? 'var(--color-bg-secondary)'
              : 'var(--color-bg-tertiary)',
            borderBottom: '1px solid var(--color-border-subtle)'
          }} />
      ))}
    </div>
  )
}
```

---

## 하단 합계 행 (Total / Occupancy / Rev.PAR)

### Props 추가
```ts
export type MarketTableProps = {
  hotelId:      string
  columns:      MarketTableColumn[]
  data:         MarketTableData
  groupHeader?: string
  loading?:     boolean
  className?:   string
  year?:        number    // ← 추가 (해당 년도)
  month?:       number    // ← 추가 (해당 월)
}
```

### room_count 조회
```ts
const { data: hotelDetail } = useQuery({
  queryKey: ['m03_hotel_details', hotelId],
  queryFn: async () => {
    const { data, error } = await (supabase as any)
      .from('m03_hotel_details')
      .select('room_count')
      .eq('hotel_id', hotelId)
      .single()
    if (error) throw error
    return data
  },
  enabled:   !!hotelId,
  staleTime: 10 * 60 * 1000,
})

const roomCount = hotelDetail?.room_count ?? 0
```

### 해당월 일수 계산
```ts
// year, month props로 해당월 마지막 일 계산
const daysInMonth = useMemo(() => {
  if (!year || !month) return 0
  return new Date(year, month, 0).getDate()
  // new Date(2026, 4, 0) → 2026년 4월 마지막 일 = 30
}, [year, month])

// 가용 객실수 = room_count × 해당월 일수
const availableRooms = roomCount * daysInMonth
```

### 하단 3개 행 렌더링
```tsx
{/* Total 행 */}
<tr style={{
  borderTop:  '2px solid var(--color-border-default)',
  background: 'var(--color-bg-tertiary)',
}}>
  <td className="px-4 py-2.5 text-sm font-semibold"
    style={{ color: 'var(--color-text-primary)' }}>
    Total
  </td>
  {columns.map(col => (
    <td key={col.key} className="px-4 py-2.5 text-right text-sm font-semibold"
      style={{ color: 'var(--color-text-primary)' }}>
      {col.render
        ? col.render(aggregateTotal(tree, data, col.key), {})
        : formatValue(aggregateTotal(tree, data, col.key), col.type)
      }
    </td>
  ))}
</tr>

{/* Occupancy 행 */}
<tr style={{
  borderTop:  '1px solid var(--color-border-subtle)',
  background: 'var(--color-bg-tertiary)',
}}>
  <td className="px-4 py-2.5 text-sm font-semibold"
    style={{ color: 'var(--color-text-primary)' }}>
    Occupancy
  </td>
  {columns.map(col => {
    const isRnCol = col.key === 'rn' || col.key === 'rooms_sold'
    const totalRn = aggregateTotal(tree, data, 'rn') ||
                    aggregateTotal(tree, data, 'rooms_sold')
    // OCC = Total R/N / (room_count × 해당월 일수)
    const occ = isRnCol && availableRooms > 0
      ? (totalRn / availableRooms) * 100
      : null
    return (
      <td key={col.key} className="px-4 py-2.5 text-right text-sm font-semibold"
        style={{ color: 'var(--color-accent-primary)' }}>
        {occ !== null ? `${occ.toFixed(1)}%` : '-'}
      </td>
    )
  })}
</tr>

{/* Rev.PAR 행 */}
<tr style={{
  borderTop:  '1px solid var(--color-border-subtle)',
  background: 'var(--color-bg-tertiary)',
}}>
  <td className="px-4 py-2.5 text-sm font-semibold"
    style={{ color: 'var(--color-text-primary)' }}>
    Rev.PAR
  </td>
  {columns.map(col => {
    const isRevCol = col.key === 'rev' || col.key === 'room_revenue'
    const totalRn  = aggregateTotal(tree, data, 'rn') ||
                     aggregateTotal(tree, data, 'rooms_sold')
    const totalRev = aggregateTotal(tree, data, 'rev') ||
                     aggregateTotal(tree, data, 'room_revenue')
    // OCC = Total R/N / availableRooms
    // ADR = Total REV / Total R/N
    // Rev.PAR = OCC * ADR
    const occ    = availableRooms > 0 ? totalRn / availableRooms : 0
    const adr    = totalRn > 0 ? totalRev / totalRn : 0
    const revpar = isRevCol ? Math.round(occ * adr) : null
    return (
      <td key={col.key} className="px-4 py-2.5 text-right text-sm font-semibold"
        style={{ color: 'var(--color-accent-primary)' }}>
        {revpar !== null ? formatValue(revpar, 'currency') : '-'}
      </td>
    )
  })}
</tr>
```

### 계산 공식
```
Total      → 모든 대분류/중분류 합산
Occupancy  → Total R/N / (room_count × 해당월 일수) × 100
ADR        → Total REV / Total R/N
Rev.PAR    → Occupancy × ADR
```

### 사용 예시
```tsx
<MarketTable
  hotelId={currentHotel.id}
  year={2026}
  month={4}
  groupHeader="ACTUAL"
  columns={[
    { key: 'rn',  label: 'R/N',  type: 'number' },
    { key: 'adr', label: 'ADR',  type: 'currency' },
    { key: 'rev', label: 'REV',  type: 'currency' },
  ]}
  data={actualData}
/>
```

```ts
// ADR은 합산이 아닌 가중평균
// revenue / rooms_sold 로 계산
// type: 'currency' 컬럼에서 render prop으로 처리

// 사용 예시
{
  key: 'adr',
  label: 'ADR',
  type: 'currency',
  render: (_, row) => {
    const rev = aggregateSub(child, data, 'rev')
    const rn  = aggregateSub(child, data, 'rn')
    return formatValue(rn > 0 ? Math.round(rev / rn) : 0, 'currency')
  }
}
```

---

## 주의사항
- c05_market_table_schema는 컴포넌트 내부에서 TanStack Query로 조회
- data props는 segmentation 값을 key로 하는 객체
- 대분류 합계 = 소분류들의 segmentation 배열 합산
- 중분류 합계 = 본인 segmentation 배열 합산
- ADR은 단순 합산이 아닌 rev/rn 가중평균으로 계산
- (supabase as any) 캐스팅 패턴 유지
- TypeScript 타입 export (다른 페이지에서 import)
- 빈 데이터일 때 '-' 표시

위 조건대로 구현해줘.
