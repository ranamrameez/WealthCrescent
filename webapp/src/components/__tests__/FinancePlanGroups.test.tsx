import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FinancePlansHierarchy } from '../FinancePlansHierarchy';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../../store/plannedRentalsWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { deletePlanGroup, deletePlanPayment, readPlanGroups, savePlanGroup } from '../../lib/financePlans';
import { groupFinancePlans } from '../../lib/financePlanHierarchy';
import { flushLocalStorageWrites } from '../../lib/localStoragePersistence';
import type { TransactionPageFilters } from '../../hooks/useUrlTransactionFilters';
const mocks = vi.hoisted(() => ({ signedIn: true, confirm: vi.fn() }));
vi.mock('../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => mocks.signedIn }));
vi.mock('../ConfirmDialog', () => ({ confirmDialog: mocks.confirm }));
const filters: TransactionPageFilters = { period: 'custom', fromDate: '2026-10-01', toDate: '2026-12-31', direction: 'all', source: 'all', category: 'all', accountId: 'all' };
beforeEach(() => {
  mocks.signedIn = true; mocks.confirm.mockReset(); mocks.confirm.mockResolvedValue(true);
  for (const store of [usePlannedCashWorkbookStore, usePlannedBankWorkbookStore, usePlannedCreditCardWorkbookStore, usePlannedRentalsWorkbookStore]) {
    store.getState().setWorkbook({ settings: store.getState().workbook.settings, entries: [] } as never);
  }
  const state = useBankWorkbookStore.getState();
  state.setWorkbook({ ...state.workbook, settings: { ...state.workbook.settings, accounts: [{ id: 'bank', name: 'Main bank', currencyCode: 'QAR', openingBalance: 0 }] }, transactions: [] });
});
afterEach(cleanup);

it('creates an empty named plan, adds multiple payments, and edits and deletes them independently', async () => {
  render(<MemoryRouter initialEntries={['/planning']}><FinancePlansHierarchy filters={filters} controls={null}/></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
  fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'Renovation' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Create plan' }).at(-1)!);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Renovation' })).toBeTruthy());
  const group = readPlanGroups()[0];
  expect(group).toMatchObject({ name: 'Renovation' });
  expect(usePlannedCashWorkbookStore.getState().workbook.entries).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Add payment' }));
  fireEvent.change(screen.getByLabelText('Finance module'), { target: { value: 'bank' } });
  fireEvent.change(screen.getByLabelText('Finance'), { target: { value: 'bank' } });
  fireEvent.change(screen.getByLabelText('Expected date'), { target: { value: '2026-10-25' } });
  fireEvent.change(screen.getByLabelText('Amount (QAR)'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Materials' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and add another' }));
  await waitFor(() => expect(usePlannedBankWorkbookStore.getState().workbook.entries).toHaveLength(1));
  await waitFor(() => expect((screen.getByLabelText('Amount (QAR)') as HTMLInputElement).value).toBe(''));
  fireEvent.change(screen.getByLabelText('Expected date'), { target: { value: '2026-11-02' } });
  fireEvent.change(screen.getByLabelText('Amount (QAR)'), { target: { value: '50' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Labour' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save payment' }));
  await waitFor(() => expect(usePlannedBankWorkbookStore.getState().workbook.entries).toHaveLength(2));
  expect(usePlannedBankWorkbookStore.getState().workbook.entries.map(plan => [plan.groupId, plan.amount])).toEqual([[group.id, -100], [group.id, -50]]);
  expect(useBankWorkbookStore.getState().workbook.transactions).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Edit plan' }));
  fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'Kitchen' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Kitchen' })).toBeTruthy());
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit item / finance' })[0]);
  fireEvent.change(screen.getByLabelText('Amount (QAR)'), { target: { value: '125' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save payment' }));
  await waitFor(() => expect(usePlannedBankWorkbookStore.getState().workbook.entries[0].amount).toBe(-125));
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete payment' })[1]);
  await waitFor(() => expect(usePlannedBankWorkbookStore.getState().workbook.entries).toHaveLength(1));
  expect(usePlannedBankWorkbookStore.getState().workbook.entries[0].groupId).toBe(group.id);
  fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }));
  await waitFor(() => expect(readPlanGroups()).toEqual([]));
  expect(usePlannedBankWorkbookStore.getState().workbook.entries).toEqual([]);
});

it('persists empty parent plans and rejects stale edits and fulfilled-history deletion', () => {
  const group = { id: 'parent', name: 'Trip', createdAt: '2026-10-22T00:00:00Z' };
  savePlanGroup(group);
  flushLocalStorageWrites();
  expect(JSON.parse(localStorage.getItem('WealthCrescent_planned_cash_v1')!).planGroups).toEqual([group]);
  savePlanGroup({ ...group, name: 'Updated trip' }, group);
  expect(() => savePlanGroup({ ...group, name: 'Stale' }, group)).toThrow('changed');
  const latest = readPlanGroups()[0];
  usePlannedBankWorkbookStore.getState().addEntry({ id: 'paid', groupId: group.id, accountId: 'bank', date: '2026-10-01', amount: -20, description: 'Paid deposit', executed: true });
  expect(() => deletePlanGroup(group.id, latest)).toThrow('fulfilled');
  expect(() => deletePlanPayment({ module: 'bank', id: 'paid' })).toThrow('Fulfilled');
  expect(readPlanGroups()).toHaveLength(1);
});

it('deletes a single future recurrence without changing its completed dates or other payments', () => {
  const plan = { id: 'monthly', date: '2026-10-01', type: 'OUT' as const, currencyCode: 'QAR', amount: 20, completedDates: ['2026-10-01'], recurrence: { cycle: 'monthly' as const, startDate: '2026-10-01' } };
  usePlannedCashWorkbookStore.getState().addEntry(plan);
  deletePlanPayment({ module: 'cash', id: plan.id }, '2026-11-01');
  expect(usePlannedCashWorkbookStore.getState().workbook.entries[0]).toMatchObject({ completedDates: ['2026-10-01'], recurrence: { excludedDates: ['2026-11-01'] } });
  expect(() => deletePlanPayment({ module: 'cash', id: plan.id }, '2026-10-01')).toThrow('Fulfilled');
});

it('keeps unrelated plans and actual entries when removing an unfulfilled group', () => {
  const group = { id: 'parent', name: 'Trip', createdAt: '2026-10-22T00:00:00Z' };
  savePlanGroup(group);
  const actual = useCashWorkbookStore.getState().workbook;
  usePlannedCashWorkbookStore.getState().addEntries([{ id: 'own', groupId: 'parent', date: '2026-10-22', type: 'OUT', currencyCode: 'QAR', amount: 100 }, { id: 'other', date: '2026-10-22', type: 'OUT', currencyCode: 'QAR', amount: 5 }]);
  deletePlanGroup(group.id, group);
  expect(usePlannedCashWorkbookStore.getState().workbook.entries.map(plan => plan.id)).toEqual(['other']);
  expect(useCashWorkbookStore.getState().workbook).toBe(actual);
});

it('blocks creation when sign-in is declined and keeps explicit empty groups in the hierarchy', async () => {
  mocks.signedIn = false;
  render(<MemoryRouter><FinancePlansHierarchy filters={filters} controls={null}/></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
  fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'Private plan' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Create plan' }).at(-1)!);
  await act(async () => {});
  expect(readPlanGroups()).toEqual([]);
  expect(groupFinancePlans([], [{ id: 'empty', name: 'Empty', createdAt: '' }]).grouped.get('group:empty')).toEqual([]);
});
