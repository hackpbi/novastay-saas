'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Chart from 'chart.js/auto'

interface GMDailyReportModalProps {
  open:    boolean
  onClose: () => void
  hotelId: string
  otbDate: string   // 'YYYY-MM-DD'
}

// 다크/라이트 무관 — 리포트는 항상 라이트 고정 색상
const C = {
  pageBg:       '#ffffff',
  cardBg:       '#f5f5f3',
  border:       '#e1e0d9',
  borderStrong: '#c8c7c0',
  textPrimary:  '#0b0b0b',
  textSecondary:'#4a4a48',
  textMuted:    '#898781',
  overlay:      'rgba(0,0,0,0.75)',
  mint:         '#1d9e75',
  mintBadgeBg:  '#e1f5ee',
  mintBadgeFg:  '#0f6e56',
  red:          '#a32d2d',
  redBadgeBg:   '#fcebeb',
  redBadgeFg:   '#a32d2d',
  blue:         '#2a78d6',
  blueFriSat:   '#3987e5',
  amber:        '#eda100',
  gray:         '#888780',
} as const

// ── 더미 데이터 ────────────────────────────────────────────────────────────────
const DUMMY_3M_PICKUP = [
  {
    month: '7월', label: '7월 (이번 달)',
    occ: '+1.8%p', rn: '+7실', adr: '+2천원', rev: '+82백만',
    occDir: 'up', rnDir: 'up', adrDir: 'up', revDir: 'up',
    segs: [{ name: 'FIT', val: '+5', dir: 'up' }, { name: '법인', val: '+2', dir: 'up' }, { name: 'GRP', val: '±0', dir: 'neu' }],
  },
  {
    month: '8월', label: '8월',
    occ: '+0.6%p', rn: '+3실', adr: '+2천원', rev: '+38백만',
    occDir: 'up', rnDir: 'up', adrDir: 'up', revDir: 'up',
    segs: [{ name: 'FIT', val: '+3', dir: 'up' }, { name: '법인', val: '±0', dir: 'neu' }, { name: 'GRP', val: '±0', dir: 'neu' }],
  },
  {
    month: '9월', label: '9월',
    occ: '-0.4%p', rn: '-2실', adr: '±0', rev: '-30백만',
    occDir: 'dn', rnDir: 'dn', adrDir: 'neu', revDir: 'dn',
    segs: [{ name: 'FIT', val: '±0', dir: 'neu' }, { name: '법인', val: '±0', dir: 'neu' }, { name: 'GRP', val: '-2', dir: 'dn' }],
  },
]

interface AcctRow { name: string; bar: number; barNeg?: boolean; m7: string; m8: string; m9: string; sum: string; sumDir: string }
interface SegBlock { seg: string; total: string; totalDir: string; accounts: AcctRow[] }
const DUMMY_ACCOUNTS: SegBlock[] = [
  {
    seg: 'FIT', total: '+8실', totalDir: 'up',
    accounts: [
      { name: '하나투어', bar: 75, m7: '+3', m8: '+2', m9: '±0', sum: '+5', sumDir: 'up' },
      { name: '모두투어', bar: 30, m7: '+1', m8: '+1', m9: '±0', sum: '+2', sumDir: 'up' },
      { name: '롯데관광', bar: 20, m7: '+1', m8: '±0', m9: '±0', sum: '+1', sumDir: 'up' },
      { name: '인터파크', bar: 15, m7: '±0', m8: '+1', m9: '±0', sum: '+1', sumDir: 'up' },
      { name: '온라인투어', bar: 15, barNeg: true, m7: '±0', m8: '±0', m9: '-1', sum: '-1', sumDir: 'dn' },
    ],
  },
  {
    seg: '법인', total: '+2실', totalDir: 'up',
    accounts: [
      { name: '삼성전자', bar: 60, m7: '+2', m8: '+1', m9: '±0', sum: '+3', sumDir: 'up' },
      { name: '현대건설', bar: 20, m7: '+1', m8: '±0', m9: '±0', sum: '+1', sumDir: 'up' },
      { name: 'LG전자', bar: 15, barNeg: true, m7: '±0', m8: '±0', m9: '-1', sum: '-1', sumDir: 'dn' },
      { name: 'SK하이닉스', bar: 15, barNeg: true, m7: '-1', m8: '±0', m9: '±0', sum: '-1', sumDir: 'dn' },
    ],
  },
  {
    seg: 'GRP', total: '-2실', totalDir: 'dn',
    accounts: [
      { name: '현대자동차', bar: 45, barNeg: true, m7: '±0', m8: '±0', m9: '-2', sum: '-2', sumDir: 'dn' },
    ],
  },
  {
    seg: 'OTA', total: '+3실', totalDir: 'up',
    accounts: [
      { name: '야놀자', bar: 50, m7: '+2', m8: '±0', m9: '+1', sum: '+3', sumDir: 'up' },
      { name: '여기어때', bar: 15, barNeg: true, m7: '-1', m8: '±0', m9: '±0', sum: '-1', sumDir: 'dn' },
    ],
  },
]

