import { beforeEach, expect, it } from 'vitest';
import { useBankWorkbookStore as bank } from '../bankWorkbookStore';
import { useCreditCardWorkbookStore as cards } from '../creditCardWorkbookStore';
import { useRentalsWorkbookStore as rentals } from '../rentalsWorkbookStore';
import { useEMIWorkbookStore as emi } from '../emiWorkbookStore';
import { useSubscriptionsWorkbookStore as subscriptions } from '../subscriptionsWorkbookStore';
import { usePlannedBankWorkbookStore as bankPlans } from '../plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore as cashPlans } from '../plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore as cardPlans } from '../plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore as rentalPlans } from '../plannedRentalsWorkbookStore';

beforeEach(() => {
  for (const store of [bankPlans, cashPlans, cardPlans, rentalPlans]) {
    const state = store.getState();
    state.workbook.entries.forEach(entry => state.deleteEntry(entry.id));
  }
});

it('deleting a bank account removes only that account’s plans', () => {
  bankPlans.getState().addEntries([
    { id: 'a', accountId: 'a1', date: '2026-10-01', amount: -10, description: 'Plan' },
    { id: 'b', accountId: 'a2', date: '2026-10-01', amount: -20, description: 'Other' },
  ]);
  bank.getState().deleteAccount('a1');
  expect(bankPlans.getState().workbook.entries.map(p => p.id)).toEqual(['b']);
});

it('deleting cards and properties removes their dependent plans', () => {
  cardPlans.getState().addEntry({ id: 'c', cardId: 'c1', date: '2026-10-01', amount: 10, description: 'Plan', kind: 'charge' });
  rentalPlans.getState().addEntry({ id: 'r', propertyId: 'r1', date: '2026-10-01', amount: 10, type: 'EXPENSE' });
  cards.getState().deleteCard('c1');
  rentals.getState().deleteProperty('r1');
  expect(cardPlans.getState().workbook.entries).toHaveLength(0);
  expect(rentalPlans.getState().workbook.entries).toHaveLength(0);
});

function seedSubscriptionPlans() {
  bankPlans.getState().addEntries([
    { id: 'old', accountId: 'a1', date: '2026-10-01', amount: -10, description: 'Old', sourceSubscriptionId: 'sub' },
    { id: 'done', accountId: 'a1', date: '2026-09-01', amount: -10, description: 'Done', sourceSubscriptionId: 'sub', executed: true },
    { id: 'manual', accountId: 'a1', date: '2026-10-01', amount: -10, description: 'Manual' },
  ]);
  cashPlans.getState().addEntry({ id: 'cash', date: '2026-10-01', amount: 10, type: 'OUT', currencyCode: 'USD', sourceSubscriptionId: 'sub' });
  cardPlans.getState().addEntry({ id: 'new', cardId: 'c1', date: '2026-10-01', amount: 10, kind: 'charge', description: 'New', sourceSubscriptionId: 'sub' });
}

it('relinking a subscription removes old destinations but keeps new plans and history', () => {
  seedSubscriptionPlans();
  subscriptions.getState().updateEntry('sub', { paidVia: { module: 'creditCard', ref: 'c1' } });
  expect(bankPlans.getState().workbook.entries.map(p => p.id)).toEqual(['done', 'manual']);
  expect(cashPlans.getState().workbook.entries).toHaveLength(0);
  expect(cardPlans.getState().workbook.entries.map(p => p.id)).toEqual(['new']);
});

it('deleting a subscription removes pending plans across every destination', () => {
  seedSubscriptionPlans();
  subscriptions.getState().deleteEntry('sub');
  expect(bankPlans.getState().workbook.entries.map(p => p.id)).toEqual(['done', 'manual']);
  expect(cashPlans.getState().workbook.entries).toHaveLength(0);
  expect(cardPlans.getState().workbook.entries).toHaveLength(0);
});

it('relinking and deleting an EMI loan cleans pending installments only', () => {
  bankPlans.getState().addEntries([
    { id: 'old', accountId: 'a1', date: '2026-10-01', amount: -10, description: 'Old', sourceEmiLoanId: 'loan' },
    { id: 'new', accountId: 'a2', date: '2026-10-01', amount: -10, description: 'New', sourceEmiLoanId: 'loan' },
    { id: 'done', accountId: 'a1', date: '2026-09-01', amount: -10, description: 'Done', sourceEmiLoanId: 'loan', executed: true },
  ]);
  emi.getState().updateEntry('loan', { linkedBankAccountId: 'a2' });
  expect(bankPlans.getState().workbook.entries.map(p => p.id)).toEqual(['new', 'done']);
  emi.getState().deleteEntry('loan');
  expect(bankPlans.getState().workbook.entries.map(p => p.id)).toEqual(['done']);
});

it('cloud hydration does not delete plans when related workbooks arrive later', () => {
  seedSubscriptionPlans();
  subscriptions.getState().setWorkbook({ ...subscriptions.getState().workbook, entries: [] }, { skipPersist: true });
  expect(bankPlans.getState().workbook.entries).toHaveLength(3);
});
