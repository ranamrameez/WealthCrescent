import { useMemo } from 'react';
import { create } from 'zustand';
import type { PricePoint } from '../../../types/workbook';
import type { PSXWorkbook } from '../../../types/psxWorkbook';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';
import { applyLivePsx } from '../../../lib/stockData/livePsx';

export const usePsxFeed = create<{ points: Record<string, PricePoint[]>; error: string; loading: boolean; updatedAt: string }>(() => ({ points: {}, error: '', loading: false, updatedAt: '' }));
const overlays = new WeakMap<PSXWorkbook, { points: Record<string, PricePoint[]>; value: PSXWorkbook }>();

export function useLivePsxWorkbook() {
  const workbook = usePSXWorkbookStore(state => state.workbook);
  const points = usePsxFeed(state => state.points);
  return useMemo(() => {
    const existing = overlays.get(workbook);
    if (existing?.points === points) return existing.value;
    const value = Object.keys(points).length ? applyLivePsx(workbook, points) : workbook;
    overlays.set(workbook, { points, value });
    return value;
  }, [workbook, points]);
}
