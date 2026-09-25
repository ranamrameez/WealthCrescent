import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { currentMonthRange, type PeriodPreset } from '../lib/dateRange';

export type TransactionDirectionFilter = 'all' | 'in' | 'out';
export type TransactionSourceFilter = 'all' | 'manual' | 'statement-import';
export type TransactionPeriod = PeriodPreset | 'since-month';
export interface TransactionPageFilters {
  period: TransactionPeriod;
  fromDate: string;
  toDate: string;
  direction: TransactionDirectionFilter;
  category: string;
  source: TransactionSourceFilter;
}

export function useUrlTransactionFilters() {
  const [params, setParams] = useSearchParams();
  const defaults = useMemo(() => currentMonthRange(), []);
  const filters: TransactionPageFilters = {
    period: (params.get('period') as TransactionPeriod | null) ?? 'since-month',
    fromDate: params.get('from') ?? defaults.startDate,
    toDate: params.get('to') ?? '',
    direction: (params.get('direction') as TransactionDirectionFilter | null) ?? 'all',
    category: params.get('category') || 'all',
    source: (params.get('source') as TransactionSourceFilter | null) ?? 'all',
  };
  useEffect(() => {
    if (params.has('from') && params.has('to') && params.has('period')) return;
    const next = new URLSearchParams(params);
    if (!next.has('from')) next.set('from', defaults.startDate);
    if (!next.has('to')) next.set('to', '');
    if (!next.has('period')) next.set('period', 'since-month');
    setParams(next, { replace: true });
  }, [params, setParams, defaults.startDate]);
  const setFilters = (patch: Partial<TransactionPageFilters>) => {
    const value = { ...filters, ...patch }, next = new URLSearchParams(params);
    next.set('period', value.period);
    next.set('from', value.fromDate);
    next.set('to', value.toDate);
    value.direction === 'all' ? next.delete('direction') : next.set('direction', value.direction);
    value.category === 'all' ? next.delete('category') : next.set('category', value.category);
    value.source === 'all' ? next.delete('source') : next.set('source', value.source);
    setParams(next);
  };
  const resetFilters = () => setFilters({ period: 'since-month', fromDate: currentMonthRange().startDate, toDate: '', direction: 'all', category: 'all', source: 'all' });
  const activeCount = (filters.period !== 'since-month' ? 1 : 0) + (filters.direction !== 'all' ? 1 : 0) + (filters.category !== 'all' ? 1 : 0) + (filters.source !== 'all' ? 1 : 0);
  return { filters, setFilters, resetFilters, activeCount };
}
