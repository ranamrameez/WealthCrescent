import type { BrokerProfile, BrokerPortfolioData, QSESettings } from '../../types/workbook';
import { CalculationEngine } from '../../lib/calc/CalculationEngine';
import type { NetWorthValuationInputs } from '../../lib/calc/netWorthValuation';
import { useCashWorkbookStore } from '../../store/cashWorkbookStore';
import { useBankWorkbookStore } from '../../store/bankWorkbookStore';
import { useCreditCardWorkbookStore } from '../../store/creditCardWorkbookStore';
import { usePersonalLoansWorkbookStore } from '../../store/personalLoansWorkbookStore';
import { useEMIWorkbookStore } from '../../store/emiWorkbookStore';
import { useFundsWorkbookStore } from '../../store/fundsWorkbookStore';
import { useWorkbookStore } from '../../store/workbookStore';
import { usePSXWorkbookStore } from '../../store/psxWorkbookStore';
import { useQseFeed } from '../../features/qse/hooks/useLiveQseWorkbook';
import { usePsxFeed } from '../../features/psx/hooks/useLivePsxWorkbook';
import { applyLiveQse } from '../../lib/stockData/liveQse';
import { applyLivePsx } from '../../lib/stockData/livePsx';

const listeners = new Set<() => void>();
const cache = new Map<string, ReturnType<typeof CalculationEngine.valuation.calculateNetWorth>>();
let inputSnapshot: NetWorthValuationInputs | undefined;
const scopedInputs = new Map<string, NetWorthValuationInputs>();
function invalidate() { inputSnapshot = undefined; scopedInputs.clear(); cache.clear(); listeners.forEach(listener => listener()); }
for (const source of [useCashWorkbookStore, useBankWorkbookStore, useCreditCardWorkbookStore, usePersonalLoansWorkbookStore, useEMIWorkbookStore, useFundsWorkbookStore, useWorkbookStore, usePSXWorkbookStore, useQseFeed, usePsxFeed]) source.subscribe(invalidate);

function brokerLedgers<T extends QSESettings>(workbook: { settings: T; brokerProfiles?: BrokerProfile<T>[]; activeBrokerId?: string; transactions: BrokerPortfolioData['transactions']; transfers: BrokerPortfolioData['transfers']; adjustments: BrokerPortfolioData['adjustments']; dividends?: BrokerPortfolioData['dividends'] }) {
  if (!workbook.brokerProfiles?.length) return undefined;
  return workbook.brokerProfiles.map(profile => {
    const active = profile.id === workbook.activeBrokerId;
    const data = active ? workbook : profile.data;
    return { settings: active ? workbook.settings : profile.settings,
      transactions: data?.transactions ?? [], transfers: data?.transfers ?? [], adjustments: data?.adjustments ?? [], dividends: data?.dividends ?? [] };
  });
}

/** Gather native ledgers once. Feed overlays retain the exchange's existing quote policy. */
export function getNetWorthInputs(): NetWorthValuationInputs {
  if (inputSnapshot) return inputSnapshot;
  const cash = useCashWorkbookStore.getState().workbook;
  const bank = useBankWorkbookStore.getState().workbook;
  const cards = useCreditCardWorkbookStore.getState().workbook;
  const personal = usePersonalLoansWorkbookStore.getState().workbook;
  const funds = useFundsWorkbookStore.getState().workbook;
  const qse = applyLiveQse(useWorkbookStore.getState().workbook, useQseFeed.getState().points);
  const psx = applyLivePsx(usePSXWorkbookStore.getState().workbook, usePsxFeed.getState().points);
  inputSnapshot = {
    qseBrokers: brokerLedgers(qse), psxBrokers: brokerLedgers(psx),
    cashEntries: cash.entries, cashSettings: cash.settings,
    bankAccounts: bank.settings.accounts, bankTransactions: bank.transactions,
    creditCards: cards.cards, creditCardTransactions: cards.transactions,
    personalLoans: personal.loans, personalLoanRepayments: personal.repayments,
    emiLoans: useEMIWorkbookStore.getState().workbook.entries,
    emiRepayments: useEMIWorkbookStore.getState().workbook.repayments,
    fundsFunds: funds.funds, fundsTransactions: funds.transactions, fundsTransfers: funds.transfers,
    fundsDefaultCurrency: funds.settings.legacyTransferCurrency ?? funds.settings.defaultCurrency,
    fundsIncludeCashInNetWorth: funds.settings.includeCashInNetWorth === true,
    fundsMarketPrices: funds.marketPrices, fundsPriceHistory: funds.priceHistory,
    qseTransactions: qse.transactions, qseTransfers: qse.transfers, qseAdjustments: qse.adjustments,
    qseDividends: qse.dividends, qseSettings: qse.settings, qsePriceHistory: qse.priceHistory, qseMarketPrices: qse.marketPrices,
    psxTransactions: psx.transactions, psxTransfers: psx.transfers, psxAdjustments: psx.adjustments,
    psxDividends: psx.dividends, psxSettings: psx.settings, psxPriceHistory: psx.priceHistory, psxMarketPrices: psx.marketPrices,
  };
  return inputSnapshot;
}

export function getScopedNetWorthInputs(selectedModules?: readonly string[]): NetWorthValuationInputs {
  const key = JSON.stringify(selectedModules ? [...selectedModules].sort() : null);
  const cached = scopedInputs.get(key);
  if (cached) return cached;
  const inputs = CalculationEngine.valuation.scopeNetWorthInputs(getNetWorthInputs(), selectedModules);
  if (scopedInputs.size >= 32) scopedInputs.clear();
  scopedInputs.set(key, inputs);
  return inputs;
}

let midnightTimer: ReturnType<typeof setInterval> | undefined;
export function subscribeNetWorthSummary(listener: () => void) {
  listeners.add(listener);
  // Day-sensitive EMI and future-dated ledger records must refresh at midnight.
  let day = new Date().toISOString().slice(0, 10);
  if (!midnightTimer) midnightTimer = setInterval(() => {
    const nextDay = new Date().toISOString().slice(0, 10);
    if (nextDay !== day) { day = nextDay; invalidate(); }
  }, 60_000);
  return () => { listeners.delete(listener); if (!listeners.size && midnightTimer) { clearInterval(midnightTimer); midnightTimer = undefined; } };
}

export function getNetWorthSummary(selectedModules?: readonly string[], date = new Date().toISOString().slice(0, 10)) {
  const key = JSON.stringify([date, selectedModules ? [...selectedModules].sort() : null]);
  const cached = cache.get(key);
  if (cached) return cached;
  const result = CalculationEngine.valuation.calculateNetWorth(getNetWorthInputs(), { date, selectedModules });
  if (cache.size >= 32) cache.clear();
  cache.set(key, result);
  return result;
}
