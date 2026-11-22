import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { previewInstallmentImport, previewInstallmentWorkbook, applyInstallmentImport, previewInstallmentRestore, applyInstallmentRestore } from './installmentImportService';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import type { EMILoan } from '../../types/emiWorkbook';
const session = vi.hoisted(() => ({ signedIn: true, uid: 'fixture' }));
vi.mock('../../lib/firebase/client', () => ({ auth: { get currentUser() { return session.signedIn ? { uid: session.uid } : null; } }, db: null, firebaseReady: false }));
const originals = [useEMIWorkbookStore.getState().workbook, useInterEntityTransfersStore.getState().workbook, usePlannedCashWorkbookStore.getState().workbook] as const;
const loan: EMILoan = { id: 'import-loan', name: 'Property', lender: 'Seller', principal: 1000, totalToReturn: 1000, tenureMonths: 10, startDate: '2024-01-01', currencyCode: 'PKR', repaymentMode: 'fixedTotal' };
const table = [['Payment Desc', 'Due Month', 'Scheduled Amount', 'Payment Date', 'Paid Installment', 'Total Amount', 'Total Paid'], ['Booking', '2024-03-23', '200', '2024-03-23', '200', '1000', '550'], ['Regular', '2024-04-10', '100', '', '0'], ['Major', '2024-04-10', '700', '2024-06-04', '350']];
beforeEach(() => { session.signedIn = true; session.uid = 'fixture'; useEMIWorkbookStore.getState().setWorkbook({ settings: { defaultCurrency: 'PKR' }, entries: [loan, { ...loan, id: 'other' }], repayments: [{ id: 'old', loanId: loan.id, month: 1, date: '2024-02-01', amount: 100 }] }); useInterEntityTransfersStore.getState().setWorkbook({ settings: {}, entries: [] }); usePlannedCashWorkbookStore.getState().setWorkbook({ ...originals[2], budgetAllocations: [], entries: [] }); });
afterEach(() => { useEMIWorkbookStore.getState().setWorkbook(originals[0]); useInterEntityTransfersStore.getState().setWorkbook(originals[1]); usePlannedCashWorkbookStore.getState().setWorkbook(originals[2]); });
it('previews without writing, archives originals on explicit replacement and preserves other loans', () => {
  const before = useEMIWorkbookStore.getState().workbook;
  const preview = previewInstallmentImport(loan, table, '1900', 'Fixture');
  expect(preview.report.actualRemaining).toBe(450); expect(preview.currentRemaining).toBe(900);
  expect(useEMIWorkbookStore.getState().workbook).toBe(before);
  expect(() => applyInstallmentImport(preview, 'wrong')).toThrow('Type the loan name');
  const result = applyInstallmentImport(preview, loan.name);
  expect(result.changed).toBe(true);
  const wb = useEMIWorkbookStore.getState().workbook;
  expect(wb.reconciliationHistory?.[0].repayments).toEqual(before.repayments);
  expect(wb.repayments).toHaveLength(2); expect(wb.entries.find(row => row.id === 'other')).toEqual(before.entries[1]);
  expect(wb.repayments.every(row => row.paymentOnly && row.month === 0)).toBe(true);
  const current = wb.entries.find(row => row.id === loan.id)!;
  const again = previewInstallmentImport(current, table, '1900', 'Fixture');
  expect(applyInstallmentImport(again, current.name).changed).toBe(false);
  expect(useEMIWorkbookStore.getState().workbook.reconciliationHistory).toHaveLength(1);
});
it('rejects signed-out and stale payment snapshots', () => {
  const preview = previewInstallmentImport(loan, table, '1900', 'Fixture');
  session.signedIn = false; expect(() => applyInstallmentImport(preview, loan.name)).toThrow('Sign in'); session.signedIn = true;
  useEMIWorkbookStore.getState().addRepayment({ id: 'new', loanId: loan.id, month: 0, paymentOnly: true, date: '2024-05-01', amount: 10 });
  expect(() => applyInstallmentImport(preview, loan.name)).toThrow('changed');
});
it('blocks linked receipts and newly allocated budget records rather than changing their native accounting', () => {
  const preview = previewInstallmentImport(loan, table, '1900', 'Fixture');
  useInterEntityTransfersStore.getState().addEntry({ id: 'link', date: '2024-02-01', from: { module: 'bank', ref: 'bank' }, to: { module: 'emi', ref: loan.id, emiMonth: 1 }, fromAmount: 100, toAmount: 100, fromRecordId: 'bank-record', toRecordId: 'old' });
  expect(() => applyInstallmentImport(preview, loan.name)).toThrow('links changed');
  expect(previewInstallmentImport(loan, table, '1900', 'Fixture').blocked.join(' ')).toContain('linked receipt');
  useInterEntityTransfersStore.getState().setWorkbook({ settings: {}, entries: [] });
  usePlannedCashWorkbookStore.getState().setWorkbook({ ...usePlannedCashWorkbookStore.getState().workbook, budgetAllocations: [{ id: 'allocation', budgetId: 'budget', amount: 100, recordKey: CalculationEngine.budgets.budgetRecordKey({ module: 'emi', sourceId: loan.id, recordType: 'emi-repayment', id: 'old' }) }] });
  expect(() => applyInstallmentImport(preview, loan.name)).toThrow('budget allocations changed');
});
it('shows conflicting worksheet dates without guessing or merging receipts', () => {
  const workbook = { dateSystem: '1900' as const, sheets: [{ name: 'Contract', rows: table }, { name: 'Receipts', rows: [['Paid Date', 'Payment Amount'], ['2024-03-23', '200'], ['2099-06-04', '350']] }] };
  const preview = previewInstallmentWorkbook(loan, workbook, 0, 'Fixture');
  expect(preview.report.actualRemaining).toBe(450); expect(preview.differences.join(' ')).toContain('2099-06-04');
  expect(preview.payments[1].date).toBe('2024-06-04');
});
it('rejects a preview from a different account with identical loan and payment data', () => {
  const before = useEMIWorkbookStore.getState().workbook;
  const preview = previewInstallmentImport(loan, table, '1900', 'Fixture');
  session.uid = 'another-account';

  expect(() => applyInstallmentImport(preview, loan.name)).toThrow('signed-in account changed');
  expect(useEMIWorkbookStore.getState().workbook).toBe(before);
});

