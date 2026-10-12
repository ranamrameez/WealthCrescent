import { useEffect, useState } from 'react';
import { MarketPriceChart } from '../../../components/MarketPriceChart';
import { SaveIcon } from '../../../components/icons';
import { PriceInput } from '../../../components/ui/PriceInput';
import { toast } from '../../../components/Toast';
import { getMarketPrice } from '../../../lib/calc';
import { fmtQSEPrice } from '../../../lib/format';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { filterMarketRows, lifetimeBounds, previousSessionClose } from '../../../lib/stockData/marketPageModel';
import { useWorkbookStore } from '../../../store/workbookStore';
import { useMarketPageData } from '../hooks/useMarketPageData';
import '../pages/MarketPricesPage.css';

export function MarketPriceHistory({ticker,fromDate='',toDate=''}:{ticker:string;fromDate?:string;toDate?:string}) {
  const workbook=useWorkbookStore(state=>state.workbook);
  const setMarketPrice=useWorkbookStore(state=>state.setMarketPrice);
  const ensureSignedIn=useEnsureSignedIn();
  const current=getMarketPrice(ticker,workbook.marketPrices??{},workbook.transactions??[]);
  const [priceInput,setPriceInput]=useState(current>0?String(current):'');
  useEffect(()=>setPriceInput(current>0?String(current):''),[ticker,current]);
  const data=useMarketPageData(ticker,fromDate,toDate,'all');
  const invalid=!!fromDate&&!!toDate&&fromDate>toDate;
  const rows=invalid?[]:filterMarketRows(data.rows,'all',fromDate,toDate);
  const previousClose=previousSessionClose(filterMarketRows(data.rows,'all','',''));
  const save=async()=>{const value=Number(priceInput);if(!value||value<=0)return toast('Enter a valid price.');if(!(await ensureSignedIn('Sign in to save price updates.')))return;setMarketPrice(ticker,value);setPriceInput(String(value));toast(`${ticker} price saved: ${fmtQSEPrice(value)}`);};
  return <div>
    <div className="market-price-actions"><span className="text-muted">Date range uses the page filter.</span><label className="market-current-price">Current price<span className="market-current-price-control"><PriceInput exchange="qse" type="number" step="0.001" className="price-input" value={priceInput} onChange={event=>setPriceInput(event.target.value)} onKeyDown={event=>event.key==='Enter'&&save()} style={{width:150}}/><button className="btn secondary small" type="button" onClick={save}><SaveIcon size={12}/>Save</button></span></label></div>
    {!data.signedIn&&<p className="text-muted">Sign in to include shared prices. Manual history remains available.</p>}
    {data.loading&&<p className="text-muted">Loading prices...</p>}
    {(invalid||data.error)&&<p role="alert">{invalid?'From date must precede To date.':data.error}</p>}
    <MarketPriceChart rows={rows} bounds={lifetimeBounds(data.manual,data.bounds,'all')} previousClose={previousClose} label={ticker+' — '+(fromDate||'All dates')+' to '+(toDate||'latest')}/>
  </div>;
}
