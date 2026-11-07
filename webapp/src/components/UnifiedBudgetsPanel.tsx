import { useState, useSyncExternalStore } from 'react';
import { getBudgetOverview, getBudgetRecordKey, subscribeBudgets, saveBudget, setBudgetMonthLimit, removeBudget, saveBudgetAllocations, type BudgetDefinition, type BudgetAllocation, type AllocationInput } from '../services/finance/budgetService';
import type { MovementActivity } from '../services/finance/dashboardService';
import { StandardCard } from './StandardCard';
import { SummarySection, SummarySections, SummaryValue } from './SummaryGroupCard';
import { Field, Select, TextInput } from './ui/Field';
import { StandardDropdown } from './ui/StandardDropdown';
import { Modal } from './Modal';
import { Notice } from './Notice';
import { RecordRow } from './RecordRow';
import { CalendarIcon, CashIcon, PlusIcon, EditIcon } from './icons';
import { useTablePagination } from '../hooks/useTablePagination';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { confirmDialog } from './ConfirmDialog';
import { fmtMoney } from '../lib/format';
import { toast } from './Toast';
import { ChartCard } from '../features/qse/components/ChartCard';
import { AppChart } from './AppCharts';
import { HUES } from '../lib/statCardHues';

type Context = ReturnType<typeof getBudgetOverview>;
type BudgetMonth = Context['report']['rows'][number]['months'][number];
export function UnifiedBudgetsPanel({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const context=useSyncExternalStore(subscribeBudgets,()=>getBudgetOverview(fromDate,toDate));
  const { report }=context;
  const [editing,setEditing]=useState<BudgetDefinition | 'new' | null>(null);
  const [limit,setLimit]=useState<{budget:BudgetDefinition;month:BudgetMonth}|null>(null);
  const [detail,setDetail]=useState<{budget:BudgetDefinition;month:BudgetMonth}|null>(null);
  const [allocating,setAllocating]=useState<MovementActivity | 'choose' | null>(null);
  const [modify,setModify]=useState(false);
  const ensureSignedIn=useEnsureSignedIn();
  const visible=report.rows.flatMap(row=>row.months.map(month=>({budget:row.budget,month})));
  const { rows,controls }=useTablePagination(visible);
  const { rows:unallocatedRows,controls:unallocatedControls }=useTablePagination(report.unallocated);
  const remove=async(budget:BudgetDefinition)=>{
    if(!await ensureSignedIn('Sign in to change budgets.'))return;
    if(!await confirmDialog('Remove this unused budget definition? Native transactions will be kept.'))return;
    try{removeBudget(budget.id,budget);toast('Budget removed.');}catch(error){toast(error instanceof Error?error.message:String(error));}
  };
  return <StandardCard title="Currency budgets" collapsible={false} className="mb-md" actions={[
    {label:'Add budget',onClick:()=>setEditing('new')},
    {label:modify?'Done modifying':'Modify',onClick:()=>setModify(!modify)},
    {label:'Allocate / identify refund',onClick:()=>setAllocating('choose'),disabled:!context.records.length},
  ]}>
    <p className="text-muted">{report.fromMonth} – {report.toMonth}. Calendar-month balances include earlier days in each selected month and all cleared native records through {report.today}. Pending records and plans do not count as cleared usage. Monthly limits keep their own currencies; legacy unassigned Bank targets are separate.</p>
    <div className="row mb-md"><button className="btn secondary small" onClick={()=>setEditing('new')}><PlusIcon size={14}/> Add budget</button><button className="btn secondary small" disabled={!context.records.length} onClick={()=>setAllocating('choose')}>Allocate / identify refund</button></div>
    {!!report.issues.length && <Notice tone="warning">{report.issues.length} budget data issues need review. Invalid allocations are not applied; records with invalid identities or amounts are excluded until reviewed.<ul>{report.issues.map((issue,index)=><li key={index}>{issue.message}</li>)}</ul></Notice>}
    <SummarySections>{report.totals.map(total=><SummarySection key={total.currency} title={total.currency+' · cleared outflow'}>
      <SummaryValue primary label="Unallocated" value={fmtMoney(total.unallocatedOutflow,total.currency)}/>
      <SummaryValue label="Allocated outflow" value={fmtMoney(total.allocatedOutflow,total.currency)}/>
      <SummaryValue label="Explicit refunds" value={fmtMoney(total.refunds,total.currency)}/>
    </SummarySection>)}</SummarySections>
    {!context.budgets.length && <p className="text-muted">No currency-owned budgets yet. Add a monthly limit, optionally scoped to categories and a named plan.</p>}
    <div className="table-scroll"><table><caption>Monthly budget balances — select a row for its allocated records. Outflow can include deliberately budgeted financing or investments.</caption><thead><tr><th>Budget / month</th><th>Limit</th><th>Carry in</th><th>Available</th><th>Outflow</th><th>Refunds</th><th>Remaining</th>{modify&&<th>Actions</th>}</tr></thead><tbody>{rows.map(({budget,month})=><RecordRow key={budget.id+month.month} record={{budget,month}} onOpen={()=>setDetail({budget,month})}>
      <td>{budget.name}<br/><span className="text-muted">{month.month} · {budget.currencyCode}{month.isFuture?' · forecast carry':''}</span></td>
      <td>{fmtMoney(month.limit,budget.currencyCode)}</td><td>{fmtMoney(month.carryIn,budget.currencyCode)}</td><td>{fmtMoney(month.available,budget.currencyCode)}</td><td>{fmtMoney(month.outflow,budget.currencyCode)}</td><td>{fmtMoney(month.refunds,budget.currencyCode)}</td><td><strong>{fmtMoney(month.remaining,budget.currencyCode)}</strong></td>
      {modify&&<td><button className="btn secondary small" onClick={event=>{event.stopPropagation();setLimit({budget,month});}}>Month limit</button>{' '}<button className="btn secondary small" onClick={event=>{event.stopPropagation();setEditing(budget);}}><EditIcon size={12}/> Edit</button>{' '}<button className="btn secondary small" onClick={event=>{event.stopPropagation();void remove(budget);}}>Remove unused</button></td>}
    </RecordRow>)}</tbody></table></div>{controls}
    {report.charts.filter(chart=>chart.labels.length).map(chart=><ChartCard flat key={chart.currency} title={chart.currency+' — available vs net allocated use'}><div style={{height:260}}><AppChart type="bar" data={{labels:chart.labels,datasets:[{label:'Available ('+chart.currency+')',data:chart.available,backgroundColor:HUES[0]},{label:'Net allocated use ('+chart.currency+')',data:chart.used,backgroundColor:HUES[1]}]}}/></div></ChartCard>)}
    <h3>Unallocated records</h3><p className="text-muted">A record matching multiple budgets stays unallocated until you choose a split. Unclassified account movement needs an explicit category/plan scope or manual allocation. Ordinary income only becomes a budget refund when explicitly identified.</p>
    <div className="table-scroll"><table><caption>Cleared outflow not yet assigned to a budget</caption><thead><tr><th>Date</th><th>Source / record</th><th>Unallocated</th><th>Reason</th></tr></thead><tbody>{unallocatedRows.map(item=><RecordRow key={item.recordKey} record={item} onOpen={()=>setAllocating(item.record)}><td>{item.record.date}</td><td>{item.record.sourceLabel}<br/>{item.record.description}</td><td>{fmtMoney(item.amount,item.record.currencyCode)}</td><td>{item.ambiguousBudgetIds.length?'Multiple matching budgets':'No allocation or partial allocation'}</td></RecordRow>)}</tbody></table></div>{unallocatedControls}
    {editing&&<BudgetEditor context={context} original={editing==='new'?undefined:editing} onClose={()=>setEditing(null)}/>}
    {limit&&<MonthLimitEditor budget={limit.budget} month={limit.month} onClose={()=>setLimit(null)}/>}
    {allocating&&<AllocationEditor context={context} initial={allocating==='choose'?undefined:allocating} onClose={()=>setAllocating(null)}/>}
    {detail&&<Modal title={detail.budget.name+' · '+detail.month.month} onClose={()=>setDetail(null)}><p>Limit {fmtMoney(detail.month.limit,detail.budget.currencyCode)}; carry {fmtMoney(detail.month.carryIn,detail.budget.currencyCode)}; remaining {fmtMoney(detail.month.remaining,detail.budget.currencyCode)}.</p><div className="table-scroll"><table><caption>Allocated portions supporting this month's usage; negative portions are explicit refunds</caption><thead><tr><th>Date</th><th>Source / record</th><th>Native amount</th><th>Allocated portion</th></tr></thead><tbody>{detail.month.items.map((item,index)=><RecordRow key={item.recordKey+index} record={item} onOpen={()=>{setDetail(null);setAllocating(item.record);}}><td>{item.record.date}</td><td>{item.record.sourceLabel}<br/>{item.record.description}</td><td>{fmtMoney(item.record.amount,item.record.currencyCode)}</td><td>{fmtMoney(item.allocated,item.record.currencyCode)}</td></RecordRow>)}</tbody></table></div>{!detail.month.items.length&&<p>No cleared usage in this month.</p>}</Modal>}
  </StandardCard>;
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
