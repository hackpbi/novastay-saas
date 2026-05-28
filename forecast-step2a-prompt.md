# NovaStay Forecast — Step 2a (Baseline RPC 호출 함수)

## 🎯 목표
Supabase에 만들어둔 `calculate_baseline_forecast_bulk` 함수를 호출하는 **fetch 함수**만 만들어줘.

표는 건드리지 말고, **데이터 가져오는 로직만** 검증. 콘솔로만 결과 확인.

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
- ✅ `app/forecast/types/forecast-schema.ts`
- ✅ `app/forecast/data/forecast-schema.ts`
- ✅ `app/forecast/page.tsx`
- ✅ `app/forecast/components/ForecastTable.tsx`
- ✅ `app/forecast/data/forecast-dummy.ts`

기존 Supabase RPC 호출 패턴 먼저 확인 (Budget 페이지 등에 있을 것).

---

## 📡 Supabase 함수 시그니처

이미 Supabase에 생성된 함수:

```sql
calculate_baseline_forecast_bulk(
  p_hotel_id    uuid,
  p_start_date  date,
  p_end_date    date,
  p_today       date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  business_date          date,
  segmentation           text,
  forecast_rn            integer,
  forecast_adr           numeric,
  forecast_revenue       bigint,
  current_otb_rn         integer,
  current_otb_revenue    bigint,
  ly_remaining_pickup_rn integer,
  ly_remaining_pickup_rev bigint,
  ly_match_date          date,
  ly_otb_snapshot_date   date,
  capped                 boolean,
  is_actual              boolean
)
```

---

## 📁 만들 파일 (2개)

### 1. `app/forecast/types/forecast-data.ts`

TypeScript 타입:

```typescript
// RPC 반환 row (snake_case 그대로)
export type ForecastRpcRow = {
  business_date: string          // ISO date string
  segmentation: string           // 'COR', 'CNC', ...
  forecast_rn: number
  forecast_adr: number | null
  forecast_revenue: number
  current_otb_rn: number
  current_otb_revenue: number
  ly_remaining_pickup_rn: number | null
  ly_remaining_pickup_rev: number | null
  ly_match_date: string | null
  ly_otb_snapshot_date: string | null
  capped: boolean
  is_actual: boolean
}

// 표에서 쓰기 쉬운 형태로 변환된 데이터 (날짜별 그룹핑)
export type ForecastDayData = {
  business_date: string                   // '2026-05-22'
  day_label: string                       // '5/22 (목)'
  is_actual_day: boolean                  // 그 날의 모든 행이 actual인지
  values: Record<string, {                // { COR: {...}, CNC: {...}, ... }
    rn: number
    adr: number
    rev: number
    otb_rn: number                        // 현재 OTB
    otb_rev: number
    is_actual: boolean
    capped: boolean
  }>
}
```

---

### 2. `app/forecast/data/forecast-baseline.ts`

Fetch 함수:

```typescript
import type { ForecastRpcRow, ForecastDayData } from '../types/forecast-data'

/**
 * Supabase의 calculate_baseline_forecast_bulk 함수 호출
 * 
 * @param hotelId 호텔 UUID
 * @param startDate 'YYYY-MM-DD'
 * @param endDate 'YYYY-MM-DD'
 * @returns RPC 결과 row 배열 (snake_case)
 */
export async function fetchBaselineForecast(
  hotelId: string,
  startDate: string,
  endDate: string
): Promise<ForecastRpcRow[]> {
  // 1. Supabase client 생성 (기존 패턴 따라)
  
  // 2. RPC 호출
  //    const { data, error } = await supabase.rpc('calculate_baseline_forecast_bulk', {
  //      p_hotel_id: hotelId,
  //      p_start_date: startDate,
  //      p_end_date: endDate,
  //    })
  //    p_today는 default(CURRENT_DATE)라 안 넘김
  
  // 3. 에러 처리
  // 4. data 그대로 반환 (snake_case 유지)
}

/**
 * RPC 결과를 표에서 쓰기 쉬운 형태로 변환 (날짜별 그룹핑)
 * 
 * 입력: ForecastRpcRow[] (날짜 × 세그먼트 long format)
 * 출력: ForecastDayData[] (날짜별, 세그먼트는 values 객체로 wide format)
 */
export function transformRpcToTableData(
  rows: ForecastRpcRow[]
): ForecastDayData[] {
  // 1. business_date로 그룹핑
  // 2. 각 날짜마다:
  //    - day_label 생성 (예: '5/22 (목)')
  //    - values 객체에 세그먼트 코드별로 채움
  //    - is_actual_day: 그 날 모든 행이 is_actual=true이면 true
  // 3. business_date 오름차순 정렬
  // 4. 반환
}

/**
 * '2026-05-22' 같은 ISO 날짜를 '5/22 (목)' 형식으로 변환
 */
function formatDayLabel(isoDate: string): string {
  // M/D (요일) 형식
}
```

---

## 🧪 검증용 코드 (page.tsx에 임시 추가)

