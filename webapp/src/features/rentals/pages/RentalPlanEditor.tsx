import { useState } from 'react';
import { DateInput, Field, Select, TextInput } from '../../../components/ui/Field';
import { toast } from '../../../components/Toast';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { usePlannedRentalsWorkbookStore } from '../../../store/plannedRentalsWorkbookStore';
import type { PlannedRentalEntry } from '../../../types/plannedRentals';

export function RentalPlanEditor({ propertyId, plan, onClose }: { propertyId: string; plan?: PlannedRentalEntry; onClose: () => void }) {
  const [draft, setDraft] = useState<PlannedRentalEntry>(() => plan ?? {
    id: crypto.randomUUID(), propertyId, date: new Date().toISOString().slice(0, 10), type: 'RENT_INCOME', amount: 0,
  });
  const ensureSignedIn = useEnsureSignedIn();
  const save = async () => {
    if (!draft.date || !Number.isFinite(draft.amount) || draft.amount <= 0) return toast('Enter a date and a positive amount.');
    if (!(await ensureSignedIn('Sign in to save this plan.'))) return;
    const store = usePlannedRentalsWorkbookStore.getState();
    if (plan) store.updateEntry(plan.id, draft);
    else store.addEntry(draft);
    onClose();
  };
  return <div className="mt-md mb-md">
    <h4>{plan ? 'Edit plan' : 'Add plan'}</h4>
    <div className="row">
      <Field label="Date"><DateInput value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></Field>
      <Field label="Type"><Select value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value as PlannedRentalEntry['type'] })}><option value="RENT_INCOME">Rent income</option><option value="EXPENSE">Expense</option></Select></Field>
      <Field label="Amount"><input type="number" min="0" step="any" value={draft.amount} onChange={event => setDraft({ ...draft, amount: Number(event.target.value) })} /></Field>
      <Field label="Description"><TextInput value={draft.note ?? ''} onChange={event => setDraft({ ...draft, note: event.target.value })} /></Field>
      <Field label="Category"><TextInput value={draft.category ?? ''} onChange={event => setDraft({ ...draft, category: event.target.value })} /></Field>
    </div>
    <button className="btn small" onClick={save}>Save plan</button>{' '}
    <button className="btn secondary small" onClick={onClose}>Cancel</button>
  </div>;
}
