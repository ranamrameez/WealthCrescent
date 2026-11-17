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

it('reviews and restores only the selected loan archive through the ledger', async () => {
  const loan = { id: 'fixture', name: 'Property', lender: 'Seller', currencyCode: 'PKR', principal: 1000, totalToReturn: 1000, tenureMonths: 1, startDate: '2026-01-01', repaymentMode: 'fixedTotal' as const };
  const archived = { id: 'original', loanId: loan.id, date: '2026-02-01', amount: 120, month: 1 };
  const imported = { ...archived, id: 'imported', amount: 180 };
  const contractSchedule = [{ id: 'one', dueDate: '2026-02-01', amount: 1000, description: 'Contract' }];
  const store = useEMIWorkbookStore.getState();
  store.setWorkbook({
    settings: { defaultCurrency: 'PKR' },
    entries: [{ ...loan, contractSchedule }],
    repayments: [imported],
    reconciliationHistory: [
      { id: 'correct', sourceLabel: 'Reviewed worksheet', createdAt: '2026-02-02', loanId: loan.id, loan, repayments: [archived] },
      { id: 'foreign', sourceLabel: 'Other worksheet', createdAt: '2026-02-03', loanId: 'other', loan: { ...loan, id: 'other' }, repayments: [] },
    ],
  });
  render(<InstallmentLedgerPanel loanId={loan.id} />);
  const trigger = screen.getByRole('button', { name: 'Receipt archive' });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Receipt archive for Property' });
  expect(document.activeElement).toBe(dialog);
  expect(screen.queryByRole('option', { name: /Other worksheet/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Review archive' }));
  const restore = await screen.findByRole<HTMLButtonElement>('button', { name: 'Restore reviewed archive' });
  expect(restore.disabled).toBe(true);
  expect(screen.getByRole('table', { name: 'Archived receipts' }).textContent).toContain('120.00 PKR');
  expect(useEMIWorkbookStore.getState().workbook.repayments).toEqual([imported]);
  fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed/ }));
  fireEvent.change(screen.getByLabelText('Type Property to confirm restoration'), { target: { value: 'Property' } });
  expect(restore.disabled).toBe(false);
  fireEvent.click(restore);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(trigger);
  expect(useEMIWorkbookStore.getState().workbook.repayments).toEqual([archived]);
  expect(useEMIWorkbookStore.getState().workbook.reconciliationHistory?.at(-1)?.repayments).toEqual([imported]);
});

it('records a reversal from the receipt list and refreshes the remaining balance', async () => {
  const loan = { id: 'fixture', name: 'Property', lender: 'Seller', currencyCode: 'PKR', principal: 1000, totalToReturn: 1000, tenureMonths: 1, startDate: '2026-01-01', repaymentMode: 'fixedTotal' as const, balanceTracking: 'recorded' as const };
  const paid = { id: 'receipt', loanId: loan.id, month: 0, paymentOnly: true, amount: 180, date: '2026-02-01' };
  useEMIWorkbookStore.getState().setWorkbook({ settings: { defaultCurrency: 'PKR' }, entries: [{ ...loan, contractSchedule: [{ id: 'one', dueDate: '2026-02-01', amount: 1000, description: 'Contract' }] }], repayments: [paid] });
  render(<InstallmentLedgerPanel loanId={loan.id} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reverse payment' }));
  fireEvent.change(await screen.findByLabelText('Reversal amount (PKR)'), { target: { value: '80' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record reversal' }));
  expect(useEMIWorkbookStore.getState().workbook.repayments).toEqual([paid, expect.objectContaining({ amount: 80, reversesPaymentId: paid.id })]);
  expect(screen.getAllByText('900.00 PKR').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: 'Edit payment' })).toBeNull();
});
