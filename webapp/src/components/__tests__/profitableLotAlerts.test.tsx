import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfitableLotAlerts } from '../ProfitableLotAlerts';
import { computeLotAdvice, profitableLotTotals } from '../../lib/calc/partialTradeStrategy';
import { computeFIFOPositions } from '../../lib/calc/fifoPositions';
import type { Transaction } from '../../types/workbook';

const transactions: Transaction[] = [
  { date: '2026-01-01', ticker: 'QFLS', action: 'BUY', shares: 68, price: 10 },
  { date: '2026-01-02', ticker: 'QFLS', action: 'BUY', shares: 320, price: 15 },
];
const calcFee = (amount: number) => amount * 0.01;

it('totals only profitable shares, including buy and sell fees', () => {
  const { lotsByTicker } = computeFIFOPositions(transactions, calcFee);
  const totals = profitableLotTotals(computeLotAdvice(lotsByTicker.QFLS, calcFee, 12.1, 1, 0.01), 12.1);
  expect(totals.grossProceeds).toBeCloseTo(68 * 12.1);
  expect(totals.netProceeds).toBeCloseTo(68 * 12.1 * 0.99);
  expect(totals.profit).toBeCloseTo(68 * 12.1 * 0.99 - 68 * 10 * 1.01);
});

describe.each(['psx', 'qse'] as const)('%s profitable alerts', exchange => {
  it('updates amounts and removes stale alerts on each price change', () => {
    const props = { transactions, calcFee, feePct: 1, tick: 0.01, currency: exchange === 'qse' ? 'QAR' : 'PKR', exchange };
    const { rerender } = render(<ProfitableLotAlerts {...props} marketPrices={{ QFLS: 12.1 }} />);
    expect(screen.getByText(/68 of 388 shares profitable/)).toBeTruthy();
    expect(screen.getByText(/Estimated profit/).textContent).toContain('127.77');
    expect(screen.getByText(/Net proceeds/).textContent).toContain('814.57');
    rerender(<ProfitableLotAlerts {...props} marketPrices={{ QFLS: 16 }} />);
    expect(screen.getByText(/388 of 388 shares profitable/)).toBeTruthy();
    rerender(<ProfitableLotAlerts {...props} marketPrices={{ QFLS: 9 }} />);
    expect(screen.queryByText(/shares profitable/)).toBeNull();
    expect(screen.getByText('No open lots are profitable at current prices.')).toBeTruthy();
  });
});
