'use client';
import { createContext, useContext } from 'react';
import type { Hotel } from '@/lib/hr-nova/types';

export interface HrNovaCtx {
  hotelId: string;
  year: number;
  hotel: Hotel | null;
  hotels: Hotel[];
  setHotelId: (id: string) => void;
  setYear: (y: number) => void;
  reloadHotels: () => void;
}

export const HrNovaContext = createContext<HrNovaCtx>({
  hotelId: '',
  year: 2024,
  hotel: null,
  hotels: [],
  setHotelId: () => {},
  setYear: () => {},
  reloadHotels: () => {},
});

export const useHrNova = () => useContext(HrNovaContext);
