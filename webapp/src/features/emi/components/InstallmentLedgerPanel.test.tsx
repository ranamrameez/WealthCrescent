import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InstallmentLedgerPanel } from './InstallmentLedgerPanel';
import { useEMIWorkbookStore } from '../../../store/emiWorkbookStore';
vi.mock('../../../lib/firebase/client', () => ({ auth: { currentUser: { uid: 'fixture' } }, db: null, firebaseReady: false }));
vi.mock('../../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));
vi.mock('../../../components/AppCharts', () => ({ AppBar: () => <div role="img" aria-label="Monthly payments" />, AppLine: () => <div role="img" aria-label="Monthly balances" /> }));
const original = useEMIWorkbookStore.getState().workbook;
afterEach(() => { cleanup(); useEMIWorkbookStore.getState().setWorkbook(original); });
it('records multiple same-day receipts through the independent payment form without changing contract amounts', async () => {
  const contract = [{ id: 'one', dueDate: '2026-01-10', amount: 1000, description: 'Contract' }];
  useEMIWorkbookStore.getState().setWorkbook({ settings: { defaultCurrency: 'PKR' }, entries: [{ id: 'fixture', name: 'Property', lender: 'Seller', currencyCode: 'PKR', principal: 1000, totalToReturn: 1000, tenureMonths: 1, startDate: '2026-01-01', repaymentMode: 'fixedTotal', contractSchedule: contract }], repayments: [] });
  render(<InstallmentLedgerPanel loanId="fixture" />);
  for (const amount of ['120', '80']) {
    fireEvent.click(screen.getByRole('button', { name: /Record payment/ }));
    fireEvent.change(screen.getByLabelText('Actual payment date'), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText('Payment amount (PKR)'), { target: { value: amount } });
    fireEvent.click(screen.getByRole('button', { name: 'Save actual payment' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save actual payment' })).toBeNull());
  }
  const workbook = useEMIWorkbookStore.getState().workbook;
  expect(workbook.repayments.map(row => row.amount)).toEqual([120, 80]);
  expect(workbook.entries[0].contractSchedule).toEqual(contract);
  expect(screen.getAllByText('800.00 PKR').length).toBeGreaterThan(0);
});
