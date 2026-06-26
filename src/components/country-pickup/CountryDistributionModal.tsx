'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
import { X, ChevronDown } from 'lucide-react'
import Chart from 'chart.js/auto'
import type { CountryPickupRpcRow, SegmentOption } from './types'

const CHART_COLORS = [
  '#00E5A0', '#378ADD', '#EF9F27', '#E24B4A', '#7F77DD',
  '#D4537E', '#1D9E75', '#D85A30', '#06B6D4', '#639922', '#888780',
]
const SEL_COLORS = ['#00E5A0', '#378ADD', '#EF9F27', '#E24B4A', '#7F77DD']

// 이전월(Actual) 행은 nights, 현재월(OTB) 행은 otb_nights
const rowNights = (r: CountryPickupRpcRow) => r.otb_nights ?? r.nights ?? 0

export default function CountryDistributionModal({ data, segmentOptions, onClose }: {
  data:           CountryPickupRpcRow[]
  segmentOptions: SegmentOption[]
  onClose:        () => void
}) {
  const [selectedAccIdxs, setSelectedAccIdxs] = useState<number[]>([])  // 어카운트 최대 3개
  // FIT/GROUP 독립 멀티선택 (temp=임시, selected=확정)
  const [fitOpen, setFitOpen] = useState(false)
  const [fitTemp, setFitTemp] = useState<string[]>([])
  const [selectedFit, setSelectedFit] = useState<string[]>([])
  const [grpOpen, setGrpOpen] = useState(false)
  const [grpTemp, setGrpTemp] = useState<string[]>([])
  const [selectedGrp, setSelectedGrp] = useState<string[]>([])
  const [showAccList,     setShowAccList]     = useState(false)   // Done 클릭 후에만 어카운트 리스트 표시
  const charts = useRef<Chart[]>([])
  const segRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // 드롭다운 외부 클릭 시 닫힘
  useEffect(() => {
    if (!fitOpen && !grpOpen) return
    const h = (e: MouseEvent) => { if (!segRef.current?.contains(e.target as Node)) { setFitOpen(false); setGrpOpen(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [fitOpen, grpOpen])

  // 현재 data에 존재하는 세그먼트 (활성 여부 판단)
  const activeSegs = useMemo(() => new Set(data.map(r => r.segmentation).filter(Boolean)), [data])

  // c05 스키마 기반 세그먼트 목록 (sorting2 기준 — 데이터 없는 세그도 포함)
  const fitSegs = useMemo(() => segmentOptions.filter(s => s.sorting2 === 'fit'), [segmentOptions])
  const grpSegs = useMemo(() => segmentOptions.filter(s => s.sorting2 === 'group'), [segmentOptions])

  // selectedSegs = FIT+GROUP 확정 합산 (다운스트림 필터/칩에서 사용)
  const selectedSegs = [...selectedFit, ...selectedGrp]
  const isAllSelected = (fitSegs.length + grpSegs.length) > 0
    && selectedFit.length === fitSegs.length && selectedGrp.length === grpSegs.length

  // 선택된 세그 기준으로 어카운트 + 국가별 R/N 집계
  const accountList = useMemo(() => {
    const filtered = selectedSegs.length === 0
      ? data
      : data.filter(r => selectedSegs.includes(r.segmentation))
    const map: Record<string, { name: string; rn: number; countries: Record<string, number> }> = {}
    filtered.forEach(row => {
      const acc = row.account_name || '(미지정)'
      if (!map[acc]) map[acc] = { name: acc, rn: 0, countries: {} }
      const n = rowNights(row)
      map[acc].rn += n
      const ctr = row.country_name_en || row.country_name_ko || row.country
      map[acc].countries[ctr] = (map[acc].countries[ctr] ?? 0) + n
    })
    return Object.values(map)
      .map(a => ({
        ...a,
        ctr: Object.entries(a.countries)
          .map(([n, r]) => ({ n, r }))
          .sort((x, y) => y.r - x.r),
      }))
      .sort((a, b) => b.rn - a.rn)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedFit, selectedGrp])

  // FIT/GROUP 공통 멀티선택 드롭다운 렌더 (temp → Done 시 selected 확정)
  const segDrop = (
    label: string, segs: { code: string; name: string }[],
    temp: string[], setTemp: React.Dispatch<React.SetStateAction<string[]>>,
    selected: string[], setSelected: React.Dispatch<React.SetStateAction<string[]>>,
    open: boolean, setOpen: (v: boolean) => void, closeOther: () => void, otherSelected: string[],
  ) => {
    const active = selected.length > 0 || open
    return (
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => { if (!open) { setTemp(selected); closeOther() } setOpen(!open) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, cursor: 'pointer',
            border: `0.5px solid ${active ? '#00E5A0' : 'var(--color-border-subtle)'}`,
            background: active ? 'rgba(0,229,160,0.07)' : 'transparent',
            color: active ? '#00E5A0' : 'var(--color-text-secondary)',
          }}
        >
          {selected.length === 0 ? label : `${label} (${selected.length})`}
          <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {open && (
          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000, background: '#1a1a1a', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 0', minWidth: 160, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
            {segs.length === 0 ? (
              <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>없음</div>
            ) : segs.map(seg => {
              const checked = temp.includes(seg.code)
              return (
                <div key={seg.code}
                  onClick={() => setTemp(prev => prev.includes(seg.code) ? prev.filter(c => c !== seg.code) : [...prev, seg.code])}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.8)', background: checked ? 'rgba(0,229,160,0.07)' : 'transparent' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 2, flexShrink: 0, border: `0.5px solid ${checked ? '#00E5A0' : 'rgba(255,255,255,0.3)'}`, background: checked ? 'rgba(0,229,160,0.2)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#00E5A0' }}>{checked ? '✓' : ''}</span>
                  {seg.name}
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderTop: '0.5px solid rgba(255,255,255,0.08)' }}>
              <button onClick={() => setTemp([])} style={{ flex: 1, background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '2px 0', fontSize: 10, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Reset</button>
              <button onClick={() => setTemp(segs.map(s => s.code))} style={{ flex: 1, background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '2px 0', fontSize: 10, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>All</button>
              <button onClick={() => { setSelected(temp); setOpen(false); setSelectedAccIdxs([]); setShowAccList((temp.length + otherSelected.length) > 0) }} style={{ flex: 1, background: 'rgba(0,229,160,0.15)', border: '0.5px solid rgba(0,229,160,0.4)', borderRadius: 4, padding: '2px 0', fontSize: 10, color: '#00E5A0', cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const toggleAcc = (idx: number) => {
    setSelectedAccIdxs(prev => {
      if (prev.includes(idx)) return prev.filter(x => x !== idx)
      if (prev.length >= 5)   return prev
      return [...prev, idx]
    })
  }

  // 도넛 차트 렌더
  useEffect(() => {
    charts.current.forEach(c => c.destroy())
    charts.current = []

    // canvas borderColor는 CSS 변수가 해석 안 되므로 런타임 값으로 변환
    const borderCol = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-bg-secondary').trim() || '#111111'

    selectedAccIdxs.forEach((accIdx, si) => {
      const acc = accountList[accIdx]
      if (!acc) return
      const canvas = document.getElementById(`dist-dc-${si}`) as HTMLCanvasElement | null
      if (!canvas) return
      const t = acc.ctr.reduce((s, d) => s + d.r, 0)
      const c = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: acc.ctr.map(d => d.n),
          datasets: [{
            data: acc.ctr.map(d => d.r),
            backgroundColor: CHART_COLORS.slice(0, acc.ctr.length),
            borderWidth: 2,
            borderColor: borderCol,
            hoverOffset: 4,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx: any) =>
                  ` ${ctx.label}: ${ctx.parsed.toLocaleString()} R/N (${t > 0 ? Math.round(ctx.parsed / t * 100) : 0}%)`,
              },
              backgroundColor: '#111', titleColor: '#fff',
              bodyColor: 'rgba(255,255,255,0.7)',
              borderColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5,
            },
          },
        },
      })
      charts.current.push(c)
    })

    return () => { charts.current.forEach(c => c.destroy()); charts.current = [] }
  }, [selectedAccIdxs, accountList])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--color-bg-primary)',
        border: '0.5px solid var(--color-border-subtle)',
        borderRadius: 12,
        width: Math.min(300 + selectedAccIdxs.length * 200, (typeof window !== 'undefined' ? window.innerWidth : 1200) * 0.92),
        minWidth: 700, maxWidth: '94vw', height: 560, minHeight: 560,
        display: 'flex', flexDirection: 'column',
        overflow: 'visible',
      }}>

        {/* 헤더 */}
        <div style={{ padding: '13px 18px', borderBottom: '0.5px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>Account × Country Distribution</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{selectedAccIdxs.length} / 5 selected</span>
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: '50%', border: '0.5px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={13} />
            </button>
          </div>
        </div>

        {/* 세그먼트 필터 — FIT/GROUP 그룹별 하위 segmentation 체크박스 드롭다운 */}
        <div ref={segRef} style={{ padding: '10px 18px', borderBottom: '0.5px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, position: 'relative', zIndex: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', color: 'var(--color-text-tertiary)' }}>SEGMENT</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {/* TOTAL — FIT+GROUP 전체 선택 */}
            <button
              onClick={() => { setSelectedFit(fitSegs.map(s => s.code)); setSelectedGrp(grpSegs.map(s => s.code)); setSelectedAccIdxs([]); setShowAccList(true) }}
              style={{
                background: 'transparent',
                border: `0.5px solid ${isAllSelected ? 'rgba(0,229,160,0.6)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 500,
                color: isAllSelected ? '#00E5A0' : 'rgba(255,255,255,0.6)', cursor: 'pointer',
              }}
            >
              TOTAL
            </button>
            {segDrop('FIT', fitSegs, fitTemp, setFitTemp, selectedFit, setSelectedFit, fitOpen, setFitOpen, () => setGrpOpen(false), selectedGrp)}
            {segDrop('GROUP', grpSegs, grpTemp, setGrpTemp, selectedGrp, setSelectedGrp, grpOpen, setGrpOpen, () => setFitOpen(false), selectedFit)}
            {selectedSegs.length > 0 && (
              <button
                onClick={() => { setSelectedFit([]); setSelectedGrp([]); setFitTemp([]); setGrpTemp([]); setSelectedAccIdxs([]); setShowAccList(false) }}
                style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, cursor: 'pointer', border: '0.5px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-tertiary)' }}
              >초기화</button>
            )}
          </div>
        </div>

        {/* 본문 */}
        <div style={{ display: 'flex', height: 440, flexShrink: 0, overflow: 'hidden' }}>

          {/* 좌측 어카운트 리스트 */}
          <div style={{ width: 180, flexShrink: 0, borderRight: '0.5px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '7px 12px', borderBottom: '0.5px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.05em', color: 'var(--color-text-tertiary)' }}>ACCOUNT</span>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>R/N</span>
            </div>
            {showAccList ? (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {accountList.map((acc, i) => {
                const selIdx = selectedAccIdxs.indexOf(i)
                const isSel = selIdx >= 0
                const selColor = SEL_COLORS[selIdx]
                return (
                  <div
                    key={acc.name}
                    onClick={() => toggleAcc(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer',
                      borderLeft: `2px solid ${isSel ? selColor : 'transparent'}`,
                      background: isSel ? 'rgba(255,255,255,0.04)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-secondary)' }}
                    onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <div style={{
                      width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                      border: `0.5px solid ${isSel ? selColor : 'var(--color-border-subtle)'}`,
                      background: isSel ? selColor : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSel && <span style={{ fontSize: 9, color: '#0a0a0a', fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 11, color: isSel ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSel ? 500 : 400 }}>{acc.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{acc.rn.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, padding: '0 16px', textAlign: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>세그먼트 선택 후 Done을 클릭하세요</span>
              </div>
            )}
          </div>

          {/* 우측 도넛 차트 영역 */}
          <div style={{ flex: 1, display: 'flex', flexWrap: 'nowrap', alignItems: 'stretch', padding: 16, gap: 12, overflowX: 'auto' }}>
            {selectedAccIdxs.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 24, opacity: 0.3 }}>👆</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>어카운트를 선택하세요 (최대 5개)</span>
              </div>
            ) : selectedAccIdxs.map((accIdx, si) => {
              const acc = accountList[accIdx]
              if (!acc) return null
              const t = acc.ctr.reduce((s, d) => s + d.r, 0)
              const col = SEL_COLORS[si]
              return (
                <div key={accIdx} style={{
                  flex: '1 1 0', width: 0, minWidth: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 8,
                  background: 'var(--color-bg-secondary)', borderRadius: 8,
                  border: `0.5px solid ${col}50`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: col, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{acc.name}</span>
                  </div>
                  <div style={{ position: 'relative', width: 110, height: 110 }}>
                    <canvas id={`dist-dc-${si}`} role="img" aria-label={`Country distribution for ${acc.name}`} />
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>{t.toLocaleString()}</div>
                      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>R/N</div>
                    </div>
                  </div>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {acc.ctr.map((d, i) => {
                      const pct = t > 0 ? Math.round(d.r / t * 100) : 0
                      return (
                        <div key={d.n} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 7, height: 7, borderRadius: 1, flexShrink: 0, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span style={{ fontSize: 9, color: 'var(--color-text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.n}</span>
                          <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-text-primary)' }}>{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 푸터 */}
        <div style={{ padding: '8px 18px', borderTop: '0.5px solid var(--color-border-subtle)', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Segment 다중 선택 가능 · Account 최대 5개 선택</span>
        </div>

      </div>
    </div>
  )
}
