# NovaStay Forecast — Step 3 (UI 개선: capped 경고 + 필터 + 월 selector)

## 🎯 목표
Forecast 페이지에 3가지 UI 기능 추가:
- **A. capped 경고 표시**: 호텔 객실 수 초과 시 시각 표시
- **B. 세그먼트 필터 버튼**: 다중 선택, 본인 담당만 보기
- **D. 월 selector**: 이전/다음 월 화살표 네비게이션

새 데이터 fetch는 필요 없음. 이미 있는 데이터로 UI만 개선.

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
- ✅ `app/forecast/page.tsx` (또는 ForecastPage.tsx)
- ✅ `app/forecast/components/ForecastTable.tsx`

기존 패턴 확인:
- 버튼 컴포넌트 (NovaStay에서 쓰는 Button 스타일)
- 아이콘 (chevron, warning 등)
- 색상 토큰 (warning/danger 색상)

---

## 🎨 A. capped 경고 표시

### 데이터 위치
RPC 결과의 각 행에 `capped: boolean` 필드가 있어. 이미 fetch 단계에서 받음.
- `capped=true`: forecast가 호텔 객실 수 초과해서 cap됨 (호텔 만석 가능성)
- `capped=false`: 정상

### 시각 표시 방법

**옵션 — Total 행에 표시** (이번에 채택)
한 날짜에 segmentation별로 여러 행이 있는데, 그 중 하나라도 capped면 → 그 날의 Total 셀에 작은 ⚠ 배지

```
Total 셀:
┌────────────────┐
│ RN  ADR  REV  OCC% │
│ 72  185K  13M  100.0% ⚠   ← cap됨!
└────────────────┘
```

배지 스타일:
- 작은 아이콘 (⚠ 또는 lucide-react의 AlertTriangle)
- warning 색상 (var(--color-text-warning) 또는 amber-500)
- tooltip 또는 title 속성: "호텔 총 객실 수에 도달했습니다"

### transformRpcToTableData 함수에 추가

```typescript
// ForecastDayData에 필드 추가
type ForecastDayData = {
  // ...기존 필드
  has_capped: boolean   // 그 날 어느 세그먼트라도 capped면 true
}

// 변환 시 계산
const has_capped = rows.some(r => r.capped)
```

---

## 🎯 B. 세그먼트 필터 버튼

### 위치
표 바로 위, 페이지 헤더 아래.

### UI 모양

```
표시할 세그먼트:  [전체] [초기화]  |  [Corp. FIT] [Direct] [TA] [Employee ★] [Member ★] [Group] [Comp ★] [House Use ★]
                                                                                           ↑ 클릭 시 토글
선택: 6/8                                                                                  
```

### 동작

- 각 부모 세그먼트(schema의 top-level node) = 버튼 1개
- 클릭으로 ON/OFF 토글
- 선택된 버튼: 파란 배경 + 흰 글씨 (또는 NovaStay 강조색)
- 미선택 버튼: 회색 배경 + 어두운 글씨
- **★** 표시: is_bold=true인 노드
- 기본 상태: 전체 선택
- "전체" 버튼: 모두 선택
- "초기화" 버튼: 모두 해제

### 표 연동

선택된 세그먼트만 표 열에 표시:
- 부모 + 그 부모의 자식들만 표시
- Total 컬럼은 항상 표시 (그러나 **선택된 세그먼트만 합산**)
- OCC도 선택된 세그먼트의 RN 합 ÷ 호텔 객실수

**중요**: Total과 OCC가 필터에 반응해야 의미가 있어요. 

선택된 모든 segmentation 코드 모음:
```typescript
const selectedCodes = useMemo(() => {
  const codes = new Set<string>()
  for (const node of schema.nodes) {
    if (selectedNodeIds.has(node.id)) {
      for (const code of node.segmentationCodes) {
        codes.add(code)
      }
    }
  }
  return Array.from(codes)
}, [schema.nodes, selectedNodeIds])

// Total = selectedCodes 합산
const total = calcFromData(daily, selectedCodes)
```

### 0개 선택 시
"세그먼트를 1개 이상 선택해주세요" 같은 안내 메시지.

---

## 📅 D. 월 selector

### 위치
페이지 헤더 영역. 제목 옆 또는 아래.

### UI 모양

```
일자별 세그먼트 전망
[<]  2026년 5월  [>]   [오늘]
```

- `[<]`: 이전 월로
- `[>]`: 다음 월로
- "오늘" 버튼: 현재 월로 점프

### 동작

