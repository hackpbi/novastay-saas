# NovaStay Forecast — Step 2b (실제 baseline 데이터 연결)

## 🎯 목표
Step 2a에서 만든 fetch 함수의 결과를 **표에 실제 연결**해줘.
- 더미 데이터 제거
- 디버그 영역 제거
- 과거/미래 시각 구분 (글씨 색 차이)
- Group(MIC, TOG)은 "-" 표시

---

## 🚨 반드시 지킬 안전 규칙

**다음 파일들은 절대 수정하지 마**:
- `app/layout.tsx`
- `app/globals.css`
- `tailwind.config.ts/js`
- 사이드바, 헤더, 네비게이션
- 기타 글로벌 파일

**수정 범위**: `app/forecast/` 폴더 안에서만.

---

## 📋 작업 전 확인

이미 만들어진 파일들:
- ✅ `app/forecast/types/forecast-schema.ts` (Step 1.5a)
- ✅ `app/forecast/data/forecast-schema.ts` (Step 1.5a)
- ✅ `app/forecast/types/forecast-data.ts` (Step 2a)
- ✅ `app/forecast/data/forecast-baseline.ts` (Step 2a)
- ✅ `app/forecast/page.tsx`
- ✅ `app/forecast/components/ForecastTable.tsx`

이번엔 **`page.tsx`와 `ForecastTable.tsx`만 주로** 수정.

---

## 🔧 수정 작업

### 1. `page.tsx` 정리

**제거**:
- 디버그 영역 ("Baseline Data ✅" 박스)
- 더미 데이터 import 및 사용
- 더미 데이터 props 전달

**유지/변경**:
- schema fetch 그대로
- baseline fetch 그대로
- 두 데이터가 모두 로드된 후 표 렌더링

```tsx
'use client'

import { useEffect, useState } from 'react'
import { fetchForecastSchema } from './data/forecast-schema'
import { fetchBaselineForecast, transformRpcToTableData } from './data/forecast-baseline'
import type { ForecastSchema } from './types/forecast-schema'
import type { ForecastDayData } from './types/forecast-data'
import { ForecastTable } from './components/ForecastTable'

export default function ForecastPage() {
  // 호텔 ID는 기존 방식대로
  const hotelId = /* 기존 패턴 */
  
  const [schema, setSchema] = useState<ForecastSchema | null>(null)
  const [data, setData] = useState<ForecastDayData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    if (!hotelId) return
    
    setLoading(true)
    Promise.all([
      fetchForecastSchema(hotelId),
      fetchBaselineForecast(hotelId, '2026-05-01', '2026-05-31'),
    ])
      .then(([s, rows]) => {
        setSchema(s)
        setData(transformRpcToTableData(rows))
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [hotelId])
  
  if (loading) return <div>Loading...</div>  // 또는 기존 로딩 패턴
  if (error) return <div>Error: {error}</div>
  if (!schema) return <div>세그먼트 설정이 필요합니다</div>
  
  return (
    <>
      <h1>일자별 세그먼트 전망</h1>
      <p>2026년 5월</p>
      <ForecastTable schema={schema} data={data} />
    </>
  )
}
```

---

### 2. `ForecastTable.tsx` 수정

**Props 타입 변경**:
```tsx
type Props = {
  schema: ForecastSchema
  data: ForecastDayData[]  // 기존 더미 타입에서 변경
}
```

**셀 렌더링 로직**:

각 세그먼트 코드별로 데이터 꺼내올 때:

```tsx
function getCellValue(daily: ForecastDayData, code: string) {
  const v = daily.values[code]
  if (!v) {
    // RPC 결과에 없는 코드 (예: MIC, TOG → Group 자식)
    return { rn: null, adr: null, rev: null, isActual: false }
  }
  return {
    rn: v.rn,
    adr: v.adr,
    rev: v.rev,
    isActual: v.is_actual,
  }
}

// 셀 렌더링
function renderCell(value, isActual) {
  if (value === null) return <td className="text-gray-400">-</td>
  
  return (
    <td 
      className={isActual ? '' : 'text-foreground/60'}  // 미래는 약간 옅게
      // 또는 style={{ opacity: isActual ? 1 : 0.7 }}
    >
      {formatValue(value)}
    </td>
  )
}
```

