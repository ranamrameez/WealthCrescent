import { cleanup,render,screen } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
vi.mock('../PositionDetail',()=>({PositionDetail:({section}:{section:string})=><div data-testid="position-detail">{section}</div>}));
import { StockPortfolioSummary } from '../StockPortfolioSummary';
afterEach(cleanup);
it('shows the consolidated position overview before its comparison chart',()=>{
  render(<StockPortfolioSummary ticker="TEST"/>);
  expect(screen.getAllByTestId('position-detail').map(node=>node.textContent)).toEqual(['position','comparison']);
});
