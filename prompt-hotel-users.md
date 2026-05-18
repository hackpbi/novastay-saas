아래 조건에 맞게 기존 호텔 상세 페이지에 탭을 추가하고 유저 관리 기능을 구현해줘.

---

## 기존 파일
현재 호텔 상세/수정 페이지가 있음 (호텔명, 슬러그, 플랜, 구독상태, 위치, 연락처, 호텔정보 섹션)
여기에 상단 탭을 추가해서 "기본 정보" / "유저 관리" 탭으로 분리

---

## 기술 스택
- React + TypeScript
- Supabase (`import { supabase } from '@/lib/supabase'`)
- Tailwind CSS + 기존 CSS 변수
- lucide-react

---

## DB 스키마

### m01_profiles
```sql
id            uuid PK
auth_user_id  uuid → auth.users(id)
email         text UNIQUE NOT NULL
name          text NOT NULL
role          role_type ENUM ('super_admin' | 'admin' | 'manager' | 'staff' | 'read_only')
hotel_id      uuid → m02_hotels(id)  -- 이 호텔 직원
is_active     boolean DEFAULT true
last_login_at timestamptz
created_at    timestamptz
```

### m06_saas_menus
```sql
id          uuid PK
key         text UNIQUE  -- 'dashboard' | 'reservations' | 'rooms' | 'guests' | 'revenue' | 'reports' | 'staff' | 'setup'
name        text NOT NULL
icon        text
sort_order  integer
is_active   boolean
```

### m08_user_menu_permissions
```sql
id          uuid PK
user_id     uuid FK → m01_profiles(id)
menu_id     uuid FK → m06_saas_menus(id)
permission  permission_level ENUM ('none' | 'read' | 'write' | 'full')
updated_by  uuid FK → m01_profiles(id)
updated_at  timestamptz
UNIQUE (user_id, menu_id)
```

### m09_user_default_page
```sql
id        uuid PK
user_id   uuid UNIQUE FK → m01_profiles(id)
menu_id   uuid FK → m06_saas_menus(id)
```

---

## 구현할 내용

### 1. 상단 탭 추가

```tsx
// 탭 2개
const tabs = ['기본 정보', '유저 관리']
const [activeTab, setActiveTab] = useState(0)

// 기본 정보 탭: 기존 호텔 수정 폼 그대로
// 유저 관리 탭: 아래 구현
```

---

### 2. 유저 관리 탭

#### 유저 목록 조회
```ts
const { data: users } = await supabase
  .from('m01_profiles')
  .select('id, email, name, role, is_active, last_login_at, created_at')
  .eq('hotel_id', hotelId)
  .order('created_at', { ascending: false })
```

#### 유저 목록 테이블 컬럼
- 이름 + 이메일 (아바타 이니셜 포함)
- 역할 배지
- 상태 (활성/비활성)
- 마지막 로그인
- 클릭 → 슬라이드오버 열림

#### 우상단 버튼
- "유저 초대" 버튼 → 초대 모달 열림

#### 빈 상태
- 유저 없을 때 안내 문구 + 초대 버튼

---

### 3. 유저 초대 모달

```tsx
// 모달 폼
name:  text input (이름)
email: email input (이메일)
role:  select (manager | staff | read_only)

// 저장 시
// Step 1: /api/users/invite Route Handler 호출 (Auth 초대)
const res = await fetch('/api/users/invite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, name, role, hotel_id: hotelId })
})
const { user_id } = await res.json()

// Step 2: m01_profiles INSERT
await supabase.from('m01_profiles').insert({
  auth_user_id: user_id,
  email, name, role,
  hotel_id: hotelId,
  is_active: true
})

// Step 3: 기본 메뉴 권한 설정 (모든 메뉴 none으로)
// m06_saas_menus 전체 조회 후 none으로 일괄 insert
```

---

### 4. 유저 슬라이드오버 (우측에서 밀려나옴)

