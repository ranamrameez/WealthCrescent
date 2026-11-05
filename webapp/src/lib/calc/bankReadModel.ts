import type { Bank, BankAccount, BankTransaction } from '../../types/bankWorkbook';
import type { CreditCard, CreditCardTransaction } from '../../types/creditCard';
import type { PlannedBankTransaction } from '../../types/plannedBank';
import type { Category } from '../../types/finance';
import { categoryName } from '../categories';
import { accountBalance, accountPendingBalance, accountRunningLedger, bankAnalyticsFromLedger, bankTotalsByCurrency, type BankLedgerRow } from './bankModule';
import { availableCredit, outstandingBalanceByCard } from './creditCardModule';
import { planOccurrences } from './planOccurrences';
export interface BankingReadFilters { fromDate: string; toDate: string; direction: string; category: string; source: string; accountId: string; }
export function bankTransactionMatchesFilters(tx: BankTransaction, filters: BankingReadFilters, categories: Category[]) {
  return (filters.accountId === 'all' || tx.accountId === filters.accountId)
    && (!filters.fromDate || tx.date >= filters.fromDate) && (!filters.toDate || tx.date <= filters.toDate)
    && (filters.direction !== 'in' || tx.amount >= 0) && (filters.direction !== 'out' || tx.amount < 0)
    && (filters.category === 'all' || categoryName(tx.categoryID, categories) === filters.category)
    && (filters.source === 'all' || (tx.source ?? 'manual') === filters.source);
}
export function bankPlanMatchesFilters(plan: PlannedBankTransaction, filters: BankingReadFilters) {
  return !plan.executed && filters.source !== 'statement-import'
    && (filters.category === 'all' || (plan.category || 'Uncategorized') === filters.category)
    && (filters.direction === 'all' || (filters.direction === 'in' ? plan.amount >= 0 : plan.amount < 0));
}
function visiblePlans(plans: PlannedBankTransaction[], filters: BankingReadFilters, asOf: Date) {
  return planOccurrences(plans, filters.fromDate, filters.toDate, asOf, null).filter(plan => bankPlanMatchesFilters(plan, filters)
    && (!filters.fromDate || plan.date >= filters.fromDate) && (!filters.toDate || plan.date <= filters.toDate));
}
const signedTotal = (amounts: number[], inflow: boolean) => amounts.filter(amount => inflow ? amount >= 0 : amount < 0).reduce((sum, amount) => sum + amount, 0);

