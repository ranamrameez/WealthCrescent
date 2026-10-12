import { useMemo } from 'react';
import { create } from 'zustand';
import type { PricePoint } from '../../../types/workbook';
import { useWorkbookStore } from '../../../store/workbookStore';
import { applyLiveQse } from '../../../lib/stockData/liveQse';
export const useQseFeed = create<{ points:Record<string,PricePoint[]>; error:string }>(() => ({points:{},error:''}));
export function useLiveQseWorkbook() {
  const workbook = useWorkbookStore(s=>s.workbook);
  const points = useQseFeed(s=>s.points);
  return useMemo(()=>applyLiveQse(workbook,points),[workbook,points]);
}
