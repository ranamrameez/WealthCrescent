import { cleanup,render,screen } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
const state=vi.hoisted(()=>({shares:10}));
vi.mock('../PositionDetail',()=>({PositionDetail:({section}:{section:string})=><div data-testid="position-detail">{section}</div>}));
vi.mock('../../../../components/SummaryGroupCard',()=>({SummaryGroupCard:({title,children}:{title:string;children:React.ReactNode})=><div data-testid="summary-group">{title}{children}</div>}));
vi.mock('../../hooks/useQSEDerived',()=>({useQSEDerived:()=>({positions:[{ticker:'TEST',shares:state.shares}]})}));
import { StockPortfolioSummary } from '../StockPortfolioSummary';
afterEach(cleanup);
it('shows the consolidated position overview before its comparison chart',()=>{
  render(<StockPortfolioSummary ticker="TEST"/>);
  expect(screen.getAllByTestId('position-detail').map(node=>node.textContent)).toEqual(['position','comparison-summary']);
  expect(screen.getByTestId('summary-group').textContent).toContain('Price comparison');
});
it('restores all-time statistics for a closed position',()=>{state.shares=0;render(<StockPortfolioSummary ticker="TEST"/>);expect(screen.getByTestId('position-detail').textContent).toBe('all-time');state.shares=10;});
