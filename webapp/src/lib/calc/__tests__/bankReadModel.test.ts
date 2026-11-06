import { describe, expect, it } from 'vitest';
import { CalculationEngine } from '../CalculationEngine';
import type { BankAccount, BankTransaction } from '../../../types/bankWorkbook';
import type { BankingReadFilters } from '../bankReadModel';
const filters: BankingReadFilters = { fromDate: '2026-01-01', toDate: '2026-01-31', direction: 'all', category: 'all', source: 'all', accountId: 'all' };
const account: BankAccount = { id: 'a', name: 'Account', currencyCode: 'USD', openingBalance: 100 };
const tx = (id: string, date: string, amount: number, extra: Partial<BankTransaction> = {}): BankTransaction => ({ id, date, amount, accountId: 'a', description: id, isDeposit: amount >= 0, source: 'manual', ...extra });
const date = new Date('2026-01-31');

describe('Banking financial read models', () => {
  it('retains full cleared opening/current balances while flow filters select charts and tables together', () => {
    const input = [tx('before', '2025-12-31', 50), tx('income', '2026-01-05', 20), tx('food', '2026-01-06', -10, { categoryID: 'food' }), tx('pending', '2026-01-07', -9, { isPending: true }), tx('future', '2026-02-01', 900), tx('other-account', '2026-01-01', 777, { accountId: 'other' })];
    const model = CalculationEngine.bank.bankAccountReadModel(account, input, [], [{ id: 'food', name: 'Food', serialNumber: 1 }], { ...filters, category: 'Food' }, date);
    expect(model.periodStartBalance).toBe(150);
    expect(model.periodCurrentBalance).toBe(160);
    expect(model.currentBalance).toBe(160);
    expect(model.analytics.deposits).toBe(0);
    expect(model.analytics.withdrawals).toBe(10);
    expect(model.clearedLedger.map(row => row.tx.id)).toEqual(['food']);
    expect(model.analytics.transactions.map(row => row.id)).toEqual(['food']);
  });
  it('keeps pending, actual and recurring planned amounts separate with one occurrence population', () => {
    const model = CalculationEngine.bank.bankAccountReadModel(account, [tx('actual', '2026-01-02', 20), tx('pending', '2026-01-03', -9, { isPending: true })], [
      { id: 'plan', accountId: 'a', date: '2026-01-31', amount: -10, description: 'Bill', recurrence: { cycle: 'monthly', startDate: '2026-01-31' }, completedDates: ['2026-02-28'] },
    ], [], { ...filters, toDate: '2026-03-31' }, date);
    expect(model.pendingOutflow).toBe(-9);
    expect(model.analytics.netFlow).toBe(20);
    expect(model.plannedOutflow).toBe(-20);
    expect(model.upcoming.map(plan => plan.date)).toEqual(['2026-01-31', '2026-03-31']);
    expect(model.upcoming.reduce((sum, plan) => sum + plan.amount, 0)).toBe(model.plannedOutflow);
  });
  it('uses period-end card debt and retains closed cards without blending currencies', () => {
    const result = CalculationEngine.bank.bankingScopeSummary([], [], [{ id: 'card', name: 'Closed', currencyCode: 'QAR', isActive: false, creditLimit: 100 }], [
      { id: 'charge', cardId: 'card', date: '2026-01-01', amount: 40, kind: 'charge', description: 'Charge' },
      { id: 'later', cardId: 'card', date: '2026-02-01', amount: 30, kind: 'payment', description: 'Payment' },
    ], [], [], filters, date);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ currency: 'QAR', cardOwed: 40, available: 60, cardCount: 1 });
  });
  it('sums available credit per independent card, without transferring limits or debt between issuers', () => {
    const result = CalculationEngine.bank.bankingScopeSummary([], [], [
      { id: 'over', name: 'Over limit', currencyCode: 'USD', openingBalance: 150, creditLimit: 100 },
      { id: 'unused', name: 'Available', currencyCode: 'USD', creditLimit: 100 },
      { id: 'no-limit', name: 'No limit', currencyCode: 'USD', openingBalance: 30 },
    ], [], [], [], filters, date);
    expect(result[0]).toMatchObject({ cardOwed: 180, cardLimit: 200, available: 100 });
  });
  it('excludes migrated legacy balances and future-dated actuals from today without mutating the ledger', () => {
    const input = [tx('now', '2026-01-01', 10), tx('future', '2026-02-01', 900)];
    const before = structuredClone(input);
    const result = CalculationEngine.bank.bankingScopeSummary([account, { ...account, id: 'legacy', openingBalance: 999, migratedToCreditCardId: 'card' }], input, [], [], [], [], { ...filters, toDate: '' }, date);
    expect(result[0]).toMatchObject({ actual: 110, inflow: 10, start: 100 });
    expect(input).toEqual(before);
  });
  it('handles missing sources and statement-only filters without inventing financial activity', () => {
    const model = CalculationEngine.bank.bankAccountReadModel(undefined, [], [], [], filters, date);
    expect(model.filteredLedger).toEqual([]); expect(model.periodCurrentBalance).toBe(0);
    expect(CalculationEngine.bank.bankingScopeSummary([], [], [], [], [], [], filters, date)).toEqual([]);
    expect(CalculationEngine.bank.bankAccountReadModel(account, [], [{ id: 'p', accountId: 'a', date: '2026-01-02', amount: -10, description: 'Bill' }], [], { ...filters, source: 'statement-import' }, date).upcoming).toEqual([]);
  });
});


