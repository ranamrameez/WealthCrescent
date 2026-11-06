import { cashBalanceByCurrency } from './cashModule';
import { assetBalanceByCurrency, creditCardLiabilityByCurrency as legacyCardDebt } from './bankModule';
import { creditCardLiabilityByCurrency } from './creditCardModule';
import { loanOutstanding } from './personalLoansModule';
import { totalsByCurrency } from './emiModule';
import { fundsCashBalanceByCurrency, fundsValueByCurrency } from './fundsModule';
import { computeNetWorthByCurrency, mergeCurrencyTotals } from './netWorth';
import { includedBankAccounts, includedCreditCards, includedEmiLoans, includedFunds, includedPersonalLoans } from './netWorthInclusion';
import { makeQSEFeeCalculator } from './fees';
import { makePSXFeeCalculator } from './psxFees';
import { calculatePortfolio } from './portfolioCalculationEngine';
import type { CashEntry, CashSettings } from '../../types/cashWorkbook';
import type { BankAccount, BankTransaction } from '../../types/bankWorkbook';
import type { CreditCard, CreditCardTransaction } from '../../types/creditCard';
import type { PersonalLoan, PersonalLoanRepayment } from '../../types/personalLoansWorkbook';
import type { EMILoan } from '../../types/emiWorkbook';
import type { Fund } from '../../types/fundsWorkbook';
import type { Adjustment, Dividend, PricePoint, QSESettings, Transaction, Transfer } from '../../types/workbook';
import type { PSXSettings } from '../../types/psxWorkbook';


export interface ExchangeValuationLedger<TSettings> {
  settings: TSettings;
  transactions: Transaction[]; transfers: Transfer[]; adjustments: Adjustment[]; dividends?: Dividend[];
}
export interface NetWorthValuationInputs {
  qseBrokers?: ExchangeValuationLedger<QSESettings>[];
  psxBrokers?: ExchangeValuationLedger<PSXSettings>[];
  cashEntries: CashEntry[];
  cashSettings: CashSettings;
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  creditCards: CreditCard[];
  creditCardTransactions: CreditCardTransaction[];
  personalLoans: PersonalLoan[];
  personalLoanRepayments: PersonalLoanRepayment[];
  emiLoans: EMILoan[];
  fundsFunds: Fund[];
  fundsTransactions: Transaction[];
  fundsTransfers: Transfer[];
  fundsDefaultCurrency: string;
  fundsIncludeCashInNetWorth: boolean;
  fundsPriceHistory: Record<string, PricePoint[]>;
  qseTransactions: Transaction[];
  qseTransfers: Transfer[];
  qseAdjustments: Adjustment[];
  qsePriceHistory: Record<string, PricePoint[]>;
  qseSettings: QSESettings;
  qseDividends?: Dividend[];
  qseMarketPrices?: Record<string, number>;
  psxTransactions: Transaction[];
  psxTransfers: Transfer[];
  psxAdjustments: Adjustment[];
  psxPriceHistory: Record<string, PricePoint[]>;
  psxSettings: PSXSettings;
  psxDividends?: Dividend[];
  psxMarketPrices?: Record<string, number>;
  fundsMarketPrices?: Record<string, number>;
}


/** Latest recorded price by calendar date, then time within that date. */
export function priceAsOfDate(ticker: string, history: Record<string, PricePoint[]>, date: string): number {
  const points = (history[ticker] ?? []).filter(point => point.date <= date);
  return [...points].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')).at(-1)?.price ?? 0;
}

export interface NetWorthValuationOptions {
  /** Explicit date makes the engine deterministic, including EMI schedules. */
  date: string;
  /** Historical balances use dated quotes and require evidence for undated bank opening balances. */
  historical?: boolean;
  selectedModules?: readonly string[];
}

/** One ledger-to-net-worth calculation for both current and historical queries.
 * Current prices are used only for current valuation; historical queries never
 * borrow today's quotes. Plans and pending transactions cannot become actuals.
 */
