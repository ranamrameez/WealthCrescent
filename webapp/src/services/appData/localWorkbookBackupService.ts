import { useWorkbookStore } from '../../store/workbookStore';
import { usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { useFundsWorkbookStore } from '../../store/fundsWorkbookStore';
import { usePersonalLoansWorkbookStore } from '../../store/personalLoansWorkbookStore';
import { useRentalsWorkbookStore } from '../../store/rentalsWorkbookStore';
import { useSubscriptionsWorkbookStore } from '../../store/subscriptionsWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { usePlannedRentalsWorkbookStore } from '../../store/plannedRentalsWorkbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import { useNetWorthSnapshotsWorkbookStore } from '../../store/netWorthSnapshotsWorkbookStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useCategoryGroupStore } from '../../store/categoryGroupStore';
import type { WorkbookModuleKey } from './workbookRegistry';

/** Explicit device recovery export. It must not claim to contain cloud execution history. */
export function exportLocalWorkbookBackup(): Record<string, unknown> {
  const workbooks = {
    qse: useWorkbookStore.getState().workbook, psx: usePSXWorkbookStore.getState().workbook,
    bank: useBankWorkbookStore.getState().workbook, creditCards: useCreditCardWorkbookStore.getState().workbook,
    cash: useCashWorkbookStore.getState().workbook, emiLoans: useEMIWorkbookStore.getState().workbook,
    funds: useFundsWorkbookStore.getState().workbook, personalLoans: usePersonalLoansWorkbookStore.getState().workbook,
    rentals: useRentalsWorkbookStore.getState().workbook, subscriptions: useSubscriptionsWorkbookStore.getState().workbook,
    plannedBank: usePlannedBankWorkbookStore.getState().workbook, plannedCash: usePlannedCashWorkbookStore.getState().workbook,
    plannedCreditCard: usePlannedCreditCardWorkbookStore.getState().workbook, plannedRentals: usePlannedRentalsWorkbookStore.getState().workbook,
    interEntityTransfers: useInterEntityTransfersStore.getState().workbook, netWorthSnapshots: useNetWorthSnapshotsWorkbookStore.getState().workbook,
    categories: useCategoryStore.getState().workbook, categoryGroups: useCategoryGroupStore.getState().workbook,
  } satisfies Record<WorkbookModuleKey, unknown>;
  return JSON.parse(JSON.stringify({ ...workbooks, _backup: { version: 2, scope: 'local-workbooks', createdAt: new Date().toISOString() } }));
}
