import { fmtMoney } from '../lib/format';
import { SummaryGroupCard, SummaryMetric } from './SummaryGroupCard';

export interface BalanceSummary {
  start: number; current: number;
  inflow: number; outflow: number;
  pendingInflow: number; pendingOutflow: number;
  plannedInflow: number; plannedOutflow: number;
}

/** Shared Bank Account summary presentation; outflows are signed negative. */
export function BalanceSummaryCards({ currency, summary: s }: { currency: string; summary: BalanceSummary }) {
  const metric = (label: string, amount: number, large = false) => <SummaryMetric label={label} value={fmtMoney(amount, currency)} large={large} tone={amount >= 0 ? 'pill-positive' : 'pill-negative'} />;
  const flow = (title: string, inflow: number, outflow: number) => <SummaryGroupCard title={title}>
    {metric(title === 'Pending' ? 'Net pending' : title === 'Planned' ? 'Net planned' : 'Net flow', inflow + outflow, true)}{metric('Inflow', inflow)}{metric('Outflow', outflow)}
  </SummaryGroupCard>;
  const expectedFlow = s.pendingInflow + s.pendingOutflow + s.plannedInflow + s.plannedOutflow;
  const change = s.current - s.start;
  return <div className="account-summary-grid">
    <SummaryGroupCard title="Actual balance" className="account-summary-card-balance" tooltip="Cleared balance including the balance carried forward before the selected period.">
      {metric('Current balance', s.current, true)}<SummaryMetric label="Start balance" value={fmtMoney(s.start, currency)} />
      <SummaryMetric label="Change" value={fmtMoney(change, currency)} tone={change >= 0 ? 'pill-positive' : 'pill-negative'} suffix={<small className="summary-percent">{s.start === 0 ? ' —' : ` (${(change / Math.abs(s.start) * 100).toFixed(1)}%)`}</small>} />
    </SummaryGroupCard>
    <SummaryGroupCard title="Expected Final balance" tooltip="Actual balance plus unexecuted plans and pending transactions in the selected period.">
      {metric('Expected Net Balance', s.current + expectedFlow, true)}{metric('Total expected flow', expectedFlow)}
      {metric('Expected inflow', s.pendingInflow + s.plannedInflow)}{metric('Expected outflow', s.pendingOutflow + s.plannedOutflow)}
      {metric('Change', expectedFlow)}
    </SummaryGroupCard>
    {(s.pendingInflow !== 0 || s.pendingOutflow !== 0) && flow('Pending', s.pendingInflow, s.pendingOutflow)}
    {(s.plannedInflow !== 0 || s.plannedOutflow !== 0) && flow('Planned', s.plannedInflow, s.plannedOutflow)}
    {flow('Actual flow', s.inflow, s.outflow)}
  </div>;
}
