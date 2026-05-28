'use client'
import { useEffect } from 'react'

interface ConfirmDialogProps {
  isOpen:    boolean
  message:   string
  onApply:   () => void
  onDiscard: () => void
  onCancel:  () => void
}

export function ConfirmDialog({ isOpen, message, onApply, onDiscard, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative', zIndex: 201,
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border-default)',
          borderRadius: 12,
          padding: '24px 28px',
          minWidth: 320,
          maxWidth: 400,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 12 }}>
          변경 사항이 있습니다
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 24, whiteSpace: 'pre-line' }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 16px',
              background: 'transparent',
              border: '1px solid var(--color-border-default)',
              borderRadius: 6,
              color: 'var(--color-text-primary)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            onClick={onDiscard}
            style={{
              padding: '7px 16px',
              background: 'transparent',
              border: '1px solid var(--color-border-default)',
              borderRadius: 6,
              color: 'var(--color-text-muted)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            버림
          </button>
          <button
            onClick={onApply}
            style={{
              padding: '7px 16px',
              background: 'var(--color-accent-primary, #00E5A0)',
              border: 'none',
              borderRadius: 6,
              color: '#000',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            적용
          </button>
        </div>
      </div>
    </div>
  )
}
