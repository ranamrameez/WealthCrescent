import { useEffect, useState } from 'react';
import { MarketPriceChart } from '../../../components/MarketPriceChart';
import { SaveIcon } from '../../../components/icons';
import { PriceInput } from '../../../components/ui/PriceInput';
import { getMarketPrice } from '../../../lib/calc';
import { fmtQSEPrice } from '../../../lib/format';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { filterMarketRows,lifetimeBounds,marketDateRange,MARKET_PERIODS,previousSessionClose,type MarketSource } from '../../../lib/stockData/marketPageModel';
import { useWorkbookStore } from '../../../store/workbookStore';
import { toast } from '../../../components/Toast';
import { useMarketPageData } from '../hooks/useMarketPageData';
import '../pages/MarketPricesPage.css';

export function MarketPriceHistory({ticker}:{ticker:string}){
 const workbook=useWorkbookStore(state=>state.workbook),setMarketPrice=useWorkbookStore(state=>state.setMarketPrice),ensureSignedIn=useEnsureSignedIn();
 const current=getMarketPrice(ticker,workbook.marketPrices??{},workbook.transactions??[]);
 const [priceInput,setPriceInput]=useState(current>0?String(current):'');
 const [range,setRange]=useState(()=>marketDateRange('1d')),[period,setPeriod]=useState('1d'),[source,setSource]=useState<MarketSource>('all');
 useEffect(()=>setPriceInput(current>0?String(current):''),[ticker,current]);
 const data=useMarketPageData(ticker,range.from,range.to,source),invalid=!!range.from&&!!range.to&&range.from>range.to;
 const rows=invalid?[]:filterMarketRows(data.rows,source,range.from,range.to),previousClose=previousSessionClose(filterMarketRows(data.rows,source,'',''));
 const save=async()=>{const value=Number(priceInput);if(!value||value<=0)return toast('Enter a valid price.');if(!(await ensureSignedIn('Sign in to save price updates.')))return;setMarketPrice(ticker,value);setPriceInput(String(value));toast(`${ticker} price saved: ${fmtQSEPrice(value)}`);};
 return <div><div className="market-timeframes" role="group" aria-label="Chart timeframe">{MARKET_PERIODS.map(value=><button key={value} type="button" className={'chip'+(period===value?' active':'')} aria-pressed={period===value} onClick={()=>{setPeriod(value);setRange(marketDateRange(value));}}>{value==='1d'?'Today':value==='all'?'All time':value}</button>)}</div><div className="d-flex gap-2 flex-wrap"><label>From (Qatar)<input type="date" value={range.from} onChange={event=>{setPeriod('');setRange({...range,from:event.target.value});}} /></label><label>To (Qatar)<input type="date" value={range.to} onChange={event=>{setPeriod('');setRange({...range,to:event.target.value});}} /></label><label>Source<select value={source} onChange={event=>setSource(event.target.value as MarketSource)}><option value="all">All</option><option value="app">Shared feed</option><option value="manual">My manual entries</option></select></label><label className="market-current-price">Current Price<span className="market-current-price-control"><PriceInput exchange="qse" type="number" step="0.001" className="price-input" value={priceInput} onChange={event=>setPriceInput(event.target.value)} onKeyDown={event=>event.key==='Enter'&&save()} style={{width:150}}/><button className="btn secondary small" type="button" onClick={save}><SaveIcon size={12}/>Save</button></span></label></div>{!data.signedIn&&source!=='manual'&&<p className="text-muted">Sign in to include shared prices. Manual history remains available.</p>}{data.loading&&<p className="text-muted">Loading prices...</p>}{(invalid||data.error)&&<p role="alert">{invalid?'From date must precede To date.':data.error}</p>}<MarketPriceChart rows={rows} bounds={lifetimeBounds(data.manual,data.bounds,source)} previousClose={previousClose} label={ticker+' — '+(range.from||'All dates')+' to '+(range.to||'latest')}/></div>;
}
