# Cryptix Design System — Theme Reference

> 암호화폐 관리 플랫폼 **Cryptix**의 디자인 토큰 및 테마 가이드입니다.

---

## 🎨 Color Palette

### Background Colors

| Token | Hex | 사용처 |
|-------|-----|--------|
| `--color-bg-primary` | `#0A0A0A` | 전체 페이지 배경 (딥 블랙) |
| `--color-bg-secondary` | `#111111` | 카드, 섹션 배경 |
| `--color-bg-tertiary` | `#1A1A1A` | 입력 필드, 패널 배경 |
| `--color-bg-elevated` | `#1E1E1E` | 모달, 드롭다운, 호버 상태 |
| `--color-bg-surface` | `#141414` | 대시보드 카드, 위젯 배경 |

### Brand / Accent Colors

| Token | Hex | 사용처 |
|-------|-----|--------|
| `--color-accent-primary` | `#00E5A0` | CTA 버튼, 포인트 색상 (민트 그린) |
| `--color-accent-secondary` | `#00C87E` | 버튼 호버, 강조 텍스트 |
| `--color-accent-glow` | `rgba(0, 229, 160, 0.15)` | 글로우 효과, 배경 하이라이트 |
| `--color-accent-dim` | `rgba(0, 229, 160, 0.08)` | 서브틀한 하이라이트 |

### Text Colors

| Token | Hex | 사용처 |
|-------|-----|--------|
| `--color-text-primary` | `#FFFFFF` | 헤딩, 주요 텍스트 |
| `--color-text-secondary` | `#A0A0A0` | 부제목, 설명 텍스트 |
| `--color-text-tertiary` | `#666666` | 플레이스홀더, 비활성 텍스트 |
| `--color-text-accent` | `#00E5A0` | 강조 키워드, 링크 |
| `--color-text-muted` | `#4A4A4A` | 매우 흐린 텍스트, 구분선 라벨 |

### Semantic Colors

| Token | Hex | 사용처 |
|-------|-----|--------|
| `--color-positive` | `#00E5A0` | 상승, 수익, 성공 상태 |
| `--color-negative` | `#FF4D4D` | 하락, 손실, 에러 상태 |
| `--color-warning` | `#F5A623` | 주의, 대기 상태 |
| `--color-info` | `#4A9EFF` | 정보, 알림 상태 |

### Border & Divider Colors

| Token | Hex | 사용처 |
|-------|-----|--------|
| `--color-border-default` | `rgba(255, 255, 255, 0.08)` | 카드 테두리, 구분선 |
| `--color-border-subtle` | `rgba(255, 255, 255, 0.04)` | 매우 서브틀한 구분 |
| `--color-border-accent` | `rgba(0, 229, 160, 0.3)` | 포커스 링, 액센트 테두리 |

---

## 🔤 Typography

### Font Family

```css
/* 헤딩 — 기하학적이고 현대적인 디스플레이 폰트 */
--font-heading: 'DM Sans', 'Sora', sans-serif;

/* 본문 — 가독성 높은 인터페이스 폰트 */
--font-body: 'DM Sans', 'Inter', sans-serif;

/* 숫자/데이터 — 고정폭 수치 표시 */
--font-mono: 'DM Mono', 'JetBrains Mono', monospace;
```

### Type Scale

| Token | Size | Weight | Line Height | 사용처 |
|-------|------|--------|-------------|--------|
| `--text-display-xl` | `56px` | 700 | 1.1 | 히어로 헤딩 ("Take Control of Your Digital Assets") |
| `--text-display-lg` | `40px` | 700 | 1.15 | 섹션 헤딩 |
| `--text-display-md` | `32px` | 600 | 1.2 | 서브 섹션 헤딩 |
| `--text-heading-lg` | `24px` | 600 | 1.3 | 카드 타이틀, 기능 헤딩 |
| `--text-heading-md` | `18px` | 600 | 1.4 | 소제목 |
| `--text-body-lg` | `16px` | 400 | 1.6 | 주요 본문 텍스트 |
| `--text-body-md` | `14px` | 400 | 1.6 | 일반 본문, UI 라벨 |
| `--text-body-sm` | `12px` | 400 | 1.5 | 캡션, 보조 정보 |
| `--text-label` | `11px` | 500 | 1.4 | 태그, 배지, 스텝 번호 |
| `--text-mono-lg` | `28px` | 600 | 1.2 | 가격/금액 표시 (€22,193.05) |
| `--text-mono-md` | `16px` | 500 | 1.4 | 소규모 수치 데이터 |