export function calculateNetWorth(inputs: NetWorthValuationInputs, options: NetWorthValuationOptions) {
  const { date, historical = false, selectedModules } = options;
  const enabled = (module: string) => selectedModules === undefined || selectedModules.includes(module);
  const through = <T extends { date: string }>(items: T[]) => items.filter(item => item.date <= date);
  const prices = (transactions: Transaction[], history: Record<string, PricePoint[]>, current?: Record<string, number>) =>
    historical ? Object.fromEntries([...new Set(transactions.map(tx => tx.ticker))].map(ticker => [ticker, priceAsOfDate(ticker, history, date)])) : current ?? {};
  const bankTransactions = through(inputs.bankTransactions);
  const accounts = includedBankAccounts(inputs.bankAccounts).filter(account => !historical || bankTransactions.some(tx => tx.accountId === account.id && !tx.isPending));
  const cash = enabled('cash') && inputs.cashSettings.includeInNetWorth !== false ? cashBalanceByCurrency(through(inputs.cashEntries)) : {};
  const bank = enabled('bank') ? assetBalanceByCurrency(accounts, bankTransactions) : {};
  const creditCards = enabled('creditCards') ? mergeCurrencyTotals(
    legacyCardDebt(accounts, bankTransactions),
    creditCardLiabilityByCurrency(includedCreditCards(inputs.creditCards).filter(card => !historical || inputs.creditCardTransactions.some(tx => tx.cardId === card.id && tx.date <= date)), through(inputs.creditCardTransactions)),
  ) : {};
  // Keep receivables and debts gross. Netting two different people hides both
  // assets and liabilities even though the final net value happens to agree.
  const personalLoanAssets: Record<string, number> = {};
  const personalLoanLiabilities: Record<string, number> = {};
  if (enabled('personalLoans')) {
    const repayments = through(inputs.personalLoanRepayments);
    for (const loan of through(includedPersonalLoans(inputs.personalLoans))) {
      const target = loan.direction === 'owed_to_me' ? personalLoanAssets : personalLoanLiabilities;
      target[loan.currencyCode] = (target[loan.currencyCode] ?? 0) + loanOutstanding(loan, repayments);
    }
  }
  const personalLoansNet = mergeCurrencyTotals(personalLoanAssets, Object.fromEntries(Object.entries(personalLoanLiabilities).map(([code, value]) => [code, -value])));
  const emiOutstanding: Record<string, number> = {};
  if (enabled('emi')) for (const [code, totals] of Object.entries(totalsByCurrency(includedEmiLoans(inputs.emiLoans).filter(loan => loan.startDate <= date), new Date(date + 'T00:00:00.000Z')))) emiOutstanding[code] = totals.outstanding;
  const fundsTransactions = through(inputs.fundsTransactions);
  const funds = enabled('funds') ? mergeCurrencyTotals(
    fundsValueByCurrency(includedFunds(inputs.fundsFunds), fundsTransactions, prices(fundsTransactions, inputs.fundsPriceHistory, inputs.fundsMarketPrices)),
    inputs.fundsIncludeCashInNetWorth ? fundsCashBalanceByCurrency(inputs.fundsFunds, fundsTransactions, through(inputs.fundsTransfers), inputs.fundsDefaultCurrency) : {},
  ) : {};
  const exchange = (kind: 'qse' | 'psx'): Record<string, number> => {
    if (!enabled(kind)) return {};
    const fallback = kind === 'qse' ? { settings: inputs.qseSettings, transactions: inputs.qseTransactions, transfers: inputs.qseTransfers, adjustments: inputs.qseAdjustments, dividends: inputs.qseDividends } : { settings: inputs.psxSettings, transactions: inputs.psxTransactions, transfers: inputs.psxTransfers, adjustments: inputs.psxAdjustments, dividends: inputs.psxDividends };
    const brokers = (kind === 'qse' ? inputs.qseBrokers : inputs.psxBrokers) ?? [fallback];
    const totals: Record<string, number> = {};
    for (const broker of brokers) {
      const settings = broker.settings;
      if (settings.includeInNetWorth === false) continue;
      const transactions = through(broker.transactions), transfers = through(broker.transfers);
      const adjustments = through(broker.adjustments), dividends = through(broker.dividends ?? []);
      if (!transactions.length && !transfers.length && !adjustments.length && !dividends.length) continue;
      const calcFee = kind === 'qse' ? makeQSEFeeCalculator(settings as QSESettings) : makePSXFeeCalculator(settings as PSXSettings, transactions);
      const result = calculatePortfolio({ transactions, transfers, adjustments, dividends,
        marketPrices: prices(transactions, kind === 'qse' ? inputs.qsePriceHistory : inputs.psxPriceHistory, kind === 'qse' ? inputs.qseMarketPrices : inputs.psxMarketPrices),
        calcFee, costBasisMethod: settings.costBasisMethod ?? 'average', feePct: settings.feePct, tick: settings.tick,
      });
      totals[settings.currency] = (totals[settings.currency] ?? 0) + result.cashSummary.netWorth;
    }
    return totals;
  };
  const rows = computeNetWorthByCurrency({ cash, bank, qse: exchange('qse'), psx: exchange('psx'), funds, personalLoansNet, personalLoanAssets, personalLoanLiabilities, emiOutstanding, creditCards });
  const biggestExposureCurrency = [...rows].sort((a, b) => Math.abs(b.net) - Math.abs(a.net))[0]?.currency ?? 'USD';
  return { rows, biggestExposureCurrency };
}


