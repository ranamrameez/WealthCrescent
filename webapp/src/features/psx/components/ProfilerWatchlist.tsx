import { Link } from 'react-router-dom';
import { StandardCard } from '../../../components/StandardCard';
import { fmtMoney } from '../../../lib/format';
import type { PSXWorkbook } from '../../../types/psxWorkbook';
import type { PSXRow } from '../hooks/usePSXDerived';

const tiers = ['Below PKR 35', 'PKR 35–105', 'Above PKR 105 to under PKR 300', 'PKR 300 and above', 'Price unavailable'];

function positivePrice(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

function priceTier(price: number | undefined) {
  if (price === undefined) return tiers[4];
  if (price < 35) return tiers[0];
  if (price <= 105) return tiers[1];
  return price < 300 ? tiers[2] : tiers[3];
}

export function ProfilerWatchlist({ workbook, positions }: { workbook: PSXWorkbook; positions: PSXRow[] }) {
  const held = new Set(positions.map(position => position.ticker));
  const rows = workbook.watchlist.map(item => {
    const price = positivePrice(workbook.marketPrices[item.ticker]) ?? positivePrice(item.current);
    return { ticker: item.ticker, price, tier: priceTier(price) };
  });

  return <StandardCard title="Watchlist by price tier" defaultOpen={false}>
    <p>Prices use the current market quote when available, then the price saved on the watchlist.</p>
    <Link to="/psx/watchlist">Manage PSX watchlist</Link>
    {rows.length === 0 ? <p>No tickers in this broker’s watchlist.</p> : <div className="stack-lg">
      {tiers.map(tier => {
        const entries = rows.filter(row => row.tier === tier);
        if (entries.length === 0) return null;
        return <section key={tier} aria-label={tier}>
          <h3>{tier}</h3>
          <div className="table-scroll"><table>
            <thead><tr><th scope="col">Ticker</th><th scope="col">Price</th><th scope="col">Holding</th></tr></thead>
            <tbody>{entries.map(({ ticker, price }) => <tr key={ticker}>
              <td><Link to={`/psx/stock/${encodeURIComponent(ticker)}`}>{ticker}</Link></td>
              <td>{price === undefined ? '—' : fmtMoney(price, 'PKR')}</td>
              <td>{held.has(ticker) ? 'Held' : '—'}</td>
            </tr>)}</tbody>
          </table></div>
        </section>;
      })}
    </div>}
  </StandardCard>;
}
