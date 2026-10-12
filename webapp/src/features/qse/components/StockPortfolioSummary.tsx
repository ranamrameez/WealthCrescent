import { SummaryGroupCard, SummaryMetric } from '../../../components/SummaryGroupCard';
import { getMarketPrice } from '../../../lib/calc';
import { fmt, fmtMoney } from '../../../lib/format';
import { useQSEDerived } from '../hooks/useQSEDerived';
import { HUES } from '../../../lib/statCardHues';
import { PositionDetail } from './PositionDetail';
export function StockPortfolioSummary({ticker}: {ticker:string}) {
  const {workbook,positions,calcFee} = useQSEDerived();
  const position = positions.find(item => item.ticker === ticker);
  const shares = position?.shares ?? 0, invested = position?.invested ?? 0;
  const price = getMarketPrice(ticker,workbook.marketPrices,workbook.transactions);
  const value = shares * price;
  const unrealized = shares > 0 && price <= 0 ? NaN : value - (shares > 0 ? calcFee(value,false) : 0) - invested;
  const realized = position?.realized ?? 0;
  const pending = workbook.transactions.filter(tx => tx.ticker === ticker && tx.isPending);
  const planned = workbook.tradePlans.flatMap(plan => plan.legs).filter(leg => leg.ticker === ticker && !leg.executed);
  const legs = [...pending,...planned];
  const buyCost = legs.filter(leg => leg.action === 'BUY').reduce((sum,leg) => sum + leg.shares * leg.price + calcFee(leg.shares * leg.price,true),0);
  const sellProceeds = legs.filter(leg => leg.action === 'SELL').reduce((sum,leg) => sum + leg.shares * leg.price - calcFee(leg.shares * leg.price,false),0);
  const metric = (label:string,amount:number) => <SummaryMetric label={label} value={Number.isFinite(amount) ? fmtMoney(amount,workbook.settings.currency) : 'Price needed'} tone={label.includes('P/L') ? (amount >= 0 ? 'text-profit' : 'text-loss') : 'stock-summary-value'} />;
  return <div className="account-summary-grid stock-portfolio-summary">
    <div><SummaryGroupCard title="Current valuation" hue={HUES[3]}>{metric('Net liquidation value after sell fees',shares > 0 && price <= 0 ? NaN : value - (shares > 0 ? calcFee(value,false) : 0))}{metric('Estimated exit fees',shares > 0 && price <= 0 ? NaN : shares > 0 ? calcFee(value,false) : 0)}</SummaryGroupCard><PositionDetail ticker={ticker} section="current" /></div>
    <div><SummaryGroupCard title="Planned activity" hue={HUES[6]}><SummaryMetric tone="stock-summary-value" label="Pending orders / planned trades" value={pending.length + ' / ' + planned.length} />{metric('Buy cost including fees',buyCost)}{metric('Net sell proceeds',sellProceeds)}{metric('Cash required',buyCost-sellProceeds)}<SummaryMetric tone="stock-summary-value" label="Shares after orders and plans" value={fmt(shares+legs.reduce((sum,leg)=>sum+(leg.action==='BUY'?leg.shares:-leg.shares),0),0)} /></SummaryGroupCard></div>
    <div><SummaryGroupCard title="Lifetime performance" hue={HUES[2]}>{metric('Total P/L',realized+unrealized)}</SummaryGroupCard><PositionDetail ticker={ticker} section="all-time" /></div>
  </div>;
}
