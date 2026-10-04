import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const { chart } = vi.hoisted(() => ({ chart: vi.fn((_props: unknown) => null) }));
vi.mock('react-chartjs-2', () => ({ Line: chart }));
import { StockPriceCharts } from '../StockPriceCharts';
type Data = { data: { labels: string[]; datasets: { data: number[] }[] } };
beforeEach(() => chart.mockClear());
afterEach(cleanup);
it('separates the latest session from lifetime updates and supports daily closing prices', () => {
  render(<StockPriceCharts currency="QAR" formatPrice={n => String(n)} points={[
    { date: '2026-02-01', time: '09:00', price: 10 },
    { date: '2026-02-01', time: '10:00', price: 12 },
    { date: '2026-02-02', time: '09:00', price: 20 },
  ]} />);
  const calls = chart.mock.calls.map(([props]) => (props as Data).data);
  expect(calls[0].datasets[0].data).toEqual([20]);
  expect(calls[1].datasets[0].data).toEqual([10, 12, 20]);
  expect(calls[1].datasets[1].data).toEqual([10, 11, 14]);
  chart.mockClear();
  fireEvent.change(screen.getByLabelText('Daily price date'), { target: { value: '2026-02-01' } });
  expect((chart.mock.calls[0][0] as Data).data.datasets[0].data).toEqual([10, 12]);
  chart.mockClear();
  fireEvent.change(screen.getByLabelText('Lifetime price detail'), { target: { value: 'daily' } });
  expect((chart.mock.calls[1][0] as Data).data.datasets[0].data).toEqual([12, 20]);
  expect((chart.mock.calls[1][0] as Data).data.datasets[1].data).toEqual([11, 14]);
});
