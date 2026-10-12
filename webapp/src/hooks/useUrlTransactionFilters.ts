import { useCallback, useEffect, useMemo } from 'react';
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
  accountId: string;
}

export function useUrlTransactionFilters(defaultPeriod: TransactionPeriod = 'since-month') {
  const [params, setParams] = useSearchParams();
  const defaults = useMemo(() => currentMonthRange(), []);
  const period = (params.get('period') as TransactionPeriod | null) ?? defaultPeriod;
  const fromDate = params.get('from') ?? (defaultPeriod === 'all' ? '' : defaults.startDate);
  const toDate = params.get('to') ?? '';
  const direction = (params.get('direction') as TransactionDirectionFilter | null) ?? 'all';
  const category = params.get('category') || 'all';
  const source = (params.get('source') as TransactionSourceFilter | null) ?? 'all';
  const accountId = params.get('account') || 'all';
  const filters = useMemo<TransactionPageFilters>(() => ({
    period,
    fromDate,
    toDate,
    direction,
    category,
    source,
    accountId,
  }), [period, fromDate, toDate, direction, category, source, accountId]);
  useEffect(() => {
    if (params.has('from') && params.has('to') && params.has('period')) return;
    const next = new URLSearchParams(params);
    if (!next.has('from')) next.set('from', defaultPeriod === 'all' ? '' : defaults.startDate);
    if (!next.has('to')) next.set('to', '');
    if (!next.has('period')) next.set('period', defaultPeriod);
    setParams(next, { replace: true });
  }, [params, setParams, defaults.startDate, defaultPeriod]);
  const setFilters = useCallback((patch: Partial<TransactionPageFilters>) => {
    const value = { ...filters, ...patch }, next = new URLSearchParams(params);
    next.set('period', value.period);
    next.set('from', value.fromDate);
    next.set('to', value.toDate);
    value.direction === 'all' ? next.delete('direction') : next.set('direction', value.direction);
    value.category === 'all' ? next.delete('category') : next.set('category', value.category);
    value.source === 'all' ? next.delete('source') : next.set('source', value.source);
    value.accountId === 'all' ? next.delete('account') : next.set('account', value.accountId);
    setParams(next);
  }, [filters, params, setParams]);
  const resetFilters = useCallback(() => {
    const fromDate = defaultPeriod === 'all' ? '' : currentMonthRange().startDate;
    setFilters({ period: defaultPeriod, fromDate, toDate: '', direction: 'all', category: 'all', source: 'all', accountId: 'all' });
  }, [setFilters, defaultPeriod]);
  const activeCount = (filters.period !== defaultPeriod ? 1 : 0) + (filters.direction !== 'all' ? 1 : 0) + (filters.category !== 'all' ? 1 : 0) + (filters.source !== 'all' ? 1 : 0) + (filters.accountId !== 'all' ? 1 : 0);
  return { filters, setFilters, resetFilters, activeCount };
}
