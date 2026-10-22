import { RecordRow } from '../../../components/RecordRow';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackButton } from '../../../components/BackButton';
import { PageHeading } from '../../../components/PageHeading';
import { StandardPageSections } from '../../../components/StandardPageSections';
import { StandardCard } from '../../../components/StandardCard';
import { CollapsibleContent } from '../../../components/CollapsibleContent';
import { Pagination } from '../../../components/Pagination';
import { SummaryGroupCard, SummaryMetric } from '../../../components/SummaryGroupCard';
import { pakistanDay } from '../../../lib/stockData/livePsx';
import { psxMarketRows } from '../../../lib/stockData/psxMarketRows';
import { StandardButton } from '../../../components/standard';
import { useMarketFavourites } from '../../qse/hooks/useMarketFavourites';
import { usePsxReference } from '../hooks/usePsxReference';
import { PsxApiPanel, PsxIndicesPanel } from '../components/PsxApiPanel';
import { QuickEntitySwitch, TopBarControls, TopBarSelect } from '../../../components/TopBarControls';
import { PriceInput } from '../../../components/ui/PriceInput';
import { usePageTopBarRightSlot } from '../../../hooks/usePageTopBar';
import { useSortableRows } from '../../../hooks/useSortableRows';
import { fmtPSXPrice } from '../../../lib/format';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { filterMarketRows, lifetimeBounds, marketDateRange, MARKET_PERIOD_LABELS, MARKET_PERIODS, marketPeriodLabel, previousSessionClose, type MarketRow } from '../../../lib/stockData/marketPageModel';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';
import { toast } from '../../../components/Toast';
import { MarketPriceChart } from '../../../components/MarketPriceChart';
import { MarketTickerCards } from '../../qse/components/MarketTickerCards';
import { usePSXStockData } from '../hooks/usePSXStockData';
import { useLivePsxWorkbook, usePsxFeed } from '../hooks/useLivePsxWorkbook';
import '../../qse/pages/MarketPricesPage.css';

