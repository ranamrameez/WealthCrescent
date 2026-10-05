import { useCashWorkbookStore } from '../store/cashWorkbookStore';
import { useRentalsWorkbookStore } from '../store/rentalsWorkbookStore';
import { useBankWorkbookStore } from '../store/bankWorkbookStore';
import { usePersonalLoansWorkbookStore } from '../store/personalLoansWorkbookStore';
import { nextSerialNumberForEntity } from '../lib/financeSerial';
import { useState } from 'react';
import { saveCashBatch, saveRentalBatch } from '../lib/financeBatchEdit';
import type { Property, RentalEntry } from '../types/rentalsWorkbook';
import type { CashEntry } from '../types/cashWorkbook';
import { BatchEditGrid, type BatchColumn, type BatchChange, type BatchMutations } from './BatchEditGrid';
import { useCategoryStore } from '../store/categoryStore';
import { useInterEntityTransfersStore } from '../store/interEntityTransfersStore';
import { useEnsureSignedIn } from '../lib/firebase/useEnsureSignedIn';
import { getCurrentUser } from '../lib/firebase/useAuthState';
import { formatDate } from '../lib/format';
import { useAppearanceStore } from '../store/appearanceStore';
import { bankPlanBatchReason, linkedBatchReason, saveBankBatch, saveBankPlanBatch, saveLoanPaymentBatch, saveLoanPlanBatch, validateFinanceBatch } from '../lib/financeBatchEdit';
import type { BankAccount, BankTransaction } from '../types/bankWorkbook';
import type { PlannedBankTransaction } from '../types/plannedBank';
import type { PersonalLoan, PersonalLoanPlan, PersonalLoanRepayment } from '../types/personalLoansWorkbook';

function useBatchSave<T>(commit: (changes: BatchChange<T>[], mutations?: BatchMutations<T>) => void) {
  const ensureSignedIn = useEnsureSignedIn();
  const [owner] = useState(() => getCurrentUser()?.uid);
  return async (changes: BatchChange<T>[], mutations: BatchMutations<T>) => {
    if (!(await ensureSignedIn('Sign in to save all changes.'))) throw new Error('Sign in is required. Your changes have not been saved.');
    if (owner && getCurrentUser()?.uid !== owner) throw new Error('Signed-in account changed. Discard and reopen the editor.');
    commit(changes, mutations);
  };
}
function useCategoryOptions() {
  const categories = useCategoryStore(state => state.workbook.categories);
  return [{ value: '', label: 'Unspecified' }, ...categories.map(c => ({ value: c.id, label: c.name }))];
}
const dateColumn = { key: 'date', label: 'Date', type: 'date', width: 150 } as const;
const descriptionColumn = { key: 'description', label: 'Description', width: 270 } as const;
const amountColumn = { key: 'amount', label: 'Amount', type: 'amount', width: 150 } as const;
const timeColumns = [
  { key: 'time', label: 'Time', type: 'time', width: 130 },
  { key: 'timezone', label: 'Timezone (IANA)', width: 190 },
] as const;
const pendingColumn = { key: 'isPending', label: 'Pending', type: 'boolean', width: 90 } as const;
const sourceColumn = { key: 'source', label: 'Source', editable: false, width: 150 } as const;

export function CashTransactionsBatchEditor({ currencyCode, rows, onClose }: { currencyCode: string; rows: CashEntry[]; onClose: () => void }) {
  const options = useCategoryOptions();
  const dateFormat = useAppearanceStore(state => state.appearance.dateFormat);
  useInterEntityTransfersStore(state => state.workbook.entries);
  const save = useBatchSave<CashEntry>((changes, mutations) => saveCashBatch(currencyCode, changes, mutations));
  const columns: BatchColumn<CashEntry>[] = [
    { key: 'serialNumber', label: '#', type: 'number', editable: false, width: 70 },
    { ...dateColumn, formatter: value => formatDate(String(value), dateFormat) }, ...timeColumns,
    { key: 'note', label: 'Note', width: 270 },
    { ...amountColumn, label: `Amount (${currencyCode})` },
    { key: 'isDeposit', label: 'Cash in', type: 'boolean', width: 90 },
    { key: 'categoryID', label: 'Category', type: 'category', options, width: 190 }, pendingColumn, sourceColumn,
  ];
  return <BatchEditGrid title={`Batch edit Cash — ${currencyCode}`} description="Amounts must be positive. Cash in checked = deposit; unchecked = withdrawal. Currency and source are locked." rows={rows} columns={columns} getRowId={row => row.id} getRowDate={row => row.date} validateRow={row => validateFinanceBatch(row, false)} rowReadOnly={row => linkedBatchReason('cash', row.id)} addLabel="Add transaction" createRow={() => ({ id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), amount: 0, serialNumber: nextSerialNumberForEntity(useCashWorkbookStore.getState().workbook.entries, row => row.currencyCode, currencyCode), currencyCode, isDeposit: true, source: 'manual' as const })} orderKey="serialNumber" onSave={save} onClose={onClose} />;
}