**과거/미래 시각 구분** (약하게):
- `is_actual === true`: 일반 색상
- `is_actual === false`: 글씨 색 약간 옅게 (opacity 0.65~0.75 또는 `text-foreground/60`)
- 배경은 동일

**Group (MIC, TOG) 처리**:
- RPC 결과에 없으니 `daily.values[code]`가 undefined
- 셀에 "-" 회색 표시
- 부모(Group) 합산도 자식이 다 없으니 결과적으로 0이거나 NULL → "-" 표시

**부모 합산 로직** (기존 유지):
```typescript
function calcParentValue(daily: ForecastDayData, node: SchemaNode) {
  let rn = 0, rev = 0
  let hasData = false
  for (const code of node.segmentationCodes) {
    const v = daily.values[code]
    if (v) {
      rn += v.rn
      rev += v.rev
      hasData = true
    }
  }
  if (!hasData) return null  // Group처럼 데이터 없으면 null
  return { rn, adr: rn > 0 ? rev / rn : 0, rev }
}
```

부모 값이 `null`이면 셀에 "-" 표시.

**Total 계산**:
- schema.allSegmentationCodes 모두 합산
- Group 코드는 데이터 없으니 자동으로 0 기여
- Total RN이 정상 계산됨 (FIT만 합산된 결과)
- OCC% = Total RN ÷ schema.roomCount × 100

---

## 🎨 시각 규칙 정리

| 셀 상태 | 표시 |
|---------|------|
| 정상 actual (과거) | 일반 색상 |
| 정상 forecast (미래) | 글씨 약간 옅게 |
| Group 자식 (데이터 없음) | "-" 회색 |
| Group 부모 (자식 데이터 없음) | "-" 회색 |
| ADR=0 (무료 객실) | "-" 회색 |
| capped=true | (이번 단계엔 표시 안 함, 나중에 추가) |

---

## 🧹 정리 작업

다음을 **제거**:
- 디버그 영역 ("Schema Loaded ✅", "Baseline Data ✅")
- 더미 데이터 import (`forecast-dummy.ts` 사용 안 함)
- 콘솔 log (개발 검증용이었음)

`forecast-dummy.ts` 파일 자체는 일단 둬도 됨 (나중에 폴백용으로 쓸 수도 있음). 그냥 import만 안 함.

---

## ❌ 이번 단계엔 만들지 마

- ❌ 세그먼트 필터 버튼 (Step 3)
- ❌ OTB 세로 펼침 (Step 4)
- ❌ 자동 경고 (Step 5)
- ❌ 상단 카드 (Step 6)
- ❌ capped 경고 표시 (나중에)
- ❌ 글로벌 파일 수정 (절대!)

---

## ✅ 완료 기준

- `/forecast` 페이지에서:
  - 디버그 영역 사라짐
  - 표에 **실제 baseline 데이터** 표시
  - 더미 데이터 흔적 없음
- **과거 날짜** (오늘 이전): 일반 색상
- **미래 날짜** (오늘 이후): 글씨 약간 옅음
- **Group 자식** (MIC, TOG) 셀: "-" 회색
- **Group 부모** 셀: "-" 회색
- Total RN/ADR/REV/OCC% 정상 계산
- 부모 셀 = 자식 합산 (FIT 계열만)
- 다른 페이지 영향 없음
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음
- 로딩/에러 상태 처리

---

## 💬 의심스러운 부분 있으면 멈춰

- 호텔 ID를 어디서 받는지 (Step 1.5a에서 받은 방식 그대로)
- 날짜 범위를 어디서 받을지 (일단 5/1~5/31 하드코딩 OK, 나중에 selector 만들 거)
- Loading UI 패턴 (기존 페이지 따라가)
