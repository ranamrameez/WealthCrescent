import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUrlTransactionFilters } from './useUrlTransactionFilters';
import type { ChartFilter } from '../lib/calc/chartFilters';

/** Analytics uses the same URL period contract as ledgers; lifetime totals remain lifetime totals. */
export function useUrlChartFilters(): [ChartFilter, (next: ChartFilter) => void] {
  const [params, setParams] = useSearchParams();
  const { filters } = useUrlTransactionFilters('all');
  const selected = params.get('entities') ?? '';
  const filter = useMemo<ChartFilter>(() => ({ tickers: selected.split(',').filter(Boolean),
    fromDate: filters.fromDate || undefined, toDate: filters.toDate || undefined,
    fromMonth: filters.fromDate.slice(0, 7) || undefined, toMonth: filters.toDate.slice(0, 7) || undefined,
  }), [selected, filters.fromDate, filters.toDate]);
  const change = useCallback((next: ChartFilter) => {
    const search = new URLSearchParams(params);
    if (next.tickers.length) search.set('entities', next.tickers.join(',')); else search.delete('entities');
    const from = next.fromDate ?? '', to = next.toDate ?? '';
    if (from !== filters.fromDate || to !== filters.toDate) search.set('period', from || to ? 'custom' : 'all');
    search.set('from', from); search.set('to', to);
    setParams(search);
  }, [params, setParams, filters.fromDate, filters.toDate]);
  return [filter, change];
}
