import { useState, useSyncExternalStore } from 'react';
import { getBudgetOverview, exportBudgetCsv, BUDGET_IMPORT_COLUMNS, previewBudgetDefinitionImport, applyBudgetDefinitionImport, applyBudgetMonthLimits, applyBudgetDefinitionChanges, getBudgetRecordKey, subscribeBudgets, saveBudget, setBudgetMonthLimit, removeBudget, saveBudgetAllocations, type BudgetDefinition, type BudgetAllocation, type AllocationInput } from '../services/finance/budgetService';
import type { MovementActivity } from '../services/finance/dashboardService';
import { StandardCard } from './StandardCard';
import { SummarySection, SummarySections, SummaryValue } from './SummaryGroupCard';
import { Field, Select, TextInput } from './ui/Field';
import { StandardDropdown } from './ui/StandardDropdown';
import { BatchEditGrid, type BatchColumn } from './BatchEditGrid';
import { StandardButton } from './standard/Button';
import { Modal } from './Modal';
import { Notice } from './Notice';
import { RecordRow } from './RecordRow';
import { CalendarIcon, CashIcon, PlusIcon, EditIcon } from './icons';
import { useTablePagination } from '../hooks/useTablePagination';
import { getCurrentUser } from '../lib/firebase/useAuthState';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { confirmDialog } from './ConfirmDialog';
import { fmtMoney } from '../lib/format';
import { toast } from './Toast';
import { ChartCard } from '../features/qse/components/ChartCard';
import { AppChart } from './AppCharts';
import { HUES } from '../lib/statCardHues';

type Context = ReturnType<typeof getBudgetOverview>;
type BudgetMonth = Context['report']['rows'][number]['months'][number];
type BudgetLimitRow = { budget: BudgetDefinition; name: string; currency: string; month: string; limit: number };
const limitColumns: BatchColumn<BudgetLimitRow>[] = [
  { key: 'name', label: 'Budget', type: 'text', editable: false },
  { key: 'currency', label: 'Currency', type: 'text', editable: false },
  { key: 'month', label: 'Month', type: 'text', editable: false },
  { key: 'limit', label: 'Monthly limit', type: 'number' },
];
type BudgetDefinitionRow = Pick<BudgetDefinition, 'name' | 'monthlyLimit' | 'rollover' | 'currencyCode'> & {
  budget: BudgetDefinition;
};
const definitionColumns: BatchColumn<BudgetDefinitionRow>[] = [
  { key: 'name', label: 'Budget name', type: 'text' },
  { key: 'currencyCode', label: 'Currency', type: 'text', editable: false },
  { key: 'monthlyLimit', label: 'Default monthly limit', type: 'number' },
  { key: 'rollover', label: 'Rollover', type: 'select', options: [
    { value: 'none', label: 'Reset each month' },
    { value: 'surplus', label: 'Carry positive remaining only' },
    { value: 'balance', label: 'Carry positive and negative remaining' },
  ] },
];

