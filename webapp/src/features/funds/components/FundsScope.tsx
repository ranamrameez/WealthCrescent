import { DateValue } from '../../../components/DateValue';
import { Line } from 'react-chartjs-2';
import { BalanceSummaryCards, type BalanceSummary } from '../../../components/BalanceSummaryCards';
import { InvestmentPlans } from '../../../components/InvestmentPlans';
import type { TransactionPageFilters } from '../../../hooks/useUrlTransactionFilters';
import { useFundsWorkbookStore } from '../../../store/fundsWorkbookStore';
import { useCategoryStore } from '../../../store/categoryStore';
import { contributionVsValueSeries, fundCategoryLabel } from '../../../lib/calc/fundsModule';
import { fmtMoney } from '../../../lib/format';
import { cssVar } from '../../../lib/cssVar';
import { useAppearanceStore } from '../../../store/appearanceStore';
import { applyChartTheme } from '../../../lib/chartSetup';
import { useNavigate } from 'react-router-dom';
import type { Transaction } from '../../../types/workbook';

function useScope(ids: string[], filters: TransactionPageFilters) {
  const workbook = useFundsWorkbookStore(state => state.workbook);
  const categories = useCategoryStore(state => state.workbook.categories);
  const funds = workbook.funds.filter(fund => ids.includes(fund.id));
  const period = (date: string) => (!filters.fromDate || date >= filters.fromDate) && (!filters.toDate || date <= filters.toDate);
  const matches = (tx: Transaction) => period(tx.date) && (filters.direction === 'all' || (filters.direction === 'in' ? tx.action === 'BUY' : tx.action === 'SELL')) && filters.source !== 'statement-import'
    && (filters.category === 'all' || fundCategoryLabel(funds.find(fund => fund.id === tx.ticker)!, categories) === filters.category);
  const transactions = workbook.transactions.filter(tx => ids.includes(tx.ticker) && matches(tx));
  const series = funds.map(fund => ({ fund, points: contributionVsValueSeries(fund.id, workbook.transactions.filter(tx => !tx.isPending), workbook.priceHistory) }));
  return { workbook, funds, transactions, series, period };
}

export function FundsScopeSummary({ ids, filters }: { ids: string[]; filters: TransactionPageFilters }) {
  const { workbook, funds, transactions, series, period } = useScope(ids, filters);
  return <div className="stack-lg">{[...new Set(funds.map(fund => fund.currencyCode))].sort().map(currency => {
    const currencyIds = new Set(funds.filter(fund => fund.currencyCode === currency).map(fund => fund.id));
    const scoped = transactions.filter(tx => currencyIds.has(tx.ticker));
    const sum: BalanceSummary = { start: 0, current: 0, inflow: 0, outflow: 0, pendingInflow: 0, pendingOutflow: 0, plannedInflow: 0, plannedOutflow: 0 };
    for (const { fund, points } of series.filter(item => currencyIds.has(item.fund.id))) {
      sum.start += points.filter(point => filters.fromDate && point.date < filters.fromDate).at(-1)?.value ?? 0;
      const latest = points.filter(point => !filters.toDate || point.date <= filters.toDate).at(-1);
      const units = workbook.transactions.filter(tx => tx.ticker === fund.id && !tx.isPending && (!filters.toDate || tx.date <= filters.toDate)).reduce((total, tx) => total + (tx.action === 'BUY' ? tx.shares : -tx.shares), 0);
      const value = !filters.toDate && workbook.marketPrices[fund.id] !== undefined ? units * workbook.marketPrices[fund.id] : latest?.value ?? 0;
      sum.current += value;
    }
    for (const tx of scoped) {
      const field = tx.isPending ? (tx.action === 'BUY' ? 'pendingInflow' : 'pendingOutflow') : (tx.action === 'BUY' ? 'inflow' : 'outflow');
      sum[field] += tx.shares * tx.price * (tx.action === 'BUY' ? 1 : -1);
    }
    for (const leg of workbook.tradePlans.flatMap(plan => plan.legs).filter(leg => currencyIds.has(leg.ticker) && !leg.executed && (!leg.date || period(leg.date)) && filters.source !== 'statement-import' && (filters.direction === 'all' || (filters.direction === 'in' ? leg.action === 'BUY' : leg.action === 'SELL')))) sum[leg.action === 'BUY' ? 'plannedInflow' : 'plannedOutflow'] += leg.shares * leg.price * (leg.action === 'BUY' ? 1 : -1);
    return <div key={currency}><h3>{currency}</h3><BalanceSummaryCards kind="investments" currency={currency} summary={sum} /></div>;
  })}</div>;
}

export function FundsScopePlans({ ids, filters }: { ids: string[]; filters: TransactionPageFilters }) {
  const funds = useFundsWorkbookStore(state => state.workbook.funds);
  return <InvestmentPlans market="funds" items={funds.filter(fund => ids.includes(fund.id)).map(fund => ({ id: fund.id, name: fund.name, currency: fund.currencyCode }))} filters={filters} />;
}

export function FundsScopeTransactions({ ids, filters, onSelect }: { ids: string[]; filters: TransactionPageFilters; onSelect?: (id: string) => void }) {
  const { funds, transactions } = useScope(ids, filters);
  const navigate = useNavigate();
  return <div className="table-scroll"><table><thead><tr><th>Date</th><th>Fund</th><th>Action</th><th>Units</th><th>Amount</th><th>Status</th></tr></thead><tbody>{[...transactions].sort((a, b) => b.date.localeCompare(a.date) || (b.seq ?? 0) - (a.seq ?? 0)).map(tx => {
    const fund = funds.find(item => item.id === tx.ticker)!;
    return <tr key={tx.id} className="clickable" onClick={() => onSelect ? onSelect(fund.id) : navigate(`/funds?fund=${encodeURIComponent(fund.id)}`)}><td><DateValue value={tx.date} /></td><td>{fund.name}</td><td>{tx.action}</td><td>{tx.shares}</td><td>{fmtMoney(tx.shares * tx.price, fund.currencyCode)}</td><td>{tx.isPending ? 'Pending' : 'Cleared'}</td></tr>;
  })}</tbody></table>{!transactions.length && <p className="text-muted">No transactions in this view.</p>}</div>;
}

export function FundsScopeAnalytics({ ids, filters }: { ids: string[]; filters: TransactionPageFilters }) {
  const { funds, series, period } = useScope(ids, filters);
  useAppearanceStore(state => state.appearance); applyChartTheme();
  return <div className="stack-lg">{[...new Set(funds.map(fund => fund.currencyCode))].sort().map(currency => {
    const scoped = series.filter(item => item.fund.currencyCode === currency);
    const dates = [...new Set(scoped.flatMap(item => item.points.map(point => point.date)))].sort().filter(period);
    const total = (date: string, field: 'value' | 'invested') => scoped.reduce((sum, item) => sum + (item.points.filter(point => point.date <= date).at(-1)?.[field] ?? 0), 0);
    return <div key={currency}><h3>{currency} growth</h3>{dates.length ? <div style={{ height: 280 }}><Line data={{ labels: dates, datasets: [{ label: 'Value', data: dates.map(date => total(date, 'value')), borderColor: cssVar('--profit') }, { label: 'Invested', data: dates.map(date => total(date, 'invested')), borderColor: cssVar('--warn') }] }} options={{ maintainAspectRatio: false }} /></div> : <p className="text-muted">No history in this period.</p>}</div>;
  })}</div>;
}

