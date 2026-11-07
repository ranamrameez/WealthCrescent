import { auth } from '../../lib/firebase/client';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { todayISODate } from '../../lib/datetime';
import { parseCSV } from '../../lib/csv';
import { readTabularXlsx } from '../../lib/tabularXlsx';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import { saveInstallmentContract } from './installmentService';
import type { EMILoan, EMIRepayment } from '../../types/emiWorkbook';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';

function budgetReferences(loanId: string, payments: EMIRepayment[]) {
  const keys = new Set(payments.flatMap(row => [CalculationEngine.budgets.budgetRecordKey({ module: 'emi', sourceId: loanId, recordType: 'emi-repayment', id: row.id }), CalculationEngine.budgets.budgetRecordKey({ module: 'emi', sourceId: loanId, id: row.id }), CalculationEngine.budgets.budgetRecordKey({ module: 'emi', sourceId: loanId, recordType: 'emi-fine', id: row.id + ':fine' }), CalculationEngine.budgets.budgetRecordKey({ module: 'emi', sourceId: loanId, id: row.id + ':fine' })]));
  return usePlannedCashWorkbookStore.getState().workbook.budgetAllocations?.some(row => keys.has(row.recordKey)) ?? false;
}

export interface InstallmentImportWorkbook { dateSystem: '1900' | '1904'; sheets: { name: string; rows: string[][]; rowNumbers?: number[] }[]; }
export async function readInstallmentImportFile(file: File): Promise<InstallmentImportWorkbook> {
  if (file.size > 10_000_000) throw new Error('File is too large (maximum 10 MB).');
  if (/\.csv$/i.test(file.name)) return { dateSystem: '1900' as const, sheets: [{ name: file.name, rows: parseCSV(await file.text()) }] };
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an XLSX or CSV file.');
  return readTabularXlsx(new Uint8Array(await file.arrayBuffer()));
}
export function previewInstallmentImport(loan: EMILoan, table: string[][], dateSystem: '1900' | '1904', sourceLabel: string, sourceRows?: number[]) {
  const parsed = CalculationEngine.installmentLedger.previewInstallmentTable(table, loan.currencyCode, dateSystem, sourceRows);
  const obligations = parsed.obligations.length ? parsed.obligations.map(({ currency: _currency, ...row }) => row) : loan.contractSchedule;
  if (!obligations?.length) throw new Error('This sheet has payments only. Review a contract first or choose the schedule worksheet.');
  const current = useEMIWorkbookStore.getState().workbook.repayments.filter(row => row.loanId === loan.id);
  const payments: EMIRepayment[] = parsed.payments.map(row => ({ id: `emi-import:${encodeURIComponent(loan.id)}:${encodeURIComponent(row.id)}`, loanId: loan.id, date: row.date, amount: row.amount, fine: row.fine, month: 0, paymentOnly: true, description: row.description, source: 'statement-import', statementRef: `${sourceLabel}#${row.sourceRow}` }));
  const blocked = [...parsed.issues];
  const ids = new Set(current.map(row => row.id));
  const linked = useInterEntityTransfersStore.getState().workbook.entries.filter(link => (link.from.module === 'emi' && ids.has(link.fromRecordId)) || (link.to.module === 'emi' && ids.has(link.toRecordId)));
  if (linked.length) blocked.push(`${linked.length} existing linked receipt(s) require review through their Bank/Cash transaction workflow before replacement.`);
  if (!parsed.hasFineColumn && current.some(row => (row.fine ?? 0) !== 0)) blocked.push('Existing receipts contain separately recorded fines. Include an explicit Fine column and reconcile those charges before replacing history.');
  if (budgetReferences(loan.id, current)) blocked.push('Existing receipt budget allocations need reassignment before replacing their native IDs.');
  const report = CalculationEngine.installmentLedger.reconcileInstallments(obligations.map(row => ({ ...row, currency: loan.currencyCode })), payments.map(row => ({ ...row, currency: loan.currencyCode })), loan.currencyCode, todayISODate());
  const currentSummary = CalculationEngine.emi.emiRepaymentSummary(loan, current, todayISODate());
  return { sourceLabel, loan: { ...loan }, existingPayments: current.map(row => ({ ...row })), obligations, payments, report, blocked, hasFineColumn: parsed.hasFineColumn, currentRemaining: currentSummary.outstanding, currentRecordedPaid: currentSummary.recordedPaid };
}
export type InstallmentImportPreview = ReturnType<typeof previewInstallmentImport>;
export function previewInstallmentWorkbook(loan: EMILoan, workbook: Awaited<ReturnType<typeof readInstallmentImportFile>>, sheetIndex: number, fileLabel: string) {
  const sheet = workbook.sheets[sheetIndex];
  if (!sheet) throw new Error('Choose a source worksheet.');
  const preview = previewInstallmentImport(loan, sheet.rows, workbook.dateSystem, `${fileLabel} · ${sheet.name}`, sheet.rowNumbers);
  const differences: string[] = [];
  for (const [index, other] of workbook.sheets.entries()) {
    if (index === sheetIndex) continue;
    try {
      const parsed = CalculationEngine.installmentLedger.previewInstallmentTable(other.rows, loan.currencyCode, workbook.dateSystem, other.rowNumbers);
      if (!parsed.payments.length) continue;
      if (parsed.payments.length !== preview.payments.length || parsed.payments.some((row, at) => row.amount !== preview.payments[at]?.amount)) differences.push(`${other.name}: receipt sequence differs; no records were merged.`);
      else for (const [at, row] of parsed.payments.entries()) if (row.date !== preview.payments[at].date) differences.push(`${other.name}: receipt ${at + 1} date ${row.date} differs from selected worksheet ${preview.payments[at].date}. No automatic correction was made.`);
    } catch { differences.push(`${other.name}: not a recognized installment table; ignored.`); }
  }
  return { ...preview, differences };
}

