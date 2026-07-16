'use client';

import { useEffect, useState } from 'react';

// ── 원본 showToast() 색상 (info/success/warn/error) ──────────
type ToastType = 'info' | 'success' | 'warn' | 'warning' | 'error';

interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
  leaving: boolean;
}

const COLORS: Record<string, string> = {
  info:    '#2563eb',
  success: '#16a34a',
  warn:    '#d97706',
  warning: '#d97706',
  error:   '#dc2626',
};

// ── 전역 이벤트 브릿지 (원본 showToast 호출부 대체) ──────────
let seq = 0;
type Listener = (item: ToastItem) => void;
const listeners = new Set<Listener>();

export function showToast(msg: string, type: ToastType = 'info') {
  const item: ToastItem = { id: ++seq, msg, type, leaving: false };
  listeners.forEach((l) => l(item));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener: Listener = (item) => {
      setToasts((prev) => [...prev, item]);
      // 원본: 2800ms 후 opacity 0 → 500ms 후 제거
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === item.id ? { ...t, leaving: true } : t)));
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== item.id));
        }, 500);
      }, 2800);
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: COLORS[t.type] || COLORS.info,
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 10,
            fontSize: '0.82rem',
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            opacity: t.leaving ? 0 : 1,
            transition: 'opacity .5s',
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
