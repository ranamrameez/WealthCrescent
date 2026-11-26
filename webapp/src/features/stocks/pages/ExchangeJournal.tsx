import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DateRangeWidget } from '../../../components/DateRangeWidget';
import { useUrlTransactionFilters } from '../../../hooks/useUrlTransactionFilters';
import { BackButton } from '../../../components/BackButton';
import { PageHeading } from '../../../components/PageHeading';
import { StandardCard } from '../../../components/StandardCard';
import { useTablePagination } from '../../../hooks/useTablePagination';
import { toCSV } from '../../../lib/csv';
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

function downloadJournalCsv(filename: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function JournalBreakdown({ report, by, currency, exchange }: {
  report: JournalReportRow[];
  by: 'date' | 'ticker';
  exchange: JournalProps['exchange'];
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
  const groupHeading = by === 'date' ? 'Trade date' : 'Ticker';
  const exportBreakdown = () => downloadJournalCsv(
    `${exchange.toLowerCase()}-trade-journal-${by === 'date' ? 'daily' : 'ticker'}-results.csv`,
    [
      [groupHeading, 'Fills', 'Fees', 'Realized P/L', 'Currency'],
      ...breakdown.map(row => [row.label, row.count, row.fees, row.realized ?? '', currency]),
    ],
  );
  return <StandardCard title={title} actions={[{ label: `Export ${title.toLowerCase()}`, onClick: exportBreakdown }]}>
    <div className="table-scroll"><table aria-label={title}>
      <thead><tr><th scope="col">{groupHeading}</th><th scope="col">Fills</th><th scope="col">Fees</th><th scope="col">Realized P/L</th></tr></thead>
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
  const [params, setParams] = useSearchParams();
  const ticker = params.get('ticker') ?? '';
  const setTicker = (symbol: string) => {
    const next = new URLSearchParams(params);
    if (symbol) next.set('ticker', symbol);
    else next.delete('ticker');
    setParams(next);
  };
  const { filters, setFilters } = useUrlTransactionFilters('all');
  const { fromDate, toDate } = filters;
  const fills = useMemo(() => transactions.filter(tx => !tx.isPending)
    .sort((a, b) => b.date.localeCompare(a.date)), [transactions]);
  const tickers = useMemo(() => [...new Set(fills.map(tx => tx.ticker))].sort(), [fills]);
  const selected = tickers.includes(ticker) ? ticker : '';
  // Reuse realized results from the full workbook, so filtering cannot drop prior buys.
  const executed = useMemo(() => fills.map((tx, index) => ({
    key: tx.id ?? index,
    tx,
    fee: calcFee(tx.shares * tx.price, tx.action === 'BUY', { tx, shares: tx.shares }),
    realized: tx.action === 'SELL' && tx.id ? realizedBySellTxId[tx.id]?.netPL : undefined,
  })), [fills, calcFee, realizedBySellTxId]);
  const report = useMemo(() => executed.filter(({ tx }) =>
    (!selected || tx.ticker === selected)
    && (!fromDate || tx.date >= fromDate)
    && (!toDate || tx.date <= toDate),
  ), [executed, selected, fromDate, toDate]);

  const exportCsv = (scope: typeof executed, suffix: string) => downloadJournalCsv(
    `${exchange.toLowerCase()}-trade-journal-${suffix}.csv`,
    [
      ['Date', 'Ticker', 'Side', 'Shares', 'Price', 'Fee', 'Realized P/L', 'Currency'],
      ...scope.map(({ tx, fee, realized }) => [
        tx.date, tx.ticker, tx.action, tx.shares, tx.price, fee, realized ?? '', currency,
      ]),
    ],
  );
  const { rows, controls } = useTablePagination(report);

  return <div className="standard-page">
    <PageHeading back={<BackButton to={dashboard}>← {exchange}</BackButton>}>
      <h1 className="pagetitle">{exchange} Trade Journal</h1>
    </PageHeading>
    <div className="row gap-sm">
      <Link to={ledger}>Trade Transactions</Link>
      <Link to={exchange === 'PSX' ? '/psx/trade-journal/legacy' : '/trade-journal/legacy'}>Export legacy Journal data</Link>
    </div>
    <StandardCard title="Executed trades" actions={[
      { label: 'Export all executed trades', disabled: !executed.length, onClick: () => exportCsv(executed, 'all') },
      ...(selected || fromDate || toDate ? [{
        label: 'Export filtered trades',
        disabled: !report.length,
        onClick: () => exportCsv(report, selected ? selected.replace(/[^a-z0-9.-]/gi, '_') : 'filtered'),
      }] : []),
    ]}>
      <p>Uses the active {exchange} broker’s transactions, fees and cost-basis settings.</p>
      <DateRangeWidget value={filters} onChange={setFilters} />
      <label>Ticker <select value={selected} onChange={event => setTicker(event.target.value)}>
        <option value="">All tickers</option>
        {tickers.map(symbol => <option key={symbol}>{symbol}</option>)}
      </select></label>
      {report.length === 0 ? <p>{executed.length ? 'No executed trades match these filters.' : 'No executed trades in this broker profile.'}</p> : <>
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
      <JournalBreakdown report={report} by="date" currency={currency} exchange={exchange} />
      <JournalBreakdown report={report} by="ticker" currency={currency} exchange={exchange} />
    </>}
  </div>;
}
