import { useState } from 'react';
import { Modal } from './Modal';
import { Field, TextInput } from './ui/Field';
import { AmountInput } from './ui/AmountInput';
import { TimeZoneFields } from './ui/TimeZoneFields';
import { FeeModeControl, feeModeFor } from './ui/FeeModeControl';
import { useWorkbookStore } from '../store/workbookStore';
import { usePSXWorkbookStore } from '../store/psxWorkbookStore';
import { useFundsWorkbookStore } from '../store/fundsWorkbookStore';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { toast } from './Toast';
import type { Transaction } from '../types/workbook';

export function InvestmentTransactionEditor({ transaction, market, onClose }: { transaction: Transaction; market: 'qse' | 'psx' | 'funds'; onClose: () => void }) {
  const [original] = useState(() => structuredClone(transaction));
  const [draft, setDraft] = useState(() => structuredClone(transaction));
  const [error, setError] = useState('');
  const ensureSignedIn = useEnsureSignedIn();
  const update = (patch: Partial<Transaction>) => setDraft(row => ({ ...row, ...patch }));
  const save = async () => {
    if (!draft.date || !draft.ticker.trim() || !Number.isFinite(draft.shares) || draft.shares <= 0 || !Number.isFinite(draft.price) || draft.price <= 0 || draft.feeOverride !== undefined && (!Number.isFinite(draft.feeOverride) || draft.feeOverride < 0)) return setError('Enter a date, ticker, positive shares and price, and a valid fee.');
    if (!(await ensureSignedIn('Sign in to edit this transaction.'))) return;
    const store = market === 'qse' ? useWorkbookStore.getState() : market === 'psx' ? usePSXWorkbookStore.getState() : useFundsWorkbookStore.getState();
    const index = store.workbook.transactions.findIndex(row => row.id === original.id);
    const current = store.workbook.transactions[index];
    if (index < 0 || JSON.stringify(current) !== JSON.stringify(Object.fromEntries(Object.keys(current).map(key => [key, (original as unknown as Record<string, unknown>)[key]])))) return setError('This transaction changed. Close and reopen the editor.');
    const fields = ['date', 'ticker', 'action', 'shares', 'price', 'time', 'timezone', 'feeOverride', 'manualSameDay', 'isPending'] as const;
    store.updateTransaction(index, { ...Object.fromEntries(fields.map(key => [key, draft[key]])), ticker: draft.ticker.trim().toUpperCase() });
    toast('Transaction updated.'); onClose();
  };
  return <Modal title="Edit transaction" onClose={onClose} widthClass="60"><div className="row gap-sm">
    <Field label="Date"><TextInput type="date" value={draft.date} onChange={event => update({ date: event.target.value })} /></Field>
    <Field label="Ticker"><TextInput value={draft.ticker} onChange={event => update({ ticker: event.target.value })} /></Field>
    <Field label="Action"><select value={draft.action} onChange={event => update({ action: event.target.value as Transaction['action'] })}><option value="BUY">Buy</option><option value="SELL">Sell</option></select></Field>
    <Field label="Shares"><AmountInput value={draft.shares} onChange={shares => update({ shares })} /></Field>
    <Field label="Price"><TextInput type="number" min="0" step={market === 'psx' ? '0.01' : market === 'qse' ? '0.001' : '0.0001'} value={draft.price} onChange={event => update({ price: Number(event.target.value) })} /></Field>
    <TimeZoneFields time={draft.time} timezone={draft.timezone} onTimeChange={time => update({ time })} onTimezoneChange={timezone => update({ timezone })} />
    <Field label="Pending"><input type="checkbox" checked={!!draft.isPending} onChange={event => update({ isPending: event.target.checked })} /></Field>
    {market === 'psx' ? <FeeModeControl mode={feeModeFor(draft)} onModeChange={mode => update({ feeOverride: mode === 'manual' ? 0 : undefined, manualSameDay: mode === 'semi' ? false : undefined })} manualSameDay={!!draft.manualSameDay} onManualSameDayChange={manualSameDay => update({ manualSameDay })} feeOverride={draft.feeOverride} onFeeOverrideChange={feeOverride => update({ feeOverride })} tradeAmount={draft.shares * draft.price} /> : <Field label="Fee override (optional)"><TextInput type="number" min="0" step="0.01" value={draft.feeOverride ?? ''} onChange={event => update({ feeOverride: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>}
  </div>{error && <p role="alert">{error}</p>}<div className="d-flex justify-end mt-md"><button className="btn" onClick={() => void save()}>Save</button></div></Modal>;
}
