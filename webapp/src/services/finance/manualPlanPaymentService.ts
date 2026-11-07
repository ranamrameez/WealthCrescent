import { auth } from '../../lib/firebase/client';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import { readFinancePlans, writeFinancePlan } from '../../lib/financePlans';
import type { PlanReference, FinancePlan } from '../../lib/calc/financePlanModel';
import { useCategoryStore } from '../../store/categoryStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { useInterEntityTransfersStore } from '../../store/interEntityTransfersStore';
import { saveInstallmentContract } from './installmentService';

/** Legacy interactive Mark done command, with local rollback and explicit provenance.
 * This is not an atomic remote repository or a backend scheduler entry point. */
export function fulfillManualPlan(reference: PlanReference, occurrenceDate: string, expected: FinancePlan, today = new Date().toISOString().slice(0,10)) {
  if (!auth?.currentUser) throw new Error('Sign in to fulfill this plan.');
  const source = readFinancePlans().find(row=>row.module === reference.module && row.plan.id === reference.id)?.plan;
  if (!source || JSON.stringify(source) !== JSON.stringify(expected)) throw new Error('This plan changed. Reopen its current occurrence.');
  const category = useCategoryStore.getState().workbook.categories.find(category=>category.name.trim().toLocaleLowerCase() === source.category?.trim().toLocaleLowerCase());
  const actualDate = 'recurrence' in source && source.recurrence ? today : occurrenceDate;
  const prepared = CalculationEngine.manualPayments.prepareManualPlanFulfillment(reference,source,occurrenceDate,actualDate,category?.id);
  const { result } = prepared;
  const cash = useCashWorkbookStore.getState(), bank = useBankWorkbookStore.getState(), cards = useCreditCardWorkbookStore.getState();
  if (result.module === 'bank' && !bank.workbook.settings.accounts.some(account=>account.id === result.record.accountId && !account.migratedToCreditCardId && account.isActive !== false)) throw new Error('Choose an active bank account.');
  if (result.module === 'creditCard' && !cards.workbook.cards.some(card=>card.id === result.record.cardId && card.isActive !== false)) throw new Error('Choose an active credit card.');
  const existing = result.module === 'cash' ? cash.workbook.entries : result.module === 'bank' ? bank.workbook.transactions : cards.workbook.transactions;
  if (existing.some(record=>record.id === result.record.id || (record.planLink?.module === reference.module && record.planLink.planId === reference.id && record.planLink.occurrenceDate === occurrenceDate))) throw new Error('This occurrence already has a ledger record.');
  const cashPlans = usePlannedCashWorkbookStore.getState(), bankPlans = usePlannedBankWorkbookStore.getState(), cardPlans = usePlannedCreditCardWorkbookStore.getState();
  const emi = useEMIWorkbookStore.getState(), links = useInterEntityTransfersStore.getState();
  const independentLoan = 'sourceEmiObligationId' in source && source.sourceEmiObligationId && 'sourceEmiLoanId' in source ? emi.workbook.entries.find(row => row.id === source.sourceEmiLoanId) : undefined;
  if ('sourceEmiObligationId' in source && source.sourceEmiObligationId && !independentLoan?.contractSchedule) throw new Error('The independent contract no longer exists. Review this plan.');
  if (independentLoan) {
    if (result.module === 'creditCard') throw new Error('Record this payment through Contract & payments; a card-funded loan payment needs a reviewed charge linkage.');
    if (result.record.isDeposit) throw new Error('A loan payment must be an outflow.');
    const currency = result.module === 'cash' ? result.record.currencyCode : bank.workbook.settings.accounts.find(row => row.id === result.record.accountId)?.currencyCode;
    if (currency !== independentLoan.currencyCode) throw new Error('Loan payment currency does not match its paying source.');
    if (emi.workbook.repayments.some(row => row.id === `emi:${result.record.id}`)) throw new Error('This installment already has a repayment record.');
  }
  const rollbackActual = result.module === 'cash' ? () => cash.setWorkbook(cash.workbook) : result.module === 'bank' ? () => bank.setWorkbook(bank.workbook) : () => cards.setWorkbook(cards.workbook);
  const rollbackPlan = result.module === 'cash' ? () => cashPlans.setWorkbook(cashPlans.workbook) : result.module === 'bank' ? () => bankPlans.setWorkbook(bankPlans.workbook) : () => cardPlans.setWorkbook(cardPlans.workbook);
  try {
    if (result.module === 'cash') cash.addEntry(result.record);
    else if (result.module === 'bank') bank.addTransaction(result.record);
    else cards.addTransaction(result.record);
    writeFinancePlan(reference.module,prepared.updated,true);
    if (prepared.snapshot) writeFinancePlan(reference.module,prepared.snapshot);
    if (independentLoan && result.module !== 'creditCard') {
      const amount = Math.abs(result.record.amount), repaymentId = `emi:${result.record.id}`;
      emi.addRepayment({ id: repaymentId, loanId: independentLoan.id, month: 0, paymentOnly: true, date: actualDate, amount, description: 'Scheduled contract payment', source: 'manual', planLink: result.record.planLink, categoryID: category?.id });
      links.addEntry({ id: `emi-link:${result.record.id}`, date: actualDate, fromAmount: amount, toAmount: amount, from: result.module === 'cash' ? { module: 'cash', currencyCode: independentLoan.currencyCode } : { module: 'bank', ref: result.record.accountId }, to: { module: 'emi', ref: independentLoan.id, emiIndependent: true }, fromRecordId: result.record.id, toRecordId: repaymentId, categoryID: category?.id });
      saveInstallmentContract(independentLoan, independentLoan.contractSchedule!);
    }
  } catch (error) {
    rollbackActual(); rollbackPlan(); emi.setWorkbook(emi.workbook); links.setWorkbook(links.workbook); throw error;
  }
  return { recurring: prepared.recurring, actualId: result.record.id, occurrenceDate, actualDate };
}
