import type { MarketObservation } from './qsePrices';
import { qatarDay } from './qsePrices';
export type MarketSource='all'|'manual'|'app';
export const MARKET_PERIODS=['1d','7d','1M','3M','6M','1Y','all'] as const;
export const MARKET_PERIOD_LABELS:Record<string,string>={'1d':'Today','7d':'7 Days','1M':'1 Month','3M':'3 Months','6M':'6 Months','1Y':'1 Year','all':'All Time'};
export function marketPeriodLabel(period:string,from='',to='') {
  return MARKET_PERIOD_LABELS[period] || `From ${from || 'earliest'} to ${to || 'latest'}`;
}
export function marketDateRange(period:string,now=new Date().toISOString(),dayForTime:(time:string)=>string=qatarDay) {
  if(period==='all')return {from:'',to:''};
  const to=dayForTime(now), date=new Date(to+'T00:00:00Z');
  if(period==='1d')return {from:to,to};
  if(period==='7d')date.setUTCDate(date.getUTCDate()-6);
  else {const months=({'1M':1,'3M':3,'6M':6,'1Y':12} as Record<string,number>)[period];if(!months)throw new Error('Unknown timeframe');const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-months);date.setUTCDate(Math.min(day,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));}
  return {from:date.toISOString().slice(0,10),to};
}
export interface MarketRow extends MarketObservation {outlier:boolean;deltaPct:number|null;}
export function marketRows(rows:MarketObservation[]):MarketRow[] {
  const previous:Record<'shared'|'manual',number|null>={shared:null,manual:null};
  return [...rows].reverse().map(row=>{
    const stored=row as MarketObservation&{previousPrice?:number;outlier?:boolean};
    const prior=previous[row.source] ?? (Number.isFinite(stored.previousPrice)?stored.previousPrice!:null);
    const deltaPct=prior&&prior>0?(row.price-prior)/prior*100:null;
    previous[row.source]=row.price;
    return {...row,deltaPct,outlier:deltaPct===null?!!stored.outlier:Math.abs(deltaPct)>10+1e-9};
  }).reverse();
}
export function filterMarketRows(rows:MarketRow[],source:MarketSource,from:string,to:string,flagged=false) {
  return rows.filter(row=>(source==='all'||row.source===(source==='app'?'shared':'manual'))&&(!from||row.date>=from)&&(!to||row.date<=to)&&(!flagged||row.outlier));
}
export function priceMedian(rows:{price:number}[]) {
  const prices=rows.map(row=>row.price).filter(Number.isFinite).sort((a,b)=>a-b);
  const middle=Math.floor(prices.length/2);return !prices.length?null:prices.length%2?prices[middle]:(prices[middle-1]+prices[middle])/2;
}
export function previousSessionClose(rows:MarketRow[]) {
  const ordered=[...rows].sort((a,b)=>(a.time || a.date).localeCompare(b.time || b.date));
  const latestDate=ordered.at(-1)?.date;
  return latestDate ? ordered.filter(row=>row.date<latestDate).at(-1)?.price : undefined;
}
export function lifetimeBounds(manual:{price:number}[],app:{low:number;high:number}|null,source:MarketSource) {
  const values=source==='app'?[]:manual.map(row=>row.price).filter(value=>Number.isFinite(value)&&value>0);
  if(source!=='manual'&&app)values.push(app.low,app.high);
  const finite=values.filter(value=>Number.isFinite(value)&&value>0);
  return finite.length?{low:finite.reduce((a,b)=>Math.min(a,b)),high:finite.reduce((a,b)=>Math.max(a,b))}:null;
}
