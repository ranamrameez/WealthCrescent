import { TickerLogo } from '../../../components/TickerLogo';
import { StarIcon } from '../../../components/icons';
import { fmtQSEPrice } from '../../../lib/format';
export function MarketTickerCards({tickers,names,prices,selected,favourites,onSelect,onFavourite,favouritesReady=true}:{tickers:string[];names:Record<string,string>;prices:Record<string,number>;selected:string;favourites:Set<string>;onSelect:(ticker:string)=>void;onFavourite:(ticker:string)=>void;favouritesReady?:boolean}) {
  if(!tickers.length)return <p className="text-muted">No tickers match these filters.</p>;
  return <div className="market-ticker-grid">{tickers.map(ticker=><article key={ticker} className={'market-ticker-card'+(ticker===selected?' is-selected':'')}>
    <button type="button" className="market-ticker-select" aria-label={'View '+ticker+' prices'} aria-pressed={ticker===selected} onClick={()=>onSelect(ticker)}>
      <TickerLogo ticker={ticker} exchange="qse" size="sm" loadingFallback/>
      <span className="market-ticker-name"><strong>{ticker}</strong><small title={names[ticker] || ticker}>{names[ticker] || 'QSE ticker'}</small></span>
      <span className="market-ticker-price"><small>Last price</small><strong>{Number.isFinite(prices[ticker])&&prices[ticker]>0?fmtQSEPrice(prices[ticker]):'-'}</strong></span>
    </button>
    <button type="button" className={'market-favourite-badge'+(favourites.has(ticker)?' is-favourite':'')} aria-label={(favourites.has(ticker)?'Unfavourite ':'Favourite ')+ticker} aria-pressed={favourites.has(ticker)} title={(favourites.has(ticker)?'Remove from favourites':'Add to favourites')} disabled={!favouritesReady} onClick={()=>onFavourite(ticker)}><StarIcon size={15} filled={favourites.has(ticker)}/></button>
  </article>)}</div>;
}
