import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlanningTab } from '../CashPage';
import { useCashWorkbookStore } from '../../../../store/cashWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../../../store/plannedCashWorkbookStore';
import { createEmptyCashWorkbook } from '../../../../store/defaultCashWorkbook';
import { createEmptyPlannedCashWorkbook } from '../../../../store/defaultPlannedCashWorkbook';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Line: () => null, Doughnut: () => null }));
vi.mock('../../../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));

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
  expect(useCashWorkbookStore.getState().workbook.entries[0]).toMatchObject({ date: '2026-10-05', amount: 100 });
  const plans = usePlannedCashWorkbookStore.getState().workbook.entries;
  expect(plans.find(plan => plan.id === 'rent')).toMatchObject({ completedDates: ['2026-10-28'] });
  expect(plans.find(plan => plan.seriesId === 'rent')).toMatchObject({ date: '2026-10-28', amount: 100, executed: true, recurrence: undefined });
  expect(screen.queryByRole('button', { name: 'Mark as done' })).toBeNull();
  usePlannedCashWorkbookStore.getState().updateEntry('rent', { amount: 200 });
  expect(usePlannedCashWorkbookStore.getState().workbook.entries.find(plan => plan.seriesId === 'rent')?.amount).toBe(100);
});
