'use client'

import { createPortal } from 'react-dom'
import { Send, X } from 'lucide-react'

export type RpaItem = {
  stay_date: string     // 'YYYY-MM-DD'
  before_bar: number    // 변경 전 BAR
  after_bar: number     // 변경 후 BAR
}

const MINT = '#00E5A0'
const RED  = '#E24B4A'
const DOW  = ['일', '월', '화', '수', '목', '금', '토']

// 'YYYY-MM-DD' → 'M/D (요일)' (KST 로컬)
const fmtDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return `${m}/${d} (${DOW[new Date(y, m - 1, d).getDay()]})`
}
// 원 단위 → 'NNNK' (천원, 천단위 콤마)
const fmtK = (v: number) => `${Math.round(v / 1000).toLocaleString()}K`

export default function RpaConfirmModal({ open, onClose, onConfirm, items }: { open: boolean; onClose: () => void; onConfirm: () => void; items: RpaItem[] }) {
  if (!open) return null

  const handleConfirm = () => { onConfirm(); onClose() }

  const downloadRateChangeFile = () => {
    const data = items.map(item => ({
      date: item.stay_date,
      rate: item.after_bar,
    }))
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const n = new Date()
    const p = (v: number) => String(v).padStart(2, '0')
    const stamp =
      `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}` +
      `_${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`
    a.download = `rate_change_${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(10,10,10,0.72)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#fff' }}>
            <Send size={15} style={{ color: MINT }} /> RPA 전송 확인
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', padding: 2 }}><X size={18} /></button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '14px 18px', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 14 }}>변경된 요금을 PMS에 전송합니다</div>

          {items.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '28px 0' }}>변경된 요금이 없습니다.</div>
          ) : (
            <>
              {/* 테이블 헤더 */}
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, color: 'rgba(255,255,255,0.35)', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ flex: 1.2 }}>날짜</span>
                <span style={{ flex: 1, textAlign: 'right' }}>변경 전</span>
                <span style={{ width: 20 }} />
                <span style={{ flex: 1, textAlign: 'right' }}>변경 후</span>
                <span style={{ width: 18 }} />
              </div>
              {/* 행 */}
              {items.map(it => {
                const up = it.after_bar > it.before_bar
                return (
                  <div key={it.stay_date} style={{ display: 'flex', alignItems: 'center', fontSize: 12.5, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ flex: 1.2, color: '#d8d8d8' }}>{fmtDate(it.stay_date)}</span>
                    <span style={{ flex: 1, textAlign: 'right', color: 'rgba(255,255,255,0.55)' }}>{fmtK(it.before_bar)}</span>
                    <span style={{ width: 20, textAlign: 'center', color: 'rgba(255,255,255,0.35)' }}>→</span>
                    <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, color: MINT }}>{fmtK(it.after_bar)}</span>
                    <span style={{ width: 18, textAlign: 'right', color: up ? MINT : RED }}>{up ? '▲' : '▼'}</span>
                  </div>
                )
              })}
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 12 }}>총 {items.length}건</div>
            </>
          )}
        </div>

        {/* 푸터 */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,0.08)', color: '#e8e8e8' }}>취소</button>
          <button
            onClick={downloadRateChangeFile}
            style={{
              padding: '12px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            ⬇ 다운로드
          </button>
          <button onClick={handleConfirm} disabled={items.length === 0} style={{ flex: 1.4, padding: '9px 0', borderRadius: 9, border: 'none', cursor: items.length === 0 ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, background: MINT, color: '#0a0a0a', opacity: items.length === 0 ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Send size={14} /> 요금 변경
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
