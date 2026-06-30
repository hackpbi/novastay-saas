'use client'

import { useMemo, useState } from 'react'
import { Table2, Plus } from 'lucide-react'
import SegmentDetailModal from './SegmentDetailModal'
import {
  getDummyMonthlySummary,
  getDummyActionItems,
  monthKeyLabel,
  type ActionItem,
  type ActionStatus,
} from './dummyMeetingData'

interface RevenueMeetingPageProps {
  hotelId: string
}

// ── 디자인 토큰 ──────────────────────────────────────────────────────────────────
const BG     = '#0a0a0a'
const CARD   = '#141414'
const MINT   = '#00E5A0'
const RED    = '#E24B4A'
const BLUE   = '#5B8DEF'
const TXT3   = '#888'

// 향후 4개월(당월 + 3) monthKey 생성
function buildMonthKeys(): string[] {
  const now = new Date()
  const keys: string[] = []
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

const STATUS_META: Record<ActionStatus, { label: string; color: string }> = {
  in_progress: { label: '진행중', color: BLUE },
  delayed:     { label: '지연',   color: RED },
  done:        { label: '완료',   color: '#666' },
}
const STATUS_ORDER: ActionStatus[] = ['in_progress', 'delayed', 'done']

// 증감 포맷 (단위별)
const signNum = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('ko-KR')}`
const signK   = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v / 1000)}K`
const signM   = (v: number) => `${v > 0 ? '+' : ''}${(v / 1_000_000).toFixed(1)}M`
const signPct = (v: number) => `${v > 0 ? '+' : ''}${v}%p`
const dColor  = (v: number) => (v > 0 ? MINT : v < 0 ? RED : TXT3)

export default function RevenueMeetingPage({ hotelId }: RevenueMeetingPageProps) {
  const monthKeys = useMemo(buildMonthKeys, [])
  const [monthKey, setMonthKey] = useState(monthKeys[0])
  const [segOpen, setSegOpen]   = useState(false)

  const summary = getDummyMonthlySummary(monthKey)
  const actions = getDummyActionItems(monthKey)

  const grouped = STATUS_ORDER.map(st => ({ status: st, items: actions.filter(a => a.status === st) }))
                              .filter(g => g.items.length > 0)

  // 요약 카드 정의
  const cards: { label: string; main: string; vsBudget: React.ReactNode; vsLy: React.ReactNode }[] = [
    {
      label: 'OCC', main: `${summary.occ.value}%`,
      vsBudget: <span style={{ color: dColor(summary.occ.vsBudget) }}>{signPct(summary.occ.vsBudget)}</span>,
      vsLy:     <span style={{ color: dColor(summary.occ.vsLy) }}>{signPct(summary.occ.vsLy)}</span>,
    },
    {
      label: 'R·N', main: summary.rn.value.toLocaleString('ko-KR'),
      vsBudget: <span style={{ color: dColor(summary.rn.vsBudget) }}>{signNum(summary.rn.vsBudget)}</span>,
      vsLy:     <span style={{ color: dColor(summary.rn.vsLy) }}>{signNum(summary.rn.vsLy)}</span>,
    },
    {
      label: 'ADR', main: `${Math.round(summary.adr.value / 1000)}K`,
      vsBudget: <span style={{ color: dColor(summary.adr.vsBudget) }}>{signK(summary.adr.vsBudget)}</span>,
      vsLy:     <span style={{ color: dColor(summary.adr.vsLy) }}>{signK(summary.adr.vsLy)}</span>,
    },
    {
      label: 'REV', main: `${(summary.rev.value / 1_000_000).toFixed(1)}M`,
      vsBudget: <span style={{ color: dColor(summary.rev.vsBudget) }}>{signM(summary.rev.vsBudget)}</span>,
      vsLy:     <span style={{ color: dColor(summary.rev.vsLy) }}>{signM(summary.rev.vsLy)}</span>,
    },
  ]

  return (
    <div style={{ minHeight: '100%', background: BG, padding: '24px 28px', color: '#fff' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 500 }}>Revenue meeting</div>
        <div style={{ fontSize: 13, color: TXT3, marginTop: 2 }}>{hotelId} · 6개월 픽업 기준</div>
      </div>

      {/* 월 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {monthKeys.map(mk => {
          const active = mk === monthKey
          return (
            <button key={mk} onClick={() => setMonthKey(mk)} style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: active ? MINT : 'transparent', color: active ? '#0a0a0a' : TXT3, fontWeight: active ? 600 : 400,
            }}>
              {monthKeyLabel(mk)}
            </button>
          )
        })}
      </div>

      {/* 월간 요약 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>월간 요약</div>
        <button onClick={() => setSegOpen(true)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px',
          borderRadius: 8, background: 'transparent', border: `1px solid rgba(0,229,160,0.4)`, color: MINT, cursor: 'pointer',
        }}>
          <Table2 size={14} /> 세그먼트 상세 보기
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background: CARD, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: TXT3 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#fff', margin: '4px 0 6px' }}>{c.main}</div>
            <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: TXT3 }}>vs Budget</span>{c.vsBudget}
            </div>
            <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ color: TXT3 }}>vs LY</span>{c.vsLy}
            </div>
          </div>
        ))}
      </div>

      {/* Action items */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Action items</div>
        <button
          onClick={() => { console.log('[RevenueMeeting] 액션아이템 추가 (1차 더미) — DB 저장은 다음 단계'); alert('액션아이템 추가는 다음 단계에서 구현됩니다.') }}
          style={{
            fontSize: 12, background: 'transparent', border: 'none', color: MINT, cursor: 'pointer',
            textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: 3,
          }}
        >
          + 추가
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {grouped.map(g => {
          const meta = STATUS_META[g.status]
          return (
            <div key={g.status}>
              <div style={{ fontSize: 11, fontWeight: 600, color: meta.color, marginBottom: 6 }}>
                {meta.label} · {g.items.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {g.items.map(item => <ActionRow key={item.id} item={item} />)}
              </div>
            </div>
          )
        })}
        {grouped.length === 0 && (
          <div style={{ fontSize: 12, color: TXT3 }}>액션아이템이 없습니다.</div>
        )}
      </div>

      {/* 세그먼트 상세 풀스크린 모달 */}
      <SegmentDetailModal open={segOpen} onClose={() => setSegOpen(false)} hotelId={hotelId} monthKey={monthKey} />
    </div>
  )
}

function ActionRow({ item }: { item: ActionItem }) {
  const meta = STATUS_META[item.status]
  const done = item.status === 'done'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: CARD, borderRadius: 8, padding: '10px 12px', opacity: done ? 0.6 : 1,
    }}>
      <div>
        <div style={{ fontSize: 13, color: '#fff', textDecoration: done ? 'line-through' : 'none' }}>{item.title}</div>
        <div style={{ fontSize: 11, color: TXT3, marginTop: 2 }}>
          담당 {item.assignee} · {item.dueDate} {done ? '완료' : '마감'}
        </div>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
        color: meta.color, background: `${meta.color}1f`,
      }}>
        {meta.label}
      </span>
    </div>
  )
}
