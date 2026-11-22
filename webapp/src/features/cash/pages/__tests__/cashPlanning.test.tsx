import { usePageTopBarStore } from '../../../../store/pageTopBarStore';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CashCurrencyPage, PlanningTab } from '../CashPage';
import { useCashWorkbookStore } from '../../../../store/cashWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../../../store/plannedCashWorkbookStore';
import { createEmptyCashWorkbook } from '../../../../store/defaultCashWorkbook';
import { createEmptyPlannedCashWorkbook } from '../../../../store/defaultPlannedCashWorkbook';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Line: () => null, Doughnut: () => null }));
vi.mock('../../../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));
vi.mock('../../../../lib/firebase/client', () => ({ auth: { currentUser: { uid: 'cash-planning-fixture' } }, db: null, firebaseReady: false }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
  useCashWorkbookStore.setState({ workbook: createEmptyCashWorkbook() });
  usePlannedCashWorkbookStore.setState({ workbook: { ...createEmptyPlannedCashWorkbook(), entries: [{ id: 'rent', date: '2026-01-28', type: 'OUT', amount: 100, currencyCode: 'USD', recurrence: { cycle: 'monthly', startDate: '2026-01-28' } }] } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('fulfills a future occurrence once and saves its own immutable amount and date', async () => {
  render(<MemoryRouter><PlanningTab plannedCloudEmpty={false} uploadPlannedLocalToCloud={async () => {}} showFab={false} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
  await waitFor(() => expect(useCashWorkbookStore.getState().workbook.entries).toHaveLength(1));
  expect(useCashWorkbookStore.getState().workbook.entries[0]).toMatchObject({ date: '2026-10-05', amount: 100, planLink: { module: 'cash', planId: 'rent', occurrenceDate: '2026-10-28' } });
  const plans = usePlannedCashWorkbookStore.getState().workbook.entries;
  expect(plans.find(plan => plan.id === 'rent')).toMatchObject({ completedDates: ['2026-10-28'] });
  expect(plans.find(plan => plan.seriesId === 'rent')).toMatchObject({ date: '2026-10-28', amount: 100, executed: true, recurrence: undefined });
  expect(screen.queryByRole('button', { name: 'Mark as done' })).toBeNull();
  usePlannedCashWorkbookStore.getState().updateEntry('rent', { amount: 200 });
  expect(usePlannedCashWorkbookStore.getState().workbook.entries.find(plan => plan.seriesId === 'rent')?.amount).toBe(100);
});

function CashDetailTopBar() {
  return usePageTopBarStore(state => state.rightSlot);
}

function CashDetailFixture() {
  const location = useLocation();
  return <><CashDetailTopBar /><output>{location.pathname + location.search}</output>
    <Routes><Route path="/cash/:currency" element={<CashCurrencyPage />} /></Routes>
  </>;
}

it('rejects unknown currency detail links', () => {
  render(<MemoryRouter initialEntries={['/cash/ZZZ']}><CashDetailFixture /></MemoryRouter>);
  expect(screen.getByText('Cash currency not found.')).toBeTruthy();
  expect(screen.queryByRole('combobox', { name: 'Currency' })).toBeNull();
});

it('switches between default and plan-only Cash currencies without losing filters', () => {
  useCashWorkbookStore.getState().updateSettings({ defaultCurrency: 'QAR' });
  render(<MemoryRouter initialEntries={['/cash/USD?period=all&from=&to=&direction=out']}><CashDetailFixture /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'USD cash' })).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Currency' }), { target: { value: 'QAR' } });
  expect(screen.getByRole('heading', { name: 'QAR cash' })).toBeTruthy();
  expect(screen.getByText('/cash/QAR?period=all&from=&to=&direction=out')).toBeTruthy();
});
