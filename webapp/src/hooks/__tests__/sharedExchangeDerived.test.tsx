import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { usePSXDerived } from '../../features/psx/hooks/usePSXDerived';
import { useQSEDerived } from '../../features/qse/hooks/useQSEDerived';
import { usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import { useWorkbookStore } from '../../store/workbookStore';
import { strategyPositions } from '../../lib/calc/strategyPositions';
import { computeFIFOPositions } from '../../lib/calc/fifoPositions';

it.each(['psx', 'qse'] as const)('%s shares calculations across subscribers and invalidates on real edits', exchange => {
  const store = exchange === 'psx' ? usePSXWorkbookStore : useWorkbookStore;
  const originalPSX = usePSXWorkbookStore.getState().workbook;
  const originalQSE = useWorkbookStore.getState().workbook;
  const useDerived = exchange === 'psx' ? usePSXDerived : useQSEDerived;
  store.getState().addTransaction({ date: '2026-01-01', ticker: 'PERF', action: 'BUY', shares: 100, price: 10 });
  const { result, rerender, unmount } = renderHook(() => ({ first: useDerived(), second: useDerived() }));
  try {
    expect(result.current.first).toBe(result.current.second);
    const initial = result.current.first;
    rerender();
    expect(result.current.first).toBe(initial);
    const lots = strategyPositions(initial.workbook.transactions, initial.calcFee);
    expect(strategyPositions(initial.workbook.transactions, initial.calcFee)).toBe(lots);
    expect(lots).toEqual(computeFIFOPositions(initial.workbook.transactions, initial.calcFee, 'lowestCostFirst'));
    act(() => store.getState().setMarketPrice('PERF', 12));
    expect(result.current.first).toBe(result.current.second);
    expect(result.current.first.rows.find(row => row.ticker === 'PERF')?.marketPrice).toBe(12);
    act(() => store.getState().addTransaction({ date: '2026-01-02', ticker: 'PERF', action: 'BUY', shares: 50, price: 11 }));
    expect(result.current.first.rows.find(row => row.ticker === 'PERF')?.shares).toBe(150);
    expect(strategyPositions(result.current.first.workbook.transactions, result.current.first.calcFee)).not.toBe(lots);
    act(() => store.getState().addTradePlan({ id: 'perf-plan', name: 'Plan', createdAt: '2026-01-01', legs: [] }));
    expect(result.current.first.workbook.tradePlans.some(plan => plan.id === 'perf-plan')).toBe(true);
    expect(result.current.first).toBe(result.current.second);
  } finally {
    unmount();
    if (exchange === 'psx') usePSXWorkbookStore.setState({ workbook: originalPSX });
    else useWorkbookStore.setState({ workbook: originalQSE });
  }
});
