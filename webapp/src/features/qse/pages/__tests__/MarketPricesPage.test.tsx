import '@testing-library/jest-dom/vitest';
import { afterEach,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TopBar } from '../../../../components/TopBar';
import { useWorkbookStore } from '../../../../store/workbookStore';
import { createEmptyWorkbook } from '../../../../store/defaultWorkbook';
import { qatarDay } from '../../../../lib/stockData/qsePrices';
const mock=vi.hoisted(()=>({charts:[] as Array<{datasets:Array<{label:string;data:unknown[]}>}>}));
vi.mock('../../../../components/StockCharts',()=>({StockLine:({data}:{data:{datasets:Array<{label:string;data:unknown[]}>}})=>{mock.charts.push(data);return <div data-testid="market-chart">{data.datasets.map(dataset=>dataset.label).join(', ')}</div>;}}));
vi.mock('../../hooks/useQSEStockData',()=>({useQSEStockData:()=>({tickerNames:{QFLS:'Qatar Fuel',QNBK:'Qatar National Bank',QIBK:'Qatar Islamic Bank'},fundamentals:{}})}));
vi.mock('../../hooks/useMarketFavourites',async()=>{
 const {useState}=await import('react');
 return {useMarketFavourites:()=>{const [tickers,setTickers]=useState(['QFLS']);return {favourites:new Set(tickers),ready:true,error:'',toggle:async(ticker:string)=>setTickers(values=>values.includes(ticker)?values.filter(value=>value!==ticker):[...values,ticker])};}};
});
vi.mock('../../hooks/useMarketPageData',()=>({
 useMarketCardPrices:()=>({prices:{QFLS:1,QNBK:10,QIBK:12},error:''}),
 useMarketPageData:()=>{
  const day=qatarDay(),previous=new Date(day+'T00:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);
  return {signedIn:true,loading:false,error:'',manual:[{date:day,price:1.01}],bounds:{low:.75,high:1.2},rows:[
   {id:'manual',source:'manual',date:day,time:day+'T09:00:00Z',price:1.01,deltaPct:null,outlier:false},
   {id:'app',source:'shared',date:day,time:day+'T08:00:00Z',price:1,dayHigh:1.1,dayLow:.9,deltaPct:25,outlier:true},
   {id:'old',source:'shared',date:previous.toISOString().slice(0,10),price:.8,deltaPct:null,outlier:false},
  ]};
 },
}));
import { MarketPricesPage } from '../MarketPricesPage';
afterEach(()=>{cleanup();mock.charts=[];});
function show(){
 const workbook=createEmptyWorkbook();workbook.marketPrices={QFLS:1.01};workbook.transactions=[{date:'2026-10-01',ticker:'QFLS',action:'BUY',shares:10,price:1},{date:'2026-10-01',ticker:'QNBK',action:'BUY',shares:10,price:10},{date:'2026-10-02',ticker:'QNBK',action:'SELL',shares:10,price:11}];
 useWorkbookStore.setState({workbook});
 return render(<MemoryRouter initialEntries={['/market-prices?ticker=QFLS']}><TopBar/><MarketPricesPage/></MemoryRouter>);
}
it('uses ordered standard sections, compact cards and independent favourite controls',()=>{
 const {container}=show();
 expect([...container.querySelectorAll('[data-page-section]')].map(node=>node.getAttribute('data-page-section'))).toEqual(['favourites','tickers','today','lifetime','updates']);
 for(const key of ['favourites','today','lifetime'])expect(container.querySelector('[data-page-section="'+key+'"] .standard-card-toggle')).toHaveAttribute('aria-expanded','true');
 expect(container.querySelector('[data-page-section="updates"] .standard-card-toggle')).toHaveAttribute('aria-expanded','false');
 const all=container.querySelector('[data-page-section="tickers"]')!;
 expect(all.querySelectorAll('.market-ticker-card')).toHaveLength(3);
 fireEvent.click(within(all as HTMLElement).getByRole('button',{name:'Favourite QIBK'}));
 const favourites=container.querySelector('[data-page-section="favourites"]')!;
 expect(within(favourites as HTMLElement).getByRole('button',{name:'Unfavourite QIBK'})).toBeVisible();
 fireEvent.click(within(favourites as HTMLElement).getByRole('button',{name:'Unfavourite QIBK'}));
 expect(within(favourites as HTMLElement).queryByRole('button',{name:'View QIBK prices'})).toBeNull();
 expect(container.querySelectorAll('.standard-card-fullscreen-trigger')).toHaveLength(5);
});
it('keeps grouped searchable ticker selection on the topbar and page fields in one popup',()=>{
 show();expect(screen.queryByRole('combobox',{name:'Stock'})).toBeNull();expect(screen.queryByRole('combobox',{name:'Data source'})).toBeNull();
 const input=screen.getByRole('combobox',{name:'Ticker'});fireEvent.focus(input);
 for(const name of ['Opened','Fav','Closed','All Others'])expect(screen.getByRole('group',{name})).toBeVisible();
 fireEvent.change(input,{target:{value:'Islamic'}});expect(screen.getByRole('option',{name:/QIBK/})).toBeVisible();
 fireEvent.keyDown(input,{key:'Enter'});expect((screen.getByRole('combobox',{name:'Ticker'}) as HTMLInputElement).value).toContain('QIBK');
 fireEvent.click(screen.getByRole('button',{name:/^Filters/}));expect(screen.getByRole('combobox',{name:'Data source'})).toHaveValue('all');
 expect(screen.getByRole('combobox',{name:'Price flags'})).toBeVisible();expect(screen.getByRole('combobox',{name:'Updates per page'})).toBeVisible();
});
it('applies timeframe and source to both charts and paginated updates',()=>{
 const {container}=show();fireEvent.click(screen.getByRole('button',{name:'Today'}));
 fireEvent.click(container.querySelector('[data-page-section="updates"] .standard-card-toggle')!);
 expect(screen.getByText(/2 matching updates/)).toBeVisible();
 expect(screen.getAllByTestId('market-chart')).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:/^Filters/}));
 fireEvent.change(screen.getByRole('combobox',{name:'Data source'}),{target:{value:'manual'}});
 fireEvent.click(screen.getByRole('button',{name:'Done'}));expect(screen.getByText(/1 matching updates/)).toBeVisible();
 expect(container.querySelector('[data-page-section="updates"] tbody')?.textContent).toContain('Manual');
 expect(container.querySelector('[data-page-section="updates"] tbody')?.textContent).not.toContain('App');
 fireEvent.click(screen.getByRole('button',{name:'All Time'}));
 expect(screen.getByText(/1 matching updates/)).toBeVisible();
 expect(mock.charts.at(-1)?.datasets.map(dataset=>dataset.label)).toEqual(expect.arrayContaining(['Period low','Period high','Lifetime low','Lifetime high','Median']));
});
