import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlanExecutionSummary } from '../PlanExecutionSummary';
import { analyzeTradePlanByTicker } from '../../lib/calc/tradePlanAnalysis';
import { fmtMoney, fmtPSXPrice, fmtQSEPrice } from '../../lib/format';
import type { TradePlanLeg } from '../../types/workbook';

const leg = (overrides: Partial<TradePlanLeg>): TradePlanLeg => ({
  date: '2026-10-07', ticker: 'QGTS', action: 'BUY', shares: 100, price: 10, ...overrides,
});
const analyze = (legs: TradePlanLeg[], shares = 100, invested = 1000) =>
  analyzeTradePlanByTicker(legs, [{ ticker: 'QGTS', shares, invested }], () => 0, 0, 0.01);
const metric = (label: string) => screen.getByText(label).parentElement!.querySelector('strong')!;

describe.each(['psx', 'qse'] as const)('%s execution summary', exchange => {
  const currency = exchange === 'psx' ? 'PKR' : 'QAR';
  const price = exchange === 'psx' ? fmtPSXPrice : fmtQSEPrice;

  it('keeps planned and executed trades separate in the combined strategic card', () => {
    const analysis = analyze([
      leg({ executed: true }),
      leg({ action: 'SELL', shares: 20, price: 18 }),
    ]);
    const { container } = render(<PlanExecutionSummary analysis={analysis} exchange={exchange} currency={currency} compact />);
    const columns = container.querySelector('.plan-execution-columns')!;
    expect(columns.children[0]).toHaveTextContent('Still planned');
    expect(columns.children[0]).toHaveTextContent('Sell 20');
    expect(columns.children[0]).toHaveTextContent(fmtMoney(160, currency));
    expect(columns.children[1]).toHaveTextContent('Already executed');
    expect(columns.children[1]).toHaveTextContent('Buy 100');
    expect(container.querySelector('.card')).toBeNull();
    expect(screen.queryByText('Avg cost')).toBeNull();
  });

  it('shows executed and pending quantities separately without counting completed buys twice', () => {
    const legs = [leg({ executed: true }), leg({ shares: 50, price: 20 }), leg({ action: 'SELL', shares: 20, price: 18 })];
    const analysis = analyze(legs);
    const snapshot = JSON.stringify({ legs, analysis });
    render(<PlanExecutionSummary analysis={analysis} exchange={exchange} currency={currency} />);
    expect(screen.getAllByText(/Plan execution summary/)).toHaveLength(1);
    expect(metric('Already executed')).toHaveTextContent('Buy 100');
    expect(metric('Still planned')).toHaveTextContent('Buy 50');
    expect(metric('Still planned')).toHaveTextContent('Sell 20');
    expect(metric('Shares after plan')).toHaveTextContent('130');
    expect(metric('Avg cost')).toHaveTextContent(price(2000 / 150));
    expect(metric('Break-even')).toHaveTextContent(price(analysis[0].breakEven));
    expect(metric('Planned P/L (from pending sells)')).toHaveTextContent(fmtMoney(20 * (18 - 2000 / 150), currency));
    expect(JSON.stringify({ legs, analysis })).toBe(snapshot);
  });

  it('updates after execution while keeping the projected holding unchanged', () => {
    const pending = leg({ shares: 50, price: 20 });
    const { rerender } = render(<PlanExecutionSummary analysis={analyze([pending])} exchange={exchange} currency={currency} />);
    expect(metric('Still planned')).toHaveTextContent('Buy 50');
    expect(metric('Shares after plan')).toHaveTextContent('150');
    rerender(<PlanExecutionSummary analysis={analyze([{ ...pending, executed: true }], 150, 2000)} exchange={exchange} currency={currency} />);
    expect(metric('Already executed')).toHaveTextContent('Buy 50');
    expect(metric('Still planned').textContent).toBe('0');
    expect(metric('Shares after plan')).toHaveTextContent('150');
    expect(metric('Avg cost')).toHaveTextContent(price(2000 / 150));
    expect(metric('Planned P/L (from pending sells)').textContent).toBe(fmtMoney(0, currency));
  });

  it('preserves visibility of every ticker in legacy multi-stock plans', () => {
    const analysis = analyze([leg({}), leg({ ticker: 'MEZN' })]);
    render(<PlanExecutionSummary analysis={analysis} exchange={exchange} currency={currency} />);
    expect(screen.getAllByText(/Plan execution summary/)).toHaveLength(2);
    expect(screen.getByText(/QGTS .* Plan execution summary/)).toBeInTheDocument();
    expect(screen.getByText(/MEZN .* Plan execution summary/)).toBeInTheDocument();
  });
});
