# NovaStay Forecast 페이지 — 1단계: 가장 단순한 표

## 목표
일자별 × 세그먼트별 Forecast 표를 만들어줘.
**1단계라서 펼침·필터·자동경고는 제외**하고, 가장 기본 구조만 동작하게 만들자.
나중에 한 단계씩 기능을 추가할 거야.

---

## 작업 시작 전 확인

먼저 기존 NovaStay 프로젝트 구조를 확인하고 다음에 맞춰서 작업해줘:
- 라우팅 구조 (Next.js App Router?)
- 디자인 시스템 (CSS 변수, Tailwind 토큰)
- 기존 표 컴포넌트 패턴 (Budget 페이지 등 참고)
- TypeScript 타입 패턴

**기존 패턴을 깨지 말고 그대로 따라가줘.**

---

## 페이지 경로
`/forecast` (기존 라우팅 규칙에 맞춰서 조정 가능)

---

## 화면 구성 (1단계만)

```
[페이지 제목]
일자별 세그먼트 전망
2026년 5월

[표]
─────────────────────────────────────────────────────────────────────────
날짜    | Corp. FIT   | Direct      | TA          | Employee ★ | Member ★ | Group      | Comp ★    | House Use ★ | Total
        | RN ADR REV  | RN ADR REV  | RN ADR REV  | RN ADR REV | RN ADR REV| RN ADR REV | RN ADR REV| RN ADR REV  | RN ADR REV
─────────────────────────────────────────────────────────────────────────
5/22(목)| 28 195 5460 | 22 180 3960 | ...
5/23(금)| ...
...
─────────────────────────────────────────────────────────────────────────
```

### 표 사양
- 헤더 2단 구조 (대분류명 + RN/ADR/REV 서브 헤더)
- 9개 세그먼트 + Total 열 = 30개 데이터 열
- 가로 스크롤 (overflow-x: auto)
- 첫 열(날짜) sticky 고정
- ★ 표시는 `is_bold=true`인 항목
- 모든 숫자는 우측 정렬
- 금액은 천 단위 콤마 (toLocaleString)
- ADR/REV가 0인 항목은 회색 "-" 표시 (Employee, Comp, House Use 등 무료객실)

### Total 계산 규칙 (중요)
- Total R/N = 모든 세그먼트 R/N 합
- Total REV = 모든 세그먼트 REV 합
- **Total ADR = Total REV ÷ Total R/N (가중평균, 단순평균 X)**

---

## 더미 데이터 구조

TypeScript 타입:

```typescript
// 세그먼트 정의 (c05_market_table_schema 모방)
type Segment = {
  id: string          // 'corpfit', 'direct', ...
  name: string        // 'Corp. FIT', 'Direct', ...
  isBold: boolean     // is_bold
  orderIndex: number  // 표시 순서
  // 1단계에선 children 무시. 다음 단계에 추가.
}

// 한 날짜의 한 세그먼트 데이터
type SegmentValue = {
  rn: number
  adr: number
  rev: number
}

// 일별 Forecast 데이터
type DailyForecast = {
  business_date: string                  // '2026-05-22'
  day_label: string                      // '5/22 (목)'
  segments: Record<string, SegmentValue> // { corpfit: {...}, direct: {...}, ... }
}
```

더미 데이터:

```typescript
const segments: Segment[] = [
  { id: 'corpfit',  name: 'Corp. FIT', isBold: false, orderIndex: 0 },
  { id: 'direct',   name: 'Direct',    isBold: false, orderIndex: 1 },
  { id: 'ta',       name: 'TA',        isBold: false, orderIndex: 2 },
  { id: 'employee', name: 'Employee',  isBold: true,  orderIndex: 3 },
  { id: 'member',   name: 'Member',    isBold: true,  orderIndex: 4 },
  { id: 'group',    name: 'Group',     isBold: false, orderIndex: 5 },
  { id: 'comp',     name: 'Comp',      isBold: true,  orderIndex: 6 },
  { id: 'houseuse', name: 'House Use', isBold: true,  orderIndex: 7 },
]

// 31일치 더미 데이터 (5/1 ~ 5/31)
// 각 날짜에 8개 세그먼트 모두 값 채워주기
// Employee/Comp/House Use는 ADR=0, REV=0 (무료객실)
// 주말이 평일보다 살짝 높게, 현실적인 분포로 생성
```

---

## 파일 구조 제안

```
app/forecast/
  page.tsx                          - 메인 페이지
  components/
    ForecastTable.tsx              - 표 컴포넌트
  data/
    forecast-segments.ts           - segments 정의
    forecast-dummy.ts              - 31일치 더미 데이터
  utils/
    forecast-calc.ts               - Total ADR 계산 등 헬퍼
```

---

## 스타일 가이드

- NovaStay 기존 디자인 시스템 토큰 사용
- 표 헤더 배경: var(--color-background-secondary)
- 표 본문 배경: var(--color-background-primary)
- 테두리: 0.5px solid var(--color-border-tertiary)
- Total 열 배경: 살짝 회색 (rgba(180,178,169,0.08) 또는 유사한 토큰)
- 글씨 크기: 11~12px (표가 빡빡해서)
- 폰트는 NovaStay 기본 폰트

---

## 작업 시 주의사항

1. **추정하지 말고 확인**: 기존 프로젝트의 디자인 시스템·라우팅·컴포넌트 패턴부터 보고 따라가줘
2. **TypeScript 타입 명확히**: any 사용 금지
3. **데이터 페칭 로직은 더미 함수로 분리**: 나중에 Supabase 쿼리로 바꿀 수 있게
4. **반응형은 최소만**: 가로 스크롤이 되면 OK. 모바일 최적화는 나중에
5. **다크/라이트 모드 둘 다 동작**: CSS 변수만 사용

---

## 이번 단계엔 포함하지 마

다음 단계에서 추가할 거니까 지금은 만들지 마:
- ❌ 세그먼트 필터 버튼
- ❌ 임계값 슬라이더
- ❌ 가로 펼침 (대분류 → 소분류)
- ❌ 세로 펼침 (FC → OTB)
- ❌ 자동 경고 (빨간 셀)
- ❌ 상단 카드 영역 (FC · OTB · Budget · LY)
- ❌ 실제 Supabase 연결
- ❌ AI 분석

오직 **"31일치 × 9개 세그먼트 × R/N·ADR·REV"** 표만.

---

## 완료 기준

- /forecast 경로 접속 시 표가 보임
- 31일 × 9개 세그먼트 × 3개 값(RN/ADR/REV) 모두 표시
- 가로 스크롤로 모든 열 확인 가능
- 날짜 열은 가로 스크롤 해도 고정
- Total 열의 ADR이 가중평균으로 계산됨
- ★ 표시가 4개 세그먼트(Employee, Member, Comp, House Use)에 정확히 표시
- 무료객실 ADR/REV가 "-"로 표시
- 다크/라이트 모드 둘 다 자연스럽게 동작
