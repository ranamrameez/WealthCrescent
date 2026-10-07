import { SummaryGroupCard, SummaryMetric } from './SummaryGroupCard';
import { TickerLogo } from './TickerLogo';
import { fmt, fmtMoney, fmtPSXPrice, fmtQSEPrice } from '../lib/format';
import type { TradePlanTickerSummary } from '../lib/calc/tradePlanAnalysis';
import { projectedPlanPL } from '../lib/calc/tradePlanAnalysis';
import type { FeeCalculator } from '../types/workbook';

/** Presentation only: the same execution analysis used by the trade-leg table. */
export function PlanExecutionSummary({ analysis, exchange, currency, compact = false, calcFee, marketPrices = {}, realizedByTicker = {} }: {
  analysis: TradePlanTickerSummary[]; exchange: 'psx' | 'qse'; currency: string; compact?: boolean;
  calcFee?: FeeCalculator; marketPrices?: Record<string, number>; realizedByTicker?: Record<string, number>;
}) {
  const price = exchange === 'psx' ? fmtPSXPrice : fmtQSEPrice;
  const projectedPL = (summary: TradePlanTickerSummary) => calcFee ? projectedPlanPL(summary, marketPrices[summary.ticker] ?? 0, realizedByTicker[summary.ticker] ?? 0, calcFee) : summary.realizedPL;
  const trades = (bought: number, sold: number) => [bought > 0 ? `Buy ${fmt(bought, 0)}` : '', sold > 0 ? `Sell ${fmt(sold, 0)}` : ''].filter(Boolean).join(' · ') || '0';
  if (compact) return <div className="plan-execution-split">
    {analysis.map(summary => <div className="plan-execution-columns" key={summary.ticker}>
      <div>
        <div className="label">Still planned</div>
        <div className="sub">{trades(summary.plannedBought, summary.plannedSold)}</div>
        <div className="sub" title="Actual realized P/L plus pending sell P/L and the remaining blended holding valued at current price, after estimated fees. Remaining holdings require a known current price.">Projected P/L <span className={`pill ${projectedPL(summary) >= 0 ? 'pill-positive' : 'pill-negative'}`}>{fmtMoney(projectedPL(summary), currency)}</span></div>
      </div>
      <div>
        <div className="label">Already executed</div>
        <div className="sub">{trades(summary.executedBought, summary.executedSold)}</div>
      </div>
    </div>)}
  </div>;
  return <div className="mb-sm">
    {analysis.map(summary => <SummaryGroupCard key={summary.ticker}
      title={<><TickerLogo ticker={summary.ticker} exchange={exchange} size="sm" /> {summary.ticker} · Plan execution summary</>}
      tooltip="Average cost includes current holdings and pending buys. Executed legs already belong to transaction history and are not counted again."
    >
      <SummaryMetric label="Already executed" value={trades(summary.executedBought, summary.executedSold)} />
      <SummaryMetric label="Still planned" value={trades(summary.plannedBought, summary.plannedSold)} />
      <SummaryMetric label="Avg cost" value={summary.avgCost > 0 ? price(summary.avgCost) : '—'} />
      <SummaryMetric label="Break-even" value={summary.breakEven > 0 ? price(summary.breakEven) : '—'} />
      <SummaryMetric label="Shares after plan" value={fmt(summary.effectiveShares, 0)} />
      <SummaryMetric label={calcFee ? "Projected P/L" : "Planned P/L (from pending sells)"} value={fmtMoney(projectedPL(summary), currency)} tone={summary.plannedSold > 0 ? summary.realizedPL >= 0 ? 'pill-positive' : 'pill-negative' : 'pill-info'} />
    </SummaryGroupCard>)}
  </div>;
}
