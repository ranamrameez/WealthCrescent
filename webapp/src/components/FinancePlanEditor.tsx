import { useState } from 'react';
import { PlanEditorModal } from './PlanEditorModal';
import { Field, Select, TextInput } from './ui/Field';
import { FormulaInput } from './ui/FormulaInput';
import { RecurrenceFields } from './ui/RecurrenceFields';
import { DirectionChips } from './ui/DirectionChips';
import { resolveNumericInput } from '../lib/mathExpression';
import { validBatchDate } from './batchEditModel';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { toast } from './Toast';
import { useBankWorkbookStore } from '../store/bankWorkbookStore';
import { useCreditCardWorkbookStore } from '../store/creditCardWorkbookStore';
import { useRentalsWorkbookStore } from '../store/rentalsWorkbookStore';
import { useCashWorkbookStore } from '../store/cashWorkbookStore';
import { useEnabledCurrencies } from '../hooks/useEnabledCurrencies';
import { deleteFinancePlan, planDescription, readFinancePlans, signedPlanAmount, writeFinancePlan, type PlanModule, type PlanReference, type FinancePlan } from '../lib/financePlans';
import type { CreditCardTransactionKind } from '../types/creditCard';
import type { RecurrenceRule } from '../types/recurrence';
import { occurrenceCompleted } from '../lib/calc/planOccurrences';

