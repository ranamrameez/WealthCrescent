import { useEffect, useMemo, useState } from 'react';
import { endAt, onValue, orderByChild, query, ref, startAt } from 'firebase/database';
import { db } from '../../../lib/firebase/client';
import { useAuthState } from '../../../lib/firebase/useAuthState';
import { combinedQsePrices, qatarDay } from '../../../lib/stockData/qsePrices';
import { useWorkbookStore } from '../../../store/workbookStore';
import { fmtQSEPrice } from '../../../lib/format';
import { StockPriceCharts } from '../../../components/StockPriceCharts';
import type { PricePoint } from '../../../types/workbook';
type SharedPoint = PricePoint & { dayHigh?: number; dayLow?: number; priceKey?: string };
export function MarketPriceHistory({ ticker }: { ticker: string }) {
  const manual = useWorkbookStore(s => s.workbook.priceHistory[ticker]) || [];
  const currency = useWorkbookStore(s => s.workbook.settings.currency);
  const { user, authResolved } = useAuthState();
  const [from,setFrom] = useState(qatarDay), [to,setTo] = useState(qatarDay);
  const [shared,setShared] = useState<Record<string,SharedPoint>>({});
  const [bounds,setBounds] = useState<{low:number;high:number} | null>(null);
  const [error,setError] = useState('');
  const [source,setSource] = useState('all'), [page,setPage] = useState(1);
  useEffect(() => {
    setShared({}); setBounds(null); setError('');
    if (!from || !to || from > to) { setError('From date must precede To date.'); return; }
    if (!db || !authResolved || !user) return;
    const prices = query(ref(db,'QSE/tickers/'+ticker+'/allPrices'),orderByChild('time'),startAt(new Date(from+'T00:00:00+03:00').toISOString()),endAt(new Date(to+'T23:59:59.999+03:00').toISOString()));
    const stopPrices = onValue(prices,snap => {setShared(snap.val() || {});setError('');},error => setError('Shared price feed: '+error.message));
    const stopBounds = onValue(ref(db,'QSE/tickers/'+ticker+'/allTimeBounds'),snap => setBounds(snap.val()),error => setError('Shared bounds: '+error.message));
    return () => {stopPrices();stopBounds();};
  },[ticker,from,to,user?.uid,authResolved]);
  const rows = useMemo(() => combinedQsePrices(shared,manual,from,to),[shared,manual,from,to]);
  const visible = rows.filter(row => source === 'all' || row.source === source);
  const pages = Math.max(1,Math.ceil(visible.length/50)), currentPage = Math.min(page,pages);
  const manualValues = manual.map(point => point.price).filter(value => Number.isFinite(value) && value > 0);
  const lows = [...manualValues,...(bounds ? [bounds.low] : [])], highs = [...manualValues,...(bounds ? [bounds.high] : [])];
  return <div>
    <p>Shared market prices and your manual entries, shown together with their sources. Reported daily bounds include extrema that may occur between scrapes.</p>
    <div className="d-flex gap-2 flex-wrap">
      <label>From (Qatar)<input type="date" value={from} onChange={e => {setFrom(e.target.value);setPage(1);}} required /></label>
      <label>To (Qatar)<input type="date" value={to} onChange={e => {setTo(e.target.value);setPage(1);}} required /></label>
      <label>Source<select value={source} onChange={e => {setSource(e.target.value);setPage(1);}}><option value="all">All</option><option value="shared">Shared feed</option><option value="manual">My manual entries</option></select></label>
    </div>
    {!user && <p className="text-muted">Sign in to read the shared feed. Your local manual history remains visible.</p>}
    {error && <p role="alert">{error}</p>}
    <p>{rows.filter(p => p.source === 'shared').length} shared points; {rows.filter(p => p.source === 'manual').length} manual points in this range.</p>
    {lows.length > 0 && <p>Known all-time bounds (shared feed + your manual entries): {fmtQSEPrice(lows.reduce((min,value) => Math.min(min,value),Infinity))} to {fmtQSEPrice(highs.reduce((max,value) => Math.max(max,value),-Infinity))}</p>}
    <StockPriceCharts points={visible} currency={currency} formatPrice={fmtQSEPrice} />
    <div className="d-flex gap-2"><button className="btn secondary small" disabled={currentPage<=1} onClick={() => setPage(currentPage-1)}>Previous</button><span>Page {currentPage} of {pages}</span><button className="btn secondary small" disabled={currentPage>=pages} onClick={() => setPage(currentPage+1)}>Next</button></div>
    <div style={{overflowX:'auto'}}><table><thead><tr><th>Recorded (Qatar)</th><th>Price</th><th>Day high</th><th>Day low</th><th>Source</th></tr></thead><tbody>
      {visible.slice((currentPage-1)*50,currentPage*50).map(point => <tr key={point.id}><td>{point.time ? new Date(point.time).toLocaleString('en-GB',{timeZone:'Asia/Qatar'}) : point.date+' (time unknown)'}</td><td>{fmtQSEPrice(point.price)}</td><td>{point.dayHigh == null ? '-' : fmtQSEPrice(point.dayHigh)}</td><td>{point.dayLow == null ? '-' : fmtQSEPrice(point.dayLow)}</td><td>{point.source === 'manual' ? 'My manual entry' : point.priceKey === 'manualCorrection' ? 'Shared correction' : 'Scraped feed'}</td></tr>)}
    </tbody></table></div>
    {!visible.length && <p>No price points match these filters.</p>}
  </div>;
}
