import { useState } from 'react';
import { MarketPriceChart } from './MarketPriceChart';
import { useMarketPageData } from '../hooks/useMarketPageData';
import { filterMarketRows, lifetimeBounds, marketDateRange, MARKET_PERIODS, previousSessionClose, type MarketSource } from '../../../lib/stockData/marketPageModel';
import '../pages/MarketPricesPage.css';
export function MarketPriceHistory({ ticker }: { ticker: string }) {
  const [range, setRange] = useState(() => marketDateRange('1d'));
  const [period, setPeriod] = useState('1d');
  const [source, setSource] = useState<MarketSource>('all');
  const data = useMarketPageData(ticker, range.from, range.to, source);
  const invalid = !!range.from && !!range.to && range.from > range.to;
  const rows = invalid ? [] : filterMarketRows(data.rows, source, range.from, range.to);
  const previousClose = previousSessionClose(filterMarketRows(data.rows, source, '', ''));
  return <div>
    <div className="market-timeframes" role="group" aria-label="Chart timeframe">{MARKET_PERIODS.map(value => <button key={value} type="button" className={'chip' + (period === value ? ' active' : '')} aria-pressed={period === value} onClick={() => { setPeriod(value); setRange(marketDateRange(value)); }}>{value === '1d' ? 'Today' : value === 'all' ? 'All time' : value}</button>)}</div>
    <div className="d-flex gap-2 flex-wrap">
      <label>From (Qatar)<input type="date" value={range.from} onChange={event => {setPeriod('');setRange({...range,from:event.target.value});}} /></label>
      <label>To (Qatar)<input type="date" value={range.to} onChange={event => {setPeriod('');setRange({...range,to:event.target.value});}} /></label>
      <label>Source<select value={source} onChange={event => setSource(event.target.value as MarketSource)}><option value="all">All</option><option value="app">Shared feed</option><option value="manual">My manual entries</option></select></label>
    </div>
    {!data.signedIn && source !== 'manual' && <p className="text-muted">Sign in to include shared prices. Manual history remains available.</p>}
    {data.loading && <p className="text-muted">Loading prices...</p>}
    {(invalid || data.error) && <p role="alert">{invalid ? 'From date must precede To date.' : data.error}</p>}
    <MarketPriceChart rows={rows} bounds={lifetimeBounds(data.manual,data.bounds,source)} previousClose={previousClose} label={ticker + ' ? ' + (range.from || 'All dates') + ' to ' + (range.to || 'latest')} />
  </div>;
}
