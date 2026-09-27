import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { CheckIcon } from './icons';
import { fetchProfile, saveModulePreference } from '../lib/firebase/profile';
import { toast } from './Toast';

export const APP_MODULES = [
  ['netWorth', 'Dashboard'], ['stocks', 'Stock Exchanges'], ['funds', 'Funds'], ['bank', 'Banking'],
  ['cash', 'Cash'], ['personalLoans', 'Personal Loans'], ['emi', 'EMI / Loans'], ['rentals', 'Rentals'],
  ['subscriptions', 'Subscriptions'], ['planning', 'Planning'],
] as const;
export type AppModuleKey = typeof APP_MODULES[number][0];
const storageKey = (uid?: string) => `wealthcrescent:modules:${uid ?? 'guest'}`;

export function readSelectedModules(uid?: string): AppModuleKey[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(uid)) ?? 'null');
    if (Array.isArray(saved)) return saved.filter((key): key is AppModuleKey => APP_MODULES.some(([id]) => id === key));
  } catch { /* use defaults */ }
  return APP_MODULES.map(([id]) => id);
}

export function ModuleSelectionModal({ uid, onClose, onSaved }: { uid?: string; onClose: () => void; onSaved?: (modules: AppModuleKey[]) => void }) {
  const [selected, setSelected] = useState<AppModuleKey[]>(() => readSelectedModules(uid));
  useEffect(() => { if (uid) fetchProfile(uid).then((profile) => { if (profile.selectedModules?.length) setSelected(profile.selectedModules.filter((key): key is AppModuleKey => APP_MODULES.some(([id]) => id === key))); }).catch(() => {}); }, [uid]);
  const toggle = (key: AppModuleKey) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const save = async () => {
    if (!uid) { toast('Sign in to save module preferences.'); return; }
    try { await saveModulePreference(uid, selected); localStorage.setItem(storageKey(uid), JSON.stringify(selected)); onSaved?.(selected); onClose(); toast('Module preferences saved.'); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not save module preferences.'); }
  };
  return <Modal title="Choose your modules" onClose={onClose}>
    <p className="text-muted mt-0">Select the areas you want to use. You can change this anytime from Account settings.</p>
    <div className="module-selection-grid">{APP_MODULES.map(([key, label]) => <button type="button" key={key} className={`module-selection-option${selected.includes(key) ? ' selected' : ''}`} onClick={() => toggle(key)} aria-pressed={selected.includes(key)}><span>{label}</span>{selected.includes(key) && <CheckIcon size={15} />}</button>)}</div>
    {!selected.length && <p className="text-loss">Select at least one module.</p>}
    <button className="btn mt-md" disabled={!selected.length} onClick={save}>Save modules</button>
  </Modal>;
}
