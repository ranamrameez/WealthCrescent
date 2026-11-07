import { auth } from '../../lib/firebase/client';
import { todayISODate } from '../../lib/datetime';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import type { EMILoan } from '../../types/emiWorkbook';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { usePlannedBankWorkbookStore } from '../../store/plannedBankWorkbookStore';
import { usePlannedCashWorkbookStore } from '../../store/plannedCashWorkbookStore';
import { usePlannedCreditCardWorkbookStore } from '../../store/plannedCreditCardWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';

export function saveEmiLoan(input: EMILoan, expected?: EMILoan, amountBasis: 'financed' | 'price' = 'financed', big?: { from: number; options: Parameters<typeof CalculationEngine.emi.generateBigEmiOverrides>[2] }) {
  if (!auth?.currentUser) throw new Error('Sign in to save loans.');
  const emi = useEMIWorkbookStore.getState();
  const current = emi.workbook.entries.find(loan => loan.id === input.id);
  if (current ? !expected || JSON.stringify(current) !== JSON.stringify(expected) : !!expected) throw new Error('This loan changed. Reopen its editor.');
  const loan = CalculationEngine.emi.normalizeEmiTerms(input, amountBasis);
  if (current?.contractSchedule) {
    const fields = ['principal', 'tenureMonths', 'startDate', 'firstInstallmentDate', 'repaymentMode', 'annualRatePct', 'totalToReturn', 'installmentOverrides', 'customMonthlyPayment', 'paymentDayOfMonth', 'installmentIntervalMonths', 'linkedBankAccountId'] as const;
    if (big || fields.some(field => JSON.stringify(current[field]) !== JSON.stringify(loan[field]))) throw new Error('Edit the independent contract obligations to change this agreement. Actual payment history must remain separate.');
    if (input.currencyCode !== current.currencyCode) throw new Error('An independent contract cannot change currency.');
    const updated = { ...current, name: input.name.trim(), lender: input.lender.trim() };
    if (!updated.name) throw new Error('Enter a loan name.');
    emi.updateEntry(current.id, { name: updated.name, lender: updated.lender });
    return updated;
  }
  if (big) {
    if (!Number.isInteger(big.from) || big.from < 1 || !Number.isInteger(big.options.intervalMonths) || big.options.intervalMonths < 1 || !Number.isFinite(big.options.amount) || big.options.amount <= 0) throw new Error('Enter a valid bigger-installment amount and interval.');
    const generated = CalculationEngine.emi.generateBigEmiOverrides(loan, big.from, big.options);
    // Recorded repayments are evidence, not a schedule-editing shortcut.
    for (const payment of emi.workbook.repayments.filter(payment => payment.loanId === loan.id)) delete generated[payment.month];
    loan.installmentOverrides = { ...loan.installmentOverrides, ...generated };
  }
  if (emi.workbook.repayments.some(payment => payment.loanId === loan.id && payment.month > loan.tenureMonths)) throw new Error('Tenure cannot exclude a recorded repayment.');
  if (current && current.currencyCode !== loan.currencyCode && emi.workbook.repayments.some(payment => payment.loanId === loan.id)) throw new Error('A loan with repayment history cannot change currency.');
  const bank = usePlannedBankWorkbookStore.getState();
  const cash = usePlannedCashWorkbookStore.getState();
  const card = usePlannedCreditCardWorkbookStore.getState();
  const plans = [
    ...bank.workbook.entries.filter(plan => plan.sourceEmiLoanId === loan.id).map(plan => ({ module: 'bank' as const, plan })),
    ...cash.workbook.entries.filter(plan => plan.sourceEmiLoanId === loan.id).map(plan => ({ module: 'cash' as const, plan })),
    ...card.workbook.entries.filter(plan => plan.sourceEmiLoanId === loan.id).map(plan => ({ module: 'creditCard' as const, plan })),
  ];
  if (current && current.currencyCode !== loan.currencyCode && plans.length) throw new Error('Unlink existing installment plans before changing currency.');
  const actuals = [
    ...useBankWorkbookStore.getState().workbook.transactions,
    ...useCashWorkbookStore.getState().workbook.entries,
    ...useCreditCardWorkbookStore.getState().workbook.transactions,
  ];
  if (plans.some(({ module, plan }) => !plan.executed && !plan.cancelled && actuals.some(actual => actual.planLink?.module === module && actual.planLink.planId === plan.id))) throw new Error('A linked installment already has a ledger record. Settle or void it before refreshing its plan.');
  const refresh = CalculationEngine.emi.refreshEmiLinkedPlans(loan, plans, emi.workbook.repayments, todayISODate());
  const account = loan.linkedBankAccountId ? useBankWorkbookStore.getState().workbook.settings.accounts.find(account => account.id === loan.linkedBankAccountId) : undefined;
  if (loan.linkedBankAccountId && (!account || account.isActive === false || account.migratedToCreditCardId || account.currencyCode !== loan.currencyCode)) throw new Error('Choose an active bank account in the loan currency.');
  const originals = [emi.workbook, bank.workbook, cash.workbook, card.workbook] as const;
  try {
    // This command owns the coordinated refresh; legacy updateEntry routing
    // cleanup would delete the very open plan identities we preserve here.
    emi.setWorkbook({ ...emi.workbook, entries: current ? emi.workbook.entries.map(row => row.id === loan.id ? loan : row) : [...emi.workbook.entries, loan] });
    for (const change of refresh.changes) {
      const store = change.module === 'bank' ? bank : change.module === 'cash' ? cash : card;
      if (change.remove) store.deleteEntry(change.id);
      else if (change.module === 'bank') bank.updateEntry(change.id, { date: change.date!, amount: change.amount!, ...(current?.linkedBankAccountId !== loan.linkedBankAccountId && account ? { accountId: account.id } : {}) });
      else store.updateEntry(change.id, { date: change.date!, amount: change.amount! });
    }
    if (account) bank.addEntries(refresh.missing.map(row => ({
      id: `emi:${loan.id}:${row.month}`, accountId: account.id, date: row.date,
      amount: row.amount, description: `EMI: ${loan.name} (#${row.month}/${loan.tenureMonths})`,
      executed: false, sourceEmiLoanId: loan.id, sourceEmiMonth: row.month,
    })));
  } catch (error) {
    emi.setWorkbook(originals[0]); bank.setWorkbook(originals[1]); cash.setWorkbook(originals[2]); card.setWorkbook(originals[3]);
    throw error;
  }
  return loan;
}
