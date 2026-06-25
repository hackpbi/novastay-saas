'use client'

import { useState, useEffect, useRef } from 'react'
import { Building2, CalendarDays, ChevronDown, Check } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Sidebar from '@/components/Sidebar'
import DatePicker from '@/components/DatePicker'
import { useAuth } from '@/contexts/AuthContext'
import { useHotel } from '@/contexts/HotelContext'
import { DateContext } from '@/contexts/DateContext'
import { FcstDateContext } from '@/contexts/FcstDateContext'
import { useForecastDates } from '@/hooks/useForecastDates'
import { supabase } from '@/lib/supabase'
import type { ReactNode } from 'react'


// ── 상단 진행 바 ──────────────────────────────────────────────────────────────

function TopProgressBar() {
  const pathname = usePathname()
  const [phase, setPhase] = useState<'idle' | 'run' | 'done'>('idle')

  useEffect(() => {
    setPhase('run')
    const t = setTimeout(() => {
      setPhase('done')
      setTimeout(() => setPhase('idle'), 220)
    }, 560)
    return () => clearTimeout(t)
  }, [pathname])

  if (phase === 'idle') return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-[2px] overflow-hidden pointer-events-none">
      <div
        className={phase === 'run' ? 'animate-progress-run' : 'animate-progress-done'}
        style={{
          height: '100%',
          background: 'var(--color-accent-primary)',
          boxShadow: '0 0 8px var(--color-accent-primary)',
        }}
      />
    </div>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [collapsed,     setCollapsed]     = useState(false)
  const [otbDate,       setOtbDate]       = useState<string>('')
  const [vsOtbDate,     setVsOtbDate]     = useState<string>('')
  const [fcstDate,      setFcstDate]      = useState<string>('')
  const [hkDate,        setHkDate]        = useState<string>('')
  const [adminDropOpen, setAdminDropOpen] = useState(false)
  const adminDropRef = useRef<HTMLDivElement>(null)

  const { profile }                           = useAuth()
  const { hotels, currentHotel, switchHotel } = useHotel()
  const hotelId = currentHotel?.id ?? ''

  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'admin'

  // get_otb_dates RPC로 update_date 목록 조회
  const { data: otbDates = [] } = useQuery<string[]>({
    queryKey: ['otb_dates', hotelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_otb_dates', { p_hotel_id: hotelId })
      if (error) throw error
      return (data ?? []) as string[]
    },
    enabled: !!hotelId,
    staleTime: 5 * 60 * 1000,
  })

  // FCST dates
  const { data: fcstDates = [] } = useForecastDates(hotelId || undefined)

  // FCST: fcstDates 로드 후 가장 최근 날짜로 자동 설정 (정렬 순서 무관)
  useEffect(() => {
    if (fcstDates.length === 0) return
    const latest = fcstDates.reduce((max: string, d: string) => (d > max ? d : max), fcstDates[0])
    if (!fcstDate || !fcstDates.includes(fcstDate)) {
      setFcstDate(latest)
    }
  }, [fcstDates])

  // OTB: otbDates 로드 후 또는 otbDate 초기화 후 자동 설정
  useEffect(() => {
    if (otbDates.length === 0) return
    if (!otbDate || !otbDates.includes(otbDate)) {
      setOtbDate(otbDates[0])
    }
  }, [otbDates, otbDate])

  // VS OTB: OTB 날짜 변경 시 자동 재설정
  useEffect(() => {
    if (!otbDate || otbDates.length === 0) return
    const prevDates = otbDates.filter(d => d < otbDate)
    if (prevDates.length === 0) {
      setVsOtbDate('')
      return
    }
    const closest = prevDates[0]
    if (!vsOtbDate || vsOtbDate >= otbDate || !otbDates.includes(vsOtbDate)) {
      setVsOtbDate(closest)
    }
  }, [otbDate, otbDates, vsOtbDate])

  // hotelId 변경 시 OTB / VS OTB 초기화 → 재조회 후 자동 설정
  useEffect(() => {
    setOtbDate('')
    setVsOtbDate('')
  }, [hotelId])

  // FCST / HK 초기값: 오늘
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setFcstDate(today)
    setHkDate(today)
  }, [])

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (adminDropRef.current && !adminDropRef.current.contains(e.target as Node)) {
        setAdminDropOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden">
      <TopProgressBar />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 shrink-0 border-b border-[rgba(255,255,255,0.06)] bg-bg-secondary px-6">
          <div className="flex items-center justify-between gap-4 h-full w-full" style={{ maxWidth: 1320 }}>

            {/* Left: date pickers */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 pr-1">
                <CalendarDays size={13} className="text-accent-primary" />
                <span className="text-xs font-semibold text-accent-primary tracking-wide">Date</span>
              </div>
              <div className="w-px h-4" style={{ background: 'var(--color-border-default)' }} />
              <DatePicker label="OTB"    value={otbDate}   onChange={setOtbDate}   availableDates={otbDates} bare plain hideIcon labelColor="#555" dateColor="#00E5A0" />
              <span style={{ fontSize: 12, color: '#333' }}>|</span>
              <DatePicker label="VS OTB" value={vsOtbDate} onChange={setVsOtbDate} availableDates={otbDates.filter(d => d < otbDate)} bare plain hideIcon labelColor="#555" dateColor="#aaa" underlineColor="#444" />
              <span style={{ fontSize: 12, color: '#333' }}>|</span>
              <DatePicker label="FCST"   value={fcstDate}  onChange={setFcstDate}  availableDates={fcstDates} bare plain hideIcon labelColor="#555" dateColor="#aaa" underlineColor="#444" />
              <span style={{ fontSize: 12, color: '#333' }}>|</span>
              <DatePicker label="HK"     value={hkDate}    onChange={setHkDate} bare plain hideIcon labelColor="#555" dateColor="#aaa" underlineColor="#444" />
            </div>

            <div className="flex-1" />

            {/* Right: super_admin 전체 호텔 드롭다운 */}
            {isAdmin && hotels.length > 0 && (
              <div ref={adminDropRef} className="relative shrink-0">
                <button
                  onClick={() => setAdminDropOpen(v => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                  style={{
                    background: adminDropOpen ? 'var(--accent-badge-bg)' : 'var(--color-bg-tertiary)',
                    border:     adminDropOpen ? '1px solid var(--color-accent-primary)' : '1px solid var(--control-border)',
                    color:      adminDropOpen ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
                  }}
                >
                  <Building2 size={11} className="shrink-0" style={{ color: 'var(--color-accent-primary)' }} />
                  <span className="max-w-[140px] truncate">
                    {currentHotel?.hotel_name ?? '호텔 선택'}
                  </span>
                  <ChevronDown
                    size={11}
                    className="shrink-0 text-brand-muted transition-transform duration-150"
                    style={{ transform: adminDropOpen ? 'rotate(180deg)' : 'none' }}
                  />
                </button>

                {adminDropOpen && (
                  <div
                    className="absolute right-0 top-full mt-1.5 rounded-lg overflow-hidden z-50 py-1"
                    style={{
                      minWidth:  180,
                      maxHeight: 320,
                      overflowY: 'auto',
                      background:  'var(--color-bg-elevated)',
                      border:      '1px solid var(--color-border-default)',
                      boxShadow:   'var(--shadow-elevated)',
                    }}
                  >
                    {hotels.map(hotel => {
                      const isSelected = hotel.id === currentHotel?.id
                      return (
                        <button
                          key={hotel.id}
                          onClick={() => { switchHotel(hotel.id); setAdminDropOpen(false) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-all"
                          style={{ color: isSelected ? 'var(--color-accent-primary)' : 'var(--color-text-primary)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--overlay-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span className="flex-1 truncate">{hotel.hotel_name}</span>
                          {isSelected && <Check size={11} className="shrink-0" style={{ color: 'var(--color-accent-primary)' }} />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Right: hotel tabs (일반 유저만, 소속 호텔 2개 이상일 때) */}
            {!isAdmin && hotels.length > 0 && (
              <div className="flex rounded-lg bg-bg-tertiary overflow-hidden shrink-0" style={{ border: '1px solid var(--control-border)' }}>
                {hotels.map((hotel, i) => {
                  const isActive = hotel.id === currentHotel?.id
                  return (
                    <button
                      key={hotel.id}
                      onClick={() => switchHotel(hotel.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                        isActive ? 'text-accent-primary' : 'text-brand-muted hover:text-brand-text'
                      }`}
                      style={{
                        background:  isActive ? 'var(--accent-badge-bg)' : 'transparent',
                        borderRight: i < hotels.length - 1 ? '1px solid var(--control-divider)' : 'none',
                        cursor:      hotels.length === 1 ? 'default' : 'pointer',
                      }}
                    >
                      {i === 0 && <Building2 size={11} />}
                      {hotel.hotel_name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div key={pathname} className="w-full animate-page-enter" style={{ maxWidth: 1320 }}>
            <DateContext.Provider value={{ otbDate, vsOtbDate, otbDates, setOtbDate, setVsOtbDate }}>
              <FcstDateContext.Provider value={{ fcstDate, fcstDates, setFcstDate }}>
                {children}
              </FcstDateContext.Provider>
            </DateContext.Provider>
          </div>
        </main>
      </div>
    </div>
  )
}