/** Apply module scope once, before historical valuation, trends and activity floors. */
export function scopeNetWorthInputs(inputs: NetWorthValuationInputs, selectedModules?: readonly string[]): NetWorthValuationInputs {
  const enabled = (module: string) => selectedModules === undefined || selectedModules.includes(module);
  return { ...inputs,
    qseBrokers: enabled('qse') ? inputs.qseBrokers : [],
    psxBrokers: enabled('psx') ? inputs.psxBrokers : [],
    cashEntries: enabled('cash') && inputs.cashSettings.includeInNetWorth !== false ? inputs.cashEntries : [],
    bankAccounts: includedBankAccounts(inputs.bankAccounts).filter(account => enabled(account.isLiability ? 'creditCards' : 'bank')),
    creditCards: enabled('creditCards') ? includedCreditCards(inputs.creditCards) : [],
    personalLoans: enabled('personalLoans') ? includedPersonalLoans(inputs.personalLoans) : [],
    emiLoans: enabled('emi') ? includedEmiLoans(inputs.emiLoans) : [],
    fundsFunds: enabled('funds') ? inputs.fundsFunds : [],
    fundsTransactions: enabled('funds') ? inputs.fundsTransactions : [],
    fundsTransfers: enabled('funds') ? inputs.fundsTransfers : [],
    fundsIncludeCashInNetWorth: enabled('funds') && inputs.fundsIncludeCashInNetWorth,
    qseSettings: { ...inputs.qseSettings, includeInNetWorth: enabled('qse') && inputs.qseSettings.includeInNetWorth !== false },
    psxSettings: { ...inputs.psxSettings, includeInNetWorth: enabled('psx') && inputs.psxSettings.includeInNetWorth !== false },
  };
}


/** Undated opening balances cannot prove the account's value before its first
 * cleared ledger event. Report the coverage gap instead of inventing growth
 * when a live balance is compared with an unknown historical opening.
 */
export function unverifiedOpeningCurrencies(inputs: NetWorthValuationInputs, date: string): string[] {
  const currencies = new Set<string>();
  for (const account of includedBankAccounts(inputs.bankAccounts)) {
    if (account.migratedToCreditCardId || !account.openingBalance) continue;
    if (!inputs.bankTransactions.some(tx => tx.accountId === account.id && !tx.isPending && tx.date <= date)) currencies.add(account.currencyCode);
  }
  for (const card of includedCreditCards(inputs.creditCards)) {
    if (!card.openingBalance) continue;
    if (!inputs.creditCardTransactions.some(tx => tx.cardId === card.id && tx.date <= date)) currencies.add(card.currencyCode);
  }
  return [...currencies].sort();
}
