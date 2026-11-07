import { CLOUD_PATH_SUFFIX, CREATE_EMPTY } from '../../../services/appData/workbookRegistry';
import { removeAllFinancialData } from '../../../services/appData/removeAllFinancialData';
import { PageHeading } from '../../../components/PageHeading';
import { BackButton } from '../../../components/BackButton';
import { ref, set } from 'firebase/database';
import { useRef, useState } from 'react';
import { Card } from '../../../components/Card';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { Notice } from '../../../components/Notice';
import { toast } from '../../../components/Toast';
import { db, firebaseReady } from '../../../lib/firebase/client';
import { useAuthState } from '../../../lib/firebase/useAuthState';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
import { stripUndefinedDeep } from '../../../lib/firebase/useWorkbookCloudSync';
import { useWorkbookStore } from '../../../store/workbookStore';
import { usePSXWorkbookStore } from '../../../store/psxWorkbookStore';
import { useBankWorkbookStore } from '../../../store/bankWorkbookStore';
import { useCreditCardWorkbookStore } from '../../../store/creditCardWorkbookStore';
import { useCashWorkbookStore } from '../../../store/cashWorkbookStore';
import { useEMIWorkbookStore } from '../../../store/emiWorkbookStore';
import { useFundsWorkbookStore } from '../../../store/fundsWorkbookStore';
import { usePersonalLoansWorkbookStore } from '../../../store/personalLoansWorkbookStore';
import { useRentalsWorkbookStore } from '../../../store/rentalsWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../../../store/subscriptionsWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../../store/plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../../store/plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../../store/plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../../../store/plannedRentalsWorkbookStore';
import { useInterEntityTransfersStore } from '../../../store/interEntityTransfersStore';
import { useNetWorthSnapshotsWorkbookStore } from '../../../store/netWorthSnapshotsWorkbookStore';
import { useCategoryStore } from '../../../store/categoryStore';
import { useCategoryGroupStore } from '../../../store/categoryGroupStore';

const today = () => new Date().toISOString().slice(0, 10);

/** README item 77 (user-requested, 2026-08-26): whole-app import/export,
 * not just per-module — every module already exports/imports its own
 * workbook as JSON from its own Settings tab (unchanged, still there);
 * this is the same idea at the app level. Every one of this app's stores
 * exposes the exact same `{workbook, setWorkbook}` shape
 * (`MinimalWorkbookStore`, see CLAUDE.md's own design-decisions note), so
 * a whole-app export is just "read `.workbook` from every store and
 * combine into one object keyed by module name" — the SAME key names the
 * app's own Firebase RTDB structure already uses, so a file exported here
 * is also directly comparable to (though not identical in shape to — this
 * omits the `_updated` timestamp Firebase adds) a raw RTDB export for the
 * same account. Import is a straight per-module `setWorkbook()`, exactly
 * the same call each module's own JSON import already makes — nothing new
 * about HOW a workbook gets loaded, only that this does it for every
 * module in one file/one click instead of one at a time.
 *
 * `creditCards` was a real gap here, user-reported (2026-09-11): the
 * Credit Card module (added after this whole-app export was first built)
 * was never added to any of the four maps below, so a "full backup" never
 * actually contained a signed-in user's real credit card data at all —
 * confirmed against a real exported backup missing the key entirely. */
/** Every module's real Firebase RTDB path suffix under `users/{uid}/...` —
 * matches each module's own `use<Module>FirebaseSync.ts` call to
 * `useWorkbookCloudSync(suffix, ...)`. QSE is the one irregular case: its
 * store/module key is `qse` everywhere else in this app, but its actual
 * cloud path (kept for backwards compatibility with the pre-rewrite legacy
 * app) is `workbook`, not `qse`. */


/** Every module's own `createEmpty*Workbook()` — a real bug found via a
 * user report: `setWorkbook()` (in `createWorkbookStore.ts`,
 * `createEntryStore.ts`, and the hand-written stores alike) calls its own
 * `normalize()` directly on whatever it's given, which assumes every array
 * field is already present (`wb.transactions.map(...)`, etc. with no
 * guard) — every OTHER caller of `setWorkbook` in this app (each module's
 * own per-module JSON import in its Settings tab, and every cloud-sync
 * pull in `useWorkbookCloudSync`) already merges onto `createEmpty()`
 * first for exactly this reason, this whole-app import was the one path
 * that skipped it. A real production RTDB export can genuinely be missing
 * a field entirely: Firebase strips an empty array from storage at ANY
 * nesting depth (see `createWorkbookStore.ts`'s own `normalize()` comment
 * on `TradePlan.legs`), so a workbook that had e.g. `tradePlans: []` at
 * some point has no `tradePlans` key at all in a real export. Without this
 * merge, `qse` (processed first) threw immediately and silently aborted
 * the entire `foundKeys.forEach` loop below it -- so NOTHING imported,
 * not just `qse` -- exactly the "no transaction imported" symptom, even
 * with the direct-Firebase-write fix from the previous round already in
 * place. */


