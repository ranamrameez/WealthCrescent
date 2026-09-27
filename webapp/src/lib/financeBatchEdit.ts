import { prepareBatch, validBatchDate, type BatchChange, type RowErrors } from '../components/batchEditModel';
import { useBankWorkbookStore } from '../store/bankWorkbookStore';
import { useCashWorkbookStore } from '../store/cashWorkbookStore';
import type { CashEntry } from '../types/cashWorkbook';
import { useRentalsWorkbookStore } from '../store/rentalsWorkbookStore';
import type { Property, RentalEntry } from '../types/rentalsWorkbook';
import { usePersonalLoansWorkbookStore } from '../store/personalLoansWorkbookStore';
import { usePlannedBankWorkbookStore } from '../store/plannedBankWorkbookStore';
import { useInterEntityTransfersStore } from '../store/interEntityTransfersStore';
import { useCategoryStore } from '../store/categoryStore';
import type { BankAccount, BankTransaction } from '../types/bankWorkbook';
import type { PersonalLoan, PersonalLoanPlan, PersonalLoanRepayment } from '../types/personalLoansWorkbook';
import type { PlannedBankTransaction } from '../types/plannedBank';

export function linkedBatchReason(module: 'bank' | 'personalLoans' | 'cash' | 'rentals', id: string): string | undefined {
  return useInterEntityTransfersStore.getState().workbook.entries.some(link =>
    (link.from.module === module && link.fromRecordId === id) || (link.to.module === module && link.toRecordId === id))
    ? 'Linked transfer: use single Edit to handle both sides.' : undefined;
}
export function bankPlanBatchReason(row: PlannedBankTransaction): string | undefined {
  if (row.executed) return 'Executed plan: read-only.';
  if (row.recurrence) return 'Recurring plan: use the plan editor.';
  if (row.sourceEmiLoanId || row.sourceSubscriptionId) return 'Generated plan: edit its source schedule.';
}
export function validateFinanceBatch(row: { date: string; amount: number; time?: string; timezone?: string; description?: string; categoryID?: string }, signed: boolean): RowErrors {
  const errors: RowErrors = {};
  if (!validBatchDate(row.date)) errors.date = 'Enter a valid date.';
  if (!Number.isFinite(row.amount) || (signed ? row.amount === 0 : row.amount <= 0)) errors.amount = signed ? 'Enter a non-zero amount; negative means withdrawal.' : 'Enter an amount greater than zero.';
  if (signed && !row.description?.trim()) errors.description = 'Enter a description.';
  if (row.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)) errors.time = 'Use HH:MM (24-hour time).';
  if (row.timezone) {
    try { new Intl.DateTimeFormat('en', { timeZone: row.timezone }).format(); }
    catch { errors.timezone = 'Enter a valid IANA timezone, such as Asia/Qatar.'; }
  }
  if (row.categoryID && !useCategoryStore.getState().workbook.categories.some(category => category.id === row.categoryID)) errors.categoryID = 'Choose an existing category.';
  return errors;
}
const transactionFields = ['date', 'time', 'timezone', 'description', 'amount', 'categoryID', 'isPending'] as const;
const planFields = ['date', 'description', 'amount', 'categoryID'] as const;

export function saveCashBatch(currencyCode: string, changes: BatchChange<CashEntry>[]) {
  const state = useCashWorkbookStore.getState();
  const entries = prepareBatch(state.workbook.entries, changes,
    ['date', 'time', 'timezone', 'note', 'amount', 'isDeposit', 'categoryID', 'isPending'],
    row => validateFinanceBatch(row, false),
    row => row.currencyCode !== currencyCode ? 'Currency cannot be changed.' : linkedBatchReason('cash', row.id));
  state.setWorkbook({ ...state.workbook, entries });
}

export function saveRentalBatch(property: Property, changes: BatchChange<RentalEntry>[]) {
  const state = useRentalsWorkbookStore.getState();
  const current = state.workbook.settings.properties.find(row => row.id === property.id);
  if (!current || current.currencyCode !== property.currencyCode) throw new Error('Property changed or was removed. Discard and reopen the editor.');
  const entries = prepareBatch(state.workbook.entries, changes,
    ['date', 'time', 'timezone', 'note', 'amount', 'isDeposit', 'categoryID', 'isPending'],
    row => validateFinanceBatch(row, false),
    row => row.propertyId !== property.id ? 'Property cannot be changed.' : linkedBatchReason('rentals', row.id));
  state.setWorkbook({ ...state.workbook, entries });
}

function assertAccount(expected: BankAccount) {
  const current = useBankWorkbookStore.getState().workbook.settings.accounts.find(row => row.id === expected.id);
  if (!current || current.currencyCode !== expected.currencyCode || current.migratedToCreditCardId) throw new Error('Account changed or was removed. Discard and reopen the editor.');
}
function assertLoan(expected: PersonalLoan) {
  const current = usePersonalLoansWorkbookStore.getState().workbook.loans.find(row => row.id === expected.id);
  if (!current || current.currencyCode !== expected.currencyCode || current.direction !== expected.direction) throw new Error('Loan changed or was removed. Discard and reopen the editor.');
}

export function saveBankBatch(account: BankAccount, changes: BatchChange<BankTransaction>[]) {
  assertAccount(account);
  const state = useBankWorkbookStore.getState();
  const transactions = prepareBatch(state.workbook.transactions, changes, transactionFields,
    row => validateFinanceBatch(row, true), row => row.accountId !== account.id ? 'Account cannot be changed.' : linkedBatchReason('bank', row.id));
  state.setWorkbook({ ...state.workbook, transactions });
}
export function saveBankPlanBatch(account: BankAccount, changes: BatchChange<PlannedBankTransaction>[]) {
  assertAccount(account);
  const state = usePlannedBankWorkbookStore.getState();
  const entries = prepareBatch(state.workbook.entries, changes, ['date', 'description', 'amount', 'category'],
    row => validateFinanceBatch(row, true), row => row.accountId !== account.id ? 'Account cannot be changed.' : bankPlanBatchReason(row));
  state.setWorkbook({ ...state.workbook, entries });
}
export function saveLoanPaymentBatch(loan: PersonalLoan, changes: BatchChange<PersonalLoanRepayment>[]) {
  assertLoan(loan);
  const state = usePersonalLoansWorkbookStore.getState();
  const repayments = prepareBatch(state.workbook.repayments, changes, transactionFields,
    row => validateFinanceBatch(row, false), row => row.loanId !== loan.id ? 'Loan cannot be changed.' : linkedBatchReason('personalLoans', row.id));
  state.setWorkbook({ ...state.workbook, repayments });
}
export function saveLoanPlanBatch(loan: PersonalLoan, changes: BatchChange<PersonalLoanPlan>[]) {
  assertLoan(loan);
  const state = usePersonalLoansWorkbookStore.getState();
  const plans = prepareBatch(state.workbook.plans ?? [], changes, planFields,
    row => validateFinanceBatch(row, false), row => row.loanId !== loan.id ? 'Loan cannot be changed.' : row.executed ? 'Executed plan: read-only.' : undefined);
  state.setWorkbook({ ...state.workbook, plans });
}
