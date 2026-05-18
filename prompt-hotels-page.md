아래 조건에 맞게 호텔 목록 페이지를 만들어줘.

---

## 파일 위치
`src/pages/HotelsPage.tsx` 또는 라우팅 구조에 맞게

---

## 기술 스택
- React + TypeScript
- Supabase (`import { supabase } from '@/lib/supabase'`)
- Tailwind CSS
- lucide-react (아이콘)
- useRouter (Next.js 또는 react-router-dom 라우팅)

---

## DB 스키마

### m02_hotels
```sql
id                    uuid PK
hotel_name            text NOT NULL
slug                  text UNIQUE NOT NULL
plan                  plan_type ENUM ('standard' | 'enterprise')
is_active             boolean DEFAULT false
subscription_status   subscription_status_type ENUM ('trial' | 'active' | 'past_due' | 'canceled')
trial_ends_at         timestamptz
subscribed_at         timestamptz
subscription_ends_at  timestamptz
created_at            timestamptz
updated_at            timestamptz
```

### m03_hotel_details
```sql
id          uuid PK
hotel_id    uuid FK → m02_hotels(id)
address     text
city        text
country     text DEFAULT 'KR'
timezone    text DEFAULT 'Asia/Seoul'
phone       text
email       text
website     text
star_rating integer (1~5)
room_count  integer
branch_name text
logo_url    text
```

---

## Supabase 쿼리

```ts
// 호텔 목록 조회 (hotel_details join)
const { data, error } = await supabase
  .from('m02_hotels')
  .select(`
    id, hotel_name, slug, plan, is_active,
    subscription_status, trial_ends_at, created_at,
    m03_hotel_details (
      city, country, star_rating, room_count, logo_url
    )
  `)
  .order('created_at', { ascending: false })
```

---

## 페이지 구성

### 1. 페이지 헤더
- 제목: "호텔 관리"
- 설명: "NovaStay에 등록된 호텔을 관리합니다."
- 우상단: "호텔 등록" 버튼 → `/hotels/new` 이동

### 2. 통계 카드 4개
```
전체 호텔 | 운영 중 (active) | 트라이얼 (trial) | 비활성 (is_active: false)
```

### 3. 필터 바
- 검색: hotel_name, slug, city 검색
- 상태 필터: 전체 / active / trial / past_due / canceled
- 플랜 필터: 전체 / standard / enterprise
- 우측: 검색 결과 건수 표시

### 4. 호텔 목록 테이블
컬럼:
- 호텔 (아이콘 + hotel_name + slug + city)
- 플랜 (배지)
- 상태 (배지)
- 객실 수
- 등록일
- 액션 (chevron 아이콘)

행 클릭 → `/hotels/{id}` 이동
로딩 중: 스피너
데이터 없음: 빈 상태 UI

---

## 상태별 배지 색상 (CSS 변수 사용)

### subscription_status
```
trial    → bg 노란색 계열, 텍스트 노란색, Clock 아이콘
active   → bg 녹색 계열,  텍스트 녹색,  CheckCircle 아이콘
past_due → bg 주황색 계열, 텍스트 주황색, AlertCircle 아이콘
canceled → bg 빨간색 계열, 텍스트 빨간색, XCircle 아이콘
```

### plan
```
standard   → bg 파란색 계열, 텍스트 파란색
enterprise → bg 보라색 계열, 텍스트 보라색
```

---

## NovaStay 디자인 시스템

### CSS 변수 (기존 프로젝트 변수 그대로 사용)
```
배경:           var(--color-bg-primary) 또는 bg-bg-primary
카드:           bg-bg-secondary
테두리:         var(--color-border-default)
브랜드 그린:    var(--color-accent-primary) 또는 text-accent-primary
텍스트:         var(--color-text-primary)
텍스트 보조:    text-brand-muted
```

### 인풋 스타일 (기존 LoginPage와 동일)
```tsx
className="w-full rounded-md bg-bg-tertiary text-sm px-3.5 py-2.5 focus:outline-none"
style={{
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-default)',
}}
onFocus={e => {
  e.currentTarget.style.border = '1px solid var(--color-accent-primary)'
  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-dim)'
}}
onBlur={e => {
  e.currentTarget.style.border = '1px solid var(--color-border-default)'
  e.currentTarget.style.boxShadow = 'none'
}}
```

### 버튼 스타일
```tsx
// Primary (호텔 등록)
className="rounded-full py-2 px-4 text-sm font-semibold hover:-translate-y-0.5 transition-all"
style={{ background: 'var(--gradient-cta)', color: '#0A0A0A', boxShadow: 'var(--accent-btn-glow)' }}

// 카드
className="rounded-xl bg-bg-secondary px-5 py-4"
style={{ border: '1px solid var(--color-border-default)' }}
```

---

## 타입 정의

```ts
type Hotel = {
  id: string
  hotel_name: string
  slug: string
  plan: 'standard' | 'enterprise'
  is_active: boolean
  subscription_status: 'trial' | 'active' | 'past_due' | 'canceled'
  trial_ends_at: string | null
  created_at: string
  m03_hotel_details: {
    city: string | null
    country: string | null
    star_rating: number | null
    room_count: number | null
    logo_url: string | null
  } | null
}
```

---

## 주의사항
- 기존 LoginPage.tsx 디자인 스타일 (CSS 변수, 클래스명) 완전히 동일하게 적용
- Tailwind arbitrary value 사용 금지 → 기존 CSS 변수 사용
- TypeScript 타입 정확히 정의
- 로딩/에러/빈 상태 모두 처리
- supabase 쿼리 에러 처리 포함
- 검색/필터는 클라이언트 사이드 필터링

위 조건대로 호텔 목록 페이지를 만들어줘.
