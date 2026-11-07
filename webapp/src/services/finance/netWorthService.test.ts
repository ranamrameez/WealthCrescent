import { useFundsWorkbookStore } from '../../store/fundsWorkbookStore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getNetWorthSummary, subscribeNetWorthSummary } from './netWorthService';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useQseFeed } from '../../features/qse/hooks/useLiveQseWorkbook';

const original = useCashWorkbookStore.getState().workbook;
afterEach(() => { useCashWorkbookStore.getState().setWorkbook(original); vi.useRealTimers(); });

describe('net-worth application query', () => {
  it('caches equivalent scopes and invalidates on a native ledger or live quote change', () => {
    const listener = vi.fn(), unsubscribe = subscribeNetWorthSummary(listener);
    const feed = useQseFeed.getState().points;
    try {
      const before = getNetWorthSummary(['cash'], '2026-01-31');
      expect(getNetWorthSummary(['cash'], '2026-01-31')).toBe(before);
      useCashWorkbookStore.getState().setWorkbook({ ...original, settings: { ...original.settings, includeInNetWorth: true }, entries: [
        { id: 'actual', date: '2026-01-01', isDeposit: true, amount: 125, currencyCode: 'USD', source: 'manual', categoryID: '', serialNumber: 1 },
        { id: 'pending', date: '2026-01-02', isDeposit: true, amount: 999, currencyCode: 'USD', source: 'manual', categoryID: '', serialNumber: 2, isPending: true },
      ] });
      const after = getNetWorthSummary(['cash'], '2026-01-31');
      expect(after).not.toBe(before);
      expect(after.rows.find(row => row.currency === 'USD')?.net).toBe(125);
      expect(listener).toHaveBeenCalled();
      listener.mockClear();
      useQseFeed.setState({ points: {} });
      expect(listener).toHaveBeenCalled();
      expect(getNetWorthSummary(['cash'], '2026-01-31')).not.toBe(after);
    } finally { unsubscribe(); useQseFeed.setState({ points: feed }); }
  });

  it('keeps midnight refresh alive when the first of several subscribers leaves', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-31T23:59:30Z'));
    const first = subscribeNetWorthSummary(vi.fn());
    const listener = vi.fn(), second = subscribeNetWorthSummary(listener);
    first();
    try {
      useCashWorkbookStore.getState().setWorkbook({ ...original, settings: { ...original.settings, includeInNetWorth: true }, entries: [
        { id: 'tomorrow', date: '2026-02-01', isDeposit: true, amount: 50, currencyCode: 'USD', source: 'manual', categoryID: '', serialNumber: 1 },
      ] });
      expect(getNetWorthSummary(['cash']).rows).toEqual([]);
      listener.mockClear();
      vi.advanceTimersByTime(60_000);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(getNetWorthSummary(['cash']).rows[0].net).toBe(50);
    } finally { second(); }
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('keeps a legacy holdings-only workbook from silently subtracting unfunded purchases', () => {
  const store = useFundsWorkbookStore.getState(), original = store.workbook;
  try {
    const workbook = { ...original, settings: { defaultCurrency: 'USD', cashLedgerMigrationVersion: 1 }, funds: [{ id: 'fund', name: 'Fund', code: 'F', platform: '', currencyCode: 'PKR' }],
      transactions: [{ id: 'buy', date: '2026-01-01', action: 'BUY' as const, ticker: 'fund', shares: 100, price: 10 }], transfers: [], marketPrices: { fund: 12 } };
    store.setWorkbook(workbook);
    expect(getNetWorthSummary(['funds'], '2026-01-31').rows.find(row => row.currency === 'PKR')?.net).toBe(1200);
    store.setWorkbook({ ...workbook, settings: { ...workbook.settings, includeCashInNetWorth: true } });
    expect(getNetWorthSummary(['funds'], '2026-01-31').rows.find(row => row.currency === 'PKR')?.net).toBe(200);
  } finally { store.setWorkbook(original); }
});
