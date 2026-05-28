# NovaStay Forecast — Step 3.5a (c06_calendar fetch 함수)

## 🎯 목표
c06_calendar에서 날짜별 이벤트·요일 정보를 가져오는 **fetch 함수만** 만들어줘.

표는 건드리지 말고, 데이터 가져오는 로직만 검증. 콘솔로 결과만 확인.

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

## 📁 만들 파일 (2개)

### 1. `app/forecast/types/forecast-calendar.ts`

```typescript
// c06_calendar row
export type CalendarDay = {
  date: string         // 'YYYY-MM-DD'
  day: string          // 요일 ('월', '화', ...)
  rev_dow: string      // RM용 요일 그룹 ('월', '토' 등) - rev_dow='토'면 주말급
  event: string | null // 이벤트명 ('어린이날', '부처님오시는날', '지방선거' 등)
  is_holiday: boolean
}

// 표에서 빠르게 조회하기 위한 Map 형태
// key: 'YYYY-MM-DD', value: CalendarDay
export type CalendarMap = Map<string, CalendarDay>
```

---

### 2. `app/forecast/data/forecast-calendar.ts`

```typescript
import type { CalendarDay, CalendarMap } from '../types/forecast-calendar'

/**
 * 지정 기간의 c06_calendar 데이터 fetch
 */
export async function fetchCalendarRange(
  startDate: string,  // 'YYYY-MM-DD'
  endDate: string
): Promise<CalendarDay[]> {
  // 1. Supabase client 생성 (기존 패턴)
  
  // 2. c06_calendar 조회
  //    SELECT date, day, rev_dow, event, is_holiday
  //    FROM c06_calendar
  //    WHERE date BETWEEN startDate AND endDate
  //    ORDER BY date ASC
  
  // 3. 에러 처리
  // 4. 반환 (snake_case 유지)
}

/**
 * 배열을 Map으로 변환 (날짜로 빠른 조회)
 */
export function calendarToMap(days: CalendarDay[]): CalendarMap {
  const map = new Map<string, CalendarDay>()
  for (const day of days) {
    map.set(day.date, day)
  }
  return map
}
```

---

## 🧪 검증용 코드 (page.tsx에 임시 추가)

기존 `/forecast` 페이지에 **디버그 영역만** 살짝 추가:

```tsx
import { fetchCalendarRange, calendarToMap } from './data/forecast-calendar'
import type { CalendarMap } from './types/forecast-calendar'

// 기존 코드 안에 추가
const [calendar, setCalendar] = useState<CalendarMap>(new Map())

useEffect(() => {
  if (!hotelId) return
  
  const { start, end } = monthRange(currentMonth.year, currentMonth.month)
  
  fetchCalendarRange(start, end)
    .then((days) => {
      console.log('=== Calendar days ===', days.length)
      console.log('Sample:', days.slice(0, 3))
      
      // event 있는 날만 필터링
      const eventDays = days.filter(d => d.event && d.event !== '')
      console.log('Days with events:', eventDays.length)
      console.log('Events:', eventDays)
      
      setCalendar(calendarToMap(days))
    })
    .catch((e) => console.error('Calendar fetch error:', e))
}, [currentMonth])

// 임시 디버그 영역 (Step 3.5b에서 제거)
{calendar.size > 0 && (
  <div style={{ 
    fontSize: 11, 
    padding: 12, 
    background: 'var(--color-background-secondary)', 
    margin: 12,
    borderRadius: 8 
  }}>
    <strong>Calendar Loaded ✅</strong>
    <div>Days: {calendar.size}</div>
    <div>Events: {Array.from(calendar.values()).filter(d => d.event).map(d => `${d.date}(${d.event})`).join(', ')}</div>
  </div>
)}
```

**중요**: 표나 다른 컴포넌트는 절대 안 건드림. 디버그 영역만 추가.

---

## ❌ 이번 단계엔 만들지 마

- ❌ 표 디자인 변경 (Step 3.5b)
- ❌ 날짜 셀에 이벤트 표시 (Step 3.5b)
- ❌ 셀 패딩 변경 (Step 3.5b)
- ❌ 글로벌 파일 수정 (절대!)

---

## ✅ 완료 기준

- `app/forecast/types/forecast-calendar.ts` 생성됨
- `app/forecast/data/forecast-calendar.ts` 생성됨
- `/forecast` 페이지 접속 시:
  - 기존 화면 (월 selector, 필터, 표) 그대로 동작
  - 디버그 영역에 "Calendar Loaded ✅" 표시
  - "Days: 31" (5월이면)
  - "Events: 2026-05-01(어린이날), 2026-05-02(어린이날), ..." 형태로 이벤트 있는 날 표시
- 콘솔에 로그:
  - "Calendar days 31"
  - 샘플 3개
  - "Days with events: N"
  - 이벤트 목록
- 다른 페이지 영향 없음
- 표 영향 없음
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음

---

## 💬 의심스러운 부분 있으면 멈춰

- Supabase client 생성 방식
- 호텔 ID 필요한지 (c06은 호텔 무관 데이터, hotel_id 컬럼 없음 — 단순히 날짜만 필요)