const DUMMY_EVENTS = [
  { date: '7/4', day: '금', name: '지역 문화축제', occ: 88.4, occColor: '#2a78d6', pickup: '+12실', pickupDir: 'up', lyOcc: '82.1%' },
  { date: '7/5', day: '토', name: '지역 문화축제 2일차', occ: 92.1, occColor: '#2a78d6', pickup: '+8실', pickupDir: 'up', lyOcc: '88.3%' },
  { date: '8/15', day: '금', name: '광복절', occ: 71.2, occColor: '#eda100', pickup: '+1실', pickupDir: 'neu', lyOcc: '89.4%' },
  { date: '9/6', day: '토', name: '추석 연휴', occ: 42.1, occColor: '#888780', pickup: '-5실', pickupDir: 'dn', lyOcc: '38.2%' },
  { date: '9/20', day: '토', name: '마라톤 대회', occ: 55.3, occColor: '#e24b4a', pickup: '±0실', pickupDir: 'neu', lyOcc: '91.2%' },
]

interface MonthOtb {
  month: string; isTotal?: boolean
  otbOcc: string; otbAdr: string; otbRev: string
  lyOcc: string; lyAdr: string; lyRev: string; lyOccDir: string; lyAdrDir: string; lyRevDir: string
  budOcc: string; budAdr: string; budRev: string
  budOccDiff: string; budAdrDiff: string; budRevDiff: string; budOccDir: string; budAdrDir: string; budRevDir: string
}
const DUMMY_MONTHLY_OTB: MonthOtb[] = [
  {
    month: '7월',
    otbOcc: '74.6%', otbAdr: '165', otbRev: '276',
    lyOcc: 'LY +2.8%p', lyAdr: 'LY +6.1%', lyRev: 'LY +4.3%', lyOccDir: 'up', lyAdrDir: 'up', lyRevDir: 'up',
    budOcc: '70.5%', budAdr: '160', budRev: '255',
    budOccDiff: '대비 +4.1%p', budAdrDiff: '대비 +3.2%', budRevDiff: '대비 +8.2%', budOccDir: 'up', budAdrDir: 'up', budRevDir: 'up',
  },
  {
    month: '8월',
    otbOcc: '61.2%', otbAdr: '158', otbRev: '217',
    lyOcc: 'LY +1.2%p', lyAdr: 'LY +3.4%', lyRev: 'LY +2.1%', lyOccDir: 'up', lyAdrDir: 'up', lyRevDir: 'up',
    budOcc: '59.4%', budAdr: '162', budRev: '212',
    budOccDiff: '대비 +1.8%p', budAdrDiff: '대비 -1.2%', budRevDiff: '대비 +2.4%', budOccDir: 'up', budAdrDir: 'dn', budRevDir: 'up',
  },
  {
    month: '9월',
    otbOcc: '48.3%', otbAdr: '152', otbRev: '165',
    lyOcc: 'LY -0.5%p', lyAdr: 'LY ±0%', lyRev: 'LY -1.8%', lyOccDir: 'dn', lyAdrDir: 'neu', lyRevDir: 'dn',
    budOcc: '51.5%', budAdr: '155', budRev: '175',
    budOccDiff: '대비 -3.2%p', budAdrDiff: '대비 -2.1%', budRevDiff: '대비 -5.4%', budOccDir: 'dn', budAdrDir: 'dn', budRevDir: 'dn',
  },
  {
    month: '합계', isTotal: true,
    otbOcc: '61.4%', otbAdr: '159', otbRev: '658',
    lyOcc: 'LY +1.2%p', lyAdr: 'LY +3.2%', lyRev: 'LY +1.9%', lyOccDir: 'up', lyAdrDir: 'up', lyRevDir: 'up',
    budOcc: '60.5%', budAdr: '159', budRev: '642',
    budOccDiff: '대비 +0.9%p', budAdrDiff: '대비 ±0%', budRevDiff: '대비 +1.7%', budOccDir: 'up', budAdrDir: 'neu', budRevDir: 'up',
  },
]