### Heading Highlight Style

히어로 헤딩에서 마지막 단어는 액센트 컬러로 강조:

```css
/* 예: "Simplicity, performance, and security" */
.heading-highlight {
  color: var(--color-text-primary);
}
.heading-highlight .accent {
  color: var(--color-accent-primary);
  /* 선택적으로 텍스트 그라디언트 적용 */
  background: linear-gradient(135deg, #00E5A0, #00C87E);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

---

## 📐 Spacing & Layout

### Spacing Scale

```css
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
--space-20: 80px;
--space-24: 96px;
--space-32: 128px;
```

### Layout

```css
--layout-max-width:     1200px;
--layout-content-width: 960px;
--layout-narrow-width:  720px;
--layout-gutter:        24px;    /* 모바일 */
--layout-gutter-lg:     48px;    /* 데스크탑 */
--section-spacing:      120px;   /* 섹션 간 수직 여백 */
```

### Grid

```css
/* 피처 카드 그리드 (4컬럼) */
--grid-features: repeat(4, 1fr);
/* 암호화폐 목록 그리드 (2컬럼) */
--grid-crypto: repeat(2, 1fr);
/* How It Works 스텝 그리드 (3컬럼) */
--grid-steps: repeat(3, 1fr);
```

---

## 🟦 Border Radius

| Token | Value | 사용처 |
|-------|-------|--------|
| `--radius-xs` | `4px` | 태그, 배지 |
| `--radius-sm` | `6px` | 버튼 (small), 입력 필드 |
| `--radius-md` | `8px` | 카드 (small), 드롭다운 |
| `--radius-lg` | `12px` | 카드 (standard) |
| `--radius-xl` | `16px` | 패널, 모달 |
| `--radius-2xl` | `24px` | 대시보드 프리뷰 컨테이너 |
| `--radius-full` | `9999px` | 알약형 버튼, 배지, 아바타 |

---

## ✨ Effects & Shadows

### Box Shadows

```css
/* 카드 기본 그림자 */
--shadow-card: 0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.6);

/* 모달, 팝업 */
--shadow-elevated: 0 10px 40px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4);

/* 액센트 글로우 (버튼, 활성 요소) */
--shadow-accent-glow: 0 0 20px rgba(0, 229, 160, 0.25), 0 0 40px rgba(0, 229, 160, 0.1);

/* 대시보드 히어로 글로우 */
--shadow-hero-glow: 0 0 80px rgba(0, 229, 160, 0.12), 0 0 160px rgba(0, 229, 160, 0.06);
```

### Backdrop & Glass

```css
/* 네비게이션 바 */
--backdrop-nav: blur(12px);
--bg-nav: rgba(10, 10, 10, 0.85);

/* 글래스모피즘 카드 */
--backdrop-glass: blur(8px);
--bg-glass: rgba(255, 255, 255, 0.04);
```

### Gradients

```css
/* 히어로 배경 그라디언트 */
--gradient-hero: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0, 229, 160, 0.15) 0%, transparent 60%);

/* 카드 테두리 그라디언트 */
--gradient-border: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02));

/* CTA 버튼 */
--gradient-cta: linear-gradient(135deg, #00E5A0, #00C87E);

/* 섹션 페이드 오버레이 */
--gradient-fade-down: linear-gradient(to bottom, transparent, #0A0A0A);
```

---

## 🔘 Components

### CTA Button (Primary)

```css
.btn-primary {
  background: var(--gradient-cta);
  color: #0A0A0A;                         /* 다크 텍스트 on 밝은 버튼 */
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
  box-shadow: 0 0 30px rgba(0, 229, 160, 0.35);
}
```

### Secondary Button / Ghost

```css
.btn-ghost {
  background: transparent;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-full);
  padding: 11px 24px;
  font-size: var(--text-body-md);
  font-weight: 500;
  transition: all 0.2s ease;
}
.btn-ghost:hover {
  border-color: var(--color-accent-primary);
  color: var(--color-accent-primary);
}
```

### Card

```css
.card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
}
```

### Navigation Bar

```css
.navbar {
  background: var(--bg-nav);
  backdrop-filter: var(--backdrop-nav);
  border-bottom: 1px solid var(--color-border-subtle);
  height: 64px;
  position: sticky;
  top: 0;
  z-index: 100;
}
```

### Input Field

```css
.input {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--text-body-md);
  padding: 10px 14px;
  transition: border-color 0.2s;
}
.input:focus {
  outline: none;
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 3px var(--color-accent-dim);
}
```

### Badge / Tag

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--color-accent-dim);
  color: var(--color-accent-primary);
  border: 1px solid rgba(0, 229, 160, 0.2);
  border-radius: var(--radius-full);
  font-size: var(--text-label);
  font-weight: 500;
  padding: 3px 10px;
}
```

