import { expect,it } from 'vitest';
import { filterMarketRows,lifetimeBounds,marketDateRange,marketRows,priceMedian } from '../marketPageModel';
import type { MarketObservation } from '../qsePrices';
import { marketChartData } from '../../../features/qse/components/MarketPriceChart';
it('uses Qatar dates and clamps month/year presets',()=>{
 expect(marketDateRange('1d','2026-10-11T21:01:00Z')).toEqual({from:'2026-10-12',to:'2026-10-12'});
 expect(marketDateRange('7d','2026-10-12T12:00:00Z').from).toBe('2026-10-06');
 expect(marketDateRange('1M','2026-03-31T12:00:00Z').from).toBe('2026-02-28');
 expect(marketDateRange('1Y','2024-02-29T12:00:00Z').from).toBe('2023-02-28');
 expect(marketDateRange('all')).toEqual({from:'',to:''});
});
it('filters the same series by source, date and flags without dropping independent manual entries',()=>{
 const raw:MarketObservation[]=[{id:'s2',source:'shared',date:'2026-10-12',price:12},{id:'m1',source:'manual',date:'2026-10-12',price:20},{id:'s1',source:'shared',date:'2026-10-11',price:10}];
 const rows=marketRows(raw);
 expect(rows.find(row=>row.id==='s2')?.outlier).toBe(true);
 expect(rows.find(row=>row.id==='m1')?.outlier).toBe(false);
 expect(filterMarketRows(rows,'app','2026-10-12','2026-10-12',true).map(row=>row.id)).toEqual(['s2']);
 expect(filterMarketRows(rows,'manual','','')).toHaveLength(1);
 expect(filterMarketRows(rows,'all','','')).toHaveLength(3);
});
it('lifetime bounds respect source and include reported extrema; medians use observations only',()=>{
 expect(lifetimeBounds([{price:10},{price:14}],{low:8,high:13},'all')).toEqual({low:8,high:14});
 expect(lifetimeBounds([{price:10},{price:14}],{low:8,high:13},'manual')).toEqual({low:10,high:14});
 expect(lifetimeBounds([{price:10}],{low:8,high:13},'app')).toEqual({low:8,high:13});
 expect(priceMedian([{price:1},{price:3},{price:2},{price:4}])).toBe(2.5);
});
it('chart guides include lifetime low/high and the exact median; overview sampling retains price extrema',()=>{
 const rows=Array.from({length:5000},(_,index)=>({id:String(index),source:'shared' as const,date:'2026-10-12',price:index===777?1:index===2345?99:10,outlier:false,deltaPct:null}));
 const chart=marketChartData(rows,{low:1,high:99});
 expect(chart.guides.map(guide=>guide.label)).toEqual(['Lifetime low','Lifetime high','Median']);
 expect(chart.guides[2].value).toBe(10);expect(chart.total).toBe(5000);expect(chart.ordered.length).toBeLessThanOrEqual(2000);
 expect(chart.ordered.some(row=>row.price===1)).toBe(true);expect(chart.ordered.some(row=>row.price===99)).toBe(true);
});
