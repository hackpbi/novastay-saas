'use client';

import { useState } from 'react';
import { useHrNova } from '@/app/hr-nova/HrNovaContext';
import { upsertHotel } from '@/lib/hr-nova/queries';
import { showToast } from './Toast';
import type { HotelGrade } from '@/lib/hr-nova/types';

// ── 사이드바 상단 호텔 선택 드롭다운 (원본에 없는 SaaS 추가 기능) ──
export default function HotelSelector() {
  const { hotelId, year, hotels, setHotelId, reloadHotels } = useHrNova();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<HotelGrade>('5성급');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { showToast('호텔명을 입력하세요.', 'warn'); return; }
    setSaving(true);
    try {
      const row = await upsertHotel({
        hotel_name: trimmed,
        hotel_grade: grade,
        total_rooms: 0,
        total_staff: 0,
        analysis_year: year,
      });
      reloadHotels();
      if (row?.id) setHotelId(row.id);
      setName('');
      setAdding(false);
      showToast('✅ 새 호텔이 추가되었습니다!', 'success');
    } catch (e) {
      showToast('호텔 추가에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const selStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 8,
    color: '#fff',
    fontSize: '0.82rem',
    fontWeight: 600,
    padding: '8px 10px',
    cursor: 'pointer',
    outline: 'none',
  };

  return (
    <div style={{ padding: '14px 16px 4px' }}>
      <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)', letterSpacing: 0.8, marginBottom: 6 }}>
        SELECT HOTEL
      </div>

      <select
        value={hotelId}
        onChange={(e) => setHotelId(e.target.value)}
        style={selStyle}
      >
        <option value="" style={{ color: '#1e3a5f' }}>— 호텔 선택 —</option>
        {hotels.map((h) => (
          <option key={h.id} value={h.id} style={{ color: '#1e3a5f' }}>
            {h.hotel_name} ({h.hotel_grade})
          </option>
        ))}
      </select>

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          style={{
            width: '100%',
            marginTop: 8,
            background: 'rgba(103,232,249,0.15)',
            border: '1px solid rgba(103,232,249,0.35)',
            borderRadius: 8,
            color: '#a5f3fc',
            fontSize: '0.78rem',
            fontWeight: 700,
            padding: '7px 10px',
            cursor: 'pointer',
          }}
        >
          ＋ 새 호텔
        </button>
      ) : (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="호텔명 입력"
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 8,
              color: '#fff',
              fontSize: '0.82rem',
              padding: '7px 10px',
              outline: 'none',
            }}
          />
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value as HotelGrade)}
            style={selStyle}
          >
            {(['5성급','4성급','3성급','2성급','1성급','기타'] as HotelGrade[]).map((g) => (
              <option key={g} value={g} style={{ color: '#1e3a5f' }}>{g}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleCreate}
              disabled={saving}
              style={{
                flex: 1,
                background: '#e8a020',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '7px 10px',
                cursor: saving ? 'default' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? '저장 중…' : '추가'}
            </button>
            <button
              onClick={() => { setAdding(false); setName(''); }}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.8)',
                fontSize: '0.78rem',
                fontWeight: 600,
                padding: '7px 10px',
                cursor: 'pointer',
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
