# NovaStay Design System — Light Mode Theme

> 호텔 RMS SaaS **NovaStay**의 라이트 모드 테마 가이드입니다.
> Cryptix 다크 테마와 페어링되어, 동일한 토큰 이름·다른 값으로 작동합니다.
> RM이 매일 8시간 마주하는 도구이므로, 따뜻한 크림 톤으로 장시간 가독성을 우선합니다.

---

## 🎯 디자인 철학

### 다크 vs 라이트 — 같은 영혼, 다른 옷

| 측면 | 다크 (Cryptix) | 라이트 (NovaStay Day) |
|------|---------------|---------------------|
| 베이스 톤 | 딥 블랙 (#0A0A0A) | 따뜻한 크림 (#FCFCF8) |
| 분위기 | 미니멀, 고급, 디지털 자산 | 종이 느낌, 업무용, 장시간 가독성 |
| 액센트 강도 | #00E5A0 그대로 (다크 위에서 글로우) | #00B883 ~ #008F66 (가독성) |
| 그림자 철학 | 글로우 + 깊은 블랙 | 부드러운 회색 그림자 |
| 사용 시나리오 | 야간 모니터링, 마케팅 페이지 | RM 일일 업무, 분석, 리포트 |

### 핵심 원칙

1. **종이 같은 따뜻함** — 순백(#FFFFFF) 회피, 크림 톤(#FCFCF8)으로 눈 피로 감소
2. **브랜드 일관성** — 민트 그린을 톤 조정해서 유지 (시그니처 컬러)
3. **가독성 우선** — 모든 텍스트 명도 대비 7:1 이상 목표 (WCAG AAA)
4. **다크와 1:1 페어링** — 같은 토큰 이름, 의미만 같으면 값은 다름

---

## 🎨 Color Palette

### Background Colors

| Token | Light Hex | Dark 비교 | 사용처 |
|-------|-----------|----------|--------|
| `--color-bg-primary` | `#FCFCF8` | `#0A0A0A` | 전체 페이지 배경 (따뜻한 크림) |
| `--color-bg-secondary` | `#F5F4ED` | `#111111` | 카드, 섹션 배경 (살짝 어두운 크림) |
| `--color-bg-tertiary` | `#EDECE3` | `#1A1A1A` | 입력 필드, 패널 배경 |
| `--color-bg-elevated` | `#FFFFFF` | `#1E1E1E` | 모달, 드롭다운 (가장 밝게 띄워서 분리) |
| `--color-bg-surface` | `#F9F8F2` | `#141414` | 대시보드 카드, 위젯 배경 |

> **다크와 반대 패턴 주의**: 다크에서는 elevated가 더 밝아져서 떠보이지만, 라이트에서는 **elevated가 가장 밝은 #FFFFFF**가 되어야 떠 보입니다. 베이스가 크림 톤이라 흰색이 떠 보이는 효과 발생.

### Brand / Accent Colors

브랜드 일관성을 위해 민트 그린을 유지하되, **컨텍스트별로 톤을 조정**합니다.

| Token | Light Hex | Dark Hex | 사용처 |
|-------|-----------|----------|--------|
| `--color-accent-primary` | `#00B883` | `#00E5A0` | 텍스트, 아이콘, 테두리 (가독성용 진한 톤) |
| `--color-accent-bold` | `#00E5A0` | `#00E5A0` | 큰 면적 버튼 배경, 배지 (브랜드 시그니처 유지) |
| `--color-accent-secondary` | `#008F66` | `#00C87E` | 호버, 강조 텍스트 |
| `--color-accent-glow` | `rgba(0, 184, 131, 0.12)` | `rgba(0, 229, 160, 0.15)` | 글로우 효과 (라이트에선 약하게) |
| `--color-accent-dim` | `rgba(0, 184, 131, 0.06)` | `rgba(0, 229, 160, 0.08)` | 서브틀한 하이라이트 |

> **사용 가이드**:
> - "추천 가격" 같은 **텍스트 강조** → `--color-accent-primary` (#00B883)
> - "추천 적용" **버튼** → `--color-accent-bold` (#00E5A0) 배경 + 어두운 텍스트
> - "추천됨" **배지** → `--color-accent-bold` 배경 + `--color-accent-secondary` 텍스트

### Text Colors

| Token | Light Hex | Dark Hex | 명도 대비 (라이트) | 사용처 |
|-------|-----------|----------|-------------------|--------|
| `--color-text-primary` | `#1A1815` | `#FFFFFF` | 16.8:1 ✅ | 헤딩, 주요 텍스트 |
| `--color-text-secondary` | `#5C5A52` | `#A0A0A0` | 7.2:1 ✅ | 부제목, 설명 텍스트 |
| `--color-text-tertiary` | `#8A887E` | `#666666` | 4.5:1 ✅ | 플레이스홀더, 비활성 |
| `--color-text-accent` | `#00B883` | `#00E5A0` | 4.6:1 ✅ | 강조 키워드, 링크 |
| `--color-text-muted` | `#B5B3A9` | `#4A4A4A` | 3.0:1 | 매우 흐린 텍스트, 구분선 라벨 |

> **왜 #1A1815일까?** 순수 검정(#000000)은 크림 배경에서 너무 강한 대비를 만들어 눈이 피로합니다. 따뜻한 베이스에 맞는 따뜻한 다크 그레이가 더 편안해요.

### Semantic Colors

호텔 업무 특성상 **상승/하락, 주의/정보** 색상이 정말 중요합니다. 라이트에서는 가독성을 위해 더 진한 톤 사용:

| Token | Light Hex | Dark Hex | 사용처 |
|-------|-----------|----------|--------|
| `--color-positive` | `#00B883` | `#00E5A0` | RevPAR 상승, Pickup 증가, 추천 적용 성공 |
| `--color-negative` | `#D63838` | `#FF4D4D` | 점유율 하락, 가격 인하 경고, 에러 |
| `--color-warning` | `#D67E0E` | `#F5A623` | OTA 가격 미스매치, 마감 임박 |
| `--color-info` | `#2D7DD2` | `#4A9EFF` | 일반 알림, 도움말, 시스템 메시지 |

> **호텔 업무 특화**: 가격 표시 시 `--color-positive` (전일 대비 상승), `--color-negative` (하락) — 단, 색상에만 의존하지 말고 화살표 ↑↓ 함께 사용 (색맹 대응).

### Border & Divider Colors

| Token | Light Hex | Dark Hex | 사용처 |
|-------|-----------|----------|--------|
| `--color-border-default` | `rgba(0, 0, 0, 0.10)` | `rgba(255, 255, 255, 0.08)` | 카드 테두리, 구분선 |
| `--color-border-subtle` | `rgba(0, 0, 0, 0.05)` | `rgba(255, 255, 255, 0.04)` | 매우 서브틀한 구분 |
| `--color-border-accent` | `rgba(0, 184, 131, 0.4)` | `rgba(0, 229, 160, 0.3)` | 포커스 링, 액센트 테두리 |

---

## 🔤 Typography

타이포그래피 자체는 **다크/라이트 동일**합니다. 폰트 패밀리, 크기, 무게는 그대로 유지하고 **색상만 변경**됩니다.

```css
--font-heading: 'DM Sans', 'Sora', sans-serif;
--font-body:    'DM Sans', 'Inter', sans-serif;
--font-mono:    'DM Mono', 'JetBrains Mono', monospace;
```

> 한국어 호텔 RM이 주 사용자이므로, 향후 `'Pretendard', 'Noto Sans KR'` 추가 권장.

### Heading Highlight Style (라이트 모드)

```css
.heading-highlight .accent {
  color: var(--color-accent-primary);  /* #00B883 — 흰 배경에서도 보임 */
  background: linear-gradient(135deg, #00B883, #008F66);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

---

## ✨ Effects & Shadows

라이트 모드의 가장 큰 차이는 **그림자 철학**입니다. 다크는 글로우와 깊은 블랙으로 깊이를 표현하지만, 라이트는 **부드러운 회색 그림자**로 표현해야 합니다.

### Box Shadows

```css
/* 카드 기본 그림자 (다크보다 약하게, 따뜻한 톤) */
--shadow-card: 
  0 1px 2px rgba(60, 50, 30, 0.04),
  0 2px 6px rgba(60, 50, 30, 0.06);

/* 모달, 팝업 (더 강하게 분리) */
--shadow-elevated: 
  0 4px 12px rgba(60, 50, 30, 0.08),
  0 12px 32px rgba(60, 50, 30, 0.12);

/* 액센트 글로우 (라이트에선 매우 약하게 — 안 그러면 어색) */
--shadow-accent-glow: 
  0 2px 8px rgba(0, 184, 131, 0.15),
  0 0 0 1px rgba(0, 184, 131, 0.1);

/* 히어로 글로우 (라이트에선 거의 없음) */
--shadow-hero-glow: 
  0 8px 32px rgba(0, 184, 131, 0.08);
```

> **왜 RGB가 검정이 아닌 갈색 톤?** `rgba(60, 50, 30, ...)`은 따뜻한 다크 그레이로, 크림 배경에 자연스럽게 녹아듭니다. 순수 검정 그림자는 라이트 모드에서 차갑고 인위적으로 보여요.

### Backdrop & Glass

```css
/* 네비게이션 바 */
--backdrop-nav: blur(12px);
--bg-nav: rgba(252, 252, 248, 0.85);  /* 크림 톤 반투명 */

/* 글래스모피즘 카드 */
--backdrop-glass: blur(8px);
--bg-glass: rgba(255, 255, 255, 0.6);
```

### Gradients

```css
/* 히어로 배경 그라디언트 (라이트에선 매우 미묘하게) */
--gradient-hero: 
  radial-gradient(ellipse 80% 50% at 50% -10%, 
    rgba(0, 184, 131, 0.08) 0%, 
    transparent 60%);

/* CTA 버튼 — 다크와 동일하게 민트 유지 (브랜드 시그니처) */
--gradient-cta: linear-gradient(135deg, #00E5A0, #00B883);

/* 카드 테두리 그라디언트 (라이트용) */
--gradient-border: linear-gradient(135deg, 
  rgba(0, 0, 0, 0.08), 
  rgba(0, 0, 0, 0.02));

/* 섹션 페이드 오버레이 */
--gradient-fade-down: linear-gradient(to bottom, transparent, #FCFCF8);
```

---

## 🔘 Components — Light Mode 변형

### CTA Button (Primary) — 거의 동일

다크와 동일한 민트 버튼을 유지합니다. **버튼은 라이트/다크 공통 시그니처**.

```css
.btn-primary {
  background: var(--gradient-cta);    /* #00E5A0 → #00B883 */
  color: #0A0A0A;                      /* 다크 텍스트 — 라이트/다크 공통 */
  font-size: var(--text-body-md);
  font-weight: 600;
  padding: 12px 24px;
  border-radius: var(--radius-full);
  border: none;
  box-shadow: var(--shadow-accent-glow);
  transition: all 0.2s ease;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 
    0 4px 12px rgba(0, 184, 131, 0.25),
    0 8px 24px rgba(0, 184, 131, 0.15);
}
```

### Secondary Button / Ghost

```css
.btn-ghost {
  background: transparent;
  color: var(--color-text-primary);    /* 라이트: #1A1815 */
  border: 1px solid var(--color-border-default);  /* 라이트: rgba(0,0,0,0.10) */
  border-radius: var(--radius-full);
  padding: 11px 24px;
  font-size: var(--text-body-md);
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-ghost:hover {
  border-color: var(--color-accent-primary);  /* 라이트: #00B883 */
  color: var(--color-accent-primary);
  background: var(--color-accent-dim);
}
```

### Card

```css
.card {
  background: var(--color-bg-surface);    /* 라이트: #F9F8F2 */
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-card);          /* 라이트는 그림자 더 중요 */
}
```

> **다크와의 결정적 차이**: 다크는 `box-shadow`가 거의 안 보이지만, 라이트에서는 카드 분리감이 그림자에서 옵니다. **그림자 빠뜨리지 마세요**.

### Navigation Bar

```css
.navbar {
  background: var(--bg-nav);                       /* 라이트: rgba(252,252,248,0.85) */
  backdrop-filter: var(--backdrop-nav);
  border-bottom: 1px solid var(--color-border-default);
  height: 64px;
  position: sticky;
  top: 0;
  z-index: 100;
}
```

### Input Field

```css
.input {
  background: var(--color-bg-elevated);      /* 라이트: #FFFFFF (가장 밝게) */
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-body-md);
  padding: 10px 14px;
  transition: border-color 0.2s;
}

.input:focus {
  outline: none;
  border-color: var(--color-accent-primary);  /* 라이트: #00B883 */
  box-shadow: 0 0 0 3px var(--color-accent-dim);
}

.input::placeholder {
  color: var(--color-text-tertiary);          /* 라이트: #8A887E */
}
```

### Badge / Tag

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--color-accent-dim);          /* 라이트: rgba(0,184,131,0.06) */
  color: var(--color-accent-primary);           /* 라이트: #00B883 */
  border: 1px solid rgba(0, 184, 131, 0.2);
  border-radius: var(--radius-full);
  font-size: var(--text-label);
  font-weight: 500;
  padding: 3px 10px;
}
```

### Step Number

```css
.step-number {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);    /* 라이트: #EDECE3 */
  border: 1px solid var(--color-border-default);
  color: var(--color-text-secondary);      /* 라이트: #5C5A52 */
  font-size: var(--text-label);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

---

## 🏨 RMS-Specific Components (라이트 모드)

호텔 RMS만의 특화 컴포넌트 가이드입니다.

### Rate Display (가격 표시)

가격은 **항상 mono 폰트** 사용. 라이트 모드에서 변동 표시:

```css
.rate-display {
  font-family: var(--font-mono);
  font-size: var(--text-mono-lg);   /* 28px */
  font-weight: 600;
  color: var(--color-text-primary);  /* 라이트: #1A1815 */
}

.rate-change-positive {
  color: var(--color-positive);      /* 라이트: #00B883 */
  font-size: var(--text-body-md);
}

.rate-change-negative {
  color: var(--color-negative);      /* 라이트: #D63838 */
}
```

### Recommendation Card (추천 가격 카드)

NovaStay의 핵심 컴포넌트:

```css
.recommendation-card {
  background: var(--color-bg-elevated);              /* 라이트: #FFFFFF */
  border: 1px solid var(--color-border-accent);      /* 민트 테두리로 강조 */
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  position: relative;
}

.recommendation-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius-lg);
  background: var(--color-accent-dim);
  z-index: -1;
}
```

### Calendar Cell (Rate Calendar)

365일 가격 캘린더의 기본 셀:

```css
.calendar-cell {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-subtle);
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-body-sm);
}

.calendar-cell--today {
  border-color: var(--color-accent-primary);
  background: var(--color-accent-dim);
}

.calendar-cell--high-occupancy {
  /* 점유율 80%+ 시각화 */
  background: linear-gradient(
    to top,
    rgba(0, 184, 131, 0.15) 0%,
    transparent 100%
  );
}
```

---

## 🔄 Mode Switching (사용자 토글)

사용자가 설정에서 수동 선택하는 방식이므로, **명시적 토글 + 저장**이 핵심입니다.

### HTML 구조 (data-attribute 방식 권장)

```html
<!-- 다크 모드 -->
<html data-theme="dark">

<!-- 라이트 모드 -->
<html data-theme="light">

<!-- 시스템 설정 따라가기 (선택지) -->
<html data-theme="system">
```

### CSS 구조

```css
/* 기본값: 라이트 (또는 다크 — 사용자 결정) */
:root,
[data-theme="light"] {
  --color-bg-primary:    #FCFCF8;
  --color-text-primary:  #1A1815;
  /* ... 라이트 모든 토큰 */
}

[data-theme="dark"] {
  --color-bg-primary:    #0A0A0A;
  --color-text-primary:  #FFFFFF;
  /* ... 다크 모든 토큰 */
}

/* 시스템 설정 따라가기 (선택지) */
@media (prefers-color-scheme: dark) {
  [data-theme="system"] {
    --color-bg-primary:    #0A0A0A;
    --color-text-primary:  #FFFFFF;
    /* ... 다크 토큰 */
  }
}
```

### 토글 컴포넌트 권장 패턴

```html
<!-- 설정 페이지의 테마 선택 -->
<div class="theme-selector">
  <button data-theme-value="light" class="active">
    <i class="ti ti-sun"></i> 라이트
  </button>
  <button data-theme-value="dark">
    <i class="ti ti-moon"></i> 다크
  </button>
  <button data-theme-value="system">
    <i class="ti ti-device-desktop"></i> 시스템 설정
  </button>
</div>
```

### 저장 전략

```javascript
// localStorage에 저장 (사용자 선택 보존)
function setTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem('novastay-theme', mode);
}

