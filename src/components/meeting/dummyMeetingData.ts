// Revenue Meeting — 1차 더미 데이터 (RPC 연동 전)
// monthKey('YYYY-MM') 시드로 안정적(결정적)인 값 생성 — 리렌더 시 값이 흔들리지 않음

// ── seeded PRNG ─────────────────────────────────────────────────────────────────
function seedFromStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const randInt = (rng: () => number, min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min

// ── monthKey 표시 라벨 ───────────────────────────────────────────────────────────
export function monthKeyLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  return `${y}년 ${parseInt(m)}월`
}

// ── 월별 요약 ────────────────────────────────────────────────────────────────────
export interface MonthlySummary {
  monthKey: string
  occ: { value: number; vsBudget: number; vsLy: number }
  rn:  { value: number; vsBudget: number; vsLy: number }
  adr: { value: number; vsBudget: number; vsLy: number }
  rev: { value: number; vsBudget: number; vsLy: number }
}

export function getDummyMonthlySummary(monthKey: string): MonthlySummary {
  const rng = mulberry32(seedFromStr('sum:' + monthKey))
  const occ = randInt(rng, 62, 94)
  const rn  = randInt(rng, 600, 1200)
  const adr = randInt(rng, 95, 180) * 1000
  const rev = rn * adr
  return {
    monthKey,
    occ: { value: occ, vsBudget: randInt(rng, -8, 9),  vsLy: randInt(rng, -6, 11) },
    rn:  { value: rn,  vsBudget: randInt(rng, -120, 160), vsLy: randInt(rng, -90, 200) },
    adr: { value: adr, vsBudget: randInt(rng, -12, 15) * 1000, vsLy: randInt(rng, -8, 18) * 1000 },
    rev: { value: rev, vsBudget: randInt(rng, -30, 40) * 1_000_000, vsLy: randInt(rng, -20, 50) * 1_000_000 },
  }
}

// ── 액션아이템 ───────────────────────────────────────────────────────────────────
export type ActionStatus = 'in_progress' | 'delayed' | 'done'
export interface ActionItem {
  id:       string
  title:    string
  assignee: string
  dueDate:  string   // 'YYYY-MM-DD'
  status:   ActionStatus
}

const TITLES = [
  'OTA 프로모션 단가 재검토', 'Group 블록 픽업 확인', '주말 BAR 인상 적용',
  'Corp 계약요율 갱신 협의', 'Member 등급 혜택 개편', '경쟁사 단가 모니터링',
  '패키지 상품 ADR 조정', 'No-show 정책 재정비',
]
const NAMES = ['김지원', '이수민', '박서준', '최예린', '정도윤']

