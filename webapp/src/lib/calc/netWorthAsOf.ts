import { calculateNetWorth, scopeNetWorthInputs, type NetWorthValuationInputs } from './netWorthValuation';
export { priceAsOfDate } from './netWorthValuation';
export type NetWorthAsOfInputs = NetWorthValuationInputs;

/** Historical valuation delegates to the same ledger assembly as current totals. */
export function netWorthAsOfDate(asOfDate: string, inputs: NetWorthAsOfInputs) {
  return calculateNetWorth(inputs, { date: asOfDate, historical: true }).rows;
}

/** The earliest real date across every module `netWorthAsOfDate` reads —
 * user-reported (2026-09-06): "monthly widgets are moving without a check
 * of user's first date of transaction," i.e. the Net Worth monthly
 * window's ◀ Earlier button could scroll indefinitely into the past with
 * nothing to stop it, well before the user ever had any data at all.
 * Callers use this as a floor: never show (or navigate to) a month before
 * this one, since a month with no real evidence anywhere isn't "empty," it
 * genuinely doesn't exist for this user yet. Returns `undefined` when
 * NOTHING dated is found anywhere (a brand new, fully empty account) — a
 * caller should fall back to its own default range rather than clamp to
 * nothing. EMI loans are keyed by `startDate` (a loan has no transaction
 * log of its own until installments begin); every other module here is
 * keyed by its own real transaction/entry date, same field
 * `netWorthAsOfDate` itself filters on. */
export function earliestActivityDate(inputs: NetWorthAsOfInputs): string | undefined {
  const scoped = scopeNetWorthInputs(inputs);
  const accountIds = new Set(scoped.bankAccounts.map(account => account.id));
  const cardIds = new Set(scoped.creditCards.map(card => card.id));
  const loanIds = new Set(scoped.personalLoans.map(loan => loan.id));
  const fundIds = new Set(scoped.fundsFunds.filter(fund => fund.includeInNetWorth !== false || scoped.fundsIncludeCashInNetWorth).map(fund => fund.id));
  const qse = scoped.qseSettings.includeInNetWorth !== false;
  const psx = scoped.psxSettings.includeInNetWorth !== false;
  const dates: string[] = [
    ...scoped.cashEntries.filter(entry => !entry.isPending).map(entry => entry.date),
    ...scoped.bankTransactions.filter(tx => accountIds.has(tx.accountId) && !tx.isPending).map(tx => tx.date),
    ...scoped.creditCardTransactions.filter(tx => cardIds.has(tx.cardId)).map(tx => tx.date),
    ...scoped.personalLoans.map(loan => loan.date),
    ...scoped.personalLoanRepayments.filter(payment => loanIds.has(payment.loanId) && !payment.isPending).map(payment => payment.date),
    ...scoped.emiLoans.map(loan => loan.startDate),
    ...scoped.fundsTransactions.filter(tx => fundIds.has(tx.ticker) && !tx.isPending).map(tx => tx.date),
    ...(scoped.fundsIncludeCashInNetWorth ? scoped.fundsTransfers : []).map(tx => tx.date),
    ...(qse ? scoped.qseTransactions.filter(tx => !tx.isPending) : []).map(tx => tx.date),
    ...(qse ? [...scoped.qseTransfers, ...scoped.qseAdjustments, ...(scoped.qseDividends ?? [])] : []).map(tx => tx.date),
    ...(psx ? scoped.psxTransactions.filter(tx => !tx.isPending) : []).map(tx => tx.date),
    ...(psx ? [...scoped.psxTransfers, ...scoped.psxAdjustments, ...(scoped.psxDividends ?? [])] : []).map(tx => tx.date),
  ];
  return dates.length ? dates.reduce((min, d) => (d < min ? d : min)) : undefined;
}
