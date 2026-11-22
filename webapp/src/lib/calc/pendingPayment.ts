import type { BankTransaction } from '../../types/bankWorkbook';
import type { CashEntry } from '../../types/cashWorkbook';
import type { PlannedBankTransaction } from '../../types/plannedBank';
import type { PlannedCashEntry } from '../../types/plannedCash';
import { validBatchDate } from '../dateValidation';
import { planOccurrenceRecordId } from './planOccurrenceIdentity';
import { planOccurrences } from './planOccurrences';

export type PendingPaymentPlan =
  | { module: 'cash'; plan: PlannedCashEntry }
  | { module: 'bank'; plan: PlannedBankTransaction };

export function preparePendingPayment(input: PendingPaymentPlan, occurrenceDate: string, today: string) {
  if (!validBatchDate(occurrenceDate) || !validBatchDate(today) || occurrenceDate > today) {
    throw new Error('Choose an occurrence that is due.');
  }
  const { plan } = input;
  if (plan.sourceSubscriptionId || plan.sourceEmiLoanId || plan.sourceEmiObligationId) {
    throw new Error('This plan requires coordinated settlement with its source.');
  }
  if (plan.cancelled || plan.executed || !planOccurrences(
    [plan], occurrenceDate, occurrenceDate, new Date(today + 'T00:00:00Z'),
  ).some(row => !row.executed)) {
    throw new Error('This occurrence is no longer eligible.');
  }

  const reference = { id: plan.id, module: input.module };
  const id = planOccurrenceRecordId(reference, occurrenceDate);
  const common = {
    id, date: occurrenceDate, amount: plan.amount, isDeposit: false, isPending: true, source: 'manual' as const,
    planLink: { module: input.module, planId: plan.id, occurrenceDate, groupId: plan.groupId },
  };
  if (input.module === 'cash' && input.plan.type === 'OUT' && Number.isFinite(plan.amount) && plan.amount > 0 && input.plan.currencyCode) {
    return { module: 'cash' as const, record: { ...common, currencyCode: input.plan.currencyCode, note: input.plan.note, category: plan.category } satisfies CashEntry };
  }
  if (input.module === 'bank' && Number.isFinite(plan.amount) && plan.amount < 0 && input.plan.accountId) {
    return { module: 'bank' as const, record: { ...common, accountId: input.plan.accountId, description: input.plan.description, category: plan.category } satisfies BankTransaction };
  }
  throw new Error('Only valid outgoing Cash and Bank plans can create pending records.');
}
