import { fmtMoney } from '../lib/format';
import { SummarySection, SummarySections, SummaryValue } from './SummaryGroupCard';
import { CalendarIcon } from './icons';
export interface MonthlyStatCard { month: string; netWorth: number | null; income: number; expense: number; netFlow: number; }
/** Read-only monthly view model. Dates, amounts and totals come from the engine. */
export function MonthlyStatsWidget({ currency, rows, primary = 'netWorth', population = 'actual' }: { currency: string; rows: MonthlyStatCard[]; primary?: 'netWorth' | 'movement'; population?: 'actual' | 'pending' | 'planned' }) {
  const label = population === 'actual' ? 'Actual' : population === 'pending' ? 'Pending' : 'Planned';
  return <SummarySections className="monthly-stats-widget">{rows.map(row => <SummarySection key={row.month} title={<span className="standard-section-title"><CalendarIcon />{row.month} · {currency}</span>}>
    {primary === 'netWorth' ? <SummaryValue primary label="Net worth snapshot" value={row.netWorth === null ? 'Unavailable' : fmtMoney(row.netWorth, currency)} /> : <SummaryValue primary label={'Net ' + label.toLowerCase() + ' movement'} value={fmtMoney(row.netFlow, currency)} />}
    <SummaryValue label={label + ' inflow'} value={fmtMoney(row.income, currency)} tone="positive" />
    <SummaryValue label={label + ' outflow'} value={fmtMoney(row.expense, currency)} tone="negative" />
    {primary === 'netWorth' && <SummaryValue label={"Net " + label.toLowerCase() + " movement"} value={fmtMoney(row.netFlow, currency)} />}
  </SummarySection>)}</SummarySections>;
}
