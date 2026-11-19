import { beforeEach, expect, it, vi } from 'vitest';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../../store/subscriptionsWorkbookStore';
import { regenerateSubscriptionRenewals } from './subscriptionRenewalService';
import type { Subscription } from '../../types/subscriptionsWorkbook';

vi.mock('../../lib/firebase/client', () => ({ auth: { currentUser: { uid: 'owner' } }, db: null }));

const asOf = new Date('2026-01-01T00:00:00Z');
const original: Subscription = { id: 'sub', name: 'Membership', startDate: '2026-01-10', billingCycle: 'monthly', currencyCode: 'USD', amount: 20, active: true };
const bank = usePlannedBankWorkbookStore;
const cash = usePlannedCashWorkbookStore;
const subscriptions = useSubscriptionsWorkbookStore;

beforeEach(() => {
  const sub = subscriptions.getState(), bankPlans = bank.getState(), cashPlans = cash.getState();
  sub.setWorkbook({ ...sub.workbook, entries: [original] });
  bankPlans.setWorkbook({ ...bankPlans.workbook, entries: [
    { id: 'future', accountId: 'account', date: '2026-02-10', amount: -20, description: 'Planned', sourceSubscriptionId: 'sub' },
    { id: 'done', accountId: 'account', date: '2026-01-10', amount: -20, description: 'Paid', sourceSubscriptionId: 'sub', executed: true },
    { id: 'unrelated', accountId: 'account', date: '2026-03-10', amount: -5, description: 'Other' },
  ] });
  cashPlans.setWorkbook({ ...cashPlans.workbook, entries: [] });
  const accounts = useBankWorkbookStore.getState();
  accounts.setWorkbook({ ...accounts.workbook, settings: { accounts: [
    { id: 'account', name: 'Checking', currencyCode: 'PKR', openingBalance: 0 },
  ] } });
});

it('replaces open renewals and keeps completed dates and unrelated plans', () => {
  const [expected] = subscriptions.getState().workbook.entries;
  const result = regenerateSubscriptionRenewals(expected, { module: 'cash' }, 'owner', asOf);
  expect(result).toEqual({ count: 11, sourceName: 'Cash' });
  expect(bank.getState().workbook.entries.map(item => item.id)).toEqual(['done', 'unrelated']);
  expect(cash.getState().workbook.entries[0]).toMatchObject({ date: '2026-02-10', amount: 20, currencyCode: 'USD', type: 'OUT' });
  expect(subscriptions.getState().workbook.entries[0].paidVia).toEqual({ module: 'cash' });
});

it('leaves plans intact when the source currency, subscription, or signed-in account changes', () => {
  const [expected] = subscriptions.getState().workbook.entries;
  const before = bank.getState().workbook;
  expect(() => regenerateSubscriptionRenewals(expected, { module: 'bank', ref: 'account' }, 'owner', asOf)).toThrow(/subscription currency/);
  expect(() => regenerateSubscriptionRenewals(expected, { module: 'cash' }, 'another', asOf)).toThrow(/signed-in account/);
  subscriptions.getState().updateEntry(expected.id, { amount: 21 });
  expect(() => regenerateSubscriptionRenewals(expected, { module: 'cash' }, 'owner', asOf)).toThrow(/subscription changed/i);
  expect(bank.getState().workbook).toBe(before);
  expect(cash.getState().workbook.entries).toEqual([]);
});
