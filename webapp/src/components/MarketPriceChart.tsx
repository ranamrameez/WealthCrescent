import { memo } from 'react';
import type { ChartDataset, ChartOptions } from 'chart.js';
import { fmtQSEPrice } from '../lib/format';
import { stockPriceChangeColor } from '../lib/stockChartTheme';
import type { MarketRow } from '../lib/stockData/marketPageModel';
import { StockLine } from './StockCharts';

type PriceBounds={low:number;high:number}|null;

function nearestPriceIndex(rows:MarketRow[], value:number) {
  return rows.reduce((best,row,index)=>Math.abs(row.price-value)<Math.abs(rows[best].price-value)?index:best,0);
}

export function marketChartData(rows:MarketRow[],bounds:PriceBounds,previousClose?:number,formatPrice:(value:number)=>string=(value)=>fmtQSEPrice(value)) {
  const full=[...rows].reverse();
  const ordered=full.length<=2000?full:full.flatMap((_row,index)=>{
    const size=Math.ceil(full.length/500);if(index%size)return [];
    const bucket=full.slice(index,index+size);
    const min=bucket.reduce((a,b)=>a.price<b.price?a:b),max=bucket.reduce((a,b)=>a.price>b.price?a:b);
    const picked=new Set([bucket[0],min,max,bucket.at(-1)!]);return bucket.filter(row=>picked.has(row));
  });
  const observed=ordered.map(row=>row.price);
  const low=bounds?.low??Math.min(...observed),high=bounds?.high??Math.max(...observed);
  const highlights=new Map<number,string[]>();
  const mark=(index:number,label:string,value:number)=>highlights.set(index,[...(highlights.get(index)||[]),label+' '+formatPrice(value)]);
  mark(nearestPriceIndex(ordered,low),'Low',low);
  mark(nearestPriceIndex(ordered,high),'High',high);
  mark(ordered.length-1,'Current',ordered.at(-1)!.price);
  const priceColor=stockPriceChangeColor(ordered.at(-1)?.price,previousClose);
  const rgb=priceColor==='#16a34a'?'22,163,74':priceColor==='#dc2626'?'220,38,38':'37,99,235';
  const datasets:ChartDataset<'line'>[]=[{
    label:'Price',data:observed,borderColor:priceColor,fill:'origin',
    backgroundColor(context){const {ctx,chartArea}=context.chart;if(!chartArea)return `rgba(${rgb},0.12)`;const gradient=ctx.createLinearGradient(0,chartArea.top,0,chartArea.bottom);gradient.addColorStop(0,`rgba(${rgb},0.30)`);gradient.addColorStop(1,`rgba(${rgb},0.015)`);return gradient;},
    pointRadius:ordered.map((_row,index)=>highlights.has(index)?4:0),pointHoverRadius:4,
    pointBackgroundColor:ordered.map(row=>row.outlier?'#b91c1c':priceColor),
    datalabels:{display:context=>highlights.has(context.dataIndex),formatter:(_value,context)=>highlights.get(context.dataIndex)?.join('\n')||'',anchor:'end',align:'top',offset:5,backgroundColor:'rgba(15,23,42,.78)',borderRadius:4,color:'#fff',padding:4},
  }];
  if(ordered.some(row=>Number.isFinite(row.dayHigh)&&Number.isFinite(row.dayLow)))for(const [field,label,color] of [['dayHigh','Reported day high','#8b5cf6'],['dayLow','Reported day low','#0891b2']] as const)datasets.push({label,data:ordered.map(row=>row[field]??null),borderColor:color,borderWidth:1,borderDash:field==='dayHigh'?[4,4]:[2,6],pointRadius:0,datalabels:{display:false},spanGaps:false});
  return {ordered,highlights,datasets,total:full.length};
}

export const MarketPriceChart=memo(function MarketPriceChart({rows,bounds,label,previousClose,formatPrice=fmtQSEPrice,currency='QAR',timezone='Asia/Qatar'}:{rows:MarketRow[];bounds:PriceBounds;label:string;previousClose?:number;formatPrice?:(value:number)=>string;currency?:string;timezone?:string}) {
  if(!rows.length)return <p className="text-muted">No price observations match this chart's date and source filters.</p>;
  const {ordered,datasets,total}=marketChartData(rows,bounds,previousClose,formatPrice);
  const options:ChartOptions<'line'>={plugins:{tooltip:{callbacks:{label(context){const row=ordered[context.dataIndex];if(context.datasetIndex===0)return (row.source==='manual'?'Recorded':'App')+': '+formatPrice(row.price)+(row.outlier?' | Flagged':'');return context.dataset.label+': '+formatPrice(Number(context.raw));}}}},scales:{x:{grid:{display:false}},y:{title:{display:true,text:currency+' per share'}}}};
  return <div>
    <p className="text-muted market-chart-caption">{label}. Low and high use the nearest observed point when the exact occurrence time is unavailable.</p>
    <div className="market-chart-canvas"><StockLine role="img" aria-label={label+' price chart'} data={{labels:ordered.map(row=>row.time&&Number.isFinite(Date.parse(row.time))?new Date(row.time).toLocaleString('en-GB',{timeZone:timezone}):row.date+' (time unknown)'),datasets}} options={options}/></div>
    <div className="market-chart-legend" aria-label="Chart statistics"><span>{total} observations{total!==ordered.length?' · overview of '+ordered.length+' points':''}</span></div>
  </div>;
});
