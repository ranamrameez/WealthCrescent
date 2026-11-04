import type { TransactionPageFilters, TransactionPeriod } from '../hooks/useUrlTransactionFilters';
import { currentMonthRange, presetDateRange } from '../lib/dateRange';

const PRESETS: Array<{ value: TransactionPeriod; label: string }> = [
  { value: 'since-month', label: 'This month' },
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
function shiftMonth(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}
function monthLabel(value: string): string {
  return new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Shared app-wide reporting period control. It uses the same presets as
 * transaction pages and keeps date navigation URL-backed through the
 * owning page's useUrlTransactionFilters state. */
export function DateRangeWidget({ value, onChange }: {
  value: TransactionPageFilters;
  onChange: (patch: Partial<TransactionPageFilters>) => void;
}) {
  const today = todayISO();
  const from = value.fromDate || currentMonthRange().startDate;
  const to = value.toDate || today;
  const isCurrent = to >= today;
  const rangeLabel = value.period === 'all'
    ? 'All history'
    : from.slice(0, 7) === to.slice(0, 7)
      ? monthLabel(from)
      : `${monthLabel(from)} – ${monthLabel(to)}`;

  const applyPreset = (period: TransactionPeriod) => {
    if (period === 'all') {
      onChange({ period, fromDate: '', toDate: '' });
      return;
    }
    if (period === 'custom') {
      const currentTo = value.toDate && value.toDate < today ? value.toDate : today;
      const currentFrom = value.fromDate || currentMonthRange().startDate;
      onChange({ period, fromDate: currentFrom > currentTo ? currentTo : currentFrom, toDate: currentTo });
      return;
    }
    const range = period === 'since-month' ? currentMonthRange() : presetDateRange(period);
    onChange({ period, fromDate: range.startDate, toDate: range.endDate > today ? today : range.endDate });
  };

  const shift = (amount: number) => {
    if (value.period === 'all') return;
    const nextFrom = shiftMonth(from, amount);
    const nextTo = shiftMonth(to, amount);
    const boundedTo = nextTo > today ? today : nextTo;
    const boundedFrom = nextFrom > boundedTo ? boundedTo : nextFrom;
    onChange({ period: 'custom', fromDate: boundedFrom, toDate: boundedTo });
  };

  return (
    <div className="topbar-date-range" role="group" aria-label="Reporting period" style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
      <button type="button" className="btn secondary small" aria-label="Previous period" title="Previous period" disabled={value.period === 'all'} onClick={() => shift(-1)}>‹</button>
      <select
        className="topbar-select"
        aria-label="Date range"
        title={rangeLabel}
        value={value.period}
        onChange={event => applyPreset(event.target.value as TransactionPeriod)}
        style={{ maxWidth: 124, minWidth: 92 }}
      >
        {PRESETS.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
      </select>
      <button type="button" className="btn secondary small" aria-label="Next period" title="Next period" disabled={value.period === 'all' || isCurrent} onClick={() => shift(1)}>›</button>
      {value.period === 'custom' && (
        <div className="topbar-date-range-custom" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input aria-label="From date" type="date" value={value.fromDate} max={value.toDate || today} onChange={event => onChange({ period: 'custom', fromDate: event.target.value })} />
          <span className="text-muted">–</span>
          <input aria-label="To date" type="date" value={value.toDate || today} min={value.fromDate || undefined} max={today} onChange={event => onChange({ period: 'custom', toDate: event.target.value })} />
        </div>
      )}
    </div>
  );
}
