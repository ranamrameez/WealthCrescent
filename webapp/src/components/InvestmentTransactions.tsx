import { DateValue } from './DateValue';
import { Link } from 'react-router-dom';
import type { Transaction } from '../types/workbook';
import type { TransactionPageFilters } from '../hooks/useUrlTransactionFilters';
import { fmtMoney } from '../lib/format';

export function InvestmentTransactions({ transactions, currency, market, filters }: { transactions: Transaction[]; currency: string; market: 'qse' | 'psx'; filters?: TransactionPageFilters }) {
  const rows = [...transactions].filter(row => (!filters?.fromDate || row.date >= filters.fromDate) && (!filters?.toDate || row.date <= filters.toDate) && (!filters || filters.direction === 'all' || (filters.direction === 'in' ? row.action === 'BUY' : row.action === 'SELL')) && (!filters || filters.source !== 'statement-import'))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.seq ?? 0) - (a.seq ?? 0));
  return <div className="table-scroll"><table><thead><tr><th>Date</th><th>Stock</th><th>Action</th><th>Shares</th><th>Amount</th><th>Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><DateValue value={row.date} /></td><td><Link to={`${market === 'psx' ? '/psx' : ''}/stock/${encodeURIComponent(row.ticker)}`}>{row.ticker}</Link></td><td>{row.action}</td><td>{row.shares}</td><td>{fmtMoney(row.shares * row.price, currency)}</td><td>{row.isPending ? 'Pending' : 'Cleared'}</td></tr>)}</tbody></table>{!rows.length && <p className="text-muted">No trades in this view.</p>}</div>;
}
