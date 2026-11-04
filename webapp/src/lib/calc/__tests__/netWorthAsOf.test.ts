import { describe, expect, it } from 'vitest';
import { CalculationEngine } from '../CalculationEngine';
import type { NetWorthValuationInputs } from '../netWorthValuation';
import { earliestActivityDate, netWorthAsOfDate, priceAsOfDate } from '../netWorthAsOf';
import type { QSESettings } from '../../../types/workbook';
import type { PSXSettings } from '../../../types/psxWorkbook';

const emptyInputs = () => ({
  cashEntries: [],
  cashSettings: { defaultCurrency: 'USD' },
  bankAccounts: [],
  bankTransactions: [],
  creditCards: [],
  creditCardTransactions: [],
  personalLoans: [],
  personalLoanRepayments: [],
  emiLoans: [],
  fundsFunds: [],
  fundsTransactions: [],
  fundsTransfers: [],
  fundsDefaultCurrency: 'USD',
  fundsIncludeCashInNetWorth: true,
  fundsPriceHistory: {},
  qseTransactions: [],
  qseTransfers: [],
  qseAdjustments: [],
  qsePriceHistory: {},
  qseSettings: { feePct: 0.15, minFee: 5, tick: 0.01, currency: 'QAR', depositFee: 0 } as QSESettings,
  psxTransactions: [],
  psxTransfers: [],
  psxAdjustments: [],
  psxPriceHistory: {},
  psxSettings: {
    feePct: 0.2, lowPriceThreshold: 25, lowPriceFee: 0.05, sstPct: 15, nccplFeePct: 0.0119,
    currency: 'PKR', costBasisMethod: 'average',
  } as PSXSettings,
});

describe('priceAsOfDate', () => {
  it('returns 0 when nothing is known that far back', () => {
    expect(priceAsOfDate('AAPL', {}, '2026-01-01')).toBe(0);
    expect(priceAsOfDate('AAPL', { AAPL: [{ date: '2026-02-01', price: 10 }] }, '2026-01-01')).toBe(0);
  });

  it('picks the latest point on or before the date, ignoring later ones', () => {
    const history = { AAPL: [{ date: '2026-01-01', price: 10 }, { date: '2026-01-15', price: 12 }, { date: '2026-02-01', price: 20 }] };
    expect(priceAsOfDate('AAPL', history, '2026-01-20')).toBe(12);
    expect(priceAsOfDate('AAPL', history, '2026-01-01')).toBe(10);
  });
});

