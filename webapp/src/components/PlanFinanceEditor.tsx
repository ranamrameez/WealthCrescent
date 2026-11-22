import { useState } from 'react';
import { PlanEditorModal } from './PlanEditorModal';
import { Field, Select } from './ui/Field';
import { Notice } from './Notice';
import { useEnabledCurrencies } from '../hooks/useEnabledCurrencies';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { relinkPlannedPayments, type PlanRecord } from '../services/finance/planningService';
import { usePlanningEditorSources } from '../hooks/usePlanning';
import { toast } from './Toast';

/** One finance selection updates a generated plan's unfulfilled children. */
export function PlanFinanceEditor({ records, onClose }: { records: PlanRecord[]; onClose: () => void }) {
  const [snapshot] = useState(() => structuredClone(records.filter(row => !row.plan.executed)));
  const { accounts, cards, properties, defaultCurrency } = usePlanningEditorSources();
  const [module,setModule] = useState<'cash'|'bank'|'creditCard'>('bank');
  const [ref,setRef] = useState('');
  const [currency,setCurrency] = useState(defaultCurrency);
  const [currencyAcknowledged,setCurrencyAcknowledged] = useState(false);
  const currencies = useEnabledCurrencies(currency);
  const [busy,setBusy] = useState(false);
  const ensureSignedIn = useEnsureSignedIn();
  const options = module === 'bank' ? accounts : cards;
  const selected = options.find(item => item.id === ref && item.isActive !== false);
  const targetCurrency = module === 'cash' ? currency : selected?.currencyCode;
  const sourceCurrency = (row: PlanRecord) => {
    const plan = row.plan;
    if ('currencyCode' in plan && typeof plan.currencyCode === 'string') return plan.currencyCode;
    if ('accountId' in plan) return accounts.find(item => item.id === plan.accountId)?.currencyCode;
    if ('cardId' in plan) return cards.find(item => item.id === plan.cardId)?.currencyCode;
    if ('propertyId' in plan) return properties.find(item => item.id === plan.propertyId)?.currencyCode;
    if ('finance' in plan && plan.finance && typeof plan.finance === 'object' && 'currencyCode' in plan.finance && typeof plan.finance.currencyCode === 'string') return plan.finance.currencyCode;
    return undefined;
  };
  const currencyChanges = !!targetCurrency && snapshot.some(row => {
    const source = sourceCurrency(row);
    return !!source && source !== targetCurrency;
  });
  const save = async () => {
    if (!snapshot.length) return toast('There are no unfulfilled items to relink.');
    if (module !== 'cash' && !selected) return toast('Choose an active finance.');
    if (currencyChanges && !currencyAcknowledged) return toast('Confirm the currency change before saving.');
    setBusy(true);
    try {
      if (!(await ensureSignedIn('Sign in to link this plan.'))) return;
      relinkPlannedPayments(snapshot, module, ref, currency, currencyAcknowledged);
      onClose();
    } catch (error) { toast(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };
  return <PlanEditorModal title="Link plan to finance" onClose={onClose}>
    <p className="text-muted">Choose one finance for all {snapshot.length} unfulfilled items. Dates, amounts, and fulfilled history are preserved. No currency conversion is performed.</p>
    <div className="row gap-sm"><Field label="Finance module"><Select value={module} onChange={event => {setModule(event.target.value as typeof module);setRef('');setCurrencyAcknowledged(false);}}><option value="bank">Bank account</option><option value="cash">Cash</option><option value="creditCard">Credit card</option></Select></Field>
    {module === 'cash' ? <Field label="Currency"><Select value={currency} onChange={event=>{setCurrency(event.target.value);setCurrencyAcknowledged(false);}}>{currencies.map(c=><option key={c.code} value={c.code}>{c.code}</option>)}</Select></Field> : <Field label="Finance"><Select value={ref} onChange={event=>{setRef(event.target.value);setCurrencyAcknowledged(false);}}><option value="">Choose finance</option>{options.filter(item=>item.isActive!==false).map(item=><option key={item.id} value={item.id}>{item.name} ({item.currencyCode})</option>)}</Select></Field>}</div>
    {currencyChanges && <Notice tone="warning">The selected currency differs from at least one payment. Amounts keep their current numbers and will be interpreted as {targetCurrency}; review them before continuing.</Notice>}
    {currencyChanges && <label className="currency-change-confirm"><input type="checkbox" checked={currencyAcknowledged} onChange={event=>setCurrencyAcknowledged(event.target.checked)}/> I understand that amounts will not be converted.</label>}
    <div className="row gap-sm"><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || (currencyChanges && !currencyAcknowledged)} onClick={()=>void save()}>Save finance link</button></div>
  </PlanEditorModal>;
}
