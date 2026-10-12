import { memo } from 'react';
import type { ChartDataset,ChartOptions,Plugin } from 'chart.js';
import { StockLine } from '../../../components/StockCharts';
import { fmtQSEPrice } from '../../../lib/format';
import { priceMedian,type MarketRow } from '../../../lib/stockData/marketPageModel';
export function marketChartData(rows:MarketRow[],bounds:{low:number;high:number}|null) {
  const full=[...rows].reverse(),median=priceMedian(full);
  // Preserve real extrema while keeping large lifetime charts responsive.
  const ordered=full.length<=2000?full:full.flatMap((_row,index)=>{
    const size=Math.ceil(full.length/500);if(index%size)return [];
    const bucket=full.slice(index,index+size);
    const min=bucket.reduce((a,b)=>a.price<b.price?a:b),max=bucket.reduce((a,b)=>a.price>b.price?a:b);
    const picked=new Set([bucket[0],min,max,bucket.at(-1)!]);return bucket.filter(row=>picked.has(row));
  });
  const guides=[...(bounds?[{label:'Lifetime low',value:bounds.low,color:'#15803d'},{label:'Lifetime high',value:bounds.high,color:'#dc2626'}]:[]),...(median===null?[]:[{label:'Median',value:median,color:'#a16207'}])];
  const datasets:ChartDataset<'line'>[]=[{label:'Price',data:ordered.map(row=>row.price),borderColor:'#2563eb',pointRadius:ordered.length<100?3:0,datalabels:{formatter:(value:unknown)=>fmtQSEPrice(Number(value))},pointBackgroundColor:ordered.map(row=>row.outlier?'#b91c1c':row.source==='manual'?'#7c3aed':'#2563eb')}];
  if(ordered.some(row=>Number.isFinite(row.dayHigh)&&Number.isFinite(row.dayLow)))for(const [field,label,color] of [['dayHigh','Reported day high','#0f766e'],['dayLow','Reported day low','#0f766e']] as const)datasets.push({label,data:ordered.map(row=>row[field] ?? null),borderColor:color,borderDash:[2,4],pointRadius:0,datalabels:{display:false},spanGaps:false});
  for(const guide of guides)datasets.push({label:guide.label,data:ordered.map(()=>guide.value),borderColor:guide.color,borderDash:[6,4],pointRadius:0,datalabels:{display:false}});
  return {ordered,guides,datasets,total:full.length};
}
export const MarketPriceChart=memo(function MarketPriceChart({rows,bounds,label}:{rows:MarketRow[];bounds:{low:number;high:number}|null;label:string}) {
  const {ordered,guides,datasets,total}=marketChartData(rows,bounds);
  if(!ordered.length)return <p className="text-muted">No price observations match this chart's date and source filters.</p>;
  const lines:Plugin<'line'>={id:'market-reference-lines',afterDatasetsDraw(chart){const {ctx,chartArea,scales}=chart;ctx.save();for(const guide of guides){const y=scales.y.getPixelForValue(guide.value);ctx.strokeStyle=guide.color;ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(chartArea.left,y);ctx.lineTo(chartArea.right,y);ctx.stroke();}ctx.restore();}};
  const options:ChartOptions<'line'>={plugins:{tooltip:{callbacks:{label(context){const row=ordered[context.dataIndex];if(context.datasetIndex===0)return (row.source==='manual'?'Manual':'App')+': '+fmtQSEPrice(row.price)+(row.outlier?' | Flagged':'');return context.dataset.label+': '+fmtQSEPrice(Number(context.raw));}}}},scales:{y:{title:{display:true,text:'QAR per share'}}}};
  return <div>
    <p className="text-muted market-chart-caption">{label}. Lifetime guides include reported extrema; their occurrence times are unknown. Median uses observations in this chart.</p>
    <div className="market-chart-canvas"><StockLine role="img" aria-label={label+' price chart'} data={{labels:ordered.map(row=>row.time&&Number.isFinite(Date.parse(row.time))?new Date(row.time).toLocaleString('en-GB',{timeZone:'Asia/Qatar'}):row.date+' (time unknown)'),datasets}} options={options} plugins={[lines]}/></div>
    <div className="market-chart-legend" aria-label="Chart statistics">{guides.map(guide=><span key={guide.label}>{guide.label}: <strong>{fmtQSEPrice(guide.value)}</strong></span>)}<span>{total} observations{total!==ordered.length?' ? overview of '+ordered.length+' points':''}</span></div>
  </div>;
});
