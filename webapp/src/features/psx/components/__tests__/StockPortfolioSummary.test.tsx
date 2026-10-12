import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../PositionDetail',()=>({PositionDetail:()=>null}));
vi.mock('../../../../components/SummaryGroupCard',()=>({
  SummaryGroupCard:({title,children}:{title:string;children:React.ReactNode})=><div>{title}{children}</div>,
  SummaryMetric:({label,value}:{label:string;value:React.ReactNode})=><div data-testid={label}>{value}</div>,
}));
vi.mock('../../hooks/usePSXDerived',()=>({usePSXDerived:()=>({
  workbook:{settings:{currency:'PKR'},marketPrices:{TEST:12},transactions:[{ticker:'TEST',action:'BUY',shares:5,price:10,isPending:true}],tradePlans:[{legs:[{ticker:'TEST',action:'SELL',shares:2,price:12,executed:false},{ticker:'TEST',action:'BUY',shares:99,price:10,executed:true}]}]},
  positions:[{ticker:'TEST',shares:10,invested:101,realized:20,buyFees:1,sellFees:2}],calcFee:()=>1,
})}));
import { StockPortfolioSummary } from '../StockPortfolioSummary';

afterEach(cleanup);
it('keeps official current holdings separate from pending and planned PSX activity',()=>{
  render(<StockPortfolioSummary ticker="TEST" />);
  expect(screen.getByTestId('Net liquidation value after sell fees').textContent).toContain('119');
  expect(screen.getByTestId('Total P/L').textContent).toContain('38');
  expect(screen.getByTestId('Buy cost including fees').textContent).toContain('51');
  expect(screen.getByTestId('Net sell proceeds').textContent).toContain('23');
  expect(screen.getByTestId('Shares after orders and plans').textContent).toBe('13');
});