export function getDummyActionItems(monthKey: string): ActionItem[] {
  const rng = mulberry32(seedFromStr('act:' + monthKey))
  const count = randInt(rng, 4, 6)
  const statuses: ActionStatus[] = ['in_progress', 'delayed', 'done']
  const [y, m] = monthKey.split('-').map(Number)
  const items: ActionItem[] = []
  for (let i = 0; i < count; i++) {
    const status = statuses[randInt(rng, 0, 2)]
    const day = randInt(rng, 1, 27)
    items.push({
      id:       `${monthKey}-act-${i}`,
      title:    TITLES[randInt(rng, 0, TITLES.length - 1)],
      assignee: NAMES[randInt(rng, 0, NAMES.length - 1)],
      dueDate:  `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      status,
    })
  }
  return items
}

// ── 세그먼트 테이블 ──────────────────────────────────────────────────────────────
export interface DummySegmentRow {
  id:      string
  name:    string
  isBold:  boolean
  indent:  boolean
  otb:     { rn: number; adr: number; rev: number }
  fcst:    { rn: number; adr: number; rev: number }
  budget:  { rn: number; adr: number; rev: number }
  lyMatch: { rn: number; adr: number; rev: number }   // 전년 동기간
  lyDate:  { rn: number; adr: number; rev: number }   // 전년 일자
}

type Cell = { rn: number; adr: number; rev: number }
const cell = (rn: number, adr: number): Cell => ({ rn, adr, rev: rn * adr })
const sumCells = (cells: Cell[]): Cell => {
  const rn = cells.reduce((s, c) => s + c.rn, 0)
  const rev = cells.reduce((s, c) => s + c.rev, 0)
  return { rn, rev, adr: rn > 0 ? Math.round(rev / rn) : 0 }
}

// 트리 정의 (이름만 — 값은 시드 생성)
const TREE: { name: string; children?: string[] }[] = [
  { name: 'Corp. FIT', children: ['Non Contracted', 'Contracted'] },
  { name: 'Direct',    children: ['Room Only', 'Package'] },
  { name: 'TA',        children: ['IOTA', 'DOTA'] },
  { name: 'Group',     children: ['MICE', 'Tour'] },
  { name: 'Member' },   // mid (자식 없음)
  { name: 'Comp' },     // mid
]

function genCell(rng: () => number): Cell {
  return cell(randInt(rng, 0, 220), randInt(rng, 80, 200) * 1000)
}

export function getDummySegmentTable(monthKey: string): DummySegmentRow[] {
  const rng = mulberry32(seedFromStr('seg:' + monthKey))
  const rows: DummySegmentRow[] = []

  for (const top of TREE) {
    if (top.children && top.children.length > 0) {
      // 자식 먼저 생성 → 부모는 합산
      const childRows: DummySegmentRow[] = top.children.map((cn, ci) => ({
        id: `${monthKey}-${top.name}-${cn}`,
        name: cn,
        isBold: false,
        indent: true,
        otb:     genCell(rng),
        fcst:    genCell(rng),
        budget:  genCell(rng),
        lyMatch: genCell(rng),
        lyDate:  genCell(rng),
      }))
      const parent: DummySegmentRow = {
        id: `${monthKey}-${top.name}`,
        name: top.name,
        isBold: true,
        indent: false,
        otb:     sumCells(childRows.map(r => r.otb)),
        fcst:    sumCells(childRows.map(r => r.fcst)),
        budget:  sumCells(childRows.map(r => r.budget)),
        lyMatch: sumCells(childRows.map(r => r.lyMatch)),
        lyDate:  sumCells(childRows.map(r => r.lyDate)),
      }
      rows.push(parent, ...childRows)
    } else {
      // mid — 자체 값
      rows.push({
        id: `${monthKey}-${top.name}`,
        name: top.name,
        isBold: true,
        indent: false,
        otb:     genCell(rng),
        fcst:    genCell(rng),
        budget:  genCell(rng),
        lyMatch: genCell(rng),
        lyDate:  genCell(rng),
      })
    }
  }
  return rows
}

// ── 추가 4개 섹션 (픽업 / 지시사항 / 온북 / 전망) ─────────────────────────────────
export type PickupDay = {
  date: string   // 'M/DD (요)'
  rn: number     // 양수/음수
}

export type Directive = {
  id: string
  text: string
}

export type OtbDay = {
  day: string    // '1' ~ '31' (남은 날짜)
  rn: number     // 온북 객실수
}

export type ForecastSeg = {
  seg: string
  fcstOcc: number
  fcstRn: number
  gapVsBudget: number  // %p (양수=초과, 음수=미달)
}

export type SectionExtras = {
  pickup7: PickupDay[]
  directives: Directive[]
  otbDays: OtbDay[]         // 이번 달 남은 날짜별 OTB
  otbKpi: { occ: number; adr: number; rev: number; lyOcc: number; lyAdr: number; lyRev: number }
  fcstKpi: { fcstOcc: number; fcstRev: number; vsBudgetOccPp: number; vsBudgetRevPct: number }
  fcstSegs: ForecastSeg[]
}

export function getDummySectionExtras(monthKey: string): SectionExtras {
  const extras: Record<string, SectionExtras> = {
    '2026-07': {
      pickup7: [
        { date: '6/30 (월)', rn: 18 },
        { date: '7/01 (화)', rn: 24 },
        { date: '7/02 (수)', rn: 9  },
        { date: '7/03 (목)', rn: -3 },
        { date: '7/04 (금)', rn: 31 },
        { date: '7/05 (토)', rn: 12 },
        { date: '7/06 (일)', rn: 7  },
      ],
      directives: [
        { id: 'd1', text: 'FIT 세그먼트 ADR 목표 190K 유지 — 할인 자제' },
        { id: 'd2', text: '8월 성수기 대비 GRP 조기 마감 검토 필요' },
        { id: 'd3', text: 'OTA 노출 순위 점검 — 주말 BAR 조정' },
        { id: 'd4', text: '지역 축제 기간 패키지 상품 운영 여부 결정' },
      ],
      otbKpi: { occ: 72.4, adr: 183400, rev: 288000000, lyOcc: 69.3, lyAdr: 187000, lyRev: 285000000 },
      otbDays: [
        { day: '7', rn: 38 }, { day: '8', rn: 44 }, { day: '9', rn: 52 },
        { day: '10', rn: 61 }, { day: '11', rn: 68 }, { day: '12', rn: 65 },
        { day: '13', rn: 59 }, { day: '14', rn: 71 }, { day: '15', rn: 48 },
        { day: '16', rn: 42 }, { day: '17', rn: 38 }, { day: '18', rn: 35 },
        { day: '19', rn: 30 }, { day: '20', rn: 27 }, { day: '21', rn: 23 },
        { day: '22', rn: 58 }, { day: '23', rn: 62 }, { day: '24', rn: 55 },
        { day: '25', rn: 40 }, { day: '26', rn: 33 }, { day: '27', rn: 28 },
        { day: '28', rn: 22 }, { day: '29', rn: 18 }, { day: '30', rn: 15 },
        { day: '31', rn: 12 },
      ],
      fcstKpi: { fcstOcc: 75.2, fcstRev: 298000000, vsBudgetOccPp: 2.8, vsBudgetRevPct: 3.5 },
      fcstSegs: [
        { seg: 'FIT',  fcstOcc: 68.2, fcstRn: 1478, gapVsBudget: 5.1  },
        { seg: 'GRP',  fcstOcc: 45.0, fcstRn: 975,  gapVsBudget: -3.2 },
        { seg: 'OTA',  fcstOcc: 82.5, fcstRn: 1789, gapVsBudget: 7.8  },
        { seg: 'Corp', fcstOcc: 61.3, fcstRn: 1328, gapVsBudget: -1.5 },
      ],
    },
    '2026-08': {
      pickup7: [
        { date: '7/30 (목)', rn: 22 }, { date: '7/31 (금)', rn: 35 },
        { date: '8/01 (토)', rn: 41 }, { date: '8/02 (일)', rn: 18 },
        { date: '8/03 (월)', rn: 9  }, { date: '8/04 (화)', rn: 14 },
        { date: '8/05 (수)', rn: 28 },
      ],
      directives: [
        { id: 'd1', text: '성수기 최소 판매 ADR 220K 이상 유지' },
        { id: 'd2', text: '광복절 연휴 NO-SHOW 정책 강화' },
        { id: 'd3', text: '조식 포함 패키지 노출 채널 확대' },
      ],
      otbKpi: { occ: 85.1, adr: 210000, rev: 387000000, lyOcc: 83.3, lyAdr: 203000, lyRev: 368000000 },
      otbDays: Array.from({ length: 26 }, (_, i) => ({
        day: String(i + 6), rn: Math.round(50 + Math.random() * 22),
      })),
      fcstKpi: { fcstOcc: 88.0, fcstRev: 420000000, vsBudgetOccPp: 3.0, vsBudgetRevPct: 6.2 },
      fcstSegs: [
        { seg: 'FIT',  fcstOcc: 80.0, fcstRn: 1730, gapVsBudget: 4.0  },
        { seg: 'GRP',  fcstOcc: 60.0, fcstRn: 1300, gapVsBudget: -1.0 },
        { seg: 'OTA',  fcstOcc: 92.0, fcstRn: 1994, gapVsBudget: 8.0  },
        { seg: 'Corp', fcstOcc: 70.0, fcstRn: 1516, gapVsBudget: 2.5  },
      ],
    },
    '2026-09': {
      pickup7: [
        { date: '8/31 (월)', rn: 5  }, { date: '9/01 (화)', rn: 8  },
        { date: '9/02 (수)', rn: -2 }, { date: '9/03 (목)', rn: 12 },
        { date: '9/04 (금)', rn: 19 }, { date: '9/05 (토)', rn: 15 },
        { date: '9/06 (일)', rn: 6  },
      ],
      directives: [
        { id: 'd1', text: '추석 연휴 특가 패키지 준비 (조식 포함)' },
        { id: 'd2', text: '비수기 대비 Corp 볼륨 계약 갱신 협의' },
      ],
      otbKpi: { occ: 61.2, adr: 175000, rev: 232000000, lyOcc: 62.7, lyAdr: 173000, lyRev: 234000000 },
      otbDays: Array.from({ length: 24 }, (_, i) => ({
        day: String(i + 7), rn: Math.round(28 + Math.random() * 20),
      })),
      fcstKpi: { fcstOcc: 64.0, fcstRev: 245000000, vsBudgetOccPp: -1.0, vsBudgetRevPct: -0.5 },
      fcstSegs: [
        { seg: 'FIT',  fcstOcc: 55.0, fcstRn: 1191, gapVsBudget: -2.0 },
        { seg: 'GRP',  fcstOcc: 40.0, fcstRn: 867,  gapVsBudget: -4.0 },
        { seg: 'OTA',  fcstOcc: 70.0, fcstRn: 1516, gapVsBudget: 2.0  },
        { seg: 'Corp', fcstOcc: 55.0, fcstRn: 1191, gapVsBudget: -1.0 },
      ],
    },
    '2026-10': {
      pickup7: [
        { date: '10/01 (목)', rn: 3 }, { date: '10/02 (금)', rn: 7  },
        { date: '10/03 (토)', rn: 14 }, { date: '10/04 (일)', rn: 5 },
        { date: '10/05 (월)', rn: 2 }, { date: '10/06 (화)', rn: 4  },
        { date: '10/07 (수)', rn: 6 },
      ],
      directives: [
        { id: 'd1', text: '비수기 비용 절감 계획 수립 — HR 협의' },
        { id: 'd2', text: '연말 Corp 계약 갱신 일정 확인' },
      ],
      otbKpi: { occ: 55.0, adr: 165000, rev: 196000000, lyOcc: 57.8, lyAdr: 167000, lyRev: 204000000 },
      otbDays: Array.from({ length: 24 }, (_, i) => ({
        day: String(i + 8), rn: Math.round(20 + Math.random() * 20),
      })),
      fcstKpi: { fcstOcc: 57.0, fcstRev: 200000000, vsBudgetOccPp: -2.0, vsBudgetRevPct: -3.0 },
      fcstSegs: [
        { seg: 'FIT',  fcstOcc: 50.0, fcstRn: 1085, gapVsBudget: -3.0 },
        { seg: 'GRP',  fcstOcc: 35.0, fcstRn: 759,  gapVsBudget: -5.0 },
        { seg: 'OTA',  fcstOcc: 62.0, fcstRn: 1344, gapVsBudget: 1.0  },
        { seg: 'Corp', fcstOcc: 48.0, fcstRn: 1040, gapVsBudget: -2.5 },
      ],
    },
  }

  // fallback
  const fallback = extras['2026-07']
  return extras[monthKey] ?? fallback
}
