# NovaStay Forecast — Step 4a (상단 카드 영역 + FC/OTB 카드)

## 🎯 목표
표 위에 **카드 영역 4개**를 추가하고, 그 중 **FORECAST와 CURRENT OTB 카드만 채워줘**.

BUDGET과 LAST YEAR 카드는 **"준비 중" 빈 카드**로 두기 (Step 4b/4c에서 채움).

새 데이터 fetch는 없음. 기존 baseline 데이터에서 합산만.

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
- ✅ `app/forecast/types/forecast-data.ts`
- ✅ `app/forecast/data/forecast-baseline.ts`
- ✅ `app/forecast/page.tsx`
- ✅ `app/forecast/components/ForecastTable.tsx`
- ✅ `app/forecast/components/ForecastHeader.tsx`
- ✅ `app/forecast/components/SegmentFilter.tsx`

이번엔 **새 컴포넌트 추가**:
- `app/forecast/components/SummaryCards.tsx` (카드 영역 컨테이너)
- `app/forecast/components/SummaryCard.tsx` (개별 카드)

`page.tsx`에 카드 영역 렌더링 추가.

---

## 🖼️ 카드 영역 위치

```
[페이지 제목: 일자별 세그먼트 전망]
[월 selector: < 2026년 5월 > 오늘]

[카드 영역]  ← 여기 추가!
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  FORECAST    │ CURRENT OTB  │   BUDGET     │  LAST YEAR   │
│              │              │              │              │
│  ₩222.5M     │  ₩186.4M     │  준비 중      │   준비 중     │
│  R/N 1,250   │  R/N 1,060   │              │              │
│  ADR ₩178K   │  FC 대비 84% │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘

[세그먼트 필터: 전체 / 초기화 / 8개 버튼들]
[메인 표]
```

---

## 🎴 카드 1: FORECAST

**데이터 소스**: 현재 화면에 보이는 baseline 데이터 (전체 월)

**계산**:
```typescript
// 선택된 세그먼트만 합산? 아니면 전체?
// → 일단 전체 (필터와 무관). Step 5에서 필터 연동 검토.

const forecastTotal = {
  rn: 0,
  rev: 0,
  adr: 0,
}

for (const day of data) {
  for (const code of schema.allSegmentationCodes) {
    const v = day.values[code]
    if (v) {
      forecastTotal.rn += v.rn
      forecastTotal.rev += v.rev
    }
  }
}
forecastTotal.adr = forecastTotal.rn > 0 ? forecastTotal.rev / forecastTotal.rn : 0
```

**표시**:
```
┌────────────────────────┐
│ FORECAST               │  ← 작은 라벨 (uppercase, 회색)
│                        │
│ ₩222.5M                │  ← 큰 숫자 (백만원 단위)
│                        │
│ R/N    1,250           │  ← 보조 정보
│ ADR    ₩178K           │
│ OCC    85.4%           │
└────────────────────────┘
```

**스타일**:
- 흰 배경 또는 var(--color-background-primary)
- 살짝 강조 (테두리 진하게 또는 그림자)
- "FORECAST" 라벨 작게 회색
- 메인 숫자 크게 (예: 24~28px)

---

## 🎴 카드 2: CURRENT OTB

**데이터 소스**: 같은 baseline 데이터의 `current_otb_rn`, `current_otb_revenue` 합산

**계산**:
```typescript
const otbTotal = {
  rn: 0,
  rev: 0,
  adr: 0,
}

for (const day of data) {
  for (const code of schema.allSegmentationCodes) {
    const v = day.values[code]
    if (v) {
      otbTotal.rn += v.otb_rn
      otbTotal.rev += v.otb_rev
    }
  }
}
otbTotal.adr = otbTotal.rn > 0 ? otbTotal.rev / otbTotal.rn : 0

// FC 대비 %
const otbRatio = forecastTotal.rev > 0 
  ? (otbTotal.rev / forecastTotal.rev * 100) 
  : 0
```

**표시**:
```
┌────────────────────────┐
│ CURRENT OTB            │
│                        │
│ ₩186.4M                │
│                        │
│ R/N    1,060           │
│ FC 대비 84.0%           │  ← 핵심 비교 지표
└────────────────────────┘
```

**스타일**:
- 회색 배경 (var(--color-background-secondary)) — 참고용 느낌
- 메인 숫자는 FORECAST 카드와 같은 크기
- "FC 대비" 색상: 80% 이상이면 초록, 60~80%면 노란색, 60% 미만이면 빨강 (선택적)

---

## 🎴 카드 3 & 4: BUDGET, LAST YEAR (준비 중)

