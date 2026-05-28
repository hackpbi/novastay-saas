# NovaStay Forecast 페이지 — Step 1.5 (c05 동적 구조 + 더미 forecast)

## 🎯 목표
기존 Forecast 표를 수정해서, **표 구조(열 헤더)를 c05_market_table_schema 데이터에서 동적으로** 만들어줘.

이렇게 하면:
- ✅ RM이 c05를 수정하면 즉시 화면 반영
- ✅ 호텔마다 다른 세그먼트 분류 자동 지원
- ✅ is_bold, order_index, name 같은 메타데이터 그대로 활용

**forecast 값들(R/N, ADR, REV)은 여전히 더미**로 유지. 실제 데이터 연결은 Step 2.

---

## 📋 작업 시작 전

기존 `/forecast` 페이지 파일들이 있어. 새로 만들지 말고 **수정**해줘:
- `app/forecast/page.tsx`
- `app/forecast/components/ForecastTable.tsx`
- `app/forecast/data/forecast-segments.ts` ← 이 파일은 폐기될 거야
- `app/forecast/data/forecast-dummy.ts`
- `app/forecast/types/forecast.ts`

---

## 📊 c05_market_table_schema 테이블 구조

```sql
c05_market_table_schema
  id            uuid          PK
  hotel_id      uuid          FK → m02_hotels
  name          text          -- 표시명 (Corp. FIT, Direct, ...)
  level         text          -- 'main' | 'mid' | 'sub'
  parent_id     uuid          -- 부모 ID (없으면 NULL)
  segmentation  text[]        -- 연결된 segmentation 코드 배열
  order_index   integer       -- 정렬 순서
  color         text          -- 배경색 (지금은 무시)
  is_bold       boolean       -- 굵게 표시 여부
  is_active     boolean       -- 활성 여부
```

### 실제 데이터 예시 (이사님 호텔 기준)

| order_index | level | name | parent_id | segmentation | is_bold |
|-------------|-------|------|-----------|--------------|---------|
| 0 | main | Corp. FIT | NULL | [] | false |
|   | sub | Contracted | corpfit_id | [COR] | false |
|   | sub | Non Contracted | corpfit_id | [CNC] | false |
| 1 | main | Direct | NULL | [] | false |
|   | sub | Room Only | direct_id | [RMO] | false |
|   | sub | Package | direct_id | [PKG] | false |
| 2 | main | TA | NULL | [] | false |
|   | sub | DOTA | ta_id | [WHD] | false |
|   | sub | IOTA | ta_id | [WHO] | false |
| 3 | mid | Employee | NULL | [EMP] | **true** |
| 4 | mid | Member | NULL | [MEM] | **true** |
| 5 | main | Group | NULL | [] | false |
|   | sub | MICE | group_id | [MIC] | false |
|   | sub | Tour | group_id | [TOG] | false |
| 6 | mid | Comp | NULL | [COM] | **true** |
| 7 | mid | House Use | NULL | [HOU] | **true** |

---

## 🧠 동적 구조 로직

### 1. c05 fetch
```typescript
// app/forecast/data/forecast-schema.ts (새 파일)
import { createClient } from '@/lib/supabase/client'  // 기존 패턴 따라

export async function fetchForecastSchema(hotelId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('c05_market_table_schema')
    .select('id, name, level, parent_id, segmentation, order_index, is_bold, is_active')
    .eq('hotel_id', hotelId)
    .eq('is_active', true)
    .order('order_index', { ascending: true })
  
  if (error) throw error
  return data
}
```

### 2. 트리 구조로 변환

c05는 flat 데이터로 오니까, parent-child 관계로 정리:

```typescript
type C05Row = {
  id: string
  name: string
  level: 'main' | 'mid' | 'sub'
  parent_id: string | null
  segmentation: string[]
  order_index: number
  is_bold: boolean
}

type SchemaNode = {
  id: string
  name: string
  level: 'main' | 'mid' | 'sub'
  isBold: boolean
  orderIndex: number
  segmentationCodes: string[]   // 본인 또는 자식의 segmentation 합산
  children: SchemaNode[]        // 자식 노드들 (sub들)
}

function buildSchemaTree(rows: C05Row[]): SchemaNode[] {
  // parent_id IS NULL인 노드들을 최상위로
  // 그 자식들을 children에 채움
  // is_active=true만 사용
  // 각 노드의 segmentationCodes 계산:
  //   - 자식 있으면: 자식들의 segmentation 합쳐서
  //   - 자식 없으면: 본인 segmentation
}
```

### 3. 표 헤더 그리기

부모 + 자식 모두 열로 표시:

```
부모 1개 = (자식이 있으면) 자식 개수만큼 + 1(부모합산) 열
부모 1개 = (자식이 없으면) 1열만
```

예시:
- Corp. FIT (자식 2개) → 3개 열 (Corp. FIT 합산 + Contracted + Non Contracted)
- Employee (자식 없음) → 1개 열 (Employee만)

각 열마다 RN/ADR/REV 3개 서브 컬럼.

---

## 🖼️ 화면 구조

```
페이지 헤더:
  일자별 세그먼트 전망
  2026년 5월

표:
┌──────────┬──────────────────────────────────────────────────┬──────────────────────────────────────────────────┬─...
│          │            Corp. FIT (main)                       │            Direct (main)                          │ ...
│  날짜    ├─────────────┬───────────────┬───────────────────┤─────────────┬───────────────┬─────────────────┤─...
│          │  (합산)     │  Contracted   │  Non Contracted    │  (합산)     │  Room Only    │  Package        │ ...
│          ├──┬───┬─────┼──┬───┬─────┼──┬───┬─────┼──┬───┬─────┼──┬───┬─────┼──┬───┬─────┤─...
│          │RN│ADR│REV  │RN│ADR│REV  │RN│ADR│REV  │RN│ADR│REV  │RN│ADR│REV  │RN│ADR│REV  │ ...
├──────────┼──┼───┼─────┼──┼───┼─────┼──┼───┼─────┼──┼───┼─────┼──┼───┼─────┼──┼───┼─────┤─...
│5/22 (목) │  │   │     │  │   │     │  │   │     │  │   │     │  │   │     │  │   │     │ ...
```

