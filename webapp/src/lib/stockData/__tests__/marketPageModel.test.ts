import { expect,it } from 'vitest';
import { filterMarketRows,lifetimeBounds,marketDateRange,marketPeriodLabel,marketRows,previousSessionClose,priceMedian } from '../marketPageModel';
import type { MarketObservation } from '../qsePrices';
import { marketChartData } from '../../../components/MarketPriceChart';
import { pakistanDay } from '../livePsx';
it('uses Pakistan session dates for PSX while retaining Qatar defaults',()=>{
 expect(marketDateRange('1d','2026-10-11T20:01:00Z',pakistanDay)).toEqual({from:'2026-10-12',to:'2026-10-12'});
 expect(marketDateRange('1d','2026-10-11T20:01:00Z')).toEqual({from:'2026-10-11',to:'2026-10-11'});
});
it('uses Qatar dates and clamps month/year presets',()=>{
 expect(marketDateRange('1d','2026-10-11T21:01:00Z')).toEqual({from:'2026-10-12',to:'2026-10-12'});
 expect(marketDateRange('7d','2026-10-12T12:00:00Z').from).toBe('2026-10-06');
 expect(marketDateRange('1M','2026-03-31T12:00:00Z').from).toBe('2026-02-28');
 expect(marketDateRange('1Y','2024-02-29T12:00:00Z').from).toBe('2023-02-28');
 expect(marketDateRange('all')).toEqual({from:'',to:''});
 expect(marketPeriodLabel('1d')).toBe('Today');
 expect(marketPeriodLabel('7d')).toBe('7 Days');
 expect(marketPeriodLabel('custom','2026-10-01','2026-10-12')).toBe('From 2026-10-01 to 2026-10-12');
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
it('labels period low, high and current while keeping reference guides hidden',()=>{
 const rows=Array.from({length:5000},(_,index)=>({id:String(index),source:'shared' as const,date:'2026-10-12',price:index===777?1:index===2345?99:10,outlier:false,deltaPct:null}));
 const chart=marketChartData(rows,{low:0.5,high:120},9);
 expect([...chart.highlights.values()].flat().some(label=>label.startsWith('Period low '))).toBe(true);
 expect([...chart.highlights.values()].flat().some(label=>label.startsWith('Period high '))).toBe(true);
 expect([...chart.highlights.values()].flat().some(label=>label.startsWith('Current price '))).toBe(true);
 const guides=chart.datasets.filter(dataset=>['Period low','Period high','Lifetime low','Lifetime high','Median','Previous close'].includes(dataset.label||''));
 expect(guides.map(dataset=>dataset.label)).toEqual(['Period low','Period high','Lifetime low','Lifetime high','Median','Previous close']);
 const sevenDayGuides=marketChartData(rows,{low:0.5,high:120},9,undefined,'7 Day').datasets.map(dataset=>dataset.label);
 expect(sevenDayGuides).toEqual(expect.arrayContaining(['7 Day low','7 Day high']));
 expect(guides.every(dataset=>dataset.hidden===true)).toBe(true);expect(chart.total).toBe(5000);expect(chart.ordered.length).toBeLessThanOrEqual(2000);
 expect(chart.ordered.some(row=>row.price===1)).toBe(true);expect(chart.ordered.some(row=>row.price===99)).toBe(true);
});
it('uses the prior trading session close to color the current price trend',()=>{
 const rows=marketRows([
  {id:'now',source:'shared',date:'2026-10-12',time:'2026-10-12T10:00:00Z',price:11},
  {id:'close',source:'shared',date:'2026-10-09',time:'2026-10-09T10:00:00Z',price:12},
 ]);
 const close=previousSessionClose(rows);
 expect(close).toBe(12);
 expect(marketChartData(rows,null,close).datasets[0].borderColor).toBe('#dc2626');
 expect(marketChartData(rows.map(row=>row.id==='now'?{...row,price:13}:row),null,close).datasets[0].borderColor).toBe('#16a34a');
});
