import { describe, expect, it } from 'vitest';
import { createEmptyPSXWorkbook } from '../../../store/defaultPsxWorkbook';
import { applyLivePsx, parsePsxScreener } from '../livePsx';

describe('PSX live prices', () => {
  it('parses the one-call screener snapshot and rejects invalid rows', () => {
    const points = parsePsxScreener({
      data: [
        { symbol: ' ogdc ', price: 327.8 },
        { symbol: 'PPL', price: '214.50' },
        { symbol: 'BAD', price: 0 },
        { symbol: '', price: 10 },
      ],
      meta: { timestamp: '2026-10-22T06:30:00Z' },
    });
    expect(Object.keys(points)).toEqual(['OGDC', 'PPL']);
    expect(points.OGDC[0]).toMatchObject({ price: 327.8, time: '2026-10-22T06:30:00Z', date: '2026-10-22' });
  });

  it('overlays newer live prices without mutating storage and preserves newer manual prices', () => {
    const workbook = createEmptyPSXWorkbook();
    workbook.marketPrices.OGDC = 330;
    workbook.priceHistory.OGDC = [{ date: '2026-10-22', time: '2026-10-22T07:00:00Z', price: 330 }];
    const live = { OGDC: [{ date: '2026-10-22', time: '2026-10-22T06:30:00Z', price: 327.8 }], PPL: [{ date: '2026-10-22', time: '2026-10-22T06:30:00Z', price: 214.5 }] };
    const view = applyLivePsx(workbook, live);
    expect(view.marketPrices.OGDC).toBe(330);
    expect(view.marketPrices.PPL).toBe(214.5);
    expect(view.priceHistory.OGDC).toHaveLength(2);
    expect(workbook.priceHistory.OGDC).toHaveLength(1);
    expect(workbook.marketPrices.PPL).toBeUndefined();
  });
});
