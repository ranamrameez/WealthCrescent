import { usePageTopBarRightSlot } from '../hooks/usePageTopBar';
import { PlanningPositionSummary } from './PlanningPositionSummary';
import { QuickEntitySwitch } from './QuickEntitySwitch';
import { DateValue } from './DateValue';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EntityCard } from './Card';
import { StandardCard } from './StandardCard';
import { ModuleDetailTemplate } from './ModuleDetailTemplate';
import { FinancePlanEditor } from './FinancePlanEditor';
import { EntityActions } from './EntityEditorModal';
import { PlanFinanceEditor } from './PlanFinanceEditor';
import { SummaryGroupCard, SummaryMetric } from './SummaryGroupCard';
import { usePlannedCashWorkbookStore } from '../store/plannedCashWorkbookStore';
import { usePlannedBankWorkbookStore } from '../store/plannedBankWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../store/plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../store/plannedRentalsWorkbookStore';
import { useBankWorkbookStore } from '../store/bankWorkbookStore';
import { useCreditCardWorkbookStore } from '../store/creditCardWorkbookStore';
import { useRentalsWorkbookStore } from '../store/rentalsWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../store/subscriptionsWorkbookStore';
import { useEMIWorkbookStore } from '../store/emiWorkbookStore';
import { planOccurrences } from '../lib/calc/planOccurrences';
import { planDescription, signedPlanAmount, type PlanRecord, type PlanReference } from '../lib/financePlans';
import { fmtMoney } from '../lib/format';
import type { TransactionPageFilters } from '../hooks/useUrlTransactionFilters';

