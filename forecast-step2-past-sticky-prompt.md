# NovaStay Forecast — Step 2 (과거 펼침 비활성화 + sticky 강화)

## 🎯 목표
두 가지 UX 개선:
- **A. 과거 날짜 펼침 비활성화**: 과거는 OTB=FC라 비교 의미 없음
- **B. 첫 열(날짜) + Total 영역 sticky + 불투명 배경**: 가로 스크롤 시 비침 없음

---

## 🚨 반드시 지킬 안전 규칙

**다음 파일들은 절대 수정하지 마**:
- 글로벌 파일 (layout, globals.css, tailwind config 등)
- 사이드바, 헤더

**수정 범위**: `app/forecast/` 폴더 안에서만.

---

## 📋 작업 전 확인

수정할 파일:
- `app/forecast/components/ForecastTable.tsx` (양쪽 모두 여기서)

---

## 🚫 A. 과거 펼침 비활성화

### 변경 사항

**판정 기준**: `daily.is_actual_day === true` → 과거 행

**과거 행의 변화**:
1. ▶/▼ 토글 아이콘 **숨김** (또는 회색 비활성)
2. 행 클릭 핸들러 **비활성** (`onClick` 안 걸기)
3. `cursor: pointer` 제거 (`cursor: default`)
4. 자동 펼침 로직에서도 과거 행 제외 (이미 actual이라 펼침 의미 없음)

### 구현 패턴

```typescript
function canExpand(daily: ForecastDayData): boolean {
  return !daily.is_actual_day  // 미래만 펼침 가능
}

// 행 렌더링
<tr 
  onClick={canExpand(daily) ? () => toggleExpand(daily.business_date) : undefined}
  style={{ cursor: canExpand(daily) ? 'pointer' : 'default' }}
>
  <td>
    {canExpand(daily) ? (
      <span>{isExpanded ? '▼' : '▶'}</span>
    ) : (
      <span style={{ visibility: 'hidden' }}>▶</span>  // 자리만 차지, 안 보임
    )}
    {daily.day_label}
    {/* 이벤트 점/이름 */}
  </td>
  ...
</tr>
```

### 자동 펼침 로직 수정

```typescript
function shouldAutoExpand(daily: ForecastDayData, threshold: number): boolean {
  // 과거는 자동 펼침 X
  if (daily.is_actual_day) return false
  
  // 미래만 OTB ≥ FC + threshold 체크
  for (const code in daily.values) {
    const v = daily.values[code]
    if (v.otb_rn >= v.rn + threshold) return true
  }
  return false
}

function isRowExpanded(daily: ForecastDayData, threshold: number): boolean {
  // 과거는 펼침 X
  if (daily.is_actual_day) return false
  
  return manualExpandedDates.has(daily.business_date) 
      || shouldAutoExpand(daily, threshold)
}
```

---

## 🎨 B. 첫 열 + Total 영역 sticky 강화

### 현재 문제
가로 스크롤 시 첫 열(날짜)이 sticky긴 한데, **본문 셀들이 비춰 보임**. z-index와 배경 불투명도 문제.

### 변경 사항

#### 1. 날짜 열 (첫 컬럼)
- `position: sticky; left: 0`
- `z-index: 3` (헤더보다 높게)
- `background: var(--color-background-primary)` (완전 불투명)
- 호버 시도 같은 배경 유지

#### 2. Total 영역 (두 번째 sticky 영역)
- 날짜 컬럼 다음에 위치
- `position: sticky; left: [날짜 컬럼 너비]`
- `z-index: 2`
- 불투명 배경

Total 영역이 OCC/RN/ADR/REV 4개 컬럼이라 너비 계산 필요:
- 날짜 컬럼 너비: 약 100~120px (이벤트명 들어가는 곳)
- Total 4개 컬럼 너비: 약 200~240px (50~60px × 4)

#### 3. 헤더 행 (가로 스크롤이 아닌 세로 스크롤용)
- `position: sticky; top: 0`
- `z-index: 4` (다른 sticky보다 높게)

#### 4. 헤더 + 첫 열 교차 영역
- `z-index: 5` (가장 높게)
- 가로/세로 둘 다 스크롤해도 가려지지 않음

### z-index 계층

```
헤더 + 첫 열 교차 셀:     z-index: 5  ★ 최상위
헤더 (다른 셀):           z-index: 4
첫 열 (날짜):             z-index: 3
Total 영역 (두 번째 sticky): z-index: 2
일반 셀:                  z-index: 1 (또는 default)
```

### CSS 패턴 (예시)