export function RentalTransactionsBatchEditor({ property, rows, onClose }: { property: Property; rows: RentalEntry[]; onClose: () => void }) {
  const [entity] = useState(() => ({ ...property }));
  const options = useCategoryOptions();
  const dateFormat = useAppearanceStore(state => state.appearance.dateFormat);
  useInterEntityTransfersStore(state => state.workbook.entries);
  const save = useBatchSave<RentalEntry>((changes, mutations) => saveRentalBatch(entity, changes, mutations));
  const columns: BatchColumn<RentalEntry>[] = [
    { key: 'serialNumber', label: '#', editable: false, width: 70 },
    { ...dateColumn, formatter: value => formatDate(String(value), dateFormat) }, ...timeColumns,
    { key: 'note', label: 'Note', width: 270 }, { ...amountColumn, label: `Amount (${entity.currencyCode})` },
    { key: 'isDeposit', label: 'Rent income', type: 'boolean', width: 100 },
    { key: 'categoryID', label: 'Category', type: 'category', options, width: 190 }, pendingColumn, sourceColumn,
  ];
  return <BatchEditGrid title={`Batch edit Rentals — ${entity.name}`} description="Amounts must be positive. Rent income checked = income; unchecked = expense. Property and source are locked." rows={rows} columns={columns} getRowId={row => row.id} getRowDate={row => row.date} validateRow={row => validateFinanceBatch(row, false)} rowReadOnly={row => linkedBatchReason('rentals', row.id)} addLabel="Add transaction" createRow={() => ({ id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), amount: 0, serialNumber: nextSerialNumberForEntity(useRentalsWorkbookStore.getState().workbook.entries, row => row.propertyId, entity.id), propertyId: entity.id, isDeposit: true, source: 'manual' as const })} orderKey="serialNumber" onSave={save} onClose={onClose} />;
}

