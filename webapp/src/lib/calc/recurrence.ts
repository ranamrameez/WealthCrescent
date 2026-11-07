import type { RecurrenceRule } from '../../types/recurrence';

const MAX_ITER = 10000;

/** UTC calendar stepping with a stable billing-day anchor. A short month
 * clamps the day, never rolls into the following month. Passing the full rule
 * restores the original day after February (Jan 31 -> Feb 28 -> Mar 31).
 */
export function advanceRecurrence(date: Date, rule: Pick<RecurrenceRule, 'cycle' | 'customDays'> & Partial<Pick<RecurrenceRule, 'startDate'>>): Date {
  const d = new Date(date);
  if (rule.cycle === 'weekly' || rule.cycle === 'custom') {
    d.setUTCDate(d.getUTCDate() + (rule.cycle === 'weekly' ? 7 : Math.max(1, rule.customDays || 30)));
    return d;
  }
  const anchorDay = rule.startDate ? new Date(rule.startDate).getUTCDate() : d.getUTCDate();
  const month = d.getUTCMonth() + (rule.cycle === 'yearly' ? 12 : 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
  d.setUTCFullYear(d.getUTCFullYear(), month, Math.min(anchorDay, lastDay));
  return d;
}

/** Jump to the calendar bucket containing asOf before walking exclusions.
 * Historical daily/weekly rules cannot silently expire at MAX_ITER merely
 * because their start date is decades old.
 */
export function nextRecurrenceOccurrence(rule: RecurrenceRule, asOf: Date = new Date()): Date | null {
  const start = new Date(rule.startDate);
  const asOfStr = asOf.toISOString().slice(0, 10);
  const target = new Date(asOfStr);
  const dayDifference = Math.floor((target.getTime() - start.getTime()) / 86_400_000);
  const monthDifference = (target.getUTCFullYear() - start.getUTCFullYear()) * 12 + target.getUTCMonth() - start.getUTCMonth();
  const days = rule.cycle === 'weekly' ? 7 : Math.max(1, rule.customDays || 30);
  const index = Math.max(0, rule.cycle === 'yearly' ? target.getUTCFullYear() - start.getUTCFullYear()
    : rule.cycle === 'monthly' ? monthDifference : Math.floor(dayDifference / days));
  let d = new Date(start);
  if (rule.cycle === 'monthly' || rule.cycle === 'yearly') {
    const month = start.getUTCMonth() + index * (rule.cycle === 'yearly' ? 12 : 1);
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), month + 1, 0)).getUTCDate();
    d.setUTCFullYear(start.getUTCFullYear(), month, Math.min(start.getUTCDate(), lastDay));
  } else d.setUTCDate(start.getUTCDate() + index * days);
  let i = 0;
  while ((d.toISOString().slice(0, 10) < asOfStr || rule.excludedDates?.includes(d.toISOString().slice(0, 10))) && i < MAX_ITER) {
    d = advanceRecurrence(d, rule);
    i++;
  }
  if (i >= MAX_ITER || (rule.endDate && d.toISOString().slice(0, 10) > rule.endDate)) return null;
  return d;
}

/** Every occurrence date (inclusive) within `[fromDate, toDate]`, capped at
 * `MAX_ITER` occurrences as the same hang-guard as above. Used for the
 * Upcoming list's "next N days" window and for a subscription's own
 * multi-month renewal preview. */
export function recurrenceOccurrencesWithin(rule: RecurrenceRule, fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  let d = nextRecurrenceOccurrence(rule, new Date(fromDate));
  let i = 0;
  while (d && d.toISOString().slice(0, 10) <= toDate && i < MAX_ITER) {
    const occurrenceDate = d.toISOString().slice(0, 10);
    if (!rule.excludedDates?.includes(occurrenceDate)) out.push(occurrenceDate);
    const advanced = advanceRecurrence(d, rule);
    d = rule.endDate && advanced.toISOString().slice(0, 10) > rule.endDate ? null : advanced;
    i++;
  }
  return out;
}

/** Normalizes any cycle to a per-month figure — a $120/year rule and a
 * $10/month one should both read as $10/month for a fair "total monthly
 * recurring" comparison. */
export function recurrenceMonthlyEquivalent(rule: Pick<RecurrenceRule, 'cycle' | 'customDays'>, amount: number): number {
  switch (rule.cycle) {
    case 'yearly':
      return amount / 12;
    case 'weekly':
      return (amount * 52) / 12;
    case 'custom': {
      const days = Math.max(1, rule.customDays || 30);
      return (amount * 30) / days;
    }
    default:
      return amount;
  }
}
