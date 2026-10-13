import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../PositionDetail',()=>({PositionDetail:({section}:{section:string})=><div data-testid="position-detail">{section}</div>}));
vi.mock('../../../../components/SummaryGroupCard',()=>({SummaryGroupCard:({title,children}:{title:string;children:React.ReactNode})=><div data-testid="summary-group" data-title={title}>{title}{children}</div>,SummaryMetric:({label,value}:{label:string;value:React.ReactNode})=><div data-testid={label}>{value}</div>}));
vi.mock('../../hooks/useQSEDerived',()=>({useQSEDerived:()=>({
  workbook:{settings:{currency:'QAR'},marketPrices:{TEST:12},transactions:[{ticker:'TEST',action:'BUY',shares:5,price:10,isPending:true}],tradePlans:[{legs:[{ticker:'TEST',action:'SELL',shares:2,price:12,executed:false},{ticker:'TEST',action:'BUY',shares:99,price:10,executed:true}]}]},
  positions:[{ticker:'TEST',shares:10,invested:101,realized:20,buyFees:1,sellFees:2}],calcFee:()=>1,
})}));
import { StockPortfolioSummary } from '../StockPortfolioSummary';
afterEach(cleanup);
it('uses official cost basis and fees while keeping pending and executed plans out of current holdings',()=>{
  render(<StockPortfolioSummary ticker="TEST" />);
  expect(screen.getAllByTestId('position-detail').map(node=>node.textContent)).toEqual(['position','comparison','all-time']);
  expect(screen.getAllByTestId('summary-group').map(node=>node.getAttribute('data-title'))).toEqual(['Current valuation','Lifetime performance','Planned activity']);
  expect(screen.queryByTestId('Shares')).toBeNull();
  expect(screen.getByTestId('Net liquidation value after sell fees').textContent).toContain('119');
  expect(screen.queryByTestId('Realized P/L')).toBeNull();
  expect(screen.queryByTestId('Fees paid')).toBeNull();
  expect(screen.getByTestId('Total P/L').textContent).toContain('38');
  expect(screen.getByTestId('Buy cost including fees').textContent).toContain('51');
  expect(screen.getByTestId('Net sell proceeds').textContent).toContain('23');
  expect(screen.getByTestId('Shares after orders and plans').textContent).toBe('13');
});

