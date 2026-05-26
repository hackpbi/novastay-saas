'use client'

type RowTone = 'success' | 'warning' | 'danger' | 'default'

interface SummaryCardRow {
  label: string
  value: string
  tone?: RowTone
}

interface SummaryCardProps {
  label:        string
  variant?:     'primary' | 'secondary'
  mainValue?:   string
  rows?:        SummaryCardRow[]
  placeholder?: string
}

const TONE_COLOR: Record<RowTone, string> = {
  success: 'var(--color-success, #22c55e)',
  warning: 'var(--color-warning, #F5A623)',
  danger:  'var(--color-text-danger, #ef4444)',
  default: 'var(--color-text-primary)',
}

export default function SummaryCard({
  label,
  variant = 'secondary',
  mainValue,
  rows,
  placeholder,
}: SummaryCardProps) {
  const isPrimary = variant === 'primary'

  return (
    <div
      style={{
        padding:       '14px 16px',
        borderRadius:  '12px',
        border:        isPrimary
          ? '1.5px solid var(--color-border-default)'
          : '1px solid var(--color-border-default)',
        background:    isPrimary ? 'var(--color-bg-surface)' : 'var(--color-bg-secondary)',
        boxShadow:     isPrimary ? 'var(--shadow-card)' : 'none',
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
        minHeight:     '118px',
      }}
    >
      {/* 카드 라벨 */}
      <div
        style={{
          fontSize:      '10px',
          fontWeight:    600,
          letterSpacing: '0.08em',
          color:         'var(--color-text-muted)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>

      {/* 빈 카드 */}
      {placeholder ? (
        <div
          style={{
            flex:       1,
            display:    'flex',
            alignItems: 'center',
            color:      'var(--color-text-muted)',
            fontSize:   '13px',
          }}
        >
          {placeholder}
        </div>
      ) : (
        <>
          {/* 메인 숫자 */}
          {mainValue && (
            <div
              style={{
                fontSize:   '24px',
                fontWeight: 700,
                color:      'var(--color-text-primary)',
                lineHeight: 1.1,
              }}
            >
              {mainValue}
            </div>
          )}

          {/* 보조 지표 행 */}
          {rows && rows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
              {rows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display:        'flex',
                    justifyContent: 'space-between',
                    fontSize:       '11px',
                    gap:            '8px',
                  }}
                >
                  <span style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
                  <span
                    style={{
                      color:              TONE_COLOR[row.tone ?? 'default'],
                      fontWeight:         row.tone ? 500 : 400,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