describe('netWorthAsOfDate', () => {
  it('sums Cash and Bank balances as of a past date, ignoring later activity', () => {
    const inputs = {
      ...emptyInputs(),
      cashEntries: [
        { id: 'c1', date: '2026-01-05', isDeposit: true, amount: 1000, currencyCode: 'USD', categoryID: 'x', serialNumber: 1 },
        { id: 'c2', date: '2026-02-10', isDeposit: true, amount: 5000, currencyCode: 'USD', categoryID: 'x', serialNumber: 2 }, // after asOfDate
      ],
    };
    const rows = netWorthAsOfDate('2026-01-31', inputs as never);
    const usd = rows.find((r) => r.currency === 'USD');
    expect(usd?.assets).toBeCloseTo(1000, 6); // the Feb deposit must not count yet
  });

  it('a loan given AFTER the query date contributes nothing', () => {
    const inputs = {
      ...emptyInputs(),
      personalLoans: [{ id: 'l1', person: 'Bob', direction: 'owed_to_me' as const, currencyCode: 'USD', principal: 500, date: '2026-02-01' }],
    };
    const rows = netWorthAsOfDate('2026-01-31', inputs as never);
    expect(rows.find((r) => r.currency === 'USD')).toBeUndefined();
  });

  it('an EMI loan not yet started (startDate after asOfDate) contributes no liability', () => {
    const inputs = {
      ...emptyInputs(),
      emiLoans: [{
        id: 'e1', name: 'Car', lender: 'Bank', currencyCode: 'USD', principal: 10000, tenureMonths: 12,
        startDate: '2026-06-01', repaymentMode: 'interest' as const, annualRatePct: 12,
      }],
    };
    const rows = netWorthAsOfDate('2026-01-31', inputs as never);
    expect(rows.find((r) => r.currency === 'USD')).toBeUndefined();
  });

  it('an EMI loan already running contributes its real outstanding balance as of that date', () => {
    const inputs = {
      ...emptyInputs(),
      emiLoans: [{
        id: 'e1', name: 'Car', lender: 'Bank', currencyCode: 'USD', principal: 10000, tenureMonths: 12,
        startDate: '2026-01-01', repaymentMode: 'interest' as const, annualRatePct: 0,
      }],
    };
    // 0% interest, 10000/12 principal reduction per month — after 3 months elapsed, ~7500 left.
    const rows = netWorthAsOfDate('2026-04-01', inputs as never);
    const usd = rows.find((r) => r.currency === 'USD');
    expect(usd?.liabilities).toBeCloseTo(7500, 0);
  });

  it('a bank account with an opening balance but no transaction that old contributes nothing (2026-09-06 fix)', () => {
    // The account's real transactions only start in 2026; its openingBalance
    // is really "the balance as of whenever it was seeded," not something
    // that was already true in 2024 — a date before its first transaction
    // must show NO figure for it, not a phantom copy of that balance.
    const inputs = {
      ...emptyInputs(),
      bankAccounts: [{ id: 'a1', name: 'UBL', currencyCode: 'PKR', openingBalance: 5000 }],
      bankTransactions: [{ id: 't1', accountId: 'a1', date: '2026-01-10', amount: 200, description: 'x', categoryID: 'x', serialNumber: 1 }],
    };
    const before = netWorthAsOfDate('2024-06-01', inputs as never);
    expect(before.find((r) => r.currency === 'PKR')).toBeUndefined();

    // Once the account's own first transaction has happened, it correctly
    // contributes opening balance + every transaction up to that date.
    const after = netWorthAsOfDate('2026-01-31', inputs as never);
    expect(after.find((r) => r.currency === 'PKR')?.assets).toBeCloseTo(5200, 6);
  });

  it('a bank account with literally zero transactions ever never appears in any past-month figure', () => {
    const inputs = {
      ...emptyInputs(),
      bankAccounts: [{ id: 'a1', name: 'Car loan escrow', currencyCode: 'USD', openingBalance: 1000 }],
    };
    const rows = netWorthAsOfDate('2026-01-31', inputs as never);
    expect(rows.find((r) => r.currency === 'USD')).toBeUndefined();
  });

  it('counts Funds cash and NAV holdings once, with BUY/SELL cash flows, as of the requested date', () => {
    const inputs = {
      ...emptyInputs(),
      fundsFunds: [{ id: 'f1', name: 'USD Fund', code: 'USF', platform: 'Platform', currencyCode: 'USD' }],
      fundsTransfers: [{ id: 'd1', date: '2026-01-01', type: 'DEPOSIT' as const, gross: 1000, fee: 0, currencyCode: 'USD' }],
      fundsTransactions: [
        { id: 'b1', date: '2026-01-02', ticker: 'f1', action: 'BUY' as const, shares: 60, price: 10 },
        { id: 's1', date: '2026-01-10', ticker: 'f1', action: 'SELL' as const, shares: 20, price: 12 },
      ],
      fundsPriceHistory: { f1: [{ date: '2026-01-10', price: 12 }] },
    };
    const rows = netWorthAsOfDate('2026-01-31', inputs as never);
    const usd = rows.find((row) => row.currency === 'USD');
    expect(usd?.assets).toBeCloseTo(1120, 6); // 640 cash + 480 remaining units
    expect(usd?.breakdown).toContainEqual({ module: 'Funds', amount: 1120 });
  });

  it('respects the independent Funds cash inclusion setting', () => {
    const inputs = {
      ...emptyInputs(),
      fundsTransfers: [{ id: 'd1', date: '2026-01-01', type: 'DEPOSIT' as const, gross: 1000, fee: 0, currencyCode: 'USD' }],
      fundsIncludeCashInNetWorth: false,
    };
    expect(netWorthAsOfDate('2026-01-31', inputs as never)).toEqual([]);
  });

  it('values a QSE position using the price known AS OF that date, not a later one', () => {
    const base = {
      ...emptyInputs(),
      qseTransfers: [{ id: 't0', seq: 1, date: '2026-01-01', type: 'DEPOSIT' as const, gross: 5000, fee: 0 }],
      qseTransactions: [{ date: '2026-01-01', ticker: 'QIBK', action: 'BUY' as const, shares: 100, price: 10 }],
      qsePriceHistory: { QIBK: [{ date: '2026-01-01', price: 10 }, { date: '2026-03-01', price: 20 }] },
    };
    // Only the 10-price point is known as of 2026-01-15 — value should be
    // substantially lower than once the 20-price point is also known.
    const earlyRows = netWorthAsOfDate('2026-01-15', base as never);
    const laterRows = netWorthAsOfDate('2026-04-01', base as never);
    const early = earlyRows.find((r) => r.currency === 'QAR')!.assets;
    const later = laterRows.find((r) => r.currency === 'QAR')!.assets;
    expect(later - early).toBeCloseTo(1000, -1); // ~100 shares * (20-10) more, within fee rounding
  });
});

