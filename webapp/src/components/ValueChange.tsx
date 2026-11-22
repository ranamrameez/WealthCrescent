import { ArrowDownIcon, ArrowUpIcon } from './icons';
import { fmtMoney } from '../lib/format';
/** Presentation of a service-provided delta. Does not calculate balances or ratios. */
export function ValueChange({ amount, percent, currency, favourable = 'increase' }: { amount: number | null; percent?: number | null; currency: string; favourable?: 'increase' | 'decrease' }) {
  if (amount === null) return <span className="text-muted">Change unavailable</span>;
  const direction = amount > 0 ? 'Increase' : amount < 0 ? 'Decrease' : 'No change';
  const positive = favourable === 'increase' ? amount >= 0 : amount <= 0;
  return <span className={'value-change ' + (positive ? 'text-profit' : 'text-loss')} aria-label={direction + ' ' + fmtMoney(amount, currency)}>
    {amount > 0 ? <ArrowUpIcon /> : amount < 0 ? <ArrowDownIcon /> : <span aria-hidden="true">→</span>}
    <span>{fmtMoney(amount, currency)}</span>{percent != null && <small>({percent.toFixed(1)}%)</small>}
  </span>;
}
