import type { Transaction, TradePlan, PricePoint } from '../types/workbook';
import type { TransactionPageFilters } from '../hooks/useUrlTransactionFilters';
import { BalanceSummaryCards, type BalanceSummary } from './BalanceSummaryCards';

/** Holdings are valued independently of the exchange's separate cash balance. */
export function InvestmentBalanceSummary({ transactions, plans, marketPrices, priceHistory, tickers, currency, filters }: {
  transactions: Transaction[]; plans: TradePlan[]; marketPrices: Record<string, number>;
  priceHistory: Record<string, PricePoint[]>; tickers: string[]; currency: string; filters: TransactionPageFilters;
}) {
  const summary: BalanceSummary = { start: 0, current: 0, inflow: 0, outflow: 0, pendingInflow: 0, pendingOutflow: 0, plannedInflow: 0, plannedOutflow: 0 };
  const inPeriod = (date: string) => (!filters.fromDate || date >= filters.fromDate) && (!filters.toDate || date <= filters.toDate);
  const today = new Date().toISOString().slice(0, 10);
  for (const ticker of tickers) {
    const history = transactions.filter(tx => tx.ticker === ticker && !tx.isPending).sort((a, b) => a.date.localeCompare(b.date));
    const before = history.filter(tx => filters.fromDate && tx.date < filters.fromDate);
    const throughEnd = history.filter(tx => !filters.toDate || tx.date <= filters.toDate);
    const shares = (rows: Transaction[]) => rows.reduce((sum, tx) => sum + (tx.action === 'BUY' ? tx.shares : -tx.shares), 0);
    const prices = [...history.map(tx => ({ date: tx.date, price: tx.price })), ...(priceHistory[ticker] ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const startPrice = prices.filter(point => filters.fromDate && point.date < filters.fromDate).at(-1)?.price ?? before.at(-1)?.price ?? 0;
    const endPrice = (!filters.toDate || filters.toDate >= today) && marketPrices[ticker] !== undefined ? marketPrices[ticker] : prices.filter(point => !filters.toDate || point.date <= filters.toDate).at(-1)?.price ?? throughEnd.at(-1)?.price ?? 0;
    summary.start += shares(before) * startPrice;
    summary.current += shares(throughEnd) * endPrice;
  }
  if (filters.source !== 'statement-import') {
    for (const tx of transactions.filter(tx => tickers.includes(tx.ticker) && inPeriod(tx.date) && (filters.direction === 'all' || (filters.direction === 'in' ? tx.action === 'BUY' : tx.action === 'SELL')))) {
      const field = tx.isPending ? (tx.action === 'BUY' ? 'pendingInflow' : 'pendingOutflow') : (tx.action === 'BUY' ? 'inflow' : 'outflow');
      summary[field] += tx.shares * tx.price * (tx.action === 'BUY' ? 1 : -1);
    }
    for (const leg of plans.flatMap(plan => plan.legs).filter(leg => tickers.includes(leg.ticker) && !leg.executed && (!leg.date || inPeriod(leg.date)) && (filters.direction === 'all' || (filters.direction === 'in' ? leg.action === 'BUY' : leg.action === 'SELL')))) summary[leg.action === 'BUY' ? 'plannedInflow' : 'plannedOutflow'] += leg.shares * leg.price * (leg.action === 'BUY' ? 1 : -1);
  }
  return <div><p className="text-muted mt-0">Holdings value ({currency})</p><BalanceSummaryCards kind="investments" currency={currency} summary={summary} /></div>;
}