export function MarketPricesPage() {
  const [params,setParams]=useSearchParams();
  const [priceInput,setPriceInput]=useState('');
  const [updatesPage,setUpdatesPage]=useState(0);
  const reference=usePsxReference();
  const favourites=useMarketFavourites('psx');
  const storedWorkbook=usePSXWorkbookStore(state=>state.workbook);
  const workbook=useLivePsxWorkbook();
  const livePoints=usePsxFeed(state=>state.points);
  const liveLoading=usePsxFeed(state=>state.loading);
  const liveError=usePsxFeed(state=>state.error);
  const liveUpdatedAt=usePsxFeed(state=>state.updatedAt);
  const setMarketPrice=usePSXWorkbookStore(state=>state.setMarketPrice);
  const ensureSignedIn=useEnsureSignedIn();
  const {tickerNames,sectors:tickerSectors}=usePSXStockData();
  const traded=new Set(workbook.transactions.map(tx=>tx.ticker));
  const tickers=[...new Set([...(reference.data?.symbols||[]),...Object.keys(reference.data?.tickerSectors||{}),...Object.keys(tickerNames),...Object.keys(workbook.marketPrices),...Object.keys(workbook.priceHistory),...traded,...workbook.watchlist.map(item=>item.ticker),...favourites.favourites])].sort();
  const requested=(params.get('ticker')||'').toUpperCase();
  const ticker=tickers.includes(requested)?requested:[...traded][0]||tickers[0]||'';
  const period=MARKET_PERIODS.find(value=>value===params.get('period'))||'1M';
  const preset=marketDateRange(period,undefined,pakistanDay);
  const from=params.get('from')??preset.from,to=params.get('to')??preset.to;
  const search=params.get('q')||'';
  const group=params.get('group')||'all';
  const raw=useMemo(()=>psxMarketRows(storedWorkbook,ticker,livePoints),[storedWorkbook,ticker,livePoints]);
  const rows=useMemo(()=>filterMarketRows(raw,'all',from,to),[raw,from,to]);
  const prices=useMemo(()=>{
    const result:Record<string,number>={};
    for(const tx of workbook.transactions) result[tx.ticker]=tx.price;
    for(const [symbol,points] of Object.entries(workbook.priceHistory)) if(points.length)result[symbol]=points.at(-1)!.price;
    return {...result,...workbook.marketPrices};
  },[workbook.transactions,workbook.priceHistory,workbook.marketPrices]);
  const visibleTickers=tickers.filter(symbol=>(group==='all'||traded.has(symbol))&&(symbol+' '+(tickerNames[symbol]||'')).toLowerCase().includes(search.toLowerCase()));
  const change=(patch:Record<string,string>)=>{const next=new URLSearchParams(params);for(const [key,value] of Object.entries(patch)){if(value)next.set(key,value);else next.delete(key);}setParams(next);};
  const choose=(symbol:string)=>{setUpdatesPage(0);change({ticker:symbol});};
  const options=tickers.map(symbol=>({value:symbol,label:symbol+' - '+(tickerNames[symbol]||'PSX ticker')}));
  usePageTopBarRightSlot(<TopBarControls><QuickEntitySwitch label="Ticker" searchable value={ticker} options={options} onChange={choose}/><TopBarSelect label="Ticker cards" value={group} options={[{value:'portfolio',label:'Portfolio tickers'},{value:'all',label:'All PSX tickers'}]} onChange={event=>change({group:event.target.value})}/><label>Find ticker cards<input value={search} placeholder="Symbol or name" onChange={event=>change({q:event.target.value})}/></label><TopBarSelect label="Price period" value={period} options={MARKET_PERIODS.map(value=>({value,label:MARKET_PERIOD_LABELS[value]}))} onChange={event=>{setUpdatesPage(0);change({...marketDateRange(event.target.value,undefined,pakistanDay),period:event.target.value});}}/><label>From<input type="date" value={from} max={to||undefined} onChange={event=>{setUpdatesPage(0);change({from:event.target.value});}}/></label><label>To<input type="date" value={to} min={from||undefined} onChange={event=>{setUpdatesPage(0);change({to:event.target.value});}}/></label></TopBarControls>);
  type Column='date'|'price';
  const {sorted,Th}=useSortableRows<MarketRow,Column>(rows,(row,column)=>column==='date'?row.time||row.date:row.price,'date','desc');
  const savePrice=async()=>{const value=Number(priceInput);if(!ticker||!Number.isFinite(value)||value<=0)return;if(!(await ensureSignedIn('Sign in to save price updates.')))return;setMarketPrice(ticker,value);setPriceInput('');toast(ticker+' price saved: '+fmtPSXPrice(value));};
  const bounds=lifetimeBounds(storedWorkbook.priceHistory[ticker]||[],null,'manual');
  const cards=(symbols:string[])=><MarketTickerCards tickers={symbols} names={tickerNames} prices={prices} selected={ticker} onSelect={choose} favourites={favourites.favourites} favouritesReady={favourites.ready} onFavourite={symbol=>void favourites.toggle(symbol)} exchange="psx" formatPrice={fmtPSXPrice}/>;
  const sectors:Record<string,string[]>={};
  for(const symbol of visibleTickers){const code=reference.data?.tickerSectors[symbol]||tickerSectors[symbol]||'unknown';(sectors[code]??=[]).push(symbol);}
  const sectorName=(code:string)=>reference.data?.sectors[code]?.sector_name||(code==='unknown'?'Unclassified':code);
  const updatePages=Math.max(1,Math.ceil(sorted.length/50)),updatePage=Math.min(updatesPage,updatePages-1);
  const historyQuery=new URLSearchParams();
  if(from)historyQuery.set('start',from);
  if(to)historyQuery.set('end',to);
  return <div className="standard-page market-prices-page">
    <PageHeading back={<BackButton to="/psx">Back to PSX</BackButton>}><h1 className="pagetitle">PSX Market Prices</h1></PageHeading>
    <div className="account-summary-grid"><SummaryGroupCard title={tickerNames[ticker]?ticker+' — '+tickerNames[ticker]:ticker||'PSX market'}><SummaryMetric label="Last price (PKR)" value={prices[ticker]?fmtPSXPrice(prices[ticker]):'—'}/><SummaryMetric label="Snapshot checked (PKT)" value={liveUpdatedAt?new Date(liveUpdatedAt).toLocaleString('en-GB',{timeZone:'Asia/Karachi'}):'Awaiting sync'} tooltip="The provider response time. The API does not supply the time of the last trade."/></SummaryGroupCard><SummaryGroupCard title="Market coverage"><SummaryMetric label="Listed tickers" value={reference.data?.symbols.length||tickers.length}/><SummaryMetric label="Favourites" value={favourites.favourites.size}/></SummaryGroupCard></div>
    <div className="market-page-summary"><span>{from||'All dates'} to {to||'latest'}</span>{ticker&&<Link to={'/psx/stock/'+ticker}>Stock details</Link>}</div>
    {liveLoading&&<p className="text-muted">Refreshing live PSX prices…</p>}
    {liveError&&<p role="alert">{liveError}</p>}
    {reference.error&&<p role="alert">{reference.error}</p>}
    {favourites.error&&<p role="alert">{favourites.error}</p>}
    <div className="row gap-sm mb-md"><PriceInput exchange="psx" aria-label="Current price (PKR)" type="number" step="0.01" value={priceInput} placeholder="Current price" onChange={event=>setPriceInput(event.target.value)} onKeyDown={event=>event.key==='Enter'&&void savePrice()}/><StandardButton tone="secondary" size="small" disabled={!ticker||!Number.isFinite(Number(priceInput))||Number(priceInput)<=0} onClick={()=>void savePrice()}>Save price</StandardButton></div>
    <StandardPageSections preserveOrder sections={[
      {key:'favourites',label:'Favourites',defaultOpen:true,summary:favourites.favourites.size+' tickers',content:favourites.favourites.size?cards([...favourites.favourites]):<p className="text-muted">Star tickers in a sector to keep them here.</p>},
      {key:'tickers',label:'Tickers by sector',defaultOpen:true,unframed:true,summary:visibleTickers.length+' tickers',content:<div className="standard-section-stack"><h2>Tickers by sector</h2>{!visibleTickers.length&&<p className="text-muted">No tickers match these filters.</p>}{Object.entries(sectors).sort(([a],[b])=>sectorName(a).localeCompare(sectorName(b))).map(([code,symbols])=><StandardCard key={code} title={sectorName(code)} summary={symbols.length+' tickers'} defaultOpen={false}>{cards(symbols)}{reference.data?.sectors[code]&&<CollapsibleContent title="Provider sector membership"><PsxApiPanel path={'/sectors/'+encodeURIComponent(reference.data.sectors[code].sector_name)+'/stocks'}/></CollapsibleContent>}</StandardCard>)}</div>},
      {key:'stock',label:'Stock data',defaultOpen:false,content:<div className="standard-section-stack">{[
        ['Latest quote',`/stocks/${encodeURIComponent(ticker)}/quote`],
        ['Historical daily prices',`/stocks/${encodeURIComponent(ticker)}/historical${historyQuery.size?'?'+historyQuery:''}`],
        ['Company disclosures',`/stocks/${encodeURIComponent(ticker)}/fundamentals`],
      ].map(([title,path])=><CollapsibleContent key={title} title={title}><PsxApiPanel path={path}/></CollapsibleContent>)}</div>},
      {key:'overview',label:'Market overview',defaultOpen:false,content:<div className="standard-section-stack">{[['Market screener','/screener'],['Sector overview','/sectors'],['Listed tickers','/stocks']].map(([title,path])=><CollapsibleContent key={title} title={title}><PsxApiPanel path={path}/></CollapsibleContent>)}</div>},
      {key:'instruments',label:'Market instruments',defaultOpen:false,content:<div className="standard-section-stack">{[['Debt market','/debt-market'],['Eligible scrips','/eligible-scrips']].map(([title,path])=><CollapsibleContent key={title} title={title}><PsxApiPanel path={path}/></CollapsibleContent>)}</div>},
      {key:'indices',label:'Indices and constituents',defaultOpen:false,content:<PsxIndicesPanel/>},
      {key:'chart',label:'Recorded price chart',defaultOpen:false,content:<><p className="text-muted">Snapshot times show when prices were checked. Historical daily prices are available in their own section.</p><MarketPriceChart rows={rows} bounds={bounds} previousClose={previousSessionClose(raw)} formatPrice={fmtPSXPrice} currency="PKR" timezone="Asia/Karachi" selectedPeriodLabel={marketPeriodLabel(from!==preset.from||to!==preset.to?'custom':period,from,to)}/></>},
      { table: true,key:'updates',label:'Price updates',defaultOpen:false,summary:rows.length+' observations',content:<div className="market-updates-table"><table><thead><tr><Th col="date">Recorded / checked</Th><Th col="price">Price (PKR)</Th><th>Source</th></tr></thead><tbody>{sorted.slice(updatePage*50,(updatePage+1)*50).map(row=><RecordRow market="psx" record={row} key={row.id}><td>{row.time||row.date}</td><td>{fmtPSXPrice(row.price)}</td><td><span className="market-source-badge">{row.source==='shared'?'Snapshot · psxdata':row.id.startsWith('trade-')?'Trade':'Recorded'}</span></td></RecordRow>)}</tbody></table><Pagination page={updatePage} pageCount={updatePages} total={sorted.length} onChange={setUpdatesPage}/>{!rows.length&&<p className="text-muted">No price observations match this timeframe.</p>}</div>},
      {key:'reference',label:'Market data sync',defaultOpen:false,actions:[{label:'Request reference refresh',disabled:reference.syncing,onClick:()=>void(async()=>{if(!await ensureSignedIn('Sign in to refresh PSX sector data.'))return;try{await reference.sync();toast('Reference refresh requested. It will run on the next scheduled sync.');}catch{/* Error displayed above. */}})()}],content:<><p className="text-muted">{reference.saved&&reference.data?'Sector membership saved '+new Date(reference.data.updatedAt).toLocaleString('en-GB',{timeZone:'Asia/Karachi'})+' PKT.':'Awaiting the first reference sync.'} Shared prices refresh every 15 minutes. Requested datasets join the next scheduled refresh.</p><CollapsibleContent title="Data service status"><PsxApiPanel path="/health"/></CollapsibleContent></>},
    ]}/>
  </div>;
}
