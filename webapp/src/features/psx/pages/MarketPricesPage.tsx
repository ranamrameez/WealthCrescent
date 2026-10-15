import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackButton } from '../../../components/BackButton';
import { PageHeading } from '../../../components/PageHeading';
import { StandardPageSections } from '../../../components/StandardPageSections';
import { QuickEntitySwitch, TopBarControls, TopBarSelect } from '../../../components/TopBarControls';
import { PriceInput } from '../../../components/ui/PriceInput';
import { usePageTopBarRightSlot } from '../../../hooks/usePageTopBar';
import { useSortableRows } from '../../../hooks/useSortableRows';
import { fmtPSXPrice } from '../../../lib/format';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { filterMarketRows, lifetimeBounds, marketDateRange, marketRows, MARKET_PERIOD_LABELS, MARKET_PERIODS, marketPeriodLabel, previousSessionClose, type MarketRow } from '../../../lib/stockData/marketPageModel';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';
import { toast } from '../../../components/Toast';
import { MarketPriceChart } from '../../../components/MarketPriceChart';
import { MarketTickerCards } from '../../qse/components/MarketTickerCards';
import { usePSXStockData } from '../hooks/usePSXStockData';
import '../../qse/pages/MarketPricesPage.css';

export function MarketPricesPage() {
  const [params,setParams]=useSearchParams();
  const [priceInput,setPriceInput]=useState('');
  const workbook=usePSXWorkbookStore(state=>state.workbook);
  const setMarketPrice=usePSXWorkbookStore(state=>state.setMarketPrice);
  const ensureSignedIn=useEnsureSignedIn();
  const {tickerNames}=usePSXStockData();
  const traded=new Set(workbook.transactions.map(tx=>tx.ticker));
  const tickers=[...new Set([...Object.keys(tickerNames),...Object.keys(workbook.marketPrices),...Object.keys(workbook.priceHistory),...traded,...workbook.watchlist.map(item=>item.ticker)])].sort();
  const requested=(params.get('ticker')||'').toUpperCase();
  const ticker=tickers.includes(requested)?requested:[...traded][0]||tickers[0]||'';
  const period=params.get('period')||'1d';
  const preset=marketDateRange(period);
  const from=params.get('from')??preset.from,to=params.get('to')??preset.to;
  const search=params.get('q')||'';
  const group=params.get('group')||'portfolio';
  const raw=useMemo(()=>{
    const history=workbook.priceHistory[ticker]||[];
    if(history.length)return marketRows(history.map((point,index)=>({id:'price-'+index,source:'manual' as const,date:point.date,time:point.time,price:point.price})));
    return marketRows(workbook.transactions.filter(tx=>tx.ticker===ticker).map((tx,index)=>({id:'trade-'+index,source:'manual' as const,date:tx.date,time:tx.time,price:tx.price})));
  },[ticker,workbook.priceHistory,workbook.transactions]);
  const rows=useMemo(()=>filterMarketRows(raw,'manual',from,to),[raw,from,to]);
  const prices=Object.fromEntries(tickers.map(symbol=>[symbol,workbook.marketPrices[symbol]||workbook.priceHistory[symbol]?.at(-1)?.price||workbook.transactions.filter(tx=>tx.ticker===symbol).at(-1)?.price||0]));
  const visibleTickers=tickers.filter(symbol=>(group==='all'||traded.has(symbol))&&(symbol+' '+(tickerNames[symbol]||'')).toLowerCase().includes(search.toLowerCase()));
  const change=(patch:Record<string,string>)=>{const next=new URLSearchParams(params);for(const [key,value] of Object.entries(patch)){value?next.set(key,value):next.delete(key);}setParams(next);};
  const choose=(symbol:string)=>change({ticker:symbol});
  const options=tickers.map(symbol=>({value:symbol,label:symbol+' - '+(tickerNames[symbol]||'PSX ticker')}));
  usePageTopBarRightSlot(<TopBarControls><QuickEntitySwitch label="Ticker" searchable value={ticker} options={options} onChange={choose}/><TopBarSelect label="Ticker cards" value={group} options={[{value:'portfolio',label:'Portfolio tickers'},{value:'all',label:'All PSX tickers'}]} onChange={event=>change({group:event.target.value==='portfolio'?'':event.target.value})}/><label>Find ticker cards<input value={search} placeholder="Symbol or name" onChange={event=>change({q:event.target.value})}/></label></TopBarControls>);
  type Column='date'|'price';
  const {sorted,Th}=useSortableRows<MarketRow,Column>(rows,(row,column)=>column==='date'?row.time||row.date:row.price,'date','desc');
  const savePrice=async()=>{const value=Number(priceInput);if(value<=0)return;if(!(await ensureSignedIn('Sign in to save price updates.')))return;setMarketPrice(ticker,value);setPriceInput('');toast(ticker+' price saved: '+fmtPSXPrice(value));};
  const bounds=lifetimeBounds(workbook.priceHistory[ticker]||[],null,'manual');
  return <div className="standard-page market-prices-page">
    <PageHeading back={<BackButton to="/psx">Back to PSX</BackButton>}><h1 className="pagetitle">PSX Market Prices</h1></PageHeading>
    <div className="market-page-summary"><strong>{ticker}{tickerNames[ticker]?' - '+tickerNames[ticker]:''}</strong><span>Recorded and trade prices | {from||'All dates'} to {to||'latest'}</span>{ticker&&<Link to={'/psx/stock/'+ticker}>Stock details</Link>}</div>
    <div className="row gap-sm mb-md"><PriceInput exchange="psx" type="number" step="0.01" value={priceInput} placeholder="Current price" onChange={event=>setPriceInput(event.target.value)} onKeyDown={event=>event.key==='Enter'&&void savePrice()}/><button className="btn secondary small" onClick={()=>void savePrice()}>Save price</button></div>
    <StandardPageSections preserveOrder sections={[
      {key:'tickers',label:'Ticker prices',defaultOpen:true,summary:visibleTickers.length+' tickers',content:<MarketTickerCards tickers={visibleTickers} names={tickerNames} prices={prices} selected={ticker} onSelect={choose} exchange="psx" formatPrice={fmtPSXPrice}/>},
      {key:'chart',label:'Price chart',defaultOpen:true,content:<><div className="market-timeframes" role="group" aria-label="Chart timeframe">{MARKET_PERIODS.map(value=><button key={value} className={'chip'+(period===value?' active':'')} onClick={()=>change({...marketDateRange(value),period:value})}>{MARKET_PERIOD_LABELS[value]}</button>)}</div><MarketPriceChart rows={rows} bounds={bounds} previousClose={previousSessionClose(raw)} formatPrice={fmtPSXPrice} currency="PKR" timezone="Asia/Karachi" selectedPeriodLabel={marketPeriodLabel(period,from,to)}/></>},
      { table: true,key:'updates',label:'Price updates',defaultOpen:true,summary:rows.length+' observations',content:<div className="market-updates-table"><table><thead><tr><Th col="date">Recorded</Th><Th col="price">Price</Th><th>Source</th></tr></thead><tbody>{sorted.map(row=><tr key={row.id}><td>{row.time||row.date}</td><td>{fmtPSXPrice(row.price)}</td><td><span className="market-source-badge">{row.id.startsWith('trade-')?'Trade':'Recorded'}</span></td></tr>)}</tbody></table>{!rows.length&&<p className="text-muted">No price observations match this timeframe. Save a current price or record a trade to begin the chart.</p>}</div>},
    ]}/>
  </div>;
}
