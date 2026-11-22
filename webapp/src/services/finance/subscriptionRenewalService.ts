import { categoryName, UNCATEGORIZED_ID } from '../../lib/categories';
import { generateRenewalOccurrences } from '../../lib/calc/subscriptionsModule';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { requireCurrentSubscription, requireSubscriptionOwner } from './subscriptionLifecycleService';
import type { Subscription } from '../../types/subscriptionsWorkbook';

export type RenewalFundingSource = { module: 'cash' } | { module: 'bank' | 'creditCard'; ref: string };

export function regenerateSubscriptionRenewals(expected: Subscription, funding: RenewalFundingSource, owner: string, asOf = new Date()) {
  const subscriptions = requireSubscriptionOwner(owner);
  const sub = requireCurrentSubscription(subscriptions, expected);
  if (!sub.active || !Number.isFinite(sub.amount) || sub.amount <= 0) throw new Error('Choose an active subscription with a valid amount.');

  const bank = usePlannedBankWorkbookStore.getState();
  const cash = usePlannedCashWorkbookStore.getState();
  const cards = usePlannedCreditCardWorkbookStore.getState();
  const account = funding.module === 'bank'
    ? useBankWorkbookStore.getState().workbook.settings.accounts.find(item => item.id === funding.ref && !item.migratedToCreditCardId)
    : undefined;
  const card = funding.module === 'creditCard'
    ? useCreditCardWorkbookStore.getState().workbook.cards.find(item => item.id === funding.ref)
    : undefined;
  const source = account ?? card;
  if (funding.module !== 'cash' && (!source || source.isActive === false || source.currencyCode !== sub.currencyCode)) {
    throw new Error('Choose an active funding source in the subscription currency.');
  }

  const keep = (plan: { sourceSubscriptionId?: string; executed?: boolean }) => plan.sourceSubscriptionId !== sub.id || !!plan.executed;
  const completedDates = new Set([...bank.workbook.entries, ...cash.workbook.entries, ...cards.workbook.entries]
    .filter(plan => plan.sourceSubscriptionId === sub.id && plan.executed).map(plan => plan.date));
  const renewals = generateRenewalOccurrences(sub, asOf).filter(item => !completedDates.has(item.date));
  const description = `Subscription: ${sub.name}`;
  const records = renewals.map(({ date, amount }) => ({
    id: crypto.randomUUID(), date, amount, executed: false, sourceSubscriptionId: sub.id,
  }));
  const planCategory = sub.categoryID && sub.categoryID !== UNCATEGORIZED_ID
    ? categoryName(sub.categoryID, useCategoryStore.getState().workbook.categories) : sub.category;
  const bankEntries = bank.workbook.entries.filter(keep);
  const cashEntries = cash.workbook.entries.filter(keep);
  const cardEntries = cards.workbook.entries.filter(keep);
  if (account) bankEntries.push(...records.map(record => ({ ...record, accountId: account.id, description, amount: -record.amount })));
  if (card) cardEntries.push(...records.map(record => ({ ...record, cardId: card.id, kind: 'charge' as const, description })));
  if (funding.module === 'cash') cashEntries.push(...records.map(record => ({
    ...record, type: 'OUT' as const, currencyCode: sub.currencyCode, category: planCategory, note: description,
  })));

  // Prepare each replacement before making local workbook updates.
  if (account || bankEntries.length !== bank.workbook.entries.length) bank.setWorkbook({ ...bank.workbook, entries: bankEntries });
  if (card || cardEntries.length !== cards.workbook.entries.length) cards.setWorkbook({ ...cards.workbook, entries: cardEntries });
  if (funding.module === 'cash' || cashEntries.length !== cash.workbook.entries.length) cash.setWorkbook({ ...cash.workbook, entries: cashEntries });
  subscriptions.updateEntry(sub.id, { paidVia: funding });
  return { count: records.length, sourceName: source?.name ?? 'Cash' };
}