it('keeps future records visible and labels them without reporting them as current actual flow', () => {
  const model = CalculationEngine.bank.bankAccountReadModel(account, [tx('now', '2026-01-01', 10), tx('later', '2026-02-01', 900)], [], [], { ...filters, toDate: '' }, date);
  expect(model.filteredLedger.map(row => row.tx.id)).toEqual(['now', 'later']);
  expect(model.filteredLedger.find(row => row.tx.id === 'later')?.isFuture).toBe(true);
  expect(model.analytics.netFlow).toBe(10);
  expect(model.periodCurrentBalance).toBe(110);
});

it('reconciles actual/expected chart endpoints with native balances despite a hidden flow category', () => {
  const visible = [{ tx: tx('visible', '2026-01-10', 20), balance: 120 }];
  const hidden = { tx: tx('hidden', '2026-01-20', -30), balance: 90 };
  const pending = [{ tx: tx('pending', '2026-01-15', -5, { isPending: true }), balance: 120 }];
  const chart = CalculationEngine.bank.bankAccountAnalyticsModel({ ledger: visible, balanceLedger: [...visible, hidden], pendingRows: pending,
    plans: [{ id: 'p', accountId: 'a', date: '2026-01-25', amount: -10, description: 'Bill' }], startingBalance: 100, closingBalance: 90, categories: [] });
  expect(chart.analytics.netFlow).toBe(20);
  expect(chart.transactionBalances).toEqual([100, 120, 90]);
  expect(chart.actualChartData.at(-1)).toBe(90);
  expect(chart.expectedChartData.at(-1)).toBe(75);
  expect(chart.periodEndActual + chart.periodEndPending + chart.periodEndPlanned).toBe(chart.periodEndExpected);
  expect(chart.monthlyExpectedBalances.at(-1)).toBe(chart.periodEndExpected);
});

it('can present an explicitly planned-only forecast without inventing cleared transactions', () => {
  const chart = CalculationEngine.bank.bankAccountAnalyticsModel({ ledger: [], pendingRows: [], plans: [{ id: 'p', accountId: 'a', date: '2026-01-25', amount: -10, description: 'Bill' }], startingBalance: 100, categories: [] });
  expect(chart.hasData).toBe(true); expect(chart.analytics.transactions).toEqual([]);
  expect(chart.periodEndActual).toBe(100); expect(chart.periodEndExpected).toBe(90);
});


