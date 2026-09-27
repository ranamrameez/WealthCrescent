import { useState } from 'react';
import { BatchEditGrid, type BatchColumn, type BatchChange } from './BatchEditGrid';
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

function useBatchSave<T>(commit: (changes: BatchChange<T>[]) => void) {
  const ensureSignedIn = useEnsureSignedIn();
  const [owner] = useState(() => getCurrentUser()?.uid);
  return async (changes: BatchChange<T>[]) => {
    if (!(await ensureSignedIn('Sign in to save all changes.'))) throw new Error('Sign in is required. Your changes have not been saved.');
    if (owner && getCurrentUser()?.uid !== owner) throw new Error('Signed-in account changed. Discard and reopen the editor.');
    commit(changes);
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

export function BankTransactionsBatchEditor({ account, rows, onClose }: { account: BankAccount; rows: BankTransaction[]; onClose: () => void }) {
  const [entity] = useState(() => ({ ...account }));
  const options = useCategoryOptions();
  const dateFormat = useAppearanceStore(state => state.appearance.dateFormat ?? 'DD-MMM-YYYY');
  useInterEntityTransfersStore(state => state.workbook.entries);
  const save = useBatchSave<BankTransaction>(changes => saveBankBatch(entity, changes));
  const columns: BatchColumn<BankTransaction>[] = [
    { key: 'serialNumber', label: '#', editable: false, width: 70 }, { ...dateColumn, formatter: value => formatDate(String(value), dateFormat) }, ...timeColumns, descriptionColumn,
    { ...amountColumn, label: `Amount (${entity.currencyCode}, signed)` },
    { key: 'categoryID', label: 'Category', type: 'category', options, width: 190 }, pendingColumn, sourceColumn,
  ];
  return <BatchEditGrid title={`Batch edit transactions — ${entity.nickname || entity.name}`} description={`Filtered transactions · ${entity.currencyCode}. Positive = deposit; negative = withdrawal. Account and source are locked.`} rows={rows} columns={columns} getRowId={row => row.id} getRowDate={row => row.date} validateRow={row => validateFinanceBatch(row, true)} rowReadOnly={row => linkedBatchReason('bank', row.id)} onSave={save} onClose={onClose} />;
}
export function BankPlansBatchEditor({ account, rows, onClose }: { account: BankAccount; rows: PlannedBankTransaction[]; onClose: () => void }) {
  const [entity] = useState(() => ({ ...account }));
  const dateFormat = useAppearanceStore(state => state.appearance.dateFormat ?? 'DD-MMM-YYYY');
  const save = useBatchSave<PlannedBankTransaction>(changes => saveBankPlanBatch(entity, changes));
  const columns: BatchColumn<PlannedBankTransaction>[] = [{ ...dateColumn, formatter: value => formatDate(String(value), dateFormat) }, descriptionColumn,
    { ...amountColumn, label: `Amount (${entity.currencyCode}, signed)` }, { key: 'category', label: 'Category', width: 190 },
    { key: 'executed', label: 'Executed', editable: false, formatter: value => value ? 'Yes' : 'No', width: 100 },
  ];
  return <BatchEditGrid title={`Batch edit plans — ${entity.nickname || entity.name}`} description={`Plans in the selected date range · ${entity.currencyCode}. Positive = deposit; negative = withdrawal. Recurring, generated and executed plans are locked.`} rows={rows} columns={columns} getRowId={row => row.id} getRowDate={row => row.date} validateRow={row => validateFinanceBatch(row, true)} rowReadOnly={bankPlanBatchReason} onSave={save} onClose={onClose} />;
}
export function LoanPaymentsBatchEditor({ loan, rows, onClose }: { loan: PersonalLoan; rows: PersonalLoanRepayment[]; onClose: () => void }) {
  const [entity] = useState(() => ({ ...loan }));
  const options = useCategoryOptions();
  const dateFormat = useAppearanceStore(state => state.appearance.dateFormat ?? 'DD-MMM-YYYY');
  useInterEntityTransfersStore(state => state.workbook.entries);
  const save = useBatchSave<PersonalLoanRepayment>(changes => saveLoanPaymentBatch(entity, changes));
  const columns: BatchColumn<PersonalLoanRepayment>[] = [
    { key: 'seq', label: '#', editable: false, width: 70 }, { ...dateColumn, formatter: value => formatDate(String(value), dateFormat) }, ...timeColumns, descriptionColumn,
    { ...amountColumn, label: `Amount (${entity.currencyCode})` }, { key: 'categoryID', label: 'Category', type: 'category', options, width: 190 }, pendingColumn, sourceColumn,
  ];
  return <BatchEditGrid title={`Batch edit payments — ${entity.person}`} description={`Filtered payments · ${entity.currencyCode} · ${entity.direction === 'owed_to_me' ? 'Lent' : 'Borrowed'}. Amounts must be positive. Loan and source are locked.`} rows={rows} columns={columns} getRowId={row => row.id} getRowDate={row => row.date} validateRow={row => validateFinanceBatch(row, false)} rowReadOnly={row => linkedBatchReason('personalLoans', row.id)} onSave={save} onClose={onClose} />;
}
export function LoanPlansBatchEditor({ loan, rows, onClose }: { loan: PersonalLoan; rows: PersonalLoanPlan[]; onClose: () => void }) {
  const [entity] = useState(() => ({ ...loan }));
  const options = useCategoryOptions();
  const dateFormat = useAppearanceStore(state => state.appearance.dateFormat ?? 'DD-MMM-YYYY');
  const save = useBatchSave<PersonalLoanPlan>(changes => saveLoanPlanBatch(entity, changes));
  const columns: BatchColumn<PersonalLoanPlan>[] = [{ ...dateColumn, formatter: value => formatDate(String(value), dateFormat) }, descriptionColumn,
    { ...amountColumn, label: `Amount (${entity.currencyCode})` }, { key: 'categoryID', label: 'Category', type: 'category', options, width: 190 },
    { key: 'executed', label: 'Executed', editable: false, formatter: value => value ? 'Yes' : 'No', width: 100 },
  ];
  return <BatchEditGrid title={`Batch edit plans — ${entity.person}`} description={`Plans for this loan · ${entity.currencyCode}. Amounts must be positive. Executed plans are locked.`} rows={rows} columns={columns} getRowId={row => row.id} getRowDate={row => row.date} validateRow={row => validateFinanceBatch(row, false)} rowReadOnly={row => row.executed ? 'Executed plan: read-only.' : undefined} onSave={save} onClose={onClose} />;
}
