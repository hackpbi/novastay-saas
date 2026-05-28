# NovaStay Forecast — 카드 영역 한 줄 KPI 바로 압축

## 🎯 목표
현재 카드 4개(FORECAST, CURRENT OTB, BUDGET, LAST YEAR)를 한 줄 KPI 바로 압축.

**구조**:
- 좌측 박스: **FCST** 절대값 (OCC%, ADR, REV)
- 우측 박스: **vs Budget** 차이 (증감 — 데이터 없으니 "준비 중")

**위치**:
- 월 selector 옆 우측 (한 줄에 같이)
- 세그먼트 필터 + 자동 펼침 슬라이더는 **그 아래 줄**로 내림

---

## 🚨 안전 규칙

**다음 파일들은 절대 수정하지 마**:
- 글로벌 파일 (layout, globals.css, tailwind config 등)
- 사이드바, 헤더

**수정 범위**: `app/forecast/` 폴더 안에서만.

---

## 📋 작업 전 확인

수정할 파일:
- `app/forecast/page.tsx` (레이아웃 재구성)
- `app/forecast/components/SummaryCards.tsx` — 삭제 또는 KPI 바로 교체

새 컴포넌트 (선택):
- `app/forecast/components/KpiBar.tsx`

---

## 🎨 새 레이아웃

### Before (현재)
```
[페이지 제목]
[< 2026년 5월 > 오늘]    [세그먼트 ▾] [자동 펼침 ──●──]
[FORECAST 카드] [OTB 카드] [BUDGET 카드] [LY 카드]
[표]
```

### After (변경)
```
[페이지 제목]
[< 2026년 5월 > 오늘]   [FCST 63.7% 154K 218.3M]  vs Budget  [준비 중]
                                                            ↑ 우측에 KPI 바
[세그먼트 ▾]  [자동 펼침 ──●──]
                                                            ↑ 새 줄로 내림
[표]
```

---

## 🎨 KPI 바 디자인

### 구조

```tsx
<div style={{ 
  display: 'flex', 
  alignItems: 'center', 
  gap: 12,
  marginLeft: 'auto',  // 우측 정렬
}}>
  {/* FCST 박스 */}
  <div style={{ 
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
    padding: '8px 14px',
    background: 'var(--color-background-secondary)',
    borderRadius: 8,
  }}>
    <span style={{ 
      fontSize: 10, 
      fontWeight: 600, 
      letterSpacing: '0.05em',
      color: 'var(--color-text-secondary)',
    }}>
      FCST
    </span>
    <span style={{ fontWeight: 600 }}>{fmtPct(fcstOcc)}</span>
    <span style={{ fontWeight: 600 }}>{fmtAdrK(fcstAdr)}</span>
    <span style={{ fontWeight: 600 }}>{fmtRevM(fcstRev)}</span>
  </div>
  
  {/* 구분 텍스트 */}
  <span style={{ 
    fontSize: 12, 
    color: 'var(--color-text-secondary)',
  }}>
    vs Budget
  </span>
  
  {/* vs Budget 박스 (준비 중) */}
  <div style={{ 
    display: 'flex',
    alignItems: 'center',
    padding: '8px 14px',
    background: 'var(--color-background-secondary)',
    borderRadius: 8,
    opacity: 0.5,  // 준비 중이라 살짝 옅게
  }}>
    <span style={{ 
      fontSize: 12,
      color: 'var(--color-text-tertiary)',
    }}>
      준비 중
    </span>
  </div>
</div>
```

### 표시 값 (좌측 박스)

```typescript
// FCST 박스의 값
const monthFcst = useMemo(() => {
  let rn = 0, rev = 0
  for (const day of data) {
    for (const code of schema.allSegmentationCodes) {
      const v = day.values[code]
      if (v) {
        rn += v.rn
        rev += v.rev
      }
    }
  }
  const adr = rn > 0 ? rev / rn : 0
  const daysInMonth = data.length
  const occ = (schema.roomCount * daysInMonth) > 0 
    ? (rn / (schema.roomCount * daysInMonth)) * 100 
    : 0
  return { rn, adr, rev, occ }
}, [data, schema])
```

### 포맷 헬퍼

```typescript
// OCC%: 소수점 1자리
function fmtPct(n: number): string {
  return n.toFixed(1) + '%'
}

// ADR: 천원 단위 + K (예: "154K")
function fmtAdrK(adr: number): string {
  if (adr === 0) return '-'
  return Math.round(adr / 1000) + 'K'
}

// REV: 백만 단위 + M (예: "218.3M")
function fmtRevM(rev: number): string {
  if (rev === 0) return '-'
  return (rev / 1_000_000).toFixed(1) + 'M'
}
```

