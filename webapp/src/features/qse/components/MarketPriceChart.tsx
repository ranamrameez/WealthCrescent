import { memo } from 'react';
import type { ChartDataset,ChartOptions } from 'chart.js';
import { StockLine } from '../../../components/StockCharts';
import { fmtQSEPrice } from '../../../lib/format';
import { stockPriceChangeColor } from '../../../lib/stockChartTheme';
import { priceMedian,type MarketRow } from '../../../lib/stockData/marketPageModel';
export function marketChartData(rows:MarketRow[],bounds:{low:number;high:number}|null,previousClose?:number,formatPrice:(value:number)=>string=(value)=>fmtQSEPrice(value)) {
  const full=[...rows].reverse(),median=priceMedian(full);
  // Preserve real extrema while keeping large lifetime charts responsive.
  const ordered=full.length<=2000?full:full.flatMap((_row,index)=>{
    const size=Math.ceil(full.length/500);if(index%size)return [];
    const bucket=full.slice(index,index+size);
    const min=bucket.reduce((a,b)=>a.price<b.price?a:b),max=bucket.reduce((a,b)=>a.price>b.price?a:b);
    const picked=new Set([bucket[0],min,max,bucket.at(-1)!]);return bucket.filter(row=>picked.has(row));
  });
  const guides=[...(bounds?[{label:'Lifetime low',value:bounds.low,color:'#15803d'},{label:'Lifetime high',value:bounds.high,color:'#dc2626'}]:[]),...(median===null?[]:[{label:'Median',value:median,color:'#a16207'}])];
  const priceColor=stockPriceChangeColor(ordered.at(-1)?.price,previousClose);
  const rgb=priceColor==='#16a34a'?'22,163,74':priceColor==='#dc2626'?'220,38,38':'37,99,235';
  const datasets:ChartDataset<'line'>[]=[{label:'Price',data:ordered.map(row=>row.price),borderColor:priceColor,fill:'origin',backgroundColor(context){const {ctx,chartArea}=context.chart;if(!chartArea)return `rgba(${rgb},0.12)`;const gradient=ctx.createLinearGradient(0,chartArea.top,0,chartArea.bottom);gradient.addColorStop(0,`rgba(${rgb},0.30)`);gradient.addColorStop(1,`rgba(${rgb},0.015)`);return gradient;},pointRadius:ordered.length===1?3:0,pointHoverRadius:4,datalabels:{formatter:(value:unknown)=>formatPrice(Number(value)),display:false},pointBackgroundColor:ordered.map(row=>row.outlier?'#b91c1c':priceColor)}];
  if(ordered.some(row=>Number.isFinite(row.dayHigh)&&Number.isFinite(row.dayLow)))for(const [field,label,color] of [['dayHigh','Reported day high','#8b5cf6'],['dayLow','Reported day low','#0891b2']] as const)datasets.push({label,data:ordered.map(row=>row[field] ?? null),borderColor:color,borderWidth:1,borderDash:field==='dayHigh'?[4,4]:[2,6],pointRadius:0,datalabels:{display:false},spanGaps:false});
  for(const guide of guides)datasets.push({label:guide.label,data:ordered.map(()=>guide.value),borderColor:guide.color,hidden:guide.label!=='Median',borderWidth:1,borderDash:[6,4],pointRadius:0,datalabels:{display:false}});
  return {ordered,guides,datasets,total:full.length};
}
export const MarketPriceChart=memo(function MarketPriceChart({rows,bounds,label,previousClose,formatPrice=fmtQSEPrice,currency='QAR',timezone='Asia/Qatar'}:{rows:MarketRow[];bounds:{low:number;high:number}|null;label:string;previousClose?:number;formatPrice?:(value:number)=>string;currency?:string;timezone?:string}) {
  const {ordered,guides,datasets,total}=marketChartData(rows,bounds,previousClose,formatPrice);
  if(!ordered.length)return <p className="text-muted">No price observations match this chart's date and source filters.</p>;
  const options:ChartOptions<'line'>={plugins:{tooltip:{callbacks:{label(context){const row=ordered[context.dataIndex];if(context.datasetIndex===0)return (row.source==='manual'?'Recorded':'App')+': '+formatPrice(row.price)+(row.outlier?' | Flagged':'');return context.dataset.label+': '+formatPrice(Number(context.raw));}}}},scales:{x:{grid:{display:false}},y:{title:{display:true,text:currency+' per share'}}}};
  return <div>
    <p className="text-muted market-chart-caption">{label}. Lifetime guides include reported extrema; their occurrence times are unknown. Median uses observations in this chart. Toggle lifetime guides in the legend.</p>
    <div className="market-chart-canvas"><StockLine role="img" aria-label={label+' price chart'} data={{labels:ordered.map(row=>row.time&&Number.isFinite(Date.parse(row.time))?new Date(row.time).toLocaleString('en-GB',{timeZone:timezone}):row.date+' (time unknown)'),datasets}} options={options}/></div>
    <div className="market-chart-legend" aria-label="Chart statistics">{guides.map(guide=><span key={guide.label}>{guide.label}: <strong>{formatPrice(guide.value)}</strong></span>)}<span>{total} observations{total!==ordered.length?' ? overview of '+ordered.length+' points':''}</span></div>
  </div>;
});