/** Balances use full cleared history; filters select the shared flow/chart population. */
export function bankAccountReadModel(account: BankAccount | undefined, transactions: BankTransaction[], plans: PlannedBankTransaction[], categories: Category[], filters: BankingReadFilters, asOf: Date) {
  const today = asOf.toISOString().slice(0, 10);
  const reportToDate = filters.toDate && filters.toDate < today ? filters.toDate : today;
  const allLedger = account ? accountRunningLedger(account, transactions, true).map(row => ({ ...row, isFuture: row.tx.date > today })) : [];
  // A routed account is the authoritative scope; a stale homepage account query cannot select another account.
  const filteredLedger = allLedger.filter(row => bankTransactionMatchesFilters(row.tx, { ...filters, accountId: 'all' }, categories));
  const clearedLedger = filteredLedger.filter(row => !row.tx.isPending && !row.isFuture);
  const analytics = bankAnalyticsFromLedger(clearedLedger);
  const periodStartBalance = allLedger.filter(row => !row.tx.isPending && row.tx.date <= today && filters.fromDate && row.tx.date < filters.fromDate).at(-1)?.balance ?? account?.openingBalance ?? 0;
  const periodCurrentBalance = allLedger.filter(row => !row.tx.isPending && row.tx.date <= reportToDate).at(-1)?.balance ?? account?.openingBalance ?? 0;
  const pending = filteredLedger.filter(row => row.tx.isPending).map(row => row.tx.amount);
  const upcoming = account ? visiblePlans(plans, filters, asOf).filter(plan => plan.accountId === account.id).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const plannedAmounts = upcoming.map(plan => plan.amount);
  const currentBalance = account ? accountBalance(account, transactions.filter(tx => tx.date <= today)) : 0;
  const batchPlans = account ? plans.filter(plan => plan.accountId === account.id && (!filters.fromDate || plan.date >= filters.fromDate) && (!filters.toDate || plan.date <= filters.toDate)).sort((a, b) => a.date.localeCompare(b.date)) : [];
  return { allLedger, filteredLedger, clearedLedger, pendingLedger: filteredLedger.filter(row => row.tx.isPending), actualBalanceLedger: allLedger.filter(row => !row.tx.isPending && row.tx.date <= reportToDate), batchPlans, analytics, periodStartBalance, periodCurrentBalance,
    pendingInflow: signedTotal(pending, true), pendingOutflow: signedTotal(pending, false),
    plannedInflow: signedTotal(plannedAmounts, true), plannedOutflow: signedTotal(plannedAmounts, false), upcoming,
    currentBalance, displayBalance: account?.isLiability ? Math.max(0, -currentBalance) : currentBalance,
    pendingAmount: account ? accountPendingBalance(account, transactions) : 0,
    categoryOptions: [...new Set(allLedger.map(row => categoryName(row.tx.categoryID, categories)))].sort(),
  };
}

export function bankingScopeSummary(accounts: BankAccount[], transactions: BankTransaction[], cards: CreditCard[], cardTransactions: CreditCardTransaction[], plans: PlannedBankTransaction[], categories: Category[], filters: BankingReadFilters, asOf: Date, includeCards = true, bankId?: string) {
  const today = asOf.toISOString().slice(0, 10);
  const reportToDate = filters.toDate && filters.toDate < today ? filters.toDate : today;
  const scopedAccounts = accounts.filter(account => !account.migratedToCreditCardId && (!bankId || account.bankId === bankId) && (filters.accountId === 'all' || account.id === filters.accountId));
  const ids = new Set(scopedAccounts.map(account => account.id));
  const rows = transactions.filter(tx => ids.has(tx.accountId) && bankTransactionMatchesFilters(tx, filters, categories));
  const planned = visiblePlans(plans, filters, asOf).filter(plan => ids.has(plan.accountId));
  // Closing a card changes picker visibility, not its real debt or credit contract.
  const scopedCards = includeCards && filters.accountId === 'all' ? cards.filter(card => !bankId || card.bankId === bankId) : [];
  const cardsThroughEnd = cardTransactions.filter(tx => tx.date <= reportToDate);
  const currencies = [...new Set([...scopedAccounts.map(account => account.currencyCode), ...scopedCards.map(card => card.currencyCode)])].sort();
  return currencies.map(currency => {
    const currencyAccounts = scopedAccounts.filter(account => account.currencyCode === currency);
    const currencyIds = new Set(currencyAccounts.map(account => account.id));
    const currencyRows = rows.filter(tx => currencyIds.has(tx.accountId));
    const amounts = (pending: boolean) => currencyRows.filter(tx => !!tx.isPending === pending && (pending || tx.date <= reportToDate)).map(tx => tx.amount);
    const plannedAmounts = planned.filter(plan => currencyIds.has(plan.accountId)).map(plan => plan.amount);
    const currencyCards = scopedCards.filter(card => card.currencyCode === currency);
    const cardBalances = currencyCards.map(card => ({ card, balance: outstandingBalanceByCard(card, cardsThroughEnd) }));
    return { currency, pendingInflow: signedTotal(amounts(true), true), pendingOutflow: signedTotal(amounts(true), false),
      plannedInflow: signedTotal(plannedAmounts, true), plannedOutflow: signedTotal(plannedAmounts, false),
      inflow: signedTotal(amounts(false), true), outflow: signedTotal(amounts(false), false),
      actual: currencyAccounts.reduce((sum, account) => sum + accountBalance(account, transactions.filter(tx => tx.date <= reportToDate)), 0),
      start: currencyAccounts.reduce((sum, account) => sum + accountBalance(account, transactions.filter(tx => tx.date <= today && filters.fromDate && tx.date < filters.fromDate)), 0),
      cardCount: currencyCards.length,
      cardOwed: cardBalances.reduce((sum, { balance }) => sum + Math.max(0, balance), 0),
      cardLimit: currencyCards.reduce((sum, card) => sum + Math.max(0, card.creditLimit ?? 0), 0),
      available: cardBalances.reduce((sum, { card, balance }) => sum + availableCredit(card, balance), 0),
    };
  });
}


