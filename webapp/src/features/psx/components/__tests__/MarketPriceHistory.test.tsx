import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const workbook={settings:{currency:'PKR'},marketPrices:{TEST:12},priceHistory:{TEST:[]},transactions:[{ticker:'TEST',date:'2026-10-12',time:'10:00',price:12}]};
vi.mock('../../../../store/psxWorkbookStore',()=>({usePSXWorkbookStore:(selector:(state:{workbook:typeof workbook})=>unknown)=>selector({workbook})}));
vi.mock('../../../qse/components/MarketPriceChart',()=>({MarketPriceChart:({rows,currency,timezone}:{rows:unknown[];currency:string;timezone:string})=><div>{rows.length} PSX points | {currency} | {timezone}</div>}));
import { MarketPriceHistory } from '../MarketPriceHistory';

afterEach(cleanup);
it('uses trade prices when manual PSX price history is not available',()=>{
  render(<MarketPriceHistory ticker="TEST" />);
  expect(screen.getByText('1 PSX points | PKR | Asia/Karachi')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Today'}).getAttribute('aria-pressed')).toBe('true');
});
