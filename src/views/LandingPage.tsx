'use client'

import { useState, useEffect, useRef, createContext, useContext } from 'react'
import Link from 'next/link'

// ── Theme Tokens ──────────────────────────────────────────────────────────────

const DARK = {
  bgPrimary:    '#0A0A0A', bgSecondary:  '#111111', bgTertiary:   '#1A1A1A', bgElevated:   '#1E1E1E',
  accent:       '#00E5A0', accentBold:   '#00E5A0', accentSec:    '#00C87E',
  accentDim:    'rgba(0,229,160,0.08)', accentBorder: 'rgba(0,229,160,0.28)',
  textPrimary:  '#FFFFFF', textSecond:   '#A0A0A0', textThird:    '#666666', textMuted:    '#4A4A4A',
  borderDef:    'rgba(255,255,255,0.08)', borderSub:  'rgba(255,255,255,0.04)',
  shadowCard:   '0 1px 3px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4)',
  shadowElev:   '0 10px 40px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)',
  shadowGlow:   '0 0 24px rgba(0,229,160,0.3), 0 0 48px rgba(0,229,160,0.12)',
  gradCta:      'linear-gradient(135deg, #00E5A0, #00C87E)',
  particleColors: ['rgba(0,229,160,0.6)', 'rgba(0,200,126,0.5)', 'rgba(0,184,131,0.5)', 'rgba(74,158,255,0.4)'],
  particleLine: (a: number) => `rgba(0,229,160,${a})`,
  heroBg:       'radial-gradient(ellipse 80% 50% at 50% -5%, rgba(0,229,160,0.10) 0%, transparent 60%)',
}

const LIGHT = {
  bgPrimary:    '#FCFCF8', bgSecondary:  '#F5F4ED', bgTertiary:   '#EDECE3', bgElevated:   '#FFFFFF',
  accent:       '#00B883', accentBold:   '#00E5A0', accentSec:    '#008F66',
  accentDim:    'rgba(0,184,131,0.06)', accentBorder: 'rgba(0,184,131,0.25)',
  textPrimary:  '#1A1815', textSecond:   '#5C5A52', textThird:    '#8A887E', textMuted:    '#B5B3A9',
  borderDef:    'rgba(0,0,0,0.10)', borderSub:    'rgba(0,0,0,0.05)',
  shadowCard:   '0 1px 2px rgba(60,50,30,0.04), 0 2px 6px rgba(60,50,30,0.06)',
  shadowElev:   '0 4px 12px rgba(60,50,30,0.08), 0 12px 32px rgba(60,50,30,0.12)',
  shadowGlow:   '0 2px 8px rgba(0,184,131,0.2), 0 0 0 1px rgba(0,184,131,0.12)',
  gradCta:      'linear-gradient(135deg, #00E5A0, #00B883)',
  particleColors: ['rgba(0,184,131,0.5)', 'rgba(0,229,160,0.4)', 'rgba(0,143,102,0.45)', 'rgba(45,125,210,0.35)'],
  particleLine: (a: number) => `rgba(0,184,131,${a})`,
  heroBg:       'radial-gradient(ellipse 80% 50% at 50% -5%, rgba(0,184,131,0.10) 0%, transparent 60%)',
}

type Theme = typeof DARK
const ThemeCtx = createContext<{ isDark: boolean; toggle: () => void; C: Theme }>({ isDark: true, toggle: () => {}, C: DARK })
const useTheme = () => useContext(ThemeCtx)

// ── Particle Canvas ───────────────────────────────────────────────────────────

function ParticleCanvas() {
  const { C } = useTheme()
  const ref = useRef<HTMLCanvasElement>(null)
  const cRef = useRef(C); cRef.current = C

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    let animId: number
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize(); window.addEventListener('resize', resize)
    type P = { x: number; y: number; vx: number; vy: number; r: number; ci: number }
    const pts: P[] = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 2 + 1, ci: Math.floor(Math.random() * 4),
    }))
    const draw = () => {
      const c = cRef.current; ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = Math.sqrt(dx*dx+dy*dy)
        if (d < 140) { ctx.beginPath(); ctx.strokeStyle = c.particleLine(0.14*(1-d/140)); ctx.lineWidth = 0.7; ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.stroke() }
      }
      pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=cRef.current.particleColors[p.ci]; ctx.fill(); p.x+=p.vx; p.y+=p.vy; if(p.x<0||p.x>canvas.width) p.vx*=-1; if(p.y<0||p.y>canvas.height) p.vy*=-1 })
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={ref} className="absolute inset-0 w-full h-full" style={{ opacity: 0.75 }} />
}

