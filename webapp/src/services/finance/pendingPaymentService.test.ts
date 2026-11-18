import { beforeEach, expect, it, vi } from 'vitest';
import type { PendingPaymentPlan } from '../../lib/calc/pendingPayment';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'owner' } as { uid: string } | null },
  transaction: vi.fn(),
}));
vi.mock('firebase/database', () => ({ ref: (_db: unknown, path: string) => path, runTransaction: mocks.transaction }));
vi.mock('../../lib/firebase/client', () => ({ auth: mocks.auth, db: {}, firebaseReady: true }));

import { createPendingPayment } from './pendingPaymentService';

const date = '2028-02-29';
const now = new Date('2028-02-29T12:00:00Z');
const cash: Extract<PendingPaymentPlan, { module: 'cash' }> = {
  module: 'cash',
  plan: { id: 'bill./weekly', date: '2028-01-31', amount: 25, currencyCode: 'USD', groupId: 'utilities', type: 'OUT',
    recurrence: { cycle: 'monthly', startDate: '2028-01-31' } },
};
const bank: Extract<PendingPaymentPlan, { module: 'bank' }> = {
  module: 'bank',
  plan: { id: 'bank-bill', date, accountId: 'checking', amount: -40, description: 'Water' },
};

function fixture() {
  return { plannedCash: { entries: [cash.plan] }, plannedBank: { entries: [bank.plan] },
    bank: { settings: { accounts: [{ id: 'checking', currencyCode: 'USD', isActive: true }] } }, preferences: { theme: 'dark' } };
}

function transactionFor(initial: unknown) {
  let cloud = structuredClone(initial);
  mocks.transaction.mockImplementation(async (_path, update) => {
    expect(update(null)).toBeNull();
    const next = update(structuredClone(cloud));
    if (next !== undefined) cloud = next;
    return { committed: next !== undefined, snapshot: { val: () => structuredClone(cloud) } };
  });
  return () => cloud;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.currentUser = { uid: 'owner' };
});

it('writes one pending native record and its history without completing the open recurrence', async () => {
  const read = transactionFor(fixture());
  const first = await createPendingPayment('owner', cash, date, now);
  expect(mocks.transaction).toHaveBeenCalledWith('users/owner', expect.any(Function), { applyLocally: false });
  expect(read()).toMatchObject({
    ...fixture(),
    cash: { entries: [{ id: first.id, serialNumber: 1, amount: 25, date, isDeposit: false, isPending: true,
      planLink: { module: 'cash', planId: cash.plan.id, occurrenceDate: date, groupId: 'utilities' } }] },
    paymentExecutions: [{ id: first.id, module: 'cash', planId: cash.plan.id, occurrenceDate: date, createdAt: now.toISOString() }],
  });
  const saved = read();
  await expect(createPendingPayment('owner', cash, date, now)).resolves.toEqual(first);
  expect(read()).toEqual(saved);
});

it('replays a concurrent Bank attempt and preserves unrelated server edits', async () => {
  const initial = fixture();
  mocks.transaction.mockImplementation(async (_path, update) => {
    const competing = { ...update(initial), preferences: { theme: 'light' } };
    const saved = update(competing);
    expect(saved).toEqual(competing);
    expect(saved.bank.transactions).toEqual([expect.objectContaining({ amount: -40, accountId: 'checking', isPending: true })]);
    expect(saved.paymentExecutions).toHaveLength(1);
    return { committed: true, snapshot: { val: () => saved } };
  });
  await createPendingPayment('owner', bank, date, now);
});

it.each([
  { ...cash.plan, amount: 26 },
  { ...cash.plan, completedDates: [date] },
  { ...cash.plan, recurrence: { ...cash.plan.recurrence!, excludedDates: [date] } },
  { ...cash.plan, cancelled: true },
])('leaves both paths unchanged when an occurrence becomes stale or ineligible', async plan => {
  const data = { ...fixture(), plannedCash: { entries: [plan] } };
  const read = transactionFor(data);
  const ownPlan = plan.amount === cash.plan.amount ? plan : cash.plan;
  await expect(createPendingPayment('owner', { module: 'cash', plan: ownPlan }, date, now)).rejects.toThrow();
  expect(read()).toEqual(data);
});

it('rejects an inactive account or missing ledger record with existing execution history', async () => {
  const data = fixture();
  data.bank.settings.accounts[0].isActive = false;
  const read = transactionFor(data);
  await expect(createPendingPayment('owner', bank, date, now)).rejects.toThrow('active bank account');
  expect(read()).toEqual(data);
  const history = { ...data, paymentExecutions: [{ id: 'plan:bank:bank-bill:' + date }] };
  const reread = transactionFor(history);
  await expect(createPendingPayment('owner', bank, date, now)).rejects.toThrow('execution history');
  expect(reread()).toEqual(history);
});

it('rejects changed identity upfront and invalidates a transaction retry after sign-out', async () => {
  await expect(createPendingPayment('other', cash, date, now)).rejects.toThrow('sign-in changed');
  expect(mocks.transaction).not.toHaveBeenCalled();
  mocks.transaction.mockImplementation(async (_path, update) => {
    expect(update(fixture())).toHaveProperty('paymentExecutions');
    mocks.auth.currentUser = null;
    expect(update(fixture())).toBeUndefined();
    return { committed: false, snapshot: { val: fixture } };
  });
  await expect(createPendingPayment('owner', cash, date, now)).rejects.toThrow('active account');
});
