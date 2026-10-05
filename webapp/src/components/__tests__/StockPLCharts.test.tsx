import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Transaction } from '../../types/workbook';
const { chart } = vi.hoisted(() => ({ chart: vi.fn((_props: unknown) => null) }));
vi.mock('react-chartjs-2', () => ({ Line: chart, Bar: chart }));
import { StockPLCharts } from '../StockPLCharts';
type ChartProps = { data: { labels: string[]; datasets: { data: unknown[] }[] } };
afterEach(() => { cleanup(); chart.mockClear(); });
describe('StockPLCharts', () => {
  it('preserves earlier cost basis and lifetime totals when filtering dates and entries', () => {
    const transactions: Transaction[] = [
      { date: '2026-01-01', ticker: 'A', action: 'BUY', shares: 10, price: 10 },
      { date: '2026-02-01', ticker: 'A', action: 'SELL', shares: 5, price: 20 },
      { date: '2026-02-01', ticker: 'A', action: 'BUY', shares: 5, price: 15 },
    ];
    render(<StockPLCharts transactions={transactions} priceHistory={{ A: [{ date: '2026-02-01', price: 20 }] }} calcFee={() => 0} currency="QAR" filter={{ tickers: ['A'], fromMonth: '2026-02', toMonth: '2026-02' }} />);
    const charts = chart.mock.calls.map(([props]) => (props as ChartProps).data);
    expect(charts).toHaveLength(5);
    expect(charts[1].datasets[0].data[0]).toBeCloseTo(125 / 3);
    expect(charts[3].datasets[0].data[0]).toBeCloseTo(250 / 3);
    chart.mockClear();
    fireEvent.change(screen.getByLabelText('Profit/loss detail'), { target: { value: 'entries' } });
    const entries = chart.mock.calls.map(([props]) => (props as ChartProps).data);
    expect(entries[0].labels).toHaveLength(2);
    expect(entries[1].datasets[0].data[0]).toBe(0);
    expect(entries[1].datasets[0].data[1]).toBeCloseTo(125 / 3);
    expect(entries[3].datasets[0].data[0]).toBe(125);
    expect(entries[3].datasets[0].data[1]).toBeCloseTo(250 / 3);
    chart.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Buy/sell days only' }));
    expect(chart).toHaveBeenCalledTimes(5);
  });
});