// ── Theme Toggle ──────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { isDark, toggle, C } = useTheme()
  return (
    <button onClick={toggle}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:-translate-y-px"
      style={{ border: `1px solid ${C.borderDef}`, color: C.textSecond }}>
      {isDark
        ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>라이트</>
        : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>다크</>}
    </button>
  )
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  const { isDark, C } = useTheme()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => { const fn = () => setScrolled(window.scrollY > 40); window.addEventListener('scroll', fn); return () => window.removeEventListener('scroll', fn) }, [])
  const links = ['Problem', 'Solution', 'Pricing', 'Roadmap']
  const navBg = scrolled ? (isDark ? 'rgba(10,10,10,0.92)' : 'rgba(252,252,248,0.92)') : 'transparent'

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{ background: navBg, backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? `1px solid ${C.borderDef}` : 'none', boxShadow: scrolled ? C.shadowCard : 'none' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/Novastay_Logo.png" alt="NOVASTAY" style={{ height: 32, objectFit: 'contain' }} />
          <span className="font-bold text-sm tracking-widest hidden sm:block" style={{ color: C.textPrimary }}>NovaStay</span>
        </div>
        <div className="hidden md:flex items-center gap-7">
          {links.map(l => (
            <a key={l} href={`#${l.toLowerCase()}`} className="text-sm transition-colors tracking-wide"
              style={{ color: C.textSecond }}
              onMouseEnter={e => (e.currentTarget.style.color = C.accent)}
              onMouseLeave={e => (e.currentTarget.style.color = C.textSecond)}>{l}</a>
          ))}
          <Link href="/login" className="text-sm font-semibold transition-colors tracking-wide"
            style={{ color: C.accent }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            ZenithOptima
          </Link>
          <ThemeToggle />
        </div>
        <div className="md:hidden flex items-center gap-2">
          <ThemeToggle />
          <button className="p-1" onClick={() => setOpen(v => !v)} style={{ color: C.textSecond }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M6 18L18 6M6 6l12 12"/> : <path d="M3 6h18M3 12h18M3 18h18"/>}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden px-6 pb-5 pt-2 space-y-3"
          style={{ background: isDark ? 'rgba(10,10,10,0.97)' : C.bgElevated, borderBottom: `1px solid ${C.borderDef}` }}>
          {links.map(l => (
            <a key={l} href={`#${l.toLowerCase()}`} onClick={() => setOpen(false)}
              className="block text-sm py-2" style={{ color: C.textSecond, borderBottom: `1px solid ${C.borderSub}` }}>{l}</a>
          ))}
          <Link href="/login" onClick={() => setOpen(false)}
            className="block text-sm py-2 font-semibold" style={{ color: C.accent }}>
            ZenithOptima →
          </Link>
        </div>
      )}
    </nav>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  const { isDark, C } = useTheme()
  const [visible, setVisible] = useState(false)
  useEffect(() => { setTimeout(() => setVisible(true), 100) }, [])

  return (
    <section className="relative min-h-screen flex flex-col transition-colors duration-500" style={{ background: C.bgPrimary }}>
      <div className="absolute inset-0 pointer-events-none">
        <div style={{ position: 'absolute', inset: 0, background: C.heroBg }}/>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '25%', background: `linear-gradient(to top, ${C.bgSecondary}, transparent)` }}/>
      </div>
      <div className="absolute inset-0"><ParticleCanvas /></div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-12 text-center">
        <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(20px)', transition: 'all 0.7s' }}>
          <span className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-1.5 rounded-full mb-8 tracking-wider"
            style={{ border: C.accentBorder, color: C.accent, background: C.accentDim }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.accentBold }}/>
            AI 기반 호텔 객실 수익관리 SaaS 플랫폼
          </span>
        </div>

        <h1 className="font-bold leading-tight mb-3"
          style={{ fontSize: 'clamp(1.8rem,5vw,3.5rem)', color: C.textPrimary, opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(24px)', transition: 'all 0.7s 0.1s', textShadow: isDark ? '0 2px 30px rgba(0,0,0,0.5)' : 'none' }}>
          전문 RM 없이도,<br/>
          <span style={{ background: C.gradCta, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AI</span>가 최적의 판매 전략을 만듭니다
        </h1>

        <div className="w-12 h-px my-6" style={{ background: C.accent, opacity: visible ? 1 : 0, transition: 'all 0.7s 0.2s' }}/>

        <p className="max-w-2xl leading-relaxed mb-10"
          style={{ fontSize: 'clamp(0.875rem,1.6vw,1rem)', color: C.textSecond, opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)', transition: 'all 0.7s 0.2s' }}>
          AI·머신러닝 기반 수요 예측과 강화학습 알고리즘을 활용하여<br/>
          호텔 객실 가격 및 판매 전략을 자동으로 생성하는 Revenue Management 솔루션
        </p>


        <div className="flex items-center gap-4" style={{ opacity: visible ? 1 : 0, transition: 'all 0.7s 0.3s' }}>
          <a href="#solution" className="font-semibold px-8 py-3.5 rounded-full text-sm tracking-widest transition-all hover:-translate-y-1"
            style={{ background: C.gradCta, color: '#0A0A0A', boxShadow: C.shadowGlow }}>서비스 알아보기</a>
          <a href="#pricing" className="font-medium px-6 py-3.5 rounded-full text-sm tracking-wide transition-all hover:-translate-y-0.5"
            style={{ border: `1px solid ${C.borderDef}`, color: C.textSecond, background: isDark ? 'rgba(255,255,255,0.04)' : C.bgElevated, boxShadow: C.shadowCard }}>요금 보기 →</a>
        </div>

        {/* Logo Card */}
        <div className="mt-14 transition-all duration-700 delay-500" style={{ opacity: visible ? 0.9 : 0 }}>
          <div className="inline-flex items-center gap-4 px-6 py-4 rounded-2xl"
            style={{ background: isDark ? 'rgba(255,255,255,0.04)' : C.bgElevated, border: `1px solid ${C.borderDef}`, boxShadow: C.shadowCard }}>
            <img src="/Novastay_Logo.png" alt="NOVASTAY" style={{ height: 36, objectFit: 'contain' }} />
            <div className="text-left border-l pl-4" style={{ borderColor: C.borderDef }}>
              <p className="text-xs font-semibold" style={{ color: C.textThird }}>국내 독립형 호텔 특화 수익관리 플랫폼</p>
              <p className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>주식회사 노바스테이 · 경남 진주 · Est. 2026.03.16</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex justify-center pb-8">
        <a href="#problem" className="flex flex-col items-center gap-2 transition-colors" style={{ color: C.textMuted }}
          onMouseEnter={e => (e.currentTarget.style.color = C.accent)} onMouseLeave={e => (e.currentTarget.style.color = C.textMuted)}>
          <span className="text-[10px] tracking-widest">SCROLL</span>
          <svg width="16" height="24" viewBox="0 0 16 24" fill="none" className="animate-bounce">
            <rect x="1" y="1" width="14" height="22" rx="7" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="7" y="5" width="2" height="5" rx="1" fill="currentColor"/>
          </svg>
        </a>
      </div>
    </section>
  )
}

// ── Problem ───────────────────────────────────────────────────────────────────

const PROBLEMS = [
  { num: '01', title: '전략 수립의 경험 의존', desc: '중소형 숙박업의 전문 RM 인력 부족 심화. 데이터보다 담당자 경험에 의존, 인력 교체 시 성과 변동 리스크 발생' },
  { num: '02', title: '데이터 분산 및 해석 부담', desc: 'OTA, 예약, 채널, 취소율 등 데이터가 여러 곳에 분산. 분석 결과가 실행 가능한 전략 지침으로 직결되지 않아 현장 적용에 한계' },
  { num: '03', title: '기존 RMS 도입 장벽', desc: '기존 솔루션은 높은 도입 비용과 복잡한 운영 난이도로 대형 호텔 위주 설계. 중소형 호텔이 접근하기 어려운 비용 구조' },
  { num: '04', title: '자동 의사결정의 부재', desc: 'AI 도입은 확대되나 단순 예측·분석 수준에 머무름. 판매 전략 생성과 실행 단계가 분리되어 운영 효율성을 충분히 끌어올리지 못함' },
]

function Problem() {
  const { C } = useTheme()
  return (
    <section id="problem" className="transition-colors duration-500" style={{ background: C.bgSecondary, borderTop: `1px solid ${C.borderDef}` }}>
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <span className="text-xs tracking-widest font-semibold" style={{ color: C.accent }}>PROBLEM</span>
          <h2 className="font-bold mt-3 mb-4" style={{ fontSize: 'clamp(1.75rem,3.5vw,2.5rem)', color: C.textPrimary }}>
            호텔 수익 관리의 <span style={{ color: C.accent }}>4가지 핵심 장벽</span>
          </h2>
          <p className="max-w-xl mx-auto text-sm leading-relaxed" style={{ color: C.textSecond }}>
            국내 숙박업의 85%를 차지하는 중소·독립형 호텔은 여전히 이 장벽 앞에 멈춰 있습니다.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PROBLEMS.map((p, i) => (
            <div key={i} className="flex gap-5 p-6 rounded-2xl transition-all hover:-translate-y-0.5"
              style={{ background: C.bgElevated, border: `1px solid ${C.borderDef}`, boxShadow: C.shadowCard }}>
              <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-bold text-sm"
                style={{ background: C.accentDim, border: C.accentBorder, color: C.accent }}>{p.num}</div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: C.textPrimary }}>{p.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: C.textSecond }}>{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Solution ──────────────────────────────────────────────────────────────────

const SOLUTIONS = [
  { icon: '🤖', num: '01', title: 'AI 객실요금 추천', desc: '머신러닝 기반으로 수요를 예측하고 최적의 객실 요금을 실시간으로 제안하는 알고리즘 탑재' },
  { icon: '📊', num: '02', title: '매출 분석 리포트', desc: 'OCC·ADR·RevPAR 등 핵심 지표 자동 분석. Pick-up 리포트 및 예약 현황, Revenue Forecast 제공' },
  { icon: '🖥️', num: '03', title: '웹 운영 대시보드', desc: '직관적인 요금 캘린더와 추천 요금 승인/반려 기능을 갖춘 관리자 전용 웹 인터페이스' },
  { icon: '🗺️', num: '04', title: '관광 수요 데이터 반영', desc: '단순 예약 데이터뿐만 아니라 지역 행사, 날씨, 관광 트렌드 데이터를 결합한 입체적 가격 전략' },
  { icon: '⚡', num: '05', title: '실행 전략 자동 도출', desc: '가격 조정, 채널 믹스, 재고 Open/Close, 프로모션, LOS 등 분석을 넘어 실행 가능한 액션 플랜 제공' },
]

function Solution() {
  const { C } = useTheme()
  return (
    <section id="solution" className="transition-colors duration-500" style={{ background: C.bgPrimary, borderTop: `1px solid ${C.borderDef}` }}>
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <span className="text-xs tracking-widest font-semibold" style={{ color: C.accent }}>SOLUTION</span>
          <h2 className="font-bold mt-3 mb-4" style={{ fontSize: 'clamp(1.75rem,3.5vw,2.5rem)', color: C.textPrimary }}>
            데이터 기반 의사결정을 위한<br/><span style={{ color: C.accent }}>5가지 핵심 기능</span>
          </h2>
          <p className="text-sm" style={{ color: C.textSecond }}>
            Powered by AI & Reinforcement Learning · NOVASTAY Proprietary Technology
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SOLUTIONS.map((s, i) => (
            <div key={i} className={`p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1 ${i === 4 ? 'sm:col-span-2 lg:col-span-1' : ''}`}
              style={{ background: C.bgElevated, border: `1px solid ${C.borderDef}`, boxShadow: C.shadowCard }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.accentBorder; el.style.boxShadow = C.shadowGlow }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.borderDef; el.style.boxShadow = C.shadowCard }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{s.icon}</span>
                <span className="text-xs font-bold tracking-widest" style={{ color: C.accentSec }}>{s.num}</span>
              </div>
              <h3 className="font-semibold mb-2 text-base" style={{ color: C.accent }}>{s.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: C.textSecond }}>{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Tech stack */}
        <div className="mt-10 p-6 rounded-2xl" style={{ background: C.bgSecondary, border: `1px solid ${C.borderDef}` }}>
          <p className="text-xs font-semibold tracking-wider mb-4 text-center" style={{ color: C.textMuted }}>SYSTEM ARCHITECTURE</p>
          <div className="flex flex-wrap justify-center gap-3">
            {['Cloud Infrastructure (AWS)', 'PMS / 채널매니저 API 연동', 'AI 수요예측 엔진', '요금 추천 알고리즘', 'DB & 고속 캐싱', '관리자 웹 대시보드'].map(t => (
              <span key={t} className="text-xs px-3 py-1.5 rounded-full"
                style={{ border: C.accentBorder, color: C.accent, background: C.accentDim }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Differentiation ───────────────────────────────────────────────────────────

const DIFFS = [
  { title: '경량 SaaS 구조', desc: '무거운 설치 없이 즉시 사용 가능한 웹 기반 경량 플랫폼' },
  { title: '낮은 초기비용·구독형', desc: '초기 투자 부담을 없앤 월 구독 모델로 진입장벽 해소' },
  { title: '실무 중심 기능', desc: '복잡한 이론보다 현장 담당자가 실제 필요한 기능 위주 설계' },
  { title: '지역 관광 수요 연계', desc: '호텔 주변 행사, 날씨, 관광 트렌드 데이터를 가격에 반영' },
  { title: '전략 자동화', desc: '채널별, 객실 타입별, 시즌별 최적 판매 전략 자동 생성' },
  { title: '실시간 인벤토리 관리', desc: 'PMS 연동을 통해 실시간으로 재고 및 요금 동기화' },
]

function Differentiation() {
  const { C } = useTheme()
  return (
    <section className="transition-colors duration-500" style={{ background: C.bgSecondary, borderTop: `1px solid ${C.borderDef}` }}>
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-xs tracking-widest font-semibold" style={{ color: C.accent }}>VS GLOBAL RMS</span>
            <h2 className="font-bold mt-3 mb-4" style={{ fontSize: 'clamp(1.5rem,3vw,2.25rem)', color: C.textPrimary }}>
              IDeaS·Duetto와 다른<br/><span style={{ color: C.accent }}>NOVASTAY 차별화</span>
            </h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: C.textSecond }}>
              글로벌 RMS(IDeaS, Duetto, Atomize, BEONx)는 높은 도입 비용과 복잡한 운영으로
              대형 체인 호텔 중심 설계. NOVASTAY는 국내 중소·독립 호텔을 위한 경량 솔루션입니다.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: C.accentDim, border: C.accentBorder, color: C.accent }}>
              ✓ 국내 85% 중소·독립 호텔 특화
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {DIFFS.map((d, i) => (
              <div key={i} className="p-4 rounded-xl" style={{ background: C.bgElevated, border: `1px solid ${C.borderDef}`, boxShadow: C.shadowCard }}>
                <p className="font-semibold text-xs mb-1" style={{ color: C.accent }}>{d.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: C.textSecond }}>{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function Stats() {
  const { C } = useTheme()
  const stats = [
    { num: '+14.9%p', label: 'OCC 개선 실증', sub: '2024 62.0% → 2025 76.9%' },
    { num: '+19.3%',  label: '객실 매출 성장', sub: '23.8억 → 28.4억 (실증)' },
    { num: '85%',     label: '중소·독립 호텔', sub: '국내 숙박업 시장 대다수' },
    { num: '30.8억+', label: '목표 누적 매출', sub: '2026-2030 성장 계획' },
  ]
  return (
    <section className="transition-colors duration-500" style={{ background: C.bgPrimary, borderTop: `1px solid ${C.borderDef}`, borderBottom: `1px solid ${C.borderDef}` }}>
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <div key={i} className="text-center">
              <p className="font-bold mb-1" style={{ fontSize: 'clamp(1.75rem,3.5vw,2.5rem)', color: C.accent }}>{s.num}</p>
              <p className="font-medium text-sm" style={{ color: C.textPrimary }}>{s.label}</p>
              <p className="text-xs mt-0.5 leading-snug" style={{ color: C.textMuted }}>{s.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Pricing ───────────────────────────────────────────────────────────────────

function Pricing() {
  const { isDark, C } = useTheme()
  const plans = [
    {
      name: '기본형 구독',
      badge: 'Most Popular',
      price: '₩500,000',
      period: '/ 월',
      desc: '월 단위 결제',
      features: ['핵심 지표 분석 (OCC, ADR, RevPAR)', 'Pick-up 리포트 및 예약 현황', 'Revenue Forecast (매출 예측)', 'AI 객실 요금 추천 (무제한)'],
      cta: '무료 상담 신청',
      highlight: true,
    },
    {
      name: '초기 세팅비',
      badge: '1회 납부',
      price: '₩3,000,000',
      period: '/ 1회',
      desc: 'One-time Setup Fee',
      features: ['호텔 데이터 정비 및 표준화', 'PMS/Channel Manager 연동', '초기 시스템 최적화', '담당자 교육'],
      cta: '도입 문의',
      highlight: false,
    },
    {
      name: '성과 인센티브',
      badge: '성과 연동형',
      price: '20%',
      period: '성장 공유',
      desc: '전년 대비 매출 증가분',
      features: ['성과가 있을 때만 발생', '리스크 최소화 구조', '파트너십 강화', '동반 성장 모델'],
      cta: '상담 예약',
      highlight: false,
    },
  ]
  return (
    <section id="pricing" className="transition-colors duration-500" style={{ background: C.bgSecondary, borderTop: `1px solid ${C.borderDef}` }}>
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <span className="text-xs tracking-widest font-semibold" style={{ color: C.accent }}>PRICING</span>
          <h2 className="font-bold mt-3 mb-4" style={{ fontSize: 'clamp(1.75rem,3.5vw,2.5rem)', color: C.textPrimary }}>
            합리적인 도입 비용과<br/><span style={{ color: C.accent }}>성과 기반 성장 모델</span>
          </h2>
          <p className="text-sm" style={{ color: C.textSecond }}>* 부가세(VAT) 별도</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((p, i) => (
            <div key={i} className="relative p-7 rounded-2xl flex flex-col transition-all hover:-translate-y-1"
              style={{ background: p.highlight ? (isDark ? 'rgba(0,229,160,0.06)' : '#FFFFFF') : C.bgElevated, border: `${p.highlight ? '2px' : '1px'} solid ${p.highlight ? C.accentBorder : C.borderDef}`, boxShadow: p.highlight ? C.shadowGlow : C.shadowCard }}>
              {p.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider"
                style={{ background: C.gradCta, color: '#0A0A0A' }}>{p.badge}</div>}
              {!p.highlight && <span className="text-[10px] font-semibold tracking-wider mb-3 block" style={{ color: C.textMuted }}>{p.badge}</span>}
              <h3 className="font-bold mb-1 mt-2" style={{ color: C.textPrimary }}>{p.name}</h3>
              <p className="text-xs mb-5" style={{ color: C.textMuted }}>{p.desc}</p>
              <div className="mb-6">
                <span className="font-bold" style={{ fontSize: 'clamp(1.5rem,3vw,2rem)', color: p.highlight ? C.accent : C.textPrimary }}>{p.price}</span>
                <span className="text-sm ml-1" style={{ color: C.textMuted }}>{p.period}</span>
              </div>
              <ul className="space-y-2.5 mb-8 flex-1">
                {p.features.map((f, fi) => (
                  <li key={fi} className="flex items-start gap-2 text-sm" style={{ color: C.textSecond }}>
                    <span style={{ color: C.accent, flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <a href="#contact" className="text-center py-3 rounded-xl font-semibold text-sm transition-all hover:-translate-y-0.5"
                style={p.highlight ? { background: C.gradCta, color: '#0A0A0A', boxShadow: C.shadowGlow } : { border: `1px solid ${C.accentBorder}`, color: C.accent, background: C.accentDim }}>
                {p.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Roadmap ───────────────────────────────────────────────────────────────────

const PHASES = [
  { phase: 'Phase 01', period: '2025.01 ~ 04', title: '서비스 기반 구축', items: ['데이터 구조 및 분석 체계 설계', '제품 서비스 아키텍처 설계', '핵심 기술 지식재산권(특허) 출원 협의'] },
  { phase: 'Phase 02', period: '2025.05 ~ 08', title: '제품 개발 및 검증', items: ['MVP 및 핵심 기능 개발', '수요예측, 요금추천, 전략리포트', '시범 호텔 적용 및 성능 검증', '사용자 피드백 수집 및 개선'] },
  { phase: 'Phase 03', period: '2026.11 ~ 27.02', title: '상용화 준비', items: ['기능 고도화 및 서비스 안정화', '사용자 편의성(UI/UX) 개선', '조기 고객 확보 및 시장 프로모션'] },
]

const STRATEGIES = [
  { stage: '초기 진입', tag: 'Entry', icon: '🚀', title: '기존 및 틈새시장 공략', target: '객실 30~150실 중소·독립 호텔 / 전문 RM 부재 사업장', points: ['전문 인력 없이도 가능한 자동화 강조', '객단가 상승 및 매출 개선 즉각적 효과 입증', '합리적 비용 구독 모델로 진입 장벽 제거'] },
  { stage: '시장 확장', tag: 'Scale-up', icon: '📈', title: 'B2B 파트너십', target: '위탁 운영사 / 숙박 컨설팅사 / 다수 호텔 관리 기업', points: ['단일 계약으로 복수 호텔 확보 (Lock-in)', '통합 관리 대시보드로 운영 효율성 제고', '성공 사례 기반 신뢰도 확보'] },
  { stage: '고도화·글로벌', tag: 'Global', icon: '🌏', title: '시장 지배력 확대', target: '체인 호텔 / 지역 그룹 / 해외 중소형 호텔', points: ['AI 고도화 및 개인화 마케팅 연동', '글로벌 PMS 연동 확대 및 다국어 지원', '아시아 시장부터 글로벌 SaaS 진출'] },
]

function Roadmap() {
  const { C } = useTheme()
  return (
    <section id="roadmap" className="transition-colors duration-500" style={{ background: C.bgPrimary, borderTop: `1px solid ${C.borderDef}` }}>
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <span className="text-xs tracking-widest font-semibold" style={{ color: C.accent }}>ROADMAP</span>
          <h2 className="font-bold mt-3 mb-4" style={{ fontSize: 'clamp(1.75rem,3.5vw,2.5rem)', color: C.textPrimary }}>
            단계별 개발 및 <span style={{ color: C.accent }}>시장 진입 전략</span>
          </h2>
        </div>

        {/* Development phases */}
        <div className="grid md:grid-cols-3 gap-5 mb-16">
          {PHASES.map((p, i) => (
            <div key={i} className="p-6 rounded-2xl relative overflow-hidden" style={{ background: C.bgElevated, border: `1px solid ${C.borderDef}`, boxShadow: C.shadowCard }}>
              <div className="text-xs font-bold tracking-widest mb-1" style={{ color: C.accent }}>{p.phase}</div>
              <div className="text-xs mb-3" style={{ color: C.textMuted }}>{p.period}</div>
              <h3 className="font-semibold mb-3" style={{ color: C.textPrimary }}>{p.title}</h3>
              <ul className="space-y-1.5">
                {p.items.map((item, ii) => (
                  <li key={ii} className="flex items-start gap-2 text-xs" style={{ color: C.textSecond }}>
                    <span style={{ color: C.accent, flexShrink: 0 }}>·</span>{item}
                  </li>
                ))}
              </ul>
              <div className="absolute top-4 right-4 text-2xl font-black opacity-5" style={{ color: C.accent }}>0{i+1}</div>
            </div>
          ))}
        </div>

        {/* Market strategy */}
        <div className="grid md:grid-cols-3 gap-5">
          {STRATEGIES.map((s, i) => (
            <div key={i} className="p-6 rounded-2xl" style={{ background: C.bgSecondary, border: `1px solid ${C.borderDef}`, boxShadow: C.shadowCard }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{s.icon}</span>
                <span className="text-xs font-bold tracking-widest" style={{ color: C.accentSec }}>{s.stage}</span>
              </div>
              <h3 className="font-semibold mb-1" style={{ color: C.textPrimary }}>{s.title}</h3>
              <p className="text-xs mb-4 leading-snug" style={{ color: C.textMuted }}>{s.target}</p>
              <ul className="space-y-1.5">
                {s.points.map((pt, pi) => (
                  <li key={pi} className="flex items-start gap-2 text-xs" style={{ color: C.textSecond }}>
                    <span style={{ color: C.accent, flexShrink: 0 }}>✓</span>{pt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Contact ───────────────────────────────────────────────────────────────────

function Contact() {
  const { C } = useTheme()
  const [form, setForm] = useState({ name: '', email: '', hotel: '', message: '' })
  const [sent, setSent] = useState(false)
  const iStyle: React.CSSProperties = { width: '100%', background: C.bgElevated, border: `1px solid ${C.borderDef}`, borderRadius: 10, padding: '11px 16px', color: C.textPrimary, fontSize: 14, outline: 'none' }
  const onF = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.target.style.borderColor = C.accent; e.target.style.boxShadow = `0 0 0 3px ${C.accentDim}` }
  const onB = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.target.style.borderColor = C.borderDef; e.target.style.boxShadow = 'none' }

  return (
    <section id="contact" className="transition-colors duration-500" style={{ background: C.bgPrimary, borderTop: `1px solid ${C.borderDef}` }}>
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <span className="text-xs tracking-widest font-semibold" style={{ color: C.accent }}>CONTACT</span>
        <h2 className="font-bold mt-3 mb-2" style={{ fontSize: 'clamp(1.5rem,3vw,2.25rem)', color: C.textPrimary }}>무료 상담 신청</h2>
        <p className="text-sm mb-2" style={{ color: C.textSecond }}>전문 컨설턴트가 귀 호텔의 수익 개선 가능성을 분석해드립니다.</p>
        <p className="flex items-center justify-center gap-2 text-xs mb-10" style={{ color: C.textMuted }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
          novastay@novastay.co.kr · 경남 진주시 북장대로21번길 5-3
        </p>

        {sent ? (
          <div className="py-12 rounded-2xl" style={{ background: C.bgElevated, border: `1px solid ${C.borderDef}`, boxShadow: C.shadowCard }}>
            <div className="text-4xl mb-4">✅</div>
            <p className="font-semibold text-lg" style={{ color: C.textPrimary }}>상담 신청이 완료됐습니다!</p>
            <p className="text-sm mt-2" style={{ color: C.textSecond }}>빠른 시일 내에 연락드리겠습니다.</p>
          </div>
        ) : (
          <form className="space-y-4 text-left p-8 rounded-2xl" onSubmit={e => { e.preventDefault(); setSent(true) }}
            style={{ background: C.bgElevated, border: `1px solid ${C.borderDef}`, boxShadow: C.shadowElev }}>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium mb-1.5 block" style={{ color: C.textSecond }}>담당자명 *</label>
                <input required style={iStyle} placeholder="홍길동" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} onFocus={onF} onBlur={onB} /></div>
              <div><label className="text-xs font-medium mb-1.5 block" style={{ color: C.textSecond }}>이메일 *</label>
                <input required type="email" style={iStyle} placeholder="name@hotel.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} onFocus={onF} onBlur={onB} /></div>
            </div>
            <div><label className="text-xs font-medium mb-1.5 block" style={{ color: C.textSecond }}>호텔명</label>
              <input style={iStyle} placeholder="OO 호텔 (객실 수)" value={form.hotel} onChange={e => setForm(f => ({ ...f, hotel: e.target.value }))} onFocus={onF} onBlur={onB} /></div>
            <div><label className="text-xs font-medium mb-1.5 block" style={{ color: C.textSecond }}>문의 내용</label>
              <textarea rows={4} style={{ ...iStyle, resize: 'none' }} placeholder="현재 수익 관리 현황 및 문의 사항을 입력해주세요" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} onFocus={onF} onBlur={onB} /></div>
            <button type="submit" className="w-full py-4 rounded-xl font-semibold text-sm tracking-widest transition-all hover:-translate-y-0.5"
              style={{ background: C.gradCta, color: '#0A0A0A', boxShadow: C.shadowGlow }}>무료 상담 신청하기</button>
          </form>
        )}
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  const { C } = useTheme()
  return (
    <footer className="transition-colors duration-500" style={{ background: C.bgTertiary, borderTop: `1px solid ${C.borderDef}` }}>
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/Novastay_Logo.png" alt="NOVASTAY" style={{ height: 28, objectFit: 'contain' }} />
            <div className="border-l pl-3" style={{ borderColor: C.borderDef }}>
              <p className="text-xs" style={{ color: C.textSecond }}>주식회사 노바스테이 · 대표 문병윤</p>
              <p className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>사업자번호 286-87-03688 · 경남 진주시 북장대로21번길 5-3</p>
            </div>
          </div>
          <p className="text-xs text-center" style={{ color: C.textMuted }}>© 2026 NOVASTAY. All rights reserved.</p>
          <div className="flex items-center gap-3">
            <a href="mailto:novastay@novastay.co.kr" className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-75" style={{ color: C.accent }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
              novastay@novastay.co.kr
            </a>
            <Link href="/login" className="text-xs font-medium px-4 py-2 rounded-full transition-all hover:-translate-y-px"
              style={{ border: `1px solid ${C.borderDef}`, color: C.accent, background: C.bgElevated }}>
              관리자 로그인 →
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('landing-theme')
    if (saved === 'light') setIsDark(false)
  }, [])

  const toggle = () => setIsDark(v => {
    const next = !v
    localStorage.setItem('landing-theme', next ? 'dark' : 'light')
    return next
  })

  const C = isDark ? DARK : LIGHT

  return (
    <ThemeCtx.Provider value={{ isDark, toggle, C }}>
      <div style={{ fontFamily: '"DM Sans", Inter, sans-serif', background: C.bgPrimary, transition: 'background 0.5s' }}>
        <Nav />
        <Hero />
        <Problem />
        <Solution />
        <Differentiation />
        <Stats />
        <Pricing />
        <Roadmap />
        <Contact />
        <Footer />
      </div>
    </ThemeCtx.Provider>
  )
}