#### 슬라이드오버 구조
```
오버레이 (반투명 배경)
└── 슬라이드오버 패널 (우측 고정, width: 420px)
    ├── 헤더: 유저 이름 + 이메일 + 닫기 버튼
    ├── 탭: 프로필 | 메뉴 권한
    │
    ├── [프로필 탭]
    │   ├── 이름 수정 input
    │   ├── 역할 변경 select (manager | staff | read_only)
    │   ├── 활성/비활성 토글
    │   └── 저장 버튼
    │
    └── [메뉴 권한 탭]
        ├── 기본 페이지 select (로그인 후 첫 화면)
        ├── 메뉴별 권한 라디오 버튼
        │   Dashboard    ○none ○read ○write ●full
        │   Reservations ○none ○read ●write ○full
        │   Rooms        ○none ●read ○write ○full
        │   ...
        └── 저장 버튼
```

#### 프로필 저장
```ts
await supabase
  .from('m01_profiles')
  .update({ name, role, is_active })
  .eq('id', userId)
```

#### 메뉴 권한 저장 (upsert)
```ts
// 메뉴 권한 일괄 upsert
await supabase
  .from('m08_user_menu_permissions')
  .upsert(
    permissions.map(p => ({
      user_id: userId,
      menu_id: p.menu_id,
      permission: p.permission,
      updated_by: currentUserId,
    })),
    { onConflict: 'user_id,menu_id' }
  )

// 기본 페이지 upsert
await supabase
  .from('m09_user_default_page')
  .upsert(
    { user_id: userId, menu_id: defaultMenuId },
    { onConflict: 'user_id' }
  )
```

#### 메뉴 권한 조회
```ts
// 슬라이드오버 열릴 때
const { data: menus } = await supabase
  .from('m06_saas_menus')
  .select('id, key, name, icon')
  .eq('is_active', true)
  .order('sort_order')

const { data: permissions } = await supabase
  .from('m08_user_menu_permissions')
  .select('menu_id, permission')
  .eq('user_id', userId)

const { data: defaultPage } = await supabase
  .from('m09_user_default_page')
  .select('menu_id')
  .eq('user_id', userId)
  .single()
```

---

### 5. API Route Handler (유저 초대)

`/api/users/invite/route.ts` 생성

```ts
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { email, name, role, hotel_id } = await req.json()

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { name, role, hotel_id }
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ user_id: data.user.id })
}
```

---

## 역할 배지 색상

```
manager   → 파란색 계열
staff     → 기본 텍스트 색
read_only → 회색 계열
```

## permission 색상

```
none  → 회색 (비활성)
read  → 파란색
write → 노란색
full  → 녹색 (브랜드 그린)
```

---

## NovaStay 디자인 시스템

### 탭 스타일 (기존 CSS 변수 사용)
```tsx
// 활성 탭
style={{ borderBottom: '2px solid var(--color-accent-primary)', color: 'var(--color-accent-primary)' }}

// 비활성 탭
className="text-brand-muted hover:text-brand-secondary transition-colors"
```

### 슬라이드오버 애니메이션
```tsx
// 오버레이
className="fixed inset-0 z-40 bg-black/50"
onClick={closeSheet}

// 패널
className="fixed right-0 top-0 h-full w-[420px] z-50 bg-bg-secondary flex flex-col"
style={{
  border: '1px solid var(--color-border-default)',
  borderRight: 'none',
  transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
  transition: 'transform 0.25s ease'
}}
```

### 기존 스타일 규칙
- 카드: `bg-bg-secondary` + `border: 1px solid var(--color-border-default)`
- 인풋: `bg-bg-tertiary` + focus 시 `var(--color-accent-primary)` border
- 버튼 Primary: `background: var(--gradient-cta)` + `color: #0A0A0A`
- 모든 텍스트: CSS 변수 사용 (`var(--color-text-primary)`, `text-brand-muted`)

---

## 주의사항
- 기존 호텔 수정 기능 그대로 유지 (건드리지 말 것)
- 트리거가 m01_profiles를 자동 생성하므로 초대 후 중복 INSERT 주의
  → 트리거가 이미 profiles를 만들면 INSERT 대신 UPDATE 사용
- TypeScript 타입 정확히 정의
- 로딩/에러/빈 상태 모두 처리
- SUPABASE_SERVICE_ROLE_KEY는 .env.local에 있어야 함

위 조건대로 구현해줘.
