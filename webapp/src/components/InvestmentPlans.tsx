import { useState } from 'react';
import { useWorkbookStore } from '../store/workbookStore';
import { usePSXWorkbookStore } from '../store/psxWorkbookStore';
import { useFundsWorkbookStore } from '../store/fundsWorkbookStore';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { resolveNumericInput } from '../lib/mathExpression';
import { fmtMoney } from '../lib/format';
import type { TransactionPageFilters } from '../hooks/useUrlTransactionFilters';
import type { TradePlanLeg } from '../types/workbook';
import { PlanEditorModal } from './PlanEditorModal';
import { DateValue } from './DateValue';
import { FeeModeControl, feeModeFor } from './ui/FeeModeControl';
import { FormulaInput } from './ui/FormulaInput';
import { Field, DateInput } from './ui/Field';
import { validBatchDate } from './batchEditModel';
import { confirmDialog } from './ConfirmDialog';

/** The same saved plans, scoped to the module, broker, fund or stock being viewed. */
export function InvestmentPlans({ market, items, filters }: { market: 'qse' | 'psx' | 'funds'; items: { id: string; name: string; currency: string }[]; filters?: TransactionPageFilters }) {
  const useStore = market === 'qse' ? useWorkbookStore : market === 'psx' ? usePSXWorkbookStore : useFundsWorkbookStore;
  const plans = useStore().workbook.tradePlans;
  const ensureSignedIn = useEnsureSignedIn();
  const [draft, setDraft] = useState<{ planId?: string; index?: number; original?: string; ticker: string; action: 'BUY' | 'SELL'; date: string; shares: string; price: string; manualSameDay?: boolean; feeOverride?: number } | null>(null);
  const [error, setError] = useState('');
  const rows = plans.flatMap(plan => plan.legs.map((leg, index) => ({ plan, leg, index }))).filter(({ leg }) => items.some(item => item.id === leg.ticker)
    && (!filters?.fromDate || !leg.date || leg.date >= filters.fromDate) && (!filters?.toDate || !leg.date || leg.date <= filters.toDate)
    && (!filters || filters.direction === 'all' || (filters.direction === 'in' ? leg.action === 'BUY' : leg.action === 'SELL'))
    && (!filters || filters.source !== 'statement-import'));
  const save = async () => {
    if (!draft) return;
    const shares = resolveNumericInput(draft.shares), price = resolveNumericInput(draft.price);
    if (!items.some(item => item.id === draft.ticker) || shares === null || price === null || shares <= 0 || price <= 0 || !validBatchDate(draft.date)) { setError('Choose an item, valid date, and positive units and price.'); return; }
    if (!(await ensureSignedIn('Sign in to save investment plans.'))) return;
    const state = useStore.getState();
    const leg: TradePlanLeg = { ticker: draft.ticker, action: draft.action, date: draft.date, shares, price, manualSameDay:draft.manualSameDay, feeOverride:draft.feeOverride };
    if (draft.planId) {
      const plan = state.workbook.tradePlans.find(item => item.id === draft.planId);
      if (!plan || draft.index === undefined || plan.legs[draft.index]?.executed || JSON.stringify(plan.legs[draft.index]) !== draft.original) { setError('This plan changed. Close and reopen the editor.'); return; }
      state.updateTradePlan(plan.id, { legs: plan.legs.map((item, index) => index === draft.index ? { ...item, ...leg } : item) });
    } else state.addTradePlan({ id: crypto.randomUUID(), name: items.find(item => item.id === draft.ticker)?.name ?? draft.ticker, createdAt: new Date().toISOString(), defaultTicker: draft.ticker, legs: [leg] });
    setDraft(null);
  };
  return <>
    <button className="btn secondary small" disabled={!items.length} onClick={() => { setError(''); setDraft({ ticker: items[0]?.id ?? '', action: 'BUY', date: new Date().toISOString().slice(0, 10), shares: '', price: '' }); }}>+ Add plan</button>
    <div className="table-scroll mt-12"><table><thead><tr><th>Date</th><th>Item</th><th>Plan</th><th>Units</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(({ plan, leg, index }) => <tr key={`${plan.id}:${index}`}><td>{leg.date ? <DateValue value={leg.date} /> : 'Unscheduled'}</td><td>{items.find(item => item.id === leg.ticker)?.name}</td><td>{leg.action === 'BUY' ? 'Buy' : 'Sell'}</td><td>{leg.shares}</td><td>{fmtMoney(leg.shares * leg.price, items.find(item => item.id === leg.ticker)?.currency ?? '')}</td><td>{leg.executed ? 'Done' : 'Planned'}</td><td>{!leg.executed && <>
      <button className="btn secondary small" onClick={() => { setError(''); setDraft({ planId: plan.id, index, original: JSON.stringify(leg), ticker: leg.ticker, action: leg.action, date: leg.date ?? '', shares: String(leg.shares), price: String(leg.price), manualSameDay:leg.manualSameDay, feeOverride:leg.feeOverride }); }}>Edit</button>{' '}
      <button className="btn secondary small" onClick={async () => { if (!(await confirmDialog('Add this planned trade to transaction history?', 'Mark plan as done?')) || !(await ensureSignedIn('Sign in to fulfill this plan.'))) return; const current = useStore.getState().workbook.tradePlans.find(item => item.id === plan.id); if (JSON.stringify(current?.legs[index]) === JSON.stringify(leg)) useStore.getState().executeTradePlanLeg(plan.id, index); }}>Mark done</button>{' '}
      <button className="btn secondary small" onClick={async () => { if (!(await confirmDialog('Remove this unfulfilled trade from the plan?')) || !(await ensureSignedIn('Sign in to remove this plan.'))) return; const current = useStore.getState().workbook.tradePlans.find(item => item.id === plan.id); if (current && !current.legs[index]?.executed && JSON.stringify(current.legs[index]) === JSON.stringify(leg)) useStore.getState().updateTradePlan(plan.id, { legs: current.legs.filter((_, i) => i !== index) }); }}>Remove</button>
    </>}</td></tr>)}</tbody></table>{!rows.length && <p className="text-muted">No plans in this view.</p>}</div>
    {draft && <PlanEditorModal title={draft.planId ? 'Edit investment plan' : 'Add investment plan'} onClose={() => setDraft(null)}><div className="row gap-sm">
      <Field label="Item"><select value={draft.ticker} onChange={e => setDraft({ ...draft, ticker: e.target.value })}>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Action"><select value={draft.action} onChange={e => setDraft({ ...draft, action: e.target.value as 'BUY' | 'SELL' })}><option value="BUY">Buy</option><option value="SELL">Sell</option></select></Field>
      <Field label="Date"><DateInput value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></Field>
      <Field label="Units"><FormulaInput value={draft.shares} onValueChange={shares => setDraft({ ...draft, shares })} /></Field>
      <Field label="Price per unit"><FormulaInput value={draft.price} onValueChange={price => setDraft({ ...draft, price })} /></Field>
    </div><FeeModeControl mode={feeModeFor(draft)} onModeChange={mode=>setDraft({...draft,manualSameDay:mode==='semi'?false:undefined,feeOverride:mode==='manual'?0:undefined})} manualSameDay={!!draft.manualSameDay} onManualSameDayChange={manualSameDay=>setDraft({...draft,manualSameDay})} feeOverride={draft.feeOverride} onFeeOverrideChange={feeOverride=>setDraft({...draft,feeOverride})} tradeAmount={(resolveNumericInput(draft.shares)??0)*(resolveNumericInput(draft.price)??0)} />{error && <p role="alert">{error}</p>}<button className="btn mt-12" onClick={() => void save()}>Save plan</button></PlanEditorModal>}
  </>;
}
