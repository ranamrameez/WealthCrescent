import { occurrenceCompleted } from './planOccurrences';
import type { BankAccount } from '../../types/bankWorkbook';
import type { PlannedBankTransaction } from '../../types/plannedBank';
import type { PlannedCashEntry } from '../../types/plannedCash';
import type { PlannedCreditCardTransaction } from '../../types/plannedCreditCard';
import type { PlannedRentalEntry } from '../../types/plannedRentals';
import type { CreditCard } from '../../types/creditCard';
import type { EMILoan } from '../../types/emiWorkbook';
import type { Property } from '../../types/rentalsWorkbook';
import type { Subscription } from '../../types/subscriptionsWorkbook';
import { recurrenceOccurrencesWithin } from './recurrence';
import { emiSchedule, emiSummary, installmentDueDate } from './emiModule';
import { proposeRentCollection } from './rentalPlanning';
import { generateRenewalOccurrences } from './subscriptionsModule';

export interface UpcomingItem {
  id: string;
  date: string;
  module: 'cash' | 'bank' | 'creditCards' | 'emi' | 'rentals' | 'subscriptions';
  label: string;
  amount: number;
  currencyCode: string;
  kind: 'income' | 'expense';
  /** Kept for renderer compatibility. Upcoming is now future-only; overdue
   * obligations belong in Alerts and are never emitted by this collector. */
  overdue: false;
  /** Human-readable due timing, calculated with the rest of the read model. */
  dueLabel: string;
  href?: string;
}

export interface UpcomingInputs {
  plannedCash: PlannedCashEntry[];
  plannedBank: PlannedBankTransaction[];
  bankAccounts: BankAccount[];
  plannedCreditCards?: PlannedCreditCardTransaction[];
  creditCards?: CreditCard[];
  plannedRentals?: PlannedRentalEntry[];
  emiLoans: EMILoan[];
  rentalProperties: Property[];
  subscriptions: Subscription[];
}

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function inWindow(date: string, today: string, end: string): boolean {
  return date >= today && date <= end;
}

/** Upcoming is deliberately a forward-looking list, not an overdue queue.
 * It contains only active, unresolved occurrences from today through the
 * requested horizon. Historical missed obligations are handled by Alerts.
 * All module-owned plans are included, and references to deleted/archived
 * entities are discarded instead of being rendered as stale rows. */