```tsx
// 날짜 헤더 셀 (교차 영역)
<th 
  rowSpan={2}  // 또는 표 헤더 구조에 맞게
  style={{
    position: 'sticky',
    left: 0,
    top: 0,
    zIndex: 5,
    background: 'var(--color-background-secondary)',
    minWidth: 120,
  }}
>
  날짜
</th>

// Total 헤더 셀 (sticky)
<th 
  colSpan={4}
  style={{
    position: 'sticky',
    left: 120,  // 날짜 컬럼 너비
    top: 0,
    zIndex: 4,
    background: 'var(--color-background-secondary)',
  }}
>
  Total
</th>

// 본문 날짜 셀
<td 
  style={{
    position: 'sticky',
    left: 0,
    zIndex: 3,
    background: 'var(--color-background-primary)',
    minWidth: 120,
  }}
>
  ...
</td>

// 본문 Total 셀 (OCC, RN, ADR, REV)
<td 
  style={{
    position: 'sticky',
    left: 120,  // 날짜 컬럼 너비
    zIndex: 2,
    background: 'var(--color-background-primary)',
  }}
>
  ...
</td>
```

### 주의: 너비 계산

날짜 컬럼 너비를 정확히 알아야 Total의 `left`를 정할 수 있어요. 두 가지 방법:

**방법 1 — 고정 너비 사용**
- 날짜 컬럼 `width: 120px`
- Total 첫 셀 `left: 120px`
- 단순하지만 컬럼 너비 변경 시 양쪽 수정 필요

**방법 2 — CSS 변수로 통일**
```css
:root {
  --forecast-date-col-width: 120px;
}

.date-col { width: var(--forecast-date-col-width); }
.total-col { left: var(--forecast-date-col-width); }
```
유연하지만 추가 작업. 일단 방법 1로 가도 OK.

### Total 본문 셀 4개의 left 계산

Total 영역이 sticky하려면 4개 셀 모두 sticky여야 함:

```
OCC 셀: left: 120px
RN 셀: left: 120 + 60 = 180px
ADR 셀: left: 120 + 60 + 60 = 240px  
REV 셀: left: 120 + 60 + 60 + 80 = 300px
```

또는 4개 셀을 묶어서 처리하기 어려우면, **Total을 통째로 div로 감싸는 방식** 고려:
- 표 구조가 너무 복잡해지면 옵션 1 (방법 1)만 적용해도 충분

---

## 🧪 동작 시나리오 검증

**시나리오 1 — 과거 펼침 비활성화**
- 5/22 (오늘이 5/26 기준 과거)인 행
- ▶ 아이콘 안 보임
- 클릭해도 펼침 동작 없음
- 커서가 pointer로 안 바뀜

**시나리오 2 — 미래 펼침은 정상**
- 5/28 (미래)
- ▶ 표시
- 클릭 시 펼침

**시나리오 3 — 첫 열 + Total sticky**
- 가로 스크롤 시:
  - 날짜 열이 좌측 고정 ✅
  - Total 영역도 날짜 옆에 고정 ✅
  - 본문 셀이 비춰 보이지 않음 ✅
  - 헤더도 가로 스크롤 시 같이 sticky

**시나리오 4 — 세로 스크롤**
- 헤더 sticky (top: 0)
- 헤더 + 날짜 열 교차 영역이 가장 위

---

## ❌ 이번 단계엔 만들지 마

- ❌ 빨간 셀 강조 (다음 Step)
- ❌ `+숫자` 배지 (다음 Step)
- ❌ 상단 카드 영역
- ❌ 일괄/직접 수정
- ❌ 글로벌 파일 수정 (절대!)

---

## ✅ 완료 기준

**A. 과거 펼침 비활성화**
- 과거 행에 ▶ 아이콘 안 보임
- 과거 행 클릭 시 펼침 안 됨
- 미래 행은 펼침 정상
- 자동 펼침도 과거 행 제외

**B. sticky 강화**
- 첫 열(날짜) 가로 스크롤 시 좌측 고정 + 불투명
- Total 영역 4개 컬럼 함께 sticky (또는 한 영역으로)
- 본문 셀이 비춰 보이지 않음
- z-index 계층 정상 (헤더 > 첫 열 > 일반 셀)
- 다크/라이트 모드 둘 다 자연스러움
- 다른 페이지 영향 없음
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음

---

## 💬 의심스러운 부분 있으면 멈춰

- Total 영역 4개 컬럼 sticky가 기술적으로 어려우면 → 날짜 컬럼만 sticky 강화도 가능 (Total은 일반)
- 날짜 컬럼 너비가 다른 페이지(예: Budget)와 비교해서 다르면 → NovaStay 컨벤션 따라
- sticky가 잘 안 되면 → 부모 div의 overflow 설정도 확인 필요

오버엔지니어링보다 안전이 우선.
