import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RecordRow } from './RecordRow';
import { useDateTableSort } from '../hooks/useDateTableSort';
import { usePageTopBarRightSlot } from '../hooks/usePageTopBar';
import { PlanningPositionSummary } from './PlanningPositionSummary';
import { QuickEntitySwitch } from './QuickEntitySwitch';
import { DateValue } from './DateValue';
import { EntityCard } from './Card';
import { StandardCard } from './StandardCard';
import { ModuleDetailTemplate } from './ModuleDetailTemplate';
import { FinancePlanEditor } from './FinancePlanEditor';
import { FinancePlanGroupEditor } from './FinancePlanGroupEditor';
import { EntityActions } from './EntityEditorModal';
import { PlanFinanceEditor } from './PlanFinanceEditor';
import { SummaryGroupCard, SummaryMetric } from './SummaryGroupCard';
import { StandardButton } from './standard';
import { Pagination } from './Pagination';
import { confirmDialog } from './ConfirmDialog';
import { toast } from './Toast';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
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
import { groupFinancePlans } from '../lib/financePlanHierarchy';
import { deletePlanGroup, deletePlanPayment, hasFulfilledPayments, planDescription, signedPlanAmount, type PlanRecord, type PlanReference } from '../lib/financePlans';
import { fmtMoney } from '../lib/format';
import type { FinancePlanGroup } from '../types/financePlanGroup';
import type { TransactionPageFilters } from '../hooks/useUrlTransactionFilters';

const EMPTY_GROUPS: FinancePlanGroup[] = [];