기존 `/forecast` 페이지에 **디버그 영역만 살짝 추가**:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { fetchBaselineForecast, transformRpcToTableData } from './data/forecast-baseline'
import type { ForecastDayData } from './types/forecast-data'

export default function ForecastPage() {
  // 기존 schema fetch + 더미 데이터 표 그대로 유지
  
  // 추가: baseline 데이터 fetch
  const [baselineData, setBaselineData] = useState<ForecastDayData[]>([])
  const [baselineError, setBaselineError] = useState<string | null>(null)
  
  useEffect(() => {
    if (!hotelId) return
    
    // 이번 달 5/1 ~ 5/31 (또는 현재 보고 있는 월)
    const startDate = '2026-05-01'
    const endDate = '2026-05-31'
    
    fetchBaselineForecast(hotelId, startDate, endDate)
      .then((rows) => {
        console.log('=== Raw RPC rows ===', rows.length, 'rows')
        console.log('First row:', rows[0])
        
        const transformed = transformRpcToTableData(rows)
        console.log('=== Transformed (날짜별) ===', transformed.length, 'days')
        console.log('First day:', transformed[0])
        
        setBaselineData(transformed)
      })
      .catch((e) => {
        console.error('Baseline fetch error:', e)
        setBaselineError(String(e))
      })
  }, [hotelId])
  
  return (
    <>
      {/* 기존 화면 그대로 (표는 더미 데이터로) */}
      <ForecastTable schema={schema} data={dummyData} />
      
      {/* 임시 디버그 영역 (Step 2b에서 제거 예정) */}
      <div style={{ 
        fontSize: 11, 
        padding: 12, 
        background: 'var(--color-background-secondary)', 
        margin: 12, 
        borderRadius: 8 
      }}>
        <strong>Baseline Data ✅</strong>
        <div>Days loaded: {baselineData.length}</div>
        <div>First date: {baselineData[0]?.business_date}</div>
        <div>First date label: {baselineData[0]?.day_label}</div>
        <div>Segments on first day: {baselineData[0] ? Object.keys(baselineData[0].values).join(', ') : '-'}</div>
        {baselineError && <div style={{ color: 'red' }}>Error: {baselineError}</div>}
      </div>
    </>
  )
}
```

**중요**: 기존 표는 그대로 둠. baseline 데이터는 콘솔과 디버그 박스에만 표시.

---

## 🧠 transformRpcToTableData 로직 상세

```
입력 예시:
[
  { business_date: '2026-05-22', segmentation: 'COR', forecast_rn: 15, forecast_adr: 210000, forecast_revenue: 3150000, current_otb_rn: 15, current_otb_revenue: 3150000, is_actual: true, ... },
  { business_date: '2026-05-22', segmentation: 'CNC', forecast_rn: 13, ... },
  { business_date: '2026-05-22', segmentation: 'RMO', ... },
  ...
  { business_date: '2026-05-23', segmentation: 'COR', ... },
  ...
]

출력 예시:
[
  {
    business_date: '2026-05-22',
    day_label: '5/22 (목)',
    is_actual_day: true,
    values: {
      COR: { rn: 15, adr: 210000, rev: 3150000, otb_rn: 15, otb_rev: 3150000, is_actual: true, capped: false },
      CNC: { rn: 13, adr: 180000, rev: 2340000, otb_rn: 13, otb_rev: 2340000, is_actual: true, capped: false },
      RMO: { ... },
      ...
    }
  },
  {
    business_date: '2026-05-23',
    day_label: '5/23 (금)',
    is_actual_day: true,
    values: { ... }
  },
  ...
]
```

---

## ❌ 이번 단계엔 만들지 마

- ❌ 표 컴포넌트 수정 (Step 2b에서)
- ❌ 더미 데이터 제거 (계속 사용)
- ❌ Group 빈 칸 처리 (Step 2b에서)
- ❌ 글로벌 파일 수정 (절대!)

---

## ✅ 완료 기준

- `app/forecast/types/forecast-data.ts` 생성됨
- `app/forecast/data/forecast-baseline.ts` 생성됨
- `/forecast` 페이지 접속 시:
  - 기존 표 (더미) 그대로 보임
  - 디버그 영역에 "Baseline Data ✅" 표시
  - "Days loaded" 숫자 (5월이면 31일 정도)
  - 첫 날짜 표시
  - 세그먼트 코드들 표시 (COR, CNC, RMO, PKG, WHD, WHO, EMP, MEM, COM, HOU)
  - 콘솔에 raw rows + transformed data 로그
- 다른 페이지 영향 없음
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음

---

## 💬 의심스러운 부분 있으면

작업 중 다음 같은 상황이면 **추측하지 말고 멈춰**:
- Supabase RPC 호출 패턴이 두 가지 이상
- 호텔 ID 받는 방법 모름 (기존 schema fetch는 어떻게 받았는지 확인)
- 날짜 범위를 어디서 받을지 (일단 5/1~5/31 하드코딩 OK)
