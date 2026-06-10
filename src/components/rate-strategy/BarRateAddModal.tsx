'use client'

import { useState, useEffect } from 'react'

// ── Props ─────────────────────────────────────────────────────────────────────

interface BarRateAddModalProps {
  onClose: () => void
  onAdd:   (rates: number[]) => void
}

type AddTab = 'single' | 'bulk'
type BulkType = 'count' | 'fixed' | 'pct'

// ── Shared style ──────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width:        '100%',
  fontSize:     12,
  padding:      '7px 10px',
  borderRadius: 6,
  border:       '0.5px solid var(--color-border-default)',
  background:   'var(--color-bg-primary)',
  color:        'var(--color-text-primary)',
  outline:      'none',
  boxSizing:    'border-box',
}

const btnSecondary: React.CSSProperties = {
  fontSize:     12,
  padding:      '6px 14px',
  borderRadius: 6,
  border:       '0.5px solid var(--color-border-default)',
  background:   'transparent',
  color:        'var(--color-text-secondary)',
  cursor:       'pointer',
}

function btnPrimary(active: boolean): React.CSSProperties {
  return {
    fontSize:     12,
    padding:      '6px 14px',
    borderRadius: 6,
    border:       'none',
    background:   active ? '#00E5A0' : 'var(--color-bg-tertiary)',
    color:        active ? '#04342C' : 'var(--color-text-secondary)',
    fontWeight:   active ? 500 : 400,
    cursor:       active ? 'pointer' : 'default',
  }
}

// ── SingleAddTab ──────────────────────────────────────────────────────────────

