import { describe, expect, it, vi } from 'vitest';
import { getRecentTransactions, subscribeRecentTransactions } from './recentActivityService';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
describe('recent activity query', () => {
  it('keeps a stable lifetime snapshot, invalidates on native changes, and retains pending record state', () => {
    const store = useCashWorkbookStore.getState(), original = store.workbook;
    const listener = vi.fn(), unsubscribe = subscribeRecentTransactions(listener);
    try {
      const before = getRecentTransactions(); expect(getRecentTransactions()).toBe(before);
      store.setWorkbook({ ...original, entries: [{ id: 'pending', date: '2026-01-01', amount: 10, isDeposit: false, currencyCode: 'USD', source: 'manual', isPending: true }] });
      expect(listener).toHaveBeenCalled();
      const after = getRecentTransactions(); expect(after).not.toBe(before);
      expect(after.find(row => row.id === 'cash:pending')).toMatchObject({ amount: -10, pending: true });
    } finally { unsubscribe(); store.setWorkbook(original); }
  });
});
