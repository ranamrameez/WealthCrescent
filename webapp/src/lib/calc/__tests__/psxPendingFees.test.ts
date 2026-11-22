import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../../types/workbook';
import { createDefaultPSXBrokerSettings } from '../../../store/defaultPsxWorkbook';
import { isNettedLeg, makePSXFeeCalculator, sameDayChargedSide } from '../psxFees';

const settings = createDefaultPSXBrokerSettings('Al Habib Capital Markets');
const buy: Transaction = { date: '2026-11-13', ticker: 'TEST', action: 'BUY', shares: 100, price: 10 };
const sell: Transaction = { ...buy, action: 'SELL', price: 12 };

describe('PSX completed-trade fees with pending orders', () => {
  it('charges the higher completed side even when a pending buy would reverse it', () => {
    const pendingBuy = { ...buy, shares: 1000, isPending: true };
    const transactions = [buy, sell, pendingBuy];
    const fee = makePSXFeeCalculator(settings, transactions);

    expect(sameDayChargedSide(transactions, buy.ticker, buy.date)).toBe('SELL');
    expect(isNettedLeg(transactions, buy, settings.sameDayNettingRule)).toBe(true);
    // Buy: levies only. Sell: PKR 3 commission + 0.45 tax + 0.144 levies.
    expect(fee(1000, true, { shares: 100, tx: buy })).toBe(0.12);
    expect(fee(1200, false, { shares: 100, tx: sell })).toBe(3.59);
  });

  it('charges the full fee on a past completed buy paired only with a pending sell', () => {
    const transactions = [buy, { ...sell, isPending: true }];
    const fee = makePSXFeeCalculator(settings, transactions);

    expect(sameDayChargedSide(transactions, buy.ticker, buy.date)).toBeNull();
    // PKR 3 commission + 0.45 tax + 0.12 levies.
    expect(fee(1000, true, { shares: 100, tx: buy })).toBe(3.57);
  });
});
