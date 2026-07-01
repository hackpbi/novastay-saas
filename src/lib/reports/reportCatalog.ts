// Report 카탈로그 — 1차 정적 데이터. 추후 DB(c0X_report_catalog 등)로 전환 시
// getReportCatalog()만 비동기/RPC로 교체하면 됨 (호출부는 그대로).

export type ReportCategory = 'daily' | 'forecast' | 'segment' | 'rate' | 'perf' | 'exec'

export interface ReportCatalogItem {
  id:           number
  slug:         string          // 라우팅용 (예: 'pickup-report')
  name:         string
  desc:         string
  category:     ReportCategory
  icon:         string          // 아이콘 키 (reportIcons 매핑)
  fav:          boolean
  updatedLabel: string          // 예: '오늘', '3일 전'
  path?:        string          // 전용 페이지가 구현된 경우 명시, 없으면 /reports/[slug] placeholder로 이동
}

// 카테고리 칩 (all = 전체)
export const REPORT_CATEGORIES: { key: 'all' | ReportCategory; label: string }[] = [
  { key: 'all',      label: '전체' },
  { key: 'daily',    label: '일일 운영' },
  { key: 'forecast', label: '예측/예산' },
  { key: 'segment',  label: '세그먼트/채널' },
  { key: 'rate',     label: '가격 전략' },
  { key: 'perf',     label: '수익성' },
  { key: 'exec',     label: '경영 요약' },
]

// 카테고리별 보조 팔레트 (mint #00E5A0는 핵심 액션 전용이라 뱃지에 미사용)
export const CATEGORY_META: Record<ReportCategory, { label: string; color: string }> = {
  daily:    { label: '일일 운영',     color: '#5B8DEF' },  // blue
  forecast: { label: '예측/예산',     color: '#A78BFA' },  // violet
  segment:  { label: '세그먼트/채널', color: '#FBBF24' },  // amber
  rate:     { label: '가격 전략',     color: '#FB7185' },  // rose
  perf:     { label: '수익성',        color: '#22D3EE' },  // cyan
  exec:     { label: '경영 요약',     color: '#94A3B8' },  // slate
}

const CATALOG: ReportCatalogItem[] = [
  // ── 일일 운영 ──
  { id: 1,  slug: 'pickup-report',     name: 'Pickup 리포트',       desc: '일자별 OTB 픽업 추이와 세그먼트별 증감을 한눈에 확인합니다.', category: 'daily',    icon: 'trending-up',   fav: true,  updatedLabel: '오늘' },
  { id: 2,  slug: 'otb-daily',         name: 'OTB 일일 현황',       desc: '당일 기준 객실 점유·매출·ADR 스냅샷과 전일 대비 변화.',        category: 'daily',    icon: 'clipboard',     fav: false, updatedLabel: '오늘' },
  { id: 3,  slug: 'reservations-log',  name: '예약 변동 로그',      desc: '신규/취소/변경 예약 내역을 시간순으로 추적합니다.',            category: 'daily',    icon: 'list',          fav: false, updatedLabel: '어제' },

  // ── 예측/예산 ──
  { id: 4,  slug: 'forecast-accuracy', name: 'Forecast 정확도',     desc: '예측 대비 실적 오차율을 기간별로 분석합니다.',                category: 'forecast', icon: 'target',        fav: true,  updatedLabel: '3일 전' },
  { id: 5,  slug: 'budget-vs-actual',  name: 'Budget vs Actual',    desc: '예산 대비 실적/예측 갭을 월별로 비교합니다.',                  category: 'forecast', icon: 'scale',         fav: false, updatedLabel: '1주 전' },
  { id: 6,  slug: 'demand-calendar',   name: '수요 캘린더',         desc: '향후 픽업 페이스 기반 고/저수요 일자를 시각화합니다.',         category: 'forecast', icon: 'calendar',      fav: false, updatedLabel: '오늘' },

  // ── 세그먼트/채널 ──
  { id: 7,  slug: 'segment-mix',       name: '세그먼트 믹스',       desc: '세그먼트별 R/N·ADR·매출 비중과 6개월 추이.',                  category: 'segment',  icon: 'pie',           fav: true,  updatedLabel: '오늘', path: '/reports/segment-mix' },
  { id: 8,  slug: 'channel-production', name: '채널 생산성',        desc: 'Direct/OTA 채널별 생산 비중과 수수료 영향 분석.',             category: 'segment',  icon: 'share',         fav: false, updatedLabel: '2일 전' },
  { id: 9,  slug: 'account-pickup',    name: '어카운트 픽업',       desc: '주요 거래처별 픽업과 전년 대비 성장률.',                       category: 'segment',  icon: 'users',         fav: false, updatedLabel: '3일 전' },

  // ── 가격 전략 ──
  { id: 10, slug: 'rate-strategy',     name: 'Rate 전략',           desc: 'BAR/ADR 시뮬레이션과 권장 단가 의사결정 지원.',               category: 'rate',     icon: 'tag',           fav: true,  updatedLabel: '오늘' },
  { id: 11, slug: 'competitor-rates',  name: '경쟁사 단가',         desc: '경쟁 호텔 단가 모니터링과 포지셔닝 비교.',                     category: 'rate',     icon: 'chart',         fav: false, updatedLabel: '1주 전' },

  // ── 수익성 ──
  { id: 12, slug: 'revpar-trend',      name: 'RevPAR 추이',         desc: 'RevPAR·점유율·ADR의 기간별 동향과 전년 비교.',                category: 'perf',     icon: 'bar',           fav: false, updatedLabel: '어제' },
  { id: 13, slug: 'profitability',     name: '수익성 분석',         desc: '채널/세그먼트별 순기여(수수료 차감) 수익성 평가.',             category: 'perf',     icon: 'dollar',        fav: false, updatedLabel: '1주 전' },

  // ── 경영 요약 ──
  { id: 14, slug: 'executive-summary', name: '경영 요약',           desc: '핵심 KPI를 한 장으로 요약한 경영진용 대시보드.',               category: 'exec',     icon: 'file',          fav: true,  updatedLabel: '오늘' },
]

// 데이터 fetch 추상화 — 추후 DB 전환 시 이 함수만 교체
export function getReportCatalog(): ReportCatalogItem[] {
  return CATALOG
}
