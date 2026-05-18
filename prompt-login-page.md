아래 조건에 맞게 LoginPage.tsx를 수정해줘.

---

## 작업 내용
기존 LoginPage.tsx의 handleLogin 함수에 Supabase Auth 연동 추가
호텔(hotel) 입력 필드 완전 제거

---

## 기술 스택
- Next.js App Router
- TypeScript
- Supabase (@supabase/ssr)
- 기존 import: `import { supabase } from '@/lib/supabase'`

---

## DB 스키마

### m01_profiles 테이블
```
id            uuid PK
auth_user_id  uuid UNIQUE → auth.users(id)
email         text UNIQUE NOT NULL
name          text NOT NULL
role          role_type ENUM ('super_admin' | 'admin' | 'manager' | 'staff' | 'read_only')
hotel_id      uuid → m02_hotels(id) -- 운영자: NULL / 호텔직원: 호텔UUID
is_active     boolean NOT NULL DEFAULT true
```

---

## 수정 사항

### 1. hotel state 및 입력 필드 완전 제거
```tsx
// 삭제
const [hotel, setHotel] = useState('')

// 삭제 (JSX에서 호텔 입력 필드 블록 전체)
<div>
  <label htmlFor="hotel">호텔</label>
  <input id="hotel" ... />
</div>
```

### 2. handleLogin 함수 교체
```tsx
async function handleLogin(e: React.FormEvent) {
  e.preventDefault()
  setError(null)
  setLoading(true)

  try {
    // Step 1. Supabase Auth 로그인
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (authError) throw authError

    // Step 2. m01_profiles 조회 (role + hotel_id + is_active 확인)
    const { data: profile, error: profileError } = await supabase
      .from('m01_profiles')
      .select('role, hotel_id, is_active, name')
      .eq('auth_user_id', data.user.id)
      .single()

    if (profileError) throw new Error('프로필 정보를 찾을 수 없습니다.')
    if (!profile.is_active) throw new Error('비활성화된 계정입니다. 관리자에게 문의하세요.')

    // Step 3. role에 따라 리다이렉트
    if (profile.role === 'super_admin' || profile.role === 'admin') {
      router.push('/hotels')      // 운영자 → 호텔 목록
    } else {
      router.push('/dashboard')   // 호텔 직원 → 대시보드
    }

  } catch (err: any) {
    setError(
      err.message === 'Invalid login credentials'
        ? '이메일 또는 비밀번호가 올바르지 않습니다.'
        : err.message
    )
  } finally {
    setLoading(false)
  }
}
```

---

## 에러 메시지 한국어 처리
```tsx
// Supabase 에러 메시지 → 한국어 변환
const ERROR_MAP: Record<string, string> = {
  'Invalid login credentials':          '이메일 또는 비밀번호가 올바르지 않습니다.',
  'Email not confirmed':                '이메일 인증이 완료되지 않았습니다.',
  'Too many requests':                  '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.',
  'User not found':                     '존재하지 않는 계정입니다.',
}

// 사용
setError(ERROR_MAP[err.message] ?? err.message)
```

---

## 로그인 흐름
```
이메일 + 비밀번호 입력
  ↓
supabase.auth.signInWithPassword()
  ↓
m01_profiles에서 role, hotel_id, is_active 조회
  ↓
is_active = false → 에러 메시지
  ↓
super_admin / admin → /hotels (호텔 목록)
manager / staff / read_only → /dashboard
```

---

## 주의사항
- hotel state, hotel 입력 필드, hotel 관련 코드 완전 제거
- 기존 UI 디자인 (CSS 변수, 스타일) 절대 변경하지 말 것
- forgot-password 기능 그대로 유지
- TypeScript 타입 정확히 정의
- loading, error, message state 기존 그대로 활용

위 조건대로 LoginPage.tsx를 수정해줘.
