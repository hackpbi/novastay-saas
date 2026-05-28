# NovaStay Forecast — Step 1.5b (표 헤더 동적 생성)

## 🎯 목표
Step 1.5a에서 fetch한 schema를 사용해서 **표 헤더만 동적으로 생성**해줘.

forecast 값(셀 데이터)은 **여전히 더미** 유지. 실제 데이터 연결은 Step 2.

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
- ✅ `app/forecast/data/forecast-schema.ts` (Step 1.5a, fetchForecastSchema 함수)
- ✅ `app/forecast/page.tsx` (기존)
- ✅ `app/forecast/components/ForecastTable.tsx` (기존)
- ✅ `app/forecast/data/forecast-dummy.ts` (기존 더미)
- ✅ `app/forecast/types/forecast.ts` (기존 타입)

이번엔 **`ForecastTable.tsx`만 주로 수정**하고, 더미 데이터 구조도 살짝 조정.

---

## 🖼️ 새 표 구조

### 열 순서 (왼쪽부터)

```
1. 날짜 (sticky 고정)
2. Total ← 맨 앞으로 이동!
   - RN, ADR, REV, OCC%   ← OCC 추가!
3. 부모1 (예: Corp. FIT)
   - RN, ADR, REV (자식 합산)
4. 자식1-1 (예: Contracted)
   - RN, ADR, REV
5. 자식1-2 (예: Non Contracted)
   - RN, ADR, REV
6. 부모2 (예: Direct)
   ... (자식들)
7. ... 부모8까지
```

### 헤더 구조 시각화

```
┌──────────┬─────────────────────┬──────────────────────────────────────────────┬─...
│          │       Total         │            Corp. FIT (main)                   │ ...
│  날짜    ├──┬───┬─────┬──────┼─────────────┬──────────────┬───────────────┤─...
│          │  │   │     │      │  (합산)     │ Contracted   │ Non Contracted │ ...
│          │RN│ADR│ REV │OCC%  │RN│ADR│REV  │RN│ADR│ REV  │RN│ADR│ REV     │ ...
├──────────┼──┼───┼─────┼──────┼──┼───┼─────┼──┼───┼─────┼──┼───┼──────────┤─...
│5/22 (목) │  │   │     │      │  │   │     │  │   │     │  │   │          │ ...
```

**자식 없는 mid 노드** (Employee, Member, Comp, House Use):
```
│ Employee ★ │
├─────────────┤
│RN│ADR│REV  │
```
한 묶음만. 자식 없으니까.

---

## 🧮 OCC 계산 (중요!)

```typescript
// OCC = Total RN ÷ 호텔 총 객실수 × 100
function calcOcc(totalRn: number, roomCount: number): number {
  if (roomCount === 0) return 0
  return (totalRn / roomCount) * 100
}

// 표시: 소수점 1자리 + % (예: 85.4%)
formatOcc(85.4) → "85.4%"
```

`roomCount`는 schema에서 가져옴 (`schema.roomCount`).

---

## 🧮 합산 로직

```typescript
// 부모 합산: 자식들의 segmentation 코드 합산
function calcNodeValue(daily: DailyForecast, node: SchemaNode): SegmentValue {
  let rn = 0, rev = 0
  for (const code of node.segmentationCodes) {
    const v = daily.values[code]
    if (v) { 
      rn += v.rn
      rev += v.rev 
    }
  }
  return { 
    rn, 
    adr: rn > 0 ? rev / rn : 0,  // 가중평균
    rev 
  }
}

// Total: 모든 활성 segmentation 코드 합산
function calcTotal(daily: DailyForecast, allCodes: string[]): SegmentValue {
  let rn = 0, rev = 0
  for (const code of allCodes) {
    const v = daily.values[code]
    if (v) { 
      rn += v.rn
      rev += v.rev 
    }
  }
  return { rn, adr: rn > 0 ? rev / rn : 0, rev }
}
```

---

## 📦 더미 데이터 조정

기존 `forecast-dummy.ts`를 자식 코드 단위로 조정:

