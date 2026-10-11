import { qatarDate } from './activity.js';

export function dateRange(period, now = Date.now()) {
  if (period === 'all') return { from: '', to: '' };
  const to = qatarDate(now);
  const date = new Date(`${to}T00:00:00Z`);
  if (period === '1d') return { from: to, to };
  if (period === '7d') date.setUTCDate(date.getUTCDate() - 6);
  else {
    const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[period];
    if (!months) throw new Error('Unknown date range.');
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - months);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  return { from: date.toISOString().slice(0, 10), to };
}