describe('earliestActivityDate', () => {
  it('returns undefined when nothing is dated anywhere', () => {
    expect(earliestActivityDate(emptyInputs() as never)).toBeUndefined();
  });

  it('finds the true minimum across completely different modules', () => {
    const inputs = {
      ...emptyInputs(),
      bankTransactions: [{ id: 't1', accountId: 'a1', date: '2025-06-01', amount: 1, description: 'x', categoryID: 'x', serialNumber: 1 }],
      cashEntries: [{ id: 'c1', date: '2025-01-15', isDeposit: true, amount: 1, currencyCode: 'USD', categoryID: 'x', serialNumber: 1 }],
      emiLoans: [{
        id: 'e1', name: 'Car', lender: 'Bank', currencyCode: 'USD', principal: 1, tenureMonths: 1,
        startDate: '2024-03-01', repaymentMode: 'interest' as const, annualRatePct: 0,
      }],
    };
    expect(earliestActivityDate(inputs as never)).toBe('2024-03-01');
  });
});


describe('central net-worth valuation reconciliation', () => {
  it('includes only dividends recorded by the valuation date, even for a dividend-only ledger', () => {
    const inputs: NetWorthValuationInputs = { ...emptyInputs(), qseDividends: [
      { date: '2026-01-05', ticker: 'QIBK', shares: 10, perShare: 2, amount: 20 },
      { date: '2026-02-05', ticker: 'QIBK', shares: 10, perShare: 3, amount: 30 },
    ] };
    expect(netWorthAsOfDate('2026-01-31', inputs)[0].net).toBe(20);
    expect(CalculationEngine.valuation.calculateNetWorth(inputs, { date: '2026-01-31' }).rows).toEqual(netWorthAsOfDate('2026-01-31', inputs));
    expect(earliestActivityDate(inputs)).toBe('2026-01-05');
  });

  it('reports gross personal-loan receivables and debts, with pending repayments excluded', () => {
    const inputs: NetWorthValuationInputs = { ...emptyInputs(), personalLoans: [
      { id: 'lent', person: 'A', direction: 'owed_to_me', currencyCode: 'USD', principal: 500, date: '2026-01-01' },
      { id: 'borrowed', person: 'B', direction: 'i_owe', currencyCode: 'USD', principal: 300, date: '2026-01-01' },
    ], personalLoanRepayments: [
      { id: 'p1', loanId: 'lent', date: '2026-01-02', amount: 100 },
      { id: 'p2', loanId: 'borrowed', date: '2026-01-02', amount: 200, isPending: true },
    ] };
    const [row] = netWorthAsOfDate('2026-01-31', inputs);
    expect(row).toMatchObject({ assets: 400, liabilities: 300, net: 100 });
    expect(row.breakdown).toContainEqual({ module: 'Personal Loans (receivable)', amount: 400 });
    expect(row.breakdown).toContainEqual({ module: 'Personal Loans (owed)', amount: -300 });
    expect(row.breakdown.reduce((sum, entry) => sum + entry.amount, 0)).toBe(row.net);
  });

  it('does not treat a pending bank row as evidence for an undated historical opening balance', () => {
    const inputs: NetWorthValuationInputs = { ...emptyInputs(), bankAccounts: [
      { id: 'bank', name: 'Bank', currencyCode: 'USD', openingBalance: 900 },
    ], bankTransactions: [{ id: 'pending', accountId: 'bank', date: '2026-01-01', amount: 50, description: 'Pending', isDeposit: true, source: 'manual', categoryID: '', serialNumber: 1, isPending: true }] };
    expect(netWorthAsOfDate('2026-01-31', inputs)).toEqual([]);
    // Live opening balances remain valid; the pending amount still cannot count.
    expect(CalculationEngine.valuation.calculateNetWorth(inputs, { date: '2026-01-31' }).rows[0].net).toBe(900);
  });

  it('applies one cutoff, inclusion policy and currency boundary to current and historical calculations', () => {
    const inputs: NetWorthValuationInputs = { ...emptyInputs(), cashEntries: [
      { id: 'c1', date: '2026-01-01', isDeposit: true, amount: 100, currencyCode: 'USD', source: 'manual', categoryID: '', serialNumber: 1 },
      { id: 'c2', date: '2026-01-01', isDeposit: true, amount: 999, currencyCode: 'USD', source: 'manual', categoryID: '', serialNumber: 2, isPending: true },
      { id: 'c3', date: '2026-02-01', isDeposit: true, amount: 800, currencyCode: 'USD', source: 'manual', categoryID: '', serialNumber: 3 },
      { id: 'c4', date: '2026-01-01', isDeposit: true, amount: 700, currencyCode: 'PKR', source: 'manual', categoryID: '', serialNumber: 4 },
    ] };
    const live = CalculationEngine.valuation.calculateNetWorth(inputs, { date: '2026-01-31' }).rows;
    expect(live).toEqual(netWorthAsOfDate('2026-01-31', inputs));
    expect(live.map(row => [row.currency, row.net])).toEqual([['PKR', 700], ['USD', 100]]);
    expect(CalculationEngine.valuation.calculateNetWorth(inputs, { date: '2026-01-31', selectedModules: [] }).rows).toEqual([]);
    expect(CalculationEngine.valuation.calculateNetWorth(inputs, { date: '2026-01-31', selectedModules: ['bank'] }).rows).toEqual([]);
    expect(CalculationEngine.valuation.calculateNetWorth({ ...inputs, cashSettings: { ...inputs.cashSettings, includeInNetWorth: false } }, { date: '2026-01-31' }).rows).toEqual([]);
  });

  it('orders historical quotes by date before time, without mutating price history', () => {
    const history = { F: [{ date: '2026-01-01', time: '23:59', price: 50 }, { date: '2026-01-02', price: 70 }] };
    const before = structuredClone(history);
    expect(priceAsOfDate('F', history, '2026-01-31')).toBe(70);
    expect(history).toEqual(before);
  });
});


