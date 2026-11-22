import { useState, type ReactNode } from 'react';
import { AppChart as Chart, AppDoughnut as Doughnut } from './AppCharts';
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
import { ChartCard } from '../features/qse/components/ChartCard';
import { HUES } from '../lib/statCardHues';
import { StandardButton } from './standard';
import { Pagination } from './Pagination';
import { confirmDialog } from './ConfirmDialog';
import { toast } from './Toast';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { usePlanningHierarchy } from '../hooks/usePlanning';
import { deletePlanningGroup as deletePlanGroup, deletePlannedPayment as deletePlanPayment, type PlanReference } from '../services/finance/planningService';
import { fmtMoney } from '../lib/format';
import type { FinancePlanGroup } from '../types/financePlanGroup';
import type { TransactionPageFilters } from '../hooks/useUrlTransactionFilters';

/** Named plans own many payments; legacy recurring/module-generated plans remain available. */
export function FinancePlansHierarchy({ filters, controls, overview, embedded = false }: { filters: TransactionPageFilters; controls: ReactNode; overview?: ReactNode; embedded?: boolean }) {
  const dateSort = useDateTableSort();
  const ensureSignedIn = useEnsureSignedIn();
  const [params, setParams] = useSearchParams();
  const [editor, setEditor] = useState<{ reference?: PlanReference; occurrenceDate?: string; initialGroupId?: string } | null>(null);
  const [groupEditor, setGroupEditor] = useState<{ original?: FinancePlanGroup } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [page, setPage] = useState(0);
  const key = params.get('plan');
  const { grouped, selected, selectedGroup, rows, title, summaries, analytics, parent, cannotDelete } = usePlanningHierarchy(filters, key);
  const navigate = (nextKey?: string) => {
    setEditor(null); setGroupEditor(null); setLinkOpen(false); setPage(0);
    setParams(previous => { const next = new URLSearchParams(previous); if (nextKey) next.set('plan', nextKey); else next.delete('plan'); next.delete('section'); return next; });
  };
  const switching = <div className="topbar-controls"><QuickEntitySwitch label="Plan" value={key ?? ''} options={[{ value: '', label: 'All plans' }, ...[...grouped.entries()].map(([id, group]) => ({ value: id, label: title(id, group) }))]} onChange={id => navigate(id || undefined)}/>{controls}</div>;
  usePageTopBarRightSlot(embedded ? null : switching);
  const summary = <div className="account-summary-grid">{summaries.map(({code, receipts, payments, fulfilled}) => <SummaryGroupCard key={code} title={code + ' planned activity'}><SummaryMetric label="Expected receipts" value={fmtMoney(receipts, code)}/><SummaryMetric label="Expected payments" value={fmtMoney(payments, code)}/><SummaryMetric label="Fulfilled items" value={fulfilled}/></SummaryGroupCard>)}</div>;
  type PaymentRow = typeof rows[number];
  const edit = (row: PaymentRow) => setEditor({ reference: row.reference, occurrenceDate: row.occurrenceDate });
  const removePayment = async (row: PaymentRow) => {
    if (!await ensureSignedIn('Sign in to delete this payment.')) return;
    if (!await confirmDialog('Delete this planned payment? This will not delete an actual transaction.')) return;
    try { deletePlanPayment(row.reference, row.occurrenceDate); toast('Planned payment deleted.'); }
    catch (error) { toast(error instanceof Error ? error.message : String(error)); }
  };
  const sorted = dateSort.rows(rows, { date: row => row.plan });
  const pageCount = Math.max(1, Math.ceil(sorted.length / 50)), safePage = Math.min(page, pageCount - 1);
  const charts = <div className="stack-lg">
    {analytics.map(({code, status, categoryRows, financeRows, statusLabels}) => {
      return <div key={code}>
        <h4>{code} budget status and allocation</h4>
        <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
          <ChartCard flat title="Status split" empty={!statusLabels.length}>
            <div style={{ height: 220 }}><Doughnut data={{ labels: statusLabels, datasets: [{ data: statusLabels.map(label => status[label]), backgroundColor: HUES }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} /></div>
          </ChartCard>
          <ChartCard flat title="Budget by category" empty={!categoryRows.length}>
            <div style={{ height: Math.max(220, categoryRows.length * 34) }}><Chart type="bar" data={{ labels: categoryRows.map(([label]) => label), datasets: [{ label: 'Planned amount', data: categoryRows.map(([, amount]) => amount), backgroundColor: HUES[0] }] }} options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
          </ChartCard>
          <ChartCard flat title="Budget by finance" empty={!financeRows.length}>
            <div style={{ height: Math.max(220, financeRows.length * 34) }}><Chart type="bar" data={{ labels: financeRows.map(([label]) => label), datasets: [{ label: 'Planned amount', data: financeRows.map(([, amount]) => amount), backgroundColor: HUES[1] }] }} options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
          </ChartCard>
        </div>
      </div>;
    })}
  </div>;
  const items = <><div className="table-scroll"><table><thead><tr><dateSort.Th rows={rows} column="date">Date</dateSort.Th><th>Item</th><th>Finance</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{sorted.slice(safePage * 50, (safePage + 1) * 50).map(row => <RecordRow onEdit={!row.plan.executed ? () => edit(row) : undefined} record={row} key={`${row.module}:${row.plan.id}`}><td><DateValue value={row.plan.date}/></td><td>{row.description}</td><td>{row.financeName}</td><td>{fmtMoney(row.signedAmount, row.currencyCode)}</td><td>{row.status}</td><td>{!row.plan.executed && <div className="row gap-sm"><StandardButton tone="secondary" size="small" onClick={() => edit(row)}>Edit item / finance</StandardButton><StandardButton tone="danger" size="small" onClick={() => void removePayment(row)}>Delete payment</StandardButton></div>}</td></RecordRow>)}</tbody></table>{!rows.length && <p className="text-muted">{selected?.length ? 'No payments match this period. Change the date filters to see other payments.' : 'No payments yet. Add the first payment to this plan.'}</p>}</div><Pagination page={safePage} pageCount={pageCount} total={rows.length} onChange={setPage}/>{charts}</>;
  const removeGroup = async () => {
    if (!selectedGroup || !await ensureSignedIn('Sign in to delete this plan.')) return;
    if (!await confirmDialog('Delete this plan and all its unfulfilled planned payments? Actual transactions will be kept.')) return;
    try { deletePlanGroup(selectedGroup.id, selectedGroup); toast('Plan deleted.'); navigate(); }
    catch (error) { toast(error instanceof Error ? error.message : String(error)); }
  };
  const dialogs = <>{editor && <FinancePlanEditor {...editor} onClose={() => setEditor(null)}/>} {groupEditor && <FinancePlanGroupEditor {...groupEditor} onClose={() => setGroupEditor(null)} onSaved={id => navigate('group:' + id)}/>}</>;
  if (selected && key) {
    const details = <><div className="row gap-sm">{selectedGroup && <><StandardButton onClick={() => setEditor({ initialGroupId: selectedGroup.id })}>Add payment</StandardButton><StandardButton tone="secondary" onClick={() => setGroupEditor({ original: selectedGroup })}>Edit plan</StandardButton><StandardButton tone="danger" disabled={cannotDelete} onClick={() => void removeGroup()}>Delete plan</StandardButton></>}{parent && !selectedGroup && <StandardButton tone="secondary" onClick={() => setEditor({ reference: { module: parent.module, id: parent.plan.id } })}>Edit plan</StandardButton>}</div>{selectedGroup?.notes && <p>{selectedGroup.notes}</p>}{cannotDelete && selectedGroup && <p className="text-muted">This plan contains fulfilled payments. Its history is retained; you can delete individual future payments.</p>}<p className="text-muted">Each payment has its own date, amount and finance. Totals follow the selected period and stay separate by currency.</p></>;
    return <ModuleDetailTemplate title={title(key, selected)} backLabel="All plans" onBack={() => navigate()} topBarRight={switching} sections={[
      { key: 'details', label: 'Plan details', defaultOpen: true, actions: [{ label: 'Link plan to finance', disabled: !selected.length, onClick: () => setLinkOpen(true) }], content: details },
      { key: 'items', label: 'Payments', defaultOpen: true, content: items },
      { key: 'summary', label: 'Plan summary', defaultOpen: false, content: <div className="stack-lg"><PlanningPositionSummary filters={filters} scope={selected}/>{summary}</div> },
    ]}>{dialogs}{linkOpen && <PlanFinanceEditor records={selected} onClose={() => setLinkOpen(false)}/>}<EntityActions actions={[{ label: 'Add plan', onClick: () => setGroupEditor({}) }, ...(selectedGroup ? [{ label: 'Add payment', onClick: () => setEditor({ initialGroupId: selectedGroup.id }) }] : [])]}/></ModuleDetailTemplate>;
  }
  if (embedded) {
    return <>
      <EntityActions actions={[{ label: 'Add plan', onClick: () => setGroupEditor({}) }]} />
      <StandardCard title="Plan payments and budget insights">{items}</StandardCard>
      {dialogs}
    </>;
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
