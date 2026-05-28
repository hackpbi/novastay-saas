# NovaStay Forecast — Step 1.5a (Schema Fetch만)

## 🎯 목표
Forecast 페이지에서 사용할 **세그먼트 스키마 fetch 함수**만 먼저 만들어줘.

표는 건드리지 말고, **데이터 가져오는 로직만** 검증하는 단계야. 콘솔에 결과 찍어서 동작만 확인.

---

## 🚨 반드시 지킬 안전 규칙

**다음 파일들은 절대 수정하지 마**:
- `app/layout.tsx` (RootLayout)
- `app/globals.css`
- `tailwind.config.ts` 또는 `tailwind.config.js`
- 사이드바, 헤더, 네비게이션 컴포넌트
- 기타 글로벌 영향이 있는 어떤 파일도

**수정/생성 범위**: `app/forecast/` 폴더 안에서만 작업해.

기존에 만들어둔 forecast 관련 파일을 활용해도 되지만, 글로벌 영향 있는 곳엔 손대지 마.

---

## 📋 작업 시작 전 확인

기존 NovaStay 프로젝트의 Supabase 사용 패턴을 먼저 확인해줘:
- Supabase client 생성 방법 (browser/server client 구분)
- 다른 fetch 함수들 어떻게 작성됐는지 (예: Budget 페이지)
- 호텔 ID는 어디서 받는지 (Context, hook, route param 등)
- 에러 처리 패턴

**기존 패턴 그대로 따라가**.

---

## 📁 만들 파일 (2개)

### 1. `app/forecast/types/forecast-schema.ts`

TypeScript 타입 정의:

```typescript
// c05_market_table_schema row
export type C05Row = {
  id: string
  hotel_id: string
  name: string
  level: 'main' | 'mid' | 'sub'
  parent_id: string | null
  segmentation: string[]
  order_index: number
  is_bold: boolean
  is_active: boolean
}

// 트리 구조 변환 후
export type SchemaNode = {
  id: string
  name: string
  level: 'main' | 'mid' | 'sub'
  isBold: boolean
  orderIndex: number
  segmentationCodes: string[]   // 자식 있으면 자식들의 합, 없으면 본인 segmentation
  children: SchemaNode[]        // 자식 노드들 (없으면 빈 배열)
}

// 전체 스키마 + 호텔 정보
export type ForecastSchema = {
  hotelId: string
  roomCount: number              // m03_hotel_details.room_count
  nodes: SchemaNode[]            // 트리 구조 (최상위만, 자식은 children 안에)
  allSegmentationCodes: string[] // 모든 활성 segmentation 코드 (Total 계산용)
}
```

---

### 2. `app/forecast/data/forecast-schema.ts`

Fetch 함수:

```typescript
import type { C05Row, SchemaNode, ForecastSchema } from '../types/forecast-schema'

/**
 * c05_market_table_schema와 m03_hotel_details에서 forecast 페이지에 필요한 데이터 fetch
 */
export async function fetchForecastSchema(hotelId: string): Promise<ForecastSchema> {
  // 1. Supabase client 생성 (기존 패턴 따라가)
  
  // 2. c05_market_table_schema에서 활성 행 모두 가져오기
  //    SELECT id, hotel_id, name, level, parent_id, segmentation, order_index, is_bold, is_active
  //    WHERE hotel_id = ? AND is_active = true
  //    ORDER BY order_index ASC
  
  // 3. m03_hotel_details에서 room_count 가져오기
  //    SELECT room_count WHERE hotel_id = ?
  
  // 4. flat C05Row[] → 트리 구조 SchemaNode[]로 변환 (아래 함수 사용)
  
  // 5. 모든 segmentation 코드 수집 (Total 계산용)
  
  // 6. ForecastSchema 객체로 반환
}

/**
 * flat C05Row 배열을 트리 구조로 변환
 * 
 * 규칙:
 * - parent_id IS NULL인 노드만 최상위 (main 또는 mid)
 * - level='main'은 보통 자식(sub) 가짐
 * - level='mid'는 자식 없음 (자기 자신의 segmentation 사용)
 * - level='sub'는 parent의 children에 들어감
 * - order_index 순서 유지
 * 
 * segmentationCodes 계산:
 * - 자식 있으면: 자식들의 segmentation 모두 합침
 * - 자식 없으면: 본인 segmentation
 */
function buildSchemaTree(rows: C05Row[]): SchemaNode[] {
  // 구현
}
```