export function AppDataPage() {
  const ensureSignedIn = useEnsureSignedIn();
  const { user } = useAuthState();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const qse = useWorkbookStore();
  const psx = usePSXWorkbookStore();
  const bank = useBankWorkbookStore();
  const creditCards = useCreditCardWorkbookStore();
  const cash = useCashWorkbookStore();
  const emiLoans = useEMIWorkbookStore();
  const funds = useFundsWorkbookStore();
  const personalLoans = usePersonalLoansWorkbookStore();
  const rentals = useRentalsWorkbookStore();
  const subscriptions = useSubscriptionsWorkbookStore();
  const plannedBank = usePlannedBankWorkbookStore();
  const plannedCash = usePlannedCashWorkbookStore();
  const plannedCreditCard = usePlannedCreditCardWorkbookStore();
  const plannedRentals = usePlannedRentalsWorkbookStore();
  const interEntityTransfers = useInterEntityTransfersStore();
  const netWorthSnapshots = useNetWorthSnapshotsWorkbookStore();
  const categories = useCategoryStore();
  const categoryGroups = useCategoryGroupStore();

  const stores = {
    qse, psx, bank, creditCards, cash, emiLoans, funds, personalLoans, rentals, subscriptions,
    plannedBank, plannedCash, plannedCreditCard, plannedRentals, interEntityTransfers, netWorthSnapshots, categories, categoryGroups,
  } as const;
  type ModuleKey = keyof typeof stores;
  const moduleLabels: Record<ModuleKey, string> = {
    qse: 'QSE stocks', psx: 'PSX stocks', bank: 'Banking', creditCards: 'Credit Cards', cash: 'Cash', emiLoans: 'EMI/Loans',
    funds: 'Funds', personalLoans: 'Personal Loans', rentals: 'Rentals', subscriptions: 'Subscriptions',
    plannedBank: 'Bank Planning', plannedCash: 'Cash Planning', plannedCreditCard: 'Credit Card Planning',
    plannedRentals: 'Rentals Planning',
    interEntityTransfers: 'Transfers', netWorthSnapshots: 'Net Worth history', categories: 'Categories',
    categoryGroups: 'Category groups',
  };

  const exportAll = () => {
    const combined: Record<string, unknown> = {};
    (Object.keys(stores) as ModuleKey[]).forEach((key) => {
      combined[key] = stores[key].workbook;
    });
    const blob = new Blob([JSON.stringify(combined, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WealthCrescent-full-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Full backup downloaded.');
  };

  const importAll = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        toast('That file is not valid JSON.');
        return;
      }
      const foundKeys = (Object.keys(stores) as ModuleKey[]).filter((key) => parsed[key] != null);
      if (!foundKeys.length) {
        toast('No recognized module data found in that file.');
        return;
      }
      const ok = await confirmDialog(
        `This overwrites local data for: ${foundKeys.map((k) => moduleLabels[k]).join(', ')}. This cannot be undone (export a backup first if unsure).`,
        `Import ${foundKeys.length} module${foundKeys.length > 1 ? 's' : ''} from this file?`,
      );
      if (!ok) return;
      if (!(await ensureSignedIn('Sign in to import data.'))) return;
      setBusy(true);
      try {
        // Merge each module's parsed data onto its own createEmpty() shape
        // before doing anything with it -- see CREATE_EMPTY's own comment.
        // Both the local setWorkbook() calls and the direct-to-Firebase
        // writes below use this same merged object, so a partial/older
        // export can't crash either path or leave a half-populated shape
        // in the cloud.
        const merged: Partial<Record<ModuleKey, unknown>> = {};
        foundKeys.forEach((key) => {
          merged[key] = { ...CREATE_EMPTY[key](), ...(parsed[key] as object) };
        });
        foundKeys.forEach((key) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (stores[key].setWorkbook as (wb: any) => void)(merged[key]);
        });
        // Also push each imported module straight to its own Firebase path,
        // not just local state. A real bug found via a user report: every
        // module's cloud sync (`useWorkbookCloudSync`, mounted globally in
        // App.tsx) keeps a LIVE `onValue` listener that re-fires whenever
        // it reads the current cloud snapshot -- including the very first
        // read right after `ensureSignedIn()` above completes a fresh sign-
        // in. That listener's callback unconditionally calls the same
        // store's `setWorkbook()`, so if it fires (with the OLD, real cloud
        // data) after the `setWorkbook(parsed[key])` calls just above, it
        // silently clobbers the just-imported local state back to whatever
        // was already in the cloud -- exactly the "no transaction imported"
        // symptom reported: import appeared to succeed, but the immediately
        // following stale-cloud pull raced it and won. Writing the parsed
        // data directly to Firebase here (independent of whatever the local
        // store currently holds, so it can't itself be corrupted by that
        // same race) means even a briefly-clobbered local view self-heals:
        // this write's own `onValue` echo re-applies the correct imported
        // data moments later.
        if (firebaseReady && db && user) {
          const database = db;
          const uid = user.uid;
          foundKeys.forEach((key) => {
            const payload = stripUndefinedDeep({ ...(merged[key] as object), _updated: new Date().toISOString() });
            set(ref(database, `users/${uid}/${CLOUD_PATH_SUFFIX[key]}`), payload).catch((e) =>
              console.warn(`Failed to push imported ${key} to cloud`, e),
            );
          });
        }
        toast(`Imported ${foundKeys.length} module${foundKeys.length > 1 ? 's' : ''}.`);
      } finally {
        setBusy(false);
      }
    };
    reader.readAsText(file);
  };

  const removeAll = async () => {
    if (deleteConfirmation !== 'DELETE ALL DATA' || busy || deleting || !user) return;
    const uid = user.uid;
    if (!(await confirmDialog('Permanently remove all financial data for this signed-in account from the cloud and this device? This includes every module, account, transaction, plan, transfer, custom category and history. Defaults are restored. Your login account, appearance preferences and shared market data remain. Export a backup first; this cannot be undone here.', 'Remove all app data?'))) return;
    setDeleting(true);
    try {
      await removeAllFinancialData(uid);
      setDeleteConfirmation('');
      toast('All financial app data removed. Defaults restored.');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not remove app data.'); }
    finally { setDeleting(false); }
  };

  return (
    <div className="standard-page">
      <PageHeading back={<BackButton to="/net-worth">← Overview</BackButton>}><h1 className="pagetitle">App Data</h1></PageHeading>
      <p className="text-muted mb-12">
        Backup or restore your ENTIRE WealthCrescent account in one file — every module at once, instead of each
        module's own Settings tab (still there, unchanged, for a per-module backup).
      </p>
      <Card className="mb-md">
        <h3 className="mt-0">Export everything</h3>
        <p className="text-muted">Downloads one JSON file with every module's data.</p>
        <button className="btn" disabled={deleting} onClick={exportAll}>Export full backup</button>
      </Card>
      <Card>
        <h3 className="mt-0">Import everything</h3>
        <Notice tone="warning" className="mb-12">
          This overwrites whichever modules are present in the file, for every one of THIS account's stores. Export
          a backup first if you're not sure.
        </Notice>
        <button className="btn secondary" disabled={busy || deleting} onClick={() => fileInput.current?.click()}>
          {busy ? 'Importing…' : 'Choose file to import'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importAll(file);
            e.target.value = '';
          }}
        />
      </Card>
      <Card className="mt-md">
        <h3 className="mt-0">Remove all app data</h3>
        <Notice tone="warning">Deletes all financial modules, accounts, transactions, plans, transfers, custom categories and history from your signed-in account and this device. App defaults are restored. Login, appearance preferences and shared market data remain. Export a full backup first and finish edits on other devices before removing data.</Notice>
        <p className="text-muted">{user ? 'Account: ' + (user.email ?? user.uid) : 'Sign in to remove your cloud and local financial data.'}</p>
        <label>Type DELETE ALL DATA to confirm
          <input aria-label="Deletion confirmation" value={deleteConfirmation} disabled={busy || deleting || !user} onChange={event => setDeleteConfirmation(event.target.value)} autoComplete="off" />
        </label>
        <button className="btn danger mt-md" disabled={busy || deleting || !user || deleteConfirmation !== 'DELETE ALL DATA'} onClick={removeAll}>
          {deleting ? 'Removing app data…' : 'Remove all app data'}
        </button>
      </Card>
    </div>
  );
}
