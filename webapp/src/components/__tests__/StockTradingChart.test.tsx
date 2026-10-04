import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../types/workbook';
const { chart } = vi.hoisted(() => ({ chart: vi.fn((_props: unknown) => null) }));
vi.mock('react-chartjs-2', () => ({ Bar: chart, Line: chart, Doughnut: chart }));
import { StockTradingChart } from '../StockTradingChart';
import { STOCK_BUY_COLOR, STOCK_SELL_COLOR } from '../../lib/stockChartTheme';

type ChartProps = { data: { labels: string[]; datasets: { data: unknown[]; backgroundColor?: string; borderColor?: string }[] } };
const trades: Transaction[] = [
  { date: '2026-02-02', ticker: 'A', action: 'SELL', shares: 5, price: 30 },
  { date: '2026-02-01', ticker: 'A', action: 'BUY', shares: 10, price: 10 },
  { date: '2026-02-01', ticker: 'A', action: 'BUY', shares: 30, price: 20 },
  { date: '2026-02-01', ticker: 'A', action: 'BUY', shares: 100, price: 90, isPending: true },
  { date: '2026-02-01', ticker: 'B', action: 'BUY', shares: 100, price: 90 },
];
beforeEach(() => chart.mockClear());
afterEach(cleanup);
describe('StockTradingChart', () => {
  it('separates volume, weighted prices, daily values and running totals, excluding pending trades', () => {
    render(<StockTradingChart transactions={trades} ticker="A" currency="QAR" />);
    const charts = chart.mock.calls.map(([props]) => (props as ChartProps).data);
    expect(charts).toHaveLength(6);
    expect(charts.map(data => data.labels)).toEqual(Array(6).fill(['2026-02-01', '2026-02-02']));
    expect(charts.map(data => data.datasets.map(d => d.data)).slice(0, 4)).toEqual([
      [[40, 0], [0, 5]], [[17.5, null], [null, 30]], [[700, 0], [0, 150]], [[700, 700], [0, 150]],
    ]);
    expect(charts[1].datasets.map(d => d.borderColor)).toEqual([STOCK_BUY_COLOR, STOCK_SELL_COLOR]);
    expect(screen.getByText(/3 completed trades/)).toBeTruthy();
  });
  it('does not blend execution prices across stocks', () => {
    render(<StockTradingChart transactions={trades} currency="QAR" />);
    expect(chart).toHaveBeenCalledTimes(4);
    expect(screen.getByText('Select one stock to compare its buy and sell prices.')).toBeTruthy();
    chart.mockClear();
    fireEvent.change(screen.getByLabelText('Stock for charts'), { target: { value: 'A' } });
    expect(chart).toHaveBeenCalledTimes(6);
    const priceChart = chart.mock.calls[1][0] as ChartProps;
    expect(priceChart.data.datasets[0].data).toEqual([17.5, null]);
  });
  it('shows individual trades without losing lifetime totals in a date window', () => {
    render(<StockTradingChart transactions={trades} ticker="A" currency="QAR" filter={{ tickers: [], fromMonth: '2026-02', toMonth: '2026-02' }} />);
    chart.mockClear();
    fireEvent.change(screen.getByLabelText('Trading detail'), { target: { value: 'entries' } });
    const charts = chart.mock.calls.map(([props]) => (props as ChartProps).data);
    expect(charts[0].labels).toHaveLength(3);
    expect(charts[0].datasets[0].data).toEqual([10, 30, 0]);
    expect(charts[3].datasets[0].data).toEqual([100, 700, 700]);
    expect(charts[4].datasets[2].data).toEqual([10, 40, 35]);
  });
  it('explains why no charts are shown when every trade is pending', () => {
    render(<StockTradingChart transactions={trades.filter(tx => tx.isPending)} currency="QAR" />);
    expect(chart).not.toHaveBeenCalled();
    expect(screen.getByText('No completed trades match this period.')).toBeTruthy();
  });
});
