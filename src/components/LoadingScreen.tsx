'use client'

interface Props {
  progress: number
  message?: string
}

export default function LoadingScreen({ progress, message = '잠시만 기다려주세요' }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--color-bg-primary)' }}>

      {/* Top progress bar */}
      <div className="relative">
        <div style={{ height: 2, background: 'var(--color-border-default)' }}>
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'var(--color-accent-primary)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <span
          className="absolute right-4 top-2 font-mono text-[12px]"
          style={{ color: 'var(--color-accent-primary)' }}
        >
          {progress}%
        </span>
      </div>

      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5">

        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-cta flex items-center justify-center shadow-accent-glow">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 22V12h6v10" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-semibold text-xl tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            Nova<span className="text-gradient-accent">Stay</span>
          </span>
        </div>

        {/* Dots pulse */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ background: '#00D48A', animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>

        {/* Message */}
        <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
          {message}
        </p>
      </div>
    </div>
  )
}