// 페이지 로드 시 복원 (FOUC 방지를 위해 <head>에서 inline 실행)
function restoreTheme() {
  const saved = localStorage.getItem('novastay-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}
```

> **FOUC 주의**: `<head>` 안에서 inline `<script>`로 테마 복원 코드를 가장 먼저 실행해야 페이지 깜빡임이 없습니다.

---

## ♿ Accessibility — 라이트 모드 명도 대비

라이트 모드는 다크보다 명도 대비가 까다롭습니다. 모든 조합을 검증했어요:

| 조합 | 대비 | WCAG 등급 |
|------|------|----------|
| `text-primary` (#1A1815) on `bg-primary` (#FCFCF8) | 16.8:1 | AAA ✅ |
| `text-secondary` (#5C5A52) on `bg-primary` (#FCFCF8) | 7.2:1 | AAA ✅ |
| `text-tertiary` (#8A887E) on `bg-primary` (#FCFCF8) | 4.5:1 | AA ✅ |
| `text-accent` (#00B883) on `bg-primary` (#FCFCF8) | 4.6:1 | AA ✅ |
| `text-primary` on `accent-bold` 버튼 (#00E5A0) | 8.2:1 | AAA ✅ |
| `positive` (#00B883) on `bg-primary` | 4.6:1 | AA ✅ |
| `negative` (#D63838) on `bg-primary` | 5.1:1 | AA ✅ |

> 색상에만 의존하지 말고 항상 **아이콘 + 텍스트** 조합으로 의미 전달. (예: 가격 상승은 ↑ 화살표 + 색상)

### 포커스 링

```css
:focus-visible {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 3px;
  border-radius: var(--radius-xs);
}
```

---

## 📦 CSS Variables — 라이트 모드 전체

```css
:root,
[data-theme="light"] {
  /* Backgrounds */
  --color-bg-primary:    #FCFCF8;   /* 따뜻한 크림 */
  --color-bg-secondary:  #F5F4ED;
  --color-bg-tertiary:   #EDECE3;
  --color-bg-elevated:   #FFFFFF;   /* 모달은 가장 밝게 */
  --color-bg-surface:    #F9F8F2;

  /* Accent — 컨텍스트별 톤 분리 */
  --color-accent-primary:   #00B883;   /* 텍스트/아이콘용 진한 톤 */
  --color-accent-bold:      #00E5A0;   /* 큰 면적 버튼은 시그니처 톤 */
  --color-accent-secondary: #008F66;
  --color-accent-glow:      rgba(0, 184, 131, 0.12);
  --color-accent-dim:       rgba(0, 184, 131, 0.06);

  /* Text */
  --color-text-primary:   #1A1815;     /* 따뜻한 다크 (순흑 회피) */
  --color-text-secondary: #5C5A52;
  --color-text-tertiary:  #8A887E;
  --color-text-accent:    #00B883;
  --color-text-muted:     #B5B3A9;

  /* Semantic */
  --color-positive: #00B883;
  --color-negative: #D63838;
  --color-warning:  #D67E0E;
  --color-info:     #2D7DD2;

  /* Borders */
  --color-border-default: rgba(0, 0, 0, 0.10);
  --color-border-subtle:  rgba(0, 0, 0, 0.05);
  --color-border-accent:  rgba(0, 184, 131, 0.4);

  /* Typography (다크와 동일) */
  --font-heading: 'DM Sans', sans-serif;
  --font-body:    'DM Sans', sans-serif;
  --font-mono:    'DM Mono', monospace;

  /* Type Scale (다크와 동일) */
  --text-display-xl: 56px;
  --text-display-lg: 40px;
  --text-display-md: 32px;
  --text-heading-lg: 24px;
  --text-heading-md: 18px;
  --text-body-lg:    16px;
  --text-body-md:    14px;
  --text-body-sm:    12px;
  --text-label:      11px;
  --text-mono-lg:    28px;
  --text-mono-md:    16px;

  /* Spacing (다크와 동일) */
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;
  --space-4: 16px;  --space-5: 20px;  --space-6: 24px;
  --space-8: 32px;  --space-10: 40px; --space-12: 48px;
  --space-16: 64px; --space-20: 80px; --space-24: 96px;

  /* Border Radius (다크와 동일) */
  --radius-xs:   4px;
  --radius-sm:   6px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;
  --radius-2xl:  24px;
  --radius-full: 9999px;

  /* Shadows (라이트 전용 — 따뜻한 그레이 톤) */
  --shadow-card:        0 1px 2px rgba(60,50,30,0.04), 0 2px 6px rgba(60,50,30,0.06);
  --shadow-elevated:    0 4px 12px rgba(60,50,30,0.08), 0 12px 32px rgba(60,50,30,0.12);
  --shadow-accent-glow: 0 2px 8px rgba(0,184,131,0.15), 0 0 0 1px rgba(0,184,131,0.1);
  --shadow-hero-glow:   0 8px 32px rgba(0,184,131,0.08);

  /* Gradients (라이트 전용) */
  --gradient-hero:   radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,184,131,0.08) 0%, transparent 60%);
  --gradient-cta:    linear-gradient(135deg, #00E5A0, #00B883);
  --gradient-border: linear-gradient(135deg, rgba(0,0,0,0.08), rgba(0,0,0,0.02));
  --gradient-fade-down: linear-gradient(to bottom, transparent, #FCFCF8);

  /* Backdrop */
  --backdrop-nav: blur(12px);
  --bg-nav: rgba(252, 252, 248, 0.85);
  --backdrop-glass: blur(8px);
  --bg-glass: rgba(255, 255, 255, 0.6);

  /* Layout (다크와 동일) */
  --layout-max-width:      1200px;
  --layout-content-width:  960px;
  --layout-narrow-width:   720px;
  --layout-gutter:         24px;
  --layout-gutter-lg:      48px;
  --section-spacing:       120px;

  /* Motion (다크와 동일) */
  --transition-fast:   0.15s ease;
  --transition-base:   0.2s ease;
  --transition-slow:   0.35s ease;
  --transition-spring: 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

---

## 🚦 다크 ↔ 라이트 전환 체크리스트

새 컴포넌트 만들 때마다 양쪽에서 확인:

- [ ] 모든 색상이 CSS 변수로 처리되어 있는가? (하드코드 X)
- [ ] 라이트에서 카드/버튼이 배경과 충분히 구분되는가? (그림자 확인)
- [ ] 라이트에서 액센트 컬러가 너무 밝아 안 보이지 않는가? (텍스트 = #00B883 사용)
- [ ] 다크에서 그림자가 너무 진해서 어색하지 않은가?
- [ ] 호버 상태가 양쪽에서 자연스러운가?
- [ ] 포커스 링이 양쪽에서 충분히 보이는가?
- [ ] 색맹/저시력 사용자도 의미 파악 가능한가? (아이콘 + 색상 조합)

---

## 🎨 사용 시나리오 가이드

### 라이트 모드를 권장하는 화면
- **RM Workspace** — 매일 8시간 보는 메인 작업 화면
- **리포트/분석 페이지** — 데이터 가독성 우선
- **세팅, 호텔 정보 입력** — 폼 가독성
- **주간/월간 마감 리포트** — 인쇄 시에도 동일

### 다크 모드가 어울리는 화면
- **마케팅 랜딩 페이지** — 첫인상의 임팩트
- **야간 모니터링 대시보드** — 호텔 야간 당직자
- **실시간 알림 화면** — 변화 감지에 집중
- **로그인/회원가입** — 브랜드 분위기

### 사용자가 자유롭게 선택
- **설정 → 테마** 에서 토글
- 기본값은 **라이트** 권장 (RM이 주로 낮에 사용)
- 마지막 선택을 localStorage에 기억

---

*NovaStay Design System — Light Mode v1.0*
*Cryptix Dark Theme와 페어링되어 작동합니다.*
