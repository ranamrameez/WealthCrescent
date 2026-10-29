import type { PSXSettings, PSXWorkbook } from '../types/psxWorkbook';

export const DEFAULT_PSX_SETTINGS: PSXSettings = {
  feePct: 0.20,
  sameDayNettingRule: 'higherValueSide',
  lowPriceThreshold: 25,
  lowPriceFee: 0.05,
  sstPct: 15,
  sstIncludedInCommission: false,
  psxFeePct: 0,
  // Calibrated 2026-08-25 against a real JS Global Capital / Zindigi
  // contract note's "Levies Charges" column, then RE-calibrated 2026-09-08
  // against a much larger real dataset (45 real charged legs spanning
  // 17-Aug through 07-Sep-2026, saved in psx/trades/psx_sample_statement.html)
  // — every one of those 45 real values reconciles EXACTLY under standard
  // 2-decimal rounding at 0.012% (the earlier 0.0119% only matched ~39/45 of
  // them), so this narrower dataset is the more reliable fit. This app
  // models the whole combined PSX+NCCPL+SECP+CDC "Levies" line item as one
  // bucket via this single field, rather than guessing at each component
  // separately, since the broker's own statement doesn't itemize them
  // either.
  nccplFeePct: 0.012,
  secpLevyPct: 0,
  cdcPerShare: 0,
  cvtPct: 0,
  minFee: 0,
  tick: 0.01,
  currency: 'PKR',
  depositFee: 0,
  cgtFilerPct: 15,
  // README item 5: real broker schedules charge non-filers a much higher
  // rate than filers (JS Bank: ~30%) — the legacy app defaulted both to
  // 15%. Still user-editable in Settings if your broker differs.
  cgtNonFilerPct: 30,
  filerStatus: 'filer',
  costBasisMethod: 'average',
  // Itemized stays the default for every new workbook — see PSXSettings'
  // own doc comment for why. allInFeePct starts at 0 rather than a guessed
  // number so a user opting into Simple mode has to type their own real
  // observed rate, never inherit an unverified default.
  feeMode: 'itemized',
  allInFeePct: 0,
};

const JS_ZINDIGI_PROFILE_ID = 'psx-js-zindigi';
const AL_HABIB_PROFILE_ID = 'psx-al-habib-capital-markets';

/** Build a new PSX broker profile from application defaults, never by copying
 * whichever broker the user happens to have active. Recognized broker defaults
 * are name-matched for seed/new profiles; every field remains user-editable. */
export function createDefaultPSXBrokerSettings(brokerName: string): PSXSettings {
  const normalized = brokerName.trim().toLocaleLowerCase();
  if (normalized.includes('habib') || normalized === 'ahl') {
    return {
      ...DEFAULT_PSX_SETTINGS,
      feePct: 0.15,
      sameDayNettingRule: 'higherValueSide',
      lowPriceThreshold: 20,
      lowPriceFee: 0.03,
    };
  }
  if (normalized.includes('zindigi') || normalized.includes('zindagi')) {
    return { ...DEFAULT_PSX_SETTINGS, sameDayNettingRule: 'higherValueSide' };
  }
  // Unknown brokers start from generic app defaults but do not inherit a
  // broker-specific intraday concession without confirmation.
  return { ...DEFAULT_PSX_SETTINGS, sameDayNettingRule: 'none' };
}

export function createEmptyPSXWorkbook(): PSXWorkbook {
  return {
    settings: { ...DEFAULT_PSX_SETTINGS },
    brokerProfiles: [
      { id: JS_ZINDIGI_PROFILE_ID, name: 'JS Zindagi', settings: { ...DEFAULT_PSX_SETTINGS } },
      {
        id: AL_HABIB_PROFILE_ID,
        name: 'AL Habib Capital Markets',
        settings: {
          ...DEFAULT_PSX_SETTINGS,
          // Published AHCML account-opening tariff: PKR 0.03/share up to
          // PKR 20, then 0.15% of traded value above PKR 20. See README
          // sources; other regulatory levies remain separately configurable.
          feePct: 0.15,
          sameDayNettingRule: 'higherValueSide',
          lowPriceThreshold: 20,
          lowPriceFee: 0.03,
        },
      },
    ],
    activeBrokerId: JS_ZINDIGI_PROFILE_ID,
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