```typescript
const [currentMonth, setCurrentMonth] = useState(() => {
  const today = new Date()
  return { year: today.getFullYear(), month: today.getMonth() + 1 }
})

// 이전 월
function goPrev() {
  setCurrentMonth(prev => {
    if (prev.month === 1) return { year: prev.year - 1, month: 12 }
    return { year: prev.year, month: prev.month - 1 }
  })
}

// 다음 월
function goNext() {
  setCurrentMonth(prev => {
    if (prev.month === 12) return { year: prev.year + 1, month: 1 }
    return { year: prev.year, month: prev.month + 1 }
  })
}

// 오늘로
function goToday() {
  const today = new Date()
  setCurrentMonth({ year: today.getFullYear(), month: today.getMonth() + 1 })
}

// 현재 월의 시작/종료 일자
function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const last = new Date(year, month, 0).getDate()  // 마지막 일
  const end = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { start, end }
}
```

### 표 연동

월 변경 시 baseline fetch 재실행:

```typescript
useEffect(() => {
  if (!hotelId) return
  
  const { start, end } = monthRange(currentMonth.year, currentMonth.month)
  
  setLoading(true)
  fetchBaselineForecast(hotelId, start, end)
    .then((rows) => setData(transformRpcToTableData(rows)))
    .catch((e) => setError(String(e)))
    .finally(() => setLoading(false))
}, [hotelId, currentMonth])
```

Schema는 호텔 바뀔 때만 fetch (현재는 그대로).

### 로딩 처리

월 바뀔 때 표가 사라지지 않도록 skeleton 또는 dimmed:
```tsx
<div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
  <ForecastTable schema={schema} data={data} ... />
</div>
```

---

## 📦 컴포넌트 구조

```tsx
// page.tsx
<div>
  <ForecastHeader 
    year={currentMonth.year} 
    month={currentMonth.month}
    onPrev={goPrev}
    onNext={goNext}
    onToday={goToday}
  />
  
  <SegmentFilter
    nodes={schema.nodes}
    selectedIds={selectedNodeIds}
    onToggle={toggleNode}
    onAll={selectAll}
    onReset={selectNone}
  />
  
  <ForecastTable
    schema={schema}
    data={data}
    selectedCodes={selectedCodes}
    selectedNodeIds={selectedNodeIds}
  />
</div>
```

새 컴포넌트:
- `app/forecast/components/ForecastHeader.tsx` (월 selector)
- `app/forecast/components/SegmentFilter.tsx` (필터 버튼들)

---

## 🎨 시각 디테일

### 필터 버튼 스타일
- 선택됨: `bg-primary text-primary-foreground` (또는 NovaStay 강조색)
- 미선택: `bg-secondary text-secondary-foreground border`
- ★ 마크: 부모 이름 옆에 작게
- hover 시 살짝 강조

### capped 배지
- 작게, Total 셀 우측 상단 또는 옆
- warning 색상 (amber)
- 아이콘만 (텍스트 없음, 공간 절약)

### 월 selector
- 컴팩트한 디자인
- 큰 텍스트 (제목 옆)
- 화살표 버튼 hover 효과

---

## ❌ 이번 단계엔 만들지 마

- ❌ 상단 카드 영역 (FC·OTB·Budget·LY) — Step 4
- ❌ OTB 세로 펼침 — 다음
- ❌ 자동 경고 (임계값 슬라이더) — 다음
- ❌ 글로벌 파일 수정 (절대!)

---

## ✅ 완료 기준

**A. capped 경고**
- Total 셀에 cap된 날짜만 ⚠ 배지 표시
- 호버 시 안내 (tooltip 또는 title)

**B. 세그먼트 필터**
- 부모 세그먼트별 토글 버튼
- "전체" / "초기화" 버튼
- 선택된 세그먼트만 표에 표시
- Total과 OCC도 선택된 세그먼트만 합산
- 0개 선택 시 안내 메시지
- 선택 카운트 표시 (예: "6/8")

**D. 월 selector**
- 이전/다음 월 화살표 동작
- "오늘" 버튼 동작
- 월 변경 시 baseline 재fetch
- 로딩 중 표 dim 처리
- 기본 상태: 현재 월

**공통**
- 다른 페이지 영향 없음
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음
- 다크/라이트 모드 자연스러움

---

## 💬 의심스러운 부분 있으면 멈춰

- NovaStay에 이미 있는 버튼/아이콘 컴포넌트 있는지 확인
- 월 selector 패턴이 다른 페이지에도 있는지 확인 (Budget?)
- 필터 버튼 스타일은 어디 참고할지

오버엔지니어링보다 안전이 우선.
