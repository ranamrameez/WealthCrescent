import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyPSXWorkbook } from '../../../../store/defaultPsxWorkbook';
import { useBankWorkbookStore } from '../../../../store/bankWorkbookStore';
import { PSX_WORKBOOK_STORAGE_KEY, usePSXWorkbookStore } from '../../../../store/psxWorkbookStore';
import { PsxCashTransferActions } from '../PsxCashTransferActions';

vi.mock('../../../../lib/firebase/useAuthState', () => ({ getCurrentUser: () => ({ uid: 'psx-review-fixture' }) }));
vi.mock('../../../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));

const brokerId = 'psx-al-habib-capital-markets';
const originalBank = useBankWorkbookStore.getState().workbook;

beforeEach(() => {
  usePSXWorkbookStore.getState().setWorkbook(createEmptyPSXWorkbook());
  usePSXWorkbookStore.getState().setActiveBroker(brokerId);
});
afterEach(() => {
  cleanup();
  useBankWorkbookStore.getState().setWorkbook(originalBank);
});

it('reviews an ambiguous statement overlap and only applies the selected source values', async () => {
  const store = usePSXWorkbookStore.getState();
  store.addTransfer({ id: 'manual', date: '2026-11-18', type: 'DEPOSIT', gross: 8000, fee: 5 });
  const { container } = render(<PsxCashTransferActions />);
  const content = 'Date,Type,Gross,Description\n2026-11-18,DEPOSIT,9000,AHL deposit\n2026-11-20,DEPOSIT,2000,Separate deposit';
  const file = new File([], 'statement.csv');
  Object.defineProperty(file, 'text', { value: async () => content });
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
  const dialog = within(await screen.findByRole('dialog', { name: 'Review cash statement' }));
  expect(dialog.getByRole('region', { name: /Needs review/ })).toBeTruthy();
  expect(usePSXWorkbookStore.getState().workbook.transfers).toHaveLength(1);
  fireEvent.change(dialog.getByLabelText('Reconciliation choice'), { target: { value: 'replace:manual' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Save selected records (1)' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Review cash statement' })).toBeNull());
  expect(usePSXWorkbookStore.getState().workbook.transfers).toMatchObject([
    { id: 'manual', gross: 9000, fee: 5, description: 'AHL deposit' },
  ]);
});

it('leaves a stale bank review open and preserves both ledgers', async () => {
  useBankWorkbookStore.getState().setWorkbook({
    settings: { accounts: [{ id: 'bank-fixture', name: 'Fixture bank', currencyCode: 'PKR', openingBalance: 0 }] },
    transactions: [
      { id: 'eligible', accountId: 'bank-fixture', date: '2026-11-18', description: 'PSX Al Habib',
        amount: -15000, isDeposit: false, source: 'manual' },
      { id: 'unrelated', accountId: 'bank-fixture', date: '2026-11-18', description: 'Unrelated expense',
        amount: -300, isDeposit: false, source: 'manual' },
    ],
  });
  const bankBefore = useBankWorkbookStore.getState().workbook;
  render(<PsxCashTransferActions />);
  fireEvent.click(screen.getByRole('button', { name: 'Sync bank transfers' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Sync PSX AHL bank transfers' }));
  expect(dialog.queryByText('Unrelated expense')).toBeNull();
  fireEvent.click(dialog.getByRole('button', { name: 'Select all new records' }));
  const save = dialog.getByRole('button', { name: 'Save selected records (1)' });
  const snapshot = localStorage.getItem(PSX_WORKBOOK_STORAGE_KEY)!;
  try {
    localStorage.setItem(PSX_WORKBOOK_STORAGE_KEY, '{}');
    fireEvent.click(save);
    expect(dialog.getByRole('alert').textContent).toMatch(/saved ledger changed/i);
    expect(usePSXWorkbookStore.getState().workbook.transfers).toEqual([]);
    expect(useBankWorkbookStore.getState().workbook).toEqual(bankBefore);
    localStorage.setItem(PSX_WORKBOOK_STORAGE_KEY, snapshot);
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sync PSX AHL bank transfers' })).toBeNull());
    expect(usePSXWorkbookStore.getState().workbook.transfers).toMatchObject([
      { type: 'DEPOSIT', gross: 15000, cashSourceIds: ['bank:eligible'] },
    ]);
    expect(useBankWorkbookStore.getState().workbook).toEqual(bankBefore);
  } finally {
    if (localStorage.getItem(PSX_WORKBOOK_STORAGE_KEY) === '{}') localStorage.setItem(PSX_WORKBOOK_STORAGE_KEY, snapshot);
  }
});
