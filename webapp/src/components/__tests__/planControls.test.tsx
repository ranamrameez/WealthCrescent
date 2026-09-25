import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RentalPlanEditor } from '../../features/rentals/pages/RentalPlanEditor';
import { OrphanPlanCleanup } from '../OrphanPlanCleanup';
import { usePlannedRentalsWorkbookStore as rentals } from '../../store/plannedRentalsWorkbookStore';
import { usePlannedBankWorkbookStore as bankPlans } from '../../store/plannedBankWorkbookStore';
import { useBankWorkbookStore as bank } from '../../store/bankWorkbookStore';

vi.mock('../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));
vi.mock('../ConfirmDialog', () => ({ confirmDialog: async () => true }));

beforeEach(() => {
  rentals.getState().setWorkbook({ settings: {}, entries: [] }, { skipPersist: true });
  bankPlans.getState().setWorkbook({ ...bankPlans.getState().workbook, entries: [] }, { skipPersist: true });
});
afterEach(cleanup);

it('adds a property plan and edits it without creating another record', async () => {
  const close = vi.fn();
  const view = render(<RentalPlanEditor propertyId="property" onClose={close} />);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '250' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  const plan = rentals.getState().workbook.entries[0];
  expect(plan).toMatchObject({ propertyId: 'property', amount: 250 });
  view.unmount();
  render(<RentalPlanEditor propertyId="property" plan={plan} onClose={close} />);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '300' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(2));
  expect(rentals.getState().workbook.entries).toHaveLength(1);
  expect(rentals.getState().workbook.entries[0]).toMatchObject({ id: plan.id, amount: 300 });
});

it('repairs legacy orphan plans only on request and retains completed and valid plans', async () => {
  bank.getState().setWorkbook({ settings: { accounts: [{ id: 'valid', name: 'Bank', currencyCode: 'USD', openingBalance: 0 }] }, transactions: [] }, { skipPersist: true });
  bankPlans.getState().addEntries([
    { id: 'orphan', accountId: 'gone', date: '2026-10-01', amount: 10, description: 'Orphan' },
    { id: 'done', accountId: 'gone', date: '2026-09-01', amount: 10, description: 'History', executed: true },
    { id: 'valid', accountId: 'valid', date: '2026-10-01', amount: 10, description: 'Valid' },
  ]);
  render(<OrphanPlanCleanup />);
  expect(bankPlans.getState().workbook.entries).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Remove orphaned plans' }));
  await waitFor(() => expect(bankPlans.getState().workbook.entries.map(plan => plan.id)).toEqual(['done', 'valid']));
});