/** One financial dataset for account charts; native balances do not reset when
 * a category/source filter hides an unrelated transaction from the flow rows.
 */
export function bankAccountAnalyticsModel(input: {
  ledger: BankLedgerRow[]; pendingRows: BankLedgerRow[]; plans: PlannedBankTransaction[];
  startingBalance: number; categories: Category[]; balanceLedger?: BankLedgerRow[]; closingBalance?: number;
}) {
  const { ledger, pendingRows, plans, startingBalance, categories } = input;
  const balanceLedger = input.balanceLedger ?? ledger;
  const analytics = bankAnalyticsFromLedger(ledger);
  const totals: Record<string, number> = {};
  for (const row of ledger) { const name = categoryName(row.tx.categoryID, categories); totals[name] = (totals[name] ?? 0) + Math.abs(row.tx.amount); }
  const categoryTotals = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const balanceDates = [...new Set([...ledger.map(row => row.tx.date), ...pendingRows.map(row => row.tx.date), ...plans.map(plan => plan.date)])].sort();
  const actualBalanceByDate = balanceDates.map(date => balanceLedger.filter(row => row.tx.date <= date).at(-1)?.balance ?? startingBalance);
  const pendingFlowByDate = balanceDates.map(date => pendingRows.filter(row => row.tx.date === date).reduce((sum, row) => sum + row.tx.amount, 0));
  const plannedFlowByDate = balanceDates.map(date => plans.filter(plan => plan.date === date).reduce((sum, plan) => sum + plan.amount, 0));
  let adjustment = 0;
  const expectedFlowByDate = actualBalanceByDate.map((balance, index) => { adjustment += pendingFlowByDate[index] + plannedFlowByDate[index]; return balance + adjustment; });
  const periodEndActual = input.closingBalance ?? actualBalanceByDate.at(-1) ?? startingBalance;
  const periodEndPending = pendingRows.reduce((sum, row) => sum + row.tx.amount, 0);
  const periodEndPlanned = plans.reduce((sum, plan) => sum + plan.amount, 0);
  const periodEndExpected = periodEndActual + periodEndPending + periodEndPlanned;
  const monthlyLabels = [...new Set([...analytics.monthlyFlow.map(flow => flow.month), ...pendingRows.map(row => row.tx.date.slice(0, 7)), ...plans.map(plan => plan.date.slice(0, 7))])].sort();
  const monthlyFlowByMonth = new Map(analytics.monthlyFlow.map(flow => [flow.month, flow]));
  const monthlyActualBalances = monthlyLabels.map(month => balanceLedger.filter(row => row.tx.date.slice(0, 7) <= month).at(-1)?.balance ?? startingBalance);
  let monthlyAdjustment = 0;
  const monthlyExpectedAdjustments = monthlyLabels.map(month => {
    monthlyAdjustment += pendingRows.filter(row => row.tx.date.slice(0, 7) === month).reduce((sum, row) => sum + row.tx.amount, 0);
    monthlyAdjustment += plans.filter(plan => plan.date.slice(0, 7) === month).reduce((sum, plan) => sum + plan.amount, 0);
    return monthlyAdjustment;
  });
  const transactionBalances = [startingBalance, ...ledger.map(row => row.balance), periodEndActual];
  return { analytics, categoryTotals, balanceDates, monthlyLabels, monthlyFlowByMonth, monthlyActualBalances, monthlyExpectedAdjustments,
    monthlyExpectedBalances: monthlyActualBalances.map((balance, index) => balance + monthlyExpectedAdjustments[index]),
    transactionBalances, referenceBalances: [startingBalance, ...ledger.map(() => null), periodEndActual],
    actualChartData: [startingBalance, ...actualBalanceByDate, periodEndActual], pendingChartData: [0, ...pendingFlowByDate, 0], plannedChartData: [0, ...plannedFlowByDate, 0],
    expectedChartData: [startingBalance, ...expectedFlowByDate, periodEndExpected],
    periodEndActual, periodEndPending, periodEndPlanned, periodEndExpected,
    balanceMin: transactionBalances.reduce((min, value) => Math.min(min, value), startingBalance), hasData: !!(ledger.length || pendingRows.length || plans.length),
  };
}


