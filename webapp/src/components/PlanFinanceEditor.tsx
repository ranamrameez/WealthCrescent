import { useState } from 'react';
import { PlanEditorModal } from './PlanEditorModal';
import { Field, Select } from './ui/Field';
import { useBankWorkbookStore } from '../store/bankWorkbookStore';
import { useCreditCardWorkbookStore } from '../store/creditCardWorkbookStore';
import { useCashWorkbookStore } from '../store/cashWorkbookStore';
import { useRentalsWorkbookStore } from '../store/rentalsWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../store/subscriptionsWorkbookStore';
import { useEnabledCurrencies } from '../hooks/useEnabledCurrencies';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { assignPlanFinance, deleteFinancePlan, readFinancePlans, writeFinancePlan, type PlanRecord } from '../lib/financePlans';
import { toast } from './Toast';

/** One finance selection updates a generated plan's unfulfilled children. */
export function PlanFinanceEditor({ records, onClose }: { records: PlanRecord[]; onClose: () => void }) {
  const [snapshot] = useState(() => structuredClone(records.filter(row => !row.plan.executed)));
  const accounts = useBankWorkbookStore(s => s.workbook.settings.accounts);
  const cards = useCreditCardWorkbookStore(s => s.workbook.cards);
  const defaultCurrency = useCashWorkbookStore(s => s.workbook.settings.defaultCurrency);
  const [module,setModule] = useState<'cash'|'bank'|'creditCard'>('bank');
  const [ref,setRef] = useState('');
  const [currency,setCurrency] = useState(defaultCurrency);
  const currencies = useEnabledCurrencies(currency);
  const [busy,setBusy] = useState(false);
  const ensureSignedIn = useEnsureSignedIn();
  const options = module === 'bank' ? accounts : cards;
  const selected = options.find(item => item.id === ref && item.isActive !== false);
  const save = async () => {
    if (!snapshot.length) return toast('There are no unfulfilled items to relink.');
    if (module !== 'cash' && !selected) return toast('Choose an active finance.');
    setBusy(true);
    try {
      if (!(await ensureSignedIn('Sign in to link this plan.'))) return;
      const current = readFinancePlans();
      if (snapshot.some(row => JSON.stringify(current.find(item => item.module === row.module && item.plan.id === row.plan.id)?.plan) !== JSON.stringify(row.plan))) return toast('A plan item changed. Reopen the finance editor.');
      const target = {module,ref,currencyCode:module === 'cash' ? currency : selected!.currencyCode};
      const properties=useRentalsWorkbookStore.getState().workbook.settings.properties;
      if (snapshot.some(({plan})=>'propertyId' in plan && (module==='creditCard' || properties.find(p=>p.id===plan.propertyId)?.currencyCode!==target.currencyCode))) return toast('Rent plans link to Cash or a bank account in the property currency.');
      const updated = snapshot.map(row => ({row,plan:assignPlanFinance(row.plan,target)}));
      updated.forEach(({row,plan}) => { const destination='propertyId' in plan ? 'rentals' : module; writeFinancePlan(destination,plan,row.module === destination); if (row.module !== destination) deleteFinancePlan({module:row.module,id:row.plan.id}); });
      for (const {plan} of snapshot) {
        if ('propertyId' in plan && module!=='creditCard') useRentalsWorkbookStore.getState().updateProperty(plan.propertyId,{plannedFinance:{...target,module}});
        if ('sourceSubscriptionId' in plan && plan.sourceSubscriptionId) useSubscriptionsWorkbookStore.getState().updateEntry(plan.sourceSubscriptionId,{paidVia:module==='cash' ? {module:'cash'} : {module,ref}});
      }
      onClose();
    } finally { setBusy(false); }
  };
  return <PlanEditorModal title="Link plan to finance" onClose={onClose}>
    <p className="text-muted">Choose one finance for all {snapshot.length} unfulfilled items. Dates, amounts, and fulfilled history are preserved. Amounts use the selected finance's currency.</p>
    <div className="row gap-sm"><Field label="Finance module"><Select value={module} onChange={event => {setModule(event.target.value as typeof module);setRef('');}}><option value="bank">Bank account</option><option value="cash">Cash</option><option value="creditCard">Credit card</option></Select></Field>
    {module === 'cash' ? <Field label="Currency"><Select value={currency} onChange={event=>setCurrency(event.target.value)}>{currencies.map(c=><option key={c.code} value={c.code}>{c.code}</option>)}</Select></Field> : <Field label="Finance"><Select value={ref} onChange={event=>setRef(event.target.value)}><option value="">Choose finance</option>{options.filter(item=>item.isActive!==false).map(item=><option key={item.id} value={item.id}>{item.name} ({item.currencyCode})</option>)}</Select></Field>}</div>
    <div className="row gap-sm"><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={()=>void save()}>Save finance link</button></div>
  </PlanEditorModal>;
}
