# NovaStay Forecast — Step 3.5b (표 디자인 + 이벤트 표시)

## 🎯 목표
표 디자인을 다듬고 날짜 셀에 이벤트/주말 정보를 표시:
- **A. 날짜 셀에 이벤트·주말 표시** (c06_calendar 데이터 활용)
- **B. 셀 패딩 약간 넓게** + 헤더 패딩 + 글씨 크기 + 구분선 조정

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
- ✅ `app/forecast/types/forecast-calendar.ts` (Step 3.5a)
- ✅ `app/forecast/data/forecast-calendar.ts` (Step 3.5a)
- ✅ `app/forecast/page.tsx`
- ✅ `app/forecast/components/ForecastTable.tsx`

이번엔 **`ForecastTable.tsx`만 주로** 수정하고, `page.tsx`에서 calendar 데이터를 props로 전달.

---

## 🎨 A. 이벤트·주말 표시

### 규칙 (간단)

| 조건 | 표시 |
|------|------|
| `event` 값 있음 (null/빈값 아님) | 🔴 빨간 점 + 이벤트명 |
| `event` 없음 + `rev_dow = '토'` | 🟡 노란 점만 (텍스트 없음) |
| 그 외 | 아무것도 없음 |

### 시각화

```
날짜 셀 예시:

[5/1 (금) 🔴 어린이날]
[5/2 (토) 🔴 어린이날]
[5/6 (수)]                     ← 평일, 표시 없음
[5/9 (토) 🟡]                  ← 토요일, 점만
[5/22 (금) 🔴 부처님오시는날]
[5/25 (월) 🔴 대체휴일]
```

### Props 전달

`page.tsx`에서 `ForecastTable`에 `calendar` Map 전달:

```tsx
<ForecastTable 
  schema={schema}
  data={data}
  calendar={calendar}  // CalendarMap (이미 fetch됨)
/>
```

`ForecastTable` 안에서 각 행 그릴 때:

```tsx
const cal = calendar.get(daily.business_date)  // CalendarDay | undefined
const hasEvent = cal?.event && cal.event.trim() !== ''
const isWeekend = !hasEvent && cal?.rev_dow === '토'

// 날짜 셀 렌더링
<td>
  <div>{daily.day_label}</div>
  {hasEvent && (
    <div className="flex items-center gap-1">
      <span className="dot dot-event" />
      <span className="text-xs">{cal.event}</span>
    </div>
  )}
  {isWeekend && <span className="dot dot-weekend" />}
</td>
```

### 점(dot) 스타일

```css
.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.dot-event {
  background: var(--color-text-danger);  /* 빨강 */
}
.dot-weekend {
  background: #F59E0B;  /* 노랑/앰버 */
  /* 또는 var(--color-text-warning) 같은 토큰 */
}
```

이벤트명 글씨:
- 크기: 10px
- 색: var(--color-text-secondary) (약간 흐리게, 메인 데이터 안 가리게)

---

## 🎨 B. 셀 패딩·디자인 다듬기

### 변경 사항

| 영역 | 이전 | 변경 |
|------|------|------|
| 본문 셀 padding | 약 6~8px | **10~12px** (수평), **8~10px** (수직) |
| 헤더 셀 padding | 약 6px | **10~12px** |
| 글씨 크기 (본문) | 11px | **12px** |
| 글씨 크기 (헤더) | 10~11px | **11~12px** |
| 행 사이 구분선 | 0.5px solid border-tertiary | **0.5px solid border-secondary** (살짝 진하게) |
| 부모/자식 사이 점선 | 0.5px dashed | **유지** |
| 첫 열 (날짜) 폭 | 70~80px | **이벤트명 들어가게 충분히** (100~120px) |

### 행 hover 효과 (선택)

```css
tr:hover {
  background: var(--color-background-secondary);
  /* 살짝, 너무 진하지 않게 */
}
```

다크/라이트 모드 둘 다 자연스러워야 함.

### 첫 열(날짜) 폭

이벤트명 "어린이날", "부처님오시는날" 들어가야 함. 충분히 넓게.

---

## 📦 ForecastTable Props 추가

```tsx
type Props = {
  schema: ForecastSchema
  data: ForecastDayData[]
  calendar: CalendarMap  // ← 새 prop
  // ...기존 props
}

export function ForecastTable({ schema, data, calendar, ... }: Props) {
  // ...
}
```

`calendar`가 undefined 가능성 있으면 안전 처리:
```tsx
calendar?: CalendarMap  // optional
// 사용 시 calendar?.get(date) 또는 fallback
```

---

## 🧹 정리 작업

- Step 3.5a에서 추가한 디버그 영역 ("Calendar Loaded ✅") 제거
- 콘솔 로그 제거

---

## ❌ 이번 단계엔 만들지 마

- ❌ 상단 카드 영역 (Step 4)
- ❌ 새 데이터 fetch
- ❌ OTB 세로 펼침
- ❌ 자동 경고
- ❌ 글로벌 파일 수정 (절대!)

---

## ✅ 완료 기준

**A. 이벤트·주말 표시**
- 어린이날(5/1~5), 부처님오시는날(5/22~24), 대체휴일(5/25)에 🔴 + 이름 표시
- 토요일(5/9, 5/16, 5/30)에 🟡 점만 표시 (이벤트 없을 때)
- 토요일 + 이벤트 동시인 경우 (5/2, 5/23 등)는 🔴 이벤트만 표시 (노랑 점 X)
- 평일 + 이벤트 없는 경우는 아무것도 없음

**B. 디자인 다듬기**
- 셀이 이전보다 시원해짐 (답답함 해소)
- 글씨 약간 커짐
- 구분선 약간 명확함
- 첫 열(날짜)이 이벤트명 들어갈 만큼 넓어짐
- 행 hover 효과 (선택)

**공통**
- 디버그 영역 제거됨
- 다른 페이지 영향 없음
- 표/필터/월 selector/카드 모두 정상 동작
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음
- 다크/라이트 모드 둘 다 자연스러움

---

## 💬 의심스러운 부분 있으면 멈춰

- 첫 열 폭을 얼마나 넓혀야 할지 (이벤트명 "부처님오시는날" 9자 들어가야 함)
- 점(dot)의 색상 토큰 (디자인 시스템 따라)
- hover 효과를 넣을지 말지 (기존 페이지 패턴 따라)

오버엔지니어링보다 안전이 우선.