/** Current directory amounts share the same cutoff as account detail and net worth.
 * Archived visibility only affects the directory rows, never a bank's native total.
 */
export function bankDirectoryReadModel(banks: Bank[], accounts: BankAccount[], transactions: BankTransaction[], cards: CreditCard[], cardTransactions: CreditCardTransaction[], categories: Category[], asOf: Date, showArchived = false) {
  const date = asOf.toISOString().slice(0, 10);
  const actuals = transactions.filter(tx => tx.date <= date);
  const cardActuals = cardTransactions.filter(tx => tx.date <= date);
  const accountMetrics = new Map(accounts.map(account => {
    const balance = accountBalance(account, actuals);
    return [account.id, { balance, displayBalance: account.isLiability ? Math.max(0, -balance) : balance }];
  }));
  const cardMetrics = new Map(cards.map(card => [card.id, { balance: Math.max(0, outstandingBalanceByCard(card, cardActuals)) }]));
  const bankMetrics = new Map(banks.map(bank => {
    const linkedAccounts = accounts.filter(account => account.bankId === bank.id && !account.migratedToCreditCardId);
    const ids = new Set(linkedAccounts.map(account => account.id));
    return [bank.id, { accounts: linkedAccounts, cards: cards.filter(card => card.bankId === bank.id),
      accountCount: linkedAccounts.length, totals: bankTotalsByCurrency(bank.id, accounts, actuals),
      categoryOptions: [...new Set(transactions.filter(tx => ids.has(tx.accountId)).map(tx => categoryName(tx.categoryID, categories)))].sort(),
    }];
  }));
  const visibleBanks = [...banks].filter(bank => showArchived || bank.isActive !== false).sort((a, b) => Number(!!b.isFavorite) - Number(!!a.isFavorite));
  const visibleAccounts = accounts.filter(account => !account.migratedToCreditCardId && (showArchived || account.isActive !== false));
  const grouped = new Map<string, BankAccount[]>();
  for (const account of visibleAccounts) { const group = grouped.get(account.currencyCode) ?? []; group.push(account); grouped.set(account.currencyCode, group); }
  const currencyGroups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, group]) => ({ currency,
    accounts: group.sort((a, b) => Number(!!b.isFavorite) - Number(!!a.isFavorite)),
    total: accounts.filter(account => !account.migratedToCreditCardId && account.currencyCode === currency).reduce((sum, account) => sum + (accountMetrics.get(account.id)?.balance ?? 0), 0),
  }));
  return { banks, accounts, transactions, categories, visibleBanks, visibleAccounts, bankMetrics, accountMetrics, cardMetrics, currencyGroups,
    srNumOf: new Map(accounts.map((account, index) => [account.id, index + 1])),
  };
}
