import { useEffect } from 'react';
import { limitToLast, onValue, orderByChild, query, ref } from 'firebase/database';
import { db } from './client';
import { useWorkbookStore } from '../../store/workbookStore';
import { useQseFeed } from '../../features/qse/hooks/useLiveQseWorkbook';
import { qatarDay } from '../stockData/qsePrices';
import type { PricePoint } from '../../types/workbook';
export function useLiveQseSync(uid?: string) {
  const workbook = useWorkbookStore(s=>s.workbook);
  const key = [...new Set([...workbook.transactions.map(t=>t.ticker),...workbook.watchlist.map(t=>t.ticker),...workbook.tradePlans.flatMap(t=>[t.defaultTicker || '',...t.legs.map(leg=>leg.ticker)]),...Object.keys(workbook.priceHistory)])].filter(t=>/^[A-Z][A-Z0-9]{1,5}$/.test(t)).sort().join('|');
  useEffect(()=>{
    useQseFeed.setState({points:{},error:''});
    if (!db || !uid || !key) return;
    const stops = key.split('|').map(ticker => onValue(query(ref(db!,'QSE/tickers/'+ticker+'/allPrices'),orderByChild('time'),limitToLast(1000)),snap=>{
      const points = Object.values(snap.val() || {}).filter((p): p is PricePoint => !!p && typeof p === 'object' && 'price' in p && 'time' in p && Number.isFinite((p as PricePoint).price) && Number.isFinite(Date.parse((p as PricePoint).time || ''))).map(p=>({...p,date:qatarDay(p.time)}));
      useQseFeed.setState(state=>({points:{...state.points,[ticker]:points},error:''}));
    },error=>useQseFeed.setState(state=>({points:{...state.points,[ticker]:[]},error:error.message}))));
    return ()=>{stops.forEach(stop=>stop());useQseFeed.setState({points:{},error:''});};
  },[uid,key]);
}