---

## 🧪 검증용 페이지 (선택)

`app/forecast/page.tsx`가 이미 있으면, **그 페이지에 작은 디버그 영역만** 추가:

```tsx
// 페이지 최상단(또는 별도 섹션)에서 사용
'use client'

import { useEffect, useState } from 'react'
import { fetchForecastSchema } from './data/forecast-schema'
import type { ForecastSchema } from './types/forecast-schema'

// 호텔 ID는 기존 패턴대로 받기 (Context 또는 hook 등)

export default function ForecastPage() {
  const [schema, setSchema] = useState<ForecastSchema | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    fetchForecastSchema(hotelId)
      .then((data) => {
        setSchema(data)
        console.log('=== Forecast Schema ===')
        console.log('Hotel ID:', data.hotelId)
        console.log('Room Count:', data.roomCount)
        console.log('Nodes:', data.nodes)
        console.log('All segmentation codes:', data.allSegmentationCodes)
      })
      .catch((e) => setError(String(e)))
  }, [hotelId])
  
  // 기존 화면 유지 + 디버그 정보만 추가
  return (
    <>
      {/* 기존 화면 그대로 */}
      
      {/* 임시 디버그 영역 (Step 1.5b에서 제거 예정) */}
      {schema && (
        <div style={{ fontSize: 11, padding: 12, background: 'var(--color-background-secondary)', margin: 12, borderRadius: 8 }}>
          <strong>Schema Loaded ✅</strong>
          <div>Room count: {schema.roomCount}</div>
          <div>Top-level nodes: {schema.nodes.length}</div>
          <div>All segmentation codes: {schema.allSegmentationCodes.join(', ')}</div>
        </div>
      )}
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
    </>
  )
}
```

**중요**: 기존 화면 레이아웃 망가뜨리지 말고, 디버그 영역만 살짝 추가.

---

## 🧠 트리 변환 로직 — 알고리즘 설명

```
입력: flat C05Row 배열 (모든 행이 평평하게)
출력: SchemaNode[] (트리 구조)

1. parent_id별로 그룹핑 (Map)
2. parent_id가 NULL인 행들이 최상위
3. 각 최상위 행에 대해:
   a. order_index로 정렬된 자식들 추가
   b. is_active=true인 자식만 포함
4. 각 노드의 segmentationCodes 계산:
   - 자식 있으면: children.flatMap(c => c.segmentationCodes로 채워진 본인 segmentation)
   - 자식 없으면: 본인의 segmentation 배열
```

---

## ❌ 이번 단계엔 만들지 마

- ❌ 표 컴포넌트 수정 (Step 1.5b에서)
- ❌ 합산 로직 (Step 1.5c에서)
- ❌ 더미 forecast 데이터 (이미 있는 거 유지)
- ❌ 글로벌 파일 수정 (절대 금지!)
- ❌ 새 라우트 추가

---

## ✅ 완료 기준

- `app/forecast/types/forecast-schema.ts` 생성됨
- `app/forecast/data/forecast-schema.ts` 생성됨
- `/forecast` 페이지 접속 시:
  - 기존 화면 깨지지 않음
  - 디버그 영역에 "Schema Loaded ✅" 표시
  - room_count 값 표시
  - top-level nodes 개수 표시
  - all segmentation codes 표시
  - 콘솔에 전체 schema 객체 로그
- 다른 페이지(Budget 등) 전혀 영향 없음
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음

---

## 💬 의심스러운 부분이 있다면

작업 중 다음 같은 상황이 생기면 **추측하지 말고 멈춰서 물어봐**:
- Supabase client 생성 방법이 두 가지 이상 보임
- 호텔 ID를 어디서 받는지 명확하지 않음
- 기존 fetch 패턴이 hook 기반인지 직접 호출인지 애매함

오버엔지니어링보다 안전이 중요해.
