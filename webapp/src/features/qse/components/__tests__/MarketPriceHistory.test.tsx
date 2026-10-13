import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { qatarDay } from '../../../../lib/stockData/qsePrices';
const state=vi.hoisted(()=>({denied:false,paths:[] as string[]}));
vi.mock('../../../../lib/firebase/client',()=>({db:{}}));
vi.mock('../../../../lib/firebase/useAuthState',()=>({useAuthState:()=>({user:{uid:'alice'},authResolved:true})}));
vi.mock('../../../../components/MarketPriceChart',()=>({MarketPriceChart:({rows,bounds}:{rows:{source:string}[];bounds:{low:number;high:number}|null})=><div><span>{rows.filter(row=>row.source==='shared').length} shared points; {rows.filter(row=>row.source==='manual').length} manual points</span><span>Bounds {bounds?.low} to {bounds?.high}</span></div>}));
vi.mock('../../../../store/workbookStore',()=>({useWorkbookStore:(selector:(s:unknown)=>unknown)=>selector({workbook:{priceHistory:{QFLS:[{date:qatarDay(),price:10}]},settings:{currency:'QAR'}}})}));
vi.mock('firebase/database',()=>({
  ref:(_db:unknown,path:string)=>path,orderByChild:(key:string)=>key,startAt:(value:string)=>value,endAt:(value:string)=>value,query:(path:string)=>path,
  onValue:(path:string,success:(snapshot:{val:()=>unknown})=>void,error:(error:Error)=>void)=>{
    state.paths.push(path);
    if(state.denied)error(new Error('Denied'));
    else success({val:()=>path.endsWith('allTimeBounds')?{low:9,high:13}:{one:{date:qatarDay(),time:new Date().toISOString(),price:12,dayHigh:13,dayLow:9}}});
    return ()=>{};
  },
}));
import { MarketPriceHistory } from '../MarketPriceHistory';
afterEach(()=>{cleanup();state.denied=false;state.paths=[];});
it('shows both sources and reported bounds from the shared root',()=>{
  render(<MarketPriceHistory ticker="QFLS" />);
  expect(screen.getByText('Bounds 9 to 13')).toBeTruthy();
  expect(screen.getByText(/1 shared points; 1 manual points/)).toBeTruthy();
  expect(state.paths).toEqual(['QSE/tickers/QFLS/allPrices','QSE/tickers/QFLS/allTimeBounds']);
});
it('keeps manual history visible when shared reads fail',()=>{
  state.denied=true;render(<MarketPriceHistory ticker="QFLS" />);
  expect(screen.getByText(/0 shared points; 1 manual points/)).toBeTruthy();expect(screen.getByRole('alert').textContent).toContain('Denied');
});

it('defaults the chart timeframe to Today',()=>{
  render(<MarketPriceHistory ticker="QFLS" />);
  expect(screen.getByRole('button',{name:'Today'}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText(/1 shared points; 1 manual points/)).toBeTruthy();
});
