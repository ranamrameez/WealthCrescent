import { useMemo } from 'react';
import { create } from 'zustand';
import type { PricePoint } from '../../../types/workbook';
import type { Workbook } from '../../../types/workbook';
import { useWorkbookStore } from '../../../store/workbookStore';
import { applyLiveQse } from '../../../lib/stockData/liveQse';
export const useQseFeed = create<{ points:Record<string,PricePoint[]>; error:string }>(() => ({points:{},error:''}));
const overlays = new WeakMap<Workbook, { points: Record<string, PricePoint[]>; value: Workbook }>();
export function useLiveQseWorkbook() {
  const workbook = useWorkbookStore(s=>s.workbook);
  const points = useQseFeed(s=>s.points);
  return useMemo(()=>{
    const cached=overlays.get(workbook);
    if(cached?.points===points)return cached.value;
    const value=Object.keys(points).length?applyLiveQse(workbook,points):workbook;
    overlays.set(workbook,{points,value});
    return value;
  },[workbook,points]);
}
