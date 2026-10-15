import { createContext, useContext } from 'react';
export interface QseFilters { from: string; to: string; ticker: string; status: string; search: string; action: string; group: string; transferType: string; kind: string; matchOrder: string; period: string }
export const empty: QseFilters = { from: '', to: '', ticker: '', status: '', search: '', action: '', group: '', transferType: '', kind: '', matchOrder: '', period: '' };
export const QseFilterContext = createContext(empty);
export function useQseFilters() { return useContext(QseFilterContext); }
export function matchesQseFilters(row: { date: string; ticker?: string; isPending?: boolean; note?: string; description?: string; action?: string; type?: string }, filters: QseFilters) {
  return (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to)
    && (!filters.ticker || !row.ticker || row.ticker === filters.ticker)
    && (!filters.status || (filters.status === 'pending' ? !!row.isPending : !row.isPending))
    && (!filters.action || !['BUY', 'SELL'].includes(row.action || '') || row.action === filters.action)
    && (!filters.transferType || !row.type || row.type === filters.transferType)
    && (!filters.search || [row.ticker, row.note, row.description, row.action, row.type].join(' ').toLowerCase().includes(filters.search.toLowerCase()));
}