/** Overview → parent plan → individual dated items, using the entity page pattern. */
export function FinancePlansHierarchy({ filters, controls, overview }: { filters: TransactionPageFilters; controls: ReactNode; overview?: ReactNode }) {
  const cash = usePlannedCashWorkbookStore(s => s.workbook.entries);
  const bank = usePlannedBankWorkbookStore(s => s.workbook.entries);
  const cards = usePlannedCreditCardWorkbookStore(s => s.workbook.entries);
  const rentals = usePlannedRentalsWorkbookStore(s => s.workbook.entries);
  const accounts = useBankWorkbookStore(s => s.workbook.settings.accounts);
  const cardAccounts = useCreditCardWorkbookStore(s => s.workbook.cards);
  const properties = useRentalsWorkbookStore(s => s.workbook.settings.properties);
  const subscriptions = useSubscriptionsWorkbookStore(s => s.workbook.entries);
  const loans = useEMIWorkbookStore(s => s.workbook.entries);
  const [params, setParams] = useSearchParams();
  const [editor, setEditor] = useState<{reference?: PlanReference; occurrenceDate?: string} | null>(null);
  const [linkOpen,setLinkOpen] = useState(false);
  const records: PlanRecord[] = [...cash.map(plan => ({module:'cash' as const, plan})), ...bank.map(plan => ({module:'bank' as const, plan})), ...cards.map(plan => ({module:'creditCard' as const, plan})), ...rentals.map(plan => ({module:'rentals' as const, plan}))];
  const groupKey = ({module, plan}: PlanRecord): string => {
    if ('sourceSubscriptionId' in plan && plan.sourceSubscriptionId) return `subscription:${plan.sourceSubscriptionId}`;
    if ('sourceEmiLoanId' in plan && plan.sourceEmiLoanId) return `emi:${plan.sourceEmiLoanId}`;
    if ('sourceLeasePropertyId' in plan && plan.sourceLeasePropertyId) return `lease:${plan.sourceLeasePropertyId}`;
    if ('seriesId' in plan && plan.seriesId) { const parent = records.find(row => row.plan.id === plan.seriesId); return parent ? groupKey(parent) : `series:${plan.seriesId}`; }
    return 'recurrence' in plan && plan.recurrence ? `series:${'planId' in plan ? plan.planId : plan.id}` : `${module}:${plan.id}`;
  };
  const grouped = new Map<string, PlanRecord[]>();
  records.forEach(row => { const key = groupKey(row); grouped.set(key, [...(grouped.get(key) ?? []), row]); });
  const title = (key: string, rows: PlanRecord[]) => key.startsWith('subscription:') ? subscriptions.find(sub => sub.id === key.slice(13))?.name ?? 'Subscription renewals'
    : key.startsWith('emi:') ? loans.find(loan => loan.id === key.slice(4))?.name ?? 'Installment plan'
    : key.startsWith('lease:') ? properties.find(property => property.id === key.slice(6))?.name ?? 'Rent plan'
    : planDescription(rows.find(row => 'recurrence' in row.plan && row.plan.recurrence)?.plan ?? rows[0].plan);
  const finance = ({plan}: PlanRecord) => {
    if ('accountId' in plan) return accounts.find(a => a.id === plan.accountId);
    if ('cardId' in plan) return cardAccounts.find(a => a.id === plan.cardId);
    if ('propertyId' in plan) return properties.find(p => p.id === plan.propertyId);
    return undefined;
  };
  const currency = (row: PlanRecord) => 'currencyCode' in row.plan ? row.plan.currencyCode : finance(row)?.currencyCode ?? '';
  const expanded = records.flatMap(row => planOccurrences([row.plan], filters.fromDate, filters.toDate, new Date(), null).map(plan => ({...row, plan})));
  const visible = expanded.filter(row => (filters.category === 'all' || row.plan.category === filters.category) && filters.source !== 'statement-import' && (filters.direction === 'all' || (filters.direction === 'in' ? signedPlanAmount(row.plan) >= 0 : signedPlanAmount(row.plan) < 0)));
  const key = params.get('plan');
  const selected = key ? grouped.get(key) : undefined;
  const rows = selected ? visible.filter(row => groupKey(row) === key) : visible;
  const navigate = (key?: string) => { setEditor(null);setLinkOpen(false);setParams(previous => { const next = new URLSearchParams(previous); key ? next.set('plan', key) : next.delete('plan'); next.delete('section'); return next; }); };
  const switching = <div className="topbar-controls"><QuickEntitySwitch label="Plan" value={key??''} options={[{value:'',label:'All plans'},...[...grouped.entries()].map(([id,group])=>({value:id,label:title(id,group)}))]} onChange={id=>navigate(id||undefined)} />{controls}</div>;
  usePageTopBarRightSlot(switching);
  const summary = <div className="account-summary-grid">{[...new Set(rows.map(currency))].map(code => {
    const scoped = rows.filter(row => currency(row) === code);
    return <SummaryGroupCard key={code} title={`${code} planned activity`}><SummaryMetric label="Expected receipts" value={fmtMoney(scoped.filter(row => !row.plan.executed && signedPlanAmount(row.plan) > 0).reduce((sum,row) => sum + signedPlanAmount(row.plan),0),code)} /><SummaryMetric label="Expected payments" value={fmtMoney(scoped.filter(row => !row.plan.executed && signedPlanAmount(row.plan) < 0).reduce((sum,row) => sum - signedPlanAmount(row.plan),0),code)} /><SummaryMetric label="Fulfilled items" value={scoped.filter(row => row.plan.executed).length} /></SummaryGroupCard>;
  })}</div>;
  const items = <div className="table-scroll"><table><thead><tr><th>Date</th><th>Item</th><th>Finance</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(row => <tr key={`${row.module}:${row.plan.id}`}><td><DateValue value={row.plan.date} /></td><td>{planDescription(row.plan)}</td><td>{finance(row)?.name ?? `Cash (${currency(row)})`}{'finance' in row.plan && row.plan.finance && <small className="text-muted"> ? {row.plan.finance.module==='bank'?accounts.find(account=>account.id===('finance' in row.plan ? row.plan.finance?.ref : undefined))?.name:'Cash'} ({row.plan.finance.currencyCode})</small>}</td><td>{fmtMoney(signedPlanAmount(row.plan),currency(row))}</td><td>{row.plan.executed ? 'Fulfilled' : 'Planned'}</td><td>{!row.plan.executed && <button className="btn secondary small" onClick={() => setEditor({ reference: {module:row.module,id:'planId' in row.plan && typeof row.plan.planId === 'string' ? row.plan.planId : row.plan.id}, occurrenceDate: 'planId' in row.plan ? row.plan.date : undefined })}>Edit item / finance</button>}</td></tr>)}</tbody></table>{!rows.length && <p className="text-muted">No plan items match this period.</p>}</div>;
  const parent = selected?.find(row => 'recurrence' in row.plan && row.plan.recurrence);
  const dialog = editor && <FinancePlanEditor {...editor} onClose={() => setEditor(null)} />;
  if (selected && key) return <ModuleDetailTemplate title={title(key,selected)} backLabel="All plans" onBack={() => navigate()} topBarRight={switching} sections={[
    {key:'summary',label:'Plan summary',content:<div className="stack-lg"><PlanningPositionSummary filters={filters} scope={selected} />{summary}</div>},
    {key:'details',label:'Plan details',actions:[{label:'Link plan to finance',onClick:()=>setLinkOpen(true)},...(parent ? [{label:'Edit plan',onClick:()=>setEditor({reference:{module:parent.module,id:parent.plan.id}})}] : [])],content:<p className="text-muted">Each item has its own date, amount, and linked finance. Edit a repeating parent to update its generated items; edit an item to override only that occurrence.</p>},
    {key:'items',label:'Plan items',defaultOpen:true,content:items},
  ]}>{dialog}{linkOpen && <PlanFinanceEditor records={selected} onClose={()=>setLinkOpen(false)} />}<EntityActions actions={[{label:'Add plan',onClick:()=>setEditor({})},{label:'Link plan to finance',onClick:()=>setLinkOpen(true)}]} /></ModuleDetailTemplate>;
  return <>
    <EntityActions actions={[{label:'Add plan',onClick:()=>setEditor({})}]} />
    <StandardCard title="Plan summary"><div className="stack-lg"><PlanningPositionSummary filters={filters} />{summary}</div></StandardCard>
    <StandardCard title="Plans" className="mt-md"><div className="entity-card-grid">{[...grouped.entries()].map(([key,group]) => <EntityCard key={key} title={title(key,group)} subtitle={key.startsWith('series:') ? 'Recurring plan' : group.length > 1 ? `${group.length} items` : 'One-off plan'} onClick={()=>navigate(key)} />)}</div>{!grouped.size && <p className="text-muted">No plans yet. Use Add plan to create one.</p>}</StandardCard>
    {overview}
    <StandardCard title="All plan items" className="mt-md" defaultOpen={false}>{items}</StandardCard>
    {dialog}
  </>;
}
