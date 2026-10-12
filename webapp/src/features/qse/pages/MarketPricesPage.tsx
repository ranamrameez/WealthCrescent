import { BackButton } from '../../../components/BackButton';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../../components/PageHeading';
import { StandardCard } from '../../../components/StandardCard';
import { useWorkbookStore } from '../../../store/workbookStore';
import { useQSEStockData } from '../hooks/useQSEStockData';
import { MarketPriceHistory } from '../components/MarketPriceHistory';
export function MarketPricesPage() {
  const [params,setParams] = useSearchParams();
  const { tickerNames } = useQSEStockData();
  const workbook = useWorkbookStore(s=>s.workbook);
  const requested = (params.get('ticker') || '').toUpperCase();
  const tickers = [...new Set([...Object.keys(tickerNames),...Object.keys(workbook.priceHistory),...workbook.transactions.map(t=>t.ticker),...workbook.watchlist.map(t=>t.ticker),...(/^[A-Z][A-Z0-9]{1,5}$/.test(requested) ? [requested] : [])])].sort();
  const ticker = tickers.includes(requested) ? requested : tickers[0] || '';
  return <div>
    <PageHeading back={<BackButton to="/qse">Back to QSE</BackButton>}><h1 className="pagetitle">Market prices</h1></PageHeading>
    <StandardCard title="QSE market data">
      <div className="d-flex gap-2 flex-wrap align-items-center"><label>Ticker<select value={ticker} onChange={event=>setParams({ticker:event.target.value})}>{tickers.map(symbol=><option key={symbol} value={symbol}>{symbol}{tickerNames[symbol] ? ' - '+tickerNames[symbol] : ''}</option>)}</select></label>
        {ticker && <Link to={'/stock/'+ticker}>Stock details</Link>}
      </div>
      <p>Compare shared scraped prices with your manual entries. Choose dates and sources below.</p>
    </StandardCard>
    {ticker ? <StandardCard title={ticker+' price history'}><MarketPriceHistory key={ticker} ticker={ticker}/></StandardCard> : <p>No tickers available yet.</p>}
  </div>;
}