/** Named plans own many payments; legacy recurring/module-generated plans remain available. */
export function FinancePlansHierarchy({ filters, controls, overview }: { filters: TransactionPageFilters; controls: ReactNode; overview?: ReactNode }) {
  const dateSort = useDateTableSort();
  const ensureSignedIn = useEnsureSignedIn();
  const cash = usePlannedCashWorkbookStore(s => s.workbook.entries);
  const groups = usePlannedCashWorkbookStore(s => s.workbook.planGroups ?? EMPTY_GROUPS);
  const bank = usePlannedBankWorkbookStore(s => s.workbook.entries);
  const cards = usePlannedCreditCardWorkbookStore(s => s.workbook.entries);
  const rentals = usePlannedRentalsWorkbookStore(s => s.workbook.entries);
  const accounts = useBankWorkbookStore(s => s.workbook.settings.accounts);
  const cardAccounts = useCreditCardWorkbookStore(s => s.workbook.cards);
  const properties = useRentalsWorkbookStore(s => s.workbook.settings.properties);
  const subscriptions = useSubscriptionsWorkbookStore(s => s.workbook.entries);
  const loans = useEMIWorkbookStore(s => s.workbook.entries);
  const [params, setParams] = useSearchParams();
  const [editor, setEditor] = useState<{ reference?: PlanReference; occurrenceDate?: string; initialGroupId?: string } | null>(null);
  const [groupEditor, setGroupEditor] = useState<{ original?: FinancePlanGroup } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [page, setPage] = useState(0);
  const records: PlanRecord[] = useMemo(() => [...cash.map(plan => ({ module: 'cash' as const, plan })), ...bank.map(plan => ({ module: 'bank' as const, plan })), ...cards.map(plan => ({ module: 'creditCard' as const, plan })), ...rentals.map(plan => ({ module: 'rentals' as const, plan }))], [cash, bank, cards, rentals]);
  const { grouped, keyFor } = useMemo(() => groupFinancePlans(records, groups), [records, groups]);
  const title = (key: string, rows: PlanRecord[]) => groups.find(group => key === 'group:' + group.id)?.name
    ?? (key.startsWith('subscription:') ? subscriptions.find(sub => sub.id === key.slice(13))?.name ?? 'Subscription renewals'
      : key.startsWith('emi:') ? loans.find(loan => loan.id === key.slice(4))?.name ?? 'Installment plan'
      : key.startsWith('lease:') ? properties.find(property => property.id === key.slice(6))?.name ?? 'Rent plan'
      : rows.length ? planDescription(rows.find(row => 'recurrence' in row.plan && row.plan.recurrence)?.plan ?? rows[0].plan) : 'Plan');
  const finance = ({ plan }: PlanRecord) => 'accountId' in plan ? accounts.find(a => a.id === plan.accountId) : 'cardId' in plan ? cardAccounts.find(a => a.id === plan.cardId) : 'propertyId' in plan ? properties.find(p => p.id === plan.propertyId) : undefined;
  const currency = (row: PlanRecord) => 'currencyCode' in row.plan ? row.plan.currencyCode : finance(row)?.currencyCode ?? '';
  const expanded = useMemo(() => [
    ...planOccurrences(cash, filters.fromDate, filters.toDate, new Date(), null).map(plan => ({ module: 'cash' as const, plan })),
    ...planOccurrences(bank, filters.fromDate, filters.toDate, new Date(), null).map(plan => ({ module: 'bank' as const, plan })),
    ...planOccurrences(cards, filters.fromDate, filters.toDate, new Date(), null).map(plan => ({ module: 'creditCard' as const, plan })),
    ...planOccurrences(rentals, filters.fromDate, filters.toDate, new Date(), null).map(plan => ({ module: 'rentals' as const, plan })),
  ], [cash, bank, cards, rentals, filters.fromDate, filters.toDate]);
  const visible = expanded.filter(row => (filters.category === 'all' || row.plan.category === filters.category) && filters.source !== 'statement-import' && (filters.direction === 'all' || (filters.direction === 'in' ? signedPlanAmount(row.plan) >= 0 : signedPlanAmount(row.plan) < 0)));
  const key = params.get('plan'), selected = key ? grouped.get(key) : undefined;
  const selectedGroup = groups.find(group => key === 'group:' + group.id);
  const rows = selected ? visible.filter(row => keyFor(row) === key) : visible;
  const navigate = (nextKey?: string) => {
    setEditor(null); setGroupEditor(null); setLinkOpen(false); setPage(0);
    setParams(previous => { const next = new URLSearchParams(previous); if (nextKey) next.set('plan', nextKey); else next.delete('plan'); next.delete('section'); return next; });
  };
  const switching = <div className="topbar-controls"><QuickEntitySwitch label="Plan" value={key ?? ''} options={[{ value: '', label: 'All plans' }, ...[...grouped.entries()].map(([id, group]) => ({ value: id, label: title(id, group) }))]} onChange={id => navigate(id || undefined)}/>{controls}</div>;
  usePageTopBarRightSlot(switching);
  const summary = <div className="account-summary-grid">{[...new Set(rows.map(currency))].map(code => {
    const scoped = rows.filter(row => currency(row) === code);
    return <SummaryGroupCard key={code} title={`${code} planned activity`}><SummaryMetric label="Expected receipts" value={fmtMoney(scoped.filter(row => !row.plan.executed && signedPlanAmount(row.plan) > 0).reduce((sum, row) => sum + signedPlanAmount(row.plan), 0), code)}/><SummaryMetric label="Expected payments" value={fmtMoney(scoped.filter(row => !row.plan.executed && signedPlanAmount(row.plan) < 0).reduce((sum, row) => sum - signedPlanAmount(row.plan), 0), code)}/><SummaryMetric label="Fulfilled items" value={scoped.filter(row => row.plan.executed).length}/></SummaryGroupCard>;
  })}</div>;
  const referenceFor = (row: PlanRecord): PlanReference => ({ module: row.module, id: 'planId' in row.plan && typeof row.plan.planId === 'string' ? row.plan.planId : row.plan.id });
  const occurrenceDate = (row: PlanRecord) => 'planId' in row.plan ? row.plan.date : undefined;
  const edit = (row: PlanRecord) => setEditor({ reference: referenceFor(row), occurrenceDate: occurrenceDate(row) });
  const removePayment = async (row: PlanRecord) => {
    if (!await ensureSignedIn('Sign in to delete this payment.')) return;
    if (!await confirmDialog('Delete this planned payment? This will not delete an actual transaction.')) return;
    try { deletePlanPayment(referenceFor(row), occurrenceDate(row)); toast('Planned payment deleted.'); }
    catch (error) { toast(error instanceof Error ? error.message : String(error)); }
  };
  const sorted = dateSort.rows(rows, { date: row => row.plan });
  const pageCount = Math.max(1, Math.ceil(sorted.length / 50)), safePage = Math.min(page, pageCount - 1);
  const items = <><div className="table-scroll"><table><thead><tr><dateSort.Th rows={rows} column="date">Date</dateSort.Th><th>Item</th><th>Finance</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{sorted.slice(safePage * 50, (safePage + 1) * 50).map(row => <RecordRow onEdit={!row.plan.executed ? () => edit(row) : undefined} record={row} key={`${row.module}:${row.plan.id}`}><td><DateValue value={row.plan.date}/></td><td>{planDescription(row.plan)}</td><td>{finance(row)?.name ?? `Cash (${currency(row)})`}</td><td>{fmtMoney(signedPlanAmount(row.plan), currency(row))}</td><td>{row.plan.executed ? 'Fulfilled' : 'Planned'}</td><td>{!row.plan.executed && <div className="row gap-sm"><StandardButton tone="secondary" size="small" onClick={() => edit(row)}>Edit item / finance</StandardButton><StandardButton tone="danger" size="small" onClick={() => void removePayment(row)}>Delete payment</StandardButton></div>}</td></RecordRow>)}</tbody></table>{!rows.length && <p className="text-muted">{selected?.length ? 'No payments match this period. Change the date filters to see other payments.' : 'No payments yet. Add the first payment to this plan.'}</p>}</div><Pagination page={safePage} pageCount={pageCount} total={rows.length} onChange={setPage}/></>;
  const removeGroup = async () => {
    if (!selectedGroup || !await ensureSignedIn('Sign in to delete this plan.')) return;
    if (!await confirmDialog('Delete this plan and all its unfulfilled planned payments? Actual transactions will be kept.')) return;
    try { deletePlanGroup(selectedGroup.id, selectedGroup); toast('Plan deleted.'); navigate(); }
    catch (error) { toast(error instanceof Error ? error.message : String(error)); }
  };
  const dialogs = <>{editor && <FinancePlanEditor {...editor} onClose={() => setEditor(null)}/>} {groupEditor && <FinancePlanGroupEditor {...groupEditor} onClose={() => setGroupEditor(null)} onSaved={id => navigate('group:' + id)}/>}</>;
  if (selected && key) {
    const parent = selected.find(row => 'recurrence' in row.plan && row.plan.recurrence);
    const cannotDelete = selected.some(row => hasFulfilledPayments(row.plan));
    const details = <><div className="row gap-sm">{selectedGroup && <><StandardButton onClick={() => setEditor({ initialGroupId: selectedGroup.id })}>Add payment</StandardButton><StandardButton tone="secondary" onClick={() => setGroupEditor({ original: selectedGroup })}>Edit plan</StandardButton><StandardButton tone="danger" disabled={cannotDelete} onClick={() => void removeGroup()}>Delete plan</StandardButton></>}{parent && !selectedGroup && <StandardButton tone="secondary" onClick={() => setEditor({ reference: { module: parent.module, id: parent.plan.id } })}>Edit plan</StandardButton>}</div>{selectedGroup?.notes && <p>{selectedGroup.notes}</p>}{cannotDelete && selectedGroup && <p className="text-muted">This plan contains fulfilled payments. Its history is retained; you can delete individual future payments.</p>}<p className="text-muted">Each payment has its own date, amount and finance. Totals follow the selected period and stay separate by currency.</p></>;
    return <ModuleDetailTemplate title={title(key, selected)} backLabel="All plans" onBack={() => navigate()} topBarRight={switching} sections={[
      { key: 'details', label: 'Plan details', defaultOpen: true, actions: [{ label: 'Link plan to finance', disabled: !selected.length, onClick: () => setLinkOpen(true) }], content: details },
      { key: 'items', label: 'Payments', defaultOpen: true, content: items },
      { key: 'summary', label: 'Plan summary', defaultOpen: false, content: <div className="stack-lg"><PlanningPositionSummary filters={filters} scope={selected}/>{summary}</div> },
    ]}>{dialogs}{linkOpen && <PlanFinanceEditor records={selected} onClose={() => setLinkOpen(false)}/>}<EntityActions actions={[{ label: 'Add plan', onClick: () => setGroupEditor({}) }, ...(selectedGroup ? [{ label: 'Add payment', onClick: () => setEditor({ initialGroupId: selectedGroup.id }) }] : [])]}/></ModuleDetailTemplate>;
  }
  return <>
    <EntityActions actions={[{ label: 'Add plan', onClick: () => setGroupEditor({}) }]}/>
    <StandardCard title="Plans" headerEnd={<StandardButton size="small" onClick={() => setGroupEditor({})}>Create plan</StandardButton>}><div className="entity-card-grid">{[...grouped.entries()].map(([id, group]) => <EntityCard key={id} title={title(id, group)} subtitle={id.startsWith('group:') ? `${group.length} payments` : id.startsWith('series:') ? 'Recurring plan' : group.length > 1 ? `${group.length} items` : 'One-off plan'} onClick={() => navigate(id)}/>)}</div>{!grouped.size && <p className="text-muted">Create a plan, then add its payments with individual dates and amounts.</p>}</StandardCard>
    <StandardCard title="Plan summary" defaultOpen={false}><div className="stack-lg"><PlanningPositionSummary filters={filters}/>{summary}</div></StandardCard>
    {overview}
    <StandardCard title="All plan items" defaultOpen={false}>{items}</StandardCard>
    {dialogs}
  </>;
}
