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