/** Explicit reviewed replacement only. Originals are archived, not discarded;
 * linked native financial records are never rewritten to force reconciliation. */
export function applyInstallmentImport(preview: InstallmentImportPreview, confirmation: string) {
  if (!auth?.currentUser) throw new Error('Sign in to apply the reviewed import.');
  const store = useEMIWorkbookStore.getState(), before = store.workbook;
  const current = before.entries.find(row => row.id === preview.loan.id);
  const payments = before.repayments.filter(row => row.loanId === preview.loan.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(preview.loan) || JSON.stringify(payments) !== JSON.stringify(preview.existingPayments)) throw new Error('The loan or payments changed. Generate a fresh preview.');
  if (confirmation.trim() !== current.name) throw new Error('Type the loan name to confirm replacement.');
  if (current.repaymentMode !== 'fixedTotal') throw new Error('This import supports fixed-total installment agreements only.');
  if (preview.blocked.length) throw new Error('Resolve the preview issues before applying.');
  if (budgetReferences(current.id, payments)) throw new Error('Receipt budget allocations changed. Generate a fresh preview.');
  if (!preview.hasFineColumn && payments.some(row => (row.fine ?? 0) !== 0)) throw new Error('Reconcile existing fines before replacing receipt history.');
  if (!preview.payments.length && payments.length) throw new Error('A schedule-only import cannot replace existing payment history. Choose the payment data or use the contract editor.');
  if (preview.payments.some(row => row.loanId !== current.id)) throw new Error('Imported payments belong to another loan.');
  const ids = new Set(payments.map(row => row.id));
  if (useInterEntityTransfersStore.getState().workbook.entries.some(link => (link.from.module === 'emi' && ids.has(link.fromRecordId)) || (link.to.module === 'emi' && ids.has(link.toRecordId)))) throw new Error('Receipt links changed. Generate a fresh preview.');
  CalculationEngine.installmentLedger.reconcileInstallments(preview.obligations.map(row => ({ ...row, currency: current.currencyCode })), preview.payments.map(row => ({ ...row, currency: current.currencyCode })), current.currencyCode, todayISODate());
  const updated: EMILoan = { ...current, contractSchedule: preview.obligations.map(row => ({ ...row })), paymentAllocations: [], balanceTracking: 'recorded' };
  if (JSON.stringify(updated) === JSON.stringify(current) && JSON.stringify(preview.payments) === JSON.stringify(payments)) return { changed: false, archiveId: null };
  const imported = new Set(preview.payments.map(row => row.id));
  if (before.repayments.some(row => row.loanId !== current.id && imported.has(row.id))) throw new Error('Imported receipt IDs conflict with another loan.');
  const archive = { id: crypto.randomUUID(), loanId: current.id, createdAt: new Date().toISOString(), sourceLabel: preview.sourceLabel, loan: JSON.parse(JSON.stringify(current)) as EMILoan, repayments: JSON.parse(JSON.stringify(payments)) as EMIRepayment[] };
  try {
    store.setWorkbook({ ...before, entries: before.entries.map(row => row.id === current.id ? updated : row), repayments: [...before.repayments.filter(row => row.loanId !== current.id), ...preview.payments.map(row => ({ ...row }))], reconciliationHistory: [...(before.reconciliationHistory ?? []), archive] });
    saveInstallmentContract(updated, updated.contractSchedule!);
  } catch (error) { store.setWorkbook(before); throw error; }
  return { changed: true, archiveId: archive.id };
}
