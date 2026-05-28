# NovaStay Forecast — OTB 수동 펼침 (Step A)

## 🎯 목표
표에서 행을 클릭하면 그 아래에 **OTB 행이 펼쳐지게** 만들어줘.

이 단계엔 **수동 펼침만** (사용자가 클릭해야 펼침). 자동 펼침, 빨간 셀 강조 등은 다음 Step.

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

수정할 파일:
- `app/forecast/components/ForecastTable.tsx` (펼침 로직 추가)
- `app/forecast/data/forecast-baseline.ts` (transformRpcToTableData에 otb_adr 계산 추가)
- `app/forecast/types/forecast-data.ts` (필요시 otb_adr 타입 추가)

---

## 🔧 1. 데이터 — otb_adr 계산 추가

### 타입 (forecast-data.ts)

```typescript
export type ForecastDayData = {
  business_date: string
  day_label: string
  is_actual_day: boolean
  values: Record<string, {
    rn: number
    adr: number
    rev: number
    otb_rn: number
    otb_adr: number      // ← 추가
    otb_rev: number
    is_actual: boolean
    capped: boolean
  }>
}
```

### 변환 (forecast-baseline.ts)

`transformRpcToTableData` 함수에서 각 row 변환 시:

```typescript
values[row.segmentation] = {
  rn: row.forecast_rn,
  adr: row.forecast_adr ?? 0,
  rev: row.forecast_revenue,
  otb_rn: row.current_otb_rn,
  otb_adr: row.current_otb_rn > 0 ? row.current_otb_revenue / row.current_otb_rn : 0,  // ← 계산
  otb_rev: row.current_otb_revenue,
  is_actual: row.is_actual,
  capped: row.capped,
}
```

---

## 🔧 2. 펼침 상태 관리

`ForecastTable.tsx`에 상태 추가:

```typescript
const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

function toggleExpand(date: string) {
  setExpandedDates(prev => {
    const next = new Set(prev)
    if (next.has(date)) next.delete(date)
    else next.add(date)
    return next
  })
}
```

---

## 🔧 3. 행 클릭 + 펼침 표시

### 행 클릭 핸들러

각 데이터 행(tr)에 클릭 핸들러:

```tsx
<tr 
  onClick={() => toggleExpand(daily.business_date)}
  style={{ cursor: 'pointer' }}
>
  <td>
    <span style={{ /* 작은 화살표 */ }}>
      {expandedDates.has(daily.business_date) ? '▼' : '▶'}
    </span>
    {daily.day_label}
    {/* 이벤트 점/이름 */}
  </td>
  {/* ... 나머지 셀들 (FC 값) */}
</tr>
```

날짜 셀 내부 구조:
```
[▶ 5/22 (금)]
[🔴 부처님오시는날]
```

▶: 접힘 / ▼: 펼침

### 펼침된 OTB 행 추가

각 FC 행 다음에, 펼침 상태면 OTB 행 렌더링:

```tsx
{data.map((daily) => (
  <>
    {/* FC 행 */}
    <tr onClick={() => toggleExpand(daily.business_date)}>
      ...
    </tr>
    
    {/* OTB 행 (펼침된 경우만) */}
    {expandedDates.has(daily.business_date) && (
      <tr style={{ /* OTB 행 스타일 */ }}>
        <td>
          <div style={{ paddingLeft: 20 }}>
            └ OTB
          </div>
        </td>
        {/* Total OTB 셀들 */}
        {/* 부모/자식 OTB 셀들 */}
      </tr>
    )}
  </>
))}
```

---

## 🔧 4. OTB 행 셀 렌더링

FC 행과 같은 구조로 OTB 데이터를 표시:

```tsx
// Total OTB
const totalOtb = calcOtbFromData(daily, schema.allSegmentationCodes)
// OCC% (OTB 기준) | OTB RN | OTB ADR | OTB REV

// 각 부모/자식 OTB
const nodeOtb = calcOtbFromData(daily, node.segmentationCodes)
// OTB RN | OTB ADR | OTB REV
```

`calcOtbFromData` 헬퍼:

```typescript
function calcOtbFromData(daily: ForecastDayData, codes: string[]) {
  let rn = 0, rev = 0
  for (const code of codes) {
    const v = daily.values[code]
    if (v) {
      rn += v.otb_rn
      rev += v.otb_rev
    }
  }
  return {
    rn,
    adr: rn > 0 ? rev / rn : 0,
    rev,
  }
}
```

기존 `calcFromData` 패턴 그대로, otb_ 필드만 사용.

---

## 🎨 OTB 행 스타일

OTB 행은 FC 행과 시각적으로 구분:

| 항목 | 스타일 |
|------|--------|
| 배경 | 약간 옅은 회색 (var(--color-background-secondary) 또는 살짝 다른 톤) |
| 글씨 크기 | FC 행보다 약간 작게 (10~11px) |
| 글씨 색 | secondary (옅게) |
| 날짜 셀 들여쓰기 | "└ OTB" 형태로 |
| 구분선 | FC 행과 OTB 행 사이는 부드럽게 (점선 또는 약한 선) |

다음 날짜 FC 행과 OTB 행 사이는 일반 실선 (다른 날짜와 구분).

---

## 🧪 동작 시나리오 검증

**시나리오 1 — 기본 상태**
- 모든 행 접힘 (▶ 표시)
- 31개 FC 행만 보임

**시나리오 2 — 행 클릭**
- 5/22 클릭 → ▶ → ▼ 변경
- 5/22 FC 행 아래에 "└ OTB" 행 추가
- 같은 컬럼 구조로 OTB 값 표시

**시나리오 3 — 다시 클릭**
- ▼ → ▶
- OTB 행 사라짐

**시나리오 4 — 여러 행 펼침**
- 5/22, 5/24, 5/26 동시에 펼침 가능

**시나리오 5 — Total OTB 합리성**
- 펼침 시 Total OTB가 자식들의 OTB 합과 일치

---

## ❌ 이번 단계엔 만들지 마

- ❌ 자동 펼침 (Step B)
- ❌ 임계값 슬라이더 (Step B)
- ❌ 빨간 셀 강조 (Step C)
- ❌ `+숫자` 배지 (Step C)
- ❌ 상단 카드 영역 (별도)
- ❌ 글로벌 파일 수정 (절대!)

---

## ✅ 완료 기준

- `transformRpcToTableData`가 `otb_adr` 계산해서 채움
- 모든 FC 행에 ▶ 또는 ▼ 토글 표시
- 행 클릭 시 토글 동작
- 펼침 시 그 행 아래에 OTB 행 추가
- OTB 행은 FC 행과 시각적으로 구분
- OTB 행 컬럼 구조가 FC 행과 동일 (Total + 부모 + 자식)
- Total OTB 값이 자식들 OTB 합과 일치
- 여러 행 동시 펼침 가능
- 페이지 새로고침 시 모두 접힌 상태로 시작
- 다른 페이지/기능 영향 없음
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음

---

## 💬 의심스러운 부분 있으면 멈춰

- 클릭 영역 (날짜 셀만? 전체 행?)
  - 권장: 전체 행 (cursor: pointer + onClick on tr)
- OTB 행에 OCC도 표시할지
  - 권장: 표시 (Total 영역에)
- 행 펼침 상태 영구 저장 여부
  - 권장: 안 함 (페이지 새로고침 시 초기화)

오버엔지니어링보다 안전이 우선.
