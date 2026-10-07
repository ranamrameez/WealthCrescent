import { SummaryGroupCard, SummaryMetric } from './SummaryGroupCard';
import { TickerLogo } from './TickerLogo';
import { fmt, fmtMoney, fmtPSXPrice, fmtQSEPrice } from '../lib/format';
import type { TradePlanTickerSummary } from '../lib/calc/tradePlanAnalysis';

/** Presentation only: the same execution analysis used by the trade-leg table. */
export function PlanExecutionSummary({ analysis, exchange, currency, compact = false }: {
  analysis: TradePlanTickerSummary[]; exchange: 'psx' | 'qse'; currency: string; compact?: boolean;
}) {
  const price = exchange === 'psx' ? fmtPSXPrice : fmtQSEPrice;
  const trades = (bought: number, sold: number) => [bought > 0 ? `+${fmt(bought, 0)} buy` : '', sold > 0 ? `-${fmt(sold, 0)} sell` : ''].filter(Boolean).join(' · ') || '—';
  if (compact) return <div className="plan-execution-split">
    {analysis.map(summary => <div className="plan-execution-columns" key={summary.ticker}>
      <div>
        <div className="label">Still planned</div>
        <div className="sub">{trades(summary.plannedBought, summary.plannedSold)}</div>
        <div className={`sub ${summary.realizedPL >= 0 ? 'pill-positive' : 'pill-negative'}`}>Planned P/L {summary.plannedSold > 0 ? fmtMoney(summary.realizedPL, currency) : '—'}</div>
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
      <SummaryMetric label="Planned P/L (from pending sells)" value={summary.plannedSold > 0 ? fmtMoney(summary.realizedPL, currency) : '—'} tone={summary.plannedSold > 0 ? summary.realizedPL >= 0 ? 'pill-positive' : 'pill-negative' : 'pill-info'} />
    </SummaryGroupCard>)}
  </div>;
}