it('keeps directory, bank and account totals on the same native cutoff without hiding closed balances or mutating bank order', () => {
  const banks = [{ id: 'b', name: 'Bank' }, { id: 'favorite', name: 'Favorite', isFavorite: true }];
  const accounts = [{ ...account, bankId: 'b' }, { ...account, id: 'closed', bankId: 'b', openingBalance: 50, isActive: false }, { ...account, id: 'old', bankId: 'b', openingBalance: 999, migratedToCreditCardId: 'card' }];
  const transactions = [tx('now', '2026-01-01', 10), tx('closed', '2026-01-02', -5, { accountId: 'closed' }), tx('future', '2026-02-01', 900)];
  const before = structuredClone({ banks, accounts, transactions });
  const directory = CalculationEngine.bank.bankDirectoryReadModel(banks, accounts, transactions, [], [], [], date);
  const archived = CalculationEngine.bank.bankDirectoryReadModel(banks, accounts, transactions, [], [], [], date, true);
  expect(directory.accountMetrics.get('a')).toMatchObject({ balance: 110, displayBalance: 110 });
  expect(directory.bankMetrics.get('b')).toMatchObject({ totals: { USD: 155 }, accountCount: 2 });
  expect(directory.currencyGroups[0].total).toBe(155);
  expect(archived.currencyGroups[0].total).toBe(155);
  expect(directory.visibleAccounts).toHaveLength(1); expect(archived.visibleAccounts).toHaveLength(2);
  expect(directory.visibleBanks[0].id).toBe('favorite');
  expect({ banks, accounts, transactions }).toEqual(before);
  expect(CalculationEngine.bank.bankingScopeSummary(accounts, transactions, [], [], [], [], filters, date)[0].actual).toBe(directory.bankMetrics.get('b')?.totals.USD);
});


it('scopes a bank-only card summary to its issuer even when the bank has no ordinary accounts', () => {
  const result = CalculationEngine.bank.bankingScopeSummary([], [], [
    { id: 'own', name: 'Own card', bankId: 'b1', currencyCode: 'QAR', openingBalance: 40, creditLimit: 100 },
    { id: 'other', name: 'Other bank', bankId: 'b2', currencyCode: 'QAR', openingBalance: 900, creditLimit: 1000 },
  ], [], [], [], filters, date, true, 'b1');
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ currency: 'QAR', cardCount: 1, cardOwed: 40, cardLimit: 100, available: 60 });
});


it('selects every native account in scope without falling back from a missing selection', () => {
  const accounts = [
    { id: 'usd', name: 'USD', currencyCode: 'USD', openingBalance: 0, bankId: 'one' },
    { id: 'qar', name: 'QAR', currencyCode: 'QAR', openingBalance: 0, bankId: 'two' },
    { id: 'legacy', name: 'Legacy card', currencyCode: 'USD', openingBalance: 100, migratedToCreditCardId: 'card' },
  ];
  expect(CalculationEngine.bank.bankAnalyticsAccounts(accounts, undefined, 'all').map(a => a.id)).toEqual(['usd', 'qar']);
  expect(CalculationEngine.bank.bankAnalyticsAccounts(accounts, 'two', 'all').map(a => a.id)).toEqual(['qar']);
  expect(CalculationEngine.bank.bankAnalyticsAccounts(accounts, 'one', 'qar')).toEqual([]);
  expect(CalculationEngine.bank.bankAnalyticsAccounts(accounts, undefined, 'deleted')).toEqual([]);
});

it('uses filtered cleared spending while retaining legacy targets without a currency comparison', () => {
  const rows = CalculationEngine.bank.bankLegacyBudgetRows([
    { tx: { id: 'expense', accountId: 'a', date: '2026-01-01', amount: -20, description: '', source: 'manual', isDeposit: false, categoryID: 'food' }, balance: 80 },
    { tx: { id: 'pending', accountId: 'a', date: '2026-01-01', amount: -50, description: '', source: 'manual', isDeposit: false, categoryID: 'food', isPending: true }, balance: 80 },
  ], { Food: 100 }, [{ id: 'food', name: 'Food', serialNumber: 1 }]);
  expect(rows).toEqual([{ category: 'Food', budget: 100, actual: 20 }]);
  expect(rows[0]).not.toHaveProperty('remaining');
});
