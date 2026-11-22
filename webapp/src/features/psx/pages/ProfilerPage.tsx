import { Link } from 'react-router-dom';
import { BackButton } from '../../../components/BackButton';
import { PageHeading } from '../../../components/PageHeading';
import { StandardCard } from '../../../components/StandardCard';
import { fmt, fmtMoney } from '../../../lib/format';
import { usePSXDerived } from '../hooks/usePSXDerived';

export function ProfilerPage() {
  const { workbook, rows } = usePSXDerived();
  const currency = workbook.settings.currency;

  return <div className="standard-page">
    <PageHeading back={<BackButton to="/psx">← PSX</BackButton>}>
      <h1 className="pagetitle">PSX Profiler</h1>
    </PageHeading>
    <div className="row gap-sm">
      <Link to="/psx">PSX Dashboard</Link>
      <a href="https://ranamrameez.github.io/Translation-Helper/psx-command-deck.html" target="_blank" rel="noreferrer">Original Profiler reference</a>
    </div>
    <StandardCard title="Active broker positions">
      <p>Market prices, costs and break-even estimates come from the active PSX broker profile.</p>
      {rows.length === 0 ? <p>No open positions in this broker profile.</p>
        : <div className="table-scroll"><table>
          <thead><tr><th scope="col">Ticker</th><th scope="col">Shares</th><th scope="col">Market price</th><th scope="col">Average cost</th><th scope="col">Break-even</th><th scope="col">Unrealized P/L</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.ticker}>
            <td><Link to={`/psx/stock/${encodeURIComponent(row.ticker)}`}>{row.ticker}</Link></td>
            <td>{fmt(row.shares, 0)}</td><td>{row.marketPrice > 0 ? fmtMoney(row.marketPrice, currency) : '—'}</td>
            <td>{fmtMoney(row.avgCost, currency)}</td><td>{fmtMoney(row.breakEvenPrice, currency)}</td>
            <td>{row.marketPrice > 0 ? fmtMoney(row.profit, currency) : '—'}</td>
          </tr>)}</tbody>
        </table></div>}
    </StandardCard>
  </div>;
}
