import { occurrenceCompleted } from './planOccurrences';
import { pendingOccurrenceKey, pendingOccurrenceKeys } from './planOccurrenceIdentity';
import type { CashEntry } from '../../types/cashWorkbook';
import type { BankAccount, BankTransaction } from '../../types/bankWorkbook';
import type { PlannedBankTransaction } from '../../types/plannedBank';
import type { PlannedCashEntry } from '../../types/plannedCash';
import type { PlannedCreditCardTransaction } from '../../types/plannedCreditCard';
import type { PlannedRentalEntry } from '../../types/plannedRentals';
import type { CreditCard } from '../../types/creditCard';
import type { EMILoan } from '../../types/emiWorkbook';
import type { Property } from '../../types/rentalsWorkbook';
import type { Subscription } from '../../types/subscriptionsWorkbook';
import { recurrenceOccurrencesWithin } from './recurrence';
import { emiSchedule, emiSummary, emiRepaymentSummary, installmentDueDate } from './emiModule';
import { standaloneRentCollections } from './rentalPlanning';
import { generateRenewalOccurrences } from './subscriptionsModule';

export interface UpcomingItem {
  id: string;
  date: string;
  module: 'cash' | 'bank' | 'creditCards' | 'emi' | 'rentals' | 'subscriptions';
  label: string;
  amount: number;
  currencyCode: string;
  kind: 'income' | 'expense';
  estimate?: boolean;
  /** Kept for renderer compatibility. Upcoming is now future-only; overdue
   * obligations belong in Alerts and are never emitted by this collector. */
  overdue: false;
  /** Human-readable due timing, calculated with the rest of the read model. */
  dueLabel: string;
  href?: string;
}