const DUMMY_YESTERDAY = [
  { label: 'OCC%', value: '82.3%', ly: 'LY +2.8%p', lyDir: 'up' },
  { label: 'R/N',  value: '59실',   ly: 'LY +2실',   lyDir: 'up' },
  { label: 'ADR (천원)',  value: '178', ly: 'LY +6.1%', lyDir: 'up' },
  { label: 'REV (백만)',  value: '10.5',  ly: 'LY -1.3%',  lyDir: 'dn' },
  { label: 'RevPAR (천원)', value: '147', ly: 'LY +9.2%', lyDir: 'up' },
]

const DUMMY_TODAY_OTB = [
  { label: '현재 OCC%', value: '74.6%', sub: '잔여 18실', subDir: 'neu' },
  { label: '예상 ADR',  value: '165', sub: 'LY +4.3%', subDir: 'up' },
  { label: '전일 대비 Pick-up', value: '+7실', sub: '총 +7실', subDir: 'up' },
]

const DUMMY_CHART = {
  labels: ['7/1 화', '7/2 수', '7/3 목', '7/4 금', '7/5 토', '7/6 일', '7/7 월'],
  otb:  [74.6, 68.2, 71.5, 88.4, 92.1, 89.7, 65.3],
  fcst: [78.0, 73.5, 76.2, 91.0, 94.5, 91.2, 68.0],
}

// ── 색상 헬퍼 ──────────────────────────────────────────────────────────────────
const dirColor = (dir: string) => {
  if (dir === 'up') return C.mint
  if (dir === 'dn') return C.red
  return C.textMuted
}
const badgeStyle = (dir: string): React.CSSProperties => {
  if (dir === 'up') return { background: C.mintBadgeBg, color: C.mintBadgeFg, fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 500, whiteSpace: 'nowrap' }
  if (dir === 'dn') return { background: C.redBadgeBg, color: C.redBadgeFg, fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 500, whiteSpace: 'nowrap' }
  return { background: C.cardBg, color: C.textSecondary, fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 500, whiteSpace: 'nowrap', border: `0.5px solid ${C.border}` }
}

const isWeekendLabel = (l: string) => /금|토/.test(l)