export function BankTransactionsBatchEditor({ account, rows, onClose }: { account: BankAccount; rows: BankTransaction[]; onClose: () => void }) {
  const [entity] = useState(() => ({ ...account }));
  const options = useCategoryOptions();
  const dateFormat = useAppearanceStore(state => state.appearance.dateFormat ?? 'DD-MMM-YYYY');
  useInterEntityTransfersStore(state => state.workbook.entries);
  const save = useBatchSave<BankTransaction>((changes, mutations) => saveBankBatch(entity, changes, mutations));
  const columns: BatchColumn<BankTransaction>[] = [
    { key: 'serialNumber', label: '#', editable: false, width: 70 }, { ...dateColumn, formatter: value => formatDate(String(value), dateFormat) }, ...timeColumns, descriptionColumn,
    { ...amountColumn, label: `Amount (${entity.currencyCode}, signed)` },
    { key: 'categoryID', label: 'Category', type: 'category', options, width: 190 }, pendingColumn, sourceColumn,
  ];
  return <BatchEditGrid title={`Batch edit transactions — ${entity.nickname || entity.name}`} description={`Filtered transactions · ${entity.currencyCode}. Positive = deposit; negative = withdrawal. Account and source are locked.`} rows={rows} columns={columns} getRowId={row => row.id} getRowDate={row => row.date} validateRow={row => validateFinanceBatch(row, true)} rowReadOnly={row => linkedBatchReason('bank', row.id)} addLabel="Add transaction" createRow={() => ({ id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), amount: 0, serialNumber: nextSerialNumberForEntity(useBankWorkbookStore.getState().workbook.transactions, row => row.accountId, entity.id), accountId: entity.id, description: '', isDeposit: true, source: 'manual' as const })} orderKey="serialNumber" onSave={save} onClose={onClose} />;
}
export function BankPlansBatchEditor({ account, rows, onClose }: { account: BankAccount; rows: PlannedBankTransaction[]; onClose: () => void }) {
  const [entity] = useState(() => ({ ...account }));
  const dateFormat = useAppearanceStore(state => state.appearance.dateFormat ?? 'DD-MMM-YYYY');
  const save = useBatchSave<PlannedBankTransaction>((changes, mutations) => saveBankPlanBatch(entity, changes, mutations));
  const columns: BatchColumn<PlannedBankTransaction>[] = [{ ...dateColumn, formatter: value => formatDate(String(value), dateFormat) }, descriptionColumn,
    { ...amountColumn, label: `Amount (${entity.currencyCode}, signed)` }, { key: 'category', label: 'Category', width: 190 },
    { key: 'executed', label: 'Executed', editable: false, formatter: value => value ? 'Yes' : 'No', width: 100 },
  ];
  return <BatchEditGrid title={`Batch edit plans — ${entity.nickname || entity.name}`} description={`Plans in the selected date range · ${entity.currencyCode}. Positive = deposit; negative = withdrawal. Recurring, generated and executed plans are locked.`} rows={rows} columns={columns} getRowId={row => row.id} getRowDate={row => row.date} validateRow={row => validateFinanceBatch(row, true)} rowReadOnly={bankPlanBatchReason} addLabel="Add plan" createRow={() => ({ id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), amount: 0, accountId: entity.id, description: '', executed: false })} onSave={save} onClose={onClose} />;
}
export function LoanPaymentsBatchEditor({ loan, rows, onClose }: { loan: PersonalLoan; rows: PersonalLoanRepayment[]; onClose: () => void }) {
  const [entity] = useState(() => ({ ...loan }));
  const options = useCategoryOptions();
  const dateFormat = useAppearanceStore(state => state.appearance.dateFormat ?? 'DD-MMM-YYYY');
  useInterEntityTransfersStore(state => state.workbook.entries);
  const save = useBatchSave<PersonalLoanRepayment>((changes, mutations) => saveLoanPaymentBatch(entity, changes, mutations));
  const columns: BatchColumn<PersonalLoanRepayment>[] = [
    { key: 'seq', label: '#', editable: false, width: 70 }, { ...dateColumn, formatter: value => formatDate(String(value), dateFormat) }, ...timeColumns, descriptionColumn,
    { ...amountColumn, label: `Amount (${entity.currencyCode})` }, { key: 'categoryID', label: 'Category', type: 'category', options, width: 190 }, pendingColumn, sourceColumn,
  ];
  return <BatchEditGrid title={`Batch edit payments — ${entity.person}`} description={`Filtered payments · ${entity.currencyCode} · ${entity.direction === 'owed_to_me' ? 'Lent' : 'Borrowed'}. Amounts must be positive. Loan and source are locked.`} rows={rows} columns={columns} getRowId={row => row.id} getRowDate={row => row.date} validateRow={row => validateFinanceBatch(row, false)} rowReadOnly={row => linkedBatchReason('personalLoans', row.id)} addLabel="Add transaction" createRow={() => ({ id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), amount: 0, seq: Math.max(0, ...usePersonalLoansWorkbookStore.getState().workbook.repayments.map(row => row.seq ?? 0)) + 1, loanId: entity.id, source: 'manual' as const })} orderKey="seq" onSave={save} onClose={onClose} />;
}
export function LoanPlansBatchEditor({ loan, rows, onClose }: { loan: PersonalLoan; rows: PersonalLoanPlan[]; onClose: () => void }) {
  const [entity] = useState(() => ({ ...loan }));
  const options = useCategoryOptions();
  const dateFormat = useAppearanceStore(state => state.appearance.dateFormat ?? 'DD-MMM-YYYY');
  const save = useBatchSave<PersonalLoanPlan>((changes, mutations) => saveLoanPlanBatch(entity, changes, mutations));
  const columns: BatchColumn<PersonalLoanPlan>[] = [{ ...dateColumn, formatter: value => formatDate(String(value), dateFormat) }, descriptionColumn,
    { ...amountColumn, label: `Amount (${entity.currencyCode})` }, { key: 'categoryID', label: 'Category', type: 'category', options, width: 190 },
    { key: 'executed', label: 'Executed', editable: false, formatter: value => value ? 'Yes' : 'No', width: 100 },
  ];
  return <BatchEditGrid title={`Batch edit plans — ${entity.person}`} description={`Plans for this loan · ${entity.currencyCode}. Amounts must be positive. Executed plans are locked.`} rows={rows} columns={columns} getRowId={row => row.id} getRowDate={row => row.date} validateRow={row => validateFinanceBatch(row, false)} rowReadOnly={row => row.executed ? 'Executed plan: read-only.' : undefined} addLabel="Add plan" createRow={() => ({ id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), amount: 0, loanId: entity.id, description: '', executed: false })} onSave={save} onClose={onClose} />;
}
