'use client';

import { useHrNova } from './HrNovaContext';

// Phase 1 임시 대시보드 자리표시자 — Phase 2에서 교체 예정
export default function HrNovaDashboardPage() {
  const { hotel, hotelId } = useHrNova();
  return (
    <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚡</div>
      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1e3a5f', marginBottom: 8 }}>HR NOVA 대시보드</div>
      <div style={{ fontSize: '0.9rem', color: '#718096' }}>
        {hotelId
          ? `${hotel?.hotel_name ?? '선택한 호텔'} — 대시보드는 Phase 2에서 구현됩니다.`
          : '왼쪽 상단에서 호텔을 선택하거나 새 호텔을 추가하세요.'}
      </div>
    </div>
  );
}
