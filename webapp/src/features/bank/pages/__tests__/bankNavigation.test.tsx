import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AccountDetailPage, BankDetailPage } from '../BankPage';
import { TopBar } from '../../../../components/TopBar';
import { useBankWorkbookStore } from '../../../../store/bankWorkbookStore';
import { createEmptyBankWorkbook } from '../../../../store/defaultBankWorkbook';

vi.mock('react-chartjs-2', () => ({ Bar: () => <div>Bar chart</div>, Line: () => <div>Line chart</div>, Doughnut: () => <div>Doughnut chart</div> }));
vi.mock('../../../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => false }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 25, 12));
  const workbook = createEmptyBankWorkbook();
  workbook.settings.banks = [{ id: 'b1', name: 'First Bank' }, { id: 'b2', name: 'Second Bank' }];
  workbook.settings.accounts = [
    { id: 'a1', name: 'Checking', bankId: 'b1', currencyCode: 'USD', openingBalance: 1000 },
    { id: 'a2', name: 'Savings', bankId: 'b2', currencyCode: 'USD', openingBalance: 500 },
  ];
  workbook.transactions = [
    { id: 'old', accountId: 'a1', date: '2026-08-31', amount: 50, description: 'Prior month', isDeposit: true, source: 'manual' },
    { id: 'future', accountId: 'a1', date: '2026-09-29', amount: -50, description: 'Future cleared payment', isDeposit: false, source: 'manual' },
    { id: 'pending', accountId: 'a1', date: '2026-10-10', amount: -100, description: 'Future pending payment', isDeposit: false, isPending: true, source: 'manual' },
    { id: 'other', accountId: 'a2', date: '2026-10-11', amount: 20, description: 'Savings deposit', isDeposit: true, source: 'manual' },
  ];
  useBankWorkbookStore.setState({ workbook });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function show(url: string) {
  return render(<MemoryRouter initialEntries={[url]}><TopBar /><Routes>
    <Route path="/bank/account/:id" element={<AccountDetailPage />} />
    <Route path="/bank/bank/:id" element={<BankDetailPage />} />
  </Routes></MemoryRouter>);
}

it('shows future and pending rows from month start, and switches accounts', () => {
  show('/bank/account/a1?section=transactions');
  expect(screen.queryByText('Future cleared payment')).not.toBeNull();
  expect(screen.queryByText('Future pending payment')).not.toBeNull();
  expect(screen.queryByText('Prior month')).toBeNull();
  expect(screen.queryByLabelText('Switch bank')).toBeNull();
  fireEvent.change(screen.getByLabelText('Switch account'), { target: { value: 'a2' } });
  expect(screen.queryByText('Savings deposit')).not.toBeNull();
  expect(screen.queryByText('Future cleared payment')).toBeNull();
});

it('provides a bank switcher and bank-scoped analytics on bank details', () => {
  show('/bank/bank/b1?section=analytics');
  expect(screen.queryByLabelText('Switch bank')).not.toBeNull();
  expect(screen.queryAllByText('Analytics').length).toBeGreaterThan(0);
  expect(screen.queryByText('Line chart')).not.toBeNull();
  const options = screen.getAllByRole('option').map(option => option.textContent);
  expect(options).toContain('Checking (USD)');
  expect(options).not.toContain('Savings (USD)');
  fireEvent.change(screen.getByLabelText('Switch bank'), { target: { value: 'b2' } });
  expect(screen.queryByText('Savings')).not.toBeNull();
});

it('honors a chosen end date and restores future rows when filters are reset', () => {
  show('/bank/account/a1?section=transactions&period=custom&from=2026-09-01&to=2026-09-25');
  expect(screen.queryByText('Future cleared payment')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.queryByText('Future cleared payment')).not.toBeNull();
  expect(screen.queryByText('Future pending payment')).not.toBeNull();
  expect(screen.queryByText('Prior month')).toBeNull();
});

it('offers plan creation on an account even when it has no upcoming plans', () => {
  show('/bank/account/a1?section=plans');
  fireEvent.click(screen.getByRole('button', { name: 'Add plan' }));
  expect(screen.queryByText('Add a plan')).not.toBeNull();
});
