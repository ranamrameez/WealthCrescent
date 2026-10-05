import type { RecurrenceRule } from '../../types/recurrence';
import { recurrenceOccurrencesWithin } from './recurrence';

interface RecurringPlan {
  id: string; date: string; recurrence?: RecurrenceRule; executed?: boolean;
  executedThrough?: string; completedDates?: string[];
  seriesId?: string;
}

export function occurrenceCompleted(plan: Pick<RecurringPlan, 'executedThrough' | 'completedDates'>, date: string) {
  return !!(plan.completedDates?.includes(date) || (plan.executedThrough && date <= plan.executedThrough));
}

/** Each recurrence has its own stable row; updates still target its source series. */
export function planOccurrences<T extends RecurringPlan>(plans: T[], fromDate?: string, toDate?: string, asOf = new Date(), horizonDays: number | null = 30): Array<T & { planId?: string; executed?: boolean }> {
  const today = asOf.toISOString().slice(0, 10);
  const end = new Date(asOf);
  end.setUTCDate(end.getUTCDate() + (horizonDays ?? 365));
  const endDate = toDate || end.toISOString().slice(0, 10);
  const snapshots = new Set(plans.filter(plan => plan.seriesId).map(plan => `${plan.seriesId}@${plan.date}`));
  return plans.flatMap((plan) => {
    if (!plan.recurrence) return (!fromDate || plan.date >= fromDate) && (!toDate || plan.date <= toDate) && (horizonDays === null || plan.date <= endDate) ? [plan] : [];
    const dates = recurrenceOccurrencesWithin(plan.recurrence, fromDate || today, toDate || (horizonDays === null ? plan.recurrence.endDate || endDate : endDate));
    return dates.filter(date => !snapshots.has(`${plan.id}@${date}`)).map((date) => ({ ...plan, planId: plan.id, id: `${plan.id}@${date}`, date, executed: occurrenceCompleted(plan, date) }));
  });
}