export interface PlanFinance { module: PlanModule; ref?: string; currencyCode?: string }
export function FinancePlanEditor({ reference, initialFinance, occurrenceDate, onClose }: {
  reference?: PlanReference; initialFinance?: PlanFinance; occurrenceDate?: string; onClose: () => void;
}) {
  const [original] = useState(() => reference && readFinancePlans().find(row => row.module === reference.module && row.plan.id === reference.id)?.plan);
  const linkedFinance=original && 'finance' in original ? original.finance : undefined;
  const accounts = useBankWorkbookStore(s => s.workbook.settings.accounts);
  const cards = useCreditCardWorkbookStore(s => s.workbook.cards);
  const properties = useRentalsWorkbookStore(s => s.workbook.settings.properties);
  const defaultCurrency = useCashWorkbookStore(s => s.workbook.settings.defaultCurrency);
  const [module, setModule] = useState<PlanModule>(linkedFinance?.module ?? reference?.module ?? initialFinance?.module ?? 'cash');
  const [ref, setRef] = useState(linkedFinance?.ref ?? (original && 'accountId' in original ? original.accountId : original && 'cardId' in original ? original.cardId : original && 'propertyId' in original ? original.propertyId : initialFinance?.ref ?? ''));
  const [currency, setCurrency] = useState(linkedFinance?.currencyCode ?? (original && 'currencyCode' in original ? original.currencyCode : initialFinance?.currencyCode ?? defaultCurrency));
  const currencies = useEnabledCurrencies(currency);
  const [date, setDate] = useState(occurrenceDate ?? original?.date ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(original ? String(Math.abs(original.amount)) : '');
  const [direction, setDirection] = useState<'in' | 'out'>(original && signedPlanAmount(original) < 0 ? 'out' : 'in');
  const [cardKind,setCardKind]=useState<CreditCardTransactionKind>(original && 'kind' in original ? original.kind : 'charge');
  const [description, setDescription] = useState(original ? planDescription(original) : '');
  const [category, setCategory] = useState(original?.category ?? '');
  const [recurrence, setRecurrence] = useState<RecurrenceRule | undefined>(!occurrenceDate && original && 'recurrence' in original ? original.recurrence : undefined);
  const [busy, setBusy] = useState(false);
  const ensureSignedIn = useEnsureSignedIn();
  const options = module === 'bank' ? accounts : module === 'creditCard' ? cards : module === 'rentals' ? properties : [];
  const selected = options.find(item => item.id === ref);
  const effectiveCurrency = selected?.currencyCode ?? currency;
  const save = async () => {
    const numeric = resolveNumericInput(amount);
    if (!validBatchDate(date) || numeric === null || numeric <= 0) return toast('Enter a valid date and a positive amount.');
    if (module !== 'cash' && (!selected || selected.isActive === false)) return toast('Choose an active finance.');
    const rental = original && 'propertyId' in original ? original : undefined;
    if (rental && module !== 'rentals' && (module === 'creditCard' || properties.find(item => item.id === rental.propertyId)?.currencyCode !== effectiveCurrency)) return toast('Rent plans link to Cash or a bank account in the property currency.');
    if (recurrence && (module === 'rentals' || (recurrence.endDate && recurrence.endDate < date) || (recurrence.cycle === 'custom' && !(recurrence.customDays && recurrence.customDays > 0)))) return toast('Check the recurrence dates and interval.');
    if (reference && !original) return toast('This plan no longer exists.');
    if (original?.executed) return toast('Fulfilled plans cannot be reassigned.');
    if (occurrenceDate && original && 'recurrence' in original && occurrenceCompleted(original, occurrenceDate)) return toast('Fulfilled items cannot be reassigned.');
    setBusy(true);
    try {
      if (!(await ensureSignedIn('Sign in to save this plan.'))) return;
      const latest = reference && readFinancePlans().find(row => row.module === reference.module && row.plan.id === reference.id)?.plan;
      if (reference && JSON.stringify(latest) !== JSON.stringify(original)) return toast('This plan changed. Reopen its editor.');
      if (original && 'recurrence' in original && original.recurrence && !occurrenceDate && module !== reference?.module && (original.completedDates?.length || original.executedThrough)) return toast('Relink an individual occurrence to preserve this series\' completed history.');
      const id = occurrenceDate ? crypto.randomUUID() : original?.id ?? crypto.randomUUID();
      const common = { ...original, id, date, amount: numeric, category, executed: false, recurrence: recurrence ? { ...recurrence, startDate: date } : undefined };
      const destination = rental ? 'rentals' : module;
      const draft: FinancePlan = rental && module !== 'rentals' ? { ...rental, date, amount:numeric, type:direction==='in'?'RENT_INCOME':'EXPENSE', note:description, category, finance:{module:module==='cash'?'cash':'bank',ref:module==='cash'?undefined:ref,currencyCode:effectiveCurrency} }
        : module === 'cash' ? { ...common, type: direction === 'in' ? 'IN' : 'OUT', currencyCode: effectiveCurrency, note: description }
        : module === 'bank' ? { ...common, accountId: ref, amount: direction === 'in' ? numeric : -numeric, description }
        : module === 'creditCard' ? { ...common, cardId: ref, kind: direction === 'in' ? 'payment' : cardKind==='payment'?'charge':cardKind, description }
        : { ...common, propertyId: ref, type: direction === 'in' ? 'RENT_INCOME' : 'EXPENSE', note: description };
      // Keep destination records clean when moving between finance stores.
      if ('accountId' in draft && module !== 'bank') delete (draft as Partial<{accountId: string}>).accountId;
      if ('cardId' in draft && module !== 'creditCard') delete (draft as Partial<{cardId: string}>).cardId;
      if ('propertyId' in draft && destination !== 'rentals') delete (draft as Partial<{propertyId: string}>).propertyId;
      for (const field of destination === 'rentals' ? ['description', 'kind', 'currencyCode'] : module === 'cash' ? ['description', 'kind'] : module === 'bank' ? ['type', 'kind', 'currencyCode', 'note'] : module === 'creditCard' ? ['type', 'currencyCode', 'note'] : ['description', 'kind', 'currencyCode']) Reflect.deleteProperty(draft, field);
      if (occurrenceDate && original && 'recurrence' in original && original.recurrence && reference) {
        writeFinancePlan(reference.module, { ...original, recurrence: { ...original.recurrence, excludedDates: [...new Set([...(original.recurrence.excludedDates ?? []), occurrenceDate])] } }, true);
        writeFinancePlan(module, { ...draft, seriesId: original.id });
      } else {
        writeFinancePlan(destination, draft, !!reference && reference.module === destination);
        if (reference && reference.module !== destination) deleteFinancePlan(reference);
      }
      onClose();
    } finally { setBusy(false); }
  };
  return <PlanEditorModal title={reference ? occurrenceDate ? 'Edit plan item' : 'Edit plan' : 'Add plan'} onClose={onClose}>
    <p className="text-muted mt-0">{occurrenceDate ? 'Choose the finance for this item. Other dates keep their existing finance.' : 'Choose one finance for the plan and its generated items.'}</p>
    <div className="row gap-sm">
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
    <div className="row gap-sm"><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={() => void save()}>Save plan</button></div>
  </PlanEditorModal>;
}
