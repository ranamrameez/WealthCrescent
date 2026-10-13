import { useEffect,useMemo,useState } from 'react';
import { MarketPriceChart } from '../../../components/MarketPriceChart';
import { SaveIcon } from '../../../components/icons';
import { PriceInput } from '../../../components/ui/PriceInput';
import { toast } from '../../../components/Toast';
import { getMarketPrice } from '../../../lib/calc';
import { fmtPSXPrice } from '../../../lib/format';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { filterMarketRows,lifetimeBounds,marketDateRange,marketRows,MARKET_PERIOD_LABELS,MARKET_PERIODS,marketPeriodLabel,previousSessionClose } from '../../../lib/stockData/marketPageModel';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';
import '../../qse/pages/MarketPricesPage.css';

export function MarketPriceHistory({ticker}:{ticker:string}) {
  const workbook=usePSXWorkbookStore(state=>state.workbook);
  const setMarketPrice=usePSXWorkbookStore(state=>state.setMarketPrice);
  const ensureSignedIn=useEnsureSignedIn();
  const current=getMarketPrice(ticker,workbook.marketPrices,workbook.transactions);
  const [priceInput,setPriceInput]=useState(current>0?String(current):'');
  const [period,setPeriod]=useState('1d');
  const [showDates,setShowDates]=useState(false);
  const [range,setRange]=useState(()=>marketDateRange('1d'));
  useEffect(()=>setPriceInput(current>0?String(current):''),[ticker,current]);
  const allRows=useMemo(()=>{const history=workbook.priceHistory[ticker]||[];if(history.length)return marketRows(history.map((point,index)=>({id:'price-'+index,source:'manual' as const,date:point.date,time:point.time,price:point.price})));return marketRows(workbook.transactions.filter(tx=>tx.ticker===ticker).map((tx,index)=>({id:'trade-'+index,source:'manual' as const,date:tx.date,time:tx.time,price:tx.price})));},[ticker,workbook.priceHistory,workbook.transactions]);
  const invalid=!!range.from&&!!range.to&&range.from>range.to;
  const requestedRows=invalid?[]:filterMarketRows(allRows,'manual',range.from,range.to);
  const priorDate=period==='1d'&&!requestedRows.length?[...new Set(allRows.map(row=>row.date).filter(date=>date<range.from))].sort().at(-1):undefined;
  const rows=priorDate?filterMarketRows(allRows,'manual',priorDate,priorDate):requestedRows;
  const save=async()=>{const value=Number(priceInput);if(!value||value<=0)return toast('Enter a valid price.');if(!(await ensureSignedIn('Sign in to save price updates.')))return;setMarketPrice(ticker,value);setPriceInput(String(value));toast(`${ticker} price saved: ${fmtPSXPrice(value)}`);};
  return <div>
    <div className="market-price-toolbar"><div className="market-timeframes" role="group" aria-label="Chart timeframe">{MARKET_PERIODS.map(value=><button key={value} type="button" className={'chip'+(period===value?' active':'')} aria-pressed={period===value} onClick={()=>{setPeriod(value);setShowDates(false);setRange(marketDateRange(value));}}>{MARKET_PERIOD_LABELS[value]}</button>)}<button type="button" className={'chip'+(showDates?' active':'')} aria-pressed={showDates} onClick={()=>{const next=!showDates;setShowDates(next);if(next)setPeriod('custom');}}>Custom dates</button></div><label className="market-current-price">Current price<span className="market-current-price-control"><PriceInput exchange="psx" type="number" step="0.01" className="price-input" value={priceInput} onChange={event=>setPriceInput(event.target.value)} onKeyDown={event=>event.key==='Enter'&&save()} style={{width:150}}/><button className="btn secondary small" type="button" onClick={save}><SaveIcon size={12}/>Save</button></span></label></div>
    {showDates&&<div className="market-price-filters"><label>From<input type="date" value={range.from} onChange={event=>{setPeriod('custom');setRange({...range,from:event.target.value});}} /></label><label>To<input type="date" value={range.to} onChange={event=>{setPeriod('custom');setRange({...range,to:event.target.value});}} /></label></div>}
    {invalid&&<p role="alert">From date must precede To date.</p>}
    <MarketPriceChart rows={rows} bounds={lifetimeBounds(workbook.priceHistory[ticker]||[],null,'manual')} previousClose={previousSessionClose(allRows)} selectedPeriodLabel={priorDate?`Previous Session (${priorDate})`:marketPeriodLabel(period,range.from,range.to)} formatPrice={fmtPSXPrice} currency="PKR" timezone="Asia/Karachi"/>
  </div>;
}
