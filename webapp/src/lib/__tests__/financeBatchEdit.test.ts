import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveBankBatch, saveBankPlanBatch, saveLoanPaymentBatch, saveLoanPlanBatch, validateFinanceBatch } from '../financeBatchEdit';
import { useBankWorkbookStore as bank } from '../../store/bankWorkbookStore';
import { usePersonalLoansWorkbookStore as loans } from '../../store/personalLoansWorkbookStore';
import { usePlannedBankWorkbookStore as plans } from '../../store/plannedBankWorkbookStore';
import { useInterEntityTransfersStore as links } from '../../store/interEntityTransfersStore';
import type { BankAccount, BankTransaction } from '../../types/bankWorkbook';
import type { PersonalLoan } from '../../types/personalLoansWorkbook';

const account: BankAccount = { id: 'account', name: 'Bank', currencyCode: 'QAR', openingBalance: 0, color: '#123456', isFavorite: true };
const loan: PersonalLoan = { id: 'loan', person: 'Person', currencyCode: 'QAR', direction: 'i_owe', date: '2026-09-01', principal: 500 };
const tx: BankTransaction = { id: 'tx', accountId: 'account', amount: -20, description: 'Original', date: '2026-09-01', time: '10:30', timezone: 'Asia/Qatar', source: 'statement-import', statementRef: 'sample.csv', serialNumber: 4, isDeposit: false };
beforeEach(() => {
  bank.getState().setWorkbook({ settings: { accounts: [account] }, transactions: [tx, { ...tx, id: 'tx2', serialNumber: 5 }] });
  loans.getState().setWorkbook({ settings: { defaultCurrency: 'QAR' }, loans: [loan], repayments: [{ id: 'payment', loanId: loan.id, date: '2026-09-01', amount: 10, seq: 8 }], plans: [{ id: 'plan', loanId: loan.id, date: '2026-09-01', amount: 30 }] });
  plans.getState().setWorkbook({ settings: { showRealBalance: true, showPlannedBalance: true }, entries: [{ id: 'plan', accountId: account.id, date: '2026-09-01', amount: -10, description: 'Plan' }] });
  links.getState().setWorkbook({ settings: {}, entries: [] });
});
describe('finance batch commits', () => {
  it('commits bank changes once, derives direction, and preserves identity, provenance and entity preferences', () => {
    const before = structuredClone(bank.getState().workbook.transactions[0]);
    const listener = vi.fn();
    const stop = bank.subscribe(listener);
    saveBankBatch(account, [{ before, after: { ...before, amount: 50, isPending: true, accountId: 'wrong', source: 'manual', serialNumber: 999 } }]);
    stop();
    expect(listener).toHaveBeenCalledOnce();
    expect(bank.getState().workbook.transactions[0]).toEqual({ ...before, amount: 50, isDeposit: true, isPending: true });
    expect(bank.getState().workbook.settings.accounts[0]).toEqual(account);
  });
  it('rejects all rows when one is invalid or changed remotely', () => {
    const [a, b] = structuredClone(bank.getState().workbook.transactions);
    const original = bank.getState().workbook;
    expect(() => saveBankBatch(account, [{ before: a, after: { ...a, amount: 100 } }, { before: b, after: { ...b, date: '2026-02-30' } }])).toThrow('valid date');
    expect(bank.getState().workbook).toBe(original);
    bank.getState().updateTransaction(b.id, { description: 'Cloud edit' });
    expect(() => saveBankBatch(account, [{ before: a, after: { ...a, amount: 100 } }, { before: b, after: { ...b, amount: 10 } }])).toThrow('changed or was removed');
    expect(bank.getState().workbook.transactions[0].amount).toBe(a.amount);
  });
  it('detects links created after opening and leaves both sides untouched', () => {
    const before = structuredClone(bank.getState().workbook.transactions[0]);
    links.getState().addEntry({ id: 'link', from: { module: 'bank', ref: account.id }, to: { module: 'personalLoans', ref: loan.id }, fromRecordId: before.id, toRecordId: 'payment', fromAmount: 20, toAmount: 20, date: before.date });
    expect(() => saveBankBatch(account, [{ before, after: { ...before, amount: -80 } }])).toThrow('Linked transfer');
    const payment = loans.getState().workbook.repayments[0];
    expect(() => saveLoanPaymentBatch(loan, [{ before: payment, after: { ...payment, amount: 80 } }])).toThrow('Linked transfer');
    expect(bank.getState().workbook.transactions[0]).toEqual(before);
    expect(links.getState().workbook.entries[0].fromAmount).toBe(20);
  });
  it.each(['i_owe', 'owed_to_me'] as const)('preserves %s semantics and payment sequence', direction => {
    const entity = { ...loan, direction };
    loans.getState().updateLoan(loan.id, entity);
    const before = loans.getState().workbook.repayments[0];
    saveLoanPaymentBatch(entity, [{ before, after: { ...before, amount: 35, isPending: true } }]);
    expect(loans.getState().workbook.repayments[0]).toEqual({ ...before, amount: 35, isPending: true });
    expect(loans.getState().workbook.loans[0].direction).toBe(direction);
    expect(() => saveLoanPaymentBatch(entity, [{ before: loans.getState().workbook.repayments[0], after: { ...before, amount: -1 } }])).toThrow('greater than zero');
  });
  it('edits simple plans but locks executed, recurring and generated plans', () => {
    const before = plans.getState().workbook.entries[0];
    saveBankPlanBatch(account, [{ before, after: { ...before, amount: -40 } }]);
    for (const patch of [{ executed: true }, { sourceEmiLoanId: 'emi' }, { sourceSubscriptionId: 'sub' }, { recurrence: { cycle: 'monthly' as const, startDate: before.date } }]) {
      plans.getState().updateEntry(before.id, patch);
      const current = plans.getState().workbook.entries[0];
      expect(() => saveBankPlanBatch(account, [{ before: current, after: { ...current, amount: -50 } }])).toThrow();
      plans.getState().setWorkbook({ ...plans.getState().workbook, entries: [before] });
    }
    const lp = loans.getState().workbook.plans![0];
    saveLoanPlanBatch(loan, [{ before: lp, after: { ...lp, amount: 70 } }]);
    loans.getState().updatePlan(lp.id, { executed: true });
    const executed = loans.getState().workbook.plans![0];
    expect(() => saveLoanPlanBatch(loan, [{ before: executed, after: { ...executed, amount: 80 } }])).toThrow('Executed');
  });
  it('rejects removed rows and changed currency, and validates time/number formats', () => {
    const before = bank.getState().workbook.transactions[0];
    bank.getState().deleteTransaction(before.id);
    expect(() => saveBankBatch(account, [{ before, after: { ...before, amount: 100 } }])).toThrow('removed');
    bank.getState().updateAccount(account.id, { currencyCode: 'USD' });
    expect(() => saveBankBatch(account, [])).toThrow('Account changed');
    expect(validateFinanceBatch({ ...tx, amount: Infinity, time: '25:10', timezone: 'Invalid/Zone' }, true)).toMatchObject({ amount: expect.any(String), time: expect.any(String), timezone: expect.any(String) });
  });
});
