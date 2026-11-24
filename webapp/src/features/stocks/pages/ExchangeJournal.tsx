import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackButton } from '../../../components/BackButton';
import { PageHeading } from '../../../components/PageHeading';
import { StandardCard } from '../../../components/StandardCard';
import { useTablePagination } from '../../../hooks/useTablePagination';
import { fmt, fmtMoney } from '../../../lib/format';
import type { FeeCalculator, Transaction } from '../../../types/workbook';

interface JournalProps {
  exchange: 'QSE' | 'PSX';
  transactions: Transaction[];
  currency: string;
  calcFee: FeeCalculator;
  realizedBySellTxId: Record<string, { netPL: number }>;
}

interface JournalReportRow {
  tx: Transaction;
  fee: number;
  realized: number | undefined;
}

function JournalBreakdown({ report, by, currency }: {
  report: JournalReportRow[];
  by: 'date' | 'ticker';
  currency: string;
}) {
  const breakdown = useMemo(() => {
    const groups = new Map<string, { label: string; count: number; fees: number; realized: number | undefined }>();
    for (const { tx, fee, realized } of report) {
      const label = tx[by];
      const row = groups.get(label) ?? { label, count: 0, fees: 0, realized: undefined };
      row.count += 1;
      row.fees += fee;
      if (realized !== undefined) row.realized = (row.realized ?? 0) + realized;
      groups.set(label, row);
    }
    return [...groups.values()].sort((a, b) => by === 'date'
      ? b.label.localeCompare(a.label) : a.label.localeCompare(b.label));
  }, [report, by]);
  const { rows, controls } = useTablePagination(breakdown);
  const title = by === 'date' ? 'Daily results' : 'Ticker results';
  return <StandardCard title={title}>
    <div className="table-scroll"><table aria-label={title}>
      <thead><tr><th scope="col">{by === 'date' ? 'Trade date' : 'Ticker'}</th><th scope="col">Fills</th><th scope="col">Fees</th><th scope="col">Realized P/L</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.label}>
        <th scope="row">{row.label}</th><td>{fmt(row.count, 0)}</td>
        <td>{fmtMoney(row.fees, currency)}</td>
        <td>{row.realized === undefined ? '—' : fmtMoney(row.realized, currency)}</td>
      </tr>)}</tbody>
    </table></div>
    {controls}
  </StandardCard>;
}

export function ExchangeJournal({ exchange, transactions, currency, calcFee, realizedBySellTxId }: JournalProps) {
  const dashboard = exchange === 'PSX' ? '/psx' : '/qse';
  const ledger = exchange === 'PSX' ? '/psx/transactions' : '/transactions';
  const [ticker, setTicker] = useState('');
  const fills = useMemo(() => transactions.filter(tx => !tx.isPending)
    .sort((a, b) => b.date.localeCompare(a.date)), [transactions]);
  const tickers = useMemo(() => [...new Set(fills.map(tx => tx.ticker))].sort(), [fills]);
  const selected = tickers.includes(ticker) ? ticker : '';
  // Reuse realized results from the full workbook, so filtering cannot drop prior buys.
  const report = useMemo(() => fills.filter(tx => !selected || tx.ticker === selected).map((tx, index) => ({
    key: tx.id ?? index,
    tx,
    fee: calcFee(tx.shares * tx.price, tx.action === 'BUY', { tx, shares: tx.shares }),
    realized: tx.action === 'SELL' && tx.id ? realizedBySellTxId[tx.id]?.netPL : undefined,
  })), [fills, selected, calcFee, realizedBySellTxId]);
  const { rows, controls } = useTablePagination(report);

  return <div className="standard-page">
    <PageHeading back={<BackButton to={dashboard}>← {exchange}</BackButton>}>
      <h1 className="pagetitle">{exchange} Trade Journal</h1>
    </PageHeading>
    <div className="row gap-sm">
      <Link to={ledger}>Trade Transactions</Link>
      <Link to={exchange === 'PSX' ? '/psx/trade-journal/legacy' : '/trade-journal/legacy'}>Export legacy Journal data</Link>
    </div>
    <StandardCard title="Executed trades">
      <p>Uses the active {exchange} broker’s transactions, fees and cost-basis settings.</p>
      <label>Ticker <select value={selected} onChange={event => setTicker(event.target.value)}>
        <option value="">All tickers</option>
        {tickers.map(symbol => <option key={symbol}>{symbol}</option>)}
      </select></label>
      {report.length === 0 ? <p>No executed trades in this broker profile.</p> : <>
        <p>{fmt(report.length, 0)} fills · Fees {fmtMoney(report.reduce((sum, row) => sum + row.fee, 0), currency)}
          {' · '}Realized P/L {fmtMoney(report.reduce((sum, row) => sum + (row.realized ?? 0), 0), currency)}</p>
        <div className="table-scroll"><table aria-label="Executed trades">
          <thead><tr><th scope="col">Date</th><th scope="col">Ticker</th><th scope="col">Side</th><th scope="col">Shares</th><th scope="col">Price</th><th scope="col">Fee</th><th scope="col">Realized P/L</th></tr></thead>
          <tbody>{rows.map(({ key, tx, fee, realized }) => <tr key={key}>
            <td>{tx.date}</td><td>{tx.ticker}</td><td>{tx.action}</td><td>{fmt(tx.shares, 0)}</td>
            <td>{fmtMoney(tx.price, currency)}</td><td>{fmtMoney(fee, currency)}</td>
            <td>{realized === undefined ? '—' : fmtMoney(realized, currency)}</td>
          </tr>)}</tbody>
        </table></div>
        {controls}
      </>}
    </StandardCard>
    {report.length > 0 && <>
      <JournalBreakdown report={report} by="date" currency={currency} />
      <JournalBreakdown report={report} by="ticker" currency={currency} />
    </>}
  </div>;
}
