import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { InvestmentBalanceSummary } from '../InvestmentBalanceSummary';
import type { TransactionPageFilters } from '../../hooks/useUrlTransactionFilters';

afterEach(cleanup);
describe('Investment balance scopes', () => {
  it('keeps old holdings in the opening balance, excludes pending orders and unrelated stocks', () => {
    const filters: TransactionPageFilters = { period: 'custom', fromDate: '2026-09-01', toDate: '2026-09-30', direction: 'all', category: 'all', source: 'all', accountId: 'all' };
    const { container } = render(<InvestmentBalanceSummary tickers={['A']} currency="QAR" filters={filters} marketPrices={{ A: 100 }} priceHistory={{ A: [{ date: '2026-09-10', price: 12 }] }} transactions={[
      { id: 'old', ticker: 'A', action: 'BUY', date: '2026-08-01', shares: 10, price: 10 },
      { id: 'pending', ticker: 'A', action: 'BUY', date: '2026-09-01', shares: 2, price: 11, isPending: true },
      { id: 'other', ticker: 'B', action: 'BUY', date: '2026-09-01', shares: 100, price: 100 },
    ]} plans={[{ id: 'plan', name: 'Planned sell', createdAt: '', legs: [{ ticker: 'A', action: 'SELL', shares: 1, price: 12, date: '2026-09-25' }] }]} />);
    const actual = container.querySelector('.account-summary-card-balance')! as HTMLElement;
    expect(within(actual).getByText('100.00 QAR')).toBeTruthy();
    expect(within(actual).getByText('120.00 QAR')).toBeTruthy();
    expect(container.textContent).toContain('130.00 QAR');
    expect(container.textContent).not.toContain('10,000.00');
  });
});
