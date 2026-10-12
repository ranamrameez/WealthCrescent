import { useMemo, useState } from 'react';
import { fmtPSXPrice } from '../../../lib/format';
import { filterMarketRows, lifetimeBounds, marketDateRange, marketRows, MARKET_PERIODS, previousSessionClose } from '../../../lib/stockData/marketPageModel';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';
import { MarketPriceChart } from '../../../components/MarketPriceChart';
import '../../qse/pages/MarketPricesPage.css';

export function MarketPriceHistory({ticker}:{ticker:string}) {
  const workbook=usePSXWorkbookStore(state=>state.workbook);
  const [period,setPeriod]=useState('1d');
  const [range,setRange]=useState(()=>marketDateRange('1d'));
  const allRows=useMemo(()=>{
    const history=workbook.priceHistory[ticker]||[];
    if(history.length)return marketRows(history.map((point,index)=>({id:'price-'+index,source:'manual' as const,date:point.date,time:point.time,price:point.price})));
    return marketRows(workbook.transactions.filter(tx=>tx.ticker===ticker).map((tx,index)=>({id:'trade-'+index,source:'manual' as const,date:tx.date,time:tx.time,price:tx.price})));
  },[ticker,workbook.priceHistory,workbook.transactions]);
  const invalid=!!range.from&&!!range.to&&range.from>range.to;
  const rows=invalid?[]:filterMarketRows(allRows,'manual',range.from,range.to);
  return <div>
    <div className="market-timeframes" role="group" aria-label="Chart timeframe">{MARKET_PERIODS.map(value=><button key={value} type="button" className={'chip'+(period===value?' active':'')} aria-pressed={period===value} onClick={()=>{setPeriod(value);setRange(marketDateRange(value));}}>{value==='1d'?'Today':value==='all'?'All time':value}</button>)}</div>
    <div className="d-flex gap-2 flex-wrap">
      <label>From<input type="date" value={range.from} onChange={event=>{setPeriod('');setRange({...range,from:event.target.value});}} /></label>
      <label>To<input type="date" value={range.to} onChange={event=>{setPeriod('');setRange({...range,to:event.target.value});}} /></label>
    </div>
    {invalid&&<p role="alert">From date must precede To date.</p>}
    <MarketPriceChart rows={rows} bounds={lifetimeBounds(workbook.priceHistory[ticker]||[],null,'manual')} previousClose={previousSessionClose(allRows)} label={ticker+' - '+(range.from||'All dates')+' to '+(range.to||'latest')} formatPrice={fmtPSXPrice} currency="PKR" timezone="Asia/Karachi" />
  </div>;
}