export function collectUpcomingItems(inputs: UpcomingInputs, windowDays = 14, today: Date = new Date()): UpcomingItem[] {
  const todayStr = today.toISOString().slice(0, 10);
  const windowEndStr = addUtcDays(todayStr, windowDays);
  const items: Array<Omit<UpcomingItem, 'dueLabel'>> = [];
  const plannedSubscriptionKeys = new Set<string>();

  const addRecurringKeys = <T extends { sourceSubscriptionId?: string; recurrence?: PlannedCashEntry['recurrence']; date: string }>(plans: T[]) => {
    plans.forEach(plan => {
      if (!plan.sourceSubscriptionId) return;
      const dates = plan.recurrence
        ? recurrenceOccurrencesWithin(plan.recurrence, todayStr, windowEndStr)
        : [plan.date];
      dates.filter(date => inWindow(date, todayStr, windowEndStr)).forEach(date => {
        plannedSubscriptionKeys.add(`${plan.sourceSubscriptionId}@${date}`);
      });
    });
  };
  addRecurringKeys(inputs.plannedCash);
  addRecurringKeys(inputs.plannedBank);
  addRecurringKeys(inputs.plannedCreditCards ?? []);

  inputs.plannedCash.forEach(plan => {
    const label = plan.category?.trim() || plan.note?.trim() || 'Cash plan';
    const add = (date: string, id: string) => {
      if (!inWindow(date, todayStr, windowEndStr)) return;
      items.push({ id, date, module: 'cash', label, amount: Math.abs(plan.amount), currencyCode: plan.currencyCode, kind: plan.type === 'IN' ? 'income' : 'expense', overdue: false });
    };
    if (plan.recurrence) {
      recurrenceOccurrencesWithin(plan.recurrence, todayStr, windowEndStr)
        .filter(date => !occurrenceCompleted(plan, date))
        .forEach(date => add(date, `${plan.id}@${date}`));
    } else if (!plan.executed) add(plan.date, plan.id);
  });

  const activeAccounts = inputs.bankAccounts.filter(account => account.isActive !== false);
  const currencyByAccount = new Map(activeAccounts.map(account => [account.id, account.currencyCode]));
  inputs.plannedBank.forEach(plan => {
    const currencyCode = currencyByAccount.get(plan.accountId);
    if (!currencyCode) return;
    const add = (date: string, id: string) => {
      if (!inWindow(date, todayStr, windowEndStr)) return;
      items.push({ id, date, module: 'bank', label: plan.description, amount: Math.abs(plan.amount), currencyCode, kind: plan.amount >= 0 ? 'income' : 'expense', overdue: false });
    };
    if (plan.recurrence) {
      recurrenceOccurrencesWithin(plan.recurrence, todayStr, windowEndStr)
        .filter(date => !occurrenceCompleted(plan, date))
        .forEach(date => add(date, `${plan.id}@${date}`));
    } else if (!plan.executed) add(plan.date, plan.id);
  });

  const activeCards = (inputs.creditCards ?? []).filter(card => card.isActive !== false);
  const currencyByCard = new Map(activeCards.map(card => [card.id, card.currencyCode]));
  (inputs.plannedCreditCards ?? []).forEach(plan => {
    const currencyCode = currencyByCard.get(plan.cardId);
    if (!currencyCode) return;
    const add = (date: string, id: string) => {
      if (!inWindow(date, todayStr, windowEndStr)) return;
      items.push({ id, date, module: 'creditCards', label: plan.description, amount: Math.abs(plan.amount), currencyCode, kind: 'expense', overdue: false });
    };
    if (plan.recurrence) {
      recurrenceOccurrencesWithin(plan.recurrence, todayStr, windowEndStr)
        .filter(date => !occurrenceCompleted(plan, date))
        .forEach(date => add(date, `${plan.id}@${date}`));
    } else if (!plan.executed) add(plan.date, plan.id);
  });

  inputs.emiLoans.filter(loan => loan.isActive !== false).forEach(loan => {
    const { rows } = emiSchedule(loan);
    const summary = emiSummary(loan, today);
    const next = rows[summary.elapsed];
    if (!next) return;
    const due = installmentDueDate(loan, next.month);
    if (!inWindow(due, todayStr, windowEndStr)) return;
    items.push({ id: `${loan.id}@${due}`, date: due, module: 'emi', label: `${loan.name} installment`, amount: next.emi, currencyCode: loan.currencyCode, kind: 'expense', overdue: false });
  });

  const activeProperties = inputs.rentalProperties.filter(property => property.isActive !== false);
  const propertyById = new Map(activeProperties.map(property => [property.id, property]));
  const plannedRentalKeys = new Set<string>();
  (inputs.plannedRentals ?? []).forEach(plan => {
    const property = propertyById.get(plan.propertyId);
    if (!property || plan.executed || !inWindow(plan.date, todayStr, windowEndStr)) return;
    plannedRentalKeys.add(`${plan.propertyId}@${plan.date}`);
    items.push({
      id: plan.id,
      date: plan.date,
      module: 'rentals',
      label: plan.category?.trim() || plan.note?.trim() || `${property.name} rent`,
      amount: Math.abs(plan.amount),
      currencyCode: plan.finance?.currencyCode ?? property.currencyCode,
      kind: plan.type === 'RENT_INCOME' ? 'income' : 'expense',
      overdue: false,
    });
  });
  activeProperties.forEach(property => {
    const proposal = proposeRentCollection(property, today);
    if (!proposal || !inWindow(proposal.dueDate, todayStr, windowEndStr)) return;
    if (plannedRentalKeys.has(`${property.id}@${proposal.dueDate}`)) return;
    items.push({ id: `${property.id}@${proposal.dueDate}`, date: proposal.dueDate, module: 'rentals', label: `${property.name} rent`, amount: proposal.amount, currencyCode: property.currencyCode, kind: 'income', overdue: false });
  });

  inputs.subscriptions.filter(subscription => subscription.active).forEach(subscription => {
    generateRenewalOccurrences(subscription, today)
      .filter(occurrence => inWindow(occurrence.date, todayStr, windowEndStr))
      .filter(occurrence => !plannedSubscriptionKeys.has(`${subscription.id}@${occurrence.date}`))
      .forEach(occurrence => items.push({
        id: `${subscription.id}@${occurrence.date}`,
        date: occurrence.date,
        module: 'subscriptions',
        label: subscription.name,
        amount: occurrence.amount,
        currencyCode: subscription.currencyCode,
        kind: 'expense',
        overdue: false,
      }));
  });

  return items
    .sort((a, b) => a.date.localeCompare(b.date) || a.module.localeCompare(b.module) || a.id.localeCompare(b.id))
    .map(item => {
      const days = Math.round((Date.parse(`${item.date}T00:00:00.000Z`) - Date.parse(`${todayStr}T00:00:00.000Z`)) / 86400000);
      const dueLabel = days === 0 ? 'Due Today' : days === 1 ? 'Happening tomorrow' : `Happening in ${days} days`;
      return { ...item, dueLabel };
    });
}