자식 없는 mid 노드 (Employee, Member, Comp, House Use):
```
│ Employee ★ │
├─────────────┤
│RN│ADR│REV  │
```

한 열만 사용 (합산이 곧 본인).

---

## 📦 더미 데이터

```typescript
// app/forecast/data/forecast-dummy.ts
// c05의 모든 segmentation 코드를 보고, 각 코드별로 더미 값 생성

type DummyValueRules = {
  [code: string]: {
    weekdayRn: [number, number]   // [min, max]
    weekendRn: [number, number]
    adr: [number, number]         // [min, max] 원 단위
  }
}

const DUMMY_RULES: DummyValueRules = {
  COR: { weekdayRn: [14, 17], weekendRn: [18, 22], adr: [200000, 220000] },
  CNC: { weekdayRn: [11, 14], weekendRn: [15, 18], adr: [175000, 195000] },
  RMO: { weekdayRn: [10, 14], weekendRn: [13, 17], adr: [170000, 195000] },
  PKG: { weekdayRn: [8, 12],  weekendRn: [12, 15], adr: [180000, 210000] },
  WHD: { weekdayRn: [8, 12],  weekendRn: [12, 15], adr: [165000, 190000] },
  WHO: { weekdayRn: [7, 10],  weekendRn: [10, 13], adr: [160000, 185000] },
  EMP: { weekdayRn: [1, 3],   weekendRn: [1, 3],   adr: [0, 0] },
  MEM: { weekdayRn: [5, 8],   weekendRn: [7, 10],  adr: [165000, 175000] },
  MIC: { weekdayRn: [7, 12],  weekendRn: [3, 8],   adr: [130000, 160000] },
  TOG: { weekdayRn: [3, 8],   weekendRn: [2, 7],   adr: [125000, 155000] },
  COM: { weekdayRn: [1, 3],   weekendRn: [1, 3],   adr: [0, 0] },
  HOU: { weekdayRn: [0, 2],   weekendRn: [0, 2],   adr: [0, 0] },
}

// 알려지지 않은 code (다른 호텔)에는 기본값
const DEFAULT_RULE = { weekdayRn: [5, 15], weekendRn: [10, 20], adr: [150000, 200000] }
```

핵심: **c05에서 가져온 모든 segmentation 코드에 대해 더미 값 생성**. 알려지지 않은 코드는 DEFAULT_RULE.

---

## 🧮 합산 로직

```typescript
// 부모 합산: 자식들의 segmentation 코드 모두 합쳐서
function calcParentValue(daily: DailyForecast, segmentationCodes: string[]): SegmentValue {
  let rn = 0, rev = 0
  for (const code of segmentationCodes) {
    const v = daily.values[code]
    if (v) { rn += v.rn; rev += v.rev }
  }
  return { rn, adr: rn > 0 ? rev / rn : 0, rev }
}

// mid (자식 없는 부모)도 동일 함수 사용 (segmentationCodes = [본인 코드])

// Total: 모든 활성 segmentation 코드
function calcTotal(daily: DailyForecast, allCodes: string[]): SegmentValue {
  return calcParentValue(daily, allCodes)
}
```

---

## 🎨 시각 규칙

- main/mid 부모: 살짝 진한 배경, semi-bold
- sub 자식: 가는 폰트, 살짝 들여쓰기 느낌, 점선 구분
- is_bold=true: 부모명 옆에 ★ 표시
- 부모 ↔ 자식 사이 점선 구분, 부모 ↔ 부모 사이 실선 구분
- RN: 정수 그대로
- ADR/REV: 천원 단위 표시 (`Math.round(v/1000).toLocaleString()`)
- 무료(ADR=0): "-" 회색
- 첫 열(날짜): sticky 고정
- 가로 스크롤

---

## ⚠️ 작업 시 주의사항

1. **기존 패턴 따라가기**: Supabase client 생성, hook 패턴, loading/error 처리 등
2. **호텔 ID는 어떻게?**: 기존 다른 페이지(예: Budget)가 호텔 ID 받는 방식 그대로 (context, route param 등)
3. **로딩 상태**: c05 fetch 중일 때 스켈레톤 또는 로딩 표시
4. **에러 상태**: c05 fetch 실패 시 명확한 에러 메시지
5. **빈 데이터**: c05에 데이터 없으면 "세그먼트 설정이 필요합니다" 안내
6. **TypeScript 엄격**: any 금지

---

## ❌ 이번 단계엔 만들지 마

- ❌ forecast 실제 DB 연결 (Step 2)
- ❌ 가로 펼침 (이미 다 펼침)
- ❌ 세그먼트 필터 버튼
- ❌ OTB 세로 펼침
- ❌ 자동 경고
- ❌ 상단 카드

---

## ✅ 완료 기준

- `/forecast` 접속 시 c05_market_table_schema fetch 실행
- 받은 데이터로 표 헤더가 동적으로 그려짐
- 부모 + 자식 모두 열로 표시
- is_bold=true인 mid에 ★ 표시
- order_index 순서대로 좌→우 정렬
- 부모 값 = 자식들의 합산 (RN 합, REV 합, ADR 가중평균)
- Total = 모든 자식 합산
- 더미 forecast 값 표시
- 로딩/에러 상태 처리
- 다크/라이트 모드 자연스러움
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음
