import { useState } from 'react';
import { PlanEditorModal } from './PlanEditorModal';
import { Field, TextInput } from './ui/Field';
import { StandardButton } from './standard';
import { savePlanGroup } from '../lib/financePlans';
import type { FinancePlanGroup } from '../types/financePlanGroup';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { toast } from './Toast';

export function FinancePlanGroupEditor({ original, onClose, onSaved }: { original?: FinancePlanGroup; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(original?.name ?? '');
  const [notes, setNotes] = useState(original?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const ensureSignedIn = useEnsureSignedIn();
  const save = async () => {
    if (!name.trim()) return toast('Enter a plan name.');
    setBusy(true);
    try {
      if (!await ensureSignedIn('Sign in to save this plan.')) return;
      const id = original?.id ?? crypto.randomUUID();
      savePlanGroup({ id, name, notes, createdAt: original?.createdAt ?? new Date().toISOString() }, original);
      toast(original ? 'Plan updated.' : 'Plan created. Add its payments next.');
      onSaved(id);
    } catch (error) { toast(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <PlanEditorModal title={original ? 'Edit plan' : 'Create plan'} onClose={onClose}>
    <Field label="Plan name" required><TextInput value={name} maxLength={120} onChange={event => setName(event.target.value)} placeholder="For example, home renovation"/></Field>
    <Field label="Plan notes"><textarea value={notes} onChange={event => setNotes(event.target.value)}/></Field>
    <p className="text-muted">Add individual payments with their own dates, amounts and paying accounts after creating the plan.</p>
    <div className="row gap-sm"><StandardButton tone="secondary" onClick={onClose}>Cancel</StandardButton><StandardButton disabled={busy || !name.trim()} onClick={() => void save()}>{original ? 'Save changes' : 'Create plan'}</StandardButton></div>
  </PlanEditorModal>;
}