**일단 빈 카드로**:
```
┌────────────────────────┐
│ BUDGET                 │
│                        │
│ 준비 중                  │  ← 회색 텍스트
│                        │
│ (Step 4b)              │
└────────────────────────┘
```

```
┌────────────────────────┐
│ LAST YEAR              │
│                        │
│ 준비 중                  │
│                        │
│ (Step 4c)              │
└────────────────────────┘
```

같은 카드 컴포넌트 사용. `loading=true` 또는 `placeholder` prop으로 빈 상태 표시.

---

## 🔧 SummaryCard 컴포넌트 설계

```tsx
// app/forecast/components/SummaryCard.tsx
type SummaryCardProps = {
  label: string                  // 'FORECAST', 'CURRENT OTB', ...
  variant?: 'primary' | 'secondary'  // primary=강조, secondary=회색배경
  // 데이터 있을 때
  mainValue?: string             // '₩222.5M'
  rows?: Array<{ label: string; value: string; tone?: 'success' | 'warning' | 'danger' }>
  // 데이터 없을 때
  placeholder?: string           // '준비 중'
}

export function SummaryCard({ label, variant = 'primary', mainValue, rows, placeholder }: SummaryCardProps) {
  return (
    <div style={{ /* card styles */ }}>
      <div className="label">{label}</div>
      {placeholder ? (
        <div className="placeholder">{placeholder}</div>
      ) : (
        <>
          <div className="main">{mainValue}</div>
          <div className="rows">
            {rows?.map((r, i) => (
              <div key={i}>
                <span>{r.label}</span>
                <span className={r.tone}>{r.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

---

## 🔢 숫자 포맷 헬퍼

```typescript
// 백만원 단위 (소수점 1자리)
function fmtMillion(won: number): string {
  return '₩' + (won / 1_000_000).toFixed(1) + 'M'
}

// 천원 단위 (정수)
function fmtThousand(won: number): string {
  return '₩' + Math.round(won / 1000).toLocaleString() + 'K'
}

// 정수 (콤마)
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString()
}

// 퍼센트 (소수점 1자리)
function fmtPct(n: number): string {
  return n.toFixed(1) + '%'
}
```

기존 forecast 모듈에 이미 있는 헬퍼 활용 가능하면 그쪽 우선.

---

## 📊 OCC 계산 (FORECAST 카드)

```typescript
// 월 전체 OCC = 월 전체 RN 합 ÷ (호텔 객실수 × 일수)
// 5월이면 31일
const daysInMonth = data.length  // 또는 new Date(year, month, 0).getDate()
const totalCapacity = schema.roomCount * daysInMonth
const monthOcc = totalCapacity > 0 ? (forecastTotal.rn / totalCapacity * 100) : 0
```

---

## 🎨 카드 영역 레이아웃

```tsx
// SummaryCards.tsx
<div style={{ 
  display: 'grid', 
  gridTemplateColumns: 'repeat(4, 1fr)', 
  gap: '12px',
  marginBottom: '20px'
}}>
  <SummaryCard label="FORECAST" variant="primary" ... />
  <SummaryCard label="CURRENT OTB" variant="secondary" ... />
  <SummaryCard label="BUDGET" placeholder="준비 중" />
  <SummaryCard label="LAST YEAR" placeholder="준비 중" />
</div>
```

반응형: 좁아지면 2×2 그리드 (`grid-template-columns: repeat(2, 1fr)` 적용)

---

## ❌ 이번 단계엔 만들지 마

- ❌ BUDGET 카드 실제 데이터 (Step 4b)
- ❌ LAST YEAR 카드 실제 데이터 (Step 4c)
- ❌ 카드에 Gap 표시 (4b/4c에서)
- ❌ 필터 연동 (Step 5에서)
- ❌ 글로벌 파일 수정 (절대!)

---

## ✅ 완료 기준

- `/forecast` 페이지 상단에 카드 영역 4개 보임
- **FORECAST 카드**: 월 전체 합산 (REV, R/N, ADR, OCC)
- **CURRENT OTB 카드**: 월 전체 OTB 합산 + FC 대비 %
- **BUDGET / LAST YEAR 카드**: "준비 중" 빈 상태
- 카드 4개가 가로로 배치 (반응형 OK)
- 표/필터/월 selector 모두 그대로 동작
- 다른 페이지 영향 없음
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음
- 다크/라이트 모드 자연스러움

---

## 💬 의심스러운 부분 있으면 멈춰

- NovaStay에 이미 있는 카드 컴포넌트가 있는지 확인 (Budget 페이지 등)
- 숫자 포맷 헬퍼가 어디에 있는지 (기존 활용)
- 카드 영역의 정확한 위치 (월 selector 아래? 필터 위?)
