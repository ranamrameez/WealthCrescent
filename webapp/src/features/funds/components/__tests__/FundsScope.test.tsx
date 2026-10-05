import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { FundsScopeSummary } from '../FundsScope';
import { useFundsWorkbookStore } from '../../../../store/fundsWorkbookStore';
import { createEmptyFundsWorkbook } from '../../../../store/defaultFundsWorkbook';
import type { TransactionPageFilters } from '../../../../hooks/useUrlTransactionFilters';

afterEach(cleanup);
const filters: TransactionPageFilters = { period: 'custom', fromDate: '2026-10-01', toDate: '2026-10-31', direction: 'all', category: 'all', source: 'all', accountId: 'all' };
describe('Funds scope summaries', () => {
  it('sums only selected funds, carries pre-period holdings and separates pending units', () => {
    useFundsWorkbookStore.getState().setWorkbook({ ...createEmptyFundsWorkbook(), funds: [
      { id: 'a', name: 'First', code: 'A', platform: '', currencyCode: 'QAR' },
      { id: 'b', name: 'Second', code: 'B', platform: '', currencyCode: 'QAR' },
    ], transactions: [
      { id: 'old', ticker: 'a', action: 'BUY', date: '2026-09-01', shares: 10, price: 10 },
      { id: 'pending', ticker: 'a', action: 'BUY', date: '2026-10-01', shares: 5, price: 10, isPending: true },
      { id: 'other', ticker: 'b', action: 'BUY', date: '2026-09-01', shares: 100, price: 10 },
    ], priceHistory: { a: [{ date: '2026-10-01', price: 11 }], b: [{ date: '2026-10-01', price: 20 }] } });
    const { container, rerender } = render(<FundsScopeSummary ids={['a']} filters={filters} />);
    const actual = container.querySelector('.account-summary-card-balance')! as HTMLElement;
    expect(within(actual).getByText('110.00 QAR')).toBeTruthy();
    expect(within(actual).getByText('100.00 QAR')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.queryByText('2,110.00 QAR')).toBeNull();
    rerender(<FundsScopeSummary ids={['a', 'b']} filters={filters} />);
    expect(within(container.querySelector('.account-summary-card-balance')! as HTMLElement).getByText('2,110.00 QAR')).toBeTruthy();
  });
});
