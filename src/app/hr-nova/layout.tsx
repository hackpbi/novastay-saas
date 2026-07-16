'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/hr-nova/constants';
import { fetchHotels } from '@/lib/hr-nova/queries';
import { saveAndRecalc } from '@/lib/hr-nova/saveAndRecalc';
import type { Hotel } from '@/lib/hr-nova/types';
import { HrNovaContext } from './HrNovaContext';
import HotelSelector from '@/components/hr-nova/HotelSelector';
import { ToastContainer, showToast } from '@/components/hr-nova/Toast';

const FA_HREF = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';

// ── Font Awesome 6 CDN 주입 (head) ─────────────────────────
function useFontAwesome() {
  useEffect(() => {
    if (document.querySelector('link[data-hr-nova-fa]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FA_HREF;
    link.setAttribute('data-hr-nova-fa', '1');
    document.head.appendChild(link);
  }, []);
}

function HrNovaShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  useFontAwesome();

  const urlHotelId = searchParams.get('hotelId') || '';
  const urlYear = Number(searchParams.get('year')) || 2024;

  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelIdState] = useState(urlHotelId);
  const [year, setYearState] = useState(urlYear);

  // ── URL ↔ state 동기화 ──
  useEffect(() => { setHotelIdState(urlHotelId); }, [urlHotelId]);
  useEffect(() => { setYearState(urlYear); }, [urlYear]);

  const loadHotels = useCallback(async () => {
    try { setHotels(await fetchHotels()); }
    catch { showToast('호텔 목록을 불러오지 못했습니다.', 'error'); }
  }, []);
  useEffect(() => { loadHotels(); }, [loadHotels]);

  // ── ?hotelId=xxx&year=2024 URL 업데이트 ──
  const pushUrl = useCallback((nextHotelId: string, nextYear: number) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (nextHotelId) params.set('hotelId', nextHotelId); else params.delete('hotelId');
    params.set('year', String(nextYear));
    router.replace(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  const setHotelId = useCallback((id: string) => {
    setHotelIdState(id);
    pushUrl(id, year);
  }, [pushUrl, year]);

  const setYear = useCallback((y: number) => {
    setYearState(y);
    pushUrl(hotelId, y);
  }, [pushUrl, hotelId]);

  const hotel = useMemo(() => hotels.find((h) => h.id === hotelId) ?? null, [hotels, hotelId]);

  // ── 현재 페이지 타이틀/서브타이틀 (NAV_ITEMS 자동 조회) ──
  const active = useMemo(() => {
    const items = NAV_ITEMS.filter((it): it is Extract<typeof it, { href: string }> => 'href' in it);
    // 정확 매치 우선, 없으면 가장 긴 prefix 매치
    const exact = items.find((it) => it.href === pathname);
    if (exact) return exact;
    return items
      .filter((it) => pathname.startsWith(it.href) && it.href !== '/hr-nova')
      .sort((a, b) => b.href.length - a.href.length)[0]
      ?? items.find((it) => it.href === '/hr-nova');
  }, [pathname]);

  const pageTitle = active?.label ?? '대시보드';
  const pageSubtitle = active?.subtitle ?? '';

  // ── 저장(재계산) ──
  const handleSave = async () => {
    if (!hotelId) { showToast('먼저 호텔을 선택하세요.', 'warn'); return; }
    try {
      await saveAndRecalc(hotelId, year);
      showToast('✅ 저장 및 손익 재계산 완료!', 'success');
    } catch {
      showToast('저장에 실패했습니다.', 'error');
    }
  };

  const ctx = useMemo(() => ({
    hotelId, year, hotel, hotels, setHotelId, setYear, reloadHotels: loadHotels,
  }), [hotelId, year, hotel, hotels, setHotelId, setYear, loadHotels]);

  const withParams = (href: string) => {
    const params = new URLSearchParams();
    if (hotelId) params.set('hotelId', hotelId);
    params.set('year', String(year));
    return `${href}?${params.toString()}`;
  };

  return (
    <HrNovaContext.Provider value={ctx}>
      <div style={{ fontFamily: "'Noto Sans KR','Segoe UI',sans-serif", color: '#2d3748', background: '#f8fafc', minHeight: '100vh' }}>
        {/* ==================== SIDEBAR ==================== */}
        <div style={{
          position: 'fixed', left: 0, top: 0, bottom: 0, width: 260,
          background: 'linear-gradient(180deg, #1e3a5f 0%, #152a4a 100%)',
          color: 'white', display: 'flex', flexDirection: 'column', zIndex: 100,
          boxShadow: '4px 0 20px rgba(0,0,0,0.15)',
        }}>
          {/* 로고 */}
          <div style={{ padding: '28px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: '1.6rem', letterSpacing: -2, fontWeight: 900, color: 'white', textShadow: '0 2px 12px rgba(0,0,0,0.4)', lineHeight: 1 }}>
                HR<span style={{ color: '#67e8f9' }}>NOVA</span>
              </div>
              <div style={{ background: 'rgba(103,232,249,0.18)', border: '1px solid rgba(103,232,249,0.4)', borderRadius: 5, padding: '2px 7px', fontSize: '0.62rem', fontWeight: 700, color: '#a5f3fc', letterSpacing: 0.5 }}>
                v2.0
              </div>
            </div>
            <h1 style={{ fontSize: '0.78rem', letterSpacing: 0.3, opacity: 0.8, fontWeight: 500, margin: 0 }}>호텔 인력·손익 경영 플랫폼</h1>
            <p style={{ fontSize: '0.72rem', opacity: 0.6, marginTop: 4, fontWeight: 300 }}>Hotel P&amp;L Consulting Pro</p>
          </div>

          {/* 호텔 선택 드롭다운 */}
          <HotelSelector />

          {/* nav */}
          <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
            {NAV_ITEMS.map((item, idx) => {
              if ('section' in item) {
                return (
                  <div key={`sec-${idx}`} style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: 1.5, opacity: 0.45, padding: '16px 24px 6px', textTransform: 'uppercase' }}>
                    {item.section}
                  </div>
                );
              }
              const isActive = active && 'href' in item && active.href === item.href;
              const accent = 'accent' in item && item.accent;
              return (
                <Link
                  key={item.href}
                  href={withParams(item.href)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px',
                    color: isActive ? '#fff' : (accent ? '#a5b4fc' : 'rgba(255,255,255,0.75)'),
                    textDecoration: 'none', fontSize: '0.88rem', fontWeight: accent ? 700 : 500,
                    transition: 'all 0.2s',
                    borderLeft: isActive ? '3px solid #e8a020' : (accent ? '3px solid #6366f1' : '3px solid transparent'),
                    background: isActive ? 'rgba(255,255,255,0.1)' : (accent ? 'linear-gradient(90deg,rgba(99,102,241,0.15),transparent)' : 'transparent'),
                  }}
                >
                  <i className={item.icon} style={{ width: 18, textAlign: 'center', fontSize: '0.9rem', color: accent ? '#6366f1' : undefined }} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* 사이드바 하단 현재 호텔 */}
          {hotel && (
            <div style={{ margin: '12px 16px 0', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', letterSpacing: 0.8, marginBottom: 4 }}>CURRENT HOTEL</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hotel.hotel_name}</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(103,232,249,0.8)', marginTop: 2 }}>{hotel.hotel_grade} · {year}년</div>
            </div>
          )}

          {/* footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.72rem', opacity: 0.5 }}>
            © 2025 HR NOVA
          </div>
        </div>

        {/* ==================== MAIN ==================== */}
        <div style={{ marginLeft: 260, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {/* 탑바 */}
          <div style={{
            background: 'white', padding: '16px 32px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0',
            position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
          }}>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e3a5f' }}>{pageTitle}</div>
              <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: 2 }}>{pageSubtitle}</div>
            </div>

            {/* 가운데: 호텔 뱃지 */}
            {hotel && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,rgba(30,58,95,0.08),rgba(45,90,142,0.12))', border: '1.5px solid rgba(45,90,142,0.25)', borderRadius: 10, padding: '7px 16px', margin: '0 auto 0 16px' }}>
                <i className="fas fa-hotel" style={{ color: '#2d5a8e', fontSize: '1rem' }} />
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e3a5f', letterSpacing: 0.3 }}>{hotel.hotel_name}</span>
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: 4 }}>{hotel.hotel_grade} · {hotel.total_rooms || 0}실</span>
              </div>
            )}

            {/* 우: 연도 + 액션 버튼 */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.82rem', fontWeight: 600, color: '#1e3a5f', background: 'white', cursor: 'pointer' }}
              >
                {[2022, 2023, 2024, 2025, 2026].map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              <button onClick={handleSave} style={btnOutline}><i className="fas fa-save" /> 저장</button>
              <button onClick={() => showToast('각 입력 페이지에서 데이터를 불러옵니다.', 'info')} style={{ ...btnOutline, background: '#e8f4fd', borderColor: '#2d5a8e', color: '#2d5a8e' }}><i className="fas fa-folder-open" /> 불러오기</button>
              <Link href={withParams('/hr-nova/ai-report')} style={{ ...btnAccent, textDecoration: 'none' }}><i className="fas fa-file-powerpoint" /> PPT 생성</Link>
              <Link href={withParams('/hr-nova/ai-report')} style={{ ...btnAccent, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', textDecoration: 'none' }}><i className="fas fa-robot" /> AI 리포트</Link>
            </div>
          </div>

          {/* 본문 */}
          <div style={{ padding: '28px 32px', flex: 1 }}>
            {children}
          </div>
        </div>

        <ToastContainer />
      </div>
    </HrNovaContext.Provider>
  );
}

const btnBase: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
  cursor: 'pointer', border: 'none', transition: 'all 0.2s',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
const btnOutline: React.CSSProperties = { ...btnBase, background: 'white', color: '#1e3a5f', border: '1.5px solid #1e3a5f' };
const btnAccent: React.CSSProperties = { ...btnBase, background: '#e8a020', color: 'white' };

export default function HrNovaLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <HrNovaShell>{children}</HrNovaShell>
    </Suspense>
  );
}