export function UnifiedBudgetsPanel({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const context=useSyncExternalStore(subscribeBudgets,()=>getBudgetOverview(fromDate,toDate));
  const { report }=context;
  const [editing,setEditing]=useState<BudgetDefinition | 'new' | null>(null);
  const [limit,setLimit]=useState<{budget:BudgetDefinition;month:BudgetMonth}|null>(null);
  const [detail,setDetail]=useState<{budget:BudgetDefinition;month:BudgetMonth}|null>(null);
  const [allocating,setAllocating]=useState<MovementActivity | 'choose' | null>(null);
  const [modify,setModify]=useState(false);
  const [importing, setImporting] = useState(false);
  const [batch, setBatch] = useState<{ owner: string; rows: BudgetLimitRow[] } | null>(null);
  const [definitionBatch, setDefinitionBatch] = useState<{ owner: string; rows: BudgetDefinitionRow[] } | null>(null);
  const ensureSignedIn=useEnsureSignedIn();
  const visible=report.rows.flatMap(row=>row.months.map(month=>({budget:row.budget,month})));
  const { rows,controls }=useTablePagination(visible);
  const { rows:unallocatedRows,controls:unallocatedControls }=useTablePagination(report.unallocated);
  const openBatch = async () => {
    if (!(await ensureSignedIn('Sign in to edit monthly limits.'))) return;
    const owner = getCurrentUser()?.uid;
    if (!owner) return;
    const current = getBudgetOverview(fromDate, toDate);
    setBatch({ owner, rows: current.report.rows.flatMap(({ budget, months }) => months.map(month => ({
      budget, name: budget.name, currency: budget.currencyCode, month: month.month, limit: month.limit,
    }))) });
  };
  const openDefinitionBatch = async () => {
    if (!(await ensureSignedIn('Sign in to edit budget definitions.'))) return;
    const owner = getCurrentUser()?.uid;
    if (!owner) return;
    const current = getBudgetOverview(fromDate, toDate);
    setDefinitionBatch({ owner, rows: current.report.rows.map(({ budget }) => ({
      budget, name: budget.name, currencyCode: budget.currencyCode, monthlyLimit: budget.monthlyLimit, rollover: budget.rollover,
    })) });
  };
  const exportCsv = (type: 'balances' | 'allocations') => {
    const { fileName, csv } = exportBudgetCsv(report, type);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const remove=async(budget:BudgetDefinition)=>{
    if(!await ensureSignedIn('Sign in to change budgets.'))return;
    if(!await confirmDialog('Remove this unused budget definition? Native transactions will be kept.'))return;
    try{removeBudget(budget.id,budget);toast('Budget removed.');}catch(error){toast(error instanceof Error?error.message:String(error));}
  };
  return <StandardCard title="Currency budgets" collapsible={false} className="mb-md" actions={[
    {label:'Add budget',onClick:()=>setEditing('new')},
    {label:'Import budget definitions',onClick:()=>setImporting(true)},
    {label:'Batch edit budget definitions',onClick:()=>void openDefinitionBatch(),disabled:!report.rows.length},
    {label:'Batch edit monthly limits',onClick:()=>void openBatch(),disabled:!visible.length},
    {label:modify?'Done modifying':'Modify',onClick:()=>setModify(!modify)},
    {label:'Allocate / identify refund',onClick:()=>setAllocating('choose'),disabled:!context.records.length},
    {label:'Export monthly balances',onClick:()=>exportCsv('balances'),disabled:!visible.length},
    {label:'Export allocation details',onClick:()=>exportCsv('allocations'),disabled:!visible.some(({ month }) => month.items.length)},
  ]}>
    <p className="text-muted">{report.fromMonth} – {report.toMonth}. Calendar-month balances include earlier days in each selected month and all cleared native records through {report.today}. Pending and planned outflows appear as reservations when exactly one budget matches. Reservations do not affect cleared usage or rollover. Monthly limits keep their own currencies; legacy unassigned Bank targets are separate.</p>
    <div className="row mb-md"><button className="btn secondary small" onClick={()=>setEditing('new')}><PlusIcon size={14}/> Add budget</button><button className="btn secondary small" disabled={!context.records.length} onClick={()=>setAllocating('choose')}>Allocate / identify refund</button></div>
    {!!report.issues.length && <Notice tone="warning">{report.issues.length} budget data issues need review. Invalid allocations are not applied; records with invalid identities or amounts are excluded until reviewed.<ul>{report.issues.map((issue,index)=><li key={index}>{issue.message}</li>)}</ul></Notice>}
    <SummarySections>{report.totals.map(total=><SummarySection key={total.currency} title={total.currency+' · cleared outflow'}>
      <SummaryValue primary label="Unallocated" value={fmtMoney(total.unallocatedOutflow,total.currency)}/>
      <SummaryValue label="Allocated outflow" value={fmtMoney(total.allocatedOutflow,total.currency)}/>
      <SummaryValue label="Explicit refunds" value={fmtMoney(total.refunds,total.currency)}/>
    </SummarySection>)}</SummarySections>
    {!context.budgets.length && <p className="text-muted">No currency-owned budgets yet. Add a monthly limit, optionally scoped to categories and a named plan.</p>}
    <div className="table-scroll"><table><caption>Monthly budget balances — select a row for its allocated records. Outflow can include deliberately budgeted financing or investments.</caption><thead><tr><th>Budget / month</th><th>Limit</th><th>Carry in</th><th>Available</th><th>Outflow</th><th>Refunds</th><th>Remaining</th><th>Pending reserved</th><th>Planned reserved</th><th>After reservations</th>{modify&&<th>Actions</th>}</tr></thead><tbody>{rows.map(({budget,month})=><RecordRow key={budget.id+month.month} record={{budget,month}} onOpen={()=>setDetail({budget,month})}>
      <td>{budget.name}<br/><span className="text-muted">{month.month} · {budget.currencyCode}{month.isFuture?' · forecast carry':''}</span></td>
      <td>{fmtMoney(month.limit,budget.currencyCode)}</td><td>{fmtMoney(month.carryIn,budget.currencyCode)}</td><td>{fmtMoney(month.available,budget.currencyCode)}</td><td>{fmtMoney(month.outflow,budget.currencyCode)}</td><td>{fmtMoney(month.refunds,budget.currencyCode)}</td><td>{fmtMoney(month.remaining,budget.currencyCode)}</td>
      <td>{fmtMoney(month.pendingReserved,budget.currencyCode)}</td><td>{fmtMoney(month.plannedReserved,budget.currencyCode)}</td><td><strong>{fmtMoney(month.afterReservations,budget.currencyCode)}</strong></td>
      {modify&&<td><button className="btn secondary small" onClick={event=>{event.stopPropagation();setLimit({budget,month});}}>Month limit</button>{' '}<button className="btn secondary small" onClick={event=>{event.stopPropagation();setEditing(budget);}}><EditIcon size={12}/> Edit</button>{' '}<button className="btn secondary small" onClick={event=>{event.stopPropagation();void remove(budget);}}>Remove unused</button></td>}
    </RecordRow>)}</tbody></table></div>{controls}
    {report.charts.filter(chart=>chart.labels.length).map(chart=><ChartCard flat key={chart.currency} title={chart.currency+' — available vs net allocated use'}><div style={{height:260}}><AppChart type="bar" data={{labels:chart.labels,datasets:[{label:'Available ('+chart.currency+')',data:chart.available,backgroundColor:HUES[0]},{label:'Net allocated use ('+chart.currency+')',data:chart.used,backgroundColor:HUES[1]}]}}/></div></ChartCard>)}
    <h3>Unallocated records</h3><p className="text-muted">A record matching multiple budgets stays unallocated until you choose a split. Unclassified account movement needs an explicit category/plan scope or manual allocation. Ordinary income only becomes a budget refund when explicitly identified.</p>
    <div className="table-scroll"><table><caption>Cleared outflow not yet assigned to a budget</caption><thead><tr><th>Date</th><th>Source / record</th><th>Unallocated</th><th>Reason</th></tr></thead><tbody>{unallocatedRows.map(item=><RecordRow key={item.recordKey} record={item} onOpen={()=>setAllocating(item.record)}><td>{item.record.date}</td><td>{item.record.sourceLabel}<br/>{item.record.description}</td><td>{fmtMoney(item.amount,item.record.currencyCode)}</td><td>{item.ambiguousBudgetIds.length?'Multiple matching budgets':'No allocation or partial allocation'}</td></RecordRow>)}</tbody></table></div>{unallocatedControls}
    {batch && <BatchEditGrid title="Batch edit monthly budget limits" description="Edit targets for the displayed months. Each budget keeps its default limit and currency."
      rows={batch.rows} columns={limitColumns}
      getRowId={row => JSON.stringify([row.budget.id, row.month])}
      validateRow={row => ({ limit: Number.isFinite(row.limit) && row.limit >= 0 ? undefined : 'Enter a finite monthly limit of zero or more.' })}
      onSave={changes => {
        const count = applyBudgetMonthLimits(changes.map(({ before, after }) => ({ expected: before.budget, month: before.month, limit: after.limit })), batch.owner);
        toast(`Updated ${count} monthly limits.`);
      }}
      onClose={() => setBatch(null)}
    />}
    {definitionBatch && <BatchEditGrid title="Batch edit budget definitions"
      description="Changing default limits or rollover recalculates months throughout the budget period. Saved monthly overrides still apply."
      rows={definitionBatch.rows} columns={definitionColumns}
      getRowId={row => row.budget.id}
      validateRow={row => ({
        name: row.name.trim() ? undefined : 'Enter a budget name.',
        monthlyLimit: Number.isFinite(row.monthlyLimit) && row.monthlyLimit >= 0 ? undefined : 'Enter a finite monthly limit of zero or more.',
      })}
      onSave={changes => {
        const count = applyBudgetDefinitionChanges(changes.map(({ before, after }) => ({
          expected: before.budget, name: after.name, monthlyLimit: after.monthlyLimit, rollover: after.rollover,
        })), definitionBatch.owner);
        toast(`Updated ${count} budget definitions.`);
      }}
      onClose={() => setDefinitionBatch(null)}
    />}
    {importing && <BudgetImportDialog onClose={() => setImporting(false)} />}
    {editing&&<BudgetEditor context={context} original={editing==='new'?undefined:editing} onClose={()=>setEditing(null)}/>}
    {limit&&<MonthLimitEditor budget={limit.budget} month={limit.month} onClose={()=>setLimit(null)}/>}
    {allocating&&<AllocationEditor context={context} initial={allocating==='choose'?undefined:allocating} onClose={()=>setAllocating(null)}/>}
    {detail&&<Modal title={detail.budget.name+' · '+detail.month.month} onClose={()=>setDetail(null)}><p>Limit {fmtMoney(detail.month.limit,detail.budget.currencyCode)}; carry {fmtMoney(detail.month.carryIn,detail.budget.currencyCode)}; remaining {fmtMoney(detail.month.remaining,detail.budget.currencyCode)}.</p><div className="table-scroll"><table><caption>Allocated portions supporting this month's usage; negative portions are explicit refunds</caption><thead><tr><th>Date</th><th>Source / record</th><th>Native amount</th><th>Allocated portion</th></tr></thead><tbody>{detail.month.items.map((item,index)=><RecordRow key={item.recordKey+index} record={item} onOpen={()=>{setDetail(null);setAllocating(item.record);}}><td>{item.record.date}</td><td>{item.record.sourceLabel}<br/>{item.record.description}</td><td>{fmtMoney(item.record.amount,item.record.currencyCode)}</td><td>{fmtMoney(item.allocated,item.record.currencyCode)}</td></RecordRow>)}</tbody></table></div>{!detail.month.items.length&&<p>No cleared usage in this month.</p>}
      {detail.month.reservations.length > 0 && <div className="table-scroll"><table>
        <caption>Reservations for this month</caption>
        <thead><tr><th>Date</th><th>Source / record</th><th>Status</th><th>Reserved amount</th></tr></thead>
        <tbody>{detail.month.reservations.map(({ record, population, amount }) => <tr key={population + getBudgetRecordKey(record)}>
          <td>{record.date}</td><td>{record.sourceLabel}<br />{record.description}</td>
          <td>{population === 'pending' ? 'Pending' : 'Planned'}</td><td>{fmtMoney(amount,detail.budget.currencyCode)}</td>
        </tr>)}</tbody>
      </table></div>}
    </Modal>}
  </StandardCard>;
}

function BudgetImportDialog({ onClose }: { onClose: () => void }) {
  const ensureSignedIn = useEnsureSignedIn();
  const [preview, setPreview] = useState<ReturnType<typeof previewBudgetDefinitionImport> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { rows, controls } = useTablePagination(preview?.definitions ?? []);
  const review = async (file: File) => {
    const requestedOwner = getCurrentUser()?.uid;
    setPreview(null);
    setError('');
    setBusy(true);
    try {
      if (file.size > 1_000_000) throw new Error('Use a CSV of 1 MB or less.');
      if (!(await ensureSignedIn('Sign in to review budget definitions.'))) return;
      const owner = getCurrentUser()?.uid;
      const csv = await file.text();
      if (!owner || (requestedOwner && owner !== requestedOwner) || owner !== getCurrentUser()?.uid) throw new Error('The signed-in account changed. Review the CSV again.');
      setPreview(previewBudgetDefinitionImport(csv));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const apply = () => {
    if (!preview) return;
    try {
      toast(`Imported ${applyBudgetDefinitionImport(preview)} budget definitions.`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return <Modal title="Import budget definitions" onClose={onClose} manageFocus>
    <div className="stack-md">
      <p>Add budgets with unique IDs and explicit native currencies. Use YYYY-MM for months, none, surplus or balance for rollover, and | to separate category IDs. End month, category IDs and plan group ID are optional.</p>
      <p className="text-muted">{BUDGET_IMPORT_COLUMNS.join(', ')}</p>
      <Field label="Budget definitions CSV"><TextInput type="file" accept=".csv,text/csv" disabled={busy} onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void review(file);
      }} /></Field>
      {error && <div role="alert"><Notice tone="danger">{error}</Notice></div>}
      {preview && <div className="table-scroll"><table>
        <caption>New budget definitions</caption>
        <thead><tr><th>ID</th><th>Budget</th><th>Monthly limit</th><th>Months</th><th>Rollover</th><th>Category IDs</th><th>Plan group</th></tr></thead>
        <tbody>{rows.map(item => <tr key={item.id}><td>{item.id}</td><td>{item.name}</td><td>{fmtMoney(item.monthlyLimit,item.currencyCode)}</td><td>{item.startMonth} – {item.endMonth ?? 'Open'}</td><td>{item.rollover}</td><td>{item.categoryIds?.join(', ') ?? 'All'}</td><td>{item.planGroupId ?? 'Any'}</td></tr>)}</tbody>
      </table></div>}
      {preview && controls}
      <div className="row gap-sm">
        <StandardButton disabled={busy || !preview} onClick={apply}>Import reviewed budgets</StandardButton>
        <StandardButton tone="secondary" onClick={onClose}>Cancel</StandardButton>
      </div>
    </div>
  </Modal>;
}

function BudgetEditor({context,original,onClose}:{context:Context;original?:BudgetDefinition;onClose:()=>void}) {
  const [name,setName]=useState(original?.name??'');
  const [currency,setCurrency]=useState(original?.currencyCode??context.defaultCurrency);
  const [limit,setLimit]=useState(String(original?.monthlyLimit??''));
  const [from,setFrom]=useState(original?.startMonth??context.report.fromMonth),[to,setTo]=useState(original?.endMonth??'');
  const [categories,setCategories]=useState(original?.categoryIds??[]),[group,setGroup]=useState(original?.planGroupId??'');
  const [rollover,setRollover]=useState<BudgetDefinition['rollover']>(original?.rollover??'none');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);const signIn=useEnsureSignedIn();
  const save=async()=>{setBusy(true);setError('');try{if(!await signIn('Sign in to save budgets.'))return;saveBudget({...original,id:original?.id??crypto.randomUUID(),name,currencyCode:currency,monthlyLimit:limit,startMonth:from,endMonth:to,categoryIds:categories,planGroupId:group,rollover},original);toast('Budget saved.');onClose();}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy(false);}};
  return <Modal title={original?'Edit budget definition':'Add currency budget'} onClose={onClose}>
    {error&&<Notice tone="warning">{error}</Notice>}
    <Field label="Budget name" required><TextInput value={name} onChange={event=>setName(event.target.value)}/></Field>
    <div className="row"><Field label="Native currency" required><TextInput value={currency} maxLength={8} onChange={event=>setCurrency(event.target.value)}/></Field><Field label="Default monthly limit" required><TextInput inputMode="decimal" value={limit} onChange={event=>setLimit(event.target.value)}/></Field></div>
    <div className="row"><Field label="Start month"><TextInput type="month" value={from} onChange={event=>setFrom(event.target.value)}/></Field><Field label="End month (optional)"><TextInput type="month" value={to} onChange={event=>setTo(event.target.value)}/></Field></div>
    <fieldset><legend>Categories (none means all classified outflows)</legend><div style={{maxHeight:160,overflowY:'auto'}}>{context.categories.map(category=><label key={category.id} className="row"><input type="checkbox" checked={categories.includes(category.id)} onChange={event=>setCategories(event.target.checked?[...categories,category.id]:categories.filter(id=>id!==category.id))}/>{category.name} · {category.scope==='app'?'App default':'Custom'}</label>)}</div></fieldset>
    <Field label="Named plan (optional)"><StandardDropdown label="Budget plan" value={group} isTypeable sections={[{title:'Plans',items:[{value:'',label:'Any plan / unallocated',icon:<CalendarIcon size={16}/>},...context.groups.map(item=>({value:item.id,label:item.name,icon:<CalendarIcon size={16}/>}))]}]} onChange={setGroup}/></Field>
    <Field label="Rollover"><Select value={rollover} onChange={event=>setRollover(event.target.value as BudgetDefinition['rollover'])}><option value="none">Reset each month</option><option value="surplus">Carry positive remaining only</option><option value="balance">Carry positive and negative remaining</option></Select></Field>
    <p className="text-muted">Category and plan scopes both apply when selected. Definition edits recalculate matching history; use Month limit to change just one month's target. Currency values are never converted.</p>
    <div className="row"><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy||!name.trim()} onClick={()=>void save()}>Save budget</button></div>
  </Modal>;
}
function MonthLimitEditor({budget,month,onClose}:{budget:BudgetDefinition;month:BudgetMonth;onClose:()=>void}) {
  const [value,setValue]=useState(String(month.limit)),[error,setError]=useState('');const signIn=useEnsureSignedIn();
  return <Modal title={budget.name+' · '+month.month+' limit'} onClose={onClose}>{error&&<Notice tone="warning">{error}</Notice>}<Field label="Monthly limit"><TextInput value={value} inputMode="decimal" onChange={event=>setValue(event.target.value)}/></Field><p className="text-muted">Changes only this calendar month's limit. Other months keep their existing targets.</p><div className="row"><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={async()=>{if(!await signIn('Sign in to change budget limits.'))return;try{setBudgetMonthLimit(budget.id,month.month,value,budget);onClose();}catch(error){setError(error instanceof Error?error.message:String(error));}}}>Save month limit</button></div></Modal>;
}
function AllocationEditor({context,initial,onClose}:{context:Context;initial?:MovementActivity;onClose:()=>void}) {
  const [record,setRecord]=useState(initial),[expected,setExpected]=useState<BudgetAllocation[]>(()=>context.allocations.filter(item=>initial&&item.recordKey===getBudgetRecordKey(initial)));
  const [draft,setDraft]=useState<AllocationInput[]>(()=>expected.map(item=>({budgetId:item.budgetId,amount:String(Math.abs(item.amount))})));
  const [error,setError]=useState('');const signIn=useEnsureSignedIn();
  const select=(key:string)=>{const selected=context.records.find(item=>getBudgetRecordKey(item)===key);setRecord(selected);const existing=context.allocations.filter(item=>item.recordKey===key);setExpected(existing);setDraft(existing.map(item=>({budgetId:item.budgetId,amount:String(Math.abs(item.amount))})));setError('');};
  const save=async()=>{if(!record||!await signIn('Sign in to save budget allocations.'))return;try{saveBudgetAllocations(record,draft,expected);toast('Budget allocation saved.');onClose();}catch(error){setError(error instanceof Error?error.message:String(error));}};
  return <Modal title="Allocate a record / identify a refund" onClose={onClose}>
    {error&&<Notice tone="warning">{error}</Notice>}
    {!initial&&<StandardDropdown label="Cleared record" value={record?getBudgetRecordKey(record):''} isTypeable sections={context.currencies.map(currency=>({title:currency,items:context.records.filter(item=>item.currencyCode===currency).map(item=>({value:getBudgetRecordKey(item),label:item.date+' · '+item.sourceLabel+' · '+item.description+' · '+fmtMoney(item.amount,currency),icon:<CashIcon size={16}/>}))}))} onChange={select}/>}
    {record&&<><p>{record.date} · {record.sourceLabel} · {record.description}<br/><strong>{fmtMoney(record.amount,record.currencyCode)}</strong></p><p className="text-muted">Enter positive portions. Allocating a positive native record explicitly identifies those portions as budget refunds. An empty split restores automatic matching.</p>
      {draft.map((row,index)=><div key={index} className="row"><StandardDropdown label={'Allocation budget '+(index+1)} value={row.budgetId} isTypeable sections={[{title:record.currencyCode+' budgets',items:context.budgets.filter(budget=>budget.currencyCode===record.currencyCode).map(budget=>({value:budget.id,label:budget.name,icon:<CashIcon size={16}/>}))}]} onChange={budgetId=>setDraft(draft.map((item,at)=>at===index?{...item,budgetId}:item))}/><Field label={'Portion '+(index+1)}><TextInput inputMode="decimal" value={row.amount} onChange={event=>setDraft(draft.map((item,at)=>at===index?{...item,amount:event.target.value}:item))}/></Field><button className="btn secondary small" aria-label={'Remove allocation '+(index+1)} onClick={()=>setDraft(draft.filter((_,at)=>at!==index))}>×</button></div>)}
      <button className="btn secondary small" onClick={()=>setDraft([...draft,{budgetId:'',amount:''}])}><PlusIcon size={14}/> Add split</button></>}
    <div className="row mt-md"><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={!record} onClick={()=>void save()}>Save allocation</button></div>
  </Modal>;
}