export interface UpcomingInputs {
  plannedCash: PlannedCashEntry[];
  cashEntries?: CashEntry[];
  plannedBank: PlannedBankTransaction[];
  bankTransactions?: BankTransaction[];
  bankAccounts: BankAccount[];
  plannedCreditCards?: PlannedCreditCardTransaction[];
  creditCards?: CreditCard[];
  plannedRentals?: PlannedRentalEntry[];
  emiLoans: EMILoan[];
  emiRepayments?: import('../../types/emiWorkbook').EMIRepayment[];
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

/** A funded renewal belongs to its existing plan. Standalone schedules only
 * estimate future outflows, including when a funding source has gone inactive. */
export function standaloneSubscriptionRenewals(
  inputs: Pick<UpcomingInputs, 'subscriptions' | 'plannedCash' | 'plannedBank' | 'plannedCreditCards' | 'bankAccounts' | 'creditCards'>,
  today: Date,
  endDate: string,
) {
  const todayStr = today.toISOString().slice(0, 10);
  const plannedSubscriptionKeys = new Set<string>();
  const currencyByAccount = new Map(inputs.bankAccounts
    .filter(account => account.isActive !== false && !account.migratedToCreditCardId)
    .map(account => [account.id, account.currencyCode]));
  const currencyByCard = new Map((inputs.creditCards ?? [])
    .filter(card => card.isActive !== false)
    .map(card => [card.id, card.currencyCode]));
  type SubscriptionPlan = PlannedCashEntry | PlannedBankTransaction | PlannedCreditCardTransaction;
  const activeSubscriptions = new Map(inputs.subscriptions.filter(row => row.active).map(row => [row.id, row]));
  const addRecurringKeys = (plans: SubscriptionPlan[], payingCurrency: (plan: SubscriptionPlan) => string | undefined) => {
    for (const plan of plans) {
      const subscription = plan.sourceSubscriptionId ? activeSubscriptions.get(plan.sourceSubscriptionId) : undefined;
      if (!subscription) continue;
      const dates = plan.recurrence ? recurrenceOccurrencesWithin(plan.recurrence, todayStr, endDate) : [plan.date];
      for (const date of dates.filter(date => inWindow(date, todayStr, endDate))) {
        const completed = plan.recurrence ? occurrenceCompleted(plan, date) : plan.executed;
        if (completed || (!plan.cancelled && Number.isFinite(plan.amount) && plan.amount !== 0 && payingCurrency(plan) === subscription.currencyCode)) {
          plannedSubscriptionKeys.add(`${subscription.id}@${date}`);
        }
      }
    }
  };
  addRecurringKeys(inputs.plannedCash, plan => 'currencyCode' in plan && plan.type === 'OUT' ? plan.currencyCode : undefined);
  addRecurringKeys(inputs.plannedBank, plan => 'accountId' in plan && plan.amount < 0 ? currencyByAccount.get(plan.accountId) : undefined);
  addRecurringKeys(inputs.plannedCreditCards ?? [], plan => 'cardId' in plan && plan.kind === 'charge' ? currencyByCard.get(plan.cardId) : undefined);
  return [...activeSubscriptions.values()].flatMap(subscription =>
    generateRenewalOccurrences(subscription, today)
      .filter(({ date }) => inWindow(date, todayStr, endDate) && !plannedSubscriptionKeys.has(`${subscription.id}@${date}`))
      .map(occurrence => ({ ...occurrence, subscription })),
  );
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
  const currencyByAccount = new Map(inputs.bankAccounts
    .filter(account => account.isActive !== false && !account.migratedToCreditCardId)
    .map(account => [account.id, account.currencyCode]));
  const currencyByCard = new Map((inputs.creditCards ?? [])
    .filter(card => card.isActive !== false)
    .map(card => [card.id, card.currencyCode]));
  const activeLoans = inputs.emiLoans.filter(loan => loan.isActive !== false);
  const contracts = new Map(activeLoans.filter(loan => loan.contractSchedule).map(loan => {
    const rows = emiRepaymentSummary(loan, inputs.emiRepayments ?? [], todayStr).independent!.rows;
    return [loan.id, { loan, rows: new Map(rows.map(row => [row.id, row])) }];
  }));
  type FundedPlan = Pick<PlannedCashEntry, 'sourceEmiLoanId' | 'sourceEmiObligationId'>;
  type Item = Omit<UpcomingItem, 'dueLabel'>;
  const fundedRows = new Map<string, Item[]>();
  const obligationKey = (loanId: string, obligationId: string) => JSON.stringify([loanId, obligationId]);
  const addItem = (plan: FundedPlan, item: Item, canFundLoan: boolean) => {
    if (!plan.sourceEmiObligationId) { items.push(item); return; }
    const contract = plan.sourceEmiLoanId ? contracts.get(plan.sourceEmiLoanId) : undefined;
    const row = contract?.rows.get(plan.sourceEmiObligationId);
    if (!contract || !row || row.dueDate !== item.date || contract.loan.currencyCode !== item.currencyCode ||
        !canFundLoan || !Number.isFinite(item.amount) || item.amount <= 0) return;
    const key = obligationKey(contract.loan.id, row.id);
    const rows = fundedRows.get(key) ?? [];
    rows.push(item);
    fundedRows.set(key, rows);
  };

  const reservedCash = pendingOccurrenceKeys(inputs.cashEntries ?? [], 'cash', row => row.currencyCode);
  const reservedBank = pendingOccurrenceKeys(inputs.bankTransactions ?? [], 'bank', row => row.accountId);

  inputs.plannedCash.forEach(plan => {
    if(plan.cancelled)return;
    const label = plan.category?.trim() || plan.note?.trim() || 'Cash plan';
    const add = (date: string, id: string) => {
      if (!inWindow(date, todayStr, windowEndStr) || reservedCash.has(pendingOccurrenceKey(plan.currencyCode, plan.id, date))) return;
      addItem(plan, { id, date, module: 'cash', label, amount: Math.abs(plan.amount), currencyCode: plan.currencyCode, kind: plan.type === 'IN' ? 'income' : 'expense', overdue: false }, plan.type === 'OUT');
    };
    if (plan.recurrence) {
      recurrenceOccurrencesWithin(plan.recurrence, todayStr, windowEndStr)
        .filter(date => !occurrenceCompleted(plan, date))
        .forEach(date => add(date, `${plan.id}@${date}`));
    } else if (!plan.executed) add(plan.date, plan.id);
  });

  inputs.plannedBank.forEach(plan => {
    if(plan.cancelled)return;
    const currencyCode = currencyByAccount.get(plan.accountId);
    if (!currencyCode) return;
    const add = (date: string, id: string) => {
      if (!inWindow(date, todayStr, windowEndStr) || reservedBank.has(pendingOccurrenceKey(plan.accountId, plan.id, date))) return;
      addItem(plan, { id, date, module: 'bank', label: plan.description, amount: Math.abs(plan.amount), currencyCode, kind: plan.amount >= 0 ? 'income' : 'expense', overdue: false }, plan.amount < 0);
    };
    if (plan.recurrence) {
      recurrenceOccurrencesWithin(plan.recurrence, todayStr, windowEndStr)
        .filter(date => !occurrenceCompleted(plan, date))
        .forEach(date => add(date, `${plan.id}@${date}`));
    } else if (!plan.executed) add(plan.date, plan.id);
  });

  (inputs.plannedCreditCards ?? []).forEach(plan => {
    if(plan.cancelled)return;
    const currencyCode = currencyByCard.get(plan.cardId);
    if (!currencyCode) return;
    const add = (date: string, id: string) => {
      if (!inWindow(date, todayStr, windowEndStr)) return;
      addItem(plan, { id, date, module: 'creditCards', label: plan.description, amount: Math.abs(plan.amount), currencyCode, kind: 'expense', overdue: false }, plan.kind === 'charge');
    };
    if (plan.recurrence) {
      recurrenceOccurrencesWithin(plan.recurrence, todayStr, windowEndStr)
        .filter(date => !occurrenceCompleted(plan, date))
        .forEach(date => add(date, `${plan.id}@${date}`));
    } else if (!plan.executed) add(plan.date, plan.id);
  });

  activeLoans.forEach(loan => {
    const contract = contracts.get(loan.id);
    if (contract) {
      for (const row of contract.rows.values()) {
        if (!(row.remaining > 0.0000001 && inWindow(row.dueDate, todayStr, windowEndStr))) continue;
        const funding = fundedRows.get(obligationKey(loan.id, row.id)) ?? [];
        const plannedAmount = funding.reduce((sum, item) => sum + item.amount, 0);
        const validFunding = plannedAmount <= row.remaining + 0.0000001;
        if (validFunding) items.push(...funding);
        const remainder = validFunding ? row.remaining - plannedAmount : row.remaining;
        if (remainder > 0.0000001) {
          items.push({ id: `emi-contract:${loan.id}:${row.id}`, date: row.dueDate, module: 'emi', label: `${loan.name}: ${row.description}`, amount: remainder, currencyCode: loan.currencyCode, kind: 'expense', overdue: false });
        }
      }
      return;
    }
    const { rows } = emiSchedule(loan);
    const summary = emiSummary(loan, today);
    const next = rows[summary.elapsed];
    if (!next) return;
    const due = installmentDueDate(loan, next.month);
    if (!inWindow(due, todayStr, windowEndStr)) return;
    // The explicit loan ID plus due date identifies this occurrence. Legacy
    // plans can carry a stale installment index; never rewrite it or infer settlement.
    // Keep partial, differently dated/currency, completed or stale-source plans distinct.
    const representedByBank = inputs.plannedBank.some(plan =>
      !plan.executed && !plan.cancelled && !plan.recurrence && plan.sourceEmiLoanId === loan.id
      && plan.date === due
      && currencyByAccount.get(plan.accountId) === loan.currencyCode
      && plan.amount < 0 && Math.abs(-plan.amount - next.emi) < 0.000001);
    if (representedByBank) return;
    items.push({ id: `${loan.id}@${due}`, date: due, module: 'emi', label: `${loan.name} installment`, amount: next.emi, currencyCode: loan.currencyCode, estimate: true, kind: 'expense', overdue: false });
  });

  const activeProperties = inputs.rentalProperties.filter(property => property.isActive !== false);
  const propertyById = new Map(activeProperties.map(property => [property.id, property]));
  (inputs.plannedRentals ?? []).forEach(plan => {
    const property = propertyById.get(plan.propertyId);
    if (!property || plan.executed || plan.cancelled || !inWindow(plan.date, todayStr, windowEndStr)) return;
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
  for (const { property, dueDate, amount } of standaloneRentCollections(activeProperties, inputs.plannedRentals ?? [], today, windowEndStr)) {
    items.push({ id: `${property.id}@${dueDate}`, date: dueDate, module: 'rentals', label: `${property.name} rent`, amount,
      currencyCode: property.currencyCode, estimate: true, kind: 'income', overdue: false });
  }

  for (const { subscription, date, amount } of standaloneSubscriptionRenewals(inputs, today, windowEndStr)) {
    items.push({
      id: `${subscription.id}@${date}`,
      date,
      module: 'subscriptions',
      label: subscription.name,
      amount,
      estimate: true,
      currencyCode: subscription.currencyCode,
      kind: 'expense',
      overdue: false,
    });
  }

  return items
    .sort((a, b) => a.date.localeCompare(b.date) || a.module.localeCompare(b.module) || a.id.localeCompare(b.id))
    .map(item => {
      const days = Math.round((Date.parse(`${item.date}T00:00:00.000Z`) - Date.parse(`${todayStr}T00:00:00.000Z`)) / 86400000);
      const dueLabel = days === 0 ? 'Due Today' : days === 1 ? 'Happening tomorrow' : `Happening in ${days} days`;
      return { ...item, dueLabel };
    });
}
