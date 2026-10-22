import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { usePSXDerived } from '../../../features/psx/hooks/usePSXDerived';
import { usePsxFeed } from '../../../features/psx/hooks/useLivePsxWorkbook';
import { createEmptyPSXWorkbook } from '../../../store/defaultPsxWorkbook';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';

afterEach(() => { cleanup(); usePsxFeed.setState({ points: {}, error: '', loading: false, updatedAt: '' }); });

it('recalculates PSX positions from live prices without persisting the feed', () => {
  const workbook = createEmptyPSXWorkbook();
  workbook.transactions = [{ date: '2026-10-22', ticker: 'OGDC', action: 'BUY', shares: 10, price: 300 }];
  workbook.marketPrices.OGDC = 300;
  usePSXWorkbookStore.setState({ workbook });
  const { result } = renderHook(() => usePSXDerived());
  expect(result.current.rows[0].value).toBe(3000);
  act(() => usePsxFeed.setState({ points: { OGDC: [{ date: '2026-10-22', time: '2026-10-22T06:30:00Z', price: 327.8 }] } }));
  expect(result.current.rows[0].value).toBe(3278);
  expect(usePSXWorkbookStore.getState().workbook).toBe(workbook);
  expect(workbook.marketPrices.OGDC).toBe(300);
});

it('shares one overlaid workbook and derived calculation across page subscribers', () => {
  const workbook = createEmptyPSXWorkbook();
  usePSXWorkbookStore.setState({ workbook });
  usePsxFeed.setState({ points: { OGDC: [{ date: '2026-10-22', price: 300 }] } });
  const first = renderHook(() => usePSXDerived());
  const second = renderHook(() => usePSXDerived());
  expect(first.result.current).toBe(second.result.current);
});