```typescript
// 자식 코드별 더미 값 생성 규칙
const DUMMY_RULES: Record<string, {
  weekdayRn: [number, number]
  weekendRn: [number, number]
  adr: [number, number]
}> = {
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

const DEFAULT_RULE = { weekdayRn: [5, 15], weekendRn: [10, 20], adr: [150000, 200000] }

// 31일치 × 모든 segmentation 코드 더미 생성
// schema.allSegmentationCodes 받아서 그것만 생성
```

---

## 🎨 시각 규칙

- **Total 열**: 진한 배경 (var(--color-background-secondary) 정도), 약간 굵게
- **부모 (main, mid)**: 자식 있으면 살짝 진한 배경, semi-bold
- **자식 (sub)**: 가는 폰트, 살짝 옅은 배경, 부모와 점선 구분
- **is_bold=true** (Employee, Member, Comp, House Use): ★ 표시
- **숫자 포맷**:
  - RN: 정수 (예: 28)
  - ADR/REV: 천원 단위 + 콤마 (예: 195 / 5,460) - 단위는 페이지 하단에 "단위: 천원" 안내
  - OCC: 소수점 1자리 + % (예: 85.4%)
- **무료** (ADR=0): "-" 회색
- **첫 열(날짜)**: sticky 고정 `position: sticky; left: 0`
- 가로 스크롤 활성화

---

## 🔧 컴포넌트 구조

```tsx
// ForecastTable.tsx 대략적인 구조

type Props = {
  schema: ForecastSchema       // Step 1.5a에서 fetch한 데이터
  data: DailyForecast[]        // 더미 데이터 (자식 코드 단위)
}

export function ForecastTable({ schema, data }: Props) {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          {/* 1행: 날짜(rowspan=3) | Total(colspan=4) | 부모1(colspan=자식수*3+3 or 3) | ... */}
          {/* 2행: Total 하위 빈셀 | 부모1 (합산) | 자식1-1 | 자식1-2 | ... */}
          {/* 3행: RN | ADR | REV | OCC% | (각 부모/자식의) RN | ADR | REV */}
        </thead>
        <tbody>
          {data.map((daily) => (
            <tr key={daily.business_date}>
              <td>{daily.day_label}</td>
              {/* Total 셀 4개 */}
              {/* schema.nodes를 순회하며 부모 + 자식 셀들 */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## 🧹 정리 작업

- Step 1.5a에서 추가한 디버그 영역 ("Schema Loaded ✅" 박스) 제거
- 기존 하드코딩된 세그먼트 정의가 있다면 (`forecast-segments.ts`) 더 이상 사용 안 함
  - 파일은 일단 두되, import하는 곳 모두 schema 기반으로 교체

---

## ❌ 이번 단계엔 만들지 마

- ❌ Step 2 (실제 forecast 데이터 연결)
- ❌ 가로 펼침 (이미 다 펼침)
- ❌ 세그먼트 필터 버튼
- ❌ OTB 세로 펼침
- ❌ 자동 경고
- ❌ 상단 카드 영역
- ❌ 글로벌 파일 수정 (절대!)

---

## ✅ 완료 기준

- `/forecast` 페이지에 새로운 표 구조 보임
- **Total 열이 날짜 바로 옆 (맨 앞)**에 위치
- **Total에 OCC% 컬럼 있음**
- 부모 + 자식 모두 표시 (총 17개 데이터 묶음)
- schema.allSegmentationCodes 길이에 맞춰 동적으로 헤더 생성
- 부모 값 = 자식들의 합산 (RN 합, REV 합, ADR 가중평균)
- Total OCC% = Total RN ÷ schema.roomCount × 100
- ★ 표시가 4개 부모(Employee, Member, Comp, House Use)에 정확히
- 무료(ADR=0) 셀이 "-" 회색
- 가로 스크롤로 모든 열 확인 가능
- 첫 열(날짜) sticky 고정
- 다크/라이트 모드 둘 다 자연스러움
- 다른 페이지(Budget 등) 전혀 영향 없음
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음

---

## 💬 의심스러운 부분이 있다면

작업 중 다음 같은 상황이면 **추측하지 말고 멈춰**:
- 기존 ForecastTable 구조가 새 구조와 충돌
- 더미 데이터 형식 변경이 너무 큼
- schema prop이 어디서 전달되는지 모름

오버엔지니어링보다 안전이 우선이야.
