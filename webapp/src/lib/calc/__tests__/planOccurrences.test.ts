import { describe, expect, it } from 'vitest';
import { planOccurrences } from '../planOccurrences';
import { collectBudgetActivities } from '../budgetPlanner';
import { isPlanDue, plannedCashProjection } from '../plannedBalance';

const plan = { id: 'salary', date: '2026-01-28', type: 'IN' as const, amount: 100, currencyCode: 'USD', recurrence: { cycle: 'monthly' as const, startDate: '2026-01-28' } };

describe('recurring plan occurrences', () => {
  it('gives every date a unique row and preserves an early completion', () => {
    const completed = { ...plan, completedDates: ['2026-10-28'] };
    const rows = planOccurrences([completed], '2026-09-01', '2026-11-30');
    expect(rows.map(row => [row.id, row.date, row.executed])).toEqual([
      ['salary@2026-09-28', '2026-09-28', false],
      ['salary@2026-10-28', '2026-10-28', true],
      ['salary@2026-11-28', '2026-11-28', false],
    ]);
    expect(rows.every(row => row.planId === 'salary')).toBe(true);
    expect(isPlanDue(completed, new Date('2026-10-05'), 30)).toBe(false);
  });
  it('honors legacy completion markers and recurrence end dates', () => {
    const rows = planOccurrences([{ ...plan, executedThrough: '2026-09-28', recurrence: { ...plan.recurrence, endDate: '2026-10-28' } }], '2026-09-01', '2026-12-31');
    expect(rows.map(row => row.executed)).toEqual([true, false]);
  });
  it('retains a fulfilled occurrence snapshot after its series amount changes', () => {
    const rows = planOccurrences([
      { ...plan, amount: 200, completedDates: ['2026-10-28'] },
      { ...plan, id: 'completed', seriesId: plan.id, date: '2026-10-28', recurrence: undefined, executed: true },
    ], '2026-10-01', '2026-11-30');
    expect(rows.filter(row => row.date === '2026-10-28')).toHaveLength(1);
    expect(rows.find(row => row.id === 'completed')).toMatchObject({ amount: 100, executed: true });
    expect(rows.find(row => row.date === '2026-11-28')).toMatchObject({ amount: 200, executed: false });
  });
  it('projects every unfulfilled occurrence within the selected horizon', () => {
    const weekly = { ...plan, recurrence: { cycle: 'weekly' as const, startDate: '2026-10-05' }, completedDates: ['2026-10-12'] };
    const projection = plannedCashProjection([], [weekly], new Date('2026-10-05'), 30);
    // Five weekly dates fall in this window; one has already been fulfilled.
    expect(projection.USD).toEqual({ real: 0, planned: 400 });
  });
  it('removes a completed future occurrence from combined planned activity', () => {
    const day = new Date().toISOString().slice(0, 10);
    const activities = collectBudgetActivities({ cashEntries: [], plannedCash: [{ ...plan, date: day, recurrence: { cycle: 'monthly', startDate: day }, completedDates: [day] }], bankAccounts: [], bankTransactions: [], plannedBank: [], rentalProperties: [], rentalEntries: [], plannedRentals: [], categories: [] });
    expect(activities.some(activity => activity.date === day && !activity.executed)).toBe(false);
  });
});
