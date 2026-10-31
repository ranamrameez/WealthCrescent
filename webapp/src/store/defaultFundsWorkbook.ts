import type { FundsSettings, FundsWorkbook } from '../types/fundsWorkbook';

export const DEFAULT_FUNDS_SETTINGS: FundsSettings = {
  defaultCurrency: 'USD',
  includeCashInNetWorth: true,
  legacyTransferCurrency: 'USD',
  cashLedgerMigrationVersion: 1,
};

/** Versioned, metadata-only migration for Funds transfers created before
 * Transfer.currencyCode existed. It snapshots the old default once and
 * deliberately leaves every transfer unchanged, so JSON backup/export
 * round-trips preserve the original rows. */
export function migrateLegacyFundsCashSettings(workbook: FundsWorkbook): FundsWorkbook {
  if ((workbook.settings.cashLedgerMigrationVersion ?? 0) >= 1) return workbook;
  return {
    ...workbook,
    settings: {
      ...workbook.settings,
      legacyTransferCurrency: workbook.settings.legacyTransferCurrency || workbook.settings.defaultCurrency || 'USD',
      cashLedgerMigrationVersion: 1,
    },
  };
}

export function createEmptyFundsWorkbook(): FundsWorkbook {
  return {
    settings: { ...DEFAULT_FUNDS_SETTINGS },
    funds: [],
    brokers: [],
    transactions: [],
    transfers: [],
    adjustments: [],
    marketPrices: {},
    priceHistory: {},
    watchlist: [],
    dividends: [],
    dividendEstimates: {},
    tradePlans: [],
  };
}
