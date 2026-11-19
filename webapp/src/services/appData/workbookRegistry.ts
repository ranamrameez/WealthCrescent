import { createEmptyWorkbook } from '../../store/defaultWorkbook';
import { createEmptyPSXWorkbook } from '../../store/defaultPsxWorkbook';
import { createEmptyBankWorkbook } from '../../store/defaultBankWorkbook';
import { createEmptyCreditCardWorkbook } from '../../store/defaultCreditCardWorkbook';
import { createEmptyCashWorkbook } from '../../store/defaultCashWorkbook';
import { createEmptyEMIWorkbook } from '../../store/defaultEmiWorkbook';
import { createEmptyFundsWorkbook } from '../../store/defaultFundsWorkbook';
import { createEmptyPersonalLoansWorkbook } from '../../store/defaultPersonalLoansWorkbook';
import { createEmptyRentalsWorkbook } from '../../store/defaultRentalsWorkbook';
import { createEmptySubscriptionsWorkbook } from '../../store/defaultSubscriptionsWorkbook';
import { createEmptyPlannedBankWorkbook } from '../../store/defaultPlannedBankWorkbook';
import { createEmptyPlannedCashWorkbook } from '../../store/defaultPlannedCashWorkbook';
import { createEmptyPlannedCreditCardWorkbook } from '../../store/defaultPlannedCreditCardWorkbook';
import { createEmptyPlannedRentalsWorkbook } from '../../store/defaultPlannedRentalsWorkbook';
import { createEmptyInterEntityWorkbook } from '../../store/defaultInterEntityWorkbook';
import { createEmptyNetWorthSnapshotsWorkbook } from '../../store/defaultNetWorthSnapshotsWorkbook';
import { createEmptyCategoriesWorkbook } from '../../store/defaultCategoriesWorkbook';
import { createEmptyCategoryGroupsWorkbook } from '../../store/defaultCategoryGroupsWorkbook';
export const CLOUD_PATH_SUFFIX = {
  qse: 'workbook', psx: 'psx', bank: 'bank', creditCards: 'creditCards', cash: 'cash', emiLoans: 'emiLoans',
  funds: 'funds', personalLoans: 'personalLoans', rentals: 'rentals', subscriptions: 'subscriptions',
  plannedBank: 'plannedBank', plannedCash: 'plannedCash', plannedCreditCard: 'plannedCreditCard',
  plannedRentals: 'plannedRentals',
  interEntityTransfers: 'interEntityTransfers', netWorthSnapshots: 'netWorthSnapshots',
  categories: 'categories', categoryGroups: 'categoryGroups',
} as const;
export type WorkbookModuleKey = keyof typeof CLOUD_PATH_SUFFIX;
export const CREATE_EMPTY = {
  qse: createEmptyWorkbook, psx: createEmptyPSXWorkbook, bank: createEmptyBankWorkbook,
  creditCards: createEmptyCreditCardWorkbook,
  cash: createEmptyCashWorkbook, emiLoans: createEmptyEMIWorkbook, funds: createEmptyFundsWorkbook,
  personalLoans: createEmptyPersonalLoansWorkbook, rentals: createEmptyRentalsWorkbook,
  subscriptions: createEmptySubscriptionsWorkbook, plannedBank: createEmptyPlannedBankWorkbook,
  plannedCash: createEmptyPlannedCashWorkbook, plannedCreditCard: createEmptyPlannedCreditCardWorkbook,
  plannedRentals: createEmptyPlannedRentalsWorkbook,
  interEntityTransfers: createEmptyInterEntityWorkbook, netWorthSnapshots: createEmptyNetWorthSnapshotsWorkbook,
  categories: createEmptyCategoriesWorkbook, categoryGroups: createEmptyCategoryGroupsWorkbook,
} as const satisfies Record<WorkbookModuleKey, () => unknown>;


export const APP_DATA_MODULE_LABELS = {
  qse: 'QSE stocks', psx: 'PSX stocks', bank: 'Banking', creditCards: 'Credit Cards', cash: 'Cash', emiLoans: 'EMI/Loans',
  funds: 'Funds', personalLoans: 'Personal Loans', rentals: 'Rentals', subscriptions: 'Subscriptions',
  plannedBank: 'Bank Planning', plannedCash: 'Cash Planning', plannedCreditCard: 'Credit Card Planning',
  plannedRentals: 'Rentals Planning', interEntityTransfers: 'Transfers', netWorthSnapshots: 'Net Worth history',
  categories: 'Categories', categoryGroups: 'Category groups',
} as const satisfies Record<WorkbookModuleKey, string>;
