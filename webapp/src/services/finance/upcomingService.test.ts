import { afterEach, describe, expect, it, vi } from 'vitest';
import { getUpcomingItems, subscribeUpcomingItems } from './upcomingService';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';

describe('upcoming application query', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a stable snapshot and invalidates it when a source workbook changes', () => {
    const store = usePlannedCashWorkbookStore.getState();
    const original = store.workbook;
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const listener = vi.fn();
    const unsubscribe = subscribeUpcomingItems(listener);

    try {
      const before = getUpcomingItems(7);
      expect(getUpcomingItems(7)).toBe(before);

      store.setWorkbook({
        ...original,
        entries: [{
          id: 'service-query-test',
          date,
          type: 'OUT',
          amount: 25,
          currencyCode: 'QAR',
          note: 'Service query test',
        }],
      });

      expect(listener).toHaveBeenCalled();
      const after = getUpcomingItems(7);
      expect(after).not.toBe(before);
      expect(after).toContainEqual(expect.objectContaining({
        id: 'service-query-test',
        date,
        module: 'cash',
        dueLabel: 'Happening tomorrow',
      }));
    } finally {
      unsubscribe();
      usePlannedCashWorkbookStore.getState().setWorkbook(original);
    }
  });
});

it('refreshes when a linked Cash occurrence enters and leaves the pending ledger', () => {
  const plans = usePlannedCashWorkbookStore.getState();
  const cash = useCashWorkbookStore.getState();
  const date = new Date().toISOString().slice(0, 10);
  const id = 'reserved-upcoming-plan';
  const ids = () => getUpcomingItems(35).map(item => item.id);
  try {
    plans.setWorkbook({ ...plans.workbook, entries: [{
      id, date, type: 'OUT', amount: 25, currencyCode: 'QAR', recurrence: { cycle: 'monthly', startDate: date },
    }] });
    expect(ids()).toContain(`${id}@${date}`);

    cash.setWorkbook({ ...cash.workbook, entries: [{
      id: 'pending-entry', date, amount: 25, currencyCode: 'QAR', isDeposit: false, isPending: true, source: 'manual',
      planLink: { module: 'cash', planId: id, occurrenceDate: date },
    }] });
    expect(ids()).not.toContain(`${id}@${date}`);
    expect(ids().filter(value => value.startsWith(`${id}@`))).toHaveLength(1);

    cash.setWorkbook(cash.workbook);
    expect(ids()).toContain(`${id}@${date}`);
  } finally {
    plans.setWorkbook(plans.workbook);
    cash.setWorkbook(cash.workbook);
  }
});