### Step Number (How It Works)

```css
.step-number {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-secondary);
  font-size: var(--text-label);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

---

## 🌟 Hero Section Pattern

```css
/* 배경 글로우 오버레이 */
.hero-glow {
  position: absolute;
  inset: 0;
  background: var(--gradient-hero);
  pointer-events: none;
}

/* 대시보드 프리뷰 컨테이너 */
.hero-preview {
  border-radius: var(--radius-2xl);
  border: 1px solid var(--color-border-default);
  overflow: hidden;
  box-shadow: var(--shadow-hero-glow);
  /* 하단 페이드 처리 */
  -webkit-mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
}
```

---

## ♿ Accessibility

```css
/* 포커스 링 */
:focus-visible {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 3px;
  border-radius: var(--radius-xs);
}

/* 명도 대비 */
/* 주요 텍스트(#FFF) on 배경(#0A0A0A): 21:1 ✅ */
/* 보조 텍스트(#A0A0A0) on 배경(#0A0A0A): 7.5:1 ✅ */
/* 액센트(#00E5A0) on 배경(#0A0A0A): 10.3:1 ✅ */
```

---

## 📦 CSS Variables — 전체 참조

```css
:root {
  /* Backgrounds */
  --color-bg-primary:    #0A0A0A;
  --color-bg-secondary:  #111111;
  --color-bg-tertiary:   #1A1A1A;
  --color-bg-elevated:   #1E1E1E;
  --color-bg-surface:    #141414;

  /* Accent */
  --color-accent-primary:   #00E5A0;
  --color-accent-secondary: #00C87E;
  --color-accent-glow:      rgba(0, 229, 160, 0.15);
  --color-accent-dim:       rgba(0, 229, 160, 0.08);

  /* Text */
  --color-text-primary:   #FFFFFF;
  --color-text-secondary: #A0A0A0;
  --color-text-tertiary:  #666666;
  --color-text-accent:    #00E5A0;
  --color-text-muted:     #4A4A4A;

  /* Semantic */
  --color-positive: #00E5A0;
  --color-negative: #FF4D4D;
  --color-warning:  #F5A623;
  --color-info:     #4A9EFF;

  /* Borders */
  --color-border-default: rgba(255, 255, 255, 0.08);
  --color-border-subtle:  rgba(255, 255, 255, 0.04);
  --color-border-accent:  rgba(0, 229, 160, 0.3);

  /* Typography */
  --font-heading: 'DM Sans', sans-serif;
  --font-body:    'DM Sans', sans-serif;
  --font-mono:    'DM Mono', monospace;

  /* Type Scale */
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

  /* Spacing */
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;
  --space-4: 16px;  --space-5: 20px;  --space-6: 24px;
  --space-8: 32px;  --space-10: 40px; --space-12: 48px;
  --space-16: 64px; --space-20: 80px; --space-24: 96px;

  /* Border Radius */
  --radius-xs:   4px;
  --radius-sm:   6px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;
  --radius-2xl:  24px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-card:       0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.6);
  --shadow-elevated:   0 10px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4);
  --shadow-accent-glow: 0 0 20px rgba(0,229,160,0.25), 0 0 40px rgba(0,229,160,0.1);
  --shadow-hero-glow:  0 0 80px rgba(0,229,160,0.12), 0 0 160px rgba(0,229,160,0.06);

  /* Gradients */
  --gradient-hero:   radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,229,160,0.15) 0%, transparent 60%);
  --gradient-cta:    linear-gradient(135deg, #00E5A0, #00C87E);
  --gradient-border: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02));

  /* Layout */
  --layout-max-width:      1200px;
  --layout-content-width:  960px;
  --layout-gutter:         24px;
  --section-spacing:       120px;

  /* Motion */
  --transition-fast:   0.15s ease;
  --transition-base:   0.2s ease;
  --transition-slow:   0.35s ease;
  --transition-spring: 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

---

*Cryptix Design System v1.0 — Dark Crypto Theme*
