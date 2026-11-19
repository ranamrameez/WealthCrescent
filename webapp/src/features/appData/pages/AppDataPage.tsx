import { exportFullCloudBackup, reviewFullBackup, restoreReviewedFullBackup } from '../../../services/appData/fullBackupService';
import { removeAllFinancialData } from '../../../services/appData/removeAllFinancialData';
import { PageHeading } from '../../../components/PageHeading';
import { BackButton } from '../../../components/BackButton';
import { useRef, useState } from 'react';
import { Card } from '../../../components/Card';
import { confirmDialog } from '../../../components/ConfirmDialog';
import { Notice } from '../../../components/Notice';
import { toast } from '../../../components/Toast';
import { useAuthState, getCurrentUser } from '../../../lib/firebase/useAuthState';
import { useEnsureSignedIn } from '../../../lib/firebase/useEnsureSignedIn';
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

/** Complete cloud backups pair workbooks with payment history. Local workbook
 * exports remain available for unsynced/offline recovery and are labelled separately. */
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

  const downloadBackup = (combined: Record<string, unknown>, label: string) => {
    const blob = new Blob([JSON.stringify(combined, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WealthCrescent-${label}-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportLocal = () => {
    const combined: Record<string, unknown> = {};
    (Object.keys(stores) as ModuleKey[]).forEach(key => { combined[key] = stores[key].workbook; });
    combined._backup = { version: 2, scope: 'local-workbooks', createdAt: new Date().toISOString() };
    downloadBackup(combined, 'local-workbooks');
    toast('Local workbooks downloaded. Payment execution history is included only in a full cloud backup.');
  };
  const exportAll = async () => {
    if (busy || deleting) return;
    setBusy(true);
    try {
      if (!(await ensureSignedIn('Sign in to export your full cloud backup.'))) return;
      const current = getCurrentUser();
      if (!current) throw new Error('Sign in again to export your backup.');
      downloadBackup(await exportFullCloudBackup(current.uid), 'full-backup');
      toast('Full cloud backup downloaded, including payment execution history.');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not export the cloud backup.'); }
    finally { setBusy(false); }
  };
  const importAll = async (file: File) => {
    if (busy || deleting) return;
    setBusy(true);
    try {
      let parsed: unknown;
      try { parsed = JSON.parse(await file.text()); }
      catch { throw new Error('That file is not valid JSON.'); }
      if (!(await ensureSignedIn('Sign in to import data.'))) return;
      const current = getCurrentUser();
      if (!current) throw new Error('Sign in again to review this backup.');
      const preview = await reviewFullBackup(current.uid, parsed);
      const details = preview.modules.map(key => moduleLabels[key]).join(', ');
      const history = preview.includesPaymentHistory ? ` Payment execution history (${preview.executionCount} records) is restored with the workbooks.` : '';
      if (!(await confirmDialog(
        `Signed-in account: ${current.email ?? current.uid}. This replaces cloud and device data for: ${details}.${history} The selected workbooks will refresh after the restore. Export a backup first; this cannot be undone here.`,
        `Restore ${preview.modules.length} module${preview.modules.length > 1 ? 's' : ''}?`,
      ))) return;
      await restoreReviewedFullBackup(preview);
      toast('Backup restored. Selected workbooks are syncing.');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not restore the backup.'); }
    finally { setBusy(false); }
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
        <p className="text-muted">Full cloud backup downloads one account snapshot, including payment execution history. Finish syncing edits first. Local workbooks export this device’s current data, including unsynced edits, without cloud payment history.</p>
        <div className="row gap-sm"><button className="btn" disabled={busy || deleting} onClick={exportAll}>Export full cloud backup</button>
          <button className="btn" disabled={busy || deleting} onClick={exportLocal}>Export local workbooks</button></div>
      </Card>
      <Card>
        <h3 className="mt-0">Import everything</h3>
        <Notice tone="warning" className="mb-12">
          Restore replaces the selected modules together after review and refreshes the selected workbooks. Backups with payment history must contain every module. Older backups remain usable when they do not overwrite active payment history. Export a backup first.
        </Notice>
        <button className="btn secondary" disabled={busy || deleting} onClick={() => fileInput.current?.click()}>
          {busy ? 'Importing…' : 'Choose file to import'}
        </button>
        <input
          ref={fileInput}
          type="file"
          aria-label="Backup JSON file"
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
