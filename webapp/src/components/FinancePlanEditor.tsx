import { useState } from 'react';
import { PlanEditorModal } from './PlanEditorModal';
import { Field, Select, TextInput } from './ui/Field';
import { FormulaInput } from './ui/FormulaInput';
import { RecurrenceFields } from './ui/RecurrenceFields';
import { DirectionChips } from './ui/DirectionChips';
import { Notice } from './Notice';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { toast } from './Toast';
import { useEnabledCurrencies } from '../hooks/useEnabledCurrencies';
import { savePlannedPayment, planDescription, signedPlanAmount, type PlanModule, type PlanReference } from '../services/finance/planningService';
import { usePlanningEditorSources } from '../hooks/usePlanning';
import type { CreditCardTransactionKind } from '../types/creditCard';
import type { RecurrenceRule } from '../types/recurrence';

export interface PlanFinance { module: PlanModule; ref?: string; currencyCode?: string }
export function FinancePlanEditor({ reference, initialFinance, occurrenceDate, initialGroupId, onClose }: {
  reference?: PlanReference; initialFinance?: PlanFinance; occurrenceDate?: string; initialGroupId?: string; onClose: () => void;
}) {
  const { accounts, cards, properties, defaultCurrency, groups, records } = usePlanningEditorSources();
  const [original] = useState(() => reference && records.find(row => row.module === reference.module && row.plan.id === reference.id)?.plan);
  const linkedFinance=original && 'finance' in original ? original.finance : undefined;
  const [groupId, setGroupId] = useState(original?.groupId ?? initialGroupId ?? '');
  const [module, setModule] = useState<PlanModule>(linkedFinance?.module ?? reference?.module ?? initialFinance?.module ?? 'cash');
  const [ref, setRef] = useState(linkedFinance?.ref ?? (original && 'accountId' in original ? original.accountId : original && 'cardId' in original ? original.cardId : original && 'propertyId' in original ? original.propertyId : initialFinance?.ref ?? ''));
  const [currency, setCurrency] = useState(linkedFinance?.currencyCode ?? (original && 'currencyCode' in original ? original.currencyCode : initialFinance?.currencyCode ?? defaultCurrency));
  const currencies = useEnabledCurrencies(currency);
  const [date, setDate] = useState(occurrenceDate ?? original?.date ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(original ? String(Math.abs(original.amount)) : '');
  const [direction, setDirection] = useState<'in' | 'out'>(original ? signedPlanAmount(original) < 0 ? 'out' : 'in' : initialGroupId ? 'out' : 'in');
  const [cardKind,setCardKind]=useState<CreditCardTransactionKind>(original && 'kind' in original ? original.kind : 'charge');
  const [description, setDescription] = useState(original ? planDescription(original) : '');
  const [category, setCategory] = useState(original?.category ?? '');
  const [recurrence, setRecurrence] = useState<RecurrenceRule | undefined>(!occurrenceDate && original && 'recurrence' in original ? original.recurrence : undefined);
  const [busy, setBusy] = useState(false);
  const ensureSignedIn = useEnsureSignedIn();
  const options = module === 'bank' ? accounts : module === 'creditCard' ? cards : module === 'rentals' ? properties : [];
  const selected = options.find(item => item.id === ref);
  const effectiveCurrency = selected?.currencyCode ?? currency;
  const originalCurrency = original && ('currencyCode' in original && typeof original.currencyCode === 'string'
    ? original.currencyCode
    : 'accountId' in original ? accounts.find(item => item.id === original.accountId)?.currencyCode
      : 'cardId' in original ? cards.find(item => item.id === original.cardId)?.currencyCode
        : 'propertyId' in original ? properties.find(item => item.id === original.propertyId)?.currencyCode
          : 'finance' in original && original.finance && typeof original.finance === 'object' && 'currencyCode' in original.finance && typeof original.finance.currencyCode === 'string'
            ? original.finance.currencyCode
            : undefined);
  const currencyChanged = !!originalCurrency && originalCurrency !== effectiveCurrency;
  const save = async (addAnother = false) => {
    setBusy(true);
    try {
      if (!(await ensureSignedIn('Sign in to save this plan.'))) return;
      savePlannedPayment({ reference, original, occurrenceDate, groupId, module, ref, currency, date, amount, direction, cardKind, description, category, recurrence });
      if (addAnother) { setAmount(''); setDescription(''); setRecurrence(undefined); toast('Payment added. Enter the next payment.'); }
      else onClose();
    } catch (error) { toast(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };
  return <PlanEditorModal title={groupId ? reference ? 'Edit payment' : 'Add payment' : reference ? occurrenceDate ? 'Edit plan item' : 'Edit plan' : 'Add plan'} onClose={onClose}>
    <p className="text-muted mt-0">{occurrenceDate ? 'Choose the finance for this item. Other dates keep their existing finance.' : 'Choose one finance for the plan and its generated items.'}</p>
    <div className="row gap-sm">
      {!!groups?.length && <Field label="Parent plan"><Select value={groupId} onChange={event => setGroupId(event.target.value)}><option value="">Standalone payment</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></Field>}
      <Field label="Finance module"><Select value={module} onChange={event => { setModule(event.target.value as PlanModule); setRef(''); }}><option value="cash">Cash</option><option value="bank">Bank account</option><option value="creditCard">Credit card</option><option value="rentals">Rental property</option></Select></Field>
      {module === 'cash' ? <Field label="Currency"><Select value={currency} onChange={event => setCurrency(event.target.value)}>{currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</Select></Field> : <Field label="Finance"><Select value={ref} onChange={event => setRef(event.target.value)}><option value="">Choose finance</option>{options.filter(item => item.isActive !== false || item.id === ref).map(item => <option key={item.id} value={item.id}>{item.name} ({item.currencyCode})</option>)}</Select></Field>}
      <Field label="Expected date"><TextInput type="date" value={date} onChange={event => setDate(event.target.value)} /></Field>
      <Field label="Direction"><DirectionChips value={direction} onChange={next=>{setDirection(next);if(module==='creditCard')setCardKind(next==='in'?'payment':'charge');}} labels={module === 'bank' ? {in:'Deposit',out:'Withdrawal'} : module === 'creditCard' ? {in:'Payment',out:'Charge'} : module === 'rentals' ? {in:'Rent income',out:'Expense'} : {in:'Income',out:'Expense'}} /></Field>
      {module==='creditCard' && <Field label="Card activity"><Select value={direction==='in'?'payment':cardKind==='payment'?'charge':cardKind} onChange={event=>{const kind=event.target.value as CreditCardTransactionKind;setCardKind(kind);setDirection(kind==='payment'?'in':'out');}}><option value="charge">Charge</option><option value="payment">Payment</option><option value="fee">Fee</option><option value="markup">Markup</option><option value="cashAdvance">Cash advance</option></Select></Field>}
      <Field label={`Amount (${effectiveCurrency})`}><FormulaInput value={amount} onValueChange={setAmount} /></Field>
      <Field label="Description"><TextInput value={description} onChange={event => setDescription(event.target.value)} /></Field>
      <Field label="Category"><TextInput value={category} onChange={event => setCategory(event.target.value)} /></Field>
      {!occurrenceDate && module !== 'rentals' && <RecurrenceFields startDate={date} value={recurrence} onChange={setRecurrence} />}
    </div>
    {currencyChanged && <Notice tone="warning">No currency conversion is applied. The amount keeps its current number and will be interpreted as {effectiveCurrency}; adjust it above if needed.</Notice>}
    <div className="row gap-sm"><button className="btn secondary" onClick={onClose}>Cancel</button>{!reference && groupId && <button className="btn secondary" disabled={busy} onClick={() => void save(true)}>Save and add another</button>}<button className="btn" disabled={busy} onClick={() => void save()}>{groupId ? 'Save payment' : 'Save plan'}</button></div>
  </PlanEditorModal>;
}
