import { currentMonthRange, presetDateRange } from '../../../lib/dateRange';
import { useMemo, useState, type ReactNode } from 'react';
import { QseFilterContext, empty, type QseFilters } from './qseFilterModel';
import { useSearchParams } from 'react-router-dom';
import { PageFilterModal } from '../../../components/PageFilterModal';
import { FilterIcon } from '../../../components/icons';
import { Field } from '../../../components/ui/Field';
import { usePageTopBarRightSlot } from '../../../hooks/usePageTopBar';

export function QseFilterProvider({ children, tickers }: { children: ReactNode; tickers: string[] }) {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const filters = useMemo(() => Object.fromEntries(Object.keys(empty).map(key => [key, params.get(`qse-${key}`) || ''])) as unknown as QseFilters, [params]);
  const update = (patch: Partial<QseFilters>) => { const next = new URLSearchParams(params); for (const [key, value] of Object.entries(patch)) { if (value) next.set(`qse-${key}`, value); else next.delete(`qse-${key}`); } setParams(next); };
  const count = Object.entries(filters).filter(([key, value]) => !['from', 'to', 'period'].includes(key) && !!value).length + (filters.from || filters.to || filters.period && filters.period !== 'all' ? 1 : 0);
  const control = useMemo(() => <button className="btn secondary small topbar-filter-btn" onClick={() => setOpen(true)}><FilterIcon size={14} /> Filters{count ? ` (${count})` : ''}</button>, [count]);
  usePageTopBarRightSlot(control);
  return <QseFilterContext.Provider value={filters}>{children}{open && <PageFilterModal onClose={() => setOpen(false)} onReset={() => update(empty)}>
    <div className="filter-preset-row">{(['since-month', '3', '6', '12', 'ytd', 'all', 'custom'] as const).map(period => <button key={period} type="button" className={`chip${(filters.period || 'all') === period ? ' active' : ''}`} onClick={() => {
      if (period === 'all') update({ period: '', from: '', to: '' });
      else if (period === 'custom') update({ period });
      else { const range = period === 'since-month' ? currentMonthRange() : presetDateRange(period); update({ period, from: range.startDate, to: range.endDate }); }
    }}>{period === 'since-month' ? 'This month' : period === 'ytd' ? 'YTD' : period === 'all' ? 'All time' : period === 'custom' ? 'Custom' : `${period}M`}</button>)}</div>
    <div className="filter-fields-grid">
      <Field label="From"><input type="date" value={filters.from} onChange={e => update({ period: 'custom', from: e.target.value })} /></Field>
      <Field label="To"><input type="date" value={filters.to} onChange={e => update({ period: 'custom', to: e.target.value })} /></Field>
      <Field label="Ticker"><select value={filters.ticker} onChange={e => update({ ticker: e.target.value })}><option value="">All tickers</option>{tickers.map(ticker => <option key={ticker}>{ticker}</option>)}</select></Field>
      <Field label="Status"><select value={filters.status} onChange={e => update({ status: e.target.value })}><option value="">All</option><option value="cleared">Cleared</option><option value="pending">Pending</option></select></Field>
      <Field label="Trade action"><select value={filters.action} onChange={e => update({ action: e.target.value })}><option value="">Buy &amp; sell</option><option value="BUY">Buy</option><option value="SELL">Sell</option></select></Field>
      <Field label="Group trades"><select value={filters.group} onChange={e => update({ group: e.target.value })}><option value="">No grouping</option><option value="ticker">Ticker</option><option value="action">Buy/sell</option><option value="month">Month</option></select></Field>
      <Field label="Transfer type"><select value={filters.transferType} onChange={e => update({ transferType: e.target.value })}><option value="">All</option><option value="DEPOSIT">Deposit</option><option value="WITHDRAWAL">Withdrawal</option></select></Field>
      <Field label="Ledger type"><select value={filters.kind} onChange={e => update({ kind: e.target.value })}><option value="">All</option><option value="trade">Trade</option><option value="transfer">Transfer</option><option value="adjustment">Adjustment</option></select></Field>
      <Field label="Search"><input value={filters.search} onChange={e => update({ search: e.target.value })} /></Field>
    </div>
  </PageFilterModal>}</QseFilterContext.Provider>;
}
