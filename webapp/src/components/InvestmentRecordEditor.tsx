import { useState } from 'react';
import { Modal } from './Modal';
import { Field, TextInput } from './ui/Field';
import { TimeZoneFields } from './ui/TimeZoneFields';
import { useWorkbookStore } from '../store/workbookStore';
import { usePSXWorkbookStore } from '../store/psxWorkbookStore';
import { useFundsWorkbookStore } from '../store/fundsWorkbookStore';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import type { Adjustment, WatchlistItem } from '../types/workbook';

export function InvestmentRecordEditor({ market, adjustment, watchlist, onClose }: { market: 'qse' | 'psx' | 'funds'; adjustment?: Adjustment; watchlist?: WatchlistItem; onClose: () => void }) {
  const [original] = useState(() => structuredClone(adjustment ?? watchlist!));
  const [draft, setDraft] = useState(() => structuredClone({ ...adjustment, ...watchlist }));
  const [error, setError] = useState('');
  const ensureSignedIn = useEnsureSignedIn();
  const save = async () => {
    if (adjustment && (!draft.date || !Number.isFinite(draft.amount)) || watchlist && (!Number.isFinite(draft.target) || draft.target! <= 0 || draft.current !== undefined && (!Number.isFinite(draft.current) || draft.current < 0))) return setError('Enter valid values.');
    if (!(await ensureSignedIn('Sign in to edit this record.'))) return;
    const store = market === 'qse' ? useWorkbookStore.getState() : market === 'psx' ? usePSXWorkbookStore.getState() : useFundsWorkbookStore.getState();
    if (adjustment) {
      const index = store.workbook.adjustments.findIndex(row => row.id === adjustment.id);
      if (index < 0 || JSON.stringify(store.workbook.adjustments[index]) !== JSON.stringify(original)) return setError('This record changed. Reopen its editor.');
      store.updateAdjustment(index, { date: draft.date!, time: draft.time, timezone: draft.timezone, amount: draft.amount!, note: draft.note });
    } else if (watchlist) {
      const current = store.workbook.watchlist.find(row => row.ticker === watchlist.ticker);
      if (JSON.stringify(current) !== JSON.stringify(original)) return setError('This record changed. Reopen its editor.');
      store.updateWatchlistItem(watchlist.ticker, { target: draft.target!, current: draft.current });
    }
    onClose();
  };
  return <Modal title={adjustment ? 'Edit adjustment' : 'Edit watchlist item'} onClose={onClose}><div className="row gap-sm">{adjustment ? <>
    <Field label="Date"><TextInput type="date" value={draft.date} onChange={event => setDraft(row => ({ ...row, date: event.target.value }))} /></Field>
    <Field label="Amount"><TextInput type="number" step="0.01" value={draft.amount} onChange={event => setDraft(row => ({ ...row, amount: Number(event.target.value) }))} /></Field>
    <Field label="Description"><TextInput value={draft.note ?? ''} onChange={event => setDraft(row => ({ ...row, note: event.target.value }))} /></Field>
    <TimeZoneFields time={draft.time} timezone={draft.timezone} onTimeChange={time => setDraft(row => ({ ...row, time }))} onTimezoneChange={timezone => setDraft(row => ({ ...row, timezone }))} />
  </> : <>
    <Field label="Ticker"><TextInput value={watchlist?.ticker} disabled /></Field>
    <Field label="Target price"><TextInput type="number" step="any" min="0" value={draft.target} onChange={event => setDraft(row => ({ ...row, target: Number(event.target.value) }))} /></Field>
    <Field label="Current price"><TextInput type="number" step="any" min="0" value={draft.current ?? ''} onChange={event => setDraft(row => ({ ...row, current: event.target.value === '' ? undefined : Number(event.target.value) }))} /></Field>
  </>}</div>{error && <p role="alert">{error}</p>}<div className="d-flex justify-end mt-md"><button className="btn" onClick={() => void save()}>Save</button></div></Modal>;
}
