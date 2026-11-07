import { useMemo } from 'react';
import { auth } from '../../lib/firebase/client';
import { todayISODate } from '../../lib/datetime';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import type { EMILoan, EMIRepayment } from '../../types/emiWorkbook';
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
export function saveInstallmentAllocations(expected: EMILoan, paymentId: string, allocations: { obligationId: string; amount: number }[]) {
  const { store } = reviewedLoan(expected);
  if (!expected.contractSchedule) throw new Error('Review a contract first.');
  if (!store.workbook.repayments.some(row => row.id === paymentId && row.loanId === expected.id)) throw new Error('Payment no longer exists.');
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
export function useInstallmentReport(loanId: string) {
  const workbook = useEMIWorkbookStore(state => state.workbook);
  const accounts = useBankWorkbookStore(state => state.workbook.settings.accounts);
  const asOf = todayISODate();
  return useMemo(() => {
    const loan = workbook.entries.find(row => row.id === loanId);
    if (!loan) return null;
    const payments = workbook.repayments.filter(row => row.loanId === loanId).sort((a, b) => a.date.localeCompare(b.date));
    const suggested = CalculationEngine.emi.emiSchedule(loan).rows.map(row => ({ id: `installment:${row.month}`, dueDate: CalculationEngine.emi.installmentDueDate(loan, row.month), amount: row.emi, description: `Installment ${row.month}` }));
    const report = loan.contractSchedule ? CalculationEngine.installmentLedger.reconcileInstallments(loan.contractSchedule.map(row => ({ ...row, currency: loan.currencyCode })), payments.map(row => ({ ...row, currency: loan.currencyCode })), loan.currencyCode, asOf, loan.paymentAllocations) : null;
    return { loan, payments, suggested, asOf, report, monthly: report ? CalculationEngine.installmentLedger.installmentMonthlySummary(report) : null, fundingOptions: accounts.filter(row => row.currencyCode === loan.currencyCode && row.isActive !== false && !row.migratedToCreditCardId).map(row => ({ value: row.id, label: row.name })) };
  }, [workbook, accounts, loanId, asOf]);
}
