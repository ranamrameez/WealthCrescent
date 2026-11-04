import { describe, expect, it, vi } from 'vitest';
import { getDashboardReport, getDashboardContext, getDashboardActivities, setNetWorthInclusion, subscribeDashboard } from './dashboardService';
import { getScopedNetWorthInputs, getNetWorthSummary } from './netWorthService';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useFundsWorkbookStore } from '../../store/fundsWorkbookStore';
const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock('../../lib/firebase/client', () => ({ auth: { get currentUser() { return session.signedIn ? { uid: 'dashboard-test' } : null; } }, db: null, firebaseReady: false }));

describe('dashboard query and inclusion commands', () => {
  it('requires authentication at the command boundary, independently of the UI gate', () => {
    session.signedIn = false;
    try { expect(() => setNetWorthInclusion({ module: 'cash' }, false)).toThrow('Sign in'); }
    finally { session.signedIn = true; }
  });
  it('includes native cards in the controls and changes inclusion without changing the actual ledger', () => {
    const store = useCreditCardWorkbookStore.getState(), original = store.workbook;
    try {
      store.setWorkbook({ cards: [{ id: 'card', name: 'Card', currencyCode: 'USD', openingBalance: 200 }], transactions: [] });
      const before = getDashboardContext();
      const option = before.inclusionGroups.find(group => group.title === 'Credit cards')!.items[0];
      expect(option.included).toBe(true);
      expect(getNetWorthSummary(['creditCards'], '2026-01-31').rows[0].net).toBe(-200);
      setNetWorthInclusion(option, false);
      expect(getDashboardContext()).not.toBe(before);
      expect(getNetWorthSummary(['creditCards'], '2026-01-31').rows).toEqual([]);
      expect(useCreditCardWorkbookStore.getState().workbook.transactions).toEqual([]);
      expect(useCreditCardWorkbookStore.getState().workbook.cards[0].openingBalance).toBe(200);
    } finally { store.setWorkbook(original); }
  });
  it('re-reads current Funds state and rejects deleted entities without losing unrelated edits', () => {
    const store = useFundsWorkbookStore.getState(), original = store.workbook;
    try {
      store.setWorkbook({ ...original, funds: [{ id: 'fund', name: 'Fund', code: 'F', platform: 'Broker', currencyCode: 'USD' }], marketPrices: { fund: 17 } });
      const option = getDashboardContext().inclusionGroups.find(group => group.title === 'Funds')!.items.find(item => item.id === 'fund')!;
      store.setWorkbook({ ...useFundsWorkbookStore.getState().workbook, marketPrices: { fund: 19 } });
      setNetWorthInclusion(option, false);
      expect(useFundsWorkbookStore.getState().workbook.marketPrices.fund).toBe(19);
      expect(useFundsWorkbookStore.getState().workbook.funds[0].includeInNetWorth).toBe(false);
      expect(() => setNetWorthInclusion({ module: 'funds', id: 'deleted' }, false)).toThrow('no longer exists');
    } finally { store.setWorkbook(original); }
  });
  it('expands recurring activity over the supported forecast horizons and refreshes across midnight', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-31T23:59:30Z'));
    const plans = usePlannedCashWorkbookStore.getState(), originalPlans = plans.workbook;
    const cash = useCashWorkbookStore.getState(), originalCash = cash.workbook;
    const first = subscribeDashboard(vi.fn()), listener = vi.fn(), second = subscribeDashboard(listener); first();
    try {
      cash.setWorkbook({ ...originalCash, settings: { ...originalCash.settings, includeInNetWorth: true } });
      plans.setWorkbook({ ...originalPlans, entries: [{ id: 'bill', date: '2026-01-31', type: 'OUT', amount: 10, currencyCode: 'USD', recurrence: { cycle: 'monthly', startDate: '2026-01-31' } }] });
      const before = getDashboardActivities(['cash']);
      expect(before.filter(activity => !activity.executed).map(activity => activity.date)).toContain('2026-12-31');
      expect(before.filter(activity => !activity.executed).map(activity => activity.date)).toContain('2026-02-28');
      expect(getDashboardActivities(['cash'])).toBe(before);
      listener.mockClear(); vi.advanceTimersByTime(60_000);
      expect(listener).toHaveBeenCalled();
      expect(getDashboardActivities(['cash'])).not.toBe(before);
      expect(getDashboardActivities(['cash']).filter(activity => !activity.executed).some(activity => activity.date === '2026-01-31')).toBe(false);
    } finally { second(); plans.setWorkbook(originalPlans); cash.setWorkbook(originalCash); vi.useRealTimers(); }
  });
});


it('values the capital split at the selected period end while keeping the current headline live', () => {
  const store = useCashWorkbookStore.getState(), original = store.workbook;
  try {
    store.setWorkbook({ ...original, settings: { ...original.settings, includeInNetWorth: true }, entries: [
      { id: 'jan', date: '2026-01-01', isDeposit: true, amount: 100, currencyCode: 'USD', source: 'manual' },
      { id: 'feb', date: '2026-02-01', isDeposit: true, amount: 1000, currencyCode: 'USD', source: 'manual' },
    ] });
    const rows = getNetWorthSummary(['cash'], '2026-02-15').rows;
    const report = getDashboardReport({ inputs: getScopedNetWorthInputs(['cash']), rows, activities: [], rentals: getDashboardContext().rentals,
      todayISO: '2026-02-15', period: 'custom', fromDate: '2026-01-01', toDate: '2026-01-31', preferredCurrency: 'USD', rates: null });
    expect(rows[0].net).toBe(1100);
    expect(report.splitData).toEqual([{ currency: 'USD', converted: 100 }]);
    expect(report.rangeEndRows[0].net).toBe(100);
  } finally { store.setWorkbook(original); }
});
