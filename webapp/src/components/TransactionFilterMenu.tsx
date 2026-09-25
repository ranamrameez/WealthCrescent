import { useState } from 'react';
import { Modal } from './Modal';
import { DateInput, Field, Select } from './ui/Field';
import { currentMonthRange, presetDateRange } from '../lib/dateRange';
import type { TransactionPageFilters, TransactionPeriod } from '../hooks/useUrlTransactionFilters';
import { FilterIcon } from './icons';
export function TransactionFilterMenu({value,categories,activeCount,onChange,onClear}:{value:TransactionPageFilters;categories:string[];activeCount:number;onChange:(patch:Partial<TransactionPageFilters>)=>void;onClear:()=>void;}){
 const [open,setOpen]=useState(false);
 const applyPreset=(period:TransactionPeriod)=>{if(period==='since-month'){onChange({period,fromDate:currentMonthRange().startDate,toDate:''});return;}if(period==='custom'){onChange({period});return;}const r=presetDateRange(period);onChange({period,fromDate:r.startDate,toDate:''});};
 return <><button type="button" className="btn secondary small topbar-filter-btn" onClick={()=>setOpen(true)}><FilterIcon size={14}/> Filters{activeCount?` (${activeCount})`:''}</button>
 {open&&<Modal title="Page filters" onClose={()=>setOpen(false)}>
  <div className="filter-preset-row">{(['since-month','1','3','6','12','ytd','custom'] as TransactionPeriod[]).map(p=><button key={p} type="button" className={`chip${value.period===p?' active':''}`} onClick={()=>applyPreset(p)}>{p==='since-month'?'Since month start':p==='1'?'1M':p==='ytd'?'YTD':p==='custom'?'Custom':`${p}M`}</button>)}</div>
  <div className="filter-fields-grid">
   <Field label="From"><DateInput value={value.fromDate} max={value.toDate||undefined} onChange={e=>onChange({period:'custom',fromDate:e.target.value})}/></Field>
   <Field label="To (blank = no end date)"><DateInput value={value.toDate} min={value.fromDate||undefined} onChange={e=>onChange({period:'custom',toDate:e.target.value})}/></Field>
   <Field label="Direction"><Select value={value.direction} onChange={e=>onChange({direction:e.target.value as TransactionPageFilters['direction']})}><option value="all">All</option><option value="in">Money in</option><option value="out">Money out</option></Select></Field>
   <Field label="Category"><Select value={value.category} onChange={e=>onChange({category:e.target.value})}><option value="all">All categories</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</Select></Field>
   <Field label="Source"><Select value={value.source} onChange={e=>onChange({source:e.target.value as TransactionPageFilters['source']})}><option value="all">All</option><option value="manual">Manual</option><option value="statement-import">Imported</option></Select></Field>
  </div>
  <div className="modal-footer-actions"><button type="button" className="btn secondary small" onClick={onClear}>Reset</button><button type="button" className="btn small" onClick={()=>setOpen(false)}>Done</button></div>
 </Modal>}</>;
}
