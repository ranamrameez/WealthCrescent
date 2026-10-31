import type { Workbook } from '../types/workbook';
import { APP_DEFAULTS_VERSION } from './appDefaults';

export const DEFAULT_SETTINGS: Workbook['settings'] = {
  feePct: 0.275,
  minFee: 0,
  tick: 0.001,
  currency: 'QAR',
  depositFee: 10,
  tradePriceDeviationPct: 10,
};

// Deliberately empty — the legacy app's SEED_TRANSACTIONS/etc. baked one
// person's real trade history into the source (README's own migration notes
// flag this as a problem). A fresh install starts with no transactions;
// existing users' real data already lives in Firebase and loads via sync.
// Note: `appearance` is intentionally omitted — it's a global preference
// (see store/appearanceStore.ts) now, not per-workbook.
export function createEmptyWorkbook(): Workbook {
  return {
    settings: { ...DEFAULT_SETTINGS },
    brokerProfiles: [{ id: 'qse-the-group', name: 'The Group', settings: { ...DEFAULT_SETTINGS }, settingsDefaultsVersion: APP_DEFAULTS_VERSION }],
    activeBrokerId: 'qse-the-group',
    brokerMigrationVersion: 1,
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