### 표시 결과 예시

```
[FCST  63.7%  154K  218.3M]  vs Budget  [준비 중]
```

---

## 🔧 레이아웃 변경

### page.tsx 구조

```tsx
return (
  <div>
    {/* 페이지 제목 */}
    <h1>일자별 세그먼트 전망</h1>
    
    {/* sticky 상단 영역 */}
    <div style={{ position: 'sticky', top: 0, zIndex: 10, ... }}>
      
      {/* 1줄: 월 selector + KPI 바 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 16,
        marginBottom: 8,
      }}>
        {/* 좌측: 월 selector */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onPrev}>◀</button>
          <span>{year}년 {month}월</span>
          <button onClick={onNext}>▶</button>
          <button onClick={onToday}>오늘</button>
        </div>
        
        {/* 우측: KPI 바 */}
        <KpiBar fcst={monthFcst} />
      </div>
      
      {/* 2줄: 세그먼트 필터 + 자동 펼침 슬라이더 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 16,
        marginBottom: 12,
      }}>
        <SegmentFilter ... />
        <ThresholdSlider ... />
      </div>
      
      {/* 카드 영역 삭제됨 */}
    </div>
    
    {/* 표 */}
    <ForecastTable ... />
  </div>
)
```

---

## 🧹 정리 작업

### 1. 기존 카드 컴포넌트 처리

`SummaryCards.tsx` / `SummaryCard.tsx`:
- 옵션 A — 파일 삭제 (가장 깔끔)
- 옵션 B — 파일은 두고 import만 제거 (안전)

**권장**: 옵션 B (안전). 나중에 다시 쓸 수도 있음.

### 2. 새 KpiBar 컴포넌트

`app/forecast/components/KpiBar.tsx`로 분리:

```tsx
type KpiBarProps = {
  fcst: { rn: number; adr: number; rev: number; occ: number }
  // 나중에 budget 추가 시:
  // budget?: { rn: number; adr: number; rev: number; occ: number }
}

export function KpiBar({ fcst }: KpiBarProps) {
  return (
    <div style={{ /* flex */ }}>
      {/* FCST 박스 */}
      {/* vs Budget 라벨 */}
      {/* Budget 박스 (준비 중) */}
    </div>
  )
}
```

---

## 🧪 동작 시나리오 검증

**시나리오 1 — 화면 절약**
- 카드 4개 차지하던 큰 영역 사라짐
- 표가 한 화면에 더 많이 들어옴

**시나리오 2 — KPI 바 표시**
- 월 selector 옆 우측에 FCST 박스
- "vs Budget" 라벨
- Budget 박스는 "준비 중" 옅게

**시나리오 3 — 컨트롤 한 줄 아래**
- 세그먼트 필터 + 자동 펼침이 새 줄로 내려감
- 깔끔한 2줄 구조

**시나리오 4 — sticky 유지**
- 상단 영역이 여전히 sticky
- 스크롤 시 컨트롤 + KPI 바 항상 보임

**시나리오 5 — 월 변경**
- 5월 → 6월 변경 시 KPI 바도 자동 업데이트
- FCST 값이 6월 합계로

---

## ❌ 이번 단계엔 만들지 마

- ❌ Budget 데이터 fetch (다음 단계)
- ❌ 상세 모달 (다음 단계)
- ❌ LY 데이터 (다음 단계)
- ❌ 글로벌 파일 수정 (절대!)

---

## ✅ 완료 기준

- 카드 4개 사라짐
- 월 selector 옆에 KPI 바 추가
- FCST 박스: OCC, ADR, REV 표시
- vs Budget 박스: "준비 중" 옅게
- 세그먼트 필터 + 슬라이더가 새 줄로 이동
- 표가 한 화면에 더 많이 들어옴
- 다른 페이지 영향 없음
- 다른 기능 정상 동작
- TypeScript 컴파일 에러 없음
- 콘솔 에러 없음
- 다크/라이트 모드 둘 다 자연스러움

---

## 💬 의심스러운 부분 있으면 멈춰

- 기존 SummaryCards 컴포넌트가 어디서 import 되는지
- KPI 바 박스 디자인 톤 (디자인 시스템 따라)
- 월 selector와 KPI 바 사이 간격

기존 SummaryCards 파일 삭제하지 말고 import만 제거. 안전.
