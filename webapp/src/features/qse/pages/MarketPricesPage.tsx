import { useMemo,useState } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { BackButton } from '../../../components/BackButton';
import { PageHeading } from '../../../components/PageHeading';
import { StandardPageSections } from '../../../components/StandardPageSections';
import { QuickEntitySwitch,TopBarControls,TopBarSelect } from '../../../components/TopBarControls';
import { DateInput } from '../../../components/ui/Field';
import { usePageTopBarRightSlot } from '../../../hooks/usePageTopBar';
import { useSortableRows } from '../../../hooks/useSortableRows';
import { fmtQSEPrice } from '../../../lib/format';
import { qatarDay } from '../../../lib/stockData/qsePrices';
import { filterMarketRows,lifetimeBounds,marketDateRange,MARKET_PERIOD_LABELS,MARKET_PERIODS,marketPeriodLabel,previousSessionClose,type MarketRow,type MarketSource } from '../../../lib/stockData/marketPageModel';
import { useWorkbookStore } from '../../../store/workbookStore';
import { useQSEStockData } from '../hooks/useQSEStockData';
import { useQSEDerived } from '../hooks/useQSEDerived';
import { useMarketFavourites } from '../hooks/useMarketFavourites';
import { useMarketCardPrices,useMarketPageData } from '../hooks/useMarketPageData';
import { MarketTickerCards } from '../components/MarketTickerCards';
import { MarketPriceChart } from '../../../components/MarketPriceChart';
import './MarketPricesPage.css';
const symbolPattern=/^[A-Z][A-Z0-9]{1,5}$/;
export function MarketPricesPage() {
  const [params,setParams]=useSearchParams(),[page,setPage]=useState(1);
  const {tickerNames:seededNames}=useQSEStockData(),workbook=useWorkbookStore(state=>state.workbook);
  const derived=useQSEDerived(),{favourites,toggle,ready,error:favouriteError}=useMarketFavourites();
  const opened=new Set(derived.positions.filter(position=>position.shares>0).map(position=>position.ticker));
  const traded=new Set(workbook.transactions.map(transaction=>transaction.ticker));
  const requested=(params.get('ticker') || '').toUpperCase();
  const source:MarketSource=['all','manual','app'].includes(params.get('source') || '')?params.get('source') as MarketSource:'all';
  const appCards=useMarketCardPrices(source!=='manual');
  const tickerNames={...seededNames,...(appCards.names || {})};
  const tickers=[...new Set([...Object.keys(tickerNames),...Object.keys(appCards.prices),...Object.keys(workbook.marketPrices),...Object.keys(workbook.priceHistory),...traded,...favourites,...workbook.watchlist.map(item=>item.ticker),...(symbolPattern.test(requested)?[requested]:[])])].filter(symbol=>symbolPattern.test(symbol)).sort();
  const ticker=tickers.includes(requested)?requested:tickers.find(symbol=>opened.has(symbol)) || tickers.find(symbol=>favourites.has(symbol)) || tickers[0] || '';
  const closed=new Set([...traded].filter(symbol=>!opened.has(symbol)));
  const other=new Set(tickers.filter(symbol=>!opened.has(symbol)&&!closed.has(symbol)&&!favourites.has(symbol)));
  const validDate=(key:string)=>{const value=params.get(key) || '';if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:'';};
  const from=validDate('from'),to=validDate('to'),flags=params.get('flags')==='flagged',group=params.get('group') || 'all',search=params.get('q') || '';
  const pageSize=[10,25,50,100].includes(Number(params.get('size')))?Number(params.get('size')):25;
  const data=useMarketPageData(ticker,from,to,source);
  const invalidDates=!!from&&!!to&&from>to;
  const rows=useMemo(()=>invalidDates?[]:filterMarketRows(data.rows,source,from,to,flags),[data.rows,source,from,to,flags,invalidDates]);
  const previousClose=useMemo(()=>previousSessionClose(filterMarketRows(data.rows,source,'','')),[data.rows,source]);
  const bounds=useMemo(()=>lifetimeBounds(data.manual,data.bounds,source),[data.manual,data.bounds,source]);
  const day=to || qatarDay(),dayRows=useMemo(()=>rows.filter(row=>row.date===day),[rows,day]);
  const cardPrices=source==='manual'?workbook.marketPrices:source==='app'?appCards.prices:{...appCards.prices,...derived.workbook.marketPrices};
  const cardTickers=tickers.filter(symbol=>{
    const inGroup=group==='all'||group==='opened'&&opened.has(symbol)||group==='fav'&&favourites.has(symbol)||group==='closed'&&closed.has(symbol)||group==='others'&&other.has(symbol);
    return inGroup&&(symbol+' '+(tickerNames[symbol] || '')).toLowerCase().includes(search.toLowerCase());
  });
  const choose=(value:string)=>{const next=new URLSearchParams(params);next.set('ticker',value);setParams(next);setPage(1);};
  const change=(patch:Record<string,string>)=>{const next=new URLSearchParams(params);for(const [key,value]of Object.entries(patch)){if(value)next.set(key,value);else next.delete(key);}setParams(next);setPage(1);};
  const reset=()=>change({from:'',to:'',source:'',flags:'',group:'',q:'',size:'',period:''});
  const options=[...(['Opened','Fav','Closed','All Others'] as const).flatMap(label=>tickers.filter(symbol=>label==='Opened'?opened.has(symbol):label==='Fav'?favourites.has(symbol):label==='Closed'?closed.has(symbol):other.has(symbol)).map(symbol=>({value:symbol,label:symbol+' - '+(tickerNames[symbol] || 'QSE ticker')+(favourites.has(symbol)?' \u2605':''),group:label})))];
  const activeFilters=Number(!!from||!!to)+Number(source!=='all')+Number(flags)+Number(group!=='all')+Number(!!search)+Number(pageSize!==25);
  const controls=useMemo(()=><TopBarControls activeCount={activeFilters} onReset={reset}>
    <QuickEntitySwitch label="Ticker" searchable value={ticker} options={options} onChange={choose}/>
    <div className="market-filter-grid">
      <label>From date (Qatar)<DateInput aria-label="From date" value={from} onChange={event=>change({from:event.target.value,period:''})}/></label>
      <label>To date (Qatar)<DateInput aria-label="To date" value={to} onChange={event=>change({to:event.target.value,period:''})}/></label>
      <TopBarSelect label="Data source" value={source} options={[{value:'all',label:'All'},{value:'manual',label:'Manual'},{value:'app',label:'App'}]} onChange={event=>change({source:event.target.value==='all'?'':event.target.value})}/>
      <TopBarSelect label="Price flags" value={flags?'flagged':'all'} options={[{value:'all',label:'All observations'},{value:'flagged',label:'Changes over +/-10%'}]} onChange={event=>change({flags:event.target.value==='flagged'?'flagged':''})}/>
      <TopBarSelect label="Ticker cards" value={group} options={[{value:'all',label:'All tickers'},{value:'opened',label:'Opened positions'},{value:'fav',label:'Favourites'},{value:'closed',label:'Closed positions'},{value:'others',label:'All others'}]} onChange={event=>change({group:event.target.value==='all'?'':event.target.value})}/>
      <label>Find ticker cards<input aria-label="Find ticker cards" value={search} placeholder="Symbol or name" onChange={event=>change({q:event.target.value})}/></label>
      <TopBarSelect label="Updates per page" value={String(pageSize)} options={[10,25,50,100].map(size=>({value:String(size),label:String(size)}))} onChange={event=>change({size:event.target.value==='25'?'':event.target.value})}/>
    </div>
  </TopBarControls>,[params.toString(),ticker,options.map(option=>option.group+option.value+option.label).join('|'),source,from,to,flags,group,search,pageSize]);
  usePageTopBarRightSlot(controls);
  type Column='date'|'price'|'high'|'low'|'source'|'change';
  const {sorted,Th}=useSortableRows<MarketRow,Column>(rows,(row,column)=>column==='date'?row.time || row.date:column==='price'?row.price:column==='high'?row.dayHigh ?? -Infinity:column==='low'?row.dayLow ?? -Infinity:column==='source'?row.source:row.deltaPct ?? -Infinity,'date','desc');
  const pages=Math.max(1,Math.ceil(sorted.length/pageSize)),currentPage=Math.min(page,pages);
  const currentPeriod=MARKET_PERIODS.find(period=>{const range=marketDateRange(period);return range.from===from&&range.to===to;});
  const cards=(symbols:string[])=><MarketTickerCards tickers={symbols} names={tickerNames} prices={cardPrices} selected={ticker} favourites={favourites} onSelect={choose} onFavourite={symbol=>void toggle(symbol)} favouritesReady={ready}/>;
  const table=<div>
    <div className="market-updates-pager"><span>{rows.length} matching updates | page {currentPage} of {pages}</span><button type="button" className="btn secondary small" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>Previous</button><button type="button" className="btn secondary small" disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}>Next</button></div>
    <div className="market-updates-table"><table><thead><tr><Th col="date">Recorded (Qatar)</Th><Th col="price">Price</Th><Th col="high">Day high</Th><Th col="low">Day low</Th><Th col="source">Source</Th><Th col="change">Change</Th></tr></thead><tbody>{sorted.slice((currentPage-1)*pageSize,currentPage*pageSize).map(row=><tr key={row.id}><td>{row.time&&Number.isFinite(Date.parse(row.time))?new Date(row.time).toLocaleString('en-GB',{timeZone:'Asia/Qatar'}):row.date+' (time unknown)'}</td><td>{fmtQSEPrice(row.price)}</td><td>{row.dayHigh==null?'-':fmtQSEPrice(row.dayHigh)}</td><td>{row.dayLow==null?'-':fmtQSEPrice(row.dayLow)}</td><td><span className="market-source-badge">{row.source==='manual'?'Manual':row.priceKey==='manualCorrection'?'App (correction)':'App'}</span></td><td className={row.outlier?'market-flag':''}>{row.deltaPct===null?'-':row.deltaPct.toFixed(2)+'%'}{row.outlier?' | Flagged':''}</td></tr>)}</tbody></table></div>
    {!rows.length&&<p className="text-muted">No updates match the selected ticker, dates and source.</p>}
  </div>;
  return <div className="standard-page market-prices-page">
    <PageHeading back={<BackButton to="/qse">Back to QSE</BackButton>}><h1 className="pagetitle">Market prices</h1></PageHeading>
    <div className="market-page-summary"><strong>{ticker}{tickerNames[ticker]?' - '+tickerNames[ticker]:''}</strong><span>{source==='all'?'All sources':source==='app'?'App data':'Manual data'} | {from || 'All dates'} to {to || 'latest'}</span>{ticker&&<Link to={'/stock/'+ticker}>Stock details</Link>}</div>
    {!data.signedIn&&source!=='manual'&&<p className="text-muted">Sign in to include App prices. Manual entries and local favourites remain available.</p>}
    {[invalidDates?'From date must precede To date.':'',data.error,appCards.error,favouriteError].filter(Boolean).map((error,index)=><p role="alert" key={index}>{error}</p>)}
    {data.loading&&<p className="text-muted">Loading App observations...</p>}
    <StandardPageSections defaultKey="favourites" sections={[
      {key:'favourites',label:'Favourites',defaultOpen:true,summary:favourites.size+' tickers',content:cardTickers.some(symbol=>favourites.has(symbol))?cards(cardTickers.filter(symbol=>favourites.has(symbol))):<p className="text-muted">{favourites.size?'No favourites match the ticker-card filters.':'Choose a star on a ticker card to add your favourite stocks.'}</p>},
      {key:'tickers',label:'All tickers',defaultOpen:true,summary:cardTickers.length+' tickers',content:<><p className="text-muted">Cards show the latest known prices for the selected source. Choose a card to update the charts and table.</p>{cards(cardTickers)}</>},
      {key:'today',label:'Today price chart',defaultOpen:true,summary:day,content:<MarketPriceChart rows={dayRows} bounds={bounds} previousClose={previousClose} selectedPeriodLabel={day===qatarDay()?'Today':day}/>},
      {key:'lifetime',label:'Lifetime price chart',defaultOpen:true,content:<><div className="market-timeframes" role="group" aria-label="Chart timeframe">{MARKET_PERIODS.map(period=><button key={period} type="button" className={'chip'+(currentPeriod===period?' active':'')} aria-pressed={currentPeriod===period} onClick={()=>change({...marketDateRange(period),period:period==='all'?'':period})}>{MARKET_PERIOD_LABELS[period]}</button>)}</div><MarketPriceChart rows={rows} bounds={bounds} previousClose={previousClose} selectedPeriodLabel={marketPeriodLabel(currentPeriod || 'custom',from,to)}/></>},
      {key:'updates',label:'Price updates',defaultOpen:false,summary:rows.length+' observations',content:table},
    ]}/>
  </div>;
}
