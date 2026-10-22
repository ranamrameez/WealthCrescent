import { afterEach, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useQSEDerived } from '../useQSEDerived';
import { useQseFeed } from '../useLiveQseWorkbook';
import { useWorkbookStore } from '../../../../store/workbookStore';
import { createEmptyWorkbook } from '../../../../store/defaultWorkbook';
afterEach(() => { cleanup(); useQseFeed.setState({ points: {}, error: '' }); });
it('shares the same portfolio calculation across live-price subscribers', () => {
  const workbook = createEmptyWorkbook();
  workbook.transactions = [{ id: 'buy', ticker: 'QNBK', date: '2026-10-01', shares: 10, price: 15, action: 'BUY' }];
  useWorkbookStore.setState({ workbook });
  const first = renderHook(() => useQSEDerived()), second = renderHook(() => useQSEDerived());
  expect(first.result.current).toBe(second.result.current);
  act(() => useQseFeed.setState({ points: { QNBK: [{ date: '2026-10-22', time: '2026-10-22T06:00:00Z', price: 16 }] } }));
  expect(first.result.current).toBe(second.result.current);
  expect(first.result.current.rows[0].marketPrice).toBe(16);
  expect(workbook.marketPrices.QNBK).toBeUndefined();
});
