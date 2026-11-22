import { useMemo } from 'react';
import { auth } from '../../lib/firebase/client';
import { toCSV } from '../../lib/csv';
import { todayISODate } from '../../lib/datetime';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { emiRepaymentEffect, isEmiReversalProtected, type EMILoan, type EMIRepayment } from '../../types/emiWorkbook';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';

function reviewedLoan(expected: EMILoan) {
  if (!auth?.currentUser) throw new Error('Sign in to update installment records.');
  const store = useEMIWorkbookStore.getState();
  const current = store.workbook.entries.find(row => row.id === expected.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('This loan changed. Reopen the editor.');
  return { store, current };
}
export function saveInstallmentContract(expected: EMILoan, rows: NonNullable<EMILoan['contractSchedule']>, allocations = expected.paymentAllocations) {
  const { store } = reviewedLoan(expected);
  if (expected.repaymentMode !== 'fixedTotal') throw new Error('Independent contractual totals require a fixed-total agreement.');
  if (!rows.length) throw new Error('Add the contractual obligations first.');
  if (allocations?.length) {
    const payments = store.workbook.repayments.filter(row => row.loanId === expected.id).map(row => ({ ...row, currency: expected.currencyCode }));
    const validationDate = payments.reduce((date, row) => row.date > date ? row.date : date, todayISODate());
    CalculationEngine.installmentLedger.reconcileInstallments(rows.map(row => ({ ...row, currency: expected.currencyCode })), payments, expected.currencyCode, validationDate, allocations);
  }
  const report = CalculationEngine.installmentLedger.reconcileInstallments(rows.map(row => ({ ...row, currency: expected.currencyCode })), store.workbook.repayments.filter(row => row.loanId === expected.id).map(row => ({ ...row, currency: expected.currencyCode })), expected.currencyCode, todayISODate(), allocations);
  const bank = usePlannedBankWorkbookStore.getState(), cash = usePlannedCashWorkbookStore.getState(), card = usePlannedCreditCardWorkbookStore.getState();
  const originals = [store.workbook, bank.workbook, cash.workbook, card.workbook] as const;
  const sources = [{ module: 'bank' as const, state: bank }, { module: 'cash' as const, state: cash }, { module: 'creditCard' as const, state: card }];
  const actuals = [...useBankWorkbookStore.getState().workbook.transactions, ...useCashWorkbookStore.getState().workbook.entries, ...useCreditCardWorkbookStore.getState().workbook.transactions];
  const covered = new Set<string>();
  const changes: { module: 'bank' | 'cash' | 'creditCard'; id: string; obligationId: string; amount?: number; date?: string }[] = [];
  for (const { module, state } of sources) for (const plan of state.workbook.entries.filter(row => row.sourceEmiLoanId === expected.id)) {
    const obligationId = plan.sourceEmiObligationId ?? `installment:${plan.sourceEmiMonth}`;
    if (plan.executed) continue;
    if (plan.cancelled) { covered.add(obligationId); continue; }
    if (plan.recurrence) throw new Error('Review recurring source plans before adopting an independent contract.');
    if (actuals.some(actual => actual.planLink?.module === module && actual.planLink.planId === plan.id)) throw new Error('Settle or void linked ledger records before refreshing their plans.');
    const obligation = report.rows.find(row => row.id === obligationId);
    if (obligation && covered.has(obligationId)) throw new Error('Duplicate installment plans need review.');
    covered.add(obligationId);
    changes.push({ module, id: plan.id, obligationId, amount: obligation?.remaining, date: obligation?.dueDate });
  }
  const account = expected.linkedBankAccountId ? useBankWorkbookStore.getState().workbook.settings.accounts.find(row => row.id === expected.linkedBankAccountId) : undefined;
  if (expected.linkedBankAccountId && (!account || account.currencyCode !== expected.currencyCode || account.isActive === false || account.migratedToCreditCardId)) throw new Error('Review the linked bank account and currency first.');
  try {
    store.updateEntry(expected.id, { contractSchedule: rows.map(row => ({ ...row })), paymentAllocations: allocations?.map(row => ({ ...row })), balanceTracking: 'recorded' });
    for (const change of changes) {
      const target = change.module === 'bank' ? bank : change.module === 'cash' ? cash : card;
      if (!change.amount || !change.date) target.deleteEntry(change.id);
      else target.updateEntry(change.id, { date: change.date, amount: change.module === 'bank' ? -change.amount : change.amount, sourceEmiObligationId: change.obligationId });
    }
    if (account) {
      const used = new Set(bank.workbook.entries.map(row => row.id));
      bank.addEntries(report.rows.filter(row => row.remaining > 0 && !covered.has(row.id)).map(row => {
        const base = `emi-contract:${expected.id}:${row.id}`;
        let id = base, suffix = 1;
        while (used.has(id)) id = `${base}:${++suffix}`;
        used.add(id);
        return { id, accountId: account.id, date: row.dueDate, amount: -row.remaining, description: `${expected.name}: ${row.description}`, sourceEmiLoanId: expected.id, sourceEmiObligationId: row.id, executed: false };
      }));
    }
  } catch (error) { store.setWorkbook(originals[0]); bank.setWorkbook(originals[1]); cash.setWorkbook(originals[2]); card.setWorkbook(originals[3]); throw error; }
}
export function saveInstallmentPayment(expected: EMILoan, input: { id?: string; date: string; amount: number; description?: string }, original?: EMIRepayment) {
  const { store } = reviewedLoan(expected);
  if (!expected.contractSchedule) throw new Error('Review and save a contract schedule first.');
  const existing = input.id ? store.workbook.repayments.find(row => row.id === input.id && row.loanId === expected.id) : undefined;
  if (input.id && (!existing || !original || JSON.stringify(existing) !== JSON.stringify(original))) throw new Error('This payment changed. Reopen its editor.');
  if (existing && isEmiReversalProtected(existing, store.workbook.repayments)) throw new Error('Receipts with reversal history cannot be edited in place.');
  if (existing && useInterEntityTransfersStore.getState().workbook.entries.some(link => (link.from.module === 'emi' && link.fromRecordId === existing.id) || (link.to.module === 'emi' && link.toRecordId === existing.id))) throw new Error('Edit this linked payment through its linked transaction workflow to keep both ledgers consistent.');
  if (!(input.amount > 0)) throw new Error('Payment must be positive.');
  CalculationEngine.installmentLedger.reconcileInstallments([], [{ id: input.id ?? 'new', date: input.date, amount: input.amount, currency: expected.currencyCode }], expected.currencyCode, todayISODate());
  const record: EMIRepayment = { ...existing, id: input.id ?? crypto.randomUUID(), loanId: expected.id, month: existing?.month ?? 0, paymentOnly: true, date: input.date, amount: input.amount, description: input.description, source: existing?.source ?? 'manual' };
  const before = store.workbook;
  try {
    if (existing) store.updateRepayment(existing.id, record); else store.addRepayment(record);
    saveInstallmentContract(expected, expected.contractSchedule);
  } catch (error) { store.setWorkbook(before); throw error; }
  return record;
}
export function previewInstallmentReversal(expected: EMILoan, original: EMIRepayment) {
  const { store } = reviewedLoan(expected);
  const reviewedUid = auth?.currentUser?.uid;
  if (!reviewedUid) throw new Error('Sign in to review the reversal.');
  if (!expected.contractSchedule?.length) throw new Error('Review a contract before reversing a payment.');
  const own = store.workbook.repayments.filter(row => row.loanId === expected.id);
  const current = own.find(row => row.id === original.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(original)) throw new Error('The original receipt changed. Review it again.');
  if (current.reversesPaymentId !== undefined) throw new Error('Review the original payment before recording a reversal.');
  if (current.planLink || useInterEntityTransfersStore.getState().workbook.entries.some(link =>
    (link.from.module === 'emi' && link.fromRecordId === current.id) || (link.to.module === 'emi' && link.toRecordId === current.id))) {
    throw new Error('A linked payment needs a coordinated reversal with its funding ledger.');
  }
  const reversed = own.filter(row => row.reversesPaymentId === current.id);
  const remaining = current.amount - reversed.reduce((sum, row) => sum + row.amount, 0);
  if (remaining <= 0.0000001) throw new Error('This payment has already been reversed in full.');
  return structuredClone({ expected, original: current, reviewedUid, reversed, remaining });
}

export function saveInstallmentReversal(preview: ReturnType<typeof previewInstallmentReversal>, input: { date: string; amount: number; description?: string }) {
  const { expected, original } = preview;
  if (auth?.currentUser?.uid !== preview.reviewedUid) throw new Error('The signed-in account changed. Review the receipt again.');
  const current = previewInstallmentReversal(expected, original);
  if (JSON.stringify(current.reversed) !== JSON.stringify(preview.reversed)) throw new Error('The reversal history changed. Review the receipt again.');
  const store = useEMIWorkbookStore.getState();
  const before = store.workbook;
  const own = before.repayments.filter(row => row.loanId === expected.id);
  const contract = expected.contractSchedule!;
  const asOf = todayISODate();
  if (input.date > asOf) throw new Error('A recorded reversal date cannot be in the future.');
  const reversal: EMIRepayment = {
    id: crypto.randomUUID(), loanId: expected.id, date: input.date, amount: input.amount, month: 0,
    paymentOnly: true, reversesPaymentId: original.id, description: input.description?.trim() || 'Payment reversal', source: 'manual',
  };
  CalculationEngine.installmentLedger.reconcileInstallments(
    contract.map(row => ({ ...row, currency: expected.currencyCode })),
    [...own, reversal].map(row => ({ ...row, currency: expected.currencyCode })),
    expected.currencyCode, asOf, expected.paymentAllocations,
  );
  try {
    store.addRepayment(reversal);
    saveInstallmentContract(expected, contract);
  } catch (error) {
    store.setWorkbook(before);
    throw error;
  }
  return reversal;
}

export function saveInstallmentAllocations(expected: EMILoan, paymentId: string, allocations: { obligationId: string; amount: number }[]) {
  const { store } = reviewedLoan(expected);
  if (!expected.contractSchedule) throw new Error('Review a contract first.');
  const payment = store.workbook.repayments.find(row => row.id === paymentId && row.loanId === expected.id);
  if (!payment) throw new Error('Payment no longer exists.');
  if (isEmiReversalProtected(payment, store.workbook.repayments)) throw new Error('Receipts with reversal history retain their reviewed allocations.');
  const next = [...(expected.paymentAllocations ?? []).filter(row => row.paymentId !== paymentId), ...allocations.map(row => ({ ...row, paymentId }))];
  saveInstallmentContract(expected, expected.contractSchedule, next);
}
export function setInstallmentPayingAccount(expected: EMILoan, accountId: string) {
  const { store } = reviewedLoan(expected);
  if (!expected.contractSchedule) throw new Error('Review a contract first.');
  const account = accountId ? useBankWorkbookStore.getState().workbook.settings.accounts.find(row => row.id === accountId && row.currencyCode === expected.currencyCode && row.isActive !== false && !row.migratedToCreditCardId) : undefined;
  if (accountId && !account) throw new Error('Choose an active bank account in the contract currency.');
  const plans = usePlannedBankWorkbookStore.getState(), before = store.workbook, beforePlans = plans.workbook;
  const updated = { ...expected, linkedBankAccountId: account?.id };
  try {
    store.setWorkbook({ ...before, entries: before.entries.map(row => row.id === expected.id ? updated : row) });
    if (account) for (const plan of plans.workbook.entries.filter(row => row.sourceEmiLoanId === expected.id && !row.executed && !row.cancelled)) plans.updateEntry(plan.id, { accountId: account.id });
    saveInstallmentContract(updated, updated.contractSchedule!);
  } catch (error) { store.setWorkbook(before); plans.setWorkbook(beforePlans); throw error; }
}
function toInstallmentCsv(rows: (string | number)[][]) {
  return toCSV(rows.map(row => row.map(value =>
    typeof value === 'string' && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value,
  )));
}

export function installmentReceiptStatus(receipt: EMIRepayment, asOf: string) {
  if (receipt.reversesPaymentId) return 'Reversal';
  return receipt.date > asOf ? 'Future-dated' : 'Recorded';
}

export function exportInstallmentReceiptsCsv(receipts: readonly EMIRepayment[], currency: string, asOf: string) {
  return {
    fileName: `installment-receipts-${asOf}.csv`,
    csv: toInstallmentCsv([
      ['Date', 'Receipt ID', 'Description', 'Currency', 'Amount', 'Status', 'Reverses receipt ID', 'Report cutoff'],
      ...receipts.map(receipt => [
        receipt.date, receipt.id, receipt.description || 'Payment', currency, emiRepaymentEffect(receipt),
        installmentReceiptStatus(receipt, asOf), receipt.reversesPaymentId ?? '', asOf,
      ]),
    ]),
  };
}

export function exportInstallmentObligationsCsv(report: ReturnType<typeof CalculationEngine.installmentLedger.reconcileInstallments>) {
  return {
    fileName: `installment-obligations-${report.asOf}.csv`,
    csv: toInstallmentCsv([
      ['Due date', 'Description', 'Currency', 'Report cutoff', 'Scheduled', 'Allocated paid', 'Remaining', 'Status'],
      ...report.rows.map(row => [
        row.dueDate, row.description, report.currency, report.asOf, row.amount, row.paid, row.remaining, row.status,
      ]),
    ]),
  };
}

export function exportInstallmentLedgerCsv(report: ReturnType<typeof CalculationEngine.installmentLedger.reconcileInstallments>) {
  const rows = report.events.map(event => [
    event.date,
    event.kind,
    event.description,
    report.currency,
    report.asOf,
    event.future ? 'Yes' : 'No',
    event.kind === 'obligation' ? event.amount : '',
    event.kind !== 'obligation' ? event.amount : '',
    event.cumulativePaid,
    event.actualRemaining,
    event.scheduledRemaining,
    event.pending,
  ]);
  const csv = toInstallmentCsv([
    ['Date', 'Event type', 'Description', 'Currency', 'Report cutoff', 'Future', 'Scheduled amount', 'Payment or reversal', 'Cumulative paid', 'Actual remaining', 'Scheduled remaining', 'Net due less paid'],
    ...rows,
  ]);
  return { fileName: `installment-ledger-${report.asOf}.csv`, csv };
}

export function exportInstallmentMonthlyCsv(
  monthly: ReturnType<typeof CalculationEngine.installmentLedger.installmentMonthlySummary>,
  currency: string,
  asOf: string,
) {
  return {
    fileName: `installment-monthly-${asOf}.csv`,
    csv: toCSV([
      ['Month', 'Currency', 'Report cutoff', 'Scheduled', 'Actual paid', 'Actual remaining', 'Scheduled remaining'],
      ...monthly.rows.map(row => [
        row.month, currency, asOf, row.scheduled, row.actual ?? '', row.actualRemaining ?? '', row.scheduledRemaining,
      ]),
    ]),
  };
}

export function useInstallmentReport(loanId: string) {
  const workbook = useEMIWorkbookStore(state => state.workbook);
  const accounts = useBankWorkbookStore(state => state.workbook.settings.accounts);
  const links = useInterEntityTransfersStore(state => state.workbook.entries);
  const asOf = todayISODate();
  return useMemo(() => {
    const loan = workbook.entries.find(row => row.id === loanId);
    if (!loan) return null;
    const payments = workbook.repayments.filter(row => row.loanId === loanId).sort((a, b) => a.date.localeCompare(b.date));
    const suggested = CalculationEngine.emi.emiSchedule(loan).rows.map(row => ({ id: `installment:${row.month}`, dueDate: CalculationEngine.emi.installmentDueDate(loan, row.month), amount: row.emi, description: `Installment ${row.month}` }));
    const report = loan.contractSchedule ? CalculationEngine.installmentLedger.reconcileInstallments(loan.contractSchedule.map(row => ({ ...row, currency: loan.currencyCode })), payments.map(row => ({ ...row, currency: loan.currencyCode })), loan.currencyCode, asOf, loan.paymentAllocations) : null;
    const archives = (workbook.reconciliationHistory ?? [])
      .filter(row => row.loanId === loanId)
      .map(({ id, sourceLabel, createdAt }) => ({ id, sourceLabel, createdAt }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const linkedPaymentIds = new Set(links.flatMap(link => [
      ...(link.from.module === 'emi' ? [link.fromRecordId] : []),
      ...(link.to.module === 'emi' ? [link.toRecordId] : []),
    ]));
    const remainingByPayment = new Map(payments.filter(row => row.reversesPaymentId === undefined).map(row => [row.id, row.amount]));
    for (const row of payments) if (row.reversesPaymentId) {
      remainingByPayment.set(row.reversesPaymentId, (remainingByPayment.get(row.reversesPaymentId) ?? 0) - row.amount);
    }
    const reversible = new Set(payments.filter(row => !row.planLink && !linkedPaymentIds.has(row.id) && row.date <= asOf &&
      (remainingByPayment.get(row.id) ?? 0) > 0.0000001).map(row => row.id));
    return { loan, payments, suggested, asOf, report, archives, linkedPaymentIds, reversible, monthly: report ? CalculationEngine.installmentLedger.installmentMonthlySummary(report) : null, fundingOptions: accounts.filter(row => row.currencyCode === loan.currencyCode && row.isActive !== false && !row.migratedToCreditCardId).map(row => ({ value: row.id, label: row.name })) };
  }, [workbook, accounts, links, loanId, asOf]);
}
