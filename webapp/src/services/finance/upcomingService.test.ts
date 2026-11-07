import { afterEach, describe, expect, it, vi } from 'vitest';
import { getUpcomingItems, subscribeUpcomingItems } from './upcomingService';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';

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