function importAndReviewRestore() {
  const imported = applyInstallmentImport(previewInstallmentImport(loan, table, '1900', 'Fixture'), loan.name);
  return previewInstallmentRestore(loan.id, imported.archiveId!);
}

it('restores a legacy receipt ledger, preserves current metadata and archives the displaced import', () => {
  const original = useEMIWorkbookStore.getState().workbook;
  const imported = importAndReviewRestore();
  const store = useEMIWorkbookStore.getState();
  store.updateEntry(loan.id, { name: 'Renamed property' });
  const review = previewInstallmentRestore(loan.id, imported.archive.id);
  expect(() => applyInstallmentRestore(review, loan.name)).toThrow('Type the loan name');
  expect(applyInstallmentRestore(review, 'Renamed property').changed).toBe(true);
  const restored = useEMIWorkbookStore.getState().workbook;
  expect(restored.entries).toEqual([{ ...loan, name: 'Renamed property' }, original.entries[1]]);
  expect(restored.repayments).toEqual(original.repayments);
  expect(restored.reconciliationHistory?.[1].repayments).toEqual(imported.payments);
  const retry = previewInstallmentRestore(loan.id, imported.archive.id);
  expect(applyInstallmentRestore(retry, 'Renamed property').changed).toBe(false);
});

it('rejects stale and cross-account restore reviews', () => {
  const preview = importAndReviewRestore();
  session.uid = 'another-account';
  expect(() => applyInstallmentRestore(preview, loan.name)).toThrow('signed-in account changed');
  session.uid = 'fixture';
  useEMIWorkbookStore.getState().updateRepayment(preview.payments[0].id, { description: 'Edited' });
  const current = useEMIWorkbookStore.getState().workbook;
  expect(() => applyInstallmentRestore(preview, loan.name)).toThrow('receipts or archive changed');
  expect(useEMIWorkbookStore.getState().workbook).toBe(current);
});

it('blocks budget references to archived receipts and links added after review', () => {
  const preview = importAndReviewRestore();
  const plans = usePlannedCashWorkbookStore.getState();
  const unallocated = plans.workbook;
  const recordKey = CalculationEngine.budgets.budgetRecordKey({ module: 'emi', sourceId: loan.id, recordType: 'emi-repayment', id: 'old' });
  plans.setWorkbook({ ...unallocated, budgetAllocations: [{ id: 'allocation', budgetId: 'budget', amount: 100, recordKey }] });
  expect(() => applyInstallmentRestore(preview, loan.name)).toThrow('budget allocations');
  plans.setWorkbook(unallocated);

  const receipt = preview.payments[0];
  useInterEntityTransfersStore.getState().addEntry({
    id: 'link', date: receipt.date, from: { module: 'bank', ref: 'bank' },
    to: { module: 'emi', ref: loan.id }, fromAmount: receipt.amount,
    toAmount: receipt.amount, fromRecordId: 'bank-record', toRecordId: receipt.id,
  });
  expect(() => applyInstallmentRestore(preview, loan.name)).toThrow('linked receipts');
});

it('rolls back the entire workbook when archived contract validation fails', () => {
  const preview = importAndReviewRestore();
  const store = useEMIWorkbookStore.getState();
  store.setWorkbook({
    ...store.workbook,
    reconciliationHistory: [{
      ...preview.archive,
      loan: {
        ...preview.archive.loan,
        contractSchedule: [{ id: 'invalid', dueDate: 'invalid', amount: 100, description: 'Invalid date' }],
      },
    }],
  });
  const before = useEMIWorkbookStore.getState().workbook;
  const invalid = previewInstallmentRestore(loan.id, preview.archive.id);
  expect(() => applyInstallmentRestore(invalid, loan.name)).toThrow(/date/i);
  expect(useEMIWorkbookStore.getState().workbook).toEqual(before);
});