it('keeps pending BUY limit prices out of real net worth and preserves the input snapshot', () => {
  const inputs: NetWorthValuationInputs = { ...emptyInputs(), qseSettings: { ...emptyInputs().qseSettings, feePct: 0, minFee: 0 },
    qseTransfers: [{ id: 'deposit', date: '2026-01-01', type: 'DEPOSIT', gross: 1000, fee: 0 }],
    qseTransactions: [
      { id: 'buy', date: '2026-01-01', ticker: 'QIBK', action: 'BUY', shares: 10, price: 20 },
      { id: 'pending', date: '2026-01-02', ticker: 'QIBK', action: 'BUY', shares: 10, price: 900, isPending: true },
    ],
  };
  const before = structuredClone(inputs);
  const current = CalculationEngine.valuation.calculateNetWorth(inputs, { date: '2026-01-31' });
  expect(current.rows.find(row => row.currency === 'QAR')?.net).toBe(1000);
  expect(netWorthAsOfDate('2026-01-31', inputs)).toEqual(current.rows);
  expect(inputs).toEqual(before);
});

it('does not let excluded or pending ledgers establish a historical comparison baseline', () => {
  const inputs: NetWorthValuationInputs = { ...emptyInputs(), cashEntries: [
    { id: 'pending', date: '2020-01-01', isDeposit: true, amount: 100, currencyCode: 'USD', source: 'manual', isPending: true },
  ], qseDividends: [{ date: '2019-01-01', ticker: 'QIBK', amount: 50, shares: 10, perShare: 5 }],
    personalLoans: [{ id: 'excluded', date: '2018-01-01', person: 'A', direction: 'owed_to_me', principal: 100, currencyCode: 'USD', includeInNetWorth: false }],
  };
  const scoped = CalculationEngine.valuation.scopeNetWorthInputs(inputs, ['cash', 'personalLoans']);
  expect(earliestActivityDate(scoped)).toBeUndefined();
});


it('reports missing opening evidence and excludes undated card debt from unsupported history', () => {
  const inputs: NetWorthValuationInputs = { ...emptyInputs(),
    bankAccounts: [{ id: 'a', name: 'Bank', currencyCode: 'USD', openingBalance: 500 }],
    creditCards: [{ id: 'card', name: 'Card', currencyCode: 'QAR', openingBalance: 200 }],
  };
  expect(CalculationEngine.valuation.unverifiedOpeningCurrencies(inputs, '2026-01-31')).toEqual(['QAR', 'USD']);
  expect(netWorthAsOfDate('2026-01-31', inputs)).toEqual([]);
  const live = CalculationEngine.valuation.calculateNetWorth(inputs, { date: '2026-01-31' }).rows;
  expect(live.find(row => row.currency === 'USD')?.net).toBe(500);
  expect(live.find(row => row.currency === 'QAR')?.net).toBe(-200);
});
