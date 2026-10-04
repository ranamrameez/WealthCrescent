import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../types/workbook';
const { chart } = vi.hoisted(() => ({ chart: vi.fn(() => null) }));
vi.mock('react-chartjs-2', () => ({ Chart: chart }));
import { StockTradingChart } from '../StockTradingChart';

describe('StockTradingChart', () => {
  it('aggregates dates, weights prices by shares, and excludes pending and other tickers', () => {
    const transactions: Transaction[] = [
      { date: '2026-02-02', ticker: 'A', action: 'SELL', shares: 5, price: 30 },
      { date: '2026-02-01', ticker: 'A', action: 'BUY', shares: 10, price: 10 },
      { date: '2026-02-01', ticker: 'A', action: 'BUY', shares: 30, price: 20 },
      { date: '2026-02-01', ticker: 'A', action: 'BUY', shares: 100, price: 90, isPending: true },
      { date: '2026-02-01', ticker: 'B', action: 'BUY', shares: 100, price: 90 },
    ];
    render(<StockTradingChart transactions={transactions} ticker="A" currency="QAR" />);
    const data = (chart.mock.calls.at(-1) as unknown as [{ data: { labels: string[]; datasets: { data: unknown[] }[] } }])[0].data;
    expect(data.labels).toEqual(['2026-02-01', '2026-02-02']);
    expect(data.datasets.map(d => d.data)).toEqual([[40, 0], [0, 5], [17.5, null], [null, 30], [700, 700], [0, 150]]);
  });
});
