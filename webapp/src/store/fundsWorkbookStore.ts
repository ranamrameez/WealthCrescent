import { createWorkbookStore } from './createWorkbookStore';
import { createEmptyFundsWorkbook } from './defaultFundsWorkbook';

/** Funds reuses the exact same factory QSE/PSX use — see FundsWorkbook's
 * own doc comment for why. Fund CRUD (add/update/delete a Fund, as opposed
 * to a Transaction) has no dedicated action since `createWorkbookStore`
 * doesn't know about the extra `funds` field — the Funds page mutates it
 * directly via the store's generic `setWorkbook`, which is exactly what
 * that action is for. */
const fundsStore = createWorkbookStore('WealthCrescent_funds_workbook_v1', createEmptyFundsWorkbook);

// Metadata-only, versioned migration for legacy Funds transfers that predate
// Transfer.currencyCode. Snapshot the existing Funds default once so later
// changes to the new-fund default cannot silently move historical cash rows
// between currencies. The transfer records themselves are left untouched.
function ensureCashLedgerMigration() {
  const workbook = fundsStore.getState().workbook;
  if ((workbook.settings.cashLedgerMigrationVersion ?? 0) >= 1) return;
  fundsStore.getState().setWorkbook({
    ...workbook,
    settings: {
      ...workbook.settings,
      legacyTransferCurrency: workbook.settings.legacyTransferCurrency || workbook.settings.defaultCurrency || 'USD',
      cashLedgerMigrationVersion: 1,
    },
  });
}

// Run for local data immediately and subscribe for a cloud workbook that may
// replace it after authentication. The version guard makes this idempotent.
ensureCashLedgerMigration();
fundsStore.subscribe(() => ensureCashLedgerMigration());

export const useFundsWorkbookStore = fundsStore;
