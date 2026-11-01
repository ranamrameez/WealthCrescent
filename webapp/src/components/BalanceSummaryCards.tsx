import type { ReactNode } from 'react';
import { fmtMoney } from '../lib/format';
import { SummarySection, SummarySections, SummaryValue } from './SummaryGroupCard';

export interface BalanceSummary {
  start: number; current: number;
  inflow: number; outflow: number;
  pendingInflow: number; pendingOutflow: number;
  plannedInflow: number; plannedOutflow: number;
}

export type SummaryKind = 'balance' | 'creditCard' | 'rentals' | 'investments' | 'loans' | 'emi' | 'subscriptions';
const summaryLabels: Record<SummaryKind, { actual: string; current: string; start: string; expected: string; net: string; inflow: string; outflow: string; actualFlow: string }> = {
  creditCard: { actual:'Outstanding card debt',current:'Current debt',start:'Opening debt',expected:'Expected card debt',net:'Debt after plans',inflow:'Expected charges',outflow:'Expected payments',actualFlow:'Charges & payments' },
  balance: { actual: 'Actual balance', current: 'Current balance', start: 'Start balance', expected: 'Expected Final balance', net: 'Expected Net Balance', inflow: 'Expected inflow', outflow: 'Expected outflow', actualFlow: 'Actual flow' },
  rentals: { actual: 'Rental income', current: 'Net rental income to date', start: 'Net income before period', expected: 'Expected rent income', net: 'Expected net rental income', inflow: 'Expected rent receipts', outflow: 'Expected property expenses', actualFlow: 'Rent received & expenses' },
  investments: { actual: 'Holdings value', current: 'Current holdings value', start: 'Opening holdings value', expected: 'Projected holdings value', net: 'Projected holdings value', inflow: 'Planned investments', outflow: 'Planned withdrawals', actualFlow: 'Investments & withdrawals' },
  loans: { actual: 'Outstanding loans', current: 'Outstanding amount', start: 'Opening outstanding amount', expected: 'Expected outstanding loans', net: 'Expected outstanding amount', inflow: 'Expected repayments received', outflow: 'Expected repayments paid', actualFlow: 'Repayments' },
  emi: { actual: 'Outstanding debt', current: 'Debt remaining', start: 'Opening debt', expected: 'Expected remaining debt', net: 'Debt after planned installments', inflow: 'Expected adjustments', outflow: 'Scheduled installments', actualFlow: 'Installments paid' },
  subscriptions: { actual: 'Subscription spending', current: 'Net renewal spending to date', start: 'Spending before period', expected: 'Expected subscription spending', net: 'Net spending including renewals', inflow: 'Expected refunds', outflow: 'Expected renewal costs', actualFlow: 'Renewals paid' },
};

/** Shared Portfolio Item-style summary presentation. Outflows are signed negative;
 * every entity keeps its own meaningful groups, but the light-border inline
 * subsection layout stays consistent across the app. */
export function BalanceSummaryCards({ currency, summary: s, kind = 'balance' }: { currency: string; summary: BalanceSummary; kind?: SummaryKind }) {
  const labels = summaryLabels[kind];
  const metric = (label: string, amount: number, primary = false, detail?: ReactNode) => (
    <SummaryValue
      label={label}
      value={fmtMoney(amount, currency)}
      primary={primary}
      detail={detail}
      tone={(kind === 'creditCard' ? amount <= 0 : amount >= 0) ? 'positive' : 'negative'}
    />
  );
  const flow = (title: string, inflow: number, outflow: number) => (
    <SummarySection title={title}>
      {metric(title === 'Pending' ? 'Net pending' : title === 'Planned' ? 'Net planned' : 'Net flow', inflow + outflow, true)}
      {metric('Inflow', inflow)}
      {metric('Outflow', outflow)}
    </SummarySection>
  );
  const expectedFlow = s.pendingInflow + s.pendingOutflow + s.plannedInflow + s.plannedOutflow;
  const change = s.current - s.start;
  return <SummarySections className="account-summary-sections">
    <SummarySection title={labels.actual}>
      {metric(labels.current, s.current, true, 'Current position')}
      {metric(labels.start, s.start, false, 'At the start of the selected period')}
      <SummaryValue label="Change" value={fmtMoney(change, currency)} tone={(kind === 'creditCard' ? change <= 0 : change >= 0) ? 'positive' : 'negative'} detail={s.start === 0 ? '—' : `${(change / Math.abs(s.start) * 100).toFixed(1)}% change`} />
    </SummarySection>
    <SummarySection title={labels.expected}>
      {metric(labels.net, s.current + expectedFlow, true, 'Actual position plus pending and planned activity')}
      {metric('Total expected flow', expectedFlow)}
      {metric(labels.inflow, s.pendingInflow + s.plannedInflow)}
      {metric(labels.outflow, s.pendingOutflow + s.plannedOutflow)}
      {metric('Change', expectedFlow)}
    </SummarySection>
    {(s.pendingInflow !== 0 || s.pendingOutflow !== 0) && flow('Pending', s.pendingInflow, s.pendingOutflow)}
    {(s.plannedInflow !== 0 || s.plannedOutflow !== 0) && flow('Planned', s.plannedInflow, s.plannedOutflow)}
    {flow(labels.actualFlow, s.inflow, s.outflow)}
  </SummarySections>;
}
