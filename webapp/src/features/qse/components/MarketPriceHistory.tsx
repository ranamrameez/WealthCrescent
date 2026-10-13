import { useEffect, useState } from 'react';
import { MarketPriceChart } from '../../../components/MarketPriceChart';
import { SaveIcon } from '../../../components/icons';
import { PriceInput } from '../../../components/ui/PriceInput';
import { toast } from '../../../components/Toast';
import { getMarketPrice } from '../../../lib/calc';
import { fmtQSEPrice } from '../../../lib/format';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { filterMarketRows, lifetimeBounds, marketDateRange, MARKET_PERIOD_LABELS, MARKET_PERIODS, marketPeriodLabel, previousSessionClose } from '../../../lib/stockData/marketPageModel';
import { useWorkbookStore } from '../../../store/workbookStore';
import { useMarketPageData } from '../hooks/useMarketPageData';
import '../pages/MarketPricesPage.css';

export function MarketPriceHistory({ticker}:{ticker:string}) {
  const workbook=useWorkbookStore(state=>state.workbook);
  const setMarketPrice=useWorkbookStore(state=>state.setMarketPrice);
  const ensureSignedIn=useEnsureSignedIn();
  const current=getMarketPrice(ticker,workbook.marketPrices??{},workbook.transactions??[]);
  const [priceInput,setPriceInput]=useState(current>0?String(current):'');
  const [period,setPeriod]=useState('1d');
  const [showDates,setShowDates]=useState(false);
  const [range,setRange]=useState(()=>marketDateRange('1d'));
  useEffect(()=>setPriceInput(current>0?String(current):''),[ticker,current]);
  const data=useMarketPageData(ticker,range.from,range.to,'all');
  const invalid=!!range.from&&!!range.to&&range.from>range.to;
  const requestedRows=invalid?[]:filterMarketRows(data.rows,'all',range.from,range.to);
  const priorDate=period==='1d'&&!requestedRows.length?[...new Set(data.rows.map(row=>row.date).filter(date=>date<range.from))].sort().at(-1):undefined;
  const rows=priorDate?filterMarketRows(data.rows,'all',priorDate,priorDate):requestedRows;
  const previousClose=previousSessionClose(filterMarketRows(data.rows,'all','',''));
  const save=async()=>{const value=Number(priceInput);if(!value||value<=0)return toast('Enter a valid price.');if(!(await ensureSignedIn('Sign in to save price updates.')))return;setMarketPrice(ticker,value);setPriceInput(String(value));toast(`${ticker} price saved: ${fmtQSEPrice(value)}`);};
  return <div>
    <div className="market-price-toolbar"><div className="market-timeframes" role="group" aria-label="Chart timeframe">{MARKET_PERIODS.map(value=><button key={value} type="button" className={'chip'+(period===value?' active':'')} aria-pressed={period===value} onClick={()=>{setPeriod(value);setShowDates(false);setRange(marketDateRange(value));}}>{MARKET_PERIOD_LABELS[value]}</button>)}<button type="button" className={'chip'+(showDates?' active':'')} aria-pressed={showDates} onClick={()=>{const next=!showDates;setShowDates(next);if(next)setPeriod('custom');}}>Custom dates</button></div><label className="market-current-price">Current price<span className="market-current-price-control"><PriceInput exchange="qse" type="number" step="0.001" className="price-input" value={priceInput} onChange={event=>setPriceInput(event.target.value)} onKeyDown={event=>event.key==='Enter'&&save()} style={{width:150}}/><button className="btn secondary small" type="button" onClick={save}><SaveIcon size={12}/>Save</button></span></label></div>
    {showDates&&<div className="market-price-filters"><label>From<input type="date" value={range.from} onChange={event=>{setPeriod('custom');setRange({...range,from:event.target.value});}} /></label><label>To<input type="date" value={range.to} onChange={event=>{setPeriod('custom');setRange({...range,to:event.target.value});}} /></label></div>}
    {!data.signedIn&&<p className="text-muted">Sign in to include shared prices. Manual history remains available.</p>}
    {data.loading&&<p className="text-muted">Loading prices...</p>}
    {(invalid||data.error)&&<p role="alert">{invalid?'From date must precede To date.':data.error}</p>}
    <MarketPriceChart rows={rows} bounds={lifetimeBounds(data.manual,data.bounds,'all')} previousClose={previousClose} selectedPeriodLabel={priorDate?`Previous Session (${priorDate})`:marketPeriodLabel(period,range.from,range.to)}/>
  </div>;
}
