# NovaStay Forecast — 0 → "-" 표시 + REV 백만 단위

## 🎯 목표
두 가지 표시 규칙 개선:
- **A. 0 값을 "-"로 표시**: RN/ADR/REV/OCC% 모두 0이면 회색 "-"
- **B. REV를 백만 단위로**: 헤더에 "(백만)" 표시, 본문은 숫자만 (예: 15.6)

---

## 🚨 안전 규칙

**다음 파일들은 절대 수정하지 마**:
- 글로벌 파일 (layout, globals.css, tailwind config 등)
- 사이드바, 헤더

**수정 범위**: `app/forecast/` 폴더 안에서만.

---

## 🔧 수정 파일

- `app/forecast/components/ForecastTable.tsx` (표 셀 렌더링)
- `app/forecast/utils/forecast-format.ts` (포맷 헬퍼) — 있으면 그곳, 없으면 추가

---

## 🔧 A. 0 → "-" 표시

### 적용 범위
모든 숫자 셀:
- 부모/자식 세그먼트 RN, ADR, REV
- Total OCC%, RN, ADR, REV
- 월 합계 행 (있으면)
- OTB 펼침 행

### 헬퍼 함수

```typescript
// 숫자 또는 "-" 반환

function fmtRn(rn: number | null | undefined): string {
  if (rn === null || rn === undefined || rn === 0) return '-'
  return Math.round(rn).toLocaleString()
}

function fmtAdr(adr: number | null | undefined): string {
  if (adr === null || adr === undefined || adr === 0) return '-'
  return Math.round(adr / 1000).toLocaleString()  // 천원 단위
}

function fmtRev(rev: number | null | undefined): string {
  if (rev === null || rev === undefined || rev === 0) return '-'
  // ↓ 백만 단위, 소수점 1자리
  return (rev / 1_000_000).toFixed(1)
}

function fmtOcc(occ: number | null | undefined): string {
  if (occ === null || occ === undefined || occ === 0) return '-'
  return occ.toFixed(1) + '%'
}
```

### "-" 스타일

회색 처리:

```tsx
<td style={{
  color: value === '-' ? 'var(--color-text-tertiary)' : 'inherit',
  textAlign: 'right',
}}>
  {value}
</td>
```

---

## 🔧 B. REV 백만 단위

### 헤더 변경

현재 헤더:
```
RN  |  ADR  |  REV
```

변경:
```
RN  |  ADR  |  REV (백만)
```

또는 더 컴팩트하게:
```
RN  |  ADR (천)  |  REV (백만)
```

ADR도 천원 단위라 헤더에 명시하는 게 좋아요. 일관성.

### 본문 변경

```typescript
// 기존
fmtRev(rev) → "15,632"  (천원 단위, 콤마 포함)

// 변경
fmtRev(rev) → "15.6"  (백만 단위, 소수점 1자리)
// 예시:
//   15,632,000원 → "15.6"
//   2,704,000원 → "2.7"
//   218,812,000원 → "218.8"
```

### 단위 표시 위치

옵션 1 — 헤더 3단 (RN/ADR/REV)에 직접 표시:
```
RN  |  ADR (천)  |  REV (백만)
```

옵션 2 — 표 위에 작은 텍스트로 안내:
```
[페이지 헤더]
단위: ADR=천원, REV=백만원
[표]
```

권장: **옵션 1 (헤더 3단)**. 표 자체로 단위 정보 완결.

---

## 🧪 동작 시나리오 검증

**시나리오 1 — 0 값 처리**
- Corp.FIT의 Contracted RN=0: "-"로 표시 (회색)
- Total OCC% = 0%: "-" (회색)
- Total RN = 0: "-" (회색)

**시나리오 2 — REV 백만 단위**
- 5/23 Total REV: 15,632,000원 → "15.6"
- 5/25 Total REV: 3,924,000원 → "3.9"
- 5/1 Corp.FIT REV: 0 → "-"

**시나리오 3 — ADR 표시 (변경 없음 확인)**
- 5/23 Total ADR: 217,000원 → "217" (천원 단위)

**시나리오 4 — 헤더 단위 표시**
- 헤더에 "REV (백만)" 또는 "REV" + 단위 안내 확인

**시나리오 5 — 다른 영역**
- OTB 펼침 행: 0 처리 + 백만 단위
- 월 합계 행: 0 처리 + 백만 단위
- 모든 부모/자식 셀: 일관성

---

## ❌ 이번 단계엔 만들지 마

- ❌ 새 데이터 fetch
- ❌ 새 기능
- ❌ 글로벌 파일 수정 (절대!)

오직 포맷 변경.

---

## ✅ 완료 기준

**A. 0 → "-"**
- RN/ADR/REV/OCC% 모두 0이면 "-"로 표시
- "-" 색상은 회색 (var(--color-text-tertiary))
- Total, 자식, 부모 셀 모두 적용
- OTB 펼침 행, 월 합계 행도 적용

**B. REV 백만 단위**
- 본문 REV 값이 백만 단위 (예: "15.6", "2.7")
- 소수점 1자리
- 헤더에 "REV (백만)" 또는 단위 명시
- ADR 헤더에도 "(천)" 표시하면 더 일관됨

**공통**
- 다른 페이지 영향 없음
- 다른 기능 정상 동작
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음
- 다크/라이트 모드 둘 다 자연스러움

---

## 💬 의심스러운 부분 있으면 멈춰

- 기존 포맷 헬퍼 위치 (forecast-format.ts 있는지)
- 색상 토큰 (text-tertiary 있는지)
- 헤더 구조 (3단인지 변경 가능한지)

오버엔지니어링보다 안전이 우선.
