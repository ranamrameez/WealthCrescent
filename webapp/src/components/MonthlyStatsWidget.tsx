import { fmtMoney } from '../lib/format';
import { SummarySection, SummarySections, SummaryValue } from './SummaryGroupCard';
import { CalendarIcon } from './icons';
export interface MonthlyStatCard { month: string; netWorth: number | null; income: number; expense: number; netFlow: number; }
/** Read-only monthly view model. Dates, amounts and totals come from the engine. */
export function MonthlyStatsWidget({ currency, rows }: { currency: string; rows: MonthlyStatCard[] }) {
  return <SummarySections className="monthly-stats-widget">{rows.map(row => <SummarySection key={row.month} title={<span className="standard-section-title"><CalendarIcon />{row.month} · {currency}</span>}>
    <SummaryValue primary label="Net worth snapshot" value={row.netWorth === null ? 'Unavailable' : fmtMoney(row.netWorth, currency)} />
    <SummaryValue label="Activity inflow incl. plans" value={fmtMoney(row.income, currency)} tone="positive" />
    <SummaryValue label="Activity outflow incl. plans" value={fmtMoney(row.expense, currency)} tone="negative" />
    <SummaryValue label="Net activity incl. plans" value={fmtMoney(row.netFlow, currency)} />
  </SummarySection>)}</SummarySections>;
}
