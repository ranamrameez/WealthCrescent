import { describe, expect, it, vi } from 'vitest';
import { saveLegacyBankBudget, getBankAnalyticsAccounts, getBankDirectory, getBankAccount, getBankingScopeSummary, subscribeBankQueries } from './bankService';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
const filters = { fromDate: '', toDate: '', direction: 'all', category: 'all', source: 'all', accountId: 'all' };
describe('Banking query boundary', () => {
  it('keeps stable account/scope snapshots and updates both from the authoritative native workbook', () => {
    const store = useBankWorkbookStore.getState(), original = store.workbook;
    const listener = vi.fn(), unsubscribe = subscribeBankQueries(listener);
    try {
      store.setWorkbook({ ...original, settings: { ...original.settings, accounts: [{ id: 'query', name: 'Account', currencyCode: 'USD', openingBalance: 100 }] }, transactions: [] });
      const account = getBankAccount('query', filters), summary = getBankingScopeSummary(['query'], filters, [], false);
      expect(getBankAccount('query', { ...filters })).toBe(account); expect(getBankingScopeSummary(['query'], filters, [], false)).toBe(summary);
      store.setWorkbook({ ...useBankWorkbookStore.getState().workbook, transactions: [{ id: 'actual', accountId: 'query', date: '2020-01-01', amount: 25, description: 'Deposit', isDeposit: true, source: 'manual' }] });
      expect(listener).toHaveBeenCalled(); expect(getBankAccount('query', filters)).not.toBe(account);
      expect(getBankAccount('query', filters).periodCurrentBalance).toBe(125);
      expect(getBankingScopeSummary(['query'], filters, [], false)[0].actual).toBe(125);
      expect(getBankDirectory().accountMetrics.get('query')?.balance).toBe(125);
    } finally { unsubscribe(); store.setWorkbook(original); }
  });
});


it('refreshes future-record status and actual balances across midnight without a ledger edit', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-31T23:59:30Z'));
  const store = useBankWorkbookStore.getState(), original = store.workbook;
  const listener = vi.fn(), unsubscribe = subscribeBankQueries(listener);
  try {
    store.setWorkbook({ ...original, settings: { ...original.settings, accounts: [{ id: 'midnight', name: 'Account', currencyCode: 'USD', openingBalance: 100 }] },
      transactions: [{ id: 'next-day', accountId: 'midnight', date: '2026-02-01', amount: 25, description: 'Deposit', isDeposit: true, source: 'manual' }] });
    const before = getBankAccount('midnight', filters);
    expect(before.periodCurrentBalance).toBe(100); expect(before.filteredLedger[0].isFuture).toBe(true);
    listener.mockClear(); vi.advanceTimersByTime(60_000);
    expect(listener).toHaveBeenCalled();
    const after = getBankAccount('midnight', filters);
    expect(after).not.toBe(before); expect(getBankDirectory().accountMetrics.get('midnight')?.balance).toBe(125); expect(after.periodCurrentBalance).toBe(125); expect(after.filteredLedger[0].isFuture).toBe(false);
  } finally { unsubscribe(); store.setWorkbook(original); vi.useRealTimers(); }
});


it('keeps bank ownership in the scope cache key for banks that only have cards', () => {
  const store = useCreditCardWorkbookStore.getState(), original = store.workbook;
  try {
    store.setWorkbook({ cards: [
      { id: 'a', name: 'A', bankId: 'b1', currencyCode: 'USD', openingBalance: 10 },
      { id: 'b', name: 'B', bankId: 'b2', currencyCode: 'USD', openingBalance: 90 },
    ], transactions: [] });
    const first = getBankingScopeSummary([], filters, [], true, 'b1');
    const second = getBankingScopeSummary([], filters, [], true, 'b2');
    expect(first[0].cardOwed).toBe(10); expect(second[0].cardOwed).toBe(90);
    expect(getBankingScopeSummary([], filters, [], true, 'b1')).toBe(first);
  } finally { store.setWorkbook(original); }
});

const bankAuth = vi.hoisted(() => ({ currentUser: null as null | { uid: string } }));
vi.mock('../../lib/firebase/client', () => ({ auth: bankAuth }));
it('validates legacy target commands and preserves unrelated targets on rename', () => {
  const store = useBankWorkbookStore.getState(), original = store.workbook;
  try {
    expect(() => saveLegacyBankBudget('Food', 10)).toThrow('Sign in');
    bankAuth.currentUser = { uid: 'test' };
    expect(() => saveLegacyBankBudget('Food', Infinity)).toThrow('finite');
    store.setWorkbook({ ...original, settings: { ...original.settings, budgets: { Food: 100, Rent: 200 } } });
    expect(() => saveLegacyBankBudget('Rent', 50, 'Food')).toThrow('already exists');
    saveLegacyBankBudget('Dining', 120, 'Food');
    expect(useBankWorkbookStore.getState().workbook.settings.budgets).toEqual({ Dining: 120, Rent: 200 });
    expect(() => saveLegacyBankBudget('Other', 50, 'Food')).toThrow('no longer exists');
    const scope = getBankAnalyticsAccounts(undefined, 'all');
    expect(getBankAnalyticsAccounts(undefined, 'all')).toBe(scope);
  } finally { bankAuth.currentUser = null; store.setWorkbook(original); }
});