function SingleAddTab({ onAdd, onCancel }: { onAdd: (r: number[]) => void; onCancel: () => void }) {
  const [value, setValue] = useState('')
  const rate     = Number(value)
  const displayK = rate > 0 ? Math.round(rate / 1000) : null

  return (
    <div style={{ paddingBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
          요금 (원 단위)
        </label>
        <input
          type="number"
          className="no-spinner"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="예: 150000"
          onKeyDown={e => { if (e.key === 'Enter' && rate > 0) onAdd([rate]) }}
          style={inputStyle}
          autoFocus
        />
        {displayK && (
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 3, display: 'block' }}>
            → {displayK.toLocaleString()}천원으로 표시
          </span>
        )}
      </div>

      {displayK && (
        <div style={{
          background:   'var(--color-bg-secondary)',
          borderRadius: 6,
          border:       '0.5px solid var(--color-border-default)',
          padding:      '10px 12px',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 6 }}>추가될 요금</div>
          <div style={{
            fontSize:     11,
            padding:      '3px 10px',
            borderRadius: 20,
            border:       '0.5px solid rgba(0,229,160,0.4)',
            background:   'rgba(0,229,160,0.08)',
            color:        '#00B883',
            display:      'inline-block',
          }}>
            {displayK}K
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={btnSecondary} onClick={onCancel}>취소</button>
        <button
          disabled={!rate || rate <= 0}
          onClick={() => onAdd([rate])}
          style={btnPrimary(rate > 0)}
        >
          추가
        </button>
      </div>
    </div>
  )
}

// ── BulkAddTab ────────────────────────────────────────────────────────────────

function BulkAddTab({ onAdd, onCancel }: { onAdd: (r: number[]) => void; onCancel: () => void }) {
  const [start,        setStart]        = useState('')
  const [end,          setEnd]          = useState('')
  const [type,         setType]         = useState<BulkType>('count')
  const [val,          setVal]          = useState('')
  const [previewRates, setPreviewRates] = useState<number[]>([])
  const [hasPreview,   setHasPreview]   = useState(false)

  const calcRates = (): number[] => {
    const s = Number(start), e = Number(end), v = Number(val)
    if (!s || !e || !v || s >= e || v <= 0) return []
    const list: number[] = []

    if (type === 'count') {
      const n = Math.round(v)
      if (n < 2) return [s, e]
      const step = (e - s) / (n - 1)
      for (let i = 0; i < n; i++) {
        list.push(Math.round((s + step * i) / 1000) * 1000)
      }
    } else if (type === 'fixed') {
      for (let r = s; r <= e + 1; r += v) list.push(r)
    } else {
      let r = s
      while (r <= e * 1.001) {
        list.push(Math.round(r / 1000) * 1000)
        r = r * (1 + v / 100)
        if (r === list[list.length - 1]) break  // pct 너무 작으면 무한루프 방지
      }
    }

    return [...new Set(list)].filter(r => r >= s && r <= e + 1)
  }

  const handleInputChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setter(e.target.value)
    setHasPreview(false)
    setPreviewRates([])
  }

  const canPreview = !!start && !!end && !!val
    && Number(start) > 0
    && Number(end) > Number(start)
    && Number(val) > 0

  const handlePreview = () => {
    setPreviewRates(calcRates())
    setHasPreview(true)
  }

  const typeConfig: Record<BulkType, { label: string; hint: string; placeholder: string }> = {
    count: { label: '개수',       hint: '시작~최고 사이 균등 분할',       placeholder: '예: 5'     },
    fixed: { label: '금액 간격 (원)', hint: '예: 10000 → 10,000원씩 증가', placeholder: '예: 10000' },
    pct:   { label: '인상률 (%)',  hint: '예: 10 → 10%씩 증가',          placeholder: '예: 10'    },
  }

  return (
    <div style={{ paddingBottom: 16 }}>
      {/* 요금 범위 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>시작 요금 (원)</label>
          <input type="number" className="no-spinner" value={start} onChange={handleInputChange(setStart)} placeholder="예: 80000" style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>최고 요금 (원)</label>
          <input type="number" className="no-spinner" value={end} onChange={handleInputChange(setEnd)} placeholder="예: 300000" style={inputStyle} />
        </div>
      </div>

      {/* 인상 방식 */}
      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
        인상 방식
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>방식</label>
          <select
            value={type}
            onChange={e => { handleInputChange(v => setType(v as BulkType))(e); setVal('') }}
            style={inputStyle}
          >
            <option value="count">개수 지정</option>
            <option value="fixed">고정 금액씩</option>
            <option value="pct">% 씩</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
            {typeConfig[type].label}
          </label>
          <input
            type="number"
            className="no-spinner"
            value={val}
            onChange={handleInputChange(setVal)}
            placeholder={typeConfig[type].placeholder}
            style={inputStyle}
          />
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 3, display: 'block' }}>
            {typeConfig[type].hint}
          </span>
        </div>
      </div>

      {/* 미리보기 */}
      <div style={{
        background:   'var(--color-bg-secondary)',
        borderRadius: 6,
        border:       '0.5px solid var(--color-border-default)',
        padding:      '10px 12px',
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          생성될 요금 미리보기
          {hasPreview && previewRates.length > 0 && (
            <span style={{ color: '#00B883' }}>({previewRates.length}개)</span>
          )}
        </div>
        {hasPreview && previewRates.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {previewRates.map(r => (
              <div key={r} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20,
                border: '0.5px solid rgba(0,229,160,0.4)', background: 'rgba(0,229,160,0.08)', color: '#00B883',
              }}>
                {Math.round(r / 1000)}K
              </div>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {hasPreview && previewRates.length === 0
              ? '생성될 요금이 없습니다. 입력값을 확인하세요.'
              : '미리보기 버튼을 클릭하면 요금이 표시됩니다'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={btnSecondary} onClick={onCancel}>취소</button>
        {canPreview && (
          <button
            onClick={handlePreview}
            style={{
              fontSize:     12,
              padding:      '6px 14px',
              borderRadius: 6,
              border:       '0.5px solid var(--color-border-default)',
              background:   'transparent',
              color:        'var(--color-text-primary)',
              cursor:       'pointer',
            }}
          >
            미리보기
          </button>
        )}
        <button
          disabled={!hasPreview || previewRates.length === 0}
          onClick={() => onAdd(previewRates)}
          style={btnPrimary(hasPreview && previewRates.length > 0)}
        >
          {hasPreview && previewRates.length > 0 ? `${previewRates.length}개 추가` : '추가'}
        </button>
      </div>
    </div>
  )
}

// ── BarRateAddModal ───────────────────────────────────────────────────────────

export function BarRateAddModal({ onClose, onAdd }: BarRateAddModalProps) {
  const [tab, setTab] = useState<AddTab>('single')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleAdd = (rates: number[]) => {
    onAdd(rates)
    onClose()
  }

  return (
    <>
    <style>{`
      .no-spinner::-webkit-outer-spin-button,
      .no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .no-spinner[type=number] { -moz-appearance: textfield; }
    `}</style>
    <div style={{
      position:       'fixed',
      inset:          0,
      zIndex:         300,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
    }}>
      {/* 배경 */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />

      {/* 모달 */}
      <div
        style={{
          position:     'relative',
          zIndex:       301,
          background:   'var(--color-bg-primary)',
          border:       '1px solid var(--color-border-default)',
          borderRadius: 12,
          width:        460,
          maxHeight:    '85vh',
          overflowY:    'auto',
          boxShadow:    '0 8px 32px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '14px 16px',
          borderBottom:   '0.5px solid var(--color-border-default)',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)' }}>BAR Rate 추가</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {tab === 'single' ? '요금을 직접 입력하여 추가' : '범위와 인상 방식으로 일괄 생성'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width:          26,
              height:         26,
              borderRadius:   6,
              border:         '0.5px solid var(--color-border-default)',
              background:     'transparent',
              cursor:         'pointer',
              color:          'var(--color-text-secondary)',
              fontSize:       14,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
            }}
          >×</button>
        </div>

        {/* 탭 + 바디 */}
        <div style={{ padding: '14px 16px 0' }}>
          {/* 탭 전환 */}
          <div style={{
            display:      'flex',
            border:       '0.5px solid var(--color-border-default)',
            borderRadius: 6,
            overflow:     'hidden',
            marginBottom: 16,
          }}>
            {(['single', 'bulk'] as AddTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex:       1,
                  fontSize:   12,
                  padding:    '7px',
                  border:     'none',
                  cursor:     'pointer',
                  background: tab === t ? 'rgba(0,229,160,0.1)' : 'transparent',
                  color:      tab === t ? '#00B883' : 'var(--color-text-secondary)',
                  fontWeight: tab === t ? 500 : 400,
                }}
              >
                {t === 'single' ? '일반 추가' : '일괄 추가'}
              </button>
            ))}
          </div>

          {tab === 'single' && (
            <SingleAddTab onAdd={handleAdd} onCancel={onClose} />
          )}
          {tab === 'bulk' && (
            <BulkAddTab onAdd={handleAdd} onCancel={onClose} />
          )}
        </div>
      </div>
    </div>
    </>
  )
}
