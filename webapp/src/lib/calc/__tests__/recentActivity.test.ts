import { describe, expect, it } from 'vitest';
import { CalculationEngine } from '../CalculationEngine';
import { buildCashLedger } from '../cashLedger';
import type { RecentActivityInputs } from '../recentActivity';
import { createEmptyBankWorkbook } from '../../../store/defaultBankWorkbook';
import { createEmptyCreditCardWorkbook } from '../../../store/defaultCreditCardWorkbook';
import { createEmptyEMIWorkbook } from '../../../store/defaultEmiWorkbook';
import { createEmptyFundsWorkbook } from '../../../store/defaultFundsWorkbook';
import { createEmptyPersonalLoansWorkbook } from '../../../store/defaultPersonalLoansWorkbook';
import { createEmptyRentalsWorkbook } from '../../../store/defaultRentalsWorkbook';
import { createEmptyWorkbook } from '../../../store/defaultWorkbook';
import { createEmptyPSXWorkbook } from '../../../store/defaultPsxWorkbook';
function empty(): RecentActivityInputs { return { cash: [], bank: createEmptyBankWorkbook(), cards: createEmptyCreditCardWorkbook(), emi: createEmptyEMIWorkbook(), funds: createEmptyFundsWorkbook(), personalLoans: createEmptyPersonalLoansWorkbook(), rentals: createEmptyRentalsWorkbook(), qse: createEmptyWorkbook(), psx: createEmptyPSXWorkbook() }; }
const transfers = [
  { id: 'in', date: '2026-01-01', type: 'DEPOSIT' as const, gross: 100, fee: 2 },
  { id: 'out', date: '2026-01-02', type: 'WITHDRAWAL' as const, gross: 40, fee: 3 },
];
describe('recent native activity read model', () => {
  it('reconciles deposit/withdrawal fees with native cash ledgers for Funds and both exchanges', () => {
    const inputs = empty(); inputs.funds.transfers = transfers; inputs.qse.transfers = transfers; inputs.psx.transfers = transfers;
    const rows = CalculationEngine.recentActivity.recentTransactions(inputs);
    const native = buildCashLedger([], transfers, [], () => 0);
    expect(native.map(row => row.amount)).toEqual([98, -43]);
    for (const prefix of ['fund-transfer:', 'qse-transfer:', 'psx-transfer:']) {
      const source = rows.filter(row => row.id.startsWith(prefix));
      expect(source.find(row => row.date === '2026-01-02')?.amount).toBe(-43);
      expect(source.reduce((sum, row) => sum + row.amount, 0)).toBe(55);
      expect(source.reduce((sum, row) => sum + row.amount, 0)).toBe(native.at(-1)?.balance);
    }
  });
  it('keeps archived/deactivated broker history isolated and prefers the active native workbook over a stale profile snapshot', () => {
    const inputs = empty();
    const stored = (id: string, gross: number) => ({ transactions: [], adjustments: [], dividends: [], transfers: [{ id, date: '2026-01-01', type: 'DEPOSIT' as const, gross, fee: 0 }] });
    inputs.qse = { ...inputs.qse, activeBrokerId: 'live', transfers: stored('current', 50).transfers, brokerProfiles: [
      { id: 'live', name: 'Live', settings: { currency: 'USD' }, data: stored('stale', 999) },
      { id: 'old', name: 'Archived', archived: true, deactivated: true, settings: { currency: 'USD' }, data: stored('history', 30) },
    ] };
    const rows = CalculationEngine.recentActivity.recentTransactions(inputs);
    expect(rows.find(row => row.id === 'qse-transfer:live:current')).toMatchObject({ amount: 50, currency: inputs.qse.settings.currency });
    expect(rows.some(row => row.id.includes('stale'))).toBe(false);
    expect(rows.find(row => row.id === 'qse-transfer:old:history')).toMatchObject({ amount: 30, currency: 'USD', module: 'QSE · Archived' });
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
  });
  it('does not repeat migrated bank records beside their native card counterparts', () => {
    const inputs = empty();
    inputs.bank.settings.accounts = [{ id: 'legacy', name: 'Legacy card', currencyCode: 'USD', openingBalance: 0, migratedToCreditCardId: 'native' }];
    inputs.bank.transactions = [{ id: 'old', accountId: 'legacy', date: '2026-01-01', amount: -10, isDeposit: false, description: 'Charge', categoryID: '', source: 'manual' }];
    inputs.cards.cards = [{ id: 'native', name: 'Card', currencyCode: 'USD' }];
    inputs.cards.transactions = [{ id: 'charge', cardId: 'native', date: '2026-01-01', amount: 10, kind: 'charge', description: 'Charge' }];
    const rows = CalculationEngine.recentActivity.recentTransactions(inputs);
    expect(rows.filter(row => row.description === 'Charge')).toHaveLength(1);
    expect(rows.find(row => row.id === 'card:charge')?.amount).toBe(-10);
  });
  it('records an EMI payment and its additional fine as the actual paid outflow and leaves source data unchanged', () => {
    const inputs = empty(); inputs.emi.entries = [{ id: 'loan', name: 'Loan', lender: 'Bank', currencyCode: 'USD', principal: 1000, tenureMonths: 10, repaymentMode: 'fixedTotal', startDate: '2026-01-01' }];
    inputs.emi.repayments = [{ id: 'paid', loanId: 'loan', month: 1, amount: 100, fine: 5, date: '2026-02-01' }];
    const before = structuredClone(inputs);
    const rows = CalculationEngine.recentActivity.recentTransactions(inputs);
    expect(rows.find(row => row.id === 'emi-repayment:paid')).toMatchObject({ amount: -105, amountBasis: 'Installment and fine paid' });
    expect(inputs).toEqual(before);
  });
});