// ── 소형 표현 컴포넌트 ──────────────────────────────────────────────────────────
function KpiMini({ label, value, dir }: { label: string; value: string; dir: string }) {
  return (
    <div style={{ padding: '5px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: dirColor(dir) }}>{value}</div>
    </div>
  )
}

const TXT = C.textPrimary
const TXT2 = C.textSecondary
const TXT3 = C.textMuted
const BORDER = C.border
const BG_ELEV = C.cardBg

export default function GMDailyReportModal({ open, onClose, hotelId: _hotelId, otbDate }: GMDailyReportModalProps) {
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const chartRef  = useRef<HTMLCanvasElement>(null)
  const chartInst = useRef<Chart | null>(null)

  // ESC + 스크롤락
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  // 인쇄 스타일 동적 주입
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'gm-report-print'
    style.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 12mm 14mm; }
        body > *:not(#gm-report-print-root) { display: none !important; }
        #gm-report-print-root { position: static !important; background: none !important; overflow: visible !important; display: block !important; padding: 0 !important; }
        #gm-report-print-root .gm-a4 { width: 100% !important; max-width: none !important; box-shadow: none !important; border-radius: 0 !important; }
        .gm-a4 { background: #ffffff !important; color: #000000 !important; }
        .gm-a4 * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .gm-no-print { display: none !important; }
        .gm-page-break { break-before: page; }
        .gm-page-divider { display: none !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `
    document.head.appendChild(style)
    return () => { document.getElementById('gm-report-print')?.remove() }
  }, [])

  // 차트 생성/파괴
  useEffect(() => {
    if (!open || !chartRef.current) return
    const bg = DUMMY_CHART.labels.map(l => (isWeekendLabel(l) ? '#3987e5' : '#2a78d6'))
    chartInst.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: DUMMY_CHART.labels,
        datasets: [
          { type: 'bar', label: 'OTB OCC%', data: DUMMY_CHART.otb, backgroundColor: bg, borderRadius: 2, order: 2 },
          { type: 'line', label: 'FCST OCC%', data: DUMMY_CHART.fcst, borderColor: '#1d9e75', borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, tension: 0.3, order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%`, font: { size: 9 }, color: C.textMuted }, grid: { color: C.border } },
          x: { ticks: { font: { size: 9 }, color: (c: any) => (isWeekendLabel(DUMMY_CHART.labels[c.index] ?? '') ? '#e24b4a' : C.textMuted) }, grid: { display: false } },
        },
      },
    })
    return () => { chartInst.current?.destroy(); chartInst.current = null }
  }, [open])

  if (!open) return null

  const doPrintAll = () => { setCompact(false); setPrintModalOpen(false); setTimeout(() => window.print(), 50) }
  const doPrintCompact = () => { setCompact(true); setPrintModalOpen(false); setTimeout(() => window.print(), 50) }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: C.overlay, zIndex: 10000,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px 0',
  }
  const a4: React.CSSProperties = {
    width: 'min(794px, 95vw)', background: C.pageBg, borderRadius: 8,
    padding: '28px 32px', position: 'relative', flexShrink: 0,
  }
  const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: TXT, margin: '0 0 8px' }
  const card: React.CSSProperties = { background: BG_ELEV, borderRadius: 6, padding: '12px 14px' }
  const th: React.CSSProperties = { fontSize: 9, color: TXT3, fontWeight: 400, padding: '3px 6px' }

  const report = (
    <div id="gm-report-print-root" style={overlay} onClick={onClose}>
      <div className="gm-a4" style={a4} onClick={e => e.stopPropagation()}>

        {/* ── 헤더 ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: TXT }}>GM Daily Report</span>
            <span style={{ fontSize: 11, color: TXT3 }}>기준일 {otbDate}</span>
          </div>
          <div className="gm-no-print" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setPrintModalOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 11px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TXT, cursor: 'pointer' }}>
              🖨️ 출력
            </button>
            <button onClick={onClose} aria-label="닫기"
              style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TXT2, cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        </div>

        {/* ══════════ 1페이지 ══════════ */}

        {/* 섹션 A — 3개월 Pick-up */}
        <div style={{ marginBottom: 18 }}>
          <div style={sectionTitle}>3개월 Pick-up</div>
          <div style={{ borderLeft: '3px solid #1d9e75', background: BG_ELEV, padding: '8px 12px', fontSize: 12, color: TXT2, marginBottom: 10 }}>
            어제 대비 3개월 픽업은 총 <b style={{ fontWeight: 500, color: TXT }}>+8실</b>, ADR <b style={{ fontWeight: 500, color: TXT }}>140,000원</b>, 매출 <b style={{ fontWeight: 500, color: TXT }}>150M</b> 증가하였습니다.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {DUMMY_3M_PICKUP.map(m => (
              <div key={m.month} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: TXT }}>{m.label}</span>
                  <span style={badgeStyle(m.occDir)}>{m.occ}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', border: `0.5px solid ${BORDER}`, borderRadius: 4, marginBottom: 8 }}>
                  <KpiMini label="OCC%" value={m.occ} dir={m.occDir} />
                  <KpiMini label="R/N"  value={m.rn}  dir={m.rnDir} />
                  <KpiMini label="ADR"  value={m.adr} dir={m.adrDir} />
                  <KpiMini label="REV"  value={m.rev} dir={m.revDir} />
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {m.segs.map(s => (
                    <span key={s.name} style={badgeStyle(s.dir)}>{s.name} {s.val}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 섹션 B — Pick-up 상세 */}
        <div>
          <div style={sectionTitle}>Pick-up 상세</div>
          <div style={{ ...card, padding: '14px 16px' }}>
            {/* 헤더 행 */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 60px 1fr 1fr 1fr 1fr', alignItems: 'center', borderBottom: `0.5px solid ${BORDER}`, paddingBottom: 4 }}>
              <span style={th}>세그 / 어카운트</span>
              <span style={th} />
              <span style={{ ...th, textAlign: 'right' }}>7월</span>
              <span style={{ ...th, textAlign: 'right' }}>8월</span>
              <span style={{ ...th, textAlign: 'right' }}>9월</span>
              <span style={{ ...th, textAlign: 'right' }}>합계</span>
            </div>

            {DUMMY_ACCOUNTS.map(seg => {
              const rows = compact ? seg.accounts.slice(0, 3) : seg.accounts
              const hidden = compact ? seg.accounts.slice(3) : []
              return (
                <div key={seg.seg} style={{ marginTop: 8 }}>
                  {/* 세그 헤더 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `0.5px solid ${BORDER}`, paddingBottom: 3, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: TXT2 }}>{seg.seg}</span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: dirColor(seg.totalDir) }}>{seg.total}</span>
                  </div>
                  {/* 어카운트 행 */}
                  {rows.map((a, ai) => (
                    <div key={a.name} style={{ display: 'grid', gridTemplateColumns: '140px 60px 1fr 1fr 1fr 1fr', alignItems: 'center', padding: '3px 0', borderBottom: ai < rows.length - 1 || hidden.length > 0 ? `0.5px solid ${BORDER}` : 'none' }}>
                      <span style={{ fontSize: 11, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', paddingRight: 8 }}>
                        <span style={{ width: `${Math.min(44, Math.max(4, a.bar / 100 * 44))}px`, height: 3, borderRadius: 2, background: a.barNeg ? '#e24b4a' : '#2a78d6' }} />
                      </span>
                      <span style={{ fontSize: 11, textAlign: 'right', color: TXT2 }}>{a.m7}</span>
                      <span style={{ fontSize: 11, textAlign: 'right', color: TXT2 }}>{a.m8}</span>
                      <span style={{ fontSize: 11, textAlign: 'right', color: TXT2 }}>{a.m9}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, textAlign: 'right', color: dirColor(a.sumDir) }}>{a.sum}</span>
                    </div>
                  ))}
                  {hidden.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 60px 1fr 1fr 1fr 1fr', alignItems: 'center', padding: '3px 0' }}>
                      <span style={{ fontSize: 10, color: TXT3, fontStyle: 'italic' }}>기타 {hidden.length}개</span>
                      <span /><span /><span /><span /><span />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── 페이지 구분선 ── */}
        <div className="gm-page-divider" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
          <div style={{ flex: 1, borderTop: `1.5px dashed ${BORDER}` }} />
          <span style={{ fontSize: 10, color: TXT3, background: C.pageBg, padding: '2px 8px', borderRadius: 10, border: `0.5px solid ${BORDER}` }}>2페이지 시작</span>
          <div style={{ flex: 1, borderTop: `1.5px dashed ${BORDER}` }} />
        </div>

        {/* ══════════ 2페이지 ══════════ */}
        <div className="gm-page-break">

          {/* 섹션 C — 이벤트 일정 */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>이벤트 일정</div>
            <div style={{ ...card, padding: '10px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr 130px 80px 80px', alignItems: 'center', borderBottom: `0.5px solid ${BORDER}`, paddingBottom: 4 }}>
                <span style={th}>일자</span>
                <span style={th}>이벤트</span>
                <span style={th}>OCC%</span>
                <span style={{ ...th, textAlign: 'right' }}>전일 픽업</span>
                <span style={{ ...th, textAlign: 'right' }}>LY OCC%</span>
              </div>
              {DUMMY_EVENTS.map((ev, i) => {
                const weekend = ev.day === '금' || ev.day === '토'
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 130px 80px 80px', alignItems: 'center', padding: '5px 0', borderBottom: i < DUMMY_EVENTS.length - 1 ? `0.5px solid ${BORDER}` : 'none' }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: weekend ? '#e24b4a' : TXT }}>{ev.date} <span style={{ fontSize: 9 }}>({ev.day})</span></span>
                    <span style={{ fontSize: 11, color: TXT }}>{ev.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 72, height: 5, borderRadius: 3, background: C.border, overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: 5, width: `${ev.occ}%`, background: ev.occColor }} />
                      </span>
                      <span style={{ fontSize: 10, color: TXT2 }}>{ev.occ}%</span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, textAlign: 'right', color: dirColor(ev.pickupDir) }}>{ev.pickup}</span>
                    <span style={{ fontSize: 11, textAlign: 'right', color: TXT2 }}>{ev.lyOcc}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 섹션 D — 월별 OTB 현황 */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>월별 OTB 현황</div>
            <div style={{ ...card, padding: '10px 14px' }}>
              {/* 2줄 헤더 */}
              <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(6, 1fr)', borderBottom: `0.5px solid ${BORDER}` }}>
                <span />
                <span style={{ ...th, fontSize: 8, gridColumn: 'span 3', textAlign: 'center', color: '#2a78d6', fontWeight: 600 }}>OTB 현황</span>
                <span style={{ ...th, fontSize: 8, gridColumn: 'span 3', textAlign: 'center', color: '#eda100', fontWeight: 600, borderLeft: `1px solid ${BORDER}` }}>Budget</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(6, 1fr)', borderBottom: `0.5px solid ${BORDER}`, paddingBottom: 3 }}>
                <span style={{ ...th, fontSize: 8 }}>구분</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>OCC%</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>ADR(천원)</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>REV(백만)</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right', borderLeft: `1px solid ${BORDER}` }}>OCC%</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>ADR(천원)</span>
                <span style={{ ...th, fontSize: 8, textAlign: 'right' }}>REV(백만)</span>
              </div>
              {DUMMY_MONTHLY_OTB.map((r, i) => {
                const cell = (main: string, sub: string, dir: string, bl = false) => (
                  <span style={{ textAlign: 'right', padding: '4px 4px 4px 0', borderLeft: bl ? `1px solid ${BORDER}` : undefined }}>
                    <span style={{ display: 'block', fontSize: 10, color: TXT, fontWeight: r.isTotal ? 500 : 400 }}>{main}</span>
                    <span style={{ display: 'block', fontSize: 8, color: dirColor(dir) }}>{sub}</span>
                  </span>
                )
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px repeat(6, 1fr)', alignItems: 'center', borderTop: r.isTotal ? `0.5px solid ${BORDER}` : undefined }}>
                    <span style={{ fontSize: 10, fontWeight: r.isTotal ? 600 : 500, color: TXT, padding: '4px 6px' }}>{r.month}</span>
                    {cell(r.otbOcc, r.lyOcc, r.lyOccDir)}
                    {cell(r.otbAdr, r.lyAdr, r.lyAdrDir)}
                    {cell(r.otbRev, r.lyRev, r.lyRevDir)}
                    {cell(r.budOcc, r.budOccDiff, r.budOccDir, true)}
                    {cell(r.budAdr, r.budAdrDiff, r.budAdrDir)}
                    {cell(r.budRev, r.budRevDiff, r.budRevDir)}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 섹션 E — 어제 실적 */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>어제 실적</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {DUMMY_YESTERDAY.map(k => (
                <div key={k.label} style={{ ...card, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: TXT3 }}>{k.label}</span>
                    <span style={badgeStyle(k.lyDir)}>{k.ly}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: TXT }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 섹션 F — 당일 OTB + 차트 */}
          <div>
            <div style={sectionTitle}>당일 OTB 현황</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {DUMMY_TODAY_OTB.map(k => (
                  <div key={k.label} style={{ ...card, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: TXT3, marginBottom: 4 }}>{k.label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 18, fontWeight: 500, color: TXT }}>{k.value}</span>
                      <span style={{ fontSize: 10, color: dirColor(k.subDir) }}>{k.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ ...card, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: TXT2 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#2a78d6' }} /> OTB OCC%
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: TXT2 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#1d9e75' }} /> FCST OCC%
                  </span>
                </div>
                <div style={{ height: 150, position: 'relative' }}>
                  <canvas ref={chartRef} />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── 출력 서브모달 ── */}
      {printModalOpen && (
        <div className="gm-no-print" onClick={() => setPrintModalOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 320, background: BG_ELEV, borderRadius: 12, padding: 24, border: `0.5px solid ${BORDER}` }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: TXT, marginBottom: 6 }}>어카운트 출력 방식 선택</div>
            <div style={{ fontSize: 12, color: TXT3, marginBottom: 16 }}>어카운트가 많을 경우 페이지가 늘어날 수 있습니다.</div>

            <button onClick={doPrintAll}
              style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', color: TXT, cursor: 'pointer', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>전체 출력</div>
              <div style={{ fontSize: 11, color: TXT3, marginTop: 2 }}>움직임 있는 어카운트 전체 표시 / 페이지 수 자동 증가</div>
            </button>
            <button onClick={doPrintCompact}
              style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', color: TXT, cursor: 'pointer', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>압축 출력</div>
              <div style={{ fontSize: 11, color: TXT3, marginTop: 2 }}>세그별 Top 3 + 기타 합산 / 항상 2페이지 고정</div>
            </button>
            <button onClick={() => setPrintModalOpen(false)}
              style={{ width: '100%', padding: '6px', background: 'transparent', border: 'none', color: TXT3, cursor: 'pointer', fontSize: 12 }}>취소</button>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(report, document.body)
}
